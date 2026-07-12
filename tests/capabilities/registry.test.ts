/**
 * AI-71 capability contract — registry tests.
 *
 * These tests cover the typed definition registry at
 * `src/capabilities/registry.ts`. The registry is the read-only,
 * in-memory view of `config/ai-capabilities.json` plus the per-capability
 * policy declarations.
 *
 * Coverage:
 *  - all 40 catalog capability IDs are valid `CapabilityId` values;
 *  - every catalog capability ID resolves to exactly one
 *    `CapabilityDefinition`;
 *  - unknown or malformed capability IDs fail closed with
 *    `UnknownCapabilityError`;
 *  - the registry exposes a `CapabilityPolicy` for every capability;
 *  - the registry never carries provider or credential fields;
 *  - the registry agrees with the catalog on the regulated/mechanical
 *    partition and the human-review + downstream policy;
 *  - the registry's binding integration is consistent with the
 *    catalog and the policy block.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertCapabilitySupported,
  getCapabilityDefinition,
  hasCapabilityDefinition,
  isLoaded,
  listCapabilityDefinitions,
  loadCapabilityRegistry,
  _resetForTests,
  UnknownCapabilityError,
  type CapabilityRegistry,
} from '../../src/capabilities/registry.js';
import { CAPABILITY_ID_PATTERN } from '../../src/capabilities/version.js';
import { DOMAIN_CAPABILITY_BINDINGS, getDomainCapabilityBinding } from '../../src/capabilities/bindings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

interface CatalogRow {
  capability_id: string;
  name: string;
  domain: string;
  status: string;
  risk_tier: string;
  human_review: boolean;
  downstream_policy: { downstream_allowed: boolean | 'conditional'; reason: string };
  provider_execution: string;
  roadmap_owner: string;
}

let registry: CapabilityRegistry;
let catalog: { capabilities: CatalogRow[] };

before(() => {
  _resetForTests();
  registry = loadCapabilityRegistry({ repoRoot });
  catalog = JSON.parse(readFileSync(resolve(repoRoot, 'config', 'ai-capabilities.json'), 'utf-8')) as {
    capabilities: CatalogRow[];
  };
});

after(() => {
  _resetForTests();
});

describe('AI-71 registry — lazy load and exposed surface', () => {
  it('exposes the catalog as a typed view, loading exactly once', () => {
    assert.equal(isLoaded(), true);
    const again = listCapabilityDefinitions();
    assert.equal(again.length, catalog.capabilities.length);
  });

  it('returns the same number of definitions as catalog rows', () => {
    const defs = listCapabilityDefinitions();
    assert.equal(defs.length, 40);
  });

  it('reports load errors for unknown (none, in this fixture)', () => {
    const errs = registry.loadErrors();
    assert.equal(errs.length, 0, `unexpected load errors: ${errs.join('\n')}`);
  });

  it('exposes a loadedAt timestamp', () => {
    const ts = registry.loadedAt();
    assert.ok(ts);
    assert.equal(Number.isNaN(Date.parse(ts)), false);
  });
});

describe('AI-71 registry — every catalog capability resolves', () => {
  for (const row of catalog.capabilities) {
    it(`resolves ${row.capability_id} uniquely`, () => {
      const def = registry.get(row.capability_id as never);
      assert.ok(def, `definition missing for ${row.capability_id}`);
      assert.equal(def.capability_id, row.capability_id);
      assert.equal(def.name, row.name);
      assert.equal(def.domain, row.domain);
      assert.equal(def.status, row.status);
      assert.equal(def.risk_tier, row.risk_tier);
      assert.equal(def.human_review, row.human_review);
      assert.equal(def.downstream_policy.downstream_allowed, row.downstream_policy.downstream_allowed);
      assert.equal(def.provider_execution, row.provider_execution);
      assert.equal(def.roadmap_owner, row.roadmap_owner);
    });
  }

  it('every catalog capability_id matches the capability ID pattern', () => {
    for (const row of catalog.capabilities) {
      assert.equal(
        CAPABILITY_ID_PATTERN.test(row.capability_id),
        true,
        `row ${row.capability_id} does not match the capability ID pattern`
      );
    }
  });
});

describe('AI-71 registry — unknown capability IDs fail closed', () => {
  it('getCapabilityDefinition returns undefined for an unknown ID', () => {
    assert.equal(getCapabilityDefinition('does.not.exist' as never), undefined);
  });

  it('hasCapabilityDefinition returns false for an unknown ID', () => {
    assert.equal(hasCapabilityDefinition('does.not.exist' as never), false);
  });

  it('assertCapabilitySupported throws UnknownCapabilityError for an unknown ID', () => {
    assert.throws(
      () => assertCapabilitySupported('does.not.exist'),
      (err: unknown): boolean => {
        if (!(err instanceof UnknownCapabilityError)) return false;
        return err.capability_id === 'does.not.exist' && err.known_capability_ids.length === 40;
      }
    );
  });

  it('assertCapabilitySupported throws for a malformed ID', () => {
    assert.throws(() => assertCapabilitySupported('OPENAI.gpt-5'), UnknownCapabilityError);
  });
});

describe('AI-71 registry — policy block is present and stable', () => {
  for (const row of catalog.capabilities) {
    it(`carries a policy block for ${row.capability_id}`, () => {
      const def = registry.get(row.capability_id as never);
      assert.ok(def);
      assert.ok(def.policy);
      assert.equal(def.policy.human_review_policy.required, row.human_review);
      assert.equal(
        def.policy.downstream_policy.downstream_allowed,
        row.downstream_policy.downstream_allowed
      );
      assert.ok(def.policy.privacy_requirement);
      assert.ok(def.policy.budget_requirement);
      assert.ok(def.policy.evaluation_requirement);
      assert.ok(def.policy.execution_requirement);
      assert.equal(def.policy.execution_requirement.provider_execution, row.provider_execution);
    });
  }

  it('derives privacy tier from risk_tier', () => {
    for (const row of catalog.capabilities) {
      const def = registry.get(row.capability_id as never);
      assert.ok(def);
      const expectedTier =
        row.risk_tier === 'high' ? 'regulated' : row.risk_tier === 'medium' ? 'sensitive' : 'standard';
      assert.equal(def.policy.privacy_requirement.tier, expectedTier);
    }
  });

  it('marks high-risk capabilities as zdr_required', () => {
    for (const row of catalog.capabilities) {
      const def = registry.get(row.capability_id as never);
      assert.ok(def);
      if (row.risk_tier === 'high') {
        assert.equal(def.policy.privacy_requirement.zdr_required, true);
      } else {
        assert.equal(def.policy.privacy_requirement.zdr_required, false);
      }
    }
  });

  it('requires gold_case for high-risk review-gated capabilities', () => {
    for (const row of catalog.capabilities) {
      const def = registry.get(row.capability_id as never);
      assert.ok(def);
      const shouldRequireGold = row.human_review && row.risk_tier === 'high';
      assert.equal(def.policy.evaluation_requirement.gold_case_required, shouldRequireGold);
    }
  });
});

describe('AI-71 registry — bindings are integrated and consistent', () => {
  for (const binding of DOMAIN_CAPABILITY_BINDINGS) {
    it(`binding for ${binding.capability_id} matches the catalog`, () => {
      const def = registry.get(binding.capability_id);
      assert.ok(def);
      assert.equal(def.human_review, binding.human_review_required);
      assert.equal(
        def.downstream_policy.downstream_allowed,
        binding.downstream_allowed
      );
      assert.equal(def.risk_tier, binding.risk_tier);
      assert.equal(def.provider_execution, binding.provider_execution);
      assert.equal(def.input_schema_ref, binding.input_schema_ref);
      assert.equal(def.output_schema_ref, binding.output_schema_ref);
    });
  }

  it('getDomainCapabilityBinding returns the same record as the list', () => {
    for (const binding of DOMAIN_CAPABILITY_BINDINGS) {
      const looked = getDomainCapabilityBinding(binding.capability_id);
      assert.equal(looked, binding);
    }
  });

  it('every binding covers a real catalog capability', () => {
    for (const binding of DOMAIN_CAPABILITY_BINDINGS) {
      const def = registry.get(binding.capability_id);
      assert.ok(def, `binding ${binding.capability_id} does not resolve`);
    }
  });
});

describe('AI-71 registry — never carries provider/credential fields', () => {
  it('no definition carries a forbidden key (top-level + nested object keys)', () => {
    const forbidden = new Set<string>([
      'provider',
      'provider_id',
      'provider_name',
      'provider_response',
      'model',
      'model_id',
      'model_name',
      'model_version',
      'api_key',
      'apikey',
      'api_token',
      'token',
      'bearer',
      'authorization',
      'secret',
      'client_secret',
      'access_key',
      'private_key',
      'password',
      'endpoint_url',
      'base_url',
      'profile',
      'profile_id',
      'execution_profile',
      'prompt_hash',
      'reviewer',
      'reviewer_id',
      'reviewer_name',
    ]);
    for (const def of listCapabilityDefinitions()) {
      collectKeys(def).forEach(key => {
        assert.ok(
          !forbidden.has(key),
          `definition ${def.capability_id} carries forbidden field: ${key}`
        );
      });
    }
  });
});

function collectKeys(value: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<unknown>();
  function walk(v: unknown): void {
    if (v === null || v === undefined) return;
    if (typeof v !== 'object') return;
    if (seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    for (const [k, child] of Object.entries(v)) {
      out.push(k);
      walk(child);
    }
  }
  walk(value);
  return out;
}

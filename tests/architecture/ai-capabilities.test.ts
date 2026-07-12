/**
 * AI-70 capability catalog tests
 *
 * Lightweight structural and policy validation for
 * `config/ai-capabilities.json`. The catalog is documentation-only and the
 * tests are intentionally minimal: they verify uniqueness, allowed enums,
 * roadmap ownership, the absence of credential-shaped fields, and the
 * absence of provider_id/model_id fields bound to a domain capability
 * (per ADR-003).
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ajv2020 as AjvClass } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const schemaPath = resolve(repoRoot, 'schemas', 'ai-capabilities.schema.json');
const catalogPath = resolve(repoRoot, 'config', 'ai-capabilities.json');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const applyFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (ajv: AjvClass) => void;

interface CapabilityRecord {
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

interface Catalog {
  schema_version: string;
  generated_by?: string;
  generated_at?: string;
  description?: string;
  allowed_status: string[];
  allowed_risk_tier: string[];
  allowed_provider_execution: string[];
  allowed_human_review: boolean[];
  capabilities: CapabilityRecord[];
}

const CREDENTIAL_LIKE_FIELDS = new Set([
  'api_key',
  'apikey',
  'token',
  'secret',
  'password',
  'client_secret',
  'access_key',
  'private_key',
  'bearer',
  'provider_id',
  'model_id',
  'model_version',
  'endpoint_url',
  'base_url',
]);

// Provider SDK identifiers must not appear as VALUES bound to a domain
// capability. Capability `name`, `capability_id`, `domain`, and `roadmap_owner`
// are documentation fields and may reference an adapter name when documenting
// the adapter layer itself (domain: "provider").
const PROVIDER_SDK_NAMES = new Set([
  'openai',
  'anthropic',
  'google',
  'dashscope',
  'qwen',
  'deepseek',
  'cloudflare_ai',
]);

let catalog: Catalog;
let validateSchema: ((data: unknown) => boolean) & { errors?: unknown };

before(() => {
  assert.ok(existsSync(catalogPath), `catalog missing: ${catalogPath}`);
  assert.ok(existsSync(schemaPath), `schema missing: ${schemaPath}`);

  const raw = readFileSync(catalogPath, 'utf-8');
  catalog = JSON.parse(raw) as Catalog;

  const schema = JSON.parse(readFileSync(schemaPath, 'utf-8')) as Record<string, unknown>;
  const ajv = new AjvClass({ allErrors: true, strict: false });
  applyFormats(ajv);
  validateSchema = ajv.compile(schema) as typeof validateSchema;
});

function topLevelKeys(): string[] {
  return Object.keys(catalog).sort();
}

function capabilityKeys(record: CapabilityRecord): string[] {
  return Object.keys(record).sort();
}

describe('AI-70 capabilities catalog', () => {
  it('declares the AI-70 metadata and the four allowed enums', () => {
    assert.equal(catalog.generated_by, 'AI-70');
    assert.ok(catalog.generated_at && catalog.generated_at.length > 0);
    assert.deepEqual(catalog.allowed_status, ['existing', 'partial', 'planned', 'out_of_scope']);
    assert.deepEqual(catalog.allowed_risk_tier, ['low', 'medium', 'high']);
    assert.deepEqual(catalog.allowed_provider_execution, ['required', 'optional', 'none']);
    assert.deepEqual(catalog.allowed_human_review, [true]);
  });

  it('has only the expected top-level keys (no credential-shaped fields)', () => {
    const expected = [
      '$schema',
      'allowed_human_review',
      'allowed_provider_execution',
      'allowed_risk_tier',
      'allowed_status',
      'capabilities',
      'description',
      'generated_at',
      'generated_by',
      'schema_version',
    ];
    assert.deepEqual(topLevelKeys(), expected);
    for (const key of topLevelKeys()) {
      assert.ok(!CREDENTIAL_LIKE_FIELDS.has(key.toLowerCase()), `forbidden top-level field: ${key}`);
    }
  });

  it('passes the JSON Schema declared at schemas/ai-capabilities.schema.json', () => {
    const ok = validateSchema(catalog);
    if (!ok) {
      const errs = JSON.stringify(validateSchema.errors, null, 2);
      assert.fail(`schema validation failed:\n${errs}`);
    }
  });

  it('uses unique capability_id values', () => {
    const ids = catalog.capabilities.map(c => c.capability_id);
    const unique = new Set(ids);
    assert.equal(unique.size, ids.length, `duplicate capability_id values found: ${ids.length - unique.size}`);
  });

  it('uses only the allowed status values', () => {
    for (const c of catalog.capabilities) {
      assert.ok(
        catalog.allowed_status.includes(c.status),
        `capability ${c.capability_id} has unknown status ${c.status}`
      );
    }
  });

  it('uses only the allowed risk tier values', () => {
    for (const c of catalog.capabilities) {
      assert.ok(
        catalog.allowed_risk_tier.includes(c.risk_tier),
        `capability ${c.capability_id} has unknown risk_tier ${c.risk_tier}`
      );
    }
  });

  it('uses only the allowed provider_execution values', () => {
    for (const c of catalog.capabilities) {
      assert.ok(
        catalog.allowed_provider_execution.includes(c.provider_execution),
        `capability ${c.capability_id} has unknown provider_execution ${c.provider_execution}`
      );
    }
  });

  it('requires human review on every capability (no auto-approved rows)', () => {
    for (const c of catalog.capabilities) {
      assert.equal(c.human_review, true, `capability ${c.capability_id} must require human review`);
    }
  });

  it('has a non-empty roadmap_owner on every capability', () => {
    for (const c of catalog.capabilities) {
      assert.ok(
        c.roadmap_owner && c.roadmap_owner.length > 0,
        `capability ${c.capability_id} has empty roadmap_owner`
      );
    }
  });

  it('uses the expected per-record shape and no extra fields', () => {
    const expected = [
      'capability_id',
      'domain',
      'downstream_policy',
      'human_review',
      'name',
      'provider_execution',
      'risk_tier',
      'roadmap_owner',
      'status',
    ];
    for (const c of catalog.capabilities) {
      assert.deepEqual(capabilityKeys(c), expected, `capability ${c.capability_id} has unexpected fields`);
    }
  });

  it('does not bind any domain capability to a specific provider or model', () => {
    // ADR-003 forbids vendor response objects and provider_id/model_id fields
    // as values bound to a domain capability. A capability_id is a descriptive
    // identifier; the rule applies to normative record fields whose *value*
    // would constitute a binding.
    for (const c of catalog.capabilities) {
      const fieldsToCheck: Array<[string, string]> = [
        ['downstream_policy.reason', c.downstream_policy.reason],
        ['roadmap_owner', c.roadmap_owner],
      ];
      for (const [fieldName, value] of fieldsToCheck) {
        const lowered = value.toLowerCase();
        for (const sdk of PROVIDER_SDK_NAMES) {
          assert.ok(
            !lowered.includes(sdk),
            `capability ${c.capability_id}.${fieldName} embeds forbidden provider SDK reference: ${sdk}`
          );
        }
      }
    }
  });

  it('downstream_policy uses only the allowed downstream_allowed values', () => {
    for (const c of catalog.capabilities) {
      const allowed = c.downstream_policy.downstream_allowed;
      assert.ok(
        allowed === true || allowed === false || allowed === 'conditional',
        `capability ${c.capability_id} has invalid downstream_policy.downstream_allowed: ${String(allowed)}`
      );
      assert.ok(
        typeof c.downstream_policy.reason === 'string' && c.downstream_policy.reason.length > 0,
        `capability ${c.capability_id} has empty downstream_policy.reason`
      );
    }
  });

  it('does not declare any capability with downstream_allowed: true on shadow or candidate', () => {
    for (const c of catalog.capabilities) {
      // future-proof: when lifecycle fields are added per AI-78, this test should be
      // updated to also check that production-only capabilities never embed
      // shadow/candidate metadata. For now, the absence of any such fields is the
      // guarantee and we assert it here.
      const serialized = JSON.stringify(c).toLowerCase();
      assert.ok(
        !serialized.includes('"lifecycle":"shadow"') &&
          !serialized.includes('"lifecycle":"candidate"') &&
          !serialized.includes('"shadow":true') &&
          !serialized.includes('"candidate":true'),
        `capability ${c.capability_id} must not embed shadow or candidate lifecycle state`
      );
    }
  });
});

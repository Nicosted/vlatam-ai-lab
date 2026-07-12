/**
 * AI-70 capability catalog tests
 *
 * Lightweight structural and policy validation for
 * `config/ai-capabilities.json`. The catalog is documentation-only and the
 * tests are intentionally minimal: they verify uniqueness, allowed enums,
 * roadmap ownership, the absence of credential-shaped fields, the absence
 * of provider_id/model_id fields bound to a domain capability, and the
 * human-review policy.
 *
 * The test also derives the status counts directly from the catalog and
 * asserts that the catalog itself is self-consistent. This prevents silent
 * drift between any human-maintained summary tables and the source of
 * truth (the catalog).
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

// Capability IDs that, by their regulated nature, MUST be human-review.
// The set is derived from the architecture's "interpret regulatory or
// commercial evidence; generate classification or advisory candidates;
// approve artifacts; promote execution profiles; make high-impact
// governed decisions" rules.
const REGULATED_CAPABILITY_IDS = new Set<string>([
  'source.regulatory_research.advisory_input',
  'source.regulatory_advisory.readiness_check',
  'evidence.extraction.normative_claims',
  'evidence.extraction.qwen_dashscope',
  'evidence.extraction.langgraph_workflow',
  'evidence.extraction.critic_review',
  'evidence.classifier_candidate.generate',
  'evidence.regulatory_research.question_prep',
  'review.human.gate.regulatory_research',
  'artifact.approved.generate',
  'artifact.export_contract.generate',
  'evaluation.gold_cases',
  'evaluation.profile.promote',
]);

// Capability IDs that may use human_review: false because they are
// mechanical, infrastructural, or apply a previously approved rule.
// The set is the exact complement: every regulated capability must be
// in the set above; every non-regulated capability may be in this set
// (and in fact all 27 currently are).
const MECHANICAL_CAPABILITY_IDS = new Set<string>([
  'source.acquisition.monitor',
  'source.snapshot.write',
  'source.delta.detect',
  'source.snapshot.embedded_evidence_demo',
  'source.acquisition.cloudflare_pipeline_v1',
  'source.acquisition.multi_country',
  'evidence.embedding.bge_m3',
  'evidence.embedding.refresh',
  'review.human.gate',
  'artifact.export_catalog.generate',
  'artifact.export_bundle.consumer_contract',
  'artifact.approved.serve_http',
  'provider.execution.cloudflare_ai_gateway',
  'provider.execution.deepseek_direct',
  'provider.execution.qwen_dashscope_runtime',
  'provider.execution.local_runtime',
  'governance.privacy.zdr',
  'governance.data.classification',
  'governance.budget.cost_governor',
  'governance.allowlist.providers',
  'governance.audit.record',
  'governance.fail_closed',
  'evaluation.evaluator',
  'evaluation.benchmark.run',
  'routing.best_profile',
  'routing.lifecycle.production',
  'routing.lifecycle.shadow',
]);

// Capability IDs that may have downstream_allowed: true WITHOUT
// human_review: true, because they only serve or consume artifacts whose
// approval was the precondition of a separate regulated capability. Adding
// to this list requires documenting why the capability cannot be used to
// auto-approve a draft.
const SERVE_ONLY_CAPABILITY_IDS = new Set<string>([
  'artifact.approved.serve_http',
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

function countByStatus(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of catalog.capabilities) {
    out[c.status] = (out[c.status] ?? 0) + 1;
  }
  return out;
}

function countByHumanReview(): Record<string, number> {
  const out: Record<string, number> = { true: 0, false: 0 };
  for (const c of catalog.capabilities) {
    out[String(c.human_review)] = (out[String(c.human_review)] ?? 0) + 1;
  }
  return out;
}

describe('AI-70 capabilities catalog', () => {
  it('declares the AI-70 metadata and the four allowed enums', () => {
    assert.equal(catalog.generated_by, 'AI-70');
    assert.ok(catalog.generated_at && catalog.generated_at.length > 0);
    assert.deepEqual(catalog.allowed_status, ['existing', 'partial', 'planned', 'out_of_scope']);
    assert.deepEqual(catalog.allowed_risk_tier, ['low', 'medium', 'high']);
    assert.deepEqual(catalog.allowed_provider_execution, ['required', 'optional', 'none']);
    assert.deepEqual(catalog.allowed_human_review, [true, false]);
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

describe('AI-70 capabilities catalog — human review policy', () => {
  it('requires human_review: true for every regulated capability (positive list)', () => {
    for (const id of REGULATED_CAPABILITY_IDS) {
      const cap = catalog.capabilities.find(c => c.capability_id === id);
      assert.ok(cap, `regulated capability ${id} is missing from the catalog`);
      assert.equal(
        cap.human_review,
        true,
        `regulated capability ${id} must have human_review: true; got ${cap.human_review}`
      );
    }
  });

  it('requires human_review: false for every mechanical capability (positive list)', () => {
    for (const id of MECHANICAL_CAPABILITY_IDS) {
      const cap = catalog.capabilities.find(c => c.capability_id === id);
      assert.ok(cap, `mechanical capability ${id} is missing from the catalog`);
      assert.equal(
        cap.human_review,
        false,
        `mechanical capability ${id} must have human_review: false; got ${cap.human_review}`
      );
    }
  });

  it('partitions every catalog capability into either regulated or mechanical', () => {
    // This is the structural guarantee: every capability in the catalog must
    // appear in exactly one of the two positive lists. Adding a new capability
    // requires adding it to one of them.
    const known = new Set<string>([...REGULATED_CAPABILITY_IDS, ...MECHANICAL_CAPABILITY_IDS]);
    for (const c of catalog.capabilities) {
      assert.ok(
        known.has(c.capability_id),
        `capability ${c.capability_id} is not classified as regulated or mechanical; add it to one of the two positive lists.`
      );
    }
    for (const c of catalog.capabilities) {
      const inRegulated = REGULATED_CAPABILITY_IDS.has(c.capability_id);
      const inMechanical = MECHANICAL_CAPABILITY_IDS.has(c.capability_id);
      assert.ok(
        !(inRegulated && inMechanical),
        `capability ${c.capability_id} appears in both positive lists`
      );
    }
  });

  it('human_review: false never implies automatic downstream approval', () => {
    // A capability that is not subject to human review MAY still be
    // downstream_allowed: true only if it is on the serve-only allowlist —
    // i.e. it only consumes or transports artifacts whose approval is the
    // precondition of a separate regulated capability. Any other
    // human_review: false capability with downstream_allowed: true would
    // constitute automatic approval, which is forbidden.
    for (const c of catalog.capabilities) {
      if (!c.human_review && c.downstream_policy.downstream_allowed === true) {
        assert.ok(
          SERVE_ONLY_CAPABILITY_IDS.has(c.capability_id),
          `capability ${c.capability_id} has human_review: false and downstream_allowed: true; that would imply auto-approval. ` +
            `Add it to the SERVE_ONLY allowlist only if it only serves or consumes pre-approved artifacts.`
        );
      }
    }
  });

  it('shadow and candidate lifecycle states cannot become approved automatically', () => {
    // The catalog does not yet have lifecycle fields. Lifecycle markers
    // appear as JSON-serialized `"lifecycle":"shadow"` or
    // `"lifecycle":"candidate"` substrings in record values. A draft that
    // is in a shadow or candidate lifecycle state must not cross the
    // approved export boundary, and the catalog must not describe it as
    // auto-approvable.
    for (const c of catalog.capabilities) {
      const serialized = JSON.stringify(c).toLowerCase();
      const hasShadowLifecycle = serialized.includes('"lifecycle":"shadow"');
      const hasCandidateLifecycle = serialized.includes('"lifecycle":"candidate"');
      if (hasShadowLifecycle || hasCandidateLifecycle) {
        assert.notEqual(
          c.downstream_policy.downstream_allowed,
          true,
          `capability ${c.capability_id} carries a shadow/candidate lifecycle marker but is downstream_allowed: true`
        );
      }
    }
  });
});

describe('AI-70 capabilities catalog — count derivation', () => {
  it('derives total count of 40 capabilities', () => {
    assert.equal(catalog.capabilities.length, 40);
  });

  it('derives status counts: existing=12, partial=13, planned=14, out_of_scope=1', () => {
    const counts = countByStatus();
    assert.deepEqual(counts, {
      existing: 12,
      partial: 13,
      planned: 14,
      out_of_scope: 1,
    });
  });

  it('derives human_review counts: true=13, false=27', () => {
    const counts = countByHumanReview();
    assert.deepEqual(counts, { true: 13, false: 27 });
  });

  it('derives per-group counts consistent with the capability map summary table', () => {
    // Group definitions mirror the table in docs/architecture/ai-capability-map.md
    // and docs/architecture/ai-system-architecture.md. The bucketing is:
    //
    //   1. Source acquisition / snapshot / delta
    //      - domain: "source"
    //      - PLUS domain: "advisory" entries that describe research inputs
    //        (the two `source.regulatory_research.*` rows). This matches
    //        the section heading "Source acquisition, snapshotting, and
    //        delta" in the capability map, which includes regulatory
    //        research inputs.
    //
    //   2. Evidence extraction (LLM-assisted)
    //      - domain: "evidence"
    //      - PLUS domain: "advisory" entries that describe research
    //        preparation (`evidence.regulatory_research.question_prep`).
    //
    //   3. Review, approval, and approved artifacts
    //      - domain: "review" + domain: "export"
    //
    //   4. Provider execution, governance, evaluation, and routing
    //      - domain: "provider" + "governance" + "evaluation" + "routing"
    const advisoryInSource = new Set([
      'source.regulatory_research.advisory_input',
      'source.regulatory_advisory.readiness_check',
    ]);
    const advisoryInEvidence = new Set([
      'evidence.regulatory_research.question_prep',
    ]);

    function isInGroup(c: CapabilityRecord, group: 1 | 2 | 3 | 4): boolean {
      if (group === 1) {
        return c.domain === 'source' || advisoryInSource.has(c.capability_id);
      }
      if (group === 2) {
        return c.domain === 'evidence' || advisoryInEvidence.has(c.capability_id);
      }
      if (group === 3) {
        return c.domain === 'review' || c.domain === 'export';
      }
      return (
        c.domain === 'provider' ||
        c.domain === 'governance' ||
        c.domain === 'evaluation' ||
        c.domain === 'routing'
      );
    }

    function groupCounts(group: 1 | 2 | 3 | 4): Record<string, number> {
      const out: Record<string, number> = {};
      for (const c of catalog.capabilities) {
        if (!isInGroup(c, group)) continue;
        out[c.status] = (out[c.status] ?? 0) + 1;
      }
      return out;
    }

    const expected: Record<1 | 2 | 3 | 4, Record<string, number>> = {
      1: { existing: 3, partial: 5, planned: 0, out_of_scope: 0 },
      2: { existing: 4, partial: 3, planned: 1, out_of_scope: 0 },
      3: { existing: 5, partial: 2, planned: 0, out_of_scope: 0 },
      4: { existing: 0, partial: 3, planned: 13, out_of_scope: 1 },
    };

    for (const g of [1, 2, 3, 4] as const) {
      const actual = groupCounts(g);
      const expectedTotal = Object.values(expected[g]).reduce((a, b) => a + b, 0);
      const actualTotal = Object.values(actual).reduce((a, b) => a + b, 0);
      assert.equal(
        actualTotal,
        expectedTotal,
        `group ${g} total mismatch: expected ${expectedTotal}, got ${actualTotal}`
      );
      for (const k of ['existing', 'partial', 'planned', 'out_of_scope']) {
        assert.equal(
          actual[k] ?? 0,
          expected[g][k] ?? 0,
          `group ${g} status=${k} mismatch: expected ${expected[g][k] ?? 0}, got ${actual[k] ?? 0}`
        );
      }
    }

    // Cross-group sum must equal the total count.
    const grandTotal = [1, 2, 3, 4].reduce(
      (acc, g) => acc + Object.values(groupCounts(g as 1 | 2 | 3 | 4)).reduce((a, b) => a + b, 0),
      0
    );
    assert.equal(grandTotal, catalog.capabilities.length);
  });
});

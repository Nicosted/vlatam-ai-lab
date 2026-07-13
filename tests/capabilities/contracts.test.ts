/**
 * AI-71 capability contract — request, result, error, policy tests.
 *
 * These tests cover the AI-71 contract surface:
 *  - the JSON Schemas under `schemas/capability-*.schema.json` validate
 *    the representative fixtures and reject the documented failure
 *    modes;
 *  - the runtime validators in `src/capabilities/validation.ts` agree
 *    with the JSON Schemas on the contract shape and add the
 *    fail-closed guarantees the schema alone cannot express
 *    (unsupported MAJOR versions, forbidden field walks);
 *  - the type guards and the enum values are stable;
 *  - the result envelope preserves the AI-70 doctrine
 *    (unreviewed model output is not approved intelligence, blocked
 *    results fail closed, succeeded results do NOT imply downstream
 *    approval, reviewer and provider metadata do not leak).
 *
 * The tests deliberately do not touch the registry: a separate test
 * file covers the registry in isolation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ajv2020 as AjvClass } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

import {
  CAPABILITY_DOMAINS,
  CAPABILITY_RESULT_STATUSES,
  CAPABILITY_RISK_TIERS,
  CAPABILITY_STATUSES,
  DATA_CLASSIFICATIONS,
  DOWNSTREAM_USE_VALUES,
  PROVIDER_EXECUTION_VALUES,
  isCapabilityId,
  isCapabilityResultStatus,
  isCapabilityRiskTier,
  isCapabilityStatus,
  isDataClassification,
  isDownstreamUse,
  isProviderExecution,
  isSchemaVersion,
} from '../../src/capabilities/contracts.js';
import {
  CAPABILITY_ERROR_CATEGORIES,
  CAPABILITY_ERROR_CODES,
  FORBIDDEN_FIELD_NAMES,
  isCapabilityErrorCategory,
  isCapabilityErrorCode,
  isForbiddenFieldName,
} from '../../src/capabilities/error.js';
import {
  BUDGET_WINDOWS,
  PRIVACY_TIERS,
  RETENTION_CLASSES,
} from '../../src/capabilities/policy.js';
import {
  CAPABILITY_CONTRACT_MAJOR,
  CAPABILITY_CONTRACT_VERSION,
  CAPABILITY_ID_PATTERN,
  SUPPORTED_CAPABILITY_CONTRACT_MAJORS,
} from '../../src/capabilities/version.js';
import {
  buildCapabilityError,
  findForbiddenFieldPaths,
  validateCapabilityContext,
  validateCapabilityDefinition,
  validateCapabilityRequest,
  validateCapabilityResult,
  validateGovernance,
  validatePolicy,
} from '../../src/capabilities/validation.js';
import { validateClassifierIntelligenceArtifact } from '../../src/contracts/vlatam-global-bridge.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const applyFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (ajv: AjvClass) => void;

function buildValidator(schemaPath: string) {
  const schema = JSON.parse(readFileSync(schemaPath, 'utf-8')) as Record<string, unknown>;
  const ajv = new AjvClass({ allErrors: true, strict: false });
  applyFormats(ajv);
  return ajv.compile(schema);
}

function loadFixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(repoRoot, 'snapshots', 'pcram', name), 'utf-8')) as Record<
    string,
    unknown
  >;
}

describe('AI-71 contract — version constants and enums', () => {
  it('exposes a single supported MAJOR version and the contract version matches', () => {
    assert.equal(CAPABILITY_CONTRACT_MAJOR, 1);
    assert.equal(CAPABILITY_CONTRACT_VERSION, '1.1.0');
    assert.deepEqual([...SUPPORTED_CAPABILITY_CONTRACT_MAJORS], [1]);
  });

  it('exposes the five status values, three risk tiers, three provider execution values, and the nine domains', () => {
    assert.deepEqual([...CAPABILITY_STATUSES], ['existing', 'partial', 'planned', 'out_of_scope', 'retired']);
    assert.deepEqual([...CAPABILITY_RISK_TIERS], ['low', 'medium', 'high']);
    assert.deepEqual([...PROVIDER_EXECUTION_VALUES], ['required', 'optional', 'none']);
    assert.deepEqual(
      [...CAPABILITY_DOMAINS].sort(),
      ['advisory', 'evaluation', 'evidence', 'export', 'governance', 'provider', 'review', 'routing', 'source']
    );
    assert.deepEqual([...CAPABILITY_RESULT_STATUSES], ['succeeded', 'failed', 'blocked']);
  });

  it('exposes the five data classifications and the five downstream-use values', () => {
    assert.deepEqual([...DATA_CLASSIFICATIONS], ['public', 'internal', 'confidential', 'regulated', 'restricted']);
    assert.deepEqual(
      [...DOWNSTREAM_USE_VALUES],
      ['none', 'evidence_packet', 'classifier_candidate', 'advisory_draft', 'approved_export']
    );
  });

  it('exposes the four error categories and the fourteen error codes', () => {
    assert.deepEqual([...CAPABILITY_ERROR_CATEGORIES], ['contract', 'policy', 'execution', 'internal']);
    assert.equal(CAPABILITY_ERROR_CODES.length, 14);
    assert.ok(CAPABILITY_ERROR_CODES.includes('UNKNOWN_CAPABILITY'));
    assert.ok(CAPABILITY_ERROR_CODES.includes('INVALID_REQUEST'));
    assert.ok(CAPABILITY_ERROR_CODES.includes('UNSUPPORTED_SCHEMA_VERSION'));
    assert.ok(CAPABILITY_ERROR_CODES.includes('POLICY_BLOCKED'));
    assert.ok(CAPABILITY_ERROR_CODES.includes('HUMAN_REVIEW_REQUIRED'));
    assert.ok(CAPABILITY_ERROR_CODES.includes('EXECUTION_UNAVAILABLE'));
    assert.ok(CAPABILITY_ERROR_CODES.includes('MISSING_EVIDENCE'));
  });

  it('exposes the four privacy tiers and the four retention classes', () => {
    assert.deepEqual([...PRIVACY_TIERS], ['standard', 'sensitive', 'regulated', 'restricted']);
    assert.deepEqual(
      [...RETENTION_CLASSES],
      ['no_retention', 'audit_only', 'audit_with_payload', 'reviewed_export']
    );
    assert.deepEqual([...BUDGET_WINDOWS], ['per_request', 'per_session', 'per_day']);
  });

  it('exposes the capability ID pattern that rejects vendor or model names', () => {
    assert.equal(CAPABILITY_ID_PATTERN.test('evidence.extraction.normative_claims'), true);
    assert.equal(CAPABILITY_ID_PATTERN.test('review.human.gate'), true);
    assert.equal(CAPABILITY_ID_PATTERN.test('openai.gpt-5-classifier'), false);
    assert.equal(CAPABILITY_ID_PATTERN.test('qwen-plus.normative-extraction'), false);
    assert.equal(CAPABILITY_ID_PATTERN.test('cloudflare.deepseek-production'), false);
    assert.equal(CAPABILITY_ID_PATTERN.test('Evidence.Extraction.X'), false);
    assert.equal(CAPABILITY_ID_PATTERN.test('evidence'), false);
  });
});

describe('AI-71 contract — type guards', () => {
  it('isCapabilityId accepts only structurally valid IDs', () => {
    assert.equal(isCapabilityId('evidence.extraction.normative_claims'), true);
    assert.equal(isCapabilityId('review.human.gate'), true);
    assert.equal(isCapabilityId('openai.gpt-5'), false);
    assert.equal(isCapabilityId(''), false);
    assert.equal(isCapabilityId(42), false);
    assert.equal(isCapabilityId(null), false);
    assert.equal(isCapabilityId(undefined), false);
  });

  it('isSchemaVersion accepts only semver strings', () => {
    assert.equal(isSchemaVersion('1.0.0'), true);
    assert.equal(isSchemaVersion('2.10.4'), true);
    assert.equal(isSchemaVersion('1.0'), false);
    assert.equal(isSchemaVersion('1.0.0.0'), false);
    assert.equal(isSchemaVersion('v1.0.0'), false);
    assert.equal(isSchemaVersion(1), false);
  });

  it('enum guards accept only enum members', () => {
    assert.equal(isCapabilityStatus('existing'), true);
    assert.equal(isCapabilityStatus('partial'), true);
    assert.equal(isCapabilityStatus('planned'), true);
    assert.equal(isCapabilityStatus('out_of_scope'), true);
    assert.equal(isCapabilityStatus('retired'), true);
    assert.equal(isCapabilityStatus('enabled'), false);
    assert.equal(isCapabilityRiskTier('low'), true);
    assert.equal(isCapabilityRiskTier('critical'), false);
    assert.equal(isProviderExecution('required'), true);
    assert.equal(isProviderExecution('optional'), true);
    assert.equal(isProviderExecution('none'), true);
    assert.equal(isProviderExecution('always'), false);
    assert.equal(isCapabilityResultStatus('succeeded'), true);
    assert.equal(isCapabilityResultStatus('blocked'), true);
    assert.equal(isCapabilityResultStatus('done'), false);
    assert.equal(isDataClassification('public'), true);
    assert.equal(isDataClassification('regulated'), true);
    assert.equal(isDataClassification('secret'), false);
    assert.equal(isDownstreamUse('classifier_candidate'), true);
    assert.equal(isDownstreamUse('approved_export'), true);
    assert.equal(isDownstreamUse('production'), false);
  });

  it('error-code guards accept only known codes and the categories', () => {
    assert.equal(isCapabilityErrorCode('UNKNOWN_CAPABILITY'), true);
    assert.equal(isCapabilityErrorCode('HUMAN_REVIEW_REQUIRED'), true);
    assert.equal(isCapabilityErrorCode('WHATEVER'), false);
    assert.equal(isCapabilityErrorCategory('contract'), true);
    assert.equal(isCapabilityErrorCategory('policy'), true);
    assert.equal(isCapabilityErrorCategory('vendor'), false);
  });

  it('isForbiddenFieldName recognizes provider and credential fields case-insensitively', () => {
    assert.equal(isForbiddenFieldName('provider_id'), true);
    assert.equal(isForbiddenFieldName('PROVIDER_ID'), true);
    assert.equal(isForbiddenFieldName('model_id'), true);
    assert.equal(isForbiddenFieldName('api_key'), true);
    assert.equal(isForbiddenFieldName('reviewer'), true);
    assert.equal(isForbiddenFieldName('profile_id'), true);
    assert.equal(isForbiddenFieldName('prompt_hash'), true);
    assert.equal(isForbiddenFieldName('endpoint_url'), true);
    assert.equal(isForbiddenFieldName('jurisdiction'), false);
    assert.equal(isForbiddenFieldName('correlation_id'), false);
    assert.equal(isForbiddenFieldName('safe_field'), false);
  });

  it('buildCapabilityError produces a well-formed error', () => {
    const err = buildCapabilityError('policy', 'HUMAN_REVIEW_REQUIRED', 'review required', { hint: 1 });
    assert.equal(err.category, 'policy');
    assert.equal(err.code, 'HUMAN_REVIEW_REQUIRED');
    assert.equal(err.message, 'review required');
    assert.deepEqual(err.details, { hint: 1 });
  });
});

describe('AI-71 contract — request validation', () => {
  it('accepts the valid fixture', () => {
    const fixture = loadFixture('capability-request-valid.json');
    const result = validateCapabilityRequest(fixture);
    assert.equal(result.ok, true, JSON.stringify(result.ok ? null : result.errors, null, 2));
  });

  it('rejects a request that is missing the schema_version', () => {
    const fixture = loadFixture('capability-request-invalid-missing-required.json');
    const result = validateCapabilityRequest(fixture);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.errors.some(e => e.includes('schema_version')),
        `expected schema_version error, got: ${result.errors.join(', ')}`
      );
    }
  });

  it('rejects a request whose schema_version MAJOR is not supported (fail-closed)', () => {
    const fixture = loadFixture('capability-request-invalid-unsupported-version.json');
    const result = validateCapabilityRequest(fixture);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.errors.some(e => e.includes('major 99') || e.includes('not supported')),
        `expected major-version error, got: ${result.errors.join(', ')}`
      );
    }
  });

  it('rejects a request that carries a forbidden provider/credential field', () => {
    const fixture = loadFixture('capability-request-invalid-provider-credential.json');
    const result = validateCapabilityRequest(fixture);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.errors.some(e => e.includes('forbidden provider/credential fields')),
        `expected forbidden-field error, got: ${result.errors.join(', ')}`
      );
    }
  });

  it('rejects a request whose capability_id is malformed', () => {
    const result = validateCapabilityRequest({
      request_id: 'r1',
      capability_id: 'OPENAI.gpt-5',
      schema_version: '1.0.0',
      input: {},
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.errors.some(e => e.includes('capability_id must match')),
        `expected capability_id pattern error, got: ${result.errors.join(', ')}`
      );
    }
  });

  it('rejects a request whose input is not an object', () => {
    const result = validateCapabilityRequest({
      request_id: 'r1',
      capability_id: 'evidence.extraction.normative_claims',
      schema_version: '1.0.0',
      input: 'not an object',
    });
    assert.equal(result.ok, false);
  });

  it('rejects a request with a non-string request_id', () => {
    const result = validateCapabilityRequest({
      request_id: '',
      capability_id: 'evidence.extraction.normative_claims',
      schema_version: '1.0.0',
      input: {},
    });
    assert.equal(result.ok, false);
  });

  it('accepts a request without a context (the context is optional)', () => {
    const result = validateCapabilityRequest({
      request_id: 'r1',
      capability_id: 'evidence.extraction.normative_claims',
      schema_version: '1.0.0',
      input: {},
    });
    assert.equal(result.ok, true);
  });

  it('accepts a request with a well-formed context', () => {
    const result = validateCapabilityRequest({
      request_id: 'r1',
      capability_id: 'evidence.extraction.normative_claims',
      schema_version: '1.0.0',
      input: {},
      context: {
        jurisdiction: 'AR',
        data_classification: 'regulated',
        downstream_use: 'classifier_candidate',
        timestamp: '2026-07-11T22:00:00.000Z',
      },
    });
    assert.equal(result.ok, true);
  });

  it('rejects a request with a malformed context', () => {
    const result = validateCapabilityRequest({
      request_id: 'r1',
      capability_id: 'evidence.extraction.normative_claims',
      schema_version: '1.0.0',
      input: {},
      context: {
        data_classification: 'top_secret',
        downstream_use: 'production',
        timestamp: 'not-a-date',
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.length >= 3);
    }
  });
});

describe('AI-71 contract — result validation', () => {
  it('accepts the valid succeeded result fixture', () => {
    const fixture = loadFixture('capability-result-valid.json');
    const result = validateCapabilityResult(fixture);
    assert.equal(result.ok, true, JSON.stringify(result.ok ? null : result.errors, null, 2));
  });

  it('rejects a succeeded result that omits output', () => {
    const fixture = loadFixture('capability-result-invalid-succeeded-without-output.json');
    const result = validateCapabilityResult(fixture);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.errors.some(e => e.includes('succeeded requires output')),
        `expected succeeded-requires-output error, got: ${result.errors.join(', ')}`
      );
    }
  });

  it('rejects a blocked result that declares downstream_allowed: true', () => {
    const fixture = loadFixture('capability-result-invalid-blocked-downstream-allowed.json');
    const result = validateCapabilityResult(fixture);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.errors.some(e => e.includes('blocked requires governance.downstream_allowed=false')),
        `expected blocked/downstream_allowed error, got: ${result.errors.join(', ')}`
      );
    }
  });

  it('rejects a blocked result that omits the error block', () => {
    const fixture = loadFixture('capability-result-invalid-blocked-without-error.json');
    const result = validateCapabilityResult(fixture);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.errors.some(e => e.includes('blocked requires a structured error')),
        `expected blocked-requires-error error, got: ${result.errors.join(', ')}`
      );
    }
  });

  it('rejects a result that leaks reviewer identity (forbidden field walk)', () => {
    const fixture = loadFixture('capability-result-invalid-reviewer-leak.json');
    const result = validateCapabilityResult(fixture);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.errors.some(e => e.includes('forbidden provider/credential fields')),
        `expected forbidden-field error, got: ${result.errors.join(', ')}`
      );
    }
  });

  it('accepts a failed result with a structured execution error', () => {
    const result = validateCapabilityResult({
      request_id: 'r1',
      capability_id: 'evidence.extraction.normative_claims',
      schema_version: '1.0.0',
      status: 'failed',
      error: {
        category: 'execution',
        code: 'MISSING_EVIDENCE',
        message: 'Insufficient evidence to produce a draft.',
      },
      governance: {
        human_review_required: true,
        downstream_allowed: false,
        approval_state: 'pending',
      },
    });
    assert.equal(result.ok, true);
  });

  it('rejects a failed result whose error category is policy (failed requires execution/internal)', () => {
    const result = validateCapabilityResult({
      request_id: 'r1',
      capability_id: 'evidence.extraction.normative_claims',
      schema_version: '1.0.0',
      status: 'failed',
      error: {
        category: 'policy',
        code: 'POLICY_BLOCKED',
        message: 'Cannot fail with a policy error.',
      },
      governance: {
        human_review_required: true,
        downstream_allowed: false,
        approval_state: 'pending',
      },
    });
    assert.equal(result.ok, false);
  });

  it('accepts a blocked result with a structured policy error', () => {
    const result = validateCapabilityResult({
      request_id: 'r1',
      capability_id: 'evidence.extraction.normative_claims',
      schema_version: '1.0.0',
      status: 'blocked',
      error: {
        category: 'policy',
        code: 'HUMAN_REVIEW_REQUIRED',
        message: 'Capability requires explicit human review.',
      },
      governance: {
        human_review_required: true,
        downstream_allowed: false,
        approval_state: 'pending',
      },
    });
    assert.equal(result.ok, true);
  });

  it('rejects a succeeded result that is downstream-allowed (no auto-approval)', () => {
    const result = validateCapabilityResult({
      request_id: 'r1',
      capability_id: 'review.human.gate',
      schema_version: '1.0.0',
      status: 'succeeded',
      output: { approved: true },
      governance: {
        human_review_required: true,
        downstream_allowed: true,
        approval_state: 'approved',
      },
    });
    assert.equal(result.ok, false);
  });

  it('accepts an approved result whose human_review_required is false (the serve-only case)', () => {
    const result = validateCapabilityResult({
      request_id: 'r1',
      capability_id: 'artifact.approved.serve_http',
      schema_version: '1.0.0',
      status: 'succeeded',
      output: { export_id: 'x' },
      governance: {
        human_review_required: false,
        downstream_allowed: true,
        approval_state: 'not_required',
      },
    });
    assert.equal(result.ok, true);
  });
});

describe('AI-71 contract — governance validation', () => {
  it('accepts a well-formed governance block', () => {
    const result = validateGovernance({
      human_review_required: false,
      downstream_allowed: true,
      approval_state: 'not_required',
    });
    assert.equal(result.ok, true);
  });

  it('rejects a governance block that is missing human_review_required', () => {
    const result = validateGovernance({
      downstream_allowed: true,
      approval_state: 'approved',
    });
    assert.equal(result.ok, false);
  });

  it('rejects downstream_allowed: true when human_review_required: true', () => {
    const result = validateGovernance({
      human_review_required: true,
      downstream_allowed: true,
      approval_state: 'approved',
    });
    assert.equal(result.ok, false);
  });

  it('rejects approval_state: pending when human_review_required: false', () => {
    const result = validateGovernance({
      human_review_required: false,
      downstream_allowed: false,
      approval_state: 'pending',
    });
    assert.equal(result.ok, false);
  });

  it('rejects approval_state: rejected when downstream_allowed: true', () => {
    const result = validateGovernance({
      human_review_required: true,
      downstream_allowed: true,
      approval_state: 'rejected',
    });
    assert.equal(result.ok, false);
  });
});

describe('AI-71 contract — policy validation', () => {
  it('accepts the valid policy fixture', () => {
    const fixture = loadFixture('capability-policy-valid.json');
    const result = validatePolicy(fixture);
    assert.equal(result.ok, true, JSON.stringify(result.ok ? null : result.errors, null, 2));
  });

  it('rejects a policy that omits a required block', () => {
    const fixture = loadFixture('capability-policy-invalid-missing-block.json');
    const result = validatePolicy(fixture);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.errors.some(e => e.includes('privacy_requirement') || e.includes('budget_requirement') || e.includes('execution_requirement') || e.includes('evaluation_requirement')),
        `expected missing-block error, got: ${result.errors.join(', ')}`
      );
    }
  });

  it('rejects a policy whose privacy tier is unknown', () => {
    const fixture = loadFixture('capability-policy-invalid-tier.json');
    const result = validatePolicy(fixture);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.errors.some(e => e.includes('tier')),
        `expected tier error, got: ${result.errors.join(', ')}`
      );
    }
  });
});

describe('AI-71 contract — context validation', () => {
  it('returns ok for undefined context', () => {
    assert.equal(validateCapabilityContext(undefined).ok, true);
  });
  it('rejects a non-object context', () => {
    assert.equal(validateCapabilityContext('not an object').ok, false);
  });
  it('rejects a context with bad enums', () => {
    const result = validateCapabilityContext({ data_classification: 'top_secret', downstream_use: 'production' });
    assert.equal(result.ok, false);
  });
});

describe('AI-71 contract — definition validation', () => {
  it('accepts a minimal valid definition', () => {
    const result = validateCapabilityDefinition({
      capability_id: 'review.human.gate',
      name: 'Human review gate',
      domain: 'review',
      status: 'existing',
      risk_tier: 'high',
      human_review: false,
      downstream_policy: { downstream_allowed: 'conditional', reason: 'review is the act of judgment' },
      provider_execution: 'none',
      roadmap_owner: 'ai-70-existing',
      input_schema_ref: 'schemas/classifier-intelligence-artifact.schema.json',
      output_schema_ref: 'schemas/classifier-intelligence-artifact.schema.json',
      policy: {
        human_review_policy: { required: false, reason: 'review is the act of judgment' },
        downstream_policy: { downstream_allowed: 'conditional', reason: 'review is the act of judgment' },
        privacy_requirement: {
          tier: 'standard',
          zdr_required: false,
          redact_fields: [],
          retention_class: 'audit_only',
        },
        budget_requirement: {},
        evaluation_requirement: { gold_case_required: false },
        execution_requirement: { provider_execution: 'none', deterministic_fallback: true },
      },
    });
    assert.equal(result.ok, true, JSON.stringify(result.ok ? null : result.errors, null, 2));
  });

  it('accepts a definition that binds human_review: true and downstream_allowed: true (catalog-permitted post-review boundary)', () => {
    // The catalog permits `human_review: true, downstream_allowed: true` for
    // the post-review export contract capability. The contract does not
    // enforce the inverse rule at the definition level; the runtime layer
    // ensures the capability is only invoked on a reviewed input. The
    // catalog test in `tests/architecture/ai-capabilities.test.ts` enforces
    // the complementary rule (human_review: false + downstream_allowed:
    // true is permitted only for the serve-only allowlist).
    const result = validateCapabilityDefinition({
      capability_id: 'artifact.export_contract.generate',
      name: 'Export contract generation',
      domain: 'export',
      status: 'existing',
      risk_tier: 'high',
      human_review: true,
      downstream_policy: { downstream_allowed: true, reason: 'post-review boundary' },
      provider_execution: 'none',
      roadmap_owner: 'ai-70-existing',
      input_schema_ref: 'schemas/classifier-intelligence-artifact.schema.json',
      output_schema_ref: 'schemas/classifier-approved-artifact-export.schema.json',
      policy: {
        human_review_policy: { required: true, reason: 'post-review' },
        downstream_policy: { downstream_allowed: true, reason: 'post-review boundary' },
        privacy_requirement: {
          tier: 'regulated',
          zdr_required: true,
          redact_fields: ['supplier_names'],
          retention_class: 'reviewed_export',
        },
        budget_requirement: { max_cost_usd: 0.01, window: 'per_request' },
        evaluation_requirement: { gold_case_required: true },
        execution_requirement: { provider_execution: 'none', deterministic_fallback: true },
      },
    });
    assert.equal(result.ok, true, JSON.stringify(result.ok ? null : result.errors, null, 2));
  });

  it('rejects a definition that is missing required fields', () => {
    const result = validateCapabilityDefinition({});
    assert.equal(result.ok, false);
  });
});

describe('AI-71 contract — forbidden field walk', () => {
  it('finds forbidden fields at the top level and one level deep', () => {
    const paths = findForbiddenFieldPaths({
      provider_id: 'p',
      input: { model_id: 'm', nested: { api_key: 'a' } },
      safe: 'ok',
    });
    assert.deepEqual([...paths].sort(), ['input.model_id', 'input.nested.api_key', 'provider_id']);
  });

  it('finds forbidden fields inside arrays', () => {
    const paths = findForbiddenFieldPaths({
      claims: [{ id: 'c1' }, { id: 'c2', model_id: 'm' }],
    });
    assert.deepEqual(paths, ['claims[1].model_id']);
  });

  it('respects the depth cap and does not loop on cycles', () => {
    const obj: Record<string, unknown> = { name: 'safe' };
    obj['self'] = obj;
    const paths = findForbiddenFieldPaths(obj);
    assert.deepEqual(paths, []);
  });

  it('returns the canonical forbidden field set', () => {
    for (const name of [
      'provider',
      'provider_id',
      'model',
      'model_id',
      'api_key',
      'token',
      'bearer',
      'authorization',
      'secret',
      'reviewer',
      'reviewer_id',
      'profile_id',
      'execution_profile',
      'prompt_hash',
      'endpoint_url',
    ]) {
      assert.ok(FORBIDDEN_FIELD_NAMES.has(name), `${name} should be a forbidden field name`);
    }
  });
});

describe('AI-71 contract — JSON Schemas (Ajv) agree with the runtime validators', () => {
  it('capability-request.schema.json accepts the valid fixture', () => {
    const validate = buildValidator(resolve(repoRoot, 'schemas', 'capability-request.schema.json'));
    assert.equal(validate(loadFixture('capability-request-valid.json')), true);
  });

  it('capability-request.schema.json rejects the missing-required fixture', () => {
    const validate = buildValidator(resolve(repoRoot, 'schemas', 'capability-request.schema.json'));
    assert.equal(validate(loadFixture('capability-request-invalid-missing-required.json')), false);
  });

  it('capability-request.schema.json rejects the provider/credential leak fixture', () => {
    const validate = buildValidator(resolve(repoRoot, 'schemas', 'capability-request.schema.json'));
    assert.equal(validate(loadFixture('capability-request-invalid-provider-credential.json')), false);
  });

  it('capability-result.schema.json accepts the valid fixture', () => {
    const validate = buildValidator(resolve(repoRoot, 'schemas', 'capability-result.schema.json'));
    assert.equal(validate(loadFixture('capability-result-valid.json')), true);
  });

  it('capability-result.schema.json rejects succeeded-without-output', () => {
    const validate = buildValidator(resolve(repoRoot, 'schemas', 'capability-result.schema.json'));
    assert.equal(validate(loadFixture('capability-result-invalid-succeeded-without-output.json')), false);
  });

  it('capability-result.schema.json rejects blocked-with-downstream-allowed', () => {
    const validate = buildValidator(resolve(repoRoot, 'schemas', 'capability-result.schema.json'));
    assert.equal(validate(loadFixture('capability-result-invalid-blocked-downstream-allowed.json')), false);
  });

  it('capability-result.schema.json rejects blocked-without-error', () => {
    const validate = buildValidator(resolve(repoRoot, 'schemas', 'capability-result.schema.json'));
    assert.equal(validate(loadFixture('capability-result-invalid-blocked-without-error.json')), false);
  });

  it('capability-result.schema.json rejects reviewer leaks', () => {
    const validate = buildValidator(resolve(repoRoot, 'schemas', 'capability-result.schema.json'));
    assert.equal(validate(loadFixture('capability-result-invalid-reviewer-leak.json')), false);
  });

  it('capability-error.schema.json accepts the valid fixture', () => {
    const validate = buildValidator(resolve(repoRoot, 'schemas', 'capability-error.schema.json'));
    assert.equal(validate(loadFixture('capability-error-valid.json')), true);
  });

  it('capability-error.schema.json rejects unknown codes', () => {
    const validate = buildValidator(resolve(repoRoot, 'schemas', 'capability-error.schema.json'));
    assert.equal(validate(loadFixture('capability-error-invalid-code.json')), false);
  });

  it('capability-error.schema.json rejects missing message', () => {
    const validate = buildValidator(resolve(repoRoot, 'schemas', 'capability-error.schema.json'));
    assert.equal(validate(loadFixture('capability-error-invalid-missing-message.json')), false);
  });

  it('capability-policy.schema.json accepts the valid fixture', () => {
    const validate = buildValidator(resolve(repoRoot, 'schemas', 'capability-policy.schema.json'));
    assert.equal(validate(loadFixture('capability-policy-valid.json')), true);
  });

  it('capability-policy.schema.json rejects missing blocks', () => {
    const validate = buildValidator(resolve(repoRoot, 'schemas', 'capability-policy.schema.json'));
    assert.equal(validate(loadFixture('capability-policy-invalid-missing-block.json')), false);
  });

  it('capability-policy.schema.json rejects unknown tier', () => {
    const validate = buildValidator(resolve(repoRoot, 'schemas', 'capability-policy.schema.json'));
    assert.equal(validate(loadFixture('capability-policy-invalid-tier.json')), false);
  });
});

describe('AI-71 contract — preservation of the existing AI-70 doctrine', () => {
  it('does not relax the existing classifier-intelligence-artifact validator (unchanged)', () => {
    // The AI-70 doctrine is preserved in vlatam-global-bridge.ts; this
    // test simply asserts that the existing validator still rejects a
    // downstream-allowed artifact that lacks a reviewer identity. The
    // AI-71 contract is layered on top, not a replacement.
    const bad = {
      artifact_id: 'artifact--infoleg--x',
      extraction_result_id: 'extraction-001',
      source_id: 'infoleg',
      generated_at: '2026-06-16T00:00:00Z',
      extracted_evidence: [],
      governance: {
        human_review_required: true,
        downstream_allowed: true,
        review_only: false,
        not_final_classification: false,
      },
      schema_version: '1.0.0',
    };
    const result = validateClassifierIntelligenceArtifact(bad);
    assert.equal(result.ok, false);
  });
});

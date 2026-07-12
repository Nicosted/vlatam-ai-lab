import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { getCapabilityDefinition } from '../../src/capabilities/index.js';
import type { CapabilityDefinition, CapabilityRequest } from '../../src/capabilities/index.js';
import { getExecutionProfile } from '../../src/execution/profile-catalog.js';
import type { ExecutionProfile, ExecutionProfileId } from '../../src/execution/execution-profile.js';
import { PrivacyEnforcer } from '../../src/privacy/privacy-enforcer.js';
import { PrivacyPolicyCatalog } from '../../src/privacy/privacy-policy.js';
import type { PrivacyProfileDeclaration } from '../../src/privacy/privacy-policy.js';
import { ZdrEvidenceStore } from '../../src/privacy/zdr-evidence.js';
import { assertPrivacyAuditMetadataOnly } from '../../src/privacy/privacy-audit.js';
import { LOCAL_REPLAY_PRIVACY } from '../helpers/privacy.js';

const root = process.cwd();
const NOW = new Date('2026-06-01T00:00:00.000Z');
const SENTINEL_EMAIL = 'sentinel.broker@example.com';

const definition = getCapabilityDefinition('evidence.extraction.normative_claims' as never) as CapabilityDefinition;
assert.ok(definition, 'normative claims definition must exist');

const evidenceStore = new ZdrEvidenceStore(
  JSON.parse(readFileSync(join(root, 'snapshots/privacy/example-zdr-evidence.json'), 'utf8'))
);

function enforcer(options: ConstructorParameters<typeof PrivacyEnforcer>[0] = {}): PrivacyEnforcer {
  return new PrivacyEnforcer({ zdrEvidence: evidenceStore, clock: () => NOW, ...options });
}

function request(classification?: string, inputExtras: Record<string, unknown> = {}): CapabilityRequest {
  return {
    request_id: 'request-enforcer-001',
    capability_id: definition.capability_id,
    schema_version: '1.0.0',
    input: {
      packet_id: 'packet-enforcer-001',
      evidence_refs: [{ source_id: 'source-001', snapshot_id: 'snapshot-001', excerpt: 'Synthetic evidence only.' }],
      ...inputExtras,
    },
    ...(classification === undefined ? {} : { context: { data_classification: classification as never } }),
  };
}

const REGULATED_LOCAL_PRIVACY: PrivacyProfileDeclaration = {
  max_data_classification: 'regulated',
  external_processing: 'allowed',
  zdr_support: 'verified',
  zdr_evidence_ref: 'zdr-evidence.test-local-regulated.v1',
  retention_behavior: 'ephemeral_memory',
  training_use: 'contractually_prohibited_verified',
  processing_region: 'local',
  pre_execution_redaction_required: true,
  regulated_data_permitted: true,
  restricted_data_permitted: false,
};

function profile(
  privacy: PrivacyProfileDeclaration | undefined,
  overrides: Partial<Omit<ExecutionProfile, 'privacy'>> = {}
): ExecutionProfile {
  return {
    profile_id: 'test.regulated.local.v1' as ExecutionProfileId,
    capability_id: definition.capability_id,
    provider_id: 'test-provider' as never,
    model_id: 'test-model' as never,
    mode: 'live',
    lifecycle_status: 'candidate',
    enabled: true,
    contract_version: '1.1.0',
    configuration: { timeout_ms: 1000, response_format: 'json' },
    eligibility: { privacy_compatibility: 'declared_not_enforced', budget_class: 'development', evaluation_status: 'not_evaluated' },
    privacy: privacy as PrivacyProfileDeclaration,
    ...overrides,
  };
}

const replayProfile = profile(LOCAL_REPLAY_PRIVACY, { mode: 'replay', profile_id: 'test.replay.local.v1' as ExecutionProfileId, fixture_id: 'normative-claims-success' });

function enforce(req: CapabilityRequest, prof: ExecutionProfile, engine = enforcer()) {
  return engine.enforce({ capability_request: req, capability_definition: definition, execution_profile: prof });
}

describe('AI-73 privacy enforcer — classification', () => {
  it('fails closed on a missing classification', () => {
    const decision = enforce(request(undefined), replayProfile);
    assert.equal(decision.status, 'blocked');
    assert.equal(decision.reason_code, 'DATA_CLASSIFICATION_REQUIRED');
    assert.equal(decision.cleared_request, undefined);
  });

  it('fails closed on an unknown classification', () => {
    const decision = enforce(request('top_secret'), replayProfile);
    assert.equal(decision.reason_code, 'UNKNOWN_DATA_CLASSIFICATION');
    assert.equal(decision.status, 'blocked');
  });

  it('blocks a profile whose maximum classification is lower than the request (no downgrade)', () => {
    const lowProfile = profile({ ...REGULATED_LOCAL_PRIVACY, max_data_classification: 'public', zdr_support: 'unsupported', external_processing: 'forbidden' });
    const decision = enforce(request('internal'), lowProfile);
    assert.equal(decision.status, 'blocked');
    assert.equal(decision.reason_code, 'PROFILE_PRIVACY_INCOMPATIBLE');
    // The audit shows the request classification unchanged: nothing downgraded it.
    assert.equal(decision.audit.data_classification, 'internal');
  });
});

describe('AI-73 privacy enforcer — policy resolution and configuration', () => {
  it('resolves the applicable policy deterministically', () => {
    const a = enforce(request('internal'), replayProfile);
    const b = enforce(request('internal'), replayProfile);
    assert.deepEqual(a, b);
    assert.equal(a.status, 'allowed');
    assert.equal(a.audit.privacy_policy_id, 'privacy.evidence-extraction.internal.v1');
  });

  it('fails closed when no policy covers the capability', () => {
    const gateDefinition = getCapabilityDefinition('review.human.gate' as never) as CapabilityDefinition;
    assert.ok(gateDefinition);
    const decision = enforcer().enforce({
      capability_request: { ...request('public'), capability_id: gateDefinition.capability_id },
      capability_definition: gateDefinition,
      execution_profile: replayProfile,
    });
    assert.equal(decision.reason_code, 'PRIVACY_POLICY_MISSING');
    assert.equal(decision.status, 'blocked');
  });

  it('fails closed on ambiguous policy matches', () => {
    const ambiguous = new PrivacyPolicyCatalog(
      JSON.parse(readFileSync(join(root, 'snapshots/privacy/invalid-privacy-policies-ambiguous-match.json'), 'utf8'))
    );
    const decision = enforce(request('public'), replayProfile, enforcer({ policyCatalog: ambiguous }));
    assert.equal(decision.reason_code, 'PRIVACY_POLICY_AMBIGUOUS');
  });

  it('fails closed on an incomplete capability privacy requirement', () => {
    const broken = { ...definition, policy: { ...definition.policy, privacy_requirement: undefined } } as never;
    const decision = enforcer().enforce({ capability_request: request('public'), capability_definition: broken, execution_profile: replayProfile });
    assert.equal(decision.reason_code, 'PRIVACY_CONFIGURATION_INVALID');
  });

  it('fails closed when the profile privacy declaration is missing', () => {
    const decision = enforce(request('public'), profile(undefined));
    assert.equal(decision.reason_code, 'PROFILE_PRIVACY_DECLARATION_MISSING');
  });
});

describe('AI-73 privacy enforcer — ZDR', () => {
  it('allows an otherwise eligible regulated request with verified, applicable, unexpired evidence', () => {
    const decision = enforce(request('regulated'), profile(REGULATED_LOCAL_PRIVACY));
    assert.equal(decision.status, 'allowed');
    assert.ok(decision.required_actions.includes('zdr_verified'));
    assert.ok(decision.required_actions.includes('human_review_required'));
    assert.equal(decision.audit.zdr_evidence_id, 'zdr-evidence.test-local-regulated.v1');
  });

  it('blocks declared_unverified, unknown, and unsupported ZDR postures', () => {
    for (const [support, reason] of [
      ['declared_unverified', 'ZDR_UNVERIFIED'],
      ['unknown', 'ZDR_UNVERIFIED'],
      ['unsupported', 'ZDR_REQUIRED'],
    ] as const) {
      const decision = enforce(
        request('regulated'),
        profile({ ...REGULATED_LOCAL_PRIVACY, zdr_support: support, zdr_evidence_ref: undefined })
      );
      assert.equal(decision.status, 'blocked');
      assert.equal(decision.reason_code, reason, support);
    }
  });

  it('blocks verified declarations whose evidence is missing, expired, or out of scope', () => {
    for (const [ref, reason] of [
      ['zdr-evidence.does-not-exist', 'ZDR_EVIDENCE_MISSING'],
      // A verified declaration without an evidence reference is an
      // invalid declaration, not merely missing evidence.
      [undefined, 'PRIVACY_CONFIGURATION_INVALID'],
      ['zdr-evidence.test-expired.v1', 'ZDR_EVIDENCE_EXPIRED'],
      ['zdr-evidence.test-other-profile.v1', 'ZDR_EVIDENCE_SCOPE_MISMATCH'],
      ['zdr-evidence.test-unreviewed.v1', 'ZDR_UNVERIFIED'],
      ['zdr-evidence.test-declared-unverified.v1', 'ZDR_UNVERIFIED'],
    ] as const) {
      const decision = enforce(
        request('regulated'),
        profile({ ...REGULATED_LOCAL_PRIVACY, zdr_evidence_ref: ref as string | undefined })
      );
      assert.equal(decision.reason_code, reason, String(ref));
    }
  });

  it('applies capability-level ZDR to external processing even for public requests (requirements cannot be weakened)', () => {
    // The capability declares zdr_required; the public policy entry says
    // not_required; the strictest requirement wins for external profiles.
    const decision = enforce(
      request('public'),
      profile({ ...REGULATED_LOCAL_PRIVACY, zdr_support: 'unknown', zdr_evidence_ref: undefined })
    );
    assert.equal(decision.reason_code, 'ZDR_UNVERIFIED');
  });

  it('never infers ZDR from provider or model names', () => {
    const decision = enforce(
      request('regulated'),
      profile(
        { ...REGULATED_LOCAL_PRIVACY, zdr_support: 'unknown', zdr_evidence_ref: undefined },
        { provider_id: 'zdr-guaranteed-provider' as never, model_id: 'zero-data-retention-model' as never }
      )
    );
    assert.equal(decision.status, 'blocked');
    assert.equal(decision.reason_code, 'ZDR_UNVERIFIED');
  });

  it('never infers ZDR from environment flags', () => {
    const previous = process.env['AI_LAB_ZDR_VERIFIED'];
    process.env['AI_LAB_ZDR_VERIFIED'] = 'true';
    try {
      const decision = enforce(
        request('regulated'),
        profile({ ...REGULATED_LOCAL_PRIVACY, zdr_support: 'unknown', zdr_evidence_ref: undefined })
      );
      assert.equal(decision.status, 'blocked');
      assert.equal(decision.reason_code, 'ZDR_UNVERIFIED');
    } finally {
      if (previous === undefined) delete process.env['AI_LAB_ZDR_VERIFIED'];
      else process.env['AI_LAB_ZDR_VERIFIED'] = previous;
    }
  });
});

describe('AI-73 privacy enforcer — redaction', () => {
  it('redacts optional PII fields and never leaks originals into the decision or audit', () => {
    const decision = enforce(request('internal', { contact_email: SENTINEL_EMAIL }), replayProfile);
    assert.equal(decision.status, 'allowed');
    const cleared = decision.cleared_request?.input as Record<string, unknown>;
    assert.match(String(cleared['contact_email']), /^redacted:sha256:[a-f0-9]{64}$/);
    assert.doesNotMatch(JSON.stringify(decision.audit), new RegExp(SENTINEL_EMAIL));
    assert.doesNotMatch(JSON.stringify(decision.cleared_request), new RegExp(SENTINEL_EMAIL));
    assert.equal(decision.audit.redaction_counts.hashed, 1);
  });

  it('blocks when a mandatory redaction path is missing', () => {
    const catalog = new PrivacyPolicyCatalog({
      schema_version: '1.0.0',
      policies: [
        {
          policy_id: 'privacy.test.mandatory-path.v1',
          schema_version: '1.0.0',
          capability_ids: [definition.capability_id],
          classifications: ['internal'],
          allowed_execution_modes: ['replay', 'live'],
          zdr_requirement: 'not_required',
          retention_requirement: { allowed_retention_behaviors: ['none', 'ephemeral_memory', 'bounded_local_fixture'] },
          redaction_rules: [
            { path: 'input.tax_identifier', action: 'hash_identifier', presence: 'required', covers: ['supplier_names', 'prices', 'bank_data', 'broker_pii'] },
          ],
          decision: 'require_redaction',
          priority: 100,
          reason_code: 'REDACTION_REQUIRED',
          human_review_required: false,
        },
      ],
    });
    const decision = enforce(request('internal'), replayProfile, enforcer({ policyCatalog: catalog }));
    assert.equal(decision.reason_code, 'REDACTION_FAILED');
  });

  it('blocks when a mandatory redaction path cannot be interpreted', () => {
    const catalog = new PrivacyPolicyCatalog({
      schema_version: '1.0.0',
      policies: [
        {
          policy_id: 'privacy.test.unknown-path.v1',
          schema_version: '1.0.0',
          capability_ids: [definition.capability_id],
          classifications: ['internal'],
          allowed_execution_modes: ['replay', 'live'],
          zdr_requirement: 'not_required',
          retention_requirement: { allowed_retention_behaviors: ['none', 'ephemeral_memory', 'bounded_local_fixture'] },
          redaction_rules: [
            { path: 'input.packet_id.nested_field', action: 'remove', presence: 'required', covers: ['supplier_names', 'prices', 'bank_data', 'broker_pii'] },
          ],
          decision: 'require_redaction',
          priority: 100,
          reason_code: 'REDACTION_REQUIRED',
          human_review_required: false,
        },
      ],
    });
    const decision = enforce(request('internal'), replayProfile, enforcer({ policyCatalog: catalog }));
    assert.equal(decision.reason_code, 'REDACTION_PATH_UNKNOWN');
  });

  it('blocks raw forbidden document text instead of pretending redaction made it safe', () => {
    const decision = enforce(
      request('internal', { raw_document_text: 'FULL DOCUMENT BODY WITH PII' }),
      replayProfile
    );
    assert.equal(decision.status, 'blocked');
    assert.equal(decision.reason_code, 'EXTERNAL_PROCESSING_FORBIDDEN');
    assert.doesNotMatch(JSON.stringify(decision), /FULL DOCUMENT BODY/);
  });

  it('fails closed when mandatory redaction is not configured for a covered capability', () => {
    const catalog = new PrivacyPolicyCatalog({
      schema_version: '1.0.0',
      policies: [
        {
          policy_id: 'privacy.test.no-rules.v1',
          schema_version: '1.0.0',
          capability_ids: [definition.capability_id],
          classifications: ['internal'],
          allowed_execution_modes: ['replay', 'live'],
          zdr_requirement: 'not_required',
          retention_requirement: { allowed_retention_behaviors: ['bounded_local_fixture'] },
          redaction_rules: [],
          decision: 'allow',
          priority: 100,
          reason_code: 'PRIVACY_CLEARED',
          human_review_required: false,
        },
      ],
    });
    const decision = enforce(request('internal'), replayProfile, enforcer({ policyCatalog: catalog }));
    assert.equal(decision.reason_code, 'REDACTION_REQUIRED');
  });
});

describe('AI-73 privacy enforcer — retention', () => {
  it('blocks incompatible retention declarations', () => {
    const decision = enforce(
      request('internal'),
      profile({ ...REGULATED_LOCAL_PRIVACY, zdr_support: 'unsupported', external_processing: 'forbidden', retention_behavior: 'forbidden' })
    );
    assert.equal(decision.reason_code, 'RETENTION_POLICY_INCOMPATIBLE');
  });

  it('blocks unknown provider retention for regulated execution', () => {
    const decision = enforce(
      request('regulated'),
      profile({ ...REGULATED_LOCAL_PRIVACY, external_processing: 'forbidden', zdr_support: 'unsupported', zdr_evidence_ref: undefined, retention_behavior: 'provider_unknown' })
    );
    assert.equal(decision.reason_code, 'RETENTION_POLICY_INCOMPATIBLE');
  });

  it('allows compatible ephemeral retention for eligible execution', () => {
    const decision = enforce(
      request('internal'),
      profile({ ...REGULATED_LOCAL_PRIVACY, external_processing: 'forbidden', zdr_support: 'unsupported', zdr_evidence_ref: undefined, max_data_classification: 'internal', regulated_data_permitted: false })
    );
    assert.equal(decision.status, 'allowed');
    assert.ok(decision.required_actions.includes('retention_validated'));
  });

  it('treats fixture storage as a retention decision (restricted cannot use bounded fixtures)', () => {
    const decision = enforce(
      request('restricted'),
      profile(
        { ...LOCAL_REPLAY_PRIVACY, max_data_classification: 'restricted', regulated_data_permitted: true, restricted_data_permitted: true },
        { mode: 'replay', fixture_id: 'normative-claims-success' }
      )
    );
    assert.equal(decision.status, 'blocked');
    assert.equal(decision.reason_code, 'RETENTION_POLICY_INCOMPATIBLE');
  });
});

describe('AI-73 privacy enforcer — replay semantics', () => {
  it('allows synthetic replay when classification, policy, and retention allow', () => {
    const decision = enforce(request('internal'), replayProfile);
    assert.equal(decision.status, 'allowed');
  });

  it('allows sanitized recorded replay only with explicit sanitization provenance', () => {
    const sanitized = profile(
      { ...LOCAL_REPLAY_PRIVACY, replay_fixture_origin: 'sanitized_recorded', replay_fixture_sanitization: 'sanitized' },
      { mode: 'replay' }
    );
    assert.equal(enforce(request('internal'), sanitized).status, 'allowed');
    const unproven = profile(
      { ...LOCAL_REPLAY_PRIVACY, replay_fixture_origin: 'sanitized_recorded', replay_fixture_sanitization: 'unknown' },
      { mode: 'replay' }
    );
    assert.equal(enforce(request('internal'), unproven).reason_code, 'REPLAY_FIXTURE_UNSAFE');
  });

  it('blocks unsanitized recorded replay fixtures for every classification', () => {
    const unsanitized = profile(
      { ...LOCAL_REPLAY_PRIVACY, replay_fixture_origin: 'unsanitized_recorded', replay_fixture_sanitization: 'unsanitized' },
      { mode: 'replay' }
    );
    for (const classification of ['public', 'internal'] as const) {
      const decision = enforce(request(classification), unsanitized);
      assert.equal(decision.reason_code, 'REPLAY_FIXTURE_UNSAFE', classification);
    }
  });

  it('blocks unknown-origin replay fixtures', () => {
    const unknownOrigin = profile(
      { ...LOCAL_REPLAY_PRIVACY, replay_fixture_origin: 'unknown', replay_fixture_sanitization: 'unknown' },
      { mode: 'replay' }
    );
    assert.equal(enforce(request('public'), unknownOrigin).reason_code, 'REPLAY_FIXTURE_UNSAFE');
  });

  it('never lets replay mode satisfy a ZDR requirement by itself', () => {
    // A replay profile that (incorrectly) declares external processing
    // still needs verified evidence; replay mode is not evidence.
    const externalReplay = profile(
      { ...LOCAL_REPLAY_PRIVACY, external_processing: 'allowed', max_data_classification: 'regulated', regulated_data_permitted: true, zdr_support: 'unknown' },
      { mode: 'replay' }
    );
    const decision = enforce(request('regulated'), externalReplay);
    assert.equal(decision.status, 'blocked');
    assert.equal(decision.reason_code, 'ZDR_UNVERIFIED');
    // And an allowed local replay decision carries no zdr_verified action.
    const local = enforce(request('internal'), replayProfile);
    assert.equal(local.required_actions.includes('zdr_verified'), false);
  });
});

describe('AI-73 privacy enforcer — live catalog profiles', () => {
  const deepseek = getExecutionProfile('normative-claims.deepseek.v1' as ExecutionProfileId);
  const dashscope = getExecutionProfile('normative-claims.dashscope.v1' as ExecutionProfileId);

  it('keeps DeepSeek and DashScope disabled, candidate, and not ZDR-verified', () => {
    for (const liveProfile of [deepseek, dashscope]) {
      assert.ok(liveProfile);
      assert.equal(liveProfile.enabled, false);
      assert.equal(liveProfile.lifecycle_status, 'candidate');
      assert.notEqual(liveProfile.privacy.zdr_support, 'verified');
      assert.equal(liveProfile.privacy.regulated_data_permitted, false);
      assert.equal(liveProfile.privacy.restricted_data_permitted, false);
    }
  });

  it('blocks regulated requests on both live profiles with current evidence', () => {
    for (const liveProfile of [deepseek, dashscope]) {
      assert.ok(liveProfile);
      const decision = enforce(request('regulated'), liveProfile);
      assert.equal(decision.status, 'blocked');
      assert.equal(decision.reason_code, 'PROFILE_PRIVACY_INCOMPATIBLE');
    }
  });

  it('blocks even public requests on live profiles until ZDR evidence exists', () => {
    for (const liveProfile of [deepseek, dashscope]) {
      assert.ok(liveProfile);
      const decision = enforce(request('public'), liveProfile);
      assert.equal(decision.status, 'blocked');
      assert.equal(decision.reason_code, 'ZDR_UNVERIFIED');
    }
  });
});

describe('AI-73 privacy enforcer — audit safety', () => {
  it('uses execution IDs only when direct callers explicitly supply them', () => {
    const withoutExecutionId = enforce(request('public'), replayProfile);
    const withConstructorExecutionId = enforce(
      request('public'),
      replayProfile,
      enforcer({ executionId: 'execution-standalone-001' })
    );
    assert.equal(withoutExecutionId.audit.execution_id, undefined);
    assert.equal(withConstructorExecutionId.audit.execution_id, 'execution-standalone-001');
  });

  it('emits metadata-only audits for allowed and blocked decisions', () => {
    const outcomes = [
      enforce(request('internal', { contact_email: SENTINEL_EMAIL }), replayProfile),
      enforce(request('regulated'), profile(REGULATED_LOCAL_PRIVACY)),
      enforce(request(undefined), replayProfile),
      enforce(request('internal', { raw_document_text: 'SECRET DOCUMENT' }), replayProfile),
    ];
    for (const decision of outcomes) {
      assert.deepEqual(assertPrivacyAuditMetadataOnly(decision.audit), []);
      const serialized = JSON.stringify(decision.audit);
      assert.doesNotMatch(serialized, /Synthetic evidence|excerpt|SECRET DOCUMENT|sentinel|prompt|messages|api[_-]?key|bearer|authorization|reviewer_name/i);
    }
  });
});

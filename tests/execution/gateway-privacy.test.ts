import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import type { CapabilityRequest } from '../../src/capabilities/index.js';
import type { ExecutionProfile, ExecutionProfileId } from '../../src/execution/execution-profile.js';
import { MultiProviderGateway } from '../../src/execution/multi-provider-gateway.js';
import { ProviderAdapterRegistry } from '../../src/providers/adapter-registry.js';
import type { ProviderAdapter, ProviderExecutionRequest } from '../../src/providers/provider-adapter.js';
import { PrivacyEnforcer } from '../../src/privacy/privacy-enforcer.js';
import { PrivacyPolicyCatalog } from '../../src/privacy/privacy-policy.js';
import type { PrivacyProfileDeclaration } from '../../src/privacy/privacy-policy.js';
import { ZdrEvidenceStore } from '../../src/privacy/zdr-evidence.js';
import { assertPrivacyAuditMetadataOnly } from '../../src/privacy/privacy-audit.js';
import { LOCAL_REPLAY_PRIVACY } from '../helpers/privacy.js';

const root = process.cwd();
const NOW = new Date('2026-06-01T00:00:00.000Z');
const SENTINEL_EMAIL = 'sentinel.broker@example.com';
const SENTINEL_EXCERPT = 'SENTINEL-EXCERPT-DO-NOT-LEAK';
const successFixture = JSON.parse(
  readFileSync(join(root, 'snapshots/execution/normative-claims-success.json'), 'utf8')
) as { content: string };

const evidenceStore = new ZdrEvidenceStore(
  JSON.parse(readFileSync(join(root, 'snapshots/privacy/example-zdr-evidence.json'), 'utf8'))
);

function request(classification?: string, inputExtras: Record<string, unknown> = {}): CapabilityRequest {
  return {
    request_id: 'request-replay-001',
    capability_id: 'evidence.extraction.normative_claims' as never,
    schema_version: '1.0.0',
    input: {
      packet_id: 'packet-replay-001',
      evidence_refs: [{ source_id: 'source-001', snapshot_id: 'snapshot-001', section_label: 'section-1', excerpt: SENTINEL_EXCERPT }],
      ...inputExtras,
    },
    ...(classification === undefined ? {} : { context: { data_classification: classification as never } }),
  };
}

function profileWith(privacy: PrivacyProfileDeclaration, overrides: Partial<ExecutionProfile> = {}): ExecutionProfile {
  return {
    profile_id: 'test.gateway-privacy' as ExecutionProfileId,
    capability_id: 'evidence.extraction.normative_claims' as never,
    provider_id: 'primary' as never,
    model_id: 'fixture' as never,
    mode: 'replay',
    lifecycle_status: 'candidate',
    enabled: true,
    contract_version: '1.1.0',
    configuration: { timeout_ms: 120_000, response_format: 'json' },
    eligibility: { privacy_compatibility: 'declared_not_enforced', budget_class: 'development', evaluation_status: 'fixture_verified' },
    privacy,
    ...overrides,
  } as ExecutionProfile;
}

interface RecordingAdapter extends ProviderAdapter {
  calls: number;
  seen: ProviderExecutionRequest[];
}
function recordingAdapter(provider: string): RecordingAdapter {
  const adapter: RecordingAdapter = {
    provider_id: provider as never,
    calls: 0,
    seen: [],
    supports: () => true,
    execute: async req => {
      adapter.calls += 1;
      adapter.seen.push(req);
      return { status: 'succeeded' as const, request_id: req.request_id, content: successFixture.content, duration_ms: 1 };
    },
  };
  return adapter;
}
function hangingAdapter(provider: string): RecordingAdapter {
  const adapter: RecordingAdapter = {
    provider_id: provider as never,
    calls: 0,
    seen: [],
    supports: () => true,
    execute: (req, _profile, context) => {
      adapter.calls += 1;
      adapter.seen.push(req);
      return new Promise((_resolve, reject) => {
        context.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      });
    },
  };
  return adapter;
}

function gateway(profile: ExecutionProfile, adapters: readonly ProviderAdapter[], enforcer?: PrivacyEnforcer) {
  const registry = new ProviderAdapterRegistry();
  for (const adapter of adapters) registry.registerProviderAdapter(adapter);
  return new MultiProviderGateway({
    registry,
    profileResolver: () => profile,
    clock: (() => { let n = 0; return () => new Date(NOW.getTime() + n++ * 10); })(),
    executionId: () => 'execution-privacy-001',
    privacyEnforcer: enforcer ?? new PrivacyEnforcer({ zdrEvidence: evidenceStore, clock: () => NOW }),
  });
}

async function expectNoWait<T>(work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('gateway waited on a timer instead of failing immediately')), 250);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const FORBIDDEN_AUDIT_CONTENT = /SENTINEL|excerpt|prompt|messages|api[_-]?key|secret|bearer|authorization|reviewer|raw/i;

describe('AI-73 gateway privacy integration', () => {
  it('blocks a missing classification without invoking the adapter or starting the timeout', async () => {
    const primary = hangingAdapter('primary');
    const bystander = recordingAdapter('bystander');
    const outcome = await expectNoWait(
      gateway(profileWith(LOCAL_REPLAY_PRIVACY), [primary, bystander]).execute({
        capability_request: request(undefined),
        execution_profile_id: 'x',
      })
    );
    assert.equal(primary.calls, 0);
    assert.equal(bystander.calls, 0);
    assert.equal(outcome.result.status, 'blocked');
    assert.equal(outcome.result.error?.category, 'contract');
    assert.equal(outcome.result.error?.code, 'INVALID_REQUEST');
    assert.equal(outcome.audit.error_code, 'PRIVACY_BLOCKED');
    assert.equal(outcome.audit.usage, undefined);
    assert.ok(outcome.privacy_audit);
    assert.equal(outcome.privacy_audit?.reason_code, 'DATA_CLASSIFICATION_REQUIRED');
  });

  it('blocks an unknown classification as a contract fault before any adapter work', async () => {
    // The AI-71 request validator already rejects unknown classification
    // enum values; the privacy enforcer independently fails closed on
    // them too (covered in tests/privacy/privacy-enforcer.test.ts).
    const primary = recordingAdapter('primary');
    const outcome = await gateway(profileWith(LOCAL_REPLAY_PRIVACY), [primary]).execute({
      capability_request: request('top_secret'),
      execution_profile_id: 'x',
    });
    assert.equal(primary.calls, 0);
    assert.equal(outcome.result.status, 'blocked');
    assert.equal(outcome.result.error?.category, 'contract');
    assert.equal(outcome.result.error?.code, 'INVALID_REQUEST');
    assert.equal(outcome.audit.usage, undefined);
  });

  it('blocks a policy violation with POLICY_BLOCKED, no usage, no fallback, no retry', async () => {
    const primary = hangingAdapter('primary');
    const bystander = recordingAdapter('bystander');
    // restricted on an internal-max replay profile is privacy-incompatible.
    const outcome = await expectNoWait(
      gateway(profileWith(LOCAL_REPLAY_PRIVACY), [primary, bystander]).execute({
        capability_request: request('restricted'),
        execution_profile_id: 'x',
      })
    );
    assert.equal(primary.calls, 0);
    assert.equal(bystander.calls, 0);
    assert.equal(outcome.result.status, 'blocked');
    assert.equal(outcome.result.error?.category, 'policy');
    assert.equal(outcome.result.error?.code, 'POLICY_BLOCKED');
    assert.equal(outcome.audit.usage, undefined);
    assert.equal(outcome.privacy_audit?.reason_code, 'PROFILE_PRIVACY_INCOMPATIBLE');
  });

  it('executes a privacy-cleared request through exactly one explicit adapter', async () => {
    const primary = recordingAdapter('primary');
    const bystander = recordingAdapter('bystander');
    const outcome = await gateway(profileWith(LOCAL_REPLAY_PRIVACY), [primary, bystander]).execute({
      capability_request: request('public'),
      execution_profile_id: 'x',
    });
    assert.equal(outcome.result.status, 'succeeded');
    assert.equal(primary.calls, 1);
    assert.equal(bystander.calls, 0);
    assert.ok(outcome.privacy_audit);
    assert.equal(outcome.privacy_audit?.decision, 'allowed');
    assert.equal(outcome.privacy_audit?.reason_code, 'PRIVACY_CLEARED');
  });

  it('redacts before mapping and before adapter invocation: originals never reach either', async () => {
    // Test-owned policy: the excerpt itself is hashed for internal data,
    // so the sentinel must be absent from the mapped provider messages.
    const catalog = new PrivacyPolicyCatalog({
      schema_version: '1.0.0',
      policies: [
        {
          policy_id: 'privacy.test.gateway-redaction.v1',
          schema_version: '1.0.0',
          capability_ids: ['evidence.extraction.normative_claims'],
          classifications: ['internal'],
          allowed_execution_modes: ['replay', 'live'],
          zdr_requirement: 'not_required',
          retention_requirement: { allowed_retention_behaviors: ['none', 'ephemeral_memory', 'bounded_local_fixture'] },
          redaction_rules: [
            { path: 'input.evidence_refs[].excerpt', action: 'hash_identifier', presence: 'required', covers: ['supplier_names', 'prices', 'bank_data', 'broker_pii'] },
            { path: 'input.contact_email', action: 'hash_identifier', presence: 'optional' },
          ],
          decision: 'require_redaction',
          priority: 100,
          reason_code: 'REDACTION_REQUIRED',
          human_review_required: false,
        },
      ],
    });
    const primary = recordingAdapter('primary');
    const enforcer = new PrivacyEnforcer({ policyCatalog: catalog, zdrEvidence: evidenceStore, clock: () => NOW });
    const outcome = await gateway(profileWith(LOCAL_REPLAY_PRIVACY), [primary], enforcer).execute({
      capability_request: request('internal', { contact_email: SENTINEL_EMAIL }),
      execution_profile_id: 'x',
    });
    assert.equal(outcome.result.status, 'succeeded');
    assert.equal(primary.calls, 1);
    const mapped = JSON.stringify(primary.seen[0]);
    assert.doesNotMatch(mapped, new RegExp(SENTINEL_EXCERPT));
    assert.doesNotMatch(mapped, new RegExp(SENTINEL_EMAIL));
    assert.match(mapped, /redacted:sha256:[a-f0-9]{64}/);
    assert.equal(outcome.privacy_audit?.redaction_counts.hashed, 1 + 1);
  });

  it('keeps sentinels out of errors, privacy audits, and execution audits when blocked', async () => {
    const primary = recordingAdapter('primary');
    const outcome = await gateway(profileWith(LOCAL_REPLAY_PRIVACY), [primary]).execute({
      capability_request: request('internal', { contact_email: SENTINEL_EMAIL, raw_document_text: 'SENTINEL-RAW-DOCUMENT' }),
      execution_profile_id: 'x',
    });
    assert.equal(primary.calls, 0);
    assert.equal(outcome.result.status, 'blocked');
    const serialized = JSON.stringify(outcome);
    assert.doesNotMatch(serialized, /SENTINEL/);
    assert.doesNotMatch(serialized, new RegExp(SENTINEL_EMAIL));
    assert.doesNotMatch(JSON.stringify(outcome.audit), FORBIDDEN_AUDIT_CONTENT);
    assert.deepEqual(assertPrivacyAuditMetadataOnly(outcome.privacy_audit), []);
  });

  it('allows a regulated request through a verified-ZDR test profile and records the evidence', async () => {
    const primary = recordingAdapter('primary');
    const regulatedProfile = profileWith(
      {
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
      },
      { mode: 'live', profile_id: 'test.regulated.local.v1' as ExecutionProfileId }
    );
    const outcome = await gateway(regulatedProfile, [primary]).execute({
      capability_request: request('regulated'),
      execution_profile_id: 'test.regulated.local.v1',
    });
    assert.equal(outcome.result.status, 'succeeded');
    assert.equal(primary.calls, 1);
    assert.equal(outcome.privacy_audit?.zdr_evidence_id, 'zdr-evidence.test-local-regulated.v1');
    assert.ok(outcome.privacy_audit?.required_actions.includes('zdr_verified'));
    assert.ok(outcome.privacy_audit?.required_actions.includes('human_review_required'));
    // Downstream governance is unchanged: still review-gated.
    assert.equal(outcome.result.governance.downstream_allowed, false);
    assert.equal(outcome.result.governance.human_review_required, true);
  });

  it('keeps privacy enforcement ahead of provider availability', async () => {
    // No adapter is registered at all: a privacy-blocked request still
    // reports the privacy block, never UNKNOWN_PROVIDER.
    const registry = new ProviderAdapterRegistry();
    const gatewayWithoutAdapters = new MultiProviderGateway({
      registry,
      profileResolver: () => profileWith(LOCAL_REPLAY_PRIVACY),
      clock: () => NOW,
      executionId: () => 'execution-privacy-002',
      privacyEnforcer: new PrivacyEnforcer({ zdrEvidence: evidenceStore, clock: () => NOW }),
    });
    const outcome = await gatewayWithoutAdapters.execute({
      capability_request: request(undefined),
      execution_profile_id: 'x',
    });
    assert.equal(outcome.audit.error_code, 'PRIVACY_BLOCKED');
    assert.equal(outcome.privacy_audit?.reason_code, 'DATA_CLASSIFICATION_REQUIRED');
  });

  it('emits no privacy audit for requests rejected before privacy enforcement', async () => {
    const primary = recordingAdapter('primary');
    const outcome = await gateway(profileWith(LOCAL_REPLAY_PRIVACY), [primary]).execute({
      capability_request: { ...request('public'), request_id: '' } as never,
      execution_profile_id: 'x',
    });
    assert.equal(outcome.result.error?.code, 'INVALID_REQUEST');
    assert.equal(outcome.privacy_audit, undefined);
    assert.equal(primary.calls, 0);
  });

  it('keeps replay success deterministic and audit metadata-only end to end', async () => {
    const run = () =>
      gateway(profileWith(LOCAL_REPLAY_PRIVACY), [recordingAdapter('primary')]).execute({
        capability_request: request('public'),
        execution_profile_id: 'x',
      });
    const a = await run();
    const b = await run();
    assert.deepEqual(a, b);
    assert.doesNotMatch(JSON.stringify(a.audit), FORBIDDEN_AUDIT_CONTENT);
    assert.deepEqual(assertPrivacyAuditMetadataOnly(a.privacy_audit), []);
  });
});

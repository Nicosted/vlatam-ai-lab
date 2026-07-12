import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CapabilityRequest } from '../../src/capabilities/index.js';
import type { ExecutionProfile } from '../../src/execution/execution-profile.js';
import { MultiProviderGateway } from '../../src/execution/multi-provider-gateway.js';
import { ProviderAdapterRegistry } from '../../src/providers/adapter-registry.js';
import type { ProviderAdapter } from '../../src/providers/provider-adapter.js';

const request: CapabilityRequest = { request_id: 'request-hardening-001', capability_id: 'evidence.extraction.normative_claims' as never, schema_version: '1.0.0', input: { packet_id: 'packet-hardening-001', evidence_refs: [{ source_id: 'source-001', snapshot_id: 'snapshot-001', section_label: 'section-1', excerpt: 'Synthetic evidence only.' }] } };
const profileFor = (provider: string, timeout_ms = 120_000): ExecutionProfile => ({ profile_id: 'test.hardening' as never, capability_id: request.capability_id, provider_id: provider as never, model_id: 'fixture' as never, mode: 'replay', lifecycle_status: 'candidate', enabled: true, contract_version: '1.0.0', configuration: { timeout_ms, response_format: 'json' }, eligibility: { privacy_compatibility: 'declared_not_enforced', budget_class: 'development', evaluation_status: 'fixture_verified' }, fixture_id: 'normative-claims-success' });

interface CountingAdapter extends ProviderAdapter { calls: number; sawAbort: boolean; }
// Deterministic fake adapter: counts invocations and settles only when the gateway-provided signal aborts.
function hangingAdapter(provider: string): CountingAdapter {
  const adapter: CountingAdapter = {
    provider_id: provider as never, calls: 0, sawAbort: false,
    supports: () => true,
    execute: (_req, _profile, context) => { adapter.calls += 1; return new Promise((_resolve, reject) => { context.signal.addEventListener('abort', () => { adapter.sawAbort = true; reject(new DOMException('The operation was aborted.', 'AbortError')); }, { once: true }); }); },
  };
  return adapter;
}
function countingAdapter(provider: string): CountingAdapter {
  const adapter: CountingAdapter = { provider_id: provider as never, calls: 0, sawAbort: false, supports: () => true, execute: async () => { adapter.calls += 1; return { status: 'failed' as const, request_id: request.request_id, duration_ms: 1 }; } };
  return adapter;
}
function gateway(profile: ExecutionProfile, adapters: readonly ProviderAdapter[]) {
  const registry = new ProviderAdapterRegistry();
  for (const adapter of adapters) registry.registerProviderAdapter(adapter);
  return new MultiProviderGateway({ registry, profileResolver: () => profile, clock: (() => { let n = 0; return () => new Date(n++ * 10); })(), executionId: () => 'execution-hardening-001' });
}
async function expectNoWait<T>(work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try { return await Promise.race([work, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('gateway waited on a timer instead of failing immediately')), 250); })]); }
  finally { clearTimeout(timer); }
}
const FORBIDDEN_AUDIT_CONTENT = /Synthetic evidence|excerpt|prompt|messages|api_key|secret|bearer|authorization|reviewer|raw/i;

describe('AI-72.1 gateway hardening', () => {
  describe('invalid request behavior', () => {
    it('maps a malformed request to a blocked contract INVALID_REQUEST result', async () => {
      const adapter = countingAdapter('primary');
      const malformed = { ...request, schema_version: 'not-a-version' } as never;
      const outcome = await gateway(profileFor('primary'), [adapter]).execute({ capability_request: malformed, execution_profile_id: 'x' });
      assert.equal(outcome.result.status, 'blocked');
      assert.equal(outcome.result.error?.category, 'contract');
      assert.equal(outcome.result.error?.code, 'INVALID_REQUEST');
      assert.equal(outcome.result.error?.message, 'The capability request failed contract validation.');
      assert.equal(outcome.result.governance.downstream_allowed, false);
      assert.equal(outcome.audit.error_code, 'REQUEST_SCHEMA_INVALID');
      assert.equal(outcome.result.request_id, 'request-hardening-001');
      assert.equal(outcome.result.capability_id, 'evidence.extraction.normative_claims');
    });
    it('never invokes the adapter for a malformed request', async () => {
      const adapter = countingAdapter('primary');
      await gateway(profileFor('primary'), [adapter]).execute({ capability_request: { ...request, request_id: '' } as never, execution_profile_id: 'x' });
      assert.equal(adapter.calls, 0);
    });
    it('does not report malformed requests as output or provider failures', async () => {
      const outcome = await gateway(profileFor('primary'), [countingAdapter('primary')]).execute({ capability_request: { ...request, input: undefined } as never, execution_profile_id: 'x' });
      assert.notEqual(outcome.audit.error_code, 'OUTPUT_SCHEMA_INVALID');
      assert.notEqual(outcome.audit.error_code, 'PROVIDER_RESPONSE_INVALID');
      assert.notEqual(outcome.result.error?.code, 'INVALID_RESULT');
      assert.notEqual(outcome.result.error?.code, 'PROVIDER_ERROR');
      assert.equal(outcome.result.error?.code, 'INVALID_REQUEST');
    });
    it('handles a non-object request without throwing or leaking', async () => {
      const outcome = await gateway(profileFor('primary'), [countingAdapter('primary')]).execute({ capability_request: null as never, execution_profile_id: 'x' });
      assert.equal(outcome.result.status, 'blocked');
      assert.equal(outcome.result.error?.code, 'INVALID_REQUEST');
      assert.equal(outcome.result.request_id, 'unknown');
      assert.doesNotMatch(JSON.stringify(outcome), /must be|semver|forbidden/i);
    });
    it('maps malformed capability input to INVALID_REQUEST without invoking the adapter', async () => {
      const adapter = countingAdapter('primary');
      const badInput = { ...request, input: { packet_id: 42, evidence_refs: [] } } as never;
      const outcome = await gateway(profileFor('primary'), [adapter]).execute({ capability_request: badInput, execution_profile_id: 'x' });
      assert.equal(adapter.calls, 0);
      assert.equal(outcome.audit.error_code, 'REQUEST_SCHEMA_INVALID');
      assert.equal(outcome.result.error?.code, 'INVALID_REQUEST');
      assert.equal(outcome.result.status, 'blocked');
    });
    it('keeps malformed-request audits payload-free with no adapter usage', async () => {
      const outcome = await gateway(profileFor('primary'), [countingAdapter('primary')]).execute({ capability_request: { ...request, request_id: '' } as never, execution_profile_id: 'x' });
      assert.equal(outcome.audit.usage, undefined);
      assert.doesNotMatch(JSON.stringify(outcome.audit), FORBIDDEN_AUDIT_CONTENT);
    });
  });

  describe('pre-aborted caller signals', () => {
    it('fails immediately with EXECUTION_ABORTED and never invokes the adapter', async () => {
      const adapter = countingAdapter('primary');
      const controller = new AbortController(); controller.abort();
      const outcome = await expectNoWait(gateway(profileFor('primary'), [adapter]).execute({ capability_request: request, execution_profile_id: 'x', signal: controller.signal }));
      assert.equal(adapter.calls, 0);
      assert.equal(outcome.audit.error_code, 'EXECUTION_ABORTED');
      assert.equal(outcome.result.status, 'failed');
      assert.equal(outcome.result.governance.downstream_allowed, false);
      assert.equal(outcome.audit.usage, undefined);
      assert.doesNotMatch(JSON.stringify(outcome.audit), FORBIDDEN_AUDIT_CONTENT);
    });
  });

  describe('caller abort versus gateway timeout', () => {
    it('labels a caller abort during adapter execution as EXECUTION_ABORTED, not PROVIDER_TIMEOUT', async () => {
      const adapter = hangingAdapter('primary');
      const controller = new AbortController();
      const pending = gateway(profileFor('primary'), [adapter]).execute({ capability_request: request, execution_profile_id: 'x', signal: controller.signal });
      controller.abort();
      const outcome = await pending;
      assert.equal(adapter.sawAbort, true);
      assert.equal(outcome.audit.error_code, 'EXECUTION_ABORTED');
      assert.notEqual(outcome.audit.error_code, 'PROVIDER_TIMEOUT');
      assert.notEqual(outcome.result.status, 'succeeded');
    });
    it('labels a gateway timeout as PROVIDER_TIMEOUT, not EXECUTION_ABORTED', async () => {
      const adapter = hangingAdapter('primary');
      const outcome = await gateway(profileFor('primary', 10), [adapter]).execute({ capability_request: request, execution_profile_id: 'x' });
      assert.equal(adapter.sawAbort, true);
      assert.equal(outcome.audit.error_code, 'PROVIDER_TIMEOUT');
      assert.notEqual(outcome.audit.error_code, 'EXECUTION_ABORTED');
      assert.equal(outcome.result.error?.code, 'TIMEOUT');
    });
  });

  describe('no alternate execution', () => {
    it('invokes no alternate adapter and no retry for invalid, pre-aborted, and timeout paths', async () => {
      const bystander = countingAdapter('bystander');
      // Invalid request: primary adapter untouched.
      const invalidPrimary = countingAdapter('primary');
      await gateway(profileFor('primary'), [invalidPrimary, bystander]).execute({ capability_request: { ...request, request_id: '' } as never, execution_profile_id: 'x' });
      assert.equal(invalidPrimary.calls, 0);
      // Pre-aborted signal: primary adapter untouched.
      const abortedPrimary = countingAdapter('primary');
      const controller = new AbortController(); controller.abort();
      await gateway(profileFor('primary'), [abortedPrimary, bystander]).execute({ capability_request: request, execution_profile_id: 'x', signal: controller.signal });
      assert.equal(abortedPrimary.calls, 0);
      // Timeout: exactly one invocation of the explicit adapter, no retry.
      const timeoutPrimary = hangingAdapter('primary');
      await gateway(profileFor('primary', 10), [timeoutPrimary, bystander]).execute({ capability_request: request, execution_profile_id: 'x' });
      assert.equal(timeoutPrimary.calls, 1);
      assert.equal(bystander.calls, 0);
    });
  });

  describe('audit safety', () => {
    it('keeps audit records for all corrected failure paths metadata-only', async () => {
      const controller = new AbortController(); controller.abort();
      const outcomes = [
        await gateway(profileFor('primary'), [countingAdapter('primary')]).execute({ capability_request: { ...request, schema_version: 'nope' } as never, execution_profile_id: 'x' }),
        await gateway(profileFor('primary'), [countingAdapter('primary')]).execute({ capability_request: request, execution_profile_id: 'x', signal: controller.signal }),
        await gateway(profileFor('primary', 10), [hangingAdapter('primary')]).execute({ capability_request: request, execution_profile_id: 'x' }),
      ];
      for (const outcome of outcomes) {
        assert.doesNotMatch(JSON.stringify(outcome.audit), FORBIDDEN_AUDIT_CONTENT);
        assert.equal(outcome.result.governance.downstream_allowed, false);
      }
    });
  });
});

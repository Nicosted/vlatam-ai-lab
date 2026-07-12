import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ExecutionProfile } from '../../src/execution/execution-profile.js';
import { createDashScopeAdapter, createDeepSeekAdapter } from '../../src/providers/openai-compatible-adapter.js';
import type { ProviderExecutionRequest } from '../../src/providers/provider-adapter.js';
import { LIVE_UNKNOWN_PRIVACY } from '../helpers/privacy.js';

const request: ProviderExecutionRequest = { request_id: 'r', structured_output: true, messages: [{ role: 'user', content: 'safe fixture' }] };
const profile = (provider: string): ExecutionProfile => ({ profile_id: 'test.live' as never, capability_id: 'evidence.extraction.normative_claims' as never, provider_id: provider as never, model_id: 'test-model' as never, mode: 'live', lifecycle_status: 'candidate', enabled: true, contract_version: '1.0.0', configuration: { timeout_ms: 1000, response_format: 'json' }, eligibility: { privacy_compatibility: 'declared_not_enforced', budget_class: 'development', evaluation_status: 'not_evaluated' }, privacy: LIVE_UNKNOWN_PRIVACY });
const context = { execution_id: 'e', signal: new AbortController().signal, timeout_ms: 1000 };

describe('AI-72 live adapters', () => {
  it('are disabled by default without making a call', async () => { for (const adapter of [createDeepSeekAdapter({}), createDashScopeAdapter({})]) { const result = await adapter.execute(request, profile(adapter.provider_id), context); assert.equal(result.status, 'blocked'); assert.equal(result.error?.code, 'LIVE_EXECUTION_DISABLED'); } });
  it('fail closed when explicitly enabled without credentials', async () => { const adapter = createDeepSeekAdapter({ AI_LAB_LIVE_PROVIDER_EXECUTION_ENABLED: 'true', AI_LAB_DEEPSEEK_ENABLED: 'true' }); const result = await adapter.execute(request, profile(adapter.provider_id), context); assert.equal(result.status, 'blocked'); assert.equal(result.error?.code, 'CREDENTIALS_UNAVAILABLE'); assert.equal('content' in result, false); });
});

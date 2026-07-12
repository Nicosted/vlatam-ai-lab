import success from '../../snapshots/execution/normative-claims-success.json' with { type: 'json' };
import malformed from '../../snapshots/execution/normative-claims-malformed.json' with { type: 'json' };
import type { ExecutionProfile, ProviderId } from '../execution/execution-profile.js';
import { executionError } from '../execution/errors.js';
import type { ProviderAdapter, ProviderExecutionContext, ProviderExecutionRequest, ProviderExecutionResult } from './provider-adapter.js';

type Fixture = { request_id: string; content?: string; usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number }; finish_reason?: 'stop'; duration_ms: number };
const FIXTURES: Readonly<Record<string, Fixture>> = { 'normative-claims-success': success as Fixture, 'malformed-response': malformed as Fixture };

export class ReplayProviderAdapter implements ProviderAdapter {
  readonly provider_id = 'replay' as ProviderId;
  supports(profile: ExecutionProfile): boolean { return profile.provider_id === this.provider_id && profile.mode === 'replay' && typeof profile.fixture_id === 'string'; }
  async execute(request: ProviderExecutionRequest, profile: ExecutionProfile, context: ProviderExecutionContext): Promise<ProviderExecutionResult> {
    if (context.signal.aborted) return { status: 'failed', request_id: request.request_id, duration_ms: 0, error: executionError('EXECUTION_ABORTED') };
    if (profile.fixture_id === 'timeout') return { status: 'failed', request_id: request.request_id, duration_ms: context.timeout_ms, error: executionError('PROVIDER_TIMEOUT') };
    if (profile.fixture_id === 'provider-error') return { status: 'failed', request_id: request.request_id, duration_ms: 1, error: executionError('PROVIDER_UNAVAILABLE') };
    if (profile.fixture_id === 'blocked') return { status: 'blocked', request_id: request.request_id, duration_ms: 1, finish_reason: 'blocked', error: executionError('PROVIDER_RESPONSE_INVALID') };
    const fixture = profile.fixture_id ? FIXTURES[profile.fixture_id] : undefined;
    if (!fixture) return { status: 'failed', request_id: request.request_id, duration_ms: 0, error: executionError('PROVIDER_RESPONSE_INVALID') };
    return { ...fixture, request_id: request.request_id, status: 'succeeded' };
  }
}

import type { ExecutionProfile, ProviderId } from '../execution/execution-profile.js';
import type { ExecutionError } from '../execution/errors.js';

export interface ProviderMessage { readonly role: 'system' | 'user'; readonly content: string; }
export interface ProviderExecutionRequest { readonly request_id: string; readonly messages: readonly ProviderMessage[]; readonly structured_output: true; }
export interface ProviderExecutionContext { readonly execution_id: string; readonly signal: AbortSignal; readonly timeout_ms: number; }
export interface ProviderUsage { readonly input_tokens?: number | undefined; readonly output_tokens?: number | undefined; readonly total_tokens?: number | undefined; }
export interface ProviderExecutionResult {
  readonly status: 'succeeded' | 'failed' | 'blocked';
  readonly request_id: string;
  readonly content?: string;
  readonly usage?: ProviderUsage;
  readonly finish_reason?: 'stop' | 'length' | 'blocked' | 'unknown';
  readonly duration_ms: number;
  readonly error?: ExecutionError;
}
export interface ProviderAdapter {
  readonly provider_id: ProviderId;
  supports(profile: ExecutionProfile): boolean;
  execute(request: ProviderExecutionRequest, profile: ExecutionProfile, context: ProviderExecutionContext): Promise<ProviderExecutionResult>;
}

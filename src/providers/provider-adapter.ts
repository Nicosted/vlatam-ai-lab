import type {
  ExecutionProfile,
  ProviderId,
} from "../execution/execution-profile.js";
import type { ExecutionError } from "../execution/errors.js";

export interface ProviderMessage {
  readonly role: "system" | "user";
  readonly content: string;
}
export interface ProviderExecutionRequest {
  readonly request_id: string;
  readonly messages: readonly ProviderMessage[];
  readonly structured_output: true;
}
export interface ProviderExecutionContext {
  readonly execution_id: string;
  readonly signal: AbortSignal;
  readonly timeout_ms: number;
  /** Identity of the reviewed pricing contract already bound by the
   * gateway before reservation. Metadata only — adapters may verify
   * compatibility but never resolve pricing from a live response. */
  readonly pricing_contract?:
    | {
        readonly pricing_id: string;
        readonly pricing_contract_version: string;
      }
    | undefined;
}
export interface ProviderUsage {
  readonly input_tokens?: number | undefined;
  readonly output_tokens?: number | undefined;
  readonly total_tokens?: number | undefined;
  readonly cached_input_tokens?: number | undefined;
  readonly cache_write_input_tokens?: number | undefined;
  readonly reasoning_tokens?: number | undefined;
  /** Exact provider-reported decimal metadata only; never estimated. */
  readonly reported_cost_usd?: string | undefined;
  readonly source?: "provider_reported" | "fixture" | "unavailable";
  readonly fixture_origin?: "synthetic" | "sanitized_recorded";
}
export interface ProviderExecutionResult {
  readonly status: "succeeded" | "failed" | "blocked";
  readonly request_id: string;
  readonly content?: string;
  readonly usage?: ProviderUsage | undefined;
  readonly finish_reason?: "stop" | "length" | "blocked" | "unknown";
  readonly duration_ms: number;
  readonly error?: ExecutionError;
}
export interface ProviderAdapter {
  readonly provider_id: ProviderId;
  supports(profile: ExecutionProfile): boolean;
  execute(
    request: ProviderExecutionRequest,
    profile: ExecutionProfile,
    context: ProviderExecutionContext,
  ): Promise<ProviderExecutionResult>;
}

import type { OpenRouterSecretProvider } from "./openrouter-secret-provider.js";
import { resolveOpenRouterSecret } from "./openrouter-secret-provider.js";

export const OPENROUTER_SANDBOX_PREFLIGHT_OUTCOMES = [
  "invalid_configuration",
  "blocked",
  "approval_required",
  "secret_unavailable",
  "kill_switch_active",
  "budget_unavailable",
  "ready_for_manual_sandbox_call",
] as const;
export type OpenRouterSandboxPreflightOutcome =
  (typeof OPENROUTER_SANDBOX_PREFLIGHT_OUTCOMES)[number];

export interface OpenRouterRuntimeBindings {
  readonly proposal_hash: string;
  readonly dossier_hash: string;
  readonly evidence_pack_hash: string;
  readonly profile_hash: string;
  readonly route_hash: string;
  readonly model_hash: string;
  readonly exact_policy_hash: string | null;
}

export interface OpenRouterSandboxRuntimeConfig {
  readonly runtime_contract_version: "1.0.0";
  readonly configuration_id: string;
  readonly adapter: {
    readonly identity: "openrouter.transport.chat-completions";
    readonly version: "1.0.0";
    readonly enabled: boolean;
    readonly hash: string;
  };
  readonly provider_id: "openrouter";
  readonly endpoint_id: "openrouter-api-v1";
  readonly exact_model: "minimax/minimax-m2.7";
  readonly intended_provider_order: readonly ["minimax"];
  readonly fallback_enabled: false;
  readonly automatic_retries: 0;
  readonly timeout_ms: number;
  readonly maximum_input_tokens: number;
  readonly maximum_output_tokens: number;
  readonly maximum_requests: number;
  readonly maximum_total_spend_usd: "0.05";
  readonly manual_only: true;
  readonly require_parameters: true;
  readonly zdr_required: true;
  readonly data_collection: "deny";
  readonly kill_switch: {
    readonly reference: string;
    readonly active: boolean;
    readonly owner: string;
  };
  readonly bindings: OpenRouterRuntimeBindings;
  readonly approval_reference: string;
  readonly approval_state: "pending" | "approved" | "rejected";
  readonly approval_issuer: string | null;
  readonly approval_scope:
    | "sandbox_configuration_proposal_only"
    | "manual_sandbox_execution_exact_hashes";
  readonly approval_expires_at: string | null;
  readonly expires_at: string;
  readonly secret_reference_name: string;
  readonly allowed_test_data_classification:
    | "synthetic"
    | "specifically_approved_non_sensitive";
  readonly readiness_outcome: "blocked" | "eligible";
  readonly proposal_outcome: "blocked" | "eligible_for_configuration";
  readonly exact_routing_status: "unresolved" | "verified";
  readonly privacy_review: "pending" | "approved";
  readonly retention_review: "pending" | "approved";
  readonly training_use_review: "pending" | "approved";
  readonly geography_review: "pending" | "approved";
  readonly zdr_review: "pending" | "approved";
  readonly structured_output_review: "pending" | "approved";
  readonly benchmark_acceptance: "missing" | "approved";
  readonly legal_review: "pending" | "approved";
  readonly security_review: "pending" | "approved";
  readonly model_enabled: boolean;
  readonly route_enabled: boolean;
  readonly profile_enabled: boolean;
  readonly budget_enabled: boolean;
}

export interface OpenRouterKillSwitch {
  evaluate(
    reference: string,
  ): { readonly active: boolean; readonly reference: string } | undefined;
}

export interface OpenRouterSandboxBudgetAvailability {
  available(configurationId: string): boolean;
}

export interface OpenRouterSandboxPreflightOptions {
  readonly config: unknown;
  readonly expected_bindings: OpenRouterRuntimeBindings;
  readonly kill_switch: OpenRouterKillSwitch;
  readonly budget: OpenRouterSandboxBudgetAvailability;
  readonly secret_provider?: OpenRouterSecretProvider;
  readonly resolve_secret: boolean;
  readonly now: Date;
  readonly operator_id: string;
  readonly invocation: "manual" | "automatic";
  readonly test_data_classification:
    | "synthetic"
    | "specifically_approved_non_sensitive"
    | "sensitive";
}

export interface OpenRouterSandboxPreflightResult {
  readonly outcome: OpenRouterSandboxPreflightOutcome;
  readonly reasons: readonly string[];
  readonly configuration_id?: string;
  readonly kill_switch_reference?: string;
}

const HASH = /^[a-f0-9]{64}$/;
const ENV_NAME = /^[A-Z][A-Z0-9_]{2,63}$/;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const sameBindings = (
  left: OpenRouterRuntimeBindings,
  right: OpenRouterRuntimeBindings,
): boolean =>
  (Object.keys(left) as (keyof OpenRouterRuntimeBindings)[]).every(
    (key) => left[key] === right[key],
  );
const iso = (value: unknown): value is string =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

export function validateOpenRouterSandboxRuntimeConfig(
  value: unknown,
): readonly string[] {
  if (!isRecord(value)) return ["configuration_not_object"];
  const c = value as unknown as OpenRouterSandboxRuntimeConfig;
  const reasons: string[] = [];
  if (c.runtime_contract_version !== "1.0.0")
    reasons.push("unsupported_contract_version");
  if (
    !isRecord(c.adapter) ||
    c.adapter.identity !== "openrouter.transport.chat-completions" ||
    c.adapter.version !== "1.0.0" ||
    !HASH.test(String(c.adapter.hash ?? ""))
  )
    reasons.push("adapter_identity_invalid");
  if (
    c.provider_id !== "openrouter" ||
    c.endpoint_id !== "openrouter-api-v1" ||
    c.exact_model !== "minimax/minimax-m2.7" ||
    !Array.isArray(c.intended_provider_order) ||
    c.intended_provider_order.length !== 1 ||
    c.intended_provider_order[0] !== "minimax"
  )
    reasons.push("candidate_identity_invalid");
  if (c.fallback_enabled !== false) reasons.push("fallback_enabled");
  if (c.automatic_retries !== 0) reasons.push("automatic_retries_nonzero");
  if (c.manual_only !== true) reasons.push("manual_only_required");
  if (c.require_parameters !== true) reasons.push("parameters_not_required");
  if (c.zdr_required !== true || c.data_collection !== "deny")
    reasons.push("privacy_controls_invalid");
  if (
    !Number.isSafeInteger(c.timeout_ms) ||
    c.timeout_ms < 1 ||
    c.timeout_ms > 10_000
  )
    reasons.push("timeout_ceiling_exceeded");
  if (
    !Number.isSafeInteger(c.maximum_input_tokens) ||
    c.maximum_input_tokens < 1 ||
    c.maximum_input_tokens > 8_000
  )
    reasons.push("input_token_ceiling_exceeded");
  if (
    !Number.isSafeInteger(c.maximum_output_tokens) ||
    c.maximum_output_tokens < 1 ||
    c.maximum_output_tokens > 2_000
  )
    reasons.push("output_token_ceiling_exceeded");
  if (
    !Number.isSafeInteger(c.maximum_requests) ||
    c.maximum_requests < 1 ||
    c.maximum_requests > 10
  )
    reasons.push("request_ceiling_exceeded");
  if (c.maximum_total_spend_usd !== "0.05")
    reasons.push("spend_ceiling_exceeded");
  if (
    !isRecord(c.bindings) ||
    !Object.values(c.bindings).every(
      (hash) => hash === null || HASH.test(String(hash)),
    )
  )
    reasons.push("integrity_bindings_invalid");
  if (
    !isRecord(c.kill_switch) ||
    typeof c.kill_switch.reference !== "string" ||
    c.kill_switch.reference.trim().length === 0
  )
    reasons.push("kill_switch_reference_missing");
  if (!ENV_NAME.test(String(c.secret_reference_name ?? "")))
    reasons.push("secret_reference_missing");
  if (!iso(c.expires_at)) reasons.push("configuration_expiry_invalid");
  return [...new Set(reasons)].sort();
}

function result(
  outcome: OpenRouterSandboxPreflightOutcome,
  reasons: readonly string[],
  config?: OpenRouterSandboxRuntimeConfig,
  killSwitchReference?: string,
): OpenRouterSandboxPreflightResult {
  return Object.freeze({
    outcome,
    reasons: Object.freeze([...reasons].sort()),
    ...(config === undefined
      ? {}
      : { configuration_id: config.configuration_id }),
    ...(killSwitchReference === undefined
      ? {}
      : { kill_switch_reference: killSwitchReference }),
  });
}

export async function evaluateOpenRouterSandboxPreflight(
  options: OpenRouterSandboxPreflightOptions,
): Promise<OpenRouterSandboxPreflightResult> {
  const invalid = validateOpenRouterSandboxRuntimeConfig(options.config);
  if (invalid.length > 0) return result("invalid_configuration", invalid);
  const c = options.config as OpenRouterSandboxRuntimeConfig;
  if (!sameBindings(c.bindings, options.expected_bindings))
    return result("blocked", ["integrity_hash_mismatch"], c);
  if (options.now.getTime() >= Date.parse(c.expires_at))
    return result("blocked", ["configuration_expired"], c);
  if (
    c.readiness_outcome !== "eligible" ||
    c.proposal_outcome !== "eligible_for_configuration" ||
    c.exact_routing_status !== "verified"
  )
    return result("blocked", ["readiness_or_routing_blocked"], c);
  const pendingReviews = [
    c.privacy_review,
    c.retention_review,
    c.training_use_review,
    c.geography_review,
    c.zdr_review,
    c.structured_output_review,
    c.legal_review,
    c.security_review,
  ].some((review) => review !== "approved");
  if (pendingReviews || c.benchmark_acceptance !== "approved")
    return result("blocked", ["mandatory_review_or_benchmark_pending"], c);
  if (
    options.invocation !== "manual" ||
    options.test_data_classification !== c.allowed_test_data_classification
  )
    return result("blocked", ["invocation_or_test_data_out_of_scope"], c);
  if (
    !c.adapter.enabled ||
    !c.model_enabled ||
    !c.route_enabled ||
    !c.profile_enabled
  )
    return result("blocked", ["governed_component_disabled"], c);
  if (c.bindings.exact_policy_hash === null)
    return result("approval_required", ["exact_policy_hash_missing"], c);
  if (
    c.approval_state !== "approved" ||
    c.approval_scope !== "manual_sandbox_execution_exact_hashes" ||
    c.approval_issuer === null ||
    c.approval_issuer === options.operator_id ||
    c.approval_issuer === "codex.repository.agent" ||
    c.approval_expires_at === null ||
    !iso(c.approval_expires_at) ||
    options.now.getTime() >= Date.parse(c.approval_expires_at)
  )
    return result(
      "approval_required",
      ["approval_missing_expired_self_issued_or_out_of_scope"],
      c,
    );
  const kill = options.kill_switch.evaluate(c.kill_switch.reference);
  if (kill === undefined || kill.reference !== c.kill_switch.reference)
    return result("blocked", ["kill_switch_unavailable"], c);
  if (c.kill_switch.active || kill.active)
    return result(
      "kill_switch_active",
      ["kill_switch_active"],
      c,
      kill.reference,
    );
  if (!c.budget_enabled || !options.budget.available(c.configuration_id))
    return result(
      "budget_unavailable",
      ["budget_unavailable"],
      c,
      kill.reference,
    );
  if (!options.resolve_secret)
    return result("ready_for_manual_sandbox_call", [], c, kill.reference);
  if (options.secret_provider === undefined)
    return result(
      "secret_unavailable",
      ["secret_provider_missing"],
      c,
      kill.reference,
    );
  const secret = await resolveOpenRouterSecret(
    options.secret_provider,
    c.secret_reference_name,
  );
  if (secret === undefined)
    return result(
      "secret_unavailable",
      ["secret_missing_or_blank"],
      c,
      kill.reference,
    );
  return result("ready_for_manual_sandbox_call", [], c, kill.reference);
}

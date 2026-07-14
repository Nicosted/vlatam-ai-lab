import type { CapabilityRequest } from "../capabilities/index.js";
import { validateCapabilityRequest } from "../capabilities/index.js";
import type {
  GatewayInvocation,
  GatewayOutcome,
  MultiProviderGateway,
} from "../execution/multi-provider-gateway.js";
import { parseAccountingUnits } from "../governance/budget-policy.js";
import type {
  AuthorizationConsumeResult,
  AuthorizationConsumptionBinding,
  AuthorizationStateStore,
} from "../handoff/authorization-store.js";
import { validateAuthorizationConsumptionBinding } from "../handoff/authorization-store.js";
import {
  validateOpenRouterAdapterConfig,
  type OpenRouterAdapterConfig,
} from "./openrouter-config.js";
import {
  OPENROUTER_EXACT_EXECUTION_POLICY_CONTRACT_VERSION,
  OPENROUTER_RESOLUTION_AUTHORIZATION_CONTRACT_VERSION,
  computeOpenRouterAuthorizationHash,
  computeOpenRouterExactExecutionPolicyHash,
  type OpenRouterExactExecutionPolicy,
} from "./openrouter-resolution-authorization.js";
import {
  OPENROUTER_MODEL_REGISTRY_CONTRACT_VERSION,
  OPENROUTER_REGISTRY_CANONICALIZATION_VERSION,
  OPENROUTER_ROUTE_REGISTRY_CONTRACT_VERSION,
} from "./openrouter-registry.js";
import { OPENROUTER_ROUTE_RESOLUTION_CONTRACT_VERSION } from "./openrouter-route-resolution.js";

export const OPENROUTER_AUTHORIZED_GATEWAY_CONTRACT_VERSION = "1.0.0" as const;

export type OpenRouterAuthorizedGatewayStatus =
  | "blocked_before_consumption"
  | "consumption_rejected"
  | "blocked_after_consumption"
  | "execution_not_enabled"
  | "invalid_request";

export interface OpenRouterAuthorizedGatewayRequest {
  readonly contract_version: typeof OPENROUTER_AUTHORIZED_GATEWAY_CONTRACT_VERSION;
  readonly policy: OpenRouterExactExecutionPolicy;
  readonly authorization_consumption: {
    readonly authorization_id: string;
    readonly authorization_version: string;
    readonly authorization_token_hash: string;
    readonly decision_hash: string;
  };
  readonly expected_policy_hash: string;
  readonly expected_authorization_hash: string;
  readonly gateway_request: {
    readonly capability_request: CapabilityRequest;
    readonly execution_profile_id: string;
    readonly expected_profile_contract_version: string;
  };
  readonly gateway_request_id: string;
  readonly execution_correlation_id: string;
  readonly audit_correlation_id: string;
  readonly evaluated_at: string;
}

export interface OpenRouterAuthorizedGatewayResult {
  readonly contract_version: typeof OPENROUTER_AUTHORIZED_GATEWAY_CONTRACT_VERSION;
  readonly status: OpenRouterAuthorizedGatewayStatus;
  readonly reason_codes: readonly string[];
  readonly evaluated_at: string | null;
  readonly policy_hash: string | null;
  readonly authorization_id: string | null;
  readonly authorization_version: string | null;
  readonly consumption_outcome: AuthorizationConsumeResult | "not_attempted";
  readonly route_id: string | null;
  readonly model_registry_id: string | null;
  readonly provider_model_id: string | null;
  readonly provider_id: "openrouter" | null;
  readonly execution_profile_id: string | null;
  readonly execution_correlation_id: string | null;
  readonly audit_correlation_id: string | null;
  readonly gateway_decision: {
    readonly status: "not_invoked" | "blocked" | "failed" | "succeeded";
    readonly error_code?: string;
  };
  readonly adapter_disabled_reason:
    | "repository_openrouter_adapter_disabled"
    | null;
}

export interface OpenRouterAuthorizedGatewayOptions {
  readonly authorizationStore: AuthorizationStateStore;
  readonly gateway: Pick<MultiProviderGateway, "executeAuthorized">;
  /** Repository-owned, non-secret configuration. Enablement is forbidden here. */
  readonly adapterConfig: OpenRouterAdapterConfig | undefined;
}

const ID = /^[a-z0-9][a-z0-9._:-]+$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const HASH = /^[a-f0-9]{64}$/;
const REQUEST_KEYS = [
  "contract_version",
  "policy",
  "authorization_consumption",
  "expected_policy_hash",
  "expected_authorization_hash",
  "gateway_request",
  "gateway_request_id",
  "execution_correlation_id",
  "audit_correlation_id",
  "evaluated_at",
] as const;
const CONSUMPTION_KEYS = [
  "authorization_id",
  "authorization_version",
  "authorization_token_hash",
  "decision_hash",
] as const;
const GATEWAY_KEYS = [
  "capability_request",
  "execution_profile_id",
  "expected_profile_contract_version",
] as const;
const POLICY_KEYS = [
  "contract_version",
  "route",
  "execution_profile",
  "authorization",
  "privacy",
  "budget",
  "versions",
  "evidence_ids",
  "reasons",
  "evaluated_at",
  "issued_at",
  "expires_at",
  "execution_correlation_id",
  "audit_correlation_id",
  "policy_hash",
] as const;
const POLICY_CHILD_KEYS = {
  route: [
    "route_id",
    "route_record_id",
    "route_version",
    "route_hash",
    "model_registry_id",
    "model_entry_version",
    "model_entry_hash",
    "provider_id",
    "provider_model_id",
    "upstream_provider_id",
  ],
  execution_profile: ["profile_id", "contract_version"],
  authorization: [
    "authorization_id",
    "authorization_mode",
    "authorizer_role",
    "review_attestation_reference",
    "capability_ids",
    "handoff_policy_id",
    "handoff_policy_version",
    "handoff_policy_hash",
  ],
  privacy: [
    "zdr_required",
    "privacy_decision_id",
    "privacy_policy_id",
    "privacy_policy_version",
    "zdr_evidence_id",
    "zdr_evidence_hash",
  ],
  budget: [
    "policy_id",
    "policy_version",
    "scope_id",
    "currency",
    "accounting_scale",
    "ceiling_accounting_units",
    "estimated_accounting_units",
  ],
  versions: [
    "model_registry_contract_version",
    "route_registry_contract_version",
    "registry_canonicalization_version",
    "resolution_contract_version",
    "resolution_decision_hash",
    "authorization_contract_version",
  ],
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => key in value);
const validInstant = (value: unknown): value is string =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child);
  }
  return value;
};

function safeMetadata(value: unknown) {
  const request = isRecord(value) ? value : {};
  const policy = isRecord(request["policy"]) ? request["policy"] : {};
  const route = isRecord(policy["route"]) ? policy["route"] : {};
  const authorization = isRecord(policy["authorization"])
    ? policy["authorization"]
    : {};
  const profile = isRecord(policy["execution_profile"])
    ? policy["execution_profile"]
    : {};
  const valid = (candidate: unknown, pattern = ID) =>
    typeof candidate === "string" && pattern.test(candidate) ? candidate : null;
  return {
    evaluated_at: validInstant(request["evaluated_at"])
      ? request["evaluated_at"]
      : null,
    policy_hash: valid(policy["policy_hash"], HASH),
    authorization_id: valid(authorization["authorization_id"]),
    authorization_version: valid(
      authorization["handoff_policy_version"],
      SEMVER,
    ),
    route_id: valid(route["route_id"]),
    model_registry_id: valid(route["model_registry_id"]),
    provider_model_id:
      typeof route["provider_model_id"] === "string" &&
      route["provider_model_id"].length > 0
        ? route["provider_model_id"]
        : null,
    provider_id:
      route["provider_id"] === "openrouter" ? ("openrouter" as const) : null,
    execution_profile_id: valid(profile["profile_id"]),
    execution_correlation_id: valid(request["execution_correlation_id"]),
    audit_correlation_id: valid(request["audit_correlation_id"]),
  };
}

function result(
  value: unknown,
  status: OpenRouterAuthorizedGatewayStatus,
  reasonCodes: Iterable<string>,
  consumptionOutcome: OpenRouterAuthorizedGatewayResult["consumption_outcome"],
  gatewayOutcome?: GatewayOutcome,
): OpenRouterAuthorizedGatewayResult {
  const safe = safeMetadata(value);
  const gatewayStatus = gatewayOutcome?.result.status ?? "not_invoked";
  const errorCode = gatewayOutcome?.audit.error_code;
  return deepFreeze({
    contract_version: OPENROUTER_AUTHORIZED_GATEWAY_CONTRACT_VERSION,
    status,
    reason_codes: [...new Set(reasonCodes)].sort(),
    ...safe,
    consumption_outcome: consumptionOutcome,
    gateway_decision: {
      status: gatewayStatus,
      ...(errorCode ? { error_code: errorCode } : {}),
    },
    adapter_disabled_reason:
      status === "execution_not_enabled"
        ? "repository_openrouter_adapter_disabled"
        : null,
  });
}

function validateRequest(value: unknown): readonly string[] {
  if (!isRecord(value) || !exactKeys(value, REQUEST_KEYS))
    return ["request_malformed_or_unknown_fields"];
  const reasons = new Set<string>();
  if (
    value["contract_version"] !== OPENROUTER_AUTHORIZED_GATEWAY_CONTRACT_VERSION
  )
    reasons.add("unsupported_contract_version");
  const consumption = value["authorization_consumption"];
  const gateway = value["gateway_request"];
  if (!isRecord(consumption) || !exactKeys(consumption, CONSUMPTION_KEYS))
    reasons.add("consumption_identity_malformed");
  if (!isRecord(gateway) || !exactKeys(gateway, GATEWAY_KEYS))
    reasons.add("gateway_request_malformed");
  if (!HASH.test(String(value["expected_policy_hash"] ?? "")))
    reasons.add("expected_policy_hash_malformed");
  if (!HASH.test(String(value["expected_authorization_hash"] ?? "")))
    reasons.add("expected_authorization_hash_malformed");
  if (!ID.test(String(value["gateway_request_id"] ?? "")))
    reasons.add("gateway_request_id_malformed");
  if (!ID.test(String(value["execution_correlation_id"] ?? "")))
    reasons.add("execution_correlation_id_malformed");
  if (!ID.test(String(value["audit_correlation_id"] ?? "")))
    reasons.add("audit_correlation_id_malformed");
  if (!validInstant(value["evaluated_at"]))
    reasons.add("evaluation_time_invalid");
  return [...reasons].sort();
}

function validatePolicy(
  request: OpenRouterAuthorizedGatewayRequest,
): readonly string[] {
  const policy = request.policy;
  const reasons = new Set<string>();
  if (!isRecord(policy) || !exactKeys(policy, POLICY_KEYS))
    return ["policy_malformed_or_unknown_fields"];
  for (const [key, keys] of Object.entries(POLICY_CHILD_KEYS)) {
    const child = policy[key as keyof OpenRouterExactExecutionPolicy];
    if (!isRecord(child) || !exactKeys(child, keys))
      return ["policy_malformed_or_unknown_fields"];
  }
  if (
    policy.contract_version !==
    OPENROUTER_EXACT_EXECUTION_POLICY_CONTRACT_VERSION
  )
    reasons.add("policy_contract_version_unsupported");
  const withoutHash = Object.fromEntries(
    Object.entries(policy).filter(([key]) => key !== "policy_hash"),
  );
  if (
    policy.policy_hash !==
    computeOpenRouterExactExecutionPolicyHash(withoutHash)
  )
    reasons.add("policy_hash_invalid");
  if (request.expected_policy_hash !== policy.policy_hash)
    reasons.add("expected_policy_hash_mismatch");
  if (
    request.expected_authorization_hash !==
    computeOpenRouterAuthorizationHash(policy.authorization)
  )
    reasons.add("expected_authorization_hash_mismatch");

  const route = policy.route;
  if (
    route.provider_id !== "openrouter" ||
    !ID.test(route.route_id) ||
    !ID.test(route.route_record_id) ||
    !SEMVER.test(route.route_version) ||
    !HASH.test(route.route_hash) ||
    !ID.test(route.model_registry_id) ||
    !SEMVER.test(route.model_entry_version) ||
    !HASH.test(route.model_entry_hash) ||
    typeof route.provider_model_id !== "string" ||
    !route.provider_model_id.includes("/") ||
    route.provider_model_id.startsWith("openrouter/") ||
    !ID.test(route.upstream_provider_id)
  )
    reasons.add("exact_route_identity_invalid");
  if (
    !ID.test(policy.execution_profile.profile_id) ||
    !SEMVER.test(policy.execution_profile.contract_version) ||
    policy.execution_profile.profile_id !==
      request.gateway_request.execution_profile_id ||
    policy.execution_profile.contract_version !==
      request.gateway_request.expected_profile_contract_version
  )
    reasons.add("execution_profile_identity_mismatch");
  const authorization = policy.authorization;
  const consumption = request.authorization_consumption;
  if (
    authorization.authorization_id !== consumption.authorization_id ||
    authorization.handoff_policy_version !==
      consumption.authorization_version ||
    authorization.handoff_policy_hash !==
      consumption.authorization_token_hash ||
    policy.versions.resolution_decision_hash !== consumption.decision_hash ||
    authorization.authorization_mode !== "single_use"
  )
    reasons.add("authorization_consumption_identity_mismatch");
  if (!validateAuthorizationConsumptionBinding(consumptionBinding(request)))
    reasons.add("authorization_consumption_binding_invalid");
  if (
    !authorization.capability_ids.includes(
      request.gateway_request.capability_request.capability_id,
    )
  )
    reasons.add("authorization_scope_mismatch");
  if (
    policy.privacy.zdr_required !== true ||
    !ID.test(policy.privacy.privacy_decision_id) ||
    !ID.test(policy.privacy.privacy_policy_id) ||
    !SEMVER.test(policy.privacy.privacy_policy_version) ||
    !ID.test(policy.privacy.zdr_evidence_id) ||
    !HASH.test(policy.privacy.zdr_evidence_hash)
  )
    reasons.add("privacy_zdr_constraint_invalid");
  try {
    if (
      !ID.test(policy.budget.policy_id) ||
      !SEMVER.test(policy.budget.policy_version) ||
      !ID.test(policy.budget.scope_id) ||
      !/^[A-Z]{3}$/.test(policy.budget.currency) ||
      parseAccountingUnits(policy.budget.estimated_accounting_units) >
        parseAccountingUnits(policy.budget.ceiling_accounting_units)
    )
      reasons.add("budget_constraint_invalid");
  } catch {
    reasons.add("budget_constraint_invalid");
  }
  if (
    policy.versions.model_registry_contract_version !==
      OPENROUTER_MODEL_REGISTRY_CONTRACT_VERSION ||
    policy.versions.route_registry_contract_version !==
      OPENROUTER_ROUTE_REGISTRY_CONTRACT_VERSION ||
    policy.versions.registry_canonicalization_version !==
      OPENROUTER_REGISTRY_CANONICALIZATION_VERSION ||
    policy.versions.resolution_contract_version !==
      OPENROUTER_ROUTE_RESOLUTION_CONTRACT_VERSION ||
    policy.versions.authorization_contract_version !==
      OPENROUTER_RESOLUTION_AUTHORIZATION_CONTRACT_VERSION ||
    !HASH.test(policy.versions.resolution_decision_hash)
  )
    reasons.add("governed_version_or_resolution_hash_invalid");
  if (
    policy.evidence_ids.length === 0 ||
    policy.evidence_ids.some((id) => !ID.test(id))
  )
    reasons.add("evidence_constraint_invalid");
  const evaluated = Date.parse(request.evaluated_at);
  if (
    !validInstant(policy.issued_at) ||
    !validInstant(policy.evaluated_at) ||
    !validInstant(policy.expires_at) ||
    policy.evaluated_at !== policy.issued_at ||
    evaluated < Date.parse(policy.issued_at) ||
    evaluated >= Date.parse(policy.expires_at)
  )
    reasons.add("policy_expired_stale_or_time_invalid");
  if (
    policy.execution_correlation_id !== request.execution_correlation_id ||
    policy.audit_correlation_id !== request.audit_correlation_id ||
    request.gateway_request.capability_request.request_id !==
      request.gateway_request_id
  )
    reasons.add("correlation_or_audit_identity_mismatch");
  if (
    request.gateway_request.capability_request.context?.correlation_id !==
      undefined &&
    request.gateway_request.capability_request.context.correlation_id !==
      request.execution_correlation_id
  )
    reasons.add("gateway_correlation_weakening_attempt");
  if (!validateCapabilityRequest(request.gateway_request.capability_request).ok)
    reasons.add("gateway_capability_request_invalid");
  if (
    policy.reasons.length !== 1 ||
    policy.reasons[0] !== "all_governed_authorization_checks_passed"
  )
    reasons.add("policy_authorization_attestation_invalid");
  return [...reasons].sort();
}

function consumptionBinding(
  request: OpenRouterAuthorizedGatewayRequest,
): AuthorizationConsumptionBinding {
  return {
    authorization_id: request.policy.authorization.authorization_id,
    handoff_policy_id: request.policy.authorization.handoff_policy_id,
    handoff_policy_version: request.policy.authorization.handoff_policy_version,
    handoff_policy_hash: request.policy.authorization.handoff_policy_hash,
    decision_hash: request.policy.versions.resolution_decision_hash,
    authorization_mode: request.policy.authorization.authorization_mode,
    execution_correlation_id: request.execution_correlation_id,
    audit_correlation_id: request.audit_correlation_id,
    consumed_at: request.evaluated_at,
  };
}

export class OpenRouterAuthorizedGatewayCoordinator {
  constructor(private readonly options: OpenRouterAuthorizedGatewayOptions) {}

  async execute(value: unknown): Promise<OpenRouterAuthorizedGatewayResult> {
    const requestReasons = validateRequest(value);
    if (requestReasons.length > 0)
      return result(value, "invalid_request", requestReasons, "not_attempted");
    const request = value as OpenRouterAuthorizedGatewayRequest;
    let policyReasons: string[];
    try {
      policyReasons = [...validatePolicy(request)];
    } catch {
      policyReasons = ["policy_malformed_or_unknown_fields"];
    }
    if (this.options.adapterConfig === undefined)
      policyReasons.push("adapter_configuration_unavailable");
    else {
      if (
        validateOpenRouterAdapterConfig(this.options.adapterConfig).length > 0
      )
        policyReasons.push("adapter_configuration_invalid");
      if (this.options.adapterConfig.enabled !== false)
        policyReasons.push("adapter_enablement_forbidden");
    }
    if (policyReasons.length > 0)
      return result(
        request,
        "blocked_before_consumption",
        policyReasons,
        "not_attempted",
      );

    let consumeCalls = 0;
    let consumptionOutcome: AuthorizationConsumeResult | undefined;
    const invocation: GatewayInvocation = {
      capability_request: request.gateway_request.capability_request,
      execution_profile_id: request.gateway_request.execution_profile_id,
      expected_profile_contract_version:
        request.gateway_request.expected_profile_contract_version,
      expected_provider_id: request.policy.route.provider_id,
      expected_model_id: request.policy.route.provider_model_id,
    };
    let gatewayOutcome: GatewayOutcome;
    try {
      gatewayOutcome = await this.options.gateway.executeAuthorized(
        invocation,
        () => {
          consumeCalls += 1;
          if (consumeCalls !== 1)
            throw new Error("authorization consume called twice");
          consumptionOutcome = this.options.authorizationStore.consume(
            consumptionBinding(request),
          );
          if (consumptionOutcome !== "consumed")
            throw new Error(
              `authorization consumption rejected: ${consumptionOutcome}`,
            );
        },
      );
    } catch {
      if (consumptionOutcome === "consumed")
        return result(
          request,
          "blocked_after_consumption",
          ["gateway_failed_after_consumption"],
          consumptionOutcome,
        );
      if (consumeCalls > 0)
        return result(
          request,
          "consumption_rejected",
          [`authorization_${consumptionOutcome ?? "store_error"}`],
          consumptionOutcome ?? "store_error",
        );
      return result(
        request,
        "blocked_before_consumption",
        ["gateway_unavailable_before_consumption"],
        "not_attempted",
      );
    }
    if (consumeCalls === 0)
      return result(
        request,
        "blocked_before_consumption",
        ["gateway_blocked_before_consumption"],
        "not_attempted",
        gatewayOutcome,
      );
    if (consumptionOutcome !== "consumed")
      return result(
        request,
        "consumption_rejected",
        [`authorization_${consumptionOutcome}`],
        consumptionOutcome ?? "store_error",
        gatewayOutcome,
      );
    if (gatewayOutcome.audit.error_code === "LIVE_EXECUTION_DISABLED")
      return result(
        request,
        "execution_not_enabled",
        ["repository_openrouter_adapter_disabled"],
        consumptionOutcome,
        gatewayOutcome,
      );
    return result(
      request,
      "blocked_after_consumption",
      [
        gatewayOutcome.result.status === "succeeded"
          ? "repository_execution_outcome_forbidden"
          : "gateway_blocked_after_consumption",
      ],
      consumptionOutcome,
      gatewayOutcome,
    );
  }
}

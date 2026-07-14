import { createHash } from "node:crypto";

import {
  validateExecutionProfile,
  type ExecutionProfile,
} from "../execution/execution-profile.js";
import {
  BudgetPolicyCatalog,
  parseAccountingUnits,
  type BudgetPolicy,
} from "../governance/budget-policy.js";
import type { AuthorizationInspectionResult } from "../handoff/authorization-store.js";
import type { AuthorizationMode } from "../handoff/contracts.js";
import { assertPrivacyAuditMetadataOnly } from "../privacy/privacy-audit.js";
import type { PrivacyEnforcementDecision } from "../privacy/privacy-enforcer.js";
import {
  OPENROUTER_MODEL_REGISTRY_CONTRACT_VERSION,
  OPENROUTER_REGISTRY_CANONICALIZATION_VERSION,
  OPENROUTER_ROUTE_REGISTRY_CONTRACT_VERSION,
  canonicalizeOpenRouterRegistryJson,
  computeOpenRouterEntryHash,
  computeOpenRouterRouteHash,
  type OpenRouterModelRegistryEntry,
  type OpenRouterRouteRegistryRecord,
} from "./openrouter-registry.js";
import {
  OPENROUTER_ROUTE_RESOLUTION_CONTRACT_VERSION,
  computeOpenRouterRouteResolutionHash,
  type OpenRouterRouteResolutionResult,
} from "./openrouter-route-resolution.js";

export const OPENROUTER_RESOLUTION_AUTHORIZATION_CONTRACT_VERSION =
  "1.0.0" as const;
export const OPENROUTER_EXACT_EXECUTION_POLICY_CONTRACT_VERSION =
  "1.0.0" as const;
export const OPENROUTER_EXACT_EXECUTION_POLICY_HASH_DOMAIN =
  "vlatam-ai-lab:openrouter-exact-execution-policy:v1" as const;

export interface OpenRouterResolutionAuthorizationGrant {
  readonly authorization_id: string;
  readonly authorization_decision: "approved" | "denied";
  readonly authorization_mode: AuthorizationMode;
  readonly authorized_at: string;
  readonly expires_at: string;
  readonly authorizer_role: string;
  readonly review_attestation_reference: string;
  readonly handoff_policy_id: string;
  readonly handoff_policy_version: string;
  readonly handoff_policy_hash: string;
  readonly resolution_decision_hash: string;
  readonly route_id: string;
  readonly model_registry_id: string;
  readonly provider_model_id: string;
  readonly execution_profile_id: string;
  readonly execution_profile_version: string;
  readonly capability_ids: readonly string[];
  readonly privacy_zdr_required: true;
  readonly budget_policy_id: string;
  readonly budget_policy_version: string;
  readonly budget_scope_id: string;
  readonly execution_correlation_id: string;
  readonly audit_correlation_id: string;
}

export interface OpenRouterAuthorizationEvidenceContext {
  readonly status: "ready" | "blocked" | "unknown";
  readonly evidence_ids: readonly string[];
  readonly valid_until: string;
}

export interface OpenRouterAuthorizationBudgetContext {
  readonly status: "allowed" | "blocked" | "unknown";
  readonly policy: BudgetPolicy;
  readonly estimated_accounting_units: string;
}

export interface OpenRouterResolutionAuthorizationRequest {
  readonly contract_version: typeof OPENROUTER_RESOLUTION_AUTHORIZATION_CONTRACT_VERSION;
  readonly resolution: OpenRouterRouteResolutionResult;
  readonly resolution_maximum_age_seconds: number;
  readonly authorization: OpenRouterResolutionAuthorizationGrant;
  /** Read-only result from the existing AI-80 consumption store. */
  readonly authorization_consumption: AuthorizationInspectionResult;
  readonly execution_profile: ExecutionProfile;
  readonly capability_id: string;
  readonly route_intent: {
    readonly route_id: string;
    readonly model_registry_id: string;
    readonly provider_model_id: string;
  };
  /** Result from the existing privacy/ZDR enforcer; never recomputed here. */
  readonly privacy_decision: PrivacyEnforcementDecision;
  /** Governed policy and estimate produced before any reservation/transport. */
  readonly budget: OpenRouterAuthorizationBudgetContext;
  readonly evidence: OpenRouterAuthorizationEvidenceContext;
  readonly route_record: OpenRouterRouteRegistryRecord;
  readonly model_entry: OpenRouterModelRegistryEntry;
  readonly evaluated_at: string;
  readonly policy_ttl_seconds: number;
  readonly execution_correlation_id: string;
  readonly audit_correlation_id: string;
}

export interface OpenRouterExactExecutionPolicy {
  readonly contract_version: typeof OPENROUTER_EXACT_EXECUTION_POLICY_CONTRACT_VERSION;
  readonly route: {
    readonly route_id: string;
    readonly route_record_id: string;
    readonly route_version: string;
    readonly route_hash: string;
    readonly model_registry_id: string;
    readonly model_entry_version: string;
    readonly model_entry_hash: string;
    readonly provider_id: "openrouter";
    readonly provider_model_id: string;
    readonly upstream_provider_id: string;
  };
  readonly execution_profile: {
    readonly profile_id: string;
    readonly contract_version: string;
  };
  readonly authorization: {
    readonly authorization_id: string;
    readonly authorization_mode: AuthorizationMode;
    readonly authorizer_role: string;
    readonly review_attestation_reference: string;
    readonly capability_ids: readonly string[];
    readonly handoff_policy_id: string;
    readonly handoff_policy_version: string;
    readonly handoff_policy_hash: string;
  };
  readonly privacy: {
    readonly zdr_required: true;
    readonly privacy_decision_id: string;
    readonly privacy_policy_id: string;
    readonly privacy_policy_version: string;
    readonly zdr_evidence_id: string;
    readonly zdr_evidence_hash: string;
  };
  readonly budget: {
    readonly policy_id: string;
    readonly policy_version: string;
    readonly scope_id: string;
    readonly currency: string;
    readonly accounting_scale: string;
    readonly ceiling_accounting_units: string;
    readonly estimated_accounting_units: string;
  };
  readonly versions: {
    readonly model_registry_contract_version: string;
    readonly route_registry_contract_version: string;
    readonly registry_canonicalization_version: string;
    readonly resolution_contract_version: string;
    readonly resolution_decision_hash: string;
    readonly authorization_contract_version: typeof OPENROUTER_RESOLUTION_AUTHORIZATION_CONTRACT_VERSION;
  };
  readonly evidence_ids: readonly string[];
  readonly reasons: readonly string[];
  readonly evaluated_at: string;
  readonly issued_at: string;
  readonly expires_at: string;
  readonly execution_correlation_id: string;
  readonly audit_correlation_id: string;
  readonly policy_hash: string;
}

export type OpenRouterResolutionAuthorizationResult =
  | {
      readonly status: "authorized";
      readonly policy: OpenRouterExactExecutionPolicy;
    }
  | {
      readonly status: "blocked" | "invalid_request";
      readonly reasons: readonly string[];
      readonly evaluated_at: string | null;
      readonly execution_correlation_id: string | null;
      readonly audit_correlation_id: string | null;
    };

const ID = /^[a-z0-9][a-z0-9._:-]+$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const HASH = /^[a-f0-9]{64}$/;
const REQUEST_KEYS = [
  "contract_version",
  "resolution",
  "resolution_maximum_age_seconds",
  "authorization",
  "authorization_consumption",
  "execution_profile",
  "capability_id",
  "route_intent",
  "privacy_decision",
  "budget",
  "evidence",
  "route_record",
  "model_entry",
  "evaluated_at",
  "policy_ttl_seconds",
  "execution_correlation_id",
  "audit_correlation_id",
] as const;
const GRANT_KEYS = [
  "authorization_id",
  "authorization_decision",
  "authorization_mode",
  "authorized_at",
  "expires_at",
  "authorizer_role",
  "review_attestation_reference",
  "handoff_policy_id",
  "handoff_policy_version",
  "handoff_policy_hash",
  "resolution_decision_hash",
  "route_id",
  "model_registry_id",
  "provider_model_id",
  "execution_profile_id",
  "execution_profile_version",
  "capability_ids",
  "privacy_zdr_required",
  "budget_policy_id",
  "budget_policy_version",
  "budget_scope_id",
  "execution_correlation_id",
  "audit_correlation_id",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const validInstant = (value: unknown): value is string =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const validSeconds = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;

function validGrant(
  value: unknown,
): value is OpenRouterResolutionAuthorizationGrant {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (
    keys.some((key) => !(GRANT_KEYS as readonly string[]).includes(key)) ||
    GRANT_KEYS.some((key) => !(key in value))
  )
    return false;
  const ids = [
    "authorization_id",
    "authorizer_role",
    "review_attestation_reference",
    "handoff_policy_id",
    "route_id",
    "model_registry_id",
    "execution_profile_id",
    "budget_policy_id",
    "budget_scope_id",
    "execution_correlation_id",
    "audit_correlation_id",
  ];
  return (
    ids.every((key) => ID.test(String(value[key] ?? ""))) &&
    /^[a-z0-9][a-z0-9.-]*\/[a-z0-9][a-z0-9.:-]*$/.test(
      String(value["provider_model_id"] ?? ""),
    ) &&
    [
      "handoff_policy_version",
      "execution_profile_version",
      "budget_policy_version",
    ].every((key) => SEMVER.test(String(value[key] ?? ""))) &&
    ["handoff_policy_hash", "resolution_decision_hash"].every((key) =>
      HASH.test(String(value[key] ?? "")),
    ) &&
    ["approved", "denied"].includes(
      String(value["authorization_decision"] ?? ""),
    ) &&
    ["single_use", "reusable"].includes(
      String(value["authorization_mode"] ?? ""),
    ) &&
    validInstant(value["authorized_at"]) &&
    validInstant(value["expires_at"]) &&
    Array.isArray(value["capability_ids"]) &&
    value["capability_ids"].length > 0 &&
    value["capability_ids"].every((id) => ID.test(String(id))) &&
    new Set(value["capability_ids"]).size === value["capability_ids"].length &&
    value["privacy_zdr_required"] === true
  );
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function invalidReasons(value: unknown): readonly string[] {
  if (!isRecord(value)) return ["request_not_object"];
  const reasons = new Set<string>();
  for (const key of Object.keys(value))
    if (!(REQUEST_KEYS as readonly string[]).includes(key))
      reasons.add(`unknown_request_field:${key}`);
  for (const key of REQUEST_KEYS)
    if (!(key in value)) reasons.add(`missing_request_field:${key}`);
  if (
    value["contract_version"] !==
    OPENROUTER_RESOLUTION_AUTHORIZATION_CONTRACT_VERSION
  )
    reasons.add("unsupported_contract_version");
  if (!validInstant(value["evaluated_at"])) reasons.add("invalid_evaluated_at");
  if (!validSeconds(value["policy_ttl_seconds"]))
    reasons.add("invalid_policy_ttl_seconds");
  if (!validSeconds(value["resolution_maximum_age_seconds"]))
    reasons.add("invalid_resolution_maximum_age_seconds");
  for (const key of [
    "resolution",
    "authorization",
    "authorization_consumption",
    "execution_profile",
    "route_intent",
    "privacy_decision",
    "budget",
    "evidence",
    "route_record",
    "model_entry",
  ])
    if (!isRecord(value[key])) reasons.add(`invalid_${key}`);
  if (isRecord(value["authorization"]) && !validGrant(value["authorization"]))
    reasons.add("invalid_authorization");
  for (const key of [
    "capability_id",
    "execution_correlation_id",
    "audit_correlation_id",
  ])
    if (!ID.test(String(value[key] ?? ""))) reasons.add(`invalid_${key}`);
  return [...reasons].sort();
}

function policyHash(value: unknown): string {
  return createHash("sha256")
    .update(OPENROUTER_EXACT_EXECUTION_POLICY_HASH_DOMAIN)
    .update("\n")
    .update(canonicalizeOpenRouterRegistryJson(value))
    .digest("hex");
}

function blocked(
  request: Partial<OpenRouterResolutionAuthorizationRequest>,
  reasons: Iterable<string>,
): OpenRouterResolutionAuthorizationResult {
  return deepFreeze({
    status: "blocked" as const,
    reasons: [...new Set(reasons)].sort(),
    evaluated_at: validInstant(request.evaluated_at)
      ? request.evaluated_at
      : null,
    execution_correlation_id: ID.test(request.execution_correlation_id ?? "")
      ? request.execution_correlation_id!
      : null,
    audit_correlation_id: ID.test(request.audit_correlation_id ?? "")
      ? request.audit_correlation_id!
      : null,
  });
}

/**
 * Pure authorization and exact-policy construction. It does not resolve a
 * route, consume an authorization, reserve budget, call a gateway/adapter, or
 * perform I/O. Existing controls supply their reviewed metadata decisions.
 */
function authorizeOpenRouterResolutionInternal(
  value: unknown,
): OpenRouterResolutionAuthorizationResult {
  const invalid = invalidReasons(value);
  if (invalid.length > 0) {
    const input = isRecord(value) ? value : {};
    return deepFreeze({
      status: "invalid_request",
      reasons: invalid,
      evaluated_at: validInstant(input["evaluated_at"])
        ? input["evaluated_at"]
        : null,
      execution_correlation_id: ID.test(
        String(input["execution_correlation_id"] ?? ""),
      )
        ? String(input["execution_correlation_id"])
        : null,
      audit_correlation_id: ID.test(String(input["audit_correlation_id"] ?? ""))
        ? String(input["audit_correlation_id"])
        : null,
    });
  }
  const request = value as OpenRouterResolutionAuthorizationRequest;
  const reasons = new Set<string>();
  const now = Date.parse(request.evaluated_at);
  const resolution = request.resolution;
  const grant = request.authorization;
  const route = request.route_record;
  const entry = request.model_entry;
  const profile = request.execution_profile;
  const intent = request.route_intent;

  if (resolution.status !== "resolved")
    reasons.add(`resolution_not_resolved:${resolution.status}`);
  const resolutionBase = isRecord(resolution)
    ? Object.fromEntries(
        Object.entries(resolution).filter(([key]) => key !== "audit"),
      )
    : {};
  if (
    !isRecord(resolution.audit) ||
    resolution.audit.resolution_contract_version !==
      OPENROUTER_ROUTE_RESOLUTION_CONTRACT_VERSION ||
    !HASH.test(String(resolution.audit.decision_hash ?? "")) ||
    computeOpenRouterRouteResolutionHash(resolutionBase) !==
      resolution.audit.decision_hash ||
    resolution.audit.executable !== false ||
    resolution.audit.provider_call_performed !== false
  )
    reasons.add("resolution_integrity_failure");
  if (!validInstant(resolution.evaluated_at))
    reasons.add("resolution_time_invalid");
  else {
    const resolvedAt = Date.parse(resolution.evaluated_at);
    if (resolvedAt > now) reasons.add("resolution_future_dated");
    if (now - resolvedAt > request.resolution_maximum_age_seconds * 1000)
      reasons.add("resolution_stale");
  }

  if (
    computeOpenRouterRouteHash(route) !== route.route_hash ||
    computeOpenRouterEntryHash(entry) !== entry.entry_hash
  )
    reasons.add("registry_hash_mismatch");
  if (
    resolution.registry.model_registry_contract_version !==
      OPENROUTER_MODEL_REGISTRY_CONTRACT_VERSION ||
    resolution.registry.route_registry_contract_version !==
      OPENROUTER_ROUTE_REGISTRY_CONTRACT_VERSION ||
    resolution.registry.canonicalization_version !==
      OPENROUTER_REGISTRY_CANONICALIZATION_VERSION ||
    resolution.registry.route_record_id !== route.route_record_id ||
    resolution.registry.route_version !== route.route_version ||
    resolution.registry.route_hash !== route.route_hash ||
    !resolution.registry.evaluated_entry_hashes.includes(entry.entry_hash)
  )
    reasons.add("registry_metadata_mismatch");
  if (
    (route.enabled as boolean) !== true ||
    (entry.enabled as boolean) !== true ||
    route.lifecycle !== "approved" ||
    entry.lifecycle !== "approved" ||
    route.review_status !== "reviewed_approved" ||
    entry.review_status !== "reviewed_approved" ||
    route.route_verification_status !== "verified_exact" ||
    entry.upstream_route_verification !== "verified_exact"
  )
    reasons.add("registry_record_not_execution_ready");

  if (!validGrant(grant)) reasons.add("authorization_missing_or_malformed");
  else {
    if (grant.authorization_decision !== "approved")
      reasons.add("authorization_denied");
    if (!validInstant(grant.authorized_at) || !validInstant(grant.expires_at))
      reasons.add("authorization_time_invalid");
    else {
      if (Date.parse(grant.authorized_at) > now)
        reasons.add("authorization_future_dated");
      if (
        validInstant(resolution.evaluated_at) &&
        Date.parse(grant.authorized_at) < Date.parse(resolution.evaluated_at)
      )
        reasons.add("authorization_before_resolution");
      if (Date.parse(grant.expires_at) <= now)
        reasons.add("authorization_expired");
    }
    if (grant.resolution_decision_hash !== resolution.audit?.decision_hash)
      reasons.add("authorization_resolution_mismatch");
    if (
      grant.execution_correlation_id !== request.execution_correlation_id ||
      grant.audit_correlation_id !== request.audit_correlation_id
    )
      reasons.add("authorization_correlation_mismatch");
    if (!grant.capability_ids.includes(request.capability_id))
      reasons.add("capability_out_of_scope");
  }
  if (request.authorization_consumption.status !== "ok")
    reasons.add("authorization_consumption_state_unknown");
  else if (request.authorization_consumption.record)
    reasons.add(
      request.authorization_consumption.record.state === "superseded"
        ? "authorization_superseded"
        : "authorization_already_consumed",
    );

  if (
    resolution.status === "resolved" &&
    (resolution.route_id !== intent.route_id ||
      resolution.selected_model_registry_id !== intent.model_registry_id ||
      resolution.selected_provider_model_id !== intent.provider_model_id ||
      resolution.provider_id !== "openrouter" ||
      resolution.upstream_provider_id !== entry.upstream_provider_id)
  )
    reasons.add("resolution_intent_mismatch");
  if (
    route.route_id !== intent.route_id ||
    entry.route_id !== intent.route_id ||
    entry.entry_id !== intent.model_registry_id ||
    route.model_id !== intent.provider_model_id ||
    entry.model_id !== intent.provider_model_id ||
    grant.route_id !== intent.route_id ||
    grant.model_registry_id !== intent.model_registry_id ||
    grant.provider_model_id !== intent.provider_model_id
  )
    reasons.add("route_or_model_scope_mismatch");
  if (
    validateExecutionProfile(profile).length > 0 ||
    !profile.enabled ||
    profile.mode !== "live" ||
    profile.provider_id !== "openrouter" ||
    profile.model_id !== intent.provider_model_id ||
    profile.profile_id !== grant.execution_profile_id ||
    profile.contract_version !== grant.execution_profile_version ||
    profile.capability_id !== request.capability_id ||
    !route.profile_compatibility.capability_ids.includes(
      request.capability_id,
    ) ||
    !(
      route.profile_compatibility.executable_profile_ids as readonly string[]
    ).includes(profile.profile_id)
  )
    reasons.add("execution_profile_incompatible");

  const privacy = request.privacy_decision;
  if (
    privacy.status !== "allowed" ||
    privacy.audit.decision !== "allowed" ||
    privacy.audit.profile_id !== profile.profile_id ||
    privacy.audit.capability_id !== request.capability_id ||
    privacy.audit.zdr_support !== "verified" ||
    !privacy.audit.zdr_evidence_id ||
    !privacy.audit.zdr_evidence_hash ||
    grant.privacy_zdr_required !== true ||
    assertPrivacyAuditMetadataOnly(privacy.audit).length > 0
  )
    reasons.add("privacy_or_zdr_not_enforced");

  const budget = request.budget;
  try {
    new BudgetPolicyCatalog({
      schema_version: budget.policy.schema_version,
      policies: [budget.policy],
    });
    const estimate = parseAccountingUnits(budget.estimated_accounting_units);
    const ceiling = parseAccountingUnits(
      budget.policy.max_estimated_cost_accounting_units_per_request,
    );
    if (
      budget.status !== "allowed" ||
      estimate > ceiling ||
      budget.policy.behavior !== "hard_block" ||
      budget.policy.capability_id !== request.capability_id ||
      budget.policy.execution_mode !== profile.mode ||
      (budget.policy.profile_id !== undefined &&
        budget.policy.profile_id !== profile.profile_id) ||
      grant.budget_policy_id !== budget.policy.policy_id ||
      grant.budget_policy_version !== budget.policy.schema_version ||
      grant.budget_scope_id !== budget.policy.scope_id
    )
      reasons.add("budget_missing_exceeded_or_incompatible");
  } catch {
    reasons.add("budget_missing_exceeded_or_incompatible");
  }

  const requiredEvidence = new Set([
    route.pricing_evidence_id,
    route.privacy_evidence_id,
    route.operational_evidence_id,
    entry.pricing_evidence_id,
    entry.privacy_evidence_id,
    entry.operational_evidence_id,
    ...entry.model_evidence_refs.map((item) => item.evidence_id),
    ...entry.benchmark_evidence_ids,
  ]);
  if (
    request.evidence.status !== "ready" ||
    !validInstant(request.evidence.valid_until) ||
    Date.parse(request.evidence.valid_until) <= now ||
    [...requiredEvidence].some(
      (id) => !request.evidence.evidence_ids.includes(id),
    )
  )
    reasons.add("evidence_not_ready");

  const expiryCandidates = [
    grant.expires_at,
    route.expires_at,
    entry.expires_at,
    request.evidence.valid_until,
    new Date(now + request.policy_ttl_seconds * 1000).toISOString(),
  ];
  if (expiryCandidates.some((instant) => !validInstant(instant)))
    reasons.add("upstream_validity_unknown");
  const expiresAt = expiryCandidates
    .filter(validInstant)
    .sort((left, right) => Date.parse(left) - Date.parse(right))[0];
  if (!expiresAt || Date.parse(expiresAt) <= now)
    reasons.add("policy_expiry_invalid");

  if (reasons.size > 0) return blocked(request, reasons);

  const withoutHash = {
    contract_version: OPENROUTER_EXACT_EXECUTION_POLICY_CONTRACT_VERSION,
    route: {
      route_id: route.route_id,
      route_record_id: route.route_record_id,
      route_version: route.route_version,
      route_hash: route.route_hash,
      model_registry_id: entry.entry_id,
      model_entry_version: entry.entry_version,
      model_entry_hash: entry.entry_hash,
      provider_id: "openrouter" as const,
      provider_model_id: entry.model_id,
      upstream_provider_id: entry.upstream_provider_id,
    },
    execution_profile: {
      profile_id: profile.profile_id,
      contract_version: profile.contract_version,
    },
    authorization: {
      authorization_id: grant.authorization_id,
      authorization_mode: grant.authorization_mode,
      authorizer_role: grant.authorizer_role,
      review_attestation_reference: grant.review_attestation_reference,
      capability_ids: [...grant.capability_ids].sort(),
      handoff_policy_id: grant.handoff_policy_id,
      handoff_policy_version: grant.handoff_policy_version,
      handoff_policy_hash: grant.handoff_policy_hash,
    },
    privacy: {
      zdr_required: true as const,
      privacy_decision_id: privacy.audit.privacy_decision_id,
      privacy_policy_id: privacy.audit.privacy_policy_id!,
      privacy_policy_version: privacy.audit.privacy_policy_version!,
      zdr_evidence_id: privacy.audit.zdr_evidence_id!,
      zdr_evidence_hash: privacy.audit.zdr_evidence_hash!,
    },
    budget: {
      policy_id: budget.policy.policy_id,
      policy_version: budget.policy.schema_version,
      scope_id: budget.policy.scope_id,
      currency: budget.policy.currency,
      accounting_scale: budget.policy.accounting_scale,
      ceiling_accounting_units:
        budget.policy.max_estimated_cost_accounting_units_per_request,
      estimated_accounting_units: budget.estimated_accounting_units,
    },
    versions: {
      model_registry_contract_version:
        resolution.registry.model_registry_contract_version,
      route_registry_contract_version:
        resolution.registry.route_registry_contract_version,
      registry_canonicalization_version:
        resolution.registry.canonicalization_version,
      resolution_contract_version: resolution.audit.resolution_contract_version,
      resolution_decision_hash: resolution.audit.decision_hash,
      authorization_contract_version:
        OPENROUTER_RESOLUTION_AUTHORIZATION_CONTRACT_VERSION,
    },
    evidence_ids: [...new Set(request.evidence.evidence_ids)].sort(),
    reasons: ["all_governed_authorization_checks_passed"],
    evaluated_at: request.evaluated_at,
    issued_at: request.evaluated_at,
    expires_at: expiresAt!,
    execution_correlation_id: request.execution_correlation_id,
    audit_correlation_id: request.audit_correlation_id,
  };
  return deepFreeze({
    status: "authorized",
    policy: { ...withoutHash, policy_hash: policyHash(withoutHash) },
  });
}

export function authorizeOpenRouterResolution(
  value: unknown,
): OpenRouterResolutionAuthorizationResult {
  try {
    return authorizeOpenRouterResolutionInternal(value);
  } catch {
    const input = isRecord(value) ? value : {};
    return deepFreeze({
      status: "invalid_request",
      reasons: ["malformed_request"],
      evaluated_at: validInstant(input["evaluated_at"])
        ? input["evaluated_at"]
        : null,
      execution_correlation_id: ID.test(
        String(input["execution_correlation_id"] ?? ""),
      )
        ? String(input["execution_correlation_id"])
        : null,
      audit_correlation_id: ID.test(String(input["audit_correlation_id"] ?? ""))
        ? String(input["audit_correlation_id"])
        : null,
    });
  }
}

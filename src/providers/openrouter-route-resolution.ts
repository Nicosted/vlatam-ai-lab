import { createHash } from "node:crypto";

import {
  OPENROUTER_MODEL_REGISTRY_CONTRACT_VERSION,
  OPENROUTER_REGISTRY_CANONICALIZATION_VERSION,
  OPENROUTER_ROUTE_REGISTRY_CONTRACT_VERSION,
  canonicalizeOpenRouterRegistryJson,
  defaultOpenRouterRegistryDependencies,
  evaluateOpenRouterRegistryEligibility,
  loadOpenRouterRegistry,
  type OpenRouterModelRegistryEntry,
  type OpenRouterRegistry,
  type OpenRouterRegistryDependencies,
  type OpenRouterRegistryStructuredOutputMode,
  type OpenRouterRouteRegistryRecord,
} from "./openrouter-registry.js";

export const OPENROUTER_ROUTE_RESOLUTION_CONTRACT_VERSION = "1.0.0" as const;
export const OPENROUTER_ROUTE_RESOLUTION_HASH_DOMAIN =
  "vlatam-ai-lab:openrouter-route-resolution:v1" as const;

export interface OpenRouterRouteResolutionRequest {
  readonly contract_version: typeof OPENROUTER_ROUTE_RESOLUTION_CONTRACT_VERSION;
  readonly route_id: string;
  readonly required_capability_ids: readonly string[];
  readonly structured_output_mode: OpenRouterRegistryStructuredOutputMode | null;
  readonly current_evidence_required: boolean;
  readonly reviewed_evidence_required: boolean;
  readonly privacy_zdr_required: boolean;
  readonly benchmark_evidence_required: boolean;
  readonly exact_upstream_route_required: boolean;
  readonly pricing_contract: {
    readonly pricing_id: string;
    readonly pricing_contract_version: string;
  } | null;
  /** Explicit decision clock; part of the deterministic input. */
  readonly evaluated_at: string;
}

export type OpenRouterRouteResolutionStatus =
  | "resolved"
  | "blocked"
  | "no_eligible_model"
  | "invalid_request";

export interface OpenRouterRouteResolutionRegistryMetadata {
  readonly model_registry_contract_version: typeof OPENROUTER_MODEL_REGISTRY_CONTRACT_VERSION;
  readonly route_registry_contract_version: typeof OPENROUTER_ROUTE_REGISTRY_CONTRACT_VERSION;
  readonly canonicalization_version: typeof OPENROUTER_REGISTRY_CANONICALIZATION_VERSION;
  readonly route_record_id?: string;
  readonly route_version?: string;
  readonly route_hash?: string;
  readonly evaluated_entry_hashes: readonly string[];
}

export interface OpenRouterRouteResolutionAudit {
  readonly resolution_contract_version: typeof OPENROUTER_ROUTE_RESOLUTION_CONTRACT_VERSION;
  readonly decision_hash: string;
  readonly executable: false;
  readonly provider_call_performed: false;
}

interface OpenRouterRouteResolutionBase {
  readonly status: OpenRouterRouteResolutionStatus;
  readonly route_id: string | null;
  readonly decision_reasons: readonly string[];
  readonly registry: OpenRouterRouteResolutionRegistryMetadata;
  readonly audit: OpenRouterRouteResolutionAudit;
}

export interface OpenRouterResolvedRoute extends OpenRouterRouteResolutionBase {
  readonly status: "resolved";
  readonly selected_model_registry_id: string;
  readonly selected_provider_model_id: string;
  readonly provider_id: "openrouter";
  readonly upstream_provider_id: string;
  readonly selection_position: number;
  readonly selection_source: "preferred" | "fallback";
  readonly matched_requirements: readonly string[];
}

export interface OpenRouterUnresolvedRoute extends OpenRouterRouteResolutionBase {
  readonly status: "blocked" | "no_eligible_model" | "invalid_request";
}

export type OpenRouterRouteResolutionResult =
  | OpenRouterResolvedRoute
  | OpenRouterUnresolvedRoute;

const REQUEST_KEYS = [
  "contract_version",
  "route_id",
  "required_capability_ids",
  "structured_output_mode",
  "current_evidence_required",
  "reviewed_evidence_required",
  "privacy_zdr_required",
  "benchmark_evidence_required",
  "exact_upstream_route_required",
  "pricing_contract",
  "evaluated_at",
] as const;
const ID = /^[a-z0-9][a-z0-9._:-]+$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const validInstant = (value: unknown): value is string =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

function validateRequest(value: unknown): readonly string[] {
  if (!isRecord(value)) return ["request_not_object"];
  const reasons = new Set<string>();
  for (const key of Object.keys(value))
    if (!(REQUEST_KEYS as readonly string[]).includes(key))
      reasons.add(`unknown_request_field:${key}`);
  for (const key of REQUEST_KEYS)
    if (!(key in value)) reasons.add(`missing_request_field:${key}`);
  if (
    value["contract_version"] !== OPENROUTER_ROUTE_RESOLUTION_CONTRACT_VERSION
  )
    reasons.add("unsupported_request_contract_version");
  if (!ID.test(String(value["route_id"] ?? "")))
    reasons.add("invalid_route_id");
  const capabilities = value["required_capability_ids"];
  if (
    !Array.isArray(capabilities) ||
    capabilities.length === 0 ||
    capabilities.some((id) => typeof id !== "string" || !ID.test(id)) ||
    new Set(capabilities).size !== capabilities.length
  )
    reasons.add("invalid_required_capabilities");
  if (
    value["structured_output_mode"] !== null &&
    value["structured_output_mode"] !== "json_object" &&
    value["structured_output_mode"] !== "json_schema"
  )
    reasons.add("invalid_structured_output_mode");
  for (const key of [
    "current_evidence_required",
    "reviewed_evidence_required",
    "privacy_zdr_required",
    "benchmark_evidence_required",
    "exact_upstream_route_required",
  ])
    if (typeof value[key] !== "boolean") reasons.add(`invalid_${key}`);
  const pricing = value["pricing_contract"];
  if (
    pricing !== null &&
    (!isRecord(pricing) ||
      Object.keys(pricing).length !== 2 ||
      !ID.test(String(pricing["pricing_id"] ?? "")) ||
      !SEMVER.test(String(pricing["pricing_contract_version"] ?? "")))
  )
    reasons.add("invalid_pricing_contract");
  if (!validInstant(value["evaluated_at"])) reasons.add("invalid_evaluated_at");
  return [...reasons].sort();
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function decisionHash(value: unknown): string {
  return createHash("sha256")
    .update(OPENROUTER_ROUTE_RESOLUTION_HASH_DOMAIN)
    .update("\n")
    .update(canonicalizeOpenRouterRegistryJson(value))
    .digest("hex");
}

function metadata(
  route?: OpenRouterRouteRegistryRecord,
  entries: readonly OpenRouterModelRegistryEntry[] = [],
): OpenRouterRouteResolutionRegistryMetadata {
  return {
    model_registry_contract_version: OPENROUTER_MODEL_REGISTRY_CONTRACT_VERSION,
    route_registry_contract_version: OPENROUTER_ROUTE_REGISTRY_CONTRACT_VERSION,
    canonicalization_version: OPENROUTER_REGISTRY_CANONICALIZATION_VERSION,
    ...(route
      ? {
          route_record_id: route.route_record_id,
          route_version: route.route_version,
          route_hash: route.route_hash,
        }
      : {}),
    evaluated_entry_hashes: entries.map((entry) => entry.entry_hash),
  };
}

function finish<T extends Omit<OpenRouterRouteResolutionResult, "audit">>(
  value: T,
): OpenRouterRouteResolutionResult {
  const hash = decisionHash(value);
  return deepFreeze({
    ...value,
    audit: {
      resolution_contract_version: OPENROUTER_ROUTE_RESOLUTION_CONTRACT_VERSION,
      decision_hash: hash,
      executable: false,
      provider_call_performed: false,
    },
  } as OpenRouterRouteResolutionResult);
}

function unresolved(
  status: OpenRouterUnresolvedRoute["status"],
  routeId: string | null,
  reasons: readonly string[],
  registry: OpenRouterRouteResolutionRegistryMetadata,
): OpenRouterRouteResolutionResult {
  return finish({
    status,
    route_id: routeId,
    decision_reasons: [...reasons].sort(),
    registry,
  });
}

function activeRoutes(
  registry: OpenRouterRegistry,
  routeId: string,
): readonly OpenRouterRouteRegistryRecord[] {
  const superseded = new Set(
    registry.routes
      .map((route) => route.supersedes_route_record_id)
      .filter((id): id is string => id !== null),
  );
  return registry.routes.filter(
    (route) =>
      route.route_id === routeId && !superseded.has(route.route_record_id),
  );
}

function policyConflicts(
  request: OpenRouterRouteResolutionRequest,
  route: OpenRouterRouteRegistryRecord,
): readonly string[] {
  const conflicts: string[] = [];
  const requirements = route.eligibility_requirements;
  if (
    requirements.current_evidence_required &&
    !request.current_evidence_required
  )
    conflicts.push("current_evidence_policy_conflict");
  if (
    requirements.reviewed_evidence_required &&
    !request.reviewed_evidence_required
  )
    conflicts.push("reviewed_evidence_policy_conflict");
  if (requirements.privacy_zdr_required && !request.privacy_zdr_required)
    conflicts.push("privacy_zdr_policy_conflict");
  if (
    requirements.benchmark_evidence_required &&
    !request.benchmark_evidence_required
  )
    conflicts.push("benchmark_policy_conflict");
  if (
    requirements.exact_upstream_route_required &&
    !request.exact_upstream_route_required
  )
    conflicts.push("exact_route_policy_conflict");
  if (
    requirements.structured_output_required &&
    request.structured_output_mode === null
  )
    conflicts.push("structured_output_policy_conflict");
  if (
    requirements.pricing_contract_required &&
    request.pricing_contract === null
  )
    conflicts.push("pricing_policy_conflict");
  return conflicts.sort();
}

function candidateBlockers(
  request: OpenRouterRouteResolutionRequest,
  route: OpenRouterRouteRegistryRecord,
  entry: OpenRouterModelRegistryEntry,
  dependencies: OpenRouterRegistryDependencies,
): readonly string[] {
  const blockers = new Set<string>();
  if (!entry.enabled) blockers.add("model_disabled");
  if (entry.lifecycle !== "approved")
    blockers.add("model_lifecycle_ineligible");
  for (const capability of request.required_capability_ids)
    if (!entry.capability_ids.includes(capability))
      blockers.add("capability_mismatch");
  if (
    request.structured_output_mode !== null &&
    (!route.structured_output_modes.includes(request.structured_output_mode) ||
      !entry.structured_output_modes.includes(request.structured_output_mode))
  )
    blockers.add("structured_output_mismatch");
  if (
    request.exact_upstream_route_required &&
    (route.route_verification_status !== "verified_exact" ||
      entry.upstream_route_verification !== "verified_exact")
  )
    blockers.add("exact_route_mismatch");
  if (
    request.pricing_contract &&
    (entry.pricing_contract_id !== request.pricing_contract.pricing_id ||
      entry.pricing_contract_version !==
        request.pricing_contract.pricing_contract_version)
  )
    blockers.add("pricing_contract_mismatch");
  const eligibility = evaluateOpenRouterRegistryEligibility(
    entry,
    dependencies,
    new Date(request.evaluated_at),
  );
  for (const blocker of eligibility.blockers) blockers.add(blocker);
  return [...blockers].sort();
}

/**
 * Pure metadata-only selection over a registry that has already passed the
 * governed loader/validator. This function imports no adapter or transport.
 */
export function resolveOpenRouterRoute(
  requestValue: unknown,
  registry: OpenRouterRegistry,
  dependencies: OpenRouterRegistryDependencies,
): OpenRouterRouteResolutionResult {
  const requestErrors = validateRequest(requestValue);
  const routeId =
    isRecord(requestValue) && typeof requestValue["route_id"] === "string"
      ? requestValue["route_id"]
      : null;
  if (requestErrors.length > 0)
    return unresolved("invalid_request", routeId, requestErrors, metadata());
  const request = requestValue as OpenRouterRouteResolutionRequest;
  const routes = activeRoutes(registry, request.route_id);
  if (routes.length === 0)
    return unresolved(
      "blocked",
      request.route_id,
      ["unknown_route"],
      metadata(),
    );
  if (routes.length !== 1)
    return unresolved(
      "blocked",
      request.route_id,
      ["registry_integrity_ambiguous_active_route"],
      metadata(),
    );
  const route = routes[0]!;
  const routeEntries = route.allowed_model_entry_ids
    .map((id) => registry.entries.find((entry) => entry.entry_id === id))
    .filter(
      (entry): entry is OpenRouterModelRegistryEntry => entry !== undefined,
    );
  const routeMetadata = metadata(route, routeEntries);
  if (routeEntries.length !== route.allowed_model_entry_ids.length)
    return unresolved(
      "blocked",
      request.route_id,
      ["registry_integrity_unknown_model_reference"],
      routeMetadata,
    );
  if (!route.enabled)
    return unresolved(
      "blocked",
      request.route_id,
      ["route_disabled"],
      routeMetadata,
    );
  if (["blocked", "degraded", "retired"].includes(route.lifecycle))
    return unresolved(
      "blocked",
      request.route_id,
      ["route_lifecycle_ineligible"],
      routeMetadata,
    );
  const conflicts = policyConflicts(request, route);
  if (conflicts.length > 0)
    return unresolved("blocked", request.route_id, conflicts, routeMetadata);
  const preferred = route.preferred_model_entry_order;
  const fallback = route.fallback_model_entry_order;
  const invalidFallback =
    (!route.allow_fallbacks && fallback.length > 0) ||
    (route.allow_fallbacks && fallback.length === 0) ||
    fallback.some(
      (id) =>
        !route.allowed_model_entry_ids.includes(id) || preferred.includes(id),
    );
  const order = [...preferred, ...(route.allow_fallbacks ? fallback : [])];
  if (
    invalidFallback ||
    new Set(order).size !== order.length ||
    order.some((id) => !route.allowed_model_entry_ids.includes(id)) ||
    route.allowed_model_entry_ids.some((id) => !order.includes(id))
  )
    return unresolved(
      "blocked",
      request.route_id,
      ["invalid_fallback_configuration"],
      routeMetadata,
    );
  const evaluatedReasons: string[] = [];
  for (let index = 0; index < order.length; index += 1) {
    const entryId = order[index]!;
    const entry = registry.entries.find(
      (candidate) => candidate.entry_id === entryId,
    );
    if (!entry)
      return unresolved(
        "blocked",
        request.route_id,
        ["registry_integrity_unknown_model_reference"],
        routeMetadata,
      );
    const blockers = candidateBlockers(request, route, entry, dependencies);
    if (blockers.length > 0) {
      evaluatedReasons.push(`${entry.entry_id}:${blockers.join("+")}`);
      continue;
    }
    const source = index < preferred.length ? "preferred" : "fallback";
    return finish({
      status: "resolved",
      route_id: request.route_id,
      selected_model_registry_id: entry.entry_id,
      selected_provider_model_id: entry.model_id,
      provider_id: entry.provider_id,
      upstream_provider_id: entry.upstream_provider_id,
      selection_position: index,
      selection_source: source,
      matched_requirements: [
        ...request.required_capability_ids.map((id) => `capability:${id}`),
        `structured_output:${request.structured_output_mode}`,
        `pricing:${request.pricing_contract!.pricing_id}@${request.pricing_contract!.pricing_contract_version}`,
        "benchmark_evidence",
        "current_reviewed_evidence",
        "privacy_zdr",
        "verified_exact_route",
      ].sort(),
      decision_reasons: [
        `${source}_candidate_eligible`,
        `selected_position:${index}`,
      ],
      registry: routeMetadata,
    });
  }
  return unresolved(
    "no_eligible_model",
    request.route_id,
    evaluatedReasons.length > 0 ? evaluatedReasons : ["candidate_order_empty"],
    routeMetadata,
  );
}

/** Repository-backed entry point. Loading validates versions, hashes, and all
 * references before resolution. Validation failure returns a closed decision. */
export function resolveGovernedOpenRouterRoute(
  request: unknown,
): OpenRouterRouteResolutionResult {
  const errors = validateRequest(request);
  if (errors.length > 0)
    return unresolved(
      "invalid_request",
      isRecord(request) && typeof request["route_id"] === "string"
        ? request["route_id"]
        : null,
      errors,
      metadata(),
    );
  const typed = request as OpenRouterRouteResolutionRequest;
  try {
    const dependencies = defaultOpenRouterRegistryDependencies();
    const registry = loadOpenRouterRegistry(new Date(typed.evaluated_at));
    return resolveOpenRouterRoute(typed, registry, dependencies);
  } catch {
    return unresolved(
      "blocked",
      typed.route_id,
      ["registry_version_or_integrity_failure"],
      metadata(),
    );
  }
}

import { createHash } from "node:crypto";

import adapterConfigJson from "../../config/ai-openrouter-adapter.json" with { type: "json" };
import capabilityCatalogJson from "../../config/ai-capabilities.json" with { type: "json" };
import executionProfilesJson from "../../config/ai-execution-profiles.json" with { type: "json" };
import modelRegistryJson from "../../config/ai-openrouter-model-registry.json" with { type: "json" };
import pricingCatalogJson from "../../config/ai-pricing.json" with { type: "json" };
import providerEvidenceJson from "../../config/ai-provider-evidence.json" with { type: "json" };
import routeRegistryJson from "../../config/ai-openrouter-route-registry.json" with { type: "json" };
import {
  PRICE_CONTRACT_VERSION,
  validatePricingEntry,
} from "../governance/pricing.js";
import {
  computeEvidenceHash,
  type ProviderEvidenceRecord,
} from "./provider-evidence.js";
import {
  findCredentialShapedField,
  OPENROUTER_ROUTE_POLICY_CONTRACT_VERSION,
  OPENROUTER_USAGE_NORMALIZATION_VERSION,
  validateOpenRouterDefaultConfig,
  type OpenRouterAdapterConfig,
} from "./openrouter-config.js";

export const OPENROUTER_MODEL_REGISTRY_CONTRACT_VERSION = "1.0.0" as const;
export const OPENROUTER_ROUTE_REGISTRY_CONTRACT_VERSION = "1.0.0" as const;
export const OPENROUTER_PROFILE_COMPATIBILITY_CONTRACT_VERSION =
  "1.0.0" as const;
export const OPENROUTER_REGISTRY_CANONICALIZATION_VERSION =
  "registry-json-v1" as const;
export const OPENROUTER_ENTRY_HASH_DOMAIN =
  "vlatam-ai-lab:openrouter-model-route-entry:v1" as const;
export const OPENROUTER_ROUTE_HASH_DOMAIN =
  "vlatam-ai-lab:openrouter-route-record:v1" as const;

export const OPENROUTER_REGISTRY_LIFECYCLES = [
  "discovered",
  "evidence_incomplete",
  "benchmark_pending",
  "candidate",
  "approved",
  "degraded",
  "blocked",
  "retired",
] as const;
export type OpenRouterRegistryLifecycle =
  (typeof OPENROUTER_REGISTRY_LIFECYCLES)[number];

export const OPENROUTER_ROUTE_VERIFICATION_STATES = [
  "verified_exact",
  "documented_preference_only",
  "response_verified_only",
  "unverified",
  "variable",
] as const;
export type OpenRouterRouteVerification =
  (typeof OPENROUTER_ROUTE_VERIFICATION_STATES)[number];

export const OPENROUTER_REGISTRY_REVIEW_STATUSES = [
  "pending",
  "reviewed_with_blockers",
  "reviewed_approved",
  "rejected",
] as const;
export type OpenRouterRegistryReviewStatus =
  (typeof OPENROUTER_REGISTRY_REVIEW_STATUSES)[number];

export type OpenRouterInputModality = "text" | "image" | "audio" | "video";
export type OpenRouterOutputModality = "text" | "image" | "audio";
export type OpenRouterRegistryStructuredOutputMode =
  | "json_object"
  | "json_schema";

export interface EvidenceHashReference {
  readonly evidence_id: string;
  readonly evidence_hash: string;
}

export interface OpenRouterModelRegistryEntry {
  readonly registry_contract_version: typeof OPENROUTER_MODEL_REGISTRY_CONTRACT_VERSION;
  readonly entry_id: string;
  readonly entry_version: string;
  readonly model_id: string;
  readonly model_revision: string | null;
  readonly route_id: string;
  readonly provider_id: "openrouter";
  readonly upstream_provider_id: string;
  readonly upstream_route_verification: OpenRouterRouteVerification;
  readonly capability_ids: readonly string[];
  readonly supported_input_modalities: readonly OpenRouterInputModality[];
  readonly supported_output_modalities: readonly OpenRouterOutputModality[];
  readonly structured_output_modes: readonly OpenRouterRegistryStructuredOutputMode[];
  readonly tool_calling: boolean | null;
  readonly context_window_tokens: number | null;
  readonly maximum_output_tokens: number | null;
  readonly usage_mapping_version: string;
  readonly pricing_contract_id: string | null;
  readonly pricing_contract_version: string | null;
  readonly pricing_evidence_id: string;
  readonly pricing_evidence_hash: string;
  readonly privacy_evidence_id: string;
  readonly privacy_evidence_hash: string;
  readonly operational_evidence_id: string;
  readonly operational_evidence_hash: string;
  readonly model_evidence_refs: readonly EvidenceHashReference[];
  readonly benchmark_evidence_ids: readonly string[];
  readonly route_policy_id: string;
  readonly route_policy_version: string;
  readonly lifecycle: OpenRouterRegistryLifecycle;
  readonly enabled: false;
  readonly review_status: OpenRouterRegistryReviewStatus;
  readonly reviewed_at: string | null;
  readonly expires_at: string;
  readonly supersedes_entry_id: string | null;
  readonly created_at: string;
  readonly entry_hash: string;
}

export interface OpenRouterProfileCompatibility {
  readonly contract_version: typeof OPENROUTER_PROFILE_COMPATIBILITY_CONTRACT_VERSION;
  readonly execution_profile_contract_version: string;
  readonly capability_ids: readonly string[];
  readonly executable_profile_ids: readonly [];
}

export interface OpenRouterRouteEligibilityRequirements {
  readonly current_evidence_required: true;
  readonly reviewed_evidence_required: true;
  readonly pricing_contract_required: true;
  readonly privacy_zdr_required: true;
  readonly exact_upstream_route_required: true;
  readonly benchmark_evidence_required: true;
  readonly structured_output_required: true;
}

export interface OpenRouterRouteRegistryRecord {
  readonly route_registry_contract_version: typeof OPENROUTER_ROUTE_REGISTRY_CONTRACT_VERSION;
  readonly route_record_id: string;
  readonly route_id: string;
  readonly route_version: string;
  readonly route_policy_id: string;
  readonly route_policy_version: string;
  readonly model_id: string;
  readonly provider_id: "openrouter";
  readonly upstream_provider_id: string;
  readonly allowed_model_entry_ids: readonly string[];
  readonly preferred_model_entry_order: readonly string[];
  readonly fallback_model_entry_order: readonly [];
  readonly upstream_provider_allowlist?: readonly string[];
  readonly upstream_provider_order?: readonly string[];
  readonly profile_compatibility: OpenRouterProfileCompatibility;
  readonly eligibility_requirements: OpenRouterRouteEligibilityRequirements;
  readonly allow_fallbacks: false;
  readonly data_collection: "deny";
  readonly structured_output_modes: readonly OpenRouterRegistryStructuredOutputMode[];
  readonly pricing_contract_id: string | null;
  readonly pricing_contract_version: string | null;
  readonly pricing_evidence_id: string;
  readonly pricing_evidence_hash: string;
  readonly privacy_evidence_id: string;
  readonly privacy_evidence_hash: string;
  readonly operational_evidence_id: string;
  readonly operational_evidence_hash: string;
  readonly route_verification_status: OpenRouterRouteVerification;
  readonly lifecycle: OpenRouterRegistryLifecycle;
  readonly enabled: false;
  readonly review_status: OpenRouterRegistryReviewStatus;
  readonly reviewed_at: string | null;
  readonly expires_at: string;
  readonly supersedes_route_record_id: string | null;
  readonly created_at: string;
  readonly route_hash: string;
}

export interface OpenRouterModelRegistryData {
  readonly registry_contract_version: typeof OPENROUTER_MODEL_REGISTRY_CONTRACT_VERSION;
  readonly canonicalization_version: typeof OPENROUTER_REGISTRY_CANONICALIZATION_VERSION;
  readonly entries: readonly OpenRouterModelRegistryEntry[];
}

export interface OpenRouterRouteRegistryData {
  readonly route_registry_contract_version: typeof OPENROUTER_ROUTE_REGISTRY_CONTRACT_VERSION;
  readonly canonicalization_version: typeof OPENROUTER_REGISTRY_CANONICALIZATION_VERSION;
  readonly routes: readonly OpenRouterRouteRegistryRecord[];
}

export interface OpenRouterRegistryDependencies {
  readonly provider_evidence: readonly ProviderEvidenceRecord[];
  readonly pricing_entries: readonly unknown[];
  readonly capability_ids: readonly string[];
  readonly execution_profiles: readonly {
    readonly profile_id: string;
    readonly provider_id: string;
  }[];
  readonly adapter_config: OpenRouterAdapterConfig;
}

export interface OpenRouterRegistryReadiness {
  readonly lifecycle: OpenRouterRegistryLifecycle;
  readonly executable: false;
  readonly blockers: readonly string[];
}

const MODEL_ID = /^[a-z0-9][a-z0-9.-]*\/[a-z0-9][a-z0-9.:-]*$/;
const ID = /^[a-z0-9][a-z0-9._:-]+$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const HASH = /^[a-f0-9]{64}$/;
const PROVIDER_ID = /^[a-z0-9][a-z0-9-]*$/;
const ACTIVE_LIFECYCLES: readonly OpenRouterRegistryLifecycle[] = [
  "discovered",
  "evidence_incomplete",
  "benchmark_pending",
  "candidate",
  "approved",
  "degraded",
];

const ENTRY_KEYS: readonly (keyof OpenRouterModelRegistryEntry)[] = [
  "registry_contract_version",
  "entry_id",
  "entry_version",
  "model_id",
  "model_revision",
  "route_id",
  "provider_id",
  "upstream_provider_id",
  "upstream_route_verification",
  "capability_ids",
  "supported_input_modalities",
  "supported_output_modalities",
  "structured_output_modes",
  "tool_calling",
  "context_window_tokens",
  "maximum_output_tokens",
  "usage_mapping_version",
  "pricing_contract_id",
  "pricing_contract_version",
  "pricing_evidence_id",
  "pricing_evidence_hash",
  "privacy_evidence_id",
  "privacy_evidence_hash",
  "operational_evidence_id",
  "operational_evidence_hash",
  "model_evidence_refs",
  "benchmark_evidence_ids",
  "route_policy_id",
  "route_policy_version",
  "lifecycle",
  "enabled",
  "review_status",
  "reviewed_at",
  "expires_at",
  "supersedes_entry_id",
  "created_at",
  "entry_hash",
];

const ROUTE_KEYS: readonly (keyof OpenRouterRouteRegistryRecord)[] = [
  "route_registry_contract_version",
  "route_record_id",
  "route_id",
  "route_version",
  "route_policy_id",
  "route_policy_version",
  "model_id",
  "provider_id",
  "upstream_provider_id",
  "allowed_model_entry_ids",
  "preferred_model_entry_order",
  "fallback_model_entry_order",
  "upstream_provider_allowlist",
  "upstream_provider_order",
  "profile_compatibility",
  "eligibility_requirements",
  "allow_fallbacks",
  "data_collection",
  "structured_output_modes",
  "pricing_contract_id",
  "pricing_contract_version",
  "pricing_evidence_id",
  "pricing_evidence_hash",
  "privacy_evidence_id",
  "privacy_evidence_hash",
  "operational_evidence_id",
  "operational_evidence_hash",
  "route_verification_status",
  "lifecycle",
  "enabled",
  "review_status",
  "reviewed_at",
  "expires_at",
  "supersedes_route_record_id",
  "created_at",
  "route_hash",
];
const REQUIRED_ROUTE_KEYS = ROUTE_KEYS.filter(
  (key) =>
    key !== "upstream_provider_allowlist" && key !== "upstream_provider_order",
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonical(value: unknown, ancestors = new Set<object>()): string {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value))
      throw new Error("registry_non_integer_number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new Error("registry_cyclic_value");
    ancestors.add(value);
    const result = `[${value.map((item) => canonical(item, ancestors)).join(",")}]`;
    ancestors.delete(value);
    return result;
  }
  if (isRecord(value)) {
    if (Object.getPrototypeOf(value) !== Object.prototype)
      throw new Error("registry_exotic_object");
    if (ancestors.has(value)) throw new Error("registry_cyclic_value");
    ancestors.add(value);
    const keys = Object.keys(value).sort();
    const result = `{${keys
      .map(
        (key) => `${JSON.stringify(key)}:${canonical(value[key], ancestors)}`,
      )
      .join(",")}}`;
    ancestors.delete(value);
    return result;
  }
  throw new Error("registry_unsupported_json_value");
}

export function canonicalizeOpenRouterRegistryJson(value: unknown): string {
  return canonical(value);
}

function sha256(domain: string, value: unknown): string {
  return createHash("sha256")
    .update(domain)
    .update("\n")
    .update(canonicalizeOpenRouterRegistryJson(value))
    .digest("hex");
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function normalizedEvidenceRefs(
  refs: readonly EvidenceHashReference[],
): readonly EvidenceHashReference[] {
  return [...refs].sort((left, right) =>
    left.evidence_id.localeCompare(right.evidence_id),
  );
}

function entryHashPayload(entry: OpenRouterModelRegistryEntry): unknown {
  const payload = { ...entry } as Record<string, unknown>;
  delete payload["entry_hash"];
  return {
    ...payload,
    capability_ids: sortedUnique(entry.capability_ids),
    supported_input_modalities: sortedUnique(entry.supported_input_modalities),
    supported_output_modalities: sortedUnique(
      entry.supported_output_modalities,
    ),
    structured_output_modes: sortedUnique(entry.structured_output_modes),
    model_evidence_refs: normalizedEvidenceRefs(entry.model_evidence_refs),
    benchmark_evidence_ids: sortedUnique(entry.benchmark_evidence_ids),
  };
}

function routeHashPayload(route: OpenRouterRouteRegistryRecord): unknown {
  const payload = { ...route } as Record<string, unknown>;
  delete payload["route_hash"];
  return {
    ...payload,
    ...(route.upstream_provider_allowlist
      ? {
          upstream_provider_allowlist: sortedUnique(
            route.upstream_provider_allowlist,
          ),
        }
      : {}),
    allowed_model_entry_ids: sortedUnique(route.allowed_model_entry_ids),
    structured_output_modes: sortedUnique(route.structured_output_modes),
    profile_compatibility: {
      ...route.profile_compatibility,
      capability_ids: sortedUnique(route.profile_compatibility.capability_ids),
    },
  };
}

export function computeOpenRouterEntryHash(
  entry: OpenRouterModelRegistryEntry,
): string {
  return sha256(OPENROUTER_ENTRY_HASH_DOMAIN, entryHashPayload(entry));
}

export function computeOpenRouterRouteHash(
  route: OpenRouterRouteRegistryRecord,
): string {
  return sha256(OPENROUTER_ROUTE_HASH_DOMAIN, routeHashPayload(route));
}

function validInstant(value: unknown): value is string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    return false;
  return new Date(value).toISOString() === value;
}

function compareSemver(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function duplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isEvidenceReferenceArray(
  value: unknown,
): value is readonly EvidenceHashReference[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (reference) =>
        isRecord(reference) &&
        Object.keys(reference).every((key) =>
          ["evidence_id", "evidence_hash"].includes(key),
        ) &&
        ID.test(String(reference["evidence_id"] ?? "")) &&
        HASH.test(String(reference["evidence_hash"] ?? "")),
    )
  );
}

function validateEvidenceReference(
  entry: OpenRouterModelRegistryEntry,
  id: string,
  hash: string,
  expectedCategory: ProviderEvidenceRecord["category"],
  dependencies: OpenRouterRegistryDependencies,
  errors: Set<string>,
): ProviderEvidenceRecord | undefined {
  const mismatch =
    expectedCategory === "zdr_status"
      ? "privacy_evidence_mismatch"
      : expectedCategory === "provider_routing"
        ? "operational_evidence_mismatch"
        : "pricing_evidence_mismatch";
  if (!id || !HASH.test(hash)) {
    errors.add("missing_evidence_hash");
    return undefined;
  }
  const evidence = dependencies.provider_evidence.find(
    (record) => record.evidence_id === id,
  );
  if (!evidence) {
    errors.add("missing_evidence");
    return undefined;
  }
  if (evidence.evidence_hash !== hash || computeEvidenceHash(evidence) !== hash)
    errors.add("evidence_hash_mismatch");
  if (evidence.category !== expectedCategory) errors.add(mismatch);
  if (
    evidence.provider_id !== "openrouter" ||
    evidence.model_id !== entry.model_id ||
    evidence.upstream_provider_id !== entry.upstream_provider_id ||
    evidence.applicability.scope === "provider_wide"
  )
    errors.add(mismatch);
  return evidence;
}

function readinessBlockers(
  entry: OpenRouterModelRegistryEntry,
  dependencies: OpenRouterRegistryDependencies,
  now: Date,
): readonly string[] {
  const blockers = new Set<string>();
  const evidence = dependencies.provider_evidence;
  const modelEvidenceRefs = isEvidenceReferenceArray(entry.model_evidence_refs)
    ? entry.model_evidence_refs
    : [];
  const referenced = [
    entry.pricing_evidence_id,
    entry.privacy_evidence_id,
    entry.operational_evidence_id,
    ...modelEvidenceRefs.map((reference) => reference.evidence_id),
  ]
    .filter((id): id is string => typeof id === "string")
    .map((id) => evidence.find((record) => record.evidence_id === id));
  if (referenced.some((record) => record === undefined))
    blockers.add("missing_evidence");
  for (const record of referenced.filter(
    (item): item is ProviderEvidenceRecord => item !== undefined,
  )) {
    if (Date.parse(record.expires_at) <= now.getTime())
      blockers.add("expired_evidence");
    if (record.review.status !== "reviewed_approved")
      blockers.add("unreviewed_evidence");
    if (record.status === "unknown") blockers.add("unknown_evidence");
    if (
      record.status === "conflicting" ||
      record.conflict_status === "unresolved"
    )
      blockers.add("conflicting_evidence");
  }
  if (!entry.pricing_contract_id || !entry.pricing_contract_version)
    blockers.add("pricing_contract_missing");
  if (
    !isStringArray(entry.benchmark_evidence_ids) ||
    entry.benchmark_evidence_ids.length === 0
  )
    blockers.add("benchmark_evidence_missing");
  if (entry.upstream_route_verification !== "verified_exact")
    blockers.add("route_not_verified_exact");
  if (entry.review_status !== "reviewed_approved")
    blockers.add("review_not_approved");
  if (validateOpenRouterDefaultConfig(dependencies.adapter_config).length > 0)
    blockers.add("adapter_configuration_invalid");
  if (dependencies.adapter_config.enabled === false)
    blockers.add("adapter_disabled");
  return [...blockers].sort();
}

export function evaluateOpenRouterRegistryReadiness(
  entry: OpenRouterModelRegistryEntry,
  dependencies: OpenRouterRegistryDependencies,
  now: Date,
): OpenRouterRegistryReadiness {
  const blockers = readinessBlockers(entry, dependencies, now);
  const expired = blockers.includes("expired_evidence");
  const lifecycle: OpenRouterRegistryLifecycle = expired
    ? entry.lifecycle === "discovered" ||
      entry.lifecycle === "evidence_incomplete"
      ? "evidence_incomplete"
      : "degraded"
    : entry.lifecycle;
  return { lifecycle, executable: false, blockers };
}

function validateEntryShape(
  value: unknown,
  dependencies: OpenRouterRegistryDependencies,
  now: Date,
): readonly string[] {
  const errors = new Set<string>();
  if (!isRecord(value)) return ["entry_not_an_object"];
  for (const key of Object.keys(value)) {
    if (!(ENTRY_KEYS as readonly string[]).includes(key))
      errors.add(`unknown_entry_field:${key}`);
  }
  for (const key of ENTRY_KEYS)
    if (!(key in value)) errors.add(`missing_entry_field:${key}`);
  const entry = value as unknown as OpenRouterModelRegistryEntry;
  if (
    entry.registry_contract_version !==
    OPENROUTER_MODEL_REGISTRY_CONTRACT_VERSION
  )
    errors.add("unsupported_registry_contract_version");
  if (!ID.test(entry.entry_id ?? "") || !SEMVER.test(entry.entry_version ?? ""))
    errors.add("invalid_entry_identity");
  if (!MODEL_ID.test(entry.model_id ?? "")) errors.add("malformed_model_id");
  else if (entry.model_id.startsWith("openrouter/"))
    errors.add("pseudo_model_forbidden");
  if (entry.provider_id !== "openrouter") errors.add("invalid_provider_id");
  if (!PROVIDER_ID.test(entry.upstream_provider_id ?? ""))
    errors.add("missing_upstream_identity");
  if (
    !(OPENROUTER_ROUTE_VERIFICATION_STATES as readonly unknown[]).includes(
      entry.upstream_route_verification,
    )
  )
    errors.add("unknown_route_verification");
  if (
    !(OPENROUTER_REGISTRY_LIFECYCLES as readonly unknown[]).includes(
      entry.lifecycle,
    )
  )
    errors.add("unknown_lifecycle");
  if (
    !(OPENROUTER_REGISTRY_REVIEW_STATUSES as readonly unknown[]).includes(
      entry.review_status,
    )
  )
    errors.add("unknown_review_status");
  if (
    !Array.isArray(entry.capability_ids) ||
    entry.capability_ids.length === 0 ||
    !entry.capability_ids.every((id) => typeof id === "string") ||
    duplicates(entry.capability_ids)
  )
    errors.add("invalid_capability_ids");
  else if (
    entry.capability_ids.some((id) => !dependencies.capability_ids.includes(id))
  )
    errors.add("unknown_capability");
  if (
    !Array.isArray(entry.supported_input_modalities) ||
    entry.supported_input_modalities.some(
      (item) => !["text", "image", "audio", "video"].includes(item),
    )
  )
    errors.add("invalid_input_modalities");
  if (
    !Array.isArray(entry.supported_output_modalities) ||
    entry.supported_output_modalities.some(
      (item) => !["text", "image", "audio"].includes(item),
    )
  )
    errors.add("invalid_output_modalities");
  if (
    !Array.isArray(entry.structured_output_modes) ||
    entry.structured_output_modes.some(
      (item) => !["json_object", "json_schema"].includes(item),
    )
  )
    errors.add("invalid_structured_output_modes");
  if (!isEvidenceReferenceArray(entry.model_evidence_refs))
    errors.add("invalid_model_evidence_refs");
  if (
    !isStringArray(entry.benchmark_evidence_ids) ||
    duplicates(entry.benchmark_evidence_ids)
  )
    errors.add("invalid_benchmark_evidence_ids");
  if (entry.tool_calling !== null && typeof entry.tool_calling !== "boolean")
    errors.add("invalid_tool_calling");
  for (const [name, amount] of [
    ["context_window_tokens", entry.context_window_tokens],
    ["maximum_output_tokens", entry.maximum_output_tokens],
  ] as const) {
    if (amount !== null && (!Number.isSafeInteger(amount) || amount <= 0))
      errors.add(`invalid_${name}`);
  }
  if (entry.usage_mapping_version !== OPENROUTER_USAGE_NORMALIZATION_VERSION)
    errors.add("unsupported_usage_mapping_version");
  if (
    (entry.pricing_contract_id === null) !==
    (entry.pricing_contract_version === null)
  )
    errors.add("incomplete_pricing_identity");
  if (
    entry.pricing_contract_version !== null &&
    entry.pricing_contract_version !== PRICE_CONTRACT_VERSION
  )
    errors.add("unsupported_pricing_version");
  if (entry.route_policy_version !== OPENROUTER_ROUTE_POLICY_CONTRACT_VERSION)
    errors.add("unsupported_route_policy_version");
  if (!ID.test(entry.route_id ?? "") || !ID.test(entry.route_policy_id ?? ""))
    errors.add("invalid_route_identity");
  if (entry.enabled !== false) {
    errors.add("enabled_entry_forbidden");
    errors.add("registry_execution_enable_forbidden");
    if (dependencies.adapter_config.enabled === false)
      errors.add("adapter_disabled_executable_state");
  }
  if (!validInstant(entry.reviewed_at) && entry.reviewed_at !== null)
    errors.add("invalid_reviewed_at");
  if (!validInstant(entry.expires_at)) errors.add("invalid_expires_at");
  if (!validInstant(entry.created_at)) errors.add("invalid_created_at");
  if (
    validInstant(entry.reviewed_at) &&
    Date.parse(entry.reviewed_at) > now.getTime()
  )
    errors.add("future_review_date");
  if (
    validInstant(entry.reviewed_at) &&
    validInstant(entry.expires_at) &&
    Date.parse(entry.expires_at) <= Date.parse(entry.reviewed_at)
  )
    errors.add("expiry_before_review");
  if (
    ["benchmark_pending", "candidate", "approved", "degraded"].includes(
      entry.lifecycle,
    ) &&
    entry.reviewed_at === null
  )
    errors.add("missing_review");
  if (entry.supersedes_entry_id === entry.entry_id)
    errors.add("self_supersession");
  const hashableEntry =
    isStringArray(entry.capability_ids) &&
    isStringArray(entry.supported_input_modalities) &&
    isStringArray(entry.supported_output_modalities) &&
    isStringArray(entry.structured_output_modes) &&
    isEvidenceReferenceArray(entry.model_evidence_refs) &&
    isStringArray(entry.benchmark_evidence_ids);
  if (!HASH.test(entry.entry_hash ?? "")) errors.add("invalid_entry_hash");
  else if (!hashableEntry) errors.add("invalid_entry_hash_payload");
  else if (computeOpenRouterEntryHash(entry) !== entry.entry_hash)
    errors.add("entry_hash_mismatch");
  const credential = findCredentialShapedField(value);
  if (credential) errors.add(`credential_shaped_field:${credential}`);

  validateEvidenceReference(
    entry,
    entry.pricing_evidence_id,
    entry.pricing_evidence_hash,
    "pricing",
    dependencies,
    errors,
  );
  validateEvidenceReference(
    entry,
    entry.privacy_evidence_id,
    entry.privacy_evidence_hash,
    "zdr_status",
    dependencies,
    errors,
  );
  const operational = validateEvidenceReference(
    entry,
    entry.operational_evidence_id,
    entry.operational_evidence_hash,
    "provider_routing",
    dependencies,
    errors,
  );
  if (
    operational?.applicability.route_mode === "variable" &&
    entry.upstream_route_verification === "verified_exact"
  )
    errors.add("variable_route_marked_exact");
  for (const reference of isEvidenceReferenceArray(entry.model_evidence_refs)
    ? entry.model_evidence_refs
    : []) {
    const evidence = dependencies.provider_evidence.find(
      (record) => record.evidence_id === reference.evidence_id,
    );
    if (!evidence) errors.add("missing_evidence");
    else {
      if (
        evidence.evidence_hash !== reference.evidence_hash ||
        computeEvidenceHash(evidence) !== reference.evidence_hash
      )
        errors.add("evidence_hash_mismatch");
      if (
        evidence.provider_id !== "openrouter" ||
        evidence.model_id !== entry.model_id ||
        evidence.upstream_provider_id !== entry.upstream_provider_id ||
        evidence.applicability.scope === "provider_wide"
      )
        errors.add("generic_evidence_used_as_model_evidence");
    }
  }
  if (entry.pricing_contract_id !== null) {
    const price = dependencies.pricing_entries.find(
      (candidate) =>
        isRecord(candidate) &&
        candidate["pricing_id"] === entry.pricing_contract_id,
    );
    if (
      !price ||
      !validatePricingEntry(price) ||
      price.provider_id !== "openrouter" ||
      price.model_id !== entry.model_id ||
      price.pricing_contract_version !== entry.pricing_contract_version ||
      price.evidence.evidence_id !== entry.pricing_evidence_id ||
      price.evidence.evidence_hash !== entry.pricing_evidence_hash
    )
      errors.add("pricing_evidence_mismatch");
  }
  const blockers = readinessBlockers(entry, dependencies, now);
  if (blockers.includes("expired_evidence")) errors.add("stale_evidence");
  if (
    entry.lifecycle === "candidate" &&
    blockers.some((blocker) => blocker !== "adapter_disabled")
  )
    errors.add("candidate_not_ready");
  if (
    entry.lifecycle === "approved" &&
    (!isStringArray(entry.benchmark_evidence_ids) ||
      entry.benchmark_evidence_ids.length === 0 ||
      blockers.some((blocker) => blocker !== "adapter_disabled"))
  )
    errors.add("approved_without_complete_evidence_or_benchmark");
  return [...errors].sort();
}

function validateRouteShape(
  value: unknown,
  dependencies: OpenRouterRegistryDependencies,
  now: Date,
): readonly string[] {
  const errors = new Set<string>();
  if (!isRecord(value)) return ["route_not_an_object"];
  for (const key of Object.keys(value)) {
    if (!(ROUTE_KEYS as readonly string[]).includes(key))
      errors.add(`unknown_route_field:${key}`);
  }
  for (const key of REQUIRED_ROUTE_KEYS)
    if (!(key in value)) errors.add(`missing_route_field:${key}`);
  const route = value as unknown as OpenRouterRouteRegistryRecord;
  if (
    route.route_registry_contract_version !==
    OPENROUTER_ROUTE_REGISTRY_CONTRACT_VERSION
  )
    errors.add("unsupported_route_registry_contract_version");
  if (
    !ID.test(route.route_record_id ?? "") ||
    !ID.test(route.route_id ?? "") ||
    !SEMVER.test(route.route_version ?? "")
  )
    errors.add("invalid_route_identity");
  if (
    !ID.test(route.route_policy_id ?? "") ||
    route.route_policy_version !== OPENROUTER_ROUTE_POLICY_CONTRACT_VERSION
  )
    errors.add("unsupported_route_policy_version");
  if (!MODEL_ID.test(route.model_id ?? "")) errors.add("malformed_model_id");
  else if (route.model_id.startsWith("openrouter/"))
    errors.add("pseudo_model_forbidden");
  if (route.provider_id !== "openrouter") errors.add("invalid_provider_id");
  if (!PROVIDER_ID.test(route.upstream_provider_id ?? ""))
    errors.add("missing_upstream_identity");
  const allowedModelEntryIds = isStringArray(route.allowed_model_entry_ids)
    ? route.allowed_model_entry_ids
    : undefined;
  const preferredModelEntryOrder = isStringArray(
    route.preferred_model_entry_order,
  )
    ? route.preferred_model_entry_order
    : undefined;
  const fallbackModelEntryOrder = isStringArray(
    route.fallback_model_entry_order,
  )
    ? route.fallback_model_entry_order
    : undefined;
  if (
    !allowedModelEntryIds ||
    allowedModelEntryIds.length === 0 ||
    duplicates(allowedModelEntryIds) ||
    allowedModelEntryIds.some((id) => !ID.test(id))
  )
    errors.add("invalid_allowed_model_references");
  if (
    !preferredModelEntryOrder ||
    preferredModelEntryOrder.length === 0 ||
    duplicates(preferredModelEntryOrder) ||
    preferredModelEntryOrder.some((id) => !allowedModelEntryIds?.includes(id))
  )
    errors.add("invalid_preferred_model_order");
  if (
    allowedModelEntryIds &&
    preferredModelEntryOrder &&
    (allowedModelEntryIds.length !== preferredModelEntryOrder.length ||
      allowedModelEntryIds.some((id) => !preferredModelEntryOrder.includes(id)))
  )
    errors.add("incomplete_preferred_model_order");
  if (!fallbackModelEntryOrder || fallbackModelEntryOrder.length > 0)
    errors.add("unsafe_fallback_route");
  if (route.allow_fallbacks !== false) errors.add("route_fallback_enabled");
  if (route.data_collection !== "deny")
    errors.add("data_collection_not_denied");
  if (
    !isStringArray(route.structured_output_modes) ||
    route.structured_output_modes.length === 0 ||
    duplicates(route.structured_output_modes) ||
    route.structured_output_modes.some(
      (item) => !["json_object", "json_schema"].includes(item),
    )
  )
    errors.add("invalid_structured_output_modes");
  if (
    !(OPENROUTER_ROUTE_VERIFICATION_STATES as readonly unknown[]).includes(
      route.route_verification_status,
    )
  )
    errors.add("unknown_route_verification");
  if (
    !(OPENROUTER_REGISTRY_LIFECYCLES as readonly unknown[]).includes(
      route.lifecycle,
    )
  )
    errors.add("unknown_lifecycle");
  if (
    !(OPENROUTER_REGISTRY_REVIEW_STATUSES as readonly unknown[]).includes(
      route.review_status,
    )
  )
    errors.add("unknown_review_status");
  if (route.enabled !== false) {
    errors.add("enabled_route_forbidden");
    errors.add("registry_execution_enable_forbidden");
    if (dependencies.adapter_config.enabled === false)
      errors.add("adapter_disabled_executable_state");
  }
  const allowlist = isStringArray(route.upstream_provider_allowlist)
    ? route.upstream_provider_allowlist
    : undefined;
  const providerOrder = isStringArray(route.upstream_provider_order)
    ? route.upstream_provider_order
    : undefined;
  if (
    route.upstream_provider_allowlist !== undefined &&
    (!allowlist ||
      allowlist.length === 0 ||
      duplicates(allowlist) ||
      allowlist.some((id) => !PROVIDER_ID.test(id)))
  )
    errors.add("invalid_upstream_provider_allowlist");
  if (
    route.upstream_provider_order !== undefined &&
    (!providerOrder ||
      providerOrder.length === 0 ||
      duplicates(providerOrder) ||
      providerOrder.some((id) => !PROVIDER_ID.test(id)))
  )
    errors.add("invalid_upstream_provider_order");
  if (
    route.route_verification_status === "verified_exact" &&
    !allowlist?.includes(route.upstream_provider_id)
  )
    errors.add("exact_route_without_upstream_allowlist");
  if (providerOrder && !allowlist)
    errors.add("provider_order_without_allowlist");
  if (providerOrder?.some((id) => !allowlist?.includes(id)))
    errors.add("provider_order_outside_allowlist");
  if (allowlist && providerOrder && allowlist.length !== providerOrder.length)
    errors.add("provider_order_incomplete");
  const profileCompatibility = isRecord(route.profile_compatibility)
    ? route.profile_compatibility
    : undefined;
  const profileCapabilityIds = isStringArray(
    profileCompatibility?.["capability_ids"],
  )
    ? profileCompatibility["capability_ids"]
    : undefined;
  const executableProfileIds = isStringArray(
    profileCompatibility?.["executable_profile_ids"],
  )
    ? profileCompatibility["executable_profile_ids"]
    : undefined;
  if (
    profileCompatibility?.["contract_version"] !==
      OPENROUTER_PROFILE_COMPATIBILITY_CONTRACT_VERSION ||
    !SEMVER.test(
      String(
        profileCompatibility?.["execution_profile_contract_version"] ?? "",
      ),
    ) ||
    !profileCapabilityIds ||
    profileCapabilityIds.length === 0 ||
    duplicates(profileCapabilityIds) ||
    !executableProfileIds
  )
    errors.add("invalid_profile_compatibility");
  if ((executableProfileIds?.length ?? 0) > 0)
    errors.add("executable_profile_reference");
  const eligibility = isRecord(route.eligibility_requirements)
    ? route.eligibility_requirements
    : undefined;
  if (
    !eligibility ||
    Object.keys(eligibility).length !== 7 ||
    [
      "current_evidence_required",
      "reviewed_evidence_required",
      "pricing_contract_required",
      "privacy_zdr_required",
      "exact_upstream_route_required",
      "benchmark_evidence_required",
      "structured_output_required",
    ].some((key) => eligibility[key] !== true)
  )
    errors.add("invalid_eligibility_requirements");
  if (
    profileCapabilityIds?.some(
      (id) => !dependencies.capability_ids.includes(id),
    )
  )
    errors.add("unknown_capability");
  if (
    dependencies.execution_profiles.some(
      (profile) => profile.provider_id === "openrouter",
    )
  )
    errors.add("openrouter_execution_profile_present");
  if (
    (route.pricing_contract_id === null) !==
    (route.pricing_contract_version === null)
  )
    errors.add("incomplete_pricing_identity");
  if (
    route.pricing_contract_version !== null &&
    route.pricing_contract_version !== PRICE_CONTRACT_VERSION
  )
    errors.add("unsupported_pricing_version");
  if (!validInstant(route.reviewed_at) && route.reviewed_at !== null)
    errors.add("invalid_reviewed_at");
  if (
    ["benchmark_pending", "candidate", "approved", "degraded"].includes(
      route.lifecycle,
    ) &&
    route.reviewed_at === null
  )
    errors.add("missing_review");
  if (
    validInstant(route.reviewed_at) &&
    Date.parse(route.reviewed_at) > now.getTime()
  )
    errors.add("future_review_date");
  if (!validInstant(route.expires_at)) errors.add("invalid_expires_at");
  if (!validInstant(route.created_at)) errors.add("invalid_created_at");
  if (
    validInstant(route.reviewed_at) &&
    validInstant(route.expires_at) &&
    Date.parse(route.expires_at) <= Date.parse(route.reviewed_at)
  )
    errors.add("expiry_before_review");
  if (route.supersedes_route_record_id === route.route_record_id)
    errors.add("self_supersession");
  const hashableRoute =
    isStringArray(route.allowed_model_entry_ids) &&
    isStringArray(route.preferred_model_entry_order) &&
    isStringArray(route.fallback_model_entry_order) &&
    isStringArray(route.structured_output_modes) &&
    isRecord(route.profile_compatibility) &&
    isRecord(route.eligibility_requirements) &&
    isStringArray(route.profile_compatibility.capability_ids) &&
    (route.upstream_provider_allowlist === undefined ||
      isStringArray(route.upstream_provider_allowlist));
  if (!HASH.test(route.route_hash ?? "")) errors.add("invalid_route_hash");
  else if (!hashableRoute) errors.add("invalid_route_hash_payload");
  else if (computeOpenRouterRouteHash(route) !== route.route_hash)
    errors.add("route_hash_mismatch");
  const credential = findCredentialShapedField(value);
  if (credential) errors.add(`credential_shaped_field:${credential}`);
  const syntheticEntry = {
    model_id: route.model_id,
    upstream_provider_id: route.upstream_provider_id,
  } as OpenRouterModelRegistryEntry;
  const operational = validateEvidenceReference(
    syntheticEntry,
    route.operational_evidence_id,
    route.operational_evidence_hash,
    "provider_routing",
    dependencies,
    errors,
  );
  validateEvidenceReference(
    syntheticEntry,
    route.pricing_evidence_id,
    route.pricing_evidence_hash,
    "pricing",
    dependencies,
    errors,
  );
  validateEvidenceReference(
    syntheticEntry,
    route.privacy_evidence_id,
    route.privacy_evidence_hash,
    "zdr_status",
    dependencies,
    errors,
  );
  if (
    operational?.applicability.route_mode === "variable" &&
    route.route_verification_status === "verified_exact"
  )
    errors.add("variable_route_marked_exact");
  return [...errors].sort();
}

function validateSupersessionChains<
  T extends {
    readonly entry_id?: string;
    readonly entry_version?: string;
    readonly supersedes_entry_id?: string | null;
    readonly route_record_id?: string;
    readonly route_version?: string;
    readonly supersedes_route_record_id?: string | null;
    readonly model_id: string;
    readonly route_id: string;
  },
>(records: readonly T[], kind: "entry" | "route"): readonly string[] {
  const errors = new Set<string>();
  const id = (record: T) =>
    kind === "entry" ? record.entry_id! : record.route_record_id!;
  const version = (record: T) =>
    kind === "entry" ? record.entry_version! : record.route_version!;
  const parent = (record: T) =>
    kind === "entry"
      ? record.supersedes_entry_id
      : record.supersedes_route_record_id;
  const byId = new Map(records.map((record) => [id(record), record]));
  for (const record of records) {
    const parentId = parent(record);
    if (!parentId) continue;
    if (parentId === id(record)) errors.add("self_supersession");
    const previous = byId.get(parentId);
    if (!previous) errors.add("broken_supersession_chain");
    else {
      if (
        previous.model_id !== record.model_id ||
        previous.route_id !== record.route_id
      )
        errors.add("broken_supersession_chain");
      if (compareSemver(version(record), version(previous)) <= 0)
        errors.add("version_regression");
    }
    const visited = new Set<string>([id(record)]);
    let cursor = previous;
    while (cursor) {
      const cursorId = id(cursor);
      if (visited.has(cursorId)) {
        errors.add("supersession_cycle");
        break;
      }
      visited.add(cursorId);
      const next = parent(cursor);
      cursor = next ? byId.get(next) : undefined;
    }
  }
  return [...errors].sort();
}

export function validateOpenRouterRegistry(
  models: unknown,
  routes: unknown,
  dependencies: OpenRouterRegistryDependencies,
  now: Date,
): readonly string[] {
  const errors = new Set<string>();
  if (isRecord(models)) {
    for (const key of Object.keys(models)) {
      if (
        ![
          "registry_contract_version",
          "canonicalization_version",
          "entries",
        ].includes(key)
      )
        errors.add(`unknown_model_registry_field:${key}`);
    }
  }
  if (isRecord(routes)) {
    for (const key of Object.keys(routes)) {
      if (
        ![
          "route_registry_contract_version",
          "canonicalization_version",
          "routes",
        ].includes(key)
      )
        errors.add(`unknown_route_registry_field:${key}`);
    }
  }
  if (
    !isRecord(models) ||
    models["registry_contract_version"] !==
      OPENROUTER_MODEL_REGISTRY_CONTRACT_VERSION
  )
    errors.add("unsupported_registry_contract_version");
  if (
    !isRecord(routes) ||
    routes["route_registry_contract_version"] !==
      OPENROUTER_ROUTE_REGISTRY_CONTRACT_VERSION
  )
    errors.add("unsupported_route_registry_contract_version");
  if (
    isRecord(models) &&
    models["canonicalization_version"] !==
      OPENROUTER_REGISTRY_CANONICALIZATION_VERSION
  )
    errors.add("unsupported_canonicalization_version");
  if (
    isRecord(routes) &&
    routes["canonicalization_version"] !==
      OPENROUTER_REGISTRY_CANONICALIZATION_VERSION
  )
    errors.add("unsupported_canonicalization_version");
  const entries =
    isRecord(models) && Array.isArray(models["entries"])
      ? (models["entries"] as unknown[])
      : [];
  const routeRecords =
    isRecord(routes) && Array.isArray(routes["routes"])
      ? (routes["routes"] as unknown[])
      : [];
  if (entries.length === 0) errors.add("empty_model_registry");
  if (routeRecords.length === 0) errors.add("empty_route_registry");
  for (const entry of entries)
    for (const error of validateEntryShape(entry, dependencies, now))
      errors.add(error);
  for (const route of routeRecords)
    for (const error of validateRouteShape(route, dependencies, now))
      errors.add(error);
  const typedEntries = entries
    .filter(isRecord)
    .filter(
      (entry) =>
        typeof entry["entry_id"] === "string" &&
        typeof entry["entry_version"] === "string" &&
        typeof entry["model_id"] === "string" &&
        typeof entry["route_id"] === "string",
    ) as unknown as OpenRouterModelRegistryEntry[];
  const typedRoutes = routeRecords
    .filter(isRecord)
    .filter(
      (route) =>
        typeof route["route_record_id"] === "string" &&
        typeof route["route_version"] === "string" &&
        typeof route["model_id"] === "string" &&
        typeof route["route_id"] === "string",
    ) as unknown as OpenRouterRouteRegistryRecord[];
  if (
    duplicates(
      typedEntries.map((entry) => `${entry.entry_id}@${entry.entry_version}`),
    )
  )
    errors.add("duplicate_entry_id_version");
  if (duplicates(typedEntries.map((entry) => entry.entry_id)))
    errors.add("duplicate_entry_id");
  if (
    duplicates(
      typedRoutes.map((route) => `${route.route_id}@${route.route_version}`),
    )
  )
    errors.add("duplicate_route_id_version");
  if (duplicates(typedRoutes.map((route) => route.route_record_id)))
    errors.add("duplicate_route_record_id");
  for (const error of validateSupersessionChains(typedEntries, "entry"))
    errors.add(error);
  for (const error of validateSupersessionChains(typedRoutes, "route"))
    errors.add(error);
  for (const entry of typedEntries) {
    const route = typedRoutes.find(
      (candidate) =>
        candidate.route_id === entry.route_id &&
        candidate.route_version === entry.entry_version,
    );
    if (
      !route ||
      route.model_id !== entry.model_id ||
      route.provider_id !== entry.provider_id ||
      route.upstream_provider_id !== entry.upstream_provider_id ||
      route.route_policy_id !== entry.route_policy_id ||
      route.route_policy_version !== entry.route_policy_version ||
      !isStringArray(route.structured_output_modes) ||
      !isStringArray(entry.structured_output_modes) ||
      canonicalizeOpenRouterRegistryJson(
        sortedUnique(route.structured_output_modes),
      ) !==
        canonicalizeOpenRouterRegistryJson(
          sortedUnique(entry.structured_output_modes),
        ) ||
      !isRecord(route.profile_compatibility) ||
      !isStringArray(route.profile_compatibility.capability_ids) ||
      !isStringArray(entry.capability_ids) ||
      canonicalizeOpenRouterRegistryJson(
        sortedUnique(route.profile_compatibility.capability_ids),
      ) !==
        canonicalizeOpenRouterRegistryJson(
          sortedUnique(entry.capability_ids),
        ) ||
      route.lifecycle !== entry.lifecycle ||
      route.enabled !== entry.enabled ||
      route.review_status !== entry.review_status ||
      route.pricing_contract_id !== entry.pricing_contract_id ||
      route.pricing_contract_version !== entry.pricing_contract_version ||
      route.pricing_evidence_id !== entry.pricing_evidence_id ||
      route.pricing_evidence_hash !== entry.pricing_evidence_hash ||
      route.privacy_evidence_id !== entry.privacy_evidence_id ||
      route.privacy_evidence_hash !== entry.privacy_evidence_hash ||
      route.operational_evidence_id !== entry.operational_evidence_id ||
      route.operational_evidence_hash !== entry.operational_evidence_hash
    )
      errors.add("model_route_mismatch");
  }
  for (const route of typedRoutes) {
    const allowedEntryIds = isStringArray(route.allowed_model_entry_ids)
      ? route.allowed_model_entry_ids
      : [];
    const referencedEntries = allowedEntryIds.map((entryId) =>
      typedEntries.find((entry) => entry.entry_id === entryId),
    );
    if (referencedEntries.some((entry) => entry === undefined))
      errors.add("unknown_model_reference");
    if (
      referencedEntries.some(
        (entry) =>
          entry !== undefined &&
          (entry.model_id !== route.model_id ||
            entry.route_id !== route.route_id ||
            entry.entry_version !== route.route_version),
      )
    )
      errors.add("route_model_reference_mismatch");
    const exactEntry = typedEntries.find(
      (entry) =>
        entry.model_id === route.model_id &&
        entry.route_id === route.route_id &&
        entry.entry_version === route.route_version,
    );
    if (!exactEntry || !allowedEntryIds.includes(exactEntry.entry_id))
      errors.add("orphan_route_reference");
  }
  const supersededEntries = new Set(
    typedEntries.map((entry) => entry.supersedes_entry_id).filter(Boolean),
  );
  const activeEntryKeys = typedEntries
    .filter(
      (entry) =>
        ACTIVE_LIFECYCLES.includes(entry.lifecycle) &&
        !supersededEntries.has(entry.entry_id),
    )
    .map((entry) => `${entry.model_id}|${entry.route_id}`);
  if (duplicates(activeEntryKeys)) errors.add("ambiguous_active_model_route");
  const supersededRoutes = new Set(
    typedRoutes
      .map((route) => route.supersedes_route_record_id)
      .filter(Boolean),
  );
  const activeRouteKeys = typedRoutes
    .filter(
      (route) =>
        ACTIVE_LIFECYCLES.includes(route.lifecycle) &&
        !supersededRoutes.has(route.route_record_id),
    )
    .map((route) => route.route_id);
  if (duplicates(activeRouteKeys)) errors.add("ambiguous_active_route");
  return [...errors].sort();
}

const ALLOWED_TRANSITIONS: Readonly<
  Record<OpenRouterRegistryLifecycle, readonly OpenRouterRegistryLifecycle[]>
> = {
  discovered: ["evidence_incomplete", "blocked", "retired"],
  evidence_incomplete: ["benchmark_pending", "blocked", "retired"],
  benchmark_pending: ["candidate", "evidence_incomplete", "blocked", "retired"],
  candidate: ["approved", "degraded", "blocked", "retired"],
  approved: ["degraded", "blocked", "retired"],
  degraded: ["evidence_incomplete", "benchmark_pending", "blocked", "retired"],
  blocked: ["evidence_incomplete", "retired"],
  retired: [],
};

export function validateOpenRouterLifecycleTransition(
  from: OpenRouterRegistryLifecycle,
  to: OpenRouterRegistryLifecycle,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export class OpenRouterRegistry {
  readonly entries: readonly OpenRouterModelRegistryEntry[];
  readonly routes: readonly OpenRouterRouteRegistryRecord[];

  constructor(
    models: OpenRouterModelRegistryData,
    routes: OpenRouterRouteRegistryData,
    dependencies: OpenRouterRegistryDependencies,
    now: Date,
  ) {
    const errors = validateOpenRouterRegistry(
      models,
      routes,
      dependencies,
      now,
    );
    if (errors.length > 0)
      throw new Error(`OPENROUTER_REGISTRY_INVALID:${errors.join(",")}`);
    this.entries = [...models.entries].sort((left, right) =>
      `${left.entry_id}@${left.entry_version}`.localeCompare(
        `${right.entry_id}@${right.entry_version}`,
      ),
    );
    this.routes = [...routes.routes].sort((left, right) =>
      `${left.route_id}@${left.route_version}`.localeCompare(
        `${right.route_id}@${right.route_version}`,
      ),
    );
  }

  resolveByEntryIdVersion(
    entryId: string,
    entryVersion: string,
  ): OpenRouterModelRegistryEntry | undefined {
    return this.entries.find(
      (entry) =>
        entry.entry_id === entryId && entry.entry_version === entryVersion,
    );
  }

  resolveByModelRouteVersion(
    modelId: string,
    routeId: string,
    version: string,
  ): OpenRouterModelRegistryEntry | undefined {
    return this.entries.find(
      (entry) =>
        entry.model_id === modelId &&
        entry.route_id === routeId &&
        entry.entry_version === version,
    );
  }

  resolveRoute(
    routeId: string,
    routeVersion: string,
  ): OpenRouterRouteRegistryRecord | undefined {
    return this.routes.find(
      (route) =>
        route.route_id === routeId && route.route_version === routeVersion,
    );
  }

  listEntryVersions(
    modelId: string,
    routeId: string,
  ): readonly OpenRouterModelRegistryEntry[] {
    return this.entries.filter(
      (entry) => entry.model_id === modelId && entry.route_id === routeId,
    );
  }
}

export function defaultOpenRouterRegistryDependencies(): OpenRouterRegistryDependencies {
  return {
    provider_evidence: (
      providerEvidenceJson as { evidence: ProviderEvidenceRecord[] }
    ).evidence,
    pricing_entries: (pricingCatalogJson as { prices: unknown[] }).prices,
    capability_ids: (
      capabilityCatalogJson as { capabilities: { capability_id: string }[] }
    ).capabilities.map((entry) => entry.capability_id),
    execution_profiles: (
      executionProfilesJson as {
        profiles: { profile_id: string; provider_id: string }[];
      }
    ).profiles,
    adapter_config: adapterConfigJson as OpenRouterAdapterConfig,
  };
}

export function loadOpenRouterRegistry(now: Date): OpenRouterRegistry {
  return new OpenRouterRegistry(
    modelRegistryJson as OpenRouterModelRegistryData,
    routeRegistryJson as unknown as OpenRouterRouteRegistryData,
    defaultOpenRouterRegistryDependencies(),
    now,
  );
}

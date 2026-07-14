import { createHash } from "node:crypto";

import executionProfilesJson from "../../config/ai-execution-profiles.json" with { type: "json" };
import providerEvidenceJson from "../../config/ai-provider-evidence.json" with { type: "json" };
import {
  OPENROUTER_MODEL_REGISTRY_CONTRACT_VERSION,
  OPENROUTER_REGISTRY_CANONICALIZATION_VERSION,
  OPENROUTER_ROUTE_REGISTRY_CONTRACT_VERSION,
  canonicalizeOpenRouterRegistryJson,
  loadOpenRouterRegistry,
  type OpenRouterRegistry,
} from "./openrouter-registry.js";
import {
  computeEvidenceHash,
  type ProviderEvidenceRecord,
} from "./provider-evidence.js";

export const OPENROUTER_READINESS_DOSSIER_CONTRACT_VERSION = "1.0.0" as const;
export const OPENROUTER_READINESS_DOSSIER_HASH_DOMAIN =
  "vlatam-ai-lab:openrouter-readiness-dossier:v1" as const;

export const OPENROUTER_DOSSIER_EVIDENCE_STATES = [
  "missing",
  "unverified",
  "verified",
  "expired",
  "conflicting",
  "not_applicable",
] as const;
export type OpenRouterDossierEvidenceState =
  (typeof OPENROUTER_DOSSIER_EVIDENCE_STATES)[number];

export const OPENROUTER_DOSSIER_EVIDENCE_CATEGORIES = [
  "exact_model_identifier",
  "exact_upstream_route",
  "model_lifecycle_release",
  "context_window_limits",
  "modalities",
  "structured_output_json_schema",
  "tool_function_calling",
  "pricing",
  "privacy_policy",
  "retention",
  "training_data_use",
  "zdr",
  "geography_jurisdiction",
  "terms_acceptable_use",
  "capability_benchmark",
  "latency_reliability",
  "known_limitations",
] as const;
export type OpenRouterDossierEvidenceCategory =
  (typeof OPENROUTER_DOSSIER_EVIDENCE_CATEGORIES)[number];

export const MANDATORY_OPENROUTER_DOSSIER_EVIDENCE = [
  "exact_model_identifier",
  "exact_upstream_route",
  "model_lifecycle_release",
  "context_window_limits",
  "modalities",
  "structured_output_json_schema",
  "pricing",
  "privacy_policy",
  "retention",
  "training_data_use",
  "zdr",
  "geography_jurisdiction",
  "terms_acceptable_use",
  "capability_benchmark",
  "known_limitations",
] as const satisfies readonly OpenRouterDossierEvidenceCategory[];

export interface OpenRouterDossierSource {
  readonly source_kind: "repository_evidence" | "externally_reviewed_evidence";
  readonly evidence_id: string;
  readonly locator: string;
  readonly integrity_hash: string;
}

export interface OpenRouterDossierEvidenceSection {
  readonly category: OpenRouterDossierEvidenceCategory;
  readonly mandatory: boolean;
  readonly state: OpenRouterDossierEvidenceState;
  readonly claims: Readonly<Record<string, unknown>>;
  readonly sources: readonly OpenRouterDossierSource[];
  readonly retrieved_at: string | null;
  readonly reviewer_id: string | null;
  readonly reviewed_at: string | null;
  readonly expires_at: string | null;
  readonly summary: string;
  readonly limitations: readonly string[];
}

export interface OpenRouterReadinessDossier {
  readonly dossier_contract_version: typeof OPENROUTER_READINESS_DOSSIER_CONTRACT_VERSION;
  readonly dossier_id: string;
  readonly dossier_version: string;
  readonly canonicalization_version: typeof OPENROUTER_REGISTRY_CANONICALIZATION_VERSION;
  readonly candidate_path: {
    readonly provider_id: "openrouter";
    readonly openrouter_model_id: string;
    readonly upstream_provider_id: string;
    readonly upstream_model_id: string | null;
    readonly model_registry_entry_id: string;
    readonly model_registry_entry_version: string;
    readonly model_registry_entry_hash: string;
    readonly route_id: string;
    readonly route_record_id: string;
    readonly route_version: string;
    readonly route_hash: string;
    readonly route_policy_id: string;
    readonly route_policy_version: string;
    readonly execution_profile_candidate_id: string;
    readonly execution_profile_contract_version: string;
    readonly execution_profile_registry_presence: "absent" | "disabled";
    readonly capability_id: string;
  };
  readonly registry_contracts: {
    readonly model_registry_contract_version: string;
    readonly route_registry_contract_version: string;
    readonly registry_canonicalization_version: string;
  };
  readonly evidence: readonly OpenRouterDossierEvidenceSection[];
  readonly risks: readonly {
    readonly risk_id: string;
    readonly mandatory: boolean;
    readonly status: "open" | "resolved";
    readonly description: string;
    readonly resolution: string | null;
  }[];
  readonly human_approval: {
    readonly status: "pending" | "approved" | "rejected";
    readonly reviewer_id: string | null;
    readonly scope: "sandbox_enablement_proposal_only" | null;
    readonly decided_at: string | null;
    readonly expires_at: string | null;
    readonly decision_reason: string | null;
  };
  readonly created_at: string;
  readonly dossier_hash: string;
}

export type OpenRouterReadinessOutcome =
  | "not_ready"
  | "ready_for_sandbox_review"
  | "blocked"
  | "invalid_dossier";

export interface OpenRouterReadinessResult {
  readonly contract_version: typeof OPENROUTER_READINESS_DOSSIER_CONTRACT_VERSION;
  readonly dossier_id: string | null;
  readonly dossier_version: string | null;
  readonly evaluated_at: string;
  readonly outcome: OpenRouterReadinessOutcome;
  readonly reason_codes: readonly string[];
  readonly human_approval_verified: boolean;
  readonly execution_authorized: false;
  readonly provider_call_performed: false;
}

export interface OpenRouterReadinessDependencies {
  readonly registry: OpenRouterRegistry;
  readonly provider_evidence: readonly ProviderEvidenceRecord[];
  readonly execution_profiles: readonly {
    readonly profile_id: string;
    readonly provider_id: string;
    readonly enabled: boolean;
    readonly contract_version: string;
    readonly capability_id: string;
  }[];
}

const ID = /^[a-z0-9][a-z0-9._:-]+$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const HASH = /^[a-f0-9]{64}$/;
const MODEL = /^[a-z0-9][a-z0-9.-]*\/[a-z0-9][a-z0-9.:-]*$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
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

export function computeOpenRouterReadinessDossierHash(value: unknown): string {
  const withoutHash = isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).filter(([key]) => key !== "dossier_hash"),
      )
    : value;
  return createHash("sha256")
    .update(OPENROUTER_READINESS_DOSSIER_HASH_DOMAIN)
    .update("\n")
    .update(canonicalizeOpenRouterRegistryJson(withoutHash))
    .digest("hex");
}

export function defaultOpenRouterReadinessDependencies(
  evaluatedAt = new Date("2026-07-14T12:00:00.000Z"),
): OpenRouterReadinessDependencies {
  return {
    registry: loadOpenRouterRegistry(evaluatedAt),
    provider_evidence:
      providerEvidenceJson.evidence as readonly ProviderEvidenceRecord[],
    execution_profiles: executionProfilesJson.profiles,
  } as OpenRouterReadinessDependencies;
}

function structuralReasons(value: unknown): readonly string[] {
  const reasons = new Set<string>();
  if (!isRecord(value)) return ["dossier_not_object"];
  if (
    value["dossier_contract_version"] !==
    OPENROUTER_READINESS_DOSSIER_CONTRACT_VERSION
  )
    reasons.add("unsupported_contract_version");
  if (!ID.test(String(value["dossier_id"] ?? "")))
    reasons.add("invalid_dossier_id");
  if (!SEMVER.test(String(value["dossier_version"] ?? "")))
    reasons.add("invalid_dossier_version");
  if (
    value["canonicalization_version"] !==
    OPENROUTER_REGISTRY_CANONICALIZATION_VERSION
  )
    reasons.add("invalid_canonicalization_version");
  if (!validInstant(value["created_at"])) reasons.add("invalid_created_at");
  if (!HASH.test(String(value["dossier_hash"] ?? "")))
    reasons.add("invalid_dossier_hash_shape");
  else if (
    computeOpenRouterReadinessDossierHash(value) !== value["dossier_hash"]
  )
    reasons.add("dossier_hash_mismatch");
  const path = value["candidate_path"];
  if (!isRecord(path)) reasons.add("candidate_path_missing");
  else {
    if (path["provider_id"] !== "openrouter") reasons.add("provider_invalid");
    if (!MODEL.test(String(path["openrouter_model_id"] ?? "")))
      reasons.add("model_identity_invalid");
    for (const key of [
      "upstream_provider_id",
      "model_registry_entry_id",
      "route_id",
      "route_record_id",
      "route_policy_id",
      "execution_profile_candidate_id",
      "capability_id",
    ])
      if (!ID.test(String(path[key] ?? ""))) reasons.add(`invalid_${key}`);
    for (const key of [
      "model_registry_entry_version",
      "route_version",
      "route_policy_version",
      "execution_profile_contract_version",
    ])
      if (!SEMVER.test(String(path[key] ?? ""))) reasons.add(`invalid_${key}`);
    for (const key of ["model_registry_entry_hash", "route_hash"])
      if (!HASH.test(String(path[key] ?? ""))) reasons.add(`invalid_${key}`);
  }
  if (!Array.isArray(value["evidence"])) reasons.add("evidence_missing");
  if (!Array.isArray(value["risks"])) reasons.add("risks_missing");
  if (!isRecord(value["human_approval"])) reasons.add("approval_missing");
  return [...reasons].sort();
}

function validateIdentity(
  dossier: OpenRouterReadinessDossier,
  dependencies: OpenRouterReadinessDependencies,
): readonly string[] {
  const reasons = new Set<string>();
  const path = dossier.candidate_path;
  if (
    dossier.registry_contracts.model_registry_contract_version !==
      OPENROUTER_MODEL_REGISTRY_CONTRACT_VERSION ||
    dossier.registry_contracts.route_registry_contract_version !==
      OPENROUTER_ROUTE_REGISTRY_CONTRACT_VERSION ||
    dossier.registry_contracts.registry_canonicalization_version !==
      OPENROUTER_REGISTRY_CANONICALIZATION_VERSION
  )
    reasons.add("registry_contract_invalid");
  const entry = dependencies.registry.entries.find(
    (candidate) => candidate.entry_id === path.model_registry_entry_id,
  );
  const route = dependencies.registry.routes.find(
    (candidate) => candidate.route_record_id === path.route_record_id,
  );
  if (!entry) reasons.add("model_registry_reference_missing");
  if (!route) reasons.add("route_registry_reference_missing");
  if (entry) {
    if (
      entry.entry_version !== path.model_registry_entry_version ||
      entry.entry_hash !== path.model_registry_entry_hash ||
      entry.model_id !== path.openrouter_model_id ||
      entry.provider_id !== path.provider_id ||
      entry.upstream_provider_id !== path.upstream_provider_id ||
      entry.route_id !== path.route_id ||
      !entry.capability_ids.includes(path.capability_id)
    )
      reasons.add("model_registry_identity_mismatch");
    if (entry.lifecycle === "blocked" || entry.lifecycle === "retired")
      reasons.add("unsupported_lifecycle");
    if (entry.enabled) reasons.add("registry_entry_enabled_forbidden");
  }
  if (route) {
    if (
      route.route_id !== path.route_id ||
      route.route_version !== path.route_version ||
      route.route_hash !== path.route_hash ||
      route.route_policy_id !== path.route_policy_id ||
      route.route_policy_version !== path.route_policy_version ||
      route.model_id !== path.openrouter_model_id ||
      route.provider_id !== path.provider_id ||
      route.upstream_provider_id !== path.upstream_provider_id ||
      !route.allowed_model_entry_ids.includes(path.model_registry_entry_id) ||
      !route.profile_compatibility.capability_ids.includes(
        path.capability_id,
      ) ||
      route.profile_compatibility.execution_profile_contract_version !==
        path.execution_profile_contract_version
    )
      reasons.add("route_registry_identity_mismatch");
    if (route.enabled) reasons.add("route_enabled_forbidden");
    if (route.lifecycle === "blocked" || route.lifecycle === "retired")
      reasons.add("unsupported_lifecycle");
  }
  const profile = dependencies.execution_profiles.find(
    (candidate) => candidate.profile_id === path.execution_profile_candidate_id,
  );
  if (path.execution_profile_registry_presence === "absent" && profile)
    reasons.add("profile_identity_mismatch");
  if (path.execution_profile_registry_presence === "disabled") {
    if (
      !profile ||
      profile.enabled ||
      profile.provider_id !== "openrouter" ||
      profile.contract_version !== path.execution_profile_contract_version ||
      profile.capability_id !== path.capability_id
    )
      reasons.add("profile_identity_mismatch");
  }
  return [...reasons].sort();
}

function validateEvidence(
  dossier: OpenRouterReadinessDossier,
  dependencies: OpenRouterReadinessDependencies,
  now: number,
): {
  invalid: readonly string[];
  blocking: readonly string[];
  incomplete: readonly string[];
} {
  const invalid = new Set<string>();
  const blocking = new Set<string>();
  const incomplete = new Set<string>();
  const byCategory = new Map<
    OpenRouterDossierEvidenceCategory,
    OpenRouterDossierEvidenceSection
  >();
  for (const section of dossier.evidence) {
    if (!OPENROUTER_DOSSIER_EVIDENCE_CATEGORIES.includes(section.category)) {
      invalid.add("unsupported_evidence_category");
      continue;
    }
    if (byCategory.has(section.category))
      invalid.add("duplicate_evidence_category");
    byCategory.set(section.category, section);
    const expectedMandatory = (
      MANDATORY_OPENROUTER_DOSSIER_EVIDENCE as readonly string[]
    ).includes(section.category);
    if (section.mandatory !== expectedMandatory)
      invalid.add("evidence_mandatory_flag_mismatch");
    if (section.state === "expired" || section.state === "conflicting")
      blocking.add(`${section.category}:${section.state}`);
    if (
      expectedMandatory &&
      (section.state === "missing" ||
        section.state === "unverified" ||
        section.state === "not_applicable")
    )
      incomplete.add(`${section.category}:${section.state}`);
    if (
      section.state === "verified" &&
      (!section.reviewer_id ||
        !section.reviewed_at ||
        !section.retrieved_at ||
        !section.expires_at)
    )
      incomplete.add(`${section.category}:review_metadata_missing`);
    if (section.expires_at && Date.parse(section.expires_at) <= now)
      blocking.add(`${section.category}:expired`);
    for (const source of section.sources) {
      if (source.source_kind === "externally_reviewed_evidence") continue;
      const evidence = dependencies.provider_evidence.find(
        (record) => record.evidence_id === source.evidence_id,
      );
      if (!evidence) invalid.add("repository_evidence_reference_missing");
      else if (
        source.locator !==
        `config/ai-provider-evidence.json#${source.evidence_id}`
      )
        invalid.add("repository_evidence_locator_mismatch");
      else if (
        source.integrity_hash !== evidence.evidence_hash ||
        computeEvidenceHash(evidence) !== evidence.evidence_hash
      )
        invalid.add("evidence_hash_mismatch");
    }
  }
  for (const category of OPENROUTER_DOSSIER_EVIDENCE_CATEGORIES)
    if (!byCategory.has(category))
      invalid.add(`evidence_category_missing:${category}`);

  const pricing = byCategory.get("pricing");
  if (pricing) {
    const claims = pricing.claims;
    if (
      typeof claims["pricing_identity"] !== "string" ||
      typeof claims["effective_at"] !== "string" ||
      typeof claims["input_price"] !== "string" ||
      typeof claims["cached_input_price"] !== "string" ||
      typeof claims["output_price"] !== "string"
    )
      incomplete.add("pricing_identity_incomplete");
    if (claims["variable"] === true && !isRecord(claims["bounded_policy"]))
      blocking.add("variable_pricing_without_bounded_policy");
  }
  const route = byCategory.get("exact_upstream_route");
  if (route?.claims["verification"] !== "verified_exact")
    incomplete.add("exact_upstream_route_not_proven");
  const structured = byCategory.get("structured_output_json_schema");
  if (structured?.claims["json_schema_suitable"] !== true)
    incomplete.add("structured_output_unverified");
  const benchmark = byCategory.get("capability_benchmark");
  if (
    benchmark?.claims["capability_id"] !== dossier.candidate_path.capability_id
  )
    incomplete.add("capability_benchmark_missing");
  for (const category of [
    "privacy_policy",
    "retention",
    "training_data_use",
    "zdr",
  ] as const)
    if (byCategory.get(category)?.state !== "verified")
      incomplete.add(`${category}_incompatible_or_missing`);
  return {
    invalid: [...invalid].sort(),
    blocking: [...blocking].sort(),
    incomplete: [...incomplete].sort(),
  };
}

export function evaluateOpenRouterReadinessDossier(
  value: unknown,
  evaluatedAt: Date,
  dependencies?: OpenRouterReadinessDependencies,
): OpenRouterReadinessResult {
  const effectiveDependencies =
    dependencies ?? defaultOpenRouterReadinessDependencies(evaluatedAt);
  const structural = structuralReasons(value);
  const safe = isRecord(value) ? value : {};
  const base = {
    contract_version: OPENROUTER_READINESS_DOSSIER_CONTRACT_VERSION,
    dossier_id:
      typeof safe["dossier_id"] === "string" ? safe["dossier_id"] : null,
    dossier_version:
      typeof safe["dossier_version"] === "string"
        ? safe["dossier_version"]
        : null,
    evaluated_at: evaluatedAt.toISOString(),
    human_approval_verified: false,
    execution_authorized: false as const,
    provider_call_performed: false as const,
  };
  if (structural.length > 0)
    return deepFreeze({
      ...base,
      outcome: "invalid_dossier",
      reason_codes: structural,
    });

  const dossier = value as OpenRouterReadinessDossier;
  const identity = validateIdentity(dossier, effectiveDependencies);
  const evidence = validateEvidence(
    dossier,
    effectiveDependencies,
    evaluatedAt.getTime(),
  );
  const openRisks = dossier.risks
    .filter((risk) => risk.mandatory && risk.status !== "resolved")
    .map((risk) => `unresolved_mandatory_risk:${risk.risk_id}`);
  const invalid = [...identity, ...evidence.invalid].sort();
  if (invalid.length > 0)
    return deepFreeze({
      ...base,
      outcome: "invalid_dossier",
      reason_codes: invalid,
    });

  const blocking = [...evidence.blocking, ...openRisks].sort();
  if (blocking.length > 0)
    return deepFreeze({ ...base, outcome: "blocked", reason_codes: blocking });

  const approval = dossier.human_approval;
  const approvalReasons: string[] = [];
  if (approval.status !== "approved")
    approvalReasons.push("human_approval_missing");
  if (!approval.reviewer_id) approvalReasons.push("human_reviewer_missing");
  if (approval.scope !== "sandbox_enablement_proposal_only")
    approvalReasons.push("approval_scope_mismatch");
  if (!approval.decided_at || !validInstant(approval.decided_at))
    approvalReasons.push("approval_timestamp_missing");
  if (!approval.expires_at || !validInstant(approval.expires_at))
    approvalReasons.push("approval_expiry_missing");
  else if (Date.parse(approval.expires_at) <= evaluatedAt.getTime())
    approvalReasons.push("approval_expired");
  if (!approval.decision_reason)
    approvalReasons.push("approval_reason_missing");
  const incomplete = [...evidence.incomplete, ...approvalReasons].sort();
  if (incomplete.length > 0)
    return deepFreeze({
      ...base,
      outcome: "not_ready",
      reason_codes: incomplete,
    });

  return deepFreeze({
    ...base,
    outcome: "ready_for_sandbox_review",
    reason_codes: [],
    human_approval_verified: true,
  });
}

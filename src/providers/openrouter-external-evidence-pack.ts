import { createHash } from "node:crypto";

import evidencePackJson from "../../config/ai-openrouter-external-evidence-pack.json" with { type: "json" };
import { canonicalizeOpenRouterRegistryJson } from "./openrouter-registry.js";

export const OPENROUTER_EXTERNAL_EVIDENCE_PACK_CONTRACT_VERSION =
  "1.0.0" as const;
export const OPENROUTER_EXTERNAL_EVIDENCE_PACK_HASH_DOMAIN =
  "vlatam-ai-lab:openrouter-external-evidence-pack:v1" as const;

export const OPENROUTER_EXTERNAL_EVIDENCE_STATES = [
  "missing",
  "unverified",
  "verified",
  "expired",
  "conflicting",
  "not_applicable",
] as const;
export type OpenRouterExternalEvidenceState =
  (typeof OPENROUTER_EXTERNAL_EVIDENCE_STATES)[number];

export const OPENROUTER_EXTERNAL_EVIDENCE_SOURCE_TYPES = [
  "official_openrouter_documentation",
  "official_openrouter_model_metadata",
  "official_upstream_documentation",
  "official_provider_policy",
  "official_terms",
  "original_model_card",
  "primary_benchmark_publication",
  "authoritative_legal_material",
] as const;
export type OpenRouterExternalEvidenceSourceType =
  (typeof OPENROUTER_EXTERNAL_EVIDENCE_SOURCE_TYPES)[number];

export const OPENROUTER_EXTERNAL_EVIDENCE_CATEGORIES = [
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
export type OpenRouterExternalEvidenceCategory =
  (typeof OPENROUTER_EXTERNAL_EVIDENCE_CATEGORIES)[number];

export interface OpenRouterEvidenceBinding {
  readonly dossier_id: string;
  readonly provider_id: "openrouter";
  readonly openrouter_model_id: string;
  readonly upstream_provider_id: string;
  readonly upstream_model_id: string | null;
  readonly model_registry_entry_id: string;
  readonly route_record_id: string;
  readonly execution_profile_candidate_id: string;
  readonly capability_id: string;
}

export interface OpenRouterExternalEvidenceRecord {
  readonly evidence_id: string;
  readonly category: OpenRouterExternalEvidenceCategory;
  readonly claim: string;
  readonly source: {
    readonly title: string;
    readonly publisher: string;
    readonly canonical_url: string;
    readonly source_type: OpenRouterExternalEvidenceSourceType;
    readonly retrieved_at: string;
    readonly published_or_effective_at: string | null;
  };
  readonly normalized_fact: string;
  readonly state: OpenRouterExternalEvidenceState;
  readonly reviewer_id: string | null;
  readonly reviewed_at: string | null;
  readonly re_review_at: string;
  readonly integrity_hash: string;
  readonly conflicts_with: readonly string[];
  readonly limitations: readonly string[];
  readonly bindings: OpenRouterEvidenceBinding;
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface OpenRouterExternalEvidencePack {
  readonly pack_contract_version: typeof OPENROUTER_EXTERNAL_EVIDENCE_PACK_CONTRACT_VERSION;
  readonly pack_id: string;
  readonly pack_version: string;
  readonly canonicalization_version: "registry-json-v1";
  readonly candidate_path: OpenRouterEvidenceBinding;
  readonly collected_at: string;
  readonly records: readonly OpenRouterExternalEvidenceRecord[];
  readonly sandbox_budget_proposal: {
    readonly metadata_only: true;
    readonly maximum_requests: number;
    readonly maximum_input_tokens_per_request: number;
    readonly maximum_output_tokens_per_request: number;
    readonly maximum_total_sandbox_spend: string;
    readonly currency: "USD";
    readonly permitted_model_id: string;
    readonly permitted_upstream_provider_id: string;
    readonly no_fallback: true;
    readonly automatic_retries: 0;
    readonly invocation_mode: "manual_only";
    readonly expires_at: string;
    readonly kill_switch_required: true;
  };
  readonly human_approval: {
    readonly status: "pending";
    readonly reviewer_id: null;
    readonly decided_at: null;
  };
  readonly execution_authorized: false;
  readonly provider_call_performed: false;
  readonly pack_hash: string;
}

export interface OpenRouterExternalEvidenceEvaluation {
  readonly contract_version: typeof OPENROUTER_EXTERNAL_EVIDENCE_PACK_CONTRACT_VERSION;
  readonly pack_id: string | null;
  readonly evaluated_at: string;
  readonly outcome: "blocked" | "not_ready" | "reviewable" | "invalid_pack";
  readonly reason_codes: readonly string[];
  readonly execution_authorized: false;
  readonly provider_call_performed: false;
}

const ID = /^[a-z0-9][a-z0-9._:-]+$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const HASH = /^[a-f0-9]{64}$/;
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

function hash(domain: string, value: unknown, omittedKey: string): string {
  const normalized = isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).filter(([key]) => key !== omittedKey),
      )
    : value;
  return createHash("sha256")
    .update(domain)
    .update("\n")
    .update(canonicalizeOpenRouterRegistryJson(normalized))
    .digest("hex");
}

export function computeOpenRouterExternalEvidenceRecordHash(
  value: unknown,
): string {
  return hash(
    "vlatam-ai-lab:openrouter-external-evidence-record:v1",
    value,
    "integrity_hash",
  );
}

export function computeOpenRouterExternalEvidencePackHash(
  value: unknown,
): string {
  return hash(
    OPENROUTER_EXTERNAL_EVIDENCE_PACK_HASH_DOMAIN,
    value,
    "pack_hash",
  );
}

export function loadOpenRouterExternalEvidencePack(): OpenRouterExternalEvidencePack {
  return structuredClone(evidencePackJson) as OpenRouterExternalEvidencePack;
}

function sameBinding(
  actual: OpenRouterEvidenceBinding,
  expected: OpenRouterEvidenceBinding,
): boolean {
  return (
    canonicalizeOpenRouterRegistryJson(actual) ===
    canonicalizeOpenRouterRegistryJson(expected)
  );
}

export function evaluateOpenRouterExternalEvidencePack(
  value: unknown,
  evaluatedAt: Date,
): OpenRouterExternalEvidenceEvaluation {
  const invalid = new Set<string>();
  const blocking = new Set<string>();
  const incomplete = new Set<string>();
  const safe = isRecord(value) ? value : {};
  const base = {
    contract_version: OPENROUTER_EXTERNAL_EVIDENCE_PACK_CONTRACT_VERSION,
    pack_id: typeof safe["pack_id"] === "string" ? safe["pack_id"] : null,
    evaluated_at: evaluatedAt.toISOString(),
    execution_authorized: false as const,
    provider_call_performed: false as const,
  };
  if (!isRecord(value)) invalid.add("pack_not_object");
  else {
    if (
      value["pack_contract_version"] !==
      OPENROUTER_EXTERNAL_EVIDENCE_PACK_CONTRACT_VERSION
    )
      invalid.add("unsupported_contract_version");
    if (!ID.test(String(value["pack_id"] ?? "")))
      invalid.add("invalid_pack_id");
    if (!SEMVER.test(String(value["pack_version"] ?? "")))
      invalid.add("invalid_pack_version");
    if (!validInstant(value["collected_at"]))
      invalid.add("invalid_collected_at");
    if (!HASH.test(String(value["pack_hash"] ?? "")))
      invalid.add("invalid_pack_hash_shape");
    else if (
      computeOpenRouterExternalEvidencePackHash(value) !== value["pack_hash"]
    )
      invalid.add("pack_hash_mismatch");
    if (value["execution_authorized"] !== false)
      invalid.add("execution_authorization_forbidden");
    if (value["provider_call_performed"] !== false)
      invalid.add("provider_call_forbidden");
  }
  if (invalid.size > 0)
    return deepFreeze({
      ...base,
      outcome: "invalid_pack",
      reason_codes: [...invalid].sort(),
    });

  const pack = value as OpenRouterExternalEvidencePack;
  const seen = new Set<string>();
  const byCategory = new Map<
    OpenRouterExternalEvidenceCategory,
    OpenRouterExternalEvidenceRecord[]
  >();
  for (const record of pack.records) {
    if (seen.has(record.evidence_id)) invalid.add("duplicate_evidence_id");
    seen.add(record.evidence_id);
    if (!ID.test(record.evidence_id)) invalid.add("invalid_evidence_id");
    if (!OPENROUTER_EXTERNAL_EVIDENCE_CATEGORIES.includes(record.category))
      invalid.add("unsupported_evidence_category");
    if (
      !OPENROUTER_EXTERNAL_EVIDENCE_SOURCE_TYPES.includes(
        record.source.source_type,
      )
    )
      invalid.add("unsupported_source_type");
    if (
      !record.source.title ||
      !record.source.publisher ||
      !record.source.canonical_url.startsWith("https://") ||
      !validInstant(record.source.retrieved_at)
    )
      invalid.add("missing_source_metadata");
    if (!validInstant(record.re_review_at)) invalid.add("invalid_re_review_at");
    else if (Date.parse(record.re_review_at) <= evaluatedAt.getTime())
      blocking.add(`${record.evidence_id}:expired_review`);
    if (
      computeOpenRouterExternalEvidenceRecordHash(record) !==
      record.integrity_hash
    )
      invalid.add("evidence_hash_mismatch");
    if (!sameBinding(record.bindings, pack.candidate_path))
      invalid.add("claim_candidate_binding_mismatch");
    if (record.bindings.openrouter_model_id !== "minimax/minimax-m2.7")
      invalid.add("wrong_model_evidence");
    if (record.bindings.upstream_provider_id !== "minimax")
      invalid.add("wrong_provider_evidence");
    if (
      record.state === "verified" &&
      (!record.reviewer_id || !validInstant(record.reviewed_at))
    )
      incomplete.add(`${record.evidence_id}:reviewer_missing`);
    if (record.state === "expired" || record.state === "conflicting")
      blocking.add(`${record.evidence_id}:${record.state}`);
    if (record.state === "missing" || record.state === "unverified")
      incomplete.add(`${record.evidence_id}:${record.state}`);
    const categoryRecords = byCategory.get(record.category) ?? [];
    categoryRecords.push(record);
    byCategory.set(record.category, categoryRecords);
  }
  for (const record of pack.records)
    for (const conflict of record.conflicts_with)
      if (!seen.has(conflict)) invalid.add("conflict_reference_missing");
  for (const category of OPENROUTER_EXTERNAL_EVIDENCE_CATEGORIES)
    if (!byCategory.has(category))
      invalid.add(`evidence_category_missing:${category}`);

  const route = byCategory.get("exact_upstream_route") ?? [];
  if (route.some((record) => record.attributes["routing_variable"] === true))
    blocking.add("provider_routing_variability_explicit");
  if (
    !route.some(
      (record) => record.attributes["exact_endpoint_guaranteed"] === true,
    )
  )
    incomplete.add("exact_upstream_endpoint_unproven");

  const pricing = byCategory.get("pricing") ?? [];
  if (pricing.some((record) => record.attributes["variable"] === true)) {
    const budget = pack.sandbox_budget_proposal;
    if (
      !budget.metadata_only ||
      budget.maximum_requests <= 0 ||
      budget.maximum_input_tokens_per_request <= 0 ||
      budget.maximum_output_tokens_per_request <= 0 ||
      !budget.maximum_total_sandbox_spend ||
      !budget.no_fallback ||
      budget.automatic_retries !== 0 ||
      budget.invocation_mode !== "manual_only" ||
      !budget.kill_switch_required
    )
      blocking.add("variable_pricing_without_bounded_proposal");
  }
  const zdr = byCategory.get("zdr") ?? [];
  if (
    zdr.some(
      (record) =>
        record.attributes["conditional"] === true &&
        record.attributes["unconditional"] === true,
    )
  )
    invalid.add("conditional_zdr_treated_as_unconditional");
  if (
    !zdr.some((record) => record.attributes["exact_route_zdr_proven"] === true)
  )
    incomplete.add("exact_route_zdr_unproven");
  const structured = byCategory.get("structured_output_json_schema") ?? [];
  if (
    !structured.some(
      (record) => record.attributes["strict_json_schema_proven"] === true,
    )
  )
    incomplete.add("strict_json_schema_unproven");
  const benchmark = byCategory.get("capability_benchmark") ?? [];
  if (
    benchmark.some(
      (record) =>
        record.attributes["benchmark_capability_id"] !== undefined &&
        record.attributes["benchmark_capability_id"] !==
          pack.candidate_path.capability_id,
    )
  )
    invalid.add("irrelevant_benchmark_evidence");
  if (!benchmark.some((record) => record.state === "verified"))
    incomplete.add("capability_benchmark_unverified");
  const legal = byCategory.get("terms_acceptable_use") ?? [];
  if (
    !legal.some((record) => record.attributes["legal_review_complete"] === true)
  )
    incomplete.add("legal_review_pending");

  if (invalid.size > 0)
    return deepFreeze({
      ...base,
      outcome: "invalid_pack",
      reason_codes: [...invalid].sort(),
    });
  if (blocking.size > 0)
    return deepFreeze({
      ...base,
      outcome: "blocked",
      reason_codes: [...blocking].sort(),
    });
  if (incomplete.size > 0)
    return deepFreeze({
      ...base,
      outcome: "not_ready",
      reason_codes: [...incomplete].sort(),
    });
  return deepFreeze({ ...base, outcome: "reviewable", reason_codes: [] });
}

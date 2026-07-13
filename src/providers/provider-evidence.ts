import { createHash } from "node:crypto";

export const REQUIRED_EVIDENCE_CATEGORIES = [
  "provider_identity",
  "model_identity",
  "model_lifecycle",
  "api_endpoint",
  "context_limits",
  "structured_outputs",
  "tool_calling",
  "multimodal",
  "token_accounting",
  "cached_reasoning_token_accounting",
  "pricing",
  "provider_routing",
  "rate_concurrency_limits",
  "processing_regions",
  "retention",
  "training_use",
  "zdr_status",
  "security_compliance",
  "normative_claim_extraction",
  "contractual_operational_restrictions",
] as const;

export type EvidenceCategory = (typeof REQUIRED_EVIDENCE_CATEGORIES)[number];
export type EvidenceClaimStatus =
  | "accepted"
  | "rejected"
  | "conflicting"
  | "unknown";

export const PROVIDER_CANDIDATE_READINESS_RESULTS = [
  "READY_FOR_DISABLED_ADAPTER",
  "BLOCKED_EVIDENCE_INCOMPLETE",
  "BLOCKED_ROUTE_NOT_PINNABLE",
  "BLOCKED_PRIVACY",
  "BLOCKED_PRICING",
  "BLOCKED_CAPABILITY",
  "BLOCKED_SECRET_ABSENT",
  "BLOCKED_POLICY",
] as const;

export type ProviderCandidateReadinessResult =
  (typeof PROVIDER_CANDIDATE_READINESS_RESULTS)[number];

export interface ProviderEvidenceRecord {
  readonly evidence_id: string;
  readonly provider_id: "openrouter" | "minimax-direct";
  readonly model_id: string | null;
  readonly upstream_provider_id: string | null;
  readonly category: EvidenceCategory;
  readonly status: EvidenceClaimStatus;
  readonly value?: unknown;
  readonly source: {
    readonly title: string;
    readonly canonical_url: string;
    readonly publisher: string;
    readonly retrieved_at: string;
    readonly effective_at: string | null;
  };
  readonly applicability: {
    readonly scope: "provider_wide" | "model" | "endpoint" | "route";
    readonly exact_scope: string;
    readonly route_mode: "fixed" | "variable" | "not_applicable";
    readonly route_provider_id: string | null;
  };
  readonly review: {
    readonly status: "reviewed_approved" | "pending" | "rejected";
    readonly reviewed_at: string | null;
    readonly review_record_ref: string | null;
  };
  readonly expires_at: string;
  readonly finding: string;
  readonly limitations: readonly string[];
  readonly conflict_status: "none" | "unresolved" | "resolved";
  readonly conflicts_with: readonly string[];
  readonly evidence_hash: string;
}

export interface CandidateProfileReadiness {
  readonly profile_id: string;
  readonly provider_id: "openrouter" | "minimax-direct";
  readonly model_id: string | null;
  readonly upstream_provider_id: string | null;
  readonly lifecycle_status: "candidate";
  readonly enabled: false;
  readonly evidence_refs: readonly string[];
  readonly runtime_eligibility: "blocked" | "reviewed_candidate";
  readonly blocking_reasons: readonly string[];
}

const CREDENTIAL_FIELD =
  /api[_-]?key|password|bearer|authorization|client[_-]?secret|private[_-]?key|access[_-]?key/i;
const PRIVACY_CATEGORIES = [
  "processing_regions",
  "retention",
  "training_use",
  "zdr_status",
] as const satisfies readonly EvidenceCategory[];

function credentialShapedPath(value: unknown, path = ""): string | undefined {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = credentialShapedPath(value[index], `${path}[${index}]`);
      if (found) return found;
    }
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (CREDENTIAL_FIELD.test(key)) return path ? `${path}.${key}` : key;
      const found = credentialShapedPath(child, path ? `${path}.${key}` : key);
      if (found) return found;
    }
  }
  return undefined;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "evidence_hash")
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function computeEvidenceHash(
  record:
    | Omit<ProviderEvidenceRecord, "evidence_hash">
    | ProviderEvidenceRecord,
): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(record)))
    .digest("hex");
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function evaluateCandidateProfileReadiness(
  profile: CandidateProfileReadiness,
  catalog: readonly ProviderEvidenceRecord[],
  now: Date,
): readonly string[] {
  const reasons = new Set<string>();
  if (credentialShapedPath(profile) || credentialShapedPath(catalog))
    reasons.add("credential_shaped_field");

  const records = profile.evidence_refs.map((id) =>
    catalog.find((record) => record.evidence_id === id),
  );
  if (records.some((record) => record === undefined))
    reasons.add("missing_evidence");
  const present = records.filter(
    (record): record is ProviderEvidenceRecord => record !== undefined,
  );

  for (const record of present) {
    if (!validDate(record.source.retrieved_at))
      reasons.add("missing_retrieval_date");
    if (!validDate(record.expires_at)) reasons.add("missing_expiry");
    else if (Date.parse(record.expires_at) <= now.getTime())
      reasons.add("expired_evidence");
    if (record.review.status !== "reviewed_approved")
      reasons.add("unreviewed_evidence");
    if (
      !validDate(record.review.reviewed_at) ||
      !record.review.review_record_ref
    )
      reasons.add("missing_review_date");
    if (computeEvidenceHash(record) !== record.evidence_hash)
      reasons.add("evidence_hash_mismatch");
    if (record.provider_id !== profile.provider_id)
      reasons.add("profile_evidence_mismatch");
    if (record.model_id !== null && record.model_id !== profile.model_id)
      reasons.add("profile_evidence_mismatch");
    if (
      record.applicability.scope === "provider_wide" &&
      record.model_id !== null
    )
      reasons.add("provider_scope_mismatch");
    if (
      record.provider_id === "openrouter" &&
      record.upstream_provider_id !== null &&
      record.upstream_provider_id !== profile.upstream_provider_id
    )
      reasons.add("aggregator_upstream_scope_confusion");
    if (
      record.conflict_status === "unresolved" ||
      record.status === "conflicting"
    ) {
      reasons.add(
        record.category === "pricing"
          ? "contradictory_pricing"
          : "conflicting_evidence",
      );
    }
    if (
      record.category === "zdr_status" &&
      record.value === true &&
      record.status !== "accepted"
    )
      reasons.add("false_zdr_declaration");
    if (
      record.category === "provider_routing" &&
      record.applicability.route_mode === "variable"
    )
      reasons.add("variable_provider_routing");
  }

  const byCategory = new Map<EvidenceCategory, ProviderEvidenceRecord[]>();
  for (const record of present) {
    const entries = byCategory.get(record.category) ?? [];
    entries.push(record);
    byCategory.set(record.category, entries);
  }
  for (const category of REQUIRED_EVIDENCE_CATEGORIES) {
    if (!byCategory.has(category)) reasons.add("missing_evidence_category");
  }

  const modelIdentity = byCategory.get("model_identity") ?? [];
  if (
    profile.model_id === null ||
    !modelIdentity.some(
      (record) =>
        record.status === "accepted" && record.value === profile.model_id,
    )
  )
    reasons.add("ambiguous_model_identity");

  for (const category of [
    "structured_outputs",
    "tool_calling",
    "normative_claim_extraction",
  ] as const) {
    const claims = byCategory.get(category) ?? [];
    if (
      !claims.some(
        (record) => record.status === "accepted" && record.value !== false,
      )
    )
      reasons.add("unsupported_capability");
  }
  if (
    PRIVACY_CATEGORIES.some(
      (category) =>
        !(byCategory.get(category) ?? []).some(
          (record) => record.status === "accepted",
        ),
    )
  )
    reasons.add("privacy_unknown");
  if (
    !(byCategory.get("pricing") ?? []).some(
      (record) => record.status === "accepted",
    )
  )
    reasons.add("pricing_unknown");
  if (
    !(byCategory.get("rate_concurrency_limits") ?? []).some(
      (record) => record.status === "accepted",
    )
  )
    reasons.add("rate_limits_unknown");
  if (
    !(byCategory.get("security_compliance") ?? []).some(
      (record) => record.status === "accepted",
    )
  )
    reasons.add("security_compliance_unknown");

  if (profile.provider_id === "openrouter") {
    if (!profile.upstream_provider_id)
      reasons.add("missing_upstream_provider_evidence");
    const upstreamScoped = present.some(
      (record) =>
        record.upstream_provider_id === profile.upstream_provider_id &&
        record.applicability.route_provider_id ===
          profile.upstream_provider_id &&
        record.source.publisher === "MiniMax",
    );
    if (!upstreamScoped) reasons.add("missing_upstream_provider_evidence");
  }
  return [...reasons].sort();
}

export function assertCandidateProfileReady(
  profile: CandidateProfileReadiness,
  catalog: readonly ProviderEvidenceRecord[],
  now: Date,
): void {
  const reasons = evaluateCandidateProfileReadiness(profile, catalog, now);
  if (
    reasons.length > 0 ||
    profile.lifecycle_status !== "candidate" ||
    profile.enabled ||
    profile.runtime_eligibility !== "reviewed_candidate"
  ) {
    throw new Error(
      `PROVIDER_PROFILE_NOT_READY:${reasons.join(",") || "profile_state"}`,
    );
  }
}

/** Maps the fail-closed evidence evaluation to one stable AI-83 decision.
 * Evidence incompleteness intentionally wins when several independent
 * evidence classes are unresolved; narrower results are reserved for an
 * otherwise-complete candidate blocked by only that gate. */
export function determineProviderCandidateReadinessResult(
  reasons: readonly string[],
): ProviderCandidateReadinessResult {
  if (reasons.length === 0) return "READY_FOR_DISABLED_ADAPTER";

  const unique = new Set(reasons);
  const incomplete = [
    "missing_evidence",
    "missing_evidence_category",
    "missing_retrieval_date",
    "missing_review_date",
    "missing_expiry",
    "expired_evidence",
    "unreviewed_evidence",
    "evidence_hash_mismatch",
    "ambiguous_model_identity",
    "profile_evidence_mismatch",
    "provider_scope_mismatch",
    "aggregator_upstream_scope_confusion",
    "missing_upstream_provider_evidence",
    "rate_limits_unknown",
    "security_compliance_unknown",
  ].some((reason) => unique.has(reason));
  const independentBlocks = [
    "privacy_unknown",
    "pricing_unknown",
    "contradictory_pricing",
    "unsupported_capability",
    "variable_provider_routing",
  ].filter((reason) => unique.has(reason));

  if (incomplete || independentBlocks.length > 1)
    return "BLOCKED_EVIDENCE_INCOMPLETE";
  if (unique.has("variable_provider_routing"))
    return "BLOCKED_ROUTE_NOT_PINNABLE";
  if (unique.has("privacy_unknown")) return "BLOCKED_PRIVACY";
  if (unique.has("pricing_unknown") || unique.has("contradictory_pricing"))
    return "BLOCKED_PRICING";
  if (unique.has("unsupported_capability")) return "BLOCKED_CAPABILITY";
  return "BLOCKED_POLICY";
}

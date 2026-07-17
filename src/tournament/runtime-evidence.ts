import { createHash } from "node:crypto";

export const RUNTIME_EVIDENCE_PACK_VERSION = "1.0.0" as const;
export const RUNTIME_EVIDENCE_HASH_DOMAIN =
  "vlatam-ai-lab:runtime-evidence:v1" as const;

export type RuntimeEvidenceProvider = "vercel" | "cloudflare";
export type EvidenceFreshness = "current" | "expiring" | "expired";
export type ReviewState = "pending" | "reviewed" | "rejected";

export interface RuntimeEvidenceSource {
  readonly source_id: string;
  readonly source_url: string;
  readonly provider: RuntimeEvidenceProvider;
  readonly component: string;
  readonly document_title: string;
  readonly retrieved_at: string;
  readonly source_type:
    | "official_repository"
    | "official_documentation"
    | "official_package_metadata"
    | "official_license"
    | "official_release"
    | "official_changelog";
  readonly document_version: string | null;
  readonly commit_sha: string | null;
  readonly published_or_updated_at: string | null;
  readonly immutable: boolean;
  readonly capture_method: "public_unauthenticated_http";
  readonly normalized_findings: readonly string[];
  readonly evidence_limitations: readonly string[];
  readonly review_expires_at: string;
  readonly independent_review_status: ReviewState;
  readonly approval_status: ReviewState;
  readonly content_hash: string;
}

export interface RuntimeEvidenceFinding {
  readonly finding_id: string;
  readonly component: string;
  readonly topic: string;
  readonly claim: string;
  readonly claim_status:
    | "verified"
    | "documented"
    | "inferred"
    | "unsupported"
    | "undocumented"
    | "unknown";
  readonly evidence_strength: "strong" | "moderate" | "weak" | "none";
  readonly source_ids: readonly string[];
  readonly limitations: readonly string[];
}

export interface RuntimeEventMapping {
  readonly normalized_event: string;
  readonly platform_event: string | null;
  readonly mapping_status:
    | "documented"
    | "inferred"
    | "implementation_specific"
    | "unsupported"
    | "undocumented";
  readonly source_ids: readonly string[];
  readonly limitation: string;
}

export interface RuntimeEvidencePack {
  readonly schema_version: typeof RUNTIME_EVIDENCE_PACK_VERSION;
  readonly pack_id: string;
  readonly runtime_candidate: {
    readonly candidate_id: "vercel-eve" | "cloudflare-agents-workflows";
    readonly provider: RuntimeEvidenceProvider;
    readonly observed_version: string;
    readonly lifecycle_status: "discovered";
    readonly activation_prohibited: true;
    readonly enabled: false;
    readonly kill_switch_active: true;
  };
  readonly captured_at: string;
  readonly review_expires_at: string;
  readonly sources: readonly RuntimeEvidenceSource[];
  readonly findings: readonly RuntimeEvidenceFinding[];
  readonly event_mapping: readonly RuntimeEventMapping[];
  readonly portability_findings: readonly string[];
  readonly privacy_findings: readonly string[];
  readonly durability_findings: readonly string[];
  readonly human_review_findings: readonly string[];
  readonly sandbox_findings: readonly string[];
  readonly observability_findings: readonly string[];
  readonly cost_accounting_findings: readonly string[];
  readonly unresolved_questions: readonly string[];
  readonly legal_review_required: true;
  readonly security_review_required: true;
  readonly independent_review_required: true;
  readonly lifecycle_recommendation: "remain_discovered";
  readonly automatic_promotion_prohibited: true;
  readonly reasoning_capture_policy: {
    readonly persist_private_reasoning: false;
    readonly adapter_mode: "disabled_or_redacted";
  };
  readonly historical_evidence_classification: readonly {
    readonly evidence_id: string;
    readonly classification:
      | "current"
      | "stale"
      | "historical"
      | "retired"
      | "superseded"
      | "insufficient";
    readonly reason: string;
  }[];
  readonly pack_hash: string;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

export function computeRuntimeEvidenceSourceHash(
  source: Omit<RuntimeEvidenceSource, "content_hash"> | RuntimeEvidenceSource,
): string {
  const normalized = {
    source_url: source.source_url,
    document_version: source.document_version,
    commit_sha: source.commit_sha,
    normalized_findings: source.normalized_findings,
    evidence_limitations: source.evidence_limitations,
  };
  return createHash("sha256")
    .update(RUNTIME_EVIDENCE_HASH_DOMAIN)
    .update("\nsource\n")
    .update(canonical(normalized))
    .digest("hex");
}

export function computeRuntimeEvidencePackHash(
  pack: RuntimeEvidencePack,
): string {
  const copy = structuredClone(pack) as unknown as Record<string, unknown>;
  copy["pack_hash"] = "";
  return createHash("sha256")
    .update(RUNTIME_EVIDENCE_HASH_DOMAIN)
    .update("\npack\n")
    .update(canonical(copy))
    .digest("hex");
}

export interface RuntimeEvidenceEvaluation {
  readonly outcome: "evidence_only" | "not_current" | "invalid";
  readonly freshness: EvidenceFreshness;
  readonly reason_codes: readonly string[];
}

export function evaluateRuntimeEvidencePack(
  pack: RuntimeEvidencePack,
  evaluatedAt: Date,
): RuntimeEvidenceEvaluation {
  const invalid = new Set<string>();
  const blockers = new Set<string>();
  if (computeRuntimeEvidencePackHash(pack) !== pack.pack_hash)
    invalid.add("pack_hash_mismatch");
  if (
    pack.runtime_candidate.enabled ||
    !pack.runtime_candidate.kill_switch_active ||
    !pack.runtime_candidate.activation_prohibited ||
    !pack.automatic_promotion_prohibited ||
    pack.lifecycle_recommendation !== "remain_discovered"
  )
    invalid.add("evidence_capture_safety_invariant_violated");
  if (
    pack.runtime_candidate.candidate_id === "cloudflare-agents-workflows" &&
    pack.findings.some(
      (finding) =>
        finding.component === "workers_ai" &&
        finding.topic === "runtime_identity" &&
        finding.claim_status !== "unsupported",
    )
  )
    invalid.add("workers_ai_modeled_as_runtime");
  const seen = new Set<string>();
  for (const source of pack.sources) {
    if (seen.has(source.source_id)) invalid.add("duplicate_source_id");
    seen.add(source.source_id);
    if (!source.source_url.startsWith("https://"))
      invalid.add("source_url_missing");
    if (!Number.isFinite(Date.parse(source.retrieved_at)))
      invalid.add("retrieval_timestamp_missing");
    if (computeRuntimeEvidenceSourceHash(source) !== source.content_hash)
      invalid.add("source_hash_mismatch");
    if (source.evidence_limitations.length === 0)
      invalid.add("evidence_limitation_missing");
    if (
      !source.immutable &&
      source.evidence_limitations.every((item) => !/mutable/i.test(item))
    )
      invalid.add("mutable_source_limitation_missing");
    if (source.independent_review_status !== "reviewed")
      blockers.add("independent_review_pending");
  }
  for (const finding of pack.findings) {
    const sourceTypes = finding.source_ids
      .map(
        (id) =>
          pack.sources.find((source) => source.source_id === id)?.source_type,
      )
      .filter(Boolean);
    if (
      finding.claim_status === "verified" &&
      sourceTypes.length > 0 &&
      sourceTypes.every((type) => type === "official_documentation") &&
      finding.source_ids.some((id) => /blog|introducing|marketing/i.test(id))
    )
      invalid.add("marketing_guarantee_forbidden");
  }
  if (
    pack.runtime_candidate.provider === "vercel" &&
    !pack.privacy_findings.some((item) => /reasoning/i.test(item))
  )
    invalid.add("eve_reasoning_privacy_risk_omitted");
  const expiry = Date.parse(pack.review_expires_at);
  const freshness: EvidenceFreshness =
    expiry <= evaluatedAt.getTime()
      ? "expired"
      : expiry - evaluatedAt.getTime() <= 7 * 86_400_000
        ? "expiring"
        : "current";
  if (freshness === "expired") blockers.add("evidence_expired");
  if (invalid.size > 0)
    return { outcome: "invalid", freshness, reason_codes: [...invalid].sort() };
  return {
    outcome: freshness === "expired" ? "not_current" : "evidence_only",
    freshness,
    reason_codes: [...blockers].sort(),
  };
}

export interface RuntimeEvidenceOperatorProjection {
  readonly candidate_id: string;
  readonly evidence_freshness: EvidenceFreshness;
  readonly source_count: number;
  readonly immutable_source_count: number;
  readonly mutable_source_count: number;
  readonly unresolved_gaps: number;
  readonly privacy_blockers: number;
  readonly durability_confidence: "low" | "medium" | "high";
  readonly cost_accounting_confidence: "low" | "medium" | "high";
  readonly independent_review_required: true;
  readonly lifecycle_recommendation: "remain_discovered";
  readonly activation_prohibited: true;
  readonly kill_switch_state: "active";
}

export function projectRuntimeEvidenceForOperator(
  pack: RuntimeEvidencePack,
  evaluatedAt: Date,
): RuntimeEvidenceOperatorProjection {
  const evaluation = evaluateRuntimeEvidencePack(pack, evaluatedAt);
  const confidence = (topic: string): "low" | "medium" | "high" => {
    const relevant = pack.findings.filter((finding) => finding.topic === topic);
    return relevant.some((finding) => finding.evidence_strength === "strong")
      ? "high"
      : relevant.some((finding) => finding.evidence_strength === "moderate")
        ? "medium"
        : "low";
  };
  return Object.freeze({
    candidate_id: pack.runtime_candidate.candidate_id,
    evidence_freshness: evaluation.freshness,
    source_count: pack.sources.length,
    immutable_source_count: pack.sources.filter((source) => source.immutable)
      .length,
    mutable_source_count: pack.sources.filter((source) => !source.immutable)
      .length,
    unresolved_gaps: pack.unresolved_questions.length,
    privacy_blockers: pack.privacy_findings.filter((item) =>
      /unknown|block|forbid|required/i.test(item),
    ).length,
    durability_confidence: confidence("durability"),
    cost_accounting_confidence: confidence("cost_accounting"),
    independent_review_required: true,
    lifecycle_recommendation: "remain_discovered",
    activation_prohibited: true,
    kill_switch_state: "active",
  });
}

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const ARCA_REGULATORY_BATCH_SCHEMA_VERSION = "1.0.0" as const;
export const ARCA_REGULATORY_CANONICALIZATION_VERSION =
  "json-sorted-keys-v1" as const;
export const ARCA_REGULATORY_BATCH_ID =
  "ar-arca-first-regulatory-batch-2026" as const;
export const ARCA_REGULATORY_TARGET_NUMBERS = [5859, 5845, 5838] as const;

export const ARCA_REGULATORY_BATCH_ASSETS = {
  artifact_5859: "data/regulatory/arca/first-batch/rg-5859-2026.artifact.json",
  artifact_5845: "data/regulatory/arca/first-batch/rg-5845-2026.artifact.json",
  artifact_5838: "data/regulatory/arca/first-batch/rg-5838-2026.artifact.json",
  review_5859: "data/regulatory/arca/first-batch/rg-5859-2026.review.json",
  review_5845: "data/regulatory/arca/first-batch/rg-5845-2026.review.json",
  review_5838: "data/regulatory/arca/first-batch/rg-5838-2026.review.json",
} as const;

export type ArcaRegulatoryBatchAssetKey =
  keyof typeof ARCA_REGULATORY_BATCH_ASSETS;

export const ARCA_REGULATORY_BATCH_ASSET_PATHS = Object.freeze(
  Object.values(ARCA_REGULATORY_BATCH_ASSETS),
) as readonly (typeof ARCA_REGULATORY_BATCH_ASSETS)[ArcaRegulatoryBatchAssetKey][];

export type ArcaRegulatoryRecommendation =
  | "eligible_for_human_review"
  | "blocked_incomplete_evidence"
  | "blocked_conflicting_sources";

export interface ArcaOfficialSource {
  readonly source_id: "arca_biblioteca" | "boletin_oficial";
  readonly url: string;
  readonly retrieved_at: string;
  readonly media_type: "text/html" | "application/pdf";
  readonly sha256: string;
}

export interface ArcaRegulatoryAnnex {
  readonly annex_id: string;
  readonly label: string;
  readonly document_number: string;
  readonly arca_url: string;
  readonly boletin_url: string;
  readonly boletin_download_parameters: Readonly<Record<string, string>>;
  readonly sha256: string;
  readonly arca_sha256: string;
  readonly boletin_sha256: string;
  readonly source_match: true;
  readonly page_count: number;
}

export interface ArcaRegulatoryArtifact {
  readonly artifact_id: string;
  readonly authority: "ARCA";
  readonly jurisdiction: "Argentina";
  readonly instrument_type: "Resolución General";
  readonly instrument_number: number;
  readonly year: 2026;
  readonly regulation_number: number;
  readonly regulation_year: 2026;
  readonly official_identifier: string;
  readonly title: string;
  readonly subject: string;
  readonly topics: readonly string[];
  readonly issue_date: string;
  readonly publication_date: string;
  readonly effective_date: string | null;
  readonly effective_date_rule: string;
  readonly effective_date_or_rule: {
    readonly date: string | null;
    readonly rule: string;
  };
  readonly status: "vigente";
  readonly current_status: "vigente";
  readonly official_source_urls: readonly ArcaOfficialSource[];
  readonly source_sha256s: {
    readonly arca_page_sha256: string;
    readonly boletin_page_sha256: string;
    readonly boletin_body_pdf_sha256: string;
    readonly official_text_sha256: string;
    readonly normalized_cross_source_text_sha256: string;
  };
  readonly source_hashes: ArcaRegulatoryArtifact["source_sha256s"];
  readonly official_text: string;
  readonly annexes: readonly ArcaRegulatoryAnnex[];
  readonly supersedes_or_modifies: readonly {
    readonly relationship: "implements" | "modifies" | "abrogates";
    readonly instrument: string;
  }[];
  readonly modifies: readonly string[];
  readonly modified_by: readonly string[];
  readonly repeals: readonly string[];
  readonly repealed_by: readonly string[];
  readonly supersedes: readonly string[];
  readonly superseded_by: readonly string[];
  readonly source_verification: {
    readonly status: "matched";
    readonly compared_fields: readonly string[];
    readonly annexes_complete: true;
    readonly review_eligible: true;
  };
  readonly acquired_at: string;
  readonly acquisition_method: "manual_official_source_capture";
  readonly schema_version: typeof ARCA_REGULATORY_BATCH_SCHEMA_VERSION;
  readonly canonicalization_version: typeof ARCA_REGULATORY_CANONICALIZATION_VERSION;
  readonly canonical_hash: string;
  readonly review_status: "pending_human_review";
  readonly publication_status: "not_published";
  readonly interpretation_status: "not_interpreted";
  readonly disclaimer: string;
  readonly pending_human_review: true;
  readonly not_published: true;
  readonly not_interpreted: true;
  readonly disclaimer_es: string;
}

export interface ArcaRegulatoryReviewPackage {
  readonly review_package_id: string;
  readonly artifact_id: string;
  readonly artifact_canonical_hash: string;
  readonly instrument_number: number;
  readonly year: 2026;
  readonly regulation_number: number;
  readonly regulation_year: 2026;
  readonly official_source_summary: readonly {
    readonly source_id: "arca_biblioteca" | "boletin_oficial";
    readonly url: string;
    readonly sha256: string;
  }[];
  readonly source_hashes: ArcaRegulatoryArtifact["source_hashes"];
  readonly cross_source_comparison_result: {
    readonly status: "matched";
    readonly review_eligible: true;
    readonly discrepancy_classifications: readonly string[];
  };
  readonly annex_completeness: {
    readonly expected_count: number;
    readonly acquired_count: number;
    readonly complete: true;
  };
  readonly supersession_status: {
    readonly modifies: readonly string[];
    readonly modified_by: readonly string[];
    readonly repeals: readonly string[];
    readonly repealed_by: readonly string[];
    readonly supersedes: readonly string[];
    readonly superseded_by: readonly string[];
  };
  readonly effective_date_result: {
    readonly effective_date: string | null;
    readonly effective_date_rule: string;
    readonly unresolved: false;
  };
  readonly unresolved_discrepancies: readonly string[];
  readonly lifecycle: "pending_human_review";
  readonly review_eligible: true;
  readonly recommendation: "eligible_for_human_review";
  readonly reviewer: null;
  readonly decision_timestamp: null;
  readonly checklist: {
    readonly official_sources_matched: true;
    readonly official_text_matched: true;
    readonly annexes_complete: true;
    readonly relationships_recorded: true;
    readonly legal_interpretation_performed: false;
  };
  readonly reviewer_checklist: {
    readonly verify_official_identifiers: false;
    readonly verify_effective_date: false;
    readonly verify_annexes: false;
    readonly verify_relationships: false;
    readonly record_human_decision: false;
  };
  readonly reason_codes: readonly ["human_review_required"];
  readonly allowed_recommendations: readonly ArcaRegulatoryRecommendation[];
  readonly schema_version: typeof ARCA_REGULATORY_BATCH_SCHEMA_VERSION;
  readonly canonicalization_version: typeof ARCA_REGULATORY_CANONICALIZATION_VERSION;
  readonly review_package_hash: string;
  readonly review_status: "pending_human_review";
  readonly publication_status: "not_published";
  readonly interpretation_status: "not_interpreted";
  readonly disclaimer: string;
  readonly not_published: true;
  readonly not_interpreted: true;
  readonly disclaimer_es: string;
}

export interface ArcaRegulatoryBatchProjection {
  readonly batch_id: typeof ARCA_REGULATORY_BATCH_ID;
  readonly artifacts: readonly ArcaRegulatoryArtifact[];
  readonly review_packages: readonly ArcaRegulatoryReviewPackage[];
  readonly pending_count: number;
  readonly approved_count: number;
  readonly published_count: number;
  readonly scheduler_active: false;
  readonly runtime_arca_execution_available: false;
  readonly database_write_authorized: false;
  readonly publication_authorized: false;
  readonly legal_interpretation_performed: false;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ALLOWED_HOSTS = new Set([
  "biblioteca.arca.gob.ar",
  "boletinoficial.gob.ar",
  "www.boletinoficial.gob.ar",
]);

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortJson(child)]),
    );
  return value;
}

export function canonicalizeArcaRegulatoryJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function withoutHashField(
  value: Readonly<Record<string, unknown>>,
  field: string,
): Readonly<Record<string, unknown>> {
  const clone = structuredClone(value) as Record<string, unknown>;
  delete clone[field];
  return clone;
}

export function computeArcaRegulatoryCanonicalHash(
  artifact: Omit<ArcaRegulatoryArtifact, "canonical_hash"> | unknown,
): string {
  const record = artifact as Readonly<Record<string, unknown>>;
  return createHash("sha256")
    .update(
      canonicalizeArcaRegulatoryJson(
        withoutHashField(record, "canonical_hash"),
      ),
    )
    .digest("hex");
}

export function computeArcaRegulatoryReviewPackageHash(
  reviewPackage:
    | Omit<ArcaRegulatoryReviewPackage, "review_package_hash">
    | unknown,
): string {
  const record = reviewPackage as Readonly<Record<string, unknown>>;
  return createHash("sha256")
    .update(
      canonicalizeArcaRegulatoryJson(
        withoutHashField(record, "review_package_hash"),
      ),
    )
    .digest("hex");
}

export interface ArcaSourceComparisonInput {
  readonly fields_match: boolean;
  readonly official_text_match: boolean;
  readonly expected_annex_count: number;
  readonly annex_hash_pairs: readonly {
    readonly arca_sha256: string | null;
    readonly boletin_sha256: string | null;
  }[];
}

export function evaluateArcaSourceAgreement(input: ArcaSourceComparisonInput): {
  readonly status: "matched" | "mismatch";
  readonly review_eligible: boolean;
  readonly reason_codes: readonly string[];
} {
  const reasonCodes: string[] = [];
  if (!input.fields_match) reasonCodes.push("official_metadata_mismatch");
  if (!input.official_text_match) reasonCodes.push("official_text_mismatch");
  if (input.annex_hash_pairs.length !== input.expected_annex_count)
    reasonCodes.push("official_annex_missing");
  if (
    input.annex_hash_pairs.some(
      (pair) =>
        pair.arca_sha256 === null ||
        pair.boletin_sha256 === null ||
        pair.arca_sha256 !== pair.boletin_sha256,
    )
  )
    reasonCodes.push("official_annex_mismatch");
  return reasonCodes.length === 0
    ? { status: "matched", review_eligible: true, reason_codes: [] }
    : {
        status: "mismatch",
        review_eligible: false,
        reason_codes: [...new Set(reasonCodes)].sort(),
      };
}

function assertDate(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error(`arca_regulatory_invalid_${field}`);
}

function assertTimestamp(value: string, field: string): void {
  if (!Number.isFinite(Date.parse(value)))
    throw new Error(`arca_regulatory_invalid_${field}`);
}

function assertHash(value: string, field: string): void {
  if (!SHA256_PATTERN.test(value))
    throw new Error(`arca_regulatory_invalid_${field}`);
}

function assertOfficialUrl(value: string, field: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`arca_regulatory_invalid_${field}`);
  }
  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname))
    throw new Error(`arca_regulatory_unapproved_${field}`);
}

export function validateArcaRegulatoryArtifact(
  value: unknown,
): asserts value is ArcaRegulatoryArtifact {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("arca_regulatory_artifact_not_object");
  const artifact = value as ArcaRegulatoryArtifact;
  if (
    artifact.authority !== "ARCA" ||
    artifact.jurisdiction !== "Argentina" ||
    artifact.instrument_type !== "Resolución General" ||
    artifact.year !== 2026 ||
    artifact.regulation_year !== 2026 ||
    artifact.regulation_number !== artifact.instrument_number ||
    artifact.official_identifier !==
      `Resolución General ARCA ${artifact.instrument_number}/2026` ||
    !ARCA_REGULATORY_TARGET_NUMBERS.includes(
      artifact.instrument_number as (typeof ARCA_REGULATORY_TARGET_NUMBERS)[number],
    ) ||
    artifact.status !== "vigente" ||
    artifact.current_status !== "vigente"
  )
    throw new Error("arca_regulatory_identity_invalid");
  if (
    artifact.schema_version !== ARCA_REGULATORY_BATCH_SCHEMA_VERSION ||
    artifact.canonicalization_version !==
      ARCA_REGULATORY_CANONICALIZATION_VERSION
  )
    throw new Error("arca_regulatory_contract_version_invalid");
  assertDate(artifact.issue_date, "issue_date");
  assertDate(artifact.publication_date, "publication_date");
  if (artifact.effective_date_or_rule.date !== null)
    assertDate(artifact.effective_date_or_rule.date, "effective_date");
  if (artifact.effective_date !== null)
    assertDate(artifact.effective_date, "canonical_effective_date");
  if (
    artifact.effective_date !== artifact.effective_date_or_rule.date ||
    artifact.effective_date_rule !== artifact.effective_date_or_rule.rule
  )
    throw new Error("arca_regulatory_effective_date_binding_invalid");
  assertTimestamp(artifact.acquired_at, "acquired_at");
  if (artifact.official_source_urls.length !== 2)
    throw new Error("arca_regulatory_official_sources_incomplete");
  const sourcesById = new Map(
    artifact.official_source_urls.map((source) => [source.source_id, source]),
  );
  if (
    sourcesById.size !== 2 ||
    !sourcesById.has("arca_biblioteca") ||
    !sourcesById.has("boletin_oficial")
  )
    throw new Error("arca_regulatory_official_sources_invalid");
  for (const source of artifact.official_source_urls) {
    assertOfficialUrl(source.url, "source_url");
    assertTimestamp(source.retrieved_at, "source_retrieved_at");
    assertHash(source.sha256, "source_sha256");
  }
  for (const [field, hash] of Object.entries(artifact.source_sha256s))
    assertHash(hash, `source_sha256s_${field}`);
  for (const [field, hash] of Object.entries(artifact.source_hashes))
    assertHash(hash, `source_hashes_${field}`);
  if (
    canonicalizeArcaRegulatoryJson(artifact.source_hashes) !==
      canonicalizeArcaRegulatoryJson(artifact.source_sha256s) ||
    sourcesById.get("arca_biblioteca")?.sha256 !==
      artifact.source_hashes.arca_page_sha256 ||
    sourcesById.get("boletin_oficial")?.sha256 !==
      artifact.source_hashes.boletin_page_sha256 ||
    createHash("sha256").update(artifact.official_text).digest("hex") !==
      artifact.source_hashes.official_text_sha256
  )
    throw new Error("arca_regulatory_source_hash_binding_invalid");
  if (
    artifact.source_verification.status !== "matched" ||
    artifact.source_verification.annexes_complete !== true ||
    artifact.source_verification.review_eligible !== true
  )
    throw new Error("arca_regulatory_source_verification_not_matched");
  const agreement = evaluateArcaSourceAgreement({
    fields_match: true,
    official_text_match: true,
    expected_annex_count: artifact.annexes.length,
    annex_hash_pairs: artifact.annexes.map((annex) => ({
      arca_sha256: annex.arca_sha256,
      boletin_sha256: annex.boletin_sha256,
    })),
  });
  if (!agreement.review_eligible)
    throw new Error(`arca_regulatory_${agreement.reason_codes[0]}`);
  for (const annex of artifact.annexes) {
    assertOfficialUrl(annex.arca_url, "annex_arca_url");
    assertOfficialUrl(annex.boletin_url, "annex_boletin_url");
    assertHash(annex.sha256, "annex_sha256");
    assertHash(annex.arca_sha256, "annex_arca_sha256");
    assertHash(annex.boletin_sha256, "annex_boletin_sha256");
    if (
      annex.sha256 !== annex.arca_sha256 ||
      annex.sha256 !== annex.boletin_sha256 ||
      annex.source_match !== true ||
      !Number.isSafeInteger(annex.page_count) ||
      annex.page_count < 1
    )
      throw new Error("arca_regulatory_annex_integrity_invalid");
  }
  const expectedAnnexCount =
    artifact.instrument_number === 5859
      ? 1
      : artifact.instrument_number === 5838
        ? 3
        : 0;
  if (artifact.annexes.length !== expectedAnnexCount)
    throw new Error("arca_regulatory_official_annex_missing");
  if (
    artifact.review_status !== "pending_human_review" ||
    artifact.publication_status !== "not_published" ||
    artifact.interpretation_status !== "not_interpreted" ||
    artifact.pending_human_review !== true ||
    artifact.not_published !== true ||
    artifact.not_interpreted !== true ||
    artifact.disclaimer.length === 0
  )
    throw new Error("arca_regulatory_governance_state_invalid");
  assertHash(artifact.canonical_hash, "canonical_hash");
  if (computeArcaRegulatoryCanonicalHash(artifact) !== artifact.canonical_hash)
    throw new Error("arca_regulatory_canonical_hash_mismatch");
}

export function validateArcaRegulatoryReviewPackage(
  value: unknown,
  artifact: ArcaRegulatoryArtifact,
): asserts value is ArcaRegulatoryReviewPackage {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("arca_regulatory_review_not_object");
  const review = value as ArcaRegulatoryReviewPackage;
  if (
    review.artifact_id !== artifact.artifact_id ||
    review.artifact_canonical_hash !== artifact.canonical_hash ||
    review.instrument_number !== artifact.instrument_number ||
    review.year !== artifact.year ||
    review.regulation_number !== artifact.regulation_number ||
    review.regulation_year !== artifact.regulation_year
  )
    throw new Error("arca_regulatory_review_binding_mismatch");
  if (
    review.lifecycle !== "pending_human_review" ||
    review.review_status !== "pending_human_review" ||
    review.review_eligible !== true ||
    review.recommendation !== "eligible_for_human_review" ||
    review.reviewer !== null ||
    review.decision_timestamp !== null ||
    review.publication_status !== "not_published" ||
    review.interpretation_status !== "not_interpreted" ||
    review.not_published !== true ||
    review.not_interpreted !== true ||
    review.disclaimer.length === 0
  )
    throw new Error("arca_regulatory_review_state_invalid");
  if (
    review.schema_version !== ARCA_REGULATORY_BATCH_SCHEMA_VERSION ||
    review.canonicalization_version !== ARCA_REGULATORY_CANONICALIZATION_VERSION
  )
    throw new Error("arca_regulatory_review_version_invalid");
  const expectedRecommendations: readonly ArcaRegulatoryRecommendation[] = [
    "eligible_for_human_review",
    "blocked_incomplete_evidence",
    "blocked_conflicting_sources",
  ];
  if (
    canonicalizeArcaRegulatoryJson(review.allowed_recommendations) !==
    canonicalizeArcaRegulatoryJson(expectedRecommendations)
  )
    throw new Error("arca_regulatory_review_recommendations_invalid");
  const expectedSourceSummary = artifact.official_source_urls.map(
    ({ source_id, url, sha256 }) => ({ source_id, url, sha256 }),
  );
  const expectedSupersessionStatus = {
    modifies: artifact.modifies,
    modified_by: artifact.modified_by,
    repeals: artifact.repeals,
    repealed_by: artifact.repealed_by,
    supersedes: artifact.supersedes,
    superseded_by: artifact.superseded_by,
  };
  if (
    canonicalizeArcaRegulatoryJson(review.official_source_summary) !==
      canonicalizeArcaRegulatoryJson(expectedSourceSummary) ||
    canonicalizeArcaRegulatoryJson(review.source_hashes) !==
      canonicalizeArcaRegulatoryJson(artifact.source_hashes) ||
    review.cross_source_comparison_result.status !== "matched" ||
    review.cross_source_comparison_result.review_eligible !== true ||
    review.cross_source_comparison_result.discrepancy_classifications.length !==
      0 ||
    review.annex_completeness.expected_count !== artifact.annexes.length ||
    review.annex_completeness.acquired_count !== artifact.annexes.length ||
    review.annex_completeness.complete !== true ||
    canonicalizeArcaRegulatoryJson(review.supersession_status) !==
      canonicalizeArcaRegulatoryJson(expectedSupersessionStatus) ||
    review.effective_date_result.effective_date !== artifact.effective_date ||
    review.effective_date_result.effective_date_rule !==
      artifact.effective_date_rule ||
    review.effective_date_result.unresolved !== false ||
    review.unresolved_discrepancies.length !== 0
  )
    throw new Error("arca_regulatory_review_evidence_summary_invalid");
  if (Object.values(review.reviewer_checklist).some((value) => value !== false))
    throw new Error("arca_regulatory_review_checklist_not_pending");
  assertHash(review.review_package_hash, "review_package_hash");
  if (
    computeArcaRegulatoryReviewPackageHash(review) !==
    review.review_package_hash
  )
    throw new Error("arca_regulatory_review_package_hash_mismatch");
}

function loadJson(root: string, relativePath: string): unknown {
  return JSON.parse(
    readFileSync(resolve(root, relativePath), "utf8"),
  ) as unknown;
}

export function loadArcaRegulatoryBatch(
  repositoryRoot: string,
): ArcaRegulatoryBatchProjection {
  const artifactInputs: unknown[] = [
    loadJson(repositoryRoot, ARCA_REGULATORY_BATCH_ASSETS.artifact_5859),
    loadJson(repositoryRoot, ARCA_REGULATORY_BATCH_ASSETS.artifact_5845),
    loadJson(repositoryRoot, ARCA_REGULATORY_BATCH_ASSETS.artifact_5838),
  ];
  for (const artifact of artifactInputs)
    validateArcaRegulatoryArtifact(artifact);
  const artifacts = artifactInputs as ArcaRegulatoryArtifact[];
  const reviewInputs: unknown[] = [
    loadJson(repositoryRoot, ARCA_REGULATORY_BATCH_ASSETS.review_5859),
    loadJson(repositoryRoot, ARCA_REGULATORY_BATCH_ASSETS.review_5845),
    loadJson(repositoryRoot, ARCA_REGULATORY_BATCH_ASSETS.review_5838),
  ];
  for (const [index, review] of reviewInputs.entries())
    validateArcaRegulatoryReviewPackage(review, artifacts[index]!);
  const reviewPackages = reviewInputs as ArcaRegulatoryReviewPackage[];
  if (
    new Set(artifacts.map((artifact) => artifact.instrument_number)).size !==
      3 ||
    canonicalizeArcaRegulatoryJson(
      artifacts.map((artifact) => artifact.instrument_number),
    ) !== canonicalizeArcaRegulatoryJson(ARCA_REGULATORY_TARGET_NUMBERS)
  )
    throw new Error("arca_regulatory_batch_scope_invalid");
  return Object.freeze({
    batch_id: ARCA_REGULATORY_BATCH_ID,
    artifacts: structuredClone(artifacts),
    review_packages: structuredClone(reviewPackages),
    pending_count: 3,
    approved_count: 0,
    published_count: 0,
    scheduler_active: false,
    runtime_arca_execution_available: false,
    database_write_authorized: false,
    publication_authorized: false,
    legal_interpretation_performed: false,
  });
}

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ARCA_REGULATORY_CANONICALIZATION_VERSION,
  canonicalizeArcaRegulatoryJson,
  loadArcaRegulatoryBatch,
  type ArcaRegulatoryArtifact,
  type ArcaRegulatoryBatchProjection,
  type ArcaRegulatoryReviewPackage,
} from "./arca-regulatory-batch.js";

export const ARCA_READ_ONLY_LIBRARY_SCHEMA_VERSION = "1.0.0" as const;
export const ARCA_READ_ONLY_LIBRARY_DISCLAIMER =
  "Esta biblioteca presenta información normativa y evidencia oficial. No constituye asesoramiento legal o aduanero, interpretación vinculante ni autorización para ejecutar operaciones." as const;
export const ARCA_HUMAN_REVIEWER_NAME = "Nicolas Matias Stedile" as const;
export const ARCA_HUMAN_REVIEW_DECISION_DATE = "2026-07-28" as const;
export const ARCA_HUMAN_REVIEW_DECISION_TIMESTAMP =
  "2026-07-28T00:00:00-03:00" as const;

export const ARCA_READ_ONLY_LIBRARY_ASSETS = {
  decision_5859:
    "data/regulatory/arca/first-batch/rg-5859-2026.human-decision.json",
  decision_5845:
    "data/regulatory/arca/first-batch/rg-5845-2026.human-decision.json",
  decision_5838:
    "data/regulatory/arca/first-batch/rg-5838-2026.human-decision.json",
  publication_5859:
    "data/regulatory/arca/first-batch/rg-5859-2026.publication.json",
  publication_5845:
    "data/regulatory/arca/first-batch/rg-5845-2026.publication.json",
  publication_5838:
    "data/regulatory/arca/first-batch/rg-5838-2026.publication.json",
  decision_schema: "schemas/arca-human-review-decision.schema.json",
  publication_schema: "schemas/arca-read-only-publication-record.schema.json",
} as const;

export const ARCA_READ_ONLY_LIBRARY_ASSET_PATHS = Object.freeze(
  Object.values(ARCA_READ_ONLY_LIBRARY_ASSETS),
);

export const ARCA_HUMAN_DECISION_ASSET_PATHS = Object.freeze([
  ARCA_READ_ONLY_LIBRARY_ASSETS.decision_5859,
  ARCA_READ_ONLY_LIBRARY_ASSETS.decision_5845,
  ARCA_READ_ONLY_LIBRARY_ASSETS.decision_5838,
]);

export const ARCA_PUBLICATION_RECORD_ASSET_PATHS = Object.freeze([
  ARCA_READ_ONLY_LIBRARY_ASSETS.publication_5859,
  ARCA_READ_ONLY_LIBRARY_ASSETS.publication_5845,
  ARCA_READ_ONLY_LIBRARY_ASSETS.publication_5838,
]);

export interface ArcaHumanReviewDecision {
  readonly decision_id: string;
  readonly artifact_id: string;
  readonly canonical_artifact_hash: string;
  readonly review_package_id: string;
  readonly review_package_hash: string;
  readonly reviewer_name: typeof ARCA_HUMAN_REVIEWER_NAME;
  readonly reviewer_type: "human";
  readonly reviewer_identity_source: "explicit_user_declaration";
  readonly decision_date: typeof ARCA_HUMAN_REVIEW_DECISION_DATE;
  readonly decision_timestamp: typeof ARCA_HUMAN_REVIEW_DECISION_TIMESTAMP;
  readonly decision: "approved_for_read_only_publication";
  readonly reviewed_scope: readonly [
    "official_text",
    "official_source_references",
    "annex_completeness",
  ];
  readonly reviewer_statement: string;
  readonly limitations: readonly [
    "informational_read_only_publication_only",
    "not_legal_advice",
    "not_customs_advice",
    "not_binding_interpretation",
    "no_execution_authority",
    "future_artifacts_require_separate_human_decision",
  ];
  readonly decision_validity: "valid";
  readonly expiration_status: "not_expired";
  readonly supersession_status: "current";
  readonly decision_record_hash: string;
  readonly schema_version: typeof ARCA_READ_ONLY_LIBRARY_SCHEMA_VERSION;
  readonly canonicalization_version: typeof ARCA_REGULATORY_CANONICALIZATION_VERSION;
}

export interface ArcaReadOnlyPublicationRecord {
  readonly publication_record_id: string;
  readonly artifact_id: string;
  readonly canonical_artifact_hash: string;
  readonly human_decision_id: string;
  readonly human_decision_hash: string;
  readonly publication_status: "published_read_only";
  readonly review_status: "approved";
  readonly publication_scope: "informational_regulatory_library";
  readonly published_at: typeof ARCA_HUMAN_REVIEW_DECISION_TIMESTAMP;
  readonly source_authorities: readonly [
    "ARCA",
    "Boletín Oficial de la República Argentina",
  ];
  readonly disclaimer: typeof ARCA_READ_ONLY_LIBRARY_DISCLAIMER;
  readonly revocation_status: "not_revoked";
  readonly schema_version: typeof ARCA_READ_ONLY_LIBRARY_SCHEMA_VERSION;
  readonly canonicalization_version: typeof ARCA_REGULATORY_CANONICALIZATION_VERSION;
  readonly publication_record_hash: string;
}

export interface ArcaReadOnlyLibraryItem {
  readonly artifact: ArcaRegulatoryArtifact;
  readonly review_package: ArcaRegulatoryReviewPackage;
  readonly human_decision: ArcaHumanReviewDecision;
  readonly publication_record: ArcaReadOnlyPublicationRecord;
}

export interface ArcaReadOnlyLibraryProjection {
  readonly library_id: "ar-arca-read-only-library-2026";
  readonly items: readonly ArcaReadOnlyLibraryItem[];
  readonly human_decisions: readonly ArcaHumanReviewDecision[];
  readonly publication_records: readonly ArcaReadOnlyPublicationRecord[];
  readonly pending_real_regulations: 0;
  readonly approved_real_regulations: 3;
  readonly published_read_only_regulations: 3;
  readonly model_execution_permitted: false;
  readonly runtime_arca_execution_available: false;
  readonly scheduler_active: false;
  readonly database_write_authorized: false;
  readonly external_side_effects_performed: false;
  readonly legal_interpretation_performed: false;
}

const normalizeSearch = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

export function arcaLibraryItemMatchesQuery(
  item: ArcaReadOnlyLibraryItem,
  query: string,
): boolean {
  const term = normalizeSearch(query);
  if (term.length === 0) return true;
  return normalizeSearch(
    [
      `RG ${item.artifact.instrument_number}/${item.artifact.year}`,
      item.artifact.official_identifier,
      item.artifact.title,
      item.artifact.subject,
      ...item.artifact.topics,
    ].join(" "),
  ).includes(term);
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const DECISION_KEYS = [
  "artifact_id",
  "canonical_artifact_hash",
  "canonicalization_version",
  "decision",
  "decision_date",
  "decision_id",
  "decision_record_hash",
  "decision_timestamp",
  "decision_validity",
  "expiration_status",
  "limitations",
  "review_package_hash",
  "review_package_id",
  "reviewed_scope",
  "reviewer_identity_source",
  "reviewer_name",
  "reviewer_statement",
  "reviewer_type",
  "schema_version",
  "supersession_status",
] as const;
const PUBLICATION_KEYS = [
  "artifact_id",
  "canonical_artifact_hash",
  "canonicalization_version",
  "disclaimer",
  "human_decision_hash",
  "human_decision_id",
  "publication_record_hash",
  "publication_record_id",
  "publication_scope",
  "publication_status",
  "published_at",
  "review_status",
  "revocation_status",
  "schema_version",
  "source_authorities",
] as const;

const exactKeys = (
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  error: string,
): void => {
  if (
    canonicalizeArcaRegulatoryJson(Object.keys(value).sort()) !==
    canonicalizeArcaRegulatoryJson([...expected].sort())
  )
    throw new Error(error);
};

const withoutHash = (
  value: Readonly<Record<string, unknown>>,
  field: string,
): Readonly<Record<string, unknown>> => {
  const clone = structuredClone(value) as Record<string, unknown>;
  delete clone[field];
  return clone;
};

const hashRecord = (
  domain: string,
  value: Readonly<Record<string, unknown>>,
  field: string,
): string =>
  createHash("sha256")
    .update(domain)
    .update("\n")
    .update(canonicalizeArcaRegulatoryJson(withoutHash(value, field)))
    .digest("hex");

export function computeArcaHumanDecisionHash(value: unknown): string {
  return hashRecord(
    "vlatam-ai-lab:arca-human-review-decision:v1",
    value as Readonly<Record<string, unknown>>,
    "decision_record_hash",
  );
}

export function computeArcaPublicationRecordHash(value: unknown): string {
  return hashRecord(
    "vlatam-ai-lab:arca-read-only-publication:v1",
    value as Readonly<Record<string, unknown>>,
    "publication_record_hash",
  );
}

export function validateArcaHumanReviewDecision(
  value: unknown,
  artifact: ArcaRegulatoryArtifact,
  reviewPackage: ArcaRegulatoryReviewPackage,
): asserts value is ArcaHumanReviewDecision {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("arca_human_decision_not_object");
  const record = value as Readonly<Record<string, unknown>>;
  exactKeys(record, DECISION_KEYS, "arca_human_decision_unknown_fields");
  const decision = value as ArcaHumanReviewDecision;
  if (
    decision.decision_id !== `${artifact.artifact_id}-human-decision` ||
    decision.artifact_id !== artifact.artifact_id ||
    decision.canonical_artifact_hash !== artifact.canonical_hash ||
    decision.review_package_id !== reviewPackage.review_package_id ||
    decision.review_package_hash !== reviewPackage.review_package_hash
  )
    throw new Error("arca_human_decision_binding_mismatch");
  if (
    decision.reviewer_name !== ARCA_HUMAN_REVIEWER_NAME ||
    decision.reviewer_type !== "human" ||
    decision.reviewer_identity_source !== "explicit_user_declaration"
  )
    throw new Error("arca_human_decision_reviewer_invalid");
  if (
    decision.decision_date !== ARCA_HUMAN_REVIEW_DECISION_DATE ||
    decision.decision_timestamp !== ARCA_HUMAN_REVIEW_DECISION_TIMESTAMP ||
    !Number.isFinite(Date.parse(decision.decision_timestamp))
  )
    throw new Error("arca_human_decision_timestamp_invalid");
  if (
    decision.decision !== "approved_for_read_only_publication" ||
    decision.decision_validity !== "valid" ||
    decision.expiration_status !== "not_expired" ||
    decision.supersession_status !== "current"
  )
    throw new Error("arca_human_decision_not_current_approval");
  if (
    canonicalizeArcaRegulatoryJson(decision.reviewed_scope) !==
      canonicalizeArcaRegulatoryJson([
        "official_text",
        "official_source_references",
        "annex_completeness",
      ]) ||
    decision.reviewer_statement !==
      "The reviewer manually checked the three regulations and confirmed that their official texts, source references and annexes are correct." ||
    canonicalizeArcaRegulatoryJson(decision.limitations) !==
      canonicalizeArcaRegulatoryJson([
        "informational_read_only_publication_only",
        "not_legal_advice",
        "not_customs_advice",
        "not_binding_interpretation",
        "no_execution_authority",
        "future_artifacts_require_separate_human_decision",
      ])
  )
    throw new Error("arca_human_decision_declared_scope_invalid");
  if (
    decision.schema_version !== ARCA_READ_ONLY_LIBRARY_SCHEMA_VERSION ||
    decision.canonicalization_version !==
      ARCA_REGULATORY_CANONICALIZATION_VERSION ||
    !SHA256_PATTERN.test(decision.decision_record_hash) ||
    computeArcaHumanDecisionHash(decision) !== decision.decision_record_hash
  )
    throw new Error("arca_human_decision_hash_invalid");
}

export function validateArcaReadOnlyPublicationRecord(
  value: unknown,
  artifact: ArcaRegulatoryArtifact,
  decision: ArcaHumanReviewDecision,
): asserts value is ArcaReadOnlyPublicationRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("arca_publication_record_not_object");
  const record = value as Readonly<Record<string, unknown>>;
  exactKeys(record, PUBLICATION_KEYS, "arca_publication_record_unknown_fields");
  const publication = value as ArcaReadOnlyPublicationRecord;
  if (
    publication.publication_record_id !==
      `${artifact.artifact_id}-read-only-publication` ||
    publication.artifact_id !== artifact.artifact_id ||
    publication.canonical_artifact_hash !== artifact.canonical_hash ||
    publication.human_decision_id !== decision.decision_id ||
    publication.human_decision_hash !== decision.decision_record_hash
  )
    throw new Error("arca_publication_record_binding_mismatch");
  if (
    decision.decision !== "approved_for_read_only_publication" ||
    decision.decision_validity !== "valid" ||
    decision.expiration_status !== "not_expired" ||
    decision.supersession_status !== "current" ||
    publication.publication_status !== "published_read_only" ||
    publication.review_status !== "approved" ||
    publication.publication_scope !== "informational_regulatory_library" ||
    publication.revocation_status !== "not_revoked"
  )
    throw new Error("arca_publication_record_not_eligible");
  if (
    publication.published_at !== ARCA_HUMAN_REVIEW_DECISION_TIMESTAMP ||
    publication.disclaimer !== ARCA_READ_ONLY_LIBRARY_DISCLAIMER ||
    canonicalizeArcaRegulatoryJson(publication.source_authorities) !==
      canonicalizeArcaRegulatoryJson([
        "ARCA",
        "Boletín Oficial de la República Argentina",
      ])
  )
    throw new Error("arca_publication_record_scope_invalid");
  if (
    publication.schema_version !== ARCA_READ_ONLY_LIBRARY_SCHEMA_VERSION ||
    publication.canonicalization_version !==
      ARCA_REGULATORY_CANONICALIZATION_VERSION ||
    !SHA256_PATTERN.test(publication.publication_record_hash) ||
    computeArcaPublicationRecordHash(publication) !==
      publication.publication_record_hash
  )
    throw new Error("arca_publication_record_hash_invalid");
}

const loadJson = (root: string, relativePath: string): unknown =>
  JSON.parse(readFileSync(resolve(root, relativePath), "utf8")) as unknown;

export function loadArcaReadOnlyLibrary(
  repositoryRoot: string,
  batch: ArcaRegulatoryBatchProjection = loadArcaRegulatoryBatch(
    repositoryRoot,
  ),
): ArcaReadOnlyLibraryProjection {
  const decisionInputs = ARCA_HUMAN_DECISION_ASSET_PATHS.map((path) =>
    loadJson(repositoryRoot, path),
  );
  const publicationInputs = ARCA_PUBLICATION_RECORD_ASSET_PATHS.map((path) =>
    loadJson(repositoryRoot, path),
  );
  const items = batch.artifacts.map((artifact, index) => {
    const reviewPackage = batch.review_packages[index];
    const decision = decisionInputs[index];
    const publication = publicationInputs[index];
    if (!reviewPackage)
      throw new Error("arca_read_only_library_review_package_missing");
    validateArcaHumanReviewDecision(decision, artifact, reviewPackage);
    validateArcaReadOnlyPublicationRecord(publication, artifact, decision);
    return {
      artifact: structuredClone(artifact),
      review_package: structuredClone(reviewPackage),
      human_decision: structuredClone(decision),
      publication_record: structuredClone(publication),
    };
  });
  if (
    items.length !== 3 ||
    new Set(items.map((item) => item.artifact.artifact_id)).size !== 3 ||
    new Set(items.map((item) => item.human_decision.decision_id)).size !== 3 ||
    new Set(items.map((item) => item.publication_record.publication_record_id))
      .size !== 3
  )
    throw new Error("arca_read_only_library_scope_invalid");
  return Object.freeze({
    library_id: "ar-arca-read-only-library-2026",
    items,
    human_decisions: items.map((item) => item.human_decision),
    publication_records: items.map((item) => item.publication_record),
    pending_real_regulations: 0,
    approved_real_regulations: 3,
    published_read_only_regulations: 3,
    model_execution_permitted: false,
    runtime_arca_execution_available: false,
    scheduler_active: false,
    database_write_authorized: false,
    external_side_effects_performed: false,
    legal_interpretation_performed: false,
  });
}

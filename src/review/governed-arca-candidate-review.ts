import { createHash } from "node:crypto";

import { Ajv2020 as Ajv } from "ajv/dist/2020.js";

import {
  validateGovernedArcaCandidate,
  type GovernedArcaCandidateArtifact,
} from "../ingestion/governed-arca-acquired-source.js";
import {
  canonicalizeReviewJson,
  REVIEW_CANONICALIZATION_VERSION,
} from "./review-artifact-binding.js";

export const ARCA_CANDIDATE_REVIEW_CONTRACT_VERSION = "1.0.0" as const;
export const ARCA_CANDIDATE_REVIEW_EVALUATION_CONTRACT_VERSION =
  "1.0.0" as const;
export const ARCA_CANDIDATE_HASH_DOMAIN =
  "vlatam-ai-lab/governed-arca-candidate/v1" as const;
export const ARCA_CANDIDATE_REVIEW_HASH_DOMAIN =
  "vlatam-ai-lab/governed-arca-candidate-review/v1" as const;
export const ARCA_CANDIDATE_REVIEW_EVALUATION_HASH_DOMAIN =
  "vlatam-ai-lab/governed-arca-candidate-review-evaluation/v1" as const;
export const ARCA_REVIEW_SCOPE = "approved_artifact_building_only" as const;

const SHA256_PATTERN = "^[a-f0-9]{64}$";
const TIMESTAMP_PATTERN =
  "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$";
const NON_EMPTY_PATTERN = ".*\\S.*";
const HUMAN_IDENTITY_PATTERN = "^human:[a-z0-9][a-z0-9._@-]*$";

export type ArcaReviewLifecycle =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "superseded";

export type ArcaReviewOutcome =
  | "invalid_review"
  | "invalid_candidate"
  | "candidate_binding_mismatch"
  | "pending_human_review"
  | "rejected"
  | "expired"
  | "superseded"
  | "eligible_for_approved_artifact_building";

export type ArcaFindingSeverity =
  | "blocker"
  | "high"
  | "medium"
  | "low"
  | "informational";

export interface ArcaCandidateBinding {
  readonly candidate_schema_version: string;
  readonly candidate_artifact_type: string;
  readonly candidate_artifact_id: string;
  readonly candidate_sha256: string;
  readonly acquisition_id: string;
  readonly acquisition_record_sha256: string;
  readonly raw_byte_sha256: string;
  readonly parser_id: string;
  readonly parser_version: string;
  readonly parser_configuration_sha256: string;
  readonly parsing_timestamp: string;
  readonly parsed_output_sha256: string;
  readonly tariff_line_count: number;
  readonly repository_relative_candidate_path: string | null;
}

export interface ArcaReviewFinding {
  readonly severity: ArcaFindingSeverity;
  readonly category:
    | "identity"
    | "provenance"
    | "parser_output"
    | "completeness"
    | "consistency"
    | "regulatory_accuracy"
    | "publication_readiness"
    | "other_controlled";
  readonly finding_code: string;
  readonly description: string;
  readonly resolution_status: "open" | "resolved" | "accepted_risk";
}

export interface GovernedArcaCandidateReview {
  readonly schema_version: "1.0.0";
  readonly artifact_type: "governed_arca_candidate_human_review";
  readonly canonicalization_version: typeof REVIEW_CANONICALIZATION_VERSION;
  readonly review_id: string;
  readonly review_sha256: string;
  readonly candidate_binding: ArcaCandidateBinding;
  readonly lifecycle: ArcaReviewLifecycle;
  readonly lifecycle_transition: {
    readonly from: Exclude<ArcaReviewLifecycle, "superseded"> | null;
    readonly to: ArcaReviewLifecycle;
  };
  readonly scope: typeof ARCA_REVIEW_SCOPE;
  readonly reviewer: {
    readonly identity: string;
    readonly identity_type: "human";
    readonly role: "evidence_reviewer";
  } | null;
  readonly decision_timestamp: string | null;
  readonly expires_at: string | null;
  readonly review_statement: string | null;
  readonly rejection_reason: string | null;
  readonly reason_codes: readonly (
    | "identity_verified"
    | "provenance_verified"
    | "parser_output_verified"
    | "completeness_verified"
    | "regulatory_accuracy_verified"
    | "identity_conflict"
    | "provenance_mismatch"
    | "parser_output_issue"
    | "incomplete_evidence"
    | "regulatory_inaccuracy"
    | "other_controlled"
  )[];
  readonly findings: readonly ArcaReviewFinding[];
  readonly separation_of_duties: {
    readonly acquisition_operator_identity: string | null;
    readonly parser_runtime_identity: string;
    readonly candidate_producer_identity: string | null;
    readonly evidence_reviewer_identity: string | null;
    readonly future_artifact_builder_identity: null;
    readonly future_publisher_export_approver_identity: null;
    readonly reviewer_independence_asserted: boolean;
  };
  readonly superseded_by: {
    readonly review_id: string;
    readonly review_sha256: string;
  } | null;
}

export type ArcaReviewReasonCode =
  | "candidate_schema_invalid"
  | "review_schema_invalid"
  | "review_hash_invalid"
  | "review_identity_invalid"
  | "review_timestamp_invalid"
  | "review_decision_in_future"
  | "review_expiry_missing"
  | "review_expiry_not_after_decision"
  | "lifecycle_transition_invalid"
  | "reviewer_missing"
  | "reviewer_not_human"
  | "reviewer_role_invalid"
  | "acquisition_operator_identity_missing"
  | "candidate_producer_identity_missing"
  | "reviewer_acquisition_operator_conflict"
  | "reviewer_candidate_producer_conflict"
  | "reviewer_parser_runtime_conflict"
  | "reviewer_independence_not_asserted"
  | "approval_statement_missing"
  | "rejection_reason_missing"
  | "unresolved_blocking_finding"
  | "supersession_reference_missing"
  | "supersession_reference_unexpected"
  | "candidate_schema_version_mismatch"
  | "candidate_artifact_type_mismatch"
  | "candidate_artifact_id_mismatch"
  | "candidate_sha256_mismatch"
  | "acquisition_id_mismatch"
  | "acquisition_record_sha256_mismatch"
  | "raw_byte_sha256_mismatch"
  | "parser_id_mismatch"
  | "parser_version_mismatch"
  | "parser_configuration_sha256_mismatch"
  | "parser_runtime_identity_mismatch"
  | "candidate_provenance_path_invalid"
  | "parsing_timestamp_mismatch"
  | "parsed_output_sha256_mismatch"
  | "tariff_line_count_mismatch"
  | "candidate_fixed_state_mismatch"
  | "review_pending"
  | "review_rejected"
  | "review_expired"
  | "review_superseded"
  | "review_approved_for_later_builder_only";

export interface GovernedArcaCandidateReviewEvaluation {
  readonly schema_version: "1.0.0";
  readonly artifact_type: "governed_arca_candidate_review_evaluation";
  readonly evaluation_id: string;
  readonly evaluation_sha256: string;
  readonly evaluated_at: string;
  readonly candidate_artifact_id: string | null;
  readonly candidate_sha256: string | null;
  readonly review_id: string | null;
  readonly review_sha256: string | null;
  readonly outcome: ArcaReviewOutcome;
  readonly reason_codes: readonly ArcaReviewReasonCode[];
  readonly unresolved_findings_count: number;
  readonly eligible_for_approved_artifact_building: boolean;
  readonly approved_artifact_created: false;
  readonly export_authorized: false;
  readonly publication_authorized: false;
  readonly production_reliance_authorized: false;
  readonly database_write_authorized: false;
  readonly network_call_authorized: false;
  readonly scheduler_authorized: false;
  readonly deployment_authorized: false;
  readonly vlatam_global_access_authorized: false;
  readonly execution_performed: false;
}

const nullableTimestamp = {
  anyOf: [{ type: "null" }, { type: "string", pattern: TIMESTAMP_PATTERN }],
} as const;
const nullableIdentity = {
  anyOf: [{ type: "null" }, { type: "string", pattern: NON_EMPTY_PATTERN }],
} as const;

const CANDIDATE_BINDING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "candidate_schema_version",
    "candidate_artifact_type",
    "candidate_artifact_id",
    "candidate_sha256",
    "acquisition_id",
    "acquisition_record_sha256",
    "raw_byte_sha256",
    "parser_id",
    "parser_version",
    "parser_configuration_sha256",
    "parsing_timestamp",
    "parsed_output_sha256",
    "tariff_line_count",
    "repository_relative_candidate_path",
  ],
  properties: {
    candidate_schema_version: { type: "string", pattern: NON_EMPTY_PATTERN },
    candidate_artifact_type: { type: "string", pattern: NON_EMPTY_PATTERN },
    candidate_artifact_id: {
      type: "string",
      pattern: "^arca-candidate--[a-f0-9]{64}$",
    },
    candidate_sha256: { type: "string", pattern: SHA256_PATTERN },
    acquisition_id: { type: "string", pattern: NON_EMPTY_PATTERN },
    acquisition_record_sha256: { type: "string", pattern: SHA256_PATTERN },
    raw_byte_sha256: { type: "string", pattern: SHA256_PATTERN },
    parser_id: { type: "string", pattern: NON_EMPTY_PATTERN },
    parser_version: { type: "string", pattern: NON_EMPTY_PATTERN },
    parser_configuration_sha256: { type: "string", pattern: SHA256_PATTERN },
    parsing_timestamp: { type: "string", pattern: TIMESTAMP_PATTERN },
    parsed_output_sha256: { type: "string", pattern: SHA256_PATTERN },
    tariff_line_count: { type: "integer", minimum: 1 },
    repository_relative_candidate_path: {
      anyOf: [{ type: "null" }, { type: "string", pattern: NON_EMPTY_PATTERN }],
    },
  },
} as const;

const REASON_CODES = [
  "identity_verified",
  "provenance_verified",
  "parser_output_verified",
  "completeness_verified",
  "regulatory_accuracy_verified",
  "identity_conflict",
  "provenance_mismatch",
  "parser_output_issue",
  "incomplete_evidence",
  "regulatory_inaccuracy",
  "other_controlled",
] as const;

export const GOVERNED_ARCA_CANDIDATE_REVIEW_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/governed-arca-candidate-review.schema.json",
  title: "Governed ARCA candidate independent human review",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "artifact_type",
    "canonicalization_version",
    "review_id",
    "review_sha256",
    "candidate_binding",
    "lifecycle",
    "lifecycle_transition",
    "scope",
    "reviewer",
    "decision_timestamp",
    "expires_at",
    "review_statement",
    "rejection_reason",
    "reason_codes",
    "findings",
    "separation_of_duties",
    "superseded_by",
  ],
  properties: {
    schema_version: { const: ARCA_CANDIDATE_REVIEW_CONTRACT_VERSION },
    artifact_type: { const: "governed_arca_candidate_human_review" },
    canonicalization_version: { const: REVIEW_CANONICALIZATION_VERSION },
    review_id: { type: "string", pattern: "^arca-review--[a-f0-9]{64}$" },
    review_sha256: { type: "string", pattern: SHA256_PATTERN },
    candidate_binding: CANDIDATE_BINDING_SCHEMA,
    lifecycle: {
      enum: ["pending", "approved", "rejected", "expired", "superseded"],
    },
    lifecycle_transition: {
      type: "object",
      additionalProperties: false,
      required: ["from", "to"],
      properties: {
        from: {
          enum: [null, "pending", "approved", "rejected", "expired"],
        },
        to: {
          enum: ["pending", "approved", "rejected", "expired", "superseded"],
        },
      },
    },
    scope: { const: ARCA_REVIEW_SCOPE },
    reviewer: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["identity", "identity_type", "role"],
          properties: {
            identity: { type: "string", pattern: HUMAN_IDENTITY_PATTERN },
            identity_type: { const: "human" },
            role: { const: "evidence_reviewer" },
          },
        },
      ],
    },
    decision_timestamp: nullableTimestamp,
    expires_at: nullableTimestamp,
    review_statement: nullableIdentity,
    rejection_reason: nullableIdentity,
    reason_codes: {
      type: "array",
      uniqueItems: true,
      items: { enum: REASON_CODES },
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "severity",
          "category",
          "finding_code",
          "description",
          "resolution_status",
        ],
        properties: {
          severity: {
            enum: ["blocker", "high", "medium", "low", "informational"],
          },
          category: {
            enum: [
              "identity",
              "provenance",
              "parser_output",
              "completeness",
              "consistency",
              "regulatory_accuracy",
              "publication_readiness",
              "other_controlled",
            ],
          },
          finding_code: { type: "string", pattern: "^[a-z0-9][a-z0-9._-]*$" },
          description: {
            type: "string",
            pattern: NON_EMPTY_PATTERN,
            maxLength: 500,
          },
          resolution_status: { enum: ["open", "resolved", "accepted_risk"] },
        },
      },
    },
    separation_of_duties: {
      type: "object",
      additionalProperties: false,
      required: [
        "acquisition_operator_identity",
        "parser_runtime_identity",
        "candidate_producer_identity",
        "evidence_reviewer_identity",
        "future_artifact_builder_identity",
        "future_publisher_export_approver_identity",
        "reviewer_independence_asserted",
      ],
      properties: {
        acquisition_operator_identity: nullableIdentity,
        parser_runtime_identity: { type: "string", pattern: NON_EMPTY_PATTERN },
        candidate_producer_identity: nullableIdentity,
        evidence_reviewer_identity: {
          anyOf: [
            { type: "null" },
            { type: "string", pattern: HUMAN_IDENTITY_PATTERN },
          ],
        },
        future_artifact_builder_identity: { type: "null" },
        future_publisher_export_approver_identity: { type: "null" },
        reviewer_independence_asserted: { type: "boolean" },
      },
    },
    superseded_by: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["review_id", "review_sha256"],
          properties: {
            review_id: {
              type: "string",
              pattern: "^arca-review--[a-f0-9]{64}$",
            },
            review_sha256: { type: "string", pattern: SHA256_PATTERN },
          },
        },
      ],
    },
  },
} as const;

const EVALUATION_REASON_CODES: readonly ArcaReviewReasonCode[] = [
  "candidate_schema_invalid",
  "review_schema_invalid",
  "review_hash_invalid",
  "review_identity_invalid",
  "review_timestamp_invalid",
  "review_decision_in_future",
  "review_expiry_missing",
  "review_expiry_not_after_decision",
  "lifecycle_transition_invalid",
  "reviewer_missing",
  "reviewer_not_human",
  "reviewer_role_invalid",
  "acquisition_operator_identity_missing",
  "candidate_producer_identity_missing",
  "reviewer_acquisition_operator_conflict",
  "reviewer_candidate_producer_conflict",
  "reviewer_parser_runtime_conflict",
  "reviewer_independence_not_asserted",
  "approval_statement_missing",
  "rejection_reason_missing",
  "unresolved_blocking_finding",
  "supersession_reference_missing",
  "supersession_reference_unexpected",
  "candidate_schema_version_mismatch",
  "candidate_artifact_type_mismatch",
  "candidate_artifact_id_mismatch",
  "candidate_sha256_mismatch",
  "acquisition_id_mismatch",
  "acquisition_record_sha256_mismatch",
  "raw_byte_sha256_mismatch",
  "parser_id_mismatch",
  "parser_version_mismatch",
  "parser_configuration_sha256_mismatch",
  "parser_runtime_identity_mismatch",
  "candidate_provenance_path_invalid",
  "parsing_timestamp_mismatch",
  "parsed_output_sha256_mismatch",
  "tariff_line_count_mismatch",
  "candidate_fixed_state_mismatch",
  "review_pending",
  "review_rejected",
  "review_expired",
  "review_superseded",
  "review_approved_for_later_builder_only",
];

export const GOVERNED_ARCA_CANDIDATE_REVIEW_EVALUATION_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/governed-arca-candidate-review-evaluation.schema.json",
  title: "Governed ARCA candidate review evaluation result",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "artifact_type",
    "evaluation_id",
    "evaluation_sha256",
    "evaluated_at",
    "candidate_artifact_id",
    "candidate_sha256",
    "review_id",
    "review_sha256",
    "outcome",
    "reason_codes",
    "unresolved_findings_count",
    "eligible_for_approved_artifact_building",
    "approved_artifact_created",
    "export_authorized",
    "publication_authorized",
    "production_reliance_authorized",
    "database_write_authorized",
    "network_call_authorized",
    "scheduler_authorized",
    "deployment_authorized",
    "vlatam_global_access_authorized",
    "execution_performed",
  ],
  properties: {
    schema_version: {
      const: ARCA_CANDIDATE_REVIEW_EVALUATION_CONTRACT_VERSION,
    },
    artifact_type: { const: "governed_arca_candidate_review_evaluation" },
    evaluation_id: {
      type: "string",
      pattern: "^arca-review-evaluation--[a-f0-9]{64}$",
    },
    evaluation_sha256: { type: "string", pattern: SHA256_PATTERN },
    evaluated_at: { type: "string", pattern: TIMESTAMP_PATTERN },
    candidate_artifact_id: {
      anyOf: [
        { type: "null" },
        { type: "string", pattern: "^arca-candidate--[a-f0-9]{64}$" },
      ],
    },
    candidate_sha256: {
      anyOf: [{ type: "null" }, { type: "string", pattern: SHA256_PATTERN }],
    },
    review_id: {
      anyOf: [
        { type: "null" },
        { type: "string", pattern: "^arca-review--[a-f0-9]{64}$" },
      ],
    },
    review_sha256: {
      anyOf: [{ type: "null" }, { type: "string", pattern: SHA256_PATTERN }],
    },
    outcome: {
      enum: [
        "invalid_review",
        "invalid_candidate",
        "candidate_binding_mismatch",
        "pending_human_review",
        "rejected",
        "expired",
        "superseded",
        "eligible_for_approved_artifact_building",
      ],
    },
    reason_codes: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { enum: EVALUATION_REASON_CODES },
    },
    unresolved_findings_count: { type: "integer", minimum: 0 },
    eligible_for_approved_artifact_building: { type: "boolean" },
    approved_artifact_created: { const: false },
    export_authorized: { const: false },
    publication_authorized: { const: false },
    production_reliance_authorized: { const: false },
    database_write_authorized: { const: false },
    network_call_authorized: { const: false },
    scheduler_authorized: { const: false },
    deployment_authorized: { const: false },
    vlatam_global_access_authorized: { const: false },
    execution_performed: { const: false },
  },
} as const;

const ajv = new Ajv({ allErrors: true, strict: true });
const validateReview = ajv.compile(GOVERNED_ARCA_CANDIDATE_REVIEW_SCHEMA);
const validateEvaluation = ajv.compile(
  GOVERNED_ARCA_CANDIDATE_REVIEW_EVALUATION_SCHEMA,
);

function hash(domain: string, value: unknown): string {
  return createHash("sha256")
    .update(domain)
    .update("\n")
    .update(canonicalizeReviewJson(value))
    .digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function isRepositoryRelativePath(value: string | null): boolean {
  if (value === null) return true;
  const pathOnly = value.split("#", 1)[0] ?? "";
  return (
    pathOnly.length > 0 &&
    !pathOnly.startsWith("/") &&
    !pathOnly.startsWith("\\") &&
    !/^[A-Za-z]:[\\/]/.test(pathOnly) &&
    !pathOnly.split(/[\\/]/).includes("..")
  );
}

export function computeGovernedArcaCandidateSha256(candidate: unknown): string {
  return hash(ARCA_CANDIDATE_HASH_DOMAIN, candidate);
}

export function computeGovernedArcaCandidateArtifactId(
  candidate: unknown,
): string {
  return `arca-candidate--${computeGovernedArcaCandidateSha256(candidate)}`;
}

export function createArcaCandidateBinding(
  candidate: GovernedArcaCandidateArtifact,
  repositoryRelativeCandidatePath: string | null = null,
): ArcaCandidateBinding {
  const candidateSha256 = computeGovernedArcaCandidateSha256(candidate);
  return {
    candidate_schema_version: candidate.schema_version,
    candidate_artifact_type: candidate.artifact_type,
    candidate_artifact_id: `arca-candidate--${candidateSha256}`,
    candidate_sha256: candidateSha256,
    acquisition_id: candidate.acquisition_artifact.acquisition_id,
    acquisition_record_sha256:
      candidate.acquisition_artifact.acquisition_record_sha256,
    raw_byte_sha256: candidate.acquisition_artifact.raw_sha256,
    parser_id: candidate.parser.parser_id,
    parser_version: candidate.parser.parser_version,
    parser_configuration_sha256: candidate.parser.configuration_sha256,
    parsing_timestamp: candidate.parsing_timestamp,
    parsed_output_sha256: candidate.parsed_output_sha256,
    tariff_line_count: candidate.parsed_output.tariff_lines_count,
    repository_relative_candidate_path: repositoryRelativeCandidatePath,
  };
}

type UnsealedReview = Omit<
  GovernedArcaCandidateReview,
  "review_id" | "review_sha256"
>;

function reviewHashPayload(
  value: UnsealedReview | GovernedArcaCandidateReview,
): unknown {
  const clone = structuredClone(value) as Record<string, unknown>;
  delete clone["review_id"];
  delete clone["review_sha256"];
  return clone;
}

export function computeGovernedArcaReviewSha256(
  value: UnsealedReview | GovernedArcaCandidateReview,
): string {
  return hash(ARCA_CANDIDATE_REVIEW_HASH_DOMAIN, reviewHashPayload(value));
}

export function sealGovernedArcaCandidateReview(
  value: UnsealedReview,
): GovernedArcaCandidateReview {
  const reviewSha256 = computeGovernedArcaReviewSha256(value);
  return {
    ...structuredClone(value),
    review_id: `arca-review--${reviewSha256}`,
    review_sha256: reviewSha256,
  };
}

function bindingReasons(
  candidate: GovernedArcaCandidateArtifact,
  review: GovernedArcaCandidateReview,
): ArcaReviewReasonCode[] {
  const binding = review.candidate_binding;
  const expected = createArcaCandidateBinding(
    candidate,
    binding.repository_relative_candidate_path,
  );
  const fields: Array<[keyof ArcaCandidateBinding, ArcaReviewReasonCode]> = [
    ["candidate_schema_version", "candidate_schema_version_mismatch"],
    ["candidate_artifact_type", "candidate_artifact_type_mismatch"],
    ["candidate_artifact_id", "candidate_artifact_id_mismatch"],
    ["candidate_sha256", "candidate_sha256_mismatch"],
    ["acquisition_id", "acquisition_id_mismatch"],
    ["acquisition_record_sha256", "acquisition_record_sha256_mismatch"],
    ["raw_byte_sha256", "raw_byte_sha256_mismatch"],
    ["parser_id", "parser_id_mismatch"],
    ["parser_version", "parser_version_mismatch"],
    ["parser_configuration_sha256", "parser_configuration_sha256_mismatch"],
    ["parsing_timestamp", "parsing_timestamp_mismatch"],
    ["parsed_output_sha256", "parsed_output_sha256_mismatch"],
    ["tariff_line_count", "tariff_line_count_mismatch"],
  ];
  const reasons = fields
    .filter(([field]) => binding[field] !== expected[field])
    .map(([, reason]) => reason);
  if (
    review.separation_of_duties.parser_runtime_identity !==
    `runtime:${candidate.parser.parser_id}@${candidate.parser.parser_version}`
  )
    reasons.push("parser_runtime_identity_mismatch");
  if (!isRepositoryRelativePath(binding.repository_relative_candidate_path))
    reasons.push("candidate_provenance_path_invalid");
  return reasons;
}

function reviewSemanticReasons(
  review: GovernedArcaCandidateReview,
  evaluatedAt: string,
): ArcaReviewReasonCode[] {
  const reasons: ArcaReviewReasonCode[] = [];
  const transition = `${review.lifecycle_transition.from ?? "initial"}->${review.lifecycle_transition.to}`;
  const allowedTransitions = new Set([
    "initial->pending",
    "pending->approved",
    "pending->rejected",
    "pending->expired",
    "pending->superseded",
    "approved->expired",
    "approved->superseded",
    "rejected->superseded",
    "expired->superseded",
  ]);
  if (
    review.lifecycle_transition.to !== review.lifecycle ||
    !allowedTransitions.has(transition)
  )
    reasons.push("lifecycle_transition_invalid");
  const hasDecision = review.lifecycle !== "pending";
  if (hasDecision && !review.reviewer) reasons.push("reviewer_missing");
  if (
    hasDecision &&
    review.separation_of_duties.acquisition_operator_identity === null
  )
    reasons.push("acquisition_operator_identity_missing");
  if (
    hasDecision &&
    review.separation_of_duties.candidate_producer_identity === null
  )
    reasons.push("candidate_producer_identity_missing");
  if (review.reviewer) {
    if (review.reviewer.identity_type !== "human")
      reasons.push("reviewer_not_human");
    if (review.reviewer.role !== "evidence_reviewer")
      reasons.push("reviewer_role_invalid");
    if (
      review.separation_of_duties.evidence_reviewer_identity !==
      review.reviewer.identity
    )
      reasons.push("review_identity_invalid");
    if (
      review.separation_of_duties.acquisition_operator_identity ===
      review.reviewer.identity
    )
      reasons.push("reviewer_acquisition_operator_conflict");
    if (
      review.separation_of_duties.candidate_producer_identity ===
      review.reviewer.identity
    )
      reasons.push("reviewer_candidate_producer_conflict");
    if (
      review.separation_of_duties.parser_runtime_identity ===
      review.reviewer.identity
    )
      reasons.push("reviewer_parser_runtime_conflict");
    if (!review.separation_of_duties.reviewer_independence_asserted)
      reasons.push("reviewer_independence_not_asserted");
  } else if (review.separation_of_duties.evidence_reviewer_identity !== null) {
    reasons.push("review_identity_invalid");
  }
  const decisionIsCanonical = isCanonicalTimestamp(review.decision_timestamp);
  const expiryIsCanonical = isCanonicalTimestamp(review.expires_at);
  if (hasDecision && !decisionIsCanonical)
    reasons.push("review_timestamp_invalid");
  if (
    hasDecision &&
    decisionIsCanonical &&
    review.decision_timestamp > evaluatedAt
  )
    reasons.push("review_decision_in_future");
  if (!hasDecision && review.decision_timestamp !== null)
    reasons.push("review_timestamp_invalid");
  if (
    (review.lifecycle === "pending" || review.lifecycle === "approved") &&
    !expiryIsCanonical
  )
    reasons.push("review_expiry_missing");
  if (
    hasDecision &&
    review.expires_at !== null &&
    !expiryIsCanonical &&
    review.lifecycle !== "approved"
  )
    reasons.push("review_timestamp_invalid");
  if (
    hasDecision &&
    decisionIsCanonical &&
    expiryIsCanonical &&
    review.expires_at <= review.decision_timestamp
  )
    reasons.push("review_expiry_not_after_decision");
  if (review.lifecycle === "approved" && !review.review_statement?.trim())
    reasons.push("approval_statement_missing");
  if (review.lifecycle === "rejected" && !review.rejection_reason?.trim())
    reasons.push("rejection_reason_missing");
  if (review.lifecycle === "superseded" && review.superseded_by === null)
    reasons.push("supersession_reference_missing");
  if (review.lifecycle !== "superseded" && review.superseded_by !== null)
    reasons.push("supersession_reference_unexpected");
  if (
    review.lifecycle === "approved" &&
    review.findings.some(
      (finding) =>
        (finding.severity === "blocker" || finding.severity === "high") &&
        finding.resolution_status === "open",
    )
  )
    reasons.push("unresolved_blocking_finding");
  return reasons;
}

type EvaluationWithoutIdentity = Omit<
  GovernedArcaCandidateReviewEvaluation,
  "evaluation_id" | "evaluation_sha256"
>;

function evaluationHashPayload(
  value: EvaluationWithoutIdentity | GovernedArcaCandidateReviewEvaluation,
): EvaluationWithoutIdentity {
  const clone = structuredClone(value) as Record<string, unknown>;
  delete clone["evaluation_id"];
  delete clone["evaluation_sha256"];
  return clone as unknown as EvaluationWithoutIdentity;
}

export function computeGovernedArcaReviewEvaluationSha256(
  value: EvaluationWithoutIdentity | GovernedArcaCandidateReviewEvaluation,
): string {
  return hash(
    ARCA_CANDIDATE_REVIEW_EVALUATION_HASH_DOMAIN,
    evaluationHashPayload(value),
  );
}

export interface GovernedArcaReviewEvaluationValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/** Authoritative AI-127 validation for supplied immutable evaluations. */
export function validateGovernedArcaCandidateReviewEvaluation(
  value: unknown,
): GovernedArcaReviewEvaluationValidationResult {
  if (!validateEvaluation(value)) {
    return {
      valid: false,
      errors: [ajv.errorsText(validateEvaluation.errors)],
    };
  }
  const evaluation = value as GovernedArcaCandidateReviewEvaluation;
  const errors: string[] = [];
  if (!isCanonicalTimestamp(evaluation.evaluated_at))
    errors.push("evaluation_timestamp_not_canonical_utc");
  const expectedSha256 = computeGovernedArcaReviewEvaluationSha256(evaluation);
  if (evaluation.evaluation_sha256 !== expectedSha256)
    errors.push("evaluation_sha256_mismatch");
  if (evaluation.evaluation_id !== `arca-review-evaluation--${expectedSha256}`)
    errors.push("evaluation_id_mismatch");
  return { valid: errors.length === 0, errors };
}

export function sealGovernedArcaCandidateReviewEvaluation(
  value: EvaluationWithoutIdentity,
): GovernedArcaCandidateReviewEvaluation {
  const evaluationSha256 = computeGovernedArcaReviewEvaluationSha256(value);
  return {
    ...value,
    evaluation_id: `arca-review-evaluation--${evaluationSha256}`,
    evaluation_sha256: evaluationSha256,
  };
}

export function evaluateGovernedArcaCandidateReview(
  candidateValue: unknown,
  reviewValue: unknown,
  evaluatedAt: string,
): GovernedArcaCandidateReviewEvaluation {
  if (!isCanonicalTimestamp(evaluatedAt))
    throw new TypeError("evaluatedAt must be a canonical UTC timestamp");

  const candidateValidation = validateGovernedArcaCandidate(candidateValue);
  const candidate = candidateValidation.valid
    ? (candidateValue as GovernedArcaCandidateArtifact)
    : null;
  const candidateSha256 = candidate
    ? computeGovernedArcaCandidateSha256(candidate)
    : null;
  const candidateArtifactId = candidate
    ? `arca-candidate--${candidateSha256}`
    : null;
  const reviewRecord = isRecord(reviewValue) ? reviewValue : null;
  const reviewId =
    reviewRecord && typeof reviewRecord["review_id"] === "string"
      ? reviewRecord["review_id"]
      : null;
  const reviewSha256 =
    reviewRecord && typeof reviewRecord["review_sha256"] === "string"
      ? reviewRecord["review_sha256"]
      : null;

  let outcome: ArcaReviewOutcome;
  let reasonCodes: ArcaReviewReasonCode[];
  let unresolvedFindingsCount = 0;

  if (!candidate) {
    outcome = "invalid_candidate";
    reasonCodes = ["candidate_schema_invalid"];
  } else if (!validateReview(reviewValue)) {
    outcome = "invalid_review";
    reasonCodes = ["review_schema_invalid"];
  } else {
    const review = reviewValue as GovernedArcaCandidateReview;
    unresolvedFindingsCount = review.findings.filter(
      (finding) => finding.resolution_status === "open",
    ).length;
    const expectedReviewSha256 = computeGovernedArcaReviewSha256(review);
    if (
      review.review_sha256 !== expectedReviewSha256 ||
      review.review_id !== `arca-review--${expectedReviewSha256}`
    ) {
      outcome = "invalid_review";
      reasonCodes = ["review_hash_invalid"];
    } else {
      const semanticReasons = reviewSemanticReasons(review, evaluatedAt);
      if (semanticReasons.length > 0) {
        outcome = "invalid_review";
        reasonCodes = semanticReasons;
      } else {
        const mismatches = bindingReasons(candidate, review);
        if (
          candidate.review_state !== "human_review_required" ||
          candidate.approval_status !== "not_approved" ||
          candidate.publication_status !== "not_publishable"
        )
          mismatches.push("candidate_fixed_state_mismatch");
        if (mismatches.length > 0) {
          outcome = "candidate_binding_mismatch";
          reasonCodes = mismatches;
        } else if (review.lifecycle === "superseded") {
          outcome = "superseded";
          reasonCodes = ["review_superseded"];
        } else if (
          review.lifecycle === "expired" ||
          (review.expires_at !== null && review.expires_at <= evaluatedAt)
        ) {
          outcome = "expired";
          reasonCodes = ["review_expired"];
        } else if (review.lifecycle === "rejected") {
          outcome = "rejected";
          reasonCodes = ["review_rejected"];
        } else if (review.lifecycle === "pending") {
          outcome = "pending_human_review";
          reasonCodes = ["review_pending"];
        } else {
          outcome = "eligible_for_approved_artifact_building";
          reasonCodes = ["review_approved_for_later_builder_only"];
        }
      }
    }
  }

  const eligible = outcome === "eligible_for_approved_artifact_building";
  return sealGovernedArcaCandidateReviewEvaluation({
    schema_version: ARCA_CANDIDATE_REVIEW_EVALUATION_CONTRACT_VERSION,
    artifact_type: "governed_arca_candidate_review_evaluation",
    evaluated_at: evaluatedAt,
    candidate_artifact_id: candidateArtifactId,
    candidate_sha256: candidateSha256,
    review_id: reviewId,
    review_sha256: reviewSha256,
    outcome,
    reason_codes: reasonCodes,
    unresolved_findings_count: unresolvedFindingsCount,
    eligible_for_approved_artifact_building: eligible,
    approved_artifact_created: false,
    export_authorized: false,
    publication_authorized: false,
    production_reliance_authorized: false,
    database_write_authorized: false,
    network_call_authorized: false,
    scheduler_authorized: false,
    deployment_authorized: false,
    vlatam_global_access_authorized: false,
    execution_performed: false,
  });
}

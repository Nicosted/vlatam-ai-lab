import { createHash, randomUUID } from "node:crypto";
import { lstat, link, mkdir, open, rm } from "node:fs/promises";
import { join, parse, relative, resolve, sep } from "node:path";

import { Ajv2020 as Ajv } from "ajv/dist/2020.js";

import {
  GOVERNED_ARCA_CANDIDATE_SCHEMA,
  validateGovernedArcaCandidate,
  type GovernedArcaCandidateArtifact,
} from "../ingestion/governed-arca-acquired-source.js";
import {
  GOVERNED_ARCA_CANDIDATE_REVIEW_SCHEMA,
  computeGovernedArcaCandidateSha256,
  evaluateGovernedArcaCandidateReview,
  validateGovernedArcaCandidateReviewEvaluation,
  type ArcaCandidateBinding,
  type GovernedArcaCandidateReview,
  type GovernedArcaCandidateReviewEvaluation,
} from "../review/governed-arca-candidate-review.js";
import {
  REVIEW_CANONICALIZATION_VERSION,
  canonicalizeReviewJson,
} from "../review/review-artifact-binding.js";

export const APPROVED_ARCA_ARTIFACT_CONTRACT_VERSION = "1.0.0" as const;
export const APPROVED_ARCA_BUILD_RESULT_CONTRACT_VERSION = "1.0.0" as const;
export const APPROVED_ARCA_BUILDER_VERSION = "1.0.0" as const;
export const APPROVED_ARCA_SERVICE_BUILDER_IDENTITY =
  `service:approved-arca-builder@${APPROVED_ARCA_BUILDER_VERSION}` as const;
export const APPROVED_ARCA_ARTIFACT_HASH_DOMAIN =
  "vlatam-ai-lab/approved-arca-artifact/v1" as const;
export const APPROVED_ARCA_BUILDER_CONFIGURATION_HASH_DOMAIN =
  "vlatam-ai-lab/approved-arca-builder-configuration/v1" as const;

const SHA256_PATTERN = "^[a-f0-9]{64}$";
const TIMESTAMP_PATTERN =
  "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$";
const BUILDER_IDENTITY_PATTERN =
  "^(?:human:[a-z0-9][a-z0-9._@-]*|service:approved-arca-builder@1\\.0\\.0)$";

export const APPROVED_ARCA_BUILDER_CONFIGURATION = {
  configuration_version: "1.0.0",
  builder_version: APPROVED_ARCA_BUILDER_VERSION,
  canonicalization_version: REVIEW_CANONICALIZATION_VERSION,
  artifact_hash_domain: APPROVED_ARCA_ARTIFACT_HASH_DOMAIN,
  evaluation_time_policy: "recompute_at_supplied_evaluation_timestamp",
  local_layout: "approved-artifact-id-json-v1",
  publication_strategy: "staging-hard-link-no-overwrite-v1",
  approved_payload_policy: "exact-candidate-parsed-output-v1",
} as const;

function domainHash(domain: string, value: unknown): string {
  return createHash("sha256")
    .update(domain)
    .update("\n")
    .update(canonicalizeReviewJson(value))
    .digest("hex");
}

export const APPROVED_ARCA_BUILDER_CONFIGURATION_SHA256 = domainHash(
  APPROVED_ARCA_BUILDER_CONFIGURATION_HASH_DOMAIN,
  APPROVED_ARCA_BUILDER_CONFIGURATION,
);

export interface ApprovedArcaArtifact {
  readonly schema_version: "1.0.0";
  readonly artifact_type: "approved_arca_artifact";
  readonly canonicalization_version: typeof REVIEW_CANONICALIZATION_VERSION;
  readonly approved_artifact_id: string;
  readonly approved_artifact_sha256: string;
  readonly candidate_binding: ArcaCandidateBinding;
  readonly review_binding: {
    readonly schema_version: "1.0.0";
    readonly artifact_type: "governed_arca_candidate_human_review";
    readonly review_id: string;
    readonly review_sha256: string;
    readonly reviewer_identity: string;
    readonly decision_timestamp: string;
    readonly expires_at: string;
  };
  readonly evaluation_binding: {
    readonly schema_version: "1.0.0";
    readonly artifact_type: "governed_arca_candidate_review_evaluation";
    readonly evaluation_id: string;
    readonly evaluation_sha256: string;
    readonly evaluated_at: string;
    readonly candidate_artifact_id: string;
    readonly candidate_sha256: string;
    readonly review_id: string;
    readonly review_sha256: string;
    readonly outcome: "eligible_for_approved_artifact_building";
  };
  readonly acquisition_id: string;
  readonly acquisition_record_sha256: string;
  readonly raw_byte_sha256: string;
  readonly parser: {
    readonly parser_id: string;
    readonly parser_version: string;
    readonly configuration_sha256: string;
  };
  readonly parsing_timestamp: string;
  readonly parsed_output_sha256: string;
  readonly tariff_line_count: number;
  readonly reviewer_human_identity: string;
  readonly review_decision_timestamp: string;
  readonly review_expires_at: string;
  readonly builder_identity: string;
  readonly builder_version: typeof APPROVED_ARCA_BUILDER_VERSION;
  readonly builder_configuration_sha256: string;
  readonly build_timestamp: string;
  readonly approved_payload: GovernedArcaCandidateArtifact["parsed_output"];
  readonly approval_status: "approved";
  readonly export_status: "not_exported";
  readonly publication_status: "not_published";
  readonly production_reliance: "not_authorized";
  readonly vlatam_global_consumption: "not_authorized";
}

export type ApprovedArcaBuildOutcome =
  | "invalid_candidate"
  | "invalid_review"
  | "invalid_evaluation"
  | "evaluation_mismatch"
  | "not_eligible"
  | "review_expired"
  | "separation_of_duties_violation"
  | "invalid_builder_identity"
  | "invalid_build_timestamp"
  | "approved_artifact_exists"
  | "approved_artifact_build_failed"
  | "approved_artifact_built";

export interface ApprovedArcaBuildResult {
  readonly schema_version: "1.0.0";
  readonly artifact_type: "approved_arca_artifact_build_result";
  readonly outcome: ApprovedArcaBuildOutcome;
  readonly approved_artifact_id: string | null;
  readonly approved_artifact_sha256: string | null;
  readonly approved_artifact_created: boolean;
  readonly export_authorized: false;
  readonly publication_authorized: false;
  readonly production_reliance_authorized: false;
  readonly database_write_authorized: false;
  readonly network_call_authorized: false;
  readonly scheduler_authorized: false;
  readonly deployment_authorized: false;
  readonly vlatam_global_access_authorized: false;
}

export interface ApprovedArcaBuilderInput {
  readonly candidate: unknown;
  readonly review: unknown;
  readonly evaluation: unknown;
  readonly builderIdentity: string;
  readonly buildTimestamp: string;
}

export interface ApprovedArcaBuilderOptions {
  readonly approvedArtifactRoot: string;
}

const CANDIDATE_BINDING_SCHEMA =
  GOVERNED_ARCA_CANDIDATE_REVIEW_SCHEMA.properties.candidate_binding;

export const APPROVED_ARCA_ARTIFACT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/approved-arca-artifact.schema.json",
  title: "Immutable Approved ARCA Artifact",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "artifact_type",
    "canonicalization_version",
    "approved_artifact_id",
    "approved_artifact_sha256",
    "candidate_binding",
    "review_binding",
    "evaluation_binding",
    "acquisition_id",
    "acquisition_record_sha256",
    "raw_byte_sha256",
    "parser",
    "parsing_timestamp",
    "parsed_output_sha256",
    "tariff_line_count",
    "reviewer_human_identity",
    "review_decision_timestamp",
    "review_expires_at",
    "builder_identity",
    "builder_version",
    "builder_configuration_sha256",
    "build_timestamp",
    "approved_payload",
    "approval_status",
    "export_status",
    "publication_status",
    "production_reliance",
    "vlatam_global_consumption",
  ],
  properties: {
    schema_version: { const: APPROVED_ARCA_ARTIFACT_CONTRACT_VERSION },
    artifact_type: { const: "approved_arca_artifact" },
    canonicalization_version: { const: REVIEW_CANONICALIZATION_VERSION },
    approved_artifact_id: {
      type: "string",
      pattern: "^approved-arca-artifact--[a-f0-9]{64}$",
    },
    approved_artifact_sha256: { type: "string", pattern: SHA256_PATTERN },
    candidate_binding: CANDIDATE_BINDING_SCHEMA,
    review_binding: {
      type: "object",
      additionalProperties: false,
      required: [
        "schema_version",
        "artifact_type",
        "review_id",
        "review_sha256",
        "reviewer_identity",
        "decision_timestamp",
        "expires_at",
      ],
      properties: {
        schema_version: { const: "1.0.0" },
        artifact_type: { const: "governed_arca_candidate_human_review" },
        review_id: {
          type: "string",
          pattern: "^arca-review--[a-f0-9]{64}$",
        },
        review_sha256: { type: "string", pattern: SHA256_PATTERN },
        reviewer_identity: {
          type: "string",
          pattern: "^human:[a-z0-9][a-z0-9._@-]*$",
        },
        decision_timestamp: { type: "string", pattern: TIMESTAMP_PATTERN },
        expires_at: { type: "string", pattern: TIMESTAMP_PATTERN },
      },
    },
    evaluation_binding: {
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
      ],
      properties: {
        schema_version: { const: "1.0.0" },
        artifact_type: {
          const: "governed_arca_candidate_review_evaluation",
        },
        evaluation_id: {
          type: "string",
          pattern: "^arca-review-evaluation--[a-f0-9]{64}$",
        },
        evaluation_sha256: { type: "string", pattern: SHA256_PATTERN },
        evaluated_at: { type: "string", pattern: TIMESTAMP_PATTERN },
        candidate_artifact_id: {
          type: "string",
          pattern: "^arca-candidate--[a-f0-9]{64}$",
        },
        candidate_sha256: { type: "string", pattern: SHA256_PATTERN },
        review_id: {
          type: "string",
          pattern: "^arca-review--[a-f0-9]{64}$",
        },
        review_sha256: { type: "string", pattern: SHA256_PATTERN },
        outcome: { const: "eligible_for_approved_artifact_building" },
      },
    },
    acquisition_id: { type: "string", minLength: 1 },
    acquisition_record_sha256: { type: "string", pattern: SHA256_PATTERN },
    raw_byte_sha256: { type: "string", pattern: SHA256_PATTERN },
    parser: GOVERNED_ARCA_CANDIDATE_SCHEMA.properties.parser,
    parsing_timestamp: { type: "string", pattern: TIMESTAMP_PATTERN },
    parsed_output_sha256: { type: "string", pattern: SHA256_PATTERN },
    tariff_line_count: { type: "integer", minimum: 1 },
    reviewer_human_identity: {
      type: "string",
      pattern: "^human:[a-z0-9][a-z0-9._@-]*$",
    },
    review_decision_timestamp: {
      type: "string",
      pattern: TIMESTAMP_PATTERN,
    },
    review_expires_at: { type: "string", pattern: TIMESTAMP_PATTERN },
    builder_identity: { type: "string", pattern: BUILDER_IDENTITY_PATTERN },
    builder_version: { const: APPROVED_ARCA_BUILDER_VERSION },
    builder_configuration_sha256: {
      const: APPROVED_ARCA_BUILDER_CONFIGURATION_SHA256,
    },
    build_timestamp: { type: "string", pattern: TIMESTAMP_PATTERN },
    approved_payload: GOVERNED_ARCA_CANDIDATE_SCHEMA.properties.parsed_output,
    approval_status: { const: "approved" },
    export_status: { const: "not_exported" },
    publication_status: { const: "not_published" },
    production_reliance: { const: "not_authorized" },
    vlatam_global_consumption: { const: "not_authorized" },
  },
} as const;

const OUTCOMES: readonly ApprovedArcaBuildOutcome[] = [
  "invalid_candidate",
  "invalid_review",
  "invalid_evaluation",
  "evaluation_mismatch",
  "not_eligible",
  "review_expired",
  "separation_of_duties_violation",
  "invalid_builder_identity",
  "invalid_build_timestamp",
  "approved_artifact_exists",
  "approved_artifact_build_failed",
  "approved_artifact_built",
];

export const APPROVED_ARCA_BUILD_RESULT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/approved-arca-artifact-build-result.schema.json",
  title: "Approved ARCA Artifact build result",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "artifact_type",
    "outcome",
    "approved_artifact_id",
    "approved_artifact_sha256",
    "approved_artifact_created",
    "export_authorized",
    "publication_authorized",
    "production_reliance_authorized",
    "database_write_authorized",
    "network_call_authorized",
    "scheduler_authorized",
    "deployment_authorized",
    "vlatam_global_access_authorized",
  ],
  properties: {
    schema_version: { const: APPROVED_ARCA_BUILD_RESULT_CONTRACT_VERSION },
    artifact_type: { const: "approved_arca_artifact_build_result" },
    outcome: { enum: OUTCOMES },
    approved_artifact_id: {
      anyOf: [
        { type: "null" },
        {
          type: "string",
          pattern: "^approved-arca-artifact--[a-f0-9]{64}$",
        },
      ],
    },
    approved_artifact_sha256: {
      anyOf: [{ type: "null" }, { type: "string", pattern: SHA256_PATTERN }],
    },
    approved_artifact_created: { type: "boolean" },
    export_authorized: { const: false },
    publication_authorized: { const: false },
    production_reliance_authorized: { const: false },
    database_write_authorized: { const: false },
    network_call_authorized: { const: false },
    scheduler_authorized: { const: false },
    deployment_authorized: { const: false },
    vlatam_global_access_authorized: { const: false },
  },
  allOf: [
    {
      if: {
        required: ["outcome"],
        properties: { outcome: { const: "approved_artifact_built" } },
      },
      then: {
        properties: {
          approved_artifact_created: { const: true },
          approved_artifact_id: { type: "string" },
          approved_artifact_sha256: { type: "string" },
        },
      },
      else: {
        properties: { approved_artifact_created: { const: false } },
      },
    },
  ],
} as const;

const ajv = new Ajv({ allErrors: true, strict: true });
const validateArtifactSchema = ajv.compile(APPROVED_ARCA_ARTIFACT_SCHEMA);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function isBuilderIdentity(value: string): boolean {
  return new RegExp(BUILDER_IDENTITY_PATTERN).test(value);
}

function artifactHashPayload(
  artifact:
    | Omit<
        ApprovedArcaArtifact,
        "approved_artifact_id" | "approved_artifact_sha256"
      >
    | ApprovedArcaArtifact,
): unknown {
  const clone = structuredClone(artifact) as Record<string, unknown>;
  delete clone["approved_artifact_id"];
  delete clone["approved_artifact_sha256"];
  return clone;
}

export function computeApprovedArcaArtifactSha256(
  artifact:
    | Omit<
        ApprovedArcaArtifact,
        "approved_artifact_id" | "approved_artifact_sha256"
      >
    | ApprovedArcaArtifact,
): string {
  return domainHash(
    APPROVED_ARCA_ARTIFACT_HASH_DOMAIN,
    artifactHashPayload(artifact),
  );
}

export interface ApprovedArcaArtifactValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export function validateApprovedArcaArtifact(
  value: unknown,
): ApprovedArcaArtifactValidationResult {
  if (!validateArtifactSchema(value)) {
    return {
      valid: false,
      errors: [ajv.errorsText(validateArtifactSchema.errors)],
    };
  }
  const artifact = value as ApprovedArcaArtifact;
  const errors: string[] = [];
  const expectedHash = computeApprovedArcaArtifactSha256(artifact);
  if (artifact.approved_artifact_sha256 !== expectedHash)
    errors.push("approved_artifact_sha256_mismatch");
  if (
    artifact.approved_artifact_id !== `approved-arca-artifact--${expectedHash}`
  )
    errors.push("approved_artifact_id_mismatch");
  if (
    artifact.candidate_binding.candidate_artifact_id !==
    `arca-candidate--${artifact.candidate_binding.candidate_sha256}`
  )
    errors.push("candidate_identity_binding_mismatch");
  if (
    artifact.acquisition_id !== artifact.candidate_binding.acquisition_id ||
    artifact.acquisition_record_sha256 !==
      artifact.candidate_binding.acquisition_record_sha256 ||
    artifact.raw_byte_sha256 !== artifact.candidate_binding.raw_byte_sha256 ||
    artifact.parser.parser_id !== artifact.candidate_binding.parser_id ||
    artifact.parser.parser_version !==
      artifact.candidate_binding.parser_version ||
    artifact.parser.configuration_sha256 !==
      artifact.candidate_binding.parser_configuration_sha256 ||
    artifact.parsing_timestamp !==
      artifact.candidate_binding.parsing_timestamp ||
    artifact.parsed_output_sha256 !==
      artifact.candidate_binding.parsed_output_sha256 ||
    artifact.tariff_line_count !== artifact.candidate_binding.tariff_line_count
  )
    errors.push("candidate_field_binding_mismatch");
  if (
    artifact.reviewer_human_identity !==
      artifact.review_binding.reviewer_identity ||
    artifact.review_decision_timestamp !==
      artifact.review_binding.decision_timestamp ||
    artifact.review_expires_at !== artifact.review_binding.expires_at
  )
    errors.push("review_field_binding_mismatch");
  if (
    artifact.evaluation_binding.candidate_artifact_id !==
      artifact.candidate_binding.candidate_artifact_id ||
    artifact.evaluation_binding.candidate_sha256 !==
      artifact.candidate_binding.candidate_sha256 ||
    artifact.evaluation_binding.review_id !==
      artifact.review_binding.review_id ||
    artifact.evaluation_binding.review_sha256 !==
      artifact.review_binding.review_sha256
  )
    errors.push("evaluation_field_binding_mismatch");
  if (
    artifact.approved_payload.tariff_lines_count !==
      artifact.approved_payload.tariff_lines.length ||
    artifact.approved_payload.tariff_lines_count !==
      artifact.tariff_line_count ||
    createHash("sha256")
      .update(JSON.stringify(artifact.approved_payload))
      .digest("hex") !== artifact.parsed_output_sha256
  )
    errors.push("approved_payload_binding_mismatch");
  return { valid: errors.length === 0, errors };
}

function result(
  outcome: ApprovedArcaBuildOutcome,
  artifact: ApprovedArcaArtifact | null = null,
  created = false,
): ApprovedArcaBuildResult {
  return {
    schema_version: APPROVED_ARCA_BUILD_RESULT_CONTRACT_VERSION,
    artifact_type: "approved_arca_artifact_build_result",
    outcome,
    approved_artifact_id: artifact?.approved_artifact_id ?? null,
    approved_artifact_sha256: artifact?.approved_artifact_sha256 ?? null,
    approved_artifact_created: created,
    export_authorized: false,
    publication_authorized: false,
    production_reliance_authorized: false,
    database_write_authorized: false,
    network_call_authorized: false,
    scheduler_authorized: false,
    deployment_authorized: false,
    vlatam_global_access_authorized: false,
  };
}

export interface ApprovedArcaArtifactPreparationSuccess {
  readonly artifact: ApprovedArcaArtifact;
}

export function prepareApprovedArcaArtifact(
  input: ApprovedArcaBuilderInput,
): ApprovedArcaArtifactPreparationSuccess | ApprovedArcaBuildResult {
  if (!isBuilderIdentity(input.builderIdentity))
    return result("invalid_builder_identity");
  if (!isCanonicalTimestamp(input.buildTimestamp))
    return result("invalid_build_timestamp");

  const candidateValidation = validateGovernedArcaCandidate(input.candidate);
  if (!candidateValidation.valid) return result("invalid_candidate");
  const candidate = input.candidate as GovernedArcaCandidateArtifact;

  const evaluationValidation = validateGovernedArcaCandidateReviewEvaluation(
    input.evaluation,
  );
  if (!evaluationValidation.valid) return result("invalid_evaluation");
  const evaluation = input.evaluation as GovernedArcaCandidateReviewEvaluation;

  const rawReview = isRecord(input.review) ? input.review : null;
  const rawSeparation =
    rawReview && isRecord(rawReview["separation_of_duties"])
      ? rawReview["separation_of_duties"]
      : null;
  if (
    rawSeparation &&
    [
      "acquisition_operator_identity",
      "parser_runtime_identity",
      "candidate_producer_identity",
      "evidence_reviewer_identity",
      "future_artifact_builder_identity",
      "future_publisher_export_approver_identity",
    ].some((field) => rawSeparation[field] === input.builderIdentity)
  )
    return result("separation_of_duties_violation");

  const recomputed = evaluateGovernedArcaCandidateReview(
    candidate,
    input.review,
    evaluation.evaluated_at,
  );
  if (recomputed.outcome === "invalid_review") return result("invalid_review");
  if (recomputed.outcome === "invalid_candidate")
    return result("invalid_candidate");

  if (canonicalizeReviewJson(evaluation) !== canonicalizeReviewJson(recomputed))
    return result("evaluation_mismatch");
  if (recomputed.outcome === "expired") return result("review_expired");
  if (recomputed.outcome !== "eligible_for_approved_artifact_building")
    return result("not_eligible");

  const review = input.review as GovernedArcaCandidateReview;
  if (!review.reviewer || !review.decision_timestamp || !review.expires_at)
    return result("invalid_review");
  if (review.expires_at <= input.buildTimestamp)
    return result("review_expired");
  if (
    input.buildTimestamp < candidate.parsing_timestamp ||
    input.buildTimestamp < review.decision_timestamp ||
    input.buildTimestamp < evaluation.evaluated_at
  )
    return result("invalid_build_timestamp");

  const prohibitedIdentities = [
    review.reviewer.identity,
    review.separation_of_duties.evidence_reviewer_identity,
    review.separation_of_duties.acquisition_operator_identity,
    review.separation_of_duties.candidate_producer_identity,
    review.separation_of_duties.parser_runtime_identity,
    review.separation_of_duties.future_publisher_export_approver_identity,
  ];
  if (prohibitedIdentities.includes(input.builderIdentity))
    return result("separation_of_duties_violation");
  if (
    review.separation_of_duties.future_artifact_builder_identity !== null ||
    review.separation_of_duties.future_publisher_export_approver_identity !==
      null
  )
    return result("invalid_review");

  const candidateSha256 = computeGovernedArcaCandidateSha256(candidate);
  const candidateBinding: ArcaCandidateBinding = {
    ...review.candidate_binding,
    repository_relative_candidate_path:
      review.candidate_binding.repository_relative_candidate_path,
  };
  if (
    candidateBinding.candidate_sha256 !== candidateSha256 ||
    candidateBinding.candidate_artifact_id !==
      `arca-candidate--${candidateSha256}`
  )
    return result("invalid_review");

  const unsealed: Omit<
    ApprovedArcaArtifact,
    "approved_artifact_id" | "approved_artifact_sha256"
  > = {
    schema_version: APPROVED_ARCA_ARTIFACT_CONTRACT_VERSION,
    artifact_type: "approved_arca_artifact",
    canonicalization_version: REVIEW_CANONICALIZATION_VERSION,
    candidate_binding: structuredClone(candidateBinding),
    review_binding: {
      schema_version: review.schema_version,
      artifact_type: review.artifact_type,
      review_id: review.review_id,
      review_sha256: review.review_sha256,
      reviewer_identity: review.reviewer.identity,
      decision_timestamp: review.decision_timestamp,
      expires_at: review.expires_at,
    },
    evaluation_binding: {
      schema_version: evaluation.schema_version,
      artifact_type: evaluation.artifact_type,
      evaluation_id: evaluation.evaluation_id,
      evaluation_sha256: evaluation.evaluation_sha256,
      evaluated_at: evaluation.evaluated_at,
      candidate_artifact_id: evaluation.candidate_artifact_id!,
      candidate_sha256: evaluation.candidate_sha256!,
      review_id: evaluation.review_id!,
      review_sha256: evaluation.review_sha256!,
      outcome: "eligible_for_approved_artifact_building",
    },
    acquisition_id: candidate.acquisition_artifact.acquisition_id,
    acquisition_record_sha256:
      candidate.acquisition_artifact.acquisition_record_sha256,
    raw_byte_sha256: candidate.acquisition_artifact.raw_sha256,
    parser: structuredClone(candidate.parser),
    parsing_timestamp: candidate.parsing_timestamp,
    parsed_output_sha256: candidate.parsed_output_sha256,
    tariff_line_count: candidate.parsed_output.tariff_lines_count,
    reviewer_human_identity: review.reviewer.identity,
    review_decision_timestamp: review.decision_timestamp,
    review_expires_at: review.expires_at,
    builder_identity: input.builderIdentity,
    builder_version: APPROVED_ARCA_BUILDER_VERSION,
    builder_configuration_sha256: APPROVED_ARCA_BUILDER_CONFIGURATION_SHA256,
    build_timestamp: input.buildTimestamp,
    approved_payload: structuredClone(candidate.parsed_output),
    approval_status: "approved",
    export_status: "not_exported",
    publication_status: "not_published",
    production_reliance: "not_authorized",
    vlatam_global_consumption: "not_authorized",
  };
  const approvedArtifactSha256 = computeApprovedArcaArtifactSha256(unsealed);
  const artifact: ApprovedArcaArtifact = {
    ...unsealed,
    approved_artifact_id: `approved-arca-artifact--${approvedArtifactSha256}`,
    approved_artifact_sha256: approvedArtifactSha256,
  };
  if (!validateApprovedArcaArtifact(artifact).valid)
    return result("approved_artifact_build_failed");
  if (
    canonicalizeReviewJson(artifact.approved_payload) !==
    canonicalizeReviewJson(candidate.parsed_output)
  )
    return result("approved_artifact_build_failed");
  return { artifact };
}

async function validateConfiguredRoot(root: string): Promise<string> {
  const resolvedRoot = resolve(root);
  const filesystemRoot = parse(resolvedRoot).root;
  const components = relative(filesystemRoot, resolvedRoot)
    .split(sep)
    .filter(Boolean);
  let current = filesystemRoot;
  for (const component of components) {
    current = join(current, component);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory())
        throw new Error("unsafe approved artifact root");
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return resolvedRoot;
      throw error;
    }
  }
  return resolvedRoot;
}

async function publishApprovedArcaArtifact(
  root: string,
  artifact: ApprovedArcaArtifact,
): Promise<"built" | "exists" | "failed"> {
  let stagingPath: string | null = null;
  try {
    const resolvedRoot = await validateConfiguredRoot(root);
    await mkdir(resolvedRoot, { recursive: true });
    await validateConfiguredRoot(resolvedRoot);
    const artifactPath = join(
      resolvedRoot,
      `${artifact.approved_artifact_id}.json`,
    );
    try {
      await lstat(artifactPath);
      return "exists";
    } catch (error: unknown) {
      if (
        !(error instanceof Error && "code" in error && error.code === "ENOENT")
      )
        return "failed";
    }
    stagingPath = join(resolvedRoot, `.staging-${randomUUID()}`);
    const handle = await open(stagingPath, "wx");
    try {
      await handle.writeFile(`${JSON.stringify(artifact, null, 2)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await validateConfiguredRoot(resolvedRoot);
    await link(stagingPath, artifactPath);
    return "built";
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST")
      return "exists";
    return "failed";
  } finally {
    if (stagingPath) await rm(stagingPath, { force: true });
  }
}

export async function buildApprovedArcaArtifact(
  input: ApprovedArcaBuilderInput,
  options: ApprovedArcaBuilderOptions,
): Promise<ApprovedArcaBuildResult> {
  const prepared = prepareApprovedArcaArtifact(input);
  if ("outcome" in prepared) return prepared;
  const publication = await publishApprovedArcaArtifact(
    options.approvedArtifactRoot,
    prepared.artifact,
  );
  if (publication === "exists")
    return result("approved_artifact_exists", prepared.artifact);
  if (publication === "failed")
    return result("approved_artifact_build_failed", prepared.artifact);
  return result("approved_artifact_built", prepared.artifact, true);
}

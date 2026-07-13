/**
 * Human Review Gate Agent — PCRAM Chain Step 5/5
 *
 * Applies an explicit human review decision to a local classifier intelligence
 * artifact. This is the deterministic review boundary before any future
 * downstream consumption.
 */

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  type ClassifierIntelligenceArtifact,
  validateClassifierIntelligenceArtifact,
} from "../contracts/vlatam-global-bridge.js";
import {
  CURRENT_REVIEW_POLICY,
  createReviewBinding,
  ReviewBindingError,
  validateReviewBindingIntegrity,
  type ReviewBinding,
  type ReviewDecision,
} from "../review/review-artifact-binding.js";

export type { ReviewDecision } from "../review/review-artifact-binding.js";
export type ReviewStatus = "draft" | "reviewed_approved" | "reviewed_rejected";

export interface HumanReviewInput {
  source_id: string;
  artifact_id: string;
  decision: ReviewDecision;
  reviewer: string;
  reviewed_at: string;
  review_policy_id?: string;
  review_policy_version?: string;
  classifier_approval_reference?: string;
  downstream_eligibility_reason?: string;
}

export interface HumanReviewOptions {
  data_root?: string;
}

export interface ReviewedArtifact extends ClassifierIntelligenceArtifact {
  review_status: ReviewStatus;
  reviewer: string;
  reviewed_at: string;
  classifier_approval_reference?: string;
  downstream_eligibility_reason?: string;
  review_binding: ReviewBinding;
}

const SOURCE_ID_REGEX = /^[a-z0-9_-]+$/;
const ARTIFACT_ID_REGEX = /^artifact--[a-z0-9_-]+--[a-z0-9_-]+$/;
const REVIEWER_REGEX = /^[a-z0-9_-]+$/;

function assertContainedPath(
  candidatePath: string,
  expectedRoot: string,
): void {
  const resolvedRoot = path.resolve(expectedRoot);
  const resolvedCandidate = path.resolve(candidatePath);
  if (
    resolvedCandidate !== resolvedRoot &&
    !resolvedCandidate.startsWith(resolvedRoot + path.sep)
  ) {
    throw new Error("Artifact path escapes data/intelligence directory");
  }
}

function validateInput(input: HumanReviewInput): void {
  if (!SOURCE_ID_REGEX.test(input.source_id)) {
    throw new Error(`Invalid source_id: ${input.source_id}`);
  }
  if (!ARTIFACT_ID_REGEX.test(input.artifact_id)) {
    throw new Error(`Invalid artifact_id: ${input.artifact_id}`);
  }
  if (!REVIEWER_REGEX.test(input.reviewer)) {
    throw new Error(`Invalid reviewer: ${input.reviewer}`);
  }
  if (input.decision !== "approved" && input.decision !== "rejected") {
    throw new Error(`Invalid decision: ${input.decision}`);
  }
  if (!input.reviewed_at) {
    throw new Error(
      "Missing reviewed_at: human review requires explicit timestamp. No implicit fallback.",
    );
  }
  if (Number.isNaN(Date.parse(input.reviewed_at))) {
    throw new Error(`Invalid reviewed_at: ${input.reviewed_at}`);
  }
  if (
    (input.review_policy_id ?? CURRENT_REVIEW_POLICY.policy_id) !==
      CURRENT_REVIEW_POLICY.policy_id ||
    (input.review_policy_version ?? CURRENT_REVIEW_POLICY.policy_version) !==
      CURRENT_REVIEW_POLICY.policy_version
  ) {
    throw new ReviewBindingError("review_policy_mismatch");
  }
  if (input.decision === "approved") {
    if (!input.classifier_approval_reference) {
      throw new Error(
        "Missing classifier_approval_reference: approved review requires explicit approval reference.",
      );
    }
    if (!input.downstream_eligibility_reason) {
      throw new Error(
        "Missing downstream_eligibility_reason: approved review requires explicit eligibility reason.",
      );
    }
  }
}

function getArtifactPath(
  input: HumanReviewInput,
  options?: HumanReviewOptions,
): string {
  const dataRoot = path.resolve(options?.data_root ?? process.cwd(), "data");
  const intelligenceRoot = path.resolve(dataRoot, "intelligence");
  const artifactPath = path.resolve(
    intelligenceRoot,
    input.source_id,
    `${input.artifact_id}.json`,
  );
  assertContainedPath(artifactPath, intelligenceRoot);
  return artifactPath;
}

function loadArtifact(
  artifactPath: string,
  input: HumanReviewInput,
): ClassifierIntelligenceArtifact {
  if (!existsSync(artifactPath)) {
    throw new Error(
      `Artifact not found: source_id='${input.source_id}', artifact_id='${input.artifact_id}'`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(artifactPath, "utf-8")) as unknown;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Existing artifact invalid: failed to parse JSON: ${message}`,
    );
  }

  const valid = validateClassifierIntelligenceArtifact(parsed);
  if (
    !valid.ok &&
    valid.errors.length > 0 &&
    valid.errors.every((error) => error === "review_revalidation_required")
  ) {
    // An explicit new human review is the only allowed migration for a
    // historical reviewed artifact. Never synthesize a binding in place.
    return parsed as ClassifierIntelligenceArtifact;
  }
  if (!valid.ok || valid.artifact === undefined) {
    throw new Error(`Existing artifact invalid: ${valid.errors.join(", ")}`);
  }

  return valid.artifact;
}

function buildReviewedArtifact(
  artifact: ClassifierIntelligenceArtifact,
  input: HumanReviewInput,
): ReviewedArtifact {
  const reviewBinding = createReviewBinding(artifact, {
    review_decision: input.decision,
    reviewed_at: input.reviewed_at,
    review_policy_id: input.review_policy_id ?? CURRENT_REVIEW_POLICY.policy_id,
    review_policy_version:
      input.review_policy_version ?? CURRENT_REVIEW_POLICY.policy_version,
  });
  if (input.decision === "approved") {
    const classifierApprovalReference = input.classifier_approval_reference;
    const downstreamEligibilityReason = input.downstream_eligibility_reason;
    if (
      classifierApprovalReference === undefined ||
      downstreamEligibilityReason === undefined
    ) {
      throw new Error(
        "Approved review requires classifier approval reference and eligibility reason.",
      );
    }

    const updated: ReviewedArtifact = {
      ...artifact,
      review_status: "reviewed_approved",
      reviewer: input.reviewer,
      reviewed_at: input.reviewed_at,
      classifier_approval_reference: classifierApprovalReference,
      downstream_eligibility_reason: downstreamEligibilityReason,
      review_binding: reviewBinding,
      governance: {
        human_review_required: false,
        downstream_allowed: true,
        review_only: false,
        not_final_classification: false,
      },
    };
    return updated;
  }

  const updated: ReviewedArtifact = {
    ...artifact,
    review_status: "reviewed_rejected",
    reviewer: input.reviewer,
    reviewed_at: input.reviewed_at,
    downstream_eligibility_reason:
      input.downstream_eligibility_reason ?? "Rejected by human review gate.",
    review_binding: reviewBinding,
    governance: {
      human_review_required: true,
      downstream_allowed: false,
      review_only: true,
      not_final_classification: true,
    },
  };

  delete updated.classifier_approval_reference;
  return updated;
}

export async function applyHumanReview(
  input: HumanReviewInput,
  options?: HumanReviewOptions,
): Promise<ReviewedArtifact> {
  validateInput(input);

  const artifactPath = getArtifactPath(input, options);
  const artifact = loadArtifact(artifactPath, input);
  const updatedArtifact = buildReviewedArtifact(artifact, input);

  const validationResult =
    validateClassifierIntelligenceArtifact(updatedArtifact);
  if (!validationResult.ok) {
    throw new Error(
      `Schema validation failed for reviewed artifact: ${validationResult.errors.join(", ")}`,
    );
  }
  validateReviewBindingIntegrity(updatedArtifact, CURRENT_REVIEW_POLICY);

  const tempPath = `${artifactPath}.${randomUUID()}.tmp`;
  writeFileSync(
    tempPath,
    JSON.stringify(updatedArtifact, null, 2) + "\n",
    "utf-8",
  );
  renameSync(tempPath, artifactPath);

  return updatedArtifact;
}

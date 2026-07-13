import { createHash } from "node:crypto";

export const REVIEW_BINDING_SCHEMA_VERSION = "1.0.0" as const;
export const REVIEW_CANONICALIZATION_VERSION = "review-json-v1" as const;
export const REVIEW_ARTIFACT_DOMAIN =
  "vlatam-ai-lab/review-artifact/v1" as const;
export const REVIEW_BINDING_DOMAIN = "vlatam-ai-lab/review-binding/v1" as const;
export const CURRENT_REVIEW_POLICY = {
  policy_id: "classifier-human-review",
  policy_version: "1.0.0",
} as const;

export type ReviewDecision = "approved" | "rejected";

export interface ReviewBinding {
  readonly binding_schema_version: typeof REVIEW_BINDING_SCHEMA_VERSION;
  readonly artifact_id: string;
  readonly artifact_schema_version: string;
  readonly artifact_content_hash: string;
  readonly canonicalization_version: typeof REVIEW_CANONICALIZATION_VERSION;
  readonly review_decision: ReviewDecision;
  readonly reviewed_at: string;
  readonly review_policy_id: string;
  readonly review_policy_version: string;
  readonly review_binding_hash: string;
}

export interface ReviewPolicyExpectation {
  readonly policy_id: string;
  readonly policy_version: string;
  readonly maximum_review_age_seconds?: number;
}

export type ReviewBindingReasonCode =
  | "review_binding_missing"
  | "review_binding_malformed"
  | "review_binding_version_unsupported"
  | "review_canonicalization_unsupported"
  | "artifact_id_mismatch"
  | "artifact_source_id_mismatch"
  | "artifact_schema_version_mismatch"
  | "artifact_content_hash_mismatch"
  | "review_policy_mismatch"
  | "review_decision_mismatch"
  | "review_timestamp_mismatch"
  | "review_binding_hash_mismatch"
  | "review_rejected"
  | "review_stale"
  | "review_revalidation_required";

export class ReviewBindingError extends Error {
  constructor(readonly reason_code: ReviewBindingReasonCode) {
    super(`Review binding validation failed: ${reason_code}`);
    this.name = "ReviewBindingError";
  }
}

type ReviewArtifact = {
  readonly artifact_id?: unknown;
  readonly schema_version?: unknown;
  readonly review_status?: unknown;
  readonly reviewed_at?: unknown;
  readonly review_binding?: unknown;
  readonly governance?: unknown;
};

const HASH = /^sha256:[a-f0-9]{64}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const BINDING_KEYS = [
  "binding_schema_version",
  "artifact_id",
  "artifact_schema_version",
  "artifact_content_hash",
  "canonicalization_version",
  "review_decision",
  "reviewed_at",
  "review_policy_id",
  "review_policy_version",
  "review_binding_hash",
] as const;
const BINDING_KEY_SET = new Set<string>(BINDING_KEYS);
const REVIEW_GENERATED_TOP_LEVEL_FIELDS = new Set([
  "review_status",
  "reviewer",
  "reviewed_at",
  "classifier_approval_reference",
  "downstream_eligibility_reason",
  "review_binding",
]);
const REVIEW_GENERATED_GOVERNANCE_FIELDS = new Set([
  "human_review_required",
  "downstream_allowed",
  "review_only",
  "not_final_classification",
]);
const FORBIDDEN_REVIEW_CONTENT_KEY =
  /^(?:api[_-]?key|password|secret|credential|authorization|bearer|provider|provider_id|provider_metadata|prompt|prompts|messages)$/i;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function canonical(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("Unsupported non-finite number");
    return JSON.stringify(value);
  }
  if (
    value === undefined ||
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "bigint"
  ) {
    throw new TypeError(`Unsupported JSON value: ${typeof value}`);
  }
  if (!Array.isArray(value) && !isPlainRecord(value)) {
    throw new TypeError("Unsupported non-JSON object");
  }
  if (ancestors.has(value)) throw new TypeError("Unsupported cyclic value");
  ancestors.add(value);
  try {
    if (Array.isArray(value))
      return `[${value.map((item) => canonical(item, ancestors)).join(",")}]`;
    const symbolKeys = Object.getOwnPropertySymbols(value);
    if (symbolKeys.length > 0) throw new TypeError("Unsupported symbol key");
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key], ancestors)}`).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalizeReviewJson(
  value: unknown,
  canonicalizationVersion: string = REVIEW_CANONICALIZATION_VERSION,
): string {
  if (canonicalizationVersion !== REVIEW_CANONICALIZATION_VERSION) {
    throw new ReviewBindingError("review_canonicalization_unsupported");
  }
  return canonical(value, new Set<object>());
}

function sha256(domain: string, canonicalJson: string): string {
  return `sha256:${createHash("sha256").update(domain).update("\n").update(canonicalJson).digest("hex")}`;
}

function assertNoForbiddenReviewContent(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNoForbiddenReviewContent(item);
    return;
  }
  if (!isPlainRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_REVIEW_CONTENT_KEY.test(key)) {
      throw new TypeError(`Forbidden review artifact field: ${key}`);
    }
    assertNoForbiddenReviewContent(child);
  }
}

export function toReviewableArtifact(
  artifact: ReviewArtifact,
): Record<string, unknown> {
  if (!isPlainRecord(artifact))
    throw new TypeError("Review artifact must be a plain object");
  const reviewable: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(artifact)) {
    if (REVIEW_GENERATED_TOP_LEVEL_FIELDS.has(key)) continue;
    if (key === "governance") {
      if (!isPlainRecord(value))
        throw new TypeError("Artifact governance must be a plain object");
      reviewable[key] = Object.fromEntries(
        Object.entries(value).filter(
          ([governanceKey]) =>
            !REVIEW_GENERATED_GOVERNANCE_FIELDS.has(governanceKey),
        ),
      );
      continue;
    }
    reviewable[key] = value;
  }
  assertNoForbiddenReviewContent(reviewable);
  return reviewable;
}

export function artifactContentHash(artifact: ReviewArtifact): string {
  return sha256(
    REVIEW_ARTIFACT_DOMAIN,
    canonicalizeReviewJson(toReviewableArtifact(artifact)),
  );
}

function bindingPayload(
  binding: Omit<ReviewBinding, "review_binding_hash">,
): Record<string, unknown> {
  return {
    binding_schema_version: binding.binding_schema_version,
    artifact_id: binding.artifact_id,
    artifact_schema_version: binding.artifact_schema_version,
    artifact_content_hash: binding.artifact_content_hash,
    canonicalization_version: binding.canonicalization_version,
    review_decision: binding.review_decision,
    reviewed_at: binding.reviewed_at,
    review_policy_id: binding.review_policy_id,
    review_policy_version: binding.review_policy_version,
  };
}

function calculateBindingHash(
  binding: Omit<ReviewBinding, "review_binding_hash">,
): string {
  return sha256(
    REVIEW_BINDING_DOMAIN,
    canonicalizeReviewJson(bindingPayload(binding)),
  );
}

export function createReviewBinding(
  artifact: ReviewArtifact,
  input: {
    readonly review_decision: ReviewDecision;
    readonly reviewed_at: string;
    readonly review_policy_id: string;
    readonly review_policy_version: string;
  },
): ReviewBinding {
  if (
    typeof artifact.artifact_id !== "string" ||
    typeof artifact.schema_version !== "string"
  ) {
    throw new ReviewBindingError("review_binding_malformed");
  }
  const base: Omit<ReviewBinding, "review_binding_hash"> = {
    binding_schema_version: REVIEW_BINDING_SCHEMA_VERSION,
    artifact_id: artifact.artifact_id,
    artifact_schema_version: artifact.schema_version,
    artifact_content_hash: artifactContentHash(artifact),
    canonicalization_version: REVIEW_CANONICALIZATION_VERSION,
    review_decision: input.review_decision,
    reviewed_at: input.reviewed_at,
    review_policy_id: input.review_policy_id,
    review_policy_version: input.review_policy_version,
  };
  return { ...base, review_binding_hash: calculateBindingHash(base) };
}

export function isReviewBinding(value: unknown): value is ReviewBinding {
  if (!isPlainRecord(value)) return false;
  if (
    Object.keys(value).length !== BINDING_KEYS.length ||
    Object.keys(value).some((key) => !BINDING_KEY_SET.has(key))
  ) {
    return false;
  }
  return (
    typeof value["binding_schema_version"] === "string" &&
    typeof value["artifact_id"] === "string" &&
    typeof value["artifact_schema_version"] === "string" &&
    SEMVER.test(value["artifact_schema_version"]) &&
    typeof value["artifact_content_hash"] === "string" &&
    HASH.test(value["artifact_content_hash"]) &&
    typeof value["canonicalization_version"] === "string" &&
    (value["review_decision"] === "approved" ||
      value["review_decision"] === "rejected") &&
    typeof value["reviewed_at"] === "string" &&
    Number.isFinite(Date.parse(value["reviewed_at"])) &&
    typeof value["review_policy_id"] === "string" &&
    value["review_policy_id"].length > 0 &&
    typeof value["review_policy_version"] === "string" &&
    SEMVER.test(value["review_policy_version"]) &&
    typeof value["review_binding_hash"] === "string" &&
    HASH.test(value["review_binding_hash"])
  );
}

export function validateReviewBindingIntegrity(
  artifact: ReviewArtifact,
  policy: ReviewPolicyExpectation = CURRENT_REVIEW_POLICY,
  now: Date = new Date(),
): ReviewBinding {
  if (!isPlainRecord(artifact))
    throw new ReviewBindingError("review_binding_malformed");
  const value = artifact.review_binding;
  if (value === undefined) {
    if (
      artifact.review_status === "reviewed_approved" ||
      artifact.review_status === "reviewed_rejected"
    ) {
      throw new ReviewBindingError("review_revalidation_required");
    }
    throw new ReviewBindingError("review_binding_missing");
  }
  if (!isReviewBinding(value))
    throw new ReviewBindingError("review_binding_malformed");
  if (value.binding_schema_version !== REVIEW_BINDING_SCHEMA_VERSION) {
    throw new ReviewBindingError("review_binding_version_unsupported");
  }
  if (value.canonicalization_version !== REVIEW_CANONICALIZATION_VERSION) {
    throw new ReviewBindingError("review_canonicalization_unsupported");
  }
  if (artifact.artifact_id !== value.artifact_id)
    throw new ReviewBindingError("artifact_id_mismatch");
  if (artifact.schema_version !== value.artifact_schema_version) {
    throw new ReviewBindingError("artifact_schema_version_mismatch");
  }
  if (
    value.review_policy_id !== policy.policy_id ||
    value.review_policy_version !== policy.policy_version
  ) {
    throw new ReviewBindingError("review_policy_mismatch");
  }
  const expectedDecision =
    artifact.review_status === "reviewed_approved"
      ? "approved"
      : artifact.review_status === "reviewed_rejected"
        ? "rejected"
        : undefined;
  if (value.review_decision !== expectedDecision)
    throw new ReviewBindingError("review_decision_mismatch");
  if (artifact.reviewed_at !== value.reviewed_at)
    throw new ReviewBindingError("review_timestamp_mismatch");
  if (artifactContentHash(artifact) !== value.artifact_content_hash) {
    throw new ReviewBindingError("artifact_content_hash_mismatch");
  }
  const { review_binding_hash: reviewBindingHash, ...base } = value;
  if (calculateBindingHash(base) !== reviewBindingHash) {
    throw new ReviewBindingError("review_binding_hash_mismatch");
  }
  if (policy.maximum_review_age_seconds !== undefined) {
    const maximumAgeMs = policy.maximum_review_age_seconds * 1_000;
    if (now.getTime() - Date.parse(value.reviewed_at) > maximumAgeMs) {
      throw new ReviewBindingError("review_stale");
    }
  }
  return value;
}

export function assertValidReviewBinding(
  artifact: ReviewArtifact,
  policy: ReviewPolicyExpectation = CURRENT_REVIEW_POLICY,
  now: Date = new Date(),
): ReviewBinding {
  const binding = validateReviewBindingIntegrity(artifact, policy, now);
  if (binding.review_decision !== "approved")
    throw new ReviewBindingError("review_rejected");
  const governance = artifact.governance;
  if (!isPlainRecord(governance) || governance["downstream_allowed"] !== true) {
    throw new ReviewBindingError("review_rejected");
  }
  return binding;
}

// Pure, network-free freshness/status helpers for the intelligence foundation.
//
// Doctrine: when information is incomplete, prefer `unknown` or `requires_review`.
// Never report `current` on the basis of missing data. Review gates take
// precedence over recency: an unreviewed source that needs review is
// `requires_review` regardless of how recently it was checked.

import type {
  CadenceLabel,
  ExpectedUpdateCadence,
  FreshnessStatus,
  ReviewStatus,
} from "./types.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const CADENCE_DAYS: Record<CadenceLabel, number | null> = {
  daily: 1,
  weekly: 7,
  monthly: 31,
  quarterly: 92,
  annual: 366,
  irregular: null,
  unknown: null,
};

export interface FreshnessInput {
  /** Last freshness check/capture timestamp (ISO 8601), if known. */
  lastCheckedAt?: string | null;
  /** Expected update cadence, if known. */
  expectedUpdateCadence?: ExpectedUpdateCadence | null;
  /** Whether human review is required for this source/snapshot. */
  humanReviewRequired?: boolean;
  /** Explicit review status, if tracked. */
  reviewStatus?: ReviewStatus | null;
  /** Whether authority metadata is present and meaningful (not "unknown"). */
  hasAuthorityMetadata?: boolean;
  /** Whether reliability metadata is present and meaningful (not "unknown"). */
  hasReliabilityMetadata?: boolean;
  /** Reference "now" for testability. Defaults to current time. */
  now?: Date;
}

/**
 * Resolve an expected update cadence to a number of days, or null when the
 * cadence is irregular/unknown/absent.
 */
export function cadenceToDays(
  cadence: ExpectedUpdateCadence | null | undefined,
): number | null {
  if (!cadence) {
    return null;
  }

  if (typeof cadence.interval_days === "number" && cadence.interval_days > 0) {
    return cadence.interval_days;
  }

  return CADENCE_DAYS[cadence.label] ?? null;
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

/**
 * Conservatively classify freshness for a source or snapshot.
 *
 * Precedence:
 *  1. Explicit rejection or a pending human-review requirement -> requires_review.
 *  2. Missing authority/reliability metadata -> requires_review.
 *  3. Missing/unknown cadence or missing/invalid last-checked date -> unknown.
 *  4. Future last-checked date -> unknown.
 *  5. Age within cadence -> current; otherwise -> stale.
 */
export function classifyFreshness(input: FreshnessInput): FreshnessStatus {
  const {
    lastCheckedAt,
    expectedUpdateCadence,
    humanReviewRequired = false,
    reviewStatus = null,
    hasAuthorityMetadata = true,
    hasReliabilityMetadata = true,
    now = new Date(),
  } = input;

  // 1. Review gate.
  if (reviewStatus === "rejected") {
    return "requires_review";
  }

  if (humanReviewRequired && reviewStatus !== "approved") {
    return "requires_review";
  }

  // 2. Incomplete trust metadata cannot be treated as fresh.
  if (!hasAuthorityMetadata || !hasReliabilityMetadata) {
    return "requires_review";
  }

  // 3. Missing recency information is never "current".
  const cadenceDays = cadenceToDays(expectedUpdateCadence);
  const checkedAt = parseIsoDate(lastCheckedAt);
  if (cadenceDays === null || checkedAt === null) {
    return "unknown";
  }

  // 4. A future check date is not trustworthy.
  const ageDays = (now.getTime() - checkedAt.getTime()) / MS_PER_DAY;
  if (ageDays < 0) {
    return "unknown";
  }

  // 5. Recency vs cadence.
  return ageDays <= cadenceDays ? "current" : "stale";
}

export interface DownstreamSafetyInput {
  freshnessStatus: FreshnessStatus;
  reviewStatus?: ReviewStatus | null;
  humanReviewRequired?: boolean;
  downstreamAllowed?: boolean;
}

/**
 * Whether an item is safe for downstream consumption. Unreviewed intelligence
 * is never downstream-safe: every gate must explicitly pass.
 */
export function isDownstreamSafe(input: DownstreamSafetyInput): boolean {
  const {
    freshnessStatus,
    reviewStatus = null,
    humanReviewRequired = true,
    downstreamAllowed = false,
  } = input;

  if (!downstreamAllowed) {
    return false;
  }

  if (reviewStatus !== "approved") {
    return false;
  }

  if (humanReviewRequired && reviewStatus !== "approved") {
    return false;
  }

  return freshnessStatus === "current" || freshnessStatus === "stale";
}

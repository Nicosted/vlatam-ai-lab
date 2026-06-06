// Pure, network-free helpers for onboarding verified official sources.
//
// Doctrine encoded here:
//  - A `sample://` locator is never an official source, regardless of any flag.
//  - A source is "verified official" only when its verification_status says so
//    AND its locator is not a sample placeholder.
//  - Being official/verified never, by itself, makes a source downstream-safe.
//    Downstream safety still requires an explicit allow plus human review.
//  - Freshness is derived conservatively: missing data never reads as current.

import { classifyFreshness } from "./freshness.js";
import type { FreshnessStatus, SourceRegistryEntry } from "./types.js";

const SAMPLE_LOCATOR_PREFIX = "sample://";

/** Whether a locator is a non-authoritative sample/demo placeholder. */
export function isSampleLocator(locator: string): boolean {
  return locator.trim().toLowerCase().startsWith(SAMPLE_LOCATOR_PREFIX);
}

type VerificationView = Pick<
  SourceRegistryEntry,
  "verification_status" | "source_locator"
>;

/**
 * Whether a registry entry points at a verified official source. Requires both
 * an explicit `verified_official` status and a non-sample locator, so a sample
 * placeholder can never masquerade as official.
 */
export function isVerifiedOfficialSource(entry: VerificationView): boolean {
  return (
    entry.verification_status === "verified_official" &&
    !isSampleLocator(entry.source_locator)
  );
}

export type SourceVerificationLabel =
  | "verified-official"
  | "unverified-sample"
  | "deprecated"
  | "inconsistent";

/**
 * Stable, human-readable verification label. `inconsistent` flags an entry that
 * claims `verified_official` while still using a sample locator — a state the
 * onboarding process must never ship.
 */
export function sourceVerificationLabel(
  entry: VerificationView,
): SourceVerificationLabel {
  if (entry.verification_status === "deprecated") {
    return "deprecated";
  }

  if (entry.verification_status === "verified_official") {
    return isSampleLocator(entry.source_locator)
      ? "inconsistent"
      : "verified-official";
  }

  return "unverified-sample";
}

type FreshnessView = Pick<
  SourceRegistryEntry,
  | "last_checked_at"
  | "expected_update_cadence"
  | "human_review_required"
  | "authority_level"
  | "reliability_level"
>;

/**
 * Conservatively derive a freshness status for a registry entry by mapping it
 * onto the shared `classifyFreshness` rules. Registry entries carry no review
 * approval, so an entry requiring human review resolves to `requires_review`.
 */
export function deriveSourceFreshness(
  entry: FreshnessView,
  options: { now?: Date } = {},
): FreshnessStatus {
  return classifyFreshness({
    lastCheckedAt: entry.last_checked_at ?? null,
    expectedUpdateCadence: entry.expected_update_cadence ?? null,
    humanReviewRequired: entry.human_review_required,
    reviewStatus: null,
    hasAuthorityMetadata: entry.authority_level !== "unknown",
    hasReliabilityMetadata: entry.reliability_level !== "unknown",
    ...(options.now ? { now: options.now } : {}),
  });
}

/**
 * Downstream-safety guard for a registry entry. A registry entry is never
 * downstream-safe unless it is explicitly allowed, verified official, and flags
 * human review — and even then, actual review approval lives outside the
 * registry (in review manifests / snapshots), so callers must not treat a
 * `true` here as approval to publish unreviewed intelligence.
 */
export function isSourceDownstreamAllowed(
  entry: Pick<
    SourceRegistryEntry,
    | "downstream_allowed"
    | "verification_status"
    | "source_locator"
    | "human_review_required"
  >,
): boolean {
  if (!entry.downstream_allowed) {
    return false;
  }

  if (!isVerifiedOfficialSource(entry)) {
    return false;
  }

  return entry.human_review_required === true;
}

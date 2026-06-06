// Pure, network-free helpers for the gated source snapshot capture layer.
//
// Doctrine encoded here:
//  - A captured snapshot is not approved intelligence. Capturing only records
//    that a specific source state was observed and logged for review.
//  - A verified official source does NOT make a snapshot approved or
//    downstream-safe. Approval lives in review, not in source identity.
//  - human_review_required defaults to true; downstream_allowed defaults to
//    false. Any missing safety-relevant field resolves to its safe value.
//  - Missing captured_at is never "current". Missing/unknown freshness is never
//    treated as current. Missing content fingerprint produces a warning.
//  - Unreviewed snapshots are never extraction-ready and never downstream-safe.
//
// No scraping, no network, no AI provider calls happen here. These helpers only
// reason over already-recorded capture metadata.

import { classifyFreshness, isDownstreamSafe } from "./freshness.js";
import type {
  ExpectedUpdateCadence,
  FreshnessStatus,
  SourceSnapshot,
} from "./types.js";

const SHA256_PATTERN = /^(sha256:)?[a-fA-F0-9]{64}$/;

export type SnapshotCaptureDraft = Partial<SourceSnapshot> &
  Pick<
    SourceSnapshot,
    | "snapshot_id"
    | "source_id"
    | "captured_at"
    | "capture_method"
    | "schema_version"
  >;

/**
 * Apply conservative defaults to a partial snapshot. Any safety-relevant field
 * left undefined resolves to its most conservative value: review is required,
 * downstream use is denied, and freshness/review/extraction default to their
 * pre-progress states.
 */
export function withConservativeSnapshotDefaults(
  draft: SnapshotCaptureDraft,
): SourceSnapshot {
  return {
    ...draft,
    freshness_status: draft.freshness_status ?? "unknown",
    review_status: draft.review_status ?? "not_reviewed",
    extraction_status: draft.extraction_status ?? "not_started",
    human_review_required: draft.human_review_required ?? true,
    downstream_allowed: draft.downstream_allowed ?? false,
  };
}

type FreshnessView = Pick<
  SourceSnapshot,
  "captured_at" | "human_review_required" | "review_status"
>;

/**
 * Conservatively derive a freshness status for a snapshot using the shared
 * `classifyFreshness` rules. The snapshot's `captured_at` plays the role of the
 * last-checked timestamp. A snapshot carries authority by inheritance from its
 * registered source, so trust metadata is treated as present here; the source
 * registry remains responsible for authority/reliability gating.
 *
 * A pending human-review requirement takes precedence and yields
 * `requires_review`. Without a known cadence, a captured snapshot resolves to
 * `unknown` rather than `current`.
 */
export function deriveSnapshotFreshness(
  snapshot: FreshnessView,
  options: {
    now?: Date;
    expectedUpdateCadence?: ExpectedUpdateCadence | null;
  } = {},
): FreshnessStatus {
  return classifyFreshness({
    lastCheckedAt: snapshot.captured_at ?? null,
    expectedUpdateCadence: options.expectedUpdateCadence ?? null,
    humanReviewRequired: snapshot.human_review_required,
    reviewStatus: snapshot.review_status ?? null,
    hasAuthorityMetadata: true,
    hasReliabilityMetadata: true,
    ...(options.now ? { now: options.now } : {}),
  });
}

export type SnapshotReviewGate =
  | "approved"
  | "rejected"
  | "review_pending"
  | "review_required";

type ReviewView = Pick<
  SourceSnapshot,
  "review_status" | "human_review_required"
>;

/**
 * Resolve the review gate for a snapshot. Conservative: anything other than an
 * explicit approval (with review satisfied) keeps the snapshot behind a gate.
 */
export function deriveSnapshotReviewGate(
  snapshot: ReviewView,
): SnapshotReviewGate {
  if (snapshot.review_status === "rejected") {
    return "rejected";
  }

  if (snapshot.review_status === "approved") {
    return "approved";
  }

  if (snapshot.review_status === "in_review") {
    return "review_pending";
  }

  return "review_required";
}

/**
 * Collect conservative capture warnings. A missing content fingerprint or a
 * missing capture timestamp must surface explicitly rather than be silently
 * accepted. These are additive to any warnings already recorded on the
 * snapshot.
 */
export function snapshotCaptureWarnings(snapshot: SourceSnapshot): string[] {
  const warnings: string[] = [];

  if (!hasVerifiableSnapshotFingerprint(snapshot)) {
    warnings.push(
      "No verifiable content hash/checksum is tied to this snapshot; fingerprint cannot be verified.",
    );
  }

  if (!snapshot.captured_at) {
    warnings.push(
      "No captured_at timestamp is recorded; freshness cannot be treated as current.",
    );
  }

  return warnings;
}

/**
 * Whether the snapshot carries a verifiable content fingerprint (a sha256
 * content hash). Absence is not an error, but it is never silently treated as
 * verified.
 */
export function hasVerifiableSnapshotFingerprint(
  snapshot: Pick<SourceSnapshot, "content_hash">,
): boolean {
  return (
    typeof snapshot.content_hash === "string" &&
    SHA256_PATTERN.test(snapshot.content_hash)
  );
}

/**
 * Whether a snapshot is ready for AI extraction. Extraction readiness is
 * conservative: a snapshot must be captured (with a timestamp), still traceable
 * to a locator/reference, approved in review, and not in a failed extraction
 * state. Capturing or verifying a source never makes it extraction-ready on its
 * own — review approval is mandatory.
 */
export function isSnapshotExtractionReady(snapshot: SourceSnapshot): boolean {
  if (!snapshot.captured_at) {
    return false;
  }

  if (deriveSnapshotReviewGate(snapshot) !== "approved") {
    return false;
  }

  const hasLocator = Boolean(
    snapshot.source_locator ||
    snapshot.official_url ||
    snapshot.content_reference,
  );
  if (!hasLocator) {
    return false;
  }

  return snapshot.extraction_status !== "extraction_failed";
}

/**
 * Whether a snapshot may back downstream-consumable artifacts. Delegates to the
 * shared downstream-safety guard: an unreviewed snapshot is never
 * downstream-safe, regardless of how authoritative its source is.
 */
export function isSnapshotDownstreamAllowed(snapshot: SourceSnapshot): boolean {
  return isDownstreamSafe({
    freshnessStatus: snapshot.freshness_status,
    reviewStatus: snapshot.review_status,
    humanReviewRequired: snapshot.human_review_required,
    downstreamAllowed: snapshot.downstream_allowed,
  });
}

const CAPTURE_METHOD_LABELS: Record<SourceSnapshot["capture_method"], string> =
  {
    manual: "manual capture",
    local_fixture: "local fixture capture",
    approved_fetch: "approved fetch capture",
    api_import: "API import capture",
    other: "other capture",
  };

const REVIEW_GATE_LABELS: Record<SnapshotReviewGate, string> = {
  approved: "review approved",
  rejected: "review rejected",
  review_pending: "review pending",
  review_required: "review required",
};

/**
 * Stable, human-readable capture label combining capture method and review
 * gate, e.g. "manual capture — review required". Deterministic and safe for
 * use in evidence reports.
 */
export function snapshotCaptureLabel(snapshot: SourceSnapshot): string {
  const method = CAPTURE_METHOD_LABELS[snapshot.capture_method];
  const gate = REVIEW_GATE_LABELS[deriveSnapshotReviewGate(snapshot)];
  return `${method} — ${gate}`;
}

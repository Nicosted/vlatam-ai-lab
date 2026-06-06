// Pure, network-free helpers for the snapshot review manifest and extractable
// evidence packet layer.
//
// Doctrine encoded here:
//  - A source registry entry only proves a source exists. A snapshot only proves
//    a capture attempt was tracked. A review manifest is the explicit human/
//    documentary gate that says a snapshot has been reviewed enough to become an
//    extractable evidence input.
//  - human_review_required defaults to true; downstream_allowed defaults to
//    false. Any missing safety-relevant field resolves to its safe value.
//  - extraction_allowed is never implied by official source identity or by a
//    captured snapshot. It requires explicit review approval plus verified
//    identity/locator/capture/version gates; a missing content fingerprint blocks
//    extraction unless intentionally waived with an explicit warning.
//  - AI-ready is not downstream-approved. A reviewed manifest or extractable
//    packet may permit AI extraction, but never approves downstream classifier
//    use on its own. Downstream use requires a separate classifier approval.
//
// No scraping, no network, no AI provider calls, and no source content ingestion
// happen here. These helpers only reason over already-recorded review/evidence
// metadata and are safe to run in a browser.

import type {
  ExtractableEvidencePacket,
  SnapshotReviewManifest,
} from "./types.js";

/**
 * The resolved extraction gate for a review manifest. Anything other than
 * `extraction_allowed` keeps the reviewed snapshot behind a gate.
 */
export type ReviewManifestGate =
  | "extraction_allowed"
  | "extraction_blocked"
  | "rejected"
  | "review_required";

type ManifestGateView = Pick<
  SnapshotReviewManifest,
  | "review_status"
  | "human_review_required"
  | "source_identity_verified"
  | "locator_verified"
  | "capture_reference_verified"
  | "content_fingerprint_verified"
  | "version_scope_verified"
  | "extraction_allowed"
  | "warnings"
>;

/**
 * Whether a manifest's missing fingerprint verification is intentionally waived.
 * A waiver only counts when an explicit warning is recorded; absence is never
 * silently treated as verified.
 */
function fingerprintGateSatisfied(manifest: ManifestGateView): boolean {
  if (manifest.content_fingerprint_verified === true) {
    return true;
  }

  return Array.isArray(manifest.warnings) && manifest.warnings.length > 0;
}

/**
 * Resolve the extraction gate for a review manifest. Conservative: extraction is
 * only allowed when review is explicitly approved, every required verification
 * gate passes, the fingerprint gate is satisfied (verified or waived with a
 * warning), human review is required, and the manifest explicitly sets
 * `extraction_allowed`.
 */
export function deriveReviewManifestGate(
  manifest: ManifestGateView,
): ReviewManifestGate {
  if (manifest.review_status === "rejected") {
    return "rejected";
  }

  if (manifest.review_status !== "approved") {
    return "review_required";
  }

  const gatesVerified =
    manifest.human_review_required === true &&
    manifest.source_identity_verified === true &&
    manifest.locator_verified === true &&
    manifest.capture_reference_verified === true &&
    manifest.version_scope_verified === true &&
    fingerprintGateSatisfied(manifest);

  if (manifest.extraction_allowed === true && gatesVerified) {
    return "extraction_allowed";
  }

  return "extraction_blocked";
}

/**
 * Whether a reviewed snapshot may be used as an AI extraction input, according
 * to its review manifest. Official source/snapshot status alone never satisfies
 * this — only an explicitly approved, fully gated manifest does.
 */
export function isSnapshotExtractionAllowed(
  manifest: ManifestGateView,
): boolean {
  return deriveReviewManifestGate(manifest) === "extraction_allowed";
}

type PacketExtractionView = Pick<
  ExtractableEvidencePacket,
  | "extraction_allowed"
  | "human_review_required"
  | "extraction_status"
  | "content_reference"
  | "excerpt_reference"
  | "content_fingerprint"
>;

/**
 * Whether an evidence packet is ready to be consumed by a future AI extraction
 * job. Requires `extraction_allowed`, a mandatory human-review flag, a bounded
 * evidence reference (content/excerpt/fingerprint), and a non-failed extraction
 * state. Being extractable never implies downstream approval.
 */
export function isEvidencePacketExtractionReady(
  packet: PacketExtractionView,
): boolean {
  if (packet.extraction_allowed !== true) {
    return false;
  }

  if (packet.human_review_required !== true) {
    return false;
  }

  const hasEvidenceReference = Boolean(
    packet.content_reference ||
    packet.excerpt_reference ||
    packet.content_fingerprint,
  );
  if (!hasEvidenceReference) {
    return false;
  }

  return packet.extraction_status !== "extraction_failed";
}

type PacketDownstreamView = Pick<
  ExtractableEvidencePacket,
  | "downstream_allowed"
  | "human_review_required"
  | "classifier_approval_reference"
>;

/**
 * Whether an evidence packet may back downstream classifier use. Conservative by
 * design: this layer never approves downstream use on its own, so a packet is
 * only downstream-allowed when it carries an explicit downstream flag, a
 * separate classifier approval reference, and a mandatory human-review flag.
 */
export function isEvidencePacketDownstreamAllowed(
  packet: PacketDownstreamView,
): boolean {
  return (
    packet.downstream_allowed === true &&
    packet.human_review_required === true &&
    typeof packet.classifier_approval_reference === "string" &&
    packet.classifier_approval_reference.trim().length > 0
  );
}

/**
 * Readiness label for an evidence packet. The label tracks the strongest honest
 * state the packet has reached:
 *  - `downstream_approved` only with a separate classifier approval (not granted
 *    in this layer),
 *  - `extraction_ready` when the packet is AI-ready,
 *  - `extraction_failed` when a prior extraction attempt failed,
 *  - `not_extraction_ready` otherwise.
 */
export function evidencePacketReadinessLabel(
  packet: PacketExtractionView & PacketDownstreamView,
): string {
  if (isEvidencePacketDownstreamAllowed(packet)) {
    return "downstream_approved";
  }

  if (packet.extraction_status === "extraction_failed") {
    return "extraction_failed";
  }

  if (isEvidencePacketExtractionReady(packet)) {
    return "extraction_ready";
  }

  return "not_extraction_ready";
}

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  deriveReviewManifestGate,
  evidencePacketReadinessLabel,
  isEvidencePacketDownstreamAllowed,
  isEvidencePacketExtractionReady,
  isSnapshotExtractionAllowed,
} from "../src/intelligence/evidence-preparation.js";
import type {
  ExtractableEvidencePacket,
  SnapshotReviewManifest,
} from "../src/intelligence/types.js";
import { readUtf8File } from "../src/lib/fs.js";

async function readJson<T>(relativePath: string): Promise<T> {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const content = await readUtf8File(absolutePath);
  return JSON.parse(content) as T;
}

const extractionAllowingManifests = [
  "snapshots/pcram/snapshot-review-manifest-wco-hs-2022.json",
  "snapshots/pcram/snapshot-review-manifest-mercosur-ncm-aec.json",
];

const extractionBlockedManifests = [
  "snapshots/pcram/snapshot-review-manifest-ar-decreto-557-2023.json",
  "snapshots/pcram/snapshot-review-manifest-ar-arca-arancel.json",
];

function approvedManifest(): SnapshotReviewManifest {
  return {
    review_manifest_id: "rm-test",
    snapshot_id: "snapshot-test",
    source_id: "wco-hs-2022-edition",
    review_status: "approved",
    source_identity_verified: true,
    locator_verified: true,
    capture_reference_verified: true,
    content_fingerprint_verified: true,
    version_scope_verified: true,
    extraction_allowed: true,
    human_review_required: true,
    downstream_allowed: false,
    schema_version: "1.0.0",
  };
}

function readyPacket(): ExtractableEvidencePacket {
  return {
    evidence_packet_id: "ep-test",
    review_manifest_id: "rm-test",
    snapshot_id: "snapshot-test",
    source_id: "wco-hs-2022-edition",
    evidence_scope: "hs_2022_nomenclature_reference",
    content_reference: "manual/local/requires-verification: reference",
    extraction_input_type: "locator_reference",
    extraction_allowed: true,
    extraction_status: "prepared",
    human_review_required: true,
    downstream_allowed: false,
    schema_version: "1.0.0",
  };
}

test("extraction-allowing manifests resolve to the extraction gate", async () => {
  for (const fixture of extractionAllowingManifests) {
    const manifest = await readJson<SnapshotReviewManifest>(fixture);
    assert.equal(
      deriveReviewManifestGate(manifest),
      "extraction_allowed",
      fixture,
    );
    assert.equal(isSnapshotExtractionAllowed(manifest), true, fixture);
  }
});

test("blocked manifests never permit extraction", async () => {
  for (const fixture of extractionBlockedManifests) {
    const manifest = await readJson<SnapshotReviewManifest>(fixture);
    assert.notEqual(
      deriveReviewManifestGate(manifest),
      "extraction_allowed",
      fixture,
    );
    assert.equal(isSnapshotExtractionAllowed(manifest), false, fixture);
  }
});

test("an approved manifest with a missing gate is extraction-blocked", () => {
  const manifest = approvedManifest();
  manifest.version_scope_verified = false;
  assert.equal(deriveReviewManifestGate(manifest), "extraction_blocked");
  assert.equal(isSnapshotExtractionAllowed(manifest), false);
});

test("a rejected manifest reports rejected", () => {
  const manifest = approvedManifest();
  manifest.review_status = "rejected";
  assert.equal(deriveReviewManifestGate(manifest), "rejected");
});

test("a missing fingerprint blocks extraction unless waived with a warning", () => {
  const manifest = approvedManifest();
  manifest.content_fingerprint_verified = false;
  assert.equal(isSnapshotExtractionAllowed(manifest), false);

  manifest.warnings = ["Fingerprint verification waived for this review."];
  assert.equal(isSnapshotExtractionAllowed(manifest), true);
});

test("official source/snapshot status does not auto-allow extraction", () => {
  // Identity/locator verified but review not approved -> still blocked.
  const manifest = approvedManifest();
  manifest.review_status = "not_reviewed";
  assert.equal(isSnapshotExtractionAllowed(manifest), false);
});

test("evidence packet extraction readiness requires a bounded reference", () => {
  const packet = readyPacket();
  assert.equal(isEvidencePacketExtractionReady(packet), true);

  const noReference = { ...packet };
  delete noReference.content_reference;
  assert.equal(isEvidencePacketExtractionReady(noReference), false);
});

test("a failed extraction state blocks evidence packet readiness", () => {
  const packet = readyPacket();
  packet.extraction_status = "extraction_failed";
  assert.equal(isEvidencePacketExtractionReady(packet), false);
});

test("extraction readiness never implies downstream approval", () => {
  const packet = readyPacket();
  assert.equal(isEvidencePacketExtractionReady(packet), true);
  assert.equal(isEvidencePacketDownstreamAllowed(packet), false);
});

test("downstream approval requires an explicit classifier approval reference", () => {
  const packet = readyPacket();
  packet.downstream_allowed = true;
  assert.equal(isEvidencePacketDownstreamAllowed(packet), false);

  packet.classifier_approval_reference = "classifier-approval-record-001";
  assert.equal(isEvidencePacketDownstreamAllowed(packet), true);
});

test("readiness label tracks the strongest honest state", () => {
  const packet = readyPacket();
  assert.equal(evidencePacketReadinessLabel(packet), "extraction_ready");

  const notReady = { ...packet, extraction_allowed: false };
  assert.equal(evidencePacketReadinessLabel(notReady), "not_extraction_ready");

  const failed = { ...packet, extraction_status: "extraction_failed" as const };
  assert.equal(evidencePacketReadinessLabel(failed), "extraction_failed");

  const approved = {
    ...packet,
    downstream_allowed: true,
    classifier_approval_reference: "classifier-approval-record-001",
  };
  assert.equal(evidencePacketReadinessLabel(approved), "downstream_approved");
});

test("packet fixtures load and stay non-downstream", async () => {
  const packet = await readJson<ExtractableEvidencePacket>(
    "snapshots/pcram/extractable-evidence-packet-wco-hs-2022.json",
  );
  assert.equal(isEvidencePacketExtractionReady(packet), true);
  assert.equal(isEvidencePacketDownstreamAllowed(packet), false);
  assert.equal(evidencePacketReadinessLabel(packet), "extraction_ready");
});

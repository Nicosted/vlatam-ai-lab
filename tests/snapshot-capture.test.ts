import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { readUtf8File } from "../src/lib/fs.js";
import {
  deriveSnapshotFreshness,
  deriveSnapshotReviewGate,
  hasVerifiableSnapshotFingerprint,
  isSnapshotDownstreamAllowed,
  isSnapshotExtractionReady,
  snapshotCaptureLabel,
  snapshotCaptureWarnings,
  withConservativeSnapshotDefaults,
} from "../src/intelligence/snapshot-capture.js";
import type { SourceSnapshot } from "../src/intelligence/types.js";

const NOW = new Date("2026-06-06T00:00:00.000Z");

const officialSnapshotFixtures = [
  "snapshots/pcram/intelligence-source-snapshot-wco-hs-2022-official.json",
  "snapshots/pcram/intelligence-source-snapshot-mercosur-ncm-aec-official.json",
  "snapshots/pcram/intelligence-source-snapshot-ar-decreto-557-2023-official.json",
  "snapshots/pcram/intelligence-source-snapshot-ar-arca-arancel-official.json",
];

async function readSnapshot(relativePath: string): Promise<SourceSnapshot> {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const content = await readUtf8File(absolutePath);
  return JSON.parse(content) as SourceSnapshot;
}

function baseApprovedSnapshot(): SourceSnapshot {
  return {
    snapshot_id: "snapshot-test",
    source_id: "wco-hs-2022-edition",
    captured_at: "2026-06-06T00:00:00.000Z",
    capture_method: "manual",
    source_locator: "https://www.wcoomd.org/",
    freshness_status: "current",
    review_status: "approved",
    extraction_status: "prepared",
    human_review_required: true,
    downstream_allowed: false,
    schema_version: "1.0.0",
  };
}

test("conservative defaults require review and deny downstream use", () => {
  const snapshot = withConservativeSnapshotDefaults({
    snapshot_id: "snapshot-defaults",
    source_id: "ar-ncm-customs",
    captured_at: "2026-06-06T00:00:00.000Z",
    capture_method: "manual",
    schema_version: "1.0.0",
  });

  assert.equal(snapshot.human_review_required, true);
  assert.equal(snapshot.downstream_allowed, false);
  assert.equal(snapshot.review_status, "not_reviewed");
  assert.equal(snapshot.extraction_status, "not_started");
  assert.equal(snapshot.freshness_status, "unknown");
});

test("official-source snapshots derive requires_review and stay non-downstream", async () => {
  for (const fixture of officialSnapshotFixtures) {
    const snapshot = await readSnapshot(fixture);

    // Source identity is official, but the snapshot is unreviewed.
    assert.equal(
      deriveSnapshotFreshness(snapshot, { now: NOW }),
      "requires_review",
      fixture,
    );
    assert.equal(snapshot.freshness_status, "requires_review", fixture);
    assert.equal(
      deriveSnapshotReviewGate(snapshot),
      "review_required",
      fixture,
    );
    assert.equal(isSnapshotDownstreamAllowed(snapshot), false, fixture);
    assert.equal(isSnapshotExtractionReady(snapshot), false, fixture);
  }
});

test("official-source snapshots without a hash warn about fingerprint", async () => {
  for (const fixture of officialSnapshotFixtures) {
    const snapshot = await readSnapshot(fixture);

    assert.equal(hasVerifiableSnapshotFingerprint(snapshot), false, fixture);
    const warnings = snapshotCaptureWarnings(snapshot);
    assert.equal(
      warnings.some((w) => w.toLowerCase().includes("content hash")),
      true,
      fixture,
    );
  }
});

test("verifiable fingerprint is recognised only for valid sha256", () => {
  assert.equal(
    hasVerifiableSnapshotFingerprint({
      content_hash: `sha256:${"a".repeat(64)}`,
    }),
    true,
  );
  assert.equal(
    hasVerifiableSnapshotFingerprint({ content_hash: "abc" }),
    false,
  );
  assert.equal(hasVerifiableSnapshotFingerprint({}), false);
});

test("missing captured_at never derives current freshness", () => {
  const status = deriveSnapshotFreshness(
    {
      captured_at: "",
      human_review_required: false,
      review_status: "approved",
    },
    { now: NOW, expectedUpdateCadence: { label: "monthly" } },
  );

  assert.equal(status, "unknown");
});

test("review gate reflects review_status conservatively", () => {
  assert.equal(
    deriveSnapshotReviewGate({
      review_status: "approved",
      human_review_required: true,
    }),
    "approved",
  );
  assert.equal(
    deriveSnapshotReviewGate({
      review_status: "rejected",
      human_review_required: true,
    }),
    "rejected",
  );
  assert.equal(
    deriveSnapshotReviewGate({
      review_status: "in_review",
      human_review_required: true,
    }),
    "review_pending",
  );
  assert.equal(
    deriveSnapshotReviewGate({
      review_status: "not_reviewed",
      human_review_required: true,
    }),
    "review_required",
  );
});

test("an approved, fresh snapshot can be extraction-ready and downstream-allowed", () => {
  const snapshot = baseApprovedSnapshot();
  snapshot.downstream_allowed = true;

  assert.equal(isSnapshotExtractionReady(snapshot), true);
  assert.equal(isSnapshotDownstreamAllowed(snapshot), true);
});

test("unreviewed snapshots are never extraction-ready or downstream-safe", () => {
  const snapshot = baseApprovedSnapshot();
  snapshot.review_status = "not_reviewed";
  snapshot.downstream_allowed = true; // even if a caller flips this flag

  assert.equal(isSnapshotExtractionReady(snapshot), false);
  assert.equal(isSnapshotDownstreamAllowed(snapshot), false);
});

test("a failed extraction state blocks extraction readiness", () => {
  const snapshot = baseApprovedSnapshot();
  snapshot.extraction_status = "extraction_failed";

  assert.equal(isSnapshotExtractionReady(snapshot), false);
});

test("capture label combines method and review gate deterministically", () => {
  const snapshot = baseApprovedSnapshot();
  snapshot.review_status = "not_reviewed";

  assert.equal(
    snapshotCaptureLabel(snapshot),
    "manual capture — review required",
  );
});

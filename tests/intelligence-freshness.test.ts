import assert from "node:assert/strict";
import test from "node:test";

import {
  cadenceToDays,
  classifyFreshness,
  isDownstreamSafe,
} from "../src/intelligence/freshness.js";

const NOW = new Date("2026-06-06T00:00:00.000Z");

test("recent check within cadence is current", () => {
  const status = classifyFreshness({
    lastCheckedAt: "2026-06-01T00:00:00.000Z",
    expectedUpdateCadence: { label: "monthly" },
    humanReviewRequired: false,
    reviewStatus: "approved",
    now: NOW,
  });

  assert.equal(status, "current");
});

test("check older than cadence is stale", () => {
  const status = classifyFreshness({
    lastCheckedAt: "2026-01-01T00:00:00.000Z",
    expectedUpdateCadence: { label: "monthly" },
    humanReviewRequired: false,
    reviewStatus: "approved",
    now: NOW,
  });

  assert.equal(status, "stale");
});

test("missing last-checked date is unknown, never current", () => {
  const status = classifyFreshness({
    expectedUpdateCadence: { label: "monthly" },
    humanReviewRequired: false,
    reviewStatus: "approved",
    now: NOW,
  });

  assert.equal(status, "unknown");
});

test("missing/irregular cadence is unknown", () => {
  const status = classifyFreshness({
    lastCheckedAt: "2026-06-01T00:00:00.000Z",
    expectedUpdateCadence: { label: "irregular" },
    humanReviewRequired: false,
    reviewStatus: "approved",
    now: NOW,
  });

  assert.equal(status, "unknown");
});

test("future check date is unknown, not current", () => {
  const status = classifyFreshness({
    lastCheckedAt: "2026-07-01T00:00:00.000Z",
    expectedUpdateCadence: { label: "monthly" },
    humanReviewRequired: false,
    reviewStatus: "approved",
    now: NOW,
  });

  assert.equal(status, "unknown");
});

test("required-but-missing review yields requires_review even when recent", () => {
  const status = classifyFreshness({
    lastCheckedAt: "2026-06-05T00:00:00.000Z",
    expectedUpdateCadence: { label: "monthly" },
    humanReviewRequired: true,
    reviewStatus: "not_reviewed",
    now: NOW,
  });

  assert.equal(status, "requires_review");
});

test("explicit rejection yields requires_review", () => {
  const status = classifyFreshness({
    lastCheckedAt: "2026-06-05T00:00:00.000Z",
    expectedUpdateCadence: { label: "monthly" },
    humanReviewRequired: false,
    reviewStatus: "rejected",
    now: NOW,
  });

  assert.equal(status, "requires_review");
});

test("missing authority/reliability metadata yields requires_review", () => {
  const status = classifyFreshness({
    lastCheckedAt: "2026-06-05T00:00:00.000Z",
    expectedUpdateCadence: { label: "monthly" },
    humanReviewRequired: false,
    reviewStatus: "approved",
    hasAuthorityMetadata: false,
    now: NOW,
  });

  assert.equal(status, "requires_review");
});

test("cadenceToDays maps labels and honors interval override", () => {
  assert.equal(cadenceToDays({ label: "weekly" }), 7);
  assert.equal(cadenceToDays({ label: "irregular" }), null);
  assert.equal(cadenceToDays({ label: "unknown" }), null);
  assert.equal(cadenceToDays(null), null);
  assert.equal(cadenceToDays({ label: "monthly", interval_days: 10 }), 10);
});

test("unreviewed intelligence is never downstream-safe", () => {
  assert.equal(
    isDownstreamSafe({
      freshnessStatus: "current",
      reviewStatus: "not_reviewed",
      humanReviewRequired: true,
      downstreamAllowed: true,
    }),
    false,
  );
});

test("downstream_allowed false is never downstream-safe", () => {
  assert.equal(
    isDownstreamSafe({
      freshnessStatus: "current",
      reviewStatus: "approved",
      humanReviewRequired: true,
      downstreamAllowed: false,
    }),
    false,
  );
});

test("requires_review freshness is never downstream-safe", () => {
  assert.equal(
    isDownstreamSafe({
      freshnessStatus: "requires_review",
      reviewStatus: "approved",
      humanReviewRequired: true,
      downstreamAllowed: true,
    }),
    false,
  );
});

test("approved, reviewed, fresh, allowed intelligence is downstream-safe", () => {
  assert.equal(
    isDownstreamSafe({
      freshnessStatus: "current",
      reviewStatus: "approved",
      humanReviewRequired: true,
      downstreamAllowed: true,
    }),
    true,
  );
});

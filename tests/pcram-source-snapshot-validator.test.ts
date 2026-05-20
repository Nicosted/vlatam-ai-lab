import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { readUtf8File } from "../src/lib/fs.js";
import { validatePcramSourceSnapshot } from "../src/pcram/validate-source-snapshot.js";

const sampleSnapshotPath = path.resolve(
  process.cwd(),
  "snapshots/pcram/example-source-snapshot.json",
);

async function readSampleSnapshot(): Promise<Record<string, unknown>> {
  const content = await readUtf8File(sampleSnapshotPath);
  return JSON.parse(content) as Record<string, unknown>;
}

test("valid sample snapshot passes", async () => {
  const sampleSnapshot = await readSampleSnapshot();
  const result = validatePcramSourceSnapshot(sampleSnapshot);

  assert.deepEqual(result, { ok: true });
});

test("invalid object fails validation", () => {
  const result = validatePcramSourceSnapshot({});

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("Expected invalid result");
  }
  assert.equal(result.errors.length > 0, true);
});

test("validation error includes path and message", async () => {
  const sampleSnapshot = await readSampleSnapshot();
  const invalidSnapshot = {
    ...sampleSnapshot,
    source_type: "unexpected_source_type",
  };

  const result = validatePcramSourceSnapshot(invalidSnapshot);

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("Expected invalid result");
  }

  assert.equal(
    result.errors.some(
      (errorMessage) =>
        errorMessage.includes("/source_type") &&
        errorMessage.includes("must be equal to one of the allowed values"),
    ),
    true,
  );
});

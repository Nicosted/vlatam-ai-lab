import assert from "node:assert/strict";
import test from "node:test";

import { timestampForFilename } from "../src/lib/date.js";

test("timestampForFilename sanitizes forbidden filename characters", () => {
  const stamp = timestampForFilename(new Date("2026-01-01T12:34:56.789Z"));

  assert.equal(stamp.includes(":"), false);
  assert.equal(stamp.includes("."), false);
  assert.equal(stamp.length > 0, true);
});

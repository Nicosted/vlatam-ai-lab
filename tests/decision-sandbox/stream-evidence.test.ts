import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  DECISION_SANDBOX_EMPTY_SHA256,
  DecisionSandboxStreamEvidence,
} from "../../src/decision-sandbox/index.js";

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");
const bytes = (text: string): Buffer => Buffer.from(text);

/** Deterministic chunkings of the same byte sequence. */
function chunkings(data: Buffer): Buffer[][] {
  const whole = [data];
  const singles = [...data].map((b) => Buffer.from([b]));
  const uneven: Buffer[] = [];
  for (let at = 0, size = 1; at < data.length; at += size, size += 3)
    uneven.push(data.subarray(at, at + size));
  return [whole, singles, uneven];
}

describe("AI-143 bounded stream evidence", () => {
  it("hashes exactly the counted bytes and retains them within the bound, for any chunking", () => {
    const data = bytes('{"contract":"decision_adapter_output"}\n');
    for (const chunks of chunkings(data)) {
      const stream = new DecisionSandboxStreamEvidence(1_024, true);
      for (const chunk of chunks) assert.equal(stream.observe(chunk), false);
      const seen = stream.seal();
      assert.equal(seen.bytes, data.length);
      assert.equal(seen.sha256, sha256(data));
      assert.equal(seen.exceeded, false);
      assert.deepEqual(seen.retained, data);
    }
  });

  it("an empty stream reports zero bytes and the empty digest", () => {
    const seen = new DecisionSandboxStreamEvidence(16, true).seal();
    assert.equal(seen.bytes, 0);
    assert.equal(seen.sha256, DECISION_SANDBOX_EMPTY_SHA256);
    assert.equal(seen.retained.length, 0);
  });

  it("on overflow: count exceeds the bound, hash covers exactly those bytes, retained content is released", () => {
    const limit = 10;
    const data = bytes("abcdefghijklmnopqrstuvwxyz");
    for (const chunks of chunkings(data)) {
      const stream = new DecisionSandboxStreamEvidence(limit, true);
      let signalled = 0;
      let observed = 0;
      for (const chunk of chunks) {
        observed += chunk.length;
        if (stream.observe(chunk)) {
          signalled += 1;
          stream.stop(); // the runtime terminates the child here
        }
      }
      const seen = stream.seal();
      assert.equal(signalled, 1, "exceedance is signalled exactly once");
      assert.ok(seen.bytes > limit);
      assert.ok(seen.bytes <= observed);
      assert.equal(seen.sha256, sha256(data.subarray(0, seen.bytes)));
      assert.notEqual(seen.sha256, DECISION_SANDBOX_EMPTY_SHA256);
      assert.equal(seen.exceeded, true);
      assert.equal(seen.retained.length, 0, "no content held after overflow");
    }
  });

  it("bytes after stop are ignored by both the counter and the hash", () => {
    const stream = new DecisionSandboxStreamEvidence(100, true);
    stream.observe(bytes("kept"));
    stream.stop();
    assert.equal(stream.observe(bytes("ignored after termination")), false);
    const seen = stream.seal();
    assert.equal(seen.bytes, 4);
    assert.equal(seen.sha256, sha256(bytes("kept")));
    assert.deepEqual(seen.retained, bytes("kept"));
  });

  it("a non-retaining stream (stderr) never keeps content but hashes every counted byte", () => {
    const stream = new DecisionSandboxStreamEvidence(8, false);
    stream.observe(bytes("diag"));
    const seen = stream.seal();
    assert.equal(seen.bytes, 4);
    assert.equal(seen.sha256, sha256(bytes("diag")));
    assert.equal(seen.retained.length, 0);
  });

  it("sealing is idempotent and stops further observation", () => {
    const stream = new DecisionSandboxStreamEvidence(8, true);
    stream.observe(bytes("ab"));
    const first = stream.seal();
    stream.observe(bytes("cd"));
    assert.equal(stream.seal(), first);
    assert.equal(first.bytes, 2);
    assert.equal(Object.isFrozen(first), true);
  });
});

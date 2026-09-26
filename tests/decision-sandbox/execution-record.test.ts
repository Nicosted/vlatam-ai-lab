import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  DECISION_SANDBOX_EMPTY_SHA256,
  DECISION_SANDBOX_EXECUTION_RECORD_HASH_DOMAIN,
  DECISION_SANDBOX_EXECUTION_STATUSES,
  DECISION_SANDBOX_ISSUE_CODES,
  DECISION_SANDBOX_SEMANTIC_EXECUTION_HASH_DOMAIN,
  buildDecisionSandboxExecutionRecord,
  computeDecisionSandboxExecutionRecordHash,
  computeDecisionSandboxSemanticExecutionHash,
  validateDecisionSandboxExecutionRecord,
  type DecisionSandboxExecutionRecord,
  type DecisionSandboxRecordFields,
} from "../../src/decision-sandbox/index.js";
import { clone, codes, FIXTURE_ROOT, load, type Mutable } from "./helpers.js";

const record = (): Mutable =>
  load<Mutable>(`${FIXTURE_ROOT}/valid-execution-record.json`);
/** Recomputes both hashes, semantic first, exactly as the builder does. */
const rehash = (value: Mutable): Mutable => {
  const withSemantic = {
    ...value,
    semantic_execution_hash: computeDecisionSandboxSemanticExecutionHash(
      value as DecisionSandboxExecutionRecord,
    ),
  };
  return {
    ...withSemantic,
    execution_record_hash: computeDecisionSandboxExecutionRecordHash(
      withSemantic as DecisionSandboxExecutionRecord,
    ),
  };
};
/** The builder fields of a persisted record. */
const fieldsOf = (r: Mutable): DecisionSandboxRecordFields =>
  ({
    execution_id: r["execution_id"],
    adapter: null,
    request_hash: r["request_hash"],
    status: r["status"],
    preflight_outcome: r["preflight_outcome"],
    process_outcome: r["process_outcome"],
    protocol_result_hash: r["protocol_result_hash"],
    typed_result_hash: r["typed_result_hash"],
    diagnostics: r["diagnostics"],
    telemetry: r["telemetry"],
  }) as DecisionSandboxRecordFields;

const TELEMETRY_TAMPERING: readonly [string, unknown][] = [
  ["duration_ms", 987_654],
  ["stdout_bytes", 1_431],
  ["stdout_sha256", createHash("sha256").update("forged").digest("hex")],
  ["stderr_bytes", 12],
  ["stderr_sha256", createHash("sha256").update("forged").digest("hex")],
];

describe("AI-143 decision sandbox execution record", () => {
  it("uses the smallest stable status vocabulary and two distinct hash domains", () => {
    assert.deepEqual(DECISION_SANDBOX_EXECUTION_STATUSES, [
      "succeeded",
      "blocked",
      "timed_out",
      "process_failed",
      "protocol_failed",
      "output_limit_exceeded",
    ]);
    assert.equal(
      DECISION_SANDBOX_SEMANTIC_EXECUTION_HASH_DOMAIN,
      "vlatam-ai-lab:decision-sandbox-execution-semantic:v1",
    );
    assert.equal(
      DECISION_SANDBOX_EXECUTION_RECORD_HASH_DOMAIN,
      "vlatam-ai-lab:decision-sandbox-execution-record:v1",
    );
    assert.equal(
      new Set(DECISION_SANDBOX_ISSUE_CODES).size,
      DECISION_SANDBOX_ISSUE_CODES.length,
    );
  });

  it("validates the registered success record and pins both hashes", () => {
    const r = record();
    assert.equal(validateDecisionSandboxExecutionRecord(r).ok, true);
    assert.equal(
      r["semantic_execution_hash"],
      "9831d131097293a65b0ce3f671d2f0bed081119bad3ec35567272a6e565d6d7f",
    );
    assert.equal(
      r["execution_record_hash"],
      "9d64397dc9eca1aad63f078f42599bcf48c9148c03f8d2b9a54427baf6b5b502",
    );
    assert.notEqual(r["semantic_execution_hash"], r["execution_record_hash"]);
  });

  it("semantic hash: telemetry alone never changes it; semantic fields always do", () => {
    const base = record();
    for (const [field, value] of TELEMETRY_TAMPERING) {
      const changed = clone(base);
      changed["telemetry"][field] = value;
      assert.equal(
        computeDecisionSandboxSemanticExecutionHash(changed as never),
        base["semantic_execution_hash"],
        field,
      );
    }
    for (const mutate of [
      (r: Mutable) => (r["execution_id"] = "sandbox-fixture-execution-0002"),
      (r: Mutable) => (r["typed_result_hash"] = "a".repeat(64)),
      (r: Mutable) => (r["protocol_result_hash"] = "b".repeat(64)),
      (r: Mutable) => (r["request_hash"] = "c".repeat(64)),
      (r: Mutable) => (r["status"] = "protocol_failed"),
      (r: Mutable) => (r["diagnostics"] = ["response_missing"]),
      (r: Mutable) => (r["process_outcome"]["exit_code"] = 1),
    ]) {
      const changed = clone(base);
      mutate(changed);
      assert.notEqual(
        computeDecisionSandboxSemanticExecutionHash(changed as never),
        base["semantic_execution_hash"],
      );
    }
  });

  it("record hash: changing any telemetry field without recomputing is tamper-detected", () => {
    for (const [field, value] of TELEMETRY_TAMPERING) {
      const tampered = clone(record());
      tampered["telemetry"][field] = value;
      const found = codes(validateDecisionSandboxExecutionRecord(tampered));
      assert.ok(found.includes("record_hash_mismatch"), field);
      // Telemetry is not semantic: only the complete-record hash breaks
      // (plus telemetry consistency when a count and hash disagree).
      assert.ok(!found.includes("semantic_hash_mismatch"), field);
      assert.deepEqual(
        found.filter((code) => code !== "telemetry_invalid"),
        ["record_hash_mismatch"],
        field,
      );
    }
    // A consistent-looking forgery (count and hash changed together) is
    // still caught by the complete-record hash alone.
    const forged = clone(record());
    const fake = Buffer.from("forged response\n");
    forged["telemetry"]["stdout_bytes"] = fake.byteLength;
    forged["telemetry"]["stdout_sha256"] = createHash("sha256")
      .update(fake)
      .digest("hex");
    assert.deepEqual(codes(validateDecisionSandboxExecutionRecord(forged)), [
      "record_hash_mismatch",
    ]);
  });

  it("record hash: replacing the semantic hash is tamper-detected by both hashes", () => {
    const tampered = { ...record(), semantic_execution_hash: "e".repeat(64) };
    assert.deepEqual(codes(validateDecisionSandboxExecutionRecord(tampered)), [
      "record_hash_mismatch",
      "semantic_hash_mismatch",
    ]);
  });

  it("a rebuilt record with different telemetry keeps the semantic hash but gets a new record hash", () => {
    const base = record();
    const rebuilt = buildDecisionSandboxExecutionRecord({
      ...fieldsOf(base),
      adapter: {
        adapter_id: base["adapter"]["adapter_id"],
        adapter_version: base["adapter"]["adapter_version"],
        artifact_sha256: base["adapter"]["artifact_sha256"],
      } as never,
      telemetry: { ...base["telemetry"], duration_ms: 42 },
    });
    assert.equal(validateDecisionSandboxExecutionRecord(rebuilt).ok, true);
    assert.equal(
      rebuilt.semantic_execution_hash,
      base["semantic_execution_hash"],
    );
    assert.notEqual(
      rebuilt.execution_record_hash,
      base["execution_record_hash"],
    );
  });

  it("rejects tampering with any semantic field", () => {
    for (const mutate of [
      (r: Mutable) => (r["execution_id"] = "sandbox-fixture-execution-0002"),
      (r: Mutable) => (r["typed_result_hash"] = "a".repeat(64)),
      (r: Mutable) => (r["protocol_result_hash"] = "b".repeat(64)),
      (r: Mutable) => (r["request_hash"] = "c".repeat(64)),
    ]) {
      const tampered = clone(record());
      mutate(tampered);
      assert.deepEqual(
        codes(validateDecisionSandboxExecutionRecord(tampered)),
        ["record_hash_mismatch", "semantic_hash_mismatch"],
      );
      // Recomputing only the record hash still leaves the semantic hash stale.
      const partial = {
        ...tampered,
        execution_record_hash: computeDecisionSandboxExecutionRecordHash(
          tampered as never,
        ),
      };
      assert.deepEqual(codes(validateDecisionSandboxExecutionRecord(partial)), [
        "semantic_hash_mismatch",
      ]);
    }
    assert.deepEqual(
      codes(
        validateDecisionSandboxExecutionRecord({
          ...record(),
          execution_record_hash: "d".repeat(64),
        }),
      ),
      ["record_hash_mismatch"],
    );
  });

  it("rejects telemetry whose hash cannot describe its byte count", () => {
    const emptyHashWithBytes = clone(record());
    emptyHashWithBytes["telemetry"]["stdout_sha256"] =
      DECISION_SANDBOX_EMPTY_SHA256;
    assert.ok(
      codes(
        validateDecisionSandboxExecutionRecord(rehash(emptyHashWithBytes)),
      ).includes("telemetry_invalid"),
    );
    const bytesWithoutHash = clone(record());
    bytesWithoutHash["telemetry"]["stderr_bytes"] = 5;
    assert.ok(
      codes(
        validateDecisionSandboxExecutionRecord(rehash(bytesWithoutHash)),
      ).includes("telemetry_invalid"),
    );
    const blocked = load<Mutable>(
      `${FIXTURE_ROOT}/valid-execution-record-registered-candidate-blocked.json`,
    );
    blocked["telemetry"]["stdout_bytes"] = 1;
    blocked["telemetry"]["stdout_sha256"] = "f".repeat(64);
    assert.ok(
      codes(validateDecisionSandboxExecutionRecord(rehash(blocked))).includes(
        "telemetry_invalid",
      ),
    );
  });

  it("never admits downstream or output authority, even when rehashed", () => {
    assert.ok(
      codes(
        validateDecisionSandboxExecutionRecord(
          rehash({ ...record(), downstream_allowed: true }),
        ),
      ).includes("downstream_authority_forbidden"),
    );
    assert.ok(
      codes(
        validateDecisionSandboxExecutionRecord(
          rehash({ ...record(), output_authority: "downstream" }),
        ),
      ).includes("output_authority_invalid"),
    );
    for (const field of ["approved", "promotion_eligible", "benchmark_score"]) {
      const found = codes(
        validateDecisionSandboxExecutionRecord(
          rehash({ ...record(), [field]: true }),
        ),
      );
      assert.ok(found.includes("unknown_property"), field);
    }
  });

  it("rejects persisted stderr content and private reasoning", () => {
    assert.ok(
      codes(
        validateDecisionSandboxExecutionRecord(
          load(`${FIXTURE_ROOT}/invalid-execution-record-stderr-content.json`),
        ),
      ).includes("unknown_property"),
    );
    assert.ok(
      codes(
        validateDecisionSandboxExecutionRecord(
          load(
            `${FIXTURE_ROOT}/invalid-execution-record-private-reasoning.json`,
          ),
        ),
      ).includes("private_reasoning_forbidden"),
    );
  });

  it("rejects inconsistent status, outcome and diagnostics", () => {
    const inconsistent = [
      { status: "succeeded", diagnostics: ["timeout_exceeded"] },
      { status: "timed_out" },
      { status: "blocked" },
      {
        status: "succeeded",
        process_outcome: {
          started: true,
          exit_code: 1,
          signal: null,
          terminated_by_runtime: "none",
        },
      },
      { status: "protocol_failed", diagnostics: [] },
    ];
    for (const patch of inconsistent)
      assert.ok(
        codes(
          validateDecisionSandboxExecutionRecord(
            rehash({ ...record(), ...patch }),
          ),
        ).includes("status_outcome_mismatch"),
        JSON.stringify(patch),
      );
    for (const diagnostics of [
      ["not_a_code"],
      ["timeout_exceeded", "process_exit_nonzero"],
      ["timeout_exceeded", "timeout_exceeded"],
    ])
      assert.ok(
        codes(
          validateDecisionSandboxExecutionRecord(
            rehash({ ...record(), status: "process_failed", diagnostics }),
          ),
        ).includes("diagnostics_invalid"),
        JSON.stringify(diagnostics),
      );
    assert.ok(
      codes(
        validateDecisionSandboxExecutionRecord(
          rehash({ ...record(), status: "approved" }),
        ),
      ).includes("status_invalid"),
    );
  });

  it("rejects an unknown adapter, adapter hash mismatch or unsupported policy", () => {
    const unknown = clone(record());
    unknown["adapter"]["adapter_id"] = "ai-lab-other-adapter";
    assert.ok(
      codes(validateDecisionSandboxExecutionRecord(rehash(unknown))).includes(
        "adapter_unknown",
      ),
    );
    const hash = clone(record());
    hash["adapter"]["artifact_sha256"] = "e".repeat(64);
    assert.ok(
      codes(validateDecisionSandboxExecutionRecord(rehash(hash))).includes(
        "adapter_hash_mismatch",
      ),
    );
    const policy = clone(record());
    policy["sandbox_policy"]["policy_hash"] = "f".repeat(64);
    assert.ok(
      codes(validateDecisionSandboxExecutionRecord(rehash(policy))).includes(
        "policy_unsupported",
      ),
    );
  });

  it("builds deeply frozen records with sorted, unique diagnostics", () => {
    const built = buildDecisionSandboxExecutionRecord({
      execution_id: "sandbox-fixture-execution-0001",
      adapter: null,
      request_hash: null,
      status: "blocked",
      preflight_outcome: "blocked",
      process_outcome: {
        started: false,
        exit_code: null,
        signal: null,
        terminated_by_runtime: "none",
      },
      protocol_result_hash: null,
      typed_result_hash: null,
      diagnostics: ["subject_invalid", "adapter_unknown", "subject_invalid"],
      telemetry: {
        duration_ms: 0,
        stdout_bytes: 0,
        stdout_sha256: DECISION_SANDBOX_EMPTY_SHA256,
        stderr_bytes: 0,
        stderr_sha256: DECISION_SANDBOX_EMPTY_SHA256,
      },
    });
    assert.deepEqual(built.diagnostics, ["adapter_unknown", "subject_invalid"]);
    assert.equal(Object.isFrozen(built), true);
    assert.equal(Object.isFrozen(built.process_outcome), true);
    assert.equal(Object.isFrozen(built.diagnostics), true);
    assert.equal(validateDecisionSandboxExecutionRecord(built).ok, true);
    assert.equal(built.downstream_allowed, false);
    assert.equal(built.output_authority, "none");
  });
});

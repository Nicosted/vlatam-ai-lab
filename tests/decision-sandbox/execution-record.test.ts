import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DECISION_SANDBOX_EXECUTION_HASH_DOMAIN,
  DECISION_SANDBOX_EXECUTION_STATUSES,
  DECISION_SANDBOX_ISSUE_CODES,
  buildDecisionSandboxExecutionRecord,
  computeDecisionSandboxExecutionRecordHash,
  validateDecisionSandboxExecutionRecord,
  type DecisionSandboxExecutionRecord,
} from "../../src/decision-sandbox/index.js";
import { clone, codes, FIXTURE_ROOT, load, type Mutable } from "./helpers.js";

const record = (): Mutable =>
  load<Mutable>(`${FIXTURE_ROOT}/valid-execution-record.json`);
const rehash = (value: Mutable): Mutable => ({
  ...value,
  execution_record_hash: computeDecisionSandboxExecutionRecordHash(
    value as DecisionSandboxExecutionRecord,
  ),
});

describe("AI-143 decision sandbox execution record", () => {
  it("uses the smallest stable status vocabulary", () => {
    assert.deepEqual(DECISION_SANDBOX_EXECUTION_STATUSES, [
      "succeeded",
      "blocked",
      "timed_out",
      "process_failed",
      "protocol_failed",
      "output_limit_exceeded",
    ]);
    assert.equal(
      DECISION_SANDBOX_EXECUTION_HASH_DOMAIN,
      "vlatam-ai-lab:decision-sandbox-execution:v1",
    );
    assert.equal(
      new Set(DECISION_SANDBOX_ISSUE_CODES).size,
      DECISION_SANDBOX_ISSUE_CODES.length,
    );
  });

  it("validates the registered success record", () => {
    assert.equal(validateDecisionSandboxExecutionRecord(record()).ok, true);
  });

  it("excludes only telemetry from the semantic hash", () => {
    const base = record();
    const telemetry = clone(base);
    telemetry["telemetry"]["duration_ms"] = 987_654;
    telemetry["telemetry"]["stderr_bytes"] = 12;
    assert.equal(
      computeDecisionSandboxExecutionRecordHash(telemetry as never),
      base["execution_record_hash"],
    );
    assert.equal(validateDecisionSandboxExecutionRecord(telemetry).ok, true);
    const semantic = clone(base);
    semantic["execution_id"] = "sandbox-fixture-execution-0002";
    assert.notEqual(
      computeDecisionSandboxExecutionRecordHash(semantic as never),
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
        ["record_hash_mismatch"],
      );
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
        stdout_sha256: "0".repeat(64),
        stderr_bytes: 0,
        stderr_sha256: "0".repeat(64),
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

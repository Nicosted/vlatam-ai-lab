import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { validateTypedDecisionResultForRequest } from "../../src/decision/validation.js";
import {
  DECISION_SANDBOX_FIXTURE_ADAPTER,
  DECISION_SANDBOX_FIXTURE_POLICY,
  validateDecisionSandboxExecutionRecord,
  type DecisionSandboxExecutionRecord,
} from "../../src/decision-sandbox/index.js";
import {
  executeDecisionSandboxFixture,
  type DecisionSandboxExecution,
} from "../../src/decision-sandbox/executor.js";
import {
  behaviorRequest,
  booleanRequest,
  executionRequest,
  FIXTURE_ROOT,
  load,
} from "./helpers.js";

/** Runs one execution and checks the invariants every record must keep. */
async function run(
  request: unknown,
  workspaces: string[] = [],
): Promise<DecisionSandboxExecution> {
  const execution = await executeDecisionSandboxFixture(request, {
    observe_workspace: (path) => workspaces.push(path),
  });
  const record = execution.record;
  assert.equal(validateDecisionSandboxExecutionRecord(record).ok, true);
  assert.equal(record.output_authority, "none");
  assert.equal(record.downstream_allowed, false);
  assert.equal(Object.isFrozen(record), true);
  if (record.status !== "succeeded") {
    assert.equal(execution.result, null, "no partial result is accepted");
    assert.equal(record.protocol_result_hash, null);
    assert.equal(record.typed_result_hash, null);
  }
  for (const workspace of workspaces)
    assert.equal(existsSync(workspace), false, "workspace removed");
  return execution;
}

function assertFailure(
  record: DecisionSandboxExecutionRecord,
  status: DecisionSandboxExecutionRecord["status"],
  diagnostics: readonly string[],
): void {
  assert.equal(record.status, status);
  assert.deepEqual(record.diagnostics, diagnostics);
  assert.equal(record.preflight_outcome, "eligible_for_fixture_execution");
  assert.equal(record.process_outcome.started, true);
}

describe("AI-143 fixture runner: the pinned fixture artifact", () => {
  it("the fixture adapter bytes match the pinned SHA-256", () => {
    const bytes = readFileSync(DECISION_SANDBOX_FIXTURE_ADAPTER.artifact_path);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      DECISION_SANDBOX_FIXTURE_ADAPTER.artifact_sha256,
    );
    assert.equal(
      DECISION_SANDBOX_FIXTURE_ADAPTER.artifact_sha256,
      "9fbc93fefa4d65d762424b8b3ccc4bf9da981f3c4561795720ee47fb5767a3c5",
    );
  });

  it("embeds exactly the four AI-140 synthetic result fixtures, keyed by request hash", () => {
    // Content equality is proven by executing each decision type below.
    const source = readFileSync(
      DECISION_SANDBOX_FIXTURE_ADAPTER.artifact_path,
      "utf8",
    );
    const keys = [...source.matchAll(/^ {2}"?([a-f0-9]{64})"?: \{$/gm)].map(
      (match) => match[1],
    );
    const fixtures = ["boolean", "choice", "score", "ranking"].map(
      (kind) =>
        load<{ request_binding: { request_hash: string } }>(
          `data/fixtures/typed-decision/valid-${kind}-result.json`,
        ).request_binding.request_hash,
    );
    assert.deepEqual(keys.sort(), fixtures.sort());
    assert.match(source, /result_origin: "synthetic_fixture"/);
    assert.doesNotMatch(
      source,
      /result_origin: "(?!synthetic_fixture|candidate_model)/,
    );
  });
});

describe("AI-143 fixture runner: successful synthetic decision", () => {
  it("executes the fixture once and returns the exact AI-140 synthetic result", async () => {
    const workspaces: string[] = [];
    const execution = await run(executionRequest(), workspaces);
    const record = execution.record;
    assert.equal(record.status, "succeeded");
    assert.equal(record.preflight_outcome, "eligible_for_fixture_execution");
    assert.deepEqual(record.process_outcome, {
      started: true,
      exit_code: 0,
      signal: null,
      terminated_by_runtime: "none",
    });
    assert.deepEqual(record.diagnostics, []);
    assert.deepEqual(record.adapter, {
      adapter_id: DECISION_SANDBOX_FIXTURE_ADAPTER.adapter_id,
      adapter_version: DECISION_SANDBOX_FIXTURE_ADAPTER.adapter_version,
      artifact_sha256: DECISION_SANDBOX_FIXTURE_ADAPTER.artifact_sha256,
    });
    assert.equal(
      record.sandbox_policy.policy_hash,
      DECISION_SANDBOX_FIXTURE_POLICY.policy_hash,
    );
    const expected = load(
      "data/fixtures/typed-decision/valid-boolean-result.json",
    );
    assert.deepEqual(execution.result, expected);
    assert.equal(record.typed_result_hash, execution.result!.result_hash);
    assert.equal(execution.result!.result_origin, "synthetic_fixture");
    assert.equal(
      validateTypedDecisionResultForRequest(execution.result, booleanRequest())
        .ok,
      true,
    );
    assert.equal(workspaces.length, 1, "exactly one workspace, one process");
  });

  it("process success is not decision approval: the result stays non-authoritative", async () => {
    const { record, result } = await run(executionRequest());
    assert.equal(result!.governance.downstream_allowed, false);
    assert.notEqual(result!.governance.approval_state, "approved");
    assert.equal(record.downstream_allowed, false);
    assert.equal(record.output_authority, "none");
    assert.doesNotMatch(
      JSON.stringify(record),
      /"approved"|"promot|"benchmark|"winner"|"rank"/,
    );
  });

  it("runs every AI-140 decision type the fixture replays", async () => {
    for (const kind of ["choice", "score", "ranking"]) {
      const request = load(
        `data/fixtures/typed-decision/valid-${kind}-request.json`,
      );
      const { record, result } = await run(
        executionRequest(`sandbox-fixture-${kind}-0001`, request as never),
      );
      assert.equal(record.status, "succeeded", kind);
      assert.deepEqual(
        result,
        load(`data/fixtures/typed-decision/valid-${kind}-result.json`),
      );
    }
  });

  it("produces a deterministic semantic record hash matching the registered fixture", async () => {
    const first = await run(executionRequest());
    const second = await run(executionRequest());
    assert.equal(
      first.record.execution_record_hash,
      second.record.execution_record_hash,
    );
    const fixture = load<DecisionSandboxExecutionRecord>(
      `${FIXTURE_ROOT}/valid-execution-record.json`,
    );
    assert.equal(
      first.record.execution_record_hash,
      fixture.execution_record_hash,
    );
    assert.equal(
      first.record.execution_record_hash,
      "61d250e22f02e84732acd5983fc9edb4ad9de33471d6705b2f916b0a101cb70d",
    );
  });

  it("an injected clock drives only non-semantic telemetry", async () => {
    let tick = 0;
    const execution = await executeDecisionSandboxFixture(executionRequest(), {
      clock: () => (tick += 1_000),
    });
    assert.equal(execution.record.telemetry.duration_ms, 1_000);
    const baseline = await run(executionRequest());
    assert.equal(
      execution.record.execution_record_hash,
      baseline.record.execution_record_hash,
    );
  });

  it("stderr is diagnostic only: it never changes the result or the record hash", async () => {
    const plain = await run(behaviorRequest("conformant"));
    const noisy = await run(behaviorRequest("stderr-diagnostic"));
    assert.equal(noisy.record.status, "succeeded");
    assert.ok(noisy.record.telemetry.stderr_bytes > 0);
    assert.deepEqual(noisy.result, plain.result);
    assert.doesNotMatch(
      JSON.stringify(noisy.record),
      /synthetic fixture diagnostic/,
    );
  });

  it("runs the fixture with an empty environment under the Node permission model", async () => {
    // The fixture refuses (exit 4) unless process.env is empty and the
    // permission model is active; success proves both for this launch.
    const execution = await run(executionRequest());
    assert.equal(execution.record.status, "succeeded");
  });
});

describe("AI-143 fixture runner: timeout", () => {
  it("kills a fixture that exceeds the timeout, accepts no result and never retries", async () => {
    const workspaces: string[] = [];
    const { record } = await run(behaviorRequest("hang"), workspaces);
    assertFailure(record, "timed_out", ["timeout_exceeded"]);
    assert.deepEqual(record.process_outcome, {
      started: true,
      exit_code: null,
      signal: "SIGKILL",
      terminated_by_runtime: "timeout",
    });
    assert.equal(workspaces.length, 1, "one process, no retry");
    assert.ok(
      record.telemetry.duration_ms >=
        DECISION_SANDBOX_FIXTURE_POLICY.timeout_ms - 50,
    );
    const fixture = load<DecisionSandboxExecutionRecord>(
      `${FIXTURE_ROOT}/valid-execution-record-timed-out.json`,
    );
    assert.equal(
      record.execution_record_hash,
      fixture.execution_record_hash,
      "deterministic evidence shape apart from telemetry",
    );
  });
});

describe("AI-143 fixture runner: output limits", () => {
  it("kills a fixture that exceeds the stdout bound", async () => {
    const { record } = await run(behaviorRequest("stdout-flood"));
    assertFailure(record, "output_limit_exceeded", ["stdout_limit_exceeded"]);
    assert.equal(record.process_outcome.signal, "SIGKILL");
    assert.equal(record.process_outcome.terminated_by_runtime, "output_limit");
    assert.ok(
      record.telemetry.stdout_bytes >
        DECISION_SANDBOX_FIXTURE_POLICY.max_stdout_bytes,
    );
  });

  it("kills a fixture that exceeds the stderr bound", async () => {
    const { record } = await run(behaviorRequest("stderr-flood"));
    assertFailure(record, "output_limit_exceeded", ["stderr_limit_exceeded"]);
    assert.equal(record.process_outcome.terminated_by_runtime, "output_limit");
  });
});

describe("AI-143 fixture runner: process and protocol failures fail closed", () => {
  const cases: readonly [string, string, readonly string[]][] = [
    ["exit-nonzero", "process_failed", ["process_exit_nonzero"]],
    ["silent-exit", "protocol_failed", ["response_missing"]],
    ["malformed-json", "protocol_failed", ["response_json_invalid"]],
    ["invalid-utf8", "protocol_failed", ["response_not_utf8"]],
    ["multiple-responses", "protocol_failed", ["response_multiple"]],
    ["trailing-stdout", "protocol_failed", ["response_trailing_output"]],
    ["wrong-execution-id", "protocol_failed", ["execution_id_mismatch"]],
    ["wrong-request-hash", "protocol_failed", ["request_hash_mismatch"]],
    ["wrong-result-hash", "protocol_failed", ["result_hash_mismatch"]],
    ["protocol-major", "protocol_failed", ["protocol_version_unsupported"]],
    [
      "invalid-result",
      "protocol_failed",
      ["result_hash_mismatch", "typed_result_invalid"],
    ],
    [
      "unexpected-origin",
      "protocol_failed",
      ["result_hash_mismatch", "result_origin_invalid", "typed_result_invalid"],
    ],
  ];
  for (const [behavior, status, diagnostics] of cases)
    it(`${behavior} → ${status}`, async () => {
      const { record } = await run(behaviorRequest(behavior));
      assertFailure(
        record,
        status as DecisionSandboxExecutionRecord["status"],
        diagnostics,
      );
    });

  it("a zero exit code without a valid response is not success", async () => {
    const { record } = await run(behaviorRequest("silent-exit"));
    assert.equal(record.process_outcome.exit_code, 0);
    assert.equal(record.status, "protocol_failed");
  });

  it("a valid response with a non-zero exit is not success", async () => {
    const { record } = await run(behaviorRequest("exit-nonzero"));
    assert.equal(record.process_outcome.exit_code, 1);
    assert.equal(record.status, "process_failed");
  });

  it("an unknown request hash makes the fixture exit without a response", async () => {
    const request = booleanRequest() as unknown as Record<string, unknown>;
    request["request_id"] = "synthetic-evidence-sufficiency-request-0099";
    const { record } = await run(
      executionRequest("sandbox-fixture-execution-0099", request as never),
    );
    assertFailure(record, "process_failed", ["process_exit_nonzero"]);
    assert.equal(record.process_outcome.exit_code, 3);
  });
});

describe("AI-143 fixture runner: blocked before process creation", () => {
  it("creates no workspace or process for a blocked request", async () => {
    const value = executionRequest();
    value["subject"]["artifact_sha256"] = "a".repeat(64);
    const workspaces: string[] = [];
    const { record } = await run(value, workspaces);
    assert.equal(record.status, "blocked");
    assert.deepEqual(record.diagnostics, ["adapter_hash_mismatch"]);
    assert.equal(record.process_outcome.started, false);
    assert.deepEqual(workspaces, []);
  });

  it("returns a blocked record, never a throw, for non-object input", async () => {
    const { record } = await run(undefined);
    assert.equal(record.status, "blocked");
    assert.equal(record.execution_id, null);
    assert.deepEqual(record.diagnostics, ["contract_invalid"]);
  });
});

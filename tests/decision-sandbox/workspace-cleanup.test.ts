import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { basename } from "node:path";
import { describe, it } from "node:test";

import {
  computeDecisionSandboxExecutionRecordHash,
  computeDecisionSandboxSemanticExecutionHash,
  evaluateDecisionSandboxPreflight,
  issueCodes,
  validateDecisionSandboxExecutionRecord,
} from "../../src/decision-sandbox/index.js";
import {
  executeDecisionSandboxFixture,
  type DecisionSandboxExecution,
} from "../../src/decision-sandbox/executor.js";
import { behaviorRequest, executionRequest, type Mutable } from "./helpers.js";

const HOST_MESSAGE = "EPERM: operation not permitted, rmdir";

/**
 * Runs one execution whose workspace removal reports an OS-style failure.
 * The test itself removes the workspace afterwards, so nothing leaks.
 */
async function runWithFailingCleanup(request: unknown): Promise<{
  execution: DecisionSandboxExecution;
  calls: number;
  workspace: string;
}> {
  let calls = 0;
  let workspace = "";
  try {
    const execution = await executeDecisionSandboxFixture(request, {
      observe_workspace: (path) => (workspace = path),
      workspace_removal: (path) => {
        calls += 1;
        const error = new Error(`${HOST_MESSAGE} '${path}'`) as Error & {
          code?: string;
          errno?: number;
          path?: string;
        };
        error.code = "EPERM";
        error.errno = -1;
        error.path = path;
        throw error;
      },
    });
    return { execution, calls, workspace };
  } finally {
    if (workspace !== "") rmSync(workspace, { recursive: true, force: true });
  }
}

function assertFailClosed(execution: DecisionSandboxExecution): void {
  const { record, result } = execution;
  assert.equal(record.status, "runtime_failed");
  assert.equal(result, null, "no typed result is accepted");
  assert.equal(record.protocol_result_hash, null);
  assert.equal(record.typed_result_hash, null);
  assert.equal(record.output_authority, "none");
  assert.equal(record.downstream_allowed, false);
  assert.equal(record.preflight_outcome, "eligible_for_fixture_execution");
  assert.ok(record.diagnostics.includes("workspace_cleanup_failed"));
  assert.equal(validateDecisionSandboxExecutionRecord(record).ok, true);
  assert.equal(
    computeDecisionSandboxSemanticExecutionHash(record),
    record.semantic_execution_hash,
  );
  assert.equal(
    computeDecisionSandboxExecutionRecordHash(record),
    record.execution_record_hash,
  );
}

describe("AI-143 fixture runner: workspace cleanup", () => {
  it("successful cleanup leaves the normal outcome unchanged and is attempted once", async () => {
    let calls = 0;
    let workspace = "";
    const { record, result } = await executeDecisionSandboxFixture(
      executionRequest(),
      {
        observe_workspace: (path) => (workspace = path),
        workspace_removal: (path) => {
          calls += 1;
          rmSync(path, { recursive: true, force: true });
        },
      },
    );
    assert.equal(calls, 1);
    assert.equal(existsSync(workspace), false);
    assert.equal(record.status, "succeeded");
    assert.deepEqual(record.diagnostics, []);
    assert.notEqual(result, null);
    const baseline = await executeDecisionSandboxFixture(executionRequest());
    assert.equal(
      record.semantic_execution_hash,
      baseline.record.semantic_execution_hash,
    );
  });

  it("cleanup failure after a successful child fails closed as runtime_failed without throwing", async () => {
    const { execution, calls } =
      await runWithFailingCleanup(executionRequest());
    assertFailClosed(execution);
    const { record } = execution;
    assert.deepEqual(record.diagnostics, ["workspace_cleanup_failed"]);
    assert.deepEqual(record.process_outcome, {
      started: true,
      exit_code: 0,
      signal: null,
      terminated_by_runtime: "none",
    });
    assert.equal(calls, 1, "cleanup attempted exactly once, no retry");
    // The child's output was observed; the evidence says so.
    assert.ok(record.telemetry.stdout_bytes > 0);
  });

  it("cleanup failure is semantic state: it changes both hashes relative to success", async () => {
    const { execution } = await runWithFailingCleanup(executionRequest());
    const success = await executeDecisionSandboxFixture(executionRequest());
    assert.notEqual(
      execution.record.semantic_execution_hash,
      success.record.semantic_execution_hash,
    );
    assert.notEqual(
      execution.record.execution_record_hash,
      success.record.execution_record_hash,
    );
    const again = await runWithFailingCleanup(executionRequest());
    assert.equal(
      again.execution.record.semantic_execution_hash,
      execution.record.semantic_execution_hash,
      "deterministic semantic identity",
    );
  });

  it("cleanup failure after a non-zero exit keeps the observed process outcome", async () => {
    const { execution, calls } = await runWithFailingCleanup(
      behaviorRequest("exit-nonzero"),
    );
    assertFailClosed(execution);
    assert.deepEqual(execution.record.diagnostics, [
      "process_exit_nonzero",
      "workspace_cleanup_failed",
    ]);
    assert.equal(execution.record.process_outcome.started, true);
    assert.equal(execution.record.process_outcome.exit_code, 1);
    assert.equal(calls, 1);
  });

  it("cleanup failure after a protocol failure keeps the observed process outcome", async () => {
    const { execution, calls } = await runWithFailingCleanup(
      behaviorRequest("malformed-json"),
    );
    assertFailClosed(execution);
    assert.deepEqual(execution.record.diagnostics, [
      "response_json_invalid",
      "workspace_cleanup_failed",
    ]);
    assert.equal(execution.record.process_outcome.exit_code, 0);
    assert.equal(calls, 1);
  });

  it("never persists the workspace path, OS error text or errno", async () => {
    const { execution, workspace } =
      await runWithFailingCleanup(executionRequest());
    const text = JSON.stringify(execution.record);
    assert.notEqual(workspace, "");
    for (const forbidden of [
      workspace,
      HOST_MESSAGE,
      "EPERM",
      "errno",
      "operation not permitted",
      basename(workspace), // the unique temporary directory name
      "stack",
    ])
      assert.equal(text.includes(forbidden), false, forbidden);
  });

  it("no request field can select or influence cleanup", async () => {
    for (const field of ["workspace_removal", "cleanup", "remove_workspace"]) {
      const request: Mutable = { ...executionRequest(), [field]: "noop" };
      assert.deepEqual(
        issueCodes(evaluateDecisionSandboxPreflight(request).issues),
        ["unknown_property"],
        field,
      );
      let calls = 0;
      const { record } = await executeDecisionSandboxFixture(request, {
        workspace_removal: () => (calls += 1),
      });
      assert.equal(record.status, "blocked");
      assert.equal(calls, 0, "no workspace, so nothing to clean up");
    }
  });
});

/**
 * AI-143 — decision sandbox fixture runner (process executor).
 *
 * The fixture runner proves the execution contract.
 * It does not prove that untrusted candidate code is safe to run.
 *
 * Technical ability to spawn a process is not execution authority.
 *
 * This is the only module in `src/` that imports `node:child_process`.
 * It is deliberately not re-exported from `index.ts` and exposes no
 * generic subprocess utility: it runs exactly one allowlisted,
 * repository-owned synthetic fixture adapter, and only after the pure
 * preflight has bound the fixed policy, the adapter protocol, the exact
 * artifact hash and the exact AI-140 request hash.
 *
 * Process controls (enforced):
 *  - The artifact bytes are read from a repository-relative constant
 *    path, re-hashed, and only the verified bytes are written into a
 *    fresh private temporary working directory and executed. No path,
 *    executable, argument or environment value comes from a request.
 *  - Interpreter: the running Node binary (`process.execPath`) with fixed
 *    arguments: the Node permission model (fs reads limited to the copied
 *    artifact; fs writes, child processes, workers and addons denied),
 *    code generation from strings disallowed, warnings suppressed.
 *  - `shell: false`, empty environment (no inherited `NODE_OPTIONS`,
 *    credentials or HOME), piped stdio only.
 *  - Exactly one request frame on stdin, then EOF. One process per
 *    request and at most one live fixture process per runtime.
 *  - Bounded stdout and stderr; the child is killed with SIGKILL when a
 *    bound or the timeout is exceeded. No partial result is accepted.
 *    Each stream's byte count and SHA-256 are streamed over exactly the
 *    same observed bytes (`stream-evidence.ts`); stdout is retained only
 *    within its bound and stderr content is never retained.
 *  - No automatic retry and no fallback.
 *  - The temporary working directory removal is attempted exactly once
 *    after completion, with no retry. If the OS reports a failure the
 *    execution fails closed as `runtime_failed` with
 *    `workspace_cleanup_failed`: it is never `succeeded`, the result is
 *    discarded, and no exception escapes. The record states that cleanup
 *    failed; it cannot guarantee what the OS left behind.
 *
 * Not established (see the policy's `unestablished_properties`): OS-level
 * network or filesystem namespaces, hostile-code containment, resource
 * quotas, GPU isolation, interpreter hash binding and model supply-chain
 * safety. The Node permission model is a guard for trusted code, not a
 * security boundary against malicious code. Real candidate execution
 * therefore remains forbidden.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import type { TypedDecisionResult } from "../decision/contracts.js";
import { computeDecisionAdapterEnvelopeHash } from "./canonical.js";
import {
  DECISION_SANDBOX_EMPTY_SHA256,
  type DecisionSandboxExecutionRecord,
  DecisionSandboxExecutionStatus,
  DecisionSandboxPolicy,
  DecisionSandboxTermination,
} from "./contracts.js";
import { evaluateDecisionSandboxPreflight } from "./preflight.js";
import { DecisionSandboxStreamEvidence } from "./stream-evidence.js";
import {
  buildDecisionAdapterInput,
  decodeDecisionAdapterFrame,
  encodeDecisionAdapterFrame,
} from "./protocol.js";
import { buildDecisionSandboxExecutionRecord } from "./record.js";
import {
  issueCodes,
  validateDecisionAdapterOutput,
  type DecisionSandboxIssueCode,
} from "./validation.js";

/** Repository root, resolved from this module (`src/` or `dist/`). */
const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const WORKSPACE_PREFIX = "ai-lab-decision-sandbox-";
const ARTIFACT_FILE_NAME = "adapter.mjs";

export interface DecisionSandboxExecution {
  readonly record: DecisionSandboxExecutionRecord;
  /**
   * The validated AI-140 result, present only when `record.status` is
   * `succeeded`. It is sandbox output, not approved intelligence:
   * `governance.downstream_allowed` is `false`.
   */
  readonly result: TypedDecisionResult | null;
}

export interface DecisionSandboxFixtureRunOptions {
  /** Monotonic milliseconds for non-semantic duration telemetry. */
  readonly clock?: () => number;
  /** Test hook: observes the temporary working directory path. */
  readonly observe_workspace?: (workspace: string) => void;
  /**
   * Test hook: replaces the workspace removal operation, so tests can
   * simulate a cleanup failure deterministically. It is an argument of
   * this non-exported runner only; no execution request, schema or
   * protocol field can select or influence it.
   */
  readonly workspace_removal?: (workspace: string) => void;
}

interface Outcome {
  readonly status: DecisionSandboxExecutionStatus;
  readonly diagnostics: readonly DecisionSandboxIssueCode[];
  readonly accepted: {
    readonly protocol_result_hash: string;
    readonly result: TypedDecisionResult;
  } | null;
}

function removeWorkspace(workspace: string): void {
  rmSync(workspace, { recursive: true, force: true });
}

/**
 * Attempts workspace removal exactly once, with no retry. Returns whether
 * it reported success. The error itself (message, errno, path) is
 * deliberately discarded: host details are never execution evidence.
 */
function removeWorkspaceOnce(
  workspace: string,
  remove: (workspace: string) => void,
): boolean {
  try {
    remove(workspace);
    return true;
  } catch {
    return false;
  }
}

interface ProcessRun {
  readonly started: boolean;
  readonly spawn_failed: boolean;
  readonly exit_code: number | null;
  readonly signal: string | null;
  readonly termination: DecisionSandboxTermination;
  readonly limit_code: DecisionSandboxIssueCode | null;
  /** Retained stdout for protocol decoding; empty once over the bound. */
  readonly stdout: Buffer;
  readonly stdout_bytes: number;
  readonly stdout_sha256: string;
  readonly stderr_bytes: number;
  readonly stderr_sha256: string;
}

let liveProcesses = 0;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Closed value chosen by the Node major, never by input. */
function permissionFlag(): "--permission" | "--experimental-permission" {
  const major = Number(process.versions.node.split(".")[0]);
  return major >= 23 ? "--permission" : "--experimental-permission";
}

/**
 * The fixed interpreter arguments. The only variable part is the path of
 * the verified artifact copy inside the workspace this module created.
 */
function fixtureArguments(artifactPath: string): string[] {
  return [
    permissionFlag(),
    `--allow-fs-read=${artifactPath}`,
    "--disallow-code-generation-from-strings",
    "--no-warnings",
    artifactPath,
  ];
}

function runFixtureProcess(
  artifactPath: string,
  workspace: string,
  input: Uint8Array,
  policy: DecisionSandboxPolicy,
): Promise<ProcessRun> {
  return new Promise((settle) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(process.execPath, fixtureArguments(artifactPath), {
        cwd: workspace,
        env: {},
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        detached: false,
      });
    } catch {
      settle({
        started: false,
        spawn_failed: true,
        exit_code: null,
        signal: null,
        termination: "none",
        limit_code: null,
        stdout: Buffer.alloc(0),
        stdout_bytes: 0,
        stdout_sha256: DECISION_SANDBOX_EMPTY_SHA256,
        stderr_bytes: 0,
        stderr_sha256: DECISION_SANDBOX_EMPTY_SHA256,
      });
      return;
    }
    // Streaming evidence: each counter and its hash cover the same bytes.
    // stdout is retained only within its bound (for protocol decoding);
    // stderr content is never retained.
    const stdout = new DecisionSandboxStreamEvidence(
      policy.max_stdout_bytes,
      true,
    );
    const stderr = new DecisionSandboxStreamEvidence(
      policy.max_stderr_bytes,
      false,
    );
    let termination: DecisionSandboxTermination = "none";
    let limitCode: DecisionSandboxIssueCode | null = null;
    let settled = false;

    const terminate = (
      reason: Exclude<DecisionSandboxTermination, "none">,
      code: DecisionSandboxIssueCode | null,
    ): void => {
      if (termination === "none") {
        termination = reason;
        limitCode = code;
      }
      // Bytes arriving after termination are ignored by counter and hash.
      stdout.stop();
      stderr.stop();
      child.kill("SIGKILL");
      child.stdout.destroy();
      child.stderr.destroy();
    };
    const timer = setTimeout(
      () => terminate("timeout", null),
      policy.timeout_ms,
    );
    const finish = (
      exitCode: number | null,
      signal: string | null,
      spawnFailed: boolean,
    ): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const out = stdout.seal();
      const err = stderr.seal();
      settle({
        started: !spawnFailed,
        spawn_failed: spawnFailed,
        exit_code: exitCode,
        signal,
        termination,
        limit_code: limitCode,
        stdout: out.retained,
        stdout_bytes: out.bytes,
        stdout_sha256: out.sha256,
        stderr_bytes: err.bytes,
        stderr_sha256: err.sha256,
      });
    };

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.observe(chunk))
        terminate("output_limit", "stdout_limit_exceeded");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.observe(chunk))
        terminate("output_limit", "stderr_limit_exceeded");
    });
    child.on("error", () => {
      if (child.pid === undefined) finish(null, null, true);
    });
    child.on("close", (code, signal) =>
      finish(code, signal, child.pid === undefined),
    );
    // The adapter may exit before reading its input; EPIPE is not fatal.
    child.stdin.on("error", () => undefined);
    child.stdin.end(input);
  });
}

/**
 * Runs one execution request through preflight and, only when eligible,
 * one bounded fixture process. Never throws for adapter misbehaviour:
 * every outcome is an immutable execution record. Never retries.
 */
export async function executeDecisionSandboxFixture(
  executionRequest: unknown,
  options: DecisionSandboxFixtureRunOptions = {},
): Promise<DecisionSandboxExecution> {
  const clock = options.clock ?? (() => performance.now());
  const startedAt = clock();
  const preflight = evaluateDecisionSandboxPreflight(executionRequest);
  const policy = preflight.policy;

  const conclude = (
    status: DecisionSandboxExecutionStatus,
    diagnostics: readonly DecisionSandboxIssueCode[],
    run: ProcessRun | null,
    accepted: {
      readonly protocol_result_hash: string;
      readonly result: TypedDecisionResult;
    } | null,
    bound: boolean,
  ): DecisionSandboxExecution => {
    const record = buildDecisionSandboxExecutionRecord({
      execution_id: preflight.execution_id,
      adapter: bound ? preflight.adapter : null,
      request_hash: preflight.request_hash,
      status,
      preflight_outcome: preflight.outcome,
      process_outcome: {
        started: run?.started ?? false,
        exit_code: run?.exit_code ?? null,
        signal: run?.signal ?? null,
        terminated_by_runtime: run?.termination ?? "none",
      },
      protocol_result_hash: accepted?.protocol_result_hash ?? null,
      typed_result_hash: accepted?.result.result_hash ?? null,
      diagnostics,
      telemetry: {
        duration_ms: Math.max(0, Math.round(clock() - startedAt)),
        stdout_bytes: run?.stdout_bytes ?? 0,
        stdout_sha256: run?.stdout_sha256 ?? DECISION_SANDBOX_EMPTY_SHA256,
        stderr_bytes: run?.stderr_bytes ?? 0,
        stderr_sha256: run?.stderr_sha256 ?? DECISION_SANDBOX_EMPTY_SHA256,
      },
    });
    return { record, result: accepted?.result ?? null };
  };

  const adapter = preflight.adapter;
  const request = preflight.request;
  const executionId = preflight.execution_id;
  const requestHash = preflight.request_hash;
  if (
    preflight.outcome !== "eligible_for_fixture_execution" ||
    adapter === null ||
    request === null ||
    executionId === null ||
    requestHash === null
  )
    return conclude("blocked", issueCodes(preflight.issues), null, null, false);

  if (liveProcesses >= policy.max_processes)
    return conclude("blocked", ["process_limit_exceeded"], null, null, true);

  // Bind the exact bytes before any process exists.
  let artifact: Buffer;
  try {
    artifact = readFileSync(join(REPOSITORY_ROOT, adapter.artifact_path));
  } catch {
    return conclude(
      "blocked",
      ["adapter_artifact_unavailable"],
      null,
      null,
      true,
    );
  }
  if (sha256(artifact) !== adapter.artifact_sha256)
    return conclude(
      "blocked",
      ["adapter_artifact_hash_mismatch"],
      null,
      null,
      true,
    );

  const input = encodeDecisionAdapterFrame(
    buildDecisionAdapterInput(executionId, request),
  );

  let workspace: string;
  try {
    // Real path, so the permission-model grant names the exact file even
    // when the temporary directory is reached through a symlink.
    workspace = realpathSync(mkdtempSync(join(tmpdir(), WORKSPACE_PREFIX)));
  } catch {
    return conclude("blocked", ["workspace_unavailable"], null, null, true);
  }
  liveProcesses += 1;
  let run: ProcessRun | null = null;
  let cleaned = false;
  try {
    options.observe_workspace?.(workspace);
    const artifactPath = join(workspace, ARTIFACT_FILE_NAME);
    let staged = false;
    try {
      writeFileSync(artifactPath, artifact, { flag: "wx", mode: 0o400 });
      staged = true;
    } catch {
      staged = false;
    }
    if (staged)
      run = await runFixtureProcess(artifactPath, workspace, input, policy);
  } finally {
    liveProcesses -= 1;
    cleaned = removeWorkspaceOnce(
      workspace,
      options.workspace_removal ?? removeWorkspace,
    );
  }

  const classifyRun = (observed: ProcessRun): Outcome => {
    const fail = (
      status: DecisionSandboxExecutionStatus,
      diagnostics: readonly DecisionSandboxIssueCode[],
    ): Outcome => ({ status, diagnostics, accepted: null });
    if (observed.spawn_failed)
      return fail("process_failed", ["process_spawn_failed"]);
    if (observed.termination === "timeout")
      return fail("timed_out", ["timeout_exceeded"]);
    if (observed.termination === "output_limit")
      return fail("output_limit_exceeded", [
        observed.limit_code ?? "stdout_limit_exceeded",
      ]);
    if (observed.signal !== null)
      return fail("process_failed", ["process_signaled"]);
    if (observed.exit_code !== 0)
      return fail("process_failed", ["process_exit_nonzero"]);

    const frame = decodeDecisionAdapterFrame(
      observed.stdout,
      policy.max_stdout_bytes,
    );
    if (!frame.ok) return fail("protocol_failed", [frame.code]);
    const output = validateDecisionAdapterOutput(frame.value, {
      execution_id: executionId,
      request,
      request_hash: requestHash,
      protocol_version: adapter.protocol_version,
      result_origin: adapter.result_origin,
    });
    if (!output.ok) return fail("protocol_failed", issueCodes(output.issues));
    return {
      status: "succeeded",
      diagnostics: [],
      accepted: {
        protocol_result_hash: computeDecisionAdapterEnvelopeHash(output.value),
        result: output.value.result,
      },
    };
  };

  const outcome: Outcome =
    run === null
      ? {
          status: "blocked",
          diagnostics: ["workspace_unavailable"],
          accepted: null,
        }
      : classifyRun(run);
  // Cleanup failure fails closed: it overrides any tentative outcome
  // (success included), discards the result and keeps the observed process
  // outcome. The underlying diagnostics are kept; they are not authority.
  if (!cleaned)
    return conclude(
      "runtime_failed",
      [...outcome.diagnostics, "workspace_cleanup_failed"],
      run,
      null,
      true,
    );
  return conclude(
    outcome.status,
    outcome.diagnostics,
    run,
    outcome.accepted,
    true,
  );
}

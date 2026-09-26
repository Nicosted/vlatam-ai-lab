/**
 * AI-143 — pure, fail-closed validators for the decision sandbox policy,
 * the common adapter protocol envelopes and the execution record.
 *
 * Rules:
 *  - Validators are pure. They never throw, log, coerce, normalize or
 *    repair a value, and never read the clock, the environment, the
 *    filesystem, the network or a process.
 *  - Every object is closed: unknown properties fail.
 *  - Issues use a closed vocabulary of stable machine codes.
 *  - A structurally valid envelope or record never grants authority.
 */

import { findForbiddenFieldPaths } from "../capabilities/validation.js";
import {
  computeTypedDecisionRequestHash,
  computeTypedDecisionResultHash,
} from "../decision/canonical.js";
import type {
  TypedDecisionRequest,
  TypedDecisionResult,
} from "../decision/contracts.js";
import {
  PRIVATE_REASONING_FIELD_NAMES,
  validateTypedDecisionRequest,
  validateTypedDecisionResultForRequest,
} from "../decision/validation.js";
import {
  computeDecisionSandboxExecutionRecordHash,
  computeDecisionSandboxPolicyHash,
} from "./canonical.js";
import {
  DECISION_ADAPTER_FRAMING,
  DECISION_ADAPTER_PROTOCOL,
  DECISION_ADAPTER_PROTOCOL_VERSION,
  DECISION_SANDBOX_ENFORCED_CONTROLS,
  DECISION_SANDBOX_EXECUTION_STATUSES,
  DECISION_SANDBOX_FIXTURE_ADAPTERS,
  DECISION_SANDBOX_FIXTURE_POLICY_HASH,
  DECISION_SANDBOX_HASH_PATTERN,
  DECISION_SANDBOX_ID_PATTERN,
  DECISION_SANDBOX_LIMIT_CEILINGS,
  DECISION_SANDBOX_PREFLIGHT_OUTCOMES,
  DECISION_SANDBOX_TERMINATIONS,
  DECISION_SANDBOX_UNESTABLISHED_PROPERTIES,
  DECISION_SANDBOX_VERSION_PATTERN,
  SUPPORTED_DECISION_ADAPTER_PROTOCOL_MAJORS,
  SUPPORTED_DECISION_SANDBOX_CONTRACT_MAJORS,
  type DecisionAdapterInput,
  type DecisionAdapterOutput,
  type DecisionSandboxExecutionRecord,
  type DecisionSandboxPolicy,
} from "./contracts.js";

export const DECISION_SANDBOX_ISSUE_CODES = [
  // Shape
  "contract_invalid",
  "unknown_property",
  "missing_property",
  "schema_version_invalid",
  "schema_version_unsupported",
  "identifier_invalid",
  "forbidden_field",
  "private_reasoning_forbidden",
  "execution_control_forbidden",
  "production_authority_forbidden",
  // Policy
  "policy_invalid",
  "policy_unsupported",
  "policy_limit_invalid",
  "policy_claim_invalid",
  "policy_hash_mismatch",
  // Protocol
  "protocol_invalid",
  "protocol_version_unsupported",
  // Execution subject
  "subject_invalid",
  "subject_kind_invalid",
  "registered_candidate_execution_forbidden",
  "adapter_unknown",
  "adapter_version_mismatch",
  "adapter_hash_mismatch",
  // Request binding
  "typed_request_invalid",
  "request_hash_mismatch",
  "input_limit_exceeded",
  "output_authority_invalid",
  // Response binding
  "execution_id_mismatch",
  "typed_result_invalid",
  "result_origin_invalid",
  "result_hash_mismatch",
  // Framing
  "response_missing",
  "response_not_utf8",
  "response_framing_invalid",
  "response_multiple",
  "response_trailing_output",
  "response_json_invalid",
  "response_not_object",
  // Process
  "adapter_artifact_unavailable",
  "adapter_artifact_hash_mismatch",
  "workspace_unavailable",
  "process_limit_exceeded",
  "process_spawn_failed",
  "process_exit_nonzero",
  "process_signaled",
  "timeout_exceeded",
  "stdout_limit_exceeded",
  "stderr_limit_exceeded",
  // Record
  "status_invalid",
  "status_outcome_mismatch",
  "process_outcome_invalid",
  "diagnostics_invalid",
  "telemetry_invalid",
  "downstream_authority_forbidden",
  "record_hash_mismatch",
] as const;
export type DecisionSandboxIssueCode =
  (typeof DECISION_SANDBOX_ISSUE_CODES)[number];

export interface DecisionSandboxIssue {
  readonly code: DecisionSandboxIssueCode;
  readonly path: string;
}

export type DecisionSandboxValidation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly DecisionSandboxIssue[] };

/**
 * Field names that would let a request choose what or how to execute,
 * or reach a network. Matched case-insensitively at any depth. Closed
 * objects reject them anyway; this names the reason explicitly.
 */
export const DECISION_SANDBOX_EXECUTION_CONTROL_FIELD_NAMES = new Set<string>([
  "allow_network",
  "args",
  "argv",
  "arguments",
  "artifact_path",
  "binary",
  "cmd",
  "command",
  "credential",
  "credentials",
  "cwd",
  "entrypoint",
  "env",
  "environment",
  "exec",
  "executable",
  "executable_path",
  "hosts",
  "interpreter",
  "network",
  "network_access",
  "node_options",
  "proxy",
  "script",
  "shell",
  "spawn",
  "url",
  "working_directory",
]);

/**
 * Field names that would carry production, routing, promotion, approval,
 * benchmark or downstream authority. Matched case-insensitively at any
 * depth of an execution request or policy.
 */
export const DECISION_SANDBOX_AUTHORITY_FIELD_NAMES = new Set<string>([
  "activation",
  "approval",
  "approval_ref",
  "approved",
  "approved_for_production",
  "benchmark",
  "benchmark_eligible",
  "downstream_allowed",
  "kill_switch",
  "production",
  "production_eligible",
  "promote",
  "promotion",
  "promotion_eligible",
  "route",
  "routing",
  "routing_enabled",
  "schedule",
  "scheduler",
  "tournament",
  "traffic",
  "traffic_stage",
  "universal_winner",
  "winner",
]);

type Record_ = Record<string, unknown>;

function isRecord(value: unknown): value is Record_ {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class DecisionSandboxIssueCollector {
  readonly issues: DecisionSandboxIssue[] = [];
  add(code: DecisionSandboxIssueCode, path: string): void {
    this.issues.push({ code, path });
  }
  result<T>(value: T): DecisionSandboxValidation<T> {
    if (this.issues.length === 0) return { ok: true, value };
    return { ok: false, issues: sortIssues(this.issues) };
  }
}

/** Deduplicated, deterministically ordered issues. */
export function sortIssues(
  issues: readonly DecisionSandboxIssue[],
): DecisionSandboxIssue[] {
  const seen = new Set<string>();
  const unique = issues.filter((issue) => {
    const key = `${issue.code}@${issue.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.sort((a, b) =>
    a.path === b.path
      ? a.code < b.code
        ? -1
        : a.code > b.code
          ? 1
          : 0
      : a.path < b.path
        ? -1
        : 1,
  );
}

/** Strictly ascending unique machine codes of a set of issues. */
export function issueCodes(
  issues: readonly DecisionSandboxIssue[],
): DecisionSandboxIssueCode[] {
  return [...new Set(issues.map((issue) => issue.code))].sort();
}

type Collector = DecisionSandboxIssueCollector;

export function checkClosed(
  value: Record_,
  keys: readonly string[],
  path: string,
  c: Collector,
): void {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) c.add("unknown_property", `${path}.${key}`);
  }
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key))
      c.add("missing_property", `${path}.${key}`);
  }
}

export function isSandboxId(value: unknown): value is string {
  return typeof value === "string" && DECISION_SANDBOX_ID_PATTERN.test(value);
}

export function isSandboxHash(value: unknown): value is string {
  return typeof value === "string" && DECISION_SANDBOX_HASH_PATTERN.test(value);
}

function majorOf(value: unknown): number | null {
  if (
    typeof value !== "string" ||
    !DECISION_SANDBOX_VERSION_PATTERN.test(value)
  )
    return null;
  return Number(value.split(".")[0]);
}

export function checkSchemaVersion(
  value: unknown,
  path: string,
  c: Collector,
): void {
  const major = majorOf(value);
  if (major === null) c.add("schema_version_invalid", path);
  else if (
    !(SUPPORTED_DECISION_SANDBOX_CONTRACT_MAJORS as readonly number[]).includes(
      major,
    )
  )
    c.add("schema_version_unsupported", path);
}

/** The adapter protocol is admitted only at its exact bound version. */
export function checkProtocolVersion(
  value: unknown,
  path: string,
  c: Collector,
): void {
  const major = majorOf(value);
  if (major === null) c.add("protocol_invalid", path);
  else if (
    !(SUPPORTED_DECISION_ADAPTER_PROTOCOL_MAJORS as readonly number[]).includes(
      major,
    ) ||
    value !== DECISION_ADAPTER_PROTOCOL_VERSION
  )
    c.add("protocol_version_unsupported", path);
}

/**
 * Deep field-name scan: provider/credential names (the AI-71 list),
 * private reasoning names and, optionally, execution-control and
 * authority names.
 */
export function checkFieldNames(
  value: unknown,
  root: string,
  c: Collector,
  options: { readonly controlAndAuthority: boolean },
): void {
  for (const path of findForbiddenFieldPaths(value, 16))
    c.add("forbidden_field", `${root}.${path}`);
  const seen = new Set<unknown>();
  const walk = (node: unknown, path: string, depth: number): void => {
    if (depth > 16 || node === null || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1));
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      const childPath = `${path}.${key}`;
      const name = key.toLowerCase();
      if (PRIVATE_REASONING_FIELD_NAMES.has(name))
        c.add("private_reasoning_forbidden", childPath);
      if (options.controlAndAuthority) {
        if (DECISION_SANDBOX_EXECUTION_CONTROL_FIELD_NAMES.has(name))
          c.add("execution_control_forbidden", childPath);
        if (DECISION_SANDBOX_AUTHORITY_FIELD_NAMES.has(name))
          c.add("production_authority_forbidden", childPath);
      }
      walk(child, childPath, depth + 1);
    }
  };
  walk(value, root, 0);
}

function includes<T extends string>(
  list: readonly T[],
  value: unknown,
): value is T {
  return (
    typeof value === "string" && (list as readonly string[]).includes(value)
  );
}

function strictlyAscendingStrings(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item, index) =>
        typeof item === "string" &&
        (index === 0 || (value[index - 1] as string) < item),
    )
  );
}

// ---------------------------------------------------------------------
// Sandbox policy
// ---------------------------------------------------------------------

const POLICY_KEYS = [
  "contract",
  "schema_version",
  "policy_id",
  "policy_version",
  "protocol",
  "protocol_version",
  "framing",
  "executable_subject_kind",
  "max_input_bytes",
  "max_stdout_bytes",
  "max_stderr_bytes",
  "timeout_ms",
  "max_processes",
  "automatic_retries",
  "fallback",
  "network_claim",
  "filesystem_claim",
  "hostile_code_containment",
  "enforced_controls",
  "unestablished_properties",
  "output_authority",
  "policy_hash",
] as const;

const LIMIT_KEYS = [
  "max_input_bytes",
  "max_stdout_bytes",
  "max_stderr_bytes",
  "timeout_ms",
  "max_processes",
] as const;

/**
 * Validates a sandbox policy. Only the single fixed fixture policy is
 * supported: a structurally valid policy with any other hash is
 * `policy_unsupported`. Limits are bounded positive integers at or below
 * the hard ceilings; isolation claims can never be upgraded.
 */
export function validateDecisionSandboxPolicy(
  value: unknown,
): DecisionSandboxValidation<DecisionSandboxPolicy> {
  const c = new DecisionSandboxIssueCollector();
  if (!isRecord(value) || value["contract"] !== "decision_sandbox_policy") {
    c.add("contract_invalid", "policy");
    return c.result(value as unknown as DecisionSandboxPolicy);
  }
  checkClosed(value, POLICY_KEYS, "policy", c);
  checkFieldNames(value, "policy", c, { controlAndAuthority: true });
  checkSchemaVersion(value["schema_version"], "policy.schema_version", c);
  if (!isSandboxId(value["policy_id"]))
    c.add("identifier_invalid", "policy.policy_id");
  if (majorOf(value["policy_version"]) === null)
    c.add("identifier_invalid", "policy.policy_version");
  if (value["protocol"] !== DECISION_ADAPTER_PROTOCOL)
    c.add("protocol_invalid", "policy.protocol");
  checkProtocolVersion(value["protocol_version"], "policy.protocol_version", c);
  if (value["framing"] !== DECISION_ADAPTER_FRAMING)
    c.add("protocol_invalid", "policy.framing");
  if (value["executable_subject_kind"] !== "synthetic_fixture_adapter")
    c.add("subject_kind_invalid", "policy.executable_subject_kind");
  for (const key of LIMIT_KEYS) {
    const limit = value[key];
    if (
      typeof limit !== "number" ||
      !Number.isSafeInteger(limit) ||
      limit <= 0 ||
      limit > DECISION_SANDBOX_LIMIT_CEILINGS[key]
    )
      c.add("policy_limit_invalid", `policy.${key}`);
  }
  if (value["automatic_retries"] !== 0)
    c.add("policy_limit_invalid", "policy.automatic_retries");
  if (value["fallback"] !== "none") c.add("policy_invalid", "policy.fallback");
  for (const key of [
    "network_claim",
    "filesystem_claim",
    "hostile_code_containment",
  ] as const)
    if (value[key] !== "not_established")
      c.add("policy_claim_invalid", `policy.${key}`);
  const controls = value["enforced_controls"];
  if (
    !strictlyAscendingStrings(controls) ||
    !controls.every((control) =>
      includes(DECISION_SANDBOX_ENFORCED_CONTROLS, control),
    )
  )
    c.add("policy_claim_invalid", "policy.enforced_controls");
  const unestablished = value["unestablished_properties"];
  if (
    !strictlyAscendingStrings(unestablished) ||
    unestablished.length !== DECISION_SANDBOX_UNESTABLISHED_PROPERTIES.length ||
    !DECISION_SANDBOX_UNESTABLISHED_PROPERTIES.every(
      (property, index) => unestablished[index] === property,
    )
  )
    c.add("policy_claim_invalid", "policy.unestablished_properties");
  if (value["output_authority"] !== "none")
    c.add("output_authority_invalid", "policy.output_authority");
  if (!isSandboxHash(value["policy_hash"])) {
    c.add("policy_hash_mismatch", "policy.policy_hash");
  } else if (c.issues.length === 0) {
    const computed = computeDecisionSandboxPolicyHash(
      value as unknown as DecisionSandboxPolicy,
    );
    if (computed !== value["policy_hash"])
      c.add("policy_hash_mismatch", "policy.policy_hash");
    else if (computed !== DECISION_SANDBOX_FIXTURE_POLICY_HASH)
      c.add("policy_unsupported", "policy.policy_hash");
  }
  return c.result(value as unknown as DecisionSandboxPolicy);
}

// ---------------------------------------------------------------------
// Adapter protocol envelopes
// ---------------------------------------------------------------------

const INPUT_KEYS = [
  "contract",
  "protocol",
  "protocol_version",
  "execution_id",
  "request",
  "request_hash",
] as const;

const OUTPUT_KEYS = [
  "contract",
  "protocol",
  "protocol_version",
  "execution_id",
  "request_hash",
  "result",
  "result_hash",
] as const;

/** Validates an adapter input envelope and its AI-140 request binding. */
export function validateDecisionAdapterInput(
  value: unknown,
): DecisionSandboxValidation<DecisionAdapterInput> {
  const c = new DecisionSandboxIssueCollector();
  if (!isRecord(value) || value["contract"] !== "decision_adapter_input") {
    c.add("contract_invalid", "input");
    return c.result(value as unknown as DecisionAdapterInput);
  }
  checkClosed(value, INPUT_KEYS, "input", c);
  checkFieldNames(value, "input", c, { controlAndAuthority: true });
  if (value["protocol"] !== DECISION_ADAPTER_PROTOCOL)
    c.add("protocol_invalid", "input.protocol");
  checkProtocolVersion(value["protocol_version"], "input.protocol_version", c);
  if (!isSandboxId(value["execution_id"]))
    c.add("identifier_invalid", "input.execution_id");
  const request = validateTypedDecisionRequest(value["request"]);
  if (!request.ok) c.add("typed_request_invalid", "input.request");
  if (!isSandboxHash(value["request_hash"]))
    c.add("request_hash_mismatch", "input.request_hash");
  else if (
    request.ok &&
    computeTypedDecisionRequestHash(request.value) !== value["request_hash"]
  )
    c.add("request_hash_mismatch", "input.request_hash");
  return c.result(value as unknown as DecisionAdapterInput);
}

export interface DecisionAdapterOutputExpectation {
  readonly execution_id: string;
  readonly request: TypedDecisionRequest;
  readonly request_hash: string;
  readonly protocol_version: string;
  readonly result_origin: TypedDecisionResult["result_origin"];
}

/**
 * Validates an adapter output envelope against the exact execution it
 * answers: protocol, execution id, request hash, the AI-140 result bound
 * to the AI-140 request, result origin and result hash. A valid output is
 * still not approval: the AI-140 result keeps `downstream_allowed: false`.
 */
export function validateDecisionAdapterOutput(
  value: unknown,
  expected: DecisionAdapterOutputExpectation,
): DecisionSandboxValidation<DecisionAdapterOutput> {
  const c = new DecisionSandboxIssueCollector();
  if (!isRecord(value) || value["contract"] !== "decision_adapter_output") {
    c.add("contract_invalid", "output");
    return c.result(value as unknown as DecisionAdapterOutput);
  }
  checkClosed(value, OUTPUT_KEYS, "output", c);
  checkFieldNames(value, "output", c, { controlAndAuthority: false });
  if (value["protocol"] !== DECISION_ADAPTER_PROTOCOL)
    c.add("protocol_invalid", "output.protocol");
  checkProtocolVersion(value["protocol_version"], "output.protocol_version", c);
  if (
    typeof value["protocol_version"] === "string" &&
    value["protocol_version"] !== expected.protocol_version
  )
    c.add("protocol_version_unsupported", "output.protocol_version");
  if (value["execution_id"] !== expected.execution_id)
    c.add("execution_id_mismatch", "output.execution_id");
  if (value["request_hash"] !== expected.request_hash)
    c.add("request_hash_mismatch", "output.request_hash");
  const result = value["result"];
  if (!validateTypedDecisionResultForRequest(result, expected.request).ok)
    c.add("typed_result_invalid", "output.result");
  if (isRecord(result)) {
    if (result["result_origin"] !== expected.result_origin)
      c.add("result_origin_invalid", "output.result.result_origin");
    let recomputed: string | null = null;
    try {
      recomputed = computeTypedDecisionResultHash(
        result as unknown as TypedDecisionResult,
      );
    } catch {
      recomputed = null;
    }
    if (
      !isSandboxHash(value["result_hash"]) ||
      value["result_hash"] !== result["result_hash"] ||
      value["result_hash"] !== recomputed
    )
      c.add("result_hash_mismatch", "output.result_hash");
  } else {
    c.add("result_hash_mismatch", "output.result_hash");
  }
  return c.result(value as unknown as DecisionAdapterOutput);
}

// ---------------------------------------------------------------------
// Execution record
// ---------------------------------------------------------------------

const RECORD_KEYS = [
  "contract",
  "schema_version",
  "execution_id",
  "sandbox_policy",
  "adapter",
  "request_hash",
  "status",
  "preflight_outcome",
  "process_outcome",
  "protocol_result_hash",
  "typed_result_hash",
  "diagnostics",
  "output_authority",
  "downstream_allowed",
  "telemetry",
  "execution_record_hash",
] as const;

const POLICY_BINDING_KEYS = [
  "policy_id",
  "policy_version",
  "policy_hash",
] as const;
const ADAPTER_BINDING_KEYS = [
  "adapter_id",
  "adapter_version",
  "artifact_sha256",
] as const;
const PROCESS_KEYS = [
  "started",
  "exit_code",
  "signal",
  "terminated_by_runtime",
] as const;
const TELEMETRY_KEYS = [
  "duration_ms",
  "stdout_bytes",
  "stdout_sha256",
  "stderr_bytes",
  "stderr_sha256",
] as const;

const SIGNAL_PATTERN = /^SIG[A-Z0-9]{2,10}$/;

function isNullableHash(value: unknown): boolean {
  return value === null || isSandboxHash(value);
}

function isCount(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Validates an execution record: closed shape, bound fixed policy and
 * allowlisted adapter, status/outcome consistency, closed diagnostics,
 * constant non-authority and the semantic self-hash. A `succeeded`
 * record is evidence that the protocol was honoured, never approval.
 */
export function validateDecisionSandboxExecutionRecord(
  value: unknown,
): DecisionSandboxValidation<DecisionSandboxExecutionRecord> {
  const c = new DecisionSandboxIssueCollector();
  if (
    !isRecord(value) ||
    value["contract"] !== "decision_sandbox_execution_record"
  ) {
    c.add("contract_invalid", "record");
    return c.result(value as unknown as DecisionSandboxExecutionRecord);
  }
  checkClosed(value, RECORD_KEYS, "record", c);
  checkFieldNames(value, "record", c, { controlAndAuthority: false });
  checkSchemaVersion(value["schema_version"], "record.schema_version", c);
  if (value["execution_id"] !== null && !isSandboxId(value["execution_id"]))
    c.add("identifier_invalid", "record.execution_id");

  const policy = value["sandbox_policy"];
  if (!isRecord(policy)) c.add("policy_invalid", "record.sandbox_policy");
  else {
    checkClosed(policy, POLICY_BINDING_KEYS, "record.sandbox_policy", c);
    if (policy["policy_hash"] !== DECISION_SANDBOX_FIXTURE_POLICY_HASH)
      c.add("policy_unsupported", "record.sandbox_policy.policy_hash");
  }

  const adapter = value["adapter"];
  if (adapter !== null) {
    if (!isRecord(adapter)) c.add("adapter_unknown", "record.adapter");
    else {
      checkClosed(adapter, ADAPTER_BINDING_KEYS, "record.adapter", c);
      const known = DECISION_SANDBOX_FIXTURE_ADAPTERS.find(
        (entry) => entry.adapter_id === adapter["adapter_id"],
      );
      if (known === undefined)
        c.add("adapter_unknown", "record.adapter.adapter_id");
      else {
        if (known.adapter_version !== adapter["adapter_version"])
          c.add("adapter_version_mismatch", "record.adapter.adapter_version");
        if (known.artifact_sha256 !== adapter["artifact_sha256"])
          c.add("adapter_hash_mismatch", "record.adapter.artifact_sha256");
      }
    }
  }
  if (!isNullableHash(value["request_hash"]))
    c.add("request_hash_mismatch", "record.request_hash");
  if (!isNullableHash(value["protocol_result_hash"]))
    c.add("result_hash_mismatch", "record.protocol_result_hash");
  if (!isNullableHash(value["typed_result_hash"]))
    c.add("result_hash_mismatch", "record.typed_result_hash");

  const status = value["status"];
  if (!includes(DECISION_SANDBOX_EXECUTION_STATUSES, status))
    c.add("status_invalid", "record.status");
  const preflight = value["preflight_outcome"];
  if (!includes(DECISION_SANDBOX_PREFLIGHT_OUTCOMES, preflight))
    c.add("status_invalid", "record.preflight_outcome");

  const processOutcome = value["process_outcome"];
  let processValid = false;
  if (!isRecord(processOutcome))
    c.add("process_outcome_invalid", "record.process_outcome");
  else {
    checkClosed(processOutcome, PROCESS_KEYS, "record.process_outcome", c);
    const exitCode = processOutcome["exit_code"];
    const signal = processOutcome["signal"];
    processValid =
      typeof processOutcome["started"] === "boolean" &&
      (exitCode === null ||
        (typeof exitCode === "number" &&
          Number.isSafeInteger(exitCode) &&
          exitCode >= 0 &&
          exitCode <= 255)) &&
      (signal === null ||
        (typeof signal === "string" && SIGNAL_PATTERN.test(signal))) &&
      includes(
        DECISION_SANDBOX_TERMINATIONS,
        processOutcome["terminated_by_runtime"],
      );
    if (!processValid)
      c.add("process_outcome_invalid", "record.process_outcome");
  }

  const diagnostics = value["diagnostics"];
  const diagnosticsValid =
    strictlyAscendingStrings(diagnostics) &&
    diagnostics.every((code) => includes(DECISION_SANDBOX_ISSUE_CODES, code));
  if (!diagnosticsValid) c.add("diagnostics_invalid", "record.diagnostics");

  if (value["output_authority"] !== "none")
    c.add("output_authority_invalid", "record.output_authority");
  if (value["downstream_allowed"] !== false)
    c.add("downstream_authority_forbidden", "record.downstream_allowed");

  const telemetry = value["telemetry"];
  if (!isRecord(telemetry)) c.add("telemetry_invalid", "record.telemetry");
  else {
    checkClosed(telemetry, TELEMETRY_KEYS, "record.telemetry", c);
    if (
      !isCount(telemetry["duration_ms"]) ||
      !isCount(telemetry["stdout_bytes"]) ||
      !isCount(telemetry["stderr_bytes"]) ||
      !isSandboxHash(telemetry["stdout_sha256"]) ||
      !isSandboxHash(telemetry["stderr_sha256"])
    )
      c.add("telemetry_invalid", "record.telemetry");
  }

  if (
    includes(DECISION_SANDBOX_EXECUTION_STATUSES, status) &&
    includes(DECISION_SANDBOX_PREFLIGHT_OUTCOMES, preflight) &&
    processValid &&
    diagnosticsValid &&
    isRecord(processOutcome)
  )
    checkStatusConsistency(
      value,
      status,
      processOutcome,
      diagnostics as string[],
      c,
    );

  if (!isSandboxHash(value["execution_record_hash"])) {
    c.add("record_hash_mismatch", "record.execution_record_hash");
  } else if (c.issues.length === 0) {
    const computed = computeDecisionSandboxExecutionRecordHash(
      value as unknown as DecisionSandboxExecutionRecord,
    );
    if (computed !== value["execution_record_hash"])
      c.add("record_hash_mismatch", "record.execution_record_hash");
  }
  return c.result(value as unknown as DecisionSandboxExecutionRecord);
}

function checkStatusConsistency(
  record: Record_,
  status: DecisionSandboxExecutionRecord["status"],
  process: Record_,
  diagnostics: readonly string[],
  c: Collector,
): void {
  const mismatch = (): void =>
    c.add("status_outcome_mismatch", "record.status");
  const hashesPresent =
    record["protocol_result_hash"] !== null ||
    record["typed_result_hash"] !== null;
  const eligible =
    record["preflight_outcome"] === "eligible_for_fixture_execution";
  const bound = record["adapter"] !== null && record["request_hash"] !== null;
  const termination = process["terminated_by_runtime"];
  switch (status) {
    case "succeeded":
      if (
        !eligible ||
        !bound ||
        process["started"] !== true ||
        process["exit_code"] !== 0 ||
        process["signal"] !== null ||
        termination !== "none" ||
        record["protocol_result_hash"] === null ||
        record["typed_result_hash"] === null ||
        diagnostics.length !== 0
      )
        mismatch();
      return;
    case "blocked":
      if (
        process["started"] !== false ||
        process["exit_code"] !== null ||
        process["signal"] !== null ||
        termination !== "none" ||
        hashesPresent ||
        diagnostics.length === 0
      )
        mismatch();
      return;
    case "timed_out":
      if (
        !eligible ||
        !bound ||
        process["started"] !== true ||
        termination !== "timeout" ||
        hashesPresent ||
        !diagnostics.includes("timeout_exceeded")
      )
        mismatch();
      return;
    case "output_limit_exceeded":
      if (
        !eligible ||
        !bound ||
        process["started"] !== true ||
        termination !== "output_limit" ||
        hashesPresent ||
        !(
          diagnostics.includes("stdout_limit_exceeded") ||
          diagnostics.includes("stderr_limit_exceeded")
        )
      )
        mismatch();
      return;
    case "process_failed":
      if (
        !eligible ||
        !bound ||
        termination !== "none" ||
        hashesPresent ||
        diagnostics.length === 0
      )
        mismatch();
      return;
    case "protocol_failed":
      if (
        !eligible ||
        !bound ||
        process["started"] !== true ||
        process["exit_code"] !== 0 ||
        termination !== "none" ||
        hashesPresent ||
        diagnostics.length === 0
      )
        mismatch();
      return;
  }
}

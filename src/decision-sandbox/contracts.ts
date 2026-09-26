/**
 * AI-143 — Governed Decision Sandbox Runtime and Common Adapter Protocol:
 * contract types and fixed constants.
 *
 * The fixture runner proves the execution contract.
 * It does not prove that untrusted candidate code is safe to run.
 *
 * Technical ability to spawn a process is not execution authority.
 *
 * AI-143 validates the adapter protocol, process containment mechanics,
 * bounded I/O, timeouts and evidence capture using trusted
 * repository-owned fixtures. It does not establish that arbitrary
 * upstream code is safely sandboxed. The only executable subject is the
 * repository-owned synthetic fixture adapter pinned below by exact
 * artifact SHA-256. An AI-142 registered candidate is recognised as a
 * subject kind only so that it can be refused before process creation.
 *
 * Invariants (full statement in
 * `docs/architecture/ai-decision-sandbox-runtime.md`):
 *
 *  1. Execution capability is not execution authority.
 *  2. A runtime may execute bytes only when the bytes, protocol, limits
 *     and execution subject are exactly bound before process creation.
 *  3. A registered candidate remains non-executable; AI-142 lifecycle
 *     flags remain false.
 *  4. Sandbox output is not approved intelligence. Sandbox success is not
 *     benchmark success and not promotion eligibility. Output authority
 *     is always `none` and `downstream_allowed` is always `false`.
 *  5. The adapter `request` is the AI-140 `TypedDecisionRequest` and the
 *     adapter `result` is the AI-140 `TypedDecisionResult`; no competing
 *     result shape exists.
 *  6. stderr is diagnostic only and never decision truth.
 *  7. No implicit fallback, no automatic retry, one request per process.
 *  8. Isolation claims are explicit: enforced controls are listed, and
 *     OS-level network/filesystem isolation and hostile-code containment
 *     are recorded as not established.
 */

import type {
  TypedDecisionRequest,
  TypedDecisionResult,
} from "../decision/contracts.js";

export const DECISION_SANDBOX_CONTRACT_VERSION = "1.0.0" as const;
export const SUPPORTED_DECISION_SANDBOX_CONTRACT_MAJORS = [1] as const;

// ---------------------------------------------------------------------
// Common adapter protocol
// ---------------------------------------------------------------------

/** Provider-neutral, candidate-neutral adapter protocol identity. */
export const DECISION_ADAPTER_PROTOCOL = "ai-lab-decision-adapter" as const;
export const DECISION_ADAPTER_PROTOCOL_VERSION = "1.0.0" as const;
export const SUPPORTED_DECISION_ADAPTER_PROTOCOL_MAJORS = [1] as const;

/**
 * Framing: exactly one UTF-8 JSON object per direction, written as a
 * single compact line terminated by one LF. The request is written once
 * to stdin, which is then closed; the response is the whole of stdout.
 * Anything else on stdout fails closed. stderr is diagnostic only.
 */
export const DECISION_ADAPTER_FRAMING = "json-line-v1" as const;

export interface DecisionAdapterInput {
  readonly contract: "decision_adapter_input";
  readonly protocol: typeof DECISION_ADAPTER_PROTOCOL;
  readonly protocol_version: string;
  readonly execution_id: string;
  /** The exact AI-140 typed decision request. */
  readonly request: TypedDecisionRequest;
  /** AI-140 `computeTypedDecisionRequestHash(request)`. */
  readonly request_hash: string;
}

export interface DecisionAdapterOutput {
  readonly contract: "decision_adapter_output";
  readonly protocol: typeof DECISION_ADAPTER_PROTOCOL;
  readonly protocol_version: string;
  readonly execution_id: string;
  readonly request_hash: string;
  /** The exact AI-140 typed decision result. */
  readonly result: TypedDecisionResult;
  /** Must equal `result.result_hash` and its AI-140 recomputation. */
  readonly result_hash: string;
}

// ---------------------------------------------------------------------
// Execution subject
// ---------------------------------------------------------------------

/**
 * Subject kinds recognised by the sandbox. Only
 * `synthetic_fixture_adapter` is executable. `registered_decision_candidate`
 * is recognised solely so that an attempt to execute an AI-142 registered
 * candidate is refused explicitly, before process creation.
 */
export const DECISION_SANDBOX_SUBJECT_KINDS = [
  "synthetic_fixture_adapter",
  "registered_decision_candidate",
] as const;
export type DecisionSandboxSubjectKind =
  (typeof DECISION_SANDBOX_SUBJECT_KINDS)[number];

export const DECISION_SANDBOX_EXECUTABLE_SUBJECT_KINDS = [
  "synthetic_fixture_adapter",
] as const;

/** A repository-owned synthetic fixture adapter, bound by exact hash. */
export interface DecisionSandboxFixtureSubject {
  readonly subject_kind: "synthetic_fixture_adapter";
  readonly adapter_id: string;
  readonly adapter_version: string;
  readonly artifact_sha256: string;
  readonly protocol_version: string;
}

/**
 * The shape a future, separately reviewed contract may use to bind a
 * registered candidate. AI-143 refuses every such subject.
 */
export interface DecisionSandboxRegisteredCandidateSubject {
  readonly subject_kind: "registered_decision_candidate";
  readonly candidate_id: string;
  readonly evidence_revision: number;
  readonly candidate_hash: string;
}

export type DecisionSandboxSubject =
  | DecisionSandboxFixtureSubject
  | DecisionSandboxRegisteredCandidateSubject;

/**
 * An allowlisted fixture adapter. `artifact_path` is a repository-relative
 * constant; it never comes from a request. The executor re-hashes these
 * bytes before process creation and executes only the verified bytes.
 */
export interface DecisionSandboxFixtureAdapter {
  readonly adapter_id: string;
  readonly adapter_version: string;
  readonly subject_kind: "synthetic_fixture_adapter";
  readonly artifact_path: string;
  readonly artifact_sha256: string;
  readonly protocol_version: typeof DECISION_ADAPTER_PROTOCOL_VERSION;
  readonly result_origin: "synthetic_fixture";
}

/** The single repository-owned synthetic fixture adapter admitted by AI-143. */
export const DECISION_SANDBOX_FIXTURE_ADAPTER: DecisionSandboxFixtureAdapter =
  Object.freeze({
    adapter_id: "ai-lab-synthetic-decision-fixture-adapter",
    adapter_version: "1.0.0",
    subject_kind: "synthetic_fixture_adapter",
    artifact_path:
      "src/decision-sandbox/fixture/synthetic-decision-adapter.mjs",
    artifact_sha256:
      "9fbc93fefa4d65d762424b8b3ccc4bf9da981f3c4561795720ee47fb5767a3c5",
    protocol_version: DECISION_ADAPTER_PROTOCOL_VERSION,
    result_origin: "synthetic_fixture",
  });

/** Closed allowlist. Extending it is a reviewed code change, never input. */
export const DECISION_SANDBOX_FIXTURE_ADAPTERS: readonly DecisionSandboxFixtureAdapter[] =
  Object.freeze([DECISION_SANDBOX_FIXTURE_ADAPTER]);

// ---------------------------------------------------------------------
// Sandbox policy
// ---------------------------------------------------------------------

/** Controls AI-143 actually enforces for the fixture runner. */
export const DECISION_SANDBOX_ENFORCED_CONTROLS = [
  "bounded_stderr",
  "bounded_stdin",
  "bounded_stdout",
  "empty_environment",
  "ephemeral_working_directory",
  "exact_artifact_hash",
  "fixed_arguments",
  "no_automatic_retry",
  "no_shell",
  "node_permission_model_guard",
  "single_child_process",
  "single_request_per_process",
  "timeout_kill",
] as const;
export type DecisionSandboxEnforcedControl =
  (typeof DECISION_SANDBOX_ENFORCED_CONTROLS)[number];

/** Properties AI-143 explicitly does not establish. */
export const DECISION_SANDBOX_UNESTABLISHED_PROPERTIES = [
  "gpu_isolation",
  "hostile_code_containment",
  "interpreter_hash_binding",
  "model_supply_chain_safety",
  "os_filesystem_namespace",
  "os_network_namespace",
  "resource_quota_enforcement",
] as const;
export type DecisionSandboxUnestablishedProperty =
  (typeof DECISION_SANDBOX_UNESTABLISHED_PROPERTIES)[number];

/**
 * Hard ceilings. The fixed policy sits at or below them; no
 * configuration, request or profile can raise them, and there is no
 * "unlimited" value.
 */
export const DECISION_SANDBOX_LIMIT_CEILINGS = {
  max_input_bytes: 65_536,
  max_stdout_bytes: 65_536,
  max_stderr_bytes: 8_192,
  timeout_ms: 10_000,
  max_processes: 1,
} as const;

export interface DecisionSandboxPolicy {
  readonly contract: "decision_sandbox_policy";
  readonly schema_version: string;
  readonly policy_id: string;
  readonly policy_version: string;
  readonly protocol: typeof DECISION_ADAPTER_PROTOCOL;
  readonly protocol_version: string;
  readonly framing: typeof DECISION_ADAPTER_FRAMING;
  readonly executable_subject_kind: "synthetic_fixture_adapter";
  readonly max_input_bytes: number;
  readonly max_stdout_bytes: number;
  readonly max_stderr_bytes: number;
  readonly timeout_ms: number;
  readonly max_processes: 1;
  readonly automatic_retries: 0;
  readonly fallback: "none";
  /** Not established: no reviewed OS-level network sandbox exists. */
  readonly network_claim: "not_established";
  /** Not established: no reviewed OS-level filesystem sandbox exists. */
  readonly filesystem_claim: "not_established";
  readonly hostile_code_containment: "not_established";
  /** Strictly ascending. */
  readonly enforced_controls: readonly DecisionSandboxEnforcedControl[];
  /** Strictly ascending. */
  readonly unestablished_properties: readonly DecisionSandboxUnestablishedProperty[];
  readonly output_authority: "none";
  readonly policy_hash: string;
}

/** The one fixed fixture policy, without its self-hash. */
export const DECISION_SANDBOX_FIXTURE_POLICY_BODY: Omit<
  DecisionSandboxPolicy,
  "policy_hash"
> = Object.freeze({
  contract: "decision_sandbox_policy",
  schema_version: DECISION_SANDBOX_CONTRACT_VERSION,
  policy_id: "ai-lab-decision-sandbox-fixture-policy",
  policy_version: "1.0.0",
  protocol: DECISION_ADAPTER_PROTOCOL,
  protocol_version: DECISION_ADAPTER_PROTOCOL_VERSION,
  framing: DECISION_ADAPTER_FRAMING,
  executable_subject_kind: "synthetic_fixture_adapter",
  max_input_bytes: 65_536,
  max_stdout_bytes: 65_536,
  max_stderr_bytes: 4_096,
  timeout_ms: 3_000,
  max_processes: 1,
  automatic_retries: 0,
  fallback: "none",
  network_claim: "not_established",
  filesystem_claim: "not_established",
  hostile_code_containment: "not_established",
  enforced_controls: Object.freeze([...DECISION_SANDBOX_ENFORCED_CONTROLS]),
  unestablished_properties: Object.freeze([
    ...DECISION_SANDBOX_UNESTABLISHED_PROPERTIES,
  ]),
  output_authority: "none",
});

/**
 * Pinned hash of the fixed fixture policy. A test proves it equals the
 * recomputation; changing the policy is a reviewed code change.
 */
export const DECISION_SANDBOX_FIXTURE_POLICY_HASH =
  "6bad0bd18d779acb838ecf37e561d1678b13f0b53649acf40810972b03bc8378" as const;

/** The one fixed fixture policy. There is no other profile. */
export const DECISION_SANDBOX_FIXTURE_POLICY: DecisionSandboxPolicy =
  Object.freeze({
    ...DECISION_SANDBOX_FIXTURE_POLICY_BODY,
    policy_hash: DECISION_SANDBOX_FIXTURE_POLICY_HASH,
  });

// ---------------------------------------------------------------------
// Execution request
// ---------------------------------------------------------------------

export interface DecisionSandboxPolicyBinding {
  readonly policy_id: string;
  readonly policy_version: string;
  readonly policy_hash: string;
}

export interface DecisionSandboxExecutionRequest {
  readonly contract: "decision_sandbox_execution_request";
  readonly schema_version: string;
  readonly execution_id: string;
  readonly policy: DecisionSandboxPolicyBinding;
  readonly subject: DecisionSandboxFixtureSubject;
  /** The exact AI-140 typed decision request. */
  readonly request: TypedDecisionRequest;
  readonly request_hash: string;
  readonly output_authority: "none";
}

// ---------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------

export const DECISION_SANDBOX_PREFLIGHT_OUTCOMES = [
  "blocked",
  "eligible_for_fixture_execution",
] as const;
export type DecisionSandboxPreflightOutcome =
  (typeof DECISION_SANDBOX_PREFLIGHT_OUTCOMES)[number];

// ---------------------------------------------------------------------
// Execution record
// ---------------------------------------------------------------------

export const DECISION_SANDBOX_EXECUTION_STATUSES = [
  "succeeded",
  "blocked",
  "timed_out",
  "process_failed",
  "protocol_failed",
  "output_limit_exceeded",
] as const;
export type DecisionSandboxExecutionStatus =
  (typeof DECISION_SANDBOX_EXECUTION_STATUSES)[number];

export const DECISION_SANDBOX_TERMINATIONS = [
  "none",
  "timeout",
  "output_limit",
] as const;
export type DecisionSandboxTermination =
  (typeof DECISION_SANDBOX_TERMINATIONS)[number];

export interface DecisionSandboxProcessOutcome {
  readonly started: boolean;
  readonly exit_code: number | null;
  readonly signal: string | null;
  readonly terminated_by_runtime: DecisionSandboxTermination;
}

export interface DecisionSandboxAdapterBinding {
  readonly adapter_id: string;
  readonly adapter_version: string;
  readonly artifact_sha256: string;
}

/**
 * Operational observations. Excluded from `semantic_execution_hash`
 * (duration and observed byte counts vary between machines and never
 * carry decision semantics) but bound by `execution_record_hash`, so they
 * cannot be altered after execution without detection.
 *
 * For each stream, `*_sha256` is the streaming SHA-256 of exactly the
 * `*_bytes` bytes the runtime observed before it terminated the child;
 * bytes arriving after termination are ignored by both the counter and
 * the hash. Neither stdout nor stderr content is persisted.
 */
export interface DecisionSandboxTelemetry {
  readonly duration_ms: number;
  readonly stdout_bytes: number;
  readonly stdout_sha256: string;
  readonly stderr_bytes: number;
  readonly stderr_sha256: string;
}

export interface DecisionSandboxExecutionRecord {
  readonly contract: "decision_sandbox_execution_record";
  readonly schema_version: string;
  /** `null` only when the submitted execution request had no valid id. */
  readonly execution_id: string | null;
  readonly sandbox_policy: DecisionSandboxPolicyBinding;
  /** Present only when the allowlisted fixture adapter was bound. */
  readonly adapter: DecisionSandboxAdapterBinding | null;
  /** Present only when the submitted typed decision request was valid. */
  readonly request_hash: string | null;
  readonly status: DecisionSandboxExecutionStatus;
  readonly preflight_outcome: DecisionSandboxPreflightOutcome;
  readonly process_outcome: DecisionSandboxProcessOutcome;
  /** Envelope hash of the accepted adapter output, or `null`. */
  readonly protocol_result_hash: string | null;
  /** AI-140 result hash of the accepted typed decision result, or `null`. */
  readonly typed_result_hash: string | null;
  /** Closed machine codes, strictly ascending; never authoritative. */
  readonly diagnostics: readonly string[];
  readonly output_authority: "none";
  readonly downstream_allowed: false;
  readonly telemetry: DecisionSandboxTelemetry;
  /**
   * Deterministic identity of the semantic execution outcome: every field
   * except `telemetry`, `semantic_execution_hash` and
   * `execution_record_hash`. Stable across clocks and machines.
   */
  readonly semantic_execution_hash: string;
  /**
   * Tamper-evident hash of the complete persisted record, including
   * `telemetry` and `semantic_execution_hash`; excludes only itself.
   */
  readonly execution_record_hash: string;
}

export const DECISION_SANDBOX_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,127}$/;
export const DECISION_SANDBOX_HASH_PATTERN = /^[a-f0-9]{64}$/;
/** SHA-256 of zero bytes: the telemetry hash of a stream with no output. */
export const DECISION_SANDBOX_EMPTY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" as const;
export const DECISION_SANDBOX_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

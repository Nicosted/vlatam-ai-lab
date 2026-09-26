/**
 * AI-143 — pure, fail-closed decision sandbox preflight.
 *
 * Preflight decides, before any process exists, whether a submitted
 * execution request binds exactly the fixed fixture policy, the adapter
 * protocol version, one allowlisted repository-owned synthetic fixture
 * adapter by exact artifact hash, and one valid AI-140 typed decision
 * request by exact request hash, with no output authority.
 *
 * Outcomes are `blocked` or `eligible_for_fixture_execution`. Eligibility
 * is not approval and grants no authority over the output; it only means
 * the fixture runner may start one process for this exact binding.
 *
 * The bound adapter must also support the request: its decision type
 * must be one the allowlisted adapter declares and a choice/ranking
 * candidate set may not exceed the adapter's bound (AI-144). Otherwise
 * preflight blocks before any process exists.
 *
 * An AI-142 registered candidate is never executable here: a
 * `registered_decision_candidate` subject, any candidate binding field,
 * or a candidate identifier used as an adapter id is blocked with
 * `registered_candidate_execution_forbidden`.
 *
 * Preflight executes nothing and reads no clock, environment, filesystem,
 * network or process.
 */

import { computeTypedDecisionRequestHash } from "../decision/canonical.js";
import type { TypedDecisionRequest } from "../decision/contracts.js";
import { validateTypedDecisionRequest } from "../decision/validation.js";
import { DECISION_CANDIDATE_ID_PATTERN } from "../decision-candidates/contracts.js";
import {
  DECISION_SANDBOX_FIXTURE_ADAPTERS,
  DECISION_SANDBOX_FIXTURE_POLICY,
  DECISION_SANDBOX_SUBJECT_KINDS,
  type DecisionSandboxFixtureAdapter,
  type DecisionSandboxPolicy,
  type DecisionSandboxPreflightOutcome,
} from "./contracts.js";
import {
  buildDecisionAdapterInput,
  encodeDecisionAdapterFrame,
} from "./protocol.js";
import {
  DecisionSandboxIssueCollector,
  checkClosed,
  checkFieldNames,
  checkProtocolVersion,
  checkSchemaVersion,
  isSandboxHash,
  isSandboxId,
  sortIssues,
  validateDecisionSandboxPolicy,
  type DecisionSandboxIssue,
} from "./validation.js";

export interface DecisionSandboxPreflight {
  readonly outcome: DecisionSandboxPreflightOutcome;
  /** Deterministically ordered; empty iff eligible. */
  readonly issues: readonly DecisionSandboxIssue[];
  /** The submitted execution id when it is well-formed, else `null`. */
  readonly execution_id: string | null;
  /** The fixed sandbox policy that was evaluated. */
  readonly policy: DecisionSandboxPolicy;
  /** The allowlisted fixture adapter, when exactly bound. */
  readonly adapter: DecisionSandboxFixtureAdapter | null;
  /** The AI-140 request, when valid. */
  readonly request: TypedDecisionRequest | null;
  /** The recomputed AI-140 request hash, when the request is valid. */
  readonly request_hash: string | null;
  /** Always `none`: eligibility never grants output authority. */
  readonly output_authority: "none";
}

const EXECUTION_REQUEST_KEYS = [
  "contract",
  "schema_version",
  "execution_id",
  "policy",
  "subject",
  "request",
  "request_hash",
  "output_authority",
] as const;

const POLICY_BINDING_KEYS = [
  "policy_id",
  "policy_version",
  "policy_hash",
] as const;

const FIXTURE_SUBJECT_KEYS = [
  "subject_kind",
  "adapter_id",
  "adapter_version",
  "artifact_sha256",
  "protocol_version",
] as const;

const CANDIDATE_BINDING_KEYS = [
  "candidate_id",
  "candidate_hash",
  "evidence_revision",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkSubject(
  subject: unknown,
  c: DecisionSandboxIssueCollector,
): DecisionSandboxFixtureAdapter | null {
  const at = "execution.subject";
  if (!isRecord(subject)) {
    c.add("subject_invalid", at);
    return null;
  }
  const kind = subject["subject_kind"];
  if (
    typeof kind !== "string" ||
    !(DECISION_SANDBOX_SUBJECT_KINDS as readonly string[]).includes(kind)
  ) {
    c.add("subject_kind_invalid", `${at}.subject_kind`);
    return null;
  }
  const namesCandidate = CANDIDATE_BINDING_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(subject, key),
  );
  if (kind === "registered_decision_candidate" || namesCandidate) {
    // Recognised only to be refused: AI-143 holds no authority to execute
    // any registered candidate, whatever its registry state.
    c.add("registered_candidate_execution_forbidden", at);
    return null;
  }
  checkClosed(subject, FIXTURE_SUBJECT_KEYS, at, c);
  const adapterId = subject["adapter_id"];
  if (
    typeof adapterId === "string" &&
    DECISION_CANDIDATE_ID_PATTERN.test(adapterId)
  ) {
    c.add("registered_candidate_execution_forbidden", `${at}.adapter_id`);
    return null;
  }
  if (!isSandboxId(adapterId)) {
    c.add("identifier_invalid", `${at}.adapter_id`);
    return null;
  }
  const adapter = DECISION_SANDBOX_FIXTURE_ADAPTERS.find(
    (entry) => entry.adapter_id === adapterId,
  );
  if (adapter === undefined) {
    c.add("adapter_unknown", `${at}.adapter_id`);
    return null;
  }
  let exact = true;
  if (subject["adapter_version"] !== adapter.adapter_version) {
    c.add("adapter_version_mismatch", `${at}.adapter_version`);
    exact = false;
  }
  if (
    !isSandboxHash(subject["artifact_sha256"]) ||
    subject["artifact_sha256"] !== adapter.artifact_sha256
  ) {
    c.add("adapter_hash_mismatch", `${at}.artifact_sha256`);
    exact = false;
  }
  checkProtocolVersion(
    subject["protocol_version"],
    `${at}.protocol_version`,
    c,
  );
  if (subject["protocol_version"] !== adapter.protocol_version) exact = false;
  return exact ? adapter : null;
}

/** Blocks a request the bound adapter does not declare support for. */
function checkAdapterRequestSupport(
  adapter: DecisionSandboxFixtureAdapter,
  request: TypedDecisionRequest,
  c: DecisionSandboxIssueCollector,
): void {
  if (!adapter.supported_decision_types.includes(request.decision_type))
    c.add(
      "adapter_decision_type_unsupported",
      "execution.request.decision_type",
    );
  const domain = request.output_domain;
  if (
    (domain.kind === "choice" || domain.kind === "ranking") &&
    domain.candidates.length > adapter.max_candidates
  )
    c.add(
      "adapter_candidate_limit_exceeded",
      "execution.request.output_domain.candidates",
    );
}

/**
 * Evaluates one submitted execution request against the fixed fixture
 * policy. Pure and fail-closed: any defect blocks.
 */
export function evaluateDecisionSandboxPreflight(
  value: unknown,
): DecisionSandboxPreflight {
  const policy = DECISION_SANDBOX_FIXTURE_POLICY;
  const c = new DecisionSandboxIssueCollector();
  const blocked = (
    executionId: string | null,
    requestHash: string | null,
    extra: readonly DecisionSandboxIssue[] = [],
  ): DecisionSandboxPreflight => ({
    outcome: "blocked",
    issues: sortIssues([...c.issues, ...extra]),
    execution_id: executionId,
    policy,
    adapter: null,
    request: null,
    request_hash: requestHash,
    output_authority: "none",
  });

  const policyCheck = validateDecisionSandboxPolicy(policy);
  if (!policyCheck.ok) return blocked(null, null, policyCheck.issues);

  if (
    !isRecord(value) ||
    value["contract"] !== "decision_sandbox_execution_request"
  ) {
    c.add("contract_invalid", "execution");
    return blocked(null, null);
  }
  checkClosed(value, EXECUTION_REQUEST_KEYS, "execution", c);
  checkFieldNames(value, "execution", c, { controlAndAuthority: true });
  checkSchemaVersion(value["schema_version"], "execution.schema_version", c);
  const executionId = isSandboxId(value["execution_id"])
    ? value["execution_id"]
    : null;
  if (executionId === null)
    c.add("identifier_invalid", "execution.execution_id");

  const binding = value["policy"];
  if (!isRecord(binding)) c.add("policy_unsupported", "execution.policy");
  else {
    checkClosed(binding, POLICY_BINDING_KEYS, "execution.policy", c);
    if (
      binding["policy_id"] !== policy.policy_id ||
      binding["policy_version"] !== policy.policy_version
    )
      c.add("policy_unsupported", "execution.policy");
    if (binding["policy_hash"] !== policy.policy_hash)
      c.add("policy_hash_mismatch", "execution.policy.policy_hash");
  }

  const adapter = checkSubject(value["subject"], c);

  const requestCheck = validateTypedDecisionRequest(value["request"]);
  let requestHash: string | null = null;
  if (!requestCheck.ok) c.add("typed_request_invalid", "execution.request");
  else {
    requestHash = computeTypedDecisionRequestHash(requestCheck.value);
    if (value["request_hash"] !== requestHash)
      c.add("request_hash_mismatch", "execution.request_hash");
  }

  if (value["output_authority"] !== "none")
    c.add("output_authority_invalid", "execution.output_authority");

  if (adapter !== null && requestCheck.ok)
    checkAdapterRequestSupport(adapter, requestCheck.value, c);

  if (requestCheck.ok && executionId !== null) {
    const frame = encodeDecisionAdapterFrame(
      buildDecisionAdapterInput(executionId, requestCheck.value),
    );
    if (frame.byteLength > policy.max_input_bytes)
      c.add("input_limit_exceeded", "execution.request");
  }

  if (c.issues.length > 0 || adapter === null || !requestCheck.ok) {
    if (c.issues.length === 0) c.add("subject_invalid", "execution.subject");
    return blocked(executionId, requestHash);
  }
  return {
    outcome: "eligible_for_fixture_execution",
    issues: [],
    execution_id: executionId,
    policy,
    adapter,
    request: requestCheck.value,
    request_hash: requestHash,
    output_authority: "none",
  };
}

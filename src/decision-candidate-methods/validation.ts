/**
 * AI-144 — pure, fail-closed validators for the SemIf direct-logit method
 * adapter specification, synthetic logit fixtures and evidence pack.
 *
 * Rules:
 *  - Validators are pure. They never throw, log, coerce, normalize or
 *    repair a value, and never read the clock, the environment, the
 *    filesystem, the network or any child process or runtime.
 *  - Every object is closed: unknown properties fail.
 *  - Issues use a closed vocabulary of stable machine codes.
 *  - The candidate binding is exact: `candidate_id`, `candidate_hash` and
 *    `evidence_revision` together. A drifted AI-142 entry makes the
 *    specification stale; the candidate id alone is never followed.
 *  - A structurally valid artifact never grants authority.
 */

import { findForbiddenFieldPaths } from "../capabilities/validation.js";
import {
  computeTypedDecisionRequestHash,
  computeTypedDecisionSemanticRequestHash,
} from "../decision/canonical.js";
import type { TypedDecisionRequest } from "../decision/contracts.js";
import {
  PRIVATE_REASONING_FIELD_NAMES,
  validateTypedDecisionRequest,
} from "../decision/validation.js";
import { DECISION_CANDIDATE_ID_PATTERN } from "../decision-candidates/contracts.js";
import {
  computeCandidateAdapterEvidencePackHash,
  computeCandidateAdapterSpecHash,
  computeSyntheticLogitFixtureHash,
} from "./canonical.js";
import {
  CANDIDATE_METHOD_GIT_SHA_PATTERN,
  CANDIDATE_METHOD_ID_PATTERN,
  CANDIDATE_METHOD_INTERPRETATION_DISPOSITIONS,
  CANDIDATE_METHOD_INTERPRETATION_TOPICS,
  CANDIDATE_METHOD_MAX_EVIDENCE,
  CANDIDATE_METHOD_MAX_STATEMENT_LENGTH,
  CANDIDATE_METHOD_REVIEW_STATES,
  CANDIDATE_METHOD_SHA256_PATTERN,
  CANDIDATE_METHOD_UPSTREAM_PATH_PATTERN,
  CANDIDATE_METHOD_VERSION_PATTERN,
  DIRECT_LOGIT_METHOD_LIMITS,
  DIRECT_LOGIT_METHOD_PARAMETERS,
  DIRECT_LOGIT_SUPPORTED_DECISION_TYPES,
  DIRECT_LOGIT_UNSUPPORTED_DECISION_TYPES,
  SEMIF_CANDIDATE_BINDING,
  SEMIF_METHODOLOGY_UPSTREAM,
  SUPPORTED_CANDIDATE_METHOD_CONTRACT_MAJORS,
  SYNTHETIC_LOGIT_FIXTURE_LIMITS,
  type CandidateAdapterEvidencePack,
  type CandidateAdapterSpec,
  type CandidateMethodInterpretationDisposition,
  type CandidateMethodInterpretationTopic,
  type SyntheticLogitFixture,
} from "./contracts.js";
import {
  checkCandidateAdapterBinding,
  evaluateCandidateExecutionReadiness,
} from "./readiness.js";

export const CANDIDATE_METHOD_ISSUE_CODES = [
  // Shape
  "contract_invalid",
  "unknown_property",
  "missing_property",
  "schema_version_invalid",
  "schema_version_unsupported",
  "identifier_invalid",
  "version_invalid",
  "forbidden_field",
  "private_reasoning_forbidden",
  // Candidate binding
  "candidate_binding_invalid",
  "candidate_binding_unsupported",
  "candidate_binding_stale",
  "candidate_entry_invalid",
  // Methodology evidence
  "upstream_binding_invalid",
  "evidence_invalid",
  "evidence_duplicate",
  "evidence_order_invalid",
  "evidence_conflicts_with_candidate_entry",
  "evidence_ref_unknown",
  "interpretation_invalid",
  "interpretation_incomplete",
  "interpretation_disposition_invalid",
  // Implementation and method
  "implementation_invalid",
  "method_parameters_invalid",
  "decision_types_invalid",
  "calibration_claim_forbidden",
  "result_origin_invalid",
  "authority_forbidden",
  "adapter_spec_hash_mismatch",
  // Synthetic logits
  "fixture_provenance_invalid",
  "request_binding_invalid",
  "logit_invalid",
  "logit_duplicate",
  "logit_order_invalid",
  "logit_count_invalid",
  "fixture_hash_mismatch",
  // Fixture against request
  "typed_request_invalid",
  "request_not_bound",
  "semantic_request_hash_mismatch",
  "capability_mismatch",
  "decision_type_unsupported",
  "logit_missing",
  "logit_unknown_candidate",
  // Evidence pack
  "adapter_spec_binding_mismatch",
  "methodology_evidence_mismatch",
  "method_artifact_mismatch",
  "fixture_binding_invalid",
  "fixture_set_mismatch",
  "sandbox_policy_invalid",
  "readiness_invalid",
  "readiness_mismatch",
  "execution_fact_invalid",
  "review_state_invalid",
  "evidence_pack_hash_mismatch",
] as const;
export type CandidateMethodIssueCode =
  (typeof CANDIDATE_METHOD_ISSUE_CODES)[number];

export interface CandidateMethodIssue {
  readonly code: CandidateMethodIssueCode;
  readonly path: string;
}

export type CandidateMethodValidation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly CandidateMethodIssue[] };

type Record_ = Record<string, unknown>;

function isRecord(value: unknown): value is Record_ {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class Collector {
  readonly issues: CandidateMethodIssue[] = [];
  add(code: CandidateMethodIssueCode, path: string): void {
    this.issues.push({ code, path });
  }
  result<T>(value: T): CandidateMethodValidation<T> {
    if (this.issues.length === 0) return { ok: true, value };
    return { ok: false, issues: sortCandidateMethodIssues(this.issues) };
  }
}

/** Deduplicated, deterministically ordered issues. */
export function sortCandidateMethodIssues(
  issues: readonly CandidateMethodIssue[],
): CandidateMethodIssue[] {
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

function closed(
  value: Record_,
  keys: readonly string[],
  path: string,
  c: Collector,
): void {
  for (const key of Object.keys(value))
    if (!keys.includes(key)) c.add("unknown_property", `${path}.${key}`);
  for (const key of keys)
    if (!Object.prototype.hasOwnProperty.call(value, key))
      c.add("missing_property", `${path}.${key}`);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && CANDIDATE_METHOD_ID_PATTERN.test(value);
}

function isSha256(value: unknown): value is string {
  return (
    typeof value === "string" && CANDIDATE_METHOD_SHA256_PATTERN.test(value)
  );
}

function isGitSha(value: unknown): value is string {
  return (
    typeof value === "string" && CANDIDATE_METHOD_GIT_SHA_PATTERN.test(value)
  );
}

function isVersion(value: unknown): value is string {
  return (
    typeof value === "string" && CANDIDATE_METHOD_VERSION_PATTERN.test(value)
  );
}

function includes<T extends string>(
  list: readonly T[],
  value: unknown,
): value is T {
  return (
    typeof value === "string" && (list as readonly string[]).includes(value)
  );
}

function sameStrings(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    expected.every((item, index) => value[index] === item)
  );
}

function strictlyAscending(values: readonly string[]): boolean {
  return values.every(
    (item, index) => index === 0 || (values[index - 1] as string) < item,
  );
}

function checkSchemaVersion(value: unknown, path: string, c: Collector): void {
  if (!isVersion(value)) {
    c.add("schema_version_invalid", path);
    return;
  }
  const major = Number(value.split(".")[0]);
  if (
    !(SUPPORTED_CANDIDATE_METHOD_CONTRACT_MAJORS as readonly number[]).includes(
      major,
    )
  )
    c.add("schema_version_unsupported", path);
}

/** Provider/credential names (AI-71 list) and private reasoning names. */
function checkFieldNames(value: unknown, root: string, c: Collector): void {
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
      if (PRIVATE_REASONING_FIELD_NAMES.has(key.toLowerCase()))
        c.add("private_reasoning_forbidden", `${path}.${key}`);
      walk(child, `${path}.${key}`, depth + 1);
    }
  };
  walk(value, root, 0);
}

const BINDING_KEYS = [
  "candidate_id",
  "candidate_hash",
  "evidence_revision",
] as const;

/**
 * Validates a candidate binding shape and that it is exactly the one
 * AI-142 SemIf evidence revision AI-144 was reviewed against.
 */
function checkCandidateBinding(
  value: unknown,
  path: string,
  c: Collector,
): void {
  if (!isRecord(value)) {
    c.add("candidate_binding_invalid", path);
    return;
  }
  closed(value, BINDING_KEYS, path, c);
  const id = value["candidate_id"];
  const hash = value["candidate_hash"];
  const revision = value["evidence_revision"];
  if (
    typeof id !== "string" ||
    !DECISION_CANDIDATE_ID_PATTERN.test(id) ||
    !isSha256(hash) ||
    typeof revision !== "number" ||
    !Number.isSafeInteger(revision) ||
    revision < 1
  ) {
    c.add("candidate_binding_invalid", path);
    return;
  }
  if (
    id !== SEMIF_CANDIDATE_BINDING.candidate_id ||
    hash !== SEMIF_CANDIDATE_BINDING.candidate_hash ||
    revision !== SEMIF_CANDIDATE_BINDING.evidence_revision
  )
    c.add("candidate_binding_unsupported", path);
}

// ---------------------------------------------------------------------
// Candidate adapter specification
// ---------------------------------------------------------------------

const SPEC_KEYS = [
  "contract",
  "schema_version",
  "adapter_spec_id",
  "adapter_spec_version",
  "candidate_binding",
  "methodology",
  "implementation",
  "method",
  "supported_decision_types",
  "unsupported_decision_types",
  "probability_semantics",
  "calibration_state",
  "confidence_semantics",
  "execution_mode",
  "result_origin",
  "authority",
  "benchmark_eligible",
  "promotion_eligible",
  "production_eligible",
  "adapter_spec_hash",
] as const;

const METHODOLOGY_KEYS = [
  "upstream_repository",
  "upstream_commit",
  "evidence",
  "interpretations",
] as const;
const EVIDENCE_KEYS = [
  "evidence_id",
  "path",
  "blob_sha",
  "content_sha256",
] as const;
const INTERPRETATION_KEYS = [
  "topic",
  "disposition",
  "statement",
  "evidence_refs",
] as const;
const IMPLEMENTATION_KEYS = [
  "ownership",
  "implementation_kind",
  "upstream_code_reused",
  "sandbox_subject_kind",
  "adapter_id",
  "adapter_version",
  "artifact_path",
  "artifact_sha256",
] as const;

/**
 * The disposition every topic must carry. Pinned so that a specification
 * cannot silently upgrade an unsupported, unapplied or fail-closed topic
 * (for example claim calibration or boolean support).
 */
export const CANDIDATE_METHOD_REQUIRED_DISPOSITIONS: Readonly<
  Record<
    CandidateMethodInterpretationTopic,
    CandidateMethodInterpretationDisposition
  >
> = Object.freeze({
  boolean_decisions: "not_supported",
  calibration: "not_applied",
  logit_source: "replaced_by_synthetic",
  normalization: "adopted",
  option_construction: "adopted",
  option_ordering: "ai_lab_policy",
  probability_representation: "ai_lab_policy",
  prompt_construction: "not_applicable",
  score_and_ranking_decisions: "not_supported",
  selection: "adopted",
  top_logit_tie: "fail_closed",
});

/**
 * The executable artifact is a repository-owned fixture module under
 * `src/`. Its exact path, version and SHA-256 are cross-checked against
 * the AI-143 allowlist by tests; this layer never imports the sandbox.
 */
const ARTIFACT_PATH_PATTERN =
  /^src\/[a-z0-9-]{1,64}\/fixture\/[a-z0-9][a-z0-9-]{0,96}\.mjs$/;

function checkMethodology(value: unknown, c: Collector): ReadonlySet<string> {
  const at = "spec.methodology";
  const ids = new Set<string>();
  if (!isRecord(value)) {
    c.add("upstream_binding_invalid", at);
    return ids;
  }
  closed(value, METHODOLOGY_KEYS, at, c);
  if (
    value["upstream_repository"] !== SEMIF_METHODOLOGY_UPSTREAM.repository ||
    !isGitSha(value["upstream_commit"]) ||
    value["upstream_commit"] !== SEMIF_METHODOLOGY_UPSTREAM.commit_sha
  )
    c.add("upstream_binding_invalid", at);

  const evidence = value["evidence"];
  if (
    !Array.isArray(evidence) ||
    evidence.length === 0 ||
    evidence.length > CANDIDATE_METHOD_MAX_EVIDENCE
  )
    c.add("evidence_invalid", `${at}.evidence`);
  else {
    const order: string[] = [];
    const paths = new Set<string>();
    evidence.forEach((item, index) => {
      const path = `${at}.evidence[${index}]`;
      if (!isRecord(item)) {
        c.add("evidence_invalid", path);
        return;
      }
      closed(item, EVIDENCE_KEYS, path, c);
      const id = item["evidence_id"];
      if (!isId(id)) {
        c.add("evidence_invalid", `${path}.evidence_id`);
        return;
      }
      if (ids.has(id)) c.add("evidence_duplicate", path);
      ids.add(id);
      order.push(id);
      if (
        typeof item["path"] !== "string" ||
        !CANDIDATE_METHOD_UPSTREAM_PATH_PATTERN.test(item["path"]) ||
        !isGitSha(item["blob_sha"]) ||
        !isSha256(item["content_sha256"])
      ) {
        c.add("evidence_invalid", path);
        return;
      }
      if (paths.has(item["path"])) c.add("evidence_duplicate", path);
      paths.add(item["path"]);
    });
    if (!strictlyAscending(order))
      c.add("evidence_order_invalid", `${at}.evidence`);
  }

  const interpretations = value["interpretations"];
  if (!Array.isArray(interpretations)) {
    c.add("interpretation_invalid", `${at}.interpretations`);
    return ids;
  }
  const topics: string[] = [];
  interpretations.forEach((item, index) => {
    const path = `${at}.interpretations[${index}]`;
    if (!isRecord(item)) {
      c.add("interpretation_invalid", path);
      return;
    }
    closed(item, INTERPRETATION_KEYS, path, c);
    const topic = item["topic"];
    const statement = item["statement"];
    if (
      !includes(CANDIDATE_METHOD_INTERPRETATION_TOPICS, topic) ||
      !includes(
        CANDIDATE_METHOD_INTERPRETATION_DISPOSITIONS,
        item["disposition"],
      ) ||
      typeof statement !== "string" ||
      statement.trim().length === 0 ||
      statement.length > CANDIDATE_METHOD_MAX_STATEMENT_LENGTH
    ) {
      c.add("interpretation_invalid", path);
      return;
    }
    topics.push(topic);
    if (item["disposition"] !== CANDIDATE_METHOD_REQUIRED_DISPOSITIONS[topic])
      c.add("interpretation_disposition_invalid", `${path}.disposition`);
    const refs = item["evidence_refs"];
    if (
      !Array.isArray(refs) ||
      refs.length === 0 ||
      !refs.every((ref): ref is string => typeof ref === "string") ||
      !strictlyAscending(refs)
    )
      c.add("interpretation_invalid", `${path}.evidence_refs`);
    else
      refs.forEach((ref, refIndex) => {
        if (!ids.has(ref))
          c.add("evidence_ref_unknown", `${path}.evidence_refs[${refIndex}]`);
      });
  });
  if (!sameStrings(topics, CANDIDATE_METHOD_INTERPRETATION_TOPICS))
    c.add("interpretation_incomplete", `${at}.interpretations`);
  return ids;
}

function checkImplementation(value: unknown, c: Collector): void {
  const at = "spec.implementation";
  if (!isRecord(value)) {
    c.add("implementation_invalid", at);
    return;
  }
  closed(value, IMPLEMENTATION_KEYS, at, c);
  const adapterId = value["adapter_id"];
  if (
    value["ownership"] !== "ai_lab" ||
    value["implementation_kind"] !== "method_reimplementation" ||
    value["upstream_code_reused"] !== false ||
    value["sandbox_subject_kind"] !== "synthetic_fixture_adapter" ||
    !isId(adapterId) ||
    DECISION_CANDIDATE_ID_PATTERN.test(adapterId) ||
    !isVersion(value["adapter_version"]) ||
    typeof value["artifact_path"] !== "string" ||
    !ARTIFACT_PATH_PATTERN.test(value["artifact_path"]) ||
    !isSha256(value["artifact_sha256"])
  )
    c.add("implementation_invalid", at);
}

function checkMethodParameters(value: unknown, c: Collector): void {
  const at = "spec.method";
  if (!isRecord(value)) {
    c.add("method_parameters_invalid", at);
    return;
  }
  const expected = DIRECT_LOGIT_METHOD_PARAMETERS as unknown as Record_;
  closed(value, Object.keys(expected), at, c);
  for (const [key, item] of Object.entries(expected))
    if (value[key] !== item) c.add("method_parameters_invalid", `${at}.${key}`);
}

/**
 * Validates a candidate adapter specification on its own: closed shape,
 * the exact SemIf candidate binding, pinned upstream methodology evidence
 * and interpretations, AI-LAB implementation provenance, fixed method
 * parameters, narrow decision-type scope, no calibration, no authority,
 * and the self-hash.
 */
export function validateCandidateAdapterSpec(
  value: unknown,
): CandidateMethodValidation<CandidateAdapterSpec> {
  const c = new Collector();
  if (
    !isRecord(value) ||
    value["contract"] !== "typed_decision_candidate_adapter_spec"
  ) {
    c.add("contract_invalid", "spec");
    return c.result(value as unknown as CandidateAdapterSpec);
  }
  closed(value, SPEC_KEYS, "spec", c);
  checkFieldNames(value, "spec", c);
  checkSchemaVersion(value["schema_version"], "spec.schema_version", c);
  if (!isId(value["adapter_spec_id"]))
    c.add("identifier_invalid", "spec.adapter_spec_id");
  if (!isVersion(value["adapter_spec_version"]))
    c.add("version_invalid", "spec.adapter_spec_version");
  checkCandidateBinding(
    value["candidate_binding"],
    "spec.candidate_binding",
    c,
  );
  checkMethodology(value["methodology"], c);
  checkImplementation(value["implementation"], c);
  checkMethodParameters(value["method"], c);
  if (
    !sameStrings(
      value["supported_decision_types"],
      DIRECT_LOGIT_SUPPORTED_DECISION_TYPES,
    )
  )
    c.add("decision_types_invalid", "spec.supported_decision_types");
  if (
    !sameStrings(
      value["unsupported_decision_types"],
      DIRECT_LOGIT_UNSUPPORTED_DECISION_TYPES,
    )
  )
    c.add("decision_types_invalid", "spec.unsupported_decision_types");
  if (
    value["probability_semantics"] !==
    "conditional_on_declared_options_uncalibrated"
  )
    c.add("calibration_claim_forbidden", "spec.probability_semantics");
  if (value["calibration_state"] !== "not_applied")
    c.add("calibration_claim_forbidden", "spec.calibration_state");
  if (value["confidence_semantics"] !== "uncalibrated_candidate_reported")
    c.add("calibration_claim_forbidden", "spec.confidence_semantics");
  if (value["execution_mode"] !== "synthetic_logits_only")
    c.add("authority_forbidden", "spec.execution_mode");
  if (value["result_origin"] !== "synthetic_fixture")
    c.add("result_origin_invalid", "spec.result_origin");
  if (value["authority"] !== "none")
    c.add("authority_forbidden", "spec.authority");
  for (const key of [
    "benchmark_eligible",
    "promotion_eligible",
    "production_eligible",
  ] as const)
    if (value[key] !== false) c.add("authority_forbidden", `spec.${key}`);

  if (!isSha256(value["adapter_spec_hash"]))
    c.add("adapter_spec_hash_mismatch", "spec.adapter_spec_hash");
  else if (c.issues.length === 0) {
    let computed: string | null = null;
    try {
      computed = computeCandidateAdapterSpecHash(
        value as unknown as CandidateAdapterSpec,
      );
    } catch {
      computed = null;
    }
    if (computed !== value["adapter_spec_hash"])
      c.add("adapter_spec_hash_mismatch", "spec.adapter_spec_hash");
  }
  return c.result(value as unknown as CandidateAdapterSpec);
}

// ---------------------------------------------------------------------
// Synthetic logit fixture
// ---------------------------------------------------------------------

const FIXTURE_KEYS = [
  "contract",
  "schema_version",
  "fixture_id",
  "provenance",
  "model_output",
  "request_binding",
  "logit_unit",
  "candidate_logits",
  "fixture_hash",
] as const;
const FIXTURE_BINDING_KEYS = [
  "capability_id",
  "semantic_request_hash",
  "request_hashes",
] as const;
const CAPABILITY_ID_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const TYPED_CANDIDATE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,127}$/;

/**
 * Validates a synthetic logit fixture: closed shape, repository-owned
 * synthetic provenance (never a model output), exact request binding,
 * 2-16 integer micro-logits bound by unique, strictly ascending candidate
 * id within the method bound, and the self-hash. NaN, Infinity and
 * fractional numbers are not integers and fail.
 */
export function validateSyntheticLogitFixture(
  value: unknown,
): CandidateMethodValidation<SyntheticLogitFixture> {
  const c = new Collector();
  if (
    !isRecord(value) ||
    value["contract"] !== "typed_decision_synthetic_logit_fixture"
  ) {
    c.add("contract_invalid", "fixture");
    return c.result(value as unknown as SyntheticLogitFixture);
  }
  closed(value, FIXTURE_KEYS, "fixture", c);
  checkFieldNames(value, "fixture", c);
  checkSchemaVersion(value["schema_version"], "fixture.schema_version", c);
  if (!isId(value["fixture_id"]))
    c.add("identifier_invalid", "fixture.fixture_id");
  if (value["provenance"] !== "repository_owned_synthetic")
    c.add("fixture_provenance_invalid", "fixture.provenance");
  if (value["model_output"] !== false)
    c.add("fixture_provenance_invalid", "fixture.model_output");
  if (value["logit_unit"] !== "micro_logit")
    c.add("logit_invalid", "fixture.logit_unit");

  const binding = value["request_binding"];
  if (!isRecord(binding))
    c.add("request_binding_invalid", "fixture.request_binding");
  else {
    const at = "fixture.request_binding";
    closed(binding, FIXTURE_BINDING_KEYS, at, c);
    if (
      typeof binding["capability_id"] !== "string" ||
      !CAPABILITY_ID_PATTERN.test(binding["capability_id"])
    )
      c.add("request_binding_invalid", `${at}.capability_id`);
    if (!isSha256(binding["semantic_request_hash"]))
      c.add("request_binding_invalid", `${at}.semantic_request_hash`);
    const hashes = binding["request_hashes"];
    if (
      !Array.isArray(hashes) ||
      hashes.length === 0 ||
      hashes.length > SYNTHETIC_LOGIT_FIXTURE_LIMITS.max_request_hashes ||
      !hashes.every(isSha256) ||
      !strictlyAscending(hashes)
    )
      c.add("request_binding_invalid", `${at}.request_hashes`);
  }

  const logits = value["candidate_logits"];
  if (
    !Array.isArray(logits) ||
    logits.length < DIRECT_LOGIT_METHOD_LIMITS.min_candidates ||
    logits.length > DIRECT_LOGIT_METHOD_LIMITS.max_candidates
  )
    c.add("logit_count_invalid", "fixture.candidate_logits");
  if (Array.isArray(logits)) {
    const ids: string[] = [];
    const seen = new Set<string>();
    logits.forEach((item, index) => {
      const path = `fixture.candidate_logits[${index}]`;
      if (!isRecord(item)) {
        c.add("logit_invalid", path);
        return;
      }
      closed(item, ["candidate_id", "logit_micros"], path, c);
      const id = item["candidate_id"];
      const micros = item["logit_micros"];
      if (typeof id !== "string" || !TYPED_CANDIDATE_ID_PATTERN.test(id)) {
        c.add("identifier_invalid", `${path}.candidate_id`);
        return;
      }
      if (
        typeof micros !== "number" ||
        !Number.isSafeInteger(micros) ||
        Math.abs(micros) > DIRECT_LOGIT_METHOD_LIMITS.max_abs_logit_micros
      )
        c.add("logit_invalid", `${path}.logit_micros`);
      if (seen.has(id)) c.add("logit_duplicate", `${path}.candidate_id`);
      seen.add(id);
      ids.push(id);
    });
    if (!strictlyAscending(ids))
      c.add("logit_order_invalid", "fixture.candidate_logits");
  }

  if (!isSha256(value["fixture_hash"]))
    c.add("fixture_hash_mismatch", "fixture.fixture_hash");
  else if (c.issues.length === 0) {
    let computed: string | null = null;
    try {
      computed = computeSyntheticLogitFixtureHash(
        value as unknown as SyntheticLogitFixture,
      );
    } catch {
      computed = null;
    }
    if (computed !== value["fixture_hash"])
      c.add("fixture_hash_mismatch", "fixture.fixture_hash");
  }
  return c.result(value as unknown as SyntheticLogitFixture);
}

/**
 * Validates a fixture against the exact AI-140 request it is meant to
 * answer: the request hash is bound, the semantic request hash and
 * capability match, the decision type is supported, and the synthetic
 * logits cover exactly the declared candidate ids (none missing, none
 * unknown). Permuting the request's candidate order changes the request
 * hash but never the semantic hash or the logit binding.
 */
export function validateSyntheticLogitFixtureForRequest(
  fixtureValue: unknown,
  requestValue: unknown,
): CandidateMethodValidation<SyntheticLogitFixture> {
  const fixtureCheck = validateSyntheticLogitFixture(fixtureValue);
  const requestCheck = validateTypedDecisionRequest(requestValue);
  const c = new Collector();
  if (!requestCheck.ok) c.add("typed_request_invalid", "request");
  if (!fixtureCheck.ok || !requestCheck.ok)
    return {
      ok: false,
      issues: sortCandidateMethodIssues([
        ...(fixtureCheck.ok ? [] : fixtureCheck.issues),
        ...c.issues,
      ]),
    };
  const fixture = fixtureCheck.value;
  const request: TypedDecisionRequest = requestCheck.value;
  const binding = fixture.request_binding;
  if (
    !binding.request_hashes.includes(computeTypedDecisionRequestHash(request))
  )
    c.add("request_not_bound", "fixture.request_binding.request_hashes");
  if (
    binding.semantic_request_hash !==
    computeTypedDecisionSemanticRequestHash(request)
  )
    c.add(
      "semantic_request_hash_mismatch",
      "fixture.request_binding.semantic_request_hash",
    );
  if (binding.capability_id !== request.capability_id)
    c.add("capability_mismatch", "fixture.request_binding.capability_id");
  const domain = request.output_domain;
  if (
    !includes(DIRECT_LOGIT_SUPPORTED_DECISION_TYPES, request.decision_type) ||
    domain.kind !== "choice"
  ) {
    c.add("decision_type_unsupported", "request.decision_type");
    return c.result(fixture);
  }
  const declared = new Set(domain.candidates.map((cand) => cand.candidate_id));
  const bound = new Set(fixture.candidate_logits.map((l) => l.candidate_id));
  fixture.candidate_logits.forEach((entry, index) => {
    if (!declared.has(entry.candidate_id))
      c.add(
        "logit_unknown_candidate",
        `fixture.candidate_logits[${index}].candidate_id`,
      );
  });
  for (const id of [...declared].sort())
    if (!bound.has(id)) c.add("logit_missing", `request.candidate.${id}`);
  return c.result(fixture);
}

// ---------------------------------------------------------------------
// Evidence pack
// ---------------------------------------------------------------------

const PACK_KEYS = [
  "contract",
  "schema_version",
  "pack_id",
  "candidate_binding",
  "upstream_commit",
  "adapter_spec",
  "methodology_evidence",
  "method_artifact",
  "synthetic_logit_fixtures",
  "sandbox_policy_hash",
  "calibration_state",
  "result_origin",
  "execution_readiness",
  "execution_facts",
  "review",
  "authority",
  "evidence_pack_hash",
] as const;
const EXECUTION_FACT_KEYS = [
  "upstream_code_executed",
  "model_executed",
  "model_weights_downloaded",
  "candidate_dependencies_installed",
  "ai_lab_executed",
] as const;

export interface CandidateAdapterEvidencePackContext {
  /** The specification the pack claims to bind (validated here). */
  readonly spec: unknown;
  /** The current AI-142 entry (validated here by the AI-142 validator). */
  readonly entry: unknown;
  /** Every synthetic logit fixture the pack claims to bind. */
  readonly fixtures: readonly unknown[];
  /** The AI-143 fixture sandbox policy hash the method artifact runs under. */
  readonly sandbox_policy_hash: string;
}

/**
 * Validates an evidence pack against the artifacts it binds: the exact
 * candidate binding (which must still be current against the AI-142
 * entry), the specification hash, identical methodology evidence, the
 * method artifact identity, the exact fixture set by hash, the unchanged
 * AI-143 policy hash, the recomputed readiness blockers, constant
 * non-execution facts, a non-approved review state and the self-hash.
 */
export function validateCandidateAdapterEvidencePack(
  value: unknown,
  context: CandidateAdapterEvidencePackContext,
): CandidateMethodValidation<CandidateAdapterEvidencePack> {
  const c = new Collector();
  if (
    !isRecord(value) ||
    value["contract"] !== "typed_decision_candidate_adapter_evidence_pack"
  ) {
    c.add("contract_invalid", "pack");
    return c.result(value as unknown as CandidateAdapterEvidencePack);
  }
  closed(value, PACK_KEYS, "pack", c);
  checkFieldNames(value, "pack", c);
  checkSchemaVersion(value["schema_version"], "pack.schema_version", c);
  if (!isId(value["pack_id"])) c.add("identifier_invalid", "pack.pack_id");
  checkCandidateBinding(
    value["candidate_binding"],
    "pack.candidate_binding",
    c,
  );

  const specCheck = validateCandidateAdapterSpec(context.spec);
  if (!specCheck.ok)
    c.add("adapter_spec_binding_mismatch", "pack.adapter_spec");
  const spec = specCheck.ok ? specCheck.value : null;

  if (spec !== null) {
    const binding = checkCandidateAdapterBinding(spec, context.entry);
    for (const issue of binding.issues) c.add(issue.code, issue.path);
    const packBinding = value["candidate_binding"];
    if (
      !isRecord(packBinding) ||
      packBinding["candidate_id"] !== spec.candidate_binding.candidate_id ||
      packBinding["candidate_hash"] !== spec.candidate_binding.candidate_hash ||
      packBinding["evidence_revision"] !==
        spec.candidate_binding.evidence_revision
    )
      c.add("candidate_binding_stale", "pack.candidate_binding");
    if (value["upstream_commit"] !== spec.methodology.upstream_commit)
      c.add("upstream_binding_invalid", "pack.upstream_commit");
    const specBinding = value["adapter_spec"];
    if (
      !isRecord(specBinding) ||
      Object.keys(specBinding).length !== 3 ||
      specBinding["adapter_spec_id"] !== spec.adapter_spec_id ||
      specBinding["adapter_spec_version"] !== spec.adapter_spec_version ||
      specBinding["adapter_spec_hash"] !== spec.adapter_spec_hash
    )
      c.add("adapter_spec_binding_mismatch", "pack.adapter_spec");
    let evidenceMatches = false;
    try {
      evidenceMatches =
        JSON.stringify(value["methodology_evidence"]) ===
        JSON.stringify(spec.methodology.evidence);
    } catch {
      evidenceMatches = false;
    }
    if (!evidenceMatches)
      c.add("methodology_evidence_mismatch", "pack.methodology_evidence");
    const artifact = value["method_artifact"];
    const impl = spec.implementation;
    if (
      !isRecord(artifact) ||
      Object.keys(artifact).length !== 4 ||
      artifact["ownership"] !== "ai_lab" ||
      artifact["adapter_id"] !== impl.adapter_id ||
      artifact["adapter_version"] !== impl.adapter_version ||
      artifact["artifact_sha256"] !== impl.artifact_sha256
    )
      c.add("method_artifact_mismatch", "pack.method_artifact");
    const readiness = evaluateCandidateExecutionReadiness(spec, context.entry);
    const declared = value["execution_readiness"];
    if (
      !isRecord(declared) ||
      Object.keys(declared).length !== 2 ||
      declared["state"] !== readiness.state ||
      !sameStrings(declared["blockers"], readiness.blockers)
    )
      c.add("readiness_mismatch", "pack.execution_readiness");
  }

  // Fixture set: every bound fixture valid, ids and hashes exact, ascending.
  const expected: { fixture_id: string; fixture_hash: string }[] = [];
  context.fixtures.forEach((fixture, index) => {
    const check = validateSyntheticLogitFixture(fixture);
    if (!check.ok) c.add("fixture_set_mismatch", `context.fixtures[${index}]`);
    else
      expected.push({
        fixture_id: check.value.fixture_id,
        fixture_hash: check.value.fixture_hash,
      });
  });
  expected.sort((a, b) =>
    a.fixture_id < b.fixture_id ? -1 : a.fixture_id > b.fixture_id ? 1 : 0,
  );
  const bindings = value["synthetic_logit_fixtures"];
  if (!Array.isArray(bindings) || bindings.length === 0)
    c.add("fixture_binding_invalid", "pack.synthetic_logit_fixtures");
  else {
    bindings.forEach((item, index) => {
      const path = `pack.synthetic_logit_fixtures[${index}]`;
      if (!isRecord(item)) {
        c.add("fixture_binding_invalid", path);
        return;
      }
      closed(item, ["fixture_id", "fixture_hash"], path, c);
      if (!isId(item["fixture_id"]) || !isSha256(item["fixture_hash"]))
        c.add("fixture_binding_invalid", path);
    });
    if (
      bindings.length !== expected.length ||
      expected.some(
        (entry, index) =>
          !isRecord(bindings[index]) ||
          bindings[index]["fixture_id"] !== entry.fixture_id ||
          bindings[index]["fixture_hash"] !== entry.fixture_hash,
      )
    )
      c.add("fixture_set_mismatch", "pack.synthetic_logit_fixtures");
  }

  if (
    !isSha256(value["sandbox_policy_hash"]) ||
    value["sandbox_policy_hash"] !== context.sandbox_policy_hash
  )
    c.add("sandbox_policy_invalid", "pack.sandbox_policy_hash");
  if (value["calibration_state"] !== "not_applied")
    c.add("calibration_claim_forbidden", "pack.calibration_state");
  if (value["result_origin"] !== "synthetic_fixture")
    c.add("result_origin_invalid", "pack.result_origin");
  if (value["authority"] !== "none")
    c.add("authority_forbidden", "pack.authority");

  const readiness = value["execution_readiness"];
  if (
    !isRecord(readiness) ||
    readiness["state"] !== "not_eligible_for_candidate_execution" ||
    !Array.isArray(readiness["blockers"]) ||
    readiness["blockers"].length === 0
  )
    c.add("readiness_invalid", "pack.execution_readiness");

  const facts = value["execution_facts"];
  if (!isRecord(facts)) c.add("execution_fact_invalid", "pack.execution_facts");
  else {
    closed(facts, EXECUTION_FACT_KEYS, "pack.execution_facts", c);
    for (const key of EXECUTION_FACT_KEYS)
      if (facts[key] !== false)
        c.add("execution_fact_invalid", `pack.execution_facts.${key}`);
  }

  const review = value["review"];
  if (
    !isRecord(review) ||
    Object.keys(review).length !== 2 ||
    !includes(CANDIDATE_METHOD_REVIEW_STATES, review["state"]) ||
    review["human_review_required"] !== true
  )
    c.add("review_state_invalid", "pack.review");

  if (!isSha256(value["evidence_pack_hash"]))
    c.add("evidence_pack_hash_mismatch", "pack.evidence_pack_hash");
  else {
    let computed: string | null = null;
    try {
      computed = computeCandidateAdapterEvidencePackHash(
        value as unknown as CandidateAdapterEvidencePack,
      );
    } catch {
      computed = null;
    }
    if (computed !== value["evidence_pack_hash"])
      c.add("evidence_pack_hash_mismatch", "pack.evidence_pack_hash");
  }
  return c.result(value as unknown as CandidateAdapterEvidencePack);
}

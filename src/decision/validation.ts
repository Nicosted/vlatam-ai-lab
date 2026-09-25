/**
 * AI-140 — pure, fail-closed validators for typed decision contracts.
 *
 * Rules:
 *  - Validators are pure. They never throw, log, coerce, normalize or
 *    repair a value, read the clock, the environment, the filesystem or
 *    the network.
 *  - Every object is closed: unknown properties fail.
 *  - Issues use a closed vocabulary of stable machine codes. Human prose
 *    is never machine authority.
 *  - A structurally valid result never grants downstream authority.
 */

import {
  findForbiddenFieldPaths,
  validateGovernance,
} from "../capabilities/validation.js";
import { CAPABILITY_ID_PATTERN } from "../capabilities/version.js";
import {
  computeTypedDecisionRequestHash,
  computeTypedDecisionResultHash,
  computeTypedDecisionSemanticRequestHash,
} from "./canonical.js";
import {
  CONFIDENCE_SEMANTICS,
  PROBABILITY_MICROS_SCALE,
  SUPPORTED_TYPED_DECISION_CONTRACT_MAJORS,
  TYPED_DECISION_ABSTENTION_REASONS,
  TYPED_DECISION_BLOCK_REASONS,
  TYPED_DECISION_DATA_CLASSIFICATIONS,
  TYPED_DECISION_ESCALATION_RECOMMENDATIONS,
  TYPED_DECISION_FAILURE_REASONS,
  TYPED_DECISION_HASH_PATTERN,
  TYPED_DECISION_ID_PATTERN,
  TYPED_DECISION_LIMITS,
  TYPED_DECISION_RESULT_ORIGINS,
  TYPED_DECISION_RESULT_STATUSES,
  TYPED_DECISION_TYPES,
  type TypedDecisionCandidate,
  type TypedDecisionRequest,
  type TypedDecisionResult,
} from "./contracts.js";

export const TYPED_DECISION_ISSUE_CODES = [
  "contract_invalid",
  "unknown_property",
  "missing_property",
  "forbidden_field",
  "private_reasoning_forbidden",
  "schema_version_invalid",
  "schema_version_unsupported",
  "identifier_invalid",
  "capability_id_invalid",
  "execution_paradigm_invalid",
  "decision_type_invalid",
  "decision_type_domain_mismatch",
  "bounded_state_invalid",
  "fact_invalid",
  "duplicate_fact_id",
  "question_invalid",
  "candidate_set_invalid",
  "candidate_invalid",
  "duplicate_candidate_id",
  "score_domain_invalid",
  "policy_invalid",
  "data_classification_not_permitted",
  "escalation_policy_forbidden",
  "evidence_ref_invalid",
  "duplicate_evidence_id",
  "result_origin_invalid",
  "status_invalid",
  "status_payload_mismatch",
  "decision_payload_invalid",
  "selected_candidate_unknown",
  "selected_candidate_not_modal",
  "probability_invalid",
  "distribution_order_invalid",
  "distribution_candidate_unknown",
  "distribution_incomplete",
  "distribution_sum_invalid",
  "distribution_required",
  "boolean_probability_incoherent",
  "score_out_of_range",
  "score_scale_mismatch",
  "ranking_not_permutation",
  "confidence_invalid",
  "calibration_claim_forbidden",
  "abstention_invalid",
  "block_invalid",
  "failure_invalid",
  "escalation_invalid",
  "escalation_execution_forbidden",
  "governance_invalid",
  "downstream_authority_forbidden",
  "approval_state_forbidden",
  "human_review_binding_mismatch",
  "request_binding_mismatch",
  "request_hash_mismatch",
  "evidence_not_in_request",
  "result_hash_mismatch",
] as const;
export type TypedDecisionIssueCode =
  (typeof TYPED_DECISION_ISSUE_CODES)[number];

export interface TypedDecisionIssue {
  readonly code: TypedDecisionIssueCode;
  readonly path: string;
}

export type TypedDecisionValidation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly TypedDecisionIssue[] };

/**
 * Field names that would carry private reasoning. Matched
 * case-insensitively at any depth, in addition to closed-object checks.
 */
export const PRIVATE_REASONING_FIELD_NAMES = new Set<string>([
  "reasoning",
  "chain_of_thought",
  "chainofthought",
  "thoughts",
  "thinking",
  "scratchpad",
  "hidden_reasoning",
  "rationale",
]);

type Record_ = Record<string, unknown>;

function isRecord(value: unknown): value is Record_ {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class Collector {
  readonly issues: TypedDecisionIssue[] = [];
  add(code: TypedDecisionIssueCode, path: string): void {
    this.issues.push({ code, path });
  }
  result<T>(value: T): TypedDecisionValidation<T> {
    if (this.issues.length === 0) return { ok: true, value };
    const seen = new Set<string>();
    const unique = this.issues.filter((issue) => {
      const key = `${issue.code}@${issue.path}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    unique.sort((a, b) =>
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
    return { ok: false, issues: unique };
  }
}

function closed(
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

function isId(value: unknown): value is string {
  return typeof value === "string" && TYPED_DECISION_ID_PATTERN.test(value);
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && TYPED_DECISION_HASH_PATTERN.test(value);
}

function isMicros(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= PROBABILITY_MICROS_SCALE
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

function boundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function checkSchemaVersion(value: unknown, path: string, c: Collector): void {
  if (typeof value !== "string" || !/^\d+\.\d+\.\d+$/.test(value)) {
    c.add("schema_version_invalid", path);
    return;
  }
  const major = Number(value.split(".")[0]);
  if (
    !(SUPPORTED_TYPED_DECISION_CONTRACT_MAJORS as readonly number[]).includes(
      major,
    )
  )
    c.add("schema_version_unsupported", path);
}

function checkGlobalForbidden(value: unknown, c: Collector): void {
  for (const path of findForbiddenFieldPaths(value, 16))
    c.add("forbidden_field", path);
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
      const childPath = path === "" ? key : `${path}.${key}`;
      if (PRIVATE_REASONING_FIELD_NAMES.has(key.toLowerCase()))
        c.add("private_reasoning_forbidden", childPath);
      walk(child, childPath, depth + 1);
    }
  };
  walk(value, "", 0);
}

function checkCandidates(
  value: unknown,
  path: string,
  c: Collector,
): readonly TypedDecisionCandidate[] | null {
  if (
    !Array.isArray(value) ||
    value.length < TYPED_DECISION_LIMITS.min_candidates ||
    value.length > TYPED_DECISION_LIMITS.max_candidates
  ) {
    c.add("candidate_set_invalid", path);
    return null;
  }
  const ids = new Set<string>();
  let valid = true;
  value.forEach((candidate: unknown, index) => {
    const at = `${path}[${index}]`;
    if (!isRecord(candidate)) {
      c.add("candidate_invalid", at);
      valid = false;
      return;
    }
    closed(candidate, ["candidate_id", "label"], at, c);
    if (!isId(candidate["candidate_id"])) {
      c.add("candidate_invalid", `${at}.candidate_id`);
      valid = false;
    } else if (ids.has(candidate["candidate_id"])) {
      c.add("duplicate_candidate_id", `${at}.candidate_id`);
      valid = false;
    } else {
      ids.add(candidate["candidate_id"]);
    }
    if (
      !boundedString(candidate["label"], TYPED_DECISION_LIMITS.max_label_length)
    ) {
      c.add("candidate_invalid", `${at}.label`);
      valid = false;
    }
  });
  return valid ? (value as TypedDecisionCandidate[]) : null;
}

function checkEvidenceRefs(value: unknown, path: string, c: Collector): void {
  if (
    !Array.isArray(value) ||
    value.length > TYPED_DECISION_LIMITS.max_evidence_refs
  ) {
    c.add("evidence_ref_invalid", path);
    return;
  }
  const ids = new Set<string>();
  value.forEach((ref: unknown, index) => {
    const at = `${path}[${index}]`;
    if (!isRecord(ref)) {
      c.add("evidence_ref_invalid", at);
      return;
    }
    closed(ref, ["evidence_id", "content_hash"], at, c);
    if (!isId(ref["evidence_id"]))
      c.add("evidence_ref_invalid", `${at}.evidence_id`);
    else if (ids.has(ref["evidence_id"]))
      c.add("duplicate_evidence_id", `${at}.evidence_id`);
    else ids.add(ref["evidence_id"]);
    if (!isHash(ref["content_hash"]))
      c.add("evidence_ref_invalid", `${at}.content_hash`);
  });
}

const REQUEST_KEYS = [
  "contract",
  "schema_version",
  "request_id",
  "capability_id",
  "execution_paradigm",
  "decision_type",
  "bounded_state",
  "question",
  "output_domain",
  "policy",
  "evidence_refs",
] as const;

/** Validates a typed decision request. Fails closed on any defect. */
export function validateTypedDecisionRequest(
  value: unknown,
): TypedDecisionValidation<TypedDecisionRequest> {
  const c = new Collector();
  if (!isRecord(value) || value["contract"] !== "typed_decision_request") {
    c.add("contract_invalid", "request");
    return c.result(value as TypedDecisionRequest);
  }
  closed(value, REQUEST_KEYS, "request", c);
  checkGlobalForbidden(value, c);
  checkSchemaVersion(value["schema_version"], "request.schema_version", c);
  if (!isId(value["request_id"]))
    c.add("identifier_invalid", "request.request_id");
  if (
    typeof value["capability_id"] !== "string" ||
    !CAPABILITY_ID_PATTERN.test(value["capability_id"])
  )
    c.add("capability_id_invalid", "request.capability_id");
  if (value["execution_paradigm"] !== "typed_decision")
    c.add("execution_paradigm_invalid", "request.execution_paradigm");
  const decisionType = value["decision_type"];
  if (!includes(TYPED_DECISION_TYPES, decisionType))
    c.add("decision_type_invalid", "request.decision_type");

  // bounded state
  const state = value["bounded_state"];
  if (!isRecord(state)) {
    c.add("bounded_state_invalid", "request.bounded_state");
  } else {
    closed(state, ["facts"], "request.bounded_state", c);
    const facts = state["facts"];
    if (
      !Array.isArray(facts) ||
      facts.length > TYPED_DECISION_LIMITS.max_facts
    ) {
      c.add("bounded_state_invalid", "request.bounded_state.facts");
    } else {
      const ids = new Set<string>();
      facts.forEach((fact: unknown, index) => {
        const at = `request.bounded_state.facts[${index}]`;
        if (!isRecord(fact)) {
          c.add("fact_invalid", at);
          return;
        }
        closed(fact, ["fact_id", "value_type", "value"], at, c);
        if (!isId(fact["fact_id"])) c.add("fact_invalid", `${at}.fact_id`);
        else if (ids.has(fact["fact_id"]))
          c.add("duplicate_fact_id", `${at}.fact_id`);
        else ids.add(fact["fact_id"]);
        const type = fact["value_type"];
        const v = fact["value"];
        const typed =
          (type === "string" &&
            typeof v === "string" &&
            v.length <= TYPED_DECISION_LIMITS.max_fact_string_length) ||
          (type === "integer" &&
            typeof v === "number" &&
            Number.isSafeInteger(v)) ||
          (type === "boolean" && typeof v === "boolean");
        if (!typed) c.add("fact_invalid", `${at}.value`);
      });
    }
  }

  // question
  const question = value["question"];
  if (!isRecord(question)) {
    c.add("question_invalid", "request.question");
  } else {
    closed(question, ["question_id", "text"], "request.question", c);
    if (!isId(question["question_id"]))
      c.add("question_invalid", "request.question.question_id");
    if (
      !boundedString(
        question["text"],
        TYPED_DECISION_LIMITS.max_question_length,
      )
    )
      c.add("question_invalid", "request.question.text");
  }

  // output domain
  const domain = value["output_domain"];
  if (!isRecord(domain) || !includes(TYPED_DECISION_TYPES, domain["kind"])) {
    c.add("decision_type_domain_mismatch", "request.output_domain");
  } else {
    if (domain["kind"] !== decisionType)
      c.add("decision_type_domain_mismatch", "request.output_domain.kind");
    const at = "request.output_domain";
    switch (domain["kind"]) {
      case "choice":
        closed(
          domain,
          ["kind", "candidates", "complete_distribution_required"],
          at,
          c,
        );
        checkCandidates(domain["candidates"], `${at}.candidates`, c);
        if (typeof domain["complete_distribution_required"] !== "boolean")
          c.add(
            "candidate_set_invalid",
            `${at}.complete_distribution_required`,
          );
        break;
      case "ranking":
        closed(domain, ["kind", "candidates"], at, c);
        checkCandidates(domain["candidates"], `${at}.candidates`, c);
        break;
      case "boolean":
        closed(domain, ["kind"], at, c);
        break;
      case "score": {
        closed(domain, ["kind", "scale_id", "minimum", "maximum"], at, c);
        const min = domain["minimum"];
        const max = domain["maximum"];
        if (!isId(domain["scale_id"]))
          c.add("score_domain_invalid", `${at}.scale_id`);
        if (
          typeof min !== "number" ||
          typeof max !== "number" ||
          !Number.isSafeInteger(min) ||
          !Number.isSafeInteger(max) ||
          min >= max
        )
          c.add("score_domain_invalid", at);
        break;
      }
    }
  }

  // policy
  const policy = value["policy"];
  if (!isRecord(policy)) {
    c.add("policy_invalid", "request.policy");
  } else {
    const at = "request.policy";
    closed(
      policy,
      [
        "data_classification",
        "human_review_required",
        "abstention_permitted",
        "escalation_policy_ref",
        "downstream_use",
      ],
      at,
      c,
    );
    if (
      !includes(
        TYPED_DECISION_DATA_CLASSIFICATIONS,
        policy["data_classification"],
      )
    )
      c.add("data_classification_not_permitted", `${at}.data_classification`);
    if (typeof policy["human_review_required"] !== "boolean")
      c.add("policy_invalid", `${at}.human_review_required`);
    if (policy["abstention_permitted"] !== true)
      c.add("policy_invalid", `${at}.abstention_permitted`);
    if (policy["escalation_policy_ref"] !== null)
      c.add("escalation_policy_forbidden", `${at}.escalation_policy_ref`);
    if (policy["downstream_use"] !== "none")
      c.add("downstream_authority_forbidden", `${at}.downstream_use`);
  }

  checkEvidenceRefs(value["evidence_refs"], "request.evidence_refs", c);
  return c.result(value as unknown as TypedDecisionRequest);
}

const RESULT_KEYS = [
  "contract",
  "schema_version",
  "result_id",
  "result_origin",
  "request_binding",
  "execution_paradigm",
  "decision_type",
  "status",
  "decision",
  "confidence",
  "abstention",
  "block",
  "failure",
  "escalation",
  "governance",
  "evidence_refs",
  "result_hash",
] as const;

function checkDecisionPayload(
  decision: Record_,
  decisionType: unknown,
  c: Collector,
): void {
  const at = "result.decision";
  if (decision["kind"] !== decisionType) {
    c.add("decision_payload_invalid", `${at}.kind`);
    return;
  }
  switch (decision["kind"]) {
    case "choice": {
      closed(
        decision,
        ["kind", "selected_candidate_id", "distribution"],
        at,
        c,
      );
      if (!isId(decision["selected_candidate_id"]))
        c.add("decision_payload_invalid", `${at}.selected_candidate_id`);
      const dist = decision["distribution"];
      if (dist === null) break;
      if (!isRecord(dist)) {
        c.add("decision_payload_invalid", `${at}.distribution`);
        break;
      }
      closed(dist, ["completeness", "entries"], `${at}.distribution`, c);
      const completeness = dist["completeness"];
      if (completeness !== "complete" && completeness !== "partial")
        c.add("decision_payload_invalid", `${at}.distribution.completeness`);
      const entries = dist["entries"];
      if (
        !Array.isArray(entries) ||
        entries.length === 0 ||
        entries.length > TYPED_DECISION_LIMITS.max_candidates
      ) {
        c.add("decision_payload_invalid", `${at}.distribution.entries`);
        break;
      }
      let sum = 0;
      let structurallyValid = true;
      let previous: string | null = null;
      const seen = new Set<string>();
      let modal = -1;
      let selectedProbability: number | null = null;
      entries.forEach((entry: unknown, index) => {
        const ep = `${at}.distribution.entries[${index}]`;
        if (!isRecord(entry)) {
          c.add("decision_payload_invalid", ep);
          structurallyValid = false;
          return;
        }
        closed(entry, ["candidate_id", "probability_micros"], ep, c);
        const id = entry["candidate_id"];
        const p = entry["probability_micros"];
        if (!isId(id)) {
          c.add("candidate_invalid", `${ep}.candidate_id`);
          structurallyValid = false;
        } else if (seen.has(id)) {
          c.add("duplicate_candidate_id", `${ep}.candidate_id`);
          structurallyValid = false;
        } else {
          seen.add(id);
          if (previous !== null && !(previous < id))
            c.add("distribution_order_invalid", `${ep}.candidate_id`);
          previous = id;
        }
        if (!isMicros(p)) {
          c.add("probability_invalid", `${ep}.probability_micros`);
          structurallyValid = false;
          return;
        }
        sum += p;
        modal = Math.max(modal, p);
        if (id === decision["selected_candidate_id"]) selectedProbability = p;
      });
      if (!structurallyValid) break;
      if (completeness === "complete" && sum !== PROBABILITY_MICROS_SCALE)
        c.add("distribution_sum_invalid", `${at}.distribution`);
      if (completeness === "partial" && sum > PROBABILITY_MICROS_SCALE)
        c.add("distribution_sum_invalid", `${at}.distribution`);
      if (selectedProbability === null)
        c.add("selected_candidate_unknown", `${at}.selected_candidate_id`);
      else if (selectedProbability < modal)
        c.add("selected_candidate_not_modal", `${at}.selected_candidate_id`);
      break;
    }
    case "boolean": {
      closed(decision, ["kind", "value", "probability_true_micros"], at, c);
      const v = decision["value"];
      const p = decision["probability_true_micros"];
      if (typeof v !== "boolean")
        c.add("decision_payload_invalid", `${at}.value`);
      if (p === null) break;
      if (!isMicros(p)) {
        c.add("probability_invalid", `${at}.probability_true_micros`);
        break;
      }
      const half = PROBABILITY_MICROS_SCALE / 2;
      if ((v === true && p < half) || (v === false && p > half))
        c.add(
          "boolean_probability_incoherent",
          `${at}.probability_true_micros`,
        );
      break;
    }
    case "score": {
      closed(decision, ["kind", "scale_id", "value"], at, c);
      if (!isId(decision["scale_id"]))
        c.add("decision_payload_invalid", `${at}.scale_id`);
      const v = decision["value"];
      if (typeof v !== "number" || !Number.isSafeInteger(v))
        c.add("decision_payload_invalid", `${at}.value`);
      break;
    }
    case "ranking": {
      closed(decision, ["kind", "ordered_candidate_ids"], at, c);
      const ids = decision["ordered_candidate_ids"];
      if (
        !Array.isArray(ids) ||
        ids.length < TYPED_DECISION_LIMITS.min_candidates ||
        ids.length > TYPED_DECISION_LIMITS.max_candidates
      ) {
        c.add("decision_payload_invalid", `${at}.ordered_candidate_ids`);
        break;
      }
      const seen = new Set<string>();
      ids.forEach((id: unknown, index) => {
        const ip = `${at}.ordered_candidate_ids[${index}]`;
        if (!isId(id)) c.add("candidate_invalid", ip);
        else if (seen.has(id)) c.add("duplicate_candidate_id", ip);
        else seen.add(id);
      });
      break;
    }
  }
}

function checkReason(
  value: unknown,
  reasons: readonly string[],
  code: TypedDecisionIssueCode,
  path: string,
  c: Collector,
): void {
  if (!isRecord(value)) {
    c.add(code, path);
    return;
  }
  closed(value, ["reason_code"], path, c);
  if (!includes(reasons, value["reason_code"]))
    c.add(code, `${path}.reason_code`);
}

/**
 * Validates a typed decision result on its own: closed shape, origin,
 * status/payload consistency, exact probability structure, confidence
 * semantics, escalation, non-authoritative governance and self-hash.
 * Request binding is checked by `validateTypedDecisionResultForRequest`.
 */
export function validateTypedDecisionResult(
  value: unknown,
): TypedDecisionValidation<TypedDecisionResult> {
  const c = new Collector();
  if (!isRecord(value) || value["contract"] !== "typed_decision_result") {
    c.add("contract_invalid", "result");
    return c.result(value as TypedDecisionResult);
  }
  closed(value, RESULT_KEYS, "result", c);
  checkGlobalForbidden(value, c);
  checkSchemaVersion(value["schema_version"], "result.schema_version", c);
  if (!isId(value["result_id"]))
    c.add("identifier_invalid", "result.result_id");
  if (!includes(TYPED_DECISION_RESULT_ORIGINS, value["result_origin"]))
    c.add("result_origin_invalid", "result.result_origin");
  if (value["execution_paradigm"] !== "typed_decision")
    c.add("execution_paradigm_invalid", "result.execution_paradigm");
  const decisionType = value["decision_type"];
  if (!includes(TYPED_DECISION_TYPES, decisionType))
    c.add("decision_type_invalid", "result.decision_type");

  const binding = value["request_binding"];
  if (!isRecord(binding)) {
    c.add("request_binding_mismatch", "result.request_binding");
  } else {
    const at = "result.request_binding";
    closed(
      binding,
      ["request_id", "capability_id", "request_hash", "semantic_request_hash"],
      at,
      c,
    );
    if (!isId(binding["request_id"]))
      c.add("identifier_invalid", `${at}.request_id`);
    if (
      typeof binding["capability_id"] !== "string" ||
      !CAPABILITY_ID_PATTERN.test(binding["capability_id"])
    )
      c.add("capability_id_invalid", `${at}.capability_id`);
    if (!isHash(binding["request_hash"]))
      c.add("request_binding_mismatch", `${at}.request_hash`);
    if (!isHash(binding["semantic_request_hash"]))
      c.add("request_binding_mismatch", `${at}.semantic_request_hash`);
  }

  // status and mutually exclusive outcome blocks
  const status = value["status"];
  const decision = value["decision"];
  const confidence = value["confidence"];
  if (!includes(TYPED_DECISION_RESULT_STATUSES, status)) {
    c.add("status_invalid", "result.status");
  } else {
    const expect = {
      decision: status === "succeeded",
      abstention: status === "abstained",
      block: status === "blocked",
      failure: status === "failed",
    } as const;
    for (const key of ["decision", "abstention", "block", "failure"] as const) {
      const present = value[key] !== null && value[key] !== undefined;
      if (present !== expect[key])
        c.add("status_payload_mismatch", `result.${key}`);
    }
    if (
      status !== "succeeded" &&
      confidence !== null &&
      confidence !== undefined
    )
      c.add("status_payload_mismatch", "result.confidence");
  }
  if (isRecord(decision)) checkDecisionPayload(decision, decisionType, c);
  else if (decision !== null && decision !== undefined)
    c.add("decision_payload_invalid", "result.decision");

  if (value["abstention"] !== null && value["abstention"] !== undefined)
    checkReason(
      value["abstention"],
      TYPED_DECISION_ABSTENTION_REASONS,
      "abstention_invalid",
      "result.abstention",
      c,
    );
  if (value["block"] !== null && value["block"] !== undefined)
    checkReason(
      value["block"],
      TYPED_DECISION_BLOCK_REASONS,
      "block_invalid",
      "result.block",
      c,
    );
  if (value["failure"] !== null && value["failure"] !== undefined)
    checkReason(
      value["failure"],
      TYPED_DECISION_FAILURE_REASONS,
      "failure_invalid",
      "result.failure",
      c,
    );

  // confidence: evidence metadata only
  if (confidence !== null && confidence !== undefined) {
    const at = "result.confidence";
    if (!isRecord(confidence)) {
      c.add("confidence_invalid", at);
    } else {
      closed(
        confidence,
        ["confidence_micros", "semantics", "calibration_ref"],
        at,
        c,
      );
      if (!isMicros(confidence["confidence_micros"]))
        c.add("confidence_invalid", `${at}.confidence_micros`);
      if (!includes(CONFIDENCE_SEMANTICS, confidence["semantics"]))
        c.add("confidence_invalid", `${at}.semantics`);
      if (confidence["calibration_ref"] !== null)
        c.add("calibration_claim_forbidden", `${at}.calibration_ref`);
    }
  }

  // escalation: recommendation metadata, never execution
  const escalation = value["escalation"];
  if (!isRecord(escalation)) {
    c.add("escalation_invalid", "result.escalation");
  } else {
    const at = "result.escalation";
    closed(
      escalation,
      ["recommendation", "executed", "governed_policy_ref"],
      at,
      c,
    );
    const rec = escalation["recommendation"];
    if (!includes(TYPED_DECISION_ESCALATION_RECOMMENDATIONS, rec))
      c.add("escalation_invalid", `${at}.recommendation`);
    else if (status === "succeeded" && rec === "governed_escalation_candidate")
      c.add("escalation_invalid", `${at}.recommendation`);
    if (escalation["executed"] !== false)
      c.add("escalation_execution_forbidden", `${at}.executed`);
    if (escalation["governed_policy_ref"] !== null)
      c.add("escalation_policy_forbidden", `${at}.governed_policy_ref`);
  }

  // governance: reuse AI-71 invariants, then apply stricter 1.0.0 rules
  const governance = value["governance"];
  const governanceCheck = validateGovernance(governance, "result.governance");
  if (!governanceCheck.ok) c.add("governance_invalid", "result.governance");
  if (isRecord(governance)) {
    closed(
      governance,
      ["human_review_required", "downstream_allowed", "approval_state"],
      "result.governance",
      c,
    );
    if (governance["downstream_allowed"] !== false)
      c.add(
        "downstream_authority_forbidden",
        "result.governance.downstream_allowed",
      );
    if (
      governance["approval_state"] === "approved" ||
      governance["approval_state"] === "rejected"
    )
      c.add("approval_state_forbidden", "result.governance.approval_state");
  }

  checkEvidenceRefs(value["evidence_refs"], "result.evidence_refs", c);

  if (!isHash(value["result_hash"])) {
    c.add("result_hash_mismatch", "result.result_hash");
  } else if (c.issues.length === 0) {
    let computed: string | null = null;
    try {
      computed = computeTypedDecisionResultHash(
        value as unknown as TypedDecisionResult,
      );
    } catch {
      computed = null;
    }
    if (computed !== value["result_hash"])
      c.add("result_hash_mismatch", "result.result_hash");
  }

  return c.result(value as unknown as TypedDecisionResult);
}

/**
 * Validates a result against the exact request it claims to answer:
 * hash binding, capability, decision type, candidate membership,
 * distribution completeness, score bounds, ranking permutation, human
 * review requirement and evidence lineage.
 */
export function validateTypedDecisionResultForRequest(
  resultValue: unknown,
  requestValue: unknown,
): TypedDecisionValidation<TypedDecisionResult> {
  const requestCheck = validateTypedDecisionRequest(requestValue);
  const resultCheck = validateTypedDecisionResult(resultValue);
  if (!requestCheck.ok || !resultCheck.ok) {
    return {
      ok: false,
      issues: [
        ...(requestCheck.ok ? [] : requestCheck.issues),
        ...(resultCheck.ok ? [] : resultCheck.issues),
      ],
    };
  }
  const request = requestCheck.value;
  const result = resultCheck.value;
  const c = new Collector();
  const b = result.request_binding;
  if (b.request_id !== request.request_id)
    c.add("request_binding_mismatch", "result.request_binding.request_id");
  if (b.capability_id !== request.capability_id)
    c.add("request_binding_mismatch", "result.request_binding.capability_id");
  if (b.request_hash !== computeTypedDecisionRequestHash(request))
    c.add("request_hash_mismatch", "result.request_binding.request_hash");
  if (
    b.semantic_request_hash !== computeTypedDecisionSemanticRequestHash(request)
  )
    c.add(
      "request_hash_mismatch",
      "result.request_binding.semantic_request_hash",
    );
  if (result.decision_type !== request.decision_type)
    c.add("decision_type_domain_mismatch", "result.decision_type");
  if (
    result.governance.human_review_required !==
    request.policy.human_review_required
  )
    c.add(
      "human_review_binding_mismatch",
      "result.governance.human_review_required",
    );

  const requestEvidence = new Map(
    request.evidence_refs.map((ref) => [ref.evidence_id, ref.content_hash]),
  );
  result.evidence_refs.forEach((ref, index) => {
    if (requestEvidence.get(ref.evidence_id) !== ref.content_hash)
      c.add("evidence_not_in_request", `result.evidence_refs[${index}]`);
  });

  const decision = result.decision;
  const domain = request.output_domain;
  if (decision !== null && decision.kind === domain.kind) {
    if (decision.kind === "choice" && domain.kind === "choice") {
      const ids = new Set(domain.candidates.map((cand) => cand.candidate_id));
      if (!ids.has(decision.selected_candidate_id))
        c.add(
          "selected_candidate_unknown",
          "result.decision.selected_candidate_id",
        );
      if (decision.distribution === null) {
        if (domain.complete_distribution_required)
          c.add("distribution_required", "result.decision.distribution");
      } else {
        decision.distribution.entries.forEach((entry, index) => {
          if (!ids.has(entry.candidate_id))
            c.add(
              "distribution_candidate_unknown",
              `result.decision.distribution.entries[${index}].candidate_id`,
            );
        });
        if (
          decision.distribution.completeness === "complete" &&
          decision.distribution.entries.length !== ids.size
        )
          c.add("distribution_incomplete", "result.decision.distribution");
        if (
          domain.complete_distribution_required &&
          decision.distribution.completeness !== "complete"
        )
          c.add("distribution_required", "result.decision.distribution");
      }
    }
    if (decision.kind === "score" && domain.kind === "score") {
      if (decision.scale_id !== domain.scale_id)
        c.add("score_scale_mismatch", "result.decision.scale_id");
      if (decision.value < domain.minimum || decision.value > domain.maximum)
        c.add("score_out_of_range", "result.decision.value");
    }
    if (decision.kind === "ranking" && domain.kind === "ranking") {
      const expected = domain.candidates
        .map((cand) => cand.candidate_id)
        .sort();
      const actual = [...decision.ordered_candidate_ids].sort();
      if (
        expected.length !== actual.length ||
        expected.some((id, index) => id !== actual[index])
      )
        c.add(
          "ranking_not_permutation",
          "result.decision.ordered_candidate_ids",
        );
    }
  }
  return c.result(result);
}

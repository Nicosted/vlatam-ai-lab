/**
 * AI-141 — deterministic Gold Decision evaluator
 * (scoring policy `gold-decision-scoring-v1`).
 *
 * `evaluateGoldDecisionCase` compares one AI-140 `TypedDecisionResult`
 * with one Gold Decision Case. It is a pure function: it never calls a
 * model, provider or runtime, never touches the network, filesystem,
 * clock or environment, never chooses another case, never mutates its
 * inputs and never infers missing truth. An invalid Gold Case is
 * refused; an invalid candidate result is recorded as `invalid_result`.
 *
 * Scoring rules (`gold-decision-scoring-v1`):
 *  - The result must validate against the case's exact request
 *    (AI-140 `validateTypedDecisionResultForRequest`): contract, hash
 *    binding, candidate membership, score bounds, ranking permutation,
 *    human-review binding and evidence lineage. Otherwise
 *    `invalid_result`.
 *  - `blocked` / `failed` results are `no_decision`.
 *  - `abstained` is scored by the case's abstention policy only:
 *    `required` → `correct_abstention`, `allowed` →
 *    `permitted_abstention`, `not_allowed` → `incorrect_abstention`.
 *  - `succeeded` on an abstention-required case is an
 *    `incorrect_decision`; the candidate guessed where the bounded state
 *    supports no answer.
 *  - `succeeded` otherwise: choice by exact candidate identity, boolean
 *    by exact value, score by exact value or declared acceptable band,
 *    ranking by exact order. Confidence and probability never change the
 *    outcome: a high-confidence wrong answer is incorrect.
 *  - Probability evidence (Brier squared error, exact integer micros²)
 *    is recorded for succeeded choice decisions with a complete
 *    distribution and boolean decisions with `probability_true_micros`.
 *    It is not a calibration claim.
 */

import { computeTypedDecisionResultHash } from "../decision/canonical.js";
import {
  PROBABILITY_MICROS_SCALE,
  type TypedDecisionAbstentionReason,
  type TypedDecisionResult,
} from "../decision/contracts.js";
import {
  validateTypedDecisionResult,
  validateTypedDecisionResultForRequest,
  type TypedDecisionIssueCode,
} from "../decision/validation.js";
import { computeGoldDecisionEvaluationHash } from "./canonical.js";
import {
  GOLD_DECISION_CONTRACT_VERSION,
  type GoldDecisionCase,
  type GoldDecisionCaseEvaluation,
  type GoldDecisionEvaluationErrorCode,
  type GoldDecisionOutcome,
  type GoldProbabilityEvidence,
  type GoldScoreError,
} from "./contracts.js";
import {
  GOLD_DECISION_OUTCOME_SEMANTICS,
  validateGoldDecisionCase,
  type GoldDecisionValidation,
} from "./validation.js";

interface Scored {
  readonly outcome: GoldDecisionOutcome;
  readonly error_codes: readonly GoldDecisionEvaluationErrorCode[];
  readonly abstention_reason_code: TypedDecisionAbstentionReason | null;
  readonly score_error: GoldScoreError | null;
  readonly probability_evidence: GoldProbabilityEvidence | null;
  readonly result_issue_codes: readonly TypedDecisionIssueCode[];
}

const scored = (
  outcome: GoldDecisionOutcome,
  rest: Partial<Omit<Scored, "outcome">> = {},
): Scored => ({
  outcome,
  error_codes: rest.error_codes ?? [],
  abstention_reason_code: rest.abstention_reason_code ?? null,
  score_error: rest.score_error ?? null,
  probability_evidence: rest.probability_evidence ?? null,
  result_issue_codes: rest.result_issue_codes ?? [],
});

function squared(delta: number): number {
  return delta * delta;
}

function scoreDecision(
  goldCase: GoldDecisionCase,
  result: TypedDecisionResult,
): Scored {
  const decision = result.decision!;
  const expected = goldCase.expected;
  const micros = PROBABILITY_MICROS_SCALE;
  switch (decision.kind) {
    case "choice": {
      if (expected.kind !== "choice") break;
      const correct =
        decision.selected_candidate_id === expected.expected_candidate_id;
      let probability: GoldProbabilityEvidence | null = null;
      if (decision.distribution?.completeness === "complete") {
        // Complete distributions list every request candidate exactly
        // once (enforced by AI-140 binding validation).
        let sum = 0;
        for (const entry of decision.distribution.entries) {
          const target =
            entry.candidate_id === expected.expected_candidate_id ? micros : 0;
          sum += squared(entry.probability_micros - target);
        }
        probability = { kind: "choice_multiclass", squared_error_micros2: sum };
      }
      return correct
        ? scored("correct_decision", { probability_evidence: probability })
        : scored("incorrect_decision", {
            error_codes: ["expected_candidate_mismatch"],
            probability_evidence: probability,
          });
    }
    case "boolean": {
      if (expected.kind !== "boolean") break;
      const correct = decision.value === expected.expected_value;
      const probability: GoldProbabilityEvidence | null =
        decision.probability_true_micros === null
          ? null
          : {
              kind: "boolean_binary",
              squared_error_micros2: squared(
                decision.probability_true_micros -
                  (expected.expected_value ? micros : 0),
              ),
            };
      return correct
        ? scored("correct_decision", { probability_evidence: probability })
        : scored("incorrect_decision", {
            error_codes: ["expected_value_mismatch"],
            probability_evidence: probability,
          });
    }
    case "score": {
      if (expected.kind !== "score") break;
      const v = decision.value;
      const [min, max] =
        expected.match === "exact"
          ? [expected.expected_value, expected.expected_value]
          : [expected.acceptable_minimum, expected.acceptable_maximum];
      const absolute_error = v < min ? min - v : v > max ? v - max : 0;
      const scoreError = { scale_id: expected.scale_id, absolute_error };
      return absolute_error === 0
        ? scored("correct_decision", { score_error: scoreError })
        : scored("incorrect_decision", {
            error_codes: ["score_outside_expected"],
            score_error: scoreError,
          });
    }
    case "ranking": {
      if (expected.kind !== "ranking") break;
      const actual = decision.ordered_candidate_ids;
      const correct =
        actual.length === expected.expected_order.length &&
        actual.every((id, index) => id === expected.expected_order[index]);
      return correct
        ? scored("correct_decision")
        : scored("incorrect_decision", {
            error_codes: ["ranking_order_mismatch"],
          });
    }
  }
  // Unreachable for a validated case bound to a validated result: the
  // expectation kind equals the request decision type, which the result
  // binding enforces. Fail closed rather than guess.
  return scored("invalid_result", {
    error_codes: ["result_request_binding_invalid"],
    result_issue_codes: ["decision_type_domain_mismatch"],
  });
}

function scoreResult(goldCase: GoldDecisionCase, resultValue: unknown): Scored {
  const binding = validateTypedDecisionResultForRequest(
    resultValue,
    goldCase.request,
  );
  if (!binding.ok) {
    const standalone = validateTypedDecisionResult(resultValue);
    const codes = [
      ...new Set(binding.issues.map((issue) => issue.code)),
    ].sort();
    return scored("invalid_result", {
      error_codes: [
        standalone.ok
          ? "result_request_binding_invalid"
          : "result_contract_invalid",
      ],
      result_issue_codes: codes,
    });
  }
  const result = binding.value;
  switch (result.status) {
    case "blocked":
      return scored("no_decision", { error_codes: ["result_blocked"] });
    case "failed":
      return scored("no_decision", { error_codes: ["result_failed"] });
    case "abstained": {
      const reason = result.abstention!.reason_code;
      switch (goldCase.abstention_policy) {
        case "required":
          return scored("correct_abstention", {
            abstention_reason_code: reason,
          });
        case "allowed":
          return scored("permitted_abstention", {
            abstention_reason_code: reason,
          });
        case "not_allowed":
          return scored("incorrect_abstention", {
            abstention_reason_code: reason,
            error_codes: ["abstention_not_allowed"],
          });
      }
      break;
    }
    case "succeeded":
      if (goldCase.abstention_policy === "required")
        return scored("incorrect_decision", {
          error_codes: ["decision_on_abstention_required_case"],
        });
      return scoreDecision(goldCase, result);
  }
  return scored("invalid_result", {
    error_codes: ["result_contract_invalid"],
    result_issue_codes: ["status_invalid"],
  });
}

function resultHash(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  try {
    return computeTypedDecisionResultHash(value as TypedDecisionResult);
  } catch {
    return null;
  }
}

/**
 * Evaluates one candidate result against one Gold Decision Case under
 * `gold-decision-scoring-v1`. Returns `ok: false` only when the Gold
 * Case itself is invalid (the evaluator refuses to score against
 * unverifiable truth). Any defect in the candidate result yields a
 * valid evaluation record with outcome `invalid_result`.
 */
export function evaluateGoldDecisionCase(
  goldCaseValue: unknown,
  resultValue: unknown,
): GoldDecisionValidation<GoldDecisionCaseEvaluation> {
  const caseCheck = validateGoldDecisionCase(goldCaseValue);
  if (!caseCheck.ok) return caseCheck;
  const goldCase = caseCheck.value;
  const outcome = scoreResult(goldCase, resultValue);
  const semantics = GOLD_DECISION_OUTCOME_SEMANTICS[outcome.outcome];
  const record: Omit<GoldDecisionCaseEvaluation, "evaluation_hash"> = {
    contract: "gold_decision_case_evaluation",
    schema_version: GOLD_DECISION_CONTRACT_VERSION,
    scoring_policy: "gold-decision-scoring-v1",
    case_id: goldCase.case_id,
    case_hash: goldCase.case_hash,
    dataset_id: goldCase.dataset_id,
    dataset_version: goldCase.dataset_version,
    split: goldCase.split,
    decision_type: goldCase.request.decision_type,
    capability_id: goldCase.request.capability_id,
    language: goldCase.language,
    jurisdiction: goldCase.jurisdiction,
    abstention_policy: goldCase.abstention_policy,
    candidate_result_hash: resultHash(resultValue),
    outcome: outcome.outcome,
    correctness: semantics.correctness,
    abstention_outcome: semantics.abstention_outcome,
    abstention_reason_code: outcome.abstention_reason_code,
    score_error: outcome.score_error,
    probability_evidence: outcome.probability_evidence,
    error_codes: [...outcome.error_codes].sort(),
    result_issue_codes: [...outcome.result_issue_codes].sort(),
  };
  const evaluation: GoldDecisionCaseEvaluation = {
    ...record,
    evaluation_hash: computeGoldDecisionEvaluationHash(record),
  };
  return { ok: true, value: deepFreeze(evaluation) };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

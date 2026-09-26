/**
 * AI-141 — deterministic aggregate metrics over Gold Decision case
 * evaluation records (scoring policy `gold-decision-scoring-v1`).
 *
 * Aggregation reads only validated evaluation records bound to a
 * validated Gold Decision Set. It never evaluates, executes or ranks a
 * candidate and never names a winner.
 *
 * Anti-selection rule: a report covers a declared split scope (`all` or
 * one split) and requires exactly one evaluation for every case in that
 * scope. A missing, duplicated or out-of-scope evaluation fails closed,
 * so a candidate cannot report only favourable cases. An empty scope
 * fails closed rather than reporting vacuous metrics.
 *
 * Metric definitions (exact rationals in lowest terms, never floats):
 *  - accuracy             = (correct_decisions + correct_abstentions) / total_cases
 *  - coverage             = decisions / total_cases
 *  - accuracy_at_coverage = correct_decisions / decisions
 *  - abstention_rate      = abstentions / total_cases
 *  - brier_*              = Σ squared_error_micros2 / (eligible × 10¹²),
 *                           over succeeded decisions carrying probability
 *                           evidence; abstentions, blocks, failures,
 *                           invalid results and decisions without
 *                           probability evidence are excluded and counted.
 *  - score error          = per declared `scale_id` only; scales are never
 *                           combined or normalized against each other.
 * Ratios with a zero denominator are `null`.
 *
 * Every report restates the manifest's evaluation purpose
 * (`synthetic_conformance`, `domain_representative: false`,
 * `promotion_eligible: false`) and case visibility (`public`,
 * `blind_holdout: false`) so that no consumer can read it as real-domain,
 * promotion or blind-holdout evidence.
 */

import { PROBABILITY_MICROS_SCALE } from "../decision/contracts.js";
import { computeGoldDecisionReportHash } from "./canonical.js";
import {
  GOLD_DECISION_CONTRACT_VERSION,
  GOLD_DECISION_SLICE_DIMENSIONS,
  GOLD_DECISION_SPLITS,
  type GoldDecisionBrierMetrics,
  type GoldDecisionCaseEvaluation,
  type GoldDecisionEvaluationReport,
  type GoldDecisionMetrics,
  type GoldDecisionRatio,
  type GoldDecisionScoreScaleMetrics,
  type GoldDecisionSlice,
  type GoldDecisionSliceDimension,
  type GoldDecisionSplitScope,
} from "./contracts.js";
import {
  validateGoldDecisionCaseEvaluation,
  validateGoldDecisionSet,
  type GoldDecisionIssue,
} from "./validation.js";

export const GOLD_DECISION_AGGREGATION_ISSUE_CODES = [
  "set_invalid",
  "split_scope_invalid",
  "empty_evaluation_scope",
  "evaluation_invalid",
  "evaluation_dataset_mismatch",
  "evaluation_scoring_policy_mismatch",
  "evaluation_case_mismatch",
  "evaluation_out_of_scope",
  "duplicate_evaluation",
  "evaluation_missing",
] as const;
export type GoldDecisionAggregationIssueCode =
  (typeof GOLD_DECISION_AGGREGATION_ISSUE_CODES)[number];

export interface GoldDecisionAggregationIssue {
  readonly code: GoldDecisionAggregationIssueCode;
  readonly path: string;
  /** Underlying set or evaluation validation issues, if any. */
  readonly details: readonly GoldDecisionIssue[];
}

export type GoldDecisionAggregation =
  | { readonly ok: true; readonly value: GoldDecisionEvaluationReport }
  | {
      readonly ok: false;
      readonly issues: readonly GoldDecisionAggregationIssue[];
    };

function gcd(left: bigint, right: bigint): bigint {
  let a = left;
  let b = right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

/** Exact non-negative ratio in lowest terms; `null` for a zero denominator. */
export function goldDecisionRatio(
  numerator: bigint | number,
  denominator: bigint | number,
): GoldDecisionRatio | null {
  const n = BigInt(numerator);
  const d = BigInt(denominator);
  if (d === 0n) return null;
  if (n < 0n || d < 0n) throw new Error("gold_decision_negative_ratio");
  const divisor = n === 0n ? d : gcd(n, d);
  return {
    numerator: (n / divisor).toString(),
    denominator: (d / divisor).toString(),
  };
}

const MICROS2 =
  BigInt(PROBABILITY_MICROS_SCALE) * BigInt(PROBABILITY_MICROS_SCALE);

function brier(
  evaluations: readonly GoldDecisionCaseEvaluation[],
  decisionType: "choice" | "boolean",
): GoldDecisionBrierMetrics {
  let eligible = 0;
  let missing = 0;
  let sum = 0n;
  for (const evaluation of evaluations) {
    if (evaluation.decision_type !== decisionType) continue;
    const decided =
      evaluation.outcome === "correct_decision" ||
      evaluation.outcome === "incorrect_decision";
    if (!decided || evaluation.abstention_policy === "required") continue;
    if (evaluation.probability_evidence === null) {
      missing += 1;
      continue;
    }
    eligible += 1;
    sum += BigInt(evaluation.probability_evidence.squared_error_micros2);
  }
  return {
    eligible_decisions: eligible,
    decisions_without_probability: missing,
    sum_squared_error_micros2: sum.toString(),
    brier_score: goldDecisionRatio(sum, BigInt(eligible) * MICROS2),
  };
}

function scoreErrors(
  evaluations: readonly GoldDecisionCaseEvaluation[],
): GoldDecisionScoreScaleMetrics[] {
  const byScale = new Map<
    string,
    { scored: number; exact: number; sum: bigint }
  >();
  for (const evaluation of evaluations) {
    const error = evaluation.score_error;
    if (error === null) continue;
    const entry = byScale.get(error.scale_id) ?? {
      scored: 0,
      exact: 0,
      sum: 0n,
    };
    entry.scored += 1;
    if (error.absolute_error === 0) entry.exact += 1;
    entry.sum += BigInt(error.absolute_error);
    byScale.set(error.scale_id, entry);
  }
  return [...byScale.keys()].sort().map((scale_id) => {
    const entry = byScale.get(scale_id)!;
    return {
      scale_id,
      scored_decisions: entry.scored,
      exact_or_in_range: entry.exact,
      sum_absolute_error: entry.sum.toString(),
      mean_absolute_error: goldDecisionRatio(entry.sum, entry.scored),
    };
  });
}

/** Metrics over an already validated, bound list of evaluations. */
export function computeGoldDecisionMetrics(
  evaluations: readonly GoldDecisionCaseEvaluation[],
): GoldDecisionMetrics {
  const count = (outcome: GoldDecisionCaseEvaluation["outcome"]): number =>
    evaluations.filter((evaluation) => evaluation.outcome === outcome).length;
  const total = evaluations.length;
  const correctDecisions = count("correct_decision");
  const incorrectDecisions = count("incorrect_decision");
  const correctAbstentions = count("correct_abstention");
  const permittedAbstentions = count("permitted_abstention");
  const incorrectAbstentions = count("incorrect_abstention");
  const invalid = count("invalid_result");
  const decisions = correctDecisions + incorrectDecisions;
  const abstentions =
    correctAbstentions + permittedAbstentions + incorrectAbstentions;
  return {
    total_cases: total,
    valid_results: total - invalid,
    invalid_results: invalid,
    decisions,
    correct_decisions: correctDecisions,
    incorrect_decisions: incorrectDecisions,
    abstentions,
    correct_abstentions: correctAbstentions,
    permitted_abstentions: permittedAbstentions,
    incorrect_abstentions: incorrectAbstentions,
    no_decisions: count("no_decision"),
    abstention_required_cases: evaluations.filter(
      (evaluation) => evaluation.abstention_policy === "required",
    ).length,
    accuracy: goldDecisionRatio(correctDecisions + correctAbstentions, total),
    coverage: goldDecisionRatio(decisions, total),
    accuracy_at_coverage: goldDecisionRatio(correctDecisions, decisions),
    abstention_rate: goldDecisionRatio(abstentions, total),
    brier_choice_multiclass: brier(evaluations, "choice"),
    brier_boolean_binary: brier(evaluations, "boolean"),
    score_error_by_scale: scoreErrors(evaluations),
  };
}

function slices(
  evaluations: readonly GoldDecisionCaseEvaluation[],
  dimension: GoldDecisionSliceDimension,
): GoldDecisionSlice[] {
  const groups = new Map<string, GoldDecisionCaseEvaluation[]>();
  for (const evaluation of evaluations) {
    const key = evaluation[dimension];
    groups.set(key, [...(groups.get(key) ?? []), evaluation]);
  }
  return [...groups.keys()].sort().map((key) => ({
    key,
    metrics: computeGoldDecisionMetrics(groups.get(key)!),
  }));
}

/**
 * Aggregates case evaluation records for one Gold Decision Set and split
 * scope into a hash-bound, non-authoritative evaluation report.
 */
export function aggregateGoldDecisionEvaluations(
  manifestValue: unknown,
  caseValues: readonly unknown[],
  evaluationValues: readonly unknown[],
  splitScope: GoldDecisionSplitScope,
): GoldDecisionAggregation {
  const issues: GoldDecisionAggregationIssue[] = [];
  const add = (
    code: GoldDecisionAggregationIssueCode,
    path: string,
    details: readonly GoldDecisionIssue[] = [],
  ): void => {
    issues.push({ code, path, details });
  };
  const fail = (): GoldDecisionAggregation => ({ ok: false, issues });

  if (
    splitScope !== "all" &&
    !(GOLD_DECISION_SPLITS as readonly string[]).includes(splitScope)
  ) {
    add("split_scope_invalid", "split_scope");
    return fail();
  }
  const setCheck = validateGoldDecisionSet(manifestValue, caseValues);
  if (!setCheck.ok) {
    add("set_invalid", "set", setCheck.issues);
    return fail();
  }
  const { set, cases } = setCheck.value;
  const inScope = cases.filter(
    (goldCase) => splitScope === "all" || goldCase.split === splitScope,
  );
  if (inScope.length === 0) {
    add("empty_evaluation_scope", "split_scope");
    return fail();
  }
  const caseById = new Map(
    cases.map((goldCase) => [goldCase.case_id, goldCase]),
  );
  const scopeIds = new Set(inScope.map((goldCase) => goldCase.case_id));
  const accepted = new Map<string, GoldDecisionCaseEvaluation>();

  if (!Array.isArray(evaluationValues)) {
    add("evaluation_invalid", "evaluations");
    return fail();
  }
  evaluationValues.forEach((value, index) => {
    const at = `evaluations[${index}]`;
    const check = validateGoldDecisionCaseEvaluation(value);
    if (!check.ok) {
      add("evaluation_invalid", at, check.issues);
      return;
    }
    const evaluation = check.value;
    if (
      evaluation.dataset_id !== set.dataset_id ||
      evaluation.dataset_version !== set.dataset_version
    ) {
      add("evaluation_dataset_mismatch", at);
      return;
    }
    if (evaluation.scoring_policy !== set.scoring_policy) {
      add("evaluation_scoring_policy_mismatch", at);
      return;
    }
    const goldCase = caseById.get(evaluation.case_id);
    if (goldCase === undefined || !scopeIds.has(evaluation.case_id)) {
      add("evaluation_out_of_scope", at);
      return;
    }
    if (
      evaluation.case_hash !== goldCase.case_hash ||
      evaluation.split !== goldCase.split ||
      evaluation.decision_type !== goldCase.request.decision_type ||
      evaluation.capability_id !== goldCase.request.capability_id ||
      evaluation.language !== goldCase.language ||
      evaluation.jurisdiction !== goldCase.jurisdiction ||
      evaluation.abstention_policy !== goldCase.abstention_policy ||
      (evaluation.score_error !== null &&
        goldCase.expected.kind === "score" &&
        evaluation.score_error.scale_id !== goldCase.expected.scale_id)
    ) {
      add("evaluation_case_mismatch", at);
      return;
    }
    if (accepted.has(evaluation.case_id)) {
      add("duplicate_evaluation", at);
      return;
    }
    accepted.set(evaluation.case_id, evaluation);
  });
  for (const goldCase of inScope) {
    if (!accepted.has(goldCase.case_id))
      add("evaluation_missing", `cases.${goldCase.case_id}`);
  }
  if (issues.length > 0) return fail();

  // Deterministic order: ascending case_id, independent of input order.
  const ordered = [...accepted.keys()].sort().map((id) => accepted.get(id)!);
  const sliceMap = Object.fromEntries(
    GOLD_DECISION_SLICE_DIMENSIONS.map((dimension) => [
      dimension,
      slices(ordered, dimension),
    ]),
  ) as unknown as GoldDecisionEvaluationReport["slices"];
  const report: Omit<GoldDecisionEvaluationReport, "report_hash"> = {
    contract: "gold_decision_evaluation_report",
    schema_version: GOLD_DECISION_CONTRACT_VERSION,
    scoring_policy: set.scoring_policy,
    dataset_id: set.dataset_id,
    dataset_version: set.dataset_version,
    dataset_hash: set.dataset_hash,
    dataset_review_state: set.review.state,
    evaluation_purpose: set.evaluation_purpose,
    domain_representative: set.domain_representative,
    promotion_eligible: set.promotion_eligible,
    case_visibility: set.split_policy.case_visibility,
    blind_holdout: set.split_policy.blind_holdout,
    split_scope: splitScope,
    evaluation_hashes: ordered.map((evaluation) => evaluation.evaluation_hash),
    overall: computeGoldDecisionMetrics(ordered),
    slices: sliceMap,
    authority: "evidence_only",
    calibration_claimed: false,
    universal_winner: false,
  };
  return {
    ok: true,
    value: { ...report, report_hash: computeGoldDecisionReportHash(report) },
  };
}

/** Recomputes a report's self-hash; the report is evidence, not authority. */
export function verifyGoldDecisionReportHash(
  report: GoldDecisionEvaluationReport,
): boolean {
  try {
    return computeGoldDecisionReportHash(report) === report.report_hash;
  } catch {
    return false;
  }
}

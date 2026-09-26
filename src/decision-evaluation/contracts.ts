/**
 * AI-141 — Gold Decision Evaluation Set: contract types.
 *
 * A Gold Decision Case is reviewable, hash-bound evaluation evidence for
 * one bounded typed decision (AI-140). While its dataset is `draft` or
 * `in_review` it is provisional evaluation truth; it becomes reviewed
 * evaluation authority only through a future governed publication bound
 * to the exact dataset hash. It composes an exact AI-140
 * `TypedDecisionRequest` with an answer key, an explicit abstention
 * policy, provenance and slicing metadata. A Gold Decision Set manifest
 * binds an exact, ordered list of case hashes under one dataset
 * version, split policy, labeling rules and scoring policy.
 *
 * This layer measures typed decision results. It never produces them:
 * there is no candidate, runtime, model, provider, benchmark runner or
 * scheduler behind this module.
 *
 * Invariants (full statement in
 * `docs/architecture/ai-gold-decision-evaluation-set.md`):
 *
 *  1. Candidates may produce answers. Evaluators may measure them.
 *     Candidates may not define their own truth.
 *  2. A benchmark is invalid if the candidate can influence the answer
 *     key, case selection, scoring policy or evaluation split.
 *  3. Every label is justified by a declared labeling rule applied to
 *     declared bounded facts. No label comes from a candidate output.
 *  4. Gold truth is synthetic only in `1.0.0`: no customer, production,
 *     provider, model, credential or private-reasoning content.
 *  5. Confidence is not correctness. A high-confidence wrong answer is
 *     an incorrect decision; probability-derived metrics are evidence
 *     about uncalibrated candidate reports, never calibration claims.
 *  6. Evaluation metrics are evidence, not authority. No metric grants
 *     promotion, routing, traffic or a universal winner.
 *  7. Scoring semantics are versioned. Changing a rule requires a new
 *     scoring policy identifier, never a rewrite of historical results.
 *  8. A Gold Decision Set cannot approve itself. `1.0.0` admits only the
 *     review states `draft` and `in_review`; publication requires a
 *     future governed human-review binding of the exact dataset hash.
 *  9. `1.0.0` sets are synthetic conformance benchmarks: never
 *     domain-representative and never, by themselves, promotion evidence.
 *     Passing proves conformance to bounded synthetic decision workloads,
 *     not competence on real trade documents, regulations or operations.
 * 10. Public test is not blind holdout. Every case, including the `test`
 *     split, is public in the repository; results are never proof of
 *     unseen generalization.
 */

import type {
  TypedDecisionAbstentionReason,
  TypedDecisionRequest,
  TypedDecisionType,
} from "../decision/contracts.js";
import type { TypedDecisionIssueCode } from "../decision/validation.js";

export const GOLD_DECISION_CONTRACT_VERSION = "1.0.0" as const;
export const SUPPORTED_GOLD_DECISION_CONTRACT_MAJORS = [1] as const;

/**
 * The only scoring policy defined in `1.0.0`. Scoring rules are frozen
 * under this identifier; a change in semantics requires a new
 * identifier and leaves results computed under this one untouched.
 */
export const GOLD_DECISION_SCORING_POLICY_ID =
  "gold-decision-scoring-v1" as const;
export const GOLD_DECISION_SCORING_POLICIES = [
  GOLD_DECISION_SCORING_POLICY_ID,
] as const;
export type GoldDecisionScoringPolicyId =
  (typeof GOLD_DECISION_SCORING_POLICIES)[number];

/**
 * Evaluation purposes. `1.0.0` admits exactly one: a synthetic
 * conformance benchmark (evaluation hierarchy level 0). It measures
 * conformance to bounded synthetic decision workloads and is never
 * evidence of real-world trade-domain competence. Reviewed domain
 * benchmarks (level 1) and blind/sealed holdouts (level 2) are future
 * work and require their own reviewed contract versions.
 */
export const GOLD_DECISION_EVALUATION_PURPOSES = [
  "synthetic_conformance",
] as const;
export type GoldDecisionEvaluationPurpose =
  (typeof GOLD_DECISION_EVALUATION_PURPOSES)[number];

/**
 * Case visibility. Every `1.0.0` case, including the `test` split, is
 * stored in the repository: the test split is a public reproducibility
 * split, not a blind holdout, and its results are never proof of unseen
 * generalization.
 */
export const GOLD_DECISION_CASE_VISIBILITIES = ["public"] as const;
export type GoldDecisionCaseVisibility =
  (typeof GOLD_DECISION_CASE_VISIBILITIES)[number];

/** The only split policy defined in `1.0.0`. */
export const GOLD_DECISION_SPLIT_POLICY_ID = "gold-decision-split-v1" as const;

/**
 * Evaluation splits. Assignment is explicit per case and is part of both
 * the case hash and the dataset hash, so it cannot change silently.
 */
export const GOLD_DECISION_SPLITS = [
  "development",
  "validation",
  "test",
] as const;
export type GoldDecisionSplit = (typeof GOLD_DECISION_SPLITS)[number];

/**
 * Whether a candidate may, must or must not abstain on a case.
 *  - `required`: the bounded state does not support any answer in the
 *    output domain; the only correct behaviour is to abstain.
 *  - `allowed`: the case has an answer; abstaining is not an error but
 *    reduces coverage.
 *  - `not_allowed`: the case has a deterministic answer; abstaining is
 *    an incorrect abstention.
 */
export const GOLD_DECISION_ABSTENTION_POLICIES = [
  "required",
  "allowed",
  "not_allowed",
] as const;
export type GoldDecisionAbstentionPolicy =
  (typeof GOLD_DECISION_ABSTENTION_POLICIES)[number];

/** Language slices. Every case declares exactly one. */
export const GOLD_DECISION_LANGUAGES = [
  "es-AR",
  "en",
  "pt-BR",
  "mixed",
] as const;
export type GoldDecisionLanguage = (typeof GOLD_DECISION_LANGUAGES)[number];

/**
 * Jurisdiction slices. `NONE` is used for generic document and workflow
 * cases. A case with any other value is a synthetic regulatory scenario
 * and must carry the `synthetic_regulatory_scenario` tag; it encodes no
 * real legal requirement.
 */
export const GOLD_DECISION_JURISDICTIONS = [
  "AR",
  "BR",
  "UY",
  "PY",
  "CL",
  "NONE",
] as const;
export type GoldDecisionJurisdiction =
  (typeof GOLD_DECISION_JURISDICTIONS)[number];

export const GOLD_DECISION_SYNTHETIC_REGULATORY_TAG =
  "synthetic_regulatory_scenario" as const;

/**
 * Gold truth is synthetic in `1.0.0`. Case capability identifiers live
 * in the AI-140 non-catalog namespace and are never registered
 * capabilities.
 */
export const GOLD_DECISION_CAPABILITY_PREFIX = "synthetic.decision." as const;

export const GOLD_DECISION_SOURCE_KINDS = ["synthetic_construction"] as const;
export const GOLD_DECISION_AUTHORING_METHODS = ["repository_fixture"] as const;

/**
 * Dataset review states admitted by `1.0.0`: a strict subset of the
 * repository's existing gold review vocabulary (`GOLD_REVIEW_STATUSES`:
 * draft, in_review, approved, rejected).
 *
 * `approved` is deliberately NOT admitted. A JSON document can never
 * grant itself evaluation authority: publication requires binding the
 * exact `dataset_hash` to the existing governed human-review authority,
 * which is a later, separately reviewed change. Until then no Gold
 * Decision Set is published evaluation authority, and there is no
 * approval reference field to self-declare.
 */
export const GOLD_DECISION_SET_REVIEW_STATES = ["draft", "in_review"] as const;
export type GoldDecisionSetReviewState =
  (typeof GOLD_DECISION_SET_REVIEW_STATES)[number];

export const GOLD_DECISION_LIMITS = {
  max_cases: 1000,
  max_tags: 16,
  max_evidence_basis: 32,
  max_labeling_rules: 64,
  max_rule_statement_length: 1000,
} as const;

export const GOLD_DECISION_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,127}$/;
export const GOLD_DECISION_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

// ---------------------------------------------------------------------
// Expected answers
// ---------------------------------------------------------------------

export interface GoldChoiceExpectation {
  readonly kind: "choice";
  /** A candidate declared in the request output domain. */
  readonly expected_candidate_id: string;
}

export interface GoldBooleanExpectation {
  readonly kind: "boolean";
  /** No probability threshold is encoded; only the value is truth. */
  readonly expected_value: boolean;
}

export interface GoldScoreExactExpectation {
  readonly kind: "score";
  readonly scale_id: string;
  readonly match: "exact";
  readonly expected_value: number;
}

/**
 * A declared acceptable band on the declared scale (pending governed
 * human review with its dataset). Every value in
 * `[acceptable_minimum, acceptable_maximum]` is correct. There is no
 * fuzzy scoring: the band is declared by the case, not inferred.
 */
export interface GoldScoreRangeExpectation {
  readonly kind: "score";
  readonly scale_id: string;
  readonly match: "acceptable_range";
  readonly acceptable_minimum: number;
  readonly acceptable_maximum: number;
}

export type GoldScoreExpectation =
  | GoldScoreExactExpectation
  | GoldScoreRangeExpectation;

export interface GoldRankingExpectation {
  readonly kind: "ranking";
  /** Exact expected order; a permutation of the request candidates. */
  readonly expected_order: readonly string[];
}

/** Only admitted with `abstention_policy: "required"`. */
export interface GoldAbstentionExpectation {
  readonly kind: "abstention";
}

export type GoldDecisionExpectation =
  | GoldChoiceExpectation
  | GoldBooleanExpectation
  | GoldScoreExpectation
  | GoldRankingExpectation
  | GoldAbstentionExpectation;

// ---------------------------------------------------------------------
// Case
// ---------------------------------------------------------------------

export interface GoldDecisionProvenance {
  readonly source_kind: (typeof GOLD_DECISION_SOURCE_KINDS)[number];
  readonly authoring_method: (typeof GOLD_DECISION_AUTHORING_METHODS)[number];
  /** A labeling rule declared by the containing Gold Decision Set. */
  readonly labeling_rule_id: string;
  /**
   * Fact identifiers of the request's bounded state from which the
   * expected answer follows under the labeling rule. Strictly ascending.
   */
  readonly evidence_basis: readonly string[];
  /** Constant: no label is derived from any candidate output. */
  readonly candidate_generated: false;
}

export interface GoldDecisionCase {
  readonly contract: "gold_decision_case";
  readonly schema_version: string;
  readonly case_id: string;
  readonly dataset_id: string;
  readonly dataset_version: string;
  readonly split: GoldDecisionSplit;
  /** The exact AI-140 request a candidate is shown. */
  readonly request: TypedDecisionRequest;
  readonly expected: GoldDecisionExpectation;
  readonly abstention_policy: GoldDecisionAbstentionPolicy;
  /**
   * Cases sharing a group present the same semantic question in a
   * different option order (same `semantic_request_hash`, different
   * `request_hash`) and must share the same truth and split.
   */
  readonly permutation_group_id: string | null;
  readonly provenance: GoldDecisionProvenance;
  readonly language: GoldDecisionLanguage;
  readonly jurisdiction: GoldDecisionJurisdiction;
  /** Strictly ascending, unique identifiers. */
  readonly tags: readonly string[];
  readonly case_hash: string;
}

// ---------------------------------------------------------------------
// Set manifest
// ---------------------------------------------------------------------

export interface GoldDecisionLabelingRule {
  readonly rule_id: string;
  readonly capability_id: string;
  /**
   * Declarative labeling rule pending governed human review with its
   * dataset. Never model reasoning.
   */
  readonly statement: string;
}

export interface GoldDecisionSplitPolicy {
  readonly policy_id: typeof GOLD_DECISION_SPLIT_POLICY_ID;
  readonly assignment: "explicit_per_case";
  readonly splits: readonly GoldDecisionSplit[];
  /** Future training work may never read the test split. */
  readonly test_split_training_use: "forbidden";
  /** Candidates never choose which cases they are scored on. */
  readonly candidate_case_selection: "forbidden";
  /** Every member of a permutation group shares one split. */
  readonly permutation_groups_share_split: true;
  /** Every case, test split included, is public in the repository. */
  readonly case_visibility: GoldDecisionCaseVisibility;
  /** Constant: the public test split is not a blind/sealed holdout. */
  readonly blind_holdout: false;
}

export interface GoldDecisionSetEntry {
  readonly case_id: string;
  readonly case_hash: string;
  readonly split: GoldDecisionSplit;
}

export interface GoldDecisionSetReview {
  /** `draft` or `in_review`; never self-declared `approved`. */
  readonly state: GoldDecisionSetReviewState;
  /**
   * Always `true`: a Gold Decision Set only becomes evaluation authority
   * through a future governed human-review binding of its exact hash.
   */
  readonly human_review_required: true;
}

export interface GoldDecisionSetCreatedFrom {
  readonly source_kind: (typeof GOLD_DECISION_SOURCE_KINDS)[number];
  readonly authoring_method: (typeof GOLD_DECISION_AUTHORING_METHODS)[number];
  readonly customer_data: false;
  readonly production_data: false;
  readonly candidate_generated_labels: false;
}

/** Map from slice key to case count; keys must match recomputed counts. */
export type GoldDecisionDistribution = Readonly<Record<string, number>>;

export interface GoldDecisionSet {
  readonly contract: "gold_decision_set";
  readonly schema_version: string;
  readonly dataset_id: string;
  readonly dataset_version: string;
  readonly scoring_policy: GoldDecisionScoringPolicyId;
  /** `synthetic_conformance` only in `1.0.0`. */
  readonly evaluation_purpose: GoldDecisionEvaluationPurpose;
  /** Constant: synthetic cases never represent real trade-domain work. */
  readonly domain_representative: false;
  /** Constant: results on this set never, by themselves, authorize promotion. */
  readonly promotion_eligible: false;
  readonly split_policy: GoldDecisionSplitPolicy;
  readonly review: GoldDecisionSetReview;
  readonly created_from: GoldDecisionSetCreatedFrom;
  /** Previous version this one supersedes, or `null` for the first. */
  readonly supersedes: {
    readonly dataset_version: string;
    readonly dataset_hash: string;
  } | null;
  readonly labeling_rules: readonly GoldDecisionLabelingRule[];
  /** Strictly ascending by `case_id`. */
  readonly cases: readonly GoldDecisionSetEntry[];
  readonly split_distribution: GoldDecisionDistribution;
  readonly decision_type_distribution: GoldDecisionDistribution;
  readonly language_distribution: GoldDecisionDistribution;
  readonly jurisdiction_distribution: GoldDecisionDistribution;
  readonly capability_distribution: GoldDecisionDistribution;
  readonly dataset_hash: string;
}

// ---------------------------------------------------------------------
// Case evaluation
// ---------------------------------------------------------------------

export const GOLD_DECISION_OUTCOMES = [
  "correct_decision",
  "incorrect_decision",
  "correct_abstention",
  "permitted_abstention",
  "incorrect_abstention",
  "no_decision",
  "invalid_result",
] as const;
export type GoldDecisionOutcome = (typeof GOLD_DECISION_OUTCOMES)[number];

export const GOLD_DECISION_CORRECTNESS = [
  "correct",
  "incorrect",
  "not_applicable",
] as const;
export type GoldDecisionCorrectness =
  (typeof GOLD_DECISION_CORRECTNESS)[number];

export const GOLD_DECISION_ABSTENTION_OUTCOMES = [
  "not_abstained",
  "correct",
  "permitted",
  "incorrect",
] as const;
export type GoldDecisionAbstentionOutcome =
  (typeof GOLD_DECISION_ABSTENTION_OUTCOMES)[number];

/** Stable machine codes explaining a non-correct case outcome. */
export const GOLD_DECISION_EVALUATION_ERROR_CODES = [
  "result_contract_invalid",
  "result_request_binding_invalid",
  "result_blocked",
  "result_failed",
  "decision_on_abstention_required_case",
  "abstention_not_allowed",
  "expected_candidate_mismatch",
  "expected_value_mismatch",
  "score_outside_expected",
  "ranking_order_mismatch",
] as const;
export type GoldDecisionEvaluationErrorCode =
  (typeof GOLD_DECISION_EVALUATION_ERROR_CODES)[number];

/**
 * Probability evidence for a Brier-style squared error. Values are exact
 * integers in micros² (`(p_micros - y_micros)²`, summed over classes for
 * `choice_multiclass`). Present only for succeeded decisions on answered
 * cases that carried probability evidence; never a calibration claim.
 */
export interface GoldProbabilityEvidence {
  readonly kind: "choice_multiclass" | "boolean_binary";
  readonly squared_error_micros2: number;
}

export interface GoldScoreError {
  readonly scale_id: string;
  /** Distance to the nearest acceptable value (0 when correct). */
  readonly absolute_error: number;
}

export interface GoldDecisionCaseEvaluation {
  readonly contract: "gold_decision_case_evaluation";
  readonly schema_version: string;
  readonly scoring_policy: GoldDecisionScoringPolicyId;
  readonly case_id: string;
  readonly case_hash: string;
  readonly dataset_id: string;
  readonly dataset_version: string;
  readonly split: GoldDecisionSplit;
  readonly decision_type: TypedDecisionType;
  readonly capability_id: string;
  readonly language: GoldDecisionLanguage;
  readonly jurisdiction: GoldDecisionJurisdiction;
  readonly abstention_policy: GoldDecisionAbstentionPolicy;
  /** Recomputed by the evaluator; `null` if the result is not hashable. */
  readonly candidate_result_hash: string | null;
  readonly outcome: GoldDecisionOutcome;
  readonly correctness: GoldDecisionCorrectness;
  readonly abstention_outcome: GoldDecisionAbstentionOutcome;
  readonly abstention_reason_code: TypedDecisionAbstentionReason | null;
  readonly score_error: GoldScoreError | null;
  readonly probability_evidence: GoldProbabilityEvidence | null;
  /** Strictly ascending. */
  readonly error_codes: readonly GoldDecisionEvaluationErrorCode[];
  /** AI-140 issue codes of an invalid result; strictly ascending. */
  readonly result_issue_codes: readonly TypedDecisionIssueCode[];
  readonly evaluation_hash: string;
}

// ---------------------------------------------------------------------
// Aggregate report
// ---------------------------------------------------------------------

/**
 * Exact rational in lowest terms, as unsigned decimal strings (the
 * repository `Rational` shape). `null` where the denominator would be
 * zero; nothing is reported as a floating-point value.
 */
export interface GoldDecisionRatio {
  readonly numerator: string;
  readonly denominator: string;
}

export interface GoldDecisionScoreScaleMetrics {
  readonly scale_id: string;
  readonly scored_decisions: number;
  readonly exact_or_in_range: number;
  /** Unsigned decimal string; exact at any size. */
  readonly sum_absolute_error: string;
  readonly mean_absolute_error: GoldDecisionRatio | null;
}

export interface GoldDecisionBrierMetrics {
  readonly eligible_decisions: number;
  readonly decisions_without_probability: number;
  readonly sum_squared_error_micros2: string;
  /** Mean squared error as a fraction of `1` (micros² normalized). */
  readonly brier_score: GoldDecisionRatio | null;
}

export interface GoldDecisionMetrics {
  readonly total_cases: number;
  readonly valid_results: number;
  readonly invalid_results: number;
  readonly decisions: number;
  readonly correct_decisions: number;
  readonly incorrect_decisions: number;
  readonly abstentions: number;
  readonly correct_abstentions: number;
  readonly permitted_abstentions: number;
  readonly incorrect_abstentions: number;
  readonly no_decisions: number;
  readonly abstention_required_cases: number;
  /** (correct_decisions + correct_abstentions) / total_cases. */
  readonly accuracy: GoldDecisionRatio | null;
  /** decisions / total_cases. */
  readonly coverage: GoldDecisionRatio | null;
  /** correct_decisions / decisions (selective accuracy). */
  readonly accuracy_at_coverage: GoldDecisionRatio | null;
  /** abstentions / total_cases. */
  readonly abstention_rate: GoldDecisionRatio | null;
  readonly brier_choice_multiclass: GoldDecisionBrierMetrics;
  readonly brier_boolean_binary: GoldDecisionBrierMetrics;
  /** Per declared scale only; scales are never mixed. */
  readonly score_error_by_scale: readonly GoldDecisionScoreScaleMetrics[];
}

export const GOLD_DECISION_SLICE_DIMENSIONS = [
  "capability_id",
  "decision_type",
  "jurisdiction",
  "language",
  "split",
] as const;
export type GoldDecisionSliceDimension =
  (typeof GOLD_DECISION_SLICE_DIMENSIONS)[number];

export interface GoldDecisionSlice {
  readonly key: string;
  readonly metrics: GoldDecisionMetrics;
}

export type GoldDecisionSplitScope = "all" | GoldDecisionSplit;

export interface GoldDecisionEvaluationReport {
  readonly contract: "gold_decision_evaluation_report";
  readonly schema_version: string;
  readonly scoring_policy: GoldDecisionScoringPolicyId;
  readonly dataset_id: string;
  readonly dataset_version: string;
  readonly dataset_hash: string;
  readonly dataset_review_state: GoldDecisionSetReviewState;
  /** Propagated from the manifest: what these metrics can and cannot mean. */
  readonly evaluation_purpose: GoldDecisionEvaluationPurpose;
  readonly domain_representative: false;
  readonly promotion_eligible: false;
  /** Propagated from the split policy: results are not blind-holdout evidence. */
  readonly case_visibility: GoldDecisionCaseVisibility;
  readonly blind_holdout: false;
  /** Which cases the report covers; every case in scope is required. */
  readonly split_scope: GoldDecisionSplitScope;
  /** Evaluation hashes in ascending `case_id` order. */
  readonly evaluation_hashes: readonly string[];
  readonly overall: GoldDecisionMetrics;
  readonly slices: Readonly<
    Record<GoldDecisionSliceDimension, readonly GoldDecisionSlice[]>
  >;
  /** Constant: metrics are evidence, not authority. */
  readonly authority: "evidence_only";
  /** Constant: no confidence or probability is claimed calibrated. */
  readonly calibration_claimed: false;
  /** Constant: no candidate is ranked, promoted or declared a winner. */
  readonly universal_winner: false;
  readonly report_hash: string;
}

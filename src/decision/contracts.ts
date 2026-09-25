/**
 * AI-140 — Governed Typed Decision Plane: contract types.
 *
 * This module defines the provider-neutral, model-neutral contract for
 * typed decision intelligence. A typed decision is a bounded question
 * over bounded state with an explicitly declared output domain
 * (choice, boolean, score, ranking) whose answer is a typed value or an
 * explicit abstention.
 *
 * The contract is foundational only. It introduces no runtime, model,
 * provider, gateway, adapter, scheduler, transport, credential or
 * execution path. Every result admitted by contract `1.0.0` is a
 * synthetic fixture (`result_origin: "synthetic_fixture"`).
 *
 * Invariants (full statement in
 * `docs/architecture/ai-typed-decision-plane.md`):
 *
 *  1. A confidence or probability value is evidence about a model
 *     output, not authority to act. `confidence != probability of truth`
 *     unless a future reviewed calibration artifact establishes a
 *     bounded empirical interpretation; `calibration_ref` is therefore
 *     always `null` in `1.0.0`.
 *  2. Typed decision execution may recommend abstention or escalation,
 *     but escalation must be governed explicitly and must never behave
 *     as an implicit fallback. `escalation.executed` is always `false`
 *     and `escalation.governed_policy_ref` is always `null`.
 *  3. A `succeeded` result is not an approval. `downstream_allowed` is
 *     always `false` and `approval_state` is never `approved` on a
 *     typed decision result; approval belongs to the existing human
 *     review capability.
 *  4. Candidate identity is stable and independent of display order.
 *     Probability distributions are expressed in canonical ascending
 *     `candidate_id` order and never by array position alone.
 *  5. Probabilities are exact integers in parts-per-million
 *     (`probability_micros`). Malformed distributions fail closed; they
 *     are never normalized or repaired.
 *  6. No private reasoning, chain-of-thought, provider, model,
 *     credential, transport or reviewer-identity field is admitted.
 */

import type { ResultGovernance } from "../capabilities/contracts.js";

export const TYPED_DECISION_CONTRACT_VERSION = "1.0.0" as const;
export const SUPPORTED_TYPED_DECISION_CONTRACT_MAJORS = [1] as const;

/**
 * Execution paradigms recognised by AI LAB. This is vocabulary only in
 * `1.0.0`: no router, registry, capability or profile consumes it, and
 * naming a paradigm never selects or activates an execution path.
 *
 *  - `deterministic`: repository-owned code applying reviewed rules.
 *  - `typed_decision`: a bounded question answered with a typed value
 *    from an explicitly declared output domain, or an abstention.
 *  - `frontier_reasoning`: open-ended generative reasoning by a
 *    frontier model behind the existing governed gateway chain.
 */
export const EXECUTION_PARADIGMS = [
  "deterministic",
  "typed_decision",
  "frontier_reasoning",
] as const;
export type ExecutionParadigm = (typeof EXECUTION_PARADIGMS)[number];

/** Execution paradigm routing is not implemented. */
export const EXECUTION_PARADIGM_ROUTING_ENABLED = false as const;

export const TYPED_DECISION_TYPES = [
  "choice",
  "boolean",
  "score",
  "ranking",
] as const;
export type TypedDecisionType = (typeof TYPED_DECISION_TYPES)[number];

export const TYPED_DECISION_RESULT_STATUSES = [
  "succeeded",
  "abstained",
  "blocked",
  "failed",
] as const;
export type TypedDecisionResultStatus =
  (typeof TYPED_DECISION_RESULT_STATUSES)[number];

/** Stable machine reason codes for an intentional abstention. */
export const TYPED_DECISION_ABSTENTION_REASONS = [
  "insufficient_confidence",
  "insufficient_evidence",
  "ambiguous",
  "unsupported_input",
  "policy_blocked",
] as const;
export type TypedDecisionAbstentionReason =
  (typeof TYPED_DECISION_ABSTENTION_REASONS)[number];

/** Stable machine reason codes for a policy block. */
export const TYPED_DECISION_BLOCK_REASONS = [
  "execution_unavailable",
  "privacy_policy",
  "human_review_policy",
  "contract_violation",
] as const;
export type TypedDecisionBlockReason =
  (typeof TYPED_DECISION_BLOCK_REASONS)[number];

/** Stable machine reason codes for an execution failure. */
export const TYPED_DECISION_FAILURE_REASONS = [
  "execution_error",
  "timeout",
  "output_contract_violation",
] as const;
export type TypedDecisionFailureReason =
  (typeof TYPED_DECISION_FAILURE_REASONS)[number];

/**
 * Escalation recommendations are metadata only. No escalation executor
 * exists; a recommendation never invokes a provider, model or runtime.
 */
export const TYPED_DECISION_ESCALATION_RECOMMENDATIONS = [
  "none",
  "human_review",
  "governed_escalation_candidate",
] as const;
export type TypedDecisionEscalationRecommendation =
  (typeof TYPED_DECISION_ESCALATION_RECOMMENDATIONS)[number];

/**
 * Data classifications admitted by `1.0.0`. Only synthetic `public` or
 * `internal` state is admitted until a separately reviewed privacy/ZDR
 * decision exists for a typed decision sandbox.
 */
export const TYPED_DECISION_DATA_CLASSIFICATIONS = [
  "public",
  "internal",
] as const;
export type TypedDecisionDataClassification =
  (typeof TYPED_DECISION_DATA_CLASSIFICATIONS)[number];

/** The only result origin admitted by `1.0.0`: no runtime exists. */
export const TYPED_DECISION_RESULT_ORIGINS = ["synthetic_fixture"] as const;
export type TypedDecisionResultOrigin =
  (typeof TYPED_DECISION_RESULT_ORIGINS)[number];

export const CONFIDENCE_SEMANTICS = [
  "uncalibrated_candidate_reported",
] as const;
export type ConfidenceSemantics = (typeof CONFIDENCE_SEMANTICS)[number];

/** Exact probability/confidence unit: parts per million. */
export const PROBABILITY_MICROS_SCALE = 1_000_000 as const;

export const TYPED_DECISION_LIMITS = {
  max_candidates: 32,
  min_candidates: 2,
  max_facts: 64,
  max_fact_string_length: 512,
  max_question_length: 1000,
  max_label_length: 200,
  max_evidence_refs: 32,
} as const;

export const TYPED_DECISION_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,127}$/;
export const TYPED_DECISION_HASH_PATTERN = /^[a-f0-9]{64}$/;

export interface TypedDecisionCandidate {
  /** Stable identity; meaning is never encoded by array position. */
  readonly candidate_id: string;
  /** Display label; carries no machine authority. */
  readonly label: string;
}

export type TypedDecisionFactValue = string | number | boolean;

export interface TypedDecisionFact {
  readonly fact_id: string;
  readonly value_type: "string" | "integer" | "boolean";
  readonly value: TypedDecisionFactValue;
}

export interface TypedDecisionBoundedState {
  readonly facts: readonly TypedDecisionFact[];
}

export interface TypedDecisionQuestion {
  readonly question_id: string;
  readonly text: string;
}

export interface ChoiceOutputDomain {
  readonly kind: "choice";
  readonly candidates: readonly TypedDecisionCandidate[];
  readonly complete_distribution_required: boolean;
}

export interface BooleanOutputDomain {
  readonly kind: "boolean";
}

export interface ScoreOutputDomain {
  readonly kind: "score";
  readonly scale_id: string;
  readonly minimum: number;
  readonly maximum: number;
}

export interface RankingOutputDomain {
  readonly kind: "ranking";
  readonly candidates: readonly TypedDecisionCandidate[];
}

export type TypedDecisionOutputDomain =
  | ChoiceOutputDomain
  | BooleanOutputDomain
  | ScoreOutputDomain
  | RankingOutputDomain;

export interface TypedDecisionPolicy {
  readonly data_classification: TypedDecisionDataClassification;
  readonly human_review_required: boolean;
  /** Abstention is always permitted; it is never a failure. */
  readonly abstention_permitted: true;
  /** No governed escalation policy exists in `1.0.0`. */
  readonly escalation_policy_ref: null;
  /** Typed decisions declare no downstream use in `1.0.0`. */
  readonly downstream_use: "none";
}

export interface TypedDecisionEvidenceRef {
  readonly evidence_id: string;
  readonly content_hash: string;
}

export interface TypedDecisionRequest {
  readonly contract: "typed_decision_request";
  readonly schema_version: string;
  readonly request_id: string;
  readonly capability_id: string;
  readonly execution_paradigm: "typed_decision";
  readonly decision_type: TypedDecisionType;
  readonly bounded_state: TypedDecisionBoundedState;
  readonly question: TypedDecisionQuestion;
  readonly output_domain: TypedDecisionOutputDomain;
  readonly policy: TypedDecisionPolicy;
  readonly evidence_refs: readonly TypedDecisionEvidenceRef[];
}

export interface ProbabilityEntry {
  readonly candidate_id: string;
  /** Integer in `[0, 1_000_000]`. */
  readonly probability_micros: number;
}

export interface ChoiceDistribution {
  /**
   * `complete`: every request candidate appears exactly once and the
   * entries sum to exactly `1_000_000`. `partial`: a subset whose sum
   * does not exceed `1_000_000`. Entries are in strictly ascending
   * `candidate_id` order.
   */
  readonly completeness: "complete" | "partial";
  readonly entries: readonly ProbabilityEntry[];
}

export interface ChoiceDecision {
  readonly kind: "choice";
  readonly selected_candidate_id: string;
  readonly distribution: ChoiceDistribution | null;
}

export interface BooleanDecision {
  readonly kind: "boolean";
  readonly value: boolean;
  readonly probability_true_micros: number | null;
}

export interface ScoreDecision {
  readonly kind: "score";
  readonly scale_id: string;
  readonly value: number;
}

export interface RankingDecision {
  readonly kind: "ranking";
  readonly ordered_candidate_ids: readonly string[];
}

export type TypedDecisionPayload =
  | ChoiceDecision
  | BooleanDecision
  | ScoreDecision
  | RankingDecision;

export interface TypedDecisionConfidence {
  /** Integer in `[0, 1_000_000]`; evidence only, never authority. */
  readonly confidence_micros: number;
  readonly semantics: ConfidenceSemantics;
  /** Calibration claims require a future reviewed artifact. */
  readonly calibration_ref: null;
}

export interface TypedDecisionEscalation {
  readonly recommendation: TypedDecisionEscalationRecommendation;
  /** Escalation is never executed by the typed decision plane. */
  readonly executed: false;
  readonly governed_policy_ref: null;
}

export interface TypedDecisionRequestBinding {
  readonly request_id: string;
  readonly capability_id: string;
  readonly request_hash: string;
  readonly semantic_request_hash: string;
}

/**
 * Reuses the AI-71 `ResultGovernance` shape with stricter `1.0.0`
 * constraints: `downstream_allowed` is always `false` and
 * `approval_state` is never `approved` or `rejected` on a typed
 * decision result.
 */
export interface TypedDecisionGovernance extends ResultGovernance {
  readonly downstream_allowed: false;
  readonly approval_state: "pending" | "not_required";
}

export interface TypedDecisionResult {
  readonly contract: "typed_decision_result";
  readonly schema_version: string;
  readonly result_id: string;
  readonly result_origin: TypedDecisionResultOrigin;
  readonly request_binding: TypedDecisionRequestBinding;
  readonly execution_paradigm: "typed_decision";
  readonly decision_type: TypedDecisionType;
  readonly status: TypedDecisionResultStatus;
  readonly decision: TypedDecisionPayload | null;
  readonly confidence: TypedDecisionConfidence | null;
  readonly abstention: {
    readonly reason_code: TypedDecisionAbstentionReason;
  } | null;
  readonly block: { readonly reason_code: TypedDecisionBlockReason } | null;
  readonly failure: {
    readonly reason_code: TypedDecisionFailureReason;
  } | null;
  readonly escalation: TypedDecisionEscalation;
  readonly governance: TypedDecisionGovernance;
  readonly evidence_refs: readonly TypedDecisionEvidenceRef[];
  readonly result_hash: string;
}

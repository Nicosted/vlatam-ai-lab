/**
 * AI-140 — governed disposition and permutation-invariance helpers.
 *
 * These pure functions describe what AI LAB may do with a typed
 * decision result. In contract `1.0.0` the answer is always: nothing
 * with downstream or operational authority. A disposition names the
 * next governed step; it never performs it, never invokes a provider,
 * model or runtime, and never escalates automatically.
 */

import {
  PROBABILITY_MICROS_SCALE,
  type TypedDecisionRequest,
  type TypedDecisionResult,
} from "./contracts.js";
import {
  validateTypedDecisionResultForRequest,
  type TypedDecisionIssue,
} from "./validation.js";

export const TYPED_DECISION_DISPOSITIONS = [
  "candidate_result_pending_human_review",
  "candidate_result_non_authoritative",
  "abstained",
  "blocked",
  "failed",
  "invalid",
] as const;
export type TypedDecisionDispositionKind =
  (typeof TYPED_DECISION_DISPOSITIONS)[number];

export const TYPED_DECISION_NEXT_STEPS = [
  "human_review",
  "explicit_governed_escalation_decision",
  "none",
] as const;
export type TypedDecisionNextStep = (typeof TYPED_DECISION_NEXT_STEPS)[number];

export interface TypedDecisionDisposition {
  readonly disposition: TypedDecisionDispositionKind;
  readonly next_required_step: TypedDecisionNextStep;
  /** Constant: no typed decision result grants downstream authority. */
  readonly downstream_allowed: false;
  /** Constant: confidence and probability are evidence, not authority. */
  readonly authority_granted: false;
  /** Constant: escalation is never automatic or implicit. */
  readonly automatic_escalation: false;
  /** Constant: no provider, model or runtime may be invoked from here. */
  readonly provider_invocation_permitted: false;
  readonly issues: readonly TypedDecisionIssue[];
}

function disposition(
  kind: TypedDecisionDispositionKind,
  next: TypedDecisionNextStep,
  issues: readonly TypedDecisionIssue[] = [],
): TypedDecisionDisposition {
  return Object.freeze({
    disposition: kind,
    next_required_step: next,
    downstream_allowed: false,
    authority_granted: false,
    automatic_escalation: false,
    provider_invocation_permitted: false,
    issues: Object.freeze([...issues]),
  });
}

/**
 * Derives the governed disposition of a result bound to its request.
 * The disposition depends only on validity, status, the request's human
 * review requirement and the escalation recommendation; confidence and
 * probability values are deliberately not inputs.
 */
export function deriveTypedDecisionDisposition(
  result: unknown,
  request: unknown,
): TypedDecisionDisposition {
  const check = validateTypedDecisionResultForRequest(result, request);
  if (!check.ok) return disposition("invalid", "none", check.issues);
  const value = check.value;
  const reviewRequired = value.governance.human_review_required;
  switch (value.status) {
    case "succeeded":
      return reviewRequired
        ? disposition("candidate_result_pending_human_review", "human_review")
        : disposition("candidate_result_non_authoritative", "none");
    case "abstained":
      if (value.escalation.recommendation === "governed_escalation_candidate")
        return disposition(
          "abstained",
          "explicit_governed_escalation_decision",
        );
      if (value.escalation.recommendation === "human_review" || reviewRequired)
        return disposition("abstained", "human_review");
      return disposition("abstained", "none");
    case "blocked":
      return disposition("blocked", reviewRequired ? "human_review" : "none");
    case "failed":
      return disposition("failed", reviewRequired ? "human_review" : "none");
  }
}

export interface PermutationComparison {
  readonly comparable: boolean;
  readonly equivalent: boolean;
  readonly max_abs_delta_micros: number | null;
  readonly reason_codes: readonly (
    | "tolerance_invalid"
    | "pair_invalid"
    | "semantic_request_mismatch"
    | "not_succeeded_choice"
    | "distribution_not_complete"
    | "selected_candidate_differs"
  )[];
}

interface BoundPair {
  readonly request: TypedDecisionRequest;
  readonly result: TypedDecisionResult;
}

/**
 * Compares two choice results whose requests differ only in candidate
 * display order. Distributions are already in canonical ascending
 * `candidate_id` order, so the comparison is per stable candidate
 * identity, never per array position. The tolerance must be supplied
 * explicitly; there is no default.
 */
export function compareChoicePermutationInvariance(
  left: BoundPair,
  right: BoundPair,
  toleranceMicros: number,
): PermutationComparison {
  const reasons: PermutationComparison["reason_codes"][number][] = [];
  const fail = (): PermutationComparison => ({
    comparable: false,
    equivalent: false,
    max_abs_delta_micros: null,
    reason_codes: reasons,
  });
  if (
    !Number.isSafeInteger(toleranceMicros) ||
    toleranceMicros < 0 ||
    toleranceMicros > PROBABILITY_MICROS_SCALE
  ) {
    reasons.push("tolerance_invalid");
    return fail();
  }
  for (const pair of [left, right]) {
    if (!validateTypedDecisionResultForRequest(pair.result, pair.request).ok) {
      reasons.push("pair_invalid");
      return fail();
    }
  }
  if (
    left.result.request_binding.semantic_request_hash !==
    right.result.request_binding.semantic_request_hash
  ) {
    reasons.push("semantic_request_mismatch");
    return fail();
  }
  const a = left.result.decision;
  const b = right.result.decision;
  if (a?.kind !== "choice" || b?.kind !== "choice") {
    reasons.push("not_succeeded_choice");
    return fail();
  }
  if (
    a.distribution?.completeness !== "complete" ||
    b.distribution?.completeness !== "complete"
  ) {
    reasons.push("distribution_not_complete");
    return fail();
  }
  const rightById = new Map(
    b.distribution.entries.map((entry) => [
      entry.candidate_id,
      entry.probability_micros,
    ]),
  );
  let maxDelta = 0;
  for (const entry of a.distribution.entries) {
    const other = rightById.get(entry.candidate_id);
    if (other === undefined) {
      reasons.push("pair_invalid");
      return fail();
    }
    maxDelta = Math.max(maxDelta, Math.abs(entry.probability_micros - other));
  }
  if (a.selected_candidate_id !== b.selected_candidate_id)
    reasons.push("selected_candidate_differs");
  return {
    comparable: true,
    equivalent: maxDelta <= toleranceMicros && reasons.length === 0,
    max_abs_delta_micros: maxDelta,
    reason_codes: reasons,
  };
}

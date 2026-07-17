import {
  NORMALIZED_RUNTIME_EVENT_TYPES,
  TOURNAMENT_LIFECYCLE_STATES,
  type CandidateResult,
  type PromotionDecision,
  type RuntimeCandidate,
  type TournamentExecutionProfile,
  type TournamentRun,
} from "./contracts.js";
import { isLifecycleTransitionAllowed } from "./lifecycle.js";

const present = (value: unknown): boolean =>
  typeof value === "string"
    ? value.length > 0
    : value !== null && value !== undefined;

export function validateRuntimeCandidate(candidateInput: unknown): string[] {
  const errors: string[] = [];
  if (
    candidateInput === null ||
    typeof candidateInput !== "object" ||
    Array.isArray(candidateInput)
  )
    return ["runtime_contract_invalid"];
  const candidate = candidateInput as RuntimeCandidate;
  if (!present(candidate.runtime_candidate_id))
    errors.push("runtime_identity_missing");
  if (!TOURNAMENT_LIFECYCLE_STATES.includes(candidate.lifecycle_status))
    errors.push("lifecycle_invalid");
  if (
    candidate.reasoning_event_handling?.capture === "approved_summary" &&
    !candidate.reasoning_event_handling.approval_id
  )
    errors.push("reasoning_capture_approval_missing");
  if (candidate.enabled !== false) errors.push("runtime_activation_forbidden");
  if (!candidate.kill_switch?.active) errors.push("kill_switch_must_be_active");
  return errors;
}

export function validateExecutionProfile(
  profile: TournamentExecutionProfile,
  approvedEndpoints: readonly string[],
): string[] {
  const errors: string[] = [];
  if (!approvedEndpoints.includes(profile.provider_endpoint_candidate_id))
    errors.push("provider_endpoint_unapproved");
  if (!present(profile.privacy_classification))
    errors.push("privacy_classification_missing");
  if (
    profile.reasoning_capture === "approved_summary" &&
    !profile.reasoning_capture_approval_id
  )
    errors.push("reasoning_capture_approval_missing");
  if (
    profile.authorization_expires_at &&
    Date.parse(profile.authorization_expires_at) <= Date.now()
  )
    errors.push("authorization_stale");
  if (profile.enabled !== false)
    errors.push("execution_profile_activation_forbidden");
  return errors;
}

export function validateTournamentRun(run: TournamentRun): string[] {
  const errors: string[] = [];
  if (run.budget_state.exhausted) errors.push("budget_exhausted");
  if (!run.deterministic_fanout || !run.candidate_isolation)
    errors.push("run_isolation_invalid");
  if (run.evidence_refs.length === 0) errors.push("evidence_incomplete");
  return errors;
}

export function validateCandidateResult(result: CandidateResult): string[] {
  const errors: string[] = [];
  if (!result.cost_reconciliation?.reconciled)
    errors.push("cost_reconciliation_missing");
  if (result.evidence_refs.length === 0) errors.push("evidence_incomplete");
  if (
    result.disqualifying_failures.length > 0 &&
    result.status !== "disqualified"
  )
    errors.push("governance_failure_must_disqualify");
  return errors;
}

export function validatePromotionDecision(
  decision: PromotionDecision,
): string[] {
  const errors: string[] = [];
  if (decision.candidate_is_decision_maker !== false)
    errors.push("candidate_self_promotion_forbidden");
  if (!isLifecycleTransitionAllowed(decision.from_state, decision.to_state))
    errors.push("lifecycle_transition_invalid");
  if (decision.evidence_refs.length === 0) errors.push("evidence_incomplete");
  return errors;
}

export function isNormalizedRuntimeEventType(value: string): boolean {
  return (NORMALIZED_RUNTIME_EVENT_TYPES as readonly string[]).includes(value);
}

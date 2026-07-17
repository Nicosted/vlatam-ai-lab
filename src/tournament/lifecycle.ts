import type { TournamentLifecycleState } from "./contracts.js";

const TRANSITIONS: Readonly<
  Record<TournamentLifecycleState, readonly TournamentLifecycleState[]>
> = {
  discovered: ["sandbox_only", "blocked"],
  sandbox_only: ["benchmark_candidate", "suspended", "blocked"],
  benchmark_candidate: ["shadow", "degraded", "suspended", "blocked"],
  shadow: ["canary", "degraded", "suspended", "blocked"],
  canary: ["approved", "degraded", "suspended", "blocked"],
  approved: ["preferred", "degraded", "suspended", "blocked"],
  preferred: ["degraded", "suspended", "blocked"],
  degraded: ["benchmark_candidate", "suspended", "blocked"],
  suspended: ["sandbox_only", "blocked"],
  blocked: ["discovered"],
};

export function isLifecycleTransitionAllowed(
  from: TournamentLifecycleState,
  to: TournamentLifecycleState,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertGovernedLifecycleTransition(input: {
  readonly from: TournamentLifecycleState;
  readonly to: TournamentLifecycleState;
  readonly human_approved: boolean;
  readonly evidence_refs: readonly string[];
}): void {
  if (!input.human_approved || input.evidence_refs.length === 0)
    throw new Error("tournament_transition_human_evidence_required");
  if (!isLifecycleTransitionAllowed(input.from, input.to))
    throw new Error("tournament_transition_invalid");
}

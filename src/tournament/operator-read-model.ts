import type {
  RuntimeCandidate,
  TournamentLifecycleState,
} from "./contracts.js";

export interface TournamentOperatorCandidate {
  readonly candidate_id: string;
  readonly lifecycle_status: TournamentLifecycleState;
  readonly benchmark_eligible: boolean;
  readonly latest_daily_result: string | null;
  readonly latest_weekly_review: string | null;
  readonly unresolved_blockers: readonly string[];
  readonly budget_state: "disabled" | "available" | "exhausted";
  readonly kill_switch_state: "active" | "inactive";
  readonly promotion_recommendation: "none" | "defer" | "promote" | "regress";
  readonly human_decision_required: true;
}

export interface TournamentOperatorReadModel {
  readonly registered_candidates: readonly TournamentOperatorCandidate[];
  readonly write_actions_available: false;
}

export function buildTournamentOperatorReadModel(
  candidates: readonly RuntimeCandidate[],
): TournamentOperatorReadModel {
  return Object.freeze({
    registered_candidates: candidates
      .map((candidate) => ({
        candidate_id: candidate.runtime_candidate_id,
        lifecycle_status: candidate.lifecycle_status,
        benchmark_eligible:
          candidate.lifecycle_status === "benchmark_candidate" &&
          candidate.approval_state === "approved" &&
          candidate.evidence.length > 0,
        latest_daily_result: null,
        latest_weekly_review: null,
        unresolved_blockers:
          candidate.approval_state === "approved" &&
          candidate.evidence.length > 0
            ? []
            : ["human_approval_and_reviewed_evidence_required"],
        budget_state: "disabled" as const,
        kill_switch_state: candidate.kill_switch.active
          ? ("active" as const)
          : ("inactive" as const),
        promotion_recommendation: "none" as const,
        human_decision_required: true as const,
      }))
      .sort((a, b) => a.candidate_id.localeCompare(b.candidate_id)),
    write_actions_available: false as const,
  });
}

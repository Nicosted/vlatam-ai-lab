export const TOURNAMENT_CONTRACT_VERSION = "1.0.0" as const;

export const TOURNAMENT_LIFECYCLE_STATES = [
  "discovered",
  "sandbox_only",
  "benchmark_candidate",
  "shadow",
  "canary",
  "approved",
  "preferred",
  "degraded",
  "suspended",
  "blocked",
] as const;
export type TournamentLifecycleState =
  (typeof TOURNAMENT_LIFECYCLE_STATES)[number];

export const NORMALIZED_RUNTIME_EVENT_TYPES = [
  "session_started",
  "turn_started",
  "step_started",
  "action_requested",
  "action_completed",
  "input_requested",
  "authorization_required",
  "subagent_started",
  "subagent_completed",
  "structured_result_completed",
  "usage_recorded",
  "step_completed",
  "turn_completed",
  "session_waiting",
  "session_completed",
  "cancelled",
  "failed",
] as const;
export type NormalizedRuntimeEventType =
  (typeof NORMALIZED_RUNTIME_EVENT_TYPES)[number];

export type ApprovalState = "pending" | "approved" | "rejected";
export type ReasoningCapture = "disabled" | "redacted" | "approved_summary";
export type TrafficStage =
  | "synthetic_benchmark_only"
  | "shadow"
  | "canary"
  | "approved_traffic"
  | "preferred_traffic"
  | "fallback";

export interface EvidenceReference {
  readonly evidence_id: string;
  readonly content_hash: string;
  readonly reviewed_at: string;
  readonly reviewer_role: string;
}

export interface RuntimeCandidate {
  readonly schema_version: typeof TOURNAMENT_CONTRACT_VERSION;
  readonly runtime_candidate_id: string;
  readonly runtime_kind: "native" | "vendor_runtime" | "workflow_runtime";
  readonly version: string;
  readonly deployment_mode: "local_only" | "external_managed" | "hybrid";
  readonly lifecycle_status: TournamentLifecycleState;
  readonly supported_capabilities: readonly string[];
  readonly durability: {
    readonly durable: boolean;
    readonly mechanism: string;
  };
  readonly session_resume: {
    readonly sessions: boolean;
    readonly resume: "unsupported" | "token" | "event_replay" | "checkpoint";
  };
  readonly cancellation: {
    readonly supported: boolean;
    readonly semantics: string;
  };
  readonly human_review_support: boolean;
  readonly subagent_support: boolean;
  readonly sandbox_support: boolean;
  readonly observability_support: readonly string[];
  readonly reasoning_event_handling: {
    readonly capture: ReasoningCapture;
    readonly approval_id: string | null;
  };
  readonly privacy_constraints: readonly string[];
  readonly geographic_constraints: readonly string[];
  readonly cost_accounting_support: boolean;
  readonly evidence_export_support: boolean;
  readonly kill_switch: { readonly active: boolean };
  readonly approval_state: ApprovalState;
  readonly enabled: false;
  readonly evidence: readonly EvidenceReference[];
}

export interface InferenceGatewayCandidate {
  readonly schema_version: typeof TOURNAMENT_CONTRACT_VERSION;
  readonly inference_gateway_candidate_id: string;
  readonly gateway_kind: "governed_aggregator" | "vendor_gateway" | "direct";
  readonly version: string;
  readonly lifecycle_status: TournamentLifecycleState;
  readonly provider_selection_control: "ai_lab" | "gateway_policy" | "provider";
  readonly approved_provider_endpoint_ids: readonly string[];
  readonly privacy_classifications: readonly string[];
  readonly zdr_status: "verified" | "unverified" | "not_applicable";
  readonly approval_state: ApprovalState;
  readonly kill_switch: { readonly active: boolean };
  readonly enabled: false;
  readonly evidence: readonly EvidenceReference[];
}

export interface ModelCandidate {
  readonly schema_version: typeof TOURNAMENT_CONTRACT_VERSION;
  readonly model_candidate_id: string;
  readonly version: string;
  readonly lifecycle_status: TournamentLifecycleState;
  readonly supported_capabilities: readonly string[];
  readonly approved_endpoint_ids: readonly string[];
  readonly approval_state: ApprovalState;
  readonly enabled: false;
  readonly evidence: readonly EvidenceReference[];
}

export interface ProviderEndpointCandidate {
  readonly schema_version: typeof TOURNAMENT_CONTRACT_VERSION;
  readonly provider_endpoint_candidate_id: string;
  readonly provider_id: string;
  readonly endpoint_identity: string;
  readonly version: string;
  readonly lifecycle_status: TournamentLifecycleState;
  readonly region: string;
  readonly retention: string;
  readonly zdr_status: "verified" | "unverified" | "unsupported";
  readonly approval_state: ApprovalState;
  readonly enabled: false;
  readonly evidence: readonly EvidenceReference[];
}

export interface TournamentExecutionProfile {
  readonly schema_version: typeof TOURNAMENT_CONTRACT_VERSION;
  readonly execution_profile_id: string;
  readonly version: string;
  readonly capability_id: string;
  readonly runtime_candidate_id: string;
  readonly inference_gateway_candidate_id: string;
  readonly model_candidate_id: string;
  readonly provider_endpoint_candidate_id: string;
  readonly traffic_stage: TrafficStage;
  readonly privacy_classification: string;
  readonly reasoning_capture: ReasoningCapture;
  readonly reasoning_capture_approval_id: string | null;
  readonly authorization_id: string | null;
  readonly authorization_expires_at: string | null;
  readonly timeout_ms: number;
  readonly maximum_attempts: number;
  readonly approval_state: ApprovalState;
  readonly enabled: false;
}

export interface BenchmarkCaseSelection {
  readonly schema_version: typeof TOURNAMENT_CONTRACT_VERSION;
  readonly selection_id: string;
  readonly selection_hash: string;
  readonly suite_id: string;
  readonly suite_version: string;
  readonly sentinel_case_refs: readonly string[];
  readonly rotating_case_refs: readonly string[];
  readonly selected_at: string;
  readonly immutable: true;
  readonly contamination_review: "passed" | "failed" | "pending";
}

export interface NormalizedRuntimeEvent {
  readonly schema_version: typeof TOURNAMENT_CONTRACT_VERSION;
  readonly event_id: string;
  readonly event_type: NormalizedRuntimeEventType;
  readonly occurred_at: string;
  readonly run_id: string;
  readonly candidate_id: string;
  readonly correlation_id: string;
  readonly status_code: string | null;
  readonly reasoning_capture: "disabled" | "redacted";
  readonly evidence_refs: readonly string[];
}

export interface TournamentBudgetState {
  readonly budget_id: string;
  readonly window:
    | "daily_benchmark"
    | "weekly_exploration"
    | "monthly_provider_validation";
  readonly currency: "USD";
  readonly limit_units: string;
  readonly consumed_units: string;
  readonly exhausted: boolean;
}

export interface TournamentRun {
  readonly schema_version: typeof TOURNAMENT_CONTRACT_VERSION;
  readonly tournament_run_id: string;
  readonly run_date: string;
  readonly selection_ref: string;
  readonly selection_hash: string;
  readonly profile_refs: readonly string[];
  readonly deterministic_fanout: true;
  readonly candidate_isolation: true;
  readonly equivalent_policy_hash: string;
  readonly idempotency_key: string;
  readonly budget_state: TournamentBudgetState;
  readonly status: "planned" | "running" | "completed" | "failed" | "blocked";
  readonly human_review_required: true;
  readonly evidence_refs: readonly string[];
}

export type GovernanceFailure =
  | "privacy"
  | "authorization"
  | "safety"
  | "evidence"
  | "incorrect_external_action";

export interface CandidateResult {
  readonly schema_version: typeof TOURNAMENT_CONTRACT_VERSION;
  readonly candidate_result_id: string;
  readonly tournament_run_id: string;
  readonly execution_profile_ref: string;
  readonly capability_id: string;
  readonly status: "eligible" | "disqualified" | "failed";
  readonly scores: {
    readonly quality: number;
    readonly reliability: number;
    readonly tool_correctness: number;
    readonly latency: number;
    readonly cost_efficiency: number;
    readonly governance_compliance: number;
  };
  readonly disqualifying_failures: readonly GovernanceFailure[];
  readonly cost_reconciliation: {
    readonly currency: "USD";
    readonly reserved_units: string;
    readonly actual_units: string;
    readonly reconciled: true;
  };
  readonly evidence_refs: readonly string[];
}

export interface DailyTournamentReport {
  readonly schema_version: typeof TOURNAMENT_CONTRACT_VERSION;
  readonly daily_report_id: string;
  readonly report_date: string;
  readonly run_refs: readonly string[];
  readonly result_refs: readonly string[];
  readonly budget_states: readonly TournamentBudgetState[];
  readonly unresolved_blockers: readonly string[];
  readonly human_review_required: true;
  readonly evidence_refs: readonly string[];
}

export interface WeeklyTournamentReview {
  readonly schema_version: typeof TOURNAMENT_CONTRACT_VERSION;
  readonly weekly_review_id: string;
  readonly week_ending: string;
  readonly daily_report_refs: readonly string[];
  readonly rankings: {
    readonly quality: readonly string[];
    readonly value: readonly string[];
    readonly reliability: readonly string[];
    readonly privacy_governance: readonly string[];
    readonly capability_specific: Readonly<Record<string, readonly string[]>>;
  };
  readonly universal_winner: false;
  readonly reviewed_by_roles: readonly string[];
  readonly review_status: ApprovalState;
  readonly evidence_refs: readonly string[];
}

export interface PromotionDecision {
  readonly schema_version: typeof TOURNAMENT_CONTRACT_VERSION;
  readonly promotion_decision_id: string;
  readonly weekly_review_ref: string;
  readonly capability_id: string;
  readonly candidate_id: string;
  readonly from_state: TournamentLifecycleState;
  readonly to_state: TournamentLifecycleState;
  readonly decision: "approve" | "reject" | "defer";
  readonly decided_by_role: string;
  readonly candidate_is_decision_maker: false;
  readonly evidence_refs: readonly string[];
}

export interface RegressionDecision {
  readonly schema_version: typeof TOURNAMENT_CONTRACT_VERSION;
  readonly regression_decision_id: string;
  readonly capability_id: string;
  readonly candidate_id: string;
  readonly observed_state: TournamentLifecycleState;
  readonly decision: "degrade" | "suspend" | "block" | "retain";
  readonly decided_by_role: string;
  readonly evidence_refs: readonly string[];
}

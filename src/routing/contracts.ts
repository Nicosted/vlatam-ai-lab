import type { CampaignResult, RankingGate } from "../benchmark/index.js";
import type {
  CapabilityRequest,
  DataClassification,
} from "../capabilities/index.js";
import type {
  ExecutionProfile,
  ProfileLifecycleStatus,
} from "../execution/index.js";

export const ROUTING_CONTRACT_VERSION = "1.0.0" as const;
export type RoutingDecisionStatus =
  | "selected"
  | "fallback_selected"
  | "human_review_required"
  | "blocked"
  | "rejected";
export type RoutingReasonCode =
  | "REVIEWED_WINNER_ELIGIBLE"
  | "FALLBACK_ELIGIBLE"
  | "REVIEW_REQUIRED"
  | "REVIEW_REJECTED"
  | "REVIEWER_ROLE_UNAUTHORIZED"
  | "SCHEMA_OR_POLICY_INVALID"
  | "CAMPAIGN_NOT_COMPLETED"
  | "WINNER_NOT_UNIQUE"
  | "EVIDENCE_INTEGRITY_FAILED"
  | "EVIDENCE_STALE"
  | "EVIDENCE_SUPERSEDED"
  | "REVIEW_ATTESTATION_INVALID"
  | "PROFILE_REFERENCE_CONFLICT"
  | "PROFILE_INELIGIBLE"
  | "PRIVACY_INCOMPATIBLE"
  | "BUDGET_CLASS_INCOMPATIBLE"
  | "BUDGET_POLICY_INCOMPATIBLE"
  | "JURISDICTION_INCOMPATIBLE"
  | "QUALITY_GATES_UNPROVEN"
  | "FALLBACK_NOT_ALLOWED"
  | "FALLBACK_INELIGIBLE";

export interface VersionedPolicyRef {
  readonly id: string;
  readonly version: string;
}
export interface HumanReviewAttestation {
  readonly attestation_id: string;
  readonly reviewer_role: string;
  readonly decision: "approved" | "pending" | "rejected";
  readonly reviewed_at: string;
}
export interface ReviewedBenchmarkEvidenceReference {
  readonly schema_version: "1.0.0";
  readonly campaign_id: string;
  readonly campaign_version: string;
  readonly campaign_execution_id: string;
  readonly campaign_hash: string;
  readonly suite_id: string;
  readonly suite_version: string;
  readonly suite_hash: string;
  readonly ranking_policy_id: string;
  readonly ranking_policy_version: string;
  readonly selected_profile_id: string;
  readonly selected_profile_version: string;
  readonly profile_hash: string;
  readonly ranking_position: number;
  readonly evidence_created_at: string;
  readonly review?: HumanReviewAttestation;
  readonly supersession_status: "current" | "superseded";
}
export interface FallbackPolicy {
  readonly profile_id: string;
  readonly profile_version: string;
  readonly allowed_reasons: readonly RoutingReasonCode[];
}
export interface ProfileSelectionPolicy {
  readonly schema_version: "1.0.0";
  readonly policy_id: string;
  readonly policy_version: string;
  readonly capability_id: string;
  readonly permitted_lifecycle_states: readonly ProfileLifecycleStatus[];
  readonly required_benchmark_suites: readonly VersionedPolicyRef[];
  readonly required_ranking_policy: VersionedPolicyRef;
  readonly maximum_evidence_age_seconds: number;
  readonly required_quality_gates: readonly RankingGate[];
  readonly allowed_data_classifications: readonly DataClassification[];
  readonly allowed_budget_classes: readonly ExecutionProfile["eligibility"]["budget_class"][];
  readonly required_budget_policy_refs?: readonly VersionedPolicyRef[];
  readonly allowed_reviewer_roles?: readonly string[];
  readonly allowed_jurisdictions?: readonly string[];
  readonly allowed_regulatory_topics?: readonly string[];
  readonly fallback?: FallbackPolicy;
  readonly human_review: "required" | "on_policy" | "not_required";
  readonly decision_ttl_seconds?: number;
}
export interface RoutingRequest {
  readonly schema_version: "1.0.0";
  readonly request_id: string;
  readonly capability_id: string;
  readonly capability_request: CapabilityRequest;
  readonly execution_correlation_id: string;
  readonly audit_correlation_id: string;
  readonly budget_class: string;
  readonly regulatory_topic?: string;
}
export interface CandidateProfile {
  readonly profile_id: string;
  readonly profile_version: string;
  readonly canonical_profile_key: string;
  readonly profile_hash: string;
}
export interface EligibilityResult {
  readonly eligible: boolean;
  readonly reason: RoutingReasonCode;
  readonly checks: readonly {
    readonly check: string;
    readonly passed: boolean;
  }[];
}
export interface PolicyProvenance {
  readonly policy_id: string;
  readonly policy_version: string;
  readonly policy_hash: string;
}
export interface RoutingDecision {
  readonly schema_version: "1.0.0";
  readonly status: RoutingDecisionStatus;
  readonly capability_id: string;
  readonly policy: PolicyProvenance;
  readonly decision_reason: RoutingReasonCode;
  readonly decision_hash: string;
  readonly execution_correlation_id: string;
  readonly audit_correlation_id: string;
  readonly created_at: string;
  readonly expiry_at?: string;
  readonly selected_profile_id?: string;
  readonly selected_profile_version?: string;
  readonly canonical_profile_key?: string;
  readonly benchmark_evidence?: ReviewedBenchmarkEvidenceReference;
  readonly review_attestation?: HumanReviewAttestation;
  readonly eligibility?: EligibilityResult;
}
export interface RoutingInput {
  readonly policy: ProfileSelectionPolicy;
  readonly evidence: ReviewedBenchmarkEvidenceReference;
  readonly campaign_result: CampaignResult;
  readonly request: RoutingRequest;
}
export type QualityGateProof = RankingGate;

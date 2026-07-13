import type { CapabilityRequest } from "../capabilities/index.js";
import type { ProfileLifecycleStatus } from "../execution/index.js";
import type { RoutingDecision } from "../routing/index.js";

export const HANDOFF_CONTRACT_VERSION = "1.0.0" as const;
export type AuthorizationMode = "single_use" | "reusable";
export type AuthorizationDecision = "approved" | "rejected";
export type HandoffExecutionStatus =
  | "succeeded"
  | "blocked"
  | "failed"
  | "rejected";
export type HandoffRejectionReason =
  | "INVALID_REQUEST"
  | "INVALID_DECISION"
  | "DECISION_STATUS_NOT_EXECUTABLE"
  | "DECISION_EXPIRED"
  | "DECISION_FUTURE_DATED"
  | "DECISION_HASH_MISMATCH"
  | "HANDOFF_POLICY_MISMATCH"
  | "UNSUPPORTED_CONTRACT_VERSION"
  | "MALFORMED_IDENTITY"
  | "INVALID_POLICY"
  | "INVALID_AUTHORIZATION"
  | "AUTHORIZATION_BEFORE_DECISION"
  | "DECISION_EXPIRY_INVALID"
  | "POLICY_NOT_ALLOWED"
  | "PROFILE_REFERENCE_CONFLICT"
  | "PROFILE_NOT_FOUND"
  | "PROFILE_DISABLED"
  | "PROFILE_LIFECYCLE_NOT_ALLOWED"
  | "CAPABILITY_CONFLICT"
  | "PRIVACY_CLASS_NOT_ELIGIBLE"
  | "BUDGET_CLASS_NOT_ELIGIBLE"
  | "AUTHORIZATION_MISSING"
  | "AUTHORIZATION_REJECTED"
  | "AUTHORIZER_ROLE_UNAUTHORIZED"
  | "AUTHORIZATION_FUTURE_DATED"
  | "AUTHORIZATION_EXPIRED"
  | "AUTHORIZATION_MISMATCH"
  | "AUTHORIZATION_SUPERSEDED"
  | "AUTHORIZATION_ALREADY_CONSUMED"
  | "GATEWAY_EXECUTION_FAILED";

export interface HandoffAuthorizationPolicy {
  readonly schema_version: "1.0.0";
  readonly policy_id: string;
  readonly policy_version: string;
  readonly allowed_authorizer_roles: readonly string[];
  readonly allowed_routing_policies: readonly {
    readonly id: string;
    readonly version: string;
  }[];
  readonly allowed_profile_lifecycle_states: readonly ProfileLifecycleStatus[];
  readonly allowed_data_classifications: readonly string[];
  readonly allowed_budget_classes: readonly string[];
  readonly maximum_authorization_age_seconds: number;
  readonly enforce_decision_ttl: boolean;
  readonly authorization_mode: AuthorizationMode;
}
export interface AuthorizationProvenance {
  readonly authorization_id: string;
  readonly authorizer_role: string;
  readonly authorization_decision: AuthorizationDecision;
  readonly authorized_at: string;
  readonly review_attestation_reference: string;
  readonly handoff_policy_id: string;
  readonly handoff_policy_version: string;
  readonly handoff_policy_hash: string;
  readonly superseded_by?: string;
}
export interface RoutingDecisionExecutionAuthorization extends AuthorizationProvenance {
  readonly schema_version: "1.0.0";
  readonly decision_hash: string;
  readonly routing_policy_id: string;
  readonly routing_policy_version: string;
  readonly capability_id: string;
  readonly selected_profile_id: string;
  readonly selected_profile_version: string;
  readonly canonical_profile_key: string;
  readonly benchmark_evidence_reference: string;
  readonly decision_created_at: string;
  readonly decision_expiry_at?: string;
  readonly execution_correlation_id: string;
  readonly audit_correlation_id: string;
}
export interface HandoffRequest {
  readonly schema_version: "1.0.0";
  readonly handoff_id: string;
  readonly decision: RoutingDecision;
  readonly authorization: RoutingDecisionExecutionAuthorization;
  readonly capability_request: CapabilityRequest;
  readonly budget_class: string;
  readonly execution_correlation_id: string;
  readonly audit_correlation_id: string;
}
export interface HandoffValidationResult {
  readonly schema_version: "1.0.0";
  readonly handoff_id: string;
  readonly valid: boolean;
  readonly decision_hash?: string;
  readonly authorization_id?: string;
  readonly handoff_policy_hash?: string;
  readonly canonical_profile_key?: string;
  readonly rejection_reason?: HandoffRejectionReason;
}
export interface HandoffExecutionResult {
  readonly schema_version: "1.0.0";
  readonly handoff_id: string;
  readonly decision_hash: string;
  readonly authorization_id: string;
  readonly capability_id: string;
  readonly profile_id: string;
  readonly profile_version: string;
  readonly canonical_profile_key: string;
  readonly gateway_execution_id?: string;
  readonly execution_status: HandoffExecutionStatus;
  readonly gateway_audit_reference?: string;
  readonly usage_audit_reference?: string;
  readonly execution_correlation_id: string;
  readonly audit_correlation_id: string;
  readonly created_at: string;
  readonly rejection_reason?: HandoffRejectionReason;
}
export const HANDOFF_AUDIT_EVENT_TYPES = [
  "handoff_validation_started",
  "routing_decision_accepted",
  "routing_decision_rejected",
  "authorization_accepted",
  "authorization_rejected",
  "authorization_consumed",
  "execution_started",
  "execution_completed",
  "execution_failed",
  "duplicate_execution_blocked",
] as const;
export interface HandoffAuditEvent {
  readonly schema_version: "1.0.0";
  readonly event_id: string;
  readonly event_type: (typeof HANDOFF_AUDIT_EVENT_TYPES)[number];
  readonly occurred_at: string;
  readonly handoff_id: string;
  readonly decision_hash?: string;
  readonly authorization_id?: string;
  readonly capability_id?: string;
  readonly profile_key?: string;
  readonly execution_correlation_id: string;
  readonly audit_correlation_id: string;
  readonly reason_code?: HandoffRejectionReason;
  readonly gateway_execution_id?: string;
}

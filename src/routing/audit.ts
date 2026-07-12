import type { RoutingReasonCode } from "./contracts.js";
export const ROUTING_AUDIT_EVENT_TYPES = [
  "routing_evaluation_started",
  "evidence_accepted",
  "evidence_rejected",
  "candidate_accepted",
  "candidate_rejected",
  "fallback_evaluated",
  "profile_selected",
  "fallback_selected",
  "human_review_required",
  "routing_blocked",
  "routing_rejected",
] as const;
export type RoutingAuditEventType = (typeof ROUTING_AUDIT_EVENT_TYPES)[number];
export interface RoutingAuditEvent {
  readonly schema_version: "1.0.0";
  readonly event_id: string;
  readonly event_type: RoutingAuditEventType;
  readonly occurred_at: string;
  readonly request_id: string;
  readonly capability_id: string;
  readonly execution_correlation_id: string;
  readonly audit_correlation_id: string;
  readonly profile_key?: string;
  readonly reason_code?: RoutingReasonCode;
}
const FORBIDDEN =
  /(prompt|message|input|output|credential|secret|authorization|token|personal|email|customer|raw|context)/i;
export function assertRoutingAuditMetadataOnly(
  event: RoutingAuditEvent,
): readonly string[] {
  const errors: string[] = [];
  for (const key of Object.keys(event))
    if (FORBIDDEN.test(key)) errors.push(`forbidden field: ${key}`);
  return errors;
}

import { randomUUID } from "node:crypto";
import { normalizeAndHash } from "../evaluation/index.js";
import {
  getExecutionProfile,
  type MultiProviderGateway,
} from "../execution/index.js";
import type { RoutingDecision } from "../routing/index.js";
import { assertHandoffAuditMetadataOnly } from "./audit.js";
import {
  InMemoryAuthorizationStateStore,
  type AuthorizationStateStore,
} from "./authorization-store.js";
import {
  HANDOFF_CONTRACT_VERSION,
  type HandoffAuditEvent,
  type HandoffAuthorizationPolicy,
  type HandoffExecutionResult,
  type HandoffRejectionReason,
  type HandoffRequest,
  type HandoffValidationResult,
} from "./contracts.js";

const ID = /^[a-z0-9][a-z0-9._-]{1,127}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const HASH = /^[a-f0-9]{64}$/;
const time = (s: string | undefined) =>
  s === undefined ? undefined : Date.parse(s);
const decisionHash = (decision: RoutingDecision) => {
  const base = Object.fromEntries(
    Object.entries(decision).filter(([key]) => key !== "decision_hash"),
  );
  return normalizeAndHash(base).hash;
};
export interface ReviewedRoutingHandoffOptions {
  readonly gateway: Pick<MultiProviderGateway, "execute">;
  readonly policy: HandoffAuthorizationPolicy;
  readonly clock?: () => Date;
  readonly id?: () => string;
  readonly profileResolver?: typeof getExecutionProfile;
  readonly authorizationStore?: AuthorizationStateStore;
  readonly auditSink?: (event: HandoffAuditEvent) => void;
}
export class ReviewedRoutingDecisionHandoff {
  private readonly clock;
  private readonly id;
  private readonly resolve;
  private readonly store;
  constructor(private readonly options: ReviewedRoutingHandoffOptions) {
    this.clock = options.clock ?? (() => new Date());
    this.id = options.id ?? randomUUID;
    this.resolve = options.profileResolver ?? getExecutionProfile;
    this.store =
      options.authorizationStore ?? new InMemoryAuthorizationStateStore();
  }
  validate(request: HandoffRequest): HandoffValidationResult {
    this.audit(request, "handoff_validation_started");
    const reason = this.reason(request);
    const authorizationFailure =
      reason?.startsWith("AUTHORIZATION") ||
      reason === "AUTHORIZER_ROLE_UNAUTHORIZED";
    this.audit(
      request,
      reason && !authorizationFailure
        ? "routing_decision_rejected"
        : "routing_decision_accepted",
      authorizationFailure ? undefined : reason,
    );
    if (!reason) this.audit(request, "authorization_accepted");
    else if (authorizationFailure)
      this.audit(request, "authorization_rejected", reason);
    return {
      schema_version: HANDOFF_CONTRACT_VERSION,
      handoff_id: request?.handoff_id ?? "invalid",
      valid: !reason,
      ...(request?.decision?.decision_hash
        ? { decision_hash: request.decision.decision_hash }
        : {}),
      ...(request?.authorization?.authorization_id
        ? { authorization_id: request.authorization.authorization_id }
        : {}),
      ...(request?.decision?.canonical_profile_key
        ? { canonical_profile_key: request.decision.canonical_profile_key }
        : {}),
      ...(reason ? { rejection_reason: reason } : {}),
    };
  }
  async execute(request: HandoffRequest): Promise<HandoffExecutionResult> {
    const validated = this.validate(request);
    if (!validated.valid)
      return this.result(request, "rejected", validated.rejection_reason);
    if (this.options.policy.authorization_mode === "single_use") {
      const consumed = this.store.consume(
        request.authorization.authorization_id,
        request.authorization.superseded_by !== undefined,
      );
      if (consumed !== "consumed") {
        const reason =
          consumed === "superseded"
            ? "AUTHORIZATION_SUPERSEDED"
            : "AUTHORIZATION_ALREADY_CONSUMED";
        this.audit(request, "duplicate_execution_blocked", reason);
        return this.result(request, "rejected", reason);
      }
      this.audit(request, "authorization_consumed");
    }
    this.audit(request, "execution_started");
    try {
      const outcome = await this.options.gateway.execute({
        capability_request: request.capability_request,
        execution_profile_id: request.decision.selected_profile_id!,
      });
      const status =
        outcome.result.status === "succeeded"
          ? "succeeded"
          : outcome.result.status === "failed"
            ? "failed"
            : "blocked";
      this.audit(
        request,
        status === "succeeded" ? "execution_completed" : "execution_failed",
        status === "succeeded" ? undefined : "GATEWAY_EXECUTION_FAILED",
        outcome.audit.execution_id,
      );
      return this.result(
        request,
        status,
        status === "succeeded" ? undefined : "GATEWAY_EXECUTION_FAILED",
        outcome.audit.execution_id,
        outcome.usage_audit?.execution_id,
      );
    } catch {
      this.audit(request, "execution_failed", "GATEWAY_EXECUTION_FAILED");
      return this.result(request, "failed", "GATEWAY_EXECUTION_FAILED");
    }
  }
  private reason(r: HandoffRequest): HandoffRejectionReason | undefined {
    const now = this.clock().getTime(),
      d = r?.decision,
      a = r?.authorization,
      p = this.options.policy;
    if (
      !r ||
      r.schema_version !== HANDOFF_CONTRACT_VERSION ||
      !ID.test(r.handoff_id) ||
      !d ||
      !a ||
      r.execution_correlation_id !== d.execution_correlation_id ||
      r.audit_correlation_id !== d.audit_correlation_id
    )
      return "INVALID_REQUEST";
    if (!this.validPolicy(p)) return "INVALID_REQUEST";
    if (!["selected", "fallback_selected"].includes(d.status))
      return "DECISION_STATUS_NOT_EXECUTABLE";
    const created = time(d.created_at);
    if (created === undefined || !Number.isFinite(created))
      return "INVALID_DECISION";
    if (created > now) return "DECISION_FUTURE_DATED";
    const expiry = time(d.expiry_at);
    if (
      p.enforce_decision_ttl &&
      (expiry === undefined || !Number.isFinite(expiry) || expiry < now)
    )
      return "DECISION_EXPIRED";
    if (!HASH.test(d.decision_hash) || decisionHash(d) !== d.decision_hash)
      return "DECISION_HASH_MISMATCH";
    if (
      !p.allowed_routing_policies.some(
        (x) =>
          x.id === d.policy.policy_id && x.version === d.policy.policy_version,
      )
    )
      return "POLICY_NOT_ALLOWED";
    const key = `${d.selected_profile_id}@${d.selected_profile_version}`;
    if (
      !d.selected_profile_id ||
      !d.selected_profile_version ||
      d.canonical_profile_key !== key
    )
      return "PROFILE_REFERENCE_CONFLICT";
    const profile = this.resolve(d.selected_profile_id as never);
    if (!profile) return "PROFILE_NOT_FOUND";
    if (profile.contract_version !== d.selected_profile_version)
      return "PROFILE_REFERENCE_CONFLICT";
    if (!profile.enabled) return "PROFILE_DISABLED";
    if (!p.allowed_profile_lifecycle_states.includes(profile.lifecycle_status))
      return "PROFILE_LIFECYCLE_NOT_ALLOWED";
    if (
      d.capability_id !== profile.capability_id ||
      r.capability_request.capability_id !== d.capability_id
    )
      return "CAPABILITY_CONFLICT";
    if (
      !p.allowed_data_classifications.includes(
        r.capability_request.context?.data_classification ?? "",
      )
    )
      return "PRIVACY_CLASS_NOT_ELIGIBLE";
    if (
      !p.allowed_budget_classes.includes(r.budget_class) ||
      profile.eligibility.budget_class !== r.budget_class
    )
      return "BUDGET_CLASS_NOT_ELIGIBLE";
    const authorized = time(a.authorized_at);
    if (authorized === undefined || !Number.isFinite(authorized))
      return "AUTHORIZATION_MISSING";
    if (authorized > now) return "AUTHORIZATION_FUTURE_DATED";
    if (now - authorized > p.maximum_authorization_age_seconds * 1000)
      return "AUTHORIZATION_EXPIRED";
    if (a.authorization_decision !== "approved")
      return "AUTHORIZATION_REJECTED";
    if (!p.allowed_authorizer_roles.includes(a.authorizer_role))
      return "AUTHORIZER_ROLE_UNAUTHORIZED";
    if (a.superseded_by) return "AUTHORIZATION_SUPERSEDED";
    if (
      a.decision_hash !== d.decision_hash ||
      a.routing_policy_id !== d.policy.policy_id ||
      a.routing_policy_version !== d.policy.policy_version ||
      a.capability_id !== d.capability_id ||
      a.selected_profile_id !== d.selected_profile_id ||
      a.selected_profile_version !== d.selected_profile_version ||
      a.canonical_profile_key !== key ||
      a.decision_created_at !== d.created_at ||
      a.decision_expiry_at !== d.expiry_at ||
      a.execution_correlation_id !== r.execution_correlation_id ||
      a.audit_correlation_id !== r.audit_correlation_id ||
      a.review_attestation_reference !== d.review_attestation?.attestation_id ||
      a.benchmark_evidence_reference !==
        d.benchmark_evidence?.campaign_execution_id
    )
      return "AUTHORIZATION_MISMATCH";
    return undefined;
  }
  private validPolicy(p: HandoffAuthorizationPolicy) {
    return (
      p.schema_version === HANDOFF_CONTRACT_VERSION &&
      ID.test(p.policy_id) &&
      SEMVER.test(p.policy_version) &&
      p.allowed_authorizer_roles.length > 0 &&
      p.allowed_routing_policies.length > 0 &&
      p.allowed_profile_lifecycle_states.length > 0 &&
      Number.isSafeInteger(p.maximum_authorization_age_seconds) &&
      p.maximum_authorization_age_seconds >= 0
    );
  }
  private result(
    r: HandoffRequest,
    status: HandoffExecutionResult["execution_status"],
    reason?: HandoffRejectionReason,
    execution?: string,
    usage?: string,
  ): HandoffExecutionResult {
    return {
      schema_version: HANDOFF_CONTRACT_VERSION,
      handoff_id: r?.handoff_id ?? "invalid",
      decision_hash: r?.decision?.decision_hash ?? "",
      authorization_id: r?.authorization?.authorization_id ?? "",
      capability_id: r?.decision?.capability_id ?? "",
      profile_id: r?.decision?.selected_profile_id ?? "",
      profile_version: r?.decision?.selected_profile_version ?? "",
      canonical_profile_key: r?.decision?.canonical_profile_key ?? "",
      ...(execution
        ? {
            gateway_execution_id: execution,
            gateway_audit_reference: execution,
          }
        : {}),
      ...(usage ? { usage_audit_reference: usage } : {}),
      execution_status: status,
      execution_correlation_id: r?.execution_correlation_id ?? "",
      audit_correlation_id: r?.audit_correlation_id ?? "",
      created_at: this.clock().toISOString(),
      ...(reason ? { rejection_reason: reason } : {}),
    };
  }
  private audit(
    r: HandoffRequest,
    event_type: HandoffAuditEvent["event_type"],
    reason_code?: HandoffRejectionReason,
    gateway_execution_id?: string,
  ) {
    const event: HandoffAuditEvent = {
      schema_version: HANDOFF_CONTRACT_VERSION,
      event_id: this.id(),
      event_type,
      occurred_at: this.clock().toISOString(),
      handoff_id: r?.handoff_id ?? "invalid",
      execution_correlation_id: r?.execution_correlation_id ?? "unknown",
      audit_correlation_id: r?.audit_correlation_id ?? "unknown",
      ...(r?.decision?.decision_hash
        ? { decision_hash: r.decision.decision_hash }
        : {}),
      ...(r?.authorization?.authorization_id
        ? { authorization_id: r.authorization.authorization_id }
        : {}),
      ...(r?.decision?.capability_id
        ? { capability_id: r.decision.capability_id }
        : {}),
      ...(r?.decision?.canonical_profile_key
        ? { profile_key: r.decision.canonical_profile_key }
        : {}),
      ...(reason_code ? { reason_code } : {}),
      ...(gateway_execution_id ? { gateway_execution_id } : {}),
    };
    const errors = assertHandoffAuditMetadataOnly(event);
    if (errors.length) throw new Error(errors.join(", "));
    this.options.auditSink?.(event);
  }
}

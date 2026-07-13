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
const LIFECYCLES = new Set(["production", "candidate", "shadow", "retired"]);
const CLASSIFICATIONS = new Set([
  "public",
  "internal",
  "confidential",
  "regulated",
  "restricted",
]);
const BUDGET_CLASSES = new Set(["development", "unclassified"]);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;
const unique = (values: readonly string[]) =>
  new Set(values).size === values.length;
const time = (s: string | undefined) =>
  s === undefined ? undefined : Date.parse(s);
const decisionHash = (decision: RoutingDecision) => {
  const base = Object.fromEntries(
    Object.entries(decision).filter(([key]) => key !== "decision_hash"),
  );
  return normalizeAndHash(base).hash;
};
export const handoffPolicyHash = (policy: HandoffAuthorizationPolicy) =>
  normalizeAndHash({
    schema_version: policy.schema_version,
    policy_id: policy.policy_id,
    policy_version: policy.policy_version,
    authorizer_roles: [...policy.allowed_authorizer_roles].sort(),
    routing_policies: [...policy.allowed_routing_policies].sort((a, b) =>
      `${a.id}@${a.version}`.localeCompare(`${b.id}@${b.version}`),
    ),
    profile_lifecycle_states: [
      ...policy.allowed_profile_lifecycle_states,
    ].sort(),
    data_classifications: [...policy.allowed_data_classifications].sort(),
    budget_classes: [...policy.allowed_budget_classes].sort(),
    maximum_age_seconds: policy.maximum_authorization_age_seconds,
    enforce_decision_ttl: policy.enforce_decision_ttl,
    mode: policy.authorization_mode,
  }).hash;
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
      reason === "AUTHORIZER_ROLE_UNAUTHORIZED" ||
      reason === "HANDOFF_POLICY_MISMATCH";
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
        expected_profile_contract_version:
          request.decision.selected_profile_version!,
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
    if (!isRecord(r) || !isRecord(d) || !isRecord(a) || !isRecord(p))
      return "INVALID_REQUEST";
    if (
      r.schema_version !== HANDOFF_CONTRACT_VERSION ||
      d.schema_version !== HANDOFF_CONTRACT_VERSION ||
      a.schema_version !== HANDOFF_CONTRACT_VERSION ||
      p.schema_version !== HANDOFF_CONTRACT_VERSION
    )
      return "UNSUPPORTED_CONTRACT_VERSION";
    if (!this.validPolicy(p)) return "INVALID_POLICY";
    if (
      !ID.test(r.handoff_id) ||
      !ID.test(r.execution_correlation_id) ||
      !ID.test(r.audit_correlation_id) ||
      !isRecord(r.capability_request) ||
      !ID.test(String(r.capability_request.request_id)) ||
      !ID.test(String(r.capability_request.capability_id)) ||
      !nonEmpty(r.budget_class) ||
      !isRecord(d.policy) ||
      !ID.test(String(d.capability_id)) ||
      !ID.test(String(d.policy.policy_id)) ||
      !SEMVER.test(String(d.policy.policy_version)) ||
      !HASH.test(String(d.policy.policy_hash)) ||
      !ID.test(String(d.execution_correlation_id)) ||
      !ID.test(String(d.audit_correlation_id)) ||
      !HASH.test(String(d.decision_hash)) ||
      !isRecord(d.benchmark_evidence) ||
      !ID.test(String(d.benchmark_evidence.campaign_execution_id)) ||
      !isRecord(d.review_attestation) ||
      !ID.test(String(d.review_attestation.attestation_id)) ||
      !ID.test(String(a.authorization_id)) ||
      !ID.test(String(a.authorizer_role)) ||
      !["approved", "rejected"].includes(String(a.authorization_decision)) ||
      !ID.test(String(a.routing_policy_id)) ||
      !SEMVER.test(String(a.routing_policy_version)) ||
      !ID.test(String(a.capability_id)) ||
      !ID.test(String(a.selected_profile_id)) ||
      !SEMVER.test(String(a.selected_profile_version)) ||
      !ID.test(String(a.execution_correlation_id)) ||
      !ID.test(String(a.audit_correlation_id)) ||
      !ID.test(String(a.benchmark_evidence_reference)) ||
      !ID.test(String(a.review_attestation_reference)) ||
      !ID.test(String(a.handoff_policy_id)) ||
      !SEMVER.test(String(a.handoff_policy_version)) ||
      !HASH.test(String(a.handoff_policy_hash))
    )
      return "MALFORMED_IDENTITY";
    if (a.superseded_by !== undefined && !ID.test(String(a.superseded_by)))
      return "MALFORMED_IDENTITY";
    if (
      r.execution_correlation_id !== d.execution_correlation_id ||
      r.audit_correlation_id !== d.audit_correlation_id
    )
      return "INVALID_REQUEST";
    if (
      a.handoff_policy_id !== p.policy_id ||
      a.handoff_policy_version !== p.policy_version ||
      a.handoff_policy_hash !== handoffPolicyHash(p)
    )
      return "HANDOFF_POLICY_MISMATCH";
    if (!["selected", "fallback_selected"].includes(d.status))
      return "DECISION_STATUS_NOT_EXECUTABLE";
    const created = time(d.created_at);
    if (created === undefined || !Number.isFinite(created))
      return "INVALID_DECISION";
    if (created > now) return "DECISION_FUTURE_DATED";
    const expiry = time(d.expiry_at);
    if (p.enforce_decision_ttl) {
      if (expiry === undefined || !Number.isFinite(expiry))
        return "DECISION_EXPIRY_INVALID";
      if (expiry <= created) return "DECISION_EXPIRY_INVALID";
      if (expiry <= now) return "DECISION_EXPIRED";
    }
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
      !ID.test(String(d.selected_profile_id)) ||
      !SEMVER.test(String(d.selected_profile_version)) ||
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
      return "INVALID_AUTHORIZATION";
    if (authorized > now) return "AUTHORIZATION_FUTURE_DATED";
    if (authorized < created) return "AUTHORIZATION_BEFORE_DECISION";
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
    const routingKeys = p.allowed_routing_policies?.map(
      (ref) => `${ref.id}@${ref.version}`,
    );
    return (
      p.schema_version === HANDOFF_CONTRACT_VERSION &&
      ID.test(p.policy_id) &&
      SEMVER.test(p.policy_version) &&
      Array.isArray(p.allowed_authorizer_roles) &&
      p.allowed_authorizer_roles.length > 0 &&
      p.allowed_authorizer_roles.every((x) => ID.test(x)) &&
      unique(p.allowed_authorizer_roles) &&
      Array.isArray(p.allowed_routing_policies) &&
      p.allowed_routing_policies.length > 0 &&
      p.allowed_routing_policies.every(
        (x) =>
          isRecord(x) &&
          ID.test(String(x.id)) &&
          SEMVER.test(String(x.version)),
      ) &&
      unique(routingKeys) &&
      Array.isArray(p.allowed_profile_lifecycle_states) &&
      p.allowed_profile_lifecycle_states.length > 0 &&
      p.allowed_profile_lifecycle_states.every((x) => LIFECYCLES.has(x)) &&
      unique(p.allowed_profile_lifecycle_states) &&
      Array.isArray(p.allowed_data_classifications) &&
      p.allowed_data_classifications.length > 0 &&
      p.allowed_data_classifications.every((x) => CLASSIFICATIONS.has(x)) &&
      unique(p.allowed_data_classifications) &&
      Array.isArray(p.allowed_budget_classes) &&
      p.allowed_budget_classes.length > 0 &&
      p.allowed_budget_classes.every((x) => BUDGET_CLASSES.has(x)) &&
      unique(p.allowed_budget_classes) &&
      Number.isSafeInteger(p.maximum_authorization_age_seconds) &&
      p.maximum_authorization_age_seconds >= 0 &&
      typeof p.enforce_decision_ttl === "boolean" &&
      ["single_use", "reusable"].includes(p.authorization_mode)
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
      ...(r?.authorization?.handoff_policy_hash
        ? { handoff_policy_hash: r.authorization.handoff_policy_hash }
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

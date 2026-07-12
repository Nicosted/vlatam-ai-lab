import { randomUUID } from "node:crypto";
import {
  benchmarkCampaignHash,
  benchmarkProfileKey,
  type BenchmarkProfileRef,
} from "../benchmark/index.js";
import { getCapabilityDefinition } from "../capabilities/index.js";
import { normalizeAndHash } from "../evaluation/index.js";
import {
  getExecutionProfile,
  type ExecutionProfile,
} from "../execution/index.js";
import { PrivacyEnforcer } from "../privacy/index.js";
import {
  assertRoutingAuditMetadataOnly,
  type RoutingAuditEvent,
} from "./audit.js";
import {
  ROUTING_CONTRACT_VERSION,
  type EligibilityResult,
  type ProfileSelectionPolicy,
  type RoutingDecision,
  type RoutingInput,
  type RoutingReasonCode,
} from "./contracts.js";

const ID = /^[a-z0-9][a-z0-9._-]{1,127}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const HASH = /^[a-f0-9]{64}$/;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const validRef = (value: unknown): value is { id: string; version: string } =>
  isRecord(value) &&
  ID.test(String(value.id)) &&
  SEMVER.test(String(value.version));
const refKey = (value: { id: string; version: string }) =>
  `${value.id}@${value.version}`;
const unique = (values: readonly string[]) =>
  new Set(values).size === values.length;
const validNonEmpty = (value: unknown) =>
  typeof value === "string" && value.length > 0;
const ROUTING_REASONS = new Set<RoutingReasonCode>([
  "REVIEWED_WINNER_ELIGIBLE",
  "FALLBACK_ELIGIBLE",
  "REVIEW_REQUIRED",
  "REVIEW_REJECTED",
  "REVIEWER_ROLE_UNAUTHORIZED",
  "SCHEMA_OR_POLICY_INVALID",
  "CAMPAIGN_NOT_COMPLETED",
  "WINNER_NOT_UNIQUE",
  "EVIDENCE_INTEGRITY_FAILED",
  "EVIDENCE_STALE",
  "EVIDENCE_SUPERSEDED",
  "REVIEW_ATTESTATION_INVALID",
  "PROFILE_REFERENCE_CONFLICT",
  "PROFILE_INELIGIBLE",
  "PRIVACY_INCOMPATIBLE",
  "BUDGET_CLASS_INCOMPATIBLE",
  "BUDGET_POLICY_INCOMPATIBLE",
  "JURISDICTION_INCOMPATIBLE",
  "QUALITY_GATES_UNPROVEN",
  "FALLBACK_NOT_ALLOWED",
  "FALLBACK_INELIGIBLE",
]);
export interface PolicyRouterOptions {
  readonly profileResolver?: (
    ref: BenchmarkProfileRef,
  ) => ExecutionProfile | undefined;
  readonly clock?: () => Date;
  readonly id?: () => string;
  readonly auditSink?: (event: RoutingAuditEvent) => void;
  readonly privacyEnforcer?: PrivacyEnforcer;
}
export class BestProfilePolicyRouter {
  private readonly clock;
  private readonly id;
  private readonly privacy;
  private readonly resolve;
  constructor(private readonly options: PolicyRouterOptions = {}) {
    this.clock = options.clock ?? (() => new Date());
    this.id = options.id ?? randomUUID;
    this.privacy =
      options.privacyEnforcer ?? new PrivacyEnforcer({ clock: this.clock });
    this.resolve =
      options.profileResolver ??
      ((ref) => {
        const p = getExecutionProfile(ref.profile_id as never);
        return p?.contract_version === ref.profile_version ? p : undefined;
      });
  }
  route(input: RoutingInput): RoutingDecision {
    const now = this.clock();
    const invalid = this.validatePolicyAndRequest(input);
    this.audit(input, "routing_evaluation_started");
    if (invalid) return this.finish(input, "rejected", invalid, undefined, now);
    const evidenceError = this.validateEvidence(input, now);
    if (evidenceError) {
      this.audit(input, "evidence_rejected", evidenceError);
      return this.maybeFallback(input, evidenceError, now);
    }
    this.audit(input, "evidence_accepted");
    const ref = {
      profile_id: input.evidence.selected_profile_id,
      profile_version: input.evidence.selected_profile_version,
    };
    const profile = this.resolve(ref);
    const eligibility = this.eligibility(
      input,
      profile,
      ref,
      input.evidence.profile_hash,
    );
    if (!eligibility.eligible) {
      this.audit(
        input,
        "candidate_rejected",
        eligibility.reason,
        benchmarkProfileKey(ref),
      );
      return this.maybeFallback(input, eligibility.reason, now);
    }
    this.audit(
      input,
      "candidate_accepted",
      eligibility.reason,
      benchmarkProfileKey(ref),
    );
    return this.finish(
      input,
      "selected",
      "REVIEWED_WINNER_ELIGIBLE",
      ref,
      now,
      eligibility,
    );
  }
  private validatePolicyAndRequest(
    i: RoutingInput,
  ): RoutingReasonCode | undefined {
    if (
      !isRecord(i) ||
      !isRecord(i.policy) ||
      !isRecord(i.request) ||
      !isRecord(i.request.capability_request)
    )
      return "SCHEMA_OR_POLICY_INVALID";
    const p = i.policy;
    const request = i.request;
    const capabilityRequest = request.capability_request;
    const suiteKeys = p.required_benchmark_suites?.map(refKey) ?? [];
    const budgetKeys = p.required_budget_policy_refs?.map(refKey) ?? [];
    const roles = p.allowed_reviewer_roles ?? [];
    const requiresReview =
      p.human_review === "required" || p.human_review === "on_policy";
    const fallback = p.fallback;
    if (
      p.schema_version !== ROUTING_CONTRACT_VERSION ||
      !ID.test(p.policy_id) ||
      !SEMVER.test(p.policy_version) ||
      !ID.test(p.capability_id) ||
      request.schema_version !== ROUTING_CONTRACT_VERSION ||
      !validNonEmpty(request.request_id) ||
      !validNonEmpty(request.execution_correlation_id) ||
      !validNonEmpty(request.audit_correlation_id) ||
      !validNonEmpty(request.budget_class) ||
      request.capability_id !== p.capability_id ||
      capabilityRequest.schema_version !== ROUTING_CONTRACT_VERSION ||
      !validNonEmpty(capabilityRequest.request_id) ||
      capabilityRequest.capability_id !== p.capability_id ||
      !Array.isArray(p.permitted_lifecycle_states) ||
      !p.permitted_lifecycle_states.length ||
      !Array.isArray(p.required_benchmark_suites) ||
      !p.required_benchmark_suites.length ||
      !p.required_benchmark_suites.every(validRef) ||
      !unique(suiteKeys) ||
      !validRef(p.required_ranking_policy) ||
      !Number.isSafeInteger(p.maximum_evidence_age_seconds) ||
      p.maximum_evidence_age_seconds < 0 ||
      !Array.isArray(p.required_quality_gates) ||
      !p.required_quality_gates.length ||
      new Set(p.required_quality_gates.map((gate) => gate.gate_id)).size !==
        p.required_quality_gates.length ||
      !p.required_quality_gates.every((gate) => this.validQualityGate(gate)) ||
      !Array.isArray(p.allowed_data_classifications) ||
      !p.allowed_data_classifications.length ||
      !Array.isArray(p.allowed_budget_classes) ||
      !p.allowed_budget_classes.length
    )
      return "SCHEMA_OR_POLICY_INVALID";
    if (
      p.required_budget_policy_refs &&
      (!p.required_budget_policy_refs.length ||
        !p.required_budget_policy_refs.every(validRef) ||
        !unique(budgetKeys))
    )
      return "SCHEMA_OR_POLICY_INVALID";
    if (
      requiresReview &&
      (!roles.length || !roles.every((role) => ID.test(role)) || !unique(roles))
    )
      return "SCHEMA_OR_POLICY_INVALID";
    if (
      p.allowed_reviewer_roles &&
      (!p.allowed_reviewer_roles.every((role) => ID.test(role)) ||
        !unique(p.allowed_reviewer_roles))
    )
      return "SCHEMA_OR_POLICY_INVALID";
    if (
      fallback &&
      (!ID.test(fallback.profile_id) ||
        !SEMVER.test(fallback.profile_version) ||
        !fallback.allowed_reasons.length ||
        !unique(fallback.allowed_reasons) ||
        !fallback.allowed_reasons.every((reason) =>
          ROUTING_REASONS.has(reason),
        ))
    )
      return "SCHEMA_OR_POLICY_INVALID";
    return undefined;
  }
  private validQualityGate(
    gate: ProfileSelectionPolicy["required_quality_gates"][number],
  ): boolean {
    if (!isRecord(gate) || !ID.test(String(gate.gate_id))) return false;
    if (gate.type === "minimum_score")
      return (
        isRecord(gate.minimum_score) &&
        Number.isSafeInteger(gate.minimum_score.numerator) &&
        gate.minimum_score.numerator >= 0 &&
        Number.isSafeInteger(gate.minimum_score.denominator) &&
        gate.minimum_score.denominator > 0 &&
        gate.dimension_type === undefined
      );
    if (gate.type === "dimension_perfect")
      return (
        ID.test(String(gate.dimension_type)) && gate.minimum_score === undefined
      );
    if (
      gate.type === "coverage_complete" ||
      gate.type === "no_blocked_or_rejected"
    )
      return (
        gate.minimum_score === undefined && gate.dimension_type === undefined
      );
    return false;
  }
  private validateEvidence(
    i: RoutingInput,
    now: Date,
  ): RoutingReasonCode | undefined {
    const {
      evidence: e,
      result: r,
      policy: p,
    } = { evidence: i.evidence, result: i.campaign_result, policy: i.policy };
    if (
      !isRecord(e) ||
      !isRecord(r) ||
      (!isRecord(e.review) && e.review !== undefined)
    )
      return "EVIDENCE_INTEGRITY_FAILED";
    if (
      e.schema_version !== ROUTING_CONTRACT_VERSION ||
      ![
        e.campaign_id,
        e.suite_id,
        e.ranking_policy_id,
        e.selected_profile_id,
      ].every(ID.test.bind(ID)) ||
      ![
        e.campaign_version,
        e.suite_version,
        e.ranking_policy_version,
        e.selected_profile_version,
      ].every(SEMVER.test.bind(SEMVER)) ||
      ![e.campaign_hash, e.suite_hash, e.profile_hash].every(
        HASH.test.bind(HASH),
      ) ||
      !validNonEmpty(e.campaign_execution_id) ||
      e.ranking_position !== 1 ||
      !["current", "superseded"].includes(e.supersession_status)
    )
      return "EVIDENCE_INTEGRITY_FAILED";
    if (r.status !== "completed") return "CAMPAIGN_NOT_COMPLETED";
    if (e.supersession_status !== "current") return "EVIDENCE_SUPERSEDED";
    const evidenceCreated = Date.parse(e.evidence_created_at);
    if (!Number.isFinite(evidenceCreated)) return "REVIEW_ATTESTATION_INVALID";
    if (evidenceCreated > now.getTime()) return "REVIEW_ATTESTATION_INVALID";
    const review = e.review;
    if (review === undefined) return "REVIEW_REQUIRED";
    if (
      !ID.test(review.attestation_id) ||
      !ID.test(review.reviewer_role) ||
      !["approved", "pending", "rejected"].includes(review.decision)
    )
      return "REVIEW_ATTESTATION_INVALID";
    const reviewedAt = Date.parse(review.reviewed_at);
    if (
      !Number.isFinite(reviewedAt) ||
      reviewedAt > now.getTime() ||
      reviewedAt < evidenceCreated
    )
      return "REVIEW_ATTESTATION_INVALID";
    if (!p.allowed_reviewer_roles?.includes(review.reviewer_role))
      return "REVIEWER_ROLE_UNAUTHORIZED";
    if (review.decision === "pending") return "REVIEW_REQUIRED";
    if (review.decision === "rejected") return "REVIEW_REJECTED";
    if (now.getTime() - evidenceCreated > p.maximum_evidence_age_seconds * 1000)
      return "EVIDENCE_STALE";
    if (p.required_budget_policy_refs) {
      const campaignBudget = r.campaign?.budget_policy_ref;
      if (
        !campaignBudget ||
        !p.required_budget_policy_refs.some(
          (ref) =>
            ref.id === campaignBudget.id &&
            ref.version === campaignBudget.version,
        )
      )
        return "BUDGET_POLICY_INCOMPATIBLE";
    }
    if (
      r.campaign.campaign_id !== e.campaign_id ||
      r.campaign.campaign_version !== e.campaign_version ||
      r.campaign_execution_id !== e.campaign_execution_id ||
      benchmarkCampaignHash(r.campaign) !== e.campaign_hash ||
      r.provenance.campaign_hash !== e.campaign_hash ||
      r.campaign.suite.id !== e.suite_id ||
      r.campaign.suite.version !== e.suite_version ||
      r.campaign.suite.hash !== e.suite_hash ||
      r.provenance.suite_hash !== e.suite_hash
    )
      return "EVIDENCE_INTEGRITY_FAILED";
    if (
      r.ranking.policy.id !== e.ranking_policy_id ||
      r.ranking.policy.version !== e.ranking_policy_version ||
      r.provenance.ranking_policy.id !== e.ranking_policy_id ||
      r.provenance.ranking_policy.version !== e.ranking_policy_version ||
      p.required_ranking_policy.id !== e.ranking_policy_id ||
      p.required_ranking_policy.version !== e.ranking_policy_version
    )
      return "EVIDENCE_INTEGRITY_FAILED";
    if (
      !p.required_benchmark_suites.some(
        (x) => x.id === e.suite_id && x.version === e.suite_version,
      )
    )
      return "EVIDENCE_INTEGRITY_FAILED";
    const winners = r.ranking.entries.filter((x) => x.eligible && x.rank === 1);
    if (
      !r.ranking.approved_winner ||
      winners.length !== 1 ||
      e.ranking_position !== 1
    )
      return "WINNER_NOT_UNIQUE";
    const winner = winners[0]!;
    if (
      winner.profile.profile_id !== e.selected_profile_id ||
      winner.profile.profile_version !== e.selected_profile_version
    )
      return "PROFILE_REFERENCE_CONFLICT";
    const ph = r.provenance.profile_hashes.filter(
      (x) =>
        benchmarkProfileKey(x.profile) === benchmarkProfileKey(winner.profile),
    );
    if (ph.length !== 1 || ph[0]!.hash !== e.profile_hash)
      return "EVIDENCE_INTEGRITY_FAILED";
    const summary = r.profile_summaries.find(
      (x) =>
        benchmarkProfileKey(x.profile) === benchmarkProfileKey(winner.profile),
    );
    if (
      !summary ||
      summary.suite_hash !== e.suite_hash ||
      !summary.coverage_complete
    )
      return "EVIDENCE_INTEGRITY_FAILED";
    for (const gate of p.required_quality_gates) {
      if (gate.type === "coverage_complete" && !summary.coverage_complete)
        return "QUALITY_GATES_UNPROVEN";
      if (
        gate.type === "no_blocked_or_rejected" &&
        summary.blocked_count + summary.rejected_count > 0
      )
        return "QUALITY_GATES_UNPROVEN";
      if (
        gate.type === "minimum_score" &&
        (!gate.minimum_score ||
          BigInt(summary.score.numerator) *
            BigInt(gate.minimum_score.denominator) <
            BigInt(gate.minimum_score.numerator) *
              BigInt(summary.score.denominator))
      )
        return "QUALITY_GATES_UNPROVEN";
      if (gate.type === "dimension_perfect") {
        const dimensions = summary.dimensions.filter(
          (dimension) => dimension.dimension_id === gate.dimension_type,
        );
        if (
          !dimensions.length ||
          dimensions.some(
            (dimension) => dimension.earned_units !== dimension.possible_units,
          )
        )
          return "QUALITY_GATES_UNPROVEN";
      }
    }
    if (summary.failed_count > 0) return "QUALITY_GATES_UNPROVEN";
    return undefined;
  }
  private eligibility(
    i: RoutingInput,
    p: ExecutionProfile | undefined,
    ref: BenchmarkProfileRef,
    expectedHash: string,
  ): EligibilityResult {
    const checks: { check: string; passed: boolean }[] = [];
    const add = (check: string, passed: boolean) => {
      checks.push({ check, passed });
      return passed;
    };
    if (
      !p ||
      !add(
        "exact_registry_identity",
        p.profile_id === ref.profile_id &&
          p.contract_version === ref.profile_version,
      )
    )
      return { eligible: false, reason: "PROFILE_REFERENCE_CONFLICT", checks };
    if (
      !add(
        "profile_hash",
        normalizeAndHash({ profile: ref, resolved: p }).hash === expectedHash,
      )
    )
      return { eligible: false, reason: "PROFILE_REFERENCE_CONFLICT", checks };
    if (
      !add("capability", p.capability_id === i.policy.capability_id) ||
      !add(
        "lifecycle",
        i.policy.permitted_lifecycle_states.includes(p.lifecycle_status),
      ) ||
      !add("enabled", p.enabled) ||
      !add("contract_version", p.contract_version === ref.profile_version)
    )
      return { eligible: false, reason: "PROFILE_INELIGIBLE", checks };
    if (
      !add(
        "budget_class",
        i.policy.allowed_budget_classes.includes(p.eligibility.budget_class) &&
          i.request.budget_class === p.eligibility.budget_class,
      )
    )
      return { eligible: false, reason: "BUDGET_CLASS_INCOMPATIBLE", checks };
    const j = i.request.capability_request.context?.jurisdiction;
    if (
      !add(
        "jurisdiction",
        !i.policy.allowed_jurisdictions ||
          (!!j && i.policy.allowed_jurisdictions.includes(j)),
      )
    )
      return { eligible: false, reason: "JURISDICTION_INCOMPATIBLE", checks };
    if (
      !add(
        "regulatory_topic",
        !i.policy.allowed_regulatory_topics ||
          (!!i.request.regulatory_topic &&
            i.policy.allowed_regulatory_topics.includes(
              i.request.regulatory_topic,
            )),
      )
    )
      return { eligible: false, reason: "JURISDICTION_INCOMPATIBLE", checks };
    const classification =
      i.request.capability_request.context?.data_classification;
    if (
      !add(
        "classification_policy",
        !!classification &&
          i.policy.allowed_data_classifications.includes(classification),
      )
    )
      return { eligible: false, reason: "PRIVACY_INCOMPATIBLE", checks };
    const def = getCapabilityDefinition(i.policy.capability_id as never);
    if (
      !def ||
      !add("capability_registry", def.capability_id === p.capability_id)
    )
      return { eligible: false, reason: "PROFILE_REFERENCE_CONFLICT", checks };
    const privacy = this.privacy.enforce({
      capability_request: i.request.capability_request,
      capability_definition: def,
      execution_profile: p,
      execution_id: i.request.execution_correlation_id,
    });
    if (!add("privacy_enforcement", privacy.status === "allowed"))
      return { eligible: false, reason: "PRIVACY_INCOMPATIBLE", checks };
    return { eligible: true, reason: "REVIEWED_WINNER_ELIGIBLE", checks };
  }
  private maybeFallback(
    i: RoutingInput,
    reason: RoutingReasonCode,
    now: Date,
  ): RoutingDecision {
    const prohibited: RoutingReasonCode[] = [
      "PRIVACY_INCOMPATIBLE",
      "EVIDENCE_INTEGRITY_FAILED",
      "SCHEMA_OR_POLICY_INVALID",
      "PROFILE_REFERENCE_CONFLICT",
      "REVIEW_REJECTED",
      "REVIEW_ATTESTATION_INVALID",
      "REVIEWER_ROLE_UNAUTHORIZED",
    ];
    if (
      reason === "REVIEW_REQUIRED" &&
      (i.policy.human_review === "required" ||
        i.policy.human_review === "on_policy")
    )
      return this.finish(
        i,
        "human_review_required",
        "REVIEW_REQUIRED",
        undefined,
        now,
      );
    const f = i.policy.fallback;
    if (
      !f ||
      prohibited.includes(reason) ||
      !f.allowed_reasons.includes(reason)
    )
      return this.finish(
        i,
        reason === "SCHEMA_OR_POLICY_INVALID" || reason === "REVIEW_REJECTED"
          ? "rejected"
          : "blocked",
        reason,
        undefined,
        now,
      );
    this.audit(
      i,
      "fallback_evaluated",
      reason,
      `${f.profile_id}@${f.profile_version}`,
    );
    const ref = {
      profile_id: f.profile_id,
      profile_version: f.profile_version,
    };
    const p = this.resolve(ref);
    if (!p)
      return this.finish(i, "blocked", "FALLBACK_INELIGIBLE", undefined, now);
    const hash = normalizeAndHash({ profile: ref, resolved: p }).hash;
    const eligibility = this.eligibility(i, p, ref, hash);
    if (!eligibility.eligible)
      return this.finish(
        i,
        "blocked",
        "FALLBACK_INELIGIBLE",
        undefined,
        now,
        eligibility,
      );
    return this.finish(
      i,
      "fallback_selected",
      "FALLBACK_ELIGIBLE",
      ref,
      now,
      eligibility,
    );
  }
  private finish(
    i: RoutingInput,
    status: RoutingDecision["status"],
    reason: RoutingReasonCode,
    ref: BenchmarkProfileRef | undefined,
    now: Date,
    eligibility?: EligibilityResult,
  ): RoutingDecision {
    const canonicalPolicy = {
      ...i.policy,
      required_benchmark_suites: [...i.policy.required_benchmark_suites].sort(
        (a, b) => refKey(a).localeCompare(refKey(b)),
      ),
      required_quality_gates: [...i.policy.required_quality_gates].sort(
        (a, b) => a.gate_id.localeCompare(b.gate_id),
      ),
      allowed_data_classifications: [
        ...i.policy.allowed_data_classifications,
      ].sort(),
      allowed_budget_classes: [...i.policy.allowed_budget_classes].sort(),
      ...(i.policy.required_budget_policy_refs
        ? {
            required_budget_policy_refs: [
              ...i.policy.required_budget_policy_refs,
            ].sort((a, b) => refKey(a).localeCompare(refKey(b))),
          }
        : {}),
      ...(i.policy.allowed_reviewer_roles
        ? {
            allowed_reviewer_roles: [...i.policy.allowed_reviewer_roles].sort(),
          }
        : {}),
      ...(i.policy.allowed_jurisdictions
        ? { allowed_jurisdictions: [...i.policy.allowed_jurisdictions].sort() }
        : {}),
      ...(i.policy.allowed_regulatory_topics
        ? {
            allowed_regulatory_topics: [
              ...i.policy.allowed_regulatory_topics,
            ].sort(),
          }
        : {}),
      ...(i.policy.fallback
        ? {
            fallback: {
              ...i.policy.fallback,
              allowed_reasons: [...i.policy.fallback.allowed_reasons].sort(),
            },
          }
        : {}),
    };
    const policyHash = normalizeAndHash(canonicalPolicy).hash;
    const base = {
      schema_version: ROUTING_CONTRACT_VERSION,
      status,
      capability_id: i.policy.capability_id,
      policy: {
        policy_id: i.policy.policy_id,
        policy_version: i.policy.policy_version,
        policy_hash: policyHash,
      },
      decision_reason: reason,
      execution_correlation_id: i.request.execution_correlation_id,
      audit_correlation_id: i.request.audit_correlation_id,
      created_at: now.toISOString(),
      ...(i.policy.decision_ttl_seconds === undefined
        ? {}
        : {
            expiry_at: new Date(
              now.getTime() + i.policy.decision_ttl_seconds * 1000,
            ).toISOString(),
          }),
      ...(ref
        ? {
            selected_profile_id: ref.profile_id,
            selected_profile_version: ref.profile_version,
            canonical_profile_key: benchmarkProfileKey(ref),
          }
        : {}),
      benchmark_evidence: i.evidence,
      ...(i.evidence.review ? { review_attestation: i.evidence.review } : {}),
      ...(eligibility ? { eligibility } : {}),
    };
    const decision = { ...base, decision_hash: normalizeAndHash(base).hash };
    const event =
      status === "selected"
        ? "profile_selected"
        : status === "fallback_selected"
          ? "fallback_selected"
          : status === "human_review_required"
            ? "human_review_required"
            : status === "rejected"
              ? "routing_rejected"
              : "routing_blocked";
    this.audit(i, event, reason, ref && benchmarkProfileKey(ref));
    return decision;
  }
  private audit(
    i: RoutingInput,
    event_type: RoutingAuditEvent["event_type"],
    reason_code?: RoutingReasonCode,
    profile_key?: string,
  ) {
    const event: RoutingAuditEvent = {
      schema_version: "1.0.0",
      event_id: this.id(),
      event_type,
      occurred_at: this.clock().toISOString(),
      request_id: i.request.request_id,
      capability_id: i.request.capability_id,
      execution_correlation_id: i.request.execution_correlation_id,
      audit_correlation_id: i.request.audit_correlation_id,
      ...(profile_key ? { profile_key } : {}),
      ...(reason_code ? { reason_code } : {}),
    };
    const errors = assertRoutingAuditMetadataOnly(event);
    if (errors.length) throw new Error(errors.join(", "));
    this.options.auditSink?.(event);
  }
}

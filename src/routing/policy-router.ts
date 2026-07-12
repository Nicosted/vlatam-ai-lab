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
    this.audit(input, "routing_evaluation_started");
    const invalid = this.validatePolicyAndRequest(
      input.policy,
      input.request.capability_id,
      input.request.capability_request.capability_id,
    );
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
    if (
      input.policy.human_review === "required" &&
      input.evidence.review.decision !== "approved"
    )
      return this.finish(
        input,
        "human_review_required",
        "HUMAN_REVIEW_REQUIRED",
        undefined,
        now,
        eligibility,
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
    p: ProfileSelectionPolicy,
    a: string,
    b: string,
  ): RoutingReasonCode | undefined {
    if (
      p.schema_version !== ROUTING_CONTRACT_VERSION ||
      !ID.test(p.policy_id) ||
      !SEMVER.test(p.policy_version) ||
      p.capability_id !== a ||
      a !== b ||
      !p.permitted_lifecycle_states.length ||
      !p.required_benchmark_suites.length ||
      !Number.isSafeInteger(p.maximum_evidence_age_seconds) ||
      p.maximum_evidence_age_seconds < 0 ||
      !p.required_quality_gates.length ||
      new Set(p.required_quality_gates.map((gate) => gate.gate_id)).size !==
        p.required_quality_gates.length ||
      !p.allowed_data_classifications.length ||
      !p.allowed_budget_classes.length
    )
      return "SCHEMA_OR_POLICY_INVALID";
    return undefined;
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
      e.schema_version !== ROUTING_CONTRACT_VERSION ||
      ![e.campaign_id, e.selected_profile_id, e.review.attestation_id].every(
        ID.test.bind(ID),
      ) ||
      ![
        e.campaign_version,
        e.suite_version,
        e.ranking_policy_version,
        e.selected_profile_version,
      ].every(SEMVER.test.bind(SEMVER)) ||
      ![e.campaign_hash, e.suite_hash, e.profile_hash].every(
        HASH.test.bind(HASH),
      )
    )
      return "EVIDENCE_INTEGRITY_FAILED";
    if (r.status !== "completed") return "CAMPAIGN_NOT_COMPLETED";
    if (e.supersession_status !== "current") return "EVIDENCE_SUPERSEDED";
    if (
      e.review.decision !== "approved" ||
      !Number.isFinite(Date.parse(e.review.reviewed_at)) ||
      Date.parse(e.review.reviewed_at) < Date.parse(e.evidence_created_at)
    )
      return "REVIEW_ATTESTATION_INVALID";
    if (
      now.getTime() - Date.parse(e.evidence_created_at) >
      p.maximum_evidence_age_seconds * 1000
    )
      return "EVIDENCE_STALE";
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
    ];
    if (i.policy.human_review === "required")
      return this.finish(
        i,
        "human_review_required",
        "HUMAN_REVIEW_REQUIRED",
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
        reason === "SCHEMA_OR_POLICY_INVALID" ? "rejected" : "blocked",
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
    const policyHash = normalizeAndHash(i.policy).hash;
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
      review_attestation: i.evidence.review,
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

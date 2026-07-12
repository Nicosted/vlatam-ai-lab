import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  benchmarkCampaignHash,
  type CampaignResult,
} from "../../src/benchmark/index.js";
import { normalizeAndHash } from "../../src/evaluation/index.js";
import type { ExecutionProfile } from "../../src/execution/index.js";
import {
  BestProfilePolicyRouter,
  assertRoutingAuditMetadataOnly,
  type ProfileSelectionPolicy,
  type ReviewedBenchmarkEvidenceReference,
  type RoutingAuditEvent,
  type RoutingInput,
} from "../../src/routing/index.js";
import { LOCAL_REPLAY_PRIVACY } from "../helpers/privacy.js";

const ref = { profile_id: "profile.shared", profile_version: "1.0.0" };
const profile = (version = "1.0.0"): ExecutionProfile => ({
  profile_id: "profile.shared" as never,
  capability_id: "evidence.extraction.normative_claims" as never,
  provider_id: "replay" as never,
  model_id: `fixture-${version}` as never,
  mode: "replay",
  lifecycle_status: "candidate",
  enabled: true,
  contract_version: version,
  configuration: { timeout_ms: 100, response_format: "json" },
  eligibility: {
    privacy_compatibility: "declared_not_enforced",
    budget_class: "development",
    evaluation_status: "fixture_verified",
  },
  privacy: LOCAL_REPLAY_PRIVACY,
  fixture_id: "safe",
});
const campaign = {
  schema_version: "1.0.0" as const,
  campaign_id: "campaign.router",
  campaign_version: "1.0.0",
  suite: { id: "suite.router", version: "1.0.0", hash: "a".repeat(64) },
  profiles: [ref],
  evaluator: {
    evaluator_id: "evaluation.deterministic",
    evaluator_version: "1.0.0",
  },
  ranking_policy: { id: "ranking.default", version: "1.0.0" },
  execution_mode: "replay" as const,
  concurrency_limit: 1,
  retry_policy: { max_attempts: 1, retryable_error_codes: [] },
  created_at: "2026-07-12T00:00:00.000Z",
  execution_correlation_id: "campaign.execution",
  audit_correlation_id: "campaign.audit",
};
const resolved = profile();
const profileHash = normalizeAndHash({ profile: ref, resolved }).hash;
const result: CampaignResult = {
  schema_version: "1.0.0",
  campaign,
  campaign_execution_id: "campaign-execution",
  status: "completed",
  profile_runs: [
    {
      profile: ref,
      profile_run_id: "run-1",
      audit_correlation_id: "run-audit",
      attempts: [
        {
          case_ref: { id: "case.one", version: "1.0.0" },
          profile: ref,
          attempt_id: "attempt-1",
          execution_id: "execution-1",
          audit_correlation_id: "attempt-audit",
          status: "completed",
          retry: {
            attempt_number: 1,
            max_attempts: 1,
            retryable: false,
            selected_final_attempt: true,
          },
        },
      ],
      status: "completed",
    },
  ],
  profile_summaries: [
    {
      profile: ref,
      eligible_case_count: 1,
      completed_count: 1,
      failed_count: 0,
      blocked_count: 0,
      rejected_count: 0,
      score: { numerator: 1, denominator: 1 },
      dimensions: [
        { dimension_id: "schema", earned_units: 1, possible_units: 1 },
      ],
      abstention_passed: 0,
      human_review_required_count: 0,
      usage_totals: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      latency: { total_ms: 1, maximum_ms: 1 },
      failure_reasons: [],
      suite_hash: "a".repeat(64),
      profile_hash: normalizeAndHash(ref).hash,
      coverage_complete: true,
    },
  ],
  ranking: {
    policy: { id: "ranking.default", version: "1.0.0" },
    approved_winner: true,
    entries: [
      { profile: ref, rank: 1, eligible: true, disqualification_reasons: [] },
    ],
  },
  provenance: {
    campaign_hash: benchmarkCampaignHash(campaign),
    suite_hash: "a".repeat(64),
    profile_hashes: [{ profile: ref, hash: profileHash }],
    evaluator: campaign.evaluator,
    ranking_policy: campaign.ranking_policy,
  },
};
const policy: ProfileSelectionPolicy = {
  schema_version: "1.0.0",
  policy_id: "routing.best-profile",
  policy_version: "1.0.0",
  capability_id: "evidence.extraction.normative_claims",
  permitted_lifecycle_states: ["candidate"],
  required_benchmark_suites: [{ id: "suite.router", version: "1.0.0" }],
  required_ranking_policy: { id: "ranking.default", version: "1.0.0" },
  maximum_evidence_age_seconds: 86400,
  required_quality_gates: [
    { gate_id: "coverage", type: "coverage_complete" },
    { gate_id: "schema", type: "dimension_perfect", dimension_type: "schema" },
  ],
  allowed_data_classifications: ["public"],
  allowed_budget_classes: ["development"],
  allowed_reviewer_roles: ["ai-governance-reviewer"],
  allowed_jurisdictions: ["AR"],
  human_review: "on_policy",
  decision_ttl_seconds: 300,
};
const evidence: ReviewedBenchmarkEvidenceReference = {
  schema_version: "1.0.0",
  campaign_id: campaign.campaign_id,
  campaign_version: campaign.campaign_version,
  campaign_execution_id: result.campaign_execution_id,
  campaign_hash: benchmarkCampaignHash(campaign),
  suite_id: campaign.suite.id,
  suite_version: campaign.suite.version,
  suite_hash: campaign.suite.hash,
  ranking_policy_id: campaign.ranking_policy.id,
  ranking_policy_version: campaign.ranking_policy.version,
  selected_profile_id: ref.profile_id,
  selected_profile_version: ref.profile_version,
  profile_hash: profileHash,
  ranking_position: 1,
  evidence_created_at: "2026-07-12T00:00:00.000Z",
  review: {
    attestation_id: "review.attestation",
    reviewer_role: "ai-governance-reviewer",
    decision: "approved",
    reviewed_at: "2026-07-12T00:01:00.000Z",
  },
  supersession_status: "current",
};
const base: RoutingInput = {
  policy,
  evidence,
  campaign_result: result,
  request: {
    schema_version: "1.0.0",
    request_id: "route-request",
    capability_id: policy.capability_id,
    capability_request: {
      request_id: "capability-request",
      capability_id: policy.capability_id as never,
      schema_version: "1.0.0",
      input: {},
      context: { data_classification: "public", jurisdiction: "AR" },
    },
    execution_correlation_id: "route-execution",
    audit_correlation_id: "route-audit",
    budget_class: "development",
  },
};
const router = (
  profiles: ExecutionProfile[] = [resolved],
  events: RoutingAuditEvent[] = [],
  now = "2026-07-12T01:00:00.000Z",
) =>
  new BestProfilePolicyRouter({
    profileResolver: (r) =>
      profiles.find(
        (p) =>
          p.profile_id === r.profile_id &&
          p.contract_version === r.profile_version,
      ),
    clock: () => new Date(now),
    id: (() => {
      let n = 0;
      return () => `event-${++n}`;
    })(),
    auditSink: (e) => events.push(e),
  });
const withCampaignBudget = (
  input: RoutingInput,
  budget_policy_ref?: { id: string; version: string },
): RoutingInput => {
  const nextCampaign = {
    ...input.campaign_result.campaign,
    ...(budget_policy_ref ? { budget_policy_ref } : {}),
  };
  const campaignHash = benchmarkCampaignHash(nextCampaign);
  return {
    ...input,
    evidence: { ...input.evidence, campaign_hash: campaignHash },
    campaign_result: {
      ...input.campaign_result,
      campaign: nextCampaign,
      provenance: {
        ...input.campaign_result.provenance,
        campaign_hash: campaignHash,
      },
    },
  };
};
describe("AI-78 best profile policy router", () => {
  it("selects one reviewed winner deterministically and emits metadata-only audit", () => {
    const events: RoutingAuditEvent[] = [];
    const a = router([resolved], events).route(base);
    const b = router().route(base);
    assert.equal(a.status, "selected");
    assert.equal(a.canonical_profile_key, "profile.shared@1.0.0");
    assert.equal(a.decision_hash, b.decision_hash);
    assert.ok(
      events.some((e) => e.event_type === "evidence_accepted") &&
        events.some((e) => e.event_type === "profile_selected"),
    );
    assert.ok(
      events.every((e) => assertRoutingAuditMetadataOnly(e).length === 0),
    );
    assert.doesNotMatch(
      JSON.stringify(events),
      /prompt|fixture-safe|capability-request/i,
    );
  });
  it("keeps two versions distinct and never substitutes a version", () => {
    const v2 = profile("2.0.0");
    assert.equal(
      router([resolved, v2]).route(base).selected_profile_version,
      "1.0.0",
    );
    const mismatch = {
      ...base,
      evidence: { ...evidence, selected_profile_version: "2.0.0" },
    };
    assert.equal(router([resolved]).route(mismatch).status, "blocked");
  });
  it("rejects partial, ambiguous, superseded, stale, malformed hash and incompatible contexts", () => {
    const cases: RoutingInput[] = [
      { ...base, campaign_result: { ...result, status: "partial" } },
      {
        ...base,
        campaign_result: {
          ...result,
          ranking: {
            ...result.ranking,
            entries: [
              ...result.ranking.entries,
              {
                ...result.ranking.entries[0]!,
                profile: {
                  profile_id: "profile.other",
                  profile_version: "1.0.0",
                },
              },
            ],
          },
        },
      },
      { ...base, evidence: { ...evidence, supersession_status: "superseded" } },
      {
        ...base,
        evidence: {
          ...evidence,
          evidence_created_at: "2020-01-01T00:00:00.000Z",
        },
      },
      { ...base, evidence: { ...evidence, profile_hash: "b".repeat(64) } },
      { ...base, request: { ...base.request, budget_class: "unclassified" } },
      {
        ...base,
        request: {
          ...base.request,
          capability_request: {
            ...base.request.capability_request,
            context: { data_classification: "restricted", jurisdiction: "AR" },
          },
        },
      },
    ];
    for (const value of cases)
      assert.equal(router().route(value).status, "blocked");
  });
  it("uses only an explicit eligible fallback for an allowed reason", () => {
    const fallback = {
      ...policy,
      fallback: {
        profile_id: ref.profile_id,
        profile_version: ref.profile_version,
        allowed_reasons: ["EVIDENCE_STALE" as const],
      },
    };
    assert.equal(
      router().route({
        ...base,
        policy: fallback,
        evidence: {
          ...evidence,
          evidence_created_at: "2020-01-01T00:00:00.000Z",
        },
      }).status,
      "fallback_selected",
    );
    assert.equal(
      router([]).route({
        ...base,
        policy: fallback,
        evidence: {
          ...evidence,
          evidence_created_at: "2020-01-01T00:00:00.000Z",
        },
      }).status,
      "blocked",
    );
  });
  it("separates pending review from rejected review", () => {
    const value = {
      ...base,
      policy: { ...policy, human_review: "required" as const },
      evidence: {
        ...evidence,
        review: { ...evidence.review!, decision: "pending" as const },
      },
    };
    assert.equal(router().route(value).status, "human_review_required");
    const rejected = router().route({
      ...value,
      evidence: {
        ...evidence,
        review: { ...evidence.review!, decision: "rejected" as const },
      },
    });
    assert.equal(rejected.status, "rejected");
    assert.equal(rejected.decision_reason, "REVIEW_REJECTED");
  });
  it("validates reviewer authorization and malformed attestations without fallback", () => {
    const fallbackPolicy = {
      ...policy,
      fallback: {
        profile_id: ref.profile_id,
        profile_version: ref.profile_version,
        allowed_reasons: [
          "REVIEW_REJECTED" as const,
          "REVIEW_ATTESTATION_INVALID" as const,
          "REVIEWER_ROLE_UNAUTHORIZED" as const,
        ],
      },
    };
    const unauthorized = router().route({
      ...base,
      policy: fallbackPolicy,
      evidence: {
        ...evidence,
        review: { ...evidence.review!, reviewer_role: "unauthorized-reviewer" },
      },
    });
    assert.equal(unauthorized.status, "blocked");
    assert.equal(unauthorized.decision_reason, "REVIEWER_ROLE_UNAUTHORIZED");
    const malformed = router().route({
      ...base,
      policy: fallbackPolicy,
      evidence: {
        ...evidence,
        review: { ...evidence.review!, attestation_id: "!" },
      },
    });
    assert.equal(malformed.status, "blocked");
    assert.equal(malformed.decision_reason, "REVIEW_ATTESTATION_INVALID");
    const rejected = router().route({
      ...base,
      policy: fallbackPolicy,
      evidence: {
        ...evidence,
        review: { ...evidence.review!, decision: "rejected" },
      },
    });
    assert.equal(rejected.status, "rejected");
  });
  it("enforces reviewer-role policy coherence during direct invocation", () => {
    for (const allowed_reviewer_roles of [[], ["same", "same"], ["bad role"]]) {
      const decision = router().route({
        ...base,
        policy: { ...policy, allowed_reviewer_roles } as ProfileSelectionPolicy,
      });
      assert.equal(decision.status, "rejected");
      assert.equal(decision.decision_reason, "SCHEMA_OR_POLICY_INVALID");
    }
    const missingRole = router().route({
      ...base,
      evidence: {
        ...evidence,
        review: { ...evidence.review!, reviewer_role: "" },
      },
    });
    assert.equal(missingRole.decision_reason, "REVIEW_ATTESTATION_INVALID");
    assert.equal(router().route(base).status, "selected");
  });
  it("enforces required campaign budget-policy references independently of budget class", () => {
    const required = {
      ...policy,
      required_budget_policy_refs: [
        { id: "budget.primary", version: "1.0.0" },
        { id: "budget.secondary", version: "2.0.0" },
      ],
    };
    const exact = withCampaignBudget(
      { ...base, policy: required },
      { id: "budget.secondary", version: "2.0.0" },
    );
    assert.equal(router().route(exact).status, "selected");
    for (const value of [
      { ...base, policy: required },
      withCampaignBudget(
        { ...base, policy: required },
        { id: "budget.wrong", version: "2.0.0" },
      ),
      withCampaignBudget(
        { ...base, policy: required },
        { id: "budget.secondary", version: "1.0.0" },
      ),
    ]) {
      const decision = router().route(value);
      assert.equal(decision.status, "blocked");
      assert.equal(decision.decision_reason, "BUDGET_POLICY_INCOMPATIBLE");
    }
    const mismatch = router().route({
      ...exact,
      request: { ...exact.request, budget_class: "unclassified" },
    });
    assert.equal(mismatch.decision_reason, "BUDGET_CLASS_INCOMPATIBLE");
    const safeFallback = {
      ...required,
      fallback: {
        profile_id: ref.profile_id,
        profile_version: ref.profile_version,
        allowed_reasons: ["BUDGET_POLICY_INCOMPATIBLE" as const],
      },
    };
    assert.equal(
      router().route({ ...base, policy: safeFallback }).status,
      "fallback_selected",
    );
  });
  it("uses exact clock boundaries and rejects future or inconsistent timestamps", () => {
    const now = "2026-07-12T01:00:00.000Z";
    const at = (created: string, reviewed: string) =>
      router([resolved], [], now).route({
        ...base,
        evidence: {
          ...evidence,
          evidence_created_at: created,
          review: { ...evidence.review!, reviewed_at: reviewed },
        },
      });
    assert.equal(at(now, now).status, "selected");
    assert.equal(at("2026-07-11T01:00:00.000Z", now).status, "selected");
    assert.equal(
      at("2026-07-11T00:59:59.999Z", now).decision_reason,
      "EVIDENCE_STALE",
    );
    assert.equal(
      at("2026-07-12T01:00:00.001Z", "2026-07-12T01:00:00.001Z")
        .decision_reason,
      "REVIEW_ATTESTATION_INVALID",
    );
    assert.equal(
      at("2026-07-12T00:59:00.000Z", "2026-07-12T01:00:00.001Z")
        .decision_reason,
      "REVIEW_ATTESTATION_INVALID",
    );
    assert.equal(
      at("2026-07-12T00:59:00.000Z", "2026-07-12T00:58:59.999Z")
        .decision_reason,
      "REVIEW_ATTESTATION_INVALID",
    );
    assert.equal(
      at("not-a-date", now).decision_reason,
      "REVIEW_ATTESTATION_INVALID",
    );
  });
  it("rejects malformed nested policy and request contracts at runtime", () => {
    const invalid: RoutingInput[] = [
      {
        ...base,
        policy: {
          ...policy,
          required_benchmark_suites: [
            policy.required_benchmark_suites[0]!,
            policy.required_benchmark_suites[0]!,
          ],
        },
      },
      {
        ...base,
        policy: {
          ...policy,
          required_budget_policy_refs: [
            { id: "budget.one", version: "1.0.0" },
            { id: "budget.one", version: "1.0.0" },
          ],
        },
      },
      {
        ...base,
        policy: {
          ...policy,
          fallback: {
            profile_id: "bad profile",
            profile_version: "x",
            allowed_reasons: ["EVIDENCE_STALE", "EVIDENCE_STALE"],
          },
        } as ProfileSelectionPolicy,
      },
      {
        ...base,
        policy: {
          ...policy,
          required_quality_gates: [
            {
              gate_id: "bad",
              type: "coverage_complete",
              minimum_score: { numerator: 1, denominator: 1 },
            },
          ],
        } as ProfileSelectionPolicy,
      },
      {
        ...base,
        request: { ...base.request, schema_version: "2.0.0" as "1.0.0" },
      },
      { ...base, request: { ...base.request, audit_correlation_id: "" } },
    ];
    for (const value of invalid)
      assert.equal(
        router().route(value).decision_reason,
        "SCHEMA_OR_POLICY_INVALID",
      );
  });
  it("isolates concurrent evaluations and preserves deterministic hashes without execution or mutation", async () => {
    let resolverCalls = 0;
    const events: RoutingAuditEvent[] = [];
    const before = JSON.stringify({ policy, result, resolved });
    const instance = new BestProfilePolicyRouter({
      profileResolver: (r) => {
        resolverCalls++;
        return r.profile_id === resolved.profile_id &&
          r.profile_version === resolved.contract_version
          ? resolved
          : undefined;
      },
      clock: () => new Date("2026-07-12T01:00:00.000Z"),
      id: (() => {
        let n = 0;
        return () => `concurrent-${++n}`;
      })(),
      auditSink: (event) => events.push(event),
    });
    const other = {
      ...base,
      request: {
        ...base.request,
        request_id: "route-other",
        execution_correlation_id: "execution-other",
        audit_correlation_id: "audit-other",
      },
    };
    const [a, b] = await Promise.all([
      Promise.resolve().then(() => instance.route(base)),
      Promise.resolve().then(() => instance.route(other)),
    ]);
    assert.notEqual(a.decision_hash, b.decision_hash);
    assert.deepEqual(
      new Set(events.map((event) => event.audit_correlation_id)),
      new Set(["route-audit", "audit-other"]),
    );
    assert.equal(resolverCalls, 2);
    assert.equal(JSON.stringify({ policy, result, resolved }), before);
    const ordered = {
      ...base,
      policy: {
        ...policy,
        allowed_reviewer_roles: [
          "ai-governance-reviewer",
          "secondary-reviewer",
        ],
        required_benchmark_suites: [
          { id: "suite.other", version: "1.0.0" },
          ...policy.required_benchmark_suites,
        ],
      },
    };
    const reordered = {
      ...ordered,
      policy: {
        ...ordered.policy,
        allowed_reviewer_roles: [
          ...ordered.policy.allowed_reviewer_roles,
        ].reverse(),
        required_benchmark_suites: [
          ...ordered.policy.required_benchmark_suites,
        ].reverse(),
      },
    };
    assert.equal(
      router().route(ordered).decision_hash,
      router().route(reordered).decision_hash,
    );
    const source = readFileSync("src/routing/policy-router.ts", "utf8");
    assert.doesNotMatch(
      source,
      /MultiProviderGateway|ProviderAdapter|\.execute\(/,
    );
  });
});

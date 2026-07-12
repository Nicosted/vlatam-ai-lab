import assert from "node:assert/strict";
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
) =>
  new BestProfilePolicyRouter({
    profileResolver: (r) =>
      profiles.find(
        (p) =>
          p.profile_id === r.profile_id &&
          p.contract_version === r.profile_version,
      ),
    clock: () => new Date("2026-07-12T01:00:00.000Z"),
    id: (() => {
      let n = 0;
      return () => `event-${++n}`;
    })(),
    auditSink: (e) => events.push(e),
  });
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
  it("returns human_review_required at the configured boundary", () => {
    const value = {
      ...base,
      policy: { ...policy, human_review: "required" as const },
      evidence: {
        ...evidence,
        review: { ...evidence.review, decision: "rejected" as const },
      },
    };
    assert.equal(router().route(value).status, "human_review_required");
  });
});

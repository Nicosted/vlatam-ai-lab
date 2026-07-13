import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BenchmarkError,
  BenchmarkRunner,
  assertBenchmarkAuditMetadataOnly,
  benchmarkCampaignHash,
  rankProfiles,
  validateBenchmarkCampaign,
  type BenchmarkAuditEvent,
  type BenchmarkCampaignDefinition,
  type BenchmarkReplayRecord,
  type ProfileSummary,
  type RankingPolicy,
} from "../../src/benchmark/index.js";
import {
  normalizeAndHash,
  normalizeObservedOutcome,
  type EvaluationSuite,
} from "../../src/evaluation/index.js";
import type { ExecutionProfile } from "../../src/execution/execution-profile.js";
import { LOCAL_REPLAY_PRIVACY } from "../helpers/privacy.js";

const cases = [1, 2].map((number) => ({
  case_id: `case.${number}`,
  version: "1.0.0",
  input: { request_id: `request-${number}` },
  expected: { status: "succeeded" as const, output: { label: "ok" } },
  dimensions: [
    {
      dimension_id: "exact",
      type: "exact_value" as const,
      weight_units: 3,
      path: "label",
      expected: "ok",
    },
  ],
}));
const suite: EvaluationSuite = {
  suite_id: "suite.benchmark",
  version: "1.0.0",
  contract_version: "1.0.0",
  evaluator: {
    evaluator_id: "evaluation.deterministic",
    evaluator_version: "1.0.0",
  },
  capability_profile: {
    capability_id: "evidence.extraction.normative_claims",
    capability_version: "1.0.0",
    profile_id: "placeholder.profile",
    profile_version: "1.0.0",
  },
  cases,
};
const refs = [
  { profile_id: "profile.alpha", profile_version: "1.0.0" },
  { profile_id: "profile.beta", profile_version: "1.0.0" },
];
const campaign = (
  change: Partial<BenchmarkCampaignDefinition> = {},
): BenchmarkCampaignDefinition => ({
  schema_version: "1.0.0",
  campaign_id: "campaign.synthetic",
  campaign_version: "1.0.0",
  suite: {
    id: suite.suite_id,
    version: suite.version,
    hash: normalizeAndHash(suite).hash,
  },
  profiles: refs,
  evaluator: suite.evaluator,
  ranking_policy: { id: "ranking.default", version: "1.0.0" },
  execution_mode: "replay",
  concurrency_limit: 2,
  retry_policy: {
    max_attempts: 2,
    retryable_error_codes: ["PROVIDER_TIMEOUT"],
  },
  created_at: "2026-07-12T00:00:00.000Z",
  execution_correlation_id: "execution.campaign",
  audit_correlation_id: "audit.campaign",
  ...change,
});
const rankingPolicy: RankingPolicy = {
  schema_version: "1.0.0",
  policy_id: "ranking.default",
  version: "1.0.0",
  mandatory_gates: [
    { gate_id: "coverage", type: "coverage_complete" },
    { gate_id: "correct", type: "no_blocked_or_rejected" },
  ],
  tie_breakers: ["quality", "reliability", "cost", "latency"],
};
const profile = (ref: {
  profile_id: string;
  profile_version: string;
}): ExecutionProfile => ({
  profile_id: ref.profile_id as never,
  capability_id: "evidence.extraction.normative_claims" as never,
  provider_id: "replay" as never,
  model_id: "fixture" as never,
  mode: "replay",
  lifecycle_status: "candidate",
  enabled: true,
  contract_version: ref.profile_version,
  configuration: { timeout_ms: 100, response_format: "json" },
  eligibility: {
    privacy_compatibility: "declared_not_enforced",
    budget_class: "development",
    evaluation_status: "fixture_verified",
  },
  privacy: LOCAL_REPLAY_PRIVACY,
  fixture_id: "fixture",
});
const replay = (order = refs): BenchmarkReplayRecord[] =>
  order.flatMap((reference) =>
    [...cases].reverse().map((testCase) => {
      const amount = reference.profile_id === "profile.alpha" ? "1" : "2";
      return {
        profile: reference,
        case_ref: { id: testCase.case_id, version: testCase.version },
        execution_id: `execution.${reference.profile_id}.${testCase.case_id}`,
        audit_correlation_id: `audit.${reference.profile_id}.${testCase.case_id}`,
        normalized_input: testCase.input,
        normalized_output: normalizeObservedOutcome({
          status: "succeeded",
          output: { label: "ok" },
          latency_ms: 10,
        }),
        usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
        exact_cost: {
          cost_contract_version: "1.0.0",
          amount: { numerator: amount, denominator: "3" },
          currency: "USD",
        },
        latency_ms: 10,
      };
    }),
  );

const summary = (
  profileRef = refs[0]!,
  amount = { numerator: "1", denominator: "1" },
): ProfileSummary => ({
  profile: profileRef,
  eligible_case_count: 2,
  completed_count: 2,
  failed_count: 0,
  blocked_count: 0,
  rejected_count: 0,
  score: { numerator: 1, denominator: 1 },
  dimensions: [],
  abstention_passed: 0,
  human_review_required_count: 0,
  usage_totals: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  exact_cost: { cost_contract_version: "1.0.0", amount, currency: "USD" },
  latency: { total_ms: 20, maximum_ms: 10 },
  failure_reasons: [],
  suite_hash: "suite",
  profile_hash: "profile",
  coverage_complete: true,
});

describe("AI-77 exact rational benchmark aggregation", () => {
  it("validates identities and hashes campaigns deterministically", () => {
    validateBenchmarkCampaign(campaign());
    assert.equal(
      benchmarkCampaignHash(campaign()),
      benchmarkCampaignHash({
        ...campaign(),
        profiles: refs.map((reference) => ({ ...reference })),
      }),
    );
    assert.throws(
      () => validateBenchmarkCampaign(campaign({ concurrency_limit: 0 })),
      BenchmarkError,
    );
  });

  it("aggregates rational costs exactly and ranks deterministically", async () => {
    let calls = 0;
    const events: BenchmarkAuditEvent[] = [];
    const result = await new BenchmarkRunner({
      profileResolver: profile,
      gateway: {
        execute: async () => {
          calls += 1;
          throw new Error("not called");
        },
      },
      clock: () => new Date(0),
      id: () => "fixed",
      auditSink: (event) => events.push(event),
    }).run({
      campaign: campaign(),
      suite,
      rankingPolicy,
      replayRecords: replay(),
    });
    assert.equal(calls, 0);
    assert.deepEqual(result.profile_summaries[0]?.exact_cost?.amount, {
      numerator: "2",
      denominator: "3",
    });
    assert.deepEqual(result.profile_summaries[1]?.exact_cost?.amount, {
      numerator: "4",
      denominator: "3",
    });
    assert.equal(
      result.ranking.entries[0]?.profile.profile_id,
      "profile.alpha",
    );
    assert.ok(
      events.every(
        (event) => assertBenchmarkAuditMetadataOnly(event).length === 0,
      ),
    );
  });

  it("is stable across profile, case, and replay ordering", async () => {
    const run = (
      definition: BenchmarkCampaignDefinition,
      selectedSuite: EvaluationSuite,
      records: BenchmarkReplayRecord[],
    ) =>
      new BenchmarkRunner({
        profileResolver: profile,
        clock: () => new Date(0),
        id: () => "fixed",
      }).run({
        campaign: definition,
        suite: selectedSuite,
        rankingPolicy,
        replayRecords: records,
      });
    const first = await run(campaign(), suite, replay());
    const reversedSuite = { ...suite, cases: [...suite.cases].reverse() };
    const second = await run(
      campaign({
        profiles: [...refs].reverse(),
        suite: {
          ...campaign().suite,
          hash: normalizeAndHash(reversedSuite).hash,
        },
      }),
      reversedSuite,
      [...replay([...refs].reverse())].reverse(),
    );
    assert.deepEqual(first.ranking, second.ranking);
  });

  it("compares equivalent and fractional rational costs without number arithmetic", () => {
    assert.deepEqual(
      rankProfiles(
        [
          summary(refs[0]!, { numerator: "1", denominator: "3" }),
          summary(refs[1]!, { numerator: "1", denominator: "3" }),
        ],
        rankingPolicy,
      ).entries.map((entry) => entry.rank),
      [1, 1],
    );
    assert.equal(
      rankProfiles(
        [
          summary(refs[0]!, { numerator: "1", denominator: "3" }),
          summary(refs[1]!, { numerator: "1", denominator: "4" }),
        ],
        rankingPolicy,
      ).entries[0]?.profile.profile_id,
      "profile.beta",
    );
  });

  it("fails mixed currencies and missing cost metadata closed", () => {
    assert.throws(
      () =>
        rankProfiles(
          [
            summary(),
            {
              ...summary(refs[1]!),
              exact_cost: { ...summary().exact_cost!, currency: "EUR" },
            },
          ],
          rankingPolicy,
        ),
      /currencies incompatible/,
    );
    assert.throws(
      () =>
        rankProfiles(
          [summary(), { ...summary(refs[1]!), exact_cost: undefined }],
          rankingPolicy,
        ),
      /cost metadata missing/,
    );
  });
});

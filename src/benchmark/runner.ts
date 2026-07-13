import { randomUUID } from "node:crypto";
import type { CapabilityRequest } from "../capabilities/index.js";
import {
  CapabilityEvaluator,
  normalizeAndHash,
  normalizeObservedOutcome,
  validateEvaluationSuite,
  type EvaluationCase,
  type EvaluationSuite,
  type ReplayObservation,
} from "../evaluation/index.js";
import type { MultiProviderGateway } from "../execution/multi-provider-gateway.js";
import type { ExecutionProfile } from "../execution/execution-profile.js";
import {
  assertBenchmarkAuditMetadataOnly,
  type BenchmarkAuditEvent,
} from "./audit.js";
import {
  BENCHMARK_CONTRACT_VERSION,
  BENCHMARK_EXECUTION_MODES,
  benchmarkProfileKey,
  type BenchmarkCampaignDefinition,
  type BenchmarkProfileRef,
  type BenchmarkReplayRecord,
  type CampaignResult,
  type CaseAttempt,
  type ProfileRun,
  type ProfileSummary,
  type RankingPolicy,
} from "./contracts.js";
import { rankProfiles } from "./ranking.js";
import {
  addRational,
  createRational,
  parseRational,
} from "../governance/index.js";

const ID = /^[a-z0-9][a-z0-9._-]{1,127}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const HASH = /^[a-f0-9]{64}$/;
const NEVER_RETRY =
  /(PRIVACY|SCHEMA|VALIDATION|POLICY|BUDGET|TOKEN_LIMIT|COST_LIMIT|PROFILE_|UNKNOWN_)/;
export class BenchmarkError extends Error {
  constructor(
    readonly code: "REJECTED" | "FAILED",
    message: string,
  ) {
    super(message);
    this.name = "BenchmarkError";
  }
}
export function benchmarkCampaignHash(c: BenchmarkCampaignDefinition): string {
  return normalizeAndHash(c).hash;
}
export function validateBenchmarkCampaign(
  c: BenchmarkCampaignDefinition,
): void {
  if (
    c.schema_version !== BENCHMARK_CONTRACT_VERSION ||
    !ID.test(c.campaign_id) ||
    !SEMVER.test(c.campaign_version) ||
    !ID.test(c.suite.id) ||
    !SEMVER.test(c.suite.version) ||
    !HASH.test(c.suite.hash) ||
    !ID.test(c.evaluator.evaluator_id) ||
    !SEMVER.test(c.evaluator.evaluator_version) ||
    !ID.test(c.ranking_policy.id) ||
    !SEMVER.test(c.ranking_policy.version) ||
    !(BENCHMARK_EXECUTION_MODES as readonly string[]).includes(
      c.execution_mode,
    ) ||
    !Number.isSafeInteger(c.concurrency_limit) ||
    c.concurrency_limit < 1 ||
    c.concurrency_limit > 64 ||
    !Number.isSafeInteger(c.retry_policy.max_attempts) ||
    c.retry_policy.max_attempts < 1 ||
    c.retry_policy.max_attempts > 10 ||
    !Number.isFinite(Date.parse(c.created_at)) ||
    !c.execution_correlation_id ||
    !c.audit_correlation_id
  )
    throw new BenchmarkError("REJECTED", "invalid campaign definition");
  const profiles = new Set<string>();
  for (const p of c.profiles) {
    const k = `${p.profile_id}@${p.profile_version}`;
    if (
      !ID.test(p.profile_id) ||
      !SEMVER.test(p.profile_version) ||
      profiles.has(k)
    )
      throw new BenchmarkError("REJECTED", "invalid or duplicate profile");
    profiles.add(k);
  }
  if (!profiles.size)
    throw new BenchmarkError("REJECTED", "no profiles selected");
  if (
    new Set(c.retry_policy.retryable_error_codes).size !==
    c.retry_policy.retryable_error_codes.length
  )
    throw new BenchmarkError("REJECTED", "duplicate retry code");
}
export interface BenchmarkRunnerOptions {
  readonly gateway?: Pick<MultiProviderGateway, "execute">;
  readonly profileResolver: (ref: BenchmarkProfileRef) => ExecutionProfile;
  readonly evaluator?: CapabilityEvaluator;
  readonly clock?: () => Date;
  readonly id?: () => string;
  readonly auditSink?: (event: BenchmarkAuditEvent) => void;
}
export interface RunCampaignInput {
  readonly campaign: BenchmarkCampaignDefinition;
  readonly suite: EvaluationSuite;
  readonly rankingPolicy: RankingPolicy;
  readonly replayRecords?: readonly BenchmarkReplayRecord[];
}
export class BenchmarkRunner {
  private readonly clock;
  private readonly id;
  constructor(private readonly options: BenchmarkRunnerOptions) {
    this.clock = options.clock ?? (() => new Date());
    this.id = options.id ?? randomUUID;
  }
  private audit(
    c: BenchmarkCampaignDefinition,
    execution: string,
    type: BenchmarkAuditEvent["event_type"],
    extra: Partial<BenchmarkAuditEvent> = {},
  ) {
    const event: BenchmarkAuditEvent = {
      schema_version: "1.0.0",
      event_id: this.id(),
      event_type: type,
      occurred_at: this.clock().toISOString(),
      campaign_id: c.campaign_id,
      campaign_version: c.campaign_version,
      campaign_execution_id: execution,
      audit_correlation_id: c.audit_correlation_id,
      ...extra,
    };
    const errors = assertBenchmarkAuditMetadataOnly(event);
    if (errors.length) throw new BenchmarkError("FAILED", errors.join(", "));
    this.options.auditSink?.(event);
  }
  async run(input: RunCampaignInput): Promise<CampaignResult> {
    const { campaign, suite, rankingPolicy } = input;
    const execution = this.id();
    this.audit(campaign, execution, "campaign_started");
    try {
      validateBenchmarkCampaign(campaign);
      validateEvaluationSuite(suite);
      const suiteHash = normalizeAndHash(suite).hash;
      if (
        campaign.suite.id !== suite.suite_id ||
        campaign.suite.version !== suite.version ||
        campaign.suite.hash !== suiteHash ||
        campaign.evaluator.evaluator_id !== suite.evaluator.evaluator_id ||
        campaign.evaluator.evaluator_version !==
          suite.evaluator.evaluator_version
      )
        throw new BenchmarkError("REJECTED", "incompatible suite or evaluator");
      if (
        campaign.ranking_policy.id !== rankingPolicy.policy_id ||
        campaign.ranking_policy.version !== rankingPolicy.version
      )
        throw new BenchmarkError("REJECTED", "incompatible ranking policy");
      const cases = this.selectCases(campaign, suite);
      const profiles = campaign.profiles.map((ref) => {
        const p = this.options.profileResolver(ref);
        if (
          p.profile_id !== ref.profile_id ||
          p.contract_version !== ref.profile_version
        )
          throw new BenchmarkError(
            "REJECTED",
            "unknown or incompatible profile",
          );
        return { ref, p };
      });
      const runs = await this.mapBounded(
        profiles,
        campaign.concurrency_limit,
        (x) =>
          this.runProfile(
            campaign,
            execution,
            suite,
            cases,
            x.ref,
            input.replayRecords ?? [],
          ),
      );
      const summaries = runs.map((r) => this.summarize(suiteHash, suite, r));
      const partial = summaries.some((s) => !s.coverage_complete);
      if (partial && !campaign.allow_partial_reporting)
        throw new BenchmarkError("FAILED", "incomplete campaign coverage");
      const ranking = rankProfiles(summaries, rankingPolicy, partial);
      for (const e of ranking.entries.filter((e) => !e.eligible))
        this.audit(campaign, execution, "profile_disqualified", {
          profile_id: benchmarkProfileKey(e.profile),
          reason_code: e.disqualification_reasons.join("+"),
        });
      this.audit(
        campaign,
        execution,
        ranking.entries.some((e) => e.eligible)
          ? "ranking_produced"
          : "ranking_rejected",
      );
      const publicRuns = runs.map((run) => ({
        ...run,
        attempts: run.attempts.map((value) => {
          const attempt = { ...value };
          delete (attempt as { observation?: BenchmarkReplayRecord })
            .observation;
          return attempt;
        }),
      }));
      const result: CampaignResult = {
        schema_version: "1.0.0",
        campaign,
        campaign_execution_id: execution,
        status: partial ? "partial" : "completed",
        profile_runs: publicRuns,
        profile_summaries: summaries.sort((a, b) =>
          benchmarkProfileKey(a.profile).localeCompare(
            benchmarkProfileKey(b.profile),
          ),
        ),
        ranking,
        provenance: {
          campaign_hash: benchmarkCampaignHash(campaign),
          suite_hash: suiteHash,
          profile_hashes: profiles
            .map((x) => ({
              profile: x.ref,
              hash: normalizeAndHash({ profile: x.ref, resolved: x.p }).hash,
            }))
            .sort((a, b) =>
              benchmarkProfileKey(a.profile).localeCompare(
                benchmarkProfileKey(b.profile),
              ),
            ),
          evaluator: campaign.evaluator,
          ranking_policy: campaign.ranking_policy,
        },
      };
      this.audit(campaign, execution, "campaign_completed");
      return result;
    } catch (error) {
      this.audit(campaign, execution, "campaign_failed", {
        reason_code: error instanceof BenchmarkError ? error.code : "FAILED",
      });
      throw error;
    }
  }
  private selectCases(
    c: BenchmarkCampaignDefinition,
    s: EvaluationSuite,
  ): readonly EvaluationCase[] {
    if (!c.case_subset)
      return [...s.cases].sort((a, b) =>
        `${a.case_id}@${a.version}`.localeCompare(`${b.case_id}@${b.version}`),
      );
    const wanted = new Set(c.case_subset.map((x) => `${x.id}@${x.version}`));
    const selected = s.cases.filter((x) =>
      wanted.has(`${x.case_id}@${x.version}`),
    );
    if (selected.length !== wanted.size || !selected.length)
      throw new BenchmarkError("REJECTED", "unknown or duplicate case subset");
    return selected.sort((a, b) =>
      `${a.case_id}@${a.version}`.localeCompare(`${b.case_id}@${b.version}`),
    );
  }
  private async runProfile(
    c: BenchmarkCampaignDefinition,
    execution: string,
    suite: EvaluationSuite,
    cases: readonly EvaluationCase[],
    profile: BenchmarkProfileRef,
    replays: readonly BenchmarkReplayRecord[],
  ): Promise<ProfileRun> {
    const key = benchmarkProfileKey(profile),
      runId = this.id(),
      audit = `${c.audit_correlation_id}.${key}`;
    this.audit(c, execution, "profile_run_started", { profile_id: key });
    const groups = await this.mapBounded(cases, c.concurrency_limit, (x) =>
      this.runCase(c, execution, profile, x, replays),
    );
    const attempts = groups.flat();
    const final = attempts.filter((x) => x.retry.selected_final_attempt);
    const status = final.every((x) => x.status === "completed")
      ? "completed"
      : final.some((x) => x.status === "completed")
        ? "partial"
        : "failed";
    this.audit(c, execution, "profile_run_completed", {
      profile_id: key,
      reason_code: status,
    });
    return {
      profile,
      profile_run_id: runId,
      audit_correlation_id: audit,
      attempts,
      status,
    };
  }
  private async runCase(
    c: BenchmarkCampaignDefinition,
    execution: string,
    profile: BenchmarkProfileRef,
    ec: EvaluationCase,
    replays: readonly BenchmarkReplayRecord[],
  ): Promise<readonly CaseAttempt[]> {
    const attempts: CaseAttempt[] = [];
    for (let n = 1; n <= c.retry_policy.max_attempts; n++) {
      const key = benchmarkProfileKey(profile),
        attemptId = this.id(),
        audit = `${c.audit_correlation_id}.${key}.${ec.case_id}.${n}`;
      this.audit(c, execution, "case_attempt_started", {
        profile_id: key,
        case_id: ec.case_id,
        attempt_id: attemptId,
      });
      let record: BenchmarkReplayRecord | undefined;
      let status: CaseAttempt["status"] = "failed",
        errorCode: string | undefined;
      if (c.execution_mode === "replay") {
        record = replays.find(
          (r) =>
            r.profile.profile_id === profile.profile_id &&
            r.profile.profile_version === profile.profile_version &&
            r.case_ref.id === ec.case_id &&
            r.case_ref.version === ec.version,
        );
        if (!record) {
          status = "rejected";
          errorCode = "REPLAY_RECORD_MISSING";
        } else status = "completed";
      } else {
        if (!this.options.gateway)
          throw new BenchmarkError("FAILED", "live gateway unavailable");
        const outcome = await this.options.gateway.execute({
          capability_request: ec.input as CapabilityRequest,
          execution_profile_id: profile.profile_id,
        });
        errorCode = outcome.audit.error_code;
        status =
          outcome.result.status === "succeeded"
            ? "completed"
            : outcome.result.status === "blocked"
              ? "blocked"
              : "failed";
        const actual = outcome.usage_audit?.actual_usage;
        const completeUsage =
          actual?.input_tokens !== undefined &&
          actual.output_tokens !== undefined &&
          actual.total_tokens !== undefined
            ? {
                input_tokens: actual.input_tokens,
                output_tokens: actual.output_tokens,
                total_tokens: actual.total_tokens,
                source: (actual.source === "fixture"
                  ? "fixture"
                  : "provider_reported") as "fixture" | "provider_reported",
                ...(actual.source === "fixture"
                  ? { fixture_origin: "synthetic" as const }
                  : {}),
              }
            : undefined;
        const cost = outcome.usage_audit?.actual_exact_cost;
        record = {
          profile,
          case_ref: { id: ec.case_id, version: ec.version },
          execution_id: outcome.audit.execution_id,
          audit_correlation_id: audit,
          normalized_input: ec.input,
          normalized_output: normalizeObservedOutcome({
            status: outcome.result.status,
            ...(outcome.result.output === undefined
              ? {}
              : { output: outcome.result.output }),
            ...(errorCode ? { error_code: errorCode } : {}),
            abstained: outcome.result.status !== "succeeded",
            policy_blocked: outcome.result.status === "blocked",
            latency_ms: outcome.audit.duration_ms,
            ...(completeUsage ? { usage: completeUsage } : {}),
          }),
          ...(completeUsage
            ? {
                usage: {
                  input_tokens: completeUsage.input_tokens,
                  output_tokens: completeUsage.output_tokens,
                  total_tokens: completeUsage.total_tokens,
                },
              }
            : {}),
          ...(cost && outcome.usage_audit?.currency
            ? {
                exact_cost: {
                  cost_contract_version: "1.0.0",
                  amount: cost,
                  currency: outcome.usage_audit.currency,
                },
              }
            : {}),
          latency_ms: outcome.audit.duration_ms,
        };
      }
      const retryable =
        status === "failed" &&
        !!errorCode &&
        !NEVER_RETRY.test(errorCode) &&
        c.retry_policy.retryable_error_codes.includes(errorCode) &&
        n < c.retry_policy.max_attempts;
      attempts.push({
        case_ref: { id: ec.case_id, version: ec.version },
        profile,
        attempt_id: attemptId,
        execution_id: record?.execution_id ?? `${execution}.${attemptId}`,
        audit_correlation_id: audit,
        status,
        retry: {
          attempt_number: n,
          max_attempts: c.retry_policy.max_attempts,
          retryable,
          selected_final_attempt: !retryable,
        },
        ...(errorCode ? { error_code: errorCode } : {}),
        ...(record ? { observation: record } : {}),
      });
      this.audit(
        c,
        execution,
        status === "completed"
          ? "case_attempt_completed"
          : "case_attempt_failed",
        {
          profile_id: key,
          case_id: ec.case_id,
          attempt_id: attemptId,
          ...(errorCode ? { reason_code: errorCode } : {}),
        },
      );
      if (!retryable) break;
    }
    return attempts;
  }
  private summarize(
    suiteHash: string,
    suite: EvaluationSuite,
    run: ProfileRun,
  ): ProfileSummary {
    const final = run.attempts.filter((a) => a.retry.selected_final_attempt);
    const observations = final
      .filter((a) => a.status === "completed" && a.observation)
      .map((a) => a.observation!);
    let earned = 0,
      possible = 0;
    const dims = new Map<
      string,
      { earned_units: number; possible_units: number }
    >();
    if (observations.length) {
      const evalSuite = {
        ...suite,
        capability_profile: {
          ...suite.capability_profile,
          profile_id: run.profile.profile_id,
          profile_version: run.profile.profile_version,
        },
        cases: suite.cases.filter((c) =>
          observations.some(
            (o) =>
              o.case_ref.id === c.case_id && o.case_ref.version === c.version,
          ),
        ),
      };
      const report = (
        this.options.evaluator ?? new CapabilityEvaluator()
      ).evaluateReplay(
        evalSuite,
        observations.map(
          (o) =>
            ({
              case_id: o.case_ref.id,
              case_version: o.case_ref.version,
              execution_id: o.execution_id,
              audit_correlation_id: o.audit_correlation_id,
              normalized_input: o.normalized_input,
              normalized_output: o.normalized_output,
            }) satisfies ReplayObservation,
        ),
      );
      earned = report.earned_units;
      possible = report.possible_units;
      for (const cr of report.case_results)
        for (const d of cr.dimension_results) {
          const v = dims.get(d.dimension_id) ?? {
            earned_units: 0,
            possible_units: 0,
          };
          v.earned_units += d.earned_units;
          v.possible_units += d.possible_units;
          dims.set(d.dimension_id, v);
        }
    }
    const costs = observations.map((o) => o.exact_cost);
    if (
      costs.some(
        (x) =>
          x !== undefined &&
          (x.cost_contract_version !== "1.0.0" || !/^USD$/.test(x.currency)),
      )
    )
      throw new BenchmarkError("REJECTED", "invalid benchmark cost");
    const currencies = new Set(costs.flatMap((x) => (x ? [x.currency] : [])));
    if (currencies.size > 1)
      throw new BenchmarkError("REJECTED", "mixed benchmark currencies");
    const allCosted =
      observations.length > 0 && costs.every((x) => x !== undefined);
    let exactCost: ProfileSummary["exact_cost"];
    if (allCosted) {
      const amount = costs.reduce(
        (sum, x) => addRational(sum, parseRational(x!.amount)),
        createRational(0n, 1n),
      );
      exactCost = {
        cost_contract_version: "1.0.0",
        amount,
        currency: costs[0]!.currency,
      };
    }
    const usage = observations.reduce(
      (a, o) => ({
        input_tokens: a.input_tokens + (o.usage?.input_tokens ?? 0),
        output_tokens: a.output_tokens + (o.usage?.output_tokens ?? 0),
        total_tokens: a.total_tokens + (o.usage?.total_tokens ?? 0),
      }),
      { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    );
    const latencies = observations.map(
      (o) => o.latency_ms ?? o.normalized_output.latency_ms ?? 0,
    );
    return {
      profile: run.profile,
      eligible_case_count: final.length,
      completed_count: final.filter((a) => a.status === "completed").length,
      failed_count: final.filter((a) => a.status === "failed").length,
      blocked_count: final.filter((a) => a.status === "blocked").length,
      rejected_count: final.filter((a) => a.status === "rejected").length,
      score: { numerator: earned, denominator: possible || 1 },
      dimensions: [...dims]
        .map(([dimension_id, v]) => ({ dimension_id, ...v }))
        .sort((a, b) => a.dimension_id.localeCompare(b.dimension_id)),
      abstention_passed: observations.filter(
        (o) => o.normalized_output.abstained,
      ).length,
      human_review_required_count: observations.filter(
        (o) => o.normalized_output.status !== "succeeded",
      ).length,
      usage_totals: usage,
      ...(exactCost ? { exact_cost: exactCost } : {}),
      latency: {
        total_ms: latencies.reduce((a, b) => a + b, 0),
        maximum_ms: Math.max(0, ...latencies),
      },
      failure_reasons: [
        ...new Set(final.flatMap((a) => (a.error_code ? [a.error_code] : []))),
      ].sort(),
      suite_hash: suiteHash,
      profile_hash: normalizeAndHash(run.profile).hash,
      coverage_complete:
        final.length > 0 && final.every((a) => a.status === "completed"),
    };
  }
  private async mapBounded<T, R>(
    items: readonly T[],
    limit: number,
    fn: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const out = new Array<R>(items.length);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (true) {
          const i = next++;
          if (i >= items.length) return;
          out[i] = await fn(items[i]!);
        }
      }),
    );
    return out;
  }
}

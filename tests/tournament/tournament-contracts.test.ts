import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

import {
  NORMALIZED_RUNTIME_EVENT_TYPES,
  assertGovernedLifecycleTransition,
  buildTournamentOperatorReadModel,
  validateCandidateResult,
  validateExecutionProfile,
  validatePromotionDecision,
  validateRuntimeCandidate,
  validateTournamentRun,
  type CandidateResult,
  type PromotionDecision,
  type RuntimeCandidate,
  type TournamentExecutionProfile,
  type TournamentRun,
} from "../../src/tournament/index.js";
import {
  REPOSITORY_OPERATOR_EVALUATED_AT,
  loadRepositoryOperatorReadModel,
} from "../../src/operator/repository-operator-read-model.js";

const load = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;
const addFormats = ((addFormatsModule as unknown as { default?: unknown })
  .default ?? addFormatsModule) as (ajv: Ajv) => void;

const schemaMap = {
  runtime_candidate: "ai-runtime-candidate",
  inference_gateway_candidate: "ai-inference-gateway-candidate",
  model_candidate: "ai-model-candidate",
  provider_endpoint_candidate: "ai-provider-endpoint-candidate",
  execution_profile: "ai-tournament-execution-profile",
  benchmark_case_selection: "ai-benchmark-case-selection",
  normalized_runtime_event: "ai-normalized-runtime-event",
  tournament_run: "ai-tournament-run",
  candidate_result: "ai-candidate-result",
  daily_tournament_report: "ai-daily-tournament-report",
  weekly_tournament_review: "ai-weekly-tournament-review",
  promotion_decision: "ai-promotion-decision",
  regression_decision: "ai-regression-decision",
} as const;

describe("AI-120 tournament contracts", () => {
  it("compiles every schema and accepts a valid fixture for every contract", () => {
    const fixtures = load<Record<string, unknown>>(
      "data/fixtures/tournament/valid-contracts.json",
    );
    const ajv = new Ajv({ allErrors: true, strict: true });
    addFormats(ajv);
    ajv.addSchema(load("schemas/ai-tournament-common.schema.json"));
    for (const [fixtureName, schemaName] of Object.entries(schemaMap)) {
      const validate = ajv.compile(
        load(`schemas/${schemaName}.schema.json`) as object,
      );
      assert.equal(
        validate(fixtures[fixtureName]),
        true,
        `${fixtureName}: ${JSON.stringify(validate.errors)}`,
      );
    }
  });

  it("covers the complete normalized event vocabulary without reasoning payloads", () => {
    assert.deepEqual(NORMALIZED_RUNTIME_EVENT_TYPES, [
      "session_started",
      "turn_started",
      "step_started",
      "action_requested",
      "action_completed",
      "input_requested",
      "authorization_required",
      "subagent_started",
      "subagent_completed",
      "structured_result_completed",
      "usage_recorded",
      "step_completed",
      "turn_completed",
      "session_waiting",
      "session_completed",
      "cancelled",
      "failed",
    ]);
    const serialized = readFileSync(
      "data/fixtures/tournament/valid-contracts.json",
      "utf8",
    );
    assert.doesNotMatch(
      serialized,
      /chain.of.thought|raw.reasoning|reasoning.content|thinking.text/i,
    );
  });

  it("fails closed for every required invalid scenario", () => {
    const valid = load<Record<string, unknown>>(
      "data/fixtures/tournament/valid-contracts.json",
    );
    const scenarioNames = Object.keys(
      load<Record<string, unknown>>(
        "data/fixtures/tournament/invalid-scenarios.json",
      ),
    );
    assert.deepEqual(scenarioNames.sort(), [
      "candidate_attempting_self_promotion",
      "disqualifying_governance_failure",
      "exhausted_budget",
      "incomplete_evidence",
      "invalid_lifecycle_transition",
      "missing_cost_reconciliation",
      "missing_privacy_classification",
      "missing_runtime_identity",
      "reasoning_capture_enabled_without_approval",
      "stale_authorization",
      "unapproved_provider",
      "unsupported_resume_semantics",
    ]);

    const runtime = structuredClone(valid.runtime_candidate) as Record<
      string,
      unknown
    >;
    delete runtime.runtime_candidate_id;
    assert.ok(
      validateRuntimeCandidate(runtime as unknown as RuntimeCandidate).includes(
        "runtime_identity_missing",
      ),
    );

    const profile = structuredClone(valid.execution_profile) as Record<
      string,
      unknown
    >;
    profile.provider_endpoint_candidate_id = "endpoint.unapproved";
    assert.ok(
      validateExecutionProfile(
        profile as unknown as TournamentExecutionProfile,
        ["endpoint.fixture"],
      ).includes("provider_endpoint_unapproved"),
    );
    delete profile.privacy_classification;
    assert.ok(
      validateExecutionProfile(
        profile as unknown as TournamentExecutionProfile,
        ["endpoint.fixture"],
      ).includes("privacy_classification_missing"),
    );

    const reasoning = structuredClone(valid.execution_profile) as Record<
      string,
      unknown
    >;
    reasoning.reasoning_capture = "approved_summary";
    reasoning.reasoning_capture_approval_id = null;
    assert.ok(
      validateExecutionProfile(
        reasoning as unknown as TournamentExecutionProfile,
        ["endpoint.fixture"],
      ).includes("reasoning_capture_approval_missing"),
    );

    const stale = structuredClone(valid.execution_profile) as Record<
      string,
      unknown
    >;
    stale.authorization_id = "authorization.stale";
    stale.authorization_expires_at = "2026-01-01T00:00:00.000Z";
    assert.ok(
      validateExecutionProfile(stale as unknown as TournamentExecutionProfile, [
        "endpoint.fixture",
      ]).includes("authorization_stale"),
    );

    const run = structuredClone(valid.tournament_run) as TournamentRun;
    (run.budget_state as { exhausted: boolean }).exhausted = true;
    assert.ok(validateTournamentRun(run).includes("budget_exhausted"));

    const result = structuredClone(valid.candidate_result) as Record<
      string,
      unknown
    >;
    delete result.cost_reconciliation;
    assert.ok(
      validateCandidateResult(result as unknown as CandidateResult).includes(
        "cost_reconciliation_missing",
      ),
    );
    result.evidence_refs = [];
    assert.ok(
      validateCandidateResult(result as unknown as CandidateResult).includes(
        "evidence_incomplete",
      ),
    );
    result.status = "eligible";
    result.disqualifying_failures = ["privacy"];
    assert.ok(
      validateCandidateResult(result as unknown as CandidateResult).includes(
        "governance_failure_must_disqualify",
      ),
    );

    const promotion = structuredClone(valid.promotion_decision) as Record<
      string,
      unknown
    >;
    promotion.candidate_is_decision_maker = true;
    promotion.from_state = "discovered";
    promotion.to_state = "preferred";
    assert.ok(
      validatePromotionDecision(
        promotion as unknown as PromotionDecision,
      ).includes("candidate_self_promotion_forbidden"),
    );
    assert.ok(
      validatePromotionDecision(
        promotion as unknown as PromotionDecision,
      ).includes("lifecycle_transition_invalid"),
    );

    const ajv = new Ajv({ allErrors: true, strict: true });
    addFormats(ajv);
    ajv.addSchema(load("schemas/ai-tournament-common.schema.json"));
    const runtimeSchema = ajv.compile(
      load("schemas/ai-runtime-candidate.schema.json") as object,
    );
    const unsupported = structuredClone(valid.runtime_candidate) as Record<
      string,
      unknown
    >;
    unsupported.session_resume = { sessions: false, resume: "token" };
    assert.equal(runtimeSchema(unsupported), false);
  });

  it("requires explicit human evidence for allowed lifecycle transitions", () => {
    assert.doesNotThrow(() =>
      assertGovernedLifecycleTransition({
        from: "sandbox_only",
        to: "benchmark_candidate",
        human_approved: true,
        evidence_refs: ["weekly.fixture"],
      }),
    );
    assert.throws(
      () =>
        assertGovernedLifecycleTransition({
          from: "discovered",
          to: "preferred",
          human_approved: true,
          evidence_refs: ["weekly.fixture"],
        }),
      /tournament_transition_invalid/,
    );
  });

  it("projects registered candidates read-only with fail-closed eligibility", () => {
    const candidates = [
      load<RuntimeCandidate>("config/ai-tournament-runtime-native.json"),
      load<RuntimeCandidate>("config/ai-tournament-runtime-eve.json"),
      load<RuntimeCandidate>("config/ai-tournament-runtime-cloudflare.json"),
    ];
    const model = buildTournamentOperatorReadModel(candidates);
    assert.equal(model.write_actions_available, false);
    assert.equal(model.registered_candidates.length, 3);
    assert.ok(
      model.registered_candidates.every(
        (candidate) => !candidate.benchmark_eligible,
      ),
    );
    assert.ok(
      model.registered_candidates.every(
        (candidate) => candidate.kill_switch_state === "active",
      ),
    );
    assert.ok(
      model.registered_candidates.every(
        (candidate) => candidate.human_decision_required,
      ),
    );
  });

  it("fails the repository read model closed for a malformed tournament artifact", async () => {
    const model = await loadRepositoryOperatorReadModel({
      repository_root: process.cwd(),
      evaluated_at: REPOSITORY_OPERATOR_EVALUATED_AT,
      artifact_overrides: { tournament_eve: null },
    });
    assert.equal(model.system_summary.overall_status, "invalid_state");
    assert.equal(model.tournament.registered_candidates.length, 2);
    assert.ok(
      model.blockers.some((blocker) =>
        blocker.blocker_code.includes(
          "tournament:unknown:runtime_contract_invalid",
        ),
      ),
    );
  });
});

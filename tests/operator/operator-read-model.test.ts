import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import {
  computeOperatorReadModelHash,
  OPERATOR_READ_MODEL_CONTRACT_VERSION,
} from "../../src/operator/operator-read-model.js";
import {
  loadRepositoryOperatorReadModel,
  REPOSITORY_OPERATOR_EVALUATED_AT,
} from "../../src/operator/repository-operator-read-model.js";
import { evaluateOpenRouterExternalEvidencePack } from "../../src/providers/openrouter-external-evidence-pack.js";
import { evaluateOpenRouterReadinessDossier } from "../../src/providers/openrouter-readiness-dossier.js";
import { evaluateOpenRouterSandboxEnablementProposal } from "../../src/providers/openrouter-sandbox-enablement-proposal.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const load = <T>(path: string): T =>
  JSON.parse(readFileSync(resolve(root, path), "utf8")) as T;
const clone = <T>(value: T): T => structuredClone(value);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (
  ajv: Ajv,
) => void;
const baseOptions = {
  repository_root: root,
  evaluated_at: REPOSITORY_OPERATOR_EVALUATED_AT,
};

describe("AI LAB operator read model", () => {
  it("validates the versioned schema and deterministic hash", async () => {
    const first = await loadRepositoryOperatorReadModel(baseOptions);
    const second = await loadRepositoryOperatorReadModel(baseOptions);
    assert.deepEqual(first, second);
    assert.equal(first.contract_version, OPERATOR_READ_MODEL_CONTRACT_VERSION);
    assert.equal(
      computeOperatorReadModelHash(first),
      first.system_summary.read_model_hash,
    );
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(
      load("schemas/ai-operator-read-model.schema.json"),
    );
    assert.equal(validate(first), true, JSON.stringify(validate.errors));
  });

  it("deeply freezes output, preserves inputs, and orders diagnosis deterministically", async () => {
    const evidence = load<Record<string, unknown>>(
      "config/ai-openrouter-external-evidence-pack.json",
    );
    const before = clone(evidence);
    const result = await loadRepositoryOperatorReadModel({
      ...baseOptions,
      artifact_overrides: { evidence },
    });
    assert.deepEqual(evidence, before);
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.providers));
    assert.ok(Object.isFrozen(result.blockers[0]));
    assert.deepEqual(
      result.blockers.map((entry) => entry.blocker_code),
      result.blockers.map((entry) => entry.blocker_code).sort(),
    );
    assert.deepEqual(
      result.required_human_actions.map((entry) => entry.action_code),
      result.required_human_actions.map((entry) => entry.action_code).sort(),
    );
  });

  it("accurately exposes repository-backed OpenRouter as blocked and disabled", async () => {
    const result = await loadRepositoryOperatorReadModel(baseOptions);
    const provider = result.providers[0]!;
    assert.equal(result.system_summary.overall_status, "blocked");
    assert.equal(provider["provider_id"], "openrouter");
    assert.equal(provider["execution_allowed"], false);
    assert.equal(provider["adapter_state"], "disabled");
    assert.equal(provider["readiness_status"], "blocked");
    assert.equal(provider["proposal_status"], "blocked");
    assert.equal(provider["preflight_status"], "blocked");
    assert.equal(provider["kill_switch_status"], "active");
    assert.equal(provider["secret_status"], "not_configured");
    assert.equal(result.models[0]?.model_id, "minimax/minimax-m2.7");
    assert.equal(result.models[0]?.enabled, false);
    assert.equal(result.routes[0]?.enabled, false);
    assert.deepEqual(result.routes[0]?.executable_profile_ids, []);
    assert.equal(result.execution_profiles[0]?.enabled, false);
    assert.equal(result.budget_state.status, "disabled");
    assert.equal(result.evidence.review_status, "pending");
    assert.equal(result.authorization.status, "no_policy_issued");
    assert.equal(result.authorization.exact_policy_hash, null);
    assert.equal(result.consumption.status, "not_attempted");
    assert.equal(result.consumption.attempted_count, 0);
    assert.equal(result.gateway_adapter_state.gateway_invoked, false);
    assert.equal(result.gateway_adapter_state.transport_invoked, false);
    assert.equal(result.arca_candidate_review.review_lifecycle, "pending");
    assert.equal(
      result.arca_candidate_review.evaluation_outcome,
      "pending_human_review",
    );
    assert.equal(result.arca_candidate_review.reviewer_present, false);
    assert.equal(
      result.arca_candidate_review.eligible_for_approved_artifact_building,
      false,
    );
    assert.equal(result.arca_candidate_review.export_authorized, false);
    assert.equal(result.arca_candidate_review.publication_authorized, false);
    assert.equal(result.governed_candidates.length, 2);
    const minimax = result.governed_candidates.find(
      (candidate) => candidate.candidate_id === "minimax/minimax-m2.7",
    )!;
    const glm = result.governed_candidates.find(
      (candidate) => candidate.candidate_id === "z-ai/glm-5.2",
    )!;
    assert.equal(
      minimax.profile.hash,
      "335bd24f9cb4aa573b65ef3f6d5c2ebcf19d150441bf7bc7d14421e7d88c8720",
    );
    assert.equal(
      glm.profile.hash,
      "5dc48fa5584e1326293af73f392256c4dff07b6bd649c47436088d17c7650291",
    );
    assert.notEqual(minimax.profile.hash, glm.profile.hash);
    assert.equal(glm.readiness, "blocked");
    assert.equal(glm.runtime_preflight, "blocked");
    assert.equal(glm.authorization, "no_policy_issued");
    assert.equal(glm.consumption, "not_attempted");
    assert.deepEqual(glm.conformance, {
      status: "failed",
      cases_attempted: 1,
      cases_passed: 0,
      schema_pass_rate: "0/3",
      provider_routing_match: "unavailable",
      zdr_evidence_status: "runtime_incomplete",
      budget_reconciliation: "incomplete",
      retries: 2,
      duplicate_consumption_result: "safe",
      blockers: [
        "live_transport_failed_after_bounded_attempts",
        "served_provider_unavailable",
        "served_model_unavailable",
        "served_endpoint_unavailable",
        "runtime_zdr_evidence_incomplete",
        "schema_conformance_not_observed",
        "provider_usage_and_cost_unavailable",
        "budget_reconciliation_incomplete",
        "gold_case_score_unavailable",
        "independent_review_pending",
      ],
      independent_review_required: true,
      activation_prohibited: true,
      kill_switch_state: "active",
    });
    assert.deepEqual(glm.adapter_gateway_transport_state, {
      adapter: "disabled",
      gateway: "not_invoked",
      transport: "not_invoked",
    });
    assert.ok(glm.blocker_count > 0);
    assert.ok(
      result.blockers.some(
        (blocker) =>
          blocker.candidate_id === "z-ai/glm-5.2" &&
          blocker.blocker_code.includes("evidence_review_pending"),
      ),
    );
  });

  it("reuses existing evaluator outcomes", async () => {
    const at = new Date(REPOSITORY_OPERATOR_EVALUATED_AT);
    const dossier = load<unknown>(
      "config/ai-openrouter-readiness-dossier.json",
    );
    const evidence = load<unknown>(
      "config/ai-openrouter-external-evidence-pack.json",
    );
    const proposal = load<unknown>(
      "config/ai-openrouter-sandbox-enablement-proposal.json",
    );
    const result = await loadRepositoryOperatorReadModel(baseOptions);
    assert.equal(
      result.readiness.outcome,
      evaluateOpenRouterReadinessDossier(dossier, at).outcome,
    );
    assert.equal(
      result.evidence.outcome,
      evaluateOpenRouterExternalEvidencePack(evidence, at).outcome,
    );
    assert.equal(
      result.sandbox_proposals[0]?.outcome,
      evaluateOpenRouterSandboxEnablementProposal(proposal, at).outcome,
    );
  });

  it("fails closed for malformed registry and missing dossier", async () => {
    const malformed = await loadRepositoryOperatorReadModel({
      ...baseOptions,
      artifact_overrides: { models: {} },
    });
    assert.equal(malformed.system_summary.overall_status, "invalid_state");
    const missing = await loadRepositoryOperatorReadModel({
      ...baseOptions,
      artifact_overrides: { dossier: null },
    });
    assert.equal(missing.system_summary.overall_status, "invalid_state");
    const invalidArcaReview = await loadRepositoryOperatorReadModel({
      ...baseOptions,
      artifact_overrides: { arca_review_fixture: {} },
    });
    assert.equal(
      invalidArcaReview.system_summary.overall_status,
      "invalid_state",
    );
    assert.equal(
      invalidArcaReview.arca_candidate_review.evaluation_outcome,
      "invalid_candidate",
    );
  });

  it("fails closed for evidence, proposal, and runtime binding hash mismatches", async () => {
    const evidence = load<Record<string, unknown>>(
      "config/ai-openrouter-external-evidence-pack.json",
    );
    evidence["pack_hash"] = "0".repeat(64);
    const invalidEvidence = await loadRepositoryOperatorReadModel({
      ...baseOptions,
      artifact_overrides: { evidence },
    });
    assert.equal(
      invalidEvidence.system_summary.overall_status,
      "invalid_state",
    );

    const proposal = load<Record<string, unknown>>(
      "config/ai-openrouter-sandbox-enablement-proposal.json",
    );
    proposal["proposal_hash"] = "0".repeat(64);
    const invalidProposal = await loadRepositoryOperatorReadModel({
      ...baseOptions,
      artifact_overrides: { proposal },
    });
    assert.equal(
      invalidProposal.system_summary.overall_status,
      "invalid_state",
    );

    const runtime = load<Record<string, unknown>>(
      "config/ai-openrouter-sandbox-runtime.json",
    );
    (runtime["bindings"] as Record<string, unknown>)["route_hash"] = "0".repeat(
      64,
    );
    const invalidRuntime = await loadRepositoryOperatorReadModel({
      ...baseOptions,
      artifact_overrides: { runtime },
    });
    assert.equal(invalidRuntime.system_summary.overall_status, "invalid_state");
  });

  it("serializes audit-safe metadata without sensitive payloads", async () => {
    const serialized = JSON.stringify(
      await loadRepositoryOperatorReadModel(baseOptions),
    );
    for (const forbidden of [
      /authorization_token/i,
      /raw_document/i,
      /raw_model_output/i,
      /prompt_payload/i,
      /Bearer\s/i,
      /sk-or-/i,
    ])
      assert.doesNotMatch(serialized, forbidden);
  });

  it("snapshot command prints blocked JSON successfully and exits nonzero for invalid state", () => {
    const command = [
      "--import",
      "tsx",
      "scripts/operator-snapshot.ts",
      "--evaluated-at",
      REPOSITORY_OPERATOR_EVALUATED_AT,
    ];
    const valid = spawnSync(process.execPath, command, {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(
      JSON.parse(valid.stdout).system_summary.overall_status,
      "blocked",
    );

    const temporary = mkdtempSync(resolve(tmpdir(), "operator-read-model-"));
    cpSync(resolve(root, "config"), resolve(temporary, "config"), {
      recursive: true,
    });
    writeFileSync(
      resolve(temporary, "config/ai-openrouter-model-registry.json"),
      "{}\n",
    );
    const invalid = spawnSync(
      process.execPath,
      [...command, "--repository-root", temporary],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(invalid.status, 1, invalid.stderr);
    assert.equal(
      JSON.parse(invalid.stdout).system_summary.overall_status,
      "invalid_state",
    );
  });
});

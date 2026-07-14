import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import {
  OPENROUTER_FIRST_RUN_FIXTURE_ID,
  runOpenRouterManualSandboxHarness,
} from "../../src/providers/openrouter-sandbox-harness.js";
import {
  evaluateOpenRouterSandboxPreflight,
  validateOpenRouterSandboxRuntimeConfig,
  type OpenRouterSandboxRuntimeConfig,
} from "../../src/providers/openrouter-sandbox-preflight.js";

const load = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (
  ajv: Ajv,
) => void;
const repositoryConfig = load<OpenRouterSandboxRuntimeConfig>(
  "config/ai-openrouter-sandbox-runtime.json",
);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function readyConfig(): OpenRouterSandboxRuntimeConfig {
  const c = clone(repositoryConfig) as unknown as Record<string, unknown>;
  (c.adapter as Record<string, unknown>).enabled = true;
  (c.kill_switch as Record<string, unknown>).active = false;
  (c.bindings as Record<string, unknown>).exact_policy_hash = "a".repeat(64);
  Object.assign(c, {
    approval_state: "approved",
    approval_issuer: "independent.security.reviewer",
    approval_scope: "manual_sandbox_execution_exact_hashes",
    approval_expires_at: "2026-08-10T00:00:00.000Z",
    readiness_outcome: "eligible",
    proposal_outcome: "eligible_for_configuration",
    exact_routing_status: "verified",
    privacy_review: "approved",
    retention_review: "approved",
    training_use_review: "approved",
    geography_review: "approved",
    zdr_review: "approved",
    structured_output_review: "approved",
    benchmark_acceptance: "approved",
    legal_review: "approved",
    security_review: "approved",
    model_enabled: true,
    route_enabled: true,
    profile_enabled: true,
    budget_enabled: true,
  });
  return c as unknown as OpenRouterSandboxRuntimeConfig;
}

function dependencies(config: OpenRouterSandboxRuntimeConfig) {
  return {
    expected_bindings: config.bindings,
    kill_switch: {
      evaluate: (reference: string) => ({ reference, active: false }),
    },
    budget: { available: () => true },
    now: new Date("2026-07-20T00:00:00.000Z"),
    operator_id: "manual.operator",
    invocation: "manual" as const,
    test_data_classification: "synthetic" as const,
  };
}

describe("OpenRouter sandbox runtime configuration and preflight", () => {
  it("validates the versioned repository metadata contract", () => {
    const schema = load<object>(
      "schemas/ai-openrouter-sandbox-runtime.schema.json",
    );
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    assert.equal(ajv.compile(schema)(repositoryConfig), true);
    assert.deepEqual(
      validateOpenRouterSandboxRuntimeConfig(repositoryConfig),
      [],
    );
    const registry = load<{ contracts: { contract_name: string }[] }>(
      "schemas/schema-registry.json",
    );
    assert.ok(
      registry.contracts.some(
        (entry) => entry.contract_name === "ai_openrouter_sandbox_runtime",
      ),
    );
  });

  it("keeps repository-backed evaluation blocked without secret access", async () => {
    let secretCalls = 0;
    const result = await evaluateOpenRouterSandboxPreflight({
      config: repositoryConfig,
      ...dependencies(repositoryConfig),
      resolve_secret: true,
      secret_provider: { resolve: async () => ((secretCalls += 1), "never") },
    });
    assert.equal(result.outcome, "blocked");
    assert.equal(secretCalls, 0);
  });

  it("rejects malformed controls and ceilings as invalid configuration", async () => {
    for (const mutation of [
      { fallback_enabled: true },
      { automatic_retries: 1 },
      { manual_only: false },
      { timeout_ms: 10001 },
      { maximum_input_tokens: 8001 },
      { maximum_output_tokens: 2001 },
      { maximum_requests: 11 },
      { maximum_total_spend_usd: "0.06" },
      { secret_reference_name: "" },
    ]) {
      const config = Object.assign(clone(repositoryConfig), mutation);
      const result = await evaluateOpenRouterSandboxPreflight({
        config,
        ...dependencies(repositoryConfig),
        resolve_secret: false,
      });
      assert.equal(
        result.outcome,
        "invalid_configuration",
        JSON.stringify(mutation),
      );
    }
  });

  it("blocks independent integrity hash mismatch", async () => {
    const config = readyConfig();
    const expected = { ...config.bindings, route_hash: "b".repeat(64) };
    const result = await evaluateOpenRouterSandboxPreflight({
      config,
      ...dependencies(config),
      expected_bindings: expected,
      resolve_secret: false,
    });
    assert.equal(result.outcome, "blocked");
    assert.deepEqual(result.reasons, ["integrity_hash_mismatch"]);
  });

  it("blocks each unresolved readiness, routing, review, and benchmark gate", async () => {
    const cases: [keyof OpenRouterSandboxRuntimeConfig, unknown][] = [
      ["readiness_outcome", "blocked"],
      ["proposal_outcome", "blocked"],
      ["exact_routing_status", "unresolved"],
      ["privacy_review", "pending"],
      ["retention_review", "pending"],
      ["training_use_review", "pending"],
      ["geography_review", "pending"],
      ["zdr_review", "pending"],
      ["structured_output_review", "pending"],
      ["benchmark_acceptance", "missing"],
      ["legal_review", "pending"],
      ["security_review", "pending"],
    ];
    for (const [key, value] of cases) {
      const config = {
        ...readyConfig(),
        [key]: value,
      } as OpenRouterSandboxRuntimeConfig;
      const result = await evaluateOpenRouterSandboxPreflight({
        config,
        ...dependencies(config),
        resolve_secret: false,
      });
      assert.equal(result.outcome, "blocked", String(key));
    }
  });

  it("requires exact, current, independent execution approval", async () => {
    for (const mutation of [
      { approval_state: "pending" },
      { approval_scope: "sandbox_configuration_proposal_only" },
      { approval_issuer: "manual.operator" },
      { approval_expires_at: "2026-07-19T00:00:00.000Z" },
    ]) {
      const config = Object.assign(
        readyConfig(),
        mutation,
      ) as OpenRouterSandboxRuntimeConfig;
      const result = await evaluateOpenRouterSandboxPreflight({
        config,
        ...dependencies(config),
        resolve_secret: false,
      });
      assert.equal(
        result.outcome,
        "approval_required",
        JSON.stringify(mutation),
      );
    }
  });

  it("evaluates kill switch and budget before secret resolution", async () => {
    const config = readyConfig();
    let secretCalls = 0;
    const secret_provider = {
      resolve: async () => ((secretCalls += 1), "secret"),
    };
    const killed = await evaluateOpenRouterSandboxPreflight({
      config,
      ...dependencies(config),
      kill_switch: { evaluate: (reference) => ({ reference, active: true }) },
      secret_provider,
      resolve_secret: true,
    });
    assert.equal(killed.outcome, "kill_switch_active");
    const noBudget = await evaluateOpenRouterSandboxPreflight({
      config,
      ...dependencies(config),
      budget: { available: () => false },
      secret_provider,
      resolve_secret: true,
    });
    assert.equal(noBudget.outcome, "budget_unavailable");
    assert.equal(secretCalls, 0);
  });

  it("rejects missing or blank final-boundary secrets and can become ready synthetically", async () => {
    const config = readyConfig();
    for (const secret of [undefined, " "]) {
      const result = await evaluateOpenRouterSandboxPreflight({
        config,
        ...dependencies(config),
        secret_provider: { resolve: async () => secret },
        resolve_secret: true,
      });
      assert.equal(result.outcome, "secret_unavailable");
    }
    const ready = await evaluateOpenRouterSandboxPreflight({
      config,
      ...dependencies(config),
      secret_provider: { resolve: async () => "synthetic-test-secret" },
      resolve_secret: true,
    });
    assert.equal(ready.outcome, "ready_for_manual_sandbox_call");
    assert.doesNotMatch(JSON.stringify(ready), /synthetic-test-secret/);
    assert.equal(Object.isFrozen(ready), true);
  });
});

describe("OpenRouter manual first-run harness", () => {
  it("preflight-only never resolves a secret, calls an executor, or consumes", async () => {
    let secretCalls = 0;
    let executorCalls = 0;
    const result = await runOpenRouterManualSandboxHarness({
      config: repositoryConfig,
      expected_bindings: repositoryConfig.bindings,
      supplied_hashes: repositoryConfig.bindings,
      kill_switch: { evaluate: (reference) => ({ reference, active: true }) },
      budget: { available: () => false },
      secret_provider: { resolve: async () => ((secretCalls += 1), "never") },
      executor: {
        executeFixture: async () => (
          (executorCalls += 1),
          { adapter_outcome: "success", consumption_result: "consumed" }
        ),
      },
      fixture_id: OPENROUTER_FIRST_RUN_FIXTURE_ID,
      confirmation: false,
      preflight_only: true,
      now: new Date("2026-07-20T00:00:00.000Z"),
      operator_id: "manual.operator",
      on_preflight: () => undefined,
    });
    assert.equal(result.status, "preflight_only");
    assert.equal(result.consumption_result, "not_attempted");
    assert.equal(secretCalls, 0);
    assert.equal(executorCalls, 0);
  });

  it("rejects arbitrary fixture identity and requires explicit confirmation", async () => {
    const base = {
      config: readyConfig(),
      expected_bindings: readyConfig().bindings,
      supplied_hashes: readyConfig().bindings,
      kill_switch: {
        evaluate: (reference: string) => ({ reference, active: false }),
      },
      budget: { available: () => true },
      secret_provider: { resolve: async () => "synthetic" },
      executor: {
        executeFixture: async () => ({
          adapter_outcome: "success",
          consumption_result: "consumed",
        }),
      },
      confirmation: false,
      preflight_only: false,
      now: new Date("2026-07-20T00:00:00.000Z"),
      operator_id: "manual.operator",
      on_preflight: () => undefined,
    };
    await assert.rejects(
      runOpenRouterManualSandboxHarness({
        ...base,
        fixture_id: "arbitrary.prompt",
      }),
      /fixture_not_approved/,
    );
    await assert.rejects(
      runOpenRouterManualSandboxHarness({
        ...base,
        fixture_id: OPENROUTER_FIRST_RUN_FIXTURE_ID,
      }),
      /explicit_confirmation_required/,
    );
  });
});

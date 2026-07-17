import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

import {
  GLM_CONFORMANCE_CHAT_COMPLETIONS_PATH,
  GLM_CONFORMANCE_MAX_ATTEMPTS,
  GLM_CONFORMANCE_MAX_REQUEST_USD,
  GLM_CONFORMANCE_TOTAL_BUDGET_USD,
  GlmFireworksControlledConformanceHarness,
  InMemoryGlmConformanceIdempotencyStore,
  buildGlmConformanceRequest,
  calculateMaximumCostUsd,
  computeGlmConformanceAuthorizationBindingHash,
  conformanceHash,
  glmConformanceGoldCases,
  glmConformanceSandboxBudget,
  glmConformanceScenarioFixtures,
  importOperationPreAssessmentCandidateV1Schema,
  validateGlmConformanceRequest,
  type GlmConformanceRequest,
  type GlmConformanceTransport,
  type GlmConformanceTransportResponse,
} from "../../src/conformance/index.js";
import {
  InMemoryAuthorizationStateStore,
  SqliteAuthorizationStateStore,
  type AuthorizationStateStore,
} from "../../src/handoff/authorization-store.js";
import {
  CapabilityEvaluator,
  normalizeObservedOutcome,
} from "../../src/evaluation/evaluator.js";
import { EVALUATION_CONTRACT_VERSION } from "../../src/evaluation/contracts.js";

const NOW = new Date("2026-07-17T15:05:00.000Z");
const addFormats = ((
  addFormatsModule as unknown as { default?: typeof addFormatsModule }
).default ?? addFormatsModule) as unknown as (ajv: Ajv) => void;

const validOutput = (
  correlationId: string,
  patch: Record<string, unknown> = {},
) => ({
  source_document_refs: ["synthetic.invoice.inv-1001"],
  extracted_parties: {
    supplier: "Rio Plata Synthetic Supplies SA",
    buyer: "Northwind Demo Imports LLC",
  },
  trade_terms: { incoterm: "FOB", named_place: "Buenos Aires" },
  currency: "USD",
  line_items: [
    {
      line_number: 1,
      description: "Stainless demo cups",
      quantity: "100",
      unit: "EA",
      unit_price: "2.50",
      line_total: "250.00",
    },
    {
      line_number: 2,
      description: "Silicone demo lids",
      quantity: "100",
      unit: "EA",
      unit_price: "0.75",
      line_total: "75.00",
    },
  ],
  totals: {
    subtotal: "325.00",
    freight: "0.00",
    insurance: "0.00",
    grand_total: "325.00",
    arithmetic_consistent: true,
  },
  logistics: {
    gross_weight_kg: "44.00",
    net_weight_kg: "40.00",
    packages: 2,
    dimensions_cm: [{ length: "60", width: "40", height: "35" }],
    country_of_origin: "Argentina",
  },
  missing_information: [],
  inconsistencies: [],
  clarification_questions: [],
  classification_readiness: {
    status: "ready_for_human_classification",
    definitive_hs_or_ncm_assigned: false,
    reason:
      "Extraction is complete enough for independent human classification.",
  },
  risk_flags: [],
  confidence: {
    overall: 0.98,
    parties: 0.99,
    trade_terms: 0.99,
    line_items: 0.98,
    totals: 0.99,
    logistics: 0.97,
  },
  model_execution_evidence: {
    requested_model: "z-ai/glm-5.2",
    expected_provider: "fireworks",
    expected_endpoint_tag: "fireworks",
    correlation_id: correlationId,
    schema_version: "1.0.0",
  },
  human_review_required: true,
  approval_status: "pending_review",
  ...patch,
});

const providerResponse = (
  request: GlmConformanceRequest,
  output: unknown = validOutput(request.correlation_id),
  patch: Record<string, unknown> = {},
): GlmConformanceTransportResponse => ({
  status: 200,
  received_at: NOW.toISOString(),
  endpoint_tag: "fireworks",
  generation_cost_usd: "0.00036",
  retention: "request_zdr=true; upstream contractual retention unresolved",
  training_use: "request_zdr=true; upstream training metadata unavailable",
  body: JSON.stringify({
    id: "request.ai-122.001",
    generation_id: "generation.ai-122.001",
    provider: "Fireworks",
    model: "z-ai/glm-5.2",
    choices: [
      {
        finish_reason: "stop",
        message: { role: "assistant", content: JSON.stringify(output) },
      },
    ],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
      cost: "0.00036",
    },
    ...patch,
  }),
});

const harness = (
  transport: GlmConformanceTransport,
  authorizationStore: AuthorizationStateStore = new InMemoryAuthorizationStateStore(),
  idempotencyStore = new InMemoryGlmConformanceIdempotencyStore(),
  signal?: AbortSignal,
) =>
  new GlmFireworksControlledConformanceHarness({
    authorizationStore,
    idempotencyStore,
    transport,
    clock: () => NOW,
    ...(signal ? { signal } : {}),
  });

const clone = <T>(value: T): T => structuredClone(value);

describe("AI-122 GLM Fireworks controlled conformance", () => {
  it("provides the complete immutable synthetic gold and failure fixture inventory", () => {
    assert.equal(glmConformanceGoldCases.length, 5);
    assert.deepEqual(
      glmConformanceGoldCases.map((item) => item.case_id),
      [
        "ai-122.structured-extraction",
        "ai-122.document-inconsistency",
        "ai-122.clarification",
        "ai-122.prompt-injection-safety",
        "ai-122.invalid-structured-output-recovery",
      ],
    );
    assert.ok(Object.isFrozen(glmConformanceGoldCases));
    assert.ok(
      glmConformanceGoldCases.every((item) => item.input.includes("SYNTHETIC")),
    );
    assert.deepEqual(
      glmConformanceScenarioFixtures.map((item) => item.scenario_id),
      [
        "valid_controlled_request",
        "provider_mismatch",
        "endpoint_mismatch",
        "model_mismatch",
        "missing_zdr",
        "budget_exceeded",
        "stale_authorization",
        "duplicate_idempotency_key",
        "invalid_json",
        "schema_additional_property",
        "timeout",
        "retry_exhaustion",
        "incomplete_evidence",
        "attempted_automatic_approval",
        "kill_switch_disabled",
      ],
    );
  });

  it("validates the closed request and output schemas independently", () => {
    const request = buildGlmConformanceRequest("ai-122.structured-extraction");
    assert.deepEqual(validateGlmConformanceRequest(request, NOW), []);
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const outputValidator = ajv.compile(
      JSON.parse(
        readFileSync(
          "schemas/import-operation-pre-assessment-candidate-v1.schema.json",
          "utf8",
        ),
      ),
    );
    assert.equal(outputValidator(validOutput(request.correlation_id)), true);
    assert.equal(
      outputValidator({
        ...validOutput(request.correlation_id),
        unexpected: true,
      }),
      false,
    );
    assert.equal(
      Object.isFrozen(importOperationPreAssessmentCandidateV1Schema),
      true,
    );
  });

  it("binds authorization to every purpose, route, case, schema, budget, token, timeout, privacy, expiry, and idempotency field", () => {
    const base = buildGlmConformanceRequest("ai-122.structured-extraction");
    const mutations: [string, (value: Record<string, unknown>) => void][] = [
      [
        "execution_profile",
        (value) => void (value.execution_profile = "other.profile"),
      ],
      [
        "expected_model_id",
        (value) => void (value.expected_model_id = "z-ai/glm-5.1"),
      ],
      [
        "expected_provider_slug",
        (value) => void (value.expected_provider_slug = "z-ai"),
      ],
      [
        "expected_endpoint_tag",
        (value) => void (value.expected_endpoint_tag = "fireworks/fast"),
      ],
      [
        "gold_case_id",
        (value) => void (value.gold_case_id = "ai-122.clarification"),
      ],
      ["schema_version", (value) => void (value.schema_version = "2.0.0")],
      [
        "maximum_request_cost_usd",
        (value) => void (value.maximum_request_cost_usd = "0.014"),
      ],
      [
        "maximum_input_tokens",
        (value) => void (value.maximum_input_tokens = 3999),
      ],
      [
        "maximum_output_tokens",
        (value) => void (value.maximum_output_tokens = 1199),
      ],
      ["timeout_ms", (value) => void (value.timeout_ms = 14999)],
      ["privacy_class", (value) => void (value.privacy_class = "confidential")],
      ["zdr_required", (value) => void (value.zdr_required = false)],
      [
        "idempotency_key",
        (value) => void (value.idempotency_key = "ai-122.other.idem"),
      ],
    ];
    for (const [name, mutate] of mutations) {
      const changed = clone(base) as unknown as Record<string, unknown>;
      mutate(changed);
      assert.notEqual(
        computeGlmConformanceAuthorizationBindingHash(
          changed as unknown as GlmConformanceRequest,
        ),
        base.authorization.binding_hash,
        name,
      );
      assert.ok(
        validateGlmConformanceRequest(changed, NOW).includes(
          "authorization_binding_mismatch",
        ) ||
          validateGlmConformanceRequest(changed, NOW).includes(
            "request_schema_invalid",
          ),
        name,
      );
    }
    const stale = clone(base) as unknown as {
      authorization: { expires_at: string; binding_hash: string };
    } & GlmConformanceRequest;
    stale.authorization.expires_at = "2026-07-17T15:04:00.000Z";
    stale.authorization.binding_hash =
      computeGlmConformanceAuthorizationBindingHash(stale);
    assert.ok(
      validateGlmConformanceRequest(stale, NOW).includes(
        "authorization_expired_or_not_yet_valid",
      ),
    );
  });

  it("builds one exact strict-ZDR request and passes with complete mock evidence", async () => {
    const request = buildGlmConformanceRequest("ai-122.structured-extraction");
    let calls = 0;
    const result = await harness(async (transportRequest) => {
      calls += 1;
      assert.equal(transportRequest.method, "POST");
      assert.equal(
        transportRequest.path,
        GLM_CONFORMANCE_CHAT_COMPLETIONS_PATH,
      );
      assert.equal(transportRequest.idempotency_key, request.idempotency_key);
      const body = JSON.parse(transportRequest.body) as Record<string, unknown>;
      assert.equal(body["model"], "z-ai/glm-5.2");
      assert.equal(body["max_tokens"], 1200);
      assert.deepEqual(body["provider"], {
        only: ["fireworks"],
        order: ["fireworks"],
        allow_fallbacks: false,
        require_parameters: true,
        data_collection: "deny",
        zdr: true,
      });
      assert.equal(
        (body["response_format"] as Record<string, unknown>)["type"],
        "json_schema",
      );
      return providerResponse(request);
    }).execute(request);
    assert.equal(calls, 1);
    assert.equal(result.status, "passed");
    assert.equal(result.authorization_consume_count, 1);
    assert.equal(result.authorization_consumption_outcome, "consumed");
    assert.equal(result.retry_count, 0);
    assert.equal(result.attempts[0]?.schema_valid, true);
    assert.equal(result.attempts[0]?.actual_provider, "Fireworks");
    assert.equal(result.attempts[0]?.actual_endpoint_tag, "fireworks");
    assert.equal(result.attempts[0]?.actual_model, "z-ai/glm-5.2");
    assert.equal(result.provider_reported_cost_usd, "0.00036000");
    assert.equal(result.openrouter_generation_cost_usd, "0.00036000");
    assert.equal(result.local_calculated_cost_usd, "0.00036000");
    assert.equal(result.cost_discrepancy_usd, "0.00000000");
    assert.equal(result.approval_status, "pending_review");
    assert.equal(result.automatic_promotion_allowed, false);
    assert.equal(result.independent_review_required, true);
    assert.equal(result.activation_prohibited, true);
    assert.equal(result.global_kill_switch_state, "active");
    assert.equal(result.reusable_authorization_remaining, false);
    const { evidence_hash: evidenceHash, ...withoutHash } = result;
    assert.equal(evidenceHash, conformanceHash(withoutHash));
  });

  it("blocks missing ZDR, disabled kill switch, stale authorization, and budgets before transport", async () => {
    const valid = buildGlmConformanceRequest("ai-122.structured-extraction");
    const cases: unknown[] = [];
    for (const mutation of [
      { zdr_required: false },
      { global_kill_switch_active: false },
    ]) {
      const request = { ...clone(valid), ...mutation };
      (request.authorization as { binding_hash: string }).binding_hash =
        computeGlmConformanceAuthorizationBindingHash(
          request as unknown as GlmConformanceRequest,
        );
      cases.push(request);
    }
    cases.push(
      buildGlmConformanceRequest("ai-122.structured-extraction", {
        maximum_request_cost_usd: "0.001",
      }),
    );
    const stale = clone(valid) as unknown as {
      authorization: { expires_at: string; binding_hash: string };
    } & GlmConformanceRequest;
    stale.authorization.expires_at = "2026-07-17T15:04:00.000Z";
    stale.authorization.binding_hash =
      computeGlmConformanceAuthorizationBindingHash(stale);
    cases.push(stale);
    let calls = 0;
    for (const request of cases) {
      const result = await harness(async () => {
        calls += 1;
        return providerResponse(valid);
      }).execute(request);
      assert.equal(result.status, "blocked");
      assert.equal(result.authorization_consume_count, 0);
    }
    assert.equal(calls, 0);
  });

  it("fails closed on provider, endpoint, model, and incomplete runtime evidence", async () => {
    const scenarios: Array<{
      expected: string;
      response: (
        request: GlmConformanceRequest,
      ) => GlmConformanceTransportResponse;
    }> = [
      {
        expected: "provider_mismatch_or_missing",
        response: (request) =>
          providerResponse(request, undefined, { provider: "Z.AI" }),
      },
      {
        expected: "endpoint_mismatch",
        response: (request) => ({
          ...providerResponse(request),
          endpoint_tag: "fireworks/fast",
        }),
      },
      {
        expected: "model_mismatch_or_missing",
        response: (request) =>
          providerResponse(request, undefined, { model: "z-ai/glm-5.1" }),
      },
      {
        expected: "generation_id_missing",
        response: (request) => {
          const response = providerResponse(request);
          const body = JSON.parse(response.body) as Record<string, unknown>;
          delete body["generation_id"];
          delete body["usage"];
          return { ...response, body: JSON.stringify(body) };
        },
      },
    ];
    for (const [index, scenario] of scenarios.entries()) {
      const request = buildGlmConformanceRequest(
        "ai-122.structured-extraction",
        {
          authorization: {
            ...buildGlmConformanceRequest("ai-122.structured-extraction")
              .authorization,
            authorization_id: `ai-122.route-${index}`,
          },
          idempotency_key: `ai-122.route-${index}.idem`,
          correlation_id: `ai-122.route-${index}.correlation`,
        },
      );
      const result = await harness(async () =>
        scenario.response(request),
      ).execute(request);
      assert.equal(result.status, "failed", scenario.expected);
      assert.ok(
        result.attempts[0]?.validation_errors.includes(scenario.expected),
      );
      assert.equal(result.result, null);
    }
  });

  it("retries invalid JSON and schema failures without duplicate authorization consumption", async () => {
    const request = buildGlmConformanceRequest(
      "ai-122.invalid-structured-output-recovery",
    );
    let calls = 0;
    const result = await harness(async () => {
      calls += 1;
      if (calls === 1)
        return {
          ...providerResponse(request),
          body: "not-json",
        };
      if (calls === 2)
        return providerResponse(request, {
          ...validOutput(request.correlation_id),
          unexpected: true,
        });
      return providerResponse(request);
    }).execute(request);
    assert.equal(result.status, "passed");
    assert.equal(calls, 3);
    assert.equal(result.retry_count, 2);
    assert.equal(result.authorization_consume_count, 1);
    assert.equal(result.attempts[0]?.schema_valid, false);
    assert.equal(result.attempts[1]?.schema_valid, false);
    assert.equal(result.attempts[2]?.schema_valid, true);
  });

  it("fails after retry exhaustion and never returns or approves an invalid artifact", async () => {
    const request = buildGlmConformanceRequest(
      "ai-122.invalid-structured-output-recovery",
    );
    const result = await harness(async () =>
      providerResponse(request, {
        ...validOutput(request.correlation_id),
        approval_status: "approved",
      }),
    ).execute(request);
    assert.equal(result.status, "failed");
    assert.equal(result.attempts.length, GLM_CONFORMANCE_MAX_ATTEMPTS);
    assert.equal(result.authorization_consume_count, 1);
    assert.ok(
      result.attempts.every((attempt) =>
        attempt.validation_errors.includes("automatic_approval_attempted"),
      ),
    );
    assert.equal(result.result, null);
    assert.equal(result.approval_status, "pending_review");
    assert.equal(result.lifecycle_recommendation, "remain_blocked");
  });

  it("handles duplicate idempotency keys safely without a second call or artifact", async () => {
    const request = buildGlmConformanceRequest("ai-122.structured-extraction");
    const idempotency = new InMemoryGlmConformanceIdempotencyStore();
    let calls = 0;
    const controlled = harness(
      async () => {
        calls += 1;
        return providerResponse(request);
      },
      new InMemoryAuthorizationStateStore(),
      idempotency,
    );
    assert.equal((await controlled.execute(request)).status, "passed");
    const duplicate = await controlled.execute(request);
    assert.equal(duplicate.status, "blocked");
    assert.ok(duplicate.reason_codes.includes("duplicate_idempotency_key"));
    assert.equal(duplicate.authorization_consume_count, 0);
    assert.equal(duplicate.result, null);
    assert.equal(calls, 1);
  });

  it("persists single-use consumption durably across store restart", async () => {
    const path = join(
      mkdtempSync(join(tmpdir(), "ai-122-authorization-")),
      "authorization.sqlite",
    );
    const firstStore = new SqliteAuthorizationStateStore({
      databasePath: path,
    });
    firstStore.initialize();
    const request = buildGlmConformanceRequest("ai-122.structured-extraction");
    const first = await harness(
      async () => providerResponse(request),
      firstStore,
    ).execute(request);
    assert.equal(first.status, "passed");
    firstStore.close();
    let calls = 0;
    const restarted = new SqliteAuthorizationStateStore({ databasePath: path });
    const replay = await harness(async () => {
      calls += 1;
      return providerResponse(request);
    }, restarted).execute(request);
    assert.equal(replay.status, "blocked");
    assert.equal(replay.authorization_consumption_outcome, "already_consumed");
    assert.equal(calls, 0);
    restarted.close();
  });

  it("enforces timeout and cancellation with correlated partial evidence", async () => {
    const timeoutRequest = buildGlmConformanceRequest(
      "ai-122.structured-extraction",
      { timeout_ms: 5, retry_limit: 0 },
    );
    const never: GlmConformanceTransport = () => new Promise(() => undefined);
    const timedOut = await harness(never).execute(timeoutRequest);
    assert.equal(timedOut.status, "failed");
    assert.equal(timedOut.attempts[0]?.status, "timeout");
    assert.equal(timedOut.correlation_id, timeoutRequest.correlation_id);
    assert.equal(timedOut.authorization_consume_count, 1);

    const controller = new AbortController();
    controller.abort(new Error("operator_cancelled"));
    const cancelRequest = buildGlmConformanceRequest("ai-122.clarification", {
      retry_limit: 0,
    });
    const cancelled = await harness(
      never,
      undefined,
      undefined,
      controller.signal,
    ).execute(cancelRequest);
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.attempts[0]?.status, "cancelled");
    assert.equal(cancelled.result, null);
  });

  it("enforces request and run budgets and blocks material reconciliation discrepancies", async () => {
    assert.equal(glmConformanceSandboxBudget.production_budget, false);
    assert.equal(glmConformanceSandboxBudget.execution_authority, false);
    assert.equal(glmConformanceSandboxBudget.status, "prepared_not_activated");
    assert.equal(
      glmConformanceSandboxBudget.maximum_total_task_cost_usd,
      GLM_CONFORMANCE_TOTAL_BUDGET_USD,
    );
    assert.equal(
      glmConformanceSandboxBudget.maximum_cost_per_live_request_usd,
      GLM_CONFORMANCE_MAX_REQUEST_USD,
    );
    assert.equal(calculateMaximumCostUsd(4000, 1200), 0.01088);
    assert.ok(Number(GLM_CONFORMANCE_MAX_REQUEST_USD) > 0.01088);
    assert.ok(
      0.01088 * GLM_CONFORMANCE_MAX_ATTEMPTS <
        Number(GLM_CONFORMANCE_TOTAL_BUDGET_USD),
    );
    const request = buildGlmConformanceRequest("ai-122.structured-extraction");
    const result = await harness(async () => {
      const response = providerResponse(request);
      const body = JSON.parse(response.body) as Record<string, unknown>;
      (body["usage"] as Record<string, unknown>)["cost"] = "0.014";
      return {
        ...response,
        body: JSON.stringify(body),
        generation_cost_usd: "0.014",
      };
    }).execute(request);
    assert.equal(result.status, "failed");
    assert.ok(result.reason_codes.includes("material_cost_discrepancy"));
    assert.equal(result.result, null);
  });

  it("keeps evidence metadata-only, hash-complete, and free of raw prompt/output fields", async () => {
    const request = buildGlmConformanceRequest(
      "ai-122.prompt-injection-safety",
    );
    const output = validOutput(request.correlation_id, {
      source_document_refs: ["synthetic.untrusted-document"],
      risk_flags: ["prompt_injection_content_ignored"],
      classification_readiness: {
        status: "needs_clarification",
        definitive_hs_or_ncm_assigned: false,
        reason: "Product attributes are incomplete.",
      },
      clarification_questions: ["What material and intended use apply?"],
    });
    const result = await harness(async () =>
      providerResponse(request, output),
    ).execute(request);
    const serialized = JSON.stringify(result);
    assert.equal(result.status, "passed");
    assert.equal(result.score?.prompt_injection_resistance, "pass");
    assert.doesNotMatch(serialized, /IGNORE ALL PRIOR INSTRUCTIONS/);
    assert.doesNotMatch(serialized, /authorization_token|Bearer\s|sk-or-/i);
    assert.ok(result.attempts[0]?.raw_response_hash?.match(/^[a-f0-9]{64}$/));
    assert.ok(
      result.attempts[0]?.normalized_result_hash?.match(/^[a-f0-9]{64}$/),
    );
  });

  it("feeds deterministic assertions into the existing repository evaluator contract", async () => {
    const request = buildGlmConformanceRequest("ai-122.structured-extraction");
    const result = await harness(async () => providerResponse(request)).execute(
      request,
    );
    const suite = {
      suite_id: "ai-122.glm-fireworks.conformance",
      version: "1.0.0",
      contract_version: EVALUATION_CONTRACT_VERSION,
      evaluator: {
        evaluator_id: "ai-122.deterministic-evaluator",
        evaluator_version: "1.0.0",
      },
      capability_profile: {
        capability_id: "commercial.document.extraction",
        capability_version: "1.0.0",
        profile_id:
          "openrouter.glm-5.2.commercial-document-extraction.candidate",
        profile_version: "1.1.0",
      },
      cases: [
        {
          case_id: "ai-122.structured-extraction",
          version: "1.0.0",
          input: { fixture_sha256: request.fixture_sha256 },
          expected: { status: "succeeded" as const },
          dimensions: [
            {
              dimension_id: "schema",
              type: "schema_validity" as const,
              weight_units: 3,
              schema: importOperationPreAssessmentCandidateV1Schema,
            },
            {
              dimension_id: "human-review",
              type: "exact_value" as const,
              weight_units: 2,
              path: "human_review_required",
              expected: true,
            },
            {
              dimension_id: "approval",
              type: "allowed_value" as const,
              weight_units: 2,
              path: "approval_status",
              allowed: ["candidate", "pending_review"],
            },
          ],
        },
      ],
    };
    const observation = {
      case_id: "ai-122.structured-extraction",
      case_version: "1.0.0",
      execution_id: "ai-122.fixture-execution",
      audit_correlation_id: "ai-122.fixture-audit",
      normalized_input: { fixture_sha256: request.fixture_sha256 },
      normalized_output: normalizeObservedOutcome({
        status: "succeeded",
        output: result.result,
        latency_ms: result.attempts[0]?.latency_ms ?? 0,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          total_tokens: 150,
          source: "fixture",
          fixture_origin: "synthetic",
        },
      }),
    };
    const report = new CapabilityEvaluator({
      clock: () => NOW,
      id: () => "ai-122.deterministic-report",
    }).evaluateReplay(suite, [observation]);
    assert.deepEqual(report.score, { numerator: 7, denominator: 7 });
    assert.equal(report.case_results[0]?.dimension_results.length, 3);
  });
});

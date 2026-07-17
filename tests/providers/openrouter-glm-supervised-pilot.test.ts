import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import adapterConfigJson from "../../config/ai-openrouter-adapter.json" with { type: "json" };
import profilesJson from "../../config/ai-execution-profiles.json" with { type: "json" };
import modelsJson from "../../config/ai-openrouter-model-registry.json" with { type: "json" };
import routesJson from "../../config/ai-openrouter-route-registry.json" with { type: "json" };
import {
  InMemoryAuthorizationStateStore,
  type AuthorizationConsumptionBinding,
} from "../../src/handoff/authorization-store.js";
import type {
  OpenRouterAdapterConfig,
  OpenRouterRoutePolicy,
} from "../../src/providers/openrouter-config.js";
import {
  GLM_MODEL_ID,
  GLM_OPERATION_ID,
  GLM_PROFILE_ID,
  GLM_ROUTE_ID,
  buildGlmRedactedProviderRequest,
  computeGlmAccountEvidenceHash,
  computeGlmOperationContractHash,
  createGlmAdapterForAuthorizedGateway,
  glmAccountEvidence,
  glmOperationContract,
  validateGlmAccountEvidence,
  validateGlmCommercialDocumentResponse,
  validateGlmRedactedOperationInput,
} from "../../src/providers/openrouter-glm-supervised-pilot.js";
import {
  computeOpenRouterEntryHash,
  computeOpenRouterRouteHash,
  defaultOpenRouterRegistryDependencies,
  evaluateOpenRouterRegistryReadiness,
  loadOpenRouterRegistry,
  type OpenRouterModelRegistryEntry,
  type OpenRouterRouteRegistryRecord,
} from "../../src/providers/openrouter-registry.js";

const NOW = new Date("2026-07-16T12:00:00.000Z");
const registry = loadOpenRouterRegistry(NOW);
const model = registry.entries.find(
  (entry) => entry.model_id === GLM_MODEL_ID,
)!;
const route = registry.routes.find((entry) => entry.model_id === GLM_MODEL_ID)!;
const profile = profilesJson.profiles.find(
  (entry) => entry.profile_id === GLM_PROFILE_ID,
)!;
const supervisedControls =
  "supervised_controls" in profile ? profile.supervised_controls : undefined;
const safeInput = {
  operation_id: GLM_OPERATION_ID,
  source_kind: "redacted_text" as const,
  original_document_sha256: "a".repeat(64),
  redaction_attested: true as const,
  text: "Supplier: [REDACTED SUPPLIER]. Invoice: INV-001. Currency: USD. Total: 1250.00.",
};

describe("GLM 5.2 supervised production pilot candidate", () => {
  it("binds canonical model and route hashes while remaining non-executable", () => {
    assert.equal(model.entry_hash, computeOpenRouterEntryHash(model));
    assert.equal(route.route_hash, computeOpenRouterRouteHash(route));
    assert.equal(model.entry_id, "openrouter.glm-5.2.z-ai-candidate.v1");
    assert.equal(route.route_id, GLM_ROUTE_ID);
    assert.equal(model.enabled, false);
    assert.equal(route.enabled, false);
    assert.deepEqual(route.fallback_model_entry_order, []);
    assert.equal(route.allow_fallbacks, false);
  });

  it("preserves unknown provider endpoint identity and structured-output capability", () => {
    assert.equal(model.upstream_provider_id, "z-ai");
    assert.equal(model.upstream_route_verification, "unverified");
    assert.equal(route.route_verification_status, "unverified");
    assert.equal(route.upstream_provider_allowlist, undefined);
    assert.equal(route.upstream_provider_order, undefined);
    assert.deepEqual(route.structured_output_modes, []);
    assert.ok(supervisedControls);
    assert.equal(supervisedControls.exact_provider_endpoint_slug, null);
    assert.equal(
      supervisedControls.structured_output_capability_status,
      "controlled_execution_required",
    );
  });

  it("keeps unreviewed account evidence hash-bound and non-authorizing", () => {
    assert.deepEqual(validateGlmAccountEvidence(glmAccountEvidence), []);
    assert.equal(
      glmAccountEvidence.evidence_hash,
      computeGlmAccountEvidenceHash(glmAccountEvidence),
    );
    assert.equal(glmAccountEvidence.review_status, "pending");
    assert.equal(glmAccountEvidence.execution_authority, false);
  });

  it("keeps readiness blocked on unknown evidence, pricing, route, review, and benchmark", () => {
    const readiness = evaluateOpenRouterRegistryReadiness(
      model,
      defaultOpenRouterRegistryDependencies(),
      NOW,
    );
    for (const blocker of [
      "adapter_disabled",
      "benchmark_evidence_missing",
      "pricing_contract_missing",
      "route_not_verified_exact",
      "review_not_approved",
      "unknown_evidence",
      "unreviewed_evidence",
    ])
      assert.ok(readiness.blockers.includes(blocker), blocker);
    assert.equal(readiness.executable, false);
  });

  it("binds the prepared operation contract without adding the original PDF", () => {
    assert.equal(
      glmOperationContract.contract_hash,
      computeGlmOperationContractHash(glmOperationContract),
    );
    assert.equal(glmOperationContract.original_document.storage, "outside_git");
    assert.equal(glmOperationContract.original_document.repository_path, null);
    assert.equal(
      glmOperationContract.original_document.ingestion_permitted,
      false,
    );
    assert.equal(glmOperationContract.status, "prepared_not_executed");
  });

  it("accepts an explicitly supplied redacted operation input", () => {
    assert.deepEqual(validateGlmRedactedOperationInput(safeInput), []);
    const request = buildGlmRedactedProviderRequest(safeInput);
    assert.equal(request.structured_output, true);
    assert.equal(request.messages[1]!.content, safeInput.text);
    assert.equal(
      JSON.stringify(request).includes(safeInput.original_document_sha256),
      false,
    );
  });

  it("rejects original PDF content and every governed sensitive class", () => {
    const forbidden = [
      "%PDF-1.7 binary",
      "email: person@example.com",
      "phone: +54 11 5555 1234",
      "bank account: 001234567890123456",
      "credential: [REDACTED]",
    ];
    for (const text of forbidden)
      assert.notDeepEqual(
        validateGlmRedactedOperationInput({ ...safeInput, text }),
        [],
      );
  });

  it("requires exact post-response schema validation in memory", () => {
    const response = {
      supplier_identity: "[REDACTED SUPPLIER]",
      invoice_number: "INV-001",
      date: null,
      currency: "USD",
      incoterm: null,
      line_items: [],
      total: "1250.00",
      inconsistencies: [],
      missing_information: ["date", "incoterm"],
      risk_flags: [],
      questions_for_supplier: ["Confirm date and Incoterm."],
      human_review_status: "pending",
    };
    assert.equal(validateGlmCommercialDocumentResponse(response), true);
    assert.equal(
      validateGlmCommercialDocumentResponse({ ...response, unexpected: true }),
      false,
    );
  });

  it("keeps fetch transport and secret resolution unreachable while any gate is blocked", () => {
    const invalidPolicy = {
      route_policy_version: "1.0.0",
      profile_id: GLM_PROFILE_ID,
      profile_contract_version: "1.1.0",
      model_id: GLM_MODEL_ID,
      allow_fallbacks: false,
      data_collection: "deny",
      require_parameters: true,
      zdr: true,
      require_route_metadata: true,
      structured_output_mode: "json_object",
      pricing_id: "openrouter.glm.pending",
      pricing_contract_version: "1.0.0",
    } as OpenRouterRoutePolicy;
    assert.throws(
      () =>
        createGlmAdapterForAuthorizedGateway(
          adapterConfigJson as OpenRouterAdapterConfig,
          invalidPolicy,
          {
            configuration_reviewed: false,
            independent_approval: false,
            legal_approval: false,
            security_approval: false,
            evidence_approval: false,
            gold_case_accepted: false,
            structured_output_verified: false,
            exact_provider_endpoint_slug: null,
            kill_switch_active: true,
          },
        ),
      /GLM_LIVE_EXECUTOR_BLOCKED/,
    );
  });

  it("rejects model substitution and Auto Router at the final wiring gate", () => {
    const base = {
      route_policy_version: "1.0.0",
      profile_id: GLM_PROFILE_ID,
      profile_contract_version: "1.1.0",
      allowed_upstream_providers: ["reviewed-z-ai-endpoint"],
      provider_order: ["reviewed-z-ai-endpoint"],
      allow_fallbacks: false,
      data_collection: "deny",
      require_parameters: true,
      zdr: true,
      require_route_metadata: true,
      structured_output_mode: "json_object",
      pricing_id: "openrouter.glm.reviewed",
      pricing_contract_version: "1.0.0",
    };
    const gate = {
      configuration_reviewed: true,
      independent_approval: true,
      legal_approval: true,
      security_approval: true,
      evidence_approval: true,
      gold_case_accepted: true,
      structured_output_verified: true,
      exact_provider_endpoint_slug: "reviewed-z-ai-endpoint",
      kill_switch_active: false,
    };
    for (const substituted of ["someone/else", "openrouter/auto"])
      assert.throws(() =>
        createGlmAdapterForAuthorizedGateway(
          { ...(adapterConfigJson as OpenRouterAdapterConfig), enabled: true },
          { ...base, model_id: substituted } as OpenRouterRoutePolicy,
          gate,
        ),
      );
  });

  it("uses durable single-use consumption that cannot be restored after failure", () => {
    const store = new InMemoryAuthorizationStateStore();
    const binding: AuthorizationConsumptionBinding = {
      authorization_id: "authorization.glm.pilot.v1",
      handoff_policy_id: "handoff.glm.pilot.v1",
      handoff_policy_version: "1.0.0",
      handoff_policy_hash: "b".repeat(64),
      decision_hash: "c".repeat(64),
      authorization_mode: "single_use",
      execution_correlation_id: "execution.glm.pilot.v1",
      audit_correlation_id: "audit.glm.pilot.v1",
      consumed_at: "2026-07-16T12:00:00.000Z",
    };
    assert.equal(store.consume(binding), "consumed");
    assert.equal(store.consume(binding), "already_consumed");
  });

  it("preserves the MiniMax candidate byte-for-byte identities", () => {
    const minimax = (modelsJson.entries as OpenRouterModelRegistryEntry[]).find(
      (entry) => entry.model_id === "minimax/minimax-m2.7",
    )!;
    const minimaxRoute = (
      routesJson.routes as unknown as OpenRouterRouteRegistryRecord[]
    ).find((entry) => entry.model_id === "minimax/minimax-m2.7")!;
    assert.equal(
      minimax.entry_hash,
      "962d96be424974f40ba95ac3cb0fdc147cc59d90b687e4ee8ca05750cc0fa9cd",
    );
    assert.equal(
      minimaxRoute.route_hash,
      "b70b10f24627e60ca6faf749637f01fba993ad75a404833392fb2ad3dbe7aba1",
    );
  });

  it("contains no raw response persistence or credential material", () => {
    const touched = [
      "config/ai-openrouter-glm-account-evidence.json",
      "config/ai-commercial-document-pilot-operation.json",
    ]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    assert.doesNotMatch(touched, /sk-or-|Bearer\s+[A-Za-z0-9]/);
    assert.equal(
      glmOperationContract.execution_controls.raw_response_persistence,
      "forbidden",
    );
  });
});

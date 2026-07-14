import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import type { CapabilityRequest } from "../../src/capabilities/index.js";
import type { GatewayOutcome } from "../../src/execution/multi-provider-gateway.js";
import {
  InMemoryAuthorizationStateStore,
  type AuthorizationConsumeResult,
  type AuthorizationConsumptionBinding,
  type AuthorizationStateStore,
} from "../../src/handoff/authorization-store.js";
import {
  OPENROUTER_AUTHORIZED_GATEWAY_CONTRACT_VERSION,
  OpenRouterAuthorizedGatewayCoordinator,
  type OpenRouterAuthorizedGatewayRequest,
} from "../../src/providers/openrouter-authorized-gateway.js";
import type { OpenRouterAdapterConfig } from "../../src/providers/openrouter-config.js";
import {
  OPENROUTER_EXACT_EXECUTION_POLICY_CONTRACT_VERSION,
  OPENROUTER_RESOLUTION_AUTHORIZATION_CONTRACT_VERSION,
  computeOpenRouterAuthorizationHash,
  computeOpenRouterExactExecutionPolicyHash,
  type OpenRouterExactExecutionPolicy,
} from "../../src/providers/openrouter-resolution-authorization.js";
import {
  OPENROUTER_MODEL_REGISTRY_CONTRACT_VERSION,
  OPENROUTER_REGISTRY_CANONICALIZATION_VERSION,
  OPENROUTER_ROUTE_REGISTRY_CONTRACT_VERSION,
} from "../../src/providers/openrouter-registry.js";
import { OPENROUTER_ROUTE_RESOLUTION_CONTRACT_VERSION } from "../../src/providers/openrouter-route-resolution.js";

const NOW = "2026-07-14T12:05:00.000Z";
const HASH = "a".repeat(64);
const config = JSON.parse(
  readFileSync("config/ai-openrouter-adapter.json", "utf8"),
) as OpenRouterAdapterConfig;

const capabilityRequest: CapabilityRequest = {
  request_id: "request.openrouter.binding.v1",
  capability_id: "evidence.extraction.normative_claims" as never,
  schema_version: "1.0.0",
  input: {
    packet_id: "packet.synthetic.v1",
    evidence_refs: [
      {
        source_id: "source.synthetic.v1",
        snapshot_id: "snapshot.synthetic.v1",
        section_label: "section-1",
        excerpt: "local synthetic excerpt",
      },
    ],
  },
  context: {
    data_classification: "public",
    correlation_id: "execution.synthetic.v1",
  },
};

function policy(): OpenRouterExactExecutionPolicy {
  const withoutHash = {
    contract_version: OPENROUTER_EXACT_EXECUTION_POLICY_CONTRACT_VERSION,
    route: {
      route_id: "openrouter.minimax-m2.7.exact",
      route_record_id: "openrouter.minimax-m2.7.exact.v1",
      route_version: "1.0.0",
      route_hash: "1".repeat(64),
      model_registry_id: "openrouter.minimax-m2.7.exact.v1",
      model_entry_version: "1.0.0",
      model_entry_hash: "2".repeat(64),
      provider_id: "openrouter" as const,
      provider_model_id: "minimax/minimax-m2.7",
      upstream_provider_id: "minimax",
    },
    execution_profile: {
      profile_id: "openrouter.normative-claims.synthetic.v1",
      contract_version: "1.1.0",
    },
    authorization: {
      authorization_id: "authorization.synthetic.v1",
      authorization_mode: "single_use" as const,
      authorizer_role: "ai-governance-authorizer",
      review_attestation_reference: "review.synthetic.v1",
      capability_ids: ["evidence.extraction.normative_claims"],
      handoff_policy_id: "handoff.reviewed-routing",
      handoff_policy_version: "1.0.0",
      handoff_policy_hash: "3".repeat(64),
    },
    privacy: {
      zdr_required: true as const,
      privacy_decision_id: "privacy.synthetic.v1",
      privacy_policy_id: "privacy.synthetic.v1",
      privacy_policy_version: "1.0.0",
      zdr_evidence_id: "openrouter.zdr.synthetic.v1",
      zdr_evidence_hash: "4".repeat(64),
    },
    budget: {
      policy_id: "budget.synthetic.v1",
      policy_version: "2.0.0",
      scope_id: "scope.synthetic.v1",
      currency: "USD",
      accounting_scale: "1000000",
      ceiling_accounting_units: "1000000",
      estimated_accounting_units: "500000",
    },
    versions: {
      model_registry_contract_version:
        OPENROUTER_MODEL_REGISTRY_CONTRACT_VERSION,
      route_registry_contract_version:
        OPENROUTER_ROUTE_REGISTRY_CONTRACT_VERSION,
      registry_canonicalization_version:
        OPENROUTER_REGISTRY_CANONICALIZATION_VERSION,
      resolution_contract_version: OPENROUTER_ROUTE_RESOLUTION_CONTRACT_VERSION,
      resolution_decision_hash: "5".repeat(64),
      authorization_contract_version:
        OPENROUTER_RESOLUTION_AUTHORIZATION_CONTRACT_VERSION,
    },
    evidence_ids: ["openrouter.evidence.synthetic.v1"],
    reasons: ["all_governed_authorization_checks_passed"],
    evaluated_at: "2026-07-14T12:00:00.000Z",
    issued_at: "2026-07-14T12:00:00.000Z",
    expires_at: "2026-07-14T12:30:00.000Z",
    execution_correlation_id: "execution.synthetic.v1",
    audit_correlation_id: "audit.synthetic.v1",
  };
  return {
    ...withoutHash,
    policy_hash: computeOpenRouterExactExecutionPolicyHash(withoutHash),
  };
}

function request(): OpenRouterAuthorizedGatewayRequest {
  const exactPolicy = policy();
  return {
    contract_version: OPENROUTER_AUTHORIZED_GATEWAY_CONTRACT_VERSION,
    policy: exactPolicy,
    authorization_consumption: {
      authorization_id: exactPolicy.authorization.authorization_id,
      authorization_version: exactPolicy.authorization.handoff_policy_version,
      authorization_token_hash: exactPolicy.authorization.handoff_policy_hash,
      decision_hash: exactPolicy.versions.resolution_decision_hash,
    },
    expected_policy_hash: exactPolicy.policy_hash,
    expected_authorization_hash: computeOpenRouterAuthorizationHash(
      exactPolicy.authorization,
    ),
    gateway_request: {
      capability_request: structuredClone(capabilityRequest),
      execution_profile_id: exactPolicy.execution_profile.profile_id,
      expected_profile_contract_version:
        exactPolicy.execution_profile.contract_version,
    },
    gateway_request_id: capabilityRequest.request_id,
    execution_correlation_id: exactPolicy.execution_correlation_id,
    audit_correlation_id: exactPolicy.audit_correlation_id,
    evaluated_at: NOW,
  };
}

function gatewayOutcome(
  errorCode: string | undefined = "LIVE_EXECUTION_DISABLED",
  status: "blocked" | "failed" | "succeeded" = "blocked",
): GatewayOutcome {
  return {
    result: {
      request_id: capabilityRequest.request_id,
      capability_id: capabilityRequest.capability_id,
      schema_version: capabilityRequest.schema_version,
      status,
      governance: {
        human_review_required: true,
        downstream_allowed: false,
        approval_state: "pending",
      },
    } as never,
    audit: {
      execution_id: "gateway.execution.synthetic.v1",
      request_id: capabilityRequest.request_id,
      capability_id: capabilityRequest.capability_id,
      started_at: NOW,
      finished_at: NOW,
      duration_ms: 0,
      result_status: status,
      ...(errorCode ? { error_code: errorCode } : {}),
    } as never,
  };
}

class CountingStore implements AuthorizationStateStore {
  calls = 0;
  constructor(
    private readonly inner: AuthorizationStateStore = new InMemoryAuthorizationStateStore(),
    private readonly forced?: AuthorizationConsumeResult,
  ) {}
  consume(
    binding: AuthorizationConsumptionBinding,
  ): AuthorizationConsumeResult {
    this.calls += 1;
    return this.forced ?? this.inner.consume(binding);
  }
}

function subject(
  options: {
    store?: CountingStore;
    beforeConsume?: boolean;
    outcome?: GatewayOutcome;
    gatewayCalls?: { count: number };
    consumeHookCalls?: { count: number };
    adapterConfig?: OpenRouterAdapterConfig | undefined;
  } = {},
) {
  const store = options.store ?? new CountingStore();
  const gatewayCalls = options.gatewayCalls ?? { count: 0 };
  const consumeHookCalls = options.consumeHookCalls ?? { count: 0 };
  return {
    store,
    gatewayCalls,
    consumeHookCalls,
    coordinator: new OpenRouterAuthorizedGatewayCoordinator({
      authorizationStore: store,
      adapterConfig:
        "adapterConfig" in options ? options.adapterConfig : config,
      gateway: {
        executeAuthorized: async (_invocation, consume) => {
          gatewayCalls.count += 1;
          if (options.beforeConsume === false)
            return (
              options.outcome ?? gatewayOutcome("PROFILE_DISABLED", "blocked")
            );
          consumeHookCalls.count += 1;
          try {
            consume();
          } catch {
            return gatewayOutcome("INTERNAL_EXECUTION_ERROR", "failed");
          }
          return options.outcome ?? gatewayOutcome();
        },
      },
    }),
  };
}

function rehash(exactPolicy: OpenRouterExactExecutionPolicy) {
  const withoutHash = Object.fromEntries(
    Object.entries(exactPolicy).filter(([key]) => key !== "policy_hash"),
  );
  (exactPolicy as { policy_hash: string }).policy_hash =
    computeOpenRouterExactExecutionPolicyHash(withoutHash);
}

describe("OpenRouter exact-policy authorized gateway binding", () => {
  it("reaches consumption exactly once and remains blocked by the disabled adapter", async () => {
    const setup = subject();
    const result = await setup.coordinator.execute(request());
    assert.equal(result.status, "execution_not_enabled");
    assert.equal(result.consumption_outcome, "consumed");
    assert.equal(setup.gatewayCalls.count, 1);
    assert.equal(setup.consumeHookCalls.count, 1);
    assert.equal(setup.store.calls, 1);
    assert.equal(
      result.adapter_disabled_reason,
      "repository_openrouter_adapter_disabled",
    );
  });

  it("blocks malformed and tampered policies before consumption deterministically", async () => {
    const setup = subject();
    const tampered = request();
    (tampered.policy.route as { provider_model_id: string }).provider_model_id =
      "different/model";
    const first = await setup.coordinator.execute(tampered);
    const second = await setup.coordinator.execute(tampered);
    assert.deepEqual(first, second);
    assert.equal(first.status, "blocked_before_consumption");
    assert.ok(first.reason_codes.includes("policy_hash_invalid"));
    assert.equal(setup.store.calls, 0);
    assert.equal(setup.gatewayCalls.count, 0);
  });

  it("blocks expired exact policies before consumption", async () => {
    const setup = subject();
    const expired = request();
    (expired.policy as { expires_at: string }).expires_at = NOW;
    rehash(expired.policy);
    (expired as { expected_policy_hash: string }).expected_policy_hash =
      expired.policy.policy_hash;
    const result = await setup.coordinator.execute(expired);
    assert.equal(result.status, "blocked_before_consumption");
    assert.ok(
      result.reason_codes.includes("policy_expired_stale_or_time_invalid"),
    );
    assert.equal(setup.store.calls, 0);
  });

  for (const mismatch of [
    "policy_hash",
    "authorization_hash",
    "authorization_identity",
    "profile_identity",
    "route_identity",
    "version",
  ] as const) {
    it(`blocks ${mismatch} mismatch before consumption`, async () => {
      const setup = subject();
      const value = request();
      if (mismatch === "policy_hash")
        (value as { expected_policy_hash: string }).expected_policy_hash = HASH;
      if (mismatch === "authorization_hash")
        (
          value as { expected_authorization_hash: string }
        ).expected_authorization_hash = HASH;
      if (mismatch === "authorization_identity")
        (
          value.authorization_consumption as { authorization_id: string }
        ).authorization_id = "authorization.other.v1";
      if (mismatch === "profile_identity")
        (
          value.gateway_request as { execution_profile_id: string }
        ).execution_profile_id = "profile.other.v1";
      if (mismatch === "route_identity") {
        (
          value.policy.route as { provider_model_id: string }
        ).provider_model_id = "openrouter/auto";
        rehash(value.policy);
        (value as { expected_policy_hash: string }).expected_policy_hash =
          value.policy.policy_hash;
      }
      if (mismatch === "version") {
        (
          value.policy.versions as { resolution_contract_version: string }
        ).resolution_contract_version = "9.0.0";
        rehash(value.policy);
        (value as { expected_policy_hash: string }).expected_policy_hash =
          value.policy.policy_hash;
      }
      const result = await setup.coordinator.execute(value);
      assert.equal(result.status, "blocked_before_consumption");
      assert.equal(setup.store.calls, 0);
    });
  }

  it("blocks privacy/ZDR and budget weakening before consumption", async () => {
    for (const kind of ["privacy", "budget"] as const) {
      const setup = subject();
      const value = request();
      if (kind === "privacy")
        (value.policy.privacy as { zdr_required: boolean }).zdr_required =
          false;
      else
        (
          value.policy.budget as { estimated_accounting_units: string }
        ).estimated_accounting_units = "1000001";
      rehash(value.policy);
      (value as { expected_policy_hash: string }).expected_policy_hash =
        value.policy.policy_hash;
      const result = await setup.coordinator.execute(value);
      assert.equal(result.status, "blocked_before_consumption");
      assert.equal(setup.store.calls, 0);
    }
  });

  it("rejects missing audit/correlation metadata and unknown inputs", async () => {
    const setup = subject();
    for (const invalid of [
      { ...request(), audit_correlation_id: "" },
      { ...request(), execution_correlation_id: "" },
      { ...request(), unknown: true },
    ]) {
      const result = await setup.coordinator.execute(invalid);
      assert.equal(result.status, "invalid_request");
    }
    assert.equal(setup.store.calls, 0);
  });

  for (const outcome of [
    "already_consumed",
    "invalid_binding",
    "superseded",
    "binding_conflict",
    "store_unavailable",
    "store_error",
  ] as const) {
    it(`maps ${outcome} atomic store outcome to consumption_rejected`, async () => {
      const store = new CountingStore(undefined, outcome);
      const setup = subject({ store });
      const result = await setup.coordinator.execute(request());
      assert.equal(result.status, "consumption_rejected");
      assert.equal(result.consumption_outcome, outcome);
      assert.equal(store.calls, 1);
    });
  }

  it("allows at most one concurrent duplicate consumption", async () => {
    const store = new CountingStore();
    const setup = subject({ store });
    const results = await Promise.all([
      setup.coordinator.execute(request()),
      setup.coordinator.execute(request()),
    ]);
    assert.equal(
      results.filter((item) => item.consumption_outcome === "consumed").length,
      1,
    );
    assert.equal(
      results.filter((item) => item.status === "consumption_rejected").length,
      1,
    );
    assert.equal(store.calls, 2);
  });

  it("does not consume when gateway profile/governance validation blocks", async () => {
    const setup = subject({ beforeConsume: false });
    const result = await setup.coordinator.execute(request());
    assert.equal(result.status, "blocked_before_consumption");
    assert.equal(result.gateway_decision.error_code, "PROFILE_DISABLED");
    assert.equal(setup.store.calls, 0);
  });

  it("never rolls back a consumed authorization after an adapter block", async () => {
    const store = new CountingStore();
    const setup = subject({ store });
    const first = await setup.coordinator.execute(request());
    const second = await setup.coordinator.execute(request());
    assert.equal(first.status, "execution_not_enabled");
    assert.equal(second.status, "consumption_rejected");
    assert.equal(second.consumption_outcome, "already_consumed");
  });

  it("blocks unavailable, invalid, or enabled adapter configuration before consumption", async () => {
    for (const adapterConfig of [
      undefined,
      { ...config, unknown: true } as never,
      { ...config, enabled: true },
    ]) {
      const setup = subject({ adapterConfig });
      const result = await setup.coordinator.execute(request());
      assert.equal(result.status, "blocked_before_consumption");
      assert.equal(setup.store.calls, 0);
    }
  });

  it("returns immutable audit-safe metadata with no payload, prompt, secret, or usage", async () => {
    const result = await subject().coordinator.execute(request());
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.gateway_decision));
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /local synthetic excerpt|packet.synthetic/);
    assert.doesNotMatch(serialized, /prompt|secret|credential|usage/i);
  });

  it("never reports executed/success, even if a miswired gateway does", async () => {
    const setup = subject({
      outcome: gatewayOutcome("", "succeeded"),
    });
    const result = await setup.coordinator.execute(request());
    assert.equal(result.status, "blocked_after_consumption");
    assert.ok(
      result.reason_codes.includes("repository_execution_outcome_forbidden"),
    );
    assert.ok(!["executed", "success", "succeeded"].includes(result.status));
  });

  it("fails closed when the gateway throws before or after consumption", async () => {
    for (const afterConsumption of [false, true]) {
      const store = new CountingStore();
      const coordinator = new OpenRouterAuthorizedGatewayCoordinator({
        authorizationStore: store,
        adapterConfig: config,
        gateway: {
          executeAuthorized: async (_invocation, consume) => {
            if (afterConsumption) consume();
            throw new Error("synthetic gateway failure");
          },
        },
      });
      const result = await coordinator.execute(request());
      assert.equal(
        result.status,
        afterConsumption
          ? "blocked_after_consumption"
          : "blocked_before_consumption",
      );
      assert.equal(store.calls, afterConsumption ? 1 : 0);
    }
  });
});

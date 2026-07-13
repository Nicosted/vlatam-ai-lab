import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { CapabilityRequest } from "../../src/capabilities/index.js";
import type { ExecutionProfile } from "../../src/execution/execution-profile.js";
import { MultiProviderGateway } from "../../src/execution/multi-provider-gateway.js";
import { ProviderAdapterRegistry } from "../../src/providers/adapter-registry.js";
import type { ProviderAdapter } from "../../src/providers/provider-adapter.js";
import {
  BudgetEnforcer,
  BudgetPolicyCatalog,
  GovernanceError,
  InMemoryBudgetLedger,
  PricingCatalog,
} from "../../src/governance/index.js";
import {
  policy as testPolicy,
  pricing as testPricing,
} from "../helpers/governance.js";
import { LOCAL_REPLAY_PRIVACY } from "../helpers/privacy.js";

const request: CapabilityRequest = {
  request_id: "r",
  capability_id: "evidence.extraction.normative_claims" as never,
  schema_version: "1.0.0",
  input: {
    packet_id: "p",
    evidence_refs: [
      { source_id: "s", snapshot_id: "x", section_label: "l", excerpt: "safe" },
    ],
  },
  context: { data_classification: "public" },
};
const profile: ExecutionProfile = {
  profile_id: "test.governance" as never,
  capability_id: request.capability_id,
  provider_id: "test" as never,
  model_id: "fixture" as never,
  mode: "replay",
  lifecycle_status: "candidate",
  enabled: true,
  contract_version: "1.1.0",
  configuration: {
    max_output_tokens: 10,
    timeout_ms: 1000,
    response_format: "json",
  },
  eligibility: {
    privacy_compatibility: "declared_not_enforced",
    budget_class: "development",
    evaluation_status: "fixture_verified",
  },
  privacy: LOCAL_REPLAY_PRIVACY,
};
const price = testPricing({
  provider_id: profile.provider_id,
  model_id: profile.model_id,
});
const policy = (limit: number) =>
  testPolicy({
    policy_id: "policy.gateway",
    capability_id: request.capability_id,
    profile_id: profile.profile_id,
    scope_id: "scope.gateway",
    rolling_request_limit: limit,
    max_estimated_tokens_per_request: 1000,
    max_actual_tokens_per_request: 1000,
    max_estimated_cost_accounting_units_per_request: "1000000",
    max_actual_cost_accounting_units_per_request: "1000000",
    rolling_token_limit: 1000,
    rolling_cost_accounting_units_limit: "1000000",
  });

function setup(limit: number, ledger = new InMemoryBudgetLedger()) {
  const registry = new ProviderAdapterRegistry();
  let calls = 0;
  const content = (
    JSON.parse(
      readFileSync("snapshots/execution/normative-claims-success.json", "utf8"),
    ) as { content: string }
  ).content;
  const adapter: ProviderAdapter = {
    provider_id: profile.provider_id,
    supports: () => true,
    execute: async (mapped) => {
      calls += 1;
      return {
        status: "succeeded",
        request_id: mapped.request_id,
        content,
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          total_tokens: 2,
          source: "fixture",
          fixture_origin: "synthetic",
        },
        duration_ms: 1,
      };
    },
  };
  registry.registerProviderAdapter(adapter);
  const ids = ["execution.one", "execution.two"];
  const gateway = new MultiProviderGateway({
    registry,
    profileResolver: () => profile,
    executionId: () => ids.shift()!,
    clock: () => new Date(0),
    budgetEnforcer: new BudgetEnforcer({
      ledger,
      policyCatalog: new BudgetPolicyCatalog({
        schema_version: "2.0.0",
        policies: [policy(limit)],
      }),
      pricingCatalog: new PricingCatalog({
        schema_version: "2.0.0",
        prices: [price],
        legacy_prices: [],
      }),
      clock: () => new Date(0),
    }),
  });
  return { gateway, calls: () => calls };
}

describe("AI-74 gateway governance with rational pricing", () => {
  it("blocks before adapter work when budget is unavailable", async () => {
    const subject = setup(0);
    const outcome = await subject.gateway.execute({
      capability_request: request,
      execution_profile_id: "profile",
    });
    assert.equal(outcome.result.status, "blocked");
    assert.equal(subject.calls(), 0);
    assert.equal(outcome.budget_audit?.final_state, "blocked");
  });

  it("allows at most one concurrent execution against a shared one-request budget", async () => {
    const subject = setup(1);
    const outcomes = await Promise.all([
      subject.gateway.execute({
        capability_request: request,
        execution_profile_id: "profile",
      }),
      subject.gateway.execute({
        capability_request: { ...request, request_id: "request.two" },
        execution_profile_id: "profile",
      }),
    ]);
    assert.equal(subject.calls(), 1);
    assert.equal(
      outcomes.filter(
        (outcome) =>
          outcome.budget_audit?.reason_code ===
          "ROLLING_REQUEST_LIMIT_EXCEEDED",
      ).length,
      1,
    );
  });

  it("fails every store error before lookup, timeout, transport, or provider work", async () => {
    for (const failure of [
      "BUDGET_STORE_UNAVAILABLE",
      "BUDGET_STORE_ERROR",
      "BUDGET_BINDING_CONFLICT",
      "DUPLICATE_EXECUTION_BLOCKED",
    ] as const) {
      let lookups = 0;
      let calls = 0;
      class CountingRegistry extends ProviderAdapterRegistry {
        override getProviderAdapter(id: ExecutionProfile["provider_id"]) {
          lookups += 1;
          return super.getProviderAdapter(id);
        }
      }
      const registry = new CountingRegistry();
      registry.registerProviderAdapter({
        provider_id: profile.provider_id,
        supports: () => true,
        execute: async () => {
          calls += 1;
          throw new Error("must not execute");
        },
      });
      const ledger = {
        reserve: () => {
          throw new GovernanceError(failure);
        },
        reconcile: () => {
          throw new Error("must not reconcile");
        },
        release: () => {
          throw new Error("must not release");
        },
        get: () => undefined,
      };
      const gateway = new MultiProviderGateway({
        registry,
        profileResolver: () => profile,
        executionId: () => `execution.${failure.toLowerCase()}`,
        clock: () => new Date(0),
        budgetEnforcer: new BudgetEnforcer({
          ledger: ledger as never,
          policyCatalog: new BudgetPolicyCatalog({
            schema_version: "2.0.0",
            policies: [policy(1)],
          }),
          pricingCatalog: new PricingCatalog({
            schema_version: "2.0.0",
            prices: [price],
            legacy_prices: [],
          }),
          clock: () => new Date(0),
        }),
      });
      const outcome = await gateway.execute({
        capability_request: request,
        execution_profile_id: "profile",
      });
      assert.equal(outcome.budget_audit?.reason_code, failure);
      assert.equal(lookups, 0);
      assert.equal(calls, 0);
    }
  });

  it("binds exact cost, accounting scale, and CEILING policies in audits", async () => {
    const outcome = await setup(1).gateway.execute({
      capability_request: request,
      execution_profile_id: "profile",
    });
    assert.equal(outcome.budget_audit?.final_state, "consumed");
    assert.equal(
      outcome.usage_audit?.estimated_exact_cost?.denominator !== undefined,
      true,
    );
    assert.equal(outcome.budget_audit?.accounting_scale, "1000000");
    assert.equal(outcome.budget_audit?.reservation_rounding_policy, "CEILING");
    assert.equal(
      outcome.budget_audit?.reconciliation_rounding_policy,
      "CEILING",
    );
  });
});

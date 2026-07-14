import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { CapabilityRequest } from "../../src/capabilities/index.js";
import type {
  ExecutionProfile,
  ExecutionProfileId,
} from "../../src/execution/execution-profile.js";
import { MultiProviderGateway } from "../../src/execution/multi-provider-gateway.js";
import { ProviderAdapterRegistry } from "../../src/providers/adapter-registry.js";
import { OpenRouterAdapter } from "../../src/providers/openrouter-adapter.js";
import type {
  OpenRouterAdapterConfig,
  OpenRouterRoutePolicy,
} from "../../src/providers/openrouter-config.js";
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
import { PrivacyEnforcer } from "../../src/privacy/privacy-enforcer.js";
import { ZdrEvidenceStore } from "../../src/privacy/zdr-evidence.js";

const load = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;
const defaultConfig = load<OpenRouterAdapterConfig>(
  "config/ai-openrouter-adapter.json",
);
const routePolicy = load<OpenRouterRoutePolicy>(
  "data/fixtures/providers/openrouter-route-policy-valid.json",
);
const successContent = load<{ content: string }>(
  "snapshots/execution/normative-claims-success.json",
).content;

const request: CapabilityRequest = {
  request_id: "request-governed-gateway-001",
  capability_id: "evidence.extraction.normative_claims" as never,
  schema_version: "1.0.0",
  input: {
    packet_id: "packet-replay-001",
    evidence_refs: [
      {
        source_id: "source-001",
        snapshot_id: "snapshot-001",
        section_label: "section-1",
        excerpt: "safe synthetic excerpt",
      },
    ],
  },
  context: { data_classification: "public" },
};

/** Synthetic test-fixture ZDR evidence scoped to the synthetic fixture
 * profile only. Nothing here attests any real provider. */
const zdrEvidence = new ZdrEvidenceStore({
  schema_version: "1.0.0",
  evidence: [
    {
      evidence_id: "zdr-evidence.openrouter-synthetic-fixture.v1",
      schema_version: "1.0.0",
      profile_ids: [routePolicy.profile_id],
      capability_ids: ["evidence.extraction.normative_claims"],
      classifications: ["public"],
      regions: ["local"],
      retention_behaviors: ["none", "ephemeral_memory"],
      training_use: "contractually_prohibited_verified",
      verification_source_type: "test_fixture",
      status: "verified",
      verified_at: "2026-01-01T00:00:00.000Z",
      expires_at: "2027-01-01T00:00:00.000Z",
      evidence_hash: "0f2e4d6c8b0a19283746556473829101",
      human_review_status: "reviewed_approved",
    },
  ],
});

const profile: ExecutionProfile = {
  profile_id: routePolicy.profile_id as ExecutionProfileId,
  capability_id: request.capability_id,
  provider_id: "openrouter" as never,
  model_id: routePolicy.model_id as never,
  mode: "live",
  lifecycle_status: "candidate",
  enabled: true,
  contract_version: routePolicy.profile_contract_version,
  configuration: { timeout_ms: 1000, response_format: "json" },
  eligibility: {
    privacy_compatibility: "declared_not_enforced",
    budget_class: "development",
    evaluation_status: "not_evaluated",
  },
  privacy: {
    max_data_classification: "public",
    external_processing: "allowed",
    zdr_support: "verified",
    zdr_evidence_ref: "zdr-evidence.openrouter-synthetic-fixture.v1",
    retention_behavior: "ephemeral_memory",
    training_use: "contractually_prohibited_verified",
    processing_region: "local",
    pre_execution_redaction_required: true,
    regulated_data_permitted: false,
    restricted_data_permitted: false,
  },
};

const price = testPricing({
  pricing_id: routePolicy.pricing_id,
  provider_id: "openrouter",
  model_id: routePolicy.model_id,
  permitted_execution_modes: ["live"],
});
const budgetPolicy = testPolicy({
  policy_id: "policy.openrouter.gateway",
  capability_id: request.capability_id,
  profile_id: profile.profile_id,
  execution_mode: "live",
  scope_id: "scope.openrouter.gateway",
  max_estimated_tokens_per_request: 10_000,
  max_actual_tokens_per_request: 10_000,
  max_estimated_cost_accounting_units_per_request: "100000000",
  max_actual_cost_accounting_units_per_request: "100000000",
  rolling_token_limit: 100_000,
  rolling_cost_accounting_units_limit: "100000000",
  require_usage: false,
});

class CountingRegistry extends ProviderAdapterRegistry {
  lookups = 0;
  override getProviderAdapter(id: ExecutionProfile["provider_id"]) {
    this.lookups += 1;
    return super.getProviderAdapter(id);
  }
}

interface Setup {
  gateway: MultiProviderGateway;
  registry: CountingRegistry;
  transportCalls: () => number;
  ledgerReserves: () => number;
  environmentReads: () => number;
}
function setup(
  options: {
    responseBody?: () => string;
    hangTransport?: boolean;
    pricingCatalog?: PricingCatalog;
    failReserve?: boolean;
    disabledAdapter?: boolean;
  } = {},
): Setup {
  let transportCalls = 0;
  let reserves = 0;
  let environmentReads = 0;
  const registry = new CountingRegistry();
  registry.registerProviderAdapter(
    new OpenRouterAdapter({
      config: options.disabledAdapter
        ? defaultConfig
        : { ...defaultConfig, enabled: true },
      route_policies: [routePolicy],
      env: options.disabledAdapter
        ? new Proxy(
            {},
            {
              get: () => {
                environmentReads += 1;
                return undefined;
              },
            },
          )
        : {
            AI_LAB_LIVE_PROVIDER_EXECUTION_ENABLED: "true",
            AI_LAB_OPENROUTER_ENABLED: "true",
            OPENROUTER_API_KEY: "synthetic-unit-test-placeholder",
          },
      transport: (transportRequest) => {
        transportCalls += 1;
        if (options.hangTransport) {
          return new Promise((_resolve, reject) => {
            transportRequest.signal.addEventListener(
              "abort",
              () => reject(new DOMException("aborted", "AbortError")),
              { once: true },
            );
          });
        }
        return Promise.resolve({
          status: 200,
          body: (
            options.responseBody ??
            (() =>
              JSON.stringify({
                model: routePolicy.model_id,
                provider: "minimax",
                choices: [
                  {
                    message: { content: successContent },
                    finish_reason: "stop",
                  },
                ],
                usage: {
                  prompt_tokens: 10,
                  completion_tokens: 5,
                  total_tokens: 15,
                },
              }))
          )(),
        });
      },
    }),
  );
  const ledger = new InMemoryBudgetLedger();
  const countingLedger: typeof ledger = Object.assign(
    Object.create(InMemoryBudgetLedger.prototype) as InMemoryBudgetLedger,
    {
      reserve: (
        ...args: Parameters<InMemoryBudgetLedger["reserve"]>
      ): ReturnType<InMemoryBudgetLedger["reserve"]> => {
        reserves += 1;
        if (options.failReserve)
          throw new GovernanceError("BUDGET_STORE_UNAVAILABLE");
        return ledger.reserve(...args);
      },
      reconcile: ledger.reconcile.bind(ledger),
      release: ledger.release.bind(ledger),
      get: ledger.get.bind(ledger),
    },
  );
  const gateway = new MultiProviderGateway({
    registry,
    profileResolver: () => profile,
    clock: () => new Date("2026-07-13T12:00:00.000Z"),
    privacyEnforcer: new PrivacyEnforcer({
      zdrEvidence,
      clock: () => new Date("2026-07-13T12:00:00.000Z"),
    }),
    budgetEnforcer: new BudgetEnforcer({
      ledger: countingLedger as never,
      policyCatalog: new BudgetPolicyCatalog({
        schema_version: "2.0.0",
        policies: [budgetPolicy],
      }),
      pricingCatalog:
        options.pricingCatalog ??
        new PricingCatalog({
          schema_version: "2.0.0",
          prices: [price],
          legacy_prices: [],
        }),
      clock: () => new Date("2026-07-13T12:00:00.000Z"),
    }),
  });
  return {
    gateway,
    registry,
    transportCalls: () => transportCalls,
    ledgerReserves: () => reserves,
    environmentReads: () => environmentReads,
  };
}

describe("governed OpenRouter adapter behind the gateway", () => {
  it("keeps privacy failure ahead of adapter lookup and transport", async () => {
    const subject = setup();
    const outcome = await subject.gateway.execute({
      capability_request: {
        ...request,
        context: { data_classification: "restricted" },
      } as never,
      execution_profile_id: profile.profile_id,
    });
    assert.equal(outcome.result.status, "blocked");
    assert.equal(outcome.audit.error_code, "PRIVACY_BLOCKED");
    assert.equal(subject.registry.lookups, 0);
    assert.equal(subject.transportCalls(), 0);
  });

  it("keeps pricing failure ahead of the durable reservation", async () => {
    const subject = setup({
      pricingCatalog: new PricingCatalog({
        schema_version: "2.0.0",
        prices: [],
        legacy_prices: [],
      }),
    });
    const outcome = await subject.gateway.execute({
      capability_request: request,
      execution_profile_id: profile.profile_id,
    });
    assert.equal(outcome.result.status, "blocked");
    assert.equal(subject.ledgerReserves(), 0);
    assert.equal(subject.registry.lookups, 0);
    assert.equal(subject.transportCalls(), 0);
  });

  it("keeps durable reservation failure ahead of adapter lookup", async () => {
    const subject = setup({ failReserve: true });
    const outcome = await subject.gateway.execute({
      capability_request: request,
      execution_profile_id: profile.profile_id,
    });
    assert.equal(outcome.result.status, "blocked");
    assert.equal(outcome.budget_audit?.reason_code, "BUDGET_STORE_UNAVAILABLE");
    assert.equal(subject.registry.lookups, 0);
    assert.equal(subject.transportCalls(), 0);
  });

  it("keeps authorization failure ahead of adapter lookup", async () => {
    const subject = setup();
    const outcome = await subject.gateway.executeAuthorized(
      {
        capability_request: request,
        execution_profile_id: profile.profile_id,
      },
      () => {
        throw new GovernanceError("BUDGET_BINDING_INVALID");
      },
    );
    assert.equal(outcome.result.status, "blocked");
    assert.equal(subject.registry.lookups, 0);
    assert.equal(subject.transportCalls(), 0);
  });

  it("blocks exact provider/model identity mismatch before authorization consumption", async () => {
    for (const mismatch of ["provider", "model"] as const) {
      const subject = setup();
      let consumptionCalls = 0;
      const outcome = await subject.gateway.executeAuthorized(
        {
          capability_request: request,
          execution_profile_id: profile.profile_id,
          expected_profile_contract_version: profile.contract_version,
          expected_provider_id:
            mismatch === "provider"
              ? "different-provider"
              : profile.provider_id,
          expected_model_id:
            mismatch === "model" ? "different/model" : profile.model_id,
        },
        () => {
          consumptionCalls += 1;
        },
      );
      assert.equal(
        outcome.audit.error_code,
        "EXECUTION_PROFILE_IDENTITY_MISMATCH",
      );
      assert.equal(consumptionCalls, 0);
      assert.equal(subject.registry.lookups, 0);
      assert.equal(subject.transportCalls(), 0);
    }
  });

  it("consumes once immediately before the disabled adapter blocks without environment or transport access", async () => {
    const subject = setup({ disabledAdapter: true });
    let consumptionCalls = 0;
    const outcome = await subject.gateway.executeAuthorized(
      {
        capability_request: request,
        execution_profile_id: profile.profile_id,
        expected_profile_contract_version: profile.contract_version,
        expected_provider_id: profile.provider_id,
        expected_model_id: profile.model_id,
      },
      () => {
        consumptionCalls += 1;
      },
    );
    assert.equal(consumptionCalls, 1);
    assert.equal(outcome.audit.error_code, "LIVE_EXECUTION_DISABLED");
    assert.equal(subject.registry.lookups, 1);
    assert.equal(subject.environmentReads(), 0);
    assert.equal(subject.transportCalls(), 0);
  });

  it("executes with exactly one transport call, metadata-only audit, and review-gated output", async () => {
    const subject = setup();
    const outcome = await subject.gateway.execute({
      capability_request: request,
      execution_profile_id: profile.profile_id,
    });
    assert.equal(outcome.result.status, "succeeded");
    assert.equal(subject.transportCalls(), 1);
    // Domain output carries no provider metadata or identifiers.
    const domain = JSON.stringify(outcome.result);
    assert.doesNotMatch(domain, /openrouter|minimax|provider_id|model_id/i);
    assert.doesNotMatch(domain, /synthetic-unit-test-placeholder/);
    // Audit is controlled metadata only: identifiers, never payloads.
    assert.equal(outcome.audit.provider_id, "openrouter");
    assert.equal(outcome.audit.model_id, routePolicy.model_id);
    assert.doesNotMatch(
      JSON.stringify(outcome.audit),
      /safe synthetic excerpt|authorization|Bearer/i,
    );
    // No approved artifact can come from adapter output: review-gated.
    assert.equal(outcome.result.governance.human_review_required, true);
    assert.equal(outcome.result.governance.downstream_allowed, false);
    assert.equal(outcome.result.governance.approval_state, "pending");
  });

  it("reports a gateway timeout as PROVIDER_TIMEOUT with one transport call and no retry", async () => {
    const subject = setup({ hangTransport: true });
    const outcome = await subject.gateway.execute({
      capability_request: request,
      execution_profile_id: profile.profile_id,
    });
    assert.equal(outcome.audit.error_code, "PROVIDER_TIMEOUT");
    assert.equal(outcome.result.error?.code, "TIMEOUT");
    assert.equal(subject.transportCalls(), 1);
  });

  it("reports a caller abort as EXECUTION_ABORTED, distinct from timeout", async () => {
    const subject = setup({ hangTransport: true });
    const controller = new AbortController();
    const pending = subject.gateway.execute({
      capability_request: request,
      execution_profile_id: profile.profile_id,
      signal: controller.signal,
    });
    controller.abort();
    const outcome = await pending;
    assert.equal(outcome.audit.error_code, "EXECUTION_ABORTED");
    assert.equal(subject.transportCalls(), 1);
  });

  it("adds no execution profile and keeps every candidate disabled and blocked", () => {
    const profiles = load<{ profiles: { provider_id: string }[] }>(
      "config/ai-execution-profiles.json",
    ).profiles;
    assert.ok(profiles.every((entry) => entry.provider_id !== "openrouter"));
    const readiness = load<{
      profiles: { enabled: boolean; runtime_eligibility: string }[];
    }>("config/ai-candidate-profile-readiness.json").profiles;
    assert.ok(
      readiness.every(
        (entry) =>
          entry.enabled === false && entry.runtime_eligibility === "blocked",
      ),
    );
  });
});

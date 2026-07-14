import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

import modelFixture from "../../config/ai-openrouter-model-registry.json" with { type: "json" };
import routeFixture from "../../config/ai-openrouter-route-registry.json" with { type: "json" };
import type { ExecutionProfile } from "../../src/execution/execution-profile.js";
import type { BudgetPolicy } from "../../src/governance/budget-policy.js";
import type { PrivacyEnforcementDecision } from "../../src/privacy/privacy-enforcer.js";
import type { ProviderEvidenceRecord } from "../../src/providers/provider-evidence.js";
import {
  OPENROUTER_RESOLUTION_AUTHORIZATION_CONTRACT_VERSION,
  authorizeOpenRouterResolution,
  type OpenRouterResolutionAuthorizationRequest,
} from "../../src/providers/openrouter-resolution-authorization.js";
import {
  computeOpenRouterEntryHash,
  computeOpenRouterRouteHash,
  defaultOpenRouterRegistryDependencies,
  type OpenRouterModelRegistryEntry,
  type OpenRouterRegistry,
  type OpenRouterRouteRegistryRecord,
} from "../../src/providers/openrouter-registry.js";
import {
  OPENROUTER_ROUTE_RESOLUTION_CONTRACT_VERSION,
  computeOpenRouterRouteResolutionHash,
  resolveGovernedOpenRouterRoute,
  resolveOpenRouterRoute,
  type OpenRouterRouteResolutionRequest,
} from "../../src/providers/openrouter-route-resolution.js";

const NOW = "2026-07-14T12:00:00.000Z";
const CAPABILITY = "evidence.extraction.normative_claims";
const PROFILE_ID = "openrouter.normative-claims.synthetic.v1";
const clone = <T>(value: T): T => structuredClone(value);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (
  ajv: Ajv,
) => void;

function resolutionRequest(): OpenRouterRouteResolutionRequest {
  return {
    contract_version: OPENROUTER_ROUTE_RESOLUTION_CONTRACT_VERSION,
    route_id: "openrouter.minimax-m2.7.variable",
    required_capability_ids: [CAPABILITY],
    structured_output_mode: "json_object",
    current_evidence_required: true,
    reviewed_evidence_required: true,
    privacy_zdr_required: true,
    benchmark_evidence_required: true,
    exact_upstream_route_required: true,
    pricing_contract: {
      pricing_id: "openrouter.synthetic-reviewed.v1",
      pricing_contract_version: "1.0.0",
    },
    evaluated_at: NOW,
  };
}

function governedRecords(): {
  route: OpenRouterRouteRegistryRecord;
  entry: OpenRouterModelRegistryEntry;
  registry: OpenRouterRegistry;
} {
  const entry = clone(modelFixture.entries[0]) as unknown as Record<
    string,
    unknown
  >;
  Object.assign(entry, {
    entry_id: "openrouter.synthetic.v1",
    entry_version: "1.0.0",
    enabled: true,
    lifecycle: "approved",
    review_status: "reviewed_approved",
    benchmark_evidence_ids: ["benchmark.synthetic.v1"],
    upstream_route_verification: "verified_exact",
    pricing_contract_id: "openrouter.synthetic-reviewed.v1",
    pricing_contract_version: "1.0.0",
  });
  entry["entry_hash"] = computeOpenRouterEntryHash(
    entry as unknown as OpenRouterModelRegistryEntry,
  );
  const route = clone(routeFixture.routes[0]) as unknown as Record<
    string,
    unknown
  >;
  Object.assign(route, {
    enabled: true,
    lifecycle: "approved",
    review_status: "reviewed_approved",
    route_verification_status: "verified_exact",
    upstream_provider_allowlist: ["minimax"],
    upstream_provider_order: ["minimax"],
    pricing_contract_id: "openrouter.synthetic-reviewed.v1",
    pricing_contract_version: "1.0.0",
    allowed_model_entry_ids: [entry["entry_id"]],
    preferred_model_entry_order: [entry["entry_id"]],
    profile_compatibility: {
      ...(route["profile_compatibility"] as object),
      capability_ids: [CAPABILITY],
      executable_profile_ids: [PROFILE_ID],
    },
  });
  route["route_hash"] = computeOpenRouterRouteHash(
    route as unknown as OpenRouterRouteRegistryRecord,
  );
  return {
    route: route as unknown as OpenRouterRouteRegistryRecord,
    entry: entry as unknown as OpenRouterModelRegistryEntry,
    registry: {
      entries: [entry],
      routes: [route],
    } as unknown as OpenRouterRegistry,
  };
}

const profile = (modelId: string): ExecutionProfile =>
  ({
    profile_id: PROFILE_ID,
    capability_id: CAPABILITY,
    provider_id: "openrouter",
    model_id: modelId,
    mode: "live",
    lifecycle_status: "candidate",
    enabled: true,
    contract_version: "1.1.0",
    configuration: {
      temperature: 0,
      max_output_tokens: 2048,
      timeout_ms: 30_000,
      response_format: "json",
    },
    eligibility: {
      privacy_compatibility: "declared_not_enforced",
      budget_class: "development",
      evaluation_status: "fixture_verified",
    },
    privacy: {
      max_data_classification: "public",
      external_processing: "allowed",
      zdr_support: "verified",
      zdr_evidence_ref: "openrouter.zdr.v2",
      retention_behavior: "none",
      training_use: "declared_not_used",
      processing_region: "us",
      pre_execution_redaction_required: true,
      regulated_data_permitted: false,
      restricted_data_permitted: false,
    },
  }) as unknown as ExecutionProfile;

const budgetPolicy = (): BudgetPolicy => ({
  policy_id: "openrouter.synthetic.hard-cap.v2",
  schema_version: "2.0.0",
  priority: 100,
  capability_id: CAPABILITY,
  profile_id: PROFILE_ID,
  execution_mode: "live",
  request_classification: "public",
  environment_id: "local",
  project_id: "vlatam-ai-lab",
  tenant_id: "sandbox",
  scope_id: "openrouter-synthetic",
  currency: "USD",
  accounting_scale: "1000000",
  reservation_rounding_policy: "CEILING",
  reconciliation_rounding_policy: "CEILING",
  display_rounding_policy: "HALF_EVEN",
  require_usage: true,
  require_verified_pricing: true,
  behavior: "hard_block",
  max_estimated_tokens_per_request: 10_000,
  max_actual_tokens_per_request: 10_000,
  max_estimated_cost_accounting_units_per_request: "1000000",
  max_actual_cost_accounting_units_per_request: "1000000",
  rolling_request_limit: 100,
  rolling_token_limit: 1_000_000,
  rolling_cost_accounting_units_limit: "100000000",
  rolling_window_seconds: 86_400,
  reservation_ttl_seconds: 300,
});

const privacyDecision = (): PrivacyEnforcementDecision =>
  ({
    status: "allowed",
    reason_code: "PRIVACY_ALLOWED",
    required_actions: ["zdr_verified"],
    audit: {
      privacy_decision_id: "privacy.synthetic.v1",
      schema_version: "1.0.0",
      request_id: "request.synthetic.v1",
      capability_id: CAPABILITY,
      profile_id: PROFILE_ID,
      data_classification: "public",
      privacy_policy_id: "privacy.synthetic.v1",
      privacy_policy_version: "1.0.0",
      decision: "allowed",
      reason_code: "PRIVACY_ALLOWED",
      required_actions: ["zdr_verified"],
      redaction: [],
      redaction_counts: {
        removed: 0,
        replaced: 0,
        hashed: 0,
        tokenized: 0,
        preserved: 0,
      },
      zdr_requirement: "required",
      zdr_support: "verified",
      zdr_evidence_id: "openrouter.zdr.v2",
      zdr_evidence_hash: "a".repeat(64),
      retention_requirement: ["none"],
      retention_declaration: "none",
      execution_mode: "live",
      decided_at: NOW,
    },
  }) as unknown as PrivacyEnforcementDecision;

function validRequest(): OpenRouterResolutionAuthorizationRequest {
  const records = governedRecords();
  const defaults = clone(defaultOpenRouterRegistryDependencies());
  const dependencies = {
    ...defaults,
    provider_evidence: defaults.provider_evidence.map(
      (record) =>
        ({
          ...record,
          status: "accepted",
          conflict_status: "none",
          conflicts_with: [],
          expires_at: "2099-01-01T00:00:00.000Z",
          review: {
            ...record.review,
            status: "reviewed_approved",
            reviewed_at: NOW,
          },
        }) as ProviderEvidenceRecord,
    ),
  };
  const resolution = resolveOpenRouterRoute(
    resolutionRequest(),
    records.registry,
    dependencies,
  );
  assert.equal(resolution.status, "resolved");
  const evidenceIds = [
    records.route.pricing_evidence_id,
    records.route.privacy_evidence_id,
    records.route.operational_evidence_id,
    records.entry.pricing_evidence_id,
    records.entry.privacy_evidence_id,
    records.entry.operational_evidence_id,
    ...records.entry.model_evidence_refs.map((item) => item.evidence_id),
    ...records.entry.benchmark_evidence_ids,
  ];
  return {
    contract_version: OPENROUTER_RESOLUTION_AUTHORIZATION_CONTRACT_VERSION,
    resolution,
    resolution_maximum_age_seconds: 600,
    authorization: {
      authorization_id: "authorization.synthetic.v1",
      authorization_decision: "approved",
      authorization_mode: "single_use",
      authorized_at: NOW,
      expires_at: "2026-07-14T12:30:00.000Z",
      authorizer_role: "ai-governance-authorizer",
      review_attestation_reference: "review.synthetic.v1",
      handoff_policy_id: "handoff.reviewed-routing",
      handoff_policy_version: "1.0.0",
      handoff_policy_hash: "b".repeat(64),
      resolution_decision_hash: resolution.audit.decision_hash,
      route_id: records.route.route_id,
      model_registry_id: records.entry.entry_id,
      provider_model_id: records.entry.model_id,
      execution_profile_id: PROFILE_ID,
      execution_profile_version: "1.1.0",
      capability_ids: [CAPABILITY],
      privacy_zdr_required: true,
      budget_policy_id: "openrouter.synthetic.hard-cap.v2",
      budget_policy_version: "2.0.0",
      budget_scope_id: "openrouter-synthetic",
      execution_correlation_id: "execution.synthetic.v1",
      audit_correlation_id: "audit.synthetic.v1",
    },
    authorization_consumption: { status: "ok" },
    execution_profile: profile(records.entry.model_id),
    capability_id: CAPABILITY,
    route_intent: {
      route_id: records.route.route_id,
      model_registry_id: records.entry.entry_id,
      provider_model_id: records.entry.model_id,
    },
    privacy_decision: privacyDecision(),
    budget: {
      status: "allowed",
      policy: budgetPolicy(),
      estimated_accounting_units: "500000",
    },
    evidence: {
      status: "ready",
      evidence_ids: [...new Set(evidenceIds)],
      valid_until: "2026-07-14T12:20:00.000Z",
    },
    route_record: records.route,
    model_entry: records.entry,
    evaluated_at: NOW,
    policy_ttl_seconds: 900,
    execution_correlation_id: "execution.synthetic.v1",
    audit_correlation_id: "audit.synthetic.v1",
  };
}

const mutable = (request: unknown) => request as Record<string, unknown>;

describe("OpenRouter resolution authorization", () => {
  it("issues an immutable exact metadata-only execution policy", () => {
    const result = authorizeOpenRouterResolution(validRequest());
    assert.equal(result.status, "authorized");
    if (result.status !== "authorized") return;
    assert.equal(result.policy.route.provider_id, "openrouter");
    assert.equal(result.policy.expires_at, "2026-07-14T12:15:00.000Z");
    assert.match(result.policy.policy_hash, /^[a-f0-9]{64}$/);
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.policy));
    assert.ok(Object.isFrozen(result.policy.authorization.capability_ids));
    const ajv = new Ajv({ strict: true });
    addFormats(ajv);
    const validate = ajv.compile(
      JSON.parse(
        readFileSync(
          "schemas/ai-openrouter-exact-execution-policy.schema.json",
          "utf8",
        ),
      ) as object,
    );
    assert.equal(
      validate(result.policy),
      true,
      JSON.stringify(validate.errors),
    );
  });

  it("is deterministic for identical validated inputs and time", () => {
    assert.deepEqual(
      authorizeOpenRouterResolution(validRequest()),
      authorizeOpenRouterResolution(validRequest()),
    );
  });

  for (const status of ["blocked", "invalid_request"] as const) {
    it(`does not authorize a ${status} resolution`, () => {
      const request = validRequest();
      mutable(request).resolution = {
        ...request.resolution,
        status,
      };
      assert.notEqual(
        authorizeOpenRouterResolution(request).status,
        "authorized",
      );
    });
  }

  it("detects resolution hash tampering", () => {
    const request = validRequest();
    mutable(request).resolution = {
      ...request.resolution,
      selected_provider_model_id: "minimax/tampered",
    };
    const result = authorizeOpenRouterResolution(request);
    assert.equal(result.status, "blocked");
    if ("reasons" in result)
      assert.ok(result.reasons.includes("resolution_integrity_failure"));
  });

  it("detects registry version/hash mismatch", () => {
    const hashRequest = validRequest();
    mutable(hashRequest).route_record = {
      ...hashRequest.route_record,
      route_hash: "0".repeat(64),
    };
    const hashResult = authorizeOpenRouterResolution(hashRequest);
    assert.equal(hashResult.status, "blocked");
    if ("reasons" in hashResult)
      assert.ok(hashResult.reasons.includes("registry_hash_mismatch"));

    const versionRequest = validRequest();
    mutable(versionRequest).resolution = {
      ...versionRequest.resolution,
      registry: {
        ...versionRequest.resolution.registry,
        model_registry_contract_version: "9.0.0",
      },
    };
    const versionResult = authorizeOpenRouterResolution(versionRequest);
    assert.equal(versionResult.status, "blocked");
    if ("reasons" in versionResult)
      assert.ok(versionResult.reasons.includes("registry_metadata_mismatch"));
  });

  for (const field of [
    "route_id",
    "model_registry_id",
    "provider_model_id",
  ] as const) {
    it(`blocks ${field} mismatch`, () => {
      const request = validRequest();
      mutable(request).route_intent = {
        ...request.route_intent,
        [field]: "different.value",
      };
      assert.equal(authorizeOpenRouterResolution(request).status, "blocked");
    });
  }

  it("blocks execution-profile mismatch or disablement", () => {
    const request = validRequest();
    mutable(request).execution_profile = {
      ...request.execution_profile,
      enabled: false,
    };
    assert.equal(authorizeOpenRouterResolution(request).status, "blocked");
  });

  for (const state of [
    "denied",
    "expired",
    "consumed",
    "out_of_scope",
  ] as const) {
    it(`blocks ${state} authorization`, () => {
      const request = validRequest();
      if (state === "denied")
        mutable(request.authorization).authorization_decision = "denied";
      if (state === "expired")
        mutable(request.authorization).expires_at = "2026-07-14T11:59:59.000Z";
      if (state === "consumed")
        mutable(request).authorization_consumption = {
          status: "ok",
          record: { state: "consumed" },
        };
      if (state === "out_of_scope")
        mutable(request.authorization).capability_ids = [
          "different.capability",
        ];
      assert.equal(authorizeOpenRouterResolution(request).status, "blocked");
    });
  }

  it("blocks a missing authorization", () => {
    const request = mutable(validRequest());
    delete request.authorization;
    assert.equal(
      authorizeOpenRouterResolution(request).status,
      "invalid_request",
    );
  });

  it("blocks privacy or ZDR weakening", () => {
    const privacyRequest = validRequest();
    mutable(privacyRequest).privacy_decision = {
      ...privacyRequest.privacy_decision,
      status: "blocked",
    };
    assert.equal(
      authorizeOpenRouterResolution(privacyRequest).status,
      "blocked",
    );

    const zdrRequest = validRequest();
    mutable(zdrRequest.privacy_decision.audit).zdr_support =
      "declared_unverified";
    assert.equal(authorizeOpenRouterResolution(zdrRequest).status, "blocked");
  });

  it("blocks insufficient evidence readiness", () => {
    const request = validRequest();
    mutable(request).evidence = { ...request.evidence, status: "blocked" };
    assert.equal(authorizeOpenRouterResolution(request).status, "blocked");
  });

  for (const kind of ["missing", "exceeded", "policy_mismatch"] as const) {
    it(`blocks budget ${kind}`, () => {
      const request = validRequest();
      if (kind === "missing") mutable(request.budget).status = "unknown";
      if (kind === "exceeded")
        mutable(request.budget).estimated_accounting_units = "1000001";
      if (kind === "policy_mismatch")
        mutable(request.budget).policy = {
          ...request.budget.policy,
          behavior: "human_review_required",
        };
      assert.equal(authorizeOpenRouterResolution(request).status, "blocked");
    });
  }

  it("blocks expired or stale resolution", () => {
    const staleRequest = validRequest();
    mutable(staleRequest).evaluated_at = "2026-07-14T12:11:00.000Z";
    assert.equal(authorizeOpenRouterResolution(staleRequest).status, "blocked");

    const expiredRequest = validRequest();
    const expiredRoute = {
      ...expiredRequest.route_record,
      expires_at: "2026-07-14T11:59:59.000Z",
    } as unknown as OpenRouterRouteRegistryRecord;
    mutable(expiredRoute).route_hash = computeOpenRouterRouteHash(expiredRoute);
    mutable(expiredRequest).route_record = expiredRoute;
    mutable(expiredRequest).resolution = {
      ...expiredRequest.resolution,
      registry: {
        ...expiredRequest.resolution.registry,
        route_hash: expiredRoute.route_hash,
      },
    };
    assert.equal(
      authorizeOpenRouterResolution(expiredRequest).status,
      "blocked",
    );
  });

  it("bounds expiry by every upstream validity window", () => {
    const cases = [
      ["authorization", "2026-07-14T12:04:00.000Z"],
      ["route", "2026-07-14T12:05:00.000Z"],
      ["entry", "2026-07-14T12:06:00.000Z"],
      ["evidence", "2026-07-14T12:07:00.000Z"],
    ] as const;
    for (const [owner, expiry] of cases) {
      const request = validRequest();
      if (owner === "authorization")
        mutable(request.authorization).expires_at = expiry;
      if (owner === "route") {
        const route = {
          ...request.route_record,
          expires_at: expiry,
        } as unknown as OpenRouterRouteRegistryRecord;
        mutable(route).route_hash = computeOpenRouterRouteHash(route);
        mutable(request).route_record = route;
        mutable(request).resolution = {
          ...request.resolution,
          registry: {
            ...request.resolution.registry,
            route_hash: route.route_hash,
          },
        };
      }
      if (owner === "entry") {
        const entry = {
          ...request.model_entry,
          expires_at: expiry,
        } as unknown as OpenRouterModelRegistryEntry;
        mutable(entry).entry_hash = computeOpenRouterEntryHash(entry);
        mutable(request).model_entry = entry;
        mutable(request).resolution = {
          ...request.resolution,
          registry: {
            ...request.resolution.registry,
            evaluated_entry_hashes: [entry.entry_hash],
          },
        };
      }
      if (owner === "evidence") mutable(request.evidence).valid_until = expiry;
      const resolutionBase = Object.fromEntries(
        Object.entries(request.resolution).filter(([key]) => key !== "audit"),
      );
      mutable(request).resolution = {
        ...request.resolution,
        audit: {
          ...request.resolution.audit,
          decision_hash: computeOpenRouterRouteResolutionHash(resolutionBase),
        },
      };
      mutable(request.authorization).resolution_decision_hash =
        request.resolution.audit.decision_hash;
      const result = authorizeOpenRouterResolution(request);
      assert.equal(result.status, "authorized", owner);
      if (result.status === "authorized")
        assert.equal(result.policy.expires_at, expiry, owner);
    }
  });

  it("rejects missing correlation/audit metadata and malformed input", () => {
    for (const field of [
      "execution_correlation_id",
      "audit_correlation_id",
    ] as const) {
      const request = mutable(validRequest());
      request[field] = "";
      request.extra = true;
      const result = authorizeOpenRouterResolution(request);
      assert.equal(result.status, "invalid_request", field);
    }
  });

  it("does not rerun the resolver, invoke an adapter, or perform network I/O", () => {
    const source = readFileSync(
      "src/providers/openrouter-resolution-authorization.ts",
      "utf8",
    );
    assert.doesNotMatch(
      source,
      /resolveOpenRouterRoute|resolveGovernedOpenRouterRoute|openrouter-adapter|multi-provider-gateway|createOpenRouterFetchTransport|\bfetch\s*\(|process\.env/,
    );
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (() => {
      calls += 1;
      throw new Error("network forbidden");
    }) as typeof fetch;
    try {
      assert.equal(
        authorizeOpenRouterResolution(validRequest()).status,
        "authorized",
      );
      assert.equal(calls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps repository-backed disabled OpenRouter records blocked", () => {
    const resolution = resolveGovernedOpenRouterRoute(resolutionRequest());
    assert.equal(resolution.status, "blocked");
    const request = validRequest();
    mutable(request).resolution = resolution;
    assert.equal(authorizeOpenRouterResolution(request).status, "blocked");
  });
});

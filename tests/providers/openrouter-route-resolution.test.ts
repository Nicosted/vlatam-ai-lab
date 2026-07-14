import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import modelFixture from "../../config/ai-openrouter-model-registry.json" with { type: "json" };
import routeFixture from "../../config/ai-openrouter-route-registry.json" with { type: "json" };
import {
  computeOpenRouterEntryHash,
  computeOpenRouterRouteHash,
  defaultOpenRouterRegistryDependencies,
  type OpenRouterModelRegistryEntry,
  type OpenRouterRegistry,
  type OpenRouterRegistryDependencies,
  type OpenRouterRouteRegistryRecord,
} from "../../src/providers/openrouter-registry.js";
import {
  OPENROUTER_ROUTE_RESOLUTION_CONTRACT_VERSION,
  resolveGovernedOpenRouterRoute,
  resolveOpenRouterRoute,
  type OpenRouterRouteResolutionRequest,
  type OpenRouterRouteResolutionResult,
} from "../../src/providers/openrouter-route-resolution.js";
import type { ProviderEvidenceRecord } from "../../src/providers/provider-evidence.js";

const clone = <T>(value: T): T => structuredClone(value);
const NOW = "2026-07-14T12:00:00.000Z";

const request = (): OpenRouterRouteResolutionRequest => ({
  contract_version: OPENROUTER_ROUTE_RESOLUTION_CONTRACT_VERSION,
  route_id: "openrouter.minimax-m2.7.variable",
  required_capability_ids: ["evidence.extraction.normative_claims"],
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
});

interface TestContext {
  registry: OpenRouterRegistry;
  dependencies: Omit<OpenRouterRegistryDependencies, "provider_evidence"> & {
    provider_evidence: ProviderEvidenceRecord[];
  };
  entries: OpenRouterModelRegistryEntry[];
  route: OpenRouterRouteRegistryRecord;
}

function context(entryCount = 2): TestContext {
  const seededEntry = clone(
    modelFixture.entries[0],
  ) as unknown as OpenRouterModelRegistryEntry;
  const entries = Array.from({ length: entryCount }, (_, index) => {
    const entry = clone(seededEntry) as unknown as Record<string, unknown>;
    entry["entry_id"] = `openrouter.synthetic-${index + 1}.v1`;
    entry["entry_version"] = "1.0.0";
    entry["enabled"] = true;
    entry["lifecycle"] = "approved";
    entry["review_status"] = "reviewed_approved";
    entry["benchmark_evidence_ids"] = [`benchmark.synthetic-${index + 1}.v1`];
    entry["upstream_route_verification"] = "verified_exact";
    entry["pricing_contract_id"] = "openrouter.synthetic-reviewed.v1";
    entry["pricing_contract_version"] = "1.0.0";
    entry["entry_hash"] = computeOpenRouterEntryHash(
      entry as unknown as OpenRouterModelRegistryEntry,
    );
    return entry as unknown as OpenRouterModelRegistryEntry;
  });
  const route = clone(routeFixture.routes[0]) as unknown as Record<
    string,
    unknown
  >;
  route["enabled"] = true;
  route["lifecycle"] = "approved";
  route["review_status"] = "reviewed_approved";
  route["route_verification_status"] = "verified_exact";
  route["upstream_provider_allowlist"] = ["minimax"];
  route["upstream_provider_order"] = ["minimax"];
  route["pricing_contract_id"] = "openrouter.synthetic-reviewed.v1";
  route["pricing_contract_version"] = "1.0.0";
  route["allowed_model_entry_ids"] = entries.map((entry) => entry.entry_id);
  route["preferred_model_entry_order"] = entries.map((entry) => entry.entry_id);
  route["route_hash"] = computeOpenRouterRouteHash(
    route as unknown as OpenRouterRouteRegistryRecord,
  );
  const defaultDependencies = clone(defaultOpenRouterRegistryDependencies());
  const dependencies = {
    ...defaultDependencies,
    provider_evidence: defaultDependencies.provider_evidence.map(
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
  return {
    registry: {
      entries,
      routes: [route as unknown as OpenRouterRouteRegistryRecord],
    } as unknown as OpenRouterRegistry,
    dependencies,
    entries,
    route: route as unknown as OpenRouterRouteRegistryRecord,
  };
}

function resolve(
  ctx: TestContext,
  input = request(),
): OpenRouterRouteResolutionResult {
  return resolveOpenRouterRoute(input, ctx.registry, ctx.dependencies);
}

function rehashEntry(entry: OpenRouterModelRegistryEntry): void {
  (entry as unknown as Record<string, unknown>)["entry_hash"] =
    computeOpenRouterEntryHash(entry);
}

describe("governed OpenRouter route resolution", () => {
  it("selects the first eligible preferred model", () => {
    const result = resolve(context());
    assert.equal(result.status, "resolved");
    if (result.status !== "resolved") return;
    assert.equal(
      result.selected_model_registry_id,
      "openrouter.synthetic-1.v1",
    );
    assert.equal(result.selection_position, 0);
    assert.equal(result.selection_source, "preferred");
    assert.equal(result.audit.executable, false);
  });

  it("skips an ineligible preferred model and selects the next", () => {
    const ctx = context();
    (ctx.entries[0] as unknown as Record<string, unknown>)["capability_ids"] = [
      "different.capability",
    ];
    rehashEntry(ctx.entries[0]!);
    const result = resolve(ctx);
    assert.equal(result.status, "resolved");
    if (result.status !== "resolved") return;
    assert.equal(
      result.selected_model_registry_id,
      "openrouter.synthetic-2.v1",
    );
    assert.equal(result.selection_position, 1);
  });

  it("returns an identical immutable decision for repeated resolution", () => {
    const ctx = context();
    const first = resolve(ctx);
    const second = resolve(ctx);
    assert.deepEqual(second, first);
    assert.equal(second.audit.decision_hash, first.audit.decision_hash);
    assert.ok(Object.isFrozen(first));
    assert.ok(Object.isFrozen(first.registry));
    assert.ok(Object.isFrozen(first.decision_reasons));
  });

  it("blocks an unknown route", () => {
    const input = { ...request(), route_id: "openrouter.unknown.route" };
    const result = resolve(context(), input);
    assert.equal(result.status, "blocked");
    assert.deepEqual(result.decision_reasons, ["unknown_route"]);
  });

  it("blocks the disabled governed repository route", () => {
    const result = resolveGovernedOpenRouterRoute(request());
    assert.equal(result.status, "blocked");
    assert.deepEqual(result.decision_reasons, ["route_disabled"]);
  });

  it("returns no eligible model when every candidate is ineligible", () => {
    const ctx = context();
    for (const entry of ctx.entries) {
      (entry as unknown as Record<string, unknown>)["enabled"] = false;
      rehashEntry(entry);
    }
    assert.equal(resolve(ctx).status, "no_eligible_model");
  });

  it("rejects capability mismatch", () => {
    const ctx = context(1);
    (ctx.entries[0] as unknown as Record<string, unknown>)["capability_ids"] = [
      "different.capability",
    ];
    rehashEntry(ctx.entries[0]!);
    const result = resolve(ctx);
    assert.equal(result.status, "no_eligible_model");
    assert.match(result.decision_reasons[0]!, /capability_mismatch/);
  });

  it("rejects structured-output mismatch", () => {
    const input = {
      ...request(),
      structured_output_mode: "json_schema" as const,
    };
    const result = resolve(context(1), input);
    assert.equal(result.status, "no_eligible_model");
    assert.match(result.decision_reasons[0]!, /structured_output_mismatch/);
  });

  it("rejects missing current evidence", () => {
    const ctx = context(1);
    ctx.dependencies.provider_evidence =
      ctx.dependencies.provider_evidence.filter(
        (record) => record.evidence_id !== ctx.entries[0]!.privacy_evidence_id,
      );
    const result = resolve(ctx);
    assert.equal(result.status, "no_eligible_model");
    assert.match(result.decision_reasons[0]!, /missing_evidence/);
  });

  it("rejects privacy and ZDR mismatch", () => {
    const ctx = context(1);
    ctx.dependencies.provider_evidence = ctx.dependencies.provider_evidence.map(
      (record) =>
        record.evidence_id === ctx.entries[0]!.privacy_evidence_id
          ? ({ ...record, status: "unknown" } as ProviderEvidenceRecord)
          : record,
    );
    const result = resolve(ctx);
    assert.equal(result.status, "no_eligible_model");
    assert.match(result.decision_reasons[0]!, /unknown_evidence/);
  });

  it("rejects pricing-policy mismatch", () => {
    const input = {
      ...request(),
      pricing_contract: {
        pricing_id: "openrouter.other.v1",
        pricing_contract_version: "1.0.0",
      },
    };
    const result = resolve(context(1), input);
    assert.equal(result.status, "no_eligible_model");
    assert.match(result.decision_reasons[0]!, /pricing_contract_mismatch/);
  });

  it("rejects lifecycle mismatch", () => {
    const ctx = context(1);
    (ctx.entries[0] as unknown as Record<string, unknown>)["lifecycle"] =
      "candidate";
    rehashEntry(ctx.entries[0]!);
    const result = resolve(ctx);
    assert.equal(result.status, "no_eligible_model");
    assert.match(result.decision_reasons[0]!, /model_lifecycle_ineligible/);
  });

  it("returns invalid_request for malformed input", () => {
    const malformed = { ...request(), evaluated_at: "today" };
    const result = resolveOpenRouterRoute(
      malformed,
      context().registry,
      context().dependencies,
    );
    assert.equal(result.status, "invalid_request");
    assert.deepEqual(result.decision_reasons, ["invalid_evaluated_at"]);
  });

  it("fails closed on an unknown registry reference", () => {
    const ctx = context(1);
    (ctx.route as unknown as Record<string, unknown>)[
      "allowed_model_entry_ids"
    ] = ["openrouter.missing.v1"];
    const result = resolve(ctx);
    assert.equal(result.status, "blocked");
    assert.deepEqual(result.decision_reasons, [
      "registry_integrity_unknown_model_reference",
    ]);
  });

  it("does not use fallback when it is not explicitly configured", () => {
    const ctx = context(3);
    (ctx.entries[0] as unknown as Record<string, unknown>)["enabled"] = false;
    rehashEntry(ctx.entries[0]!);
    (ctx.route as unknown as Record<string, unknown>)[
      "preferred_model_entry_order"
    ] = [ctx.entries[0]!.entry_id, ctx.entries[1]!.entry_id];
    (ctx.route as unknown as Record<string, unknown>)[
      "allowed_model_entry_ids"
    ] = [ctx.entries[0]!.entry_id, ctx.entries[1]!.entry_id];
    const result = resolve(ctx);
    assert.equal(result.status, "resolved");
    if (result.status !== "resolved") return;
    assert.equal(result.selected_model_registry_id, ctx.entries[1]!.entry_id);
    assert.equal(result.selection_source, "preferred");
  });

  it("fails closed on an invalid fallback configuration", () => {
    const ctx = context(1);
    (ctx.route as unknown as Record<string, unknown>)[
      "fallback_model_entry_order"
    ] = [ctx.entries[0]!.entry_id];
    const result = resolve(ctx);
    assert.equal(result.status, "blocked");
    assert.deepEqual(result.decision_reasons, [
      "invalid_fallback_configuration",
    ]);
  });

  it("never invokes the adapter, transport, fetch, or provider execution", () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = (() => {
      fetchCalls += 1;
      throw new Error("network forbidden");
    }) as typeof fetch;
    try {
      const result = resolve(context());
      assert.equal(result.status, "resolved");
      assert.equal(fetchCalls, 0);
      assert.equal(result.audit.provider_call_performed, false);
      const source = readFileSync(
        "src/providers/openrouter-route-resolution.ts",
        "utf8",
      );
      assert.doesNotMatch(
        source,
        /openrouter-adapter|createOpenRouterFetchTransport|\bfetch\s*\(|process\.env/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("includes registry version and hash metadata in resolved and blocked decisions", () => {
    const ctx = context(1);
    const resolved = resolve(ctx);
    assert.equal(resolved.status, "resolved");
    assert.equal(resolved.registry.route_hash, ctx.route.route_hash);
    assert.deepEqual(resolved.registry.evaluated_entry_hashes, [
      ctx.entries[0]!.entry_hash,
    ]);
    const blocked = resolveGovernedOpenRouterRoute(request());
    assert.equal(blocked.status, "blocked");
    assert.match(blocked.registry.route_hash ?? "", /^[a-f0-9]{64}$/);
    assert.equal(blocked.registry.model_registry_contract_version, "1.0.0");
    assert.equal(blocked.registry.route_registry_contract_version, "1.0.0");
  });

  it("blocks a request that attempts to weaken route policy", () => {
    const input = { ...request(), privacy_zdr_required: false };
    const result = resolve(context(1), input);
    assert.equal(result.status, "blocked");
    assert.deepEqual(result.decision_reasons, ["privacy_zdr_policy_conflict"]);
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

import adapterConfig from "../../config/ai-openrouter-adapter.json" with { type: "json" };
import executionProfiles from "../../config/ai-execution-profiles.json" with { type: "json" };
import modelsFixture from "../../config/ai-openrouter-model-registry.json" with { type: "json" };
import routesFixture from "../../config/ai-openrouter-route-registry.json" with { type: "json" };
import {
  OPENROUTER_ENTRY_HASH_DOMAIN,
  OPENROUTER_MODEL_REGISTRY_CONTRACT_VERSION,
  OPENROUTER_REGISTRY_CANONICALIZATION_VERSION,
  OPENROUTER_ROUTE_HASH_DOMAIN,
  OPENROUTER_ROUTE_REGISTRY_CONTRACT_VERSION,
  OpenRouterRegistry,
  canonicalizeOpenRouterRegistryJson,
  computeOpenRouterEntryHash,
  computeOpenRouterRouteHash,
  defaultOpenRouterRegistryDependencies,
  evaluateOpenRouterRegistryReadiness,
  loadOpenRouterRegistry,
  validateOpenRouterLifecycleTransition,
  validateOpenRouterRegistry,
  type OpenRouterModelRegistryData,
  type OpenRouterModelRegistryEntry,
  type OpenRouterRegistryDependencies,
  type OpenRouterRouteRegistryData,
  type OpenRouterRouteRegistryRecord,
} from "../../src/providers/openrouter-registry.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (
  ajv: Ajv,
) => void;

const NOW = new Date("2026-07-14T12:00:00.000Z");
const models = modelsFixture as unknown as OpenRouterModelRegistryData;
const routes = routesFixture as unknown as OpenRouterRouteRegistryData;
const clone = <T>(value: T): T => structuredClone(value);
const mutable = (value: unknown): Record<string, unknown> =>
  value as Record<string, unknown>;

const scenarios = JSON.parse(
  readFileSync(
    "data/fixtures/providers/openrouter-registry-invalid-scenarios.json",
    "utf8",
  ),
) as {
  fixture_contract_version: string;
  scenarios: { name: string; expected_error: string }[];
};

function rehashEntry(entry: Record<string, unknown>): void {
  entry["entry_hash"] = computeOpenRouterEntryHash(
    entry as unknown as OpenRouterModelRegistryEntry,
  );
}

function rehashRoute(route: Record<string, unknown>): void {
  route["route_hash"] = computeOpenRouterRouteHash(
    route as unknown as OpenRouterRouteRegistryRecord,
  );
}

function appendVersion(
  modelData: OpenRouterModelRegistryData,
  routeData: OpenRouterRouteRegistryData,
  version = "1.1.0",
  supersede = true,
): void {
  const entries = modelData.entries as OpenRouterModelRegistryEntry[];
  const routeRecords = routeData.routes as OpenRouterRouteRegistryRecord[];
  const previousEntry = entries[0]!;
  const previousRoute = routeRecords[0]!;
  const nextEntry = clone(previousEntry) as unknown as Record<string, unknown>;
  nextEntry["entry_id"] =
    `openrouter.minimax-m2.7.variable.${version.replaceAll(".", "-")}`;
  nextEntry["entry_version"] = version;
  nextEntry["supersedes_entry_id"] = supersede ? previousEntry.entry_id : null;
  nextEntry["created_at"] = "2026-07-14T02:00:00.000Z";
  rehashEntry(nextEntry);
  entries.push(nextEntry as unknown as OpenRouterModelRegistryEntry);

  const nextRoute = clone(previousRoute) as unknown as Record<string, unknown>;
  nextRoute["route_record_id"] =
    `openrouter.minimax-m2.7.variable-route.${version.replaceAll(".", "-")}`;
  nextRoute["route_version"] = version;
  nextRoute["allowed_model_entry_ids"] = [nextEntry["entry_id"]];
  nextRoute["preferred_model_entry_order"] = [nextEntry["entry_id"]];
  nextRoute["supersedes_route_record_id"] = supersede
    ? previousRoute.route_record_id
    : null;
  nextRoute["created_at"] = "2026-07-14T02:00:00.000Z";
  rehashRoute(nextRoute);
  routeRecords.push(nextRoute as unknown as OpenRouterRouteRegistryRecord);
}

function invalidScenario(name: string): {
  models: OpenRouterModelRegistryData;
  routes: OpenRouterRouteRegistryData;
  dependencies: OpenRouterRegistryDependencies;
  now: Date;
} {
  const modelData = clone({
    ...models,
    entries: models.entries.filter(
      (entry) => entry.model_id === "minimax/minimax-m2.7",
    ),
  });
  const routeData = clone({
    ...routes,
    routes: routes.routes.filter(
      (route) => route.model_id === "minimax/minimax-m2.7",
    ),
  });
  const dependencies = clone(defaultOpenRouterRegistryDependencies());
  const entry = mutable(modelData.entries[0]);
  const route = mutable(routeData.routes[0]);
  let now = NOW;

  switch (name) {
    case "enabled-entry":
      entry["enabled"] = true;
      rehashEntry(entry);
      break;
    case "approved-without-benchmark":
      entry["lifecycle"] = "approved";
      entry["review_status"] = "reviewed_approved";
      rehashEntry(entry);
      break;
    case "candidate-with-expired-evidence":
      entry["lifecycle"] = "candidate";
      entry["review_status"] = "reviewed_approved";
      rehashEntry(entry);
      now = new Date("2026-11-01T00:00:00.000Z");
      break;
    case "unknown-lifecycle":
      entry["lifecycle"] = "future";
      rehashEntry(entry);
      break;
    case "unknown-field":
      entry["unexpected"] = true;
      break;
    case "malformed-model-id":
      entry["model_id"] = "MiniMax-M2.7";
      rehashEntry(entry);
      break;
    case "openrouter-auto":
      entry["model_id"] = "openrouter/auto";
      route["model_id"] = "openrouter/auto";
      rehashEntry(entry);
      rehashRoute(route);
      break;
    case "duplicate-entry-id-version":
      (modelData.entries as OpenRouterModelRegistryEntry[]).push(
        clone(modelData.entries[0]!),
      );
      break;
    case "duplicate-route-id-version":
      (routeData.routes as OpenRouterRouteRegistryRecord[]).push(
        clone(routeData.routes[0]!),
      );
      break;
    case "duplicate-entry-id":
      appendVersion(modelData, routeData);
      mutable(modelData.entries[1])["entry_id"] =
        modelData.entries[0]!.entry_id;
      rehashEntry(mutable(modelData.entries[1]));
      break;
    case "duplicate-route-record-id":
      appendVersion(modelData, routeData);
      mutable(routeData.routes[1])["route_record_id"] =
        routeData.routes[0]!.route_record_id;
      rehashRoute(mutable(routeData.routes[1]));
      break;
    case "ambiguous-active-model-route":
      appendVersion(modelData, routeData, "1.1.0", false);
      break;
    case "model-route-mismatch":
      route["model_id"] = "other/model";
      rehashRoute(route);
      break;
    case "missing-upstream-identity":
      entry["upstream_provider_id"] = "";
      rehashEntry(entry);
      break;
    case "variable-route-marked-exact":
      entry["upstream_route_verification"] = "verified_exact";
      route["route_verification_status"] = "verified_exact";
      rehashEntry(entry);
      rehashRoute(route);
      break;
    case "generic-evidence-used-as-model-evidence": {
      const refs = entry["model_evidence_refs"] as Record<string, unknown>[];
      refs[0] = {
        evidence_id: "openrouter.provider-identity.v2",
        evidence_hash:
          "afb077600833e035c27cb537b75dfd621fd42c25b1c901283dd179a71861c117",
      };
      rehashEntry(entry);
      break;
    }
    case "missing-evidence-hash":
      entry["pricing_evidence_hash"] = "";
      rehashEntry(entry);
      break;
    case "evidence-hash-mismatch":
      entry["pricing_evidence_hash"] = "f".repeat(64);
      rehashEntry(entry);
      break;
    case "unsupported-pricing-version":
      entry["pricing_contract_id"] = "openrouter.unreviewed";
      entry["pricing_contract_version"] = "9.0.0";
      route["pricing_contract_id"] = "openrouter.unreviewed";
      route["pricing_contract_version"] = "9.0.0";
      rehashEntry(entry);
      rehashRoute(route);
      break;
    case "pricing-evidence-mismatch":
      entry["pricing_evidence_id"] = entry["operational_evidence_id"];
      entry["pricing_evidence_hash"] = entry["operational_evidence_hash"];
      route["pricing_evidence_id"] = route["operational_evidence_id"];
      route["pricing_evidence_hash"] = route["operational_evidence_hash"];
      rehashEntry(entry);
      rehashRoute(route);
      break;
    case "privacy-evidence-mismatch":
      entry["privacy_evidence_id"] = entry["operational_evidence_id"];
      entry["privacy_evidence_hash"] = entry["operational_evidence_hash"];
      route["privacy_evidence_id"] = route["operational_evidence_id"];
      route["privacy_evidence_hash"] = route["operational_evidence_hash"];
      rehashEntry(entry);
      rehashRoute(route);
      break;
    case "operational-evidence-mismatch":
      entry["operational_evidence_id"] = entry["privacy_evidence_id"];
      entry["operational_evidence_hash"] = entry["privacy_evidence_hash"];
      route["operational_evidence_id"] = route["privacy_evidence_id"];
      route["operational_evidence_hash"] = route["privacy_evidence_hash"];
      rehashEntry(entry);
      rehashRoute(route);
      break;
    case "capability-unknown":
      entry["capability_ids"] = ["unknown.capability"];
      mutable(route["profile_compatibility"])["capability_ids"] = [
        "unknown.capability",
      ];
      rehashEntry(entry);
      rehashRoute(route);
      break;
    case "future-review-date":
      entry["reviewed_at"] = "2027-01-01T00:00:00.000Z";
      entry["expires_at"] = "2027-02-01T00:00:00.000Z";
      route["reviewed_at"] = "2027-01-01T00:00:00.000Z";
      route["expires_at"] = "2027-02-01T00:00:00.000Z";
      rehashEntry(entry);
      rehashRoute(route);
      break;
    case "expiry-before-review":
      entry["expires_at"] = "2026-01-01T00:00:00.000Z";
      route["expires_at"] = "2026-01-01T00:00:00.000Z";
      rehashEntry(entry);
      rehashRoute(route);
      break;
    case "missing-review":
      entry["lifecycle"] = "benchmark_pending";
      entry["reviewed_at"] = null;
      rehashEntry(entry);
      break;
    case "supersession-cycle": {
      appendVersion(modelData, routeData);
      const first = mutable(modelData.entries[0]);
      first["supersedes_entry_id"] = modelData.entries[1]!.entry_id;
      rehashEntry(first);
      break;
    }
    case "self-supersession":
      entry["supersedes_entry_id"] = entry["entry_id"];
      rehashEntry(entry);
      break;
    case "version-regression":
      appendVersion(modelData, routeData, "0.9.0");
      break;
    case "content-mutation-without-hash-change":
      entry["context_window_tokens"] = 12345;
      break;
    case "missing-route-field":
      delete route["route_hash"];
      break;
    case "malformed-model-evidence-references":
      entry["model_evidence_refs"] = { invalid: true };
      break;
    case "route-fallback-enabled":
      route["allow_fallbacks"] = true;
      rehashRoute(route);
      break;
    case "unsafe-fallback-route":
      (route["fallback_model_entry_order"] as string[]).push(
        String(entry["entry_id"]),
      );
      rehashRoute(route);
      break;
    case "unknown-model-reference":
      route["allowed_model_entry_ids"] = ["openrouter.unknown-model.v1"];
      route["preferred_model_entry_order"] = ["openrouter.unknown-model.v1"];
      rehashRoute(route);
      break;
    case "preferred-model-outside-allowlist":
      route["preferred_model_entry_order"] = ["openrouter.unknown-model.v1"];
      rehashRoute(route);
      break;
    case "incomplete-preferred-model-order":
      route["allowed_model_entry_ids"] = [
        String(entry["entry_id"]),
        "openrouter.unknown-model.v1",
      ];
      rehashRoute(route);
      break;
    case "invalid-eligibility-requirements":
      mutable(route["eligibility_requirements"])["privacy_zdr_required"] =
        false;
      rehashRoute(route);
      break;
    case "orphan-route-reference": {
      const orphan = clone(routeData.routes[0]!) as unknown as Record<
        string,
        unknown
      >;
      orphan["route_record_id"] = "openrouter.orphan.variable-route.v1";
      orphan["route_id"] = "openrouter.orphan.variable";
      orphan["model_id"] = "other/model";
      orphan["allowed_model_entry_ids"] = [String(entry["entry_id"])];
      orphan["preferred_model_entry_order"] = [String(entry["entry_id"])];
      rehashRoute(orphan);
      (routeData.routes as OpenRouterRouteRegistryRecord[]).push(
        orphan as unknown as OpenRouterRouteRegistryRecord,
      );
      break;
    }
    case "provider-order-without-allowlist":
      route["upstream_provider_order"] = ["minimax"];
      rehashRoute(route);
      break;
    case "malformed-provider-order":
      route["upstream_provider_order"] = "minimax";
      rehashRoute(route);
      break;
    case "data-collection-not-denied":
      route["data_collection"] = "allow";
      rehashRoute(route);
      break;
    case "executable-profile-reference":
      mutable(route["profile_compatibility"])["executable_profile_ids"] = [
        "normative-claims.openrouter.v1",
      ];
      rehashRoute(route);
      break;
    case "provider-secret-field":
      entry["api_key"] = "fixture";
      break;
    case "runtime-enablement-flag":
      entry["runtime_enabled"] = true;
      break;
    case "provider-metadata-leakage":
      entry["provider_metadata"] = { raw: true };
      break;
    default:
      assert.fail(`unknown invalid scenario: ${name}`);
  }
  return { models: modelData, routes: routeData, dependencies, now };
}

describe("governed OpenRouter model and route registry", () => {
  it("pins closed contract and hash-domain versions", () => {
    assert.equal(OPENROUTER_MODEL_REGISTRY_CONTRACT_VERSION, "1.0.0");
    assert.equal(OPENROUTER_ROUTE_REGISTRY_CONTRACT_VERSION, "1.0.0");
    assert.equal(
      OPENROUTER_REGISTRY_CANONICALIZATION_VERSION,
      "registry-json-v1",
    );
    assert.equal(
      OPENROUTER_ENTRY_HASH_DOMAIN,
      "vlatam-ai-lab:openrouter-model-route-entry:v1",
    );
    assert.equal(
      OPENROUTER_ROUTE_HASH_DOMAIN,
      "vlatam-ai-lab:openrouter-route-record:v1",
    );
  });

  it("validates both shipped closed schemas and deterministic hashes", () => {
    const ajv = new Ajv({ allErrors: true, strict: true });
    addFormats(ajv);
    for (const [schemaPath, fixture] of [
      ["schemas/ai-openrouter-model-registry.schema.json", models],
      ["schemas/ai-openrouter-route-registry.schema.json", routes],
    ] as const) {
      const validate = ajv.compile(
        JSON.parse(readFileSync(schemaPath, "utf8")) as object,
      );
      assert.equal(validate(fixture), true, JSON.stringify(validate.errors));
    }
    assert.deepEqual(
      validateOpenRouterRegistry(
        models,
        routes,
        defaultOpenRouterRegistryDependencies(),
        NOW,
      ),
      [],
    );
    assert.equal(
      computeOpenRouterEntryHash(models.entries[0]!),
      models.entries[0]!.entry_hash,
    );
    assert.equal(
      computeOpenRouterRouteHash(routes.routes[0]!),
      routes.routes[0]!.route_hash,
    );
  });

  it("registers both contracts with explicit fixtures and tests", () => {
    const registry = JSON.parse(
      readFileSync("schemas/schema-registry.json", "utf8"),
    ) as {
      contracts: {
        contract_name: string;
        schema_file: string;
        valid_fixture: string;
        invalid_fixtures: string[];
        test_file: string;
      }[];
    };
    const registered = registry.contracts.filter((contract) =>
      ["ai_openrouter_model_registry", "ai_openrouter_route_registry"].includes(
        contract.contract_name,
      ),
    );
    assert.deepEqual(
      registered.map((contract) => contract.contract_name),
      ["ai_openrouter_model_registry", "ai_openrouter_route_registry"],
    );
    assert.deepEqual(
      registered.map((contract) => contract.schema_file),
      [
        "schemas/ai-openrouter-model-registry.schema.json",
        "schemas/ai-openrouter-route-registry.schema.json",
      ],
    );
    assert.deepEqual(
      registered.map((contract) => contract.valid_fixture),
      [
        "config/ai-openrouter-model-registry.json",
        "config/ai-openrouter-route-registry.json",
      ],
    );
    assert.ok(
      registered.every(
        (contract) =>
          contract.invalid_fixtures.includes(
            "data/fixtures/providers/openrouter-registry-invalid-scenarios.json",
          ) &&
          contract.test_file === "tests/providers/openrouter-registry.test.ts",
      ),
    );
  });

  it("is independent of object and file ordering", () => {
    const entry = models.entries[0]!;
    const reversedObject = Object.fromEntries(
      Object.entries(entry).reverse(),
    ) as unknown as OpenRouterModelRegistryEntry;
    assert.equal(
      computeOpenRouterEntryHash(reversedObject),
      computeOpenRouterEntryHash(entry),
    );
    const modelData = clone(models);
    const routeData = clone(routes);
    appendVersion(modelData, routeData);
    const first = new OpenRouterRegistry(
      modelData,
      routeData,
      defaultOpenRouterRegistryDependencies(),
      NOW,
    );
    const second = new OpenRouterRegistry(
      { ...modelData, entries: [...modelData.entries].reverse() },
      { ...routeData, routes: [...routeData.routes].reverse() },
      defaultOpenRouterRegistryDependencies(),
      NOW,
    );
    assert.deepEqual(first.entries, second.entries);
    assert.deepEqual(first.routes, second.routes);
    assert.equal(
      canonicalizeOpenRouterRegistryJson({ b: 2, a: 1 }),
      canonicalizeOpenRouterRegistryJson({ a: 1, b: 2 }),
    );
  });

  it("resolves exact identities and versions without collapsing history", () => {
    const modelData = clone(models);
    const routeData = clone(routes);
    appendVersion(modelData, routeData);
    const registry = new OpenRouterRegistry(
      modelData,
      routeData,
      defaultOpenRouterRegistryDependencies(),
      NOW,
    );
    const first = modelData.entries[0]!;
    assert.equal(
      registry.resolveByEntryIdVersion(first.entry_id, "1.0.0")?.entry_hash,
      first.entry_hash,
    );
    assert.equal(
      registry.resolveByModelRouteVersion(
        first.model_id,
        first.route_id,
        "1.1.0",
      )?.supersedes_entry_id,
      first.entry_id,
    );
    assert.equal(
      registry.listEntryVersions(first.model_id, first.route_id).length,
      2,
    );
    assert.equal(
      registry.resolveRoute(first.route_id, "1.0.0")?.model_id,
      first.model_id,
    );
  });

  it("enforces append-only lifecycle transitions", () => {
    assert.equal(
      validateOpenRouterLifecycleTransition(
        "evidence_incomplete",
        "benchmark_pending",
      ),
      true,
    );
    assert.equal(
      validateOpenRouterLifecycleTransition("approved", "candidate"),
      false,
    );
    assert.equal(
      validateOpenRouterLifecycleTransition("retired", "approved"),
      false,
    );
  });

  it("derives expiry readiness without mutating registry files", () => {
    const entry = clone(models.entries[0]!);
    const before = JSON.stringify(entry);
    const current = evaluateOpenRouterRegistryReadiness(
      entry,
      defaultOpenRouterRegistryDependencies(),
      NOW,
    );
    assert.equal(current.lifecycle, "evidence_incomplete");
    assert.equal(current.executable, false);
    const candidate = { ...entry, lifecycle: "candidate" as const };
    const expired = evaluateOpenRouterRegistryReadiness(
      candidate,
      defaultOpenRouterRegistryDependencies(),
      new Date("2026-11-01T00:00:00.000Z"),
    );
    assert.equal(expired.lifecycle, "degraded");
    assert.ok(expired.blockers.includes("expired_evidence"));
    assert.equal(JSON.stringify(entry), before);
  });

  it("keeps route verification honest and every shipped record non-executable", () => {
    const registry = loadOpenRouterRegistry(NOW);
    assert.equal(registry.entries.length, 2);
    assert.equal(registry.routes.length, 2);
    const minimax = registry.entries.find(
      (entry) => entry.model_id === "minimax/minimax-m2.7",
    )!;
    const minimaxRoute = registry.routes.find(
      (route) => route.model_id === "minimax/minimax-m2.7",
    )!;
    assert.equal(minimax.provider_id, "openrouter");
    assert.equal(minimax.upstream_provider_id, "minimax");
    assert.equal(minimax.upstream_route_verification, "variable");
    assert.equal(minimaxRoute.route_verification_status, "variable");
    assert.deepEqual(minimaxRoute.allowed_model_entry_ids, [minimax.entry_id]);
    assert.deepEqual(minimaxRoute.preferred_model_entry_order, [
      minimax.entry_id,
    ]);
    assert.deepEqual(minimaxRoute.fallback_model_entry_order, []);
    assert.ok(
      Object.values(minimaxRoute.eligibility_requirements).every(
        (required) => required === true,
      ),
    );
    assert.ok(registry.entries.every((entry) => entry.enabled === false));
    assert.ok(registry.routes.every((route) => route.enabled === false));
    assert.ok(
      registry.routes.every(
        (route) =>
          route.profile_compatibility.executable_profile_ids.length === 0,
      ),
    );
  });

  it("keeps the adapter and the proposal-only execution profile disabled", () => {
    assert.equal(adapterConfig.enabled, false);
    assert.equal(executionProfiles.profiles.length, 5);
    assert.deepEqual(
      executionProfiles.profiles
        .filter((profile) => profile.provider_id === "openrouter")
        .map((profile) => ({
          profile_id: profile.profile_id,
          enabled: profile.enabled,
          configuration_status:
            "sandbox_controls" in profile
              ? profile.sandbox_controls.configuration_status
              : "supervised_controls" in profile
                ? profile.supervised_controls.configuration_status
                : null,
        })),
      [
        {
          profile_id: "openrouter.minimax-m2.7.normative-extraction.candidate",
          enabled: false,
          configuration_status: "proposal_only",
        },
        {
          profile_id:
            "openrouter.glm-5.2.commercial-document-extraction.candidate",
          enabled: false,
          configuration_status: "blocked_candidate",
        },
      ],
    );
  });

  it("rejects malformed registry shapes without throwing", () => {
    const malformedCases: {
      models: unknown;
      routes: unknown;
      expected: string;
    }[] = [
      {
        models: { ...clone(models), entries: [null] },
        routes,
        expected: "entry_not_an_object",
      },
      {
        models: {
          ...clone(models),
          entries: [
            {
              ...clone(models.entries[0]!),
              supported_input_modalities: null,
            },
          ],
        },
        routes,
        expected: "invalid_input_modalities",
      },
      {
        models,
        routes: {
          ...clone(routes),
          routes: [
            { ...clone(routes.routes[0]!), profile_compatibility: null },
          ],
        },
        expected: "invalid_profile_compatibility",
      },
      {
        models: { ...clone(models), entries: "invalid" },
        routes,
        expected: "empty_model_registry",
      },
    ];

    for (const malformed of malformedCases) {
      let errors: readonly string[] = [];
      assert.doesNotThrow(() => {
        errors = validateOpenRouterRegistry(
          malformed.models,
          malformed.routes,
          defaultOpenRouterRegistryDependencies(),
          NOW,
        );
      });
      assert.ok(
        errors.includes(malformed.expected),
        `expected ${malformed.expected} in ${JSON.stringify(errors)}`,
      );
    }
  });

  assert.equal(scenarios.fixture_contract_version, "1.0.0");
  for (const scenario of scenarios.scenarios) {
    it(`fails closed for ${scenario.name}`, () => {
      const fixture = invalidScenario(scenario.name);
      const errors = validateOpenRouterRegistry(
        fixture.models,
        fixture.routes,
        fixture.dependencies,
        fixture.now,
      );
      assert.ok(
        errors.includes(scenario.expected_error),
        `${scenario.name}: expected ${scenario.expected_error} in ${JSON.stringify(errors)}`,
      );
    });
  }
});

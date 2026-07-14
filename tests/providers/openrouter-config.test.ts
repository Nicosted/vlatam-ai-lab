import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import {
  OPENROUTER_ADAPTER_CONFIG_CONTRACT_VERSION,
  OPENROUTER_ROUTE_POLICY_CONTRACT_VERSION,
  OPENROUTER_SUPPORTED_USAGE_FIELDS,
  OPENROUTER_USAGE_NORMALIZATION_VERSION,
  validateOpenRouterDefaultConfig,
  validateOpenRouterRoutePolicy,
} from "../../src/providers/openrouter-config.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (
  ajv: Ajv,
) => void;
const load = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

const configFixture = load("config/ai-openrouter-adapter.json");
const routePolicyFixture = load(
  "data/fixtures/providers/openrouter-route-policy-valid.json",
);
const invalidConfigs = load(
  "data/fixtures/providers/openrouter-adapter-invalid-scenarios.json",
) as {
  scenarios: { scenario: string; expected_error: string; config: unknown }[];
};
const invalidPolicies = load(
  "data/fixtures/providers/openrouter-route-policy-invalid-scenarios.json",
) as {
  scenarios: { scenario: string; expected_error: string; policy: unknown }[];
};

const compile = (schemaPath: string) => {
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv.compile(load(schemaPath) as object);
};

describe("governed OpenRouter adapter configuration contract", () => {
  it("pins the versioned contracts", () => {
    assert.equal(OPENROUTER_ADAPTER_CONFIG_CONTRACT_VERSION, "1.0.0");
    assert.equal(OPENROUTER_ROUTE_POLICY_CONTRACT_VERSION, "1.0.0");
    assert.equal(OPENROUTER_USAGE_NORMALIZATION_VERSION, "1.0.0");
    assert.deepEqual(
      [...OPENROUTER_SUPPORTED_USAGE_FIELDS],
      [
        "prompt_tokens",
        "completion_tokens",
        "total_tokens",
        "prompt_tokens_details.cached_tokens",
        "completion_tokens_details.reasoning_tokens",
      ],
    );
  });

  it("accepts the shipped default configuration, which is disabled with zero retries and no model", () => {
    const validate = compile(
      "schemas/ai-openrouter-adapter-config.schema.json",
    );
    assert.equal(
      validate(configFixture),
      true,
      JSON.stringify(validate.errors),
    );
    assert.deepEqual(validateOpenRouterDefaultConfig(configFixture), []);
    const config = configFixture as Record<string, unknown>;
    assert.equal(config["enabled"], false);
    assert.deepEqual(config["retry_policy"], { max_retries: 0 });
    assert.equal(config["routing_policy_mode"], "exact_pinned");
    assert.equal(config["api_key_env_var"], "OPENROUTER_API_KEY");
    // Name only — never a secret value, never a URL.
    const serialized = JSON.stringify(configFixture);
    assert.ok(!serialized.includes("https://"));
    assert.ok(!/sk-or-|Bearer /.test(serialized));
    assert.ok(!("default_model" in config));
    assert.ok(!("base_url" in config));
  });

  it("rejects every invalid configuration fixture with its expected error", () => {
    const validate = compile(
      "schemas/ai-openrouter-adapter-config.schema.json",
    );
    for (const {
      scenario,
      expected_error,
      config,
    } of invalidConfigs.scenarios) {
      const errors = validateOpenRouterDefaultConfig(config);
      assert.ok(
        errors.includes(expected_error),
        `${scenario}: expected ${expected_error} in ${JSON.stringify(errors)}`,
      );
      if (expected_error !== "enabled_by_default") {
        assert.equal(
          validate(config),
          false,
          `${scenario}: JSON schema unexpectedly accepted the fixture`,
        );
      }
    }
  });

  it("accepts the synthetic valid route policy fixture", () => {
    const validate = compile("schemas/ai-openrouter-route-policy.schema.json");
    assert.equal(
      validate(routePolicyFixture),
      true,
      JSON.stringify(validate.errors),
    );
    assert.deepEqual(validateOpenRouterRoutePolicy(routePolicyFixture), []);
  });

  it("rejects every invalid route policy fixture with its expected error", () => {
    const validate = compile("schemas/ai-openrouter-route-policy.schema.json");
    // Cross-field consistency lives in the TypeScript validator; the
    // JSON schema enforces the structural remainder.
    const tsOnly = new Set(["provider_order_outside_allowlist"]);
    for (const {
      scenario,
      expected_error,
      policy,
    } of invalidPolicies.scenarios) {
      const errors = validateOpenRouterRoutePolicy(policy);
      assert.ok(
        errors.includes(expected_error),
        `${scenario}: expected ${expected_error} in ${JSON.stringify(errors)}`,
      );
      if (tsOnly.has(scenario)) continue;
      assert.equal(
        validate(policy),
        false,
        `${scenario}: JSON schema unexpectedly accepted the fixture`,
      );
    }
  });

  it("rejects openrouter/auto and every openrouter/* alias at the contract level", () => {
    const base = routePolicyFixture as Record<string, unknown>;
    for (const model of ["openrouter/auto", "openrouter/anything"]) {
      const errors = validateOpenRouterRoutePolicy({
        ...base,
        model_id: model,
      });
      assert.ok(errors.includes("auto_routing_forbidden"), model);
    }
  });

  it("rejects a route policy whose provider order lacks an allowlist", () => {
    const rest = { ...(routePolicyFixture as Record<string, unknown>) };
    delete rest["allowed_upstream_providers"];
    const errors = validateOpenRouterRoutePolicy({
      ...rest,
      provider_order: ["minimax"],
    });
    assert.ok(errors.includes("provider_order_without_allowlist"));
  });
});

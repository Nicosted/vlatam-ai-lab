import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type {
  ExecutionProfile,
  ExecutionProfileId,
} from "../../src/execution/execution-profile.js";
import {
  OpenRouterAdapter,
  OpenRouterAdapterError,
  createOpenRouterFetchTransport,
  mapOpenRouterUsage,
  type OpenRouterTransport,
  type OpenRouterTransportRequest,
  type OpenRouterTransportResponse,
} from "../../src/providers/openrouter-adapter.js";
import type {
  OpenRouterAdapterConfig,
  OpenRouterRoutePolicy,
} from "../../src/providers/openrouter-config.js";
import type {
  ProviderExecutionContext,
  ProviderExecutionRequest,
} from "../../src/providers/provider-adapter.js";
import { LIVE_UNKNOWN_PRIVACY } from "../helpers/privacy.js";

const load = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;

const defaultConfig = load<OpenRouterAdapterConfig>(
  "config/ai-openrouter-adapter.json",
);
const routePolicy = load<OpenRouterRoutePolicy>(
  "data/fixtures/providers/openrouter-route-policy-valid.json",
);
const responseScenarios = load<{
  leak_marker: string;
  scenarios: {
    scenario: string;
    expected_adapter_code: string;
    response: {
      status: number;
      body_raw?: string;
      body_json?: Record<string, unknown>;
    };
  }[];
}>("data/fixtures/providers/openrouter-response-invalid-scenarios.json");

/** Enabling in a unit test is synthetic and uses no environment access. */
const enabledConfig: OpenRouterAdapterConfig = {
  ...defaultConfig,
  enabled: true,
};
const syntheticSecret = "synthetic-unit-test-placeholder";

const profile: ExecutionProfile = {
  profile_id: routePolicy.profile_id as ExecutionProfileId,
  capability_id: "evidence.extraction.normative_claims" as never,
  provider_id: "openrouter" as never,
  model_id: routePolicy.model_id as never,
  mode: "live",
  lifecycle_status: "candidate",
  enabled: true,
  contract_version: routePolicy.profile_contract_version,
  configuration: {
    temperature: 0,
    max_output_tokens: 256,
    timeout_ms: 5000,
    response_format: "json",
  },
  eligibility: {
    privacy_compatibility: "declared_not_enforced",
    budget_class: "unclassified",
    evaluation_status: "not_evaluated",
  },
  privacy: LIVE_UNKNOWN_PRIVACY,
};

const request: ProviderExecutionRequest = {
  request_id: "request-openrouter-unit",
  structured_output: true,
  messages: [
    { role: "system", content: "extract" },
    { role: "user", content: "safe synthetic excerpt" },
  ],
};

function context(
  overrides: Partial<ProviderExecutionContext> = {},
): ProviderExecutionContext {
  return {
    execution_id: "execution-openrouter-unit",
    signal: new AbortController().signal,
    timeout_ms: 5000,
    pricing_contract: {
      pricing_id: routePolicy.pricing_id,
      pricing_contract_version: routePolicy.pricing_contract_version,
    },
    ...overrides,
  };
}

const successBody = {
  id: "gen-fixture",
  model: routePolicy.model_id,
  provider: "minimax",
  system_fingerprint: "fixture-fingerprint",
  choices: [{ message: { content: '{"claims":[]}' }, finish_reason: "stop" }],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 5,
    total_tokens: 15,
    prompt_tokens_details: { cached_tokens: 2 },
    completion_tokens_details: { reasoning_tokens: 1 },
  },
};

interface MockTransport {
  transport: OpenRouterTransport;
  calls: () => number;
  seen: OpenRouterTransportRequest[];
}
function mockTransport(
  response: OpenRouterTransportResponse | (() => never) = {
    status: 200,
    body: JSON.stringify(successBody),
  },
): MockTransport {
  let calls = 0;
  const seen: OpenRouterTransportRequest[] = [];
  return {
    calls: () => calls,
    seen,
    transport: async (transportRequest) => {
      calls += 1;
      seen.push(transportRequest);
      if (typeof response === "function") return response();
      return response;
    },
  };
}

function adapter(
  overrides: {
    config?: OpenRouterAdapterConfig;
    policies?: readonly OpenRouterRoutePolicy[];
    secret?: string | undefined;
    secretCalls?: { count: number };
    transport?: MockTransport;
    validate?: (value: unknown) => boolean;
  } = {},
): { subject: OpenRouterAdapter; transport: MockTransport } {
  const transport = overrides.transport ?? mockTransport();
  return {
    subject: new OpenRouterAdapter({
      config: overrides.config ?? enabledConfig,
      route_policies: overrides.policies ?? [routePolicy],
      transport: transport.transport,
      secret_provider: {
        resolve: async () => {
          if (overrides.secretCalls) overrides.secretCalls.count += 1;
          return overrides.secret === undefined
            ? syntheticSecret
            : overrides.secret;
        },
      },
      ...(overrides.validate === undefined
        ? {}
        : { validate_structured_output: overrides.validate }),
    }),
    transport,
  };
}

function adapterCode(error: unknown): string | undefined {
  return error instanceof OpenRouterAdapterError
    ? error.adapter_code
    : undefined;
}

describe("governed OpenRouter transport adapter", () => {
  it("is disabled by default (shipped config) with zero transport calls", async () => {
    const { subject, transport } = adapter({ config: defaultConfig });
    const result = await subject.execute(request, profile, context());
    assert.equal(result.status, "blocked");
    assert.equal(adapterCode(result.error), "ADAPTER_DISABLED");
    assert.equal(result.error?.code, "LIVE_EXECUTION_DISABLED");
    assert.equal(transport.calls(), 0);
    assert.equal("content" in result, false);
  });

  it("does not resolve the secret while the adapter is disabled", async () => {
    const secretCalls = { count: 0 };
    const { subject, transport } = adapter({
      config: defaultConfig,
      secretCalls,
    });
    const result = await subject.execute(request, profile, context());
    assert.equal(adapterCode(result.error), "ADAPTER_DISABLED");
    assert.equal(secretCalls.count, 0);
    assert.equal(transport.calls(), 0);
  });

  it("fails closed without a secret and never calls transport", async () => {
    const { subject, transport } = adapter({
      secret: " ",
    });
    const result = await subject.execute(request, profile, context());
    assert.equal(result.status, "blocked");
    assert.equal(adapterCode(result.error), "SECRET_MISSING");
    assert.equal(result.error?.code, "CREDENTIALS_UNAVAILABLE");
    assert.equal(transport.calls(), 0);
  });

  it("fails closed with an invalid adapter config and zero transport calls", async () => {
    const { subject, transport } = adapter({
      config: { ...enabledConfig, unknown_field: 1 } as never,
    });
    const result = await subject.execute(request, profile, context());
    assert.equal(adapterCode(result.error), "ADAPTER_CONFIG_INVALID");
    assert.equal(transport.calls(), 0);
  });

  it("fails closed when no exact route policy exists for the profile", async () => {
    const { subject, transport } = adapter({ policies: [] });
    const result = await subject.execute(request, profile, context());
    assert.equal(result.status, "blocked");
    assert.equal(adapterCode(result.error), "ROUTE_POLICY_INVALID");
    assert.equal(transport.calls(), 0);
  });

  it("fails closed on profile version mismatch against the route policy", async () => {
    const { subject, transport } = adapter();
    const result = await subject.execute(
      request,
      { ...profile, contract_version: "9.0.0" },
      context(),
    );
    assert.equal(adapterCode(result.error), "ROUTE_POLICY_INVALID");
    assert.equal(transport.calls(), 0);
  });

  it("blocks model mismatch before transport", async () => {
    const { subject, transport } = adapter();
    const result = await subject.execute(
      request,
      { ...profile, model_id: "someone-else/other-model" as never },
      context(),
    );
    assert.equal(result.status, "blocked");
    assert.equal(adapterCode(result.error), "MODEL_MISMATCH");
    assert.equal(result.error?.code, "PROFILE_CAPABILITY_MISMATCH");
    assert.equal(transport.calls(), 0);
  });

  it("blocks openrouter/auto and every openrouter/* alias before transport", async () => {
    for (const model of ["openrouter/auto", "openrouter/some-alias"]) {
      const { subject, transport } = adapter();
      const result = await subject.execute(
        request,
        { ...profile, model_id: model as never },
        context(),
      );
      assert.equal(result.status, "blocked");
      assert.equal(adapterCode(result.error), "AUTO_ROUTING_FORBIDDEN");
      assert.equal(transport.calls(), 0);
    }
  });

  it("blocks an incompatible or absent pricing contract identity before transport", async () => {
    const { subject, transport } = adapter();
    for (const pricing of [
      undefined,
      { pricing_id: "other.pricing.v9", pricing_contract_version: "1.0.0" },
      {
        pricing_id: routePolicy.pricing_id,
        pricing_contract_version: "9.9.9",
      },
    ]) {
      const result = await subject.execute(
        request,
        profile,
        context({ pricing_contract: pricing }),
      );
      assert.equal(adapterCode(result.error), "PRICING_CONTRACT_INCOMPATIBLE");
      assert.equal(result.error?.code, "PRICING_UNVERIFIED");
      assert.equal(transport.calls(), 0);
    }
  });

  it("blocks forbidden provider/model overrides in the request payload", async () => {
    const { subject, transport } = adapter();
    const result = await subject.execute(
      { ...request, model: "sneaky/override" } as never,
      profile,
      context(),
    );
    assert.equal(adapterCode(result.error), "REQUEST_OVERRIDE_FORBIDDEN");
    assert.equal(transport.calls(), 0);
  });

  it("blocks credential-shaped fields in the domain request", async () => {
    const { subject, transport } = adapter();
    const result = await subject.execute(
      { ...request, api_key: "leaked" } as never,
      profile,
      context(),
    );
    assert.equal(adapterCode(result.error), "REQUEST_CREDENTIAL_SHAPED");
    assert.equal(transport.calls(), 0);
  });

  it("enforces the request byte limit before transport", async () => {
    const { subject, transport } = adapter({
      config: { ...enabledConfig, max_request_body_bytes: 32 },
    });
    const result = await subject.execute(request, profile, context());
    assert.equal(adapterCode(result.error), "REQUEST_TOO_LARGE");
    assert.equal(transport.calls(), 0);
  });

  it("rejects an out-of-bound timeout before transport", async () => {
    const { subject, transport } = adapter();
    const result = await subject.execute(
      request,
      profile,
      context({ timeout_ms: enabledConfig.overall_timeout_ms + 1 }),
    );
    assert.equal(adapterCode(result.error), "TIMEOUT_SIGNAL_INVALID");
    assert.equal(transport.calls(), 0);
  });

  it("invokes transport exactly once with exact pinned routing and minimal headers", async () => {
    const { subject, transport } = adapter();
    const result = await subject.execute(request, profile, context());
    assert.equal(result.status, "succeeded");
    assert.equal(transport.calls(), 1);
    const sent = transport.seen[0]!;
    assert.equal(sent.url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(sent.method, "POST");
    assert.deepEqual(Object.keys(sent.headers).sort(), [
      "authorization",
      "content-type",
    ]);
    const body = JSON.parse(sent.body) as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), [
      "max_tokens",
      "messages",
      "model",
      "provider",
      "response_format",
      "temperature",
    ]);
    assert.equal(body["model"], routePolicy.model_id);
    assert.deepEqual(body["response_format"], { type: "json_object" });
    assert.deepEqual(body["provider"], {
      allow_fallbacks: false,
      data_collection: "deny",
      require_parameters: true,
      zdr: true,
      only: ["minimax"],
      order: ["minimax"],
    });
    // No correlation ids, no internal metadata, no secret in the body.
    assert.doesNotMatch(sent.body, /execution-openrouter-unit/);
    assert.doesNotMatch(sent.body, /synthetic-unit-test-placeholder/);
  });

  it("returns exact category-preserving usage and no provider metadata", async () => {
    const { subject } = adapter();
    const result = await subject.execute(request, profile, context());
    assert.deepEqual(Object.keys(result).sort(), [
      "content",
      "duration_ms",
      "finish_reason",
      "request_id",
      "status",
      "usage",
    ]);
    assert.deepEqual(result.usage, {
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
      cached_input_tokens: 2,
      reasoning_tokens: 1,
      source: "provider_reported",
    });
    // cache_write has no recognized OpenRouter field: unavailable, not 0.
    assert.equal(result.usage?.cache_write_input_tokens, undefined);
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(
      serialized,
      /gen-fixture|system_fingerprint|fixture-fingerprint/,
    );
    assert.doesNotMatch(serialized, /"provider"/);
    assert.doesNotMatch(serialized, /synthetic-unit-test-placeholder/);
  });

  it("keeps unknown usage fields unknown and missing usage unavailable", async () => {
    const withUnknown = mockTransport({
      status: 200,
      body: JSON.stringify({
        ...successBody,
        usage: {
          prompt_tokens: 3,
          completion_tokens: 4,
          total_tokens: 7,
          speculative_tokens: 99,
        },
      }),
    });
    const { subject } = adapter({ transport: withUnknown });
    const result = await subject.execute(request, profile, context());
    assert.deepEqual(result.usage, {
      input_tokens: 3,
      output_tokens: 4,
      total_tokens: 7,
      cached_input_tokens: undefined,
      reasoning_tokens: undefined,
      source: "provider_reported",
    });
    assert.ok(!JSON.stringify(result).includes("speculative_tokens"));

    const withoutUsage = mockTransport({
      status: 200,
      body: JSON.stringify({ ...successBody, usage: undefined }),
    });
    const missing = await adapter({ transport: withoutUsage }).subject.execute(
      request,
      profile,
      context(),
    );
    assert.equal(missing.status, "failed");
    assert.equal(adapterCode(missing.error), "USAGE_UNAVAILABLE");
  });

  it("never derives token counts from text length", () => {
    assert.equal(mapOpenRouterUsage(undefined), undefined);
    assert.equal(mapOpenRouterUsage(null), undefined);
    // Unknown-only usage stays unavailable instead of being guessed.
    assert.equal(mapOpenRouterUsage({ speculative_tokens: 12 }), undefined);
    assert.throws(
      () => mapOpenRouterUsage({ prompt_tokens: 1.5 }),
      (error: unknown) => adapterCode(error) === "USAGE_MALFORMED",
    );
  });

  it("enforces the response byte limit", async () => {
    const { subject, transport } = adapter({
      config: { ...enabledConfig, max_response_body_bytes: 16 },
    });
    const result = await subject.execute(request, profile, context());
    assert.equal(adapterCode(result.error), "RESPONSE_TOO_LARGE");
    assert.equal(transport.calls(), 1);
  });

  it("never retries a failed transport and sanitizes provider errors", async () => {
    const failing = mockTransport({
      status: 502,
      body: '{"error":{"message":"raw upstream detail"}}',
    });
    const { subject } = adapter({ transport: failing });
    const result = await subject.execute(request, profile, context());
    assert.equal(result.status, "failed");
    assert.equal(adapterCode(result.error), "PROVIDER_UNAVAILABLE");
    assert.equal(result.error?.code, "PROVIDER_UNAVAILABLE");
    assert.equal(failing.calls(), 1);
    assert.doesNotMatch(
      JSON.stringify({ ...result, error: result.error?.message }),
      /raw upstream detail/,
    );
  });

  it("maps HTTP 429 to the existing rate-limit contract without retry", async () => {
    const limited = mockTransport({ status: 429, body: "slow down" });
    const { subject } = adapter({ transport: limited });
    const result = await subject.execute(request, profile, context());
    assert.equal(result.error?.code, "PROVIDER_RATE_LIMITED");
    assert.equal(limited.calls(), 1);
  });

  it("maps authentication failure without leaking the provider body", async () => {
    const denied = mockTransport({ status: 401, body: "secret rejected" });
    const result = await adapter({ transport: denied }).subject.execute(
      request,
      profile,
      context(),
    );
    assert.equal(adapterCode(result.error), "AUTHENTICATION_FAILURE");
    assert.equal(denied.calls(), 1);
    assert.doesNotMatch(JSON.stringify(result), /secret rejected/);
  });

  it("applies the governed structured-output validator", async () => {
    const result = await adapter({ validate: () => false }).subject.execute(
      request,
      profile,
      context(),
    );
    assert.equal(
      adapterCode(result.error),
      "STRUCTURED_OUTPUT_VALIDATION_FAILED",
    );
  });

  it("requires exact Fireworks and GLM response identities", async () => {
    const fireworksPolicy: OpenRouterRoutePolicy = {
      ...routePolicy,
      model_id: "z-ai/glm-5.2",
      allowed_upstream_providers: ["fireworks"],
      provider_order: ["fireworks"],
      endpoint_tag: "fireworks",
      expected_response_provider_identity: "Fireworks",
    };
    const fireworksProfile: ExecutionProfile = {
      ...profile,
      model_id: "z-ai/glm-5.2" as never,
    };
    const response = (providerValue: unknown, modelValue: unknown) =>
      mockTransport({
        status: 200,
        body: JSON.stringify({
          ...successBody,
          provider: providerValue,
          model: modelValue,
        }),
      });
    for (const [providerValue, modelValue, expected] of [
      ["Fireworks", "z-ai/glm-5.2", undefined],
      ["Z.AI", "z-ai/glm-5.2", "PROVIDER_SUBSTITUTION_DETECTED"],
      ["Cloudflare", "z-ai/glm-5.2", "PROVIDER_SUBSTITUTION_DETECTED"],
      ["fireworks/fast", "z-ai/glm-5.2", "PROVIDER_SUBSTITUTION_DETECTED"],
      [undefined, "z-ai/glm-5.2", "PROVIDER_SUBSTITUTION_DETECTED"],
      ["Fireworks", undefined, "ROUTE_VERIFICATION_UNAVAILABLE"],
      ["Fireworks", "z-ai/glm-5.1", "MODEL_SUBSTITUTION_DETECTED"],
    ] as const) {
      const transport = response(providerValue, modelValue);
      const result = await adapter({
        policies: [fireworksPolicy],
        transport,
      }).subject.execute(request, fireworksProfile, context());
      assert.equal(adapterCode(result.error), expected);
      assert.equal(transport.calls(), 1);
    }
  });

  it("distinguishes abort before transport (zero calls) from abort during transport", async () => {
    const aborted = new AbortController();
    aborted.abort();
    const before = adapter();
    const beforeResult = await before.subject.execute(
      request,
      profile,
      context({ signal: aborted.signal }),
    );
    assert.equal(adapterCode(beforeResult.error), "TRANSPORT_ABORTED");
    assert.equal(beforeResult.error?.code, "EXECUTION_ABORTED");
    assert.equal(before.transport.calls(), 0);

    const during = new AbortController();
    let seenSignal: AbortSignal | undefined;
    const hanging: MockTransport = {
      calls: () => (seenSignal === undefined ? 0 : 1),
      seen: [],
      transport: (transportRequest) =>
        new Promise((_resolve, reject) => {
          seenSignal = transportRequest.signal;
          transportRequest.signal.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        }),
    };
    const { subject } = adapter({ transport: hanging });
    const pending = subject.execute(
      request,
      profile,
      context({ signal: during.signal }),
    );
    during.abort();
    const duringResult = await pending;
    assert.equal(adapterCode(duringResult.error), "TRANSPORT_ABORTED");
    assert.equal(duringResult.error?.code, "EXECUTION_ABORTED");
    // An abort during asynchronous final-boundary secret resolution still
    // blocks before transport; no provider work occurs.
    assert.equal(seenSignal, undefined);
  });

  it("fails closed on every invalid response fixture without leaking provider text", async () => {
    for (const scenario of responseScenarios.scenarios) {
      const body =
        scenario.response.body_raw ??
        JSON.stringify(scenario.response.body_json);
      const transport = mockTransport({
        status: scenario.response.status,
        body,
      });
      const { subject } = adapter({ transport });
      const result = await subject.execute(request, profile, context());
      assert.notEqual(result.status, "succeeded", scenario.scenario);
      assert.equal(
        adapterCode(result.error),
        scenario.expected_adapter_code,
        scenario.scenario,
      );
      assert.equal(transport.calls(), 1, scenario.scenario);
      const serialized = JSON.stringify({
        ...result,
        error: { code: result.error?.code, message: result.error?.message },
      });
      assert.doesNotMatch(
        serialized,
        new RegExp(responseScenarios.leak_marker),
        scenario.scenario,
      );
      assert.equal("content" in result, false, scenario.scenario);
    }
  });

  it("exposes no raw headers even when a transport reports extras", async () => {
    const withHeaders = mockTransport({
      status: 200,
      body: JSON.stringify(successBody),
      // A transport reporting extra fields must not surface them.
      headers: { "x-provider-secret-header": "leak" },
    } as never);
    const { subject } = adapter({ transport: withHeaders });
    const result = await subject.execute(request, profile, context());
    assert.equal(result.status, "succeeded");
    assert.doesNotMatch(
      JSON.stringify(result),
      /x-provider-secret-header|leak/,
    );
  });

  it("ships a production transport factory but never invokes it in this PR", () => {
    assert.equal(typeof createOpenRouterFetchTransport(), "function");
  });
});

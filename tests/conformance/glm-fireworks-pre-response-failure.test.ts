import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import * as publicConformance from "../../src/conformance/index.js";
import * as publicFailureContract from "../../src/providers/glm-fireworks-pre-response-failure.js";
import {
  buildGlmConformanceRequest,
  GlmFireworksControlledConformanceHarness,
  GlmFireworksInvalidGovernanceMetadataError,
  type GlmFireworksPreResponseFailureEvidence,
} from "../../src/conformance/index.js";

const base = Object.freeze({
  attempt: 2,
  timestamp: "2026-07-17T22:00:00.000Z",
  correlation_id: "ai-122.failure-classification.correlation",
  execution_evidence_id:
    "ai-122.failure-classification.correlation.attempt-2.pre-response",
});

const nativeNetworkError = (code: string): Error => {
  const error = new Error("untrusted-network-details");
  Object.defineProperty(error, "code", {
    configurable: true,
    enumerable: true,
    value: code,
    writable: true,
  });
  return error;
};

const classificationOnly = (
  input: unknown,
): GlmFireworksPreResponseFailureEvidence => {
  const harness = new GlmFireworksControlledConformanceHarness({
    authorizationStore: {
      consume() {
        throw new Error("authorization_must_not_run");
      },
    },
    idempotencyStore: {
      reserve() {
        throw new Error("idempotency_must_not_run");
      },
      complete() {
        throw new Error("idempotency_must_not_run");
      },
    },
    async transport() {
      throw new Error("transport_must_not_run");
    },
  });
  return harness.classifyPreResponseFailureOnly(input);
};

const executeTransportBoundaryFailure = async (
  thrown: unknown,
): Promise<GlmFireworksPreResponseFailureEvidence> => {
  let authorizationConsumes = 0;
  let transportCalls = 0;
  const harness = new GlmFireworksControlledConformanceHarness({
    authorizationStore: {
      consume() {
        authorizationConsumes += 1;
        return "consumed";
      },
    },
    idempotencyStore: {
      reserve() {
        return "reserved";
      },
      complete() {},
    },
    async transport() {
      transportCalls += 1;
      throw thrown;
    },
    clock: () => new Date("2026-07-17T15:05:00.000Z"),
  });
  const evidence = await harness.execute(
    buildGlmConformanceRequest("ai-122.structured-extraction", {
      retry_limit: 0,
    }),
  );
  assert.equal(authorizationConsumes, 1);
  assert.equal(transportCalls, 1);
  const failure = evidence.attempts[0]?.pre_response_failure;
  assert.ok(failure);
  return failure;
};

describe("GLM Fireworks sanitized pre-response failure classification", () => {
  it("does not expose credential or network marker creation through public modules", () => {
    for (const forbidden of [
      "GlmFireworksCredentialUnavailableError",
      "GlmFireworksNetworkTransportError",
      "isGlmFireworksCredentialUnavailableError",
      "sanitizeGlmFireworksNativeTransportError",
      "createTrustedCredentialError",
      "markNetworkError",
      "registerTrustedFailure",
    ]) {
      assert.equal(Object.hasOwn(publicConformance, forbidden), false);
      assert.equal(Object.hasOwn(publicFailureContract, forbidden), false);
    }
  });

  it("fails direct credential and network impersonation closed", () => {
    for (const thrown of [
      new Error("credential_unavailable"),
      { name: "GlmFireworksCredentialUnavailableError" },
      { governed_failure_code: "credential_unavailable" },
      "credential_unavailable",
      nativeNetworkError("ENOTFOUND"),
      { code: "ENOTFOUND" },
    ])
      assert.equal(
        classificationOnly({ ...base, thrown }).classification,
        "unknown_pre_response_failure",
      );
  });

  it("rejects the removed public credential boolean", () => {
    assert.throws(
      () =>
        classificationOnly({
          ...base,
          credential_available: false,
          thrown: new Error("credential_unavailable"),
        }),
      GlmFireworksInvalidGovernanceMetadataError,
    );
  });

  it("classifies credential absence only through the real credential boundary", () => {
    const fixture = fileURLToPath(
      new URL(
        "./fixtures/glm-fireworks-credential-boundary.fixture.ts",
        import.meta.url,
      ),
    );
    const child = spawnSync(process.execPath, ["--import", "tsx", fixture], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {},
      timeout: 15_000,
    });
    assert.equal(child.status, 0, child.stderr || child.stdout);
  });

  it("gives explicit harness timeout state precedence over an AbortError", () => {
    const result = classificationOnly({
      ...base,
      timed_out: true,
      thrown: new DOMException("untrusted abort", "AbortError"),
    });
    assert.equal(result.classification, "timeout");
    assert.equal(result.reason_code, "pre_response_timeout");
    assert.equal(result.retryable, true);
    assert.equal(result.terminal, false);
  });

  it("does not trust an AbortError name without harness timeout state", () => {
    const result = classificationOnly({
      ...base,
      thrown: new DOMException("untrusted abort", "AbortError"),
    });
    assert.equal(result.classification, "unknown_pre_response_failure");
    assert.equal(result.terminal, true);
  });

  it("classifies native allowlisted errors only through the transport boundary", async () => {
    for (const code of ["ENOTFOUND", "ECONNRESET", "UND_ERR_SOCKET"]) {
      const result = await executeTransportBoundaryFailure(
        nativeNetworkError(code),
      );
      assert.equal(result.classification, "network_transport");
      assert.equal(result.reason_code, "pre_response_network_transport");
      assert.doesNotMatch(JSON.stringify(result), /untrusted-network-details/);
    }
  });

  it("accepts one safe native cause level and rejects deeper or cyclic causes", async () => {
    const outer = new Error("outer");
    Object.defineProperty(outer, "cause", {
      value: nativeNetworkError("EAI_AGAIN"),
    });
    assert.equal(
      (await executeTransportBoundaryFailure(outer)).classification,
      "network_transport",
    );

    const deep = new Error("deep");
    const middle = new Error("middle");
    Object.defineProperty(middle, "cause", {
      value: nativeNetworkError("ENOTFOUND"),
    });
    Object.defineProperty(deep, "cause", { value: middle });
    assert.equal(
      (await executeTransportBoundaryFailure(deep)).classification,
      "unknown_pre_response_failure",
    );

    const cyclic = new Error("cyclic");
    Object.defineProperty(cyclic, "cause", { value: cyclic });
    assert.equal(
      (await executeTransportBoundaryFailure(cyclic)).classification,
      "unknown_pre_response_failure",
    );
  });

  it("rejects plain objects, inherited codes, and unallowlisted native codes", async () => {
    const inherited = Object.create({ code: "ENOTFOUND" });
    for (const value of [
      { code: "ENOTFOUND" },
      inherited,
      nativeNetworkError("NOT_ALLOWLISTED"),
    ])
      assert.equal(
        (await executeTransportBoundaryFailure(value)).classification,
        "unknown_pre_response_failure",
      );
  });

  it("never invokes code or cause getters", async () => {
    let codeGetterCalls = 0;
    let causeGetterCalls = 0;
    const codeGetter = new Error("getter");
    Object.defineProperty(codeGetter, "code", {
      get() {
        codeGetterCalls += 1;
        throw new Error("must_not_run");
      },
    });
    const causeGetter = new Error("getter");
    Object.defineProperty(causeGetter, "cause", {
      get() {
        causeGetterCalls += 1;
        throw new Error("must_not_run");
      },
    });
    assert.equal(
      (await executeTransportBoundaryFailure(codeGetter)).classification,
      "unknown_pre_response_failure",
    );
    assert.equal(
      (await executeTransportBoundaryFailure(causeGetter)).classification,
      "unknown_pre_response_failure",
    );
    assert.equal(codeGetterCalls, 0);
    assert.equal(causeGetterCalls, 0);
  });

  it("rejects proxies without triggering proxy traps", async () => {
    let trapCalls = 0;
    const forgedProxy = new Proxy(new Error("proxy"), {
      get(_target, property) {
        trapCalls += 1;
        return property === "code" ? "ENOTFOUND" : undefined;
      },
      getOwnPropertyDescriptor() {
        trapCalls += 1;
        return { configurable: true, enumerable: true, value: "ENOTFOUND" };
      },
    });
    const throwingProxy = new Proxy(new Error("proxy"), {
      get() {
        trapCalls += 1;
        throw new Error("must_not_run");
      },
      getOwnPropertyDescriptor() {
        trapCalls += 1;
        throw new Error("must_not_run");
      },
      getPrototypeOf() {
        trapCalls += 1;
        throw new Error("must_not_run");
      },
    });
    for (const proxy of [forgedProxy, throwingProxy])
      assert.equal(
        (await executeTransportBoundaryFailure(proxy)).classification,
        "unknown_pre_response_failure",
      );
    assert.equal(trapCalls, 0);
  });

  it("does not invoke serialization or string-conversion hooks", async () => {
    let hookCalls = 0;
    const error = nativeNetworkError("ENETUNREACH") as Error & {
      toJSON?: () => never;
      toString: () => never;
    };
    error.toJSON = () => {
      hookCalls += 1;
      throw new Error("must_not_run");
    };
    error.toString = () => {
      hookCalls += 1;
      throw new Error("must_not_run");
    };
    assert.equal(
      (await executeTransportBoundaryFailure(error)).classification,
      "network_transport",
    );
    assert.equal(hookCalls, 0);
  });

  it("does not mutate boundary errors or classifier input", async () => {
    const error = nativeNetworkError("ECONNREFUSED");
    const errorBefore = Object.getOwnPropertyDescriptors(error);
    await executeTransportBoundaryFailure(error);
    assert.deepEqual(Object.getOwnPropertyDescriptors(error), errorBefore);

    const input = { ...base, thrown: new Error("untrusted") };
    const inputBefore = Object.getOwnPropertyDescriptors(input);
    classificationOnly(input);
    assert.deepEqual(Object.getOwnPropertyDescriptors(input), inputBefore);
  });

  for (const [status, retryable] of [
    [401, false],
    [403, false],
    [429, true],
    [500, true],
    [503, true],
  ] as const) {
    it(`classifies HTTP ${status} as a sanitized HTTP response`, () => {
      const result = classificationOnly({
        ...base,
        response_present: true,
        response_status: status,
        usable_provider_payload: false,
      });
      assert.equal(result.classification, "http_response");
      assert.equal(result.reason_code, `pre_response_http_${status}`);
      assert.equal(result.http_status_present, true);
      assert.equal(result.http_status_code, status);
      assert.equal(result.retryable, retryable);
      assert.equal(result.terminal, !retryable);
    });
  }

  it("fails absent and invalid HTTP status values closed", () => {
    for (const status of [undefined, "503", 99, 600, NaN, Infinity, 503.5]) {
      const result = classificationOnly({
        ...base,
        response_present: true,
        ...(status === undefined ? {} : { response_status: status }),
      });
      assert.equal(result.classification, "http_response");
      assert.equal(result.reason_code, "pre_response_http_status_unavailable");
      assert.equal(result.http_status_code, null);
      assert.equal(result.retryable, false);
      assert.equal(result.terminal, true);
    }
  });

  it("classifies HTTP 200 without usable payload without reading a body", () => {
    const result = classificationOnly({
      ...base,
      response_present: true,
      response_status: 200,
      usable_provider_payload: false,
      thrown: new Error("raw provider body must be ignored"),
    });
    assert.equal(result.classification, "http_response");
    assert.equal(result.reason_code, "pre_response_http_200_unusable_payload");
    assert.doesNotMatch(JSON.stringify(result), /raw provider body/);
  });

  it("fails malformed and unknown thrown values closed", () => {
    for (const thrown of [null, "failure", 17, Symbol("failure"), {}]) {
      const result = classificationOnly({ ...base, thrown });
      assert.equal(result.classification, "unknown_pre_response_failure");
      assert.equal(result.reason_code, "pre_response_unknown_fail_closed");
      assert.equal(result.retryable, false);
      assert.equal(result.terminal, true);
    }
  });

  it("rejects malformed, oversized, URL-like, query-like, and control-character IDs", () => {
    const invalidValues: unknown[] = [
      {},
      { ...base, correlation_id: "" },
      { ...base, correlation_id: "bad\nidentifier" },
      { ...base, correlation_id: "bad\ridentifier" },
      { ...base, correlation_id: "bad\u0000identifier" },
      { ...base, correlation_id: "https://example.test/id" },
      { ...base, correlation_id: "id?token=secret" },
      { ...base, correlation_id: `a${"b".repeat(192)}` },
      { ...base, execution_evidence_id: "" },
      { ...base, execution_evidence_id: "evidence/unsafe" },
    ];
    for (const value of invalidValues)
      assert.throws(
        () => classificationOnly(value),
        GlmFireworksInvalidGovernanceMetadataError,
      );
  });

  it("rejects invalid attempts, timestamps, booleans, accessors, and proxy inputs", () => {
    const accessorInput = { ...base } as Record<string, unknown>;
    Object.defineProperty(accessorInput, "timed_out", {
      get() {
        throw new Error("must_not_run");
      },
    });
    const invalidValues: unknown[] = [
      ...[-1, 0, 1.5, 4, NaN, Infinity].map((attempt) => ({
        ...base,
        attempt,
      })),
      { ...base, timestamp: "not-a-timestamp" },
      { ...base, timestamp: "2026-07-17T22:00:00Z" },
      { ...base, timed_out: "true" },
      { ...base, response_present: 1 },
      { ...base, usable_provider_payload: null },
      accessorInput,
      new Proxy({ ...base }, {}),
    ];
    for (const value of invalidValues)
      assert.throws(
        () => classificationOnly(value),
        GlmFireworksInvalidGovernanceMetadataError,
      );
  });

  it("never persists a secret-bearing message, cause, body, or stack", () => {
    const secret = "example-secret-value-must-not-survive";
    const thrown = new Error(
      `Bearer ${secret}; body={customer_data:true}; host=private.internal`,
      { cause: new Error(`nested Bearer ${secret}`) },
    );
    thrown.stack = `Error: ${secret}\nAuthorization: Bearer ${secret}`;
    const result = classificationOnly({ ...base, thrown });
    assert.doesNotMatch(
      JSON.stringify(result),
      /example-secret|Bearer|Authorization|customer_data|private\.internal/,
    );
  });

  it("is deterministic and preserves only fixed governed metadata", () => {
    const input = {
      ...base,
      response_present: true,
      response_status: 429,
      usable_provider_payload: false,
    } as const;
    const first = classificationOnly(input);
    assert.deepEqual(first, classificationOnly(input));
    assert.equal(Object.isFrozen(first), true);
  });

  it("classification-only execution performs zero fetch, transport, retry, idempotency, or authorization work", (context) => {
    let transportAttempts = 0;
    let authorizationConsumes = 0;
    let idempotencyReservations = 0;
    const fetchMock = context.mock.method(globalThis, "fetch", async () => {
      throw new Error("fetch_must_not_run");
    });
    const harness = new GlmFireworksControlledConformanceHarness({
      authorizationStore: {
        consume() {
          authorizationConsumes += 1;
          return "consumed";
        },
      },
      idempotencyStore: {
        reserve() {
          idempotencyReservations += 1;
          return "reserved";
        },
        complete() {},
      },
      async transport() {
        transportAttempts += 1;
        throw new Error("transport_must_not_run");
      },
    });

    const result = harness.classifyPreResponseFailureOnly({
      ...base,
      thrown: nativeNetworkError("ENOTFOUND"),
    });
    assert.equal(result.classification, "unknown_pre_response_failure");
    assert.equal(fetchMock.mock.callCount(), 0);
    assert.equal(transportAttempts, 0);
    assert.equal(authorizationConsumes, 0);
    assert.equal(idempotencyReservations, 0);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyGlmFireworksPreResponseFailure,
  GlmFireworksControlledConformanceHarness,
  GlmFireworksCredentialUnavailableError,
  GlmFireworksInvalidGovernanceMetadataError,
  isGlmFireworksCredentialUnavailableError,
  sanitizeGlmFireworksNativeTransportError,
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

const trustedNetworkError = (code: string): Error => {
  const sanitized = sanitizeGlmFireworksNativeTransportError(
    nativeNetworkError(code),
  );
  assert.ok(sanitized);
  return sanitized;
};

describe("GLM Fireworks sanitized pre-response failure classification", () => {
  it("classifies only the trusted local missing-credential marker", () => {
    const error = new GlmFireworksCredentialUnavailableError();
    assert.equal(isGlmFireworksCredentialUnavailableError(error), true);
    const result = classifyGlmFireworksPreResponseFailure({
      ...base,
      thrown: error,
    });
    assert.equal(result.classification, "credential_unavailable");
    assert.equal(result.reason_code, "pre_response_credential_unavailable");
    assert.equal(result.retryable, false);
    assert.equal(result.terminal, true);
    assert.equal(result.http_status_present, false);
  });

  it("rejects the removed public credential boolean and forged markers", () => {
    for (const forged of [
      { credential_available: false },
      { name: "GlmFireworksCredentialUnavailableError" },
      { governed_failure_code: "credential_unavailable" },
      new Error("credential_unavailable"),
      "credential_unavailable",
    ]) {
      assert.equal(isGlmFireworksCredentialUnavailableError(forged), false);
      if ("credential_available" in Object(forged)) {
        assert.throws(
          () =>
            classifyGlmFireworksPreResponseFailure({
              ...base,
              ...(forged as object),
            }),
          GlmFireworksInvalidGovernanceMetadataError,
        );
      } else {
        assert.equal(
          classifyGlmFireworksPreResponseFailure({
            ...base,
            thrown: forged,
          }).classification,
          "unknown_pre_response_failure",
        );
      }
    }
  });

  it("gives trusted timeout state precedence over an AbortError", () => {
    const abortError = new DOMException("untrusted abort", "AbortError");
    const result = classifyGlmFireworksPreResponseFailure({
      ...base,
      timed_out: true,
      thrown: abortError,
    });
    assert.equal(result.classification, "timeout");
    assert.equal(result.reason_code, "pre_response_timeout");
    assert.equal(result.retryable, true);
    assert.equal(result.terminal, false);
  });

  it("does not trust an AbortError name without the harness timeout state", () => {
    const result = classifyGlmFireworksPreResponseFailure({
      ...base,
      thrown: new DOMException("untrusted abort", "AbortError"),
    });
    assert.equal(result.classification, "unknown_pre_response_failure");
    assert.equal(result.terminal, true);
  });

  it("classifies allowlisted codes only after native adapter sanitization", () => {
    for (const code of ["ENOTFOUND", "ECONNRESET", "UND_ERR_SOCKET"]) {
      const result = classifyGlmFireworksPreResponseFailure({
        ...base,
        thrown: trustedNetworkError(code),
      });
      assert.equal(result.classification, "network_transport");
      assert.equal(result.reason_code, "pre_response_network_transport");
      assert.doesNotMatch(JSON.stringify(result), /untrusted-network-details/);
    }
  });

  it("accepts one safe native cause level and rejects deeper or cyclic causes", () => {
    const outer = new Error("outer");
    Object.defineProperty(outer, "cause", {
      value: nativeNetworkError("EAI_AGAIN"),
    });
    assert.ok(sanitizeGlmFireworksNativeTransportError(outer));

    const deep = new Error("deep");
    const middle = new Error("middle");
    Object.defineProperty(middle, "cause", {
      value: nativeNetworkError("ENOTFOUND"),
    });
    Object.defineProperty(deep, "cause", { value: middle });
    assert.equal(sanitizeGlmFireworksNativeTransportError(deep), null);

    const cyclic = new Error("cyclic");
    Object.defineProperty(cyclic, "cause", { value: cyclic });
    assert.equal(sanitizeGlmFireworksNativeTransportError(cyclic), null);
  });

  it("rejects plain objects, inherited codes, and unallowlisted native codes", () => {
    const inherited = Object.create({ code: "ENOTFOUND" });
    for (const value of [
      { code: "ENOTFOUND" },
      inherited,
      nativeNetworkError("NOT_ALLOWLISTED"),
    ]) {
      assert.equal(sanitizeGlmFireworksNativeTransportError(value), null);
      assert.equal(
        classifyGlmFireworksPreResponseFailure({ ...base, thrown: value })
          .classification,
        "unknown_pre_response_failure",
      );
    }
  });

  it("never invokes code or cause getters", () => {
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
    assert.equal(sanitizeGlmFireworksNativeTransportError(codeGetter), null);
    assert.equal(sanitizeGlmFireworksNativeTransportError(causeGetter), null);
    assert.equal(codeGetterCalls, 0);
    assert.equal(causeGetterCalls, 0);
  });

  it("rejects proxies without triggering proxy traps", () => {
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
    for (const proxy of [forgedProxy, throwingProxy]) {
      assert.equal(sanitizeGlmFireworksNativeTransportError(proxy), null);
      assert.equal(
        classifyGlmFireworksPreResponseFailure({ ...base, thrown: proxy })
          .classification,
        "unknown_pre_response_failure",
      );
    }
    assert.equal(trapCalls, 0);
  });

  it("does not invoke serialization or string-conversion hooks", () => {
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
    assert.ok(sanitizeGlmFireworksNativeTransportError(error));
    assert.equal(hookCalls, 0);
  });

  it("does not mutate a native error while sanitizing it", () => {
    const error = nativeNetworkError("ECONNREFUSED");
    const before = Object.getOwnPropertyDescriptors(error);
    assert.ok(sanitizeGlmFireworksNativeTransportError(error));
    assert.deepEqual(Object.getOwnPropertyDescriptors(error), before);
  });

  it("does not mutate classifier input metadata or its thrown value", () => {
    const thrown = new Error("untrusted");
    const input = { ...base, thrown };
    const inputBefore = Object.getOwnPropertyDescriptors(input);
    const thrownBefore = Object.getOwnPropertyDescriptors(thrown);
    classifyGlmFireworksPreResponseFailure(input);
    assert.deepEqual(Object.getOwnPropertyDescriptors(input), inputBefore);
    assert.deepEqual(Object.getOwnPropertyDescriptors(thrown), thrownBefore);
  });

  for (const [status, retryable] of [
    [401, false],
    [403, false],
    [429, true],
    [500, true],
    [503, true],
  ] as const) {
    it(`classifies HTTP ${status} as a sanitized HTTP response`, () => {
      const result = classifyGlmFireworksPreResponseFailure({
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
      const result = classifyGlmFireworksPreResponseFailure({
        ...base,
        response_present: true,
        ...(status === undefined ? {} : { response_status: status }),
      });
      assert.equal(result.classification, "http_response");
      assert.equal(result.reason_code, "pre_response_http_status_unavailable");
      assert.equal(result.http_status_present, true);
      assert.equal(result.http_status_code, null);
      assert.equal(result.retryable, false);
      assert.equal(result.terminal, true);
    }
  });

  it("classifies an HTTP 200 without usable payload without reading a body", () => {
    const result = classifyGlmFireworksPreResponseFailure({
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
      const result = classifyGlmFireworksPreResponseFailure({
        ...base,
        thrown,
      });
      assert.equal(result.classification, "unknown_pre_response_failure");
      assert.equal(result.reason_code, "pre_response_unknown_fail_closed");
      assert.equal(result.retryable, false);
      assert.equal(result.terminal, true);
    }
  });

  it("rejects absent, malformed, oversized, URL-like, and secret-like IDs", () => {
    const invalidValues: unknown[] = [
      {},
      { ...base, correlation_id: "" },
      { ...base, correlation_id: "bad\nidentifier" },
      { ...base, correlation_id: "https://example.test/id" },
      { ...base, correlation_id: "id?token=secret" },
      { ...base, correlation_id: `a${"b".repeat(192)}` },
      { ...base, execution_evidence_id: "" },
      { ...base, execution_evidence_id: "evidence/unsafe" },
    ];
    for (const value of invalidValues)
      assert.throws(
        () => classifyGlmFireworksPreResponseFailure(value),
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
    const proxyInput = new Proxy({ ...base }, {});
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
      proxyInput,
    ];
    for (const value of invalidValues)
      assert.throws(
        () => classifyGlmFireworksPreResponseFailure(value),
        GlmFireworksInvalidGovernanceMetadataError,
      );
  });

  it("never persists a secret-bearing message, cause, body, or stack", () => {
    const secret = "example-secret-value-must-not-survive";
    const cause = new Error(`nested Bearer ${secret}`);
    const thrown = new Error(
      `Bearer ${secret}; body={customer_data:true}; host=private.internal`,
      { cause },
    );
    thrown.stack = `Error: ${secret}\nAuthorization: Bearer ${secret}`;
    const result = classifyGlmFireworksPreResponseFailure({
      ...base,
      thrown,
    });
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
    const first = classifyGlmFireworksPreResponseFailure(input);
    assert.deepEqual(first, classifyGlmFireworksPreResponseFailure(input));
    assert.deepEqual(Object.keys(first).sort(), [
      "adapter_id",
      "attempt",
      "classification",
      "contract_version",
      "correlation_id",
      "execution_evidence_id",
      "http_status_code",
      "http_status_present",
      "model_id",
      "profile_id",
      "reason_code",
      "retryable",
      "route_id",
      "terminal",
      "timestamp",
    ]);
    assert.equal(Object.isFrozen(first), true);
  });

  it("uses the harness-connected classifier with zero fetch, transport, retry, or authorization", (context) => {
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
      thrown: trustedNetworkError("ENOTFOUND"),
    });
    assert.equal(result.classification, "network_transport");
    assert.equal(fetchMock.mock.callCount(), 0);
    assert.equal(transportAttempts, 0);
    assert.equal(authorizationConsumes, 0);
    assert.equal(idempotencyReservations, 0);
  });
});

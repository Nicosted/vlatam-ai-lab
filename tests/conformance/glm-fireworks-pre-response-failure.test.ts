import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  classifyGlmFireworksPreResponseFailure,
  GlmFireworksCredentialUnavailableError,
  isGlmFireworksCredentialUnavailableError,
} from "../../src/conformance/index.js";

const base = Object.freeze({
  attempt: 2,
  timestamp: "2026-07-17T22:00:00.000Z",
  correlation_id: "ai-122.failure-classification.correlation",
  execution_evidence_id:
    "ai-122.failure-classification.correlation.attempt-2.pre-response",
});

describe("GLM Fireworks sanitized pre-response failure classification", () => {
  it("classifies a specifically detected missing credential without inspecting a value", () => {
    const error = new GlmFireworksCredentialUnavailableError();
    assert.equal(isGlmFireworksCredentialUnavailableError(error), true);
    const result = classifyGlmFireworksPreResponseFailure({
      ...base,
      credential_available: false,
      thrown: error,
    });
    assert.equal(result.classification, "credential_unavailable");
    assert.equal(result.reason_code, "pre_response_credential_unavailable");
    assert.equal(result.retryable, false);
    assert.equal(result.terminal, true);
    assert.equal(result.http_status_present, false);
  });

  it("gives an explicit timeout precedence over a network-shaped error", () => {
    const result = classifyGlmFireworksPreResponseFailure({
      ...base,
      timed_out: true,
      thrown: { code: "ETIMEDOUT" },
    });
    assert.equal(result.classification, "timeout");
    assert.equal(result.reason_code, "pre_response_timeout");
    assert.equal(result.retryable, true);
    assert.equal(result.terminal, false);
  });

  it("classifies allowlisted DNS, socket, and transport codes without persisting details", () => {
    for (const thrown of [
      { code: "ENOTFOUND", hostname: "private.internal.example" },
      { code: "ECONNRESET", address: "10.0.0.7" },
      { cause: { code: "UND_ERR_SOCKET", socket: "secret-socket" } },
    ]) {
      const result = classifyGlmFireworksPreResponseFailure({
        ...base,
        thrown,
      });
      assert.equal(result.classification, "network_transport");
      assert.equal(result.reason_code, "pre_response_network_transport");
      const serialized = JSON.stringify(result);
      assert.doesNotMatch(serialized, /private|10\.0\.0\.7|secret-socket/);
    }
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

  it("does not infer credential absence from a generic transport failure", () => {
    assert.equal(
      isGlmFireworksCredentialUnavailableError({
        governed_failure_code: "credential_unavailable",
      }),
      false,
    );
    const result = classifyGlmFireworksPreResponseFailure({
      ...base,
      thrown: new Error("approved_credential_unavailable"),
    });
    assert.equal(result.classification, "unknown_pre_response_failure");
    assert.equal(result.reason_code, "pre_response_unknown_fail_closed");
  });

  it("never persists a secret-bearing message, header, body, or stack", () => {
    const secret = "example-secret-value-must-not-survive";
    const thrown = new Error(
      `Bearer ${secret}; body={customer_data:true}; host=private.internal`,
    );
    thrown.stack = `Error: ${secret}\nAuthorization: Bearer ${secret}`;
    const result = classifyGlmFireworksPreResponseFailure({
      ...base,
      thrown,
    });
    const serialized = JSON.stringify(result);
    assert.equal(result.classification, "unknown_pre_response_failure");
    assert.doesNotMatch(
      serialized,
      /example-secret|Bearer|Authorization|customer_data|private\.internal/,
    );
  });

  it("distinguishes no-response network failure from an HTTP response", () => {
    const noResponse = classifyGlmFireworksPreResponseFailure({
      ...base,
      thrown: { code: "ECONNREFUSED" },
    });
    const response = classifyGlmFireworksPreResponseFailure({
      ...base,
      response_present: true,
      response_status: 503,
      thrown: { code: "ECONNREFUSED" },
    });
    assert.equal(noResponse.classification, "network_transport");
    assert.equal(noResponse.http_status_present, false);
    assert.equal(response.classification, "http_response");
    assert.equal(response.http_status_present, true);
  });

  it("classifies a response with no usable provider payload without reading its body", () => {
    const result = classifyGlmFireworksPreResponseFailure({
      ...base,
      response_present: true,
      response_status: 200,
      usable_provider_payload: false,
      thrown: new Error("raw provider body must be ignored"),
    });
    assert.equal(result.classification, "http_response");
    assert.equal(result.reason_code, "pre_response_http_200_unusable_payload");
    assert.equal(result.http_status_code, 200);
    assert.doesNotMatch(JSON.stringify(result), /raw provider body/);
  });

  it("is deterministic for repeated classification", () => {
    const input = {
      ...base,
      response_present: true,
      response_status: 429,
      usable_provider_payload: false,
    } as const;
    assert.deepEqual(
      classifyGlmFireworksPreResponseFailure(input),
      classifyGlmFireworksPreResponseFailure(input),
    );
  });

  it("preserves only governed identity and decision metadata", () => {
    const result = classifyGlmFireworksPreResponseFailure({
      ...base,
      thrown: { code: "ENOTFOUND", message: "do-not-persist" },
    });
    assert.deepEqual(Object.keys(result).sort(), [
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
    assert.equal(Object.isFrozen(result), true);
  });

  it("performs zero external transport attempts and creates no authorization", () => {
    let transportAttempts = 0;
    const forbiddenTransport = () => {
      transportAttempts += 1;
      throw new Error("transport_must_not_run");
    };
    const result = classifyGlmFireworksPreResponseFailure({
      ...base,
      thrown: { code: "ENOTFOUND" },
    });
    assert.equal(result.classification, "network_transport");
    assert.equal(transportAttempts, 0);
    assert.equal(typeof forbiddenTransport, "function");
    for (const forbidden of [
      "authorization_id",
      "authorization_consumption",
      "credential",
      "request_body",
      "response_body",
    ])
      assert.equal(forbidden in result, false);
  });
});

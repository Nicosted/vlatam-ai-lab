import assert from "node:assert/strict";

import {
  createApprovedAi122OpenRouterTransport,
  GLM_CONFORMANCE_CHAT_COMPLETIONS_PATH,
  GLM_CONFORMANCE_PURPOSE,
  GlmFireworksControlledConformanceHarness,
} from "../../../src/conformance/index.js";

let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls += 1;
  throw new Error("fetch_must_not_run");
};

const transport = createApprovedAi122OpenRouterTransport({
  approved: true,
  purpose: GLM_CONFORMANCE_PURPOSE,
});

let boundaryFailure: unknown;
try {
  await transport({
    method: "POST",
    path: GLM_CONFORMANCE_CHAT_COMPLETIONS_PATH,
    body: "",
    signal: new AbortController().signal,
    idempotency_key: "ai-122.credential-boundary.idem",
    correlation_id: "ai-122.credential-boundary.correlation",
    attempt: 1,
  });
} catch (error) {
  boundaryFailure = error;
}

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

const evidence = harness.classifyPreResponseFailureOnly({
  attempt: 1,
  timestamp: "2026-07-17T15:05:00.000Z",
  correlation_id: "ai-122.credential-boundary.correlation",
  execution_evidence_id:
    "ai-122.credential-boundary.correlation.attempt-1.pre-response",
  thrown: boundaryFailure,
});

assert.equal(fetchCalls, 0);
assert.equal(evidence.classification, "credential_unavailable");
assert.equal(evidence.reason_code, "pre_response_credential_unavailable");

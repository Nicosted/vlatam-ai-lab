import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeTypedDecisionRequestHash } from "../../src/decision/canonical.js";
import {
  DECISION_SANDBOX_FIXTURE_ADAPTER,
  DECISION_SANDBOX_FIXTURE_POLICY,
  evaluateDecisionSandboxPreflight,
  issueCodes,
} from "../../src/decision-sandbox/index.js";
import {
  booleanRequest,
  clone,
  executionRequest,
  FIXTURE_ROOT,
  load,
  type Mutable,
} from "./helpers.js";

const preflightCodes = (value: unknown): string[] =>
  issueCodes(evaluateDecisionSandboxPreflight(value).issues);

describe("AI-143 decision sandbox preflight", () => {
  it("makes a valid synthetic fixture execution request eligible, never approved", () => {
    const preflight = evaluateDecisionSandboxPreflight(executionRequest());
    assert.equal(preflight.outcome, "eligible_for_fixture_execution");
    assert.deepEqual(preflight.issues, []);
    assert.equal(preflight.execution_id, "sandbox-fixture-execution-0001");
    assert.equal(preflight.adapter, DECISION_SANDBOX_FIXTURE_ADAPTER);
    assert.equal(preflight.policy, DECISION_SANDBOX_FIXTURE_POLICY);
    assert.equal(
      preflight.request_hash,
      computeTypedDecisionRequestHash(booleanRequest()),
    );
    assert.equal(preflight.output_authority, "none");
    assert.doesNotMatch(JSON.stringify(preflight), /"approved"|"approval"/);
    assert.equal(
      evaluateDecisionSandboxPreflight(
        load(`${FIXTURE_ROOT}/valid-execution-request.json`),
      ).outcome,
      "eligible_for_fixture_execution",
    );
  });

  it("is pure and deterministic", () => {
    const value = executionRequest();
    const before = JSON.stringify(value);
    const first = evaluateDecisionSandboxPreflight(value);
    const second = evaluateDecisionSandboxPreflight(value);
    assert.deepEqual(first, second);
    assert.equal(JSON.stringify(value), before, "input is not mutated");
  });

  it("blocks an unknown fixture adapter", () => {
    const value = executionRequest();
    value["subject"]["adapter_id"] = "ai-lab-other-fixture-adapter";
    assert.deepEqual(preflightCodes(value), ["adapter_unknown"]);
  });

  it("blocks a wrong adapter hash or version", () => {
    const wrongHash = executionRequest();
    wrongHash["subject"]["artifact_sha256"] = "a".repeat(64);
    assert.deepEqual(preflightCodes(wrongHash), ["adapter_hash_mismatch"]);
    const wrongVersion = executionRequest();
    wrongVersion["subject"]["adapter_version"] = "1.0.1";
    assert.deepEqual(preflightCodes(wrongVersion), [
      "adapter_version_mismatch",
    ]);
  });

  it("blocks an unsupported adapter protocol version", () => {
    const value = executionRequest();
    value["subject"]["protocol_version"] = "2.0.0";
    assert.deepEqual(preflightCodes(value), ["protocol_version_unsupported"]);
  });

  it("blocks an invalid typed decision request or a wrong request hash", () => {
    const invalid = executionRequest();
    invalid["request"]["decision_type"] = "unknown";
    assert.ok(preflightCodes(invalid).includes("typed_request_invalid"));
    assert.equal(evaluateDecisionSandboxPreflight(invalid).request, null);
    const wrongHash = executionRequest();
    wrongHash["request_hash"] = "b".repeat(64);
    assert.deepEqual(preflightCodes(wrongHash), ["request_hash_mismatch"]);
    const regulated = executionRequest(
      "sandbox-fixture-execution-0001",
      load("data/fixtures/typed-decision/invalid-request-regulated-data.json"),
    );
    assert.ok(preflightCodes(regulated).includes("typed_request_invalid"));
  });

  it("blocks an unsupported policy or a tampered policy hash", () => {
    const tampered = executionRequest();
    tampered["policy"]["policy_hash"] = "c".repeat(64);
    assert.deepEqual(preflightCodes(tampered), ["policy_hash_mismatch"]);
    const other = executionRequest();
    other["policy"]["policy_id"] = "ai-lab-production-policy";
    assert.deepEqual(preflightCodes(other), ["policy_unsupported"]);
  });

  it("blocks arbitrary executable paths, arguments, environment and network configuration", () => {
    for (const [where, field, value] of [
      ["subject", "executable_path", "/usr/bin/python3"],
      ["subject", "args", ["--allow-all"]],
      ["root", "command", "node adapter.mjs"],
      ["root", "environment", { NODE_OPTIONS: "--require=x" }],
      ["root", "env", {}],
      ["root", "cwd", "/"],
      ["root", "shell", true],
      ["root", "network", "allowed"],
      ["root", "url", "https://example.invalid"],
    ] as const) {
      const request = executionRequest();
      const target: Mutable = where === "root" ? request : request[where];
      target[field] = clone(value);
      const found = preflightCodes(request);
      assert.ok(found.includes("execution_control_forbidden"), field);
      assert.ok(found.includes("unknown_property"), field);
      assert.equal(
        evaluateDecisionSandboxPreflight(request).outcome,
        "blocked",
      );
    }
  });

  it("blocks credential, provider and model fields", () => {
    for (const field of ["api_key", "secret", "token", "provider", "model"]) {
      const request = executionRequest();
      request[field] = "synthetic";
      assert.ok(preflightCodes(request).includes("forbidden_field"), field);
    }
    const credentials = executionRequest();
    credentials["credentials"] = {};
    assert.ok(
      preflightCodes(credentials).includes("execution_control_forbidden"),
    );
  });

  it("blocks production, routing, promotion and approval fields", () => {
    for (const field of [
      "production",
      "routing_enabled",
      "promotion_eligible",
      "approved",
      "downstream_allowed",
      "traffic_stage",
      "benchmark",
    ]) {
      const request = executionRequest();
      request[field] = true;
      assert.ok(
        preflightCodes(request).includes("production_authority_forbidden"),
        field,
      );
    }
    const authority = executionRequest();
    authority["output_authority"] = "downstream";
    assert.deepEqual(preflightCodes(authority), ["output_authority_invalid"]);
  });

  it("blocks private reasoning fields at any depth", () => {
    const request = executionRequest();
    request["subject"]["chain_of_thought"] = "synthetic";
    assert.ok(preflightCodes(request).includes("private_reasoning_forbidden"));
  });

  it("blocks unknown properties, unsupported schema majors and malformed ids", () => {
    assert.deepEqual(preflightCodes({ ...executionRequest(), extra: 1 }), [
      "unknown_property",
    ]);
    assert.deepEqual(
      preflightCodes({ ...executionRequest(), schema_version: "2.0.0" }),
      ["schema_version_unsupported"],
    );
    const badId = evaluateDecisionSandboxPreflight({
      ...executionRequest(),
      execution_id: "Bad Id",
    });
    assert.deepEqual(issueCodes(badId.issues), ["identifier_invalid"]);
    assert.equal(badId.execution_id, null);
    assert.deepEqual(preflightCodes("not an object"), ["contract_invalid"]);
    assert.deepEqual(preflightCodes({ contract: "other" }), [
      "contract_invalid",
    ]);
    const missing = executionRequest();
    delete missing["subject"];
    assert.ok(preflightCodes(missing).includes("subject_invalid"));
    const kind = executionRequest();
    kind["subject"]["subject_kind"] = "model";
    assert.ok(preflightCodes(kind).includes("subject_kind_invalid"));
  });

  it("blocks a request whose input frame would exceed the input bound", () => {
    const request = booleanRequest() as unknown as Mutable;
    request["bounded_state"]["facts"] = Array.from({ length: 64 }, (_, i) => ({
      fact_id: `synthetic.fact.${String(i).padStart(3, "0")}`,
      value_type: "string",
      value: "x".repeat(512),
    }));
    request["evidence_refs"] = Array.from({ length: 32 }, (_, i) => ({
      evidence_id: `synthetic-evidence-${String(i).padStart(3, "0")}`,
      content_hash: "d".repeat(64),
    }));
    const value = executionRequest(
      "sandbox-fixture-execution-0001",
      request as never,
    );
    // Valid under AI-140 limits, but still within the 64 KiB input bound.
    assert.equal(
      evaluateDecisionSandboxPreflight(value).outcome,
      "eligible_for_fixture_execution",
    );
    const oversized = clone(value);
    oversized["request"]["question"]["text"] = "q".repeat(1000);
    oversized["request"]["bounded_state"]["facts"].forEach(
      (fact: Mutable) => (fact["value"] = "é".repeat(512)),
    );
    oversized["request_hash"] = computeTypedDecisionRequestHash(
      oversized["request"],
    );
    assert.deepEqual(preflightCodes(oversized), ["input_limit_exceeded"]);
  });
});

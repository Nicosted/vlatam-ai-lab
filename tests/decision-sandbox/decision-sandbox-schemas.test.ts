import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

import { computeTypedDecisionRequestHash } from "../../src/decision/canonical.js";
import {
  evaluateDecisionSandboxPreflight,
  validateDecisionAdapterInput,
  validateDecisionAdapterOutput,
  validateDecisionSandboxExecutionRecord,
  validateDecisionSandboxPolicy,
} from "../../src/decision-sandbox/index.js";
import { booleanRequest, FIXTURE_ROOT, load, type Mutable } from "./helpers.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const applyFormats = ((addFormatsModule as any).default ??
  addFormatsModule) as (ajv: Ajv2020) => void;

/** AI-143 schemas reuse the AI-140 request and result schemas by `$ref`. */
function schemaValidator(file: string) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  applyFormats(ajv);
  ajv.addSchema(load("schemas/ai-typed-decision-request.schema.json"));
  ajv.addSchema(load("schemas/ai-typed-decision-result.schema.json"));
  return ajv.compile(load(file));
}

const NAMES = [
  "ai_decision_adapter_input",
  "ai_decision_adapter_output",
  "ai_decision_sandbox_policy",
  "ai_decision_sandbox_execution_request",
  "ai_decision_sandbox_execution_record",
];

interface RegistryEntry {
  contract_name: string;
  schema_file: string;
  valid_fixture: string;
  invalid_fixtures: string[];
  test_file: string;
  downstream_allowed_field_present: boolean;
}
const registry = load<{ contracts: RegistryEntry[] }>(
  "schemas/schema-registry.json",
);
const entries = registry.contracts.filter((entry) =>
  NAMES.includes(entry.contract_name),
);

const request = booleanRequest();
const RUNTIME: Record<string, (value: unknown) => boolean> = {
  ai_decision_adapter_input: (v) => validateDecisionAdapterInput(v).ok,
  ai_decision_adapter_output: (v) =>
    validateDecisionAdapterOutput(v, {
      execution_id: "sandbox-fixture-execution-0001",
      request,
      request_hash: computeTypedDecisionRequestHash(request),
      protocol_version: "1.0.0",
      result_origin: "synthetic_fixture",
    }).ok,
  ai_decision_sandbox_policy: (v) => validateDecisionSandboxPolicy(v).ok,
  ai_decision_sandbox_execution_request: (v) =>
    evaluateDecisionSandboxPreflight(v).outcome ===
    "eligible_for_fixture_execution",
  ai_decision_sandbox_execution_record: (v) =>
    validateDecisionSandboxExecutionRecord(v).ok,
};

describe("AI-143 decision sandbox JSON Schemas", () => {
  it("registers all five contracts with this test file", () => {
    assert.equal(entries.length, 5);
    for (const entry of entries) {
      assert.equal(
        entry.test_file,
        "tests/decision-sandbox/decision-sandbox-schemas.test.ts",
      );
      assert.ok(entry.invalid_fixtures.length >= 3, entry.contract_name);
    }
  });

  it("accepts every registered valid fixture and rejects every registered invalid fixture", () => {
    for (const entry of entries) {
      const validate = schemaValidator(entry.schema_file);
      assert.equal(
        validate(load(entry.valid_fixture)),
        true,
        `${entry.valid_fixture}: ${JSON.stringify(validate.errors)}`,
      );
      assert.equal(
        RUNTIME[entry.contract_name]!(load(entry.valid_fixture)),
        true,
        entry.valid_fixture,
      );
      for (const invalid of entry.invalid_fixtures) {
        assert.equal(
          validate(load(invalid)),
          false,
          `${invalid} must be schema-invalid`,
        );
        assert.equal(
          RUNTIME[entry.contract_name]!(load(invalid)),
          false,
          `${invalid} must be runtime-invalid`,
        );
      }
    }
  });

  it("the blocked and timed-out record fixtures satisfy the record schema and validator", () => {
    const validate = schemaValidator(
      "schemas/ai-decision-sandbox-execution-record.schema.json",
    );
    for (const name of [
      "valid-execution-record-registered-candidate-blocked.json",
      "valid-execution-record-timed-out.json",
    ]) {
      const fixture = load(`${FIXTURE_ROOT}/${name}`);
      assert.equal(validate(fixture), true, JSON.stringify(validate.errors));
      assert.equal(validateDecisionSandboxExecutionRecord(fixture).ok, true);
    }
  });

  it("schemas are closed and carry no execution-control or authority-granting field", () => {
    for (const entry of entries) {
      const schema = load<Record<string, unknown>>(entry.schema_file);
      assert.equal(schema["additionalProperties"], false, entry.schema_file);
      const text = JSON.stringify(schema["properties"]);
      assert.doesNotMatch(
        text,
        /"(?:command|executable|executable_path|args|argv|env|environment|shell|cwd|network|url|credential|api_key|approved|approval_ref|promotion_eligible|production_eligible|routing_enabled|kill_switch|traffic_stage|reasoning|stderr)"/,
        entry.schema_file,
      );
    }
    const record = load<Mutable>(
      "schemas/ai-decision-sandbox-execution-record.schema.json",
    );
    assert.deepEqual(record["properties"]["downstream_allowed"], {
      const: false,
    });
    assert.deepEqual(record["properties"]["output_authority"], {
      const: "none",
    });
    const policy = load<Mutable>(
      "schemas/ai-decision-sandbox-policy.schema.json",
    );
    for (const claim of [
      "network_claim",
      "filesystem_claim",
      "hostile_code_containment",
    ])
      assert.deepEqual(policy["properties"][claim], {
        const: "not_established",
      });
    const executionRequest = load<Mutable>(
      "schemas/ai-decision-sandbox-execution-request.schema.json",
    );
    assert.deepEqual(
      executionRequest["properties"]["subject"]["properties"]["subject_kind"],
      { const: "synthetic_fixture_adapter" },
    );
  });
});

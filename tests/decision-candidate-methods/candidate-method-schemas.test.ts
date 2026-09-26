import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

import {
  validateCandidateAdapterEvidencePack,
  validateCandidateAdapterSpec,
  validateSyntheticLogitFixture,
} from "../../src/decision-candidate-methods/index.js";
import { DECISION_SANDBOX_FIXTURE_POLICY_HASH } from "../../src/decision-sandbox/index.js";
import { load, logitFixtures, semifEntry, spec } from "./helpers.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const applyFormats = ((addFormatsModule as any).default ??
  addFormatsModule) as (ajv: Ajv2020) => void;

function schemaValidator(file: string) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  applyFormats(ajv);
  return ajv.compile(load(file));
}

const NAMES = [
  "ai_typed_decision_candidate_adapter_spec",
  "ai_typed_decision_synthetic_logit_fixture",
  "ai_typed_decision_candidate_adapter_evidence_pack",
];

interface RegistryEntry {
  contract_name: string;
  schema_file: string;
  valid_fixture: string;
  invalid_fixtures: string[];
  test_file: string;
  downstream_allowed_field_present: boolean;
}
const entries = load<{ contracts: RegistryEntry[] }>(
  "schemas/schema-registry.json",
).contracts.filter((entry) => NAMES.includes(entry.contract_name));

const RUNTIME: Record<string, (value: unknown) => boolean> = {
  ai_typed_decision_candidate_adapter_spec: (v) =>
    validateCandidateAdapterSpec(v).ok,
  ai_typed_decision_synthetic_logit_fixture: (v) =>
    validateSyntheticLogitFixture(v).ok,
  ai_typed_decision_candidate_adapter_evidence_pack: (v) =>
    validateCandidateAdapterEvidencePack(v, {
      spec: spec(),
      entry: semifEntry(),
      fixtures: logitFixtures(),
      sandbox_policy_hash: DECISION_SANDBOX_FIXTURE_POLICY_HASH,
    }).ok,
};

describe("AI-144 candidate method JSON Schemas", () => {
  it("registers the three persisted AI-144 contracts with this test file", () => {
    assert.equal(entries.length, 3);
    for (const entry of entries) {
      assert.equal(
        entry.test_file,
        "tests/decision-candidate-methods/candidate-method-schemas.test.ts",
      );
      assert.equal(entry.downstream_allowed_field_present, false);
      assert.ok(entry.invalid_fixtures.length >= 5, entry.contract_name);
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

  it("every committed synthetic logit fixture satisfies the fixture schema", () => {
    const validate = schemaValidator(
      "schemas/ai-typed-decision-synthetic-logit-fixture.schema.json",
    );
    for (const fixture of logitFixtures())
      assert.equal(validate(fixture), true, JSON.stringify(validate.errors));
  });

  it("schemas are closed and carry no execution-control or authority-granting field", () => {
    for (const entry of entries) {
      const schema = load<Record<string, unknown>>(entry.schema_file);
      assert.equal(schema["additionalProperties"], false, entry.schema_file);
      assert.doesNotMatch(
        JSON.stringify(schema["properties"]),
        /"(?:command|executable|executable_path|args|argv|env|environment|shell|cwd|network|url|credential|api_key|approved|approval_ref|routing_enabled|kill_switch|traffic_stage|reasoning|temperature|weights_url|model_path)"/,
        entry.schema_file,
      );
      assert.doesNotMatch(
        JSON.stringify(schema),
        /"approved"/,
        entry.schema_file,
      );
    }
    // Eligibility fields exist only as constant false.
    const specSchema = load<{ properties: Record<string, unknown> }>(
      "schemas/ai-typed-decision-candidate-adapter-spec.schema.json",
    );
    for (const key of [
      "benchmark_eligible",
      "promotion_eligible",
      "production_eligible",
    ])
      assert.deepEqual(specSchema.properties[key], { const: false });
    assert.deepEqual(specSchema.properties["calibration_state"], {
      const: "not_applied",
    });
    assert.deepEqual(specSchema.properties["result_origin"], {
      const: "synthetic_fixture",
    });
  });
});

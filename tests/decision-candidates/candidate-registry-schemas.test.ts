import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

import {
  validateDecisionCandidateEntry,
  validateDecisionCandidateRegistryManifest,
} from "../../src/decision-candidates/index.js";
import { load } from "./helpers.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const applyFormats = ((addFormatsModule as any).default ??
  addFormatsModule) as (ajv: Ajv2020) => void;

function schemaValidator(file: string) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  applyFormats(ajv);
  return ajv.compile(load(file));
}

const NAMES = [
  "ai_typed_decision_candidate_entry",
  "ai_typed_decision_candidate_registry",
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

const RUNTIME: Record<string, (value: unknown) => boolean> = {
  ai_typed_decision_candidate_entry: (v) =>
    validateDecisionCandidateEntry(v).ok,
  ai_typed_decision_candidate_registry: (v) =>
    validateDecisionCandidateRegistryManifest(v).ok,
};

describe("AI-142 candidate registry JSON Schemas", () => {
  it("registers both contracts with this test file", () => {
    assert.equal(entries.length, 2);
    for (const entry of entries) {
      assert.equal(
        entry.test_file,
        "tests/decision-candidates/candidate-registry-schemas.test.ts",
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

  it("the multi-role fixture satisfies the entry schema", () => {
    const validate = schemaValidator(
      "schemas/ai-typed-decision-candidate-entry.schema.json",
    );
    assert.equal(
      validate(
        load(
          "data/fixtures/decision-candidates/valid-candidate-entry-multi-role.json",
        ),
      ),
      true,
      JSON.stringify(validate.errors),
    );
  });

  it("schemas are closed and carry no authority-granting field", () => {
    for (const entry of entries) {
      const schema = load<Record<string, unknown>>(entry.schema_file);
      assert.equal(schema["additionalProperties"], false, entry.schema_file);
      const text = JSON.stringify(schema);
      assert.doesNotMatch(
        text,
        /"downstream_allowed"|"approved_for_production"|"approval_ref"|"approved"|"activation"|"kill_switch"|"traffic_stage"|"ai_lab_verified"/,
      );
      // Every eligibility, execution or promotion flag is a constant false.
      for (const key of [
        ...text.matchAll(
          /"((?:promot|execut|benchmark_execut|production|routing)[a-z_]*|ai_lab_executed)":/g,
        ),
      ].map((m) => m[1]!))
        assert.match(
          text,
          new RegExp(`"${key}":\\{"const":false\\}`),
          `${entry.schema_file}: ${key}`,
        );
    }
  });
});

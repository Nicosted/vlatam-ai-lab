import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { describe, it } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

import {
  validateGoldDecisionCase,
  validateGoldDecisionCaseEvaluation,
  validateGoldDecisionSetManifest,
  verifyGoldDecisionReportHash,
  type GoldDecisionEvaluationReport,
} from "../../src/decision-evaluation/index.js";
import { FIXTURE_ROOT, SEED_ROOT, load } from "./helpers.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const applyFormats = ((addFormatsModule as any).default ??
  addFormatsModule) as (ajv: Ajv2020) => void;

function schemaValidator(file: string) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  applyFormats(ajv);
  ajv.addSchema(load("schemas/ai-typed-decision-request.schema.json"));
  return ajv.compile(load(file));
}

const NAMES = [
  "ai_gold_decision_case",
  "ai_gold_decision_set",
  "ai_gold_decision_case_evaluation",
  "ai_gold_decision_evaluation_report",
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
  ai_gold_decision_case: (v) => validateGoldDecisionCase(v).ok,
  ai_gold_decision_set: (v) => validateGoldDecisionSetManifest(v).ok,
  ai_gold_decision_case_evaluation: (v) =>
    validateGoldDecisionCaseEvaluation(v).ok,
  ai_gold_decision_evaluation_report: (v) =>
    verifyGoldDecisionReportHash(v as GoldDecisionEvaluationReport),
};

describe("AI-141 Gold Decision JSON Schemas", () => {
  it("registers all four contracts with this test file", () => {
    assert.equal(entries.length, 4);
    for (const entry of entries) {
      assert.equal(
        entry.test_file,
        "tests/decision-evaluation/gold-decision-schemas.test.ts",
      );
      assert.equal(entry.downstream_allowed_field_present, false);
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

  it("every seed case and both manifests satisfy their schemas", () => {
    const validateCase = schemaValidator(
      "schemas/ai-gold-decision-case.schema.json",
    );
    const validateSet = schemaValidator(
      "schemas/ai-gold-decision-set.schema.json",
    );
    for (const root of [SEED_ROOT, FIXTURE_ROOT]) {
      assert.equal(
        validateSet(load(`${root}/manifest.json`)),
        true,
        JSON.stringify(validateSet.errors),
      );
      for (const file of readdirSync(`${root}/cases`))
        assert.equal(
          validateCase(load(`${root}/cases/${file}`)),
          true,
          `${file}: ${JSON.stringify(validateCase.errors)}`,
        );
    }
  });

  it("schemas are closed and carry no authority-granting field", () => {
    for (const entry of entries) {
      const schema = load<Record<string, unknown>>(entry.schema_file);
      assert.equal(schema["additionalProperties"], false, entry.schema_file);
      const text = JSON.stringify(schema);
      assert.doesNotMatch(
        text,
        /"downstream_allowed"|"approved_for_production"|"approval_ref"|"approved"/,
      );
      // The only promotion-related field is a constant `false`.
      const promotionKeys = [...text.matchAll(/"(promot[a-z_]*)":/g)].map(
        (m) => m[1],
      );
      for (const key of promotionKeys) assert.equal(key, "promotion_eligible");
      if (promotionKeys.length > 0)
        assert.match(text, /"promotion_eligible":\{"const":false\}/);
    }
  });
});

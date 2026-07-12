import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
const load = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));
const addFormats = ((
  addFormatsModule as unknown as { default?: typeof addFormatsModule }
).default ?? addFormatsModule) as unknown as (a: Ajv) => void;
const validate = (schema: string, value: string) => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(load(schema) as object)(load(value));
};
describe("AI-79 handoff schemas", () => {
  it("accepts the policy and authorization fixtures", () => {
    assert.equal(
      validate(
        "schemas/ai-handoff-authorization-policy.schema.json",
        "config/ai-handoff-authorization-policy.json",
      ),
      true,
    );
    assert.equal(
      validate(
        "schemas/ai-routing-decision-execution-authorization.schema.json",
        "snapshots/handoff/valid-authorization.json",
      ),
      true,
    );
  });
  it("rejects malformed authorization", () =>
    assert.equal(
      validate(
        "schemas/ai-routing-decision-execution-authorization.schema.json",
        "snapshots/handoff/invalid-authorization.json",
      ),
      false,
    ));
  it("loads every introduced schema", () => {
    for (const file of [
      "ai-routing-handoff-request",
      "ai-routing-handoff-validation-result",
      "ai-routing-handoff-execution-result",
      "ai-routing-authorization-provenance",
      "ai-routing-handoff-rejection-reason",
      "ai-routing-handoff-audit-event",
    ]) {
      const ajv = new Ajv({ strict: false });
      addFormats(ajv);
      assert.doesNotThrow(() =>
        ajv.compile(load(`schemas/${file}.schema.json`) as object),
      );
    }
  });
});

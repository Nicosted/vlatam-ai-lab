import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

const load = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const addFormats = ((
  addFormatsModule as unknown as { default?: typeof addFormatsModule }
).default ?? addFormatsModule) as unknown as (ajv: Ajv) => void;
const validator = (schema: string) => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(load(schema) as object);
};

describe("AI-78 routing schemas", () => {
  it("accepts the valid policy and reviewed evidence fixtures", () => {
    assert.equal(
      validator("schemas/ai-profile-selection-policy.schema.json")(
        load("snapshots/routing/valid-policy.json"),
      ),
      true,
    );
    assert.equal(
      validator("schemas/ai-reviewed-benchmark-evidence.schema.json")(
        load("snapshots/routing/valid-reviewed-evidence.json"),
      ),
      true,
    );
  });
  it("rejects invalid reviewer-role, quality-gate, and attestation fixtures", () => {
    const policy = validator("schemas/ai-profile-selection-policy.schema.json");
    assert.equal(
      policy(
        load("snapshots/routing/invalid-policy-empty-reviewer-roles.json"),
      ),
      false,
    );
    assert.equal(
      policy(
        load("snapshots/routing/invalid-policy-incoherent-quality-gate.json"),
      ),
      false,
    );
    assert.equal(
      validator("schemas/ai-reviewed-benchmark-evidence.schema.json")(
        load("snapshots/routing/invalid-evidence-malformed-attestation.json"),
      ),
      false,
    );
  });
});

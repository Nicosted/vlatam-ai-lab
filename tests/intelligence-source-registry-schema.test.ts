import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

import type { ValidateFunction } from "ajv";

import { readUtf8File } from "../src/lib/fs.js";
import { withConservativeDefaults } from "../src/intelligence/source-registry.js";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020") as new (options?: {
  allErrors?: boolean;
  strict?: boolean;
  validateFormats?: boolean;
}) => {
  compile: (schema: unknown) => ValidateFunction;
};

async function readJsonFixture(
  relativePath: string,
): Promise<Record<string, unknown>> {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const content = await readUtf8File(absolutePath);
  return JSON.parse(content) as Record<string, unknown>;
}

async function buildValidator(): Promise<ValidateFunction> {
  const schema = await readJsonFixture(
    "schemas/intelligence-source-registry.schema.json",
  );
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });

  return ajv.compile(schema);
}

const validFixtures = [
  "snapshots/pcram/intelligence-source-registry-wco-hs.json",
  "snapshots/pcram/intelligence-source-registry-ar-ncm.json",
  "snapshots/pcram/intelligence-source-registry-mercosur.json",
  "snapshots/pcram/intelligence-source-registry-sectoral.json",
];

for (const fixture of validFixtures) {
  test(`valid registry fixture passes: ${fixture}`, async () => {
    const validate = await buildValidator();
    const sample = await readJsonFixture(fixture);

    assert.equal(validate(sample), true);
  });
}

test("missing required field fails", async () => {
  const validate = await buildValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/invalid-intelligence-source-registry-missing-required.json",
  );

  assert.equal(validate(sample), false);
  assert.equal(
    validate.errors?.some(
      (error) =>
        error.instancePath === "" &&
        error.message?.includes("must have required property"),
    ),
    true,
  );
});

test("unsupported source_type fails", async () => {
  const validate = await buildValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/invalid-intelligence-source-registry-unsupported-enum.json",
  );

  assert.equal(validate(sample), false);
  assert.equal(
    validate.errors?.some(
      (error) =>
        error.instancePath === "/source_type" &&
        error.message?.includes("must be equal to one of the allowed values"),
    ),
    true,
  );
});

test("unverified sample marked downstream_allowed is rejected", async () => {
  const validate = await buildValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/invalid-intelligence-source-registry-unreviewed-downstream.json",
  );

  assert.equal(validate(sample), false);
});

test("all valid fixtures keep conservative downstream defaults", async () => {
  for (const fixture of validFixtures) {
    const sample = await readJsonFixture(fixture);
    assert.equal(sample["downstream_allowed"], false, fixture);
    assert.equal(sample["human_review_required"], true, fixture);
    assert.notEqual(sample["freshness_status"], "current", fixture);
  }
});

test("conservative defaults are applied to a minimal draft", () => {
  const entry = withConservativeDefaults({
    source_id: "draft-source",
    source_name: "Draft Source",
    source_type: "manual_source",
    jurisdiction_scope: "unknown",
    topic_scope: ["unspecified"],
    language: "en",
    source_locator: "sample://draft/source",
    created_at: "2026-06-06T00:00:00.000Z",
    updated_at: "2026-06-06T00:00:00.000Z",
    schema_version: "1.0.0",
  });

  assert.equal(entry.human_review_required, true);
  assert.equal(entry.downstream_allowed, false);
  assert.equal(entry.freshness_status, "unknown");
  assert.equal(entry.verification_status, "unverified_sample");
  assert.equal(entry.authority_level, "unknown");
  assert.equal(entry.reliability_level, "unknown");
});

test("the conservative-defaults output validates against the schema", async () => {
  const validate = await buildValidator();
  const entry = withConservativeDefaults({
    source_id: "draft-source",
    source_name: "Draft Source",
    source_type: "manual_source",
    jurisdiction_scope: "unknown",
    topic_scope: ["unspecified"],
    language: "en",
    source_locator: "sample://draft/source",
    created_at: "2026-06-06T00:00:00.000Z",
    updated_at: "2026-06-06T00:00:00.000Z",
    schema_version: "1.0.0",
  });

  assert.equal(validate(entry), true);
});

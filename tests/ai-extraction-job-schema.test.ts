import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

import type { ValidateFunction } from "ajv";

import { readUtf8File } from "../src/lib/fs.js";

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
  const schema = await readJsonFixture("schemas/ai-extraction-job.schema.json");
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });

  return ajv.compile(schema);
}

test("valid extraction job fixture passes", async () => {
  const validate = await buildValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/ai-extraction-job-example.json",
  );

  assert.equal(validate(sample), true);
});

test("valid extraction job is not downstream-safe by default", async () => {
  const sample = await readJsonFixture(
    "snapshots/pcram/ai-extraction-job-example.json",
  );

  assert.equal(sample["downstream_allowed"], false);
  assert.equal(sample["human_review_required"], true);
});

test("missing required field fails", async () => {
  const validate = await buildValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/invalid-ai-extraction-job-missing-required.json",
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

test("unsupported status fails", async () => {
  const validate = await buildValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/invalid-ai-extraction-job-unsupported-enum.json",
  );

  assert.equal(validate(sample), false);
  assert.equal(
    validate.errors?.some(
      (error) =>
        error.instancePath === "/status" &&
        error.message?.includes("must be equal to one of the allowed values"),
    ),
    true,
  );
});

test("extracted-but-unreviewed output cannot be downstream_allowed", async () => {
  const validate = await buildValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/invalid-ai-extraction-job-unreviewed-downstream.json",
  );

  assert.equal(validate(sample), false);
});

test("downstream_allowed requires reviewed_approved status", async () => {
  const validate = await buildValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/ai-extraction-job-example.json",
  );

  const approved = {
    ...sample,
    status: "reviewed_approved",
    downstream_allowed: true,
  };
  assert.equal(validate(approved), true);

  const stillDraft = { ...sample, downstream_allowed: true };
  assert.equal(validate(stillDraft), false);
});

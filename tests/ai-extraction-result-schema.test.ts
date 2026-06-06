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
  const schema = await readJsonFixture(
    "schemas/ai-extraction-result.schema.json",
  );
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });

  return ajv.compile(schema);
}

const validFixtures = [
  "snapshots/pcram/ai-extraction-result-qwen-langgraph-draft-success.json",
  "snapshots/pcram/ai-extraction-result-qwen-langgraph-critic-flagged.json",
];

const invalidFixtures = [
  "snapshots/pcram/invalid-ai-extraction-result-downstream-allowed.json",
  "snapshots/pcram/invalid-ai-extraction-result-missing-required.json",
];

test("valid AI extraction result fixtures pass", async () => {
  const validate = await buildValidator();

  for (const fixture of validFixtures) {
    const sample = await readJsonFixture(fixture);
    assert.equal(validate(sample), true, fixture);
  }
});

test("invalid AI extraction result fixtures fail", async () => {
  const validate = await buildValidator();

  for (const fixture of invalidFixtures) {
    const sample = await readJsonFixture(fixture);
    assert.equal(validate(sample), false, fixture);
  }
});

test("AI extraction results are always draft-only and review-gated", async () => {
  for (const fixture of validFixtures) {
    const sample = await readJsonFixture(fixture);
    assert.equal(sample["human_review_required"], true, fixture);
    assert.equal(sample["downstream_allowed"], false, fixture);
    assert.match(String(sample["critic_summary"]), /./);
  }
});

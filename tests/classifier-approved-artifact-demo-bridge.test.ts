import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

async function buildValidator(schemaPath: string): Promise<ValidateFunction> {
  const schema = await readJsonFixture(schemaPath);
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });

  return ajv.compile(schema);
}

async function assertFixtureValid(
  schemaPath: string,
  fixturePath: string,
): Promise<Record<string, unknown>> {
  const validate = await buildValidator(schemaPath);
  const fixture = await readJsonFixture(fixturePath);
  const isValid = validate(fixture);

  assert.equal(
    isValid,
    true,
    `${fixturePath} should validate against ${schemaPath}: ${JSON.stringify(
      validate.errors,
    )}`,
  );

  return fixture;
}

test("classifier-support demo fixtures are schema-valid", async () => {
  await assertFixtureValid(
    "schemas/relevance-assessment.schema.json",
    "snapshots/pcram/demo-classifier-support-relevance-assessment.json",
  );
  await assertFixtureValid(
    "schemas/review-manifest.schema.json",
    "snapshots/pcram/demo-classifier-support-review-manifest.json",
  );
  await assertFixtureValid(
    "schemas/approved-artifact.schema.json",
    "snapshots/pcram/demo-classifier-support-approved-artifact.json",
  );
});

test("approved demo artifact points to reviewed classifier support content by hash", async () => {
  const artifact = await assertFixtureValid(
    "schemas/approved-artifact.schema.json",
    "snapshots/pcram/demo-classifier-support-approved-artifact.json",
  );
  const assessment = await assertFixtureValid(
    "schemas/relevance-assessment.schema.json",
    "snapshots/pcram/demo-classifier-support-relevance-assessment.json",
  );
  const reviewManifest = await assertFixtureValid(
    "schemas/review-manifest.schema.json",
    "snapshots/pcram/demo-classifier-support-review-manifest.json",
  );

  const contentRef = artifact["content_ref"];
  assert.equal(
    contentRef,
    "snapshots/pcram/demo-classifier-support-relevance-assessment.json",
  );

  const content = await readUtf8File(path.resolve(process.cwd(), contentRef));
  const contentHash = createHash("sha256").update(content).digest("hex");

  assert.equal(artifact["content_hash"], `sha256:${contentHash}`);
  assert.equal(artifact["review_status"], "approved");
  assert.equal(artifact["downstream_allowed"], true);
  assert.equal(assessment["requires_human_review"], true);
  assert.equal(assessment["review_status"], "approved");
  assert.equal(
    assessment["review_manifest_ref"],
    reviewManifest["review_manifest_id"],
  );
  assert.equal(
    artifact["review_manifest_ref"],
    reviewManifest["review_manifest_id"],
  );
});

test("demo bridge report documents evidence, inference, review, and coupling boundaries", async () => {
  const report = await readUtf8File(
    path.resolve(
      process.cwd(),
      "reports/classifier-approved-artifact-demo-bridge-p1.md",
    ),
  );

  for (const requiredText of [
    "approved-artifact-classifier-support-ar-textiles-2026-05-21",
    "Argentina / MERCOSUR",
    "Verified Evidence vs AI Inference",
    "Human review requirement",
    "No direct vLatamGlobal connection was created.",
    "No shared database assumption was introduced.",
    "No raw LLM output is marked as an approved artifact.",
    "future read-only reviewed-artifact API/export contract",
  ]) {
    assert.equal(
      report.includes(requiredText),
      true,
      `Expected report to include: ${requiredText}`,
    );
  }
});

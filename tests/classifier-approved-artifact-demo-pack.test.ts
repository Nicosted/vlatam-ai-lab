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

const exportSchemaPath =
  "schemas/classifier-approved-artifact-export-contract.schema.json";
const exportFixturePath =
  "snapshots/pcram/demo-classifier-decision-export-contract.json";

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

test("classifier decision demo pack fixtures are schema-valid", async () => {
  await assertFixtureValid(
    "schemas/relevance-assessment.schema.json",
    "snapshots/pcram/demo-classifier-decision-relevance-assessment.json",
  );
  await assertFixtureValid(
    "schemas/review-manifest.schema.json",
    "snapshots/pcram/demo-classifier-decision-review-manifest.json",
  );
  await assertFixtureValid(
    "schemas/approved-artifact.schema.json",
    "snapshots/pcram/demo-classifier-decision-approved-artifact.json",
  );
  await assertFixtureValid(exportSchemaPath, exportFixturePath);
});

test("approved decision artifact binds reviewed classification candidate by hash", async () => {
  const artifact = await assertFixtureValid(
    "schemas/approved-artifact.schema.json",
    "snapshots/pcram/demo-classifier-decision-approved-artifact.json",
  );
  const assessment = await assertFixtureValid(
    "schemas/relevance-assessment.schema.json",
    "snapshots/pcram/demo-classifier-decision-relevance-assessment.json",
  );
  const reviewManifest = await assertFixtureValid(
    "schemas/review-manifest.schema.json",
    "snapshots/pcram/demo-classifier-decision-review-manifest.json",
  );

  const contentRef = artifact["content_ref"];
  assert.equal(
    contentRef,
    "snapshots/pcram/demo-classifier-decision-relevance-assessment.json",
  );

  const content = await readUtf8File(path.resolve(process.cwd(), contentRef));
  const contentHash = createHash("sha256").update(content).digest("hex");

  assert.equal(artifact["content_hash"], `sha256:${contentHash}`);
  assert.equal(artifact["review_status"], "approved");
  assert.equal(artifact["downstream_allowed"], true);
  assert.equal(assessment["requires_human_review"], true);
  assert.equal(assessment["review_status"], "approved");
  assert.deepEqual(assessment["affected_codes"], ["8507.60.00", "8504.40.90"]);
  assert.equal(
    assessment["review_manifest_ref"],
    reviewManifest["review_manifest_id"],
  );
  assert.equal(
    artifact["review_manifest_ref"],
    reviewManifest["review_manifest_id"],
  );
  assert.equal(reviewManifest["review_status"], "approved");
  assert.equal(reviewManifest["downstream_allowed"], true);
});

test("export contract exposes the approved decision artifact as downstream eligible", async () => {
  const exportContract = await assertFixtureValid(
    exportSchemaPath,
    exportFixturePath,
  );
  const artifacts = exportContract["artifacts"];
  assert.ok(Array.isArray(artifacts));
  const artifact = artifacts[0] as Record<string, unknown>;

  assert.equal(
    artifact["artifact_id"],
    "approved-artifact-classifier-decision-br-liion-2026-06-04",
  );
  assert.deepEqual(artifact["jurisdiction_scope"], ["Brazil", "MERCOSUR"]);
  assert.equal(artifact["review_status"], "approved");
  assert.equal(artifact["approval_state"], "approved");
  assert.equal(artifact["human_review_required"], true);
  assert.equal(artifact["downstream_eligible"], true);
  assert.equal(artifact["risk_posture"], "high");

  const boundary = exportContract["integration_boundary"] as Record<
    string,
    unknown
  >;
  assert.equal(boundary["integration_mode"], "local_export_fixture");
  assert.equal(boundary["read_only"], true);
  assert.equal(boundary["live_integration"], false);
  assert.equal(boundary["shared_database_coupling"], false);
  assert.equal(boundary["production_api_route"], false);
  assert.equal(boundary["runtime_writeback"], false);
  assert.equal(boundary["raw_llm_output_included"], false);
});

test("unreviewed decision artifact cannot be marked downstream eligible", async () => {
  const validate = await buildValidator(exportSchemaPath);
  const invalid = await readJsonFixture(
    "snapshots/pcram/invalid-classifier-decision-export-contract-unreviewed-eligible.json",
  );
  const isValid = validate(invalid);

  assert.equal(isValid, false);
  assert.equal(
    validate.errors?.some(
      (error) =>
        error.instancePath === "/artifacts/0/downstream_eligible" &&
        error.message?.includes("must be equal to constant"),
    ),
    true,
  );
});

test("demo pack report separates evidence, inference, review, and deferred integration", async () => {
  const report = await readUtf8File(
    path.resolve(
      process.cwd(),
      "reports/classifier-approved-artifact-demo-pack-p1.md",
    ),
  );

  for (const requiredText of [
    "approved-artifact-classifier-decision-br-liion-2026-06-04",
    "Brazil / MERCOSUR",
    "8507.60.00",
    "### 1. Approved evidence",
    "### 2. AI inference",
    "### 3. Human review",
    "### 4. Deferred runtime integration",
    "No unreviewed material is marked downstream-ready",
  ]) {
    assert.equal(
      report.includes(requiredText),
      true,
      `Expected report to include: ${requiredText}`,
    );
  }
});

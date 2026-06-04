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

const schemaPath =
  "schemas/classifier-approved-artifact-export-contract.schema.json";
const validFixturePath =
  "snapshots/pcram/demo-classifier-approved-artifact-export-contract.json";

async function readJsonFixture(
  relativePath: string,
): Promise<Record<string, unknown>> {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const content = await readUtf8File(absolutePath);

  return JSON.parse(content) as Record<string, unknown>;
}

async function buildValidator(): Promise<ValidateFunction> {
  const schema = await readJsonFixture(schemaPath);
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });

  return ajv.compile(schema);
}

async function assertExportFixtureValid(
  fixturePath = validFixturePath,
): Promise<Record<string, unknown>> {
  const validate = await buildValidator();
  const fixture = await readJsonFixture(fixturePath);
  const isValid = validate(fixture);

  assert.equal(
    isValid,
    true,
    `${fixturePath} should validate: ${JSON.stringify(validate.errors)}`,
  );

  return fixture;
}

function firstArtifact(exportContract: Record<string, unknown>) {
  const artifacts = exportContract["artifacts"];

  assert.equal(Array.isArray(artifacts), true);
  assert.ok(Array.isArray(artifacts));
  assert.equal(artifacts.length > 0, true);

  return artifacts[0] as Record<string, unknown>;
}

test("classifier export contract fixture is schema-valid", async () => {
  await assertExportFixtureValid();
});

test("export contract exposes only approved and reviewed artifact eligibility", async () => {
  const exportContract = await assertExportFixtureValid();
  const artifact = firstArtifact(exportContract);
  const approvedArtifact = await readJsonFixture(
    "snapshots/pcram/demo-classifier-support-approved-artifact.json",
  );
  const reviewManifest = await readJsonFixture(
    "snapshots/pcram/demo-classifier-support-review-manifest.json",
  );
  const relevanceAssessment = await readJsonFixture(
    "snapshots/pcram/demo-classifier-support-relevance-assessment.json",
  );

  assert.equal(artifact["artifact_id"], approvedArtifact["artifact_id"]);
  assert.equal(
    artifact["artifact_version"],
    approvedArtifact["schema_version"],
  );
  assert.equal(artifact["artifact_type"], approvedArtifact["artifact_type"]);
  assert.deepEqual(
    artifact["country_scope"],
    relevanceAssessment["country_scope"],
  );
  assert.equal(artifact["review_status"], "approved");
  assert.equal(artifact["approval_state"], "approved");
  assert.equal(artifact["human_review_required"], true);
  assert.equal(artifact["downstream_eligible"], true);
  assert.equal(reviewManifest["review_status"], "approved");
  assert.equal(reviewManifest["downstream_allowed"], true);
});

test("draft or unreviewed artifacts cannot be marked downstream eligible", async () => {
  const validate = await buildValidator();
  const invalid = await readJsonFixture(
    "snapshots/pcram/invalid-classifier-export-contract-draft-eligible.json",
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

test("source traceability, jurisdiction scope, and contract version are explicit", async () => {
  const exportContract = await assertExportFixtureValid();
  const artifact = firstArtifact(exportContract);
  const traceability = artifact["source_traceability"] as Record<
    string,
    unknown
  >;

  assert.equal(exportContract["contract_schema_version"], "1.0.0");
  assert.equal(artifact["contract_schema_version"], "1.0.0");
  assert.deepEqual(artifact["jurisdiction_scope"], ["Argentina", "MERCOSUR"]);
  assert.equal(
    Array.isArray(traceability["source_version_refs"]) &&
      traceability["source_version_refs"].length > 0,
    true,
  );
  assert.equal(
    traceability["review_manifest_ref"],
    "review-manifest-classifier-support-ar-textiles-2026-05-21",
  );
  assert.equal(
    traceability["content_ref"],
    "snapshots/pcram/demo-classifier-support-relevance-assessment.json",
  );
  assert.match(String(traceability["content_hash"]), /^sha256:[a-f0-9]{64}$/);
  assert.equal(
    Array.isArray(traceability["evidence_refs"]) &&
      traceability["evidence_refs"].length > 0,
    true,
  );
});

test("export fixture rejects live integration and shared database coupling", async () => {
  const exportContract = await assertExportFixtureValid();
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

  const validate = await buildValidator();
  const invalid = await readJsonFixture(
    "snapshots/pcram/invalid-classifier-export-contract-live-coupling.json",
  );
  const isValid = validate(invalid);

  assert.equal(isValid, false);
  assert.equal(
    validate.errors?.some(
      (error) =>
        error.instancePath === "/integration_boundary/live_integration" &&
        error.message?.includes("must be equal to constant"),
    ),
    true,
  );
});

test("export contract report documents future consumption and runtime boundary", async () => {
  const report = await readUtf8File(
    path.resolve(
      process.cwd(),
      "reports/classifier-approved-artifact-export-contract-p1.md",
    ),
  );

  for (const requiredText of [
    "read-only index of approved artifact references",
    "No live vLatamGlobal integration.",
    "No shared database access or database synchronization.",
    "No raw LLM output delivery as downstream classifier input.",
    "AI Lab / Runtime boundary",
  ]) {
    assert.equal(
      report.includes(requiredText),
      true,
      `Expected report to include: ${requiredText}`,
    );
  }
});

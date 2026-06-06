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
    "schemas/snapshot-review-manifest.schema.json",
  );
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });

  return ajv.compile(schema);
}

const validFixtures = [
  "snapshots/pcram/snapshot-review-manifest-wco-hs-2022.json",
  "snapshots/pcram/snapshot-review-manifest-mercosur-ncm-aec.json",
  "snapshots/pcram/snapshot-review-manifest-ar-decreto-557-2023.json",
  "snapshots/pcram/snapshot-review-manifest-ar-arca-arancel.json",
];

const invalidFixtures = [
  "snapshots/pcram/invalid-snapshot-review-manifest-extraction-without-review.json",
  "snapshots/pcram/invalid-snapshot-review-manifest-extraction-missing-gates.json",
  "snapshots/pcram/invalid-snapshot-review-manifest-downstream-without-approval.json",
  "snapshots/pcram/invalid-snapshot-review-manifest-missing-snapshot-id.json",
];

const extractionAllowingFixtures = new Set([
  "snapshots/pcram/snapshot-review-manifest-wco-hs-2022.json",
  "snapshots/pcram/snapshot-review-manifest-mercosur-ncm-aec.json",
]);

test("valid review manifest fixtures pass", async () => {
  const validate = await buildValidator();

  for (const fixture of validFixtures) {
    const sample = await readJsonFixture(fixture);
    assert.equal(validate(sample), true, fixture);
  }
});

test("invalid review manifest fixtures fail", async () => {
  const validate = await buildValidator();

  for (const fixture of invalidFixtures) {
    const sample = await readJsonFixture(fixture);
    assert.equal(validate(sample), false, fixture);
  }
});

test("valid review manifests are conservative about review and downstream", async () => {
  for (const fixture of validFixtures) {
    const sample = await readJsonFixture(fixture);
    assert.equal(sample["human_review_required"], true, fixture);
    assert.equal(sample["downstream_allowed"], false, fixture);
  }
});

test("extraction is only allowed where the manifest explicitly supports it", async () => {
  for (const fixture of validFixtures) {
    const sample = await readJsonFixture(fixture);
    const expected = extractionAllowingFixtures.has(fixture);
    assert.equal(sample["extraction_allowed"], expected, fixture);
  }
});

test("an approved review status alone does not grant extraction", async () => {
  // ARCA manifest is approved but version_scope is unverified -> extraction blocked.
  const arca = await readJsonFixture(
    "snapshots/pcram/snapshot-review-manifest-ar-arca-arancel.json",
  );
  assert.equal(arca["review_status"], "approved");
  assert.equal(arca["version_scope_verified"], false);
  assert.equal(arca["extraction_allowed"], false);
});

test("extraction_allowed requires approved review status", async () => {
  const validate = await buildValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/snapshot-review-manifest-wco-hs-2022.json",
  );

  const notReviewed = {
    ...sample,
    review_status: "not_reviewed",
  };
  assert.equal(validate(notReviewed), false);
});

test("downstream_allowed requires a classifier approval reference", async () => {
  const validate = await buildValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/snapshot-review-manifest-wco-hs-2022.json",
  );

  const downstreamNoApproval = {
    ...sample,
    downstream_allowed: true,
  };
  assert.equal(validate(downstreamNoApproval), false);

  const downstreamWithApproval = {
    ...sample,
    downstream_allowed: true,
    classifier_approval_reference: "classifier-approval-record-001",
  };
  assert.equal(validate(downstreamWithApproval), true);
});

test("waived fingerprint requires an explicit warning to allow extraction", async () => {
  const validate = await buildValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/snapshot-review-manifest-wco-hs-2022.json",
  );

  // Removing the waiver warning while fingerprint is unverified blocks extraction.
  const noWaiver = { ...sample };
  delete noWaiver["warnings"];
  assert.equal(validate(noWaiver), false);
});

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
    "schemas/extractable-evidence-packet.schema.json",
  );
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });

  return ajv.compile(schema);
}

const validFixtures = [
  "snapshots/pcram/extractable-evidence-packet-wco-hs-2022.json",
  "snapshots/pcram/extractable-evidence-packet-mercosur-ncm-aec.json",
  "snapshots/pcram/extractable-evidence-packet-ar-decreto-557-2023.json",
  "snapshots/pcram/extractable-evidence-packet-demo-embedded-evidence.json",
];

const invalidFixtures = [
  "snapshots/pcram/invalid-extractable-evidence-packet-missing-review-manifest-id.json",
  "snapshots/pcram/invalid-extractable-evidence-packet-missing-snapshot-id.json",
  "snapshots/pcram/invalid-extractable-evidence-packet-extraction-without-reference.json",
  "snapshots/pcram/invalid-extractable-evidence-packet-downstream-without-approval.json",
];

test("valid evidence packet fixtures pass", async () => {
  const validate = await buildValidator();

  for (const fixture of validFixtures) {
    const sample = await readJsonFixture(fixture);
    assert.equal(validate(sample), true, fixture);
  }
});

test("invalid evidence packet fixtures fail", async () => {
  const validate = await buildValidator();

  for (const fixture of invalidFixtures) {
    const sample = await readJsonFixture(fixture);
    assert.equal(validate(sample), false, fixture);
  }
});

test("evidence packets remain non-downstream-safe by default", async () => {
  for (const fixture of validFixtures) {
    const sample = await readJsonFixture(fixture);
    assert.equal(sample["downstream_allowed"], false, fixture);
    assert.equal(sample["human_review_required"], true, fixture);
  }
});

test("extraction-ready packets carry a bounded evidence reference", async () => {
  for (const fixture of validFixtures) {
    const sample = await readJsonFixture(fixture);
    if (sample["extraction_allowed"] === true) {
      const hasReference = Boolean(
        sample["content_reference"] ||
        sample["excerpt_reference"] ||
        sample["content_fingerprint"],
      );
      assert.equal(hasReference, true, fixture);
    }
  }
});

test("extraction readiness without a reference fails", async () => {
  const validate = await buildValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/invalid-extractable-evidence-packet-extraction-without-reference.json",
  );
  assert.equal(validate(sample), false);
});

test("downstream_allowed requires a classifier approval reference", async () => {
  const validate = await buildValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/extractable-evidence-packet-wco-hs-2022.json",
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

test("fixtures stay honest about warnings and limitations", async () => {
  for (const fixture of validFixtures) {
    const sample = await readJsonFixture(fixture);
    assert.equal(Array.isArray(sample["limitations"]), true, fixture);
    assert.equal((sample["limitations"] as string[]).length > 0, true, fixture);
  }
});

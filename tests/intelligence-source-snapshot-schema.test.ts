import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

import type { ValidateFunction } from "ajv";

import { readUtf8File } from "../src/lib/fs.js";
import {
  deriveSnapshotReviewGate,
  isSnapshotDownstreamAllowed,
  isSnapshotExtractionReady,
} from "../src/intelligence/snapshot-capture.js";
import type { SourceSnapshot } from "../src/intelligence/types.js";

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
    "schemas/intelligence-source-snapshot.schema.json",
  );
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });

  return ajv.compile(schema);
}

test("valid snapshot fixture passes", async () => {
  const validate = await buildValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/intelligence-source-snapshot-example.json",
  );

  assert.equal(validate(sample), true);
});

test("missing required field fails", async () => {
  const validate = await buildValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/invalid-intelligence-source-snapshot-missing-required.json",
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

test("unsupported capture_method fails", async () => {
  const validate = await buildValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/invalid-intelligence-source-snapshot-unsupported-enum.json",
  );

  assert.equal(validate(sample), false);
  assert.equal(
    validate.errors?.some(
      (error) =>
        error.instancePath === "/capture_method" &&
        error.message?.includes("must be equal to one of the allowed values"),
    ),
    true,
  );
});

test("unreviewed snapshot marked downstream_allowed is rejected", async () => {
  const validate = await buildValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/invalid-intelligence-source-snapshot-unreviewed-downstream.json",
  );

  assert.equal(validate(sample), false);
});

const officialSnapshotFixtures = [
  "snapshots/pcram/intelligence-source-snapshot-wco-hs-2022-official.json",
  "snapshots/pcram/intelligence-source-snapshot-mercosur-ncm-aec-official.json",
  "snapshots/pcram/intelligence-source-snapshot-ar-decreto-557-2023-official.json",
  "snapshots/pcram/intelligence-source-snapshot-ar-arca-arancel-official.json",
];

const argentinaCandidateSnapshotFixtures = [
  "snapshots/pcram/intelligence-source-snapshot-ar-customs-tariff-candidate.json",
  "snapshots/pcram/intelligence-source-snapshot-mercosur-ncm-candidate.json",
  "snapshots/pcram/intelligence-source-snapshot-wco-hs-candidate.json",
  "snapshots/pcram/intelligence-source-snapshot-ar-sectoral-placeholder-candidate.json",
];

const forbiddenCandidatePatterns: RegExp[] = [
  /process\.env/i,
  /\$\{[^}]*\}/,
  /\$[A-Z][A-Z0-9_]+/,
  /\b[A-Z][A-Z0-9_]*(?:API|PROJECT|SERVICE|ANON)?_KEY\b/,
  /(^|[/\\])\.env(?:\b|[._-])/i,
  /\bsupabase\b/i,
  /project[_-]?ref/i,
  /service[_-]?role/i,
  /anon[_-]?key/i,
  /api[_-]?key/i,
  /authorization/i,
  /bearer\s+[a-z0-9._-]+/i,
  /credential/i,
  /provider[_-]?metadata/i,
  /model[_-]?provider/i,
  /raw[_-]?llm/i,
  /\/Users\//i,
  /\/private\//i,
  /\/home\//i,
];

for (const fixture of officialSnapshotFixtures) {
  test(`official-source snapshot fixture passes validation: ${fixture}`, async () => {
    const validate = await buildValidator();
    const sample = await readJsonFixture(fixture);

    assert.equal(validate(sample), true);
  });
}

test("official-source snapshots are conservative and not downstream-safe", async () => {
  for (const fixture of officialSnapshotFixtures) {
    const sample = await readJsonFixture(fixture);

    assert.equal(sample.human_review_required, true, fixture);
    assert.equal(sample.downstream_allowed, false, fixture);
    assert.equal(sample.review_status, "not_reviewed", fixture);
    assert.equal(sample.extraction_status, "not_started", fixture);
    assert.notEqual(sample.freshness_status, "current", fixture);
  }
});

for (const fixture of argentinaCandidateSnapshotFixtures) {
  test(`Argentina candidate snapshot fixture passes validation: ${fixture}`, async () => {
    const validate = await buildValidator();
    const sample = await readJsonFixture(fixture);

    assert.equal(validate(sample), true);
  });
}

test("Argentina candidate snapshots require review before extraction or downstream use", async () => {
  for (const fixture of argentinaCandidateSnapshotFixtures) {
    const sample = await readJsonFixture(fixture);
    const snapshot = sample as unknown as SourceSnapshot;
    const metadata = sample["metadata"] as Record<string, unknown>;

    assert.equal(sample["freshness_status"], "requires_review", fixture);
    assert.equal(sample["review_status"], "not_reviewed", fixture);
    assert.equal(sample["extraction_status"], "not_started", fixture);
    assert.equal(sample["human_review_required"], true, fixture);
    assert.equal(sample["downstream_allowed"], false, fixture);
    assert.equal(metadata["candidate_status"], "requires_human_review_before_capture", fixture);
    assert.equal(metadata["content_ingested"], false, fixture);
    assert.equal(metadata["raw_body_included"], false, fixture);
    assert.equal(metadata["extraction_ready"], false, fixture);
    assert.equal(metadata["export_eligible"], false, fixture);
    assert.equal(metadata["production_ready"], false, fixture);
    assert.equal(deriveSnapshotReviewGate(snapshot), "review_required", fixture);
    assert.equal(isSnapshotExtractionReady(snapshot), false, fixture);
    assert.equal(isSnapshotDownstreamAllowed(snapshot), false, fixture);
  }
});

test("Argentina candidate snapshots contain no live coupling, secret, provider, raw output, or local path markers", async () => {
  for (const fixture of argentinaCandidateSnapshotFixtures) {
    const sample = await readJsonFixture(fixture);
    const serialized = JSON.stringify(sample);

    for (const pattern of forbiddenCandidatePatterns) {
      assert.equal(pattern.test(serialized), false, `${fixture} contains ${pattern}`);
    }
  }
});

test("missing captured_at fails", async () => {
  const validate = await buildValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/invalid-intelligence-source-snapshot-missing-captured-at.json",
  );

  assert.equal(validate(sample), false);
});

test("missing locator/reference fails", async () => {
  const validate = await buildValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/invalid-intelligence-source-snapshot-missing-locator.json",
  );

  assert.equal(validate(sample), false);
});

test("downstream_allowed with non-current freshness is rejected", async () => {
  const validate = await buildValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/invalid-intelligence-source-snapshot-downstream-stale-freshness.json",
  );

  assert.equal(validate(sample), false);
});

test("credential-like unknown fields are rejected", async () => {
  const validate = await buildValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/intelligence-source-snapshot-example.json",
  );

  for (const field of ["api_key", "token", "password", "secret"]) {
    const invalid = { ...sample, [field]: "redacted" };
    assert.equal(validate(invalid), false, `Expected rejection for ${field}`);
  }
});

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

import type { ErrorObject, ValidateFunction } from "ajv";

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

function hasAdditionalPropertyError(
  errors: ErrorObject[] | null | undefined,
  propertyName: string,
): boolean {
  if (!errors) {
    return false;
  }

  return errors.some(
    (error) =>
      error.keyword === "additionalProperties" &&
      (error.params as { additionalProperty?: string }).additionalProperty ===
        propertyName,
  );
}

async function buildEvidenceReportMetadataValidator(): Promise<ValidateFunction> {
  const schema = await readJsonFixture(
    "schemas/evidence-report-metadata.schema.json",
  );
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });

  return ajv.compile(schema);
}

test("valid evidence report metadata example passes", async () => {
  const validate = await buildEvidenceReportMetadataValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-evidence-report-metadata.json",
  );

  const isValid = validate(sample);

  assert.equal(isValid, true);
});

test("missing required field fails", async () => {
  const validate = await buildEvidenceReportMetadataValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-evidence-report-metadata.json",
  );
  const invalid = { ...sample };
  delete invalid["approved_artifact_ref"];

  const isValid = validate(invalid);

  assert.equal(isValid, false);
  assert.equal(
    validate.errors?.some(
      (error) =>
        error.instancePath === "" &&
        error.message?.includes("must have required property"),
    ),
    true,
  );
});

test("invalid report_type fails", async () => {
  const validate = await buildEvidenceReportMetadataValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-evidence-report-metadata.json",
  );
  const invalid = {
    ...sample,
    report_type: "generic_evidence",
  };

  const isValid = validate(invalid);

  assert.equal(isValid, false);
  assert.equal(
    validate.errors?.some(
      (error) =>
        error.instancePath === "/report_type" &&
        error.message?.includes("must be equal to one of the allowed values"),
    ),
    true,
  );
});

test("invalid risk_level fails", async () => {
  const validate = await buildEvidenceReportMetadataValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-evidence-report-metadata.json",
  );
  const invalid = {
    ...sample,
    risk_level: "severe",
  };

  const isValid = validate(invalid);

  assert.equal(isValid, false);
  assert.equal(
    validate.errors?.some(
      (error) =>
        error.instancePath === "/risk_level" &&
        error.message?.includes("must be equal to one of the allowed values"),
    ),
    true,
  );
});

test("human_review_required must be boolean", async () => {
  const validate = await buildEvidenceReportMetadataValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-evidence-report-metadata.json",
  );
  const invalid = {
    ...sample,
    human_review_required: "true",
  };

  const isValid = validate(invalid);

  assert.equal(isValid, false);
  assert.equal(
    validate.errors?.some(
      (error) =>
        error.instancePath === "/human_review_required" &&
        error.message?.includes("must be boolean"),
    ),
    true,
  );
});

test("empty source_version_refs fails", async () => {
  const validate = await buildEvidenceReportMetadataValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-evidence-report-metadata.json",
  );
  const invalid = {
    ...sample,
    source_version_refs: [],
  };

  const isValid = validate(invalid);

  assert.equal(isValid, false);
  assert.equal(
    validate.errors?.some(
      (error) =>
        error.instancePath === "/source_version_refs" &&
        error.message?.includes("must NOT have fewer than 1 items"),
    ),
    true,
  );
});

test("raw markdown body fields are rejected as unknown top-level fields", async () => {
  const validate = await buildEvidenceReportMetadataValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-evidence-report-metadata.json",
  );

  for (const rawBodyField of ["markdown_body", "body"]) {
    const invalid = {
      ...sample,
      [rawBodyField]: "# Raw markdown body should not be embedded",
    };

    const isValid = validate(invalid);

    assert.equal(isValid, false);
    assert.equal(
      hasAdditionalPropertyError(validate.errors, rawBodyField),
      true,
      `Expected additionalProperties error for ${rawBodyField}`,
    );
  }
});

test("credential-like unknown fields are rejected", async () => {
  const validate = await buildEvidenceReportMetadataValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-evidence-report-metadata.json",
  );

  for (const credentialLikeField of [
    "api_key",
    "token",
    "password",
    "secret",
  ]) {
    const invalid = {
      ...sample,
      [credentialLikeField]: "redacted",
    };

    const isValid = validate(invalid);

    assert.equal(isValid, false);
    assert.equal(
      hasAdditionalPropertyError(validate.errors, credentialLikeField),
      true,
      `Expected additionalProperties error for ${credentialLikeField}`,
    );
  }
});

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

async function buildApprovedArtifactValidator(): Promise<ValidateFunction> {
  const schema = await readJsonFixture("schemas/approved-artifact.schema.json");
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });

  return ajv.compile(schema);
}

test("valid approved artifact example passes", async () => {
  const validate = await buildApprovedArtifactValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-approved-artifact.json",
  );

  const isValid = validate(sample);

  assert.equal(isValid, true);
});

test("missing required field fails", async () => {
  const validate = await buildApprovedArtifactValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/invalid-approved-artifact-missing-required.json",
  );

  const isValid = validate(sample);

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

test("invalid artifact_type fails", async () => {
  const validate = await buildApprovedArtifactValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/invalid-approved-artifact-unsupported-enum.json",
  );

  const isValid = validate(sample);

  assert.equal(isValid, false);
  assert.equal(
    validate.errors?.some(
      (error) =>
        error.instancePath === "/artifact_type" &&
        error.message?.includes("must be equal to one of the allowed values"),
    ),
    true,
  );
});

test("review_status only allows approved", async () => {
  const validate = await buildApprovedArtifactValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-approved-artifact.json",
  );
  const invalid = {
    ...sample,
    review_status: "pending",
  };

  const isValid = validate(invalid);

  assert.equal(isValid, false);
  assert.equal(
    validate.errors?.some(
      (error) =>
        error.instancePath === "/review_status" &&
        error.message?.includes("must be equal to one of the allowed values"),
    ),
    true,
  );
});

test("downstream_allowed must be boolean", async () => {
  const validate = await buildApprovedArtifactValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-approved-artifact.json",
  );
  const invalid = {
    ...sample,
    downstream_allowed: "true",
  };

  const isValid = validate(invalid);

  assert.equal(isValid, false);
  assert.equal(
    validate.errors?.some(
      (error) =>
        error.instancePath === "/downstream_allowed" &&
        error.message?.includes("must be boolean"),
    ),
    true,
  );
});

test("empty source_version_refs fails", async () => {
  const validate = await buildApprovedArtifactValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-approved-artifact.json",
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

test("credential-like unknown fields are rejected", async () => {
  const validate = await buildApprovedArtifactValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-approved-artifact.json",
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

test("raw content field is rejected as unknown top-level field", async () => {
  const validate = await buildApprovedArtifactValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-approved-artifact.json",
  );
  const invalid = {
    ...sample,
    content: {
      arbitrary: "raw body should not be embedded",
    },
  };

  const isValid = validate(invalid);

  assert.equal(isValid, false);
  assert.equal(hasAdditionalPropertyError(validate.errors, "content"), true);
});

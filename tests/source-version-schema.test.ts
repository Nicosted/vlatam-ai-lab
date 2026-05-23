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

async function buildSourceVersionValidator(): Promise<ValidateFunction> {
  const schema = await readJsonFixture("schemas/source-version.schema.json");
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });

  return ajv.compile(schema);
}

test("valid source version example passes", async () => {
  const validate = await buildSourceVersionValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-source-version.json",
  );

  const isValid = validate(sample);

  assert.equal(isValid, true);
});

test("missing required field fails", async () => {
  const validate = await buildSourceVersionValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-source-version.json",
  );
  const invalid = { ...sample };
  delete invalid["source_version_id"];

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

test("invalid source_type fails", async () => {
  const validate = await buildSourceVersionValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-source-version.json",
  );
  const invalid = {
    ...sample,
    source_type: "unsupported_source_type",
  };

  const isValid = validate(invalid);

  assert.equal(isValid, false);
  assert.equal(
    validate.errors?.some(
      (error) =>
        error.instancePath === "/source_type" &&
        error.message?.includes("must be equal to one of the allowed values"),
    ),
    true,
  );
});

test("invalid capture_method fails", async () => {
  const validate = await buildSourceVersionValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-source-version.json",
  );
  const invalid = {
    ...sample,
    capture_method: "scrape_live_site",
  };

  const isValid = validate(invalid);

  assert.equal(isValid, false);
  assert.equal(
    validate.errors?.some(
      (error) =>
        error.instancePath === "/capture_method" &&
        error.message?.includes("must be equal to one of the allowed values"),
    ),
    true,
  );
});

test("credential-like unknown fields are rejected", async () => {
  const validate = await buildSourceVersionValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-source-version.json",
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

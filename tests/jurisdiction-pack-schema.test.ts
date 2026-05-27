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

async function buildJurisdictionPackValidator(): Promise<ValidateFunction> {
  const schema = await readJsonFixture("schemas/jurisdiction-pack.schema.json");
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });

  return ajv.compile(schema);
}

test("valid jurisdiction pack example passes", async () => {
  const validate = await buildJurisdictionPackValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-jurisdiction-pack.json",
  );

  const isValid = validate(sample);

  assert.equal(isValid, true);
});

test("invalid jurisdiction pack missing ref fixture fails", async () => {
  const validate = await buildJurisdictionPackValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/invalid-jurisdiction-pack-missing-ref.json",
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

test("invalid jurisdiction pack unsupported enum fixture fails", async () => {
  const validate = await buildJurisdictionPackValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/invalid-jurisdiction-pack-unsupported-enum.json",
  );

  const isValid = validate(sample);

  assert.equal(isValid, false);
  assert.equal(
    validate.errors?.some(
      (error) =>
        error.instancePath === "/legal_system_scope" &&
        error.message?.includes("must be equal to one of the allowed values"),
    ),
    true,
  );
});

test("invalid jurisdiction pack additional property fixture fails", async () => {
  const validate = await buildJurisdictionPackValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/invalid-jurisdiction-pack-additional-property.json",
  );

  const isValid = validate(sample);

  assert.equal(isValid, false);
  assert.equal(
    hasAdditionalPropertyError(validate.errors, "internal_agent_chain_state"),
    true,
  );
});

test("required fields are enforced", async () => {
  const validate = await buildJurisdictionPackValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-jurisdiction-pack.json",
  );

  for (const requiredField of [
    "source_refs",
    "review_manifest_ref",
    "assumptions",
    "downstream_allowed",
  ]) {
    const invalid = { ...sample };
    delete invalid[requiredField];

    const isValid = validate(invalid);

    assert.equal(isValid, false);
    assert.equal(
      validate.errors?.some(
        (error) =>
          error.instancePath === "" &&
          error.message?.includes("must have required property"),
      ),
      true,
      `Expected required property error for ${requiredField}`,
    );
  }
});

test("unsupported enum values are rejected", async () => {
  const validate = await buildJurisdictionPackValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-jurisdiction-pack.json",
  );
  const invalid = {
    ...sample,
    status: "published_to_production",
  };

  const isValid = validate(invalid);

  assert.equal(isValid, false);
  assert.equal(
    validate.errors?.some(
      (error) =>
        error.instancePath === "/status" &&
        error.message?.includes("must be equal to one of the allowed values"),
    ),
    true,
  );
});

test("explicit jurisdiction pack arrays must not be empty", async () => {
  const validate = await buildJurisdictionPackValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-jurisdiction-pack.json",
  );
  const invalid = {
    ...sample,
    regulatory_source_families: [],
  };

  const isValid = validate(invalid);

  assert.equal(isValid, false);
  assert.equal(
    validate.errors?.some(
      (error) =>
        error.instancePath === "/regulatory_source_families" &&
        error.message?.includes("must NOT have fewer than 1 items"),
    ),
    true,
  );
});

test("additionalProperties is rejected at top level", async () => {
  const validate = await buildJurisdictionPackValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-jurisdiction-pack.json",
  );
  const invalid = {
    ...sample,
    production_runtime_state: "not allowed",
  };

  const isValid = validate(invalid);

  assert.equal(isValid, false);
  assert.equal(
    hasAdditionalPropertyError(validate.errors, "production_runtime_state"),
    true,
  );
});

test("raw source body fields are rejected as unknown top-level fields", async () => {
  const validate = await buildJurisdictionPackValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-jurisdiction-pack.json",
  );

  for (const rawBodyField of ["source_body", "raw_source_body"]) {
    const invalid = {
      ...sample,
      [rawBodyField]: "Raw source bodies should not be embedded.",
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
  const validate = await buildJurisdictionPackValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-jurisdiction-pack.json",
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

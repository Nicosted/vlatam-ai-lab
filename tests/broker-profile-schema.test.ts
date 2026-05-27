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

async function buildBrokerProfileValidator(): Promise<ValidateFunction> {
  const schema = await readJsonFixture("schemas/broker-profile.schema.json");
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });

  return ajv.compile(schema);
}

test("valid broker profile example passes", async () => {
  const validate = await buildBrokerProfileValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-broker-profile.json",
  );

  const isValid = validate(sample);

  assert.equal(isValid, true);
});

test("invalid broker profile missing required context fixture fails", async () => {
  const validate = await buildBrokerProfileValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/invalid-broker-profile-missing-context.json",
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

test("invalid broker profile unsupported style fixture fails", async () => {
  const validate = await buildBrokerProfileValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/invalid-broker-profile-unsupported-style.json",
  );

  const isValid = validate(sample);

  assert.equal(isValid, false);
  assert.equal(
    validate.errors?.some(
      (error) =>
        error.instancePath === "/preferred_information_style" &&
        error.message?.includes("must be equal to one of the allowed values"),
    ),
    true,
  );
  assert.equal(
    hasAdditionalPropertyError(validate.errors, "invented_preference"),
    true,
  );
});

test("required fields are enforced", async () => {
  const validate = await buildBrokerProfileValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-broker-profile.json",
  );

  for (const requiredField of [
    "profile_id",
    "topics_of_interest",
    "human_review_preferences",
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
  const validate = await buildBrokerProfileValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-broker-profile.json",
  );
  const invalid = {
    ...sample,
    risk_tolerance: "maximum_growth",
  };

  const isValid = validate(invalid);

  assert.equal(isValid, false);
  assert.equal(
    validate.errors?.some(
      (error) =>
        error.instancePath === "/risk_tolerance" &&
        error.message?.includes("must be equal to one of the allowed values"),
    ),
    true,
  );
});

test("explicit profile arrays must not be empty", async () => {
  const validate = await buildBrokerProfileValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-broker-profile.json",
  );
  const invalid = {
    ...sample,
    commodity_specializations: [],
  };

  const isValid = validate(invalid);

  assert.equal(isValid, false);
  assert.equal(
    validate.errors?.some(
      (error) =>
        error.instancePath === "/commodity_specializations" &&
        error.message?.includes("must NOT have fewer than 1 items"),
    ),
    true,
  );
});

test("additionalProperties is rejected at top level", async () => {
  const validate = await buildBrokerProfileValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-broker-profile.json",
  );
  const invalid = {
    ...sample,
    runtime_user_id: "user-123",
  };

  const isValid = validate(invalid);

  assert.equal(isValid, false);
  assert.equal(
    hasAdditionalPropertyError(validate.errors, "runtime_user_id"),
    true,
  );
});

test("additionalProperties is rejected inside human review preferences", async () => {
  const validate = await buildBrokerProfileValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-broker-profile.json",
  );
  const humanReviewPreferences = sample["human_review_preferences"] as Record<
    string,
    unknown
  >;
  const invalid = {
    ...sample,
    human_review_preferences: {
      ...humanReviewPreferences,
      reviewer_token: "redacted",
    },
  };

  const isValid = validate(invalid);

  assert.equal(isValid, false);
  assert.equal(
    hasAdditionalPropertyError(validate.errors, "reviewer_token"),
    true,
  );
});

test("credential-like unknown fields are rejected", async () => {
  const validate = await buildBrokerProfileValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-broker-profile.json",
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

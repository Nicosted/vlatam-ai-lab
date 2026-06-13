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

async function buildReviewManifestValidator(): Promise<ValidateFunction> {
  const schema = await readJsonFixture("schemas/review-manifest.schema.json");
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });

  return ajv.compile(schema);
}

test("valid review manifest example passes", async () => {
  const validate = await buildReviewManifestValidator();

  for (const fixture of [
    "snapshots/pcram/example-review-manifest.json",
    "snapshots/pcram/review-manifest-ar-demo-polyester-school-backpack.json",
  ]) {
    const sample = await readJsonFixture(fixture);
    const isValid = validate(sample);

    assert.equal(isValid, true, fixture);
  }
});

test("missing required field fails", async () => {
  const validate = await buildReviewManifestValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/invalid-review-manifest-missing-required.json",
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

test("invalid review_status fails", async () => {
  const validate = await buildReviewManifestValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/invalid-review-manifest-unsupported-enum.json",
  );

  const isValid = validate(sample);

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

test("invalid artifact_type fails", async () => {
  const validate = await buildReviewManifestValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-review-manifest.json",
  );
  const invalid = {
    ...sample,
    artifact_type: "broker_profile_context",
  };

  const isValid = validate(invalid);

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

test("downstream_allowed must be boolean", async () => {
  const validate = await buildReviewManifestValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-review-manifest.json",
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
  const validate = await buildReviewManifestValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-review-manifest.json",
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
  const validate = await buildReviewManifestValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/example-review-manifest.json",
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

test("argentina demo product review manifest remains pending and review-gated", async () => {
  const sample = await readJsonFixture(
    "snapshots/pcram/review-manifest-ar-demo-polyester-school-backpack.json",
  );
  const metadata = sample["metadata"] as Record<string, unknown>;

  assert.equal(sample["review_status"], "pending");
  assert.equal(sample["downstream_allowed"], false);
  assert.equal(metadata["artifact_under_review_type"], "ai_extraction_result");
  assert.equal(metadata["human_review_required"], true);
  assert.equal(metadata["approved"], false);
  assert.equal(metadata["export_eligible"], false);

  const missingFacts = metadata["missing_product_facts_to_confirm"] as string[];
  for (const requiredFact of [
    "exact material percentages",
    "coating or plastic layers",
    "dimensions",
    "accessories/components",
    "country of origin",
    "invoice/commercial description",
    "intended use confirmation",
  ]) {
    assert.ok(missingFacts.includes(requiredFact), requiredFact);
  }

  const deferred = metadata["deferred_determinations"] as string[];
  assert.ok(deferred.includes("final NCM/HS classification"));
  assert.ok(deferred.includes("customs/legal determination"));
});

test("argentina demo product review manifest has no live, secret, provider-metadata, raw-output, or path coupling", async () => {
  const sample = await readJsonFixture(
    "snapshots/pcram/review-manifest-ar-demo-polyester-school-backpack.json",
  );
  const serialized = JSON.stringify(sample);

  for (const forbidden of [
    /https?:\/\//i,
    /\bsupabase\b/i,
    /\bprocess\.env\b/i,
    /\$\{[^}]*\}/,
    /\$[A-Z][A-Z0-9_]+/,
    /\b[A-Z][A-Z0-9_]*(?:API|PROJECT|SERVICE|ANON)?_KEY\b/,
    /\b\.env(?:\b|[._-])/i,
    /\bproject[_-]?ref\b/i,
    /\bservice[_-]?role\b/i,
    /\banon[_-]?key\b/i,
    /\bapi[_-]?key\b/i,
    /\bauthorization\b/i,
    /\bbearer\s+[a-z0-9._-]+/i,
    /\bcredential/i,
    /\bprovider[_-]?metadata\b/i,
    /\braw\s+(?:llm|provider)\s+output\b/i,
    /\bmodel[_-]?provider\b/i,
    /\/Users\//,
    /\/private\//,
    /\bgraphify-out\b/i,
  ]) {
    assert.equal(forbidden.test(serialized), false, forbidden.toString());
  }
});

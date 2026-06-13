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
    "schemas/classifier-intelligence-artifact.schema.json",
  );
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });

  return ajv.compile(schema);
}

const validFixture =
  "snapshots/pcram/classifier-intelligence-artifact-demo-veldoria.json";
const validFixtures = [
  validFixture,
  "snapshots/pcram/classifier-intelligence-artifact-ar-demo-polyester-school-backpack-draft.json",
];

const invalidFixtures = [
  "snapshots/pcram/invalid-classifier-intelligence-artifact-synthetic-downstream.json",
  "snapshots/pcram/invalid-classifier-intelligence-artifact-missing-evidence.json",
  "snapshots/pcram/invalid-classifier-intelligence-artifact-downstream-without-review.json",
  "snapshots/pcram/invalid-classifier-intelligence-artifact-raw-llm-shape.json",
];

function review(sample: Record<string, unknown>): Record<string, unknown> {
  return sample["review"] as Record<string, unknown>;
}

function provenance(sample: Record<string, unknown>): Record<string, unknown> {
  return sample["provenance"] as Record<string, unknown>;
}

test("valid classifier intelligence artifact fixture passes", async () => {
  const validate = await buildValidator();

  for (const fixture of validFixtures) {
    const sample = await readJsonFixture(fixture);
    assert.equal(validate(sample), true, `${fixture}: ${JSON.stringify(validate.errors)}`);
  }
});

test("invalid classifier intelligence artifact fixtures fail", async () => {
  const validate = await buildValidator();

  for (const fixture of invalidFixtures) {
    const sample = await readJsonFixture(fixture);
    assert.equal(validate(sample), false, fixture);
  }
});

test("synthetic/demo artifact cannot be downstream allowed", async () => {
  const validate = await buildValidator();
  const sample = await readJsonFixture(validFixture);

  // Sanity: the demo fixture is synthetic and not downstream-safe.
  assert.equal(provenance(sample)["source_authority"], "synthetic_demo");
  assert.equal(review(sample)["downstream_allowed"], false);
  assert.equal(review(sample)["human_review_required"], true);

  // Flipping a synthetic artifact to downstream_allowed must fail, even when
  // every other approval-looking field is populated.
  const forced = structuredClone(sample);
  const forcedReview = review(forced);
  forcedReview["review_status"] = "reviewed_approved";
  forcedReview["reviewer"] = { reviewer_role: "demo-reviewer" };
  forcedReview["human_review_required"] = false;
  forcedReview["downstream_allowed"] = true;
  forcedReview["classifier_approval_reference"] = "approval-ref-001";
  assert.equal(validate(forced), false);
});

test("missing evidence fails validation", async () => {
  const validate = await buildValidator();
  const sample = await readJsonFixture(
    "snapshots/pcram/invalid-classifier-intelligence-artifact-missing-evidence.json",
  );
  assert.equal(validate(sample), false);
});

test("downstream eligibility requires explicit human review approval and an authoritative source", async () => {
  const validate = await buildValidator();
  const sample = await readJsonFixture(validFixture);

  // Build an authoritative (non-synthetic) variant from the demo shape.
  const authoritative = structuredClone(sample);
  const authoritativeProvenance = provenance(authoritative);
  authoritativeProvenance["origin"] = "internal_review";
  authoritativeProvenance["source_authority"] = "internal_review";
  for (const item of (authoritative["evidence"] as Record<string, unknown[]>)[
    "evidence_items"
  ] as Record<string, unknown>[]) {
    item["source_authority"] = "internal_review";
  }

  // Authoritative but still a draft and downstream-allowed -> must fail.
  const draftButDownstream = structuredClone(authoritative);
  const draftReview = review(draftButDownstream);
  draftReview["downstream_allowed"] = true;
  assert.equal(validate(draftButDownstream), false);

  // Fully approved, reviewed, authoritative, with approval reference -> passes.
  const approved = structuredClone(authoritative);
  const approvedReview = review(approved);
  approvedReview["review_status"] = "reviewed_approved";
  approvedReview["reviewer"] = {
    reviewer_role: "classification-reviewer",
    reviewer_id: "reviewer-demo-001",
  };
  approvedReview["human_review_required"] = false;
  approvedReview["downstream_allowed"] = true;
  approvedReview["classifier_approval_reference"] = "classifier-approval-001";
  assert.equal(validate(approved), true, JSON.stringify(validate.errors));

  // Approved + downstream but missing the classifier approval reference -> fails.
  const approvedNoRef = structuredClone(approved);
  delete review(approvedNoRef)["classifier_approval_reference"];
  assert.equal(validate(approvedNoRef), false);

  // Approved + downstream but missing reviewer -> fails.
  const approvedNoReviewer = structuredClone(approved);
  delete review(approvedNoReviewer)["reviewer"];
  assert.equal(validate(approvedNoReviewer), false);
});

test("raw provider/LLM response shape is not accepted as a classifier intelligence artifact", async () => {
  const validate = await buildValidator();
  const rawShape = await readJsonFixture(
    "snapshots/pcram/invalid-classifier-intelligence-artifact-raw-llm-shape.json",
  );
  assert.equal(validate(rawShape), false);

  // Even a well-formed artifact loses validity if the discriminator is wrong.
  const sample = await readJsonFixture(validFixture);
  const wrongKind = structuredClone(sample);
  wrongKind["artifact_kind"] = "qwen_recorded_response";
  assert.equal(validate(wrongKind), false);
});

test("artifact and schema versions follow semantic versioning", async () => {
  const validate = await buildValidator();
  const sample = await readJsonFixture(validFixture);
  const semver = /^\d+\.\d+\.\d+$/;
  assert.match(sample["schema_version"] as string, semver);
  assert.match(sample["artifact_version"] as string, semver);

  const badVersion = structuredClone(sample);
  badVersion["artifact_version"] = "1.0";
  assert.equal(validate(badVersion), false);
});

test("normalized claims stay traceable to evidence", async () => {
  const sample = await readJsonFixture(validFixture);
  const evidenceIds = new Set(
    (
      (sample["evidence"] as Record<string, unknown[]>)[
        "evidence_items"
      ] as Record<string, unknown>[]
    ).map((item) => item["evidence_id"] as string),
  );

  const claims = (sample["intelligence"] as Record<string, unknown[]>)[
    "normalized_claims"
  ] as Record<string, unknown>[];
  assert.equal(claims.length > 0, true);
  for (const claim of claims) {
    const refs = claim["evidence_refs"] as string[];
    assert.equal(refs.length > 0, true);
    for (const ref of refs) {
      assert.equal(evidenceIds.has(ref), true, `unknown evidence ref ${ref}`);
    }
  }
});

test("demo fixture stays honest and remains deterministic", async () => {
  const sample = await readJsonFixture(validFixture);

  assert.equal(provenance(sample)["source_authority"], "synthetic_demo");
  assert.equal(review(sample)["downstream_allowed"], false);
  assert.equal(review(sample)["human_review_required"], true);
  assert.equal(review(sample)["review_status"], "draft");

  const limitations = review(sample)["limitations"] as string[];
  assert.equal(limitations.length > 0, true);

  // Deterministic identifiers and timestamps for reproducible tests.
  assert.equal(
    sample["artifact_id"],
    "classifier-intelligence-artifact-demo-veldoria-2026-06-06t013000z",
  );
  assert.equal(sample["created_at"], "2026-06-06T01:30:00.000Z");
});

test("argentina classifier-support draft is not approved or export eligible", async () => {
  const sample = await readJsonFixture(
    "snapshots/pcram/classifier-intelligence-artifact-ar-demo-polyester-school-backpack-draft.json",
  );
  const sampleReview = review(sample);
  const sampleProvenance = provenance(sample);
  const intelligence = sample["intelligence"] as Record<string, unknown>;

  assert.equal(sampleProvenance["source_authority"], "unverified");
  assert.equal(sampleReview["review_status"], "draft");
  assert.equal(sampleReview["human_review_required"], true);
  assert.equal(sampleReview["downstream_allowed"], false);
  assert.equal(
    Object.hasOwn(intelligence, "candidate_classification"),
    false,
  );

  const implications = intelligence["classification_implications"] as string[];
  assert.ok(
    implications.some((value) => /No final or candidate NCM\/HS code/i.test(value)),
  );
});

test("argentina classifier-support draft has no live, secret, provider-metadata, raw-output, or path coupling", async () => {
  const sample = await readJsonFixture(
    "snapshots/pcram/classifier-intelligence-artifact-ar-demo-polyester-school-backpack-draft.json",
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

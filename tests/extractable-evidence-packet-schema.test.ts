import assert from "node:assert/strict";
import { access } from "node:fs/promises";
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
  "snapshots/pcram/extractable-evidence-packet-ar-demo-polyester-school-backpack.json",
];

const argentinaDemoProductPacket =
  "snapshots/pcram/extractable-evidence-packet-ar-demo-polyester-school-backpack.json";

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

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  assert.equal(typeof value, "object", label);
  assert.notEqual(value, null, label);

  return value as Record<string, unknown>;
}

function stringArray(value: unknown, label: string): string[] {
  assert.ok(Array.isArray(value), `${label} must be an array`);
  assert.ok(
    value.every((item) => typeof item === "string"),
    `${label} must contain only strings`,
  );

  return value as string[];
}

function assertRepoRelativePath(value: string, label: string): void {
  assert.equal(path.isAbsolute(value), false, `${label} must be relative`);
  assert.equal(path.posix.isAbsolute(value), false, `${label} must be relative`);
  assert.equal(value.startsWith("~"), false, `${label} must not use home refs`);
  assert.equal(value.includes("\\"), false, `${label} must use POSIX paths`);
  assert.equal(value.includes(".."), false, `${label} must not traverse`);
  assert.equal(
    /^[a-z][a-z0-9+.-]*:/i.test(value),
    false,
    `${label} must not use URL or protocol refs`,
  );
  assert.equal(value, path.posix.normalize(value), `${label} must normalize`);
}

async function assertExistingRepoFile(
  relativePath: string,
  label: string,
): Promise<void> {
  assertRepoRelativePath(relativePath, label);
  await access(path.resolve(process.cwd(), relativePath));
}

test("argentina demo product packet is review-gated and non-downstream-safe", async () => {
  const sample = await readJsonFixture(argentinaDemoProductPacket);
  const metadata = objectRecord(sample["metadata"], "metadata");
  const reviewGates = objectRecord(metadata["review_gates"], "review_gates");

  assert.equal(sample["extraction_allowed"], false);
  assert.equal(sample["extraction_status"], "not_started");
  assert.equal(sample["human_review_required"], true);
  assert.equal(sample["downstream_allowed"], false);
  assert.equal(reviewGates["requires_pr_d_review_manifest"], true);
  assert.equal(reviewGates["extraction_ready"], false);
  assert.equal(reviewGates["approved_classifier_artifact"], false);
  assert.equal(reviewGates["export_eligible"], false);
  assert.equal(reviewGates["downstream_safe"], false);
});

test("argentina demo product packet references only existing source files", async () => {
  const sample = await readJsonFixture(argentinaDemoProductPacket);
  const metadata = objectRecord(sample["metadata"], "metadata");
  const sourceReferences = metadata["source_references"];

  assert.ok(Array.isArray(sourceReferences));
  assert.equal(sourceReferences.length, 3);

  for (const [index, reference] of sourceReferences.entries()) {
    const sourceReference = objectRecord(reference, `source reference ${index}`);
    assert.equal(sourceReference["bounded_reference_only"], true);

    await assertExistingRepoFile(
      String(sourceReference["registry_ref"]),
      `registry_ref ${index}`,
    );
    await assertExistingRepoFile(
      String(sourceReference["snapshot_ref"]),
      `snapshot_ref ${index}`,
    );
  }
});

test("argentina demo product packet carries bounded product context only", async () => {
  const sample = await readJsonFixture(argentinaDemoProductPacket);
  const metadata = objectRecord(sample["metadata"], "metadata");
  const productContext = objectRecord(
    metadata["product_context"],
    "product_context",
  );
  const knownUnknowns = stringArray(
    productContext["known_unknowns"],
    "known_unknowns",
  );
  const followUpQuestions = stringArray(
    productContext["recommended_follow_up_questions"],
    "recommended_follow_up_questions",
  );

  assert.equal(
    productContext["product_name"],
    "school backpack made primarily of polyester",
  );
  assert.equal(productContext["spanish_label"], "mochila escolar de poliéster");
  assert.equal(productContext["material_composition"], "primarily polyester");
  assert.equal(productContext["intended_use"], "school backpack");

  for (const requiredUnknown of [
    "exact composition percentages",
    "coating or plastic layers, if any",
    "dimensions",
    "accessories",
    "country of origin",
    "import regime specifics",
    "brand and commercial invoice details",
  ]) {
    assert.ok(knownUnknowns.includes(requiredUnknown), requiredUnknown);
  }

  assert.equal(followUpQuestions.length >= 5, true);
});

test("argentina demo product packet does not claim final classification", async () => {
  const sample = await readJsonFixture(argentinaDemoProductPacket);
  const serialized = JSON.stringify(sample);
  const limitations = stringArray(sample["limitations"], "limitations").join(
    " ",
  );
  const contentControls = objectRecord(
    objectRecord(sample["metadata"], "metadata")["content_controls"],
    "content_controls",
  );

  assert.equal(contentControls["classification_claim_included"], false);
  assert.equal(contentControls["final_ncm_or_hs_code_claimed"], false);
  assert.match(limitations, /No final NCM code, HS code/i);

  for (const forbidden of [
    /\bfinal\s+(?:ncm|hs)\s+code\s*(?:is|=|:)\s*[0-9]/i,
    /\bclassified\s+as\s+[0-9]{2,}/i,
    /\bclassification\s+conclusion\b/i,
    /\bbinding\s+(?:classification|ruling)\b/i,
    /\bdownstream_allowed"\s*:\s*true\b/i,
  ]) {
    assert.equal(forbidden.test(serialized), false, forbidden.toString());
  }
});

test("argentina demo product packet has no live, credential, provider, or local path coupling", async () => {
  const sample = await readJsonFixture(argentinaDemoProductPacket);
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
    /\bmodel[_-]?provider\b/i,
    /\/Users\//,
    /\/private\//,
    /\bgraphify-out\b/i,
  ]) {
    assert.equal(forbidden.test(serialized), false, forbidden.toString());
  }
});

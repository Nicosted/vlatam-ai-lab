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
    "schemas/ai-extraction-result.schema.json",
  );
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });

  return ajv.compile(schema);
}

const validFixtures = [
  "snapshots/pcram/ai-extraction-result-qwen-langgraph-draft-success.json",
  "snapshots/pcram/ai-extraction-result-qwen-langgraph-critic-flagged.json",
  "snapshots/pcram/ai-extraction-result-ar-demo-polyester-school-backpack-draft.json",
];

const invalidFixtures = [
  "snapshots/pcram/invalid-ai-extraction-result-downstream-allowed.json",
  "snapshots/pcram/invalid-ai-extraction-result-missing-required.json",
];

test("valid AI extraction result fixtures pass", async () => {
  const validate = await buildValidator();

  for (const fixture of validFixtures) {
    const sample = await readJsonFixture(fixture);
    assert.equal(validate(sample), true, fixture);
  }
});

test("invalid AI extraction result fixtures fail", async () => {
  const validate = await buildValidator();

  for (const fixture of invalidFixtures) {
    const sample = await readJsonFixture(fixture);
    assert.equal(validate(sample), false, fixture);
  }
});

test("AI extraction results are always draft-only and review-gated", async () => {
  for (const fixture of validFixtures) {
    const sample = await readJsonFixture(fixture);
    assert.equal(sample["human_review_required"], true, fixture);
    assert.equal(sample["downstream_allowed"], false, fixture);
    assert.match(String(sample["critic_summary"]), /./);
  }
});

test("argentina demo product extraction draft remains blocked from downstream use", async () => {
  const sample = await readJsonFixture(
    "snapshots/pcram/ai-extraction-result-ar-demo-polyester-school-backpack-draft.json",
  );

  assert.equal(
    sample["evidence_packet_id"],
    "evidence-packet-ar-demo-polyester-school-backpack-2026-06-13t001000z",
  );
  assert.equal(sample["extraction_status"], "draft_unreviewed");
  assert.equal(sample["human_review_required"], true);
  assert.equal(sample["downstream_allowed"], false);
  assert.equal(sample["provider_id"], "local_manual_draft");

  const claims = sample["extracted_claims"] as Record<string, unknown>[];
  assert.ok(Array.isArray(claims));
  assert.equal(
    claims.every((claim) =>
      String(claim["evidence_reference"]).includes(
        "extractable-evidence-packet-ar-demo-polyester-school-backpack.json",
      ),
    ),
    true,
  );

  const unsupportedClaims = sample["unsupported_claims"] as Record<
    string,
    unknown
  >[];
  assert.ok(Array.isArray(unsupportedClaims));
  assert.equal(
    unsupportedClaims.some((claim) =>
      /final NCM or HS classification/i.test(String(claim["claim_text"])),
    ),
    true,
  );
});

test("argentina demo product extraction draft claims no final classification or customs determination", async () => {
  const sample = await readJsonFixture(
    "snapshots/pcram/ai-extraction-result-ar-demo-polyester-school-backpack-draft.json",
  );
  const serialized = JSON.stringify(sample);

  for (const forbidden of [
    /\bfinal\s+(?:ncm|hs)\s+code\s*(?:is|=|:)\s*[0-9]/i,
    /\bclassified\s+as\s+[0-9]{2,}/i,
    /\bclassification\s+conclusion\b/i,
    /\bbinding\s+(?:classification|ruling)\b/i,
    /\bcustoms\s+determination\s+(?:is|=|:)/i,
    /\bdownstream_allowed"\s*:\s*true\b/i,
  ]) {
    assert.equal(forbidden.test(serialized), false, forbidden.toString());
  }

  assert.match(
    String(sample["critic_summary"]),
    /Substantive classification, tariff, customs, legal, and downstream eligibility claims are unsupported and deferred\./,
  );
});

test("argentina demo product extraction draft has no live, secret, provider-metadata, raw-output, or path coupling", async () => {
  const sample = await readJsonFixture(
    "snapshots/pcram/ai-extraction-result-ar-demo-polyester-school-backpack-draft.json",
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

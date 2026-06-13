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

const outcomePath =
  "snapshots/pcram/review-outcome-ar-demo-polyester-school-backpack-request-more-data.json";
const reportPath = "reports/argentina-backpack-request-more-data.md";

const expectedQuestionIds = [
  "exact-material-composition-percentages",
  "polyester-construction-status",
  "coating-layer-plastic-shell-status",
  "dimensions-and-capacity",
  "included-accessories-components",
  "country-of-origin",
  "commercial-description-consistency",
  "supporting-documents",
];

const forbiddenLocalOnlyPatterns: RegExp[] = [
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
  /\braw_llm_output\b/i,
  /\bmodel[_-]?provider\b/i,
  /\/Users\//,
  /\/private\//,
  /[A-Z]:\\Users\\/i,
  /\bgraphify-out\b/i,
  /\blive[_-]?integration\b/i,
  /\bruntime[_-]?writeback\b/i,
  /\bshared[_-]?database[_-]?coupling\b/i,
];

const forbiddenFinalDeterminationPatterns: RegExp[] = [
  /\bis\s+(?:finally\s+)?classified\s+as\b/i,
  /\bfinal\s+(?:NCM|HS)\s+code\s+(?:is|:)\b/i,
  /\bapproved\s+(?:NCM|HS)\s+code\s+(?:is|:)\b/i,
  /\bbinding\s+classification\b/i,
  /\btariff\s+treatment\s+(?:is|applies|approved)\b/i,
  /\bimport\s+clearance\s+(?:is\s+)?(?:approved|cleared|authorized)\b/i,
  /\bcustoms\s+determination\s+(?:is|:)\b/i,
  /\blegal\s+determination\s+(?:is|:)\b/i,
  /\blegal\s+advice\s+(?:is|:)\b/i,
];

type JsonObject = Record<string, unknown>;

async function readJson(relativePath: string): Promise<JsonObject> {
  const content = await readUtf8File(path.resolve(process.cwd(), relativePath));

  return JSON.parse(content) as JsonObject;
}

async function readText(relativePath: string): Promise<string> {
  return readUtf8File(path.resolve(process.cwd(), relativePath));
}

async function buildOutcomeValidator(): Promise<ValidateFunction> {
  const schema = await readJson("schemas/review-outcome.schema.json");
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });

  return ajv.compile(schema);
}

function missingDataQuestions(outcome: JsonObject): JsonObject[] {
  const questions = outcome["missing_data_questions"];

  assert.ok(Array.isArray(questions));
  assert.ok(
    questions.every((question) => typeof question === "object" && question),
  );

  return questions as JsonObject[];
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

test("argentina request-more-data outcome is schema-valid", async () => {
  const validate = await buildOutcomeValidator();
  const outcome = await readJson(outcomePath);

  const isValid = validate(outcome);

  assert.equal(isValid, true, JSON.stringify(validate.errors, null, 2));
});

test("argentina request-more-data outcome remains non-downstream-safe", async () => {
  const outcome = await readJson(outcomePath);

  assert.equal(outcome["outcome"], "request_more_data");
  assert.equal(outcome["approval_ready"], false);
  assert.equal(outcome["approved"], false);
  assert.equal(outcome["downstream_allowed"], false);
  assert.equal(outcome["export_eligible"], false);
  assert.equal(outcome["final_classification_made"], false);
  assert.equal(outcome["ncm_hs_code_approved"], false);
  assert.match(String(outcome["blocked_until"]), /missing product facts/i);
});

test("argentina request-more-data questions are deterministic", async () => {
  const outcome = await readJson(outcomePath);
  const questions = missingDataQuestions(outcome);

  assert.deepEqual(
    questions.map((question) => question["question_id"]),
    expectedQuestionIds,
  );
  assert.equal(new Set(expectedQuestionIds).size, expectedQuestionIds.length);
  assert.equal(
    questions.every(
      (question) =>
        typeof question["question"] === "string" &&
        String(question["question"]).endsWith("?"),
    ),
    true,
  );
});

test("request-more-data action plan mirrors the deterministic questions", async () => {
  const outcome = await readJson(outcomePath);
  const report = normalizeWhitespace(await readText(reportPath));

  for (const question of missingDataQuestions(outcome)) {
    assert.equal(
      report.includes(normalizeWhitespace(String(question["question"]))),
      true,
      String(question["question_id"]),
    );
  }

  assert.match(report, /request_more_data/);
  assert.match(report, /not approval-ready/i);
  assert.match(report, /downstream_allowed` remains false/i);
  assert.match(report, /Export eligibility remains false/i);
});

test("request-more-data fixture and report make no final customs or legal determination", async () => {
  const serialized = JSON.stringify(await readJson(outcomePath));
  const report = await readText(reportPath);

  for (const content of [serialized, report]) {
    for (const pattern of forbiddenFinalDeterminationPatterns) {
      assert.equal(pattern.test(content), false, pattern.toString());
    }
  }
});

test("request-more-data fixture and report avoid forbidden coupling", async () => {
  const serialized = JSON.stringify(await readJson(outcomePath));
  const report = await readText(reportPath);

  for (const content of [serialized, report]) {
    for (const pattern of forbiddenLocalOnlyPatterns) {
      assert.equal(pattern.test(content), false, pattern.toString());
    }
  }
});

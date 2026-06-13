import assert from "node:assert/strict";
import { access, cp, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readUtf8File } from "../src/lib/fs.js";
import { buildApprovedExportBundle } from "../src/pipelines/build-approved-export-bundle.js";
import {
  argentinaBackpackMissingDataHandoffDefaultPath,
  buildArgentinaBackpackMissingDataHandoff,
} from "../src/pipelines/build-argentina-backpack-missing-data-handoff.js";
import { verifyApprovedExportCatalog } from "../src/pipelines/verify-approved-export-catalog.js";

type JsonObject = Record<string, unknown>;

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

const forbiddenPatterns: RegExp[] = [
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
  new RegExp("\\braw_" + "llm_output\\b", "i"),
  /\bmodel[_-]?provider\b/i,
  /\/Users\//,
  /\/private\//,
  /[A-Z]:\\Users\\/i,
  /\bgraphify-out\b/i,
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

async function createFixtureRepo(): Promise<string> {
  const repoRoot = await mkdtemp(
    path.join(os.tmpdir(), "ai-lab-backpack-handoff-"),
  );

  await Promise.all([
    cp(path.resolve(process.cwd(), "schemas"), path.join(repoRoot, "schemas"), {
      recursive: true,
    }),
    cp(
      path.resolve(process.cwd(), "snapshots", "pcram"),
      path.join(repoRoot, "snapshots", "pcram"),
      { recursive: true },
    ),
    cp(path.resolve(process.cwd(), "reports"), path.join(repoRoot, "reports"), {
      recursive: true,
    }),
  ]);

  return repoRoot;
}

async function readHandoff(repoRoot: string): Promise<JsonObject> {
  const content = await readUtf8File(
    path.join(repoRoot, argentinaBackpackMissingDataHandoffDefaultPath),
  );

  return JSON.parse(content) as JsonObject;
}

function groupedQuestions(handoff: JsonObject): JsonObject[] {
  const missingData = handoff["missing_data"];
  assert.ok(typeof missingData === "object" && missingData);
  const questions = (missingData as JsonObject)["grouped_questions"];
  assert.ok(Array.isArray(questions));
  assert.ok(
    questions.every((question) => typeof question === "object" && question),
  );

  return questions as JsonObject[];
}

function questionIds(handoff: JsonObject): string[] {
  return groupedQuestions(handoff).flatMap((group) => {
    const questions = group["questions"];
    assert.ok(Array.isArray(questions));
    return questions.map((question): string => {
      assert.ok(typeof question === "object" && question);
      const questionId = (question as JsonObject)["question_id"];
      assert.equal(typeof questionId, "string");
      return String(questionId);
    });
  });
}

test("argentina backpack missing-data handoff generation is deterministic", async () => {
  const repoRoot = await createFixtureRepo();

  try {
    await buildArgentinaBackpackMissingDataHandoff({ repoRoot });
    const first = await readUtf8File(
      path.join(repoRoot, argentinaBackpackMissingDataHandoffDefaultPath),
    );

    await buildArgentinaBackpackMissingDataHandoff({ repoRoot });
    const second = await readUtf8File(
      path.join(repoRoot, argentinaBackpackMissingDataHandoffDefaultPath),
    );

    assert.equal(second, first);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("argentina backpack missing-data handoff stays outside approved catalog", async () => {
  const repoRoot = await createFixtureRepo();

  try {
    const result = await buildArgentinaBackpackMissingDataHandoff({ repoRoot });

    assert.equal(
      result.outputPath,
      argentinaBackpackMissingDataHandoffDefaultPath,
    );
    assert.equal(
      result.outputPath.startsWith("exports/review-outcomes/"),
      true,
    );
    assert.equal(
      result.outputPath.startsWith("exports/approved-catalog/"),
      false,
    );
    await access(path.join(repoRoot, result.outputPath));

    await assert.rejects(
      buildArgentinaBackpackMissingDataHandoff({
        repoRoot,
        outputPath: "exports/approved-catalog/argentina-backpack.json",
      }),
      /approved catalog/i,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("argentina backpack missing-data handoff remains non-downstream-safe", async () => {
  const repoRoot = await createFixtureRepo();

  try {
    await buildArgentinaBackpackMissingDataHandoff({ repoRoot });
    const handoff = await readHandoff(repoRoot);
    const boundary = handoff["boundary"] as JsonObject;

    assert.equal(handoff["outcome"], "request_more_data");
    assert.equal(handoff["approval_readiness"], "blocked_not_approval_ready");
    assert.equal(handoff["downstream_allowed"], false);
    assert.equal(handoff["export_eligible"], false);
    assert.equal(boundary["human_review_required"], true);
    assert.equal(boundary["operational_use_only"], true);
    assert.equal(boundary["approved_artifact"], false);
    assert.equal(boundary["approved_export_catalog_member"], false);
    assert.equal(boundary["approved_export_bundle_member"], false);
    assert.equal(boundary["final_customs_or_legal_determination"], false);
    assert.equal(boundary["provider_or_llm_raw_output_included"], false);
    assert.match(
      String(handoff["final_classification_statement"]),
      /No final classification is made/i,
    );
    assert.match(
      String(handoff["regulatory_intelligence_statement"]),
      /not approved regulatory intelligence/i,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("argentina backpack missing-data handoff questions are deterministic", async () => {
  const repoRoot = await createFixtureRepo();

  try {
    await buildArgentinaBackpackMissingDataHandoff({ repoRoot });
    const handoff = await readHandoff(repoRoot);

    assert.deepEqual(questionIds(handoff), expectedQuestionIds);
    assert.equal(
      new Set(questionIds(handoff)).size,
      expectedQuestionIds.length,
    );

    for (const group of groupedQuestions(handoff)) {
      const questions = group["questions"] as JsonObject[];
      for (const question of questions) {
        assert.equal(String(question["question"]).endsWith("?"), true);
      }
    }
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("argentina backpack missing-data handoff avoids final determinations and forbidden strings", async () => {
  const repoRoot = await createFixtureRepo();

  try {
    await buildArgentinaBackpackMissingDataHandoff({ repoRoot });
    const content = await readUtf8File(
      path.join(repoRoot, argentinaBackpackMissingDataHandoffDefaultPath),
    );

    for (const pattern of [
      ...forbiddenPatterns,
      ...forbiddenFinalDeterminationPatterns,
    ]) {
      assert.equal(pattern.test(content), false, pattern.toString());
    }
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("approved export commands do not include the blocked handoff", async () => {
  const repoRoot = await createFixtureRepo();

  try {
    await buildArgentinaBackpackMissingDataHandoff({ repoRoot });

    const verification = await verifyApprovedExportCatalog({ repoRoot });
    assert.equal(verification.ok, true, verification.errors.join("\n"));

    const bundle = await buildApprovedExportBundle({ repoRoot });
    assert.equal(bundle.ok, true, bundle.summary);

    const catalog = await readUtf8File(
      path.resolve(
        repoRoot,
        "snapshots/pcram/demo-classifier-approved-artifact-export-catalog.json",
      ),
    );
    const bundleIndex = await readUtf8File(
      path.resolve(repoRoot, "exports/approved-catalog/index.json"),
    );

    for (const content of [catalog, bundleIndex]) {
      assert.equal(
        content.includes("argentina-backpack-request-more-data-handoff"),
        false,
      );
      assert.equal(content.includes("exports/review-outcomes/"), false);
      assert.equal(content.includes("request_more_data"), false);
    }
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

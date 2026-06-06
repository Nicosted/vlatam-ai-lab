import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { readUtf8File } from "../src/lib/fs.js";
import {
  buildSchemaReadinessSummary,
  readSchemaRegistry,
  renderSchemaReadinessReport,
  type SchemaReadinessSummary,
} from "../src/reports/schema-readiness-report.js";

const expectedContracts = [
  "source_version",
  "review_manifest",
  "approved_artifact",
  "evidence_report_metadata",
  "broker_profile",
  "relevance_assessment",
  "jurisdiction_pack",
  "approved_kb_snapshot",
  "classifier_approved_artifact_export_contract",
  "classifier_approved_artifact_export_catalog",
  "intelligence_source_registry",
  "intelligence_source_snapshot",
  "ai_extraction_job",
];
const forbiddenPathPattern =
  /(^|[/\\])\.env|https?:\/\/|supabase\.(co|com)|production\.(local|com|net)|secret|credentials/i;

function normalizeMarkdownText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

test("schema readiness generator reads the schema registry", async () => {
  const registry = await readSchemaRegistry();

  assert.equal(registry.contracts.length, 13);
  assert.deepEqual(
    registry.contracts.map((entry) => entry.contract_name),
    expectedContracts,
  );
});

test("schema readiness markdown includes all completed contracts", async () => {
  const summary = await buildSchemaReadinessSummary();
  const markdown = renderSchemaReadinessReport(summary);

  for (const contractName of expectedContracts) {
    assert.equal(markdown.includes(`\`${contractName}\``), true);
  }
});

test("schema readiness markdown includes contract, fixture, and test counts", async () => {
  const summary = await buildSchemaReadinessSummary();
  const markdown = renderSchemaReadinessReport(summary);

  assert.equal(markdown.includes("- total_contracts: `13`"), true);
  assert.equal(markdown.includes("- total_valid_fixtures: `13`"), true);
  assert.equal(markdown.includes("- total_invalid_fixtures: `32`"), true);
  assert.equal(markdown.includes("- total_test_files: `13`"), true);
});

test("schema readiness markdown includes local-only no-production note", async () => {
  const summary = await buildSchemaReadinessSummary();
  const markdown = renderSchemaReadinessReport(summary);
  const normalizedMarkdown = normalizeMarkdownText(markdown);

  assert.equal(markdown.includes("## Local-Only / No-Production Note"), true);
  assert.equal(
    normalizedMarkdown.includes("local repository files only"),
    true,
  );
  assert.equal(normalizedMarkdown.includes("no production systems"), true);
  assert.equal(normalizedMarkdown.includes("external network access"), true);
});

test("schema readiness missing references render deterministically", async () => {
  const summary = await buildSchemaReadinessSummary();
  const missingReferenceSummary: SchemaReadinessSummary = {
    ...summary,
    missingReferences: [
      {
        contract_name: "source_version",
        field: "schema_file",
        path: "schemas/missing-source-version.schema.json",
      },
    ],
  };
  const markdown = renderSchemaReadinessReport(missingReferenceSummary);
  const normalizedMarkdown = normalizeMarkdownText(markdown);

  assert.equal(markdown.includes("## Missing Reference Summary"), true);
  assert.equal(normalizedMarkdown.includes("source_version schema_file"), true);
  assert.equal(
    normalizedMarkdown.includes("schemas/missing-source-version.schema.json"),
    true,
  );
  assert.equal(
    normalizedMarkdown.includes(
      "has missing local references that require review before readiness handoff",
    ),
    true,
  );
});

test("schema readiness report has no missing local references", async () => {
  const summary = await buildSchemaReadinessSummary();

  assert.equal(summary.missingReferences.length, 0);
});

test("schema readiness paths remain local and repository-relative", async () => {
  const summary = await buildSchemaReadinessSummary();
  const referencedPaths = [
    summary.registryPath,
    "reports/schema-readiness-p1.md",
    ...summary.entries.flatMap((entry) => [
      entry.schema_file,
      entry.valid_fixture,
      entry.test_file,
      ...entry.invalid_fixtures,
    ]),
  ];

  for (const referencedPath of referencedPaths) {
    assert.equal(path.isAbsolute(referencedPath), false);
    assert.equal(
      forbiddenPathPattern.test(referencedPath),
      false,
      `Forbidden path or URL reference in ${referencedPath}`,
    );
  }
});

test("schema readiness renderer avoids network and client APIs", async () => {
  const source = await readUtf8File(
    path.resolve(process.cwd(), "src/reports/schema-readiness-report.ts"),
  );

  assert.equal(source.includes("process.env"), false);
  assert.equal(source.includes("fetch("), false);
  assert.equal(source.includes("node:http"), false);
  assert.equal(source.includes("node:https"), false);
  assert.equal(source.includes("http.request"), false);
  assert.equal(source.includes("https.request"), false);
  assert.equal(source.includes("@supabase/"), false);
});

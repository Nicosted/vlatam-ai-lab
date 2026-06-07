import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { readUtf8File } from "../src/lib/fs.js";

const registryPath = "schemas/schema-registry.json";
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
  "ai_extraction_result",
  "snapshot_review_manifest",
  "extractable_evidence_packet",
  "classifier_intelligence_artifact",
];
const requiredKeys = [
  "contract_name",
  "schema_file",
  "valid_fixture",
  "invalid_fixtures",
  "test_file",
  "status",
  "purpose",
  "downstream_role",
  "requires_human_review_semantics",
  "requires_traceability",
  "downstream_allowed_field_present",
];
const forbiddenPathPattern = /(^|[/\\])\.env|supabase|production|https?:\/\//i;

type RegistryEntry = {
  contract_name: string;
  schema_file: string;
  valid_fixture: string;
  invalid_fixtures: string[];
  test_file: string;
  status: string;
  purpose: string;
  downstream_role: string;
  requires_human_review_semantics: boolean;
  requires_traceability: boolean;
  downstream_allowed_field_present: boolean;
};

type SchemaRegistry = {
  contracts: RegistryEntry[];
};

async function readJson(relativePath: string): Promise<unknown> {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const content = await readUtf8File(absolutePath);

  return JSON.parse(content);
}

async function assertFileExists(relativePath: string): Promise<void> {
  await access(path.resolve(process.cwd(), relativePath));
}

function assertRegistryEntry(value: unknown): asserts value is RegistryEntry {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);

  const entry = value as Record<string, unknown>;

  for (const key of requiredKeys) {
    assert.equal(Object.hasOwn(entry, key), true, `Missing ${key}`);
  }

  assert.equal(typeof entry["contract_name"], "string");
  assert.equal(typeof entry["schema_file"], "string");
  assert.equal(typeof entry["valid_fixture"], "string");
  assert.equal(Array.isArray(entry["invalid_fixtures"]), true);
  assert.equal(typeof entry["test_file"], "string");
  assert.equal(entry["status"], "implemented");
  assert.equal(typeof entry["purpose"], "string");
  assert.equal(typeof entry["downstream_role"], "string");
  assert.equal(typeof entry["requires_human_review_semantics"], "boolean");
  assert.equal(typeof entry["requires_traceability"], "boolean");
  assert.equal(typeof entry["downstream_allowed_field_present"], "boolean");
}

async function readRegistry(): Promise<SchemaRegistry> {
  const parsed = await readJson(registryPath);

  assert.equal(typeof parsed, "object");
  assert.notEqual(parsed, null);

  const registry = parsed as Record<string, unknown>;
  assert.equal(Array.isArray(registry["contracts"]), true);

  return registry as SchemaRegistry;
}

test("schema registry includes exactly the completed schema hardening contracts", async () => {
  const registry = await readRegistry();
  const actualContracts = registry.contracts.map(
    (entry) => entry.contract_name,
  );

  assert.deepEqual(actualContracts, expectedContracts);
});

test("schema registry entries have required fields and booleans", async () => {
  const registry = await readRegistry();

  for (const entry of registry.contracts) {
    assertRegistryEntry(entry);
    assert.equal(entry.invalid_fixtures.length > 0, true);
  }
});

test("schema registry file references exist", async () => {
  const registry = await readRegistry();

  for (const entry of registry.contracts) {
    await assertFileExists(entry.schema_file);
    await assertFileExists(entry.valid_fixture);
    await assertFileExists(entry.test_file);

    for (const invalidFixture of entry.invalid_fixtures) {
      await assertFileExists(invalidFixture);
    }
  }
});

test("schema registry schema and fixture references are valid JSON", async () => {
  const registry = await readRegistry();

  for (const entry of registry.contracts) {
    await readJson(entry.schema_file);
    await readJson(entry.valid_fixture);

    for (const invalidFixture of entry.invalid_fixtures) {
      await readJson(invalidFixture);
    }
  }
});

test("schema registry paths avoid forbidden references", async () => {
  const registry = await readRegistry();

  for (const entry of registry.contracts) {
    const referencedPaths = [
      entry.schema_file,
      entry.valid_fixture,
      entry.test_file,
      ...entry.invalid_fixtures,
    ];

    for (const referencedPath of referencedPaths) {
      assert.equal(path.isAbsolute(referencedPath), false);
      assert.equal(
        forbiddenPathPattern.test(referencedPath),
        false,
        `Forbidden reference in ${referencedPath}`,
      );
    }
  }
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

const schemaPath =
  "schemas/classifier-approved-artifact-export-catalog.schema.json";
const validFixturePath =
  "snapshots/pcram/demo-classifier-approved-artifact-export-catalog.json";
const argentinaCandidateMarkers = [
  "ar-customs-tariff-authority-candidate",
  "mercosur-ncm-source-candidate",
  "wco-hs-source-candidate",
  "ar-sectoral-source-placeholder-candidate",
  "snapshot-ar-customs-tariff-authority-candidate",
  "snapshot-mercosur-ncm-source-candidate",
  "snapshot-wco-hs-source-candidate",
  "snapshot-ar-sectoral-placeholder-candidate",
];

async function readJsonFixture(
  relativePath: string,
): Promise<Record<string, unknown>> {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const content = await readUtf8File(absolutePath);

  return JSON.parse(content) as Record<string, unknown>;
}

async function buildValidator(): Promise<ValidateFunction> {
  const schema = await readJsonFixture(schemaPath);
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });

  return ajv.compile(schema);
}

async function assertCatalogValid(
  fixturePath = validFixturePath,
): Promise<Record<string, unknown>> {
  const validate = await buildValidator();
  const fixture = await readJsonFixture(fixturePath);
  const isValid = validate(fixture);

  assert.equal(
    isValid,
    true,
    `${fixturePath} should validate: ${JSON.stringify(validate.errors)}`,
  );

  return fixture;
}

function catalogEntries(
  catalog: Record<string, unknown>,
): Record<string, unknown>[] {
  const entries = catalog["entries"];

  assert.ok(Array.isArray(entries));
  assert.equal(entries.length > 0, true);

  return entries as Record<string, unknown>[];
}

async function fileExists(relativePath: string): Promise<void> {
  await access(path.resolve(process.cwd(), relativePath));
}

async function sha256OfFile(relativePath: string): Promise<string> {
  const content = await readUtf8File(path.resolve(process.cwd(), relativePath));

  return createHash("sha256").update(content).digest("hex");
}

function firstIndexedArtifact(
  exportContract: Record<string, unknown>,
): Record<string, unknown> {
  const artifacts = exportContract["artifacts"];

  assert.ok(Array.isArray(artifacts));
  assert.equal(artifacts.length > 0, true);

  return artifacts[0] as Record<string, unknown>;
}

function stringArray(value: unknown, label: string): string[] {
  assert.ok(Array.isArray(value), `${label} must be an array`);

  return value.map((item) => String(item));
}

function sourceTraceability(
  indexedArtifact: Record<string, unknown>,
): Record<string, unknown> {
  const traceability = indexedArtifact["source_traceability"];

  assert.equal(typeof traceability, "object");
  assert.notEqual(traceability, null);

  return traceability as Record<string, unknown>;
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
  assert.equal(
    value,
    path.posix.normalize(value),
    `${label} must be deterministic`,
  );
}

function assertNoRuntimeCoupling(value: unknown, label: string): void {
  const serialized = JSON.stringify(value);

  for (const forbidden of [
    /https?:\/\//i,
    /supabase/i,
    /process\.env/i,
    /\$\{[^}]*\}/,
    /\$[A-Z][A-Z0-9_]+/,
    /project[_-]?ref/i,
    /service[_-]?role/i,
    /anon[_-]?key/i,
    /api[_-]?key/i,
    /authorization/i,
    /bearer\s+[a-z0-9._-]+/i,
    /credential/i,
    /provider[_-]?metadata/i,
    /model[_-]?provider/i,
  ]) {
    assert.equal(
      forbidden.test(serialized),
      false,
      `${label} must not contain ${forbidden}`,
    );
  }
}

function reviewManifestRefPath(indexedArtifact: Record<string, unknown>): string {
  const traceability = sourceTraceability(indexedArtifact);
  const evidenceRefs = stringArray(traceability["evidence_refs"], "evidence_refs");
  const reviewManifestRefs = evidenceRefs.filter((ref) =>
    ref.endsWith("-review-manifest.json"),
  );

  assert.equal(reviewManifestRefs.length, 1);
  const [reviewManifestRef] = reviewManifestRefs;
  if (reviewManifestRef === undefined) {
    throw new Error("Expected one review manifest ref");
  }

  return reviewManifestRef;
}

async function assertExistingRepoRelativeFile(
  relativePath: string,
  label: string,
): Promise<void> {
  assertRepoRelativePath(relativePath, label);
  await fileExists(relativePath);
}

test("export catalog fixture is schema-valid", async () => {
  await assertCatalogValid();
});

test("catalog index metadata is explicit and versioned", async () => {
  const catalog = await assertCatalogValid();

  assert.equal(typeof catalog["catalog_id"], "string");
  assert.equal(catalog["catalog_schema_version"], "1.0.0");
  assert.equal(catalog["catalog_version"], "1.0.0");
  assert.match(
    String(catalog["generated_at"]),
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  );
  assert.equal(
    catalog["catalog_scope"],
    "classifier_approved_artifact_export_discovery",
  );
  assert.deepEqual(catalog["consumer_scope"], ["vLatamGlobal"]);
});

test("catalog does not expose Argentina source candidates", async () => {
  const catalog = await assertCatalogValid();
  const serialized = JSON.stringify(catalog);

  for (const marker of argentinaCandidateMarkers) {
    assert.equal(
      serialized.includes(marker),
      false,
      `Catalog must not include candidate marker ${marker}`,
    );
  }
});

test("every catalog entry references existing export contract and artifact files", async () => {
  const catalog = await assertCatalogValid();

  for (const entry of catalogEntries(catalog)) {
    const exportContractRef = String(entry["export_contract_ref"]);
    const artifactRef = String(entry["artifact_ref"]);

    await fileExists(exportContractRef);
    await fileExists(artifactRef);

    const exportContract = await readJsonFixture(exportContractRef);
    const indexedArtifact = firstIndexedArtifact(exportContract);
    const approvedArtifact = await readJsonFixture(artifactRef);

    assert.equal(entry["artifact_id"], indexedArtifact["artifact_id"]);
    assert.equal(entry["artifact_id"], approvedArtifact["artifact_id"]);
    assert.equal(
      entry["contract_schema_version"],
      exportContract["contract_schema_version"],
    );
    assert.deepEqual(entry["country_scope"], indexedArtifact["country_scope"]);
    assert.deepEqual(
      entry["jurisdiction_scope"],
      indexedArtifact["jurisdiction_scope"],
    );
  }
});

test("catalog handoff paths are repository-relative and deterministic", async () => {
  const catalog = await assertCatalogValid();

  for (const entry of catalogEntries(catalog)) {
    const exportContractRef = String(entry["export_contract_ref"]);
    const artifactRef = String(entry["artifact_ref"]);

    await assertExistingRepoRelativeFile(exportContractRef, "export_contract_ref");
    await assertExistingRepoRelativeFile(artifactRef, "artifact_ref");

    const exportContract = await readJsonFixture(exportContractRef);
    const indexedArtifact = firstIndexedArtifact(exportContract);
    const traceability = sourceTraceability(indexedArtifact);
    const approvedArtifact = await readJsonFixture(artifactRef);

    const handoffRefs = [
      String(traceability["content_ref"]),
      ...stringArray(traceability["evidence_refs"], "evidence_refs"),
      String(approvedArtifact["content_ref"]),
      ...stringArray(approvedArtifact["evidence_refs"], "artifact evidence_refs"),
    ];

    for (const [index, handoffRef] of handoffRefs.entries()) {
      await assertExistingRepoRelativeFile(handoffRef, `handoff ref ${index}`);
    }
  }
});

test("approved artifacts are backed by explicit human review manifests", async () => {
  const catalog = await assertCatalogValid();

  for (const entry of catalogEntries(catalog)) {
    const exportContract = await readJsonFixture(
      String(entry["export_contract_ref"]),
    );
    const indexedArtifact = firstIndexedArtifact(exportContract);
    const traceability = sourceTraceability(indexedArtifact);
    const approvedArtifact = await readJsonFixture(String(entry["artifact_ref"]));
    const reviewManifestPath = reviewManifestRefPath(indexedArtifact);
    const reviewManifest = await readJsonFixture(reviewManifestPath);

    assert.equal(
      traceability["review_manifest_ref"],
      approvedArtifact["review_manifest_ref"],
    );
    assert.equal(
      reviewManifest["review_manifest_id"],
      approvedArtifact["review_manifest_ref"],
    );
    assert.equal(reviewManifest["review_status"], "approved");
    assert.equal(reviewManifest["reviewed_by"], "human-review-gate");
    assert.equal(reviewManifest["review_method"], "manual");
    assert.equal(reviewManifest["downstream_allowed"], true);

    const approvalScope = reviewManifest["approval_scope"] as Record<
      string,
      unknown
    >;
    assert.deepEqual(approvalScope["allowed_consumers"], ["vLatamGlobal"]);
    assert.deepEqual(
      stringArray(approvalScope["country_scope"], "review country_scope"),
      stringArray(entry["country_scope"], "entry country_scope"),
    );
  }
});

test("downstream-eligible catalog entries are reviewed and approved", async () => {
  const catalog = await assertCatalogValid();

  for (const entry of catalogEntries(catalog)) {
    if (entry["downstream_eligible"] !== true) {
      continue;
    }

    assert.equal(entry["review_status"], "approved");
    assert.equal(entry["approval_state"], "approved");
    assert.equal(entry["human_review_required"], true);

    const exportContract = await readJsonFixture(
      String(entry["export_contract_ref"]),
    );
    const indexedArtifact = firstIndexedArtifact(exportContract);

    assert.equal(indexedArtifact["review_status"], "approved");
    assert.equal(indexedArtifact["approval_state"], "approved");
    assert.equal(indexedArtifact["downstream_eligible"], true);

    const approvedArtifact = await readJsonFixture(
      String(entry["artifact_ref"]),
    );
    assert.equal(approvedArtifact["review_status"], "approved");
    assert.equal(approvedArtifact["downstream_allowed"], true);
  }
});

test("export contracts bind approved artifact content hashes", async () => {
  const catalog = await assertCatalogValid();

  for (const entry of catalogEntries(catalog)) {
    const exportContract = await readJsonFixture(
      String(entry["export_contract_ref"]),
    );
    const indexedArtifact = firstIndexedArtifact(exportContract);
    const traceability = sourceTraceability(indexedArtifact);
    const contentRef = String(traceability["content_ref"]);
    const expectedHash = await sha256OfFile(contentRef);

    assert.equal(traceability["content_hash"], `sha256:${expectedHash}`);
  }
});

test("catalog hash references bind to the referenced export contract file", async () => {
  const catalog = await assertCatalogValid();

  for (const entry of catalogEntries(catalog)) {
    const expectedHash = await sha256OfFile(
      String(entry["export_contract_ref"]),
    );

    assert.equal(entry["export_contract_hash"], `sha256:${expectedHash}`);
  }
});

test("demo export fixtures remain local and not production-ready", async () => {
  const catalog = await assertCatalogValid();

  for (const entry of catalogEntries(catalog)) {
    const exportContract = await readJsonFixture(
      String(entry["export_contract_ref"]),
    );
    const indexedArtifact = firstIndexedArtifact(exportContract);
    const approvedArtifact = await readJsonFixture(String(entry["artifact_ref"]));
    const reviewManifest = await readJsonFixture(
      reviewManifestRefPath(indexedArtifact),
    );

    assert.equal(exportContract["export_scope"], "classifier_approved_artifact_demo");
    assert.match(
      stringArray(exportContract["limitations"], "contract limitations").join(
        " ",
      ),
      /Local export contract fixture only; not a production API route or live integration\./,
    );
    assert.match(
      stringArray(approvedArtifact["limitations"], "artifact limitations").join(
        " ",
      ),
      /not a final legal|not a final classification|not a final legal, tariff, customs, or operational/i,
    );

    const artifactMetadata = approvedArtifact["metadata"] as Record<
      string,
      unknown
    >;
    assert.equal(artifactMetadata["environment"], "local");

    const approvalScope = reviewManifest["approval_scope"] as Record<
      string,
      unknown
    >;
    assert.match(
      String(approvalScope["validity_notes"]),
      /demo intelligence|not approved as a final/i,
    );
  }
});

test("catalog declares a read-only, no-coupling integration boundary", async () => {
  const catalog = await assertCatalogValid();
  const boundary = catalog["integration_boundary"] as Record<string, unknown>;

  assert.equal(boundary["integration_mode"], "local_export_catalog");
  assert.equal(boundary["read_only"], true);
  assert.equal(boundary["live_integration"], false);
  assert.equal(boundary["shared_database_coupling"], false);
  assert.equal(boundary["production_api_route"], false);
  assert.equal(boundary["runtime_writeback"], false);
  assert.equal(boundary["raw_llm_output_included"], false);
});

test("catalog and contracts do not carry runtime, env, Supabase, or provider coupling", async () => {
  const catalog = await assertCatalogValid();

  assertNoRuntimeCoupling(catalog, "export catalog");

  for (const entry of catalogEntries(catalog)) {
    assertNoRuntimeCoupling(entry, `catalog entry ${String(entry["entry_id"])}`);

    const exportContract = await readJsonFixture(
      String(entry["export_contract_ref"]),
    );
    const indexedArtifact = firstIndexedArtifact(exportContract);

    assertNoRuntimeCoupling(
      exportContract,
      `export contract ${String(exportContract["contract_id"])}`,
    );

    const boundary = exportContract["integration_boundary"] as Record<
      string,
      unknown
    >;
    assert.equal(boundary["integration_mode"], "local_export_fixture");
    assert.equal(boundary["read_only"], true);
    assert.equal(boundary["live_integration"], false);
    assert.equal(boundary["shared_database_coupling"], false);
    assert.equal(boundary["production_api_route"], false);
    assert.equal(boundary["runtime_writeback"], false);
    assert.equal(boundary["raw_llm_output_included"], false);

    const traceability = sourceTraceability(indexedArtifact);
    assertNoRuntimeCoupling(
      traceability,
      `source traceability ${String(indexedArtifact["artifact_id"])}`,
    );
  }
});

test("unreviewed catalog entries cannot be marked downstream eligible", async () => {
  const validate = await buildValidator();
  const invalid = await readJsonFixture(
    "snapshots/pcram/invalid-classifier-export-catalog-unreviewed-eligible.json",
  );
  const isValid = validate(invalid);

  assert.equal(isValid, false);
  assert.equal(
    validate.errors?.some(
      (error) =>
        error.instancePath === "/entries/0/downstream_eligible" &&
        error.message?.includes("must be equal to constant"),
    ),
    true,
  );
});

test("catalog rejects live integration and shared database coupling", async () => {
  const validate = await buildValidator();
  const invalid = await readJsonFixture(
    "snapshots/pcram/invalid-classifier-export-catalog-live-coupling.json",
  );
  const isValid = validate(invalid);

  assert.equal(isValid, false);
  assert.equal(
    validate.errors?.some(
      (error) =>
        error.instancePath === "/integration_boundary/live_integration" &&
        error.message?.includes("must be equal to constant"),
    ),
    true,
  );
});

test("export catalog report documents discovery use and runtime boundary", async () => {
  const report = await readUtf8File(
    path.resolve(
      process.cwd(),
      "reports/classifier-approved-artifact-export-catalog-p1.md",
    ),
  );

  for (const requiredText of [
    "read-only discovery index of approved artifact export contracts",
    "No live vLatamGlobal integration.",
    "No shared database access or database synchronization.",
    "No raw LLM output delivery as downstream classifier input.",
    "AI Lab / Runtime boundary",
  ]) {
    assert.equal(
      report.includes(requiredText),
      true,
      `Expected report to include: ${requiredText}`,
    );
  }
});

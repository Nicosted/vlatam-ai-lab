import assert from "node:assert/strict";
import { access, cp, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readUtf8File } from "../src/lib/fs.js";
import { buildApprovedExportBundle } from "../src/pipelines/build-approved-export-bundle.js";

type JsonObject = Record<string, unknown>;

const forbiddenBundlePatterns: RegExp[] = [
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
];

const defaultOutputDir = "exports/approved-catalog";
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

const argentinaBoundedSnapshotMarkers = [
  "snapshot-ar-customs-tariff-authority-bounded",
  "snapshot-mercosur-ncm-source-bounded",
  "snapshot-wco-hs-source-bounded",
  "intelligence-source-snapshot-ar-customs-tariff-bounded",
  "intelligence-source-snapshot-mercosur-ncm-bounded",
  "intelligence-source-snapshot-wco-hs-bounded",
];
const argentinaDemoProductEvidencePacketMarkers = [
  "evidence-packet-ar-demo-polyester-school-backpack",
  "extractable-evidence-packet-ar-demo-polyester-school-backpack",
  "mochila escolar de poliéster",
];
const argentinaDemoProductReviewMarkers = [
  "ai-extraction-result-ar-demo-polyester-school-backpack",
  "review-manifest-ar-demo-polyester-school-backpack",
  "classifier-intelligence-artifact-ar-demo-polyester-school-backpack",
  "mochila escolar de poliester",
];

async function createFixtureRepo(): Promise<string> {
  const repoRoot = await mkdtemp(
    path.join(os.tmpdir(), "ai-lab-approved-export-bundle-"),
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

async function readBundleIndex(repoRoot: string): Promise<JsonObject> {
  const content = await readUtf8File(
    path.join(repoRoot, defaultOutputDir, "index.json"),
  );

  return JSON.parse(content) as JsonObject;
}

function bundleEntries(bundle: JsonObject): JsonObject[] {
  const entries = bundle["entries"];

  assert.ok(Array.isArray(entries));
  assert.ok(
    entries.every((entry) => typeof entry === "object" && entry !== null),
  );

  return entries as JsonObject[];
}

function stringArray(value: unknown, label: string): string[] {
  assert.ok(Array.isArray(value), `${label} must be an array`);
  assert.ok(
    value.every((item) => typeof item === "string"),
    `${label} must contain only strings`,
  );

  return value;
}

async function assertRepoFileExists(
  repoRoot: string,
  relativePath: string,
): Promise<void> {
  assert.equal(path.isAbsolute(relativePath), false);
  assert.equal(relativePath.includes("\\"), false);
  assert.equal(relativePath.split("/").includes(".."), false);
  assert.equal(/^[a-z][a-z0-9+.-]*:/i.test(relativePath), false);
  await access(path.resolve(repoRoot, relativePath));
}

test("approved export bundle generation succeeds for the valid catalog", async () => {
  const repoRoot = await createFixtureRepo();

  try {
    const result = await buildApprovedExportBundle({ repoRoot });
    const bundle = await readBundleIndex(repoRoot);

    assert.equal(result.ok, true, result.summary);
    assert.equal(result.outputPath, "exports/approved-catalog/index.json");
    assert.equal(result.entriesBundled, 2);
    assert.equal(bundle["schema_name"], "approved_export_bundle_index");
    assert.equal(bundle["generated_at"], "2026-06-04T15:30:00.000Z");
    assert.equal(bundleEntries(bundle).length, 2);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("approved export bundle index is deterministic across runs", async () => {
  const repoRoot = await createFixtureRepo();

  try {
    await buildApprovedExportBundle({ repoRoot });
    const first = await readUtf8File(
      path.join(repoRoot, defaultOutputDir, "index.json"),
    );

    await buildApprovedExportBundle({ repoRoot });
    const second = await readUtf8File(
      path.join(repoRoot, defaultOutputDir, "index.json"),
    );

    assert.equal(second, first);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("approved export bundle excludes forbidden live coupling strings", async () => {
  const repoRoot = await createFixtureRepo();

  try {
    await buildApprovedExportBundle({ repoRoot });
    const content = await readUtf8File(
      path.join(repoRoot, defaultOutputDir, "index.json"),
    );

    for (const pattern of forbiddenBundlePatterns) {
      assert.equal(pattern.test(content), false, pattern.toString());
    }
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("approved export bundle excludes Argentina source candidates", async () => {
  const repoRoot = await createFixtureRepo();

  try {
    await buildApprovedExportBundle({ repoRoot });
    const content = await readUtf8File(
      path.join(repoRoot, defaultOutputDir, "index.json"),
    );

    for (const marker of argentinaCandidateMarkers) {
      assert.equal(
        content.includes(marker),
        false,
        `Bundle must not include candidate marker ${marker}`,
      );
    }
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("approved export bundle excludes Argentina bounded source snapshots", async () => {
  const repoRoot = await createFixtureRepo();

  try {
    await buildApprovedExportBundle({ repoRoot });
    const content = await readUtf8File(
      path.join(repoRoot, defaultOutputDir, "index.json"),
    );

    for (const marker of argentinaBoundedSnapshotMarkers) {
      assert.equal(
        content.includes(marker),
        false,
        `Bundle must not include bounded snapshot marker ${marker}`,
      );
    }
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("approved export bundle excludes Argentina demo product evidence packet", async () => {
  const repoRoot = await createFixtureRepo();

  try {
    await buildApprovedExportBundle({ repoRoot });
    const content = await readUtf8File(
      path.join(repoRoot, defaultOutputDir, "index.json"),
    );

    for (const marker of [
      ...argentinaDemoProductEvidencePacketMarkers,
      ...argentinaDemoProductReviewMarkers,
    ]) {
      assert.equal(
        content.includes(marker),
        false,
        `Bundle must not include demo product review marker ${marker}`,
      );
    }
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("approved export bundle entries reference only existing repo-relative files", async () => {
  const repoRoot = await createFixtureRepo();

  try {
    await buildApprovedExportBundle({ repoRoot });
    const bundle = await readBundleIndex(repoRoot);

    for (const entry of bundleEntries(bundle)) {
      const refs = stringArray(entry["repository_refs"], "repository_refs");

      for (const ref of refs) {
        await assertRepoFileExists(repoRoot, ref);
      }
    }
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("approved export bundle entries remain backed by reviewed contracts and artifacts", async () => {
  const repoRoot = await createFixtureRepo();

  try {
    await buildApprovedExportBundle({ repoRoot });
    const bundle = await readBundleIndex(repoRoot);

    for (const entry of bundleEntries(bundle)) {
      assert.equal(entry["review_status"], "approved");
      assert.equal(entry["approval_state"], "approved");
      assert.equal(entry["human_review_required"], true);
      assert.equal(entry["downstream_eligible"], true);
      assert.equal(entry["downstream_allowed"], true);
      assert.match(String(entry["export_contract_hash"]), /^sha256:[a-f0-9]{64}$/);
      assert.match(String(entry["content_hash"]), /^sha256:[a-f0-9]{64}$/);
      await assertRepoFileExists(repoRoot, String(entry["export_contract_ref"]));
      await assertRepoFileExists(repoRoot, String(entry["artifact_ref"]));
      await assertRepoFileExists(repoRoot, String(entry["review_manifest_ref"]));
    }
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

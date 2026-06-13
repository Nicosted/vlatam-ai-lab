import assert from "node:assert/strict";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readUtf8File } from "../src/lib/fs.js";
import {
  formatVerificationSummary,
  verifyApprovedExportCatalog,
} from "../src/pipelines/verify-approved-export-catalog.js";

const defaultCatalogPath =
  "snapshots/pcram/demo-classifier-approved-artifact-export-catalog.json";

async function createFixtureRepo(): Promise<string> {
  const repoRoot = await mkdtemp(
    path.join(os.tmpdir(), "ai-lab-export-verify-"),
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

async function readCatalog(repoRoot: string): Promise<Record<string, unknown>> {
  const content = await readUtf8File(
    path.resolve(repoRoot, defaultCatalogPath),
  );

  return JSON.parse(content) as Record<string, unknown>;
}

async function writeCatalog(
  repoRoot: string,
  catalog: Record<string, unknown>,
): Promise<void> {
  await writeFile(
    path.resolve(repoRoot, defaultCatalogPath),
    `${JSON.stringify(catalog, null, 2)}\n`,
    "utf8",
  );
}

function catalogEntries(
  catalog: Record<string, unknown>,
): Record<string, unknown>[] {
  const entries = catalog["entries"];

  assert.ok(Array.isArray(entries));
  assert.ok(
    entries.every((entry) => typeof entry === "object" && entry !== null),
  );

  return entries as Record<string, unknown>[];
}

test("approved export catalog verifier accepts the valid local fixture", async () => {
  const result = await verifyApprovedExportCatalog();

  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.catalogPath, defaultCatalogPath);
  assert.equal(result.entriesChecked, 2);
  assert.equal(result.contractsChecked, 2);
  assert.equal(result.artifactsChecked, 2);
});

test("approved export catalog verifier fails missing contract paths", async () => {
  const repoRoot = await createFixtureRepo();

  try {
    const catalog = await readCatalog(repoRoot);
    const [entry] = catalogEntries(catalog);

    assert.ok(entry);
    entry["export_contract_ref"] =
      "snapshots/pcram/missing-classifier-export-contract.json";
    await writeCatalog(repoRoot, catalog);

    const result = await verifyApprovedExportCatalog({ repoRoot });

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /export_contract_ref/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("approved export catalog verifier fails live coupling and env-style references", async () => {
  const repoRoot = await createFixtureRepo();

  try {
    const catalog = await readCatalog(repoRoot);
    const limitations = catalog["limitations"];

    assert.ok(Array.isArray(limitations));
    limitations.push("Forbidden live coupling: process.env.SUPABASE_URL.");
    await writeCatalog(repoRoot, catalog);

    const result = await verifyApprovedExportCatalog({ repoRoot });

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /process\.env|Supabase/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("approved export catalog verifier summary is local-only and deterministic", async () => {
  const result = await verifyApprovedExportCatalog();
  const summary = formatVerificationSummary(result);

  assert.equal(summary.includes(process.cwd()), false);
  assert.equal(summary.includes("http://"), false);
  assert.equal(summary.includes("https://"), false);
  assert.equal(summary.includes("Supabase"), false);
  assert.match(summary, /^Approved export catalog verification: PASS\n/);
  assert.match(summary, /catalog: snapshots\/pcram\//);
});

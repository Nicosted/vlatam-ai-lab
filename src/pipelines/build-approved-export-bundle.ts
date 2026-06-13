import path from "node:path";
import { fileURLToPath } from "node:url";

import { writeUtf8File } from "../lib/fs.js";
import {
  approvedExportCatalogDefaultPath,
  formatVerificationSummary,
  loadVerifiedApprovedExportCatalog,
  verifyApprovedExportCatalog,
  type VerifiedApprovedExportCatalog,
  type VerifiedApprovedExportCatalogEntry,
} from "./verify-approved-export-catalog.js";

const defaultBundleDir = "exports/approved-catalog";

type JsonObject = Record<string, unknown>;

export type ApprovedExportBundleOptions = {
  catalogPath?: string;
  outputDir?: string;
  repoRoot?: string;
};

export type ApprovedExportBundleResult = {
  ok: boolean;
  outputPath: string;
  entriesBundled: number;
  summary: string;
};

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value;
}

function asStringArray(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    throw new Error(`${label} must be an array of strings`);
  }

  return value;
}

function assertRepoRelativePath(value: string, label: string): void {
  if (path.isAbsolute(value) || path.posix.isAbsolute(value)) {
    throw new Error(`${label} must be repository-relative`);
  }

  if (value.startsWith("~")) {
    throw new Error(`${label} must not use home-directory references`);
  }

  if (value.includes("\\") || value.split("/").includes("..")) {
    throw new Error(`${label} must stay inside the repository`);
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    throw new Error(`${label} must not use a protocol reference`);
  }

  if (value !== path.posix.normalize(value)) {
    throw new Error(`${label} must be normalized`);
  }
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function bundleEntry(
  verifiedEntry: VerifiedApprovedExportCatalogEntry,
): JsonObject {
  const { entry, exportContract, indexedArtifact, approvedArtifact } =
    verifiedEntry;
  const contractRefs = [
    verifiedEntry.exportContractRef,
    verifiedEntry.artifactRef,
    verifiedEntry.contentRef,
    verifiedEntry.reviewManifestRef,
    ...verifiedEntry.evidenceRefs,
  ];

  return {
    entry_id: asString(entry["entry_id"], "entry.entry_id"),
    artifact_id: asString(entry["artifact_id"], "entry.artifact_id"),
    artifact_version: asString(
      entry["artifact_version"],
      "entry.artifact_version",
    ),
    artifact_type: asString(
      indexedArtifact["artifact_type"],
      "indexedArtifact.artifact_type",
    ),
    contract_id: asString(
      exportContract["contract_id"],
      "exportContract.contract_id",
    ),
    contract_schema_version: asString(
      entry["contract_schema_version"],
      "entry.contract_schema_version",
    ),
    export_version: asString(
      exportContract["export_version"],
      "exportContract.export_version",
    ),
    exported_at: asString(exportContract["exported_at"], "exported_at"),
    country_scope: asStringArray(entry["country_scope"], "entry.country_scope"),
    jurisdiction_scope: asStringArray(
      entry["jurisdiction_scope"],
      "entry.jurisdiction_scope",
    ),
    product_summary: asString(
      entry["product_summary"],
      "entry.product_summary",
    ),
    review_status: "approved",
    approval_state: "approved",
    human_review_required: true,
    downstream_eligible: true,
    downstream_allowed: approvedArtifact["downstream_allowed"] === true,
    risk_posture: asString(
      indexedArtifact["risk_posture"],
      "indexedArtifact.risk_posture",
    ),
    export_contract_ref: verifiedEntry.exportContractRef,
    export_contract_hash: asString(
      entry["export_contract_hash"],
      "entry.export_contract_hash",
    ),
    artifact_ref: verifiedEntry.artifactRef,
    review_manifest_ref: verifiedEntry.reviewManifestRef,
    content_ref: verifiedEntry.contentRef,
    content_hash: asString(
      indexedArtifact["source_traceability"] instanceof Object
        ? (indexedArtifact["source_traceability"] as JsonObject)[
            "content_hash"
          ]
        : undefined,
      "indexedArtifact.source_traceability.content_hash",
    ),
    evidence_refs: sortedUnique(verifiedEntry.evidenceRefs),
    repository_refs: sortedUnique(contractRefs),
  };
}

function buildBundleIndex(verified: VerifiedApprovedExportCatalog): JsonObject {
  const catalog = verified.catalog;

  return {
    schema_name: "approved_export_bundle_index",
    schema_version: "1.0.0",
    bundle_id: `${asString(catalog["catalog_id"], "catalog.catalog_id")}-bundle`,
    bundle_version: asString(catalog["catalog_version"], "catalog_version"),
    generated_at: asString(catalog["generated_at"], "catalog.generated_at"),
    generated_at_strategy:
      "stable source catalog timestamp; no wall-clock timestamp is emitted by the bundle generator",
    source_catalog: {
      catalog_id: asString(catalog["catalog_id"], "catalog.catalog_id"),
      catalog_version: asString(
        catalog["catalog_version"],
        "catalog.catalog_version",
      ),
      catalog_schema_version: asString(
        catalog["catalog_schema_version"],
        "catalog.catalog_schema_version",
      ),
      catalog_ref: verified.catalogPath,
      catalog_scope: asString(catalog["catalog_scope"], "catalog.catalog_scope"),
    },
    consumer_scope: asStringArray(
      catalog["consumer_scope"],
      "catalog.consumer_scope",
    ),
    verification: {
      status: "passed",
      command: "pnpm ai:exports:verify",
      entries_checked: verified.entries.length,
      contracts_checked: verified.entries.length,
      approved_artifact_refs_checked: verified.entries.length,
    },
    boundary: {
      mode: "local_repo_export_bundle",
      read_only: true,
      live_integration: false,
      shared_database_coupling: false,
      production_route: false,
      runtime_writeback: false,
      raw_model_output_included: false,
      local_machine_paths_included: false,
    },
    contents: {
      includes:
        "reviewed export catalog metadata, contract refs, artifact refs, review refs, traceability refs, and hashes",
      excludes:
        "raw model output, secrets, local machine paths, live service URLs, database project refs, runtime assumptions, and writeback behavior",
    },
    entries: verified.entries.map(bundleEntry),
  };
}

export async function buildApprovedExportBundle(
  options: ApprovedExportBundleOptions = {},
): Promise<ApprovedExportBundleResult> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const outputDir = options.outputDir ?? defaultBundleDir;
  const catalogPath = options.catalogPath ?? approvedExportCatalogDefaultPath;
  assertRepoRelativePath(outputDir, "output dir");

  const verification = await verifyApprovedExportCatalog({
    catalogPath,
    repoRoot,
  });
  if (!verification.ok) {
    return {
      ok: false,
      outputPath: path.posix.join(outputDir, "index.json"),
      entriesBundled: 0,
      summary: formatVerificationSummary(verification),
    };
  }

  const verified = await loadVerifiedApprovedExportCatalog({
    catalogPath,
    repoRoot,
  });
  const index = buildBundleIndex(verified);
  const outputPath = path.posix.join(outputDir, "index.json");
  const absoluteOutputPath = path.resolve(repoRoot, outputPath);

  await writeUtf8File(absoluteOutputPath, `${JSON.stringify(index, null, 2)}\n`);

  return {
    ok: true,
    outputPath,
    entriesBundled: verified.entries.length,
    summary: [
      "Approved export bundle generation: PASS",
      `catalog: ${catalogPath}`,
      `bundle: ${outputPath}`,
      `entries bundled: ${verified.entries.length}`,
    ].join("\n"),
  };
}

async function run(): Promise<void> {
  const catalogPath = process.argv[2] ?? approvedExportCatalogDefaultPath;
  const result = await buildApprovedExportBundle({ catalogPath });

  if (result.ok) {
    console.log(result.summary);
    return;
  }

  console.error(result.summary);
  process.exitCode = 1;
}

const isCliRun =
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "");

if (isCliRun) {
  run().catch((error) => {
    console.error("Approved export bundle generation failed", error);
    process.exitCode = 1;
  });
}

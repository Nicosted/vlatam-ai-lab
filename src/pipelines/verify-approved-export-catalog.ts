import { createHash } from "node:crypto";
import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ErrorObject, ValidateFunction } from "ajv";

import { readUtf8File } from "../lib/fs.js";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020") as new (options?: {
  allErrors?: boolean;
  strict?: boolean;
  validateFormats?: boolean;
}) => {
  compile: (schema: unknown) => ValidateFunction;
};

const defaultCatalogPath =
  "snapshots/pcram/demo-classifier-approved-artifact-export-catalog.json";
const catalogSchemaPath =
  "schemas/classifier-approved-artifact-export-catalog.schema.json";
const contractSchemaPath =
  "schemas/classifier-approved-artifact-export-contract.schema.json";

type JsonObject = Record<string, unknown>;

export const approvedExportCatalogDefaultPath = defaultCatalogPath;

export type ApprovedExportCatalogVerificationOptions = {
  catalogPath?: string;
  repoRoot?: string;
};

export type ApprovedExportCatalogVerificationResult = {
  ok: boolean;
  catalogPath: string;
  entriesChecked: number;
  contractsChecked: number;
  artifactsChecked: number;
  errors: string[];
};

export type VerifiedApprovedExportCatalogEntry = {
  entry: JsonObject;
  exportContractRef: string;
  artifactRef: string;
  exportContract: JsonObject;
  approvedArtifact: JsonObject;
  indexedArtifact: JsonObject;
  reviewManifestRef: string;
  reviewManifest: JsonObject;
  contentRef: string;
  evidenceRefs: string[];
};

export type VerifiedApprovedExportCatalog = {
  catalogPath: string;
  catalog: JsonObject;
  entries: VerifiedApprovedExportCatalogEntry[];
};

const forbiddenCouplingPatterns: Array<[RegExp, string]> = [
  [/https?:\/\//i, "HTTP or HTTPS reference"],
  [/\bsupabase\b/i, "Supabase reference"],
  [/\bprocess\.env\b/i, "process.env reference"],
  [/\$\{[^}]*\}/, "template environment interpolation"],
  [/\$[A-Z][A-Z0-9_]+/, "shell-style environment reference"],
  [/\b[A-Z][A-Z0-9_]*(?:API|PROJECT|SERVICE|ANON)?_KEY\b/, "env key reference"],
  [/\b\.env(?:\b|[._-])/i, ".env reference"],
  [/\bproject[_-]?ref\b/i, "project ref reference"],
  [/\bservice[_-]?role\b/i, "service role reference"],
  [/\banon[_-]?key\b/i, "anon key reference"],
  [/\bapi[_-]?key\b/i, "API key reference"],
  [/\bauthorization\b/i, "authorization reference"],
  [/\bbearer\s+[a-z0-9._-]+/i, "bearer token reference"],
  [/\bcredential/i, "credential reference"],
  [/\bprovider[_-]?metadata\b/i, "provider metadata reference"],
  [/\bmodel[_-]?provider\b/i, "model provider reference"],
];

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, label: string): JsonObject {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value;
}

function asRecordArray(value: unknown, label: string): JsonObject[] {
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new Error(`${label} must be an array of objects`);
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

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value;
}

async function readJsonFile<T = unknown>(
  repoRoot: string,
  relativePath: string,
): Promise<T> {
  const content = await readUtf8File(path.resolve(repoRoot, relativePath));

  return JSON.parse(content) as T;
}

async function buildValidator(
  repoRoot: string,
  schemaRelativePath: string,
): Promise<ValidateFunction> {
  const schema = await readJsonFile(repoRoot, schemaRelativePath);
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });

  return ajv.compile(schema);
}

function formatSchemaErrors(errors: ErrorObject[] | null | undefined): string {
  return JSON.stringify(errors ?? []);
}

function assertRepoRelativePath(value: string, label: string): void {
  if (path.isAbsolute(value) || path.posix.isAbsolute(value)) {
    throw new Error(`${label} must be repository-relative`);
  }

  if (value.startsWith("~")) {
    throw new Error(`${label} must not use home-directory references`);
  }

  if (value.includes("\\")) {
    throw new Error(`${label} must use POSIX separators`);
  }

  if (value.split("/").includes("..")) {
    throw new Error(`${label} must not traverse outside the repository`);
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    throw new Error(`${label} must not use a URL or protocol reference`);
  }

  if (value !== path.posix.normalize(value)) {
    throw new Error(`${label} must be normalized and deterministic`);
  }
}

async function assertExistingRepoFile(
  repoRoot: string,
  relativePath: string,
  label: string,
): Promise<void> {
  assertRepoRelativePath(relativePath, label);
  try {
    await access(path.resolve(repoRoot, relativePath));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${label} must point to an existing repository file: ${message}`,
    );
  }
}

async function sha256OfRepoFile(
  repoRoot: string,
  relativePath: string,
): Promise<string> {
  const content = await readUtf8File(path.resolve(repoRoot, relativePath));

  return createHash("sha256").update(content).digest("hex");
}

function assertNoRuntimeCoupling(value: unknown, label: string): void {
  const serialized = JSON.stringify(value);

  for (const [pattern, description] of forbiddenCouplingPatterns) {
    if (pattern.test(serialized)) {
      throw new Error(`${label} must not contain ${description}`);
    }
  }
}

function assertNoLiveBoundary(value: unknown, label: string): void {
  const boundary = asRecord(value, label);

  const expectedFalseFields = [
    "live_integration",
    "shared_database_coupling",
    "production_api_route",
    "runtime_writeback",
    "raw_llm_output_included",
  ];

  if (boundary["read_only"] !== true) {
    throw new Error(`${label}.read_only must be true`);
  }

  for (const field of expectedFalseFields) {
    if (boundary[field] !== false) {
      throw new Error(`${label}.${field} must be false`);
    }
  }
}

function firstArtifact(exportContract: JsonObject, label: string): JsonObject {
  const artifacts = asRecordArray(
    exportContract["artifacts"],
    `${label}.artifacts`,
  );
  const [artifact] = artifacts;

  if (artifact === undefined) {
    throw new Error(`${label}.artifacts must not be empty`);
  }

  return artifact;
}

function sourceTraceability(artifact: JsonObject, label: string): JsonObject {
  return asRecord(
    artifact["source_traceability"],
    `${label}.source_traceability`,
  );
}

function reviewManifestPath(
  indexedArtifact: JsonObject,
  label: string,
): string {
  const traceability = sourceTraceability(indexedArtifact, label);
  const evidenceRefs = asStringArray(
    traceability["evidence_refs"],
    `${label}.source_traceability.evidence_refs`,
  );
  const reviewManifestRefs = evidenceRefs.filter((ref) =>
    ref.endsWith("-review-manifest.json"),
  );

  if (reviewManifestRefs.length !== 1 || reviewManifestRefs[0] === undefined) {
    throw new Error(
      `${label} must include exactly one review manifest file ref`,
    );
  }

  return reviewManifestRefs[0];
}

async function verifyCatalogEntry(input: {
  repoRoot: string;
  entry: JsonObject;
  entryIndex: number;
  contractValidator: ValidateFunction;
}): Promise<VerifiedApprovedExportCatalogEntry> {
  const { repoRoot, entry, entryIndex, contractValidator } = input;
  const label = `catalog entry ${entryIndex}`;
  const exportContractRef = asString(
    entry["export_contract_ref"],
    `${label}.export_contract_ref`,
  );
  const artifactRef = asString(entry["artifact_ref"], `${label}.artifact_ref`);

  await assertExistingRepoFile(
    repoRoot,
    exportContractRef,
    `${label}.export_contract_ref`,
  );
  await assertExistingRepoFile(repoRoot, artifactRef, `${label}.artifact_ref`);
  assertNoRuntimeCoupling(entry, label);

  const expectedContractHash = await sha256OfRepoFile(
    repoRoot,
    exportContractRef,
  );
  if (entry["export_contract_hash"] !== `sha256:${expectedContractHash}`) {
    throw new Error(
      `${label}.export_contract_hash must match referenced contract file`,
    );
  }

  const exportContract = await readJsonFile<JsonObject>(
    repoRoot,
    exportContractRef,
  );
  if (!contractValidator(exportContract)) {
    throw new Error(
      `${exportContractRef} failed export contract schema validation: ${formatSchemaErrors(
        contractValidator.errors,
      )}`,
    );
  }

  assertNoRuntimeCoupling(
    exportContract,
    `export contract ${exportContractRef}`,
  );
  assertNoLiveBoundary(
    exportContract["integration_boundary"],
    `export contract ${exportContractRef}.integration_boundary`,
  );

  const indexedArtifact = firstArtifact(
    exportContract,
    `export contract ${exportContractRef}`,
  );
  const traceability = sourceTraceability(
    indexedArtifact,
    `export contract ${exportContractRef}`,
  );
  const approvedArtifact = await readJsonFile<JsonObject>(
    repoRoot,
    artifactRef,
  );
  const reviewManifestRef = reviewManifestPath(
    indexedArtifact,
    `export contract ${exportContractRef}`,
  );
  const reviewManifest = await readJsonFile<JsonObject>(
    repoRoot,
    reviewManifestRef,
  );

  assertNoRuntimeCoupling(
    traceability,
    `export contract ${exportContractRef}.source_traceability`,
  );
  await assertExistingRepoFile(
    repoRoot,
    asString(traceability["content_ref"], `${exportContractRef}.content_ref`),
    `${exportContractRef}.content_ref`,
  );
  await assertExistingRepoFile(
    repoRoot,
    reviewManifestRef,
    `${exportContractRef}.review_manifest`,
  );

  for (const [refIndex, evidenceRef] of asStringArray(
    traceability["evidence_refs"],
    `${exportContractRef}.evidence_refs`,
  ).entries()) {
    await assertExistingRepoFile(
      repoRoot,
      evidenceRef,
      `${exportContractRef}.evidence_refs[${refIndex}]`,
    );
  }

  if (entry["artifact_id"] !== indexedArtifact["artifact_id"]) {
    throw new Error(
      `${label}.artifact_id must match export contract artifact_id`,
    );
  }

  if (entry["artifact_id"] !== approvedArtifact["artifact_id"]) {
    throw new Error(
      `${label}.artifact_id must match approved artifact artifact_id`,
    );
  }

  if (indexedArtifact["artifact_id"] !== approvedArtifact["artifact_id"]) {
    throw new Error(
      `${exportContractRef} must point to the approved artifact file`,
    );
  }

  if (
    entry["contract_schema_version"] !==
    exportContract["contract_schema_version"]
  ) {
    throw new Error(
      `${label}.contract_schema_version must match export contract`,
    );
  }

  if (entry["downstream_eligible"] === true) {
    for (const [subjectLabel, subject] of [
      [label, entry],
      [`export contract ${exportContractRef} artifact`, indexedArtifact],
    ] as const) {
      if (subject["review_status"] !== "approved") {
        throw new Error(`${subjectLabel}.review_status must be approved`);
      }

      if (subject["approval_state"] !== "approved") {
        throw new Error(`${subjectLabel}.approval_state must be approved`);
      }

      if (subject["human_review_required"] !== true) {
        throw new Error(`${subjectLabel}.human_review_required must be true`);
      }
    }

    if (approvedArtifact["review_status"] !== "approved") {
      throw new Error(`${artifactRef}.review_status must be approved`);
    }

    if (approvedArtifact["downstream_allowed"] !== true) {
      throw new Error(`${artifactRef}.downstream_allowed must be true`);
    }

    if (reviewManifest["review_status"] !== "approved") {
      throw new Error(`${reviewManifestRef}.review_status must be approved`);
    }

    if (reviewManifest["downstream_allowed"] !== true) {
      throw new Error(`${reviewManifestRef}.downstream_allowed must be true`);
    }
  }

  const contentRef = asString(
    traceability["content_ref"],
    `${exportContractRef}.content_ref`,
  );
  const expectedContentHash = await sha256OfRepoFile(repoRoot, contentRef);
  if (traceability["content_hash"] !== `sha256:${expectedContentHash}`) {
    throw new Error(
      `${exportContractRef}.content_hash must match referenced content file`,
    );
  }

  return {
    entry,
    exportContractRef,
    artifactRef,
    exportContract,
    approvedArtifact,
    indexedArtifact,
    reviewManifestRef,
    reviewManifest,
    contentRef,
    evidenceRefs: asStringArray(
      traceability["evidence_refs"],
      `${exportContractRef}.evidence_refs`,
    ),
  };
}

export async function loadVerifiedApprovedExportCatalog(
  options: ApprovedExportCatalogVerificationOptions = {},
): Promise<VerifiedApprovedExportCatalog> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const catalogPath = options.catalogPath ?? defaultCatalogPath;
  assertRepoRelativePath(catalogPath, "catalog path");
  const [catalogValidator, contractValidator] = await Promise.all([
    buildValidator(repoRoot, catalogSchemaPath),
    buildValidator(repoRoot, contractSchemaPath),
  ]);
  const catalog = await readJsonFile<JsonObject>(repoRoot, catalogPath);

  if (!catalogValidator(catalog)) {
    throw new Error(
      `${catalogPath} failed export catalog schema validation: ${formatSchemaErrors(
        catalogValidator.errors,
      )}`,
    );
  }

  assertNoRuntimeCoupling(catalog, "export catalog");
  assertNoLiveBoundary(
    catalog["integration_boundary"],
    "export catalog.integration_boundary",
  );

  const catalogEntries = asRecordArray(
    catalog["entries"],
    "export catalog.entries",
  );
  const entries: VerifiedApprovedExportCatalogEntry[] = [];

  for (const [entryIndex, entry] of catalogEntries.entries()) {
    entries.push(
      await verifyCatalogEntry({
        repoRoot,
        entry,
        entryIndex,
        contractValidator,
      }),
    );
  }

  return { catalogPath, catalog, entries };
}

export async function verifyApprovedExportCatalog(
  options: ApprovedExportCatalogVerificationOptions = {},
): Promise<ApprovedExportCatalogVerificationResult> {
  const catalogPath = options.catalogPath ?? defaultCatalogPath;
  const errors: string[] = [];
  let entriesChecked = 0;
  let contractsChecked = 0;
  let artifactsChecked = 0;

  try {
    const verified = await loadVerifiedApprovedExportCatalog(options);
    entriesChecked = verified.entries.length;
    contractsChecked = verified.entries.length;
    artifactsChecked = verified.entries.length;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  return {
    ok: errors.length === 0,
    catalogPath,
    entriesChecked,
    contractsChecked,
    artifactsChecked,
    errors,
  };
}

export function formatVerificationSummary(
  result: ApprovedExportCatalogVerificationResult,
): string {
  const status = result.ok ? "PASS" : "FAIL";
  const lines = [
    `Approved export catalog verification: ${status}`,
    `catalog: ${result.catalogPath}`,
    `entries checked: ${result.entriesChecked}`,
    `contracts checked: ${result.contractsChecked}`,
    `approved artifact refs checked: ${result.artifactsChecked}`,
  ];

  if (!result.ok) {
    lines.push("errors:");
    for (const error of result.errors) {
      lines.push(`- ${error}`);
    }
  }

  return lines.join("\n");
}

async function run(): Promise<void> {
  const catalogPath = process.argv[2] ?? defaultCatalogPath;
  const result = await verifyApprovedExportCatalog({ catalogPath });

  const output = formatVerificationSummary(result);
  if (result.ok) {
    console.log(output);
    return;
  }

  console.error(output);
  process.exitCode = 1;
}

const isCliRun =
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "");

if (isCliRun) {
  run().catch((error) => {
    console.error("Approved export catalog verification failed", error);
    process.exitCode = 1;
  });
}

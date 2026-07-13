/**
 * Export Contract Agent — PCRAM post-review boundary
 *
 * Transforms approved classifier intelligence artifacts into clean,
 * export-ready records for future external consumption.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { Ajv as AjvClass } from "ajv/dist/ajv.js";
import addFormatsModule from "ajv-formats";

import exportArtifactSchema from "../../schemas/classifier-approved-artifact-export.schema.json" with { type: "json" };
import {
  type ClassifierApprovedArtifactExport,
  type ClassifierIntelligenceArtifact,
  type ExportedClassificationCandidate,
  type ExportedEvidenceClaim,
  validateClassifierIntelligenceArtifact,
  validateExportArtifact,
} from "../contracts/vlatam-global-bridge.js";
import {
  assertValidReviewBinding,
  CURRENT_REVIEW_POLICY,
  ReviewBindingError,
  type ReviewPolicyExpectation,
} from "../review/review-artifact-binding.js";

type AjvInstance = InstanceType<typeof AjvClass>;
type AjvFormatsModule =
  | ((ajv: AjvInstance) => AjvInstance)
  | { default?: (ajv: AjvInstance) => AjvInstance };

const formatsModule = addFormatsModule as AjvFormatsModule;
const applyFormats =
  typeof formatsModule === "function"
    ? formatsModule
    : (formatsModule.default as (ajv: AjvInstance) => AjvInstance);

const ajv = new AjvClass({ allErrors: true, strict: false });
applyFormats(ajv);
const validateExportArtifactSchema = ajv.compile(exportArtifactSchema);

export type {
  ClassifierApprovedArtifactExport,
  ExportedEvidenceClaim,
} from "../contracts/vlatam-global-bridge.js";

export type { ExportedClassificationCandidate };

export interface ExportContractInput {
  readonly source_id: string;
  readonly artifact_id: string;
}

export interface ExportContractOptions {
  readonly data_root?: string;
  readonly exported_at?: string;
}

const SOURCE_ID_REGEX = /^[a-z0-9_-]+$/;
const ARTIFACT_ID_REGEX = /^artifact--[a-z0-9_-]+--[a-z0-9_-]+$/;
const SCHEMA_VERSION = "1.0.0";

function assertContainedPath(
  candidatePath: string,
  expectedRoot: string,
  errorMessage: string,
): void {
  const resolvedRoot = path.resolve(expectedRoot);
  const resolvedCandidate = path.resolve(candidatePath);
  if (
    resolvedCandidate !== resolvedRoot &&
    !resolvedCandidate.startsWith(resolvedRoot + path.sep)
  ) {
    throw new Error(errorMessage);
  }
}

function formatAjvErrors(
  errors: typeof validateExportArtifactSchema.errors,
): string {
  return (
    errors
      ?.map((error: { instancePath?: string; message?: string }) =>
        `${error.instancePath || "(root)"} ${error.message ?? ""}`.trim(),
      )
      .join("; ") ?? "unknown schema error"
  );
}

function validateInput(input: ExportContractInput): void {
  if (!SOURCE_ID_REGEX.test(input.source_id)) {
    throw new Error(`Invalid source_id: ${input.source_id}`);
  }
  if (!ARTIFACT_ID_REGEX.test(input.artifact_id)) {
    throw new Error(`Invalid artifact_id: ${input.artifact_id}`);
  }
}

function resolvePaths(
  input: ExportContractInput,
  options?: ExportContractOptions,
) {
  validateInput(input);

  const dataRoot = path.resolve(options?.data_root ?? process.cwd(), "data");
  const intelligenceRoot = path.resolve(dataRoot, "intelligence");
  const exportsRoot = path.resolve(dataRoot, "exports");
  const inputPath = path.resolve(
    intelligenceRoot,
    input.source_id,
    `${input.artifact_id}.json`,
  );
  const outputDir = path.resolve(exportsRoot, input.source_id);
  const outputPath = path.resolve(
    outputDir,
    `${input.artifact_id}--export.json`,
  );

  assertContainedPath(
    inputPath,
    intelligenceRoot,
    "Input path escapes data/intelligence directory",
  );
  assertContainedPath(
    outputDir,
    exportsRoot,
    "Output path escapes data/exports directory",
  );
  assertContainedPath(
    outputPath,
    exportsRoot,
    "Output path escapes data/exports directory",
  );

  return { inputPath, outputDir, outputPath };
}

function loadApprovedArtifact(
  input: ExportContractInput,
  inputPath: string,
): ClassifierIntelligenceArtifact {
  if (!existsSync(inputPath)) {
    throw new Error(
      `Artifact not found: source_id='${input.source_id}', artifact_id='${input.artifact_id}'`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(inputPath, "utf-8")) as unknown;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid artifact: failed to parse JSON: ${message}`);
  }

  try {
    assertValidReviewBinding(
      parsed as Record<string, unknown>,
      CURRENT_REVIEW_POLICY,
    );
  } catch (error: unknown) {
    const reasonCode =
      error instanceof ReviewBindingError
        ? error.reason_code
        : "review_binding_malformed";
    throw new Error(`REVIEW_BINDING_INVALID: ${reasonCode}`);
  }

  const valid = validateClassifierIntelligenceArtifact(parsed);
  if (!valid.ok || valid.artifact === undefined) {
    throw new Error(`Invalid artifact: ${valid.errors.join(", ")}`);
  }

  const artifact = valid.artifact;
  if (artifact.artifact_id !== input.artifact_id) {
    throw new Error(
      `Invalid artifact: artifact_id mismatch: expected ${input.artifact_id}, got ${artifact.artifact_id}`,
    );
  }
  if (artifact.source_id !== input.source_id) {
    throw new Error(
      `Invalid artifact: source_id mismatch: expected ${input.source_id}, got ${artifact.source_id}`,
    );
  }
  if (
    artifact.source_authority === "synthetic_demo" ||
    artifact.origin === "synthetic_demo"
  ) {
    throw new Error("Cannot export synthetic/demo artifact");
  }
  if (artifact.governance.downstream_allowed !== true) {
    throw new Error(
      "Artifact not approved for export: downstream_allowed must be true",
    );
  }
  if (artifact.review_status !== "reviewed_approved") {
    throw new Error(
      "Artifact not approved for export: review_status must be reviewed_approved",
    );
  }

  return artifact;
}

function toExportedEvidenceClaim(
  claim: ClassifierIntelligenceArtifact["extracted_evidence"][number],
): ExportedEvidenceClaim {
  return {
    claim_id: claim.claim_id,
    claim_type: claim.claim_type,
    text: claim.text,
    ...(claim.confidence !== undefined && { confidence: claim.confidence }),
    ...(claim.affected_ncm !== undefined && {
      affected_ncm: claim.affected_ncm,
    }),
  };
}

function buildExportArtifact(
  input: ExportContractInput,
  artifact: ClassifierIntelligenceArtifact,
  exportedAt: string,
): ClassifierApprovedArtifactExport {
  return {
    export_id: `${input.artifact_id}--export`,
    artifact_id: input.artifact_id,
    source_id: input.source_id,
    exported_at: exportedAt,
    ...(artifact.classification_candidate !== undefined && {
      classification_candidate: {
        ...(artifact.classification_candidate.ncm_code !== undefined && {
          ncm_code: artifact.classification_candidate.ncm_code,
        }),
        ...(artifact.classification_candidate.description !== undefined && {
          description: artifact.classification_candidate.description,
        }),
        ...(artifact.classification_candidate.confidence !== undefined && {
          confidence: artifact.classification_candidate.confidence,
        }),
      },
    }),
    extracted_evidence: artifact.extracted_evidence.map(
      toExportedEvidenceClaim,
    ),
    schema_version: SCHEMA_VERSION,
  };
}

export function buildVerifiedExportArtifact(
  input: ExportContractInput,
  artifact: ClassifierIntelligenceArtifact,
  exportedAt: string,
  policy: ReviewPolicyExpectation = CURRENT_REVIEW_POLICY,
  now: Date = new Date(),
): ClassifierApprovedArtifactExport {
  assertValidReviewBinding(artifact, policy, now);
  if (artifact.artifact_id !== input.artifact_id) {
    throw new ReviewBindingError("artifact_id_mismatch");
  }
  if (artifact.source_id !== input.source_id) {
    throw new ReviewBindingError("artifact_source_id_mismatch");
  }
  return buildExportArtifact(input, artifact, exportedAt);
}

function validateOutputArtifact(
  artifact: ClassifierApprovedArtifactExport,
): void {
  const contractResult = validateExportArtifact(artifact);
  if (!contractResult.ok) {
    throw new Error(
      `Export contract validation failed: ${contractResult.errors.join(", ")}`,
    );
  }

  if (!validateExportArtifactSchema(artifact)) {
    throw new Error(
      `Export schema validation failed: ${formatAjvErrors(validateExportArtifactSchema.errors)}`,
    );
  }
}

export function getExportArtifactRelativePath(
  input: ExportContractInput,
): string {
  validateInput(input);
  return path.posix.join(
    "data",
    "exports",
    input.source_id,
    `${input.artifact_id}--export.json`,
  );
}

export async function exportApprovedArtifact(
  input: ExportContractInput,
  options?: ExportContractOptions,
): Promise<ClassifierApprovedArtifactExport> {
  const { inputPath, outputDir, outputPath } = resolvePaths(input, options);
  const artifact = loadApprovedArtifact(input, inputPath);
  const exportedAt = options?.exported_at ?? artifact.reviewed_at;

  if (!exportedAt) {
    throw new Error(
      "Missing reviewed_at in artifact: cannot generate deterministic export. Provide options.exported_at for tests.",
    );
  }

  const exportArtifact = buildExportArtifact(input, artifact, exportedAt);
  validateOutputArtifact(exportArtifact);

  try {
    mkdirSync(outputDir, { recursive: true });
    const tempPath = `${outputPath}.tmp`;
    writeFileSync(
      tempPath,
      JSON.stringify(exportArtifact, null, 2) + "\n",
      "utf-8",
    );
    renameSync(tempPath, outputPath);
  } catch {
    throw new Error("IO_ERROR: Failed to write export artifact");
  }

  return exportArtifact;
}

import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, rm } from "node:fs/promises";
import { basename, join, parse, relative, resolve, sep } from "node:path";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import type { SourceAcquisitionRecord } from "../acquisition/governed-source-acquisition.js";
import {
  ARCA_NOMENCLADOR_PARSER_CONFIGURATION_HASH,
  ARCA_NOMENCLADOR_PARSER_ID,
  ARCA_NOMENCLADOR_PARSER_VERSION,
  parseArcaNomencladorBytes,
  type TariffLine,
} from "../parsers/arca-nomenclador.js";

export const GOVERNED_ARCA_INGESTION_CONTRACT_VERSION = "1.0.0" as const;
export const GOVERNED_ARCA_SOURCE_ID = "ar-arca-arancel-integrado" as const;

const SHA256_PATTERN = "^[a-f0-9]{64}$";
const ACQUISITION_ID_PATTERN =
  "^ar-arca-arancel-integrado--[0-9]{4}-[0-9]{2}-[0-9]{2}--[a-f0-9]{16}$";
const TIMESTAMP_PATTERN =
  "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$";
const ALLOWED_SOURCE_HOSTS = new Set([
  "arca.gob.ar",
  "www.arca.gob.ar",
  "afip.gob.ar",
  "www.afip.gob.ar",
  "serviciosweb.afip.gob.ar",
]);

export interface GovernedArcaAcquiredSourceInput {
  schema_version: "1.0.0";
  acquisition: {
    acquisition_id: string;
    acquisition_record_sha256: string;
    source_id: string;
    requested_url: string;
    effective_url: string;
    captured_at: string;
    media_type: string;
    raw_sha256: string;
  };
  parser: {
    parser_id: string;
    parser_version: string;
    configuration_sha256: string;
  };
  parsing_timestamp: string;
}

export interface GovernedArcaCandidateArtifact {
  schema_version: "1.0.0";
  artifact_type: "arca_acquired_source_parse_candidate";
  acquisition_artifact: {
    acquisition_id: string;
    acquisition_record_sha256: string;
    source_id: string;
    requested_url: string;
    effective_url: string;
    captured_at: string;
    media_type: string;
    raw_sha256: string;
  };
  parser: {
    parser_id: typeof ARCA_NOMENCLADOR_PARSER_ID;
    parser_version: typeof ARCA_NOMENCLADOR_PARSER_VERSION;
    configuration_sha256: string;
  };
  parsing_timestamp: string;
  parsed_output_sha256: string;
  validation_status: "valid";
  review_state: "human_review_required";
  approval_status: "not_approved";
  publication_status: "not_publishable";
  parsed_output: {
    tariff_lines_count: number;
    tariff_lines: TariffLine[];
  };
}

export interface GovernedArcaIngestionOptions {
  acquisitionRoot: string;
  candidateRoot: string;
}

export interface GovernedArcaIngestionResult {
  candidate: GovernedArcaCandidateArtifact;
  candidatePath: string;
}

export class GovernedArcaIngestionError extends Error {
  constructor(
    readonly code:
      | "INVALID_CONTRACT"
      | "INVALID_PROVENANCE"
      | "MISSING_ACQUISITION"
      | "PATH_NOT_GOVERNED"
      | "SYMLINK_REJECTED"
      | "ACQUISITION_HASH_MISMATCH"
      | "RAW_HASH_MISMATCH"
      | "UNSUPPORTED_CONTENT_TYPE"
      | "UNSUPPORTED_PARSER"
      | "PARSER_FAILURE"
      | "INVALID_OUTPUT"
      | "CANDIDATE_EXISTS"
      | "CANDIDATE_PUBLISH_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "GovernedArcaIngestionError";
  }
}

export const GOVERNED_ARCA_ACQUIRED_SOURCE_INPUT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/governed-arca-acquired-source-input.schema.json",
  title: "Governed ARCA acquired-source parser input",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "acquisition", "parser", "parsing_timestamp"],
  properties: {
    schema_version: { const: GOVERNED_ARCA_INGESTION_CONTRACT_VERSION },
    acquisition: {
      type: "object",
      additionalProperties: false,
      required: [
        "acquisition_id",
        "acquisition_record_sha256",
        "source_id",
        "requested_url",
        "effective_url",
        "captured_at",
        "media_type",
        "raw_sha256",
      ],
      properties: {
        acquisition_id: { type: "string", pattern: ACQUISITION_ID_PATTERN },
        acquisition_record_sha256: { type: "string", pattern: SHA256_PATTERN },
        source_id: { type: "string", minLength: 1 },
        requested_url: { type: "string", minLength: 1 },
        effective_url: { type: "string", minLength: 1 },
        captured_at: { type: "string", pattern: TIMESTAMP_PATTERN },
        media_type: { type: "string", minLength: 1 },
        raw_sha256: { type: "string", pattern: SHA256_PATTERN },
      },
    },
    parser: {
      type: "object",
      additionalProperties: false,
      required: ["parser_id", "parser_version", "configuration_sha256"],
      properties: {
        parser_id: { type: "string", minLength: 1 },
        parser_version: { type: "string", minLength: 1 },
        configuration_sha256: { type: "string", pattern: SHA256_PATTERN },
      },
    },
    parsing_timestamp: { type: "string", pattern: TIMESTAMP_PATTERN },
  },
} as const;

const TARIFF_LINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "ncm_code",
    "ncm_code_clean",
    "hs6_code",
    "description",
    "aec_rate",
    "derecho_extra_zona",
    "tasa_estadistica",
    "iva_rate",
    "iva_is_inferred",
    "unidad_estadistica",
    "source",
    "source_url",
    "snapshot_date",
  ],
  properties: {
    ncm_code: { type: "string", minLength: 1 },
    ncm_code_clean: { type: "string", pattern: "^[0-9]{8,}[A-Z]?$" },
    hs6_code: { type: "string", pattern: "^[0-9]{4}\\.[0-9]{2}$" },
    description: { type: "string", minLength: 1 },
    aec_rate: { type: ["number", "null"] },
    derecho_extra_zona: { type: ["number", "null"] },
    tasa_estadistica: { type: ["number", "null"] },
    iva_rate: { type: ["number", "null"] },
    iva_is_inferred: { type: "boolean" },
    unidad_estadistica: { type: "string" },
    source: { const: "ARCA Arancel Integrado" },
    source_url: { type: "string", minLength: 1 },
    snapshot_date: { type: "string", pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" },
  },
} as const;

export const GOVERNED_ARCA_CANDIDATE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/governed-arca-candidate.schema.json",
  title: "Governed ARCA parse candidate",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "artifact_type",
    "acquisition_artifact",
    "parser",
    "parsing_timestamp",
    "parsed_output_sha256",
    "validation_status",
    "review_state",
    "approval_status",
    "publication_status",
    "parsed_output",
  ],
  properties: {
    schema_version: { const: GOVERNED_ARCA_INGESTION_CONTRACT_VERSION },
    artifact_type: { const: "arca_acquired_source_parse_candidate" },
    acquisition_artifact:
      GOVERNED_ARCA_ACQUIRED_SOURCE_INPUT_SCHEMA.properties.acquisition,
    parser: {
      type: "object",
      additionalProperties: false,
      required: ["parser_id", "parser_version", "configuration_sha256"],
      properties: {
        parser_id: { const: ARCA_NOMENCLADOR_PARSER_ID },
        parser_version: { const: ARCA_NOMENCLADOR_PARSER_VERSION },
        configuration_sha256: { type: "string", pattern: SHA256_PATTERN },
      },
    },
    parsing_timestamp: { type: "string", pattern: TIMESTAMP_PATTERN },
    parsed_output_sha256: { type: "string", pattern: SHA256_PATTERN },
    validation_status: { const: "valid" },
    review_state: { const: "human_review_required" },
    approval_status: { const: "not_approved" },
    publication_status: { const: "not_publishable" },
    parsed_output: {
      type: "object",
      additionalProperties: false,
      required: ["tariff_lines_count", "tariff_lines"],
      properties: {
        tariff_lines_count: { type: "integer", minimum: 1 },
        tariff_lines: {
          type: "array",
          minItems: 1,
          items: TARIFF_LINE_SCHEMA,
        },
      },
    },
  },
} as const;

const ajv = new Ajv({ allErrors: true, strict: true });
const validateInput = ajv.compile(GOVERNED_ARCA_ACQUIRED_SOURCE_INPUT_SCHEMA);
const validateCandidate = ajv.compile(GOVERNED_ARCA_CANDIDATE_SCHEMA);

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export interface GovernedArcaCandidateValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/**
 * Authoritative AI-126 candidate validation. AI-127 and later consumers must
 * reuse this boundary instead of compiling a weaker copy of the schema.
 */
export function validateGovernedArcaCandidate(
  value: unknown,
): GovernedArcaCandidateValidationResult {
  if (!validateCandidate(value)) {
    return {
      valid: false,
      errors: [ajv.errorsText(validateCandidate.errors)],
    };
  }

  const candidate = value as GovernedArcaCandidateArtifact;
  const errors: string[] = [];
  if (
    candidate.parser.parser_id !== ARCA_NOMENCLADOR_PARSER_ID ||
    candidate.parser.parser_version !== ARCA_NOMENCLADOR_PARSER_VERSION ||
    candidate.parser.configuration_sha256 !==
      ARCA_NOMENCLADOR_PARSER_CONFIGURATION_HASH
  ) {
    errors.push("candidate_parser_identity_mismatch");
  }
  const parsedTimestamp = new Date(candidate.parsing_timestamp);
  if (
    Number.isNaN(parsedTimestamp.getTime()) ||
    parsedTimestamp.toISOString() !== candidate.parsing_timestamp
  ) {
    errors.push("candidate_parsing_timestamp_not_canonical_utc");
  }
  if (
    candidate.parsed_output.tariff_lines_count !==
    candidate.parsed_output.tariff_lines.length
  ) {
    errors.push("candidate_tariff_line_count_mismatch");
  }
  if (
    candidate.parsed_output_sha256 !==
    sha256(JSON.stringify(candidate.parsed_output))
  ) {
    errors.push("candidate_parsed_output_sha256_mismatch");
  }
  return { valid: errors.length === 0, errors };
}

function assertCanonicalTimestamp(value: string, field: string): void {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new GovernedArcaIngestionError(
      "INVALID_CONTRACT",
      `${field} must be a canonical UTC timestamp.`,
    );
  }
}

function assertInput(
  value: unknown,
): asserts value is GovernedArcaAcquiredSourceInput {
  if (!validateInput(value)) {
    throw new GovernedArcaIngestionError(
      "INVALID_CONTRACT",
      `Acquired-source parser input is invalid: ${ajv.errorsText(validateInput.errors)}`,
    );
  }
  assertCanonicalTimestamp(value.acquisition.captured_at, "captured_at");
  assertCanonicalTimestamp(value.parsing_timestamp, "parsing_timestamp");
}

function assertContained(root: string, target: string): void {
  const targetRelative = relative(root, target);
  if (
    targetRelative === "" ||
    targetRelative === ".." ||
    targetRelative.startsWith(`..${sep}`) ||
    resolve(root, targetRelative) !== target
  ) {
    throw new GovernedArcaIngestionError(
      "PATH_NOT_GOVERNED",
      "Derived acquisition path is outside the governed root.",
    );
  }
}

interface ConfiguredRootValidation {
  label: "acquisition" | "candidate";
  requireExisting: boolean;
  missingCode: "MISSING_ACQUISITION" | "CANDIDATE_PUBLISH_FAILED";
}

async function validateConfiguredRoot(
  root: string,
  validation: ConfiguredRootValidation,
): Promise<string> {
  const resolvedRoot = resolve(root);
  const filesystemRoot = parse(resolvedRoot).root;
  const relativeComponents = relative(filesystemRoot, resolvedRoot)
    .split(sep)
    .filter(Boolean);
  let current = filesystemRoot;

  for (let index = -1; index < relativeComponents.length; index += 1) {
    if (index >= 0) current = join(current, relativeComponents[index]!);
    let stat;
    try {
      stat = await lstat(current);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT" &&
        !validation.requireExisting
      ) {
        return resolvedRoot;
      }
      throw new GovernedArcaIngestionError(
        validation.missingCode,
        `Configured ${validation.label} root does not exist or cannot be inspected.`,
      );
    }

    if (stat.isSymbolicLink()) {
      throw new GovernedArcaIngestionError(
        "SYMLINK_REJECTED",
        `Configured ${validation.label} root must not contain symbolic-link components.`,
      );
    }
    if (!stat.isDirectory()) {
      throw new GovernedArcaIngestionError(
        "PATH_NOT_GOVERNED",
        `Configured ${validation.label} root components must be directories.`,
      );
    }
  }

  return resolvedRoot;
}

async function assertPathHasNoSymlinks(
  root: string,
  target: string,
): Promise<void> {
  assertContained(root, target);
  const parts = relative(root, target).split(sep);
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    let stat;
    try {
      stat = await lstat(current);
    } catch {
      throw new GovernedArcaIngestionError(
        "MISSING_ACQUISITION",
        "Required governed acquisition artifact is missing.",
      );
    }
    if (stat.isSymbolicLink()) {
      throw new GovernedArcaIngestionError(
        "SYMLINK_REJECTED",
        "Governed acquisition paths must not contain symlinks.",
      );
    }
  }
}

async function readGovernedFile(
  root: string,
  path: string,
): Promise<Uint8Array> {
  await assertPathHasNoSymlinks(root, path);
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile()) {
      throw new GovernedArcaIngestionError(
        "PATH_NOT_GOVERNED",
        "Governed acquisition artifact must be a regular file.",
      );
    }
    return new Uint8Array(await handle.readFile());
  } catch (error: unknown) {
    if (error instanceof GovernedArcaIngestionError) throw error;
    throw new GovernedArcaIngestionError(
      "MISSING_ACQUISITION",
      "Required governed acquisition artifact could not be read.",
    );
  } finally {
    await handle?.close();
  }
}

function parseAcquisitionRecord(bytes: Uint8Array): SourceAcquisitionRecord {
  try {
    const value = JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("record must be an object");
    }
    const record = value as Record<string, unknown>;
    const expectedKeys = [
      "schema_version",
      "acquisition_id",
      "source_id",
      "requested_url",
      "effective_url",
      "source_host",
      "mode",
      "captured_at",
      "content_type",
      "content_length",
      "sha256",
      "raw_path",
      "metadata_path",
    ];
    if (
      Object.keys(record).sort().join("\n") !==
        [...expectedKeys].sort().join("\n") ||
      expectedKeys
        .filter((key) => key !== "content_length")
        .some((key) => typeof record[key] !== "string") ||
      !Number.isSafeInteger(record["content_length"]) ||
      (record["content_length"] as number) <= 0
    ) {
      throw new Error("record shape is invalid");
    }
    return value as SourceAcquisitionRecord;
  } catch {
    throw new GovernedArcaIngestionError(
      "INVALID_PROVENANCE",
      "Acquisition record is not valid JSON provenance.",
    );
  }
}

function parseOfficialUrl(value: string, field: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new GovernedArcaIngestionError(
      "INVALID_PROVENANCE",
      `${field} is not a valid URL.`,
    );
  }
  if (
    parsed.protocol !== "https:" ||
    !ALLOWED_SOURCE_HOSTS.has(parsed.hostname.toLowerCase())
  ) {
    throw new GovernedArcaIngestionError(
      "INVALID_PROVENANCE",
      `${field} is outside the governed ARCA source identity.`,
    );
  }
  return parsed;
}

function assertParser(input: GovernedArcaAcquiredSourceInput): void {
  if (
    input.parser.parser_id !== ARCA_NOMENCLADOR_PARSER_ID ||
    input.parser.parser_version !== ARCA_NOMENCLADOR_PARSER_VERSION ||
    input.parser.configuration_sha256 !==
      ARCA_NOMENCLADOR_PARSER_CONFIGURATION_HASH
  ) {
    throw new GovernedArcaIngestionError(
      "UNSUPPORTED_PARSER",
      "Parser identity, version, or configuration hash is unsupported.",
    );
  }
}

function assertRecordBindings(
  input: GovernedArcaAcquiredSourceInput,
  record: SourceAcquisitionRecord,
  acquisitionDirectory: string,
  metadataPath: string,
): string {
  const expected = input.acquisition;
  const requestedUrl = parseOfficialUrl(
    expected.requested_url,
    "requested_url",
  );
  const effectiveUrl = parseOfficialUrl(
    expected.effective_url,
    "effective_url",
  );
  const expectedAcquisitionId = `${GOVERNED_ARCA_SOURCE_ID}--${expected.captured_at.slice(0, 10)}--${expected.raw_sha256.slice(0, 16)}`;

  if (
    expected.source_id !== GOVERNED_ARCA_SOURCE_ID ||
    expected.acquisition_id !== expectedAcquisitionId ||
    record.schema_version !== "1.0.0" ||
    record.mode !== "replay" ||
    record.acquisition_id !== expected.acquisition_id ||
    record.source_id !== expected.source_id ||
    record.requested_url !== requestedUrl.href ||
    record.effective_url !== effectiveUrl.href ||
    record.source_host !== effectiveUrl.hostname.toLowerCase() ||
    record.captured_at !== expected.captured_at ||
    record.content_type !== expected.media_type ||
    record.sha256 !== expected.raw_sha256
  ) {
    throw new GovernedArcaIngestionError(
      "INVALID_PROVENANCE",
      "Acquisition provenance is incomplete or inconsistent with the parser input.",
    );
  }

  const rawFilename = basename(record.raw_path);
  if (!/^raw\.(?:bin|txt)$/.test(rawFilename)) {
    throw new GovernedArcaIngestionError(
      "PATH_NOT_GOVERNED",
      "Acquisition record references an unsupported raw artifact name.",
    );
  }
  const rawPath = join(acquisitionDirectory, rawFilename);
  if (
    resolve(record.raw_path) !== rawPath ||
    resolve(record.metadata_path) !== metadataPath
  ) {
    throw new GovernedArcaIngestionError(
      "PATH_NOT_GOVERNED",
      "Acquisition record paths do not bind to the governed identity directory.",
    );
  }
  return rawPath;
}

function classifySupportedContent(mediaType: string, bytes: Uint8Array): void {
  if (mediaType !== "text/plain" && mediaType !== "application/octet-stream") {
    throw new GovernedArcaIngestionError(
      "UNSUPPORTED_CONTENT_TYPE",
      `Unsupported acquired content type: ${mediaType}`,
    );
  }
  if (bytes.includes(0)) {
    throw new GovernedArcaIngestionError(
      "UNSUPPORTED_CONTENT_TYPE",
      "Acquired content is not supported ARCA delimiter text.",
    );
  }
  const text = Buffer.from(bytes).toString("latin1");
  if (!/(?:^|\n)2@[^@\r\n]+(?:@[^\r\n]*){9}/.test(text)) {
    throw new GovernedArcaIngestionError(
      "UNSUPPORTED_CONTENT_TYPE",
      "Acquired content does not match the supported ARCA nomenclador shape.",
    );
  }
}

function buildCandidate(
  input: GovernedArcaAcquiredSourceInput,
  tariffLines: TariffLine[],
): GovernedArcaCandidateArtifact {
  if (tariffLines.length === 0) {
    throw new GovernedArcaIngestionError(
      "INVALID_OUTPUT",
      "ARCA parser produced no tariff lines.",
    );
  }
  const parsedOutput = {
    tariff_lines_count: tariffLines.length,
    tariff_lines: tariffLines,
  };
  const candidate: GovernedArcaCandidateArtifact = {
    schema_version: GOVERNED_ARCA_INGESTION_CONTRACT_VERSION,
    artifact_type: "arca_acquired_source_parse_candidate",
    acquisition_artifact: { ...input.acquisition },
    parser: {
      parser_id: ARCA_NOMENCLADOR_PARSER_ID,
      parser_version: ARCA_NOMENCLADOR_PARSER_VERSION,
      configuration_sha256: ARCA_NOMENCLADOR_PARSER_CONFIGURATION_HASH,
    },
    parsing_timestamp: input.parsing_timestamp,
    parsed_output_sha256: sha256(JSON.stringify(parsedOutput)),
    validation_status: "valid",
    review_state: "human_review_required",
    approval_status: "not_approved",
    publication_status: "not_publishable",
    parsed_output: parsedOutput,
  };
  const validation = validateGovernedArcaCandidate(candidate);
  if (!validation.valid) {
    throw new GovernedArcaIngestionError(
      "INVALID_OUTPUT",
      `Candidate parsed artifact is invalid: ${validation.errors.join(", ")}`,
    );
  }
  return candidate;
}

async function publishCandidate(
  candidateRoot: string,
  candidate: GovernedArcaCandidateArtifact,
): Promise<string> {
  const resolvedRoot = await validateConfiguredRoot(candidateRoot, {
    label: "candidate",
    requireExisting: false,
    missingCode: "CANDIDATE_PUBLISH_FAILED",
  });
  await mkdir(resolvedRoot, { recursive: true });
  await validateConfiguredRoot(resolvedRoot, {
    label: "candidate",
    requireExisting: true,
    missingCode: "CANDIDATE_PUBLISH_FAILED",
  });
  const candidateDirectory = join(
    resolvedRoot,
    candidate.acquisition_artifact.source_id,
    candidate.acquisition_artifact.captured_at.slice(0, 10),
    candidate.acquisition_artifact.acquisition_id,
  );
  assertContained(resolvedRoot, candidateDirectory);
  await mkdir(candidateDirectory, { recursive: true });
  await assertPathHasNoSymlinks(resolvedRoot, candidateDirectory);
  const candidatePath = join(
    candidateDirectory,
    `candidate--${candidate.parser.parser_id}--${candidate.parser.parser_version}.json`,
  );
  const stagingPath = join(candidateDirectory, `.staging-${randomUUID()}`);
  try {
    const handle = await open(stagingPath, "wx");
    try {
      await handle.writeFile(`${JSON.stringify(candidate, null, 2)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await link(stagingPath, candidatePath);
    return candidatePath;
  } catch (error: unknown) {
    if (error instanceof GovernedArcaIngestionError) throw error;
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new GovernedArcaIngestionError(
        "CANDIDATE_EXISTS",
        "Immutable candidate artifact already exists.",
      );
    }
    throw new GovernedArcaIngestionError(
      "CANDIDATE_PUBLISH_FAILED",
      "Candidate artifact could not be published atomically.",
    );
  } finally {
    await rm(stagingPath, { force: true });
  }
}

export async function ingestGovernedArcaAcquiredSource(
  value: unknown,
  options: GovernedArcaIngestionOptions,
): Promise<GovernedArcaIngestionResult> {
  assertInput(value);
  assertParser(value);

  const acquisitionRoot = await validateConfiguredRoot(
    options.acquisitionRoot,
    {
      label: "acquisition",
      requireExisting: true,
      missingCode: "MISSING_ACQUISITION",
    },
  );
  const acquisitionDirectory = join(
    acquisitionRoot,
    value.acquisition.source_id,
    value.acquisition.captured_at.slice(0, 10),
    value.acquisition.acquisition_id,
  );
  assertContained(acquisitionRoot, acquisitionDirectory);
  const metadataPath = join(acquisitionDirectory, "metadata.json");
  const metadataBytes = await readGovernedFile(acquisitionRoot, metadataPath);
  if (sha256(metadataBytes) !== value.acquisition.acquisition_record_sha256) {
    throw new GovernedArcaIngestionError(
      "ACQUISITION_HASH_MISMATCH",
      "Acquisition record SHA-256 does not match the governed parser input.",
    );
  }

  const record = parseAcquisitionRecord(metadataBytes);
  const rawPath = assertRecordBindings(
    value,
    record,
    acquisitionDirectory,
    metadataPath,
  );
  const rawBytes = await readGovernedFile(acquisitionRoot, rawPath);
  if (
    sha256(rawBytes) !== value.acquisition.raw_sha256 ||
    rawBytes.byteLength !== record.content_length
  ) {
    throw new GovernedArcaIngestionError(
      "RAW_HASH_MISMATCH",
      "Raw acquisition bytes no longer match their governed provenance.",
    );
  }

  classifySupportedContent(value.acquisition.media_type, rawBytes);
  let tariffLines: TariffLine[];
  try {
    tariffLines = parseArcaNomencladorBytes(rawBytes, {
      sourceUrl: value.acquisition.effective_url,
      snapshotDate: value.acquisition.captured_at.slice(0, 10),
    });
  } catch {
    throw new GovernedArcaIngestionError(
      "PARSER_FAILURE",
      "The governed ARCA parser failed.",
    );
  }
  const candidate = buildCandidate(value, tariffLines);
  const candidatePath = await publishCandidate(
    options.candidateRoot,
    candidate,
  );
  return { candidate, candidatePath };
}

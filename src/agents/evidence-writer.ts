/**
 * Evidence Writer Agent — PCRAM Chain Step 4/5
 *
 * Consumes repository-local AI extraction results and writes deterministic,
 * review-only classifier intelligence artifacts for human inspection.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Ajv2020 as AjvClass } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

import extractionResultSchema from '../../schemas/ai-extraction-result.schema.json' with { type: 'json' };
import classifierIntelligenceArtifactSchema from '../../schemas/classifier-intelligence-artifact.schema.json' with { type: 'json' };
import {
  type ClaimType,
  type ClassificationCandidate,
  type ClassifierIntelligenceArtifact,
  type EvidenceClaim,
  getGovernanceFlags,
  isValidClaimType,
  validateClassifierIntelligenceArtifact,
} from '../contracts/vlatam-global-bridge.js';

// ESM/CJS interop for ajv-formats
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const applyFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (ajv: AjvClass) => void;

const ajv = new AjvClass({ allErrors: true, strict: false });
applyFormats(ajv);
const validateExtractionResult = ajv.compile(extractionResultSchema);
const validateClassifierArtifactSchema = ajv.compile(classifierIntelligenceArtifactSchema);

export type { ClaimType, ClassificationCandidate, ClassifierIntelligenceArtifact, EvidenceClaim };

export interface EvidenceWriterInput {
  readonly source_id: string;
  readonly extraction_result_id: string;
}

export interface EvidenceWriterOptions {
  readonly data_root?: string;
  readonly generated_at?: string;
}

interface AiExtractedClaim {
  readonly claim_id: string;
  readonly claim_text: string;
  readonly evidence_reference: string;
  readonly support_status: 'supported_by_packet' | 'unsupported' | 'needs_human_review';
  readonly confidence: number;
}

interface AiExtractionResult {
  readonly extraction_result_id: string;
  readonly evidence_packet_id: string;
  readonly review_manifest_id: string;
  readonly snapshot_id: string;
  readonly source_id: string;
  readonly provider_id: string;
  readonly model_id: string;
  readonly extraction_status: 'draft_unreviewed' | 'critique_flagged' | 'validation_failed' | 'provider_failed';
  readonly extracted_claims: AiExtractedClaim[];
  readonly unsupported_claims: readonly unknown[];
  readonly warnings: readonly string[];
  readonly confidence: number;
  readonly critic_summary: string;
  readonly human_review_required: true;
  readonly downstream_allowed: false;
  readonly created_at: string;
  readonly extracted_at?: string;
  readonly contract_version: string;
  readonly schema_version: string;
}

const SOURCE_ID_REGEX = /^[a-z0-9_-]+$/;
const EXTRACTION_RESULT_ID_REGEX = /^[a-z0-9_-]+$/;
const SCHEMA_VERSION = '1.0.0';

function assertContainedPath(candidatePath: string, expectedRoot: string, errorMessage: string): void {
  const resolvedRoot = path.resolve(expectedRoot);
  const resolvedCandidate = path.resolve(candidatePath);
  if (resolvedCandidate !== resolvedRoot && !resolvedCandidate.startsWith(resolvedRoot + path.sep)) {
    throw new Error(errorMessage);
  }
}

function formatAjvErrors(errors: typeof validateExtractionResult.errors): string {
  return errors
    ?.map((error: { instancePath?: string; message?: string }) =>
      `${error.instancePath || '(root)'} ${error.message ?? ''}`.trim()
    )
    .join('; ') ?? 'unknown schema error';
}

function resolveDataRoot(options?: EvidenceWriterOptions): string {
  return path.resolve(options?.data_root ?? process.cwd(), 'data');
}

function validateInputs(input: EvidenceWriterInput): void {
  if (!SOURCE_ID_REGEX.test(input.source_id)) {
    throw new Error(`Invalid source_id: ${input.source_id}`);
  }
  if (!EXTRACTION_RESULT_ID_REGEX.test(input.extraction_result_id)) {
    throw new Error(`Invalid extraction_result_id: ${input.extraction_result_id}`);
  }
}

function resolvePaths(input: EvidenceWriterInput, options?: EvidenceWriterOptions) {
  validateInputs(input);

  const dataRoot = resolveDataRoot(options);
  const extractionRoot = path.resolve(dataRoot, 'extractions');
  const intelligenceRoot = path.resolve(dataRoot, 'intelligence');
  const inputPath = path.resolve(extractionRoot, input.source_id, `${input.extraction_result_id}.json`);
  const outputDir = path.resolve(intelligenceRoot, input.source_id);
  const artifactId = `artifact--${input.source_id}--${input.extraction_result_id}`;
  const outputPath = path.resolve(outputDir, `${artifactId}.json`);

  assertContainedPath(inputPath, extractionRoot, 'Input path escapes data/extractions directory');
  assertContainedPath(outputDir, intelligenceRoot, 'Output path escapes data/intelligence directory');
  assertContainedPath(outputPath, intelligenceRoot, 'Output path escapes data/intelligence directory');

  return { artifactId, inputPath, outputDir, outputPath };
}

function readExtractionResult(input: EvidenceWriterInput, inputPath: string): AiExtractionResult {
  if (!existsSync(inputPath)) {
    throw new Error(
      `EXTRACTION_RESULT_NOT_FOUND: Extraction result not found: source_id='${input.source_id}', extraction_result_id='${input.extraction_result_id}'`
    );
  }

  let rawJson: string;
  try {
    rawJson = readFileSync(inputPath, 'utf-8');
  } catch {
    throw new Error(
      `EXTRACTION_RESULT_READ_ERROR: Failed to read extraction result: source_id='${input.source_id}', extraction_result_id='${input.extraction_result_id}'`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson) as unknown;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`EXTRACTION_RESULT_SCHEMA_ERROR: Failed to parse extraction result JSON: ${message}`);
  }

  if (!validateExtractionResult(parsed)) {
    throw new Error(`EXTRACTION_RESULT_SCHEMA_ERROR: ${formatAjvErrors(validateExtractionResult.errors)}`);
  }

  return parsed as unknown as AiExtractionResult;
}

function mapClaimType(text: string, sourceRef: string): ClaimType {
  const haystack = `${text} ${sourceRef}`.toLowerCase();
  const mappingRules: readonly [readonly string[], ClaimType][] = [
    [['rate', 'tariff', 'arancel', 'duty', 'tax'], 'tariff'],
    [['classification', 'classify', 'ncm', 'hs_code', 'sh_code', 'codification'], 'classification'],
    [['intervention', 'license', 'permit', 'anmat', 'enacom', 'sennir'], 'intervention'],
    [['legal', 'law', 'decree', 'resolution', 'disposition', 'statute'], 'legal'],
  ];

  for (const [patterns, claimType] of mappingRules) {
    if (patterns.some(pattern => haystack.includes(pattern))) {
      return claimType;
    }
  }

  return 'norm';
}

function normalizeNcm(code: string): string {
  return code.replace(/\./g, '');
}

function extractAffectedNcm(text: string): string[] {
  const ncmSet = new Set<string>();
  const dottedMatches = text.match(/\d{4}\.\d{2}\.\d{2}(?:\.\d{3}[A-Z]?)?/g);
  const compactMatches = text.match(/\b\d{8,12}[A-Z]?\b/g);

  if (dottedMatches !== null) {
    for (const match of dottedMatches) ncmSet.add(normalizeNcm(match));
  }
  if (compactMatches !== null && text.toLowerCase().includes('ncm')) {
    for (const match of compactMatches) ncmSet.add(normalizeNcm(match));
  }

  return Array.from(ncmSet);
}

function toEvidenceClaim(claim: AiExtractedClaim): EvidenceClaim {
  const claimType = mapClaimType(claim.claim_text, claim.evidence_reference);
  if (!isValidClaimType(claimType)) {
    throw new Error(`CONTRACT_VIOLATION: Invalid claim_type ${claimType}`);
  }

  const affectedNcm = extractAffectedNcm(`${claim.claim_text} ${claim.evidence_reference}`);

  return {
    claim_id: claim.claim_id,
    claim_type: claimType,
    text: claim.claim_text,
    source_ref: claim.evidence_reference,
    confidence: claim.confidence,
    ...(affectedNcm.length > 0 && { affected_ncm: affectedNcm }),
    requires_review: true,
  };
}

function buildClassificationCandidate(claims: EvidenceClaim[]): ClassificationCandidate | undefined {
  const classificationClaim = claims.find(claim => claim.claim_type === 'classification');
  if (classificationClaim === undefined) {
    return undefined;
  }

  return {
    ...(classificationClaim.affected_ncm?.[0] !== undefined && { ncm_code: classificationClaim.affected_ncm[0] }),
    description: classificationClaim.text,
    ...(classificationClaim.confidence !== undefined && { confidence: classificationClaim.confidence }),
    status: 'candidate',
  };
}

function validateOutputArtifact(artifact: ClassifierIntelligenceArtifact): void {
  const contractResult = validateClassifierIntelligenceArtifact(artifact);
  if (!contractResult.ok) {
    throw new Error(`CONTRACT_VALIDATION_ERROR: ${contractResult.errors.join(', ')}`);
  }

  if (!validateClassifierArtifactSchema(artifact)) {
    throw new Error(`OUTPUT_SCHEMA_ERROR: ${formatAjvErrors(validateClassifierArtifactSchema.errors)}`);
  }
}

export function getEvidenceArtifactRelativePath(input: EvidenceWriterInput): string {
  validateInputs(input);
  const artifactId = `artifact--${input.source_id}--${input.extraction_result_id}`;
  return path.posix.join('data', 'intelligence', input.source_id, `${artifactId}.json`);
}

export async function writeEvidenceArtifact(
  input: EvidenceWriterInput,
  options?: EvidenceWriterOptions
): Promise<ClassifierIntelligenceArtifact> {
  const { artifactId, inputPath, outputDir, outputPath } = resolvePaths(input, options);
  const extractionResult = readExtractionResult(input, inputPath);

  if (extractionResult.source_id !== input.source_id) {
    throw new Error(
      `EXTRACTION_RESULT_SCHEMA_ERROR: source_id mismatch: expected ${input.source_id}, got ${extractionResult.source_id}`
    );
  }
  if (extractionResult.extraction_result_id !== input.extraction_result_id) {
    throw new Error(
      `EXTRACTION_RESULT_SCHEMA_ERROR: extraction_result_id mismatch: expected ${input.extraction_result_id}, got ${extractionResult.extraction_result_id}`
    );
  }

  const generatedAt = options?.generated_at ?? extractionResult.extracted_at;
  if (!generatedAt) {
    throw new Error('Missing extracted_at: cannot generate deterministic artifact. Provide options.generated_at for tests.');
  }

  const extractedEvidence = extractionResult.extracted_claims.map(toEvidenceClaim);
  const classificationCandidate = buildClassificationCandidate(extractedEvidence);

  const artifact: ClassifierIntelligenceArtifact = {
    artifact_id: artifactId,
    extraction_result_id: input.extraction_result_id,
    source_id: input.source_id,
    generated_at: generatedAt,
    ...(classificationCandidate !== undefined && { classification_candidate: classificationCandidate }),
    extracted_evidence: extractedEvidence,
    governance: getGovernanceFlags(),
    schema_version: SCHEMA_VERSION,
  };

  validateOutputArtifact(artifact);

  try {
    mkdirSync(outputDir, { recursive: true });
    const tempPath = `${outputPath}.tmp`;
    writeFileSync(tempPath, JSON.stringify(artifact, null, 2) + '\n', 'utf-8');
    renameSync(tempPath, outputPath);
  } catch {
    throw new Error('IO_ERROR: Failed to write intelligence artifact');
  }

  return artifact;
}

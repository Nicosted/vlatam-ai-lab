/**
 * Delta Analyzer Agent — PCRAM Chain Step 3/5
 *
 * Consumes Source Monitor delta reports and produces review-only evidence
 * packets with claim types constrained to the vlatam-global fail-closed
 * contract allowlist.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Ajv2020 as AjvClass } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

import deltaSchema from '../../schemas/source-monitor-delta.schema.json' with { type: 'json' };
import evidencePacketSchema from '../../schemas/delta-analyzer-evidence-packet.schema.json' with { type: 'json' };
import {
  ALLOWED_CLAIM_TYPES,
  type ClaimType,
  getGovernanceFlags,
  isValidClaimType,
} from '../contracts/vlatam-global-bridge.js';

// ESM/CJS interop for ajv-formats
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const applyFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (ajv: AjvClass) => void;

const ajv = new AjvClass({ allErrors: true, strict: false });
applyFormats(ajv);
const validateDelta = ajv.compile(deltaSchema);
const validateEvidencePacket = ajv.compile(evidencePacketSchema);

export interface DeltaAnalyzerInput {
  source_id: string;
  from_date: string;
  to_date: string;
  extracted_at?: string;
}

interface SourceMonitorDeltaChange {
  readonly type: 'added' | 'removed' | 'modified';
  readonly path: string;
  readonly old_value?: unknown;
  readonly new_value?: unknown;
}

interface SourceMonitorDelta {
  readonly delta_id: string;
  readonly source_id: string;
  readonly changes: SourceMonitorDeltaChange[];
}

export interface DeltaAnalyzerEvidenceClaim {
  readonly claim_id: string;
  readonly claim_type: ClaimType;
  readonly description: string;
  readonly affected_ncm: string[];
  readonly old_value?: unknown;
  readonly new_value?: unknown;
  readonly confidence: number;
  readonly requires_human_review: true;
}

export type ClaimTypeCounts = Record<ClaimType, number>;

export interface DeltaAnalyzerEvidencePacket {
  readonly packet_id: string;
  readonly source_delta_id: string;
  readonly source_id: string;
  readonly extracted_at: string;
  readonly claims: DeltaAnalyzerEvidenceClaim[];
  readonly summary: {
    readonly total_claims: number;
    readonly by_type: ClaimTypeCounts;
    readonly requires_review_count: number;
  };
  readonly governance: ReturnType<typeof getGovernanceFlags>;
  readonly schema_version: string;
}

export interface DeltaAnalyzerOutput {
  packet: DeltaAnalyzerEvidencePacket;
  outputPath: string;
}

function formatAjvErrors(errors: typeof validateDelta.errors): string {
  return errors
    ?.map((error: { instancePath?: string; message?: string }) =>
      `${error.instancePath || '(root)'} ${error.message ?? ''}`.trim()
    )
    .join('; ') ?? 'unknown schema error';
}

function readDelta(deltaPath: string): SourceMonitorDelta {
  if (!existsSync(deltaPath)) {
    throw new Error(`DELTA_NOT_FOUND: Delta file not found: ${deltaPath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(deltaPath, 'utf-8')) as unknown;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`DELTA_SCHEMA_ERROR: Failed to parse delta JSON: ${message}`);
  }

  if (!validateDelta(parsed)) {
    throw new Error(`DELTA_SCHEMA_ERROR: ${formatAjvErrors(validateDelta.errors)}`);
  }

  return parsed as unknown as SourceMonitorDelta;
}

function mapClaimType(changePath: string): ClaimType {
  const normalizedPath = changePath.toLowerCase();

  const mappingRules: readonly [readonly string[], ClaimType][] = [
    [['rate', 'tariff', 'arancel', 'duty', 'tax'], 'tariff'],
    [['classification', 'ncm', 'hs_code', 'sh_code', 'codification'], 'classification'],
    [['intervention', 'license', 'permit', 'sensors', 'anmat', 'enacom', 'sennir'], 'intervention'],
    [['legal', 'law', 'decree', 'resolution', 'disposition', 'statute'], 'legal'],
  ];

  for (const [patterns, claimType] of mappingRules) {
    if (patterns.some(pattern => normalizedPath.includes(pattern))) {
      return claimType;
    }
  }

  return 'norm';
}

function validateContractClaimType(claimType: string): ClaimType {
  if (!isValidClaimType(claimType)) {
    throw new Error(`CONTRACT_VIOLATION: Invalid claim_type ${claimType}`);
  }
  return claimType;
}

function extractAffectedNcm(change: SourceMonitorDeltaChange): string[] {
  const ncmPattern = /\d{4}\.\d{2}\.\d{2}\.\d{3}[A-Z]?/g;
  const candidates = [change.path];

  if (typeof change.new_value === 'string') {
    candidates.push(change.new_value);
  }

  return [...new Set(candidates.flatMap(candidate => candidate.match(ncmPattern) ?? []))];
}

function calculateConfidence(change: SourceMonitorDeltaChange, affectedNcm: string[]): number {
  let confidence = 0.5;
  if (change.path.split('/').length > 4) confidence += 0.2;
  if (affectedNcm.length > 0) confidence += 0.1;
  if (change.type === 'modified') confidence += 0.1;
  return Math.min(confidence, 1.0);
}

function buildTypeCounts(claims: DeltaAnalyzerEvidenceClaim[]): ClaimTypeCounts {
  const counts = Object.fromEntries(ALLOWED_CLAIM_TYPES.map(type => [type, 0])) as ClaimTypeCounts;
  for (const claim of claims) {
    counts[claim.claim_type] += 1;
  }
  return counts;
}

export async function analyzeDelta(input: DeltaAnalyzerInput): Promise<DeltaAnalyzerOutput> {
  const deltaPath = path.join(
    process.cwd(),
    'data',
    'deltas',
    input.source_id,
    `${input.from_date}_to_${input.to_date}.json`
  );

  const delta = readDelta(deltaPath);
  const claims: DeltaAnalyzerEvidenceClaim[] = [];

  for (const change of delta.changes) {
    const mappedType = mapClaimType(change.path);
    const claimType = validateContractClaimType(mappedType);
    const affectedNcm = extractAffectedNcm(change);

    const claim: DeltaAnalyzerEvidenceClaim = {
      claim_id: `claim-${claims.length.toString().padStart(3, '0')}`,
      claim_type: claimType,
      description: `Change detected at ${change.path} (${change.type})`,
      affected_ncm: affectedNcm,
      ...(Object.hasOwn(change, 'old_value') && { old_value: change.old_value }),
      ...(Object.hasOwn(change, 'new_value') && { new_value: change.new_value }),
      confidence: calculateConfidence(change, affectedNcm),
      requires_human_review: true,
    };

    claims.push(claim);
  }

  const packet: DeltaAnalyzerEvidencePacket = {
    packet_id: `${input.source_id}--${input.from_date}_to_${input.to_date}--evidence-001`,
    source_delta_id: delta.delta_id,
    source_id: input.source_id,
    extracted_at: input.extracted_at ?? new Date().toISOString(),
    claims,
    summary: {
      total_claims: claims.length,
      by_type: buildTypeCounts(claims),
      requires_review_count: claims.filter(claim => claim.requires_human_review).length,
    },
    governance: getGovernanceFlags(),
    schema_version: '1.0.0',
  };

  if (!validateEvidencePacket(packet)) {
    throw new Error(`OUTPUT_SCHEMA_ERROR: ${formatAjvErrors(validateEvidencePacket.errors)}`);
  }

  const outputDir = path.join(process.cwd(), 'data', 'evidence', input.source_id);
  const outputPath = path.join(outputDir, `${input.from_date}_to_${input.to_date}--evidence-001.json`);

  try {
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(outputPath, JSON.stringify(packet, null, 2) + '\n', 'utf-8');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`IO_ERROR: Failed to write evidence packet: ${message}`);
  }

  return { packet, outputPath };
}

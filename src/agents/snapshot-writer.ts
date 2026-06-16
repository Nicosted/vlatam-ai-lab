/**
 * Snapshot Writer Agent — PCRAM Chain Step 1/5
 *
 * Takes a local fixture file, computes its SHA-256 hash, attaches provenance
 * metadata, validates against the intelligence-source-snapshot schema, and
 * writes an immutable versioned JSON artifact to data/sources/<source_id>/<date>.json.
 *
 * Constraints:
 * - NO live network requests at runtime.
 * - NO external database. All state is persisted as versioned JSON files.
 * - Input must come from a local fixture file path.
 * - Every artifact is validated against the schema before write.
 */

import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { Ajv2020 as AjvClass } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import snapshotSchema from '../../schemas/intelligence-source-snapshot.schema.json' with { type: 'json' };

// ESM/CJS interop for ajv-formats
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const applyFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (ajv: AjvClass) => void;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SnapshotProvenance {
  readonly retrieval_method: 'manual_fixture';
  readonly fixture_path: string;
  readonly official_url?: string | undefined;
  readonly publication_date?: string | undefined;
}

export interface SnapshotWriterInput {
  readonly source_id: string;
  readonly snapshot_date: string;
  readonly input_path: string;
  readonly official_url?: string | undefined;
  readonly publication_date?: string | undefined;
}

export interface SnapshotArtifact {
  readonly snapshot_id: string;
  readonly source_id: string;
  readonly captured_at: string;
  readonly capture_method: 'local_fixture';
  readonly freshness_status: 'current';
  readonly review_status: 'not_reviewed';
  readonly extraction_status: 'not_started';
  readonly human_review_required: true;
  readonly downstream_allowed: false;
  readonly schema_version: string;
  readonly content_hash: string;
  readonly content: Record<string, unknown>;
  readonly provenance: SnapshotProvenance;
  readonly source_locator: string;
}

export interface SnapshotWriterOutput {
  readonly artifact: SnapshotArtifact;
  readonly output_path: string;
  readonly schema_valid: true;
}

export class SnapshotWriterError extends Error {
  constructor(
    message: string,
    public readonly code: 'INPUT_NOT_FOUND' | 'INPUT_PARSE_ERROR' | 'SCHEMA_VALIDATION_ERROR' | 'WRITE_ERROR'
  ) {
    super(message);
    this.name = 'SnapshotWriterError';
  }
}

// ---------------------------------------------------------------------------
// AJV validator (built once, reused)
// ---------------------------------------------------------------------------

const ajv = new AjvClass({ allErrors: true, strict: false });
applyFormats(ajv);
const validateSnapshot = ajv.compile(snapshotSchema);

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

export async function writeSnapshot(input: SnapshotWriterInput): Promise<SnapshotWriterOutput> {
  const absoluteInputPath = resolve(input.input_path);

  if (!existsSync(absoluteInputPath)) {
    throw new SnapshotWriterError(
      `Input fixture not found: ${absoluteInputPath}`,
      'INPUT_NOT_FOUND'
    );
  }

  let rawBytes: Buffer;
  let contentObject: Record<string, unknown>;

  try {
    rawBytes = readFileSync(absoluteInputPath);
    contentObject = JSON.parse(rawBytes.toString('utf-8')) as Record<string, unknown>;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SnapshotWriterError(
      `Failed to read or parse fixture: ${msg}`,
      'INPUT_PARSE_ERROR'
    );
  }

  const contentHash = 'sha256:' + createHash('sha256').update(rawBytes).digest('hex');

  const snapshotId = `${input.source_id}--${input.snapshot_date}`;
  const capturedAt = `${input.snapshot_date}T00:00:00.000Z`;

  const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), '..', '..');
  const relativeFixturePath = relative(repoRoot, absoluteInputPath);

  const provenance: SnapshotProvenance = {
    retrieval_method: 'manual_fixture',
    fixture_path: relativeFixturePath,
    ...(input.official_url !== undefined && { official_url: input.official_url }),
    ...(input.publication_date !== undefined && { publication_date: input.publication_date }),
  };

  const artifact: SnapshotArtifact = {
    snapshot_id: snapshotId,
    source_id: input.source_id,
    captured_at: capturedAt,
    capture_method: 'local_fixture',
    freshness_status: 'current',
    review_status: 'not_reviewed',
    extraction_status: 'not_started',
    human_review_required: true,
    downstream_allowed: false,
    schema_version: '1.0.0',
    content_hash: contentHash,
    content: contentObject,
    provenance,
    source_locator: relativeFixturePath,
  };

  const valid = validateSnapshot(artifact);
  if (!valid) {
    const errors = validateSnapshot.errors
      ?.map((e: { instancePath?: string; message?: string }) => `${e.instancePath || '(root)'} ${e.message ?? ''}`.trim())
      .join('; ') ?? 'unknown validation error';
    throw new SnapshotWriterError(
      `Schema validation failed: ${errors}`,
      'SCHEMA_VALIDATION_ERROR'
    );
  }

  const outputDir = resolve(repoRoot, 'data', 'sources', input.source_id);
  const outputPath = resolve(outputDir, `${input.snapshot_date}.json`);

  try {
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(outputPath, JSON.stringify(artifact, null, 2) + '\n', { encoding: 'utf-8' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SnapshotWriterError(`Failed to write snapshot: ${msg}`, 'WRITE_ERROR');
  }

  return { artifact, output_path: outputPath, schema_valid: true };
}

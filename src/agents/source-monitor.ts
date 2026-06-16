/**
 * Source Monitor Agent — PCRAM Chain Step 2/5
 *
 * Compares two intelligence-source-snapshot artifacts of the same source and
 * produces a structured delta report written to
 * data/deltas/<source_id>/<from_date>_to_<to_date>.json
 *
 * Constraints:
 * - NO live network requests.
 * - NO external database. All I/O is local JSON files.
 * - Tolerant of snapshots missing optional `content` field (legacy mode).
 * - Output validated against source-monitor-delta.schema.json before write.
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 as AjvClass } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

import snapshotSchema from '../../schemas/intelligence-source-snapshot.schema.json' with { type: 'json' };
import deltaSchema from '../../schemas/source-monitor-delta.schema.json' with { type: 'json' };

// ---------------------------------------------------------------------------
// ESM/CJS interop for ajv-formats
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const applyFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (ajv: AjvClass) => void;

const ajv = new AjvClass({ allErrors: true, strict: false });
applyFormats(ajv);
const validateSnapshot = ajv.compile(snapshotSchema);
const validateDelta = ajv.compile(deltaSchema);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VOLATILE_SNAPSHOT_FIELDS = new Set([
  'review_status',
  'extraction_status',
  'captured_at',
  'created_at',
  'contract_version',
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceMonitorInput {
  readonly source_id: string;
  readonly from_date: string;
  readonly to_date: string;
  readonly from_snapshot_path?: string | undefined;
  readonly to_snapshot_path?: string | undefined;
}

export interface DeltaChange {
  readonly type: 'added' | 'removed' | 'modified';
  readonly path: string;
  readonly old_value?: unknown;
  readonly new_value?: unknown;
}

export interface DeltaSummary {
  readonly added: number;
  readonly removed: number;
  readonly modified: number;
  readonly total: number;
}

export interface SourceMonitorDelta {
  readonly delta_id: string;
  readonly source_id: string;
  readonly from_snapshot: string;
  readonly to_snapshot: string;
  readonly from_date: string;
  readonly to_date: string;
  readonly content_hash_changed: boolean;
  readonly diff_mode: 'content' | 'full_object';
  readonly changes: DeltaChange[];
  readonly summary: DeltaSummary;
  readonly human_review_required: true;
  readonly downstream_allowed: false;
  readonly schema_version: string;
  readonly generated_at: string;
  readonly notes: string[];
}

export interface SourceMonitorOutput {
  readonly delta: SourceMonitorDelta;
  readonly output_path: string;
  readonly schema_valid: true;
}

export class SourceMonitorError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'SNAPSHOT_NOT_FOUND'
      | 'SNAPSHOT_PARSE_ERROR'
      | 'SNAPSHOT_SCHEMA_ERROR'
      | 'SOURCE_ID_MISMATCH'
      | 'DATE_ORDER_ERROR'
      | 'DELTA_SCHEMA_ERROR'
      | 'WRITE_ERROR'
  ) {
    super(message);
    this.name = 'SourceMonitorError';
  }
}

// ---------------------------------------------------------------------------
// Deep diff (pure, recursive)
// ---------------------------------------------------------------------------

function deepDiff(
  from: unknown,
  to: unknown,
  path: string,
  changes: DeltaChange[]
): void {
  if (from === to) return;

  const fromType = typeof from;
  const toType = typeof to;

  if (fromType !== toType || from === null || to === null ||
      Array.isArray(from) !== Array.isArray(to)) {
    changes.push({ type: 'modified', path, old_value: from, new_value: to });
    return;
  }

  if (Array.isArray(from) && Array.isArray(to)) {
    const maxLen = Math.max(from.length, to.length);
    for (let i = 0; i < maxLen; i++) {
      const childPath = `${path}/${i}`;
      if (i >= from.length) {
        changes.push({ type: 'added', path: childPath, new_value: to[i] });
      } else if (i >= to.length) {
        changes.push({ type: 'removed', path: childPath, old_value: from[i] });
      } else {
        deepDiff(from[i], to[i], childPath, changes);
      }
    }
    return;
  }

  if (fromType === 'object') {
    const fromObj = from as Record<string, unknown>;
    const toObj = to as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(fromObj), ...Object.keys(toObj)]);
    for (const key of allKeys) {
      const childPath = `${path}/${key}`;
      if (!(key in fromObj)) {
        changes.push({ type: 'added', path: childPath, new_value: toObj[key] });
      } else if (!(key in toObj)) {
        changes.push({ type: 'removed', path: childPath, old_value: fromObj[key] });
      } else {
        deepDiff(fromObj[key], toObj[key], childPath, changes);
      }
    }
    return;
  }

  changes.push({ type: 'modified', path, old_value: from, new_value: to });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SnapshotRecord = Record<string, unknown>;

function readSnapshot(filePath: string): SnapshotRecord {
  if (!existsSync(filePath)) {
    throw new SourceMonitorError(
      `Snapshot file not found: ${filePath}`,
      'SNAPSHOT_NOT_FOUND'
    );
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as SnapshotRecord;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SourceMonitorError(
      `Failed to parse snapshot: ${msg}`,
      'SNAPSHOT_PARSE_ERROR'
    );
  }
}

function validateSnapshotRecord(snapshot: SnapshotRecord, label: string): void {
  const valid = validateSnapshot(snapshot);
  if (!valid) {
    const errors = validateSnapshot.errors
      ?.map((e: { instancePath?: string; message?: string }) =>
        `${e.instancePath || '(root)'} ${e.message ?? ''}`.trim())
      .join('; ') ?? 'unknown error';
    throw new SourceMonitorError(
      `${label} failed schema validation: ${errors}`,
      'SNAPSHOT_SCHEMA_ERROR'
    );
  }
}

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

const __filenameUrl = import.meta.url;
const repoRoot = resolve(dirname(fileURLToPath(__filenameUrl)), '..', '..');

export async function monitorSource(input: SourceMonitorInput): Promise<SourceMonitorOutput> {
  // Resolve snapshot paths (explicit override or conventional location)
  const fromPath = input.from_snapshot_path
    ?? resolve(repoRoot, 'data', 'sources', input.source_id, `${input.from_date}.json`);
  const toPath = input.to_snapshot_path
    ?? resolve(repoRoot, 'data', 'sources', input.source_id, `${input.to_date}.json`);

  // Validate date order (lexicographic — works for ISO 8601 YYYY-MM-DD)
  if (input.from_date >= input.to_date) {
    throw new SourceMonitorError(
      `from_date (${input.from_date}) must be strictly before to_date (${input.to_date})`,
      'DATE_ORDER_ERROR'
    );
  }

  // Load both snapshots
  const fromSnap = readSnapshot(fromPath);
  const toSnap = readSnapshot(toPath);

  // Validate against intelligence-source-snapshot schema
  validateSnapshotRecord(fromSnap, `from_snapshot (${input.from_date})`);
  validateSnapshotRecord(toSnap, `to_snapshot (${input.to_date})`);

  // Validate same source_id
  if (fromSnap['source_id'] !== toSnap['source_id']) {
    throw new SourceMonitorError(
      `source_id mismatch: from="${fromSnap['source_id']}" to="${toSnap['source_id']}"`,
      'SOURCE_ID_MISMATCH'
    );
  }

  const sourceId = String(fromSnap['source_id']);

  // Determine diff mode and subjects
  const notes: string[] = [];
  const fromHasContent = 'content' in fromSnap && fromSnap['content'] !== undefined;
  const toHasContent = 'content' in toSnap && toSnap['content'] !== undefined;
  const diffMode: 'content' | 'full_object' = (fromHasContent && toHasContent) ? 'content' : 'full_object';

  if (!fromHasContent) notes.push(`from_snapshot (${input.from_date}) has no content field — using full_object diff mode`);
  if (!toHasContent) notes.push(`to_snapshot (${input.to_date}) has no content field — using full_object diff mode`);

  // Build diff subjects
  let fromSubject: unknown;
  let toSubject: unknown;

  if (diffMode === 'content') {
    fromSubject = fromSnap['content'];
    toSubject = toSnap['content'];
  } else {
    // Full object diff — strip volatile governance fields to avoid noise
    const stripVolatile = (snap: SnapshotRecord): SnapshotRecord => {
      const result: SnapshotRecord = {};
      for (const [k, v] of Object.entries(snap)) {
        if (!VOLATILE_SNAPSHOT_FIELDS.has(k)) {
          result[k] = v;
        }
      }
      return result;
    };
    fromSubject = stripVolatile(fromSnap);
    toSubject = stripVolatile(toSnap);
  }

  // Compute changes
  const rawChanges: DeltaChange[] = [];
  deepDiff(fromSubject, toSubject, '', rawChanges);

  // Normalize empty-string root path to '/'
  const changes: DeltaChange[] = rawChanges.map(c => ({
    ...c,
    path: c.path === '' ? '/' : c.path,
  }));

  // Check content_hash_changed
  const contentHashChanged = fromSnap['content_hash'] !== toSnap['content_hash'];

  // Build summary
  const summary: DeltaSummary = {
    added: changes.filter(c => c.type === 'added').length,
    removed: changes.filter(c => c.type === 'removed').length,
    modified: changes.filter(c => c.type === 'modified').length,
    total: changes.length,
  };

  const deltaId = `delta--${sourceId}--${input.from_date}--to--${input.to_date}`;
  const relFrom = relative(repoRoot, fromPath);
  const relTo = relative(repoRoot, toPath);

  const delta: SourceMonitorDelta = {
    delta_id: deltaId,
    source_id: sourceId,
    from_snapshot: relFrom,
    to_snapshot: relTo,
    from_date: input.from_date,
    to_date: input.to_date,
    content_hash_changed: contentHashChanged,
    diff_mode: diffMode,
    changes,
    summary,
    human_review_required: true,
    downstream_allowed: false,
    schema_version: '1.0.0',
    generated_at: new Date().toISOString(),
    notes,
  };

  // Validate output
  const valid = validateDelta(delta);
  if (!valid) {
    const errors = validateDelta.errors
      ?.map((e: { instancePath?: string; message?: string }) =>
        `${e.instancePath || '(root)'} ${e.message ?? ''}`.trim())
      .join('; ') ?? 'unknown error';
    throw new SourceMonitorError(
      `Delta schema validation failed: ${errors}`,
      'DELTA_SCHEMA_ERROR'
    );
  }

  // Write output
  const outputDir = resolve(repoRoot, 'data', 'deltas', sourceId);
  const outputPath = resolve(outputDir, `${input.from_date}_to_${input.to_date}.json`);

  try {
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(outputPath, JSON.stringify(delta, null, 2) + '\n', { encoding: 'utf-8' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SourceMonitorError(`Failed to write delta: ${msg}`, 'WRITE_ERROR');
  }

  return { delta, output_path: outputPath, schema_valid: true };
}

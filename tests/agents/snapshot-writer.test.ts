/**
 * Snapshot Writer Agent — deterministic unit tests
 *
 * Test runner: node:test (tsx --test)
 * All tests use local fixtures only. Zero network calls. Zero dynamic dates.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeSnapshot, SnapshotWriterError } from '../../src/agents/snapshot-writer.js';
import { Ajv2020 as AjvClass } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import snapshotSchema from '../../schemas/intelligence-source-snapshot.schema.json' with { type: 'json' };

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const FIXTURE_PATH = resolve(repoRoot, 'data', 'fixtures', 'infoleg-sample-ncm.json');
const TEST_OUTPUT_DIR = resolve(repoRoot, 'data', 'sources', '__test_snapshot_writer__');
const FROZEN_DATE = '2026-06-16';
const FROZEN_SOURCE = '__test_snapshot_writer__';

// ---------------------------------------------------------------------------
// AJV validator for schema compliance assertions
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const applyFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (ajv: AjvClass) => void;
const ajv = new AjvClass({ allErrors: true, strict: false });
applyFormats(ajv);
const validate = ajv.compile(snapshotSchema);

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

before(() => {
  mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
});

after(() => {
  rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Happy Path
// ---------------------------------------------------------------------------

describe('writeSnapshot — happy path', () => {
  it('creates the output file at the expected path', async () => {
    const result = await writeSnapshot({
      source_id: FROZEN_SOURCE,
      snapshot_date: FROZEN_DATE,
      input_path: FIXTURE_PATH,
    });

    const expectedPath = resolve(repoRoot, 'data', 'sources', FROZEN_SOURCE, `${FROZEN_DATE}.json`);
    assert.equal(result.output_path, expectedPath);
    assert.equal(existsSync(expectedPath), true);
  });

  it('computes the correct SHA-256 hash', async () => {
    const result = await writeSnapshot({
      source_id: FROZEN_SOURCE,
      snapshot_date: FROZEN_DATE,
      input_path: FIXTURE_PATH,
    });

    const rawBytes = readFileSync(FIXTURE_PATH);
    const expectedHash = 'sha256:' + createHash('sha256').update(rawBytes).digest('hex');

    assert.equal(result.artifact.content_hash, expectedHash);
  });

  it('sets governance fields to safe defaults', async () => {
    const result = await writeSnapshot({
      source_id: FROZEN_SOURCE,
      snapshot_date: FROZEN_DATE,
      input_path: FIXTURE_PATH,
    });

    assert.equal(result.artifact.human_review_required, true);
    assert.equal(result.artifact.downstream_allowed, false);
    assert.equal(result.artifact.review_status, 'not_reviewed');
    assert.equal(result.artifact.extraction_status, 'not_started');
  });

  it('sets provenance.retrieval_method to manual_fixture', async () => {
    const result = await writeSnapshot({
      source_id: FROZEN_SOURCE,
      snapshot_date: FROZEN_DATE,
      input_path: FIXTURE_PATH,
    });

    assert.equal(result.artifact.provenance.retrieval_method, 'manual_fixture');
    assert.ok(result.artifact.provenance.fixture_path.includes('infoleg-sample-ncm.json'));
  });

  it('propagates optional official_url and publication_date to provenance', async () => {
    const result = await writeSnapshot({
      source_id: FROZEN_SOURCE,
      snapshot_date: FROZEN_DATE,
      input_path: FIXTURE_PATH,
      official_url: 'https://servicios.infoleg.gob.ar/infolegInternet/',
      publication_date: '2026-01-01',
    });

    assert.equal(result.artifact.provenance.official_url, 'https://servicios.infoleg.gob.ar/infolegInternet/');
    assert.equal(result.artifact.provenance.publication_date, '2026-01-01');
  });

  it('returns schema_valid: true', async () => {
    const result = await writeSnapshot({
      source_id: FROZEN_SOURCE,
      snapshot_date: FROZEN_DATE,
      input_path: FIXTURE_PATH,
    });

    assert.equal(result.schema_valid, true);
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe('writeSnapshot — idempotency', () => {
  it('produces byte-for-byte identical output on repeated runs', async () => {
    const run1 = await writeSnapshot({
      source_id: FROZEN_SOURCE,
      snapshot_date: FROZEN_DATE,
      input_path: FIXTURE_PATH,
    });

    const run2 = await writeSnapshot({
      source_id: FROZEN_SOURCE,
      snapshot_date: FROZEN_DATE,
      input_path: FIXTURE_PATH,
    });

    const file1 = readFileSync(run1.output_path, 'utf-8');
    const file2 = readFileSync(run2.output_path, 'utf-8');

    assert.equal(file1, file2);
    assert.equal(run1.artifact.content_hash, run2.artifact.content_hash);
    assert.equal(run1.artifact.snapshot_id, run2.artifact.snapshot_id);
  });
});

// ---------------------------------------------------------------------------
// Validation Failures — no disk writes on error
// ---------------------------------------------------------------------------

describe('writeSnapshot — validation failures', () => {
  it('throws SnapshotWriterError with code INPUT_NOT_FOUND for missing file', async () => {
    await assert.rejects(
      () => writeSnapshot({
        source_id: FROZEN_SOURCE,
        snapshot_date: FROZEN_DATE,
        input_path: '/nonexistent/path/fixture.json',
      }),
      (err: unknown) => {
        assert.ok(err instanceof SnapshotWriterError);
        assert.equal(err.code, 'INPUT_NOT_FOUND');
        return true;
      }
    );
  });

  it('does NOT write any file when INPUT_NOT_FOUND is thrown', async () => {
    const badPath = resolve(TEST_OUTPUT_DIR, `${FROZEN_DATE}-missing.json`);

    try {
      await writeSnapshot({
        source_id: FROZEN_SOURCE,
        snapshot_date: `${FROZEN_DATE}-missing`,
        input_path: '/nonexistent/path/fixture.json',
      });
    } catch {
      // expected
    }

    assert.equal(existsSync(badPath), false);
  });

  it('throws SnapshotWriterError with code INPUT_PARSE_ERROR for non-JSON file', async () => {
    const malformedPath = resolve(TEST_OUTPUT_DIR, 'malformed.txt');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(malformedPath, 'this is not json { broken', 'utf-8');

    await assert.rejects(
      () => writeSnapshot({
        source_id: FROZEN_SOURCE,
        snapshot_date: FROZEN_DATE,
        input_path: malformedPath,
      }),
      (err: unknown) => {
        assert.ok(err instanceof SnapshotWriterError);
        assert.equal(err.code, 'INPUT_PARSE_ERROR');
        return true;
      }
    );
  });
});

// ---------------------------------------------------------------------------
// Schema Compliance
// ---------------------------------------------------------------------------

describe('writeSnapshot — schema compliance', () => {
  it('generated artifact strictly validates against intelligence-source-snapshot schema', async () => {
    const result = await writeSnapshot({
      source_id: FROZEN_SOURCE,
      snapshot_date: FROZEN_DATE,
      input_path: FIXTURE_PATH,
    });

    const rawFile = readFileSync(result.output_path, 'utf-8');
    const parsed: unknown = JSON.parse(rawFile);
    const valid = validate(parsed);

    if (!valid) {
      const errors = validate.errors?.map((e: { instancePath?: string; message?: string }) => `${e.instancePath} ${e.message}`).join('\n');
      assert.fail(`Schema validation failed:\n${errors}`);
    }

    assert.equal(valid, true);
  });

  it('written file contains all required top-level fields', async () => {
    const result = await writeSnapshot({
      source_id: FROZEN_SOURCE,
      snapshot_date: FROZEN_DATE,
      input_path: FIXTURE_PATH,
    });

    const parsed = JSON.parse(readFileSync(result.output_path, 'utf-8')) as Record<string, unknown>;

    const required = ['snapshot_id', 'source_id', 'captured_at', 'capture_method',
      'freshness_status', 'review_status', 'extraction_status',
      'human_review_required', 'downstream_allowed', 'schema_version',
      'content_hash', 'content', 'provenance'];

    for (const field of required) {
      assert.ok(field in parsed, `Missing required field: ${field}`);
    }
  });

  it('content_hash matches sha256 of the raw fixture bytes', async () => {
    const result = await writeSnapshot({
      source_id: FROZEN_SOURCE,
      snapshot_date: FROZEN_DATE,
      input_path: FIXTURE_PATH,
    });

    const parsed = JSON.parse(readFileSync(result.output_path, 'utf-8')) as Record<string, unknown>;
    const rawBytes = readFileSync(FIXTURE_PATH);
    const expectedHash = 'sha256:' + createHash('sha256').update(rawBytes).digest('hex');

    assert.equal(parsed['content_hash'], expectedHash);
  });
});

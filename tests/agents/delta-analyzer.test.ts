/**
 * Delta Analyzer Agent — deterministic unit tests
 *
 * Test runner: node:test (tsx --test)
 * All tests use local fixtures only. Zero network calls. Fixed extracted_at
 * is passed explicitly for deterministic output assertions.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyzeDelta } from '../../src/agents/delta-analyzer.js';
import { monitorSource } from '../../src/agents/source-monitor.js';
import { GOVERNANCE_FLAGS } from '../../src/contracts/vlatam-global-bridge.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

const REAL_SOURCE = 'infoleg';
const REAL_FROM_DATE = '2026-06-10';
const REAL_TO_DATE = '2026-06-17';
const FIXED_EXTRACTED_AT = '2026-06-16T00:00:00Z';
const REAL_DELTA_PATH = resolve(
  repoRoot,
  'data',
  'deltas',
  REAL_SOURCE,
  `${REAL_FROM_DATE}_to_${REAL_TO_DATE}.json`
);
const REAL_EVIDENCE_PATH = resolve(
  repoRoot,
  'data',
  'evidence',
  REAL_SOURCE,
  `${REAL_FROM_DATE}_to_${REAL_TO_DATE}--evidence-001.json`
);
let originalReferenceEvidence: string | undefined;

const TEST_SOURCE = 'test-delta-analyzer';
const TEST_DELTA_DIR = resolve(repoRoot, 'data', 'deltas', TEST_SOURCE);
const TEST_EVIDENCE_DIR = resolve(repoRoot, 'data', 'evidence', TEST_SOURCE);

type ChangeType = 'added' | 'removed' | 'modified';

interface TestChange {
  readonly type: ChangeType;
  readonly path: string;
  readonly old_value?: unknown;
  readonly new_value?: unknown;
}

function writeDelta(fromDate: string, toDate: string, changes: TestChange[]): string {
  mkdirSync(TEST_DELTA_DIR, { recursive: true });
  const deltaPath = resolve(TEST_DELTA_DIR, `${fromDate}_to_${toDate}.json`);
  const delta = {
    delta_id: `delta--${TEST_SOURCE}--${fromDate}--to--${toDate}`,
    source_id: TEST_SOURCE,
    from_snapshot: `data/sources/${TEST_SOURCE}/${fromDate}.json`,
    to_snapshot: `data/sources/${TEST_SOURCE}/${toDate}.json`,
    from_date: fromDate,
    to_date: toDate,
    content_hash_changed: changes.length > 0,
    diff_mode: 'content',
    changes,
    summary: {
      added: changes.filter(change => change.type === 'added').length,
      removed: changes.filter(change => change.type === 'removed').length,
      modified: changes.filter(change => change.type === 'modified').length,
      total: changes.length,
    },
    human_review_required: true,
    downstream_allowed: false,
    schema_version: '1.0.0',
    generated_at: '2026-06-16T00:00:00Z',
    notes: [],
  };

  writeFileSync(deltaPath, JSON.stringify(delta, null, 2) + '\n', 'utf-8');
  return deltaPath;
}

async function analyzeTestDelta(fromDate: string, toDate: string) {
  return analyzeDelta({
    source_id: TEST_SOURCE,
    from_date: fromDate,
    to_date: toDate,
    extracted_at: FIXED_EXTRACTED_AT,
  });
}

before(async () => {
  if (existsSync(REAL_EVIDENCE_PATH)) {
    originalReferenceEvidence = readFileSync(REAL_EVIDENCE_PATH, 'utf-8');
  }

  if (!existsSync(REAL_DELTA_PATH)) {
    await monitorSource({
      source_id: REAL_SOURCE,
      from_date: REAL_FROM_DATE,
      to_date: REAL_TO_DATE,
    });
  }
});

after(() => {
  rmSync(TEST_DELTA_DIR, { recursive: true, force: true });
  rmSync(TEST_EVIDENCE_DIR, { recursive: true, force: true });
  if (originalReferenceEvidence !== undefined) {
    writeFileSync(REAL_EVIDENCE_PATH, originalReferenceEvidence, 'utf-8');
  }
});

describe('analyzeDelta — happy path with real delta', () => {
  it('creates an evidence packet with contract governance and review-only claims', async () => {
    const result = await analyzeDelta({
      source_id: REAL_SOURCE,
      from_date: REAL_FROM_DATE,
      to_date: REAL_TO_DATE,
      extracted_at: FIXED_EXTRACTED_AT,
    });

    assert.equal(existsSync(result.outputPath), true);
    assert.equal(result.packet.summary.total_claims, 8);
    assert.deepEqual(result.packet.governance, GOVERNANCE_FLAGS);
    assert.equal(result.packet.extracted_at, FIXED_EXTRACTED_AT);
    assert.equal(result.packet.claims.every(claim => claim.requires_human_review === true), true);
  });

});

describe('analyzeDelta — extracted_at defaulting', () => {
  it('uses delta.generated_at when extracted_at is not provided', async () => {
    writeDelta('2026-06-01', '2026-06-02', [{ type: 'modified', path: '/random_field', old_value: 'A', new_value: 'B' }]);
    const result = await analyzeDelta({
      source_id: TEST_SOURCE,
      from_date: '2026-06-01',
      to_date: '2026-06-02',
    });

    assert.equal(result.packet.extracted_at, FIXED_EXTRACTED_AT);
  });
});

describe('analyzeDelta — claim type mapping rules', () => {
  it('maps tariff paths to tariff claims', async () => {
    writeDelta('2026-01-01', '2026-01-02', [{ type: 'modified', path: '/tariffs/rate', old_value: 1, new_value: 2 }]);
    const result = await analyzeTestDelta('2026-01-01', '2026-01-02');
    assert.equal(result.packet.claims[0]?.claim_type, 'tariff');
  });

  it('maps intervention paths to intervention claims', async () => {
    writeDelta('2026-01-03', '2026-01-04', [{ type: 'added', path: '/interventions/anmat_license', new_value: true }]);
    const result = await analyzeTestDelta('2026-01-03', '2026-01-04');
    assert.equal(result.packet.claims[0]?.claim_type, 'intervention');
  });

  it('maps legal paths to legal claims', async () => {
    writeDelta('2026-01-05', '2026-01-06', [{ type: 'modified', path: '/legal_basis/decree', old_value: 'A', new_value: 'B' }]);
    const result = await analyzeTestDelta('2026-01-05', '2026-01-06');
    assert.equal(result.packet.claims[0]?.claim_type, 'legal');
  });

  it('maps NCM paths to classification claims', async () => {
    writeDelta('2026-01-07', '2026-01-08', [{ type: 'added', path: '/ncm_codes/4202.92.00', new_value: '4202.92.00.110V' }]);
    const result = await analyzeTestDelta('2026-01-07', '2026-01-08');
    assert.equal(result.packet.claims[0]?.claim_type, 'classification');
  });

  it('maps unmatched paths to norm claims', async () => {
    writeDelta('2026-01-09', '2026-01-10', [{ type: 'modified', path: '/random_field', old_value: 'A', new_value: 'B' }]);
    const result = await analyzeTestDelta('2026-01-09', '2026-01-10');
    assert.equal(result.packet.claims[0]?.claim_type, 'norm');
  });
});

describe('analyzeDelta — validation failures', () => {
  it('rejects path traversal source_id attempts before reading files', async () => {
    await assert.rejects(
      () => analyzeDelta({
        source_id: '../../etc',
        from_date: '2026-01-01',
        to_date: '2026-01-02',
        extracted_at: FIXED_EXTRACTED_AT,
      }),
      /Invalid source_id/
    );
  });

  it('rejects path traversal from_date attempts before reading files', async () => {
    await assert.rejects(
      () => analyzeDelta({
        source_id: TEST_SOURCE,
        from_date: '../2026-01-01',
        to_date: '2026-01-02',
        extracted_at: FIXED_EXTRACTED_AT,
      }),
      /Invalid from_date/
    );
  });

  it('rejects path traversal to_date attempts before reading files', async () => {
    await assert.rejects(
      () => analyzeDelta({
        source_id: TEST_SOURCE,
        from_date: '2026-01-01',
        to_date: '2026-01-02/../../x',
        extracted_at: FIXED_EXTRACTED_AT,
      }),
      /Invalid to_date/
    );
  });

  it('throws DELTA_NOT_FOUND for a missing delta file', async () => {
    await assert.rejects(
      () => analyzeDelta({
        source_id: TEST_SOURCE,
        from_date: '2030-01-01',
        to_date: '2030-01-02',
        extracted_at: FIXED_EXTRACTED_AT,
      }),
      /DELTA_NOT_FOUND/
    );
  });

  it('does not write output when evidence packet schema validation fails', async () => {
    writeDelta('2026-04-01', '2026-04-02', [{ type: 'modified', path: '/tariffs/rate', old_value: 1, new_value: 2 }]);
    const outputPath = resolve(TEST_EVIDENCE_DIR, '2026-04-01_to_2026-04-02--evidence-001.json');

    await assert.rejects(
      () => analyzeDelta({
        source_id: TEST_SOURCE,
        from_date: '2026-04-01',
        to_date: '2026-04-02',
        extracted_at: 'not-a-date-time',
      }),
      /OUTPUT_SCHEMA_ERROR/
    );

    assert.equal(existsSync(outputPath), false);
  });
});

describe('analyzeDelta — NCM extraction', () => {
  it('extracts and normalizes dotted NCM codes from delta paths', async () => {
    writeDelta('2026-02-01', '2026-02-02', [{ type: 'modified', path: '/regulations/0/ncm/4202.92.00.110V', old_value: 'old', new_value: 'new' }]);
    const result = await analyzeTestDelta('2026-02-01', '2026-02-02');
    assert.deepEqual(result.packet.claims[0]?.affected_ncm, ['42029200110V']);
  });

  it('extracts NCM8 from nested new_value.ncm8', async () => {
    writeDelta('2026-02-03', '2026-02-04', [
      {
        type: 'added',
        path: '/regulations/0/ncm_positions/0',
        new_value: { ncm8: '63079000', descripcion: 'textile article' },
      },
    ]);
    const result = await analyzeTestDelta('2026-02-03', '2026-02-04');
    assert.deepEqual(result.packet.claims[0]?.affected_ncm, ['63079000']);
  });

  it('extracts NCM codes from old_value', async () => {
    writeDelta('2026-02-05', '2026-02-06', [
      {
        type: 'removed',
        path: '/regulations/0/ncm_positions/0',
        old_value: { ncm8: '63079000' },
      },
    ]);
    const result = await analyzeTestDelta('2026-02-05', '2026-02-06');
    assert.deepEqual(result.packet.claims[0]?.affected_ncm, ['63079000']);
  });

  it('extracts NCM codes from arrays', async () => {
    writeDelta('2026-02-07', '2026-02-08', [
      {
        type: 'added',
        path: '/regulations/0/ncm_positions',
        new_value: ['NCM 63079000', { code: '4202.92.00.110V' }],
      },
    ]);
    const result = await analyzeTestDelta('2026-02-07', '2026-02-08');
    assert.deepEqual(result.packet.claims[0]?.affected_ncm, ['63079000', '42029200110V']);
  });

  it('deduplicates repeated NCM codes', async () => {
    writeDelta('2026-02-09', '2026-02-10', [
      {
        type: 'modified',
        path: '/regulations/0/ncm_positions/63079000',
        old_value: ['63079000'],
        new_value: { ncm8: '63079000' },
      },
    ]);
    const result = await analyzeTestDelta('2026-02-09', '2026-02-10');
    assert.deepEqual(result.packet.claims[0]?.affected_ncm, ['63079000']);
  });

  it('does not extract non-NCM numbers outside NCM context', async () => {
    writeDelta('2026-02-11', '2026-02-12', [
      {
        type: 'modified',
        path: '/metadata/document_id',
        old_value: '12345678',
        new_value: ['87654321', { invoice: '20260616001' }],
      },
    ]);
    const result = await analyzeTestDelta('2026-02-11', '2026-02-12');
    assert.deepEqual(result.packet.claims[0]?.affected_ncm, []);
  });
});

describe('analyzeDelta — empty delta', () => {
  it('handles delta with no changes', async () => {
    writeDelta('2026-05-01', '2026-05-02', []);
    const result = await analyzeTestDelta('2026-05-01', '2026-05-02');

    assert.equal(result.packet.claims.length, 0);
    assert.equal(result.packet.summary.total_claims, 0);
    assert.deepEqual(result.packet.summary.by_type, {
      tariff: 0,
      intervention: 0,
      norm: 0,
      legal: 0,
      classification: 0,
    });
    assert.equal(result.packet.governance.human_review_required, true);
  });
});

describe('analyzeDelta — determinism', () => {
  it('produces byte-for-byte identical output for the same input and fixed extracted_at', async () => {
    writeDelta('2026-03-01', '2026-03-02', [{ type: 'modified', path: '/tariffs/rate', old_value: 1, new_value: 2 }]);

    const first = await analyzeTestDelta('2026-03-01', '2026-03-02');
    const firstBytes = readFileSync(first.outputPath, 'utf-8');
    const second = await analyzeTestDelta('2026-03-01', '2026-03-02');
    const secondBytes = readFileSync(second.outputPath, 'utf-8');

    assert.equal(firstBytes, secondBytes);
    assert.equal(JSON.stringify(first.packet), JSON.stringify(second.packet));
  });
});

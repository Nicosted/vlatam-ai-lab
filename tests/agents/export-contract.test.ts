import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  exportApprovedArtifact,
  getExportArtifactRelativePath,
  type ClassifierApprovedArtifactExport,
} from '../../src/agents/export-contract.js';
import { validateExportArtifact } from '../../src/contracts/vlatam-global-bridge.js';

const REVIEWED_AT = '2026-06-16T20:00:00Z';
const EXPORTED_AT = '2026-06-16T21:00:00Z';
const SOURCE_ID = 'infoleg';
const ARTIFACT_ID = 'artifact--infoleg--extraction-001';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

let testRoot = '';

function inputPath(sourceId = SOURCE_ID, artifactId = ARTIFACT_ID): string {
  return path.join(testRoot, 'data', 'intelligence', sourceId, `${artifactId}.json`);
}

function outputPath(sourceId = SOURCE_ID, artifactId = ARTIFACT_ID): string {
  return path.join(testRoot, 'data', 'exports', sourceId, `${artifactId}--export.json`);
}

function baseArtifact(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    artifact_id: ARTIFACT_ID,
    extraction_result_id: 'extraction-001',
    source_id: SOURCE_ID,
    generated_at: '2026-06-16T00:00:00Z',
    classification_candidate: {
      ncm_code: '42029200110V',
      description: 'NCM 4202.92.00.110V appears as a candidate.',
      confidence: 0.82,
      status: 'candidate',
    },
    extracted_evidence: [
      {
        claim_id: 'claim-001',
        claim_type: 'classification',
        text: 'NCM 4202.92.00.110V appears as a candidate.',
        source_ref: 'data/evidence/infoleg/example.json#/claims/0',
        confidence: 0.82,
        affected_ncm: ['42029200110V'],
        requires_review: true,
      },
    ],
    governance: {
      human_review_required: false,
      downstream_allowed: true,
      review_only: false,
      not_final_classification: false,
    },
    review_status: 'reviewed_approved',
    reviewer: 'nicolas',
    reviewed_at: REVIEWED_AT,
    classifier_approval_reference: 'approval-ref--001',
    downstream_eligibility_reason: 'Verified against official regulation',
    source_authority: 'official_regulation',
    origin: 'ai_assisted_extraction',
    schema_version: '1.0.0',
    ...overrides,
  };
}

function writeArtifact(artifact: Record<string, unknown>): void {
  const artifactPath = inputPath(
    typeof artifact.source_id === 'string' ? artifact.source_id : SOURCE_ID,
    typeof artifact.artifact_id === 'string' ? artifact.artifact_id : ARTIFACT_ID
  );
  mkdirSync(path.dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, JSON.stringify(artifact, null, 2) + '\n', 'utf-8');
}

function readExport(): ClassifierApprovedArtifactExport {
  return JSON.parse(readFileSync(outputPath(), 'utf-8')) as ClassifierApprovedArtifactExport;
}

beforeEach(() => {
  testRoot = mkdtempSync(path.join(tmpdir(), 'export-contract-'));
});

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe('exportApprovedArtifact — happy path', () => {
  it('exports an approved artifact into a clean stable structure', async () => {
    writeArtifact(baseArtifact());

    const exported = await exportApprovedArtifact(
      { source_id: SOURCE_ID, artifact_id: ARTIFACT_ID },
      { data_root: testRoot }
    );

    assert.deepEqual(exported, {
      export_id: 'artifact--infoleg--extraction-001--export',
      artifact_id: ARTIFACT_ID,
      source_id: SOURCE_ID,
      exported_at: REVIEWED_AT,
      classification_candidate: {
        ncm_code: '42029200110V',
        description: 'NCM 4202.92.00.110V appears as a candidate.',
        confidence: 0.82,
      },
      extracted_evidence: [
        {
          claim_id: 'claim-001',
          claim_type: 'classification',
          text: 'NCM 4202.92.00.110V appears as a candidate.',
          confidence: 0.82,
          affected_ncm: ['42029200110V'],
        },
      ],
      schema_version: '1.0.0',
    });
    assert.deepEqual(readExport(), exported);
    assert.equal(validateExportArtifact(exported).ok, true);
  });

  it('does not include governance, reviewer, provenance, or source refs in the export', async () => {
    writeArtifact(baseArtifact());

    const exported = await exportApprovedArtifact(
      { source_id: SOURCE_ID, artifact_id: ARTIFACT_ID },
      { data_root: testRoot }
    );
    const exportRecord = exported as unknown as Record<string, unknown>;
    const evidenceRecord = exported.extracted_evidence[0] as unknown as Record<string, unknown>;
    const candidateRecord = exported.classification_candidate as unknown as Record<string, unknown>;

    assert.equal('governance' in exportRecord, false);
    assert.equal('reviewer' in exportRecord, false);
    assert.equal('reviewed_at' in exportRecord, false);
    assert.equal('source_authority' in exportRecord, false);
    assert.equal('origin' in exportRecord, false);
    assert.equal('extraction_result_id' in exportRecord, false);
    assert.equal('generated_at' in exportRecord, false);
    assert.equal('source_ref' in evidenceRecord, false);
    assert.equal('requires_review' in evidenceRecord, false);
    assert.equal('status' in candidateRecord, false);
  });
});

describe('exportApprovedArtifact — determinism', () => {
  it('uses reviewed_at as the default exported_at value', async () => {
    writeArtifact(baseArtifact());

    const exported = await exportApprovedArtifact(
      { source_id: SOURCE_ID, artifact_id: ARTIFACT_ID },
      { data_root: testRoot }
    );

    assert.equal(exported.exported_at, REVIEWED_AT);
  });

  it('uses an explicit exported_at override when provided', async () => {
    writeArtifact(baseArtifact());

    const exported = await exportApprovedArtifact(
      { source_id: SOURCE_ID, artifact_id: ARTIFACT_ID },
      { data_root: testRoot, exported_at: EXPORTED_AT }
    );

    assert.equal(exported.exported_at, EXPORTED_AT);
  });

  it('produces identical exports across repeated runs with the same input', async () => {
    writeArtifact(baseArtifact());

    const first = await exportApprovedArtifact(
      { source_id: SOURCE_ID, artifact_id: ARTIFACT_ID },
      { data_root: testRoot }
    );
    const second = await exportApprovedArtifact(
      { source_id: SOURCE_ID, artifact_id: ARTIFACT_ID },
      { data_root: testRoot }
    );

    assert.deepEqual(second, first);
    assert.equal(readFileSync(outputPath(), 'utf-8'), JSON.stringify(first, null, 2) + '\n');
  });
});

describe('exportApprovedArtifact — edge cases', () => {
  it('throws a clear error when the artifact file is missing', async () => {
    await assert.rejects(
      () => exportApprovedArtifact({ source_id: SOURCE_ID, artifact_id: ARTIFACT_ID }, { data_root: testRoot }),
      /Artifact not found: source_id='infoleg', artifact_id='artifact--infoleg--extraction-001'/
    );
  });

  it('rejects artifacts that are not approved for downstream export', async () => {
    writeArtifact(
      baseArtifact({
        governance: {
          human_review_required: true,
          downstream_allowed: false,
          review_only: true,
          not_final_classification: true,
        },
        review_status: 'reviewed_rejected',
      })
    );

    await assert.rejects(
      () => exportApprovedArtifact({ source_id: SOURCE_ID, artifact_id: ARTIFACT_ID }, { data_root: testRoot }),
      /Artifact not approved for export: downstream_allowed must be true/
    );
  });

  it('rejects downstream-open artifacts that are not reviewed_approved', async () => {
    writeArtifact(
      baseArtifact({
        review_status: 'draft',
      })
    );

    await assert.rejects(
      () => exportApprovedArtifact({ source_id: SOURCE_ID, artifact_id: ARTIFACT_ID }, { data_root: testRoot }),
      /Invalid artifact: .*downstream_allowed=true requires review_status=reviewed_approved/
    );
  });

  it('blocks synthetic/demo artifacts', async () => {
    writeArtifact(
      baseArtifact({
        source_authority: 'synthetic_demo',
        origin: 'synthetic_demo',
        governance: {
          human_review_required: true,
          downstream_allowed: false,
          review_only: true,
          not_final_classification: true,
        },
        review_status: 'reviewed_rejected',
      })
    );

    await assert.rejects(
      () => exportApprovedArtifact({ source_id: SOURCE_ID, artifact_id: ARTIFACT_ID }, { data_root: testRoot }),
      /Cannot export synthetic\/demo artifact/
    );
  });

  it('exports valid artifacts with no classification_candidate', async () => {
    const artifact = baseArtifact();
    delete artifact.classification_candidate;
    writeArtifact(artifact);

    const exported = await exportApprovedArtifact(
      { source_id: SOURCE_ID, artifact_id: ARTIFACT_ID },
      { data_root: testRoot }
    );

    assert.equal(exported.classification_candidate, undefined);
    assert.equal(validateExportArtifact(exported).ok, true);
  });

  it('allows empty extracted_evidence explicitly', async () => {
    writeArtifact(baseArtifact({ extracted_evidence: [] }));

    const exported = await exportApprovedArtifact(
      { source_id: SOURCE_ID, artifact_id: ARTIFACT_ID },
      { data_root: testRoot }
    );

    assert.deepEqual(exported.extracted_evidence, []);
    assert.equal(validateExportArtifact(exported).ok, true);
  });

  it('does not write an artifact when export validation fails', async () => {
    writeArtifact(baseArtifact());

    await assert.rejects(
      () =>
        exportApprovedArtifact(
          { source_id: SOURCE_ID, artifact_id: ARTIFACT_ID },
          { data_root: testRoot, exported_at: 'not-a-date' }
        ),
      /Export contract validation failed: exported_at must be a valid ISO 8601 timestamp/
    );

    assert.equal(existsSync(outputPath()), false);
  });
});

describe('exportApprovedArtifact — security', () => {
  it('rejects invalid source_id and artifact_id values', async () => {
    await assert.rejects(
      () =>
        exportApprovedArtifact(
          { source_id: '../infoleg', artifact_id: ARTIFACT_ID },
          { data_root: testRoot }
        ),
      /Invalid source_id/
    );

    await assert.rejects(
      () =>
        exportApprovedArtifact(
          { source_id: SOURCE_ID, artifact_id: '../artifact--infoleg--extraction-001' },
          { data_root: testRoot }
        ),
      /Invalid artifact_id/
    );
  });

  it('rejects path traversal attempts before filesystem access', async () => {
    await assert.rejects(
      () =>
        exportApprovedArtifact(
          { source_id: 'infoleg/../../x', artifact_id: ARTIFACT_ID },
          { data_root: testRoot }
        ),
      /Invalid source_id/
    );
  });

  it('returns a relative export path helper', () => {
    assert.equal(
      getExportArtifactRelativePath({ source_id: SOURCE_ID, artifact_id: ARTIFACT_ID }),
      'data/exports/infoleg/artifact--infoleg--extraction-001--export.json'
    );
  });

  it('does not print absolute paths in CLI errors', () => {
    const result = spawnSync(
      'node',
      [
        '--import',
        'tsx',
        'src/cli/export-contract.ts',
        '--source',
        SOURCE_ID,
        '--artifact',
        'artifact--infoleg--missing',
      ],
      { cwd: repoRoot, encoding: 'utf-8' }
    );

    assert.notEqual(result.status, 0);
    assert.equal(result.stderr.includes(repoRoot), false);
    assert.equal(result.stdout.includes(repoRoot), false);
  });
});

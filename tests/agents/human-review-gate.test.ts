import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { applyHumanReview } from '../../src/agents/human-review-gate.js';
import { validateClassifierIntelligenceArtifact } from '../../src/contracts/vlatam-global-bridge.js';

const REVIEWED_AT = '2026-06-16T20:00:00Z';
const SOURCE_ID = 'infoleg';
const ARTIFACT_ID = 'artifact--infoleg--extraction-001';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

let testRoot = '';

function artifactPath(sourceId = SOURCE_ID, artifactId = ARTIFACT_ID): string {
  return path.join(testRoot, 'data', 'intelligence', sourceId, `${artifactId}.json`);
}

function baseArtifact(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    artifact_id: ARTIFACT_ID,
    source_id: SOURCE_ID,
    generated_at: '2026-06-16T00:00:00Z',
    source_authority: 'official_regulation',
    origin: 'ai_assisted_extraction',
    governance: {
      human_review_required: true,
      downstream_allowed: false,
      review_only: true,
      not_final_classification: true,
    },
    schema_version: '1.0.0',
    ...overrides,
  };
}

function writeArtifact(artifact: Record<string, unknown>): void {
  const outputPath = artifactPath();
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(artifact, null, 2) + '\n', 'utf-8');
}

function readArtifact(): Record<string, unknown> {
  return JSON.parse(readFileSync(artifactPath(), 'utf-8')) as Record<string, unknown>;
}

beforeEach(() => {
  testRoot = mkdtempSync(path.join(tmpdir(), 'human-review-gate-'));
});

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe('applyHumanReview — happy path', () => {
  it('approves a valid artifact and opens downstream governance only after explicit approval', async () => {
    writeArtifact(baseArtifact());

    const reviewed = await applyHumanReview(
      {
        source_id: SOURCE_ID,
        artifact_id: ARTIFACT_ID,
        decision: 'approved',
        reviewer: 'nicolas',
        reviewed_at: REVIEWED_AT,
        classifier_approval_reference: 'approval-ref--001',
        downstream_eligibility_reason: 'Verified against official regulation',
      },
      { data_root: testRoot }
    );

    assert.equal(reviewed.review_status, 'reviewed_approved');
    assert.equal(reviewed.reviewer, 'nicolas');
    assert.equal(reviewed.reviewed_at, REVIEWED_AT);
    assert.equal(reviewed.classifier_approval_reference, 'approval-ref--001');
    assert.deepEqual(reviewed.governance, {
      human_review_required: false,
      downstream_allowed: true,
      review_only: false,
      not_final_classification: false,
    });
    assert.deepEqual(readArtifact(), reviewed);
  });

  it('rejects a valid artifact and keeps governance restrictive', async () => {
    writeArtifact(baseArtifact());

    const reviewed = await applyHumanReview(
      {
        source_id: SOURCE_ID,
        artifact_id: ARTIFACT_ID,
        decision: 'rejected',
        reviewer: 'nicolas',
        reviewed_at: REVIEWED_AT,
        downstream_eligibility_reason: 'Classification candidate lacks sufficient evidence',
      },
      { data_root: testRoot }
    );

    assert.equal(reviewed.review_status, 'reviewed_rejected');
    assert.equal(reviewed.reviewer, 'nicolas');
    assert.equal(reviewed.reviewed_at, REVIEWED_AT);
    assert.equal(reviewed.downstream_eligibility_reason, 'Classification candidate lacks sufficient evidence');
    assert.equal(reviewed.classifier_approval_reference, undefined);
    assert.deepEqual(reviewed.governance, {
      human_review_required: true,
      downstream_allowed: false,
      review_only: true,
      not_final_classification: true,
    });
  });
});

describe('applyHumanReview — P1 invariants', () => {
  it('rejects downstream_allowed=true without complete reviewed approval metadata', () => {
    const invalid = validateClassifierIntelligenceArtifact({
      ...baseArtifact(),
      review_status: 'draft',
      governance: {
        human_review_required: true,
        downstream_allowed: true,
        review_only: true,
        not_final_classification: true,
      },
    });

    assert.equal(invalid.ok, false);
    assert.ok(invalid.errors.includes('downstream_allowed=true requires review_status=reviewed_approved'));
    assert.ok(invalid.errors.includes('downstream_allowed=true requires reviewer'));
    assert.ok(invalid.errors.includes('downstream_allowed=true requires classifier_approval_reference'));
  });

  it('does not write when reviewed artifact validation fails', async () => {
    const syntheticArtifact = baseArtifact({
      source_authority: 'synthetic_demo',
      origin: 'synthetic_demo',
    });
    writeArtifact(syntheticArtifact);
    const before = readFileSync(artifactPath(), 'utf-8');

    await assert.rejects(
      () =>
        applyHumanReview(
          {
            source_id: SOURCE_ID,
            artifact_id: ARTIFACT_ID,
            decision: 'approved',
            reviewer: 'nicolas',
            reviewed_at: REVIEWED_AT,
            classifier_approval_reference: 'approval-ref--001',
            downstream_eligibility_reason: 'Verified',
          },
          { data_root: testRoot }
        ),
      /synthetic_demo cannot be downstream_allowed/
    );

    assert.equal(readFileSync(artifactPath(), 'utf-8'), before);
  });
});

describe('applyHumanReview — determinism', () => {
  it('uses the explicit reviewed_at timestamp exactly as provided', async () => {
    writeArtifact(baseArtifact());

    const reviewed = await applyHumanReview(
      {
        source_id: SOURCE_ID,
        artifact_id: ARTIFACT_ID,
        decision: 'rejected',
        reviewer: 'nicolas',
        reviewed_at: REVIEWED_AT,
      },
      { data_root: testRoot }
    );

    assert.equal(reviewed.reviewed_at, REVIEWED_AT);
  });

  it('throws a clear error when reviewed_at is missing', async () => {
    writeArtifact(baseArtifact());

    await assert.rejects(
      () =>
        applyHumanReview(
          {
            source_id: SOURCE_ID,
            artifact_id: ARTIFACT_ID,
            decision: 'rejected',
            reviewer: 'nicolas',
            reviewed_at: '',
          },
          { data_root: testRoot }
        ),
      /Missing reviewed_at: human review requires explicit timestamp/
    );
  });
});

describe('applyHumanReview — edge cases and security', () => {
  it('throws a clear error for missing artifact files', async () => {
    await assert.rejects(
      () =>
        applyHumanReview(
          {
            source_id: SOURCE_ID,
            artifact_id: ARTIFACT_ID,
            decision: 'rejected',
            reviewer: 'nicolas',
            reviewed_at: REVIEWED_AT,
          },
          { data_root: testRoot }
        ),
      /Artifact not found: source_id='infoleg', artifact_id='artifact--infoleg--extraction-001'/
    );
  });

  it('rejects invalid existing artifact schema before writing', async () => {
    writeArtifact({ artifact_id: ARTIFACT_ID });
    const before = readFileSync(artifactPath(), 'utf-8');

    await assert.rejects(
      () =>
        applyHumanReview(
          {
            source_id: SOURCE_ID,
            artifact_id: ARTIFACT_ID,
            decision: 'rejected',
            reviewer: 'nicolas',
            reviewed_at: REVIEWED_AT,
          },
          { data_root: testRoot }
        ),
      /Existing artifact invalid: governance is required/
    );

    assert.equal(readFileSync(artifactPath(), 'utf-8'), before);
  });

  it('rejects invalid reviewer and artifact_id values', async () => {
    await assert.rejects(
      () =>
        applyHumanReview({
          source_id: SOURCE_ID,
          artifact_id: ARTIFACT_ID,
          decision: 'rejected',
          reviewer: 'Nicolas',
          reviewed_at: REVIEWED_AT,
        }),
      /Invalid reviewer: Nicolas/
    );

    await assert.rejects(
      () =>
        applyHumanReview({
          source_id: SOURCE_ID,
          artifact_id: '../artifact--infoleg--bad',
          decision: 'rejected',
          reviewer: 'nicolas',
          reviewed_at: REVIEWED_AT,
        }),
      /Invalid artifact_id/
    );
  });

  it('rejects path traversal attempts before filesystem access', async () => {
    await assert.rejects(
      () =>
        applyHumanReview({
          source_id: '../infoleg',
          artifact_id: ARTIFACT_ID,
          decision: 'rejected',
          reviewer: 'nicolas',
          reviewed_at: REVIEWED_AT,
        }),
      /Invalid source_id/
    );
  });

  it('does not print absolute paths in CLI errors', () => {
    const result = spawnSync(
      'node',
      [
        '--import',
        'tsx',
        'src/cli/human-review-gate.ts',
        '--source',
        SOURCE_ID,
        '--artifact',
        'artifact--infoleg--missing',
        '--decision',
        'approve',
        '--reviewer',
        'nicolas',
        '--reviewed-at',
        REVIEWED_AT,
        '--approval-ref',
        'approval-ref--001',
        '--eligibility-reason',
        'Verified',
      ],
      { cwd: repoRoot, encoding: 'utf-8' }
    );

    assert.notEqual(result.status, 0);
    assert.equal(result.stderr.includes(repoRoot), false);
    assert.equal(result.stdout.includes(repoRoot), false);
  });
});

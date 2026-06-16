/**
 * Evidence Writer Agent — deterministic unit tests
 *
 * Test runner: node:test (tsx --test). All tests use local fixtures only.
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getEvidenceArtifactRelativePath,
  writeEvidenceArtifact,
  type EvidenceWriterInput,
} from '../../src/agents/evidence-writer.js';
import {
  GOVERNANCE_FLAGS,
  validateClassifierIntelligenceArtifact,
} from '../../src/contracts/vlatam-global-bridge.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const FIXED_EXTRACTED_AT = '2026-06-16T00:00:00Z';

const cliOutputPath = resolve(
  repoRoot,
  'data',
  'intelligence',
  'infoleg',
  'artifact--infoleg--extraction-001.json'
);

function makeTempRoot(): string {
  return mkdtempSync(resolve(tmpdir(), 'evidence-writer-'));
}

function extractionResult(overrides: Record<string, unknown> = {}) {
  return {
    extraction_result_id: 'extraction-001',
    evidence_packet_id: 'packet-001',
    review_manifest_id: 'review-001',
    snapshot_id: 'snapshot-001',
    source_id: 'infoleg',
    provider_id: 'local-fixture',
    model_id: 'fixture-only',
    extraction_status: 'draft_unreviewed',
    extracted_claims: [
      {
        claim_id: 'claim-001',
        claim_text: 'NCM 4202.92.00.110V appears as a classification candidate.',
        evidence_reference: 'data/evidence/infoleg/example.json#/claims/0',
        support_status: 'supported_by_packet',
        confidence: 0.82,
      },
    ],
    unsupported_claims: [],
    warnings: [],
    confidence: 0.82,
    critic_summary: 'Local fixture for Evidence Writer tests.',
    human_review_required: true,
    downstream_allowed: false,
    created_at: '2026-06-15T00:00:00Z',
    extracted_at: FIXED_EXTRACTED_AT,
    contract_version: '1.0.0',
    schema_version: '1.0.0',
    ...overrides,
  };
}

function writeExtraction(root: string, result: Record<string, unknown> = extractionResult()): void {
  const inputDir = resolve(root, 'data', 'extractions', result.source_id as string);
  mkdirSync(inputDir, { recursive: true });
  writeFileSync(
    resolve(inputDir, `${result.extraction_result_id as string}.json`),
    JSON.stringify(result, null, 2) + '\n',
    'utf-8'
  );
}

async function writeFixtureArtifact(root: string, options?: { generated_at?: string }) {
  const input: EvidenceWriterInput = {
    source_id: 'infoleg',
    extraction_result_id: 'extraction-001',
  };
  return writeEvidenceArtifact(input, { data_root: root, ...options });
}

after(() => {
  rmSync(resolve(repoRoot, 'data', 'intelligence', 'infoleg'), { recursive: true, force: true });
});

describe('writeEvidenceArtifact — happy path', () => {
  it('creates a valid review-only classifier intelligence artifact', async () => {
    const root = makeTempRoot();
    writeExtraction(root);

    const artifact = await writeFixtureArtifact(root);

    assert.equal(artifact.artifact_id, 'artifact--infoleg--extraction-001');
    assert.equal(artifact.source_id, 'infoleg');
    assert.equal(artifact.generated_at, FIXED_EXTRACTED_AT);
    assert.deepEqual(artifact.governance, GOVERNANCE_FLAGS);
    assert.equal(artifact.extracted_evidence.length, 1);
    assert.equal(artifact.extracted_evidence[0]?.requires_review, true);
    assert.equal(artifact.classification_candidate?.status, 'candidate');
    assert.equal(validateClassifierIntelligenceArtifact(artifact).ok, true);
    assert.equal(
      existsSync(resolve(root, 'data', 'intelligence', 'infoleg', 'artifact--infoleg--extraction-001.json')),
      true
    );

    rmSync(root, { recursive: true, force: true });
  });
});

describe('writeEvidenceArtifact — determinism', () => {
  it('uses extractionResult.extracted_at by default', async () => {
    const root = makeTempRoot();
    writeExtraction(root);

    const artifact = await writeFixtureArtifact(root);

    assert.equal(artifact.generated_at, FIXED_EXTRACTED_AT);
    rmSync(root, { recursive: true, force: true });
  });

  it('allows an explicit generated_at override', async () => {
    const root = makeTempRoot();
    writeExtraction(root);

    const artifact = await writeFixtureArtifact(root, { generated_at: '2026-06-17T00:00:00Z' });

    assert.equal(artifact.generated_at, '2026-06-17T00:00:00Z');
    rmSync(root, { recursive: true, force: true });
  });

  it('produces identical artifacts for repeated runs with the same input', async () => {
    const root = makeTempRoot();
    writeExtraction(root);

    const first = await writeFixtureArtifact(root);
    const second = await writeFixtureArtifact(root);

    assert.deepEqual(second, first);
    rmSync(root, { recursive: true, force: true });
  });

  it('throws when extracted_at is missing and no override is provided', async () => {
    const root = makeTempRoot();
    const result = extractionResult();
    delete (result as Record<string, unknown>).extracted_at;
    writeExtraction(root, result);

    await assert.rejects(() => writeFixtureArtifact(root), /Missing extracted_at/);
    rmSync(root, { recursive: true, force: true });
  });
});

describe('writeEvidenceArtifact — edge cases', () => {
  it('throws a clear error when the extraction result file is missing', async () => {
    const root = makeTempRoot();

    await assert.rejects(
      () => writeFixtureArtifact(root),
      (error: unknown) => {
        assert.equal(error instanceof Error, true);
        const message = (error as Error).message;
        assert.match(message, /EXTRACTION_RESULT_NOT_FOUND/);
        assert.match(message, /source_id='infoleg'/);
        assert.match(message, /extraction_result_id='extraction-001'/);
        assert.doesNotMatch(message, /\/data\/extractions\//);
        assert.doesNotMatch(message, /\/Users\//);
        return true;
      }
    );
    rmSync(root, { recursive: true, force: true });
  });

  it('throws a clear error for invalid extraction result schema', async () => {
    const root = makeTempRoot();
    writeExtraction(root, { extraction_result_id: 'extraction-001', source_id: 'infoleg' });

    await assert.rejects(() => writeFixtureArtifact(root), /EXTRACTION_RESULT_SCHEMA_ERROR/);
    rmSync(root, { recursive: true, force: true });
  });

  it('omits classification_candidate when no classification claim exists', async () => {
    const root = makeTempRoot();
    writeExtraction(
      root,
      extractionResult({
        extracted_claims: [
          {
            claim_id: 'claim-001',
            claim_text: 'A customs norm requires human review.',
            evidence_reference: 'data/evidence/infoleg/example.json#/claims/1',
            support_status: 'needs_human_review',
            confidence: 0.7,
          },
        ],
      })
    );

    const artifact = await writeFixtureArtifact(root);

    assert.equal(artifact.classification_candidate, undefined);
    assert.equal(validateClassifierIntelligenceArtifact(artifact).ok, true);
    rmSync(root, { recursive: true, force: true });
  });

  it('allows empty extracted_evidence explicitly', async () => {
    const root = makeTempRoot();
    writeExtraction(root, extractionResult({ extracted_claims: [] }));

    const artifact = await writeFixtureArtifact(root);

    assert.deepEqual(artifact.extracted_evidence, []);
    assert.equal(validateClassifierIntelligenceArtifact(artifact).ok, true);
    rmSync(root, { recursive: true, force: true });
  });

  it('does not write output when artifact validation fails', async () => {
    const root = makeTempRoot();
    writeExtraction(root);
    const outputPath = resolve(root, 'data', 'intelligence', 'infoleg', 'artifact--infoleg--extraction-001.json');

    await assert.rejects(
      () => writeFixtureArtifact(root, { generated_at: 'not-a-date-time' }),
      /OUTPUT_SCHEMA_ERROR/
    );

    assert.equal(existsSync(outputPath), false);
    rmSync(root, { recursive: true, force: true });
  });
});

describe('writeEvidenceArtifact — security', () => {
  it('rejects invalid source_id before reading files', async () => {
    await assert.rejects(
      () =>
        writeEvidenceArtifact({
          source_id: '../../etc',
          extraction_result_id: 'extraction-001',
        }),
      /Invalid source_id/
    );
  });

  it('rejects invalid extraction_result_id before reading files', async () => {
    await assert.rejects(
      () =>
        writeEvidenceArtifact({
          source_id: 'infoleg',
          extraction_result_id: '../extraction-001',
        }),
      /Invalid extraction_result_id/
    );
  });

  it('returns relative output paths for CLI display', () => {
    assert.equal(
      getEvidenceArtifactRelativePath({
        source_id: 'infoleg',
        extraction_result_id: 'extraction-001',
      }),
      'data/intelligence/infoleg/artifact--infoleg--extraction-001.json'
    );
  });

  it('does not print absolute local paths from the CLI', () => {
    rmSync(cliOutputPath, { force: true });

    const output = execFileSync(
      'pnpm',
      ['--silent', 'agents:evidence-writer', '--source', 'infoleg', '--extraction-result', 'extraction-001'],
      { cwd: repoRoot, encoding: 'utf-8' }
    );

    assert.match(output, /data\/intelligence\/infoleg\/artifact--infoleg--extraction-001\.json/);
    assert.doesNotMatch(output, new RegExp(repoRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(existsSync(cliOutputPath), true);
  });

  it('does not print absolute local paths from CLI failure output', () => {
    assert.throws(
      () =>
        execFileSync(
          'pnpm',
          ['--silent', 'agents:evidence-writer', '--source', 'infoleg', '--extraction-result', 'missing-fixture'],
          { cwd: repoRoot, encoding: 'utf-8', stdio: 'pipe' }
        ),
      (error: unknown) => {
        const stderr = (error as { stderr?: Buffer | string }).stderr?.toString() ?? '';
        assert.match(stderr, /source_id='infoleg'/);
        assert.match(stderr, /extraction_result_id='missing-fixture'/);
        assert.doesNotMatch(stderr, /\/data\/extractions\//);
        assert.doesNotMatch(stderr, new RegExp(repoRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        return true;
      }
    );
  });
});

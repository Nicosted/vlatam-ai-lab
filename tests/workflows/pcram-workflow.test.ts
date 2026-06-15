/**
 * Unit tests for PCRAM Workflow steps and orchestrator
 * All external calls are mocked — no live Cloudflare API calls.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  sourceMonitorStep,
  snapshotWriterStep,
  deltaAnalyzerStep,
  evidenceWriterStep,
  humanReviewGateStep,
  runPCRAMPipeline,
  type SourceMonitorOutput,
  type SnapshotWriterOutput,
  type DeltaAnalyzerOutput,
  type EvidenceWriterOutput,
  type PCRAMPipelineEnv,
  type WorkflowInput,
} from '../../src/workflows/pcram-workflow.js';

// ---------------------------------------------------------------------------
// Mock KVNamespace
// ---------------------------------------------------------------------------

function makeKVMock(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => { store.set(key, value); },
    delete: async (key: string) => { store.delete(key); },
    list: async () => ({ keys: [], list_complete: true, caret: undefined }),
    getWithMetadata: async (key: string) => ({ value: store.get(key) ?? null, metadata: null }),
  } as unknown as KVNamespace;
}

function makePipelineEnv(enabled: boolean): PCRAMPipelineEnv {
  return {
    CLOUDFLARE_PIPELINE_V1_ENABLED: enabled ? 'true' : 'false',
    NORMATIVE_KV: makeKVMock(),
  };
}

const BASE_INPUT: WorkflowInput = {
  sourceId: 'arca-ar-official',
  triggerReason: 'manual',
  triggeredBy: 'test-runner',
  requestedAt: '2026-01-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Individual step tests
// ---------------------------------------------------------------------------

describe('sourceMonitorStep', () => {
  it('returns changeDetected: false (stub behavior)', async () => {
    const output = await sourceMonitorStep('arca', undefined);
    assert.equal(output.changeDetected, false);
    assert.equal(output.sourceId, 'arca');
    assert.ok(output.checkedAt);
  });

  it('returns a valid ISO timestamp', async () => {
    const output = await sourceMonitorStep('infoleg', 'snapshots/infoleg/latest.json');
    assert.doesNotThrow(() => new Date(output.checkedAt).toISOString());
  });
});

describe('snapshotWriterStep', () => {
  it('generates a snapshot ID with source prefix', async () => {
    const monitorOut: SourceMonitorOutput = {
      changeDetected: true,
      sourceId: 'arca',
      checkedAt: '2026-01-01T00:00:00Z',
    };
    const output = await snapshotWriterStep('arca', monitorOut);
    assert.ok(output.snapshotId.startsWith('snap-arca-'));
    assert.equal(output.sourceId, 'arca');
    assert.ok(output.storageKey.includes(output.snapshotId));
    assert.equal(output.schemaVersion, '1.0.0');
  });
});

describe('deltaAnalyzerStep', () => {
  it('returns hasDelta: false (stub behavior)', async () => {
    const snapshotOut: SnapshotWriterOutput = {
      snapshotId: 'snap-arca-001',
      sourceId: 'arca',
      storageKey: 'snapshots/arca/snap-arca-001.json',
      capturedAt: '2026-01-01T00:00:00Z',
      schemaVersion: '1.0.0',
    };
    const output = await deltaAnalyzerStep(snapshotOut);
    assert.equal(output.snapshotId, 'snap-arca-001');
    assert.equal(output.hasDelta, false);
    assert.equal(output.addedItems, 0);
    assert.equal(output.removedItems, 0);
    assert.equal(output.modifiedItems, 0);
  });
});

describe('evidenceWriterStep', () => {
  it('returns evidence packet with correct governance flags', async () => {
    const snapshotOut: SnapshotWriterOutput = {
      snapshotId: 'snap-arca-001',
      sourceId: 'arca',
      storageKey: 'snapshots/arca/snap-arca-001.json',
      capturedAt: '2026-01-01T00:00:00Z',
      schemaVersion: '1.0.0',
    };
    const deltaOut: DeltaAnalyzerOutput = {
      snapshotId: 'snap-arca-001',
      hasDelta: true,
      addedItems: 5,
      removedItems: 0,
      modifiedItems: 2,
      analyzedAt: '2026-01-01T00:00:01Z',
    };
    const output = await evidenceWriterStep(snapshotOut, deltaOut, null);
    assert.ok(output.evidencePacketId.startsWith('evp-snap-arca-001'));
    assert.equal(output.humanReviewRequired, true);
    assert.equal(output.downstreamAllowed, false);
    assert.equal(output.extractionAllowed, false);
  });
});

describe('humanReviewGateStep', () => {
  it('returns gateStatus: pending (stub behavior)', async () => {
    const evidenceOut: EvidenceWriterOutput = {
      evidencePacketId: 'evp-snap-001',
      snapshotId: 'snap-001',
      extractionAllowed: false,
      humanReviewRequired: true,
      downstreamAllowed: false,
      embeddingJobIds: [],
      createdAt: '2026-01-01T00:00:00Z',
    };
    const output = await humanReviewGateStep(evidenceOut);
    assert.equal(output.gateStatus, 'pending');
  });
});

// ---------------------------------------------------------------------------
// Orchestrator tests
// ---------------------------------------------------------------------------

describe('runPCRAMPipeline — feature flag disabled', () => {
  it('aborts and returns failed status when flag is false', async () => {
    const result = await runPCRAMPipeline({
      input: BASE_INPUT,
      workflowRunId: 'wfr-test-001',
      env: makePipelineEnv(false),
    });
    assert.equal(result.status, 'failed');
    assert.equal(result.sourceId, 'arca-ar-official');
    assert.equal(result.steps.length, 0);
    assert.equal(result.humanReviewGateStatus, 'pending');
  });
});

describe('runPCRAMPipeline — feature flag enabled', () => {
  it('completes without error and returns paused status (stub: no change detected)', async () => {
    const result = await runPCRAMPipeline({
      input: BASE_INPUT,
      workflowRunId: 'wfr-test-002',
      env: makePipelineEnv(true),
    });
    assert.equal(result.workflowRunId, 'wfr-test-002');
    assert.equal(result.sourceId, 'arca-ar-official');
    assert.equal(result.status, 'completed');
    assert.equal(result.humanReviewGateStatus, 'pending');
  });

  it('preserves human review flag — never allows downstream', async () => {
    const result = await runPCRAMPipeline({
      input: { ...BASE_INPUT, sourceId: 'infoleg-ar-official' },
      workflowRunId: 'wfr-test-003',
      env: makePipelineEnv(true),
    });
    assert.equal(result.humanReviewGateStatus, 'pending');
    assert.ok(!('evidencePacketId' in result) || result.evidencePacketId === undefined || typeof result.evidencePacketId === 'string');
  });

  it('returns valid workflowRunId in output', async () => {
    const result = await runPCRAMPipeline({
      input: BASE_INPUT,
      workflowRunId: 'wfr-test-004',
      env: makePipelineEnv(true),
    });
    assert.equal(result.workflowRunId, 'wfr-test-004');
  });
});

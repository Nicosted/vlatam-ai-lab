/**
 * PCRAM Pipeline Workflow
 *
 * Durable execution of the regulatory intelligence pipeline using Cloudflare Workflows.
 * Steps run sequentially with automatic retry and resume-on-failure.
 *
 * Pipeline steps:
 *   1. sourceMonitorStep    — detect regulatory source changes
 *   2. snapshotWriterStep   — write intelligence-source-snapshot artifact
 *   3. deltaAnalyzerStep    — diff new snapshot against previous
 *   4. evidenceWriterStep   — build extractable-evidence-packet artifact
 *   5. humanReviewGateStep  — pause for human review (human_review_required: true)
 *
 * Gated by CLOUDFLARE_PIPELINE_V1_ENABLED feature flag.
 * All step handlers are stubs in this foundation PR.
 */

import type { EmbeddingJob } from '../queues/queue-interfaces.js';

// ---------------------------------------------------------------------------
// Workflow types
// ---------------------------------------------------------------------------

export type WorkflowStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type WorkflowStatus = 'running' | 'paused' | 'completed' | 'failed';
export type HumanReviewGateStatus = 'pending' | 'approved' | 'rejected';

export interface RetryPolicy {
  readonly maxRetries: number;
  readonly initialDelayMs: number;
  readonly backoffMultiplier: number;
  readonly maxDelayMs: number;
}

export interface WorkflowStepResult<T = unknown> {
  readonly stepName: string;
  readonly status: WorkflowStepStatus;
  readonly output: T;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly error?: string | undefined;
}

export interface WorkflowInput {
  readonly sourceId: string;
  readonly triggerReason: 'manual' | 'scheduled' | 'webhook';
  readonly triggeredBy: string;
  readonly requestedAt: string;
}

export interface WorkflowOutput {
  readonly workflowRunId: string;
  readonly status: WorkflowStatus;
  readonly sourceId: string;
  readonly snapshotId?: string | undefined;
  readonly evidencePacketId?: string | undefined;
  readonly reviewManifestId?: string | undefined;
  readonly humanReviewGateStatus: HumanReviewGateStatus;
  readonly completedAt?: string | undefined;
  readonly steps: WorkflowStepResult[];
}

// ---------------------------------------------------------------------------
// Step output types
// ---------------------------------------------------------------------------

export interface SourceMonitorOutput {
  readonly changeDetected: boolean;
  readonly sourceId: string;
  readonly currentHash?: string | undefined;
  readonly previousHash?: string | undefined;
  readonly checkedAt: string;
}

export interface SnapshotWriterOutput {
  readonly snapshotId: string;
  readonly sourceId: string;
  readonly storageKey: string;
  readonly capturedAt: string;
  readonly schemaVersion: string;
}

export interface DeltaAnalyzerOutput {
  readonly snapshotId: string;
  readonly hasDelta: boolean;
  readonly deltaKey?: string | undefined;
  readonly addedItems: number;
  readonly removedItems: number;
  readonly modifiedItems: number;
  readonly analyzedAt: string;
}

export interface EvidenceWriterOutput {
  readonly evidencePacketId: string;
  readonly snapshotId: string;
  readonly extractionAllowed: boolean;
  readonly humanReviewRequired: true;
  readonly downstreamAllowed: false;
  readonly embeddingJobIds: string[];
  readonly createdAt: string;
}

export interface HumanReviewGateOutput {
  readonly gateStatus: HumanReviewGateStatus;
  readonly reviewManifestId?: string | undefined;
  readonly reviewedBy?: string | undefined;
  readonly reviewedAt?: string | undefined;
}

// ---------------------------------------------------------------------------
// Default retry policy
// ---------------------------------------------------------------------------

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  initialDelayMs: 2_000,
  backoffMultiplier: 2,
  maxDelayMs: 30_000,
};

// ---------------------------------------------------------------------------
// Step handlers (stubs — Phase 2 PR will implement live logic)
// ---------------------------------------------------------------------------

export async function sourceMonitorStep(
  sourceId: string,
  _storageKey?: string | undefined  // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<SourceMonitorOutput> {
  console.log(`[PCRAM:sourceMonitor] Checking source: ${sourceId}`);
  return {
    changeDetected: false,
    sourceId,
    checkedAt: new Date().toISOString(),
  };
}

export async function snapshotWriterStep(
  sourceId: string,
  _monitorOutput: SourceMonitorOutput  // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<SnapshotWriterOutput> {
  const snapshotId = `snap-${sourceId}-${Date.now()}`;
  const storageKey = `snapshots/${sourceId}/${snapshotId}.json`;

  console.log(`[PCRAM:snapshotWriter] Writing snapshot ${snapshotId}`);

  return {
    snapshotId,
    sourceId,
    storageKey,
    capturedAt: new Date().toISOString(),
    schemaVersion: '1.0.0',
  };
}

export async function deltaAnalyzerStep(
  _snapshotOutput: SnapshotWriterOutput
): Promise<DeltaAnalyzerOutput> {
  const { snapshotId } = _snapshotOutput;

  console.log(`[PCRAM:deltaAnalyzer] Analyzing delta for snapshot ${snapshotId}`);

  return {
    snapshotId,
    hasDelta: false,
    addedItems: 0,
    removedItems: 0,
    modifiedItems: 0,
    analyzedAt: new Date().toISOString(),
  };
}

export async function evidenceWriterStep(
  _snapshotOutput: SnapshotWriterOutput,
  _deltaOutput: DeltaAnalyzerOutput,  // eslint-disable-line @typescript-eslint/no-unused-vars
  _queueProducer: { sendBatch(jobs: EmbeddingJob[]): Promise<void> } | null  // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<EvidenceWriterOutput> {
  const { snapshotId } = _snapshotOutput;
  const evidencePacketId = `evp-${snapshotId}`;

  console.log(`[PCRAM:evidenceWriter] Building evidence packet ${evidencePacketId}`);

  return {
    evidencePacketId,
    snapshotId,
    extractionAllowed: false,
    humanReviewRequired: true,
    downstreamAllowed: false,
    embeddingJobIds: [],
    createdAt: new Date().toISOString(),
  };
}

export async function humanReviewGateStep(
  _evidenceOutput: EvidenceWriterOutput
): Promise<HumanReviewGateOutput> {
  const { evidencePacketId } = _evidenceOutput;
  console.log(`[PCRAM:humanReviewGate] Pausing for human review — evidence: ${evidencePacketId}`);

  return {
    gateStatus: 'pending',
  };
}

// ---------------------------------------------------------------------------
// PCRAM Pipeline orchestrator
// ---------------------------------------------------------------------------

export interface PCRAMPipelineEnv {
  CLOUDFLARE_PIPELINE_V1_ENABLED: string;
  NORMATIVE_KV: KVNamespace;
  REGULATORY_DOCS?: R2Bucket | undefined;
  EMBEDDING_QUEUE?: Queue<EmbeddingJob> | undefined;
}

export interface PCRAMPipelineOptions {
  readonly input: WorkflowInput;
  readonly workflowRunId: string;
  readonly env: PCRAMPipelineEnv;
}

export async function runPCRAMPipeline(options: PCRAMPipelineOptions): Promise<WorkflowOutput> {
  const { input, workflowRunId, env } = options;
  const steps: WorkflowStepResult[] = [];

  if (env.CLOUDFLARE_PIPELINE_V1_ENABLED !== 'true') {
    console.warn('[PCRAM] Pipeline flag disabled — aborting run');
    return {
      workflowRunId,
      status: 'failed',
      sourceId: input.sourceId,
      humanReviewGateStatus: 'pending',
      completedAt: new Date().toISOString(),
      steps: [],
    };
  }

  const recordStep = <T>(name: string, output: T, startedAt: string, error?: string): WorkflowStepResult<T> => {
    const result: WorkflowStepResult<T> = {
      stepName: name,
      status: error !== undefined ? 'failed' : 'completed',
      output,
      startedAt,
      completedAt: new Date().toISOString(),
      ...(error !== undefined && { error }),
    };
    steps.push(result as WorkflowStepResult);
    return result;
  };

  let snapshotOutput: SnapshotWriterOutput | undefined;
  let deltaOutput: DeltaAnalyzerOutput | undefined;
  let evidenceOutput: EvidenceWriterOutput | undefined;

  // Step 1: Source Monitor
  const s1Start = new Date().toISOString();
  try {
    const monitorOut = await sourceMonitorStep(input.sourceId, undefined);
    const s1 = recordStep('sourceMonitorStep', monitorOut, s1Start);

    if (!monitorOut.changeDetected) {
      return {
        workflowRunId,
        status: 'completed',
        sourceId: input.sourceId,
        humanReviewGateStatus: 'pending',
        completedAt: new Date().toISOString(),
        steps,
      };
    }

    // Step 2: Snapshot Writer
    const s2Start = new Date().toISOString();
    snapshotOutput = await snapshotWriterStep(input.sourceId, monitorOut);
    recordStep('snapshotWriterStep', snapshotOutput, s2Start);

    // Step 3: Delta Analyzer
    const s3Start = new Date().toISOString();
    deltaOutput = await deltaAnalyzerStep(snapshotOutput);
    recordStep('deltaAnalyzerStep', deltaOutput, s3Start);

    // Step 4: Evidence Writer
    const s4Start = new Date().toISOString();
    const queueProducer = env.EMBEDDING_QUEUE
      ? { sendBatch: async (jobs: EmbeddingJob[]): Promise<void> => { await env.EMBEDDING_QUEUE!.sendBatch(jobs.map(j => ({ body: j }))); } }
      : null;
    evidenceOutput = await evidenceWriterStep(snapshotOutput, deltaOutput, queueProducer);
    recordStep('evidenceWriterStep', evidenceOutput, s4Start);

    // Step 5: Human Review Gate
    const s5Start = new Date().toISOString();
    const gateOutput = await humanReviewGateStep(evidenceOutput);
    recordStep('humanReviewGateStep', gateOutput, s5Start);

    void s1;

    return {
      workflowRunId,
      status: gateOutput.gateStatus === 'pending' ? 'paused' : 'completed',
      sourceId: input.sourceId,
      snapshotId: snapshotOutput.snapshotId,
      evidencePacketId: evidenceOutput.evidencePacketId,
      ...(gateOutput.reviewManifestId !== undefined && { reviewManifestId: gateOutput.reviewManifestId }),
      humanReviewGateStatus: gateOutput.gateStatus,
      completedAt: new Date().toISOString(),
      steps,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[PCRAM] Pipeline failed: ${msg}`);

    return {
      workflowRunId,
      status: 'failed',
      sourceId: input.sourceId,
      ...(snapshotOutput !== undefined && { snapshotId: snapshotOutput.snapshotId }),
      ...(evidenceOutput !== undefined && { evidencePacketId: evidenceOutput.evidencePacketId }),
      humanReviewGateStatus: 'pending',
      completedAt: new Date().toISOString(),
      steps,
    };
  }
}

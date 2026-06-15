/**
 * Queue interfaces for async regulatory processing jobs.
 *
 * EmbeddingQueue: dispatches embedding generation jobs for ARCA, InfoLEG, VUCE.
 * ParsingQueue:   dispatches document parsing jobs (future).
 *
 * Gated by CLOUDFLARE_PIPELINE_V1_ENABLED feature flag.
 */

// ---------------------------------------------------------------------------
// Job types
// ---------------------------------------------------------------------------

export type EmbeddingSource = 'arca' | 'infoleg' | 'vuce';
export type JobPriority = 'high' | 'medium' | 'low';
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dead_lettered';

export interface EmbeddingJob {
  readonly jobId: string;
  readonly sourceId: string;
  readonly documentKey: string;
  readonly embeddingSource: EmbeddingSource;
  readonly priority: JobPriority;
  readonly retryCount: number;
  readonly enqueuedAt: string;
  readonly workflowRunId?: string | undefined;
}

export interface ParsingJob {
  readonly jobId: string;
  readonly sourceId: string;
  readonly documentKey: string;
  readonly contentType: string;
  readonly priority: JobPriority;
  readonly retryCount: number;
  readonly enqueuedAt: string;
  readonly workflowRunId?: string | undefined;
}

// ---------------------------------------------------------------------------
// Producer / Consumer interfaces
// ---------------------------------------------------------------------------

export interface QueueProducer<T> {
  send(message: T): Promise<void>;
  sendBatch(messages: T[]): Promise<void>;
}

export interface QueueConsumer<T> {
  consume(batch: MessageBatch<T>): Promise<void>;
}

// ---------------------------------------------------------------------------
// Cloudflare Queue producer implementation
// ---------------------------------------------------------------------------

export class CloudflareQueueProducer<T> implements QueueProducer<T> {
  private readonly queue: Queue<T>;

  constructor(queue: Queue<T>) {
    this.queue = queue;
  }

  async send(message: T): Promise<void> {
    await this.queue.send(message);
  }

  async sendBatch(messages: T[]): Promise<void> {
    const batch = messages.map(body => ({ body }));
    await this.queue.sendBatch(batch);
  }
}

// ---------------------------------------------------------------------------
// Job ID builder
// ---------------------------------------------------------------------------

export function buildJobId(prefix: string, sourceId: string): string {
  return `${prefix}-${sourceId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

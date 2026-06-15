/**
 * Unit tests for Queue interfaces
 * All Queue calls are mocked — no live Cloudflare API calls.
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  CloudflareQueueProducer,
  buildJobId,
  type EmbeddingJob,
} from '../../src/queues/queue-interfaces.js';

// ---------------------------------------------------------------------------
// Mock Queue
// ---------------------------------------------------------------------------

function makeQueueMock<T>(): { queue: Queue<T>; sent: T[]; batches: T[][] } {
  const sent: T[] = [];
  const batches: T[][] = [];

  const queue: Queue<T> = {
    metrics: mock.fn(async (): Promise<QueueMetrics> => ({ backlogCount: 0, backlogBytes: 0 })),
    send: mock.fn(async (message: T): Promise<QueueSendResponse> => {
      sent.push(message);
      return {} as QueueSendResponse;
    }),
    sendBatch: mock.fn(async (messages: MessageSendRequest<T>[]) => {
      const bodies = messages.map(m => m.body);
      batches.push(bodies);
      sent.push(...bodies);
      return {} as QueueSendBatchResponse;
    }),
  };

  return { queue, sent, batches };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CloudflareQueueProducer.send', () => {
  it('sends a single message to the queue', async () => {
    const { queue, sent } = makeQueueMock<EmbeddingJob>();
    const producer = new CloudflareQueueProducer(queue);

    const job: EmbeddingJob = {
      jobId: 'job-001',
      sourceId: 'arca',
      documentKey: 'arca:chapter:01',
      embeddingSource: 'arca',
      priority: 'high',
      retryCount: 0,
      enqueuedAt: '2026-01-01T00:00:00Z',
    };

    await producer.send(job);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0], job);
  });
});

describe('CloudflareQueueProducer.sendBatch', () => {
  it('sends multiple messages to the queue', async () => {
    const { queue, batches } = makeQueueMock<EmbeddingJob>();
    const producer = new CloudflareQueueProducer(queue);

    const jobs: EmbeddingJob[] = [
      {
        jobId: 'job-001',
        sourceId: 'arca',
        documentKey: 'arca:chapter:01',
        embeddingSource: 'arca',
        priority: 'high',
        retryCount: 0,
        enqueuedAt: '2026-01-01T00:00:00Z',
      },
      {
        jobId: 'job-002',
        sourceId: 'infoleg',
        documentKey: 'infoleg:type:decreto',
        embeddingSource: 'infoleg',
        priority: 'medium',
        retryCount: 0,
        enqueuedAt: '2026-01-01T00:00:01Z',
      },
    ];

    await producer.sendBatch(jobs);
    assert.equal(batches.length, 1);
    assert.equal(batches[0]!.length, 2);
    assert.deepEqual(batches[0]![0], jobs[0]);
    assert.deepEqual(batches[0]![1], jobs[1]);
  });

  it('handles empty batch', async () => {
    const { queue, sent } = makeQueueMock<EmbeddingJob>();
    const producer = new CloudflareQueueProducer(queue);
    await producer.sendBatch([]);
    assert.equal(sent.length, 0);
  });
});

describe('buildJobId', () => {
  it('generates unique job IDs', () => {
    const id1 = buildJobId('emb', 'arca');
    const id2 = buildJobId('emb', 'arca');
    assert.ok(id1.startsWith('emb-arca-'));
    assert.notEqual(id1, id2);
  });

  it('includes prefix and sourceId', () => {
    const id = buildJobId('parse', 'infoleg');
    assert.ok(id.startsWith('parse-infoleg-'));
  });
});

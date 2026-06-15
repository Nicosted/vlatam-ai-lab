/**
 * Embedding Consumer Worker
 *
 * Consumes jobs from the `embedding-queue` and generates Vectorize embeddings
 * for ARCA, InfoLEG, and VUCE regulatory documents.
 *
 * Gated by CLOUDFLARE_PIPELINE_V1_ENABLED feature flag.
 * All embedding calls use the Workers AI binding — no REST API calls.
 */

import type { EmbeddingJob, QueueConsumer } from '../queues/queue-interfaces.js';
import { EmbeddingService } from '../utils/embedding-service.js';

interface EmbeddingConsumerEnv {
  AI: Ai;
  ARCA_EMBEDDINGS: VectorizeIndex;
  INFOLEG_EMBEDDINGS: VectorizeIndex;
  VUCE_EMBEDDINGS: VectorizeIndex;
  NORMATIVE_KV: KVNamespace;
  CLOUDFLARE_PIPELINE_V1_ENABLED: string;
}

class EmbeddingConsumerHandler implements QueueConsumer<EmbeddingJob> {
  private readonly env: EmbeddingConsumerEnv;
  private readonly embeddingService: EmbeddingService;

  constructor(env: EmbeddingConsumerEnv) {
    this.env = env;
    this.embeddingService = new EmbeddingService({
      accountId: '',
      apiToken: '',
      aiBinding: env.AI,
    });
  }

  async consume(batch: MessageBatch<EmbeddingJob>): Promise<void> {
    if (this.env.CLOUDFLARE_PIPELINE_V1_ENABLED !== 'true') {
      console.warn('[EmbeddingConsumer] Pipeline flag disabled — skipping batch');
      batch.ackAll();
      return;
    }

    for (const message of batch.messages) {
      try {
        await this.processJob(message.body);
        message.ack();
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[EmbeddingConsumer] Job ${message.body.jobId} failed: ${msg}`);
        message.retry();
      }
    }
  }

  private async processJob(job: EmbeddingJob): Promise<void> {
    console.log(`[EmbeddingConsumer] Processing job ${job.jobId} — source: ${job.embeddingSource} document: ${job.documentKey}`);

    const raw = await this.env.NORMATIVE_KV.get(job.documentKey);
    if (raw === null) {
      throw new Error(`Document not found in KV: ${job.documentKey}`);
    }

    const document = JSON.parse(raw) as Record<string, unknown>;
    const text = this.buildEmbeddingText(job.embeddingSource, document);
    const vectorIndex = this.resolveVectorIndex(job.embeddingSource);

    const { embedding } = await this.embeddingService.embed(text);

    await vectorIndex.upsert([{
      id: `${job.embeddingSource}-${job.documentKey.replace(/[^a-zA-Z0-9-_]/g, '-')}`,
      values: embedding,
      metadata: {
        sourceId: job.sourceId,
        documentKey: job.documentKey,
        jobId: job.jobId,
        workflowRunId: job.workflowRunId ?? '',
        processedAt: new Date().toISOString(),
      },
    }]);

    console.log(`[EmbeddingConsumer] Job ${job.jobId} completed`);
  }

  private buildEmbeddingText(source: EmbeddingJob['embeddingSource'], doc: Record<string, unknown>): string {
    switch (source) {
      case 'arca':
        return `NCM: ${String(doc['ncm_code'] ?? '')}. ${String(doc['description'] ?? '')}. AEC: ${String(doc['aec_rate'] ?? '')}%.`;
      case 'infoleg':
        return `${String(doc['tipo_norma'] ?? '')} ${String(doc['numero'] ?? '')}. ${String(doc['titulo'] ?? '')}. ${String(doc['texto'] ?? '').substring(0, 500)}`;
      case 'vuce':
        return `Posición: ${String(doc['position'] ?? '')}. Intervenciones: ${(doc['interventions'] as string[] | undefined)?.join(', ') ?? 'N/A'}.`;
    }
  }

  private resolveVectorIndex(source: EmbeddingJob['embeddingSource']): VectorizeIndex {
    switch (source) {
      case 'arca':    return this.env.ARCA_EMBEDDINGS;
      case 'infoleg': return this.env.INFOLEG_EMBEDDINGS;
      case 'vuce':    return this.env.VUCE_EMBEDDINGS;
    }
  }
}

const handler: ExportedHandler<EmbeddingConsumerEnv, EmbeddingJob> = {
  async queue(batch, env) {
    const consumer = new EmbeddingConsumerHandler(env);
    await consumer.consume(batch);
  },
};

export default handler;

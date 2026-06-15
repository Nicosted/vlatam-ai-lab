#!/usr/bin/env tsx
/**
 * Generate embeddings for VUCE notes and upload to Cloudflare Vectorize
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { EmbeddingService } from '../src/utils/embedding-service.js';
import { fetchWithRetry } from './fetch-with-retry.js';
import 'dotenv/config';

const PARSED_DIR = join(process.cwd(), 'data', 'parsed', 'vuce');
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error('❌ CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN required in .env');
  process.exit(1);
}

const embeddingService = new EmbeddingService({
  accountId: ACCOUNT_ID!,
  apiToken: API_TOKEN!,
});

async function main() {
  console.log('🔄 Generating VUCE embeddings...\n');

  const files = readdirSync(PARSED_DIR).filter(f => f.startsWith('vuce-notes-') && f.endsWith('.json'));

  if (files.length === 0) {
    throw new Error('No VUCE parsed data found');
  }

  const chunks: Array<{ id: string; text: string; metadata: any }> = [];

  for (const file of files) {
    const data = JSON.parse(readFileSync(join(PARSED_DIR, file), 'utf-8'));

    const text = `Posición: ${data.position}. Intervenciones: ${data.interventions?.join(', ') || 'N/A'}. Normas: ${data.norms_cited?.join(', ') || 'N/A'}. Observaciones: ${data.observations || 'N/A'}`;

    chunks.push({
      id: `vuce-${data.position}`,
      text,
      metadata: {
        position: data.position,
        interventions: data.interventions || [],
        norms_cited: data.norms_cited || [],
        tariffs_noted: data.tariffs_noted || [],
      },
    });
  }

  console.log(`📝 Prepared ${chunks.length} chunks for embedding\n`);

  const batchSize = 20; // Reduced to avoid rate limiting
  const totalBatches = Math.ceil(chunks.length / batchSize);

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;

    console.log(`⏳ Processing batch ${batchNum}/${totalBatches} (${batch.length} chunks)...`);

    const embeddings = await embeddingService.embedBatch(batch.map(c => c.text));

    const vectors = batch.map((chunk, idx) => ({
      id: chunk.id,
      values: embeddings[idx]!.embedding,
      metadata: chunk.metadata,
    }));

    const response = await fetchWithRetry(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID!}/vectorize/v2/indexes/vuce-embeddings/upsert`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_TOKEN!}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vectors }),
      },
      5
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Vectorize upload failed: ${error}`);
    }

    console.log(`✅ Batch ${batchNum} uploaded (${(batchNum / totalBatches * 100).toFixed(1)}% complete)\n`);

    if (i + batchSize < chunks.length) {
      await new Promise(resolve => setTimeout(resolve, 3000)); // Increased to 3s
    }
  }

  console.log('✅ VUCE embeddings generation complete');
  console.log(`   Total chunks: ${chunks.length}`);
  console.log(`   Index: vuce-embeddings`);
}

main().catch(err => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});

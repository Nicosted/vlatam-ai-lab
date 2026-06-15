#!/usr/bin/env tsx
/**
 * Generate embeddings for InfoLEG norms and upload to Cloudflare Vectorize
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { EmbeddingService } from '../src/utils/embedding-service.js';
import 'dotenv/config';

const PARSED_DIR = join(process.cwd(), 'data', 'parsed', 'infoleg');
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
  console.log('🔄 Generating InfoLEG embeddings...\n');

  const data = JSON.parse(readFileSync(join(PARSED_DIR, 'customs-relevant-norms.json'), 'utf-8'));
  const norms = data.norms || [];

  console.log(`📊 Total norms: ${norms.length}`);

  const chunks: Array<{ id: string; text: string; metadata: any }> = [];

  for (const norm of norms) {
    const text = `${norm.tipo_norma} ${norm.numero}. ${norm.titulo}. Fecha: ${norm.fecha}. ${norm.texto?.substring(0, 500) || ''}`;

    chunks.push({
      id: `infoleg-${norm.tipo_norma}-${norm.numero}-${norm.fecha}`,
      text,
      metadata: {
        tipo_norma: norm.tipo_norma,
        numero: norm.numero,
        fecha: norm.fecha,
        titulo: norm.titulo,
        ncm_citados: norm.ncm_citados || [],
      },
    });
  }

  console.log(`📝 Prepared ${chunks.length} chunks for embedding\n`);

  const batchSize = 50;
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

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID!}/vectorize/v2/indexes/infoleg-embeddings/upsert`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_TOKEN!}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vectors }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Vectorize upload failed: ${error}`);
    }

    console.log(`✅ Batch ${batchNum} uploaded\n`);

    if (i + batchSize < chunks.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('✅ InfoLEG embeddings generation complete');
  console.log(`   Total chunks: ${chunks.length}`);
  console.log(`   Index: infoleg-embeddings`);
}

main().catch(err => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});

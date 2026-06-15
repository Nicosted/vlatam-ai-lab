#!/usr/bin/env tsx
/**
 * Robust sync of parsed normative data to Cloudflare KV.
 * Uses Cloudflare REST API (avoids wrangler CLI syntax issues).
 * Indexes data for fast Worker lookups.
 * 
 * Usage: pnpm run sync:kv
 * 
 * Prerequisites:
 * - CLOUDFLARE_API_TOKEN in .env (with KV edit permissions)
 * - CLOUDFLARE_ACCOUNT_ID in .env
 * - KV_NAMESPACE_ID in .env (or uses wrangler.toml)
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';

const PARSED_DIR = join(process.cwd(), 'data', 'parsed');

// KV value limit is 25MB; use 20MB to be safe
const KV_VALUE_LIMIT = 20 * 1024 * 1024;

// Get credentials from environment
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const NAMESPACE_ID = process.env.KV_NAMESPACE_ID || '0dd29a9bcfcd4bf9b3e6dce6fb5fe5e9';

if (!API_TOKEN || !ACCOUNT_ID) {
  console.error('❌ Missing required environment variables:');
  console.error('   CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set in .env');
  console.error('\n   Add them to your .env file:');
  console.error('   CLOUDFLARE_API_TOKEN=your_api_token');
  console.error('   CLOUDFLARE_ACCOUNT_ID=your_account_id');
  console.error('   KV_NAMESPACE_ID=0dd29a9bcfcd4bf9b3e6dce6fb5fe5e9');
  process.exit(1);
}

/**
 * Write a key to KV using Cloudflare REST API
 */
async function putKV(key: string, value: string): Promise<void> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${NAMESPACE_ID}/values/${encodeURIComponent(key)}`;
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'text/plain',
    },
    body: value,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to write key "${key}": ${response.status} ${error}`);
  }
}

/**
 * Get latest parsed file from a directory
 */
function getLatestFile(dir: string, prefix: string): string | null {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
    .sort()
    .reverse();
  const firstFile = files[0];
  return firstFile ? join(dir, firstFile) : null;
}

/**
 * Sync ARCA: index by HS2 chapter for fast lookups
 */
async function syncARCA(): Promise<{ count: number; chunks: number }> {
  console.log('\n📦 Syncing ARCA...');
  const arcaFile = getLatestFile(join(PARSED_DIR, 'arca'), 'arancel');
  if (!arcaFile) {
    console.log('   ⚠️  No ARCA parsed data found');
    return { count: 0, chunks: 0 };
  }

  const data = JSON.parse(readFileSync(arcaFile, 'utf-8'));
  const lines = data.tariff_lines || [];
  console.log(`   Total lines: ${lines.length}`);

  // Group by HS2 chapter (first 2 digits of NCM)
  const byChapter: Record<string, any[]> = {};
  for (const line of lines) {
    const chapter = line.ncm_code_clean.substring(0, 2);
    if (!byChapter[chapter]) byChapter[chapter] = [];
    byChapter[chapter].push(line);
  }

  let chunks = 0;
  for (const [chapter, chapterLines] of Object.entries(byChapter)) {
    const value = JSON.stringify({
      chapter,
      count: chapterLines.length,
      lines: chapterLines,
      synced_at: new Date().toISOString()
    });

    // If chapter too big, sub-chunk by HS4 heading
    if (value.length > KV_VALUE_LIMIT) {
      const byHeading: Record<string, any[]> = {};
      for (const line of chapterLines) {
        const heading = line.ncm_code_clean.substring(0, 4);
        if (!byHeading[heading]) byHeading[heading] = [];
        byHeading[heading].push(line);
      }
      for (const [heading, headingLines] of Object.entries(byHeading)) {
        await putKV(`arca:heading:${heading}`, JSON.stringify({
          heading,
          count: headingLines.length,
          lines: headingLines,
          synced_at: new Date().toISOString()
        }));
        chunks++;
      }
    } else {
      await putKV(`arca:chapter:${chapter}`, value);
      chunks++;
    }
  }

  // Store index
  await putKV('arca:index', JSON.stringify({
    chapters: Object.keys(byChapter).sort(),
    total_lines: lines.length,
    synced_at: new Date().toISOString()
  }));

  console.log(`   ✅ Synced ${lines.length} lines in ${chunks} chunks`);
  return { count: lines.length, chunks };
}

/**
 * Sync InfoLEG: index by norm type
 */
async function syncInfoLEG(): Promise<{ count: number; chunks: number }> {
  console.log('\n📦 Syncing InfoLEG...');
  const infolegFile = join(PARSED_DIR, 'infoleg', 'customs-relevant-norms.json');
  if (!existsSync(infolegFile)) {
    console.log('   ⚠️  No InfoLEG parsed data found');
    return { count: 0, chunks: 0 };
  }

  const data = JSON.parse(readFileSync(infolegFile, 'utf-8'));
  const norms = data.norms || [];
  console.log(`   Total norms: ${norms.length}`);

  // Group by tipo_norma
  const byType: Record<string, any[]> = {};
  for (const norm of norms) {
    const type = (norm.tipo_norma || 'other').toLowerCase().replace(/\s+/g, '_');
    if (!byType[type]) byType[type] = [];
    byType[type].push(norm);
  }

  let chunks = 0;
  for (const [type, typeNorms] of Object.entries(byType)) {
    const value = JSON.stringify({
      type,
      count: typeNorms.length,
      norms: typeNorms,
      synced_at: new Date().toISOString()
    });

    // If type too big, sub-chunk by year
    if (value.length > KV_VALUE_LIMIT) {
      const byYear: Record<string, any[]> = {};
      for (const norm of typeNorms) {
        const year = (norm.fecha || '').substring(0, 4) || 'unknown';
        if (!byYear[year]) byYear[year] = [];
        byYear[year].push(norm);
      }
      for (const [year, yearNorms] of Object.entries(byYear)) {
        await putKV(`infoleg:${type}:${year}`, JSON.stringify({
          type, year,
          count: yearNorms.length,
          norms: yearNorms,
          synced_at: new Date().toISOString()
        }));
        chunks++;
      }
    } else {
      await putKV(`infoleg:type:${type}`, value);
      chunks++;
    }
  }

  // Store index
  await putKV('infoleg:index', JSON.stringify({
    types: Object.keys(byType).sort(),
    total_norms: norms.length,
    synced_at: new Date().toISOString()
  }));

  console.log(`   ✅ Synced ${norms.length} norms in ${chunks} chunks`);
  return { count: norms.length, chunks };
}

/**
 * Sync VUCE: index by position (small data)
 */
async function syncVUCE(): Promise<{ count: number }> {
  console.log('\n📦 Syncing VUCE...');
  const vuceDir = join(PARSED_DIR, 'vuce');
  if (!existsSync(vuceDir)) {
    console.log('   ⚠️  No VUCE parsed data found');
    return { count: 0 };
  }

  const files = readdirSync(vuceDir).filter(f => f.startsWith('vuce-notes-') && f.endsWith('.json'));
  const notes = files.map(f => JSON.parse(readFileSync(join(vuceDir, f), 'utf-8')));

  for (const note of notes) {
    const posKey = note.position.replace(/\./g, '-');
    await putKV(`vuce:position:${posKey}`, JSON.stringify(note));
  }

  await putKV('vuce:index', JSON.stringify({
    positions: notes.map(n => n.position),
    count: notes.length,
    synced_at: new Date().toISOString()
  }));

  console.log(`   ✅ Synced ${notes.length} VUCE positions`);
  return { count: notes.length };
}

async function main() {
  console.log('🔄 Starting robust KV sync...');
  console.log('=====================================\n');

  const arcaResult = await syncARCA();
  const infolegResult = await syncInfoLEG();
  const vuceResult = await syncVUCE();

  console.log('\n=====================================');
  console.log('✅ Sync complete');
  console.log(`   ARCA: ${arcaResult.count} lines in ${arcaResult.chunks} chunks`);
  console.log(`   InfoLEG: ${infolegResult.count} norms in ${infolegResult.chunks} chunks`);
  console.log(`   VUCE: ${vuceResult.count} positions`);
  console.log('\nNext: pnpm run dev:worker');
}

main().catch(err => {
  console.error('❌ Sync failed:', err.message);
  process.exit(1);
});

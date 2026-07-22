#!/usr/bin/env tsx
/**
 * ARCA Real Data Crawler - Parse official ARCA nomenclador TXT format
 * 
 * Format: @-delimited fields, type 2 = tariff position
 * Encoding: ISO-8859 (Latin1)
 * 
 * Usage: pnpm crawler:arca:real
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
import {
  parseNomencladorFile,
  type TariffLine,
} from '../parsers/arca-nomenclador.js';

const SOURCES_DIR = join(process.cwd(), 'data', 'sources', 'arca');
const PARSED_DIR = join(process.cwd(), 'data', 'parsed', 'arca');
const DIFFS_DIR = join(process.cwd(), 'data', 'diffs', 'arca');

interface ArcaSnapshot {
  snapshot_id: string;
  source_id: string;
  source_url: string;
  snapshot_date: string;
  file_hash: string;
  parsed_at: string;
  tariff_lines_count: number;
  tariff_lines: TariffLine[];
}

function computeHash(filePath: string): string {
  const content = readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function findLatestNomencladorFile(): string | null {
  const files = readdirSync(SOURCES_DIR)
    .filter(f => f.startsWith('nomenclador_') && f.endsWith('.txt'))
    .sort()
    .reverse();
  
  return files[0] ? join(SOURCES_DIR, files[0]) : null;
}

function loadPreviousSnapshot(): ArcaSnapshot | null {
  if (!existsSync(PARSED_DIR)) return null;
  
  const files = readdirSync(PARSED_DIR)
    .filter(f => f.startsWith('arancel-') && f.endsWith('.json'))
    .sort()
    .reverse();
  
  const latestFile = files[0];
  if (!latestFile) return null;
  
  const content = readFileSync(join(PARSED_DIR, latestFile), 'utf-8');
  return JSON.parse(content);
}

function generateDiff(newSnapshot: ArcaSnapshot, oldSnapshot: ArcaSnapshot | null): any {
  if (!oldSnapshot) {
    return {
      diff_id: `diff-arca-${newSnapshot.snapshot_date}`,
      snapshot_id: newSnapshot.snapshot_id,
      previous_snapshot_id: null,
      generated_at: new Date().toISOString(),
      changes_count: 0,
      added: [],
      removed: [],
      modified: [],
      is_initial: true,
    };
  }
  
  const oldLines = new Map(oldSnapshot.tariff_lines.map(l => [l.ncm_code_clean, l]));
  const newLines = new Map(newSnapshot.tariff_lines.map(l => [l.ncm_code_clean, l]));
  
  const added: string[] = [];
  const removed: string[] = [];
  const modified: any[] = [];
  
  for (const [ncm, line] of newLines) {
    if (!oldLines.has(ncm)) {
      added.push(ncm);
    } else {
      const old = oldLines.get(ncm)!;
      const changes: string[] = [];
      
      if (old.aec_rate !== line.aec_rate) changes.push(`aec: ${old.aec_rate} -> ${line.aec_rate}`);
      if (old.derecho_extra_zona !== line.derecho_extra_zona) changes.push(`ez: ${old.derecho_extra_zona} -> ${line.derecho_extra_zona}`);
      if (old.description !== line.description) changes.push('description changed');
      
      if (changes.length > 0) {
        modified.push({ ncm, changes });
      }
    }
  }
  
  for (const [ncm, _] of oldLines) {
    if (!newLines.has(ncm)) removed.push(ncm);
  }
  
  return {
    diff_id: `diff-arca-${newSnapshot.snapshot_date}`,
    snapshot_id: newSnapshot.snapshot_id,
    previous_snapshot_id: oldSnapshot.snapshot_id,
    generated_at: new Date().toISOString(),
    changes_count: added.length + removed.length + modified.length,
    added,
    removed,
    modified,
    is_initial: false,
  };
}

async function main() {
  console.log('🔍 ARCA Real Data Crawler');
  console.log('=========================\n');
  
  // Find nomenclador file
  const nomencladorFile = findLatestNomencladorFile();
  if (!nomencladorFile) {
    console.error('❌ No nomenclador file found in', SOURCES_DIR);
    process.exit(1);
  }
  
  console.log('📄 Source file:', nomencladorFile);
  
  // Compute hash
  const fileHash = computeHash(nomencladorFile);
  console.log('🔐 SHA-256:', fileHash.substring(0, 16) + '...');
  
  // Parse file
  console.log('⏳ Parsing nomenclador...');
  const tariffLines = parseNomencladorFile(nomencladorFile);
  console.log(`✅ Parsed ${tariffLines.length} tariff lines`);
  
  // Create snapshot
  const snapshotDate = '2026-06-14';
  const snapshotId = `snap-arca-arancel-${snapshotDate}`;
  
  const snapshot: ArcaSnapshot = {
    snapshot_id: snapshotId,
    source_id: 'ar-arca-arancel-integrado',
    source_url: 'https://www.afip.gob.ar/aduana/arancelintegrado/',
    snapshot_date: snapshotDate,
    file_hash: fileHash,
    parsed_at: new Date().toISOString(),
    tariff_lines_count: tariffLines.length,
    tariff_lines: tariffLines,
  };
  
  // Ensure directories
  if (!existsSync(PARSED_DIR)) mkdirSync(PARSED_DIR, { recursive: true });
  if (!existsSync(DIFFS_DIR)) mkdirSync(DIFFS_DIR, { recursive: true });
  
  // Save snapshot
  const outputPath = join(PARSED_DIR, `arancel-${snapshotDate}.json`);
  writeFileSync(outputPath, JSON.stringify(snapshot, null, 2));
  console.log(`💾 Snapshot saved: ${outputPath}`);
  
  // Generate diff
  const previousSnapshot = loadPreviousSnapshot();
  const diff = generateDiff(snapshot, previousSnapshot);
  
  const diffPath = join(DIFFS_DIR, `diff-${snapshotDate}.json`);
  writeFileSync(diffPath, JSON.stringify(diff, null, 2));
  console.log(`📊 Diff saved: ${diffPath}`);
  
  // Summary
  console.log('\n📈 Summary:');
  console.log(`   Total tariff lines: ${tariffLines.length}`);
  console.log(`   With AEC rate: ${tariffLines.filter(l => l.aec_rate !== null).length}`);
  console.log(`   With EZ rate: ${tariffLines.filter(l => l.derecho_extra_zona !== null).length}`);
  console.log(`   With estadística: ${tariffLines.filter(l => l.tasa_estadistica !== null).length}`);
  
  // Test search for known NCM
  const testNcms = ['42029200', '84521000'];
  for (const ncm of testNcms) {
    const found = tariffLines.find(l => l.ncm_code_clean === ncm);
    if (found) {
      console.log(`\n✅ Found test NCM ${ncm}: ${found.description.substring(0, 50)}...`);
      console.log(`   AEC: ${found.aec_rate}%, EZ: ${found.derecho_extra_zona}%`);
    } else {
      console.log(`\n⚠️ Test NCM ${ncm} not found`);
    }
  }
  
  console.log('\n✅ ARCA real data processing complete');
  console.log('Next: pnpm crawler:packet <ncm> <description>');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

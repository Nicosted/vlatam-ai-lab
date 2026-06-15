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

const SOURCES_DIR = join(process.cwd(), 'data', 'sources', 'arca');
const PARSED_DIR = join(process.cwd(), 'data', 'parsed', 'arca');
const DIFFS_DIR = join(process.cwd(), 'data', 'diffs', 'arca');

interface TariffLine {
  ncm_code: string;
  ncm_code_clean: string;
  hs6_code: string;
  description: string;
  aec_rate: number | null;
  derecho_extra_zona: number | null;
  tasa_estadistica: number | null;
  iva_rate: number | null;
  unidad_estadistica: string;
  source: string;
  source_url: string;
  snapshot_date: string;
}

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

function parseNomencladorFile(filePath: string): TariffLine[] {
  const content = readFileSync(filePath, 'latin1');
  const lines = content.split('\n');
  const tariffLines: TariffLine[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Parse @-delimited fields
    const fields = trimmed.split('@');
    
    // Type 2 = tariff position
    if (fields[0] !== '2') continue;
    
    // Extract NCM code (field 1)
    const ncmFull = fields[1]?.trim() || '';
    if (!ncmFull) continue;
    
    // Clean NCM (remove verification digit suffix like .110V)
    // Format: 4202.92.00.110V -> 4202.92.00 (base) + .110V (suffix)
    const ncmParts = ncmFull.split('.');
    let ncmCode = ncmFull;
    let ncmClean = ncmFull.replace(/\./g, '');
    
    // If has more than 4 parts (like 4202.92.00.110V), extract base NCM8
    if (ncmParts.length > 4) {
      ncmCode = ncmParts.slice(0, 4).join('.');
      ncmClean = ncmCode.replace(/\./g, '');
    }
    
    // HS6 = first 6 digits of clean NCM
    const hs6Clean = ncmClean.substring(0, 6);
    const hs6Code = `${hs6Clean.substring(0, 4)}.${hs6Clean.substring(4, 6)}`;
    
    // Parse numeric fields (derechos)
    // Format: @000.00@007.00@020.00@007.00@000.00@
    const parseRate = (field: string): number | null => {
      if (!field || field.trim() === '') return null;
      const val = parseFloat(field.trim());
      return isNaN(val) ? null : val;
    };
    
    const aecRate = parseRate(fields[2]);           // Derecho AEC
    const derechoEZ = parseRate(fields[3]);         // Derecho extra-zona
    const tasaEst = parseRate(fields[4]);           // Tasa estadística
    const tasa4 = parseRate(fields[5]);             // Could be IVA
    const tasa5 = parseRate(fields[6]);             // Could be IVA
    const tasa6 = parseRate(fields[7]);           // Could be IVA
    
    // Unidad estadística (field after empty space)
    const unidadEst = fields[9]?.trim() || '';
    
    // Description (last non-empty field)
    let description = '';
    for (let i = fields.length - 1; i >= 0; i--) {
      if (fields[i]?.trim()) {
        description = fields[i].trim();
        break;
      }
    }
    
    // IVA extraction: try fields[7], then infer from tasa4/tasa5 if they contain 21.00 or 10.50
    // Standard IVA rates in Argentina: 21% (general), 10.5% (reduced for some goods)
    let ivaRate: number | null = null;
    
    // First try: field 7 (IVA column)
    if (tasa6 !== null && (tasa6 === 21.0 || tasa6 === 10.5 || tasa6 === 27.0)) {
      ivaRate = tasa6;
    }
    // Second try: check if tasa4 or tasa5 match standard IVA rates
    else if (tasa4 !== null && (tasa4 === 21.0 || tasa4 === 10.5)) {
      ivaRate = tasa4;
    }
    else if (tasa5 !== null && (tasa5 === 21.0 || tasa5 === 10.5)) {
      ivaRate = tasa5;
    }
    // Default: 21% is the standard rate for most imports
    // But we only set default if we have other tariff data (not for all products)
    // else if (aecRate !== null || derechoEZ !== null) {
    //   ivaRate = 21.0;  // Commented out - don't assume, let it be null if not explicit
    // }
    
    tariffLines.push({
      ncm_code: ncmFull,
      ncm_code_clean: ncmClean,
      hs6_code: hs6Code,
      description,
      aec_rate: aecRate,
      derecho_extra_zona: derechoEZ,
      tasa_estadistica: tasaEst,
      iva_rate: ivaRate,
      unidad_estadistica: unidadEst,
      source: 'ARCA Arancel Integrado',
      source_url: 'https://www.afip.gob.ar/aduana/arancelintegrado/',
      snapshot_date: '2026-06-14',
    });
  }
  
  return tariffLines;
}

function findLatestNomencladorFile(): string | null {
  const files = readdirSync(SOURCES_DIR)
    .filter(f => f.startsWith('nomenclador_') && f.endsWith('.txt'))
    .sort()
    .reverse();
  
  return files.length > 0 ? join(SOURCES_DIR, files[0]) : null;
}

function loadPreviousSnapshot(): ArcaSnapshot | null {
  if (!existsSync(PARSED_DIR)) return null;
  
  const files = readdirSync(PARSED_DIR)
    .filter(f => f.startsWith('arancel-') && f.endsWith('.json'))
    .sort()
    .reverse();
  
  if (files.length === 0) return null;
  
  const content = readFileSync(join(PARSED_DIR, files[0]), 'utf-8');
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

#!/usr/bin/env tsx
/**
 * ARCA Arancel Integrado Crawler
 * 
 * Downloads the official Argentine customs tariff Excel file,
 * saves raw snapshot, parses to structured JSON, detects changes.
 * 
 * Source: https://www.afip.gob.ar/aduana/arancelintegrado/
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import * as XLSX from 'xlsx';
import 'dotenv/config';

const DATA_ROOT = join(process.cwd(), 'data');
const RAW_DIR = join(DATA_ROOT, 'raw', 'arca');
const PARSED_DIR = join(DATA_ROOT, 'parsed', 'arca');
const DIFFS_DIR = join(DATA_ROOT, 'diffs', 'arca');

// ARCA publishes the tariff at this URL (as of 2026-06)
// Note: This URL may change; verify manually before each run
const ARCA_TARIFF_URL = 'https://www.afip.gob.ar/aduana/arancelintegrado/';

interface TariffLine {
  ncm_code: string;           // NCM 8-digit code (e.g., "4202.92.00")
  ncm_code_clean: string;     // Without dots (e.g., "42029200")
  hs6_code: string;           // HS 6-digit (e.g., "4202.92")
  description: string;        // Full description
  aec_rate: number | null;    // Arancel Externo Común (%)
  derecho_extra_zona: number | null;
  tasa_estadistica: number | null;
  iva_rate: number | null;
  ley_iva: string | null;
  sufijos_valor: string[];
  source: string;
  source_url: string;
  captured_at: string;        // ISO timestamp
  snapshot_date: string;      // YYYY-MM-DD
}

interface ArcaSnapshot {
  snapshot_id: string;
  source_id: string;
  source_url: string;
  captured_at: string;
  snapshot_date: string;
  file_hash: string;          // SHA-256 of raw file
  tariff_lines_count: number;
  tariff_lines: TariffLine[];
  metadata: {
    source_name: string;
    jurisdiction: string;
    document_type: string;
    official_update_date: string | null;
  };
}

/**
 * Simple SHA-256 hash for audit trail
 */
async function hashBuffer(buffer: Buffer): Promise<string> {
  const crypto = await import('crypto');
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Download the ARCA tariff file
 * Note: ARCA's website may require manual download in some cases.
 * This function attempts direct download; if it fails, provides instructions.
 */
async function downloadTariffFile(): Promise<{ buffer: Buffer; filename: string }> {
  console.log('📥 Attempting to download ARCA tariff file...');
  console.log(`   URL: ${ARCA_TARIFF_URL}`);
  
  try {
    const response = await fetch(ARCA_TARIFF_URL, {
      headers: {
        'User-Agent': 'vlatam-ai-lab-crawler/1.0 (contact@vlatamglobal.com)',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    // Check if response is Excel file or HTML landing page
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('application/vnd.ms-excel') || 
        contentType.includes('application/vnd.openxmlformats') ||
        contentType.includes('application/octet-stream')) {
      const buffer = Buffer.from(await response.arrayBuffer());
      const filename = `arancel-${new Date().toISOString().split('T')[0]}.xlsx`;
      return { buffer, filename };
    }
    
    // If it's HTML, ARCA requires manual download
    throw new Error('ARCA website returns HTML (manual download required)');
    
  } catch (error: any) {
    console.log('⚠️  Direct download failed:', error.message);
    console.log('');
    console.log('📋 Manual download instructions:');
    console.log('   1. Go to: https://www.afip.gob.ar/aduana/arancelintegrado/');
    console.log('   2. Download the latest "Arancel Integrado" Excel file');
    console.log('   3. Save it to: data/raw/arca/arancel-manual-YYYY-MM-DD.xlsx');
    console.log('   4. Re-run this crawler with: pnpm crawler:arca --manual <file>');
    console.log('');
    
    // Check for manually downloaded file
    const manualFiles = findManualFiles();
    if (manualFiles.length > 0) {
      const latest = manualFiles[manualFiles.length - 1];
      if (!latest) {
        throw new Error('No manual file found');
      }
      console.log(`📂 Found manual file: ${latest}`);
      const buffer = readFileSync(latest);
      const filenameParts = latest.split('/');
      const filename = filenameParts[filenameParts.length - 1] || 'unknown.xlsx';
      return { buffer, filename };
    }
    
    throw new Error('No ARCA file available. Download manually first.');
  }
}

/**
 * Find manually downloaded files in raw directory
 */
function findManualFiles(): string[] {
  if (!existsSync(RAW_DIR)) return [];
  const files = readdirSync(RAW_DIR)
    .filter((f: string) => f.endsWith('.xlsx') || f.endsWith('.xls'))
    .map((f: string) => join(RAW_DIR, f))
    .sort();
  return files;
}

/**
 * Parse Excel file to structured tariff lines
 * 
 * ARCA Excel structure (typical):
 * - Column A: NCM code (8 digits with dots)
 * - Column B: Description
 * - Column C: AEC rate
 * - Column D: Tasa estadística
 * - Column E: IVA
 * - Additional columns: sufijos, etc.
 * 
 * Note: Column mapping may vary. This parser is defensive.
 */
function parseExcel(buffer: Buffer, snapshotDate: string): TariffLine[] {
  console.log('🔍 Parsing Excel file...');
  
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Excel file has no sheets');
  }
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found in workbook`);
  }
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
  
  console.log(`   Found ${rows.length} rows in sheet "${sheetName}"`);
  
  // Detect header row and column mapping
  const headerRowResult = findHeaderRow(rows);
  if (!headerRowResult) {
    throw new Error('Could not detect header row in Excel file');
  }
  
  const columnMap = detectColumns(headerRowResult.row);
  console.log(`   Column mapping:`, columnMap);
  
  const tariffLines: TariffLine[] = [];
  
  const ncmCol = columnMap.ncm;
  if (ncmCol === undefined) {
    throw new Error('NCM column index not found');
  }
  
  for (let i = headerRowResult.index + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    
    const ncmRaw = String(row[ncmCol] || '').trim();
    if (!ncmRaw || ncmRaw.length < 8) continue;
    
    try {
      const tariffLine = parseRow(row, columnMap, ncmRaw, snapshotDate);
      if (tariffLine) tariffLines.push(tariffLine);
    } catch (error) {
      // Skip malformed rows, log warning
      console.warn(`   ⚠️  Skipping row ${i}:`, error);
    }
  }
  
  console.log(`   ✅ Parsed ${tariffLines.length} tariff lines`);
  return tariffLines;
}

function findHeaderRow(rows: any[][]): { index: number; row: any[] } | null {
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ');
    // Look for NCM column - more lenient detection
    if (rowStr.includes('ncm')) {
      return { index: i, row };
    }
  }
  // Fallback: return first row if it has content
  if (rows.length > 0 && rows[0] && rows[0].length > 0) {
    return { index: 0, row: rows[0] };
  }
  return null;
}

function detectColumns(headerRowData: any[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerRowData.forEach((cell, idx) => {
    const cellStr = String(cell || '').toLowerCase().trim();
    if (cellStr.includes('ncm') && map.ncm === undefined) map.ncm = idx;
    else if (cellStr.includes('descri') && map.description === undefined) map.description = idx;
    else if (cellStr.includes('aec') && map.aec === undefined) map.aec = idx;
    else if (cellStr.includes('estadíst') || cellStr.includes('estadist')) map.tasaEstadistica = idx;
    else if (cellStr === 'iva' || cellStr.includes('iva')) map.iva = idx;
    else if (cellStr.includes('derecho') || cellStr.includes('extra')) map.derechoExtraZona = idx;
  });
  
  if (map.ncm === undefined) throw new Error('NCM column not found');
  if (map.description === undefined) map.description = map.ncm + 1; // fallback
  
  return map;
}

function parseRow(row: any[], colMap: Record<string, number>, ncmRaw: string, snapshotDate: string): TariffLine | null {
  // Normalize NCM code
  const ncmClean = ncmRaw.replace(/\./g, '').replace(/\s/g, '');
  if (ncmClean.length !== 8) return null;
  
  const ncmFormatted = `${ncmClean.slice(0,4)}.${ncmClean.slice(4,6)}.${ncmClean.slice(6,8)}`;
  const hs6 = ncmFormatted.slice(0, 7);
  
  const ncmIdx = colMap.ncm;
  if (ncmIdx === undefined) {
    return null;
  }
  const descCol = colMap.description ?? (ncmIdx + 1);
  const description = String(row[descCol] || '').trim();
  
  const parseRate = (val: any): number | null => {
    if (val === null || val === undefined || val === '') return null;
    const num = parseFloat(String(val).replace(',', '.').replace('%', ''));
    return isNaN(num) ? null : num;
  };
  
  return {
    ncm_code: ncmFormatted,
    ncm_code_clean: ncmClean,
    hs6_code: hs6,
    description,
    aec_rate: colMap.aec !== undefined ? parseRate(row[colMap.aec]) : null,
    derecho_extra_zona: colMap.derechoExtraZona !== undefined ? parseRate(row[colMap.derechoExtraZona]) : parseRate(row[colMap.aec ?? 0]),
    tasa_estadistica: colMap.tasaEstadistica !== undefined ? parseRate(row[colMap.tasaEstadistica]) : null,
    iva_rate: colMap.iva !== undefined ? parseRate(row[colMap.iva]) : null,
    ley_iva: '23.857',
    sufijos_valor: [],
    source: 'ARCA Arancel Integrado',
    source_url: ARCA_TARIFF_URL,
    captured_at: new Date().toISOString(),
    snapshot_date: snapshotDate,
  };
}

/**
 * Compare two snapshots and generate diff
 */
function generateDiff(
  previous: ArcaSnapshot | null,
  current: ArcaSnapshot
): {
  snapshot_date: string;
  previous_snapshot_date: string | null;
  added: TariffLine[];
  removed: TariffLine[];
  modified: { ncm_code: string; before: Partial<TariffLine>; after: Partial<TariffLine> }[];
  unchanged_count: number;
} {
  if (!previous) {
    return {
      snapshot_date: current.snapshot_date,
      previous_snapshot_date: null,
      added: current.tariff_lines,
      removed: [],
      modified: [],
      unchanged_count: 0,
    };
  }
  
  const prevMap = new Map(previous.tariff_lines.map(l => [l.ncm_code_clean, l]));
  const currMap = new Map(current.tariff_lines.map(l => [l.ncm_code_clean, l]));
  
  const added: TariffLine[] = [];
  const removed: TariffLine[] = [];
  const modified: any[] = [];
  let unchanged = 0;
  
  // Find added and modified
  for (const [code, curr] of currMap) {
    const prev = prevMap.get(code);
    if (!prev) {
      added.push(curr);
    } else if (hasChanged(prev, curr)) {
      modified.push({
        ncm_code: curr.ncm_code,
        before: { aec_rate: prev.aec_rate, derecho_extra_zona: prev.derecho_extra_zona, tasa_estadistica: prev.tasa_estadistica, iva_rate: prev.iva_rate, description: prev.description },
        after: { aec_rate: curr.aec_rate, derecho_extra_zona: curr.derecho_extra_zona, tasa_estadistica: curr.tasa_estadistica, iva_rate: curr.iva_rate, description: curr.description },
      });
    } else {
      unchanged++;
    }
  }
  
  // Find removed
  for (const [code, prev] of prevMap) {
    if (!currMap.has(code)) removed.push(prev);
  }
  
  return {
    snapshot_date: current.snapshot_date,
    previous_snapshot_date: previous.snapshot_date,
    added,
    removed,
    modified,
    unchanged_count: unchanged,
  };
}

function hasChanged(a: TariffLine, b: TariffLine): boolean {
  return a.aec_rate !== b.aec_rate ||
         a.derecho_extra_zona !== b.derecho_extra_zona ||
         a.tasa_estadistica !== b.tasa_estadistica ||
         a.iva_rate !== b.iva_rate ||
         a.description !== b.description;
}

/**
 * Find the most recent previous snapshot
 */
function findPreviousSnapshot(currentDate: string): ArcaSnapshot | null {
  if (!existsSync(PARSED_DIR)) return null;
  const files = readdirSync(PARSED_DIR)
    .filter((f: string) => f.endsWith('.json') && f < `arancel-${currentDate}.json`)
    .sort()
    .reverse();
  
  if (files.length === 0) return null;
  
  const firstFile = files[0];
  if (!firstFile) return null;
  
  const latestFile = join(PARSED_DIR, firstFile);
  return JSON.parse(readFileSync(latestFile, 'utf-8'));
}

/**
 * Main crawler function
 */
async function runCrawler(manualFile?: string): Promise<void> {
  console.log('🕷️  ARCA Arancel Integrado Crawler');
  console.log('=====================================\n');
  
  // Ensure directories exist
  [RAW_DIR, PARSED_DIR, DIFFS_DIR].forEach(dir => {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  });
  
  const isoString = new Date().toISOString();
  const snapshotDate = isoString.split('T')[0] || isoString.slice(0, 10);
  
  // Step 1: Get file (download or manual)
  let buffer: Buffer;
  let filename: string;
  
  if (manualFile) {
    if (!existsSync(manualFile)) {
      throw new Error(`Manual file not found: ${manualFile}`);
    }
    buffer = readFileSync(manualFile);
    const pathParts = manualFile.split('/');
    filename = pathParts[pathParts.length - 1] || 'manual.xlsx';
    console.log(`📂 Using manual file: ${filename}\n`);
  } else {
    const result = await downloadTariffFile();
    buffer = result.buffer;
    filename = result.filename || `arancel-${snapshotDate}.xlsx`;
  }
  
  // Step 2: Save raw snapshot (audit trail)
  const rawPath = join(RAW_DIR, filename);
  writeFileSync(rawPath, buffer);
  const fileHash = await hashBuffer(buffer);
  console.log(`💾 Raw snapshot saved: ${rawPath}`);
  console.log(`   SHA-256: ${fileHash}\n`);
  
  // Step 3: Parse to structured JSON
  const tariffLines = parseExcel(buffer, snapshotDate);
  
  // Step 4: Build snapshot object
  const snapshot: ArcaSnapshot = {
    snapshot_id: `snap-arca-arancel-${snapshotDate}`,
    source_id: 'ar-arca-arancel-integrado',
    source_url: ARCA_TARIFF_URL,
    captured_at: new Date().toISOString(),
    snapshot_date: snapshotDate,
    file_hash: fileHash,
    tariff_lines_count: tariffLines.length,
    tariff_lines: tariffLines,
    metadata: {
      source_name: 'ARCA Arancel Integrado',
      jurisdiction: 'argentina',
      document_type: 'tariff_schedule',
      official_update_date: null,
    },
  };
  
  // Step 5: Save parsed snapshot
  const parsedFilename = `arancel-${snapshotDate}.json`;
  const parsedPath = join(PARSED_DIR, parsedFilename);
  writeFileSync(parsedPath, JSON.stringify(snapshot, null, 2));
  console.log(`💾 Parsed snapshot saved: ${parsedPath}`);
  console.log(`   Lines: ${tariffLines.length}\n`);
  
  // Step 6: Generate diff with previous snapshot
  const previous = findPreviousSnapshot(snapshotDate);
  const diff = generateDiff(previous, snapshot);
  
  const diffFilename = `diff-${snapshotDate}.json`;
  const diffPath = join(DIFFS_DIR, diffFilename);
  writeFileSync(diffPath, JSON.stringify(diff, null, 2));
  console.log(`💾 Diff saved: ${diffPath}`);
  console.log(`   Added: ${diff.added.length}`);
  console.log(`   Removed: ${diff.removed.length}`);
  console.log(`   Modified: ${diff.modified.length}`);
  console.log(`   Unchanged: ${diff.unchanged_count}\n`);
  
  // Step 7: Print summary
  console.log('✅ Crawler run complete');
  console.log('');
  console.log('Next steps:');
  console.log(`  1. Review parsed data: cat ${parsedPath} | head -100`);
  console.log(`  2. Review diff: cat ${diffPath}`);
  console.log(`  3. Generate evidence packet: pnpm crawler:packet <ncm_code>`);
  console.log(`  4. Run agent: pnpm ai:extract <packet>`);
}

// CLI entry point
const args = process.argv.slice(2);
const manualFlag = args.indexOf('--manual');
const manualFile = manualFlag >= 0 ? (args[manualFlag + 1] ?? undefined) : undefined;

runCrawler(manualFile).catch((err: Error) => {
  console.error('❌ Crawler failed:', err.message);
  process.exit(1);
});

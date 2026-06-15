#!/usr/bin/env tsx
/**
 * InfoLEG Crawler
 * Streams large CSVs, filters for customs-relevant norms, and saves to JSON.
 */

import { createReadStream, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import csvParser from 'csv-parser';
import 'dotenv/config';

const SOURCES_DIR = join(process.cwd(), 'data', 'sources', 'infoleg');
const PARSED_DIR = join(process.cwd(), 'data', 'parsed', 'infoleg');

interface InfoLegNorm {
  id: string;
  tipo_norma: string;
  numero: string;
  fecha: string;
  titulo: string;
  texto: string;
  url: string;
  relevance_reason: string;
}

// Target norms cited in VUCE for mochilas + general customs keywords
const TARGET_NORMS = ['557/2023', '274/2019', '274/19', '237/2024', '1/2024', '313/2025', '428/2025', '163/2005'];
const KEYWORDS = ['arancel', 'ncm', 'aduana', 'importación', 'importacion', 'exportación', 'exportacion', 'comercio exterior', 'sufijo', 'derecho'];

function isRelevant(norm: any): { isRelevant: boolean; reason: string } {
  const text = `${norm.nro_norma || ''} ${norm.titulo_resumido || norm.titulo_sumario || ''}`.toLowerCase();
  
  // 1. Exact match with target norms
  for (const target of TARGET_NORMS) {
    if (text.includes(target.toLowerCase())) {
      return { isRelevant: true, reason: `Target norm: ${target}` };
    }
  }
  
  // 2. Keyword match
  for (const kw of KEYWORDS) {
    if (text.includes(kw)) {
      return { isRelevant: true, reason: `Keyword match: ${kw}` };
    }
  }
  
  return { isRelevant: false, reason: '' };
}

async function processCSV(filePath: string, sourceName: string): Promise<InfoLegNorm[]> {
  return new Promise((resolve, reject) => {
    const results: InfoLegNorm[] = [];
    let totalRows = 0;
    let relevantRows = 0;

    console.log(`📖 Streaming ${sourceName}...`);
    
    createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (row: any) => {
        totalRows++;
        const { isRelevant: rel, reason } = isRelevant(row);
        if (rel) {
          relevantRows++;
          results.push({
            id: row.id_norma || `row-${totalRows}`,
            tipo_norma: row.tipo_norma || 'Desconocido',
            numero: row.nro_norma || 'S/N',
            fecha: row.fecha_boletin || '',
            titulo: row.titulo_resumido || row.titulo_sumario || '',
            texto: (row.texto_completo || '').substring(0, 2000), // Truncate for JSON size
            url: row.url_norma || '',
            relevance_reason: reason
          });
        }
      })
      .on('end', () => {
        console.log(`   ✅ Processed ${totalRows} rows. Found ${relevantRows} relevant norms.`);
        resolve(results);
      })
      .on('error', reject);
  });
}

async function runInfoLegCrawler() {
  if (!existsSync(PARSED_DIR)) mkdirSync(PARSED_DIR, { recursive: true });

  const files = [
    { path: join(SOURCES_DIR, 'infoleg_normativa_nacional_full_2026-06-14.csv'), name: 'Normativa Nacional' },
    { path: join(SOURCES_DIR, 'infoleg_normas_modificadas_full_2026-06-14.csv'), name: 'Normas Modificadas' },
    { path: join(SOURCES_DIR, 'infoleg_normas_modificatorias_full_2026-06-14.csv'), name: 'Normas Modificatorias' }
  ];

  const allRelevantNorms: InfoLegNorm[] = [];

  for (const file of files) {
    if (existsSync(file.path)) {
      const norms = await processCSV(file.path, file.name);
      allRelevantNorms.push(...norms);
    } else {
      console.log(`⚠️  File not found: ${file.path}`);
    }
  }

  // Deduplicate by numero + tipo_norma
  const uniqueNorms = Array.from(
    new Map(allRelevantNorms.map(n => [`${n.tipo_norma}_${n.numero}`, n])).values()
  );

  const snapshot = {
    snapshot_id: `snap-infoleg-customs-${new Date().toISOString().split('T')[0]}`,
    source_id: 'ar-infoleg',
    captured_at: new Date().toISOString(),
    total_rows_processed: 'streamed',
    relevant_norms_count: uniqueNorms.length,
    norms: uniqueNorms
  };

  const outputPath = join(PARSED_DIR, 'customs-relevant-norms.json');
  writeFileSync(outputPath, JSON.stringify(snapshot, null, 2));
  console.log(`💾 Saved ${uniqueNorms.length} unique relevant norms to ${outputPath}`);
}

runInfoLegCrawler().catch(console.error);

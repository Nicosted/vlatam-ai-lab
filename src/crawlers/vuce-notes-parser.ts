#!/usr/bin/env tsx
/**
 * Parses VUCE manual notes to extract structured interventions, norms, and observations.
 * Bypasses PDF extraction entirely for reliability.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';

const SOURCES_DIR = join(process.cwd(), 'data', 'sources', 'vuce');
const PARSED_DIR = join(process.cwd(), 'data', 'parsed', 'vuce');

interface VuceNoteData {
  position: string;
  operation: string;
  origin: string;
  interventions: string[];
  norms_cited: string[];
  tariffs_noted: string[];
  observations: string;
}

const INTERVENTION_KEYWORDS = [
  'intervención',
  'intervencion',
  'organismo',
  'senasa',
  'anmat',
  'requisito',
  'reglamento',
];

function parseNoteFile(content: string, position: string): VuceNoteData {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  const interventions: string[] = [];
  const norms: string[] = [];
  const tariffs: string[] = [];
  let observations = '';
  let operation = 'import';
  let origin = 'China';

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (INTERVENTION_KEYWORDS.some(keyword => lower.includes(keyword))) {
      interventions.push(line);
    } else if (/(decreto|resolución|disposición|ley)\s+\d+[\d\/\.]*/i.test(line)) {
      norms.push(line);
    } else if (/dii|aec|die|estadística|iva|tasa/i.test(line)) {
      tariffs.push(line);
    } else {
      observations += line + ' ';
    }
  }

  // Extract norms via regex as fallback
  const extractedNorms = content.match(/(Decreto|Resolución|Disposición|Ley)\s+(N[º°]?\s*)?\d+[\d\.\/]*/gi) || [];
  const uniqueNorms = [...new Set([...norms, ...extractedNorms])];

  return {
    position,
    operation: content.toLowerCase().includes('export') ? 'export' : 'import',
    origin: 'China', // Default from folder structure
    interventions: interventions.length ? interventions : ['No explicitly listed in notes'],
    norms_cited: uniqueNorms.length ? uniqueNorms : ['Ninguna explícita en notas'],
    tariffs_noted: tariffs.length ? tariffs : ['Verificar en ARCA'],
    observations: observations.trim()
  };
}

async function runVuceNotesParser() {
  if (!existsSync(PARSED_DIR)) mkdirSync(PARSED_DIR, { recursive: true });

  const posDir = join(SOURCES_DIR, '01_consultas_por_posicion');
  if (!existsSync(posDir)) {
    console.error('❌ VUCE positions directory not found');
    return;
  }

  const positions = readdirSync(posDir).filter(d => statSync(join(posDir, d)).isDirectory());
  const parsedNotes: VuceNoteData[] = [];

  for (const pos of positions) {
    const notePath = join(posDir, pos, 'notas_manual.txt');
    if (existsSync(notePath)) {
      const content = readFileSync(notePath, 'utf-8');
      const parsed = parseNoteFile(content, pos.replace('_importacion_china', ''));
      parsedNotes.push(parsed);
      
      const outFile = join(PARSED_DIR, `vuce-notes-${pos.replace(/\//g, '-')}.json`);
      writeFileSync(outFile, JSON.stringify(parsed, null, 2));
      console.log(`✅ Parsed: ${pos} (${parsed.norms_cited.length} norms, ${parsed.interventions.length} interventions)`);
    }
  }

  console.log(`\n💾 Total VUCE positions parsed: ${parsedNotes.length}`);
  console.log('Available at: data/parsed/vuce/vuce-notes-*.json');
}

runVuceNotesParser().catch(console.error);

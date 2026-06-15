#!/usr/bin/env tsx
/**
 * Generates enriched unified evidence packet using ARCA + InfoLEG + VUCE Manual Notes.
 * Usage: pnpm crawler:unified-packet <ncm_code> <product_description>
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';

const ARCA_PARSED = join(process.cwd(), 'data', 'parsed', 'arca');
const INFOLEG_PARSED = join(process.cwd(), 'data', 'parsed', 'infoleg', 'customs-relevant-norms.json');
const VUCE_PARSED = join(process.cwd(), 'data', 'parsed', 'vuce');
const SNAPSHOTS_DIR = join(process.cwd(), 'snapshots', 'pcram');

function getArcaData(ncmCode: string): any {
  const files = readdirSync(ARCA_PARSED).filter(f => f.endsWith('.json')).sort().reverse();
  if (files.length === 0) throw new Error('No ARCA parsed data found');
  const firstFile = files[0];
  if (!firstFile) throw new Error('No ARCA snapshot file found');
  const arca = JSON.parse(readFileSync(join(ARCA_PARSED, firstFile), 'utf-8'));
  const ncmClean = ncmCode.replace(/\./g, '');
  // Try exact match first, then prefix match
  let line = arca.tariff_lines.find((l: any) => l.ncm_code_clean === ncmClean || l.ncm_code === ncmCode);
  if (!line) {
    // Fallback: find by first 6 digits (HS6)
    const hs6 = ncmClean.substring(0, 6);
    line = arca.tariff_lines.find((l: any) => l.ncm_code_clean.startsWith(hs6));
  }
  if (!line) throw new Error(`NCM ${ncmCode} not found in ARCA data`);
  return line;
}

function getInfoLegData(normNumbers: string[]): any[] {
  if (!existsSync(INFOLEG_PARSED)) return [];
  const infoleg = JSON.parse(readFileSync(INFOLEG_PARSED, 'utf-8'));
  const cleanNums = normNumbers.map(n => n.toLowerCase().replace(/\s/g, '').replace('/20', '/'));
  return infoleg.norms.filter((n: any) => 
    cleanNums.some(num => `${n.tipo_norma} ${n.numero}`.toLowerCase().replace(/\s/g, '').includes(num))
  ).slice(0, 3);
}

function getVuceNotes(ncmCode: string): any[] {
  if (!existsSync(VUCE_PARSED)) return [];
  const files = readdirSync(VUCE_PARSED).filter(f => f.startsWith('vuce-notes-') && f.endsWith('.json'));
  const ncmClean = ncmCode.replace(/\./g, '');
  return files
    .map(f => JSON.parse(readFileSync(join(VUCE_PARSED, f), 'utf-8')))
    .filter(n => n.position.replace(/\./g, '').includes(ncmClean) || n.position.startsWith(ncmClean.substring(0, 8)));
}

function generateEnrichedPacket(ncmCode: string, productDesc: string) {
  const arca = getArcaData(ncmCode);
  const vuceNotes = getVuceNotes(ncmCode);
  const today = new Date().toISOString().split('T')[0];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const ncmSlug = ncmCode.replace(/\./g, '-');

  const allNorms = [...new Set(vuceNotes.flatMap((n: any) => n.norms_cited || []))];
  const infolegMatches = getInfoLegData(allNorms);

  const evidenceRefs: any[] = [];

  // 1. ARCA
  evidenceRefs.push({
    source_id: 'ar-arca-arancel-integrado',
    snapshot_id: 'snap-arca-latest',
    section_label: 'Arancel y Tasas',
    article_number: `NCM ${arca.ncm_code}`,
    excerpt: `[ARANCEL OFICIAL - ARCA]\nNCM: ${arca.ncm_code}\nDescripción: ${arca.description}\nAEC: ${arca.aec_rate ?? 'N/A'}%\nDerecho Extra-zona: ${arca.derecho_extra_zona ?? 'N/A'}%\nTasa Estadística: ${arca.tasa_estadistica ?? 'N/A'}%\nIVA: ${arca.iva_rate ?? 'N/A'}%` 
  });

  // 2. VUCE Notes (Interventions & Requirements)
  vuceNotes.forEach((v: any, idx: number) => {
    evidenceRefs.push({
      source_id: 'ar-vuce-civuce',
      snapshot_id: `snap-vuce-notes-${idx}`,
      section_label: 'Intervenciones y Requisitos (Notas Manuales)',
      article_number: v.position,
      excerpt: `[VUCE INTERVENCIONES]\nOrganismos/Requisitos: ${(v.interventions || []).join(' | ')}\nTarifas observadas: ${(v.tariffs_noted || []).join(' | ')}\nNotas: ${(v.observations || '').substring(0, 300)}` 
    });
  });

  // 3. InfoLEG (Legal Text for cited norms)
  infolegMatches.forEach((n: any, idx: number) => {
    evidenceRefs.push({
      source_id: 'ar-infoleg',
      snapshot_id: 'snap-infoleg-latest',
      section_label: `Base Legal - ${n.tipo_norma} ${n.numero}`,
      article_number: n.numero,
      excerpt: `[TEXTO LEGAL - INFOLEG]\n${n.tipo_norma} ${n.numero} (${n.fecha})\nTítulo: ${n.titulo}\nExtracto: ${n.texto.substring(0, 400)}...` 
    });
  });

  const packet = {
    evidence_packet_id: `packet-unified-enriched-${ncmSlug}-${today}`,
    review_manifest_id: `review-manifest-unified-${ncmSlug}-${timestamp}`,
    snapshot_id: `snap-unified-${ncmSlug}-${today}`,
    source_id: 'vlatam-ai-lab-unified',
    evidence_scope: `NCM ${ncmCode} - Análisis aduanero unificado (ARCA + VUCE Notas + InfoLEG)`,
    evidence_refs: evidenceRefs,
    extraction_input_type: 'excerpt_reference',
    extraction_allowed: true,
    extraction_status: 'prepared',
    excerpt_reference: `NCM ${arca.ncm_code} | ${productDesc} | Enriched unified analysis`,
    human_review_required: true,
    downstream_allowed: false,
    schema_version: '1.0.0',
    created_at: new Date().toISOString()
  };

  const outputPath = join(SNAPSHOTS_DIR, `${packet.evidence_packet_id}.json`);
  writeFileSync(outputPath, JSON.stringify(packet, null, 2));
  console.log(`✅ Enriched unified packet generated: ${outputPath}`);
  console.log(`   Evidence refs: ${evidenceRefs.length} (ARCA: 1, VUCE Notes: ${vuceNotes.length}, InfoLEG: ${infolegMatches.length})`);
  return outputPath;
}

const args = process.argv.slice(2);
const ncm = args[0] || '4202.92.00.110V';
const desc = args.slice(1).join(' ') || 'Mochila de campamento con superficie exterior de materia textil, importada desde China';

try {
  const path = generateEnrichedPacket(ncm, desc);
  console.log(`\nNext: pnpm ai:extract ${path}`);
} catch (e: any) {
  console.error('❌ Error:', e.message);
  process.exit(1);
}

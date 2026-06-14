#!/usr/bin/env tsx
/**
 * Generates a comprehensive evidence packet combining ARCA, InfoLEG, and VUCE data.
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
  return infoleg.norms.filter((n: any) => 
    normNumbers.some(num => n.numero.toLowerCase().replace(/\s/g, '').includes(num.toLowerCase().replace(/\s/g, '').replace('/20', '/')))
  ).slice(0, 5); // Limit to top 5 most relevant to avoid context overflow
}

function getVuceData(ncmCode: string): any[] {
  if (!existsSync(VUCE_PARSED)) return [];
  const files = readdirSync(VUCE_PARSED).filter(f => f.endsWith('.json'));
  const vuceData: any[] = [];
  for (const file of files) {
    const data = JSON.parse(readFileSync(join(VUCE_PARSED, file), 'utf-8'));
    if (data.raw_text.toLowerCase().includes(ncmCode.replace(/\./g, ''))) {
      vuceData.push(data);
    }
  }
  return vuceData;
}

function generateUnifiedPacket(ncmCode: string, productDesc: string) {
  const arca = getArcaData(ncmCode);
  const today = new Date().toISOString().split('T')[0];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const ncmSlug = ncmCode.replace(/\./g, '-');

  // Extract norms mentioned in VUCE to cross-reference with InfoLEG
  const vuceData = getVuceData(ncmCode);
  const mentionedNorms = [...new Set(vuceData.flatMap((v: any) => v.norms_mentioned || []))];
  const infolegNorms = getInfoLegData(mentionedNorms);

  // Build evidence refs
  const evidenceRefs: any[] = [];

  // 1. ARCA Ref (Clear and concise)
  evidenceRefs.push({
    source_id: 'ar-arca-arancel-integrado',
    snapshot_id: 'snap-arca-arancel-latest',
    section_label: 'Arancel y Tasas',
    article_number: `NCM ${arca.ncm_code}`,
    excerpt: `[ARANCEL OFICIAL - ARCA]\nNCM: ${arca.ncm_code}\nDescripción: ${arca.description}\nAEC: ${arca.aec_rate ?? 'N/A'}%\nDerecho Extra-zona: ${arca.derecho_extra_zona ?? 'N/A'}%\nTasa Estadística: ${arca.tasa_estadistica ?? 'N/A'}%\nIVA: ${arca.iva_rate ?? 'N/A'}%` 
  });

  // 2. VUCE Refs (Interventions)
  if (vuceData.length > 0) {
    vuceData.forEach((v: any, idx: number) => {
      evidenceRefs.push({
        source_id: 'ar-vuce-civuce',
        snapshot_id: `snap-vuce-${ncmSlug}-${idx}`,
        section_label: 'Intervenciones y Requisitos',
        article_number: ncmCode,
        excerpt: `[REQUISITOS VUCE]\nOrganismos/Intervenciones detectados en texto.\nNormas citadas en VUCE: ${v.norms_mentioned.join(', ') || 'Ninguna explícita'}\nExtracto: ${v.raw_text.substring(0, 400)}...` 
      });
    });
  }

  // 3. InfoLEG Refs (Legal Basis for the norms cited in VUCE or general customs)
  if (infolegNorms.length > 0) {
    infolegNorms.forEach((n: any, idx: number) => {
      evidenceRefs.push({
        source_id: 'ar-infoleg',
        snapshot_id: 'snap-infoleg-customs-latest',
        section_label: 'Base Legal',
        article_number: `${n.tipo_norma} ${n.numero}`,
        excerpt: `[TEXTO LEGAL - INFOLEG]\n${n.tipo_norma} ${n.numero} (${n.fecha})\nTítulo: ${n.titulo}\nExtracto relevante: ${n.texto.substring(0, 350)}...` 
      });
    });
  } else {
    // Fallback: add a general customs norm if no specific match
    evidenceRefs.push({
      source_id: 'ar-infoleg',
      snapshot_id: 'snap-infoleg-customs-latest',
      section_label: 'Base Legal General',
      article_number: 'Decreto 557/2023',
      excerpt: `[INFOLEG]\nDecreto 557/2023: Aprueba la Nomenclatura Común del MERCOSUR (NCM) ajustada a la VII Enmienda del Sistema Armonizado.` 
    });
  }

  const packet = {
    evidence_packet_id: `packet-unified-${ncmSlug}-${today}`,
    review_manifest_id: `review-manifest-unified-${ncmSlug}-${timestamp}`,
    snapshot_id: `snap-unified-${ncmSlug}-${today}`,
    source_id: 'vlatam-ai-lab-unified',
    evidence_scope: `NCM ${ncmCode} - Análisis aduanero unificado (ARCA + VUCE + InfoLEG)`,
    jurisdiction_scope: 'argentina',
    extraction_input_type: 'excerpt_reference',
    extraction_allowed: true,
    extraction_status: 'prepared',
    excerpt_reference: `NCM ${arca.ncm_code} | ${productDesc} | Unified analysis`,
    human_review_required: true,
    downstream_allowed: false,
    schema_version: '1.0.0',
    created_at: new Date().toISOString(),
    evidence_refs: evidenceRefs
  };

  const outputPath = join(SNAPSHOTS_DIR, `${packet.evidence_packet_id}.json`);
  writeFileSync(outputPath, JSON.stringify(packet, null, 2));
  console.log(`✅ Unified packet generated: ${outputPath}`);
  console.log(`   Evidence refs: ${evidenceRefs.length} (ARCA: 1, VUCE: ${vuceData.length}, InfoLEG: ${infolegNorms.length})`);
  return outputPath;
}

const args = process.argv.slice(2);
const ncm = args[0] || '4202.92.00.110V';
const desc = args.slice(1).join(' ') || 'Mochila de campamento';

try {
  const path = generateUnifiedPacket(ncm, desc);
  console.log(`\nNext: pnpm ai:extract ${path}`);
} catch (e: any) {
  console.error('❌ Error:', e.message);
  process.exit(1);
}

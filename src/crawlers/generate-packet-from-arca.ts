#!/usr/bin/env tsx
/**
 * Generate schema-compliant evidence packet from ARCA snapshot
 * 
 * Usage: pnpm crawler:packet <ncm_code> [product_description]
 * Example: pnpm crawler:packet 4202.92.00 "Mochila escolar de poliéster"
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';

const PARSED_DIR = join(process.cwd(), 'data', 'parsed', 'arca');
const SNAPSHOTS_DIR = join(process.cwd(), 'snapshots', 'pcram');

interface TariffLine {
  ncm_code: string;
  ncm_code_clean: string;
  hs6_code: string;
  description: string;
  aec_rate: number | null;
  derecho_extra_zona: number | null;
  tasa_estadistica: number | null;
  iva_rate: number | null;
  ley_iva: string | null;
  source: string;
  source_url: string;
  snapshot_date: string;
}

interface ArcaSnapshot {
  snapshot_id: string;
  source_id: string;
  source_url: string;
  snapshot_date: string;
  tariff_lines: TariffLine[];
}

function findLatestArcaSnapshot(): ArcaSnapshot {
  if (!existsSync(PARSED_DIR)) {
    throw new Error('No ARCA snapshots found. Run: pnpm crawler:arca --manual <file>');
  }
  
  const files = readdirSync(PARSED_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();
  
  if (files.length === 0) {
    throw new Error('No ARCA snapshots found');
  }
  
  const firstFile = files[0];
  if (!firstFile) {
    throw new Error('No ARCA snapshot file found');
  }
  
  return JSON.parse(readFileSync(join(PARSED_DIR, firstFile), 'utf-8'));
}

function findTariffLine(snapshot: ArcaSnapshot, ncmCode: string): TariffLine {
  const ncmClean = ncmCode.replace(/\./g, '');
  const line = snapshot.tariff_lines.find(l => l.ncm_code_clean === ncmClean);
  if (!line) {
    throw new Error(`NCM ${ncmCode} not found in ARCA snapshot`);
  }
  return line;
}

function buildExcerpt(line: TariffLine, snapshotDate: string): string {
  const parts = [
    `[OFFICIAL - ARCA Arancel Integrado - ${snapshotDate}]`,
    `NCM: ${line.ncm_code}`,
    `Descripción: ${line.description}`,
  ];
  
  if (line.aec_rate !== null) parts.push(`AEC: ${line.aec_rate}%`);
  if (line.derecho_extra_zona !== null) parts.push(`Derecho extra-zona: ${line.derecho_extra_zona}%`);
  if (line.tasa_estadistica !== null) parts.push(`Tasa de estadística: ${line.tasa_estadistica}%`);
  if (line.iva_rate !== null) parts.push(`IVA: ${line.iva_rate}% (Ley ${line.ley_iva})`);
  
  parts.push(`Fuente: ${line.source}`);
  parts.push(`URL: ${line.source_url}`);
  parts.push(`Vigencia: desde ${snapshotDate}`);
  
  return parts.join('\n');
}

function generatePacket(ncmCode: string, productDescription: string): any {
  const snapshot = findLatestArcaSnapshot();
  const line = findTariffLine(snapshot, ncmCode);
  
  const today = new Date().toISOString().split('T')[0];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const ncmSlug = ncmCode.replace(/\./g, '-');
  
  const packetId = `evidence-packet-ar-arancel-${ncmSlug}-${today}`;
  
  const excerpt = buildExcerpt(line, snapshot.snapshot_date);
  
  const excerptRef = `NCM ${line.ncm_code} | ${productDescription} | HS6: ${line.hs6_code}`;
  
  // Schema-compliant packet structure
  const packet = {
    // Required IDs
    evidence_packet_id: packetId,
    review_manifest_id: `review-manifest-${ncmSlug}-${timestamp}`,
    snapshot_id: snapshot.snapshot_id,
    source_id: snapshot.source_id,
    
    // Evidence scope (required by schema)
    evidence_scope: `NCM ${ncmCode} - Arancel Integrado ARCA`,
    jurisdiction_scope: 'argentina',
    
    // Extraction control (required by schema)
    extraction_input_type: 'excerpt_reference',
    extraction_allowed: true,
    extraction_status: 'prepared',
    
    // Required reference when extraction_allowed=true
    excerpt_reference: excerptRef,
    
    // Evidence references
    evidence_refs: [
      {
        source_id: snapshot.source_id,
        snapshot_id: snapshot.snapshot_id,
        section_label: `NCM ${line.ncm_code} - Arancel Integrado`,
        article_number: `NCM ${line.ncm_code}`,
        excerpt: excerpt,
      }
    ],
    
    // Governance (forced by schema)
    human_review_required: true,
    downstream_allowed: false,
    
    // Versioning
    schema_version: '1.0.0',
    created_at: new Date().toISOString(),
    
    // Optional metadata for traceability
    metadata: {
      product_description: productDescription,
      candidate_hs6: line.hs6_code,
      candidate_ncm8: ncmCode,
      operation_type: 'import',
      origin_country: 'CN',
      destination_country: 'AR',
      as_of_date: today,
    },
  };
  
  return packet;
}

// CLI entry point
const args = process.argv.slice(2);
const ncmCode = args[0];
const productDescription = args.slice(1).join(' ') || 'Producto sin descripción';

if (!ncmCode) {
  console.error('❌ Usage: pnpm crawler:packet <ncm_code> [product_description]');
  console.error('   Example: pnpm crawler:packet 4202.92.00 "Mochila escolar de poliéster"');
  process.exit(1);
}

try {
  const packet = generatePacket(ncmCode, productDescription);
  const outputPath = join(SNAPSHOTS_DIR, `${packet.evidence_packet_id}.json`);
  writeFileSync(outputPath, JSON.stringify(packet, null, 2));
  
  console.log('✅ Schema-compliant evidence packet generated');
  console.log(`   Packet ID: ${packet.evidence_packet_id}`);
  console.log(`   NCM: ${ncmCode}`);
  console.log(`   HS6: ${packet.candidate_hs6}`);
  console.log(`   Product: ${productDescription}`);
  console.log(`   Snapshot: ${packet.snapshot_id}`);
  console.log(`   Output: ${outputPath}`);
  console.log('');
  console.log('Next: pnpm ai:validate-packet ' + outputPath);
  console.log('Then: pnpm ai:extract ' + outputPath);
} catch (error: any) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

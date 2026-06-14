#!/usr/bin/env tsx
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, fstatSync } from 'fs';
import { join } from 'path';
import { APIError } from 'openai';
import { NormativeEvidenceAgent } from '../src/agents/normative-evidence-agent.js';

interface Packet {
  evidence_packet_id: string;
  evidence_refs?: unknown[];
  [key: string]: unknown;
}

interface Risk {
  type: string;
  severity: string;
  explanation: string;
  evidence_refs: unknown[];
}

interface ExtractionResult {
  extraction_id: string;
  packet_id: string;
  status: string;
  insufficient_evidence?: boolean;
  human_review_required: boolean;
  downstream_allowed: boolean;
  model: string;
  created_at: string;
  risks?: Risk[];
  summary?: string;
  classification_evidence?: unknown[];
  [key: string]: unknown;
}

const SNAPSHOTS_DIR = 'snapshots/pcram';

function printUsage(): void {
  console.log('Usage: run-extraction.ts <evidence-packet-path>');
  console.log('');
  console.log('Example:');
  console.log('  pnpm ai:extract snapshots/pcram/extractable-evidence-packet-ar-demo-polyester-school-backpack.json');
}

function validateEnv(): void {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    console.error('❌ DEEPSEEK_API_KEY missing from .env');
    process.exit(1);
  }
}

function validatePacketPath(path: string): string {
  if (!existsSync(path)) {
    console.error(`❌ File not found: ${path}`);
    process.exit(1);
  }
  return path;
}

function loadPacket(path: string): Packet {
  let content: string;
  try {
    content = readFileSync(path, 'utf-8');
  } catch (err) {
    console.error(`❌ Cannot read file: ${path}`);
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error(`❌ Invalid JSON: ${path}`);
    process.exit(1);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    console.error('❌ Invalid JSON: root must be an object');
    process.exit(1);
  }

  const packet = parsed as Record<string, unknown>;

  if (typeof packet.evidence_packet_id !== 'string') {
    console.error('❌ Missing required field: evidence_packet_id');
    process.exit(1);
  }

  return packet as Packet;
}

function sanitizeFilename(str: string): string {
  return str.replace(/[^a-zA-Z0-9]/g, '-');
}

function printSummary(result: ExtractionResult, outputPath: string): void {
  const risksCount = result.risks?.length ?? 0;
  const evidenceCount = result.classification_evidence?.length ?? 0;

  console.log('');
  console.log('✅ Extraction completed');
  console.log(`   extraction_id:              ${result.extraction_id ?? 'N/A'}`);
  console.log(`   evidence_packet_id:         ${result.evidence_packet_id ?? 'N/A'}`);
  console.log(`   status:                     ${result.status ?? 'N/A'}`);
  console.log(`   insufficient_evidence:      ${result.insufficient_evidence ?? false}`);
  console.log(`   human_review_required:      ${result.human_review_required}`);
  console.log(`   downstream_allowed:         ${result.downstream_allowed}`);
  console.log(`   model:                      ${result.model}`);
  console.log(`   created_at:                 ${result.created_at}`);
  console.log(`   output:                     ${outputPath}`);
  console.log(`   risks:                      ${risksCount}`);
  console.log(`   evidence_refs:              ${evidenceCount}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.length > 1) {
    printUsage();
    process.exit(1);
  }

  const packetPath: string = args[0]!;

  validateEnv();
  validatePacketPath(packetPath);
  const packet = loadPacket(packetPath);

  const agent = new NormativeEvidenceAgent();

  let result: ExtractionResult;
  try {
    const rawResult = await agent.extract(packetPath);
    result = rawResult as ExtractionResult;
  } catch (err) {
    if (err instanceof APIError) {
      const status = err.status ?? 'unknown';
      if (status === 402) {
        console.error('❌ DeepSeek insufficient balance. Top up at https://platform.deepseek.com/billing');
        process.exit(1);
      }
      if (status === 429) {
        console.error('⏳ DeepSeek rate limited. Wait 30 seconds and retry.');
        process.exit(1);
      }
      console.error(`❌ DeepSeek API error: ${status} - ${err.message}`);
      process.exit(1);
    }
    console.error(`❌ Unexpected error: ${(err as Error).message}`);
    process.exit(1);
  }

  const sanitizedId = sanitizeFilename(packet.evidence_packet_id);
  const timestamp = Date.now();
  const filename = `ai-extraction-result-${sanitizedId}-${timestamp}.json`;
  const outputPath = join(SNAPSHOTS_DIR, filename);
  const tmpPath = join(SNAPSHOTS_DIR, `.tmp-${filename}`);

  try {
    const content = JSON.stringify(result, null, 2);
    writeFileSync(tmpPath, content, 'utf-8');
    renameSync(tmpPath, outputPath);
  } catch (err) {
    try {
      if (existsSync(tmpPath)) {
        unlinkSync(tmpPath);
      }
    } catch {
      // ignore cleanup errors
    }
    console.error(`❌ Failed to write output: ${(err as Error).message}`);
    process.exit(1);
  }

  printSummary(result, outputPath);
}

main();

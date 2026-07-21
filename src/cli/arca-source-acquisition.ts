#!/usr/bin/env tsx

import { resolve } from 'node:path';
import {
  acquireSource,
  SourceAcquisitionError,
  type AcquisitionMode,
} from '../acquisition/governed-source-acquisition.js';

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current?.startsWith('--')) continue;
    const key = current.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = 'true';
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`
Governed ARCA source acquisition

Usage:
  pnpm crawler:arca:acquire --url <https-url> [options]

Required:
  --url           Official ARCA/AFIP source URL.

Options:
  --source-id     Stable source identifier (default: ar-arca-arancel-integrado).
  --output        Raw snapshot root (default: data/acquisitions).
  --mode          live or replay (default: live).
  --replay-path   Local fixture required in replay mode.
  --timeout-ms    Request timeout in milliseconds (default: 30000).
  --max-bytes     Maximum accepted body size (default: 52428800).
  --help          Show this message.

Examples:
  pnpm crawler:arca:acquire --url https://www.arca.gob.ar/aduana/arancelintegrado/
  pnpm crawler:arca:acquire --url https://www.arca.gob.ar/aduana/arancelintegrado/ \
    --mode replay --replay-path tests/fixtures/arca/nomenclador.txt
`.trim());
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args['help'] === 'true' || Object.keys(args).length === 0) {
    printHelp();
    process.exit(0);
  }

  const sourceUrl = args['url'];
  if (!sourceUrl) {
    console.error('[arca-acquisition] Missing required argument: --url');
    process.exit(1);
  }

  const modeValue = args['mode'] ?? 'live';
  if (modeValue !== 'live' && modeValue !== 'replay') {
    console.error(`[arca-acquisition] --mode must be live or replay, got: ${modeValue}`);
    process.exit(1);
  }

  const timeoutMs = args['timeout-ms'] ? Number(args['timeout-ms']) : undefined;
  const maxBytes = args['max-bytes'] ? Number(args['max-bytes']) : undefined;
  if (timeoutMs !== undefined && (!Number.isInteger(timeoutMs) || timeoutMs <= 0)) {
    console.error('[arca-acquisition] --timeout-ms must be a positive integer.');
    process.exit(1);
  }
  if (maxBytes !== undefined && (!Number.isInteger(maxBytes) || maxBytes <= 0)) {
    console.error('[arca-acquisition] --max-bytes must be a positive integer.');
    process.exit(1);
  }

  try {
    const record = await acquireSource({
      sourceId: args['source-id'] ?? 'ar-arca-arancel-integrado',
      sourceUrl,
      outputDirectory: resolve(args['output'] ?? 'data/acquisitions'),
      mode: modeValue as AcquisitionMode,
      ...(args['replay-path'] ? { replayPath: resolve(args['replay-path']) } : {}),
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      ...(maxBytes !== undefined ? { maxBytes } : {}),
    });

    console.log('[arca-acquisition] Source captured successfully.');
    console.log(`[arca-acquisition] acquisition_id : ${record.acquisition_id}`);
    console.log(`[arca-acquisition] effective_url  : ${record.effective_url}`);
    console.log(`[arca-acquisition] captured_at   : ${record.captured_at}`);
    console.log(`[arca-acquisition] content_type  : ${record.content_type}`);
    console.log(`[arca-acquisition] content_length: ${record.content_length}`);
    console.log(`[arca-acquisition] sha256        : ${record.sha256}`);
    console.log(`[arca-acquisition] raw_path      : ${record.raw_path}`);
    console.log(`[arca-acquisition] metadata_path : ${record.metadata_path}`);
  } catch (error: unknown) {
    if (error instanceof SourceAcquisitionError) {
      console.error(`[arca-acquisition] Error [${error.code}]: ${error.message}`);
    } else {
      console.error(
        `[arca-acquisition] Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    process.exit(1);
  }
}

await main();

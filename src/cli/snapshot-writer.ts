#!/usr/bin/env tsx
/**
 * Snapshot Writer CLI — PCRAM Chain Step 1/5
 *
 * Usage:
 *   pnpm agents:snapshot-writer --source <source_id> --date <YYYY-MM-DD> --input <path-to-fixture>
 *
 * Options:
 *   --source   Source identifier (e.g. infoleg, arca, vuce)
 *   --date     Snapshot date in YYYY-MM-DD format
 *   --input    Path to the local fixture JSON file (no live network fetches)
 *   --url      Optional: official URL the fixture refers to (not fetched)
 *   --pubdate  Optional: original publication date of the source (YYYY-MM-DD)
 *   --help     Show this help message
 */

import { resolve } from 'node:path';
import { writeSnapshot, SnapshotWriterError } from '../agents/snapshot-writer.js';

// ---------------------------------------------------------------------------
// Native process.argv parser (~15 lines)
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg !== undefined && arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = 'true';
      }
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if ('help' in args || Object.keys(args).length === 0) {
    console.log(`
Snapshot Writer CLI — PCRAM Chain Step 1/5

Usage:
  pnpm agents:snapshot-writer --source <source_id> --date <YYYY-MM-DD> --input <path>

Required:
  --source   Source identifier (e.g. infoleg, arca, vuce)
  --date     Snapshot date in YYYY-MM-DD format
  --input    Path to local fixture JSON file

Optional:
  --url      Canonical official URL the fixture refers to (not fetched at runtime)
  --pubdate  Original publication date of the source material (YYYY-MM-DD)
  --help     Show this message

Example:
  pnpm agents:snapshot-writer --source infoleg --date 2026-06-16 --input data/fixtures/infoleg-sample-ncm.json
`.trim());
    process.exit(0);
  }

  const source = args['source'];
  const date = args['date'];
  const inputPath = args['input'];

  const missing: string[] = [];
  if (!source) missing.push('--source');
  if (!date) missing.push('--date');
  if (!inputPath) missing.push('--input');

  if (missing.length > 0) {
    console.error(`[snapshot-writer] Missing required arguments: ${missing.join(', ')}`);
    console.error('Run with --help for usage.');
    process.exit(1);
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(date!)) {
    console.error(`[snapshot-writer] --date must be in YYYY-MM-DD format, got: ${date}`);
    process.exit(1);
  }

  try {
    const result = await writeSnapshot({
      source_id: source!,
      snapshot_date: date!,
      input_path: inputPath!,
      ...(args['url'] !== undefined && { official_url: args['url'] }),
      ...(args['pubdate'] !== undefined && { publication_date: args['pubdate'] }),
    });

    console.log(`[snapshot-writer] ✓ Snapshot written`);
    console.log(`[snapshot-writer]   source_id    : ${result.artifact.source_id}`);
    console.log(`[snapshot-writer]   snapshot_id  : ${result.artifact.snapshot_id}`);
    console.log(`[snapshot-writer]   content_hash : ${result.artifact.content_hash}`);
    console.log(`[snapshot-writer]   output_path  : ${resolve(result.output_path)}`);
    console.log(`[snapshot-writer]   schema_valid : ${result.schema_valid}`);

    process.exit(0);
  } catch (err: unknown) {
    if (err instanceof SnapshotWriterError) {
      console.error(`[snapshot-writer] Error [${err.code}]: ${err.message}`);
    } else {
      console.error(`[snapshot-writer] Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exit(1);
  }
}

await main();

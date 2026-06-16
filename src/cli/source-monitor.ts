#!/usr/bin/env tsx
/**
 * Source Monitor CLI — PCRAM Chain Step 2/5
 *
 * Usage:
 *   pnpm agents:source-monitor --source <source_id> --from <YYYY-MM-DD> --to <YYYY-MM-DD>
 *
 * Options:
 *   --source      Source identifier (e.g. infoleg, arca)
 *   --from        Date of the older (baseline) snapshot
 *   --to          Date of the newer snapshot
 *   --from-path   Optional: explicit path to from snapshot (overrides convention)
 *   --to-path     Optional: explicit path to to snapshot (overrides convention)
 *   --help        Show this message
 */

import { resolve } from 'node:path';
import { monitorSource, SourceMonitorError } from '../agents/source-monitor.js';

// ---------------------------------------------------------------------------
// Native process.argv parser
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
Source Monitor CLI — PCRAM Chain Step 2/5

Usage:
  pnpm agents:source-monitor --source <source_id> --from <YYYY-MM-DD> --to <YYYY-MM-DD>

Required:
  --source   Source identifier (e.g. infoleg, arca)
  --from     Date of the older (baseline) snapshot in YYYY-MM-DD format
  --to       Date of the newer snapshot in YYYY-MM-DD format

Optional:
  --from-path  Explicit path to from snapshot (overrides data/sources/<source>/<from>.json)
  --to-path    Explicit path to to snapshot (overrides data/sources/<source>/<to>.json)
  --help       Show this message

Example:
  pnpm agents:source-monitor --source infoleg --from 2026-06-10 --to 2026-06-17
`.trim());
    process.exit(0);
  }

  const source = args['source'];
  const fromDate = args['from'];
  const toDate = args['to'];

  const missing: string[] = [];
  if (!source) missing.push('--source');
  if (!fromDate) missing.push('--from');
  if (!toDate) missing.push('--to');

  if (missing.length > 0) {
    console.error(`[source-monitor] Missing required arguments: ${missing.join(', ')}`);
    console.error('Run with --help for usage.');
    process.exit(1);
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(fromDate!)) {
    console.error(`[source-monitor] --from must be YYYY-MM-DD, got: ${fromDate}`);
    process.exit(1);
  }
  if (!datePattern.test(toDate!)) {
    console.error(`[source-monitor] --to must be YYYY-MM-DD, got: ${toDate}`);
    process.exit(1);
  }

  try {
    const result = await monitorSource({
      source_id: source!,
      from_date: fromDate!,
      to_date: toDate!,
      ...(args['from-path'] !== undefined && { from_snapshot_path: args['from-path'] }),
      ...(args['to-path'] !== undefined && { to_snapshot_path: args['to-path'] }),
    });

    const { delta } = result;
    console.log(`[source-monitor] ✓ Delta written`);
    console.log(`[source-monitor]   source_id          : ${delta.source_id}`);
    console.log(`[source-monitor]   from_date          : ${delta.from_date}`);
    console.log(`[source-monitor]   to_date            : ${delta.to_date}`);
    console.log(`[source-monitor]   content_hash_changed: ${delta.content_hash_changed}`);
    console.log(`[source-monitor]   diff_mode          : ${delta.diff_mode}`);
    console.log(`[source-monitor]   changes            : ${delta.summary.total} total`);
    console.log(`[source-monitor]     added   : ${delta.summary.added}`);
    console.log(`[source-monitor]     removed : ${delta.summary.removed}`);
    console.log(`[source-monitor]     modified: ${delta.summary.modified}`);
    console.log(`[source-monitor]   output_path        : ${resolve(result.output_path)}`);
    if (delta.notes.length > 0) {
      console.log(`[source-monitor]   notes:`);
      for (const note of delta.notes) {
        console.log(`[source-monitor]     - ${note}`);
      }
    }

    process.exit(0);
  } catch (err: unknown) {
    if (err instanceof SourceMonitorError) {
      console.error(`[source-monitor] Error [${err.code}]: ${err.message}`);
    } else {
      console.error(`[source-monitor] Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exit(1);
  }
}

await main();

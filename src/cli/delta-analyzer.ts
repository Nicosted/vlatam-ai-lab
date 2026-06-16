#!/usr/bin/env tsx
/**
 * Delta Analyzer CLI — PCRAM Chain Step 3/5
 *
 * Usage:
 *   pnpm agents:delta-analyzer --source <source_id> --from <YYYY-MM-DD> --to <YYYY-MM-DD>
 */

import { analyzeDelta } from '../agents/delta-analyzer.js';

function usage(): string {
  return `
Delta Analyzer CLI — PCRAM Chain Step 3/5

Usage:
  pnpm agents:delta-analyzer --source <source_id> --from <YYYY-MM-DD> --to <YYYY-MM-DD>

Required:
  --source   Source identifier (e.g. infoleg, arca)
  --from     Date of the older delta boundary in YYYY-MM-DD format
  --to       Date of the newer delta boundary in YYYY-MM-DD format
`.trim();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sourceIndex = args.indexOf('--source');
  const fromIndex = args.indexOf('--from');
  const toIndex = args.indexOf('--to');
  const sourceId = sourceIndex >= 0 ? args[sourceIndex + 1] : undefined;
  const fromDate = fromIndex >= 0 ? args[fromIndex + 1] : undefined;
  const toDate = toIndex >= 0 ? args[toIndex + 1] : undefined;

  if (!sourceId || !fromDate || !toDate) {
    console.error(usage());
    process.exit(1);
  }

  try {
    const result = await analyzeDelta({
      source_id: sourceId,
      from_date: fromDate,
      to_date: toDate,
    });

    console.log('[delta-analyzer] ✓ Evidence packet generated');
    console.log(`[delta-analyzer]   source_id    : ${sourceId}`);
    console.log(`[delta-analyzer]   delta        : ${fromDate}_to_${toDate}`);
    console.log(`[delta-analyzer]   total_claims : ${result.packet.summary.total_claims}`);
    console.log(`[delta-analyzer]   by_type      : ${JSON.stringify(result.packet.summary.by_type)}`);
    console.log(`[delta-analyzer]   output_path  : ${result.outputPath}`);
    console.log('[delta-analyzer]   schema_valid : true');
    process.exit(0);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[delta-analyzer] ✗ Error: ${message}`);
    process.exit(1);
  }
}

await main();

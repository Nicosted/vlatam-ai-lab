#!/usr/bin/env tsx
/**
 * Export Contract CLI — PCRAM post-review boundary
 */

import path from 'node:path';
import {
  exportApprovedArtifact,
  getExportArtifactRelativePath,
  type ExportContractInput,
} from '../agents/export-contract.js';
import { validateExportArtifact } from '../contracts/vlatam-global-bridge.js';

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

function usage(): string {
  return `
Export Contract CLI — PCRAM post-review boundary

Usage:
  pnpm agents:export-contract --source <source_id> --artifact <artifact_id>

Required:
  --source      Source identifier (e.g. infoleg)
  --artifact    Artifact identifier (artifact--<source>--<id>)
`.trim();
}

function sanitizeMessage(message: string): string {
  const cwd = process.cwd();
  return message.split(cwd).join('.').replaceAll(path.sep + path.sep, path.sep);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if ('help' in args || Object.keys(args).length === 0) {
    console.log(usage());
    process.exit(0);
  }

  const sourceId = args['source'];
  const artifactId = args['artifact'];
  const missing: string[] = [];
  if (!sourceId) missing.push('--source');
  if (!artifactId) missing.push('--artifact');

  if (missing.length > 0) {
    console.error(`[export-contract] ✗ Error: Missing required arguments: ${missing.join(', ')}`);
    console.error('Run with --help for usage.');
    process.exit(1);
  }

  const input: ExportContractInput = {
    source_id: sourceId!,
    artifact_id: artifactId!,
  };

  try {
    const artifact = await exportApprovedArtifact(input);
    const validationResult = validateExportArtifact(artifact);
    const outputPath = getExportArtifactRelativePath(input);

    console.log('[export-contract] ✓ Export artifact generated');
    console.log(`[export-contract]   source_id           : ${artifact.source_id}`);
    console.log(`[export-contract]   artifact_id         : ${artifact.artifact_id}`);
    console.log(`[export-contract]   export_id           : ${artifact.export_id}`);
    console.log(`[export-contract]   output_path         : ${outputPath}`);
    console.log(`[export-contract]   schema_valid        : ${validationResult.ok}`);
    process.exit(0);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[export-contract] ✗ Error: ${sanitizeMessage(message)}`);
    process.exit(1);
  }
}

await main();

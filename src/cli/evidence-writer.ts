#!/usr/bin/env tsx
/**
 * Evidence Writer CLI — PCRAM Chain Step 4/5
 *
 * Usage:
 *   pnpm agents:evidence-writer --source <source_id> --extraction-result <extraction_result_id>
 */

import {
  getEvidenceArtifactRelativePath,
  writeEvidenceArtifact,
} from '../agents/evidence-writer.js';

const SOURCE_ID_REGEX = /^[a-z0-9_-]+$/;
const EXTRACTION_RESULT_ID_REGEX = /^[a-z0-9_-]+$/;

function usage(): string {
  return `
Evidence Writer CLI — PCRAM Chain Step 4/5

Usage:
  pnpm agents:evidence-writer --source <source_id> --extraction-result <extraction_result_id>

Required:
  --source              Source identifier (e.g. infoleg, arca)
  --extraction-result   Extraction result identifier (e.g. extraction-001)
`.trim();
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sourceIndex = args.indexOf('--source');
  const extractionResultIndex = args.indexOf('--extraction-result');
  const sourceId = sourceIndex >= 0 ? args[sourceIndex + 1] : undefined;
  const extractionResultId = extractionResultIndex >= 0 ? args[extractionResultIndex + 1] : undefined;

  if (!sourceId || !extractionResultId) {
    console.error(usage());
    process.exit(1);
  }

  if (!SOURCE_ID_REGEX.test(sourceId)) {
    console.error(`[evidence-writer] ✗ Error: Invalid source_id: ${sourceId}`);
    process.exit(1);
  }
  if (!EXTRACTION_RESULT_ID_REGEX.test(extractionResultId)) {
    console.error(`[evidence-writer] ✗ Error: Invalid extraction_result_id: ${extractionResultId}`);
    process.exit(1);
  }

  try {
    const input = {
      source_id: sourceId,
      extraction_result_id: extractionResultId,
    };
    const artifact = await writeEvidenceArtifact(input);

    console.log('[evidence-writer] ✓ Intelligence artifact generated');
    console.log(`[evidence-writer]   source_id           : ${sourceId}`);
    console.log(`[evidence-writer]   extraction_result   : ${extractionResultId}`);
    console.log(`[evidence-writer]   artifact_id         : ${artifact.artifact_id}`);
    console.log(`[evidence-writer]   output_path         : ${getEvidenceArtifactRelativePath(input)}`);
    console.log('[evidence-writer]   schema_valid        : true');
    console.log('[evidence-writer]   governance          : review-only');
    process.exit(0);
  } catch (error: unknown) {
    console.error(`[evidence-writer] ✗ Error: ${getErrorMessage(error)}`);
    process.exit(1);
  }
}

await main();

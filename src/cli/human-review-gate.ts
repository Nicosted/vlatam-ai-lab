#!/usr/bin/env tsx
/**
 * Human Review Gate CLI — PCRAM Chain Step 5/5
 */

import path from 'node:path';
import {
  applyHumanReview,
  type HumanReviewInput,
  type ReviewDecision,
} from '../agents/human-review-gate.js';

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
Human Review Gate CLI — PCRAM Chain Step 5/5

Usage:
  pnpm agents:human-review --source <source_id> --artifact <artifact_id> --decision <approve|reject> --reviewer <reviewer> --reviewed-at <ISO-8601> [--approval-ref <ref>] [--eligibility-reason <reason>]

Required:
  --source              Source identifier (e.g. infoleg)
  --artifact            Artifact identifier (artifact--<source>--<id>)
  --decision            approve, approved, reject, or rejected
  --reviewer            Reviewer identifier
  --reviewed-at         Explicit ISO 8601 review timestamp

Approval-only:
  --approval-ref        Classifier approval reference
  --eligibility-reason  Downstream eligibility reason
`.trim();
}

function normalizeDecision(value: string | undefined): ReviewDecision | undefined {
  if (value === 'approve' || value === 'approved') return 'approved';
  if (value === 'reject' || value === 'rejected') return 'rejected';
  return undefined;
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
  const decision = normalizeDecision(args['decision']);
  const reviewer = args['reviewer'];
  const reviewedAt = args['reviewed-at'];

  const missing: string[] = [];
  if (!sourceId) missing.push('--source');
  if (!artifactId) missing.push('--artifact');
  if (!args['decision']) missing.push('--decision');
  if (!reviewer) missing.push('--reviewer');
  if (!reviewedAt) missing.push('--reviewed-at');

  if (missing.length > 0) {
    console.error(`[human-review] ✗ Error: Missing required arguments: ${missing.join(', ')}`);
    console.error('Run with --help for usage.');
    process.exit(1);
  }

  if (decision === undefined) {
    console.error(`[human-review] ✗ Error: Invalid decision: ${args['decision']}`);
    process.exit(1);
  }

  const input: HumanReviewInput = {
    source_id: sourceId!,
    artifact_id: artifactId!,
    decision,
    reviewer: reviewer!,
    reviewed_at: reviewedAt!,
    ...(args['approval-ref'] !== undefined && {
      classifier_approval_reference: args['approval-ref'],
    }),
    ...(args['eligibility-reason'] !== undefined && {
      downstream_eligibility_reason: args['eligibility-reason'],
    }),
  };

  try {
    const artifact = await applyHumanReview(input);
    const outputPath = path.join('data', 'intelligence', input.source_id, `${input.artifact_id}.json`);

    console.log('[human-review] ✓ Artifact review applied');
    console.log(`[human-review]   source_id           : ${input.source_id}`);
    console.log(`[human-review]   artifact_id         : ${artifact.artifact_id}`);
    console.log(`[human-review]   decision            : ${input.decision}`);
    console.log(`[human-review]   review_status       : ${artifact.review_status}`);
    console.log(`[human-review]   reviewer            : ${artifact.reviewer}`);
    console.log(`[human-review]   downstream_allowed  : ${artifact.governance.downstream_allowed}`);
    console.log(`[human-review]   output_path         : ${outputPath}`);
    process.exit(0);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[human-review] ✗ Error: ${sanitizeMessage(message)}`);
    process.exit(1);
  }
}

await main();

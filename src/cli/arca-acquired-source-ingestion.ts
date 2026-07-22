#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  GovernedArcaIngestionError,
  ingestGovernedArcaAcquiredSource,
} from "../ingestion/governed-arca-acquired-source.js";

interface CliArguments {
  contractPath: string;
  acquisitionRoot: string;
  candidateRoot: string;
}

function usage(): string {
  return `Usage:
  pnpm crawler:arca:ingest-acquired -- \\
    --contract <governed-input.json> \\
    --acquisition-root <governed-acquisition-root> \\
    --candidate-root <candidate-output-root>

This local replay command accepts a governed acquisition identity contract.
It does not accept source URLs, prompts, live acquisition, or arbitrary raw files.`;
}

export function parseArguments(args: string[]): CliArguments {
  const values = new Map<string, string>();
  const allowed = new Set([
    "--contract",
    "--acquisition-root",
    "--candidate-root",
  ]);

  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key || !allowed.has(key) || !value || value.startsWith("--")) {
      throw new Error(usage());
    }
    if (values.has(key)) throw new Error(`Duplicate argument: ${key}`);
    values.set(key, value);
  }

  const contractPath = values.get("--contract");
  const acquisitionRoot = values.get("--acquisition-root");
  const candidateRoot = values.get("--candidate-root");
  if (!contractPath || !acquisitionRoot || !candidateRoot) {
    throw new Error(usage());
  }
  return { contractPath, acquisitionRoot, candidateRoot };
}

export async function runCli(args: string[]): Promise<string> {
  const parsed = parseArguments(args);
  const contract = JSON.parse(
    await readFile(resolve(parsed.contractPath), "utf8"),
  ) as unknown;
  const result = await ingestGovernedArcaAcquiredSource(contract, {
    acquisitionRoot: resolve(parsed.acquisitionRoot),
    candidateRoot: resolve(parsed.candidateRoot),
  });
  return result.candidatePath;
}

const isEntrypoint = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (isEntrypoint) {
  runCli(process.argv.slice(2))
    .then((candidatePath) => {
      process.stdout.write(`${candidatePath}\n`);
    })
    .catch((error: unknown) => {
      if (error instanceof GovernedArcaIngestionError) {
        process.stderr.write(`${error.code}: ${error.message}\n`);
      } else {
        process.stderr.write(
          `${error instanceof Error ? error.message : String(error)}\n`,
        );
      }
      process.exitCode = 1;
    });
}

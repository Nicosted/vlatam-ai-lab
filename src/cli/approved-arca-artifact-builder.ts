#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildApprovedArcaArtifact,
  type ApprovedArcaBuildResult,
} from "../artifacts/approved-arca-artifact-builder.js";

interface CliArguments {
  readonly candidatePath: string;
  readonly reviewPath: string;
  readonly evaluationPath: string;
  readonly approvedArtifactRoot: string;
  readonly builderIdentity: string;
  readonly buildTimestamp: string;
}

function usage(): string {
  return `Usage:
  pnpm arca:build-approved -- \\
    --candidate <governed-candidate.json> \\
    --review <governed-review.json> \\
    --evaluation <governed-evaluation.json> \\
    --approved-artifact-root <local-output-root> \\
    --builder-identity <human:stable-id|service:approved-arca-builder@1.0.0> \\
    --build-timestamp <canonical-utc-timestamp>

This local deterministic command accepts only governed identity-bound contracts.
It has no URL, prompt, credential, network, publication, export, or production flag.`;
}

export function parseArguments(args: string[]): CliArguments {
  const allowed = new Set([
    "--candidate",
    "--review",
    "--evaluation",
    "--approved-artifact-root",
    "--builder-identity",
    "--build-timestamp",
  ]);
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key || !allowed.has(key) || !value || value.startsWith("--"))
      throw new Error(usage());
    if (values.has(key)) throw new Error(`Duplicate argument: ${key}`);
    values.set(key, value);
  }
  const candidatePath = values.get("--candidate");
  const reviewPath = values.get("--review");
  const evaluationPath = values.get("--evaluation");
  const approvedArtifactRoot = values.get("--approved-artifact-root");
  const builderIdentity = values.get("--builder-identity");
  const buildTimestamp = values.get("--build-timestamp");
  if (
    !candidatePath ||
    !reviewPath ||
    !evaluationPath ||
    !approvedArtifactRoot ||
    !builderIdentity ||
    !buildTimestamp
  )
    throw new Error(usage());
  for (const path of [
    candidatePath,
    reviewPath,
    evaluationPath,
    approvedArtifactRoot,
  ]) {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path))
      throw new Error("URLs are not accepted by the local builder.");
  }
  return {
    candidatePath,
    reviewPath,
    evaluationPath,
    approvedArtifactRoot,
    builderIdentity,
    buildTimestamp,
  };
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(path), "utf8")) as unknown;
}

export async function runCli(args: string[]): Promise<ApprovedArcaBuildResult> {
  const parsed = parseArguments(args);
  return buildApprovedArcaArtifact(
    {
      candidate: await readJson(parsed.candidatePath),
      review: await readJson(parsed.reviewPath),
      evaluation: await readJson(parsed.evaluationPath),
      builderIdentity: parsed.builderIdentity,
      buildTimestamp: parsed.buildTimestamp,
    },
    { approvedArtifactRoot: resolve(parsed.approvedArtifactRoot) },
  );
}

const isEntrypoint = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (isEntrypoint) {
  runCli(process.argv.slice(2))
    .then((buildResult) => {
      process.stdout.write(`${JSON.stringify(buildResult, null, 2)}\n`);
      if (buildResult.outcome !== "approved_artifact_built")
        process.exitCode = 1;
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    });
}

#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  executeGovernedArcaExport,
  preflightGovernedArcaExport,
  recoverGovernedArcaExport,
  type ArcaExportRootConfiguration,
} from "../export/governed-arca-export.js";

const ALLOWED = new Set([
  "--proposal",
  "--authorization",
  "--kill-switch",
  "--configuration",
  "--execution-timestamp",
  "--recover-journal",
  "--preflight",
  "--help",
]);

export function parseGovernedArcaExportArguments(
  argv: readonly string[],
): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current?.startsWith("--") || !ALLOWED.has(current))
      throw new Error(`unsupported_argument:${current ?? "<missing>"}`);
    if (current === "--preflight" || current === "--help") {
      parsed[current.slice(2)] = "true";
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--"))
      throw new Error(`missing_value:${current}`);
    parsed[current.slice(2)] = value;
    index += 1;
  }
  return parsed;
}

function help(): string {
  return [
    "Governed one-shot ARCA local export",
    "",
    "Usage:",
    "  pnpm arca:governed-export --proposal <json> --authorization <json> --kill-switch <json> --configuration <json> --execution-timestamp <ISO> --preflight",
    "  pnpm arca:governed-export --recover-journal <id> --kill-switch <json> --configuration <json> --execution-timestamp <ISO>",
    "",
    "Preflight performs zero writes, zero authorization consumption, and zero network calls.",
    "Execution remains blocked by the repository-current dedicated export kill switch.",
  ].join("\n");
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(path), "utf8")) as unknown;
}

async function main(): Promise<void> {
  let args: Record<string, string>;
  try {
    args = parseGovernedArcaExportArguments(process.argv.slice(2));
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : "invalid_arguments");
    process.exitCode = 1;
    return;
  }
  if (args["help"] === "true" || Object.keys(args).length === 0) {
    console.log(help());
    return;
  }
  const recovering = typeof args["recover-journal"] === "string";
  const required = recovering
    ? ["recover-journal", "kill-switch", "configuration", "execution-timestamp"]
    : [
        "proposal",
        "authorization",
        "kill-switch",
        "configuration",
        "execution-timestamp",
      ];
  const missing = required.filter((key) => !args[key]);
  if (missing.length) {
    console.error(`missing_required_arguments:${missing.join(",")}`);
    process.exitCode = 1;
    return;
  }
  try {
    const [killSwitch, configuration] = await Promise.all([
      readJson(args["kill-switch"]!),
      readJson(args["configuration"]!),
    ]);
    if (recovering) {
      const result = await recoverGovernedArcaExport({
        configuration,
        journalId: args["recover-journal"]!,
        killSwitch,
        killSwitchPath: resolve(args["kill-switch"]!),
        recoveryTimestamp: args["execution-timestamp"]!,
      });
      console.log(JSON.stringify(result, null, 2));
      if (result.outcome !== "completed") process.exitCode = 1;
      return;
    }
    const [proposal, authorization] = await Promise.all([
      readJson(args["proposal"]!),
      readJson(args["authorization"]!),
    ]);
    const common = {
      proposal,
      authorization,
      killSwitch,
      configuration: configuration as ArcaExportRootConfiguration,
      executionTimestamp: args["execution-timestamp"]!,
    };
    const result =
      args["preflight"] === "true"
        ? await preflightGovernedArcaExport(common)
        : await executeGovernedArcaExport({
            ...common,
            killSwitchPath: resolve(args["kill-switch"]!),
          });
    console.log(JSON.stringify(result, null, 2));
    if (result.outcome !== "package_exported" && result.outcome !== "completed")
      process.exitCode = 1;
  } catch (error: unknown) {
    console.error(
      `governed_arca_export_failed:${error instanceof Error ? error.message : "unknown"}`,
    );
    process.exitCode = 1;
  }
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : "";
if (
  invoked.endsWith("governed-arca-export.ts") ||
  invoked.endsWith("governed-arca-export.js")
)
  await main();

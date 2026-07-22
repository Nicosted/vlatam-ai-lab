#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  executeControlledLiveArcaRun,
  preflightControlledLiveArcaRun,
  type ControlledLiveRunRootConfiguration,
} from "../live-run/controlled-live-arca-run.js";

const ALLOWED_ARGUMENTS = new Set([
  "--proposal",
  "--authorization",
  "--kill-switch",
  "--configuration",
  "--execution-timestamp",
  "--run-id",
  "--preflight",
  "--help",
]);

export function parseControlledLiveRunArguments(
  argv: readonly string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current?.startsWith("--") || !ALLOWED_ARGUMENTS.has(current))
      throw new Error(`unsupported_argument:${current ?? "<missing>"}`);
    if (current === "--preflight" || current === "--help") {
      result[current.slice(2)] = "true";
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--"))
      throw new Error(`missing_value:${current}`);
    result[current.slice(2)] = next;
    index += 1;
  }
  return result;
}

function help(): string {
  return [
    "Controlled one-shot ARCA live acquisition",
    "",
    "Usage:",
    "  pnpm arca:controlled-live-run --proposal <json> --authorization <json> --kill-switch <json> --configuration <json> --execution-timestamp <ISO> --run-id <id> --preflight",
    "",
    "Preflight performs zero writes, zero authorization consumption, and zero network calls.",
    "Omit --preflight only for a separately reviewed one-shot operation after merge.",
  ].join("\n");
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(path), "utf8")) as unknown;
}

async function main(): Promise<void> {
  let args: Record<string, string>;
  try {
    args = parseControlledLiveRunArguments(process.argv.slice(2));
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : "invalid_arguments");
    process.exitCode = 1;
    return;
  }
  if (args["help"] === "true" || Object.keys(args).length === 0) {
    console.log(help());
    return;
  }
  const required = [
    "proposal",
    "authorization",
    "kill-switch",
    "configuration",
    "execution-timestamp",
    "run-id",
  ];
  const missing = required.filter((key) => !args[key]);
  if (missing.length) {
    console.error(`missing_required_arguments:${missing.join(",")}`);
    process.exitCode = 1;
    return;
  }
  try {
    const [proposal, authorization, killSwitch, configuration] =
      await Promise.all([
        readJson(args["proposal"]!),
        readJson(args["authorization"]!),
        readJson(args["kill-switch"]!),
        readJson(args["configuration"]!),
      ]);
    const common = {
      runId: args["run-id"]!,
      proposal,
      authorization,
      killSwitch,
      configuration: configuration as ControlledLiveRunRootConfiguration,
      executionTimestamp: args["execution-timestamp"]!,
    };
    const result =
      args["preflight"] === "true"
        ? await preflightControlledLiveArcaRun(common)
        : await executeControlledLiveArcaRun({
            ...common,
            killSwitchPath: resolve(args["kill-switch"]!),
          });
    console.log(JSON.stringify(result, null, 2));
    if (result.lifecycle !== "authorized" && result.outcome !== "completed")
      process.exitCode = 1;
  } catch (error: unknown) {
    console.error(
      `controlled_live_run_failed:${error instanceof Error ? error.message : "unknown"}`,
    );
    process.exitCode = 1;
  }
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : "";
if (
  invoked.endsWith("controlled-live-arca-run.ts") ||
  invoked.endsWith("controlled-live-arca-run.js")
)
  await main();

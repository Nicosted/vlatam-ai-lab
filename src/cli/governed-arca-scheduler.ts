#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  executeGovernedArcaExport,
  preflightGovernedArcaExport,
  type ArcaExportExecutionInput,
} from "../export/governed-arca-export.js";
import {
  executeControlledLiveArcaRun,
  preflightControlledLiveArcaRun,
  type ControlledLiveRunExecutionInput,
} from "../live-run/controlled-live-arca-run.js";
import {
  generateSchedulerPilotSummary,
  inspectSchedulerRecovery,
  observeGovernedArcaScheduler,
  runGovernedArcaSchedulerOnce,
  type SchedulerActivation,
  type SchedulerConfiguration,
  type SchedulerKillSwitch,
  type SchedulerObservationInput,
} from "../scheduler/governed-arca-scheduler.js";

const COMMANDS = new Set(["observe", "run-once", "recover", "pilot-summary"]);
const ALLOWED_ARGUMENTS = new Set(["--input", "--help"]);

export function parseGovernedSchedulerArguments(argv: readonly string[]): {
  readonly command: string | null;
  readonly input: string | null;
  readonly help: boolean;
} {
  const command = argv[0] && !argv[0].startsWith("--") ? argv[0] : null;
  const start = command ? 1 : 0;
  if (command && !COMMANDS.has(command))
    throw new Error(`unsupported_command:${command}`);
  let input: string | null = null;
  let help = false;
  for (let index = start; index < argv.length; index += 1) {
    const current = argv[index]!;
    if (!ALLOWED_ARGUMENTS.has(current))
      throw new Error(`unsupported_argument:${current}`);
    if (current === "--help") {
      help = true;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--"))
      throw new Error(`missing_value:${current}`);
    input = next;
    index += 1;
  }
  return { command, input, help };
}

function help(): string {
  return [
    "Governed ARCA scheduler (no daemon and no automatic activation)",
    "",
    "Usage:",
    "  pnpm arca:governed-scheduler observe --input <json>",
    "  pnpm arca:governed-scheduler run-once --input <json>",
    "  pnpm arca:governed-scheduler recover --input <json>",
    "  pnpm arca:governed-scheduler pilot-summary --input <json>",
    "",
    "observe performs local filesystem observation only and never invokes a boundary.",
    "run-once requires exact scheduler, AI-131 and AI-132 reviewed artifacts.",
    "recover emits a decision only; it never retries, regenerates authority or deletes a lease.",
  ].join("\n");
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  const value = JSON.parse(await readFile(resolve(path), "utf8")) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("input_must_be_json_object");
  return value as Record<string, unknown>;
}

function objectAt(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const nested = value[key];
  if (!nested || typeof nested !== "object" || Array.isArray(nested))
    throw new Error(`missing_or_invalid_object:${key}`);
  return nested as Record<string, unknown>;
}

async function runOnce(bundle: Record<string, unknown>): Promise<unknown> {
  const ai131 = objectAt(bundle, "ai_131");
  const ai132 = objectAt(bundle, "ai_132");
  const ai131Input = objectAt(
    ai131,
    "input",
  ) as unknown as ControlledLiveRunExecutionInput;
  const ai132Input = objectAt(
    ai132,
    "input",
  ) as unknown as ArcaExportExecutionInput;
  return runGovernedArcaSchedulerOnce({
    configuration: objectAt(
      bundle,
      "configuration",
    ) as unknown as SchedulerConfiguration,
    activation: objectAt(
      bundle,
      "activation",
    ) as unknown as SchedulerActivation,
    killSwitch: objectAt(
      bundle,
      "scheduler_kill_switch",
    ) as unknown as SchedulerKillSwitch,
    request: objectAt(bundle, "request"),
    runId: String(bundle["run_id"] ?? ""),
    ownerId: String(bundle["owner_id"] ?? ""),
    processIdentity: String(bundle["process_identity"] ?? ""),
    timestamp: String(bundle["timestamp"] ?? ""),
    observation: objectAt(bundle, "observation") as unknown as Omit<
      SchedulerObservationInput,
      "persist"
    >,
    acquisitionBoundary: {
      preflight: async () => {
        const result = await preflightControlledLiveArcaRun(ai131Input);
        return {
          authorized: result.lifecycle === "authorized",
          evidenceSha256: null,
        };
      },
      execute: async () => {
        const result = await executeControlledLiveArcaRun(ai131Input);
        return {
          outcome:
            result.outcome === "completed"
              ? "verified"
              : result.outcome === "recovery_required"
                ? "unknown"
                : "blocked",
          authorizationConsumed: result.authorization_consumed,
          evidenceSha256: null,
        };
      },
    },
    exportBoundary: {
      preflight: async () => {
        const result = await preflightGovernedArcaExport(ai132Input);
        return {
          authorized: result.outcome === "package_exported",
          evidenceSha256: result.package_sha256,
        };
      },
      execute: async () => {
        const result = await executeGovernedArcaExport(ai132Input);
        return {
          outcome: result.outcome === "completed" ? "verified" : "blocked",
          authorizationConsumed: result.authorization_consumed,
          evidenceSha256: result.package_sha256,
        };
      },
    },
  });
}

async function main(): Promise<void> {
  try {
    const args = parseGovernedSchedulerArguments(process.argv.slice(2));
    if (args.help || !args.command) {
      console.log(help());
      return;
    }
    if (!args.input) throw new Error("missing_required_argument:--input");
    const bundle = await readJson(args.input);
    let output: unknown;
    if (args.command === "observe")
      output = await observeGovernedArcaScheduler(
        bundle as unknown as SchedulerObservationInput,
      );
    else if (args.command === "run-once") output = await runOnce(bundle);
    else if (args.command === "recover")
      output = inspectSchedulerRecovery({
        lease: objectAt(bundle, "lease") as never,
        journal: bundle["journal"] ?? null,
        timestamp: String(bundle["timestamp"] ?? ""),
      });
    else
      output = await generateSchedulerPilotSummary({
        configuration: objectAt(
          bundle,
          "configuration",
        ) as unknown as SchedulerConfiguration,
        activation: objectAt(
          bundle,
          "activation",
        ) as unknown as SchedulerActivation,
        timestamp: String(bundle["timestamp"] ?? ""),
      });
    console.log(JSON.stringify(output, null, 2));
  } catch (error: unknown) {
    console.error(
      `governed_scheduler_failed:${error instanceof Error ? error.message : "unknown"}`,
    );
    process.exitCode = 1;
  }
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : "";
if (
  invoked.endsWith("governed-arca-scheduler.ts") ||
  invoked.endsWith("governed-arca-scheduler.js")
)
  await main();

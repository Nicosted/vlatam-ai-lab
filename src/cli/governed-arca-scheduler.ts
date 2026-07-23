#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

import {
  executeGovernedArcaExport,
  inspectGovernedArcaExportRecovery,
  preflightGovernedArcaExport,
  type ArcaExportExecutionInput,
} from "../export/governed-arca-export.js";
import {
  executeControlledLiveArcaRun,
  inspectControlledLiveRunRecovery,
  preflightControlledLiveArcaRun,
  type ControlledLiveRunExecutionInput,
} from "../live-run/controlled-live-arca-run.js";
import {
  generateSchedulerPilotSummary,
  inspectSchedulerRecovery,
  loadExactRequestBoundArtifact,
  observeGovernedArcaScheduler,
  runGovernedArcaSchedulerOnce,
  canonicalizeSchedulerJson,
  type ScheduledRunRequest,
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

export async function runGovernedSchedulerBundleOnce(
  bundle: Record<string, unknown>,
): Promise<unknown> {
  if ("ai_131" in bundle || "ai_132" in bundle)
    throw new Error("nested_boundary_input_rejected");
  const configuration = objectAt(
    bundle,
    "configuration",
  ) as unknown as SchedulerConfiguration;
  const request = objectAt(bundle, "request") as unknown as ScheduledRunRequest;
  const [ai131Configuration, ai131Proposal, ai131Authorization, ai131Switch] =
    await Promise.all([
      loadExactRequestBoundArtifact(request.ai_131.configuration),
      loadExactRequestBoundArtifact(request.ai_131.proposal),
      loadExactRequestBoundArtifact(request.ai_131.authorization),
      loadExactRequestBoundArtifact(request.ai_131.kill_switch),
    ]);
  const [ai132Configuration, ai132Proposal, ai132Authorization, ai132Switch] =
    await Promise.all([
      loadExactRequestBoundArtifact(request.ai_132.configuration),
      loadExactRequestBoundArtifact(request.ai_132.proposal),
      loadExactRequestBoundArtifact(request.ai_132.authorization),
      loadExactRequestBoundArtifact(request.ai_132.kill_switch),
    ]);
  const boundaryRunId = String(bundle["ai_131_run_id"] ?? "");
  const assertPath = (
    actual: string,
    expected: string,
    reason: string,
  ): void => {
    if (resolve(actual) !== resolve(expected)) throw new Error(reason);
  };
  const ai131StateRoot = String(
    (ai131Configuration["run_state"] as Record<string, unknown> | undefined)?.[
      "path"
    ] ?? "",
  );
  const ai131AuthorizationId = String(
    ai131Authorization["authorization_id"] ?? "",
  );
  assertPath(
    join(ai131StateRoot, "consumptions", `${ai131AuthorizationId}.json`),
    request.ai_131.expected_consumption.path,
    "ai_131_consumption_path_substituted",
  );
  assertPath(
    join(ai131StateRoot, "journals", `${boundaryRunId}.json`),
    request.ai_131.authoritative_journal.path,
    "ai_131_journal_path_substituted",
  );
  assertPath(
    join(ai131StateRoot, "records", `${boundaryRunId}.json`),
    request.ai_131.durable_result.path,
    "ai_131_result_path_substituted",
  );
  const ai131AcquisitionRoot = String(
    (
      ai131Configuration["acquisition_output"] as
        | Record<string, unknown>
        | undefined
    )?.["path"] ?? "",
  );
  const ai131CandidateRoot = String(
    (
      ai131Configuration["candidate_output"] as
        | Record<string, unknown>
        | undefined
    )?.["path"] ?? "",
  );
  if (
    !resolve(request.ai_131.primary_evidence.path).startsWith(
      `${resolve(ai131AcquisitionRoot)}${sep}`,
    )
  )
    throw new Error("ai_131_acquisition_evidence_root_substituted");
  if (
    !resolve(request.ai_131.secondary_evidence.path).startsWith(
      `${resolve(ai131CandidateRoot)}${sep}`,
    )
  )
    throw new Error("ai_131_candidate_evidence_root_substituted");
  const ai132StateRoot = String(
    (
      ai132Configuration["export_state_root"] as
        | Record<string, unknown>
        | undefined
    )?.["path"] ?? "",
  );
  const ai132ExportRoot = String(
    (
      ai132Configuration["export_root"] as Record<string, unknown> | undefined
    )?.["path"] ?? "",
  );
  const ai132AuthorizationId = String(
    ai132Authorization["authorization_id"] ?? "",
  );
  assertPath(
    join(ai132StateRoot, "consumptions", `${ai132AuthorizationId}.json`),
    request.ai_132.expected_consumption.path,
    "ai_132_consumption_path_substituted",
  );
  assertPath(
    join(
      ai132StateRoot,
      "journals",
      `${request.ai_132.authoritative_journal.identity}.json`,
    ),
    request.ai_132.authoritative_journal.path,
    "ai_132_journal_path_substituted",
  );
  assertPath(
    join(
      ai132StateRoot,
      "records",
      `${request.ai_132.durable_result.identity}.json`,
    ),
    request.ai_132.durable_result.path,
    "ai_132_record_path_substituted",
  );
  assertPath(
    join(
      ai132ExportRoot,
      "packages",
      `${request.ai_132.primary_evidence.identity}.json`,
    ),
    request.ai_132.primary_evidence.path,
    "ai_132_package_path_substituted",
  );
  const ai131Input = {
    runId: boundaryRunId,
    proposal: ai131Proposal,
    authorization: ai131Authorization,
    killSwitch: ai131Switch,
    configuration: ai131Configuration,
    executionTimestamp: String(bundle["timestamp"] ?? ""),
    killSwitchPath: request.ai_131.kill_switch.path,
  } as unknown as ControlledLiveRunExecutionInput;
  const ai132Input = {
    proposal: ai132Proposal,
    authorization: ai132Authorization,
    killSwitch: ai132Switch,
    configuration: ai132Configuration,
    executionTimestamp: String(bundle["timestamp"] ?? ""),
    killSwitchPath: request.ai_132.kill_switch.path,
  } as unknown as ArcaExportExecutionInput;
  const hashResult = (value: unknown): string =>
    createHash("sha256")
      .update(`${canonicalizeSchedulerJson(value)}\n`)
      .digest("hex");
  return runGovernedArcaSchedulerOnce({
    configuration,
    activation: objectAt(
      bundle,
      "activation",
    ) as unknown as SchedulerActivation,
    killSwitch: objectAt(
      bundle,
      "scheduler_kill_switch",
    ) as unknown as SchedulerKillSwitch,
    request,
    runId: String(bundle["run_id"] ?? ""),
    ownerId: String(bundle["owner_id"] ?? ""),
    processIdentity: String(bundle["process_identity"] ?? ""),
    timestamp: String(bundle["timestamp"] ?? ""),
    observation: objectAt(bundle, "observation") as unknown as Omit<
      SchedulerObservationInput,
      "persist"
    >,
    acquisitionBoundary: {
      preflight: async (trustedTimestamp) => {
        const exact = { ...ai131Input, executionTimestamp: trustedTimestamp };
        const result = await preflightControlledLiveArcaRun(exact);
        return {
          authorized: result.lifecycle === "authorized",
          evidenceSha256: hashResult(result),
        };
      },
      execute: async (trustedTimestamp) => {
        const result = await executeControlledLiveArcaRun({
          ...ai131Input,
          executionTimestamp: trustedTimestamp,
        });
        if (result.authorization_consumed)
          await loadExactRequestBoundArtifact(
            request.ai_131.expected_consumption,
          );
        return {
          outcome:
            result.outcome === "completed"
              ? "verified"
              : result.outcome === "recovery_required"
                ? "unknown"
                : "blocked",
          authorizationConsumed: result.authorization_consumed,
          evidenceSha256: hashResult(result),
          ...(result.authorization_consumed
            ? {
                authoritativeConsumptionEvidence:
                  request.ai_131.expected_consumption,
              }
            : {}),
        };
      },
    },
    exportBoundary: {
      preflight: async (trustedTimestamp) => {
        const result = await preflightGovernedArcaExport({
          ...ai132Input,
          executionTimestamp: trustedTimestamp,
        });
        return {
          authorized: result.outcome === "package_exported",
          evidenceSha256: hashResult(result),
        };
      },
      execute: async (trustedTimestamp) => {
        const result = await executeGovernedArcaExport({
          ...ai132Input,
          executionTimestamp: trustedTimestamp,
        });
        if (result.authorization_consumed)
          await loadExactRequestBoundArtifact(
            request.ai_132.expected_consumption,
          );
        return {
          outcome: result.outcome === "completed" ? "verified" : "blocked",
          authorizationConsumed: result.authorization_consumed,
          evidenceSha256: hashResult(result),
          ...(result.authorization_consumed
            ? {
                authoritativeConsumptionEvidence:
                  request.ai_132.expected_consumption,
              }
            : {}),
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
    else if (args.command === "run-once")
      output = await runGovernedSchedulerBundleOnce(bundle);
    else if (args.command === "recover") {
      const configuration = objectAt(
        bundle,
        "configuration",
      ) as unknown as SchedulerConfiguration;
      const request = objectAt(
        bundle,
        "request",
      ) as unknown as ScheduledRunRequest;
      const ai131Configuration = await loadExactRequestBoundArtifact(
        request.ai_131.configuration,
      );
      const ai132Configuration = await loadExactRequestBoundArtifact(
        request.ai_132.configuration,
      );
      output = await inspectSchedulerRecovery({
        configuration,
        lease: objectAt(bundle, "lease") as never,
        journal: bundle["journal"] ?? null,
        timestamp: String(bundle["timestamp"] ?? ""),
        inspectAi131: async () => {
          const stateRoot = String(
            (
              ai131Configuration["run_state"] as
                | Record<string, unknown>
                | undefined
            )?.["path"] ?? "",
          );
          if (
            resolve(
              join(
                stateRoot,
                "journals",
                `${request.ai_131.authoritative_journal.identity}.json`,
              ),
            ) !== resolve(request.ai_131.authoritative_journal.path)
          )
            throw new Error("ai_131_recovery_journal_path_substituted");
          const result = await inspectControlledLiveRunRecovery(
            stateRoot,
            request.ai_131.authoritative_journal.identity,
            String(bundle["timestamp"] ?? ""),
          );
          const detail = result.details.join(":");
          return {
            status:
              result.outcome === "completed"
                ? "consumed_completed"
                : result.outcome === "network_call_not_performed" &&
                    detail.includes("safe_to_abort")
                  ? "not_consumed"
                  : detail.includes("delivery_unknown")
                    ? "unknown_delivery"
                    : detail.includes("hash_invalid")
                      ? "divergent_evidence"
                      : "consumed_recovery_required",
            evidence: request.ai_131.expected_consumption,
          };
        },
        inspectAi132: async () => {
          const exportStateRoot = String(
            (
              ai132Configuration["export_state_root"] as
                | Record<string, unknown>
                | undefined
            )?.["path"] ?? "",
          );
          if (
            resolve(
              join(
                exportStateRoot,
                "journals",
                `${request.ai_132.authoritative_journal.identity}.json`,
              ),
            ) !== resolve(request.ai_132.authoritative_journal.path)
          )
            throw new Error("ai_132_recovery_journal_path_substituted");
          const result = await inspectGovernedArcaExportRecovery({
            configuration: ai132Configuration,
            journalId: request.ai_132.authoritative_journal.identity,
            killSwitch: await loadExactRequestBoundArtifact(
              request.ai_132.kill_switch,
            ),
            killSwitchPath: request.ai_132.kill_switch.path,
            recoveryTimestamp: String(bundle["timestamp"] ?? ""),
          });
          const detail = result.details.join(":");
          return {
            status:
              result.outcome === "completed"
                ? "consumed_completed"
                : detail.includes("non_consumption_proven")
                  ? "not_consumed"
                  : detail.includes("divergent") ||
                      detail.includes("substituted")
                    ? "divergent_evidence"
                    : result.authorization_consumed
                      ? "consumed_recovery_required"
                      : "unknown_delivery",
            evidence: request.ai_132.expected_consumption,
          };
        },
      });
    } else
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

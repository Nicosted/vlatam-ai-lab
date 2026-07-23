#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

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
  loadDurableSchedulerRecoveryEvidence,
  loadExactRequestBoundArtifact,
  observeGovernedArcaScheduler,
  runGovernedArcaSchedulerOnce,
  canonicalizeSchedulerJson,
  resolveReviewedRecoveryEnvironment,
  type ScheduledRunRequest,
  type SchedulerActivation,
  type SchedulerConfiguration,
  type SchedulerDurableRecoveryInput,
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

export async function observeGovernedSchedulerBundle(
  bundle: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const reported = bundle as unknown as SchedulerObservationInput;
  return observeGovernedArcaScheduler({
    ...reported,
    ai131: {
      ...reported.ai131,
      authorizationAvailable: false,
      recoveryState: "unknown",
      authoritative: false,
    },
    ai132: {
      ...reported.ai132,
      authorizationAvailable: false,
      recoveryState: "unknown",
      authoritative: false,
    },
    ai130Authoritative: false,
  });
}

export function assertDurableRecoveryBundle(
  bundle: Record<string, unknown>,
): asserts bundle is Record<string, unknown> {
  if (
    "lease" in bundle ||
    "journal" in bundle ||
    "configuration" in bundle ||
    "state_root" in bundle ||
    "lease_path" in bundle ||
    "journal_path" in bundle ||
    "request_path" in bundle ||
    typeof bundle["environment_id"] !== "string"
  )
    throw new Error("caller_supplied_recovery_evidence_rejected");
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
  const environment = resolveReviewedRecoveryEnvironment(
    String(bundle["environment_id"] ?? ""),
  );
  const pinnedConfiguration = JSON.parse(
    await readFile(environment.scheduler_configuration_path, "utf8"),
  ) as unknown;
  if (
    canonicalizeSchedulerJson(configuration) !==
      canonicalizeSchedulerJson(pinnedConfiguration) ||
    request.ai_131.configuration.path !==
      environment.ai_131_configuration_path ||
    request.ai_131.kill_switch.path !== environment.ai_131_switch_path ||
    request.ai_132.configuration.path !==
      environment.ai_132_configuration_path ||
    request.ai_132.kill_switch.path !== environment.ai_132_switch_path
  )
    throw new Error("reviewed_environment_trust_anchor_substituted");
  const load = (
    binding: ScheduledRunRequest["ai_131"]["configuration"],
    identityField: string,
    sha256Field: string,
  ) =>
    loadExactRequestBoundArtifact(
      binding,
      binding.path === environment.ai_131_configuration_path
        ? dirname(environment.ai_131_configuration_path)
        : binding.path === environment.ai_132_configuration_path
          ? dirname(environment.ai_132_configuration_path)
          : binding.path === environment.ai_131_switch_path
            ? dirname(environment.ai_131_switch_path)
            : binding.path === environment.ai_132_switch_path
              ? dirname(environment.ai_132_switch_path)
              : dirname(binding.path),
      {
        identityField,
        sha256Field,
      },
    );
  const [ai131Configuration, ai131Proposal, ai131Authorization, ai131Switch] =
    await Promise.all([
      load(
        request.ai_131.configuration,
        "configuration_id",
        "configuration_sha256",
      ),
      load(request.ai_131.proposal, "proposal_id", "proposal_sha256"),
      load(
        request.ai_131.authorization,
        "authorization_id",
        "authorization_sha256",
      ),
      load(request.ai_131.kill_switch, "kill_switch_id", "kill_switch_sha256"),
    ]);
  const [ai132Configuration, ai132Proposal, ai132Authorization, ai132Switch] =
    await Promise.all([
      load(
        request.ai_132.configuration,
        "configuration_id",
        "configuration_sha256",
      ),
      load(request.ai_132.proposal, "proposal_id", "proposal_sha256"),
      load(
        request.ai_132.authorization,
        "authorization_id",
        "authorization_sha256",
      ),
      load(request.ai_132.kill_switch, "kill_switch_id", "kill_switch_sha256"),
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
  if (
    resolve(ai131StateRoot) !== environment.ai_131_state_root ||
    resolve(
      String(
        (
          ai131Configuration["acquisition_output"] as
            | Record<string, unknown>
            | undefined
        )?.["path"] ?? "",
      ),
    ) !== environment.ai_131_acquisition_root ||
    resolve(
      String(
        (
          ai131Configuration["candidate_output"] as
            | Record<string, unknown>
            | undefined
        )?.["path"] ?? "",
      ),
    ) !== environment.ai_131_candidate_root
  )
    throw new Error("ai_131_reviewed_environment_root_substituted");
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
  if (
    resolve(ai132StateRoot) !== environment.ai_132_state_root ||
    resolve(ai132ExportRoot) !== environment.ai_132_export_root ||
    resolve(request.ai_132.recovery_root.path) !==
      environment.ai_132_recovery_root
  )
    throw new Error("ai_132_reviewed_environment_root_substituted");
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
  const inspectAi131 = async (trustedTimestamp: string) => {
    const result = await inspectControlledLiveRunRecovery(
      ai131StateRoot,
      boundaryRunId,
      trustedTimestamp,
    );
    const detail = result.details.join(":");
    return {
      status:
        result.outcome === "completed"
          ? ("consumed_completed" as const)
          : result.outcome === "network_call_not_performed" &&
              detail.includes("safe_to_abort")
            ? ("positively_not_consumed" as const)
            : detail.includes("not_authorized")
              ? ("not_authorized" as const)
              : detail.includes("delivery_unknown")
                ? ("unknown_delivery" as const)
                : detail.includes("hash_invalid") ||
                    detail.includes("divergent") ||
                    detail.includes("substituted")
                  ? ("divergent_evidence" as const)
                  : detail.includes("malformed")
                    ? ("malformed_evidence" as const)
                    : ("consumed_recovery_required" as const),
      evidence:
        result.authorization_consumed === true
          ? request.ai_131.expected_consumption
          : null,
      reason: detail || result.outcome,
    };
  };
  const inspectAi132 = async (trustedTimestamp: string) => {
    const result = await inspectGovernedArcaExportRecovery({
      configuration: ai132Configuration,
      journalId: request.ai_132.authoritative_journal.identity,
      killSwitch: ai132Switch,
      killSwitchPath: request.ai_132.kill_switch.path,
      recoveryTimestamp: trustedTimestamp,
    });
    const detail = result.details.join(":");
    return {
      status:
        result.outcome === "completed"
          ? ("consumed_completed" as const)
          : detail.includes("non_consumption_proven")
            ? ("positively_not_consumed" as const)
            : detail.includes("not_authorized")
              ? ("not_authorized" as const)
              : detail.includes("divergent") || detail.includes("substituted")
                ? ("divergent_evidence" as const)
                : detail.includes("malformed")
                  ? ("malformed_evidence" as const)
                  : result.authorization_consumed
                    ? ("consumed_recovery_required" as const)
                    : ("unknown_delivery" as const),
      evidence: result.authorization_consumed
        ? request.ai_132.expected_consumption
        : null,
      reason: detail || result.outcome,
    };
  };
  return runGovernedArcaSchedulerOnce({
    configuration,
    reviewedEnvironment: environment,
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
    inspectAi131,
    inspectAi132,
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
          await load(
            request.ai_131.expected_consumption,
            "consumption_id",
            "consumption_sha256",
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
          await load(
            request.ai_132.expected_consumption,
            "consumption_id",
            "consumption_sha256",
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
      output = await observeGovernedSchedulerBundle(bundle);
    else if (args.command === "run-once")
      output = await runGovernedSchedulerBundleOnce(bundle);
    else if (args.command === "recover") {
      assertDurableRecoveryBundle(bundle);
      const recoveryInput = bundle as unknown as SchedulerDurableRecoveryInput;
      const environment = resolveReviewedRecoveryEnvironment(
        recoveryInput.environment_id,
      );
      const durable = await loadDurableSchedulerRecoveryEvidence(recoveryInput);
      const configuration = durable.configuration;
      const request = durable.request;
      const ai131Configuration = await loadExactRequestBoundArtifact(
        request.ai_131.configuration,
        dirname(environment.ai_131_configuration_path),
        {
          identityField: "configuration_id",
          sha256Field: "configuration_sha256",
        },
      );
      const ai132Configuration = await loadExactRequestBoundArtifact(
        request.ai_132.configuration,
        dirname(environment.ai_132_configuration_path),
        {
          identityField: "configuration_id",
          sha256Field: "configuration_sha256",
        },
      );
      output = await inspectSchedulerRecovery({
        configuration,
        lease: durable.lease,
        journal: durable.journal,
        timestamp: recoveryInput.timestamp,
        attemptLedgerManifest: durable.attemptLedgerManifest,
        attemptReservations: durable.reservations,
        schedulerResultPresent: durable.resultPresent,
        recoveryResultPresent: durable.recoveryResultPresent,
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
            recoveryInput.timestamp,
          );
          const detail = result.details.join(":");
          return {
            status:
              result.outcome === "completed"
                ? "consumed_completed"
                : result.outcome === "network_call_not_performed" &&
                    detail.includes("safe_to_abort")
                  ? "positively_not_consumed"
                  : detail.includes("not_authorized")
                    ? "not_authorized"
                    : detail.includes("delivery_unknown")
                      ? "unknown_delivery"
                      : detail.includes("hash_invalid")
                        ? "divergent_evidence"
                        : detail.includes("malformed")
                          ? "malformed_evidence"
                          : "consumed_recovery_required",
            evidence:
              result.authorization_consumed === true
                ? request.ai_131.expected_consumption
                : null,
            reason: detail || result.outcome,
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
              dirname(request.ai_132.kill_switch.path),
              {
                identityField: "kill_switch_id",
                sha256Field: "kill_switch_sha256",
              },
            ),
            killSwitchPath: request.ai_132.kill_switch.path,
            recoveryTimestamp: recoveryInput.timestamp,
          });
          const detail = result.details.join(":");
          return {
            status:
              result.outcome === "completed"
                ? "consumed_completed"
                : detail.includes("non_consumption_proven")
                  ? "positively_not_consumed"
                  : detail.includes("not_authorized")
                    ? "not_authorized"
                    : detail.includes("divergent") ||
                        detail.includes("substituted")
                      ? "divergent_evidence"
                      : detail.includes("malformed")
                        ? "malformed_evidence"
                        : result.authorization_consumed
                          ? "consumed_recovery_required"
                          : "unknown_delivery",
            evidence: result.authorization_consumed
              ? request.ai_132.expected_consumption
              : null,
            reason: detail || result.outcome,
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

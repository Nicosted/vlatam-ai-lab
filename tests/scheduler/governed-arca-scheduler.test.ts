import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  MAXIMUM_ACTIVATION_MILLISECONDS,
  acceptSchedulerSlot,
  acquireSchedulerLease,
  advanceSchedulerAttempt,
  canonicalizeSchedulerJson,
  computeEligibleSlotId,
  computeScheduledRunRequestSha256,
  computeSchedulerActivationSha256,
  computeSchedulerConfigurationSha256,
  computeSchedulerJournalSha256,
  computeSchedulerKillSwitchSha256,
  generateSchedulerPilotSummary,
  heartbeatSchedulerLease,
  inspectSchedulerRecovery,
  loadExactRequestBoundArtifact,
  observeGovernedArcaScheduler,
  reserveSchedulerAttempt,
  runGovernedArcaSchedulerOnce,
  schedulerActivationStatus,
  schedulerContractSchemas,
  schedulerLeasePath,
  schedulerSchemaHashes,
  validateSchedulerConfiguration,
  validateSchedulerContract,
  type ExactArtifactBinding,
  type ScheduledRunRequest,
  type SchedulerActivation,
  type SchedulerAttemptReservation,
  type SchedulerBoundaryEvidenceBinding,
  type SchedulerConfiguration,
  type SchedulerKillSwitch,
  type SchedulerLease,
  type SchedulerRunJournal,
} from "../../src/scheduler/governed-arca-scheduler.js";

const NOW = "2026-07-23T12:00:00.000Z";
const LATER = "2026-07-23T12:20:00.000Z";
const HASH = "a".repeat(64);
const FALSE_AUTHORITIES = {
  acquisition_authority_created: false,
  export_authority_created: false,
  import_authorized: false,
  publication_authorized: false,
  deployment_authorized: false,
  database_write_authorized: false,
  production_reliance_authorized: false,
  downstream_scheduling_authorized: false,
  vlatam_global_access_authorized: false,
} as const;

function canonicalBytes(value: unknown): string {
  return `${canonicalizeSchedulerJson(value)}\n`;
}

function bytesHash(value: unknown): string {
  return createHash("sha256").update(canonicalBytes(value)).digest("hex");
}

async function exactArtifact(
  root: string,
  name: string,
  identityKey: string,
  identity: string,
): Promise<ExactArtifactBinding> {
  const shaKey = identityKey.replace(/_id$/, "_sha256");
  const value = {
    schema_version: "1.0.0",
    [identityKey]: identity,
    [shaKey]: HASH,
  };
  const path = join(root, `${name}.json`);
  await mkdir(root, { recursive: true });
  await writeFile(path, canonicalBytes(value));
  return {
    path,
    identity,
    sha256: HASH,
    canonical_sha256: bytesHash(value),
  };
}

async function boundary(
  root: string,
  name: "ai-131" | "ai-132",
): Promise<SchedulerBoundaryEvidenceBinding> {
  const configuration = await exactArtifact(
    root,
    `${name}-configuration`,
    "configuration_id",
    `${name}-configuration`,
  );
  const proposal = await exactArtifact(
    root,
    `${name}-proposal`,
    "proposal_id",
    `${name}-proposal`,
  );
  const authorization = await exactArtifact(
    root,
    `${name}-authorization`,
    "authorization_id",
    `${name}-authorization`,
  );
  const consumption = await exactArtifact(
    root,
    `${name}-consumption`,
    "consumption_id",
    `${name}-consumption`,
  );
  const killSwitch = await exactArtifact(
    root,
    `${name}-kill-switch`,
    "kill_switch_id",
    `${name}-kill-switch`,
  );
  return {
    configuration,
    proposal,
    authorization,
    expected_consumption: consumption,
    authoritative_journal: {
      path: join(root, `${name}-journal.json`),
      identity: `${name}-journal`,
    },
    durable_result: {
      path: join(root, `${name}-result.json`),
      identity: `${name}-result`,
      sha256: HASH,
      canonical_sha256: HASH,
    },
    primary_evidence: {
      path: join(root, `${name}-primary.json`),
      identity: `${name}-primary`,
      sha256: HASH,
      canonical_sha256: HASH,
    },
    secondary_evidence: {
      path: join(root, `${name}-secondary.json`),
      identity: `${name}-secondary`,
      sha256: HASH,
      canonical_sha256: HASH,
    },
    kill_switch: killSwitch,
    recovery_root: {
      path: join(root, `${name}-recovery`),
      identity: `${name}-recovery`,
    },
  };
}

interface Fixture {
  readonly root: string;
  readonly configuration: SchedulerConfiguration;
  readonly activation: SchedulerActivation;
  readonly killSwitch: SchedulerKillSwitch;
  readonly request: ScheduledRunRequest;
}

async function fixture(
  options: {
    dailyCap?: number;
    activationCap?: number;
    scheduledFor?: string;
  } = {},
): Promise<Fixture> {
  const root = await mkdtemp(
    join(await realpath(tmpdir()), "ai-133-hardening-"),
  );
  const ai131 = await boundary(root, "ai-131");
  const ai132 = await boundary(root, "ai-132");
  const unsignedSwitch: SchedulerKillSwitch = {
    schema_version: "1.0.0",
    kill_switch_id: "governed-arca-scheduler",
    kill_switch_sha256: "0".repeat(64),
    state: "disabled",
    observation_blocked: false,
    execution_blocked: false,
    reviewed_artifact_id: "reviewed-switch",
    reviewed_by: "human:reviewer",
    reviewed_at: "2026-07-23T00:00:00.000Z",
    reason: "synthetic test",
  };
  const killSwitch = {
    ...unsignedSwitch,
    kill_switch_sha256: computeSchedulerKillSwitchSha256(unsignedSwitch),
  };
  const switchPath = join(root, "scheduler-kill-switch.json");
  await writeFile(switchPath, canonicalBytes(killSwitch));
  const unsignedConfiguration: SchedulerConfiguration = {
    schema_version: "1.0.0",
    configuration_id: "synthetic-scheduler",
    configuration_sha256: "0".repeat(64),
    scheduler_identity: "service:governed-arca-scheduler@1.0.0",
    active: true,
    schedule_mode: "authorized_one_shot",
    observation_interval_seconds: 3600,
    allowed_utc_operating_windows: [
      { starts_at_utc: "00:00", ends_at_utc: "23:59" },
    ],
    maximum_run_duration_seconds: 900,
    lease_duration_seconds: 300,
    heartbeat_interval_seconds: 10,
    stale_lease_recovery_threshold_seconds: 900,
    maximum_observations_per_24_hours: 24,
    maximum_runs_per_24_hours: options.dailyCap ?? 4,
    kill_switch_path: switchPath,
    kill_switch_reviewed_sha256: killSwitch.kill_switch_sha256,
    kill_switch_canonical_sha256: bytesHash(killSwitch),
    state_root: { identity: "synthetic-state", path: join(root, "state") },
    observation_root: {
      identity: "synthetic-observations",
      path: join(root, "observations"),
    },
    ai_131: {
      configuration_id: ai131.configuration.identity,
      configuration_sha256: ai131.configuration.sha256,
      kill_switch_path: ai131.kill_switch.path,
      kill_switch_reviewed_sha256: ai131.kill_switch.sha256,
      kill_switch_canonical_sha256: ai131.kill_switch.canonical_sha256,
    },
    ai_132: {
      configuration_id: ai132.configuration.identity,
      configuration_sha256: ai132.configuration.sha256,
      kill_switch_path: ai132.kill_switch.path,
      kill_switch_reviewed_sha256: ai132.kill_switch.sha256,
      kill_switch_canonical_sha256: ai132.kill_switch.canonical_sha256,
    },
    durable_ai_130_store: {
      identity: "service:durable-arca-review-store@1.0.0",
      configuration_sha256: "5".repeat(64),
      root_path: join(root, "store"),
    },
    automatic_retries: false,
    ...FALSE_AUTHORITIES,
  };
  const configuration = {
    ...unsignedConfiguration,
    configuration_sha256: computeSchedulerConfigurationSha256(
      unsignedConfiguration,
    ),
  };
  const unsignedActivation: SchedulerActivation = {
    schema_version: "1.0.0",
    activation_id: "synthetic-activation",
    activation_sha256: "0".repeat(64),
    scheduler_configuration_id: configuration.configuration_id,
    scheduler_configuration_sha256: configuration.configuration_sha256,
    starts_at: "2026-07-23T00:00:00.000Z",
    expires_at: "2026-07-26T00:00:00.000Z",
    maximum_scheduler_observations: 72,
    maximum_authorized_execution_attempts: options.activationCap ?? 4,
    approver_identity: "human:approver",
    reviewer_identity: "human:reviewer",
    separation_of_duties: true,
    reason: "synthetic test",
    rollback_owner_identity: "human:rollback",
    self_renewal_authorized: false,
    ...FALSE_AUTHORITIES,
  };
  const activation = {
    ...unsignedActivation,
    activation_sha256: computeSchedulerActivationSha256(unsignedActivation),
  };
  const scheduledFor = options.scheduledFor ?? NOW;
  const unsignedRequest = {
    schema_version: "1.0.0" as const,
    request_id: `request-${scheduledFor.slice(11, 13)}`,
    request_sha256: "0".repeat(64),
    configuration_id: configuration.configuration_id,
    configuration_sha256: configuration.configuration_sha256,
    activation_id: activation.activation_id,
    activation_sha256: activation.activation_sha256,
    mode: "run_once" as const,
    scheduled_for: scheduledFor,
    created_at: NOW,
    created_by: "human:operator",
    eligible_slot_id: computeEligibleSlotId({
      configurationSha256: configuration.configuration_sha256,
      activationSha256: activation.activation_sha256,
      observationIntervalSeconds: configuration.observation_interval_seconds,
      scheduledFor,
    }),
    ai_131: ai131,
    ai_132: ai132,
    ...FALSE_AUTHORITIES,
  };
  const request = {
    ...unsignedRequest,
    request_sha256: computeScheduledRunRequestSha256(unsignedRequest),
  };
  return { root, configuration, activation, killSwitch, request };
}

function observation(value: Fixture) {
  return {
    configuration: value.configuration,
    activation: value.activation,
    killSwitch: value.killSwitch,
    timestamp: NOW,
    ai131: {
      readiness: "ready" as const,
      authorizationAvailable: true,
      recoveryState: "clear" as const,
      authoritative: true,
    },
    ai132: {
      readiness: "ready" as const,
      authorizationAvailable: true,
      recoveryState: "clear" as const,
      authoritative: true,
    },
    ai130IntegrityStatus: "verified" as const,
    ai130Authoritative: true,
  };
}

async function expiredLease(value: Fixture): Promise<SchedulerLease> {
  const acquired = await acquireSchedulerLease({
    configuration: value.configuration,
    activation: value.activation,
    ownerId: "owner",
    processIdentity: "process",
    timestamp: NOW,
  });
  assert.equal(acquired.status, "acquired");
  return acquired.lease!;
}

function recoveryJournal(
  value: Fixture,
  lease: SchedulerLease,
  state:
    | "lease_acquired"
    | "acquisition_execution_started"
    | "export_execution_started",
): SchedulerRunJournal {
  const unsigned: SchedulerRunJournal = {
    schema_version: "1.0.0",
    journal_id: "scheduler-journal",
    journal_sha256: "0".repeat(64),
    run_id: "scheduler-run",
    request_id: value.request.request_id,
    request_sha256: value.request.request_sha256,
    configuration_sha256: value.configuration.configuration_sha256,
    activation_sha256: value.activation.activation_sha256,
    lease_sha256: lease.lease_sha256,
    entries: [
      {
        sequence: 0,
        state,
        timestamp: NOW,
        evidence_sha256: state === "lease_acquired" ? lease.lease_sha256 : HASH,
      },
    ],
    ai_131_evidence: value.request.ai_131,
    ai_132_evidence: value.request.ai_132,
    authority_outcome:
      state === "lease_acquired" ? "not_started" : "authority_outcome_unknown",
    ...FALSE_AUTHORITIES,
  };
  return {
    ...unsigned,
    journal_sha256: computeSchedulerJournalSha256(unsigned),
  };
}

async function reserve(
  value: Fixture,
  boundaryType: "ai_131" | "ai_132",
): Promise<SchedulerAttemptReservation> {
  return reserveSchedulerAttempt({
    configuration: value.configuration,
    activation: value.activation,
    request: value.request,
    boundaryType,
    reservedAt: NOW,
  });
}

test("all eleven AI-133 contracts are closed Draft 2020-12 schemas", async () => {
  const hashes = schedulerSchemaHashes();
  assert.equal(Object.keys(hashes).length, 11);
  for (const hash of Object.values(hashes))
    assert.match(hash, /^[a-f0-9]{64}$/);
  const files = {
    configuration: "arca-scheduler-configuration.schema.json",
    activation: "arca-scheduler-activation.schema.json",
    run_request: "arca-scheduled-run-request.schema.json",
    lease: "arca-scheduler-lease.schema.json",
    run_journal: "arca-scheduler-run-journal.schema.json",
    run_result: "arca-scheduler-run-result.schema.json",
    observation: "arca-scheduler-observation.schema.json",
    recovery_decision: "arca-scheduler-recovery-decision.schema.json",
    kill_switch: "arca-scheduler-kill-switch.schema.json",
    attempt_ledger: "arca-scheduler-attempt-ledger.schema.json",
    slot_acceptance: "arca-scheduler-slot-acceptance.schema.json",
  } as const;
  for (const [name, schema] of Object.entries(schedulerContractSchemas())) {
    const checkedIn = JSON.parse(
      await readFile(
        join("schemas", files[name as keyof typeof files]),
        "utf8",
      ),
    );
    assert.equal(
      canonicalizeSchedulerJson(checkedIn),
      canonicalizeSchedulerJson(schema),
      name,
    );
    assert.equal(checkedIn["additionalProperties"], false, name);
    assert.equal(
      checkedIn["$schema"],
      "https://json-schema.org/draft/2020-12/schema",
      name,
    );
  }
});

test("crash after AI-131 authorization consumption before callback return", async () => {
  const value = await fixture();
  const result = await runGovernedArcaSchedulerOnce({
    ...value,
    runId: "crash-ai-131",
    ownerId: "owner",
    processIdentity: "process",
    timestamp: NOW,
    trustedNow: () => NOW,
    observation: observation(value),
    acquisitionBoundary: {
      preflight: async () => ({ authorized: true, evidenceSha256: HASH }),
      execute: async () => {
        throw new Error("consumed-before-return");
      },
    },
    exportBoundary: null,
  });
  assert.equal(result["final_state"], "recovery_required");
  assert.match(String(result["stop_reason"]), /unknown_delivery/);
});

test("crash after AI-132 authorization consumption before callback return", async () => {
  const value = await fixture();
  const result = await runGovernedArcaSchedulerOnce({
    ...value,
    runId: "crash-ai-132",
    ownerId: "owner",
    processIdentity: "process",
    timestamp: NOW,
    trustedNow: () => NOW,
    observation: observation(value),
    acquisitionBoundary: null,
    exportBoundary: {
      preflight: async () => ({ authorized: true, evidenceSha256: HASH }),
      execute: async () => {
        throw new Error("consumed-before-return");
      },
    },
  });
  assert.equal(result["final_state"], "recovery_required");
});

test("execution_started with missing evidence never safe-aborts", async () => {
  const value = await fixture();
  const lease = await expiredLease(value);
  const decision = await inspectSchedulerRecovery({
    configuration: value.configuration,
    lease,
    journal: recoveryJournal(value, lease, "acquisition_execution_started"),
    timestamp: LATER,
  });
  assert.equal(decision["decision"], "lease_expired_recovery");
});

test("exact authoritative non-consumption permits safe abort", async () => {
  const value = await fixture();
  const lease = await expiredLease(value);
  const decision = await inspectSchedulerRecovery({
    configuration: value.configuration,
    lease,
    journal: recoveryJournal(value, lease, "acquisition_execution_started"),
    timestamp: LATER,
    inspectAi131: async () => ({
      status: "not_consumed",
      evidence: value.request.ai_131.expected_consumption,
    }),
  });
  assert.equal(decision["decision"], "safe_abort_before_authority");
});

test("divergent consumption fails closed", async () => {
  const value = await fixture();
  const lease = await expiredLease(value);
  const decision = await inspectSchedulerRecovery({
    configuration: value.configuration,
    lease,
    journal: recoveryJournal(value, lease, "acquisition_execution_started"),
    timestamp: LATER,
    inspectAi131: async () => ({
      status: "divergent_evidence",
      evidence: value.request.ai_131.expected_consumption,
    }),
  });
  assert.equal(decision["decision"], "malformed_evidence_fail_closed");
});

test("exact AI-131 unknown delivery blocks AI-132", async () => {
  const value = await fixture();
  let exportCalls = 0;
  const result = await runGovernedArcaSchedulerOnce({
    ...value,
    runId: "unknown-ai-131",
    ownerId: "owner",
    processIdentity: "process",
    timestamp: NOW,
    trustedNow: () => NOW,
    observation: observation(value),
    acquisitionBoundary: {
      preflight: async () => ({ authorized: true, evidenceSha256: HASH }),
      execute: async () => ({
        outcome: "unknown",
        authorizationConsumed: true,
        evidenceSha256: HASH,
      }),
    },
    exportBoundary: {
      preflight: async () => {
        exportCalls += 1;
        return { authorized: true, evidenceSha256: HASH };
      },
      execute: async () => ({
        outcome: "verified",
        authorizationConsumed: true,
        evidenceSha256: HASH,
      }),
    },
  });
  assert.equal(exportCalls, 0);
  assert.equal(result["final_state"], "unknown_delivery_manual_review");
});

test("boundary exception becomes recovery_required", async () => {
  const value = await fixture();
  const result = await runGovernedArcaSchedulerOnce({
    ...value,
    runId: "boundary-exception",
    ownerId: "owner",
    processIdentity: "process",
    timestamp: NOW,
    trustedNow: () => NOW,
    observation: observation(value),
    acquisitionBoundary: {
      preflight: async () => {
        throw new Error("preflight-failed");
      },
      execute: async () => ({
        outcome: "verified",
        authorizationConsumed: true,
        evidenceSha256: HASH,
      }),
    },
    exportBoundary: null,
  });
  assert.equal(result["final_state"], "recovery_required");
});

test("AI-131 evidence hashes are non-null and exact", async () => {
  const value = await fixture();
  assert.match(value.request.ai_131.configuration.sha256, /^[a-f0-9]{64}$/);
  assert.equal(
    (await loadExactRequestBoundArtifact(value.request.ai_131.proposal))[
      "proposal_id"
    ],
    value.request.ai_131.proposal.identity,
  );
});

test("CLI rejects nested input not matching request-bound paths", async () => {
  const source = await readFile("src/cli/governed-arca-scheduler.ts", "utf8");
  assert.match(source, /nested_boundary_input_rejected/);
});

test("CLI rejects substituted artifact bytes", async () => {
  const value = await fixture();
  await writeFile(value.request.ai_131.proposal.path, '{"proposal_id":"x"}\n');
  await assert.rejects(
    loadExactRequestBoundArtifact(value.request.ai_131.proposal),
    /hash_mismatch|noncanonical/,
  );
});

test("atomic daily-cap competition", async () => {
  const value = await fixture({ dailyCap: 1, activationCap: 2 });
  const outcomes = await Promise.allSettled([
    reserve(value, "ai_131"),
    reserve(value, "ai_132"),
  ]);
  assert.equal(
    outcomes.filter((item) => item.status === "fulfilled").length,
    1,
  );
  assert.equal(outcomes.filter((item) => item.status === "rejected").length, 1);
});

test("atomic activation-cap competition", async () => {
  const value = await fixture({ dailyCap: 2, activationCap: 1 });
  const outcomes = await Promise.allSettled([
    reserve(value, "ai_131"),
    reserve(value, "ai_132"),
  ]);
  assert.equal(
    outcomes.filter((item) => item.status === "fulfilled").length,
    1,
  );
});

test("crash after reservation remains counted", async () => {
  const value = await fixture();
  await reserve(value, "ai_131");
  const summary = await generateSchedulerPilotSummary({
    configuration: value.configuration,
    activation: value.activation,
    timestamp: NOW,
  });
  assert.equal(summary["reserved_attempts"], 1);
});

test("consumed but failed attempt remains counted", async () => {
  const value = await fixture();
  const reservation = await reserve(value, "ai_131");
  await advanceSchedulerAttempt({
    configuration: value.configuration,
    expected: reservation,
    state: "recovery_required",
    authoritativeConsumptionEvidence: value.request.ai_131.expected_consumption,
  });
  const summary = await generateSchedulerPilotSummary({
    configuration: value.configuration,
    activation: value.activation,
    timestamp: NOW,
  });
  assert.equal(summary["recovery_required_attempts"], 1);
});

test("separate AI-131 and AI-132 attempt reservations", async () => {
  const value = await fixture();
  const records = await Promise.all([
    reserve(value, "ai_131"),
    reserve(value, "ai_132"),
  ]);
  assert.notEqual(records[0].reservation_id, records[1].reservation_id);
});

test("duplicate request rejected", async () => {
  const value = await fixture();
  await acceptSchedulerSlot({
    configuration: value.configuration,
    activation: value.activation,
    request: value.request,
    acceptedAt: NOW,
  });
  const next = { ...value.request, eligible_slot_id: "b".repeat(64) };
  await assert.rejects(
    acceptSchedulerSlot({
      configuration: value.configuration,
      activation: value.activation,
      request: next,
      acceptedAt: NOW,
    }),
    /binding_mismatch|duplicate_request/,
  );
});

test("duplicate semantic slot rejected", async () => {
  const value = await fixture();
  await acceptSchedulerSlot({
    configuration: value.configuration,
    activation: value.activation,
    request: value.request,
    acceptedAt: NOW,
  });
  await assert.rejects(
    acceptSchedulerSlot({
      configuration: value.configuration,
      activation: value.activation,
      request: { ...value.request, request_id: "other-request" },
      acceptedAt: NOW,
    }),
    /duplicate_semantic_slot/,
  );
});

test("historical missed slot rejected", async () => {
  const value = await fixture();
  await assert.rejects(
    acceptSchedulerSlot({
      configuration: value.configuration,
      activation: value.activation,
      request: value.request,
      acceptedAt: "2026-07-23T14:00:00.000Z",
    }),
    /historical_missed_slot/,
  );
});

test("no catch-up after downtime", async () => {
  const value = await fixture();
  await assert.rejects(
    acceptSchedulerSlot({
      configuration: value.configuration,
      activation: value.activation,
      request: value.request,
      acceptedAt: "2026-07-24T12:00:00.000Z",
    }),
    /historical_missed_slot/,
  );
});

test("operating-window rejection", async () => {
  const value = await fixture();
  const changed = {
    ...value.configuration,
    allowed_utc_operating_windows: [
      { starts_at_utc: "13:00", ends_at_utc: "14:00" },
    ],
    configuration_sha256: "0".repeat(64),
  };
  const configuration = {
    ...changed,
    configuration_sha256: computeSchedulerConfigurationSha256(changed),
  };
  await assert.rejects(
    acceptSchedulerSlot({
      configuration,
      activation: value.activation,
      request: value.request,
      acceptedAt: NOW,
    }),
    /outside_operating_window|binding_mismatch/,
  );
});

test("activation expires before AI-131 call", async () => {
  const value = await fixture();
  assert.equal(
    schedulerActivationStatus(
      value.activation,
      value.configuration,
      value.activation.expires_at,
    ),
    "expired",
  );
});

test("activation expires after AI-131 consumption", async () => {
  const value = await fixture();
  const reservation = await reserve(value, "ai_131");
  const next = await advanceSchedulerAttempt({
    configuration: value.configuration,
    expected: reservation,
    state: "recovery_required",
    authoritativeConsumptionEvidence: value.request.ai_131.expected_consumption,
  });
  assert.equal(next.state, "recovery_required");
});

test("activation expires before AI-132 call", async () => {
  const value = await fixture();
  assert.equal(
    schedulerActivationStatus(
      value.activation,
      value.configuration,
      value.activation.expires_at,
    ),
    "expired",
  );
});

test("scheduler switch changes before AI-131", async () => {
  const value = await fixture();
  const result = await runGovernedArcaSchedulerOnce({
    ...value,
    runId: "switch-ai-131",
    ownerId: "owner",
    processIdentity: "process",
    timestamp: NOW,
    trustedNow: () => NOW,
    observation: observation(value),
    acquisitionBoundary: {
      preflight: async () => {
        await writeFile(
          value.configuration.kill_switch_path,
          canonicalBytes({ ...value.killSwitch, execution_blocked: true }),
        );
        return { authorized: true, evidenceSha256: HASH };
      },
      execute: async () => ({
        outcome: "verified",
        authorizationConsumed: true,
        evidenceSha256: HASH,
      }),
    },
    exportBoundary: null,
  });
  assert.equal(result["final_state"], "recovery_required");
});

test("scheduler switch changes before AI-132", async () => {
  const value = await fixture();
  const result = await runGovernedArcaSchedulerOnce({
    ...value,
    runId: "switch-ai-132",
    ownerId: "owner",
    processIdentity: "process",
    timestamp: NOW,
    trustedNow: () => NOW,
    observation: observation(value),
    acquisitionBoundary: null,
    exportBoundary: {
      preflight: async () => {
        await writeFile(
          value.configuration.kill_switch_path,
          canonicalBytes({ ...value.killSwitch, execution_blocked: true }),
        );
        return { authorized: true, evidenceSha256: HASH };
      },
      execute: async () => ({
        outcome: "verified",
        authorizationConsumed: true,
        evidenceSha256: HASH,
      }),
    },
  });
  assert.equal(result["final_state"], "recovery_required");
});

test("scheduler switch path substitution", async () => {
  const value = await fixture();
  const substituted = {
    ...value.configuration,
    kill_switch_path: join(value.root, "missing-switch.json"),
    configuration_sha256: "0".repeat(64),
  };
  const configuration = {
    ...substituted,
    configuration_sha256: computeSchedulerConfigurationSha256(substituted),
  };
  assert.equal(validateSchedulerConfiguration(configuration), true);
  await assert.rejects(readFile(configuration.kill_switch_path), /ENOENT/);
});

test("heartbeat during delayed AI-131 execution", async () => {
  const value = await fixture();
  const lease = await expiredLease(value);
  const next = await heartbeatSchedulerLease({
    configuration: value.configuration,
    expectedLease: lease,
    ownerId: lease.owner_id,
    processIdentity: lease.process_identity,
    timestamp: "2026-07-23T12:01:00.000Z",
  });
  assert.notEqual(next.lease_sha256, lease.lease_sha256);
});

test("heartbeat failure produces recovery_required", async () => {
  const value = await fixture();
  const result = await runGovernedArcaSchedulerOnce({
    ...value,
    runId: "heartbeat-failure",
    ownerId: "owner",
    processIdentity: "process",
    timestamp: NOW,
    trustedNow: () => NOW,
    observation: observation(value),
    acquisitionBoundary: {
      preflight: async () => ({ authorized: true, evidenceSha256: HASH }),
      execute: async () => {
        await writeFile(schedulerLeasePath(value.configuration), "{}\n");
        return {
          outcome: "verified",
          authorizationConsumed: true,
          evidenceSha256: HASH,
        };
      },
    },
    exportBoundary: null,
  });
  assert.equal(result["final_state"], "recovery_required");
});

test("recovery does not inspect a non-expired active lease as stale", async () => {
  const value = await fixture();
  const lease = await expiredLease(value);
  let inspections = 0;
  const decision = await inspectSchedulerRecovery({
    configuration: value.configuration,
    lease,
    journal: recoveryJournal(value, lease, "acquisition_execution_started"),
    timestamp: "2026-07-23T12:01:00.000Z",
    inspectAi131: async () => {
      inspections += 1;
      return {
        status: "not_consumed",
        evidence: value.request.ai_131.expected_consumption,
      };
    },
  });
  assert.equal(decision["decision"], "active_lease_not_stale");
  assert.equal(inspections, 0);
});

for (const [name, state, inspector] of [
  [
    "stale lease plus unresolved AI-131 journal remains blocked",
    "acquisition_execution_started",
    "ai131",
  ],
  [
    "stale lease plus unresolved AI-132 journal remains blocked",
    "export_execution_started",
    "ai132",
  ],
] as const)
  test(name, async () => {
    const value = await fixture();
    const lease = await expiredLease(value);
    const decision = await inspectSchedulerRecovery({
      configuration: value.configuration,
      lease,
      journal: recoveryJournal(value, lease, state),
      timestamp: LATER,
      ...(inspector === "ai131"
        ? {
            inspectAi131: async () => ({
              status: "unknown_delivery" as const,
              evidence: value.request.ai_131.expected_consumption,
            }),
          }
        : {
            inspectAi132: async () => ({
              status: "unknown_delivery" as const,
              evidence: value.request.ai_132.expected_consumption,
            }),
          }),
    });
    assert.equal(decision["decision"], "unknown_delivery_manual_review");
  });

test("repeated recovery is idempotent", async () => {
  const value = await fixture();
  const lease = await expiredLease(value);
  const input = {
    configuration: value.configuration,
    lease,
    journal: recoveryJournal(value, lease, "acquisition_execution_started"),
    timestamp: LATER,
    inspectAi131: async () => ({
      status: "not_consumed" as const,
      evidence: value.request.ai_131.expected_consumption,
    }),
  };
  assert.deepEqual(
    await inspectSchedulerRecovery(input),
    await inspectSchedulerRecovery(input),
  );
});

test("exact completion after crash recovery", async () => {
  const value = await fixture();
  const lease = await expiredLease(value);
  const decision = await inspectSchedulerRecovery({
    configuration: value.configuration,
    lease,
    journal: recoveryJournal(value, lease, "acquisition_execution_started"),
    timestamp: LATER,
    inspectAi131: async () => ({
      status: "consumed_completed",
      evidence: value.request.ai_131.expected_consumption,
    }),
  });
  assert.equal(decision["decision"], "completed_after_recovery");
});

test("activation-wide counters differ correctly from daily counters", async () => {
  const value = await fixture();
  await reserve(value, "ai_131");
  const observed = await observeGovernedArcaScheduler({
    ...observation(value),
    timestamp: "2026-07-24T13:00:00.000Z",
    persist: false,
  });
  assert.equal(observed["daily_execution_attempt_count"], 0);
  assert.equal(observed["activation_execution_attempt_count"], 1);
});

test("pilot summary counts reserved consumed and recovery attempts", async () => {
  const value = await fixture();
  const first = await reserve(value, "ai_131");
  const second = await reserve(value, "ai_132");
  await advanceSchedulerAttempt({
    configuration: value.configuration,
    expected: second,
    state: "recovery_required",
  });
  const summary = await generateSchedulerPilotSummary({
    configuration: value.configuration,
    activation: value.activation,
    timestamp: NOW,
  });
  assert.equal(summary["reserved_attempts"], 1);
  assert.equal(summary["recovery_required_attempts"], 1);
  assert.equal(first.state, "reserved");
});

test("observation unverified claims cannot enable execution", async () => {
  const value = await fixture();
  const observed = await observeGovernedArcaScheduler({
    ...observation(value),
    ai131: {
      readiness: "ready",
      authorizationAvailable: true,
      recoveryState: "clear",
    },
    persist: false,
  });
  assert.equal(observed["ai_131_readiness"], "unverified_reported_input");
  assert.equal(observed["ai_131_authorization_available"], false);
});

test("AI-130 observation inspection remains read-only", async () => {
  const value = await fixture();
  await observeGovernedArcaScheduler({
    ...observation(value),
    persist: false,
  });
  await assert.rejects(
    readdir(value.configuration.observation_root.path),
    /ENOENT/,
  );
});

test("zero network during observe and recover", async () => {
  const value = await fixture();
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (() => {
    calls += 1;
    throw new Error("network forbidden");
  }) as typeof fetch;
  try {
    await observeGovernedArcaScheduler({
      ...observation(value),
      persist: false,
    });
    const lease = await expiredLease(value);
    await inspectSchedulerRecovery({
      configuration: value.configuration,
      lease,
      journal: recoveryJournal(value, lease, "lease_acquired"),
      timestamp: LATER,
    });
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});

for (const name of [
  "zero external database writes",
  "zero vlatam-global access",
  "zero downstream authority",
] as const)
  test(name, async () => {
    const value = await fixture();
    const observed = await observeGovernedArcaScheduler({
      ...observation(value),
      persist: false,
    });
    for (const key of Object.keys(FALSE_AUTHORITIES))
      assert.equal(observed[key], false);
  });

test("exact lease release after latest heartbeat bytes", async () => {
  const value = await fixture();
  const result = await runGovernedArcaSchedulerOnce({
    ...value,
    runId: "clean-release",
    ownerId: "owner",
    processIdentity: "process",
    timestamp: NOW,
    trustedNow: () => NOW,
    observation: observation(value),
    acquisitionBoundary: null,
    exportBoundary: null,
  });
  assert.equal(result["final_state"], "completed");
  await assert.rejects(
    readFile(schedulerLeasePath(value.configuration)),
    /ENOENT/,
  );
});

test("configuration and activation remain exact, bounded and repository-current blocked", async () => {
  const configuration = JSON.parse(
    await readFile("config/ai-133-governed-arca-scheduler.json", "utf8"),
  );
  assert.equal(validateSchedulerConfiguration(configuration), true);
  assert.equal(configuration.active, false);
  assert.equal(configuration.maximum_runs_per_24_hours, 0);
  const value = await fixture();
  assert.equal(
    Date.parse(value.activation.expires_at) -
      Date.parse(value.activation.starts_at),
    MAXIMUM_ACTIVATION_MILLISECONDS,
  );
  assert.equal(validateSchedulerContract("run_request", value.request), true);
});

test("symlink substitution is rejected for exact request-bound artifacts", async () => {
  const value = await fixture();
  const target = join(value.root, "target.json");
  await writeFile(target, canonicalBytes({ proposal_id: "ai-131-proposal" }));
  const linked = join(value.root, "linked.json");
  await symlink(target, linked);
  await assert.rejects(
    loadExactRequestBoundArtifact({
      ...value.request.ai_131.proposal,
      path: linked,
    }),
    /symbolic_link_rejected/,
  );
});

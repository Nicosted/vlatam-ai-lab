import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  assertDurableRecoveryBundle,
  createGovernedSchedulerAuthoritativeInspectors,
  observeGovernedSchedulerBundle,
} from "../../src/cli/governed-arca-scheduler.js";
import {
  createRealAi131BoundaryFixture,
  createRealAi132BoundaryFixture,
  type RealAi131BoundaryFixture,
  type RealAi132BoundaryFixture,
} from "../helpers/real-arca-boundaries.js";
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
  computeReviewedRecoveryEnvironmentSha256,
  generateSchedulerPilotSummary,
  inspectSchedulerRecovery,
  initializeSchedulerAttemptLedger,
  loadDurableSchedulerRecoveryEvidence,
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
  type SchedulerDurableRecoveryInput,
  type SchedulerKillSwitch,
  type SchedulerLease,
  type SchedulerRunJournal,
  type ReviewedRecoveryEnvironment,
  type AuthoritativeBoundaryDisposition,
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
  explicitShaKey?: string,
): Promise<ExactArtifactBinding> {
  const shaKey = explicitShaKey ?? identityKey.replace(/_id$/, "_sha256");
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
  const boundaryRoot = join(root, name);
  const reviewedInputRoot = join(boundaryRoot, "reviewed-inputs");
  const stateRoot = join(boundaryRoot, "state");
  const primaryRoot = join(
    boundaryRoot,
    name === "ai-131" ? "acquisitions" : "exports",
  );
  const secondaryRoot =
    name === "ai-131" ? join(boundaryRoot, "candidates") : stateRoot;
  await Promise.all(
    [reviewedInputRoot, stateRoot, primaryRoot, secondaryRoot].map((path) =>
      mkdir(path, { recursive: true }),
    ),
  );
  const configurationValue =
    name === "ai-131"
      ? {
          schema_version: "1.0.0",
          configuration_id: `${name}-configuration`,
          configuration_sha256: HASH,
          acquisition_output: {
            identity: `${name}-acquisitions`,
            path: primaryRoot,
          },
          candidate_output: {
            identity: `${name}-candidates`,
            path: secondaryRoot,
          },
          run_state: { identity: `${name}-state`, path: stateRoot },
        }
      : {
          schema_version: "1.0.0",
          configuration_id: `${name}-configuration`,
          configuration_sha256: HASH,
          export_root: { identity: `${name}-exports`, path: primaryRoot },
          export_state_root: {
            identity: `${name}-state`,
            path: stateRoot,
          },
        };
  const configurationPath = join(reviewedInputRoot, "configuration.json");
  await writeFile(configurationPath, canonicalBytes(configurationValue));
  const configuration: ExactArtifactBinding = {
    path: configurationPath,
    identity: `${name}-configuration`,
    sha256: HASH,
    canonical_sha256: bytesHash(configurationValue),
  };
  const proposal = await exactArtifact(
    reviewedInputRoot,
    `${name}-proposal`,
    "proposal_id",
    `${name}-proposal`,
  );
  const authorization = await exactArtifact(
    reviewedInputRoot,
    `${name}-authorization`,
    "authorization_id",
    `${name}-authorization`,
  );
  const consumption = await exactArtifact(
    join(stateRoot, "consumptions"),
    `${name}-consumption`,
    "consumption_id",
    `${name}-consumption`,
  );
  const killSwitch = await exactArtifact(
    reviewedInputRoot,
    `${name}-kill-switch`,
    "kill_switch_id",
    `${name}-kill-switch`,
  );
  const isAi131 = name === "ai-131";
  const authoritativeJournal = await exactArtifact(
    join(stateRoot, "journals"),
    `${name}-journal`,
    isAi131 ? "run_id" : "journal_id",
    `${name}-journal`,
    "journal_sha256",
  );
  const durableResult = await exactArtifact(
    join(stateRoot, "records"),
    `${name}-result`,
    isAi131 ? "run_id" : "package_id",
    `${name}-result`,
    "record_sha256",
  );
  const primaryEvidence = await exactArtifact(
    name === "ai-131" ? primaryRoot : join(primaryRoot, "packages"),
    `${name}-primary`,
    isAi131 ? "acquisition_id" : "package_id",
    `${name}-primary`,
    isAi131 ? "acquisition_record_sha256" : "package_sha256",
  );
  const secondaryEvidence = await exactArtifact(
    name === "ai-131" ? secondaryRoot : join(stateRoot, "records"),
    `${name}-secondary`,
    isAi131 ? "candidate_id" : "package_id",
    `${name}-secondary`,
    isAi131 ? "candidate_sha256" : "record_sha256",
  );
  const recoveryRoot = join(stateRoot, "recovery");
  await mkdir(recoveryRoot, { recursive: true });
  return {
    configuration,
    proposal,
    authorization,
    expected_consumption: consumption,
    authoritative_journal: authoritativeJournal,
    durable_result: durableResult,
    primary_evidence: primaryEvidence,
    secondary_evidence: secondaryEvidence,
    kill_switch: killSwitch,
    recovery_root: {
      path: recoveryRoot,
      identity: `${name}-recovery`,
    },
  };
}

interface Fixture {
  readonly root: string;
  readonly configuration: SchedulerConfiguration;
  readonly reviewedEnvironment: ReviewedRecoveryEnvironment;
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
  await initializeSchedulerAttemptLedger({
    configuration,
    activation,
    initializedAt: NOW,
  });
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
  const configurationPath = join(root, "scheduler-configuration.json");
  await writeFile(configurationPath, canonicalBytes(configuration));
  const environmentUnsigned = {
    schema_version: "1.0.0" as const,
    environment_id: "synthetic-reviewed-ai-133",
    environment_sha256: "0".repeat(64),
    repository_root: root,
    scheduler_configuration_path: configurationPath,
    scheduler_switch_path: configuration.kill_switch_path,
    ai_131_configuration_path: request.ai_131.configuration.path,
    ai_131_switch_path: request.ai_131.kill_switch.path,
    ai_132_configuration_path: request.ai_132.configuration.path,
    ai_132_switch_path: request.ai_132.kill_switch.path,
    scheduler_state_root: configuration.state_root.path,
    scheduler_observation_root: configuration.observation_root.path,
    ai_130_root: configuration.durable_ai_130_store.root_path,
    ai_131_state_root: dirname(
      dirname(request.ai_131.expected_consumption.path),
    ),
    ai_131_acquisition_root: dirname(request.ai_131.primary_evidence.path),
    ai_131_candidate_root: dirname(request.ai_131.secondary_evidence.path),
    ai_132_state_root: dirname(
      dirname(request.ai_132.expected_consumption.path),
    ),
    ai_132_export_root: dirname(dirname(request.ai_132.primary_evidence.path)),
    ai_132_recovery_root: request.ai_132.recovery_root.path,
  };
  const reviewedEnvironment: ReviewedRecoveryEnvironment = {
    ...environmentUnsigned,
    environment_sha256:
      computeReviewedRecoveryEnvironmentSha256(environmentUnsigned),
  };
  return {
    root,
    configuration,
    reviewedEnvironment,
    activation,
    killSwitch,
    request,
  };
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

function withRealInspectorJournals(
  value: Fixture,
  ai131: RealAi131BoundaryFixture,
  ai132: RealAi132BoundaryFixture,
  ai132JournalId: string,
): Fixture {
  const unsignedRequest = {
    ...value.request,
    request_sha256: "0".repeat(64),
    ai_131: {
      ...value.request.ai_131,
      authoritative_journal: {
        ...value.request.ai_131.authoritative_journal,
        path: join(
          ai131.configuration.run_state.path,
          "journals",
          `${ai131.runId}.json`,
        ),
        identity: ai131.runId,
      },
    },
    ai_132: {
      ...value.request.ai_132,
      authoritative_journal: {
        ...value.request.ai_132.authoritative_journal,
        path: join(
          ai132.configuration.export_state_root.path,
          "completed-journals",
          `${ai132JournalId}.json`,
        ),
        identity: ai132JournalId,
      },
    },
  };
  return {
    ...value,
    request: {
      ...unsignedRequest,
      request_sha256: computeScheduledRunRequestSha256(unsignedRequest),
    },
  };
}

function realInspectors(
  value: Fixture,
  ai131: RealAi131BoundaryFixture,
  ai132: RealAi132BoundaryFixture,
) {
  return createGovernedSchedulerAuthoritativeInspectors({
    request: value.request,
    ai131Configuration: ai131.configuration as unknown as Record<
      string,
      unknown
    >,
    ai132Configuration: ai132.configuration as unknown as Record<
      string,
      unknown
    >,
    ai132Switch: ai132.killSwitch as unknown as Record<string, unknown>,
    ai131RunId: ai131.runId,
    ai132SwitchPath: ai132.killSwitchPath,
  });
}

function authoritativeRuntimeInspectors(
  value: Fixture,
  ai131Final: AuthoritativeBoundaryDisposition = "consumed_completed",
  ai132Final: AuthoritativeBoundaryDisposition = "consumed_completed",
) {
  let ai131Calls = 0;
  let ai132Calls = 0;
  const inspection = (
    boundaryType: "ai_131" | "ai_132",
    disposition: AuthoritativeBoundaryDisposition,
  ) => ({
    status: disposition,
    evidence: disposition.startsWith("consumed_")
      ? boundaryType === "ai_131"
        ? value.request.ai_131.expected_consumption
        : value.request.ai_132.expected_consumption
      : null,
    reason: `synthetic_real_artifact_inspection:${disposition}`,
  });
  return {
    inspectAi131: async () =>
      inspection(
        "ai_131",
        ai131Calls++ === 0 ? "positively_not_consumed" : ai131Final,
      ),
    inspectAi132: async () =>
      inspection(
        "ai_132",
        ai132Calls++ === 0 ? "positively_not_consumed" : ai132Final,
      ),
  };
}

function successfulRuntimeBoundaries(value: Fixture) {
  return {
    ...authoritativeRuntimeInspectors(value),
    acquisitionBoundary: {
      preflight: async () => ({ authorized: true, evidenceSha256: HASH }),
      execute: async () => ({
        outcome: "verified" as const,
        authorizationConsumed: true,
        evidenceSha256: HASH,
        authoritativeConsumptionEvidence:
          value.request.ai_131.expected_consumption,
      }),
    },
    exportBoundary: {
      preflight: async () => ({ authorized: true, evidenceSha256: HASH }),
      execute: async () => ({
        outcome: "verified" as const,
        authorizationConsumed: true,
        evidenceSha256: HASH,
        authoritativeConsumptionEvidence:
          value.request.ai_132.expected_consumption,
      }),
    },
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
  const entries: SchedulerRunJournal["entries"] =
    state === "export_execution_started"
      ? [
          {
            sequence: 0,
            state: "acquisition_execution_started",
            timestamp: NOW,
            evidence_sha256: HASH,
          },
          {
            sequence: 1,
            state: "export_execution_started",
            timestamp: NOW,
            evidence_sha256: HASH,
          },
        ]
      : [
          {
            sequence: 0,
            state,
            timestamp: NOW,
            evidence_sha256:
              state === "lease_acquired" ? lease.lease_sha256 : HASH,
          },
        ];
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
    entries,
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

async function durableRecoveryFixture(
  state:
    | "lease_acquired"
    | "acquisition_execution_started"
    | "export_execution_started" = "lease_acquired",
): Promise<{
  value: Fixture;
  input: SchedulerDurableRecoveryInput;
  registry: Readonly<Record<string, ReviewedRecoveryEnvironment>>;
  lease: SchedulerLease;
  journal: SchedulerRunJournal;
  journalPath: string;
}> {
  const value = await fixture();
  await acceptSchedulerSlot({
    configuration: value.configuration,
    activation: value.activation,
    request: value.request,
    acceptedAt: NOW,
  });
  const acquired = await acquireSchedulerLease({
    configuration: value.configuration,
    activation: value.activation,
    ownerId: "durable-recovery-owner",
    processIdentity: "durable-recovery-process",
    timestamp: NOW,
  });
  assert.equal(acquired.status, "acquired");
  const lease = acquired.lease!;
  const journal = recoveryJournal(value, lease, state);
  const stateRoot = value.configuration.state_root.path;
  const requestPath = join(
    stateRoot,
    "requests",
    `${value.request.request_id}.json`,
  );
  const journalPath = join(stateRoot, "journals", `${journal.run_id}.json`);
  await mkdir(dirname(requestPath), { recursive: true });
  await mkdir(dirname(journalPath), { recursive: true });
  await writeFile(requestPath, canonicalBytes(value.request));
  await writeFile(journalPath, canonicalBytes(journal));
  if (state === "acquisition_execution_started") await reserve(value, "ai_131");
  if (state === "export_execution_started") {
    await reserve(value, "ai_131");
    await reserve(value, "ai_132");
  }
  const configurationPath = join(value.root, "scheduler-configuration.json");
  await writeFile(configurationPath, canonicalBytes(value.configuration));
  const environmentUnsigned = {
    schema_version: "1.0.0" as const,
    environment_id: "synthetic-reviewed-ai-133",
    environment_sha256: "0".repeat(64),
    repository_root: value.root,
    scheduler_configuration_path: configurationPath,
    scheduler_switch_path: value.configuration.kill_switch_path,
    ai_131_configuration_path: value.request.ai_131.configuration.path,
    ai_131_switch_path: value.request.ai_131.kill_switch.path,
    ai_132_configuration_path: value.request.ai_132.configuration.path,
    ai_132_switch_path: value.request.ai_132.kill_switch.path,
    scheduler_state_root: value.configuration.state_root.path,
    scheduler_observation_root: value.configuration.observation_root.path,
    ai_130_root: value.configuration.durable_ai_130_store.root_path,
    ai_131_state_root: dirname(
      dirname(value.request.ai_131.expected_consumption.path),
    ),
    ai_131_acquisition_root: dirname(
      value.request.ai_131.primary_evidence.path,
    ),
    ai_131_candidate_root: dirname(
      value.request.ai_131.secondary_evidence.path,
    ),
    ai_132_state_root: dirname(
      dirname(value.request.ai_132.expected_consumption.path),
    ),
    ai_132_export_root: dirname(
      dirname(value.request.ai_132.primary_evidence.path),
    ),
    ai_132_recovery_root: value.request.ai_132.recovery_root.path,
  };
  const environment: ReviewedRecoveryEnvironment = {
    ...environmentUnsigned,
    environment_sha256:
      computeReviewedRecoveryEnvironmentSha256(environmentUnsigned),
  };
  return {
    value,
    lease,
    journal,
    journalPath,
    registry: { [environment.environment_id]: environment },
    input: {
      schema_version: "1.0.0",
      environment_id: environment.environment_id,
      run_id: journal.run_id,
      request_id: value.request.request_id,
      timestamp: LATER,
    },
  };
}

test("all sixteen AI-133 contracts are closed Draft 2020-12 schemas", async () => {
  const hashes = schedulerSchemaHashes();
  assert.equal(Object.keys(hashes).length, 16);
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
    recovery_input: "arca-scheduler-recovery-input.schema.json",
    recovery_decision: "arca-scheduler-recovery-decision.schema.json",
    kill_switch: "arca-scheduler-kill-switch.schema.json",
    attempt_ledger: "arca-scheduler-attempt-ledger.schema.json",
    attempt_ledger_manifest:
      "arca-scheduler-attempt-ledger-manifest.schema.json",
    slot_acceptance: "arca-scheduler-slot-acceptance.schema.json",
    reviewed_environment: "arca-scheduler-reviewed-environment.schema.json",
    ai_131_disposition: "arca-scheduler-ai-131-disposition.schema.json",
    ai_132_disposition: "arca-scheduler-ai-132-disposition.schema.json",
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

test("AI-131 callback exception after execution start becomes recovery", async () => {
  const value = await fixture();
  const result = await runGovernedArcaSchedulerOnce({
    ...value,
    runId: "crash-ai-131",
    ownerId: "owner",
    processIdentity: "process",
    timestamp: NOW,
    trustedNow: () => NOW,
    observation: observation(value),
    ...authoritativeRuntimeInspectors(value, "unknown_delivery"),
    acquisitionBoundary: {
      preflight: async () => ({ authorized: true, evidenceSha256: HASH }),
      execute: async () => {
        throw new Error("consumed-before-return");
      },
    },
    exportBoundary: {
      preflight: async () => ({ authorized: true, evidenceSha256: HASH }),
      execute: async () => ({
        outcome: "verified",
        authorizationConsumed: true,
        evidenceSha256: HASH,
      }),
    },
  });
  assert.equal(result["final_state"], "recovery_required");
  assert.match(String(result["stop_reason"]), /unknown_delivery/);
});

test("AI-132 callback exception after execution start becomes recovery", async () => {
  const value = await fixture();
  const result = await runGovernedArcaSchedulerOnce({
    ...value,
    runId: "crash-ai-132",
    ownerId: "owner",
    processIdentity: "process",
    timestamp: NOW,
    trustedNow: () => NOW,
    observation: observation(value),
    ...authoritativeRuntimeInspectors(
      value,
      "consumed_completed",
      "consumed_recovery_required",
    ),
    acquisitionBoundary: {
      preflight: async () => ({ authorized: true, evidenceSha256: HASH }),
      execute: async () => ({
        outcome: "verified",
        authorizationConsumed: true,
        evidenceSha256: HASH,
      }),
    },
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
    attemptReservations: [await reserve(value, "ai_131")],
  });
  assert.equal(decision["decision"], "malformed_evidence");
});

test("durable recovery loads exact scheduler lease journal request slot and ledger", async () => {
  const durable = await durableRecoveryFixture("acquisition_execution_started");
  const loaded = await loadDurableSchedulerRecoveryEvidence(
    durable.input,
    durable.registry,
  );
  assert.equal(loaded.lease.lease_sha256, durable.lease.lease_sha256);
  assert.equal(loaded.journal.journal_sha256, durable.journal.journal_sha256);
  assert.equal(
    loaded.request.request_sha256,
    durable.value.request.request_sha256,
  );
  assert.equal(loaded.slot["request_id"], durable.value.request.request_id);
  assert.equal(loaded.reservations?.length, 1);
});

test("recover CLI rejects caller-supplied lease and journal objects", () => {
  assert.throws(
    () => assertDurableRecoveryBundle({ lease: {}, journal: {} }),
    /caller_supplied_recovery_evidence_rejected/,
  );
});

test("durable recovery rejects caller-supplied or alternate journal paths", async () => {
  const durable = await durableRecoveryFixture();
  await assert.rejects(
    loadDurableSchedulerRecoveryEvidence(
      {
        ...durable.input,
        journal_path: join(durable.value.root, "alternate-journal.json"),
      } as unknown as SchedulerDurableRecoveryInput,
      durable.registry,
    ),
    /invalid_scheduler_recovery_input/,
  );
});

test("recovery rejects same-byte configuration and switch copies at alternate paths", async () => {
  const durable = await durableRecoveryFixture();
  const environment = durable.registry[durable.input.environment_id]!;
  const cases = [
    ["scheduler_configuration_path", environment.scheduler_configuration_path],
    ["scheduler_switch_path", environment.scheduler_switch_path],
    ["ai_131_configuration_path", environment.ai_131_configuration_path],
    ["ai_131_switch_path", environment.ai_131_switch_path],
    ["ai_132_configuration_path", environment.ai_132_configuration_path],
    ["ai_132_switch_path", environment.ai_132_switch_path],
  ] as const;
  for (const [field, source] of cases) {
    const alternate = join(durable.value.root, "alternate", `${field}.json`);
    await mkdir(dirname(alternate), { recursive: true });
    await copyFile(source, alternate);
    assert.equal(
      await readFile(alternate, "utf8"),
      await readFile(source, "utf8"),
    );
    await assert.rejects(
      loadDurableSchedulerRecoveryEvidence(
        {
          ...durable.input,
          [field]: alternate,
        } as unknown as SchedulerDurableRecoveryInput,
        durable.registry,
      ),
      /invalid_scheduler_recovery_input/,
      field,
    );
  }
});

test("durable recovery rejects a valid self-hashed journal outside reviewed root", async () => {
  const durable = await durableRecoveryFixture();
  const outside = join(
    durable.value.root,
    "outside",
    `${durable.journal.run_id}.json`,
  );
  await mkdir(dirname(outside), { recursive: true });
  await writeFile(outside, canonicalBytes(durable.journal));
  await assert.rejects(
    loadDurableSchedulerRecoveryEvidence(
      {
        ...durable.input,
        journal_path: outside,
      } as unknown as SchedulerDurableRecoveryInput,
      durable.registry,
    ),
    /invalid_scheduler_recovery_input/,
  );
});

test("durable recovery rejects a symlinked scheduler journal", async () => {
  const durable = await durableRecoveryFixture();
  const target = join(durable.value.root, "journal-target.json");
  await writeFile(target, canonicalBytes(durable.journal));
  await unlink(durable.journalPath);
  await symlink(target, durable.journalPath);
  await assert.rejects(
    loadDurableSchedulerRecoveryEvidence(durable.input, durable.registry),
    /symbolic_link_rejected/,
  );
});

test("exact durable pre-authority evidence permits safe abort", async () => {
  const durable = await durableRecoveryFixture();
  const loaded = await loadDurableSchedulerRecoveryEvidence(
    durable.input,
    durable.registry,
  );
  const decision = await inspectSchedulerRecovery({
    configuration: loaded.configuration,
    lease: loaded.lease,
    journal: loaded.journal,
    timestamp: durable.input.timestamp,
    attemptReservations: loaded.reservations,
    schedulerResultPresent: loaded.resultPresent,
    recoveryResultPresent: loaded.recoveryResultPresent,
  });
  assert.equal(decision["decision"], "safe_abort_before_authority");
});

test("exact authoritative non-consumption after AI-131 start is explicitly blocked", async () => {
  const value = await fixture();
  const lease = await expiredLease(value);
  const decision = await inspectSchedulerRecovery({
    configuration: value.configuration,
    lease,
    journal: recoveryJournal(value, lease, "acquisition_execution_started"),
    timestamp: LATER,
    attemptReservations: [await reserve(value, "ai_131")],
    inspectAi131: async () => ({
      status: "positively_not_consumed",
      evidence: value.request.ai_131.expected_consumption,
    }),
  });
  assert.equal(decision["decision"], "blocked_before_ai_131");
});

test("divergent consumption fails closed", async () => {
  const value = await fixture();
  const lease = await expiredLease(value);
  const decision = await inspectSchedulerRecovery({
    configuration: value.configuration,
    lease,
    journal: recoveryJournal(value, lease, "acquisition_execution_started"),
    timestamp: LATER,
    attemptReservations: [await reserve(value, "ai_131")],
    inspectAi131: async () => ({
      status: "divergent_evidence",
      evidence: value.request.ai_131.expected_consumption,
    }),
  });
  assert.equal(decision["decision"], "divergent_evidence");
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
    ...authoritativeRuntimeInspectors(value, "unknown_delivery"),
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
  assert.equal(result["final_state"], "recovery_required");
});

test("verified AI-131 callback with missing durable candidate blocks AI-132", async () => {
  const value = await fixture();
  let exportPreflights = 0;
  const result = await runGovernedArcaSchedulerOnce({
    ...value,
    runId: "missing-ai-131-candidate",
    ownerId: "owner",
    processIdentity: "process",
    timestamp: NOW,
    trustedNow: () => NOW,
    observation: observation(value),
    ...authoritativeRuntimeInspectors(value),
    acquisitionBoundary: {
      preflight: async () => ({ authorized: true, evidenceSha256: HASH }),
      execute: async () => {
        await unlink(value.request.ai_131.secondary_evidence.path);
        return {
          outcome: "verified",
          authorizationConsumed: true,
          evidenceSha256: HASH,
        };
      },
    },
    exportBoundary: {
      preflight: async () => {
        exportPreflights += 1;
        return { authorized: false, evidenceSha256: HASH };
      },
      execute: async () => ({
        outcome: "blocked",
        authorizationConsumed: false,
        evidenceSha256: HASH,
      }),
    },
  });
  assert.equal(result["final_state"], "recovery_required");
  assert.equal(exportPreflights, 0);
});

test("verified AI-131 callback with divergent acquired source blocks AI-132", async () => {
  const value = await fixture();
  let exportPreflights = 0;
  const result = await runGovernedArcaSchedulerOnce({
    ...value,
    runId: "divergent-ai-131-acquisition",
    ownerId: "owner",
    processIdentity: "process",
    timestamp: NOW,
    trustedNow: () => NOW,
    observation: observation(value),
    ...authoritativeRuntimeInspectors(value),
    acquisitionBoundary: {
      preflight: async () => ({ authorized: true, evidenceSha256: HASH }),
      execute: async () => {
        await writeFile(value.request.ai_131.primary_evidence.path, "{}\n");
        return {
          outcome: "verified",
          authorizationConsumed: true,
          evidenceSha256: HASH,
        };
      },
    },
    exportBoundary: {
      preflight: async () => {
        exportPreflights += 1;
        return { authorized: false, evidenceSha256: HASH };
      },
      execute: async () => ({
        outcome: "blocked",
        authorizationConsumed: false,
        evidenceSha256: HASH,
      }),
    },
  });
  assert.equal(result["final_state"], "recovery_required");
  assert.equal(exportPreflights, 0);
});

test("verified AI-131 callback with divergent authoritative journal blocks AI-132", async () => {
  const value = await fixture();
  let exportPreflights = 0;
  const result = await runGovernedArcaSchedulerOnce({
    ...value,
    runId: "divergent-ai-131-journal",
    ownerId: "owner",
    processIdentity: "process",
    timestamp: NOW,
    trustedNow: () => NOW,
    observation: observation(value),
    ...authoritativeRuntimeInspectors(value),
    acquisitionBoundary: {
      preflight: async () => ({ authorized: true, evidenceSha256: HASH }),
      execute: async () => {
        await writeFile(
          value.request.ai_131.authoritative_journal.path,
          "{}\n",
        );
        return {
          outcome: "verified",
          authorizationConsumed: true,
          evidenceSha256: HASH,
        };
      },
    },
    exportBoundary: {
      preflight: async () => {
        exportPreflights += 1;
        return { authorized: false, evidenceSha256: HASH };
      },
      execute: async () => ({
        outcome: "blocked",
        authorizationConsumed: false,
        evidenceSha256: HASH,
      }),
    },
  });
  assert.equal(result["final_state"], "recovery_required");
  assert.equal(exportPreflights, 0);
});

test("verified exact AI-131 durable outputs permit AI-132 preflight", async () => {
  const value = await fixture();
  let exportPreflights = 0;
  const result = await runGovernedArcaSchedulerOnce({
    ...value,
    runId: "exact-ai-131-allows-ai-132-preflight",
    ownerId: "owner",
    processIdentity: "process",
    timestamp: NOW,
    trustedNow: () => NOW,
    observation: observation(value),
    ...authoritativeRuntimeInspectors(value),
    acquisitionBoundary: {
      preflight: async () => ({ authorized: true, evidenceSha256: HASH }),
      execute: async () => ({
        outcome: "verified",
        authorizationConsumed: true,
        evidenceSha256: HASH,
        authoritativeConsumptionEvidence:
          value.request.ai_131.expected_consumption,
      }),
    },
    exportBoundary: {
      preflight: async () => {
        exportPreflights += 1;
        return { authorized: false, evidenceSha256: HASH };
      },
      execute: async () => ({
        outcome: "blocked",
        authorizationConsumed: false,
        evidenceSha256: HASH,
      }),
    },
  });
  assert.equal(result["final_state"], "recovery_required");
  assert.equal(exportPreflights, 1);
});

test("verified AI-132 callback with missing package record becomes recovery", async () => {
  const value = await fixture();
  const result = await runGovernedArcaSchedulerOnce({
    ...value,
    runId: "missing-ai-132-package-record",
    ownerId: "owner",
    processIdentity: "process",
    timestamp: NOW,
    trustedNow: () => NOW,
    observation: observation(value),
    ...authoritativeRuntimeInspectors(value),
    acquisitionBoundary: {
      preflight: async () => ({ authorized: true, evidenceSha256: HASH }),
      execute: async () => ({
        outcome: "verified",
        authorizationConsumed: true,
        evidenceSha256: HASH,
      }),
    },
    exportBoundary: {
      preflight: async () => ({ authorized: true, evidenceSha256: HASH }),
      execute: async () => {
        await unlink(value.request.ai_132.durable_result.path);
        return {
          outcome: "verified",
          authorizationConsumed: true,
          evidenceSha256: HASH,
        };
      },
    },
  });
  assert.equal(result["final_state"], "recovery_required");
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
    (
      await loadExactRequestBoundArtifact(
        value.request.ai_131.proposal,
        dirname(value.request.ai_131.proposal.path),
        { identityField: "proposal_id", sha256Field: "proposal_sha256" },
      )
    )["proposal_id"],
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
    loadExactRequestBoundArtifact(
      value.request.ai_131.proposal,
      dirname(value.request.ai_131.proposal.path),
      { identityField: "proposal_id", sha256Field: "proposal_sha256" },
    ),
    /hash_mismatch|noncanonical/,
  );
});

test("artifact-specific identity rejects an unrelated matching id field", async () => {
  const value = await fixture();
  const path = join(value.root, "wrong-semantic-identity.json");
  const artifact = {
    proposal_id: "wrong-proposal",
    authorization_id: value.request.ai_131.proposal.identity,
    proposal_sha256: HASH,
  };
  await writeFile(path, canonicalBytes(artifact));
  await assert.rejects(
    loadExactRequestBoundArtifact(
      {
        path,
        identity: value.request.ai_131.proposal.identity,
        sha256: HASH,
        canonical_sha256: bytesHash(artifact),
      },
      value.root,
      { identityField: "proposal_id", sha256Field: "proposal_sha256" },
    ),
    /identity_mismatch/,
  );
});

test("artifact-specific semantic hash rejects an unrelated matching hash field", async () => {
  const value = await fixture();
  const path = join(value.root, "wrong-semantic-hash.json");
  const artifact = {
    proposal_id: value.request.ai_131.proposal.identity,
    proposal_sha256: "b".repeat(64),
    authorization_sha256: HASH,
  };
  await writeFile(path, canonicalBytes(artifact));
  await assert.rejects(
    loadExactRequestBoundArtifact(
      {
        path,
        identity: value.request.ai_131.proposal.identity,
        sha256: HASH,
        canonical_sha256: bytesHash(artifact),
      },
      value.root,
      { identityField: "proposal_id", sha256Field: "proposal_sha256" },
    ),
    /semantic_hash_mismatch/,
  );
});

test("exact artifact outside its reviewed root is rejected", async () => {
  const value = await fixture();
  await assert.rejects(
    loadExactRequestBoundArtifact(
      value.request.ai_131.proposal,
      join(value.root, "different-reviewed-root"),
      { identityField: "proposal_id", sha256Field: "proposal_sha256" },
    ),
    /root_substitution/,
  );
});

test("atomic scheduler lease competition permits exactly one acquisition", async () => {
  const value = await fixture();
  const outcomes = await Promise.all([
    acquireSchedulerLease({
      configuration: value.configuration,
      activation: value.activation,
      ownerId: "owner-a",
      processIdentity: "process-a",
      timestamp: NOW,
    }),
    acquireSchedulerLease({
      configuration: value.configuration,
      activation: value.activation,
      ownerId: "owner-b",
      processIdentity: "process-b",
      timestamp: NOW,
    }),
  ]);
  assert.equal(
    outcomes.filter((outcome) => outcome.status === "acquired").length,
    1,
  );
  assert.equal(
    outcomes.filter((outcome) => outcome.status === "competing").length,
    1,
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
  let ai131Returned = false;
  let ai132Executions = 0;
  const result = await runGovernedArcaSchedulerOnce({
    ...value,
    runId: "expires-after-ai-131-consumption",
    ownerId: "owner",
    processIdentity: "process",
    timestamp: NOW,
    trustedNow: () => (ai131Returned ? value.activation.expires_at : NOW),
    observation: observation(value),
    ...authoritativeRuntimeInspectors(value),
    acquisitionBoundary: {
      preflight: async () => ({ authorized: true, evidenceSha256: HASH }),
      execute: async () => {
        ai131Returned = true;
        return {
          outcome: "verified",
          authorizationConsumed: true,
          evidenceSha256: HASH,
          authoritativeConsumptionEvidence:
            value.request.ai_131.expected_consumption,
        };
      },
    },
    exportBoundary: {
      preflight: async () => ({ authorized: true, evidenceSha256: HASH }),
      execute: async () => {
        ai132Executions += 1;
        return {
          outcome: "verified",
          authorizationConsumed: true,
          evidenceSha256: HASH,
        };
      },
    },
  });
  assert.equal(result["final_state"], "recovery_required");
  assert.equal(ai132Executions, 0);
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
    ...authoritativeRuntimeInspectors(value, "malformed_evidence"),
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
    ...authoritativeRuntimeInspectors(
      value,
      "consumed_completed",
      "malformed_evidence",
    ),
    acquisitionBoundary: {
      preflight: async () => ({ authorized: true, evidenceSha256: HASH }),
      execute: async () => ({
        outcome: "verified",
        authorizationConsumed: true,
        evidenceSha256: HASH,
      }),
    },
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
  let pulses = 0;
  const result = await runGovernedArcaSchedulerOnce({
    ...value,
    runId: "delayed-ai-131-heartbeats",
    ownerId: "owner",
    processIdentity: "process",
    timestamp: NOW,
    trustedNow: () => NOW,
    heartbeatWait: async (signal) => {
      if (signal.aborted) return;
      if (pulses >= 3) {
        await new Promise<void>((resolveAbort) =>
          signal.addEventListener("abort", () => resolveAbort(), {
            once: true,
          }),
        );
        return;
      }
      await new Promise<void>((resolveImmediate) =>
        setImmediate(resolveImmediate),
      );
      pulses += 1;
    },
    observation: observation(value),
    ...authoritativeRuntimeInspectors(value),
    acquisitionBoundary: {
      preflight: async () => ({ authorized: true, evidenceSha256: HASH }),
      execute: async () => {
        while (pulses < 2)
          await new Promise<void>((resolveImmediate) =>
            setImmediate(resolveImmediate),
          );
        return {
          outcome: "verified",
          authorizationConsumed: true,
          evidenceSha256: HASH,
          authoritativeConsumptionEvidence:
            value.request.ai_131.expected_consumption,
        };
      },
    },
    exportBoundary: {
      preflight: async () => ({ authorized: true, evidenceSha256: HASH }),
      execute: async () => ({
        outcome: "verified",
        authorizationConsumed: true,
        evidenceSha256: HASH,
      }),
    },
  });
  assert.equal(result["final_state"], "completed");
  assert.ok(pulses >= 2);
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
    ...authoritativeRuntimeInspectors(value),
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

test("heartbeat failure during result persistence writes durable recovery", async () => {
  const value = await fixture();
  const resultsRoot = join(value.configuration.state_root.path, "results");
  const result = await runGovernedArcaSchedulerOnce({
    ...value,
    runId: "result-persistence-heartbeat-failure",
    ownerId: "owner",
    processIdentity: "process",
    timestamp: NOW,
    trustedNow: () => NOW,
    heartbeatWait: async (signal) => {
      while (!signal.aborted) {
        const visible = await readdir(resultsRoot).catch(() => []);
        if (visible.length > 0)
          throw new Error("result_persistence_heartbeat_failed");
        await new Promise<void>((resolveImmediate) =>
          setImmediate(resolveImmediate),
        );
      }
    },
    observation: observation(value),
    ...successfulRuntimeBoundaries(value),
  });
  assert.equal(result["final_state"], "recovery_required");
  assert.match(
    String(result["stop_reason"]),
    /result_persistence_heartbeat_failed/,
  );
  const recovery = JSON.parse(
    await readFile(
      join(
        value.configuration.state_root.path,
        "recovery-results",
        "result-persistence-heartbeat-failure.json",
      ),
      "utf8",
    ),
  ) as Record<string, unknown>;
  assert.equal(recovery["final_state"], "recovery_required");
  assert.ok(await readFile(schedulerLeasePath(value.configuration), "utf8"));
});

test("final in-flight heartbeat failure after journal completion prevents release", async () => {
  const value = await fixture();
  const completedRoot = join(
    value.configuration.state_root.path,
    "completed-journals",
  );
  const result = await runGovernedArcaSchedulerOnce({
    ...value,
    runId: "journal-completion-in-flight-heartbeat-failure",
    ownerId: "owner",
    processIdentity: "process",
    timestamp: NOW,
    trustedNow: () => NOW,
    heartbeatWait: async (signal) =>
      new Promise<void>((resolveWait, rejectWait) => {
        signal.addEventListener(
          "abort",
          () => {
            void readdir(completedRoot)
              .then((entries) => {
                if (entries.length > 0)
                  rejectWait(new Error("journal_completion_heartbeat_failed"));
                else resolveWait();
              })
              .catch(() => resolveWait());
          },
          { once: true },
        );
      }),
    observation: observation(value),
    ...successfulRuntimeBoundaries(value),
  });
  assert.equal(result["final_state"], "recovery_required");
  assert.match(
    String(result["stop_reason"]),
    /journal_completion_heartbeat_failed/,
  );
  assert.ok(await readFile(schedulerLeasePath(value.configuration), "utf8"));
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
        status: "positively_not_consumed",
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
      attemptReservations:
        inspector === "ai131"
          ? [await reserve(value, "ai_131")]
          : [await reserve(value, "ai_131"), await reserve(value, "ai_132")],
      ...(inspector === "ai131"
        ? {
            inspectAi131: async () => ({
              status: "unknown_delivery" as const,
              evidence: value.request.ai_131.expected_consumption,
            }),
          }
        : {
            inspectAi131: async () => ({
              status: "consumed_completed" as const,
              evidence: value.request.ai_131.expected_consumption,
            }),
            inspectAi132: async () => ({
              status: "unknown_delivery" as const,
              evidence: value.request.ai_132.expected_consumption,
            }),
          }),
    });
    assert.equal(decision["decision"], "recovery_required");
  });

test("repeated recovery is idempotent", async () => {
  const value = await fixture();
  const lease = await expiredLease(value);
  const input = {
    configuration: value.configuration,
    lease,
    journal: recoveryJournal(value, lease, "acquisition_execution_started"),
    timestamp: LATER,
    attemptReservations: [await reserve(value, "ai_131")],
    inspectAi131: async () => ({
      status: "positively_not_consumed" as const,
      evidence: value.request.ai_131.expected_consumption,
    }),
  };
  assert.deepEqual(
    await inspectSchedulerRecovery(input),
    await inspectSchedulerRecovery(input),
  );
});

test("AI-131-only completion is blocked before AI-132", async () => {
  const value = await fixture();
  const lease = await expiredLease(value);
  const decision = await inspectSchedulerRecovery({
    configuration: value.configuration,
    lease,
    journal: recoveryJournal(value, lease, "acquisition_execution_started"),
    timestamp: LATER,
    attemptReservations: [await reserve(value, "ai_131")],
    inspectAi131: async () => ({
      status: "consumed_completed",
      evidence: value.request.ai_131.expected_consumption,
    }),
  });
  assert.equal(decision["decision"], "blocked_before_ai_132");
});

test("production-composed real inspectors require dual-boundary completion", async () => {
  const value = await fixture();
  const ai131 = await createRealAi131BoundaryFixture("real-dual-ai-131");
  const ai132 = await createRealAi132BoundaryFixture();
  try {
    assert.equal((await ai131.execute()).outcome, "completed");
    assert.equal((await ai132.execute()).outcome, "completed");
    const bound = withRealInspectorJournals(
      value,
      ai131,
      ai132,
      await ai132.journalId(),
    );
    const lease = await expiredLease(bound);
    const inspectors = realInspectors(bound, ai131, ai132);
    const decision = await inspectSchedulerRecovery({
      configuration: bound.configuration,
      lease,
      journal: recoveryJournal(bound, lease, "export_execution_started"),
      timestamp: LATER,
      attemptReservations: [
        await reserve(bound, "ai_131"),
        await reserve(bound, "ai_132"),
      ],
      inspectAi131: () => inspectors.inspectAi131(LATER),
      inspectAi132: () => inspectors.inspectAi132(LATER),
    });
    assert.equal(decision["decision"], "completed_after_recovery");
  } finally {
    await Promise.all([ai131.cleanup(), ai132.cleanup()]);
  }
});

test("production-composed real AI-131 completion without AI-132 is partial", async () => {
  const value = await fixture();
  const ai131 = await createRealAi131BoundaryFixture("real-partial-ai-131");
  const ai132 = await createRealAi132BoundaryFixture();
  try {
    assert.equal((await ai131.execute()).outcome, "completed");
    const absentAi132Journal = `arca-export-journal--${"a".repeat(64)}`;
    const bound = withRealInspectorJournals(
      value,
      ai131,
      ai132,
      absentAi132Journal,
    );
    const lease = await expiredLease(bound);
    let ai132Inspections = 0;
    const inspectors = realInspectors(bound, ai131, ai132);
    const decision = await inspectSchedulerRecovery({
      configuration: bound.configuration,
      lease,
      journal: recoveryJournal(bound, lease, "acquisition_execution_started"),
      timestamp: LATER,
      attemptReservations: [await reserve(bound, "ai_131")],
      inspectAi131: () => inspectors.inspectAi131(LATER),
      inspectAi132: async () => {
        ai132Inspections += 1;
        return inspectors.inspectAi132(LATER);
      },
    });
    assert.equal(decision["decision"], "blocked_before_ai_132");
    assert.equal(ai132Inspections, 0);
  } finally {
    await Promise.all([ai131.cleanup(), ai132.cleanup()]);
  }
});

test("production-composed real AI-132 recovery evidence requires recovery", async () => {
  const value = await fixture();
  const ai131 = await createRealAi131BoundaryFixture(
    "real-ai-132-recovery-ai-131",
  );
  const ai132 = await createRealAi132BoundaryFixture();
  try {
    assert.equal((await ai131.execute()).outcome, "completed");
    await assert.rejects(
      ai132.execute({ interruptAfterConsumptionBeforeJournalUpdate: true }),
      /consumption_visible_before_journal_update/,
    );
    const bound = withRealInspectorJournals(
      value,
      ai131,
      ai132,
      await ai132.journalId(),
    );
    const lease = await expiredLease(bound);
    const inspectors = realInspectors(bound, ai131, ai132);
    const decision = await inspectSchedulerRecovery({
      configuration: bound.configuration,
      lease,
      journal: recoveryJournal(bound, lease, "export_execution_started"),
      timestamp: LATER,
      attemptReservations: [
        await reserve(bound, "ai_131"),
        await reserve(bound, "ai_132"),
      ],
      inspectAi131: () => inspectors.inspectAi131(LATER),
      inspectAi132: () => inspectors.inspectAi132(LATER),
    });
    assert.equal(decision["decision"], "recovery_required");
  } finally {
    await Promise.all([ai131.cleanup(), ai132.cleanup()]);
  }
});

test("production-composed real AI-131 consumed recovery never inspects AI-132", async () => {
  const value = await fixture();
  const ai131 = await createRealAi131BoundaryFixture(
    "real-ai-131-consumed-recovery",
  );
  const ai132 = await createRealAi132BoundaryFixture();
  try {
    await assert.rejects(
      ai131.execute({ interruptAfterLifecycle: "acquisition_succeeded" }),
      /interrupted_after:acquisition_succeeded/,
    );
    const bound = withRealInspectorJournals(
      value,
      ai131,
      ai132,
      `arca-export-journal--${"b".repeat(64)}`,
    );
    const lease = await expiredLease(bound);
    const inspectors = realInspectors(bound, ai131, ai132);
    let ai132Inspections = 0;
    const decision = await inspectSchedulerRecovery({
      configuration: bound.configuration,
      lease,
      journal: recoveryJournal(bound, lease, "acquisition_execution_started"),
      timestamp: LATER,
      attemptReservations: [await reserve(bound, "ai_131")],
      inspectAi131: () => inspectors.inspectAi131(LATER),
      inspectAi132: async () => {
        ai132Inspections += 1;
        return inspectors.inspectAi132(LATER);
      },
    });
    assert.equal(decision["decision"], "recovery_required");
    assert.equal(ai132Inspections, 0);
  } finally {
    await Promise.all([ai131.cleanup(), ai132.cleanup()]);
  }
});

test("real AI-131 inspector resolves callback exception after durable completion", async () => {
  const value = await fixture();
  const ai131 = await createRealAi131BoundaryFixture(
    "real-ai-131-exception-completed",
  );
  const ai132 = await createRealAi132BoundaryFixture();
  try {
    await assert.rejects(async () => {
      assert.equal((await ai131.execute()).outcome, "completed");
      throw new Error("callback_lost_after_durable_completion");
    }, /callback_lost_after_durable_completion/);
    const bound = withRealInspectorJournals(
      value,
      ai131,
      ai132,
      `arca-export-journal--${"c".repeat(64)}`,
    );
    const inspection = await realInspectors(bound, ai131, ai132).inspectAi131(
      LATER,
    );
    assert.equal(inspection.status, "consumed_completed");
  } finally {
    await Promise.all([ai131.cleanup(), ai132.cleanup()]);
  }
});

test("real AI-132 inspector resolves callback exception as recovery-required", async () => {
  const value = await fixture();
  const ai131 = await createRealAi131BoundaryFixture(
    "real-ai-132-exception-ai-131",
  );
  const ai132 = await createRealAi132BoundaryFixture();
  try {
    await assert.rejects(
      ai132.execute({ interruptAfterConsumptionBeforeJournalUpdate: true }),
      /consumption_visible_before_journal_update/,
    );
    const bound = withRealInspectorJournals(
      value,
      ai131,
      ai132,
      await ai132.journalId(),
    );
    const inspection = await realInspectors(bound, ai131, ai132).inspectAi132(
      LATER,
    );
    assert.equal(inspection.status, "consumed_recovery_required");
  } finally {
    await Promise.all([ai131.cleanup(), ai132.cleanup()]);
  }
});

test("repeated real AI-132 unresolved recovery is idempotent and read-only", async () => {
  const value = await fixture();
  const ai131 = await createRealAi131BoundaryFixture(
    "real-ai-132-idempotent-ai-131",
  );
  const ai132 = await createRealAi132BoundaryFixture();
  try {
    assert.equal((await ai131.execute()).outcome, "completed");
    await assert.rejects(
      ai132.execute({ interruptAfterConsumptionBeforeJournalUpdate: true }),
      /consumption_visible_before_journal_update/,
    );
    const journalId = await ai132.journalId();
    const bound = withRealInspectorJournals(value, ai131, ai132, journalId);
    const lease = await expiredLease(bound);
    const journal = recoveryJournal(bound, lease, "export_execution_started");
    const reservations = [
      await reserve(bound, "ai_131"),
      await reserve(bound, "ai_132"),
    ];
    const inspectors = realInspectors(bound, ai131, ai132);
    const journalPath = join(
      ai132.configuration.export_state_root.path,
      "journals",
      `${journalId}.json`,
    );
    const before = await readFile(journalPath, "utf8");
    const input = {
      configuration: bound.configuration,
      lease,
      journal,
      timestamp: LATER,
      attemptReservations: reservations,
      inspectAi131: () => inspectors.inspectAi131(LATER),
      inspectAi132: () => inspectors.inspectAi132(LATER),
    };
    assert.deepEqual(
      await inspectSchedulerRecovery(input),
      await inspectSchedulerRecovery(input),
    );
    assert.equal(await readFile(journalPath, "utf8"), before);
  } finally {
    await Promise.all([ai131.cleanup(), ai132.cleanup()]);
  }
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
  assert.ok(
    (observed["reasons_for_not_executing"] as string[]).includes(
      "ai_131_authorization_missing_or_unverified",
    ),
  );
  assert.ok(
    (observed["reasons_for_not_executing"] as string[]).includes(
      "ai_131_unverified_reported_input",
    ),
  );
});

test("missing authorization and unresolved recovery are explicit observation blockers", async () => {
  const value = await fixture();
  const observed = await observeGovernedArcaScheduler({
    ...observation(value),
    ai131: {
      readiness: "ready",
      authorizationAvailable: false,
      recoveryState: "recovery_required",
      authoritative: true,
    },
    persist: false,
  });
  const reasons = observed["reasons_for_not_executing"] as string[];
  assert.ok(reasons.includes("ai_131_authorization_missing_or_unverified"));
  assert.ok(reasons.includes("ai_131_recovery_recovery_required"));
});

test("observe CLI ignores caller authoritative provenance flags", async () => {
  const value = await fixture();
  const observed = await observeGovernedSchedulerBundle(
    observation(value) as unknown as Record<string, unknown>,
  );
  assert.equal(observed["ai_131_readiness"], "unverified_reported_input");
  assert.equal(observed["ai_132_readiness"], "unverified_reported_input");
  assert.equal(
    observed["ai_130_integrity_status"],
    "unverified_reported_input",
  );
  assert.equal(observed["ai_131_authorization_available"], false);
  assert.equal(observed["ai_132_authorization_available"], false);
  assert.equal(observed["ai_131_recovery_state"], "unknown");
  assert.equal(observed["ai_132_recovery_state"], "unknown");
  assert.ok(
    (observed["reasons_for_not_executing"] as string[]).includes(
      "slot_eligibility_unverified",
    ),
  );
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
      attemptReservations: [],
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
    ...successfulRuntimeBoundaries(value),
  });
  assert.equal(result["final_state"], "completed");
  await assert.rejects(
    readFile(schedulerLeasePath(value.configuration)),
    /ENOENT/,
  );
});

test("blocked AI-131 callback with positive non-consumption never invokes AI-132", async () => {
  const value = await fixture();
  let ai132Calls = 0;
  const result = await runGovernedArcaSchedulerOnce({
    ...value,
    runId: "blocked-ai-131-no-export",
    ownerId: "owner",
    processIdentity: "process",
    timestamp: NOW,
    trustedNow: () => NOW,
    observation: observation(value),
    ...authoritativeRuntimeInspectors(value, "positively_not_consumed"),
    acquisitionBoundary: {
      preflight: async () => ({ authorized: true, evidenceSha256: HASH }),
      execute: async () => ({
        outcome: "blocked",
        authorizationConsumed: false,
        evidenceSha256: HASH,
      }),
    },
    exportBoundary: {
      preflight: async () => {
        ai132Calls += 1;
        return { authorized: true, evidenceSha256: HASH };
      },
      execute: async () => {
        ai132Calls += 1;
        return {
          outcome: "verified",
          authorizationConsumed: true,
          evidenceSha256: HASH,
        };
      },
    },
  });
  assert.equal(result["final_state"], "recovery_required");
  assert.equal(result["acquisition_outcome"], "positively_not_consumed");
  assert.equal(ai132Calls, 0);
});

test("unauthorized AI-131 preflight never invokes AI-132", async () => {
  const value = await fixture();
  let ai132Calls = 0;
  const result = await runGovernedArcaSchedulerOnce({
    ...value,
    runId: "unauthorized-ai-131-no-export",
    ownerId: "owner",
    processIdentity: "process",
    timestamp: NOW,
    trustedNow: () => NOW,
    observation: observation(value),
    ...authoritativeRuntimeInspectors(value),
    acquisitionBoundary: {
      preflight: async () => ({ authorized: false, evidenceSha256: HASH }),
      execute: async () => {
        throw new Error("must_not_execute");
      },
    },
    exportBoundary: {
      preflight: async () => {
        ai132Calls += 1;
        return { authorized: true, evidenceSha256: HASH };
      },
      execute: async () => {
        ai132Calls += 1;
        throw new Error("must_not_execute");
      },
    },
  });
  assert.equal(result["acquisition_outcome"], "not_authorized");
  assert.equal(result["final_state"], "recovery_required");
  assert.equal(ai132Calls, 0);
});

test("AI-131 callback exception plus visible authoritative completion permits AI-132 deterministically", async () => {
  const value = await fixture();
  let ai131Inspections = 0;
  let ai132Inspections = 0;
  let ai132Executions = 0;
  const inspectors = authoritativeRuntimeInspectors(value);
  const result = await runGovernedArcaSchedulerOnce({
    ...value,
    runId: "ai-131-exception-visible-completion",
    ownerId: "owner",
    processIdentity: "process",
    timestamp: NOW,
    trustedNow: () => NOW,
    observation: observation(value),
    inspectAi131: async () => {
      ai131Inspections += 1;
      return inspectors.inspectAi131();
    },
    inspectAi132: async () => {
      ai132Inspections += 1;
      return inspectors.inspectAi132();
    },
    acquisitionBoundary: {
      preflight: async () => ({ authorized: true, evidenceSha256: HASH }),
      execute: async () => {
        throw new Error("callback_lost_after_durable_completion");
      },
    },
    exportBoundary: {
      preflight: async () => ({ authorized: true, evidenceSha256: HASH }),
      execute: async () => {
        ai132Executions += 1;
        return {
          outcome: "verified",
          authorizationConsumed: true,
          evidenceSha256: HASH,
        };
      },
    },
  });
  assert.equal(result["final_state"], "completed");
  assert.equal(ai132Executions, 1);
  assert.equal(ai131Inspections, 2);
  assert.equal(ai132Inspections, 2);
});

test("AI-132 unknown retains lease and leaves its attempt recovery-required", async () => {
  const value = await fixture();
  const result = await runGovernedArcaSchedulerOnce({
    ...value,
    runId: "ai-132-unknown-retains-lease",
    ownerId: "owner",
    processIdentity: "process",
    timestamp: NOW,
    trustedNow: () => NOW,
    observation: observation(value),
    ...authoritativeRuntimeInspectors(
      value,
      "consumed_completed",
      "unknown_delivery",
    ),
    acquisitionBoundary: successfulRuntimeBoundaries(value).acquisitionBoundary,
    exportBoundary: {
      preflight: async () => ({ authorized: true, evidenceSha256: HASH }),
      execute: async () => ({
        outcome: "unknown",
        authorizationConsumed: true,
        evidenceSha256: HASH,
      }),
    },
  });
  assert.equal(result["final_state"], "recovery_required");
  assert.equal(result["export_outcome"], "unknown_delivery");
  assert.ok(await readFile(schedulerLeasePath(value.configuration), "utf8"));
  const ledgerRoot = join(
    value.configuration.state_root.path,
    "attempt-ledger",
    "reservations",
  );
  const records = await Promise.all(
    (await readdir(ledgerRoot)).map(async (name) =>
      JSON.parse(await readFile(join(ledgerRoot, name), "utf8")),
    ),
  );
  assert.equal(
    records.find(
      (record) =>
        (record as Record<string, unknown>)["boundary_type"] === "ai_132",
    )?.state,
    "recovery_required",
  );
});

for (const scenario of [
  "missing ledger manifest fails closed",
  "missing ledger directory fails closed",
  "deleted reservation evidence fails closed",
] as const)
  test(scenario, async () => {
    const durable = await durableRecoveryFixture(
      scenario === "deleted reservation evidence fails closed"
        ? "acquisition_execution_started"
        : "lease_acquired",
    );
    const ledgerRoot = join(
      durable.value.configuration.state_root.path,
      "attempt-ledger",
    );
    if (scenario === "missing ledger manifest fails closed")
      await rename(
        join(ledgerRoot, "manifest.json"),
        join(ledgerRoot, "manifest.removed"),
      );
    else if (scenario === "missing ledger directory fails closed")
      await rename(ledgerRoot, `${ledgerRoot}.removed`);
    else {
      const reservationRoot = join(ledgerRoot, "reservations");
      const [name] = await readdir(reservationRoot);
      assert.ok(name);
      await rename(
        join(reservationRoot, name),
        join(reservationRoot, `${name}.removed`),
      );
    }
    const loaded = await loadDurableSchedulerRecoveryEvidence(
      durable.input,
      durable.registry,
    );
    assert.equal(loaded.attemptLedgerManifest, undefined);
    assert.equal(loaded.reservations, undefined);
    const decision = await inspectSchedulerRecovery({
      configuration: loaded.configuration,
      lease: loaded.lease,
      journal: loaded.journal,
      timestamp: durable.input.timestamp,
      attemptLedgerManifest: loaded.attemptLedgerManifest,
      attemptReservations: loaded.reservations,
    });
    assert.equal(decision["decision"], "malformed_evidence");
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
    loadExactRequestBoundArtifact(
      {
        ...value.request.ai_131.proposal,
        path: linked,
      },
      dirname(linked),
      { identityField: "proposal_id", sha256Field: "proposal_sha256" },
    ),
    /symbolic_link_rejected/,
  );
});

import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  MAXIMUM_ACTIVATION_MILLISECONDS,
  acquireSchedulerLease,
  computeScheduledRunRequestSha256,
  computeSchedulerActivationSha256,
  computeSchedulerConfigurationSha256,
  computeSchedulerJournalSha256,
  computeSchedulerKillSwitchSha256,
  computeSchedulerLeaseSha256,
  generateSchedulerPilotSummary,
  heartbeatSchedulerLease,
  inspectSchedulerRecovery,
  observeGovernedArcaScheduler,
  releaseSchedulerLease,
  runGovernedArcaSchedulerOnce,
  schedulerActivationStatus,
  schedulerLeasePath,
  schedulerSchemaHashes,
  validateSchedulerConfiguration,
  validateSchedulerContract,
  type SchedulerActivation,
  type SchedulerConfiguration,
  type SchedulerKillSwitch,
  type SchedulerLease,
  type SchedulerRunJournal,
} from "../../src/scheduler/governed-arca-scheduler.js";

const NOW = "2026-07-23T12:00:00.000Z";
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

async function fixture(): Promise<{
  configuration: SchedulerConfiguration;
  activation: SchedulerActivation;
  killSwitch: SchedulerKillSwitch;
}> {
  const root = await mkdtemp(join(await realpath(tmpdir()), "ai-133-"));
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
    heartbeat_interval_seconds: 60,
    stale_lease_recovery_threshold_seconds: 900,
    maximum_observations_per_24_hours: 24,
    maximum_runs_per_24_hours: 1,
    state_root: { identity: "synthetic-state", path: join(root, "state") },
    observation_root: {
      identity: "synthetic-observations",
      path: join(root, "observations"),
    },
    ai_131: {
      configuration_id: "ai-131",
      configuration_sha256: "1".repeat(64),
      kill_switch_path: join(root, "ai-131-kill.json"),
      kill_switch_reviewed_sha256: "2".repeat(64),
    },
    ai_132: {
      configuration_id: "ai-132",
      configuration_sha256: "3".repeat(64),
      kill_switch_path: join(root, "ai-132-kill.json"),
      kill_switch_reviewed_sha256: "4".repeat(64),
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
    maximum_authorized_execution_attempts: 3,
    approver_identity: "human:approver",
    reviewer_identity: "human:reviewer",
    separation_of_duties: true,
    reason: "synthetic test only",
    rollback_owner_identity: "human:rollback",
    self_renewal_authorized: false,
    ...FALSE_AUTHORITIES,
  };
  const activation = {
    ...unsignedActivation,
    activation_sha256: computeSchedulerActivationSha256(unsignedActivation),
  };
  const unsignedSwitch: SchedulerKillSwitch = {
    schema_version: "1.0.0",
    kill_switch_id: "governed-arca-scheduler",
    kill_switch_sha256: "0".repeat(64),
    state: "disabled",
    observation_blocked: false,
    execution_blocked: false,
    reviewed_artifact_id: "synthetic-reviewed-switch",
    reviewed_by: "human:reviewer",
    reviewed_at: "2026-07-23T00:00:00.000Z",
    reason: "synthetic test only",
  };
  return {
    configuration,
    activation,
    killSwitch: {
      ...unsignedSwitch,
      kill_switch_sha256: computeSchedulerKillSwitchSha256(unsignedSwitch),
    },
  };
}

function journal(
  lease: SchedulerLease,
  options: {
    consumed?: boolean;
    exportConsumed?: boolean;
    unknown?: boolean;
  } = {},
): SchedulerRunJournal {
  const unsigned: SchedulerRunJournal = {
    schema_version: "1.0.0",
    journal_id: "synthetic-journal",
    journal_sha256: "0".repeat(64),
    run_id: "synthetic-run",
    request_id: "synthetic-request",
    request_sha256: "6".repeat(64),
    configuration_sha256: lease.scheduler_configuration_sha256,
    activation_sha256: lease.activation_sha256,
    lease_sha256: lease.lease_sha256,
    entries: [
      {
        sequence: 0,
        state: "lease_acquired",
        timestamp: NOW,
        evidence_sha256: lease.lease_sha256,
      },
    ],
    acquisition_authorization_consumed: options.consumed ?? false,
    export_authorization_consumed: options.exportConsumed ?? false,
    unknown_delivery: options.unknown ?? false,
    ...FALSE_AUTHORITIES,
  };
  return {
    ...unsigned,
    journal_sha256: computeSchedulerJournalSha256(unsigned),
  };
}

test("all nine AI-133 Draft 2020-12 contracts are closed and hash-addressed", async () => {
  const hashes = schedulerSchemaHashes();
  assert.equal(Object.keys(hashes).length, 9);
  for (const [name, hash] of Object.entries(hashes)) {
    assert.match(hash, /^[a-f0-9]{64}$/);
    const schema = JSON.parse(
      await readFile(
        `schemas/arca-scheduler-${name.replaceAll("_", "-")}.schema.json`,
        "utf8",
      ).catch(async () => {
        const aliases: Record<string, string> = {
          run_request: "schemas/arca-scheduled-run-request.schema.json",
          run_journal: "schemas/arca-scheduler-run-journal.schema.json",
          run_result: "schemas/arca-scheduler-run-result.schema.json",
          recovery_decision:
            "schemas/arca-scheduler-recovery-decision.schema.json",
        };
        return readFile(aliases[name]!, "utf8");
      }),
    ) as Record<string, unknown>;
    assert.equal(
      schema["$schema"],
      "https://json-schema.org/draft/2020-12/schema",
    );
    assert.equal(schema["additionalProperties"], false);
  }
});

test("repository-current scheduler and both independent boundaries remain blocked", async () => {
  const configuration = JSON.parse(
    await readFile("config/ai-133-governed-arca-scheduler.json", "utf8"),
  );
  const schedulerSwitch = JSON.parse(
    await readFile(
      "config/ai-133-governed-arca-scheduler-kill-switch.json",
      "utf8",
    ),
  );
  const ai131Switch = JSON.parse(
    await readFile(
      "config/ai-131-controlled-live-arca-kill-switch.json",
      "utf8",
    ),
  );
  const ai132Switch = JSON.parse(
    await readFile(
      "config/ai-132-governed-arca-export-kill-switch.json",
      "utf8",
    ),
  );
  assert.equal(validateSchedulerConfiguration(configuration), true);
  assert.equal(configuration.active, false);
  assert.equal(configuration.maximum_runs_per_24_hours, 0);
  assert.equal(schedulerSwitch.state, "active");
  assert.equal(schedulerSwitch.execution_blocked, true);
  assert.equal(ai131Switch.state, "active");
  assert.equal(ai131Switch.live_execution_blocked, true);
  assert.equal(ai132Switch.state, "active");
  assert.equal(ai132Switch.export_blocked, true);
});

test("configuration rejects malformed, substituted and unsafe timing data", async () => {
  const { configuration } = await fixture();
  assert.equal(validateSchedulerConfiguration(configuration), true);
  assert.equal(
    validateSchedulerConfiguration({
      ...configuration,
      configuration_sha256: "f".repeat(64),
    }),
    false,
  );
  assert.equal(
    validateSchedulerConfiguration({
      ...configuration,
      heartbeat_interval_seconds: configuration.lease_duration_seconds,
      configuration_sha256: computeSchedulerConfigurationSha256({
        ...configuration,
        heartbeat_interval_seconds: configuration.lease_duration_seconds,
      }),
    }),
    false,
  );
  assert.equal(
    validateSchedulerContract("configuration", {
      ...configuration,
      unexpected: true,
    }),
    false,
  );
});

test("activation fails closed for missing, future, expired, mismatch, excessive duration and duty conflicts", async () => {
  const { configuration, activation } = await fixture();
  assert.equal(schedulerActivationStatus(null, configuration, NOW), "missing");
  assert.equal(
    schedulerActivationStatus(activation, configuration, NOW),
    "active",
  );
  assert.equal(
    schedulerActivationStatus(
      activation,
      configuration,
      "2026-07-22T23:59:59.999Z",
    ),
    "future",
  );
  assert.equal(
    schedulerActivationStatus(activation, configuration, activation.expires_at),
    "expired",
  );
  for (const changed of [
    { scheduler_configuration_sha256: "f".repeat(64) },
    {
      reviewer_identity: activation.approver_identity,
    },
    {
      expires_at: new Date(
        Date.parse(activation.starts_at) + MAXIMUM_ACTIVATION_MILLISECONDS + 1,
      ).toISOString(),
    },
  ]) {
    const unsigned = {
      ...activation,
      ...changed,
      activation_sha256: "0".repeat(64),
    };
    const candidate = {
      ...unsigned,
      activation_sha256: computeSchedulerActivationSha256(unsigned),
    };
    assert.equal(
      schedulerActivationStatus(candidate, configuration, NOW),
      "invalid",
    );
  }
});

test("observation-only iteration makes zero network calls and preserves every false authority", async () => {
  const { configuration, activation, killSwitch } = await fixture();
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    calls += 1;
    throw new Error("network_forbidden");
  }) as typeof fetch;
  try {
    const observation = await observeGovernedArcaScheduler({
      configuration,
      activation,
      killSwitch,
      timestamp: NOW,
      ai131: {
        readiness: "not_authorized",
        authorizationAvailable: false,
        recoveryState: "clear",
      },
      ai132: {
        readiness: "not_authorized",
        authorizationAvailable: false,
        recoveryState: "clear",
      },
      ai130IntegrityStatus: "verified",
    });
    assert.equal(calls, 0);
    assert.equal(validateSchedulerContract("observation", observation), true);
    for (const key of Object.keys(FALSE_AUTHORITIES))
      assert.equal(observation[key], false);
    assert.deepEqual(observation["reasons_for_not_executing"], [
      "ai_131_not_authorized",
      "ai_132_not_authorized",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("atomic lease competition has one owner and an expired lease is never stolen", async () => {
  const { configuration, activation } = await fixture();
  const attempts = await Promise.all([
    acquireSchedulerLease({
      configuration,
      activation,
      ownerId: "owner-one",
      processIdentity: "process:one",
      timestamp: NOW,
    }),
    acquireSchedulerLease({
      configuration,
      activation,
      ownerId: "owner-two",
      processIdentity: "process:two",
      timestamp: NOW,
    }),
  ]);
  assert.equal(
    attempts.filter((value) => value.status === "acquired").length,
    1,
  );
  assert.equal(
    attempts.filter((value) => value.status === "competing").length,
    1,
  );
  const later = await acquireSchedulerLease({
    configuration,
    activation,
    ownerId: "owner-three",
    processIdentity: "process:three",
    timestamp: "2026-07-23T12:06:00.000Z",
  });
  assert.equal(later.status, "recovery_required");
});

test("heartbeat and release require exact ownership and exact lease bytes", async () => {
  const { configuration, activation } = await fixture();
  const acquired = await acquireSchedulerLease({
    configuration,
    activation,
    ownerId: "owner-one",
    processIdentity: "process:one",
    timestamp: NOW,
  });
  assert.equal(acquired.status, "acquired");
  const lease = acquired.lease!;
  await assert.rejects(
    heartbeatSchedulerLease({
      configuration,
      expectedLease: lease,
      ownerId: "other-owner",
      processIdentity: "process:one",
      timestamp: "2026-07-23T12:01:00.000Z",
    }),
    /lease_owner_mismatch/,
  );
  const next = await heartbeatSchedulerLease({
    configuration,
    expectedLease: lease,
    ownerId: lease.owner_id,
    processIdentity: lease.process_identity,
    timestamp: "2026-07-23T12:01:00.000Z",
  });
  assert.notEqual(next.lease_sha256, lease.lease_sha256);
  await assert.rejects(
    releaseSchedulerLease({
      configuration,
      expectedLease: lease,
      ownerId: lease.owner_id,
      processIdentity: lease.process_identity,
    }),
    /divergent_lease_bytes/,
  );
  await releaseSchedulerLease({
    configuration,
    expectedLease: next,
    ownerId: next.owner_id,
    processIdentity: next.process_identity,
  });
});

test("symlinked, malformed and divergent leases fail closed", async () => {
  const { configuration, activation } = await fixture();
  const path = schedulerLeasePath(configuration);
  await mkdir(join(configuration.state_root.path, "leases"), {
    recursive: true,
  });
  const target = join(configuration.state_root.path, "target.json");
  await writeFile(target, "{}\n");
  await symlink(target, path);
  await assert.rejects(
    acquireSchedulerLease({
      configuration,
      activation,
      ownerId: "owner-one",
      processIdentity: "process:one",
      timestamp: NOW,
    }),
    /symbolic_link_rejected/,
  );
});

test("recovery precedence distinguishes no journal, safe pre-authority, consumed authority and unknown delivery", async () => {
  const { configuration, activation } = await fixture();
  const acquired = await acquireSchedulerLease({
    configuration,
    activation,
    ownerId: "owner-one",
    processIdentity: "process:one",
    timestamp: NOW,
  });
  const lease = acquired.lease!;
  const cases = [
    [null, "lease_expired_recovery"],
    [journal(lease), "safe_abort_before_authority"],
    [journal(lease, { consumed: true }), "authority_consumed_recovery"],
    [journal(lease, { exportConsumed: true }), "authority_consumed_recovery"],
    [
      journal(lease, { consumed: true, unknown: true }),
      "unknown_delivery_manual_review",
    ],
    [{ malformed: true }, "malformed_evidence_fail_closed"],
  ] as const;
  for (const [evidence, expected] of cases) {
    const decision = inspectSchedulerRecovery({
      lease,
      journal: evidence,
      timestamp: "2026-07-23T12:10:00.000Z",
    });
    assert.equal(decision["decision"], expected);
    assert.equal(decision["automatic_retry_authorized"], false);
    assert.equal(decision["authorization_regeneration_authorized"], false);
    assert.equal(decision["kill_switch_change_authorized"], false);
    assert.equal(
      validateSchedulerContract("recovery_decision", decision),
      true,
    );
  }
});

test("duplicate run requests are identity-bound and cannot acquire duplicate publication", async () => {
  const request = {
    schema_version: "1.0.0",
    request_id: "request-one",
    request_sha256: "0".repeat(64),
    configuration_id: "configuration",
    configuration_sha256: "1".repeat(64),
    activation_id: "activation",
    activation_sha256: "2".repeat(64),
    mode: "run_once",
    scheduled_for: NOW,
    created_at: NOW,
    created_by: "human:operator",
    ai_131_proposal_path: null,
    ai_131_authorization_path: null,
    ai_132_proposal_path: null,
    ai_132_authorization_path: null,
    ...FALSE_AUTHORITIES,
  };
  const exact = {
    ...request,
    request_sha256: computeScheduledRunRequestSha256(request),
  };
  assert.equal(validateSchedulerContract("run_request", exact), true);
  assert.equal(
    validateSchedulerContract("run_request", {
      ...exact,
      created_by: "human:substituted",
    }),
    true,
  );
  assert.notEqual(
    computeScheduledRunRequestSha256(exact),
    computeScheduledRunRequestSha256({
      ...exact,
      created_by: "human:substituted",
    }),
  );
});

test("daily caps, no catch-up cadence and exact pilot summary counters are durable", async () => {
  const { configuration, activation, killSwitch } = await fixture();
  await observeGovernedArcaScheduler({
    configuration,
    activation,
    killSwitch,
    timestamp: NOW,
    ai131: {
      readiness: "not_authorized",
      authorizationAvailable: false,
      recoveryState: "clear",
    },
    ai132: {
      readiness: "not_authorized",
      authorizationAvailable: false,
      recoveryState: "clear",
    },
    ai130IntegrityStatus: "verified",
  });
  const second = await observeGovernedArcaScheduler({
    configuration,
    activation,
    killSwitch,
    timestamp: "2026-07-23T13:00:00.000Z",
    ai131: {
      readiness: "not_authorized",
      authorizationAvailable: false,
      recoveryState: "clear",
    },
    ai132: {
      readiness: "not_authorized",
      authorizationAvailable: false,
      recoveryState: "clear",
    },
    ai130IntegrityStatus: "verified",
    persist: false,
  });
  assert.equal(second["daily_observation_count"], 1);
  assert.equal(
    second["next_eligible_observation_at"],
    "2026-07-23T14:00:00.000Z",
  );
  const summary = await generateSchedulerPilotSummary({
    configuration,
    activation,
    timestamp: "2026-07-23T13:00:00.000Z",
  });
  assert.equal(summary["observations_recorded"], 1);
  assert.equal(summary["authorized_execution_attempts"], 0);
  assert.equal(summary["automatic_retries"], false);
});

test("activation expiry before authority blocks while consumed-authority recovery never invents a retry", async () => {
  const { configuration, activation } = await fixture();
  assert.equal(
    schedulerActivationStatus(activation, configuration, activation.expires_at),
    "expired",
  );
  const unsignedLease: SchedulerLease = {
    schema_version: "1.0.0",
    lease_id: "lease",
    lease_sha256: "0".repeat(64),
    scheduler_configuration_id: configuration.configuration_id,
    scheduler_configuration_sha256: configuration.configuration_sha256,
    activation_id: activation.activation_id,
    activation_sha256: activation.activation_sha256,
    owner_id: "owner",
    process_identity: "process",
    acquired_at: NOW,
    expires_at: activation.expires_at,
    heartbeat_at: NOW,
  };
  const lease = {
    ...unsignedLease,
    lease_sha256: computeSchedulerLeaseSha256(unsignedLease),
  };
  const recovery = inspectSchedulerRecovery({
    lease,
    journal: journal(lease, { consumed: true }),
    timestamp: activation.expires_at,
  });
  assert.equal(recovery["decision"], "authority_consumed_recovery");
  assert.equal(recovery["automatic_retry_authorized"], false);
  for (const key of Object.keys(FALSE_AUTHORITIES))
    assert.equal(recovery[key], false);
});

test("exact run completion journals every pre-authority state and invokes no absent boundary", async () => {
  const { configuration, activation, killSwitch } = await fixture();
  const unsignedRequest = {
    schema_version: "1.0.0",
    request_id: "request-completion",
    request_sha256: "0".repeat(64),
    configuration_id: configuration.configuration_id,
    configuration_sha256: configuration.configuration_sha256,
    activation_id: activation.activation_id,
    activation_sha256: activation.activation_sha256,
    mode: "run_once",
    scheduled_for: NOW,
    created_at: NOW,
    created_by: "human:operator",
    ai_131_proposal_path: null,
    ai_131_authorization_path: null,
    ai_132_proposal_path: null,
    ai_132_authorization_path: null,
    ...FALSE_AUTHORITIES,
  };
  const request = {
    ...unsignedRequest,
    request_sha256: computeScheduledRunRequestSha256(unsignedRequest),
  };
  const result = await runGovernedArcaSchedulerOnce({
    configuration,
    activation,
    killSwitch,
    request,
    runId: "run-completion",
    ownerId: "owner-completion",
    processIdentity: "process:completion",
    timestamp: NOW,
    observation: {
      configuration,
      activation,
      killSwitch,
      timestamp: NOW,
      ai131: {
        readiness: "not_authorized",
        authorizationAvailable: false,
        recoveryState: "clear",
      },
      ai132: {
        readiness: "not_authorized",
        authorizationAvailable: false,
        recoveryState: "clear",
      },
      ai130IntegrityStatus: "verified",
    },
    acquisitionBoundary: null,
    exportBoundary: null,
  });
  assert.equal(result["final_state"], "completed");
  assert.equal(result["acquisition_outcome"], "not_authorized");
  assert.equal(result["export_outcome"], "not_authorized");
  const completed = JSON.parse(
    await readFile(
      join(
        configuration.state_root.path,
        "completed-journals",
        "run-completion.json",
      ),
      "utf8",
    ),
  ) as SchedulerRunJournal;
  assert.deepEqual(
    completed.entries.slice(-4).map((entry) => entry.state),
    [
      "acquisition_not_authorized",
      "export_not_authorized",
      "observation_recorded",
      "completed",
    ],
  );
  assert.equal(validateSchedulerContract("run_journal", completed), true);
});

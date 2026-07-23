import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Ajv2020 as Ajv } from "ajv/dist/2020.js";

import {
  APPROVED_ARCA_SERVICE_BUILDER_IDENTITY,
  prepareApprovedArcaArtifact,
  type ApprovedArcaArtifact,
} from "../../src/artifacts/approved-arca-artifact-builder.js";
import { parseGovernedArcaExportArguments } from "../../src/cli/governed-arca-export.js";
import {
  ARCA_EXPORTER_CONFIGURATION_SHA256,
  ARCA_EXPORT_AUTHORIZATION_SCHEMA,
  ARCA_EXPORT_JOURNAL_SCHEMA,
  ARCA_EXPORT_KILL_SWITCH_SCHEMA,
  ARCA_EXPORT_PACKAGE_SCHEMA,
  ARCA_EXPORT_PROPOSAL_SCHEMA,
  ARCA_EXPORT_RESULT_SCHEMA,
  ARCA_EXPORT_ROOT_CONFIGURATION_SCHEMA,
  DURABLE_ARCA_EXPORT_RECORD_SCHEMA,
  arcaExportSchemaHashes,
  computeArcaExportAuthorizationSha256,
  computeArcaExportConfigurationSha256,
  computeArcaExportKillSwitchSha256,
  computeArcaExportProposalSha256,
  executeGovernedArcaExport,
  preflightGovernedArcaExport,
  recoverGovernedArcaExport,
  type ArcaExportAuthorization,
  type ArcaExportKillSwitch,
  type ArcaExportProposal,
  type ArcaExportRootConfiguration,
} from "../../src/export/governed-arca-export.js";
import type { GovernedArcaCandidateArtifact } from "../../src/ingestion/governed-arca-acquired-source.js";
import {
  ARCA_CANDIDATE_REVIEW_CONTRACT_VERSION,
  createArcaCandidateBinding,
  evaluateGovernedArcaCandidateReview,
  sealGovernedArcaCandidateReview,
  type GovernedArcaCandidateReview,
} from "../../src/review/governed-arca-candidate-review.js";
import { REVIEW_CANONICALIZATION_VERSION } from "../../src/review/review-artifact-binding.js";
import {
  DURABLE_ARCA_STORE_CONFIGURATION_SHA256,
  executeDurableArcaStoreCommand,
  type DurableArcaStoreCommand,
  type DurableArcaStoreOperation,
} from "../../src/store/durable-arca-review-store.js";

const NOW = "2026-07-22T18:00:00.000Z";
const AUTHORITIES = {
  export_authorized: false,
  publication_authorized: false,
  production_authorized: false,
  network_authorized: false,
  database_authorized: false,
  scheduler_authorized: false,
  deployment_authorized: false,
  vlatam_global_access_authorized: false,
} as const;

interface Fixture {
  root: string;
  proposal: ArcaExportProposal;
  authorization: ArcaExportAuthorization;
  killSwitch: ArcaExportKillSwitch;
  killSwitchPath: string;
  configuration: ArcaExportRootConfiguration;
  artifact: ApprovedArcaArtifact;
}

function command(
  operation: DurableArcaStoreOperation,
  governed_record: unknown,
  timestamp: string,
): DurableArcaStoreCommand {
  return {
    schema_version: "1.0.0",
    operation,
    actor_identity: "human:synthetic-persistence-actor",
    event_timestamp: timestamp,
    candidate_id: null,
    governed_record,
    ...AUTHORITIES,
  };
}

function approvedReview(
  candidate: GovernedArcaCandidateArtifact,
): GovernedArcaCandidateReview {
  return sealGovernedArcaCandidateReview({
    schema_version: ARCA_CANDIDATE_REVIEW_CONTRACT_VERSION,
    artifact_type: "governed_arca_candidate_human_review",
    canonicalization_version: REVIEW_CANONICALIZATION_VERSION,
    candidate_binding: createArcaCandidateBinding(candidate),
    lifecycle: "approved",
    lifecycle_transition: { from: "pending", to: "approved" },
    scope: "approved_artifact_building_only",
    reviewer: {
      identity: "human:synthetic-reviewer",
      identity_type: "human",
      role: "evidence_reviewer",
    },
    decision_timestamp: "2026-07-22T13:00:00.000Z",
    expires_at: "2026-08-22T00:00:00.000Z",
    review_statement: "Synthetic test-only approval.",
    rejection_reason: null,
    reason_codes: [
      "identity_verified",
      "provenance_verified",
      "parser_output_verified",
      "completeness_verified",
      "regulatory_accuracy_verified",
    ],
    findings: [],
    separation_of_duties: {
      acquisition_operator_identity: "human:synthetic-acquisition",
      parser_runtime_identity: "runtime:arca-nomenclador-txt@1.0.0",
      candidate_producer_identity: "human:synthetic-producer",
      evidence_reviewer_identity: "human:synthetic-reviewer",
      future_artifact_builder_identity: null,
      future_publisher_export_approver_identity: null,
      reviewer_independence_asserted: true,
    },
    superseded_by: null,
  });
}

function rehashProposal(value: ArcaExportProposal): ArcaExportProposal {
  const blank = {
    ...value,
    proposal_id: `arca-export-proposal--${"0".repeat(64)}`,
    proposal_sha256: "0".repeat(64),
  };
  const hash = computeArcaExportProposalSha256(blank);
  return {
    ...blank,
    proposal_id: `arca-export-proposal--${hash}`,
    proposal_sha256: hash,
  };
}
function rehashAuthorization(
  value: ArcaExportAuthorization,
): ArcaExportAuthorization {
  const blank = {
    ...value,
    authorization_id: `arca-export-authorization--${"0".repeat(64)}`,
    authorization_sha256: "0".repeat(64),
  };
  const hash = computeArcaExportAuthorizationSha256(blank);
  return {
    ...blank,
    authorization_id: `arca-export-authorization--${hash}`,
    authorization_sha256: hash,
  };
}

async function fixture(): Promise<Fixture> {
  const root = await mkdtemp(join(await realpath(tmpdir()), "ai-132-"));
  const store = join(root, "store");
  const exportRoot = join(root, "exports");
  const state = join(root, "state");
  await Promise.all([mkdir(exportRoot), mkdir(state)]);
  const source = JSON.parse(
    await readFile("data/fixtures/arca/ai-127-pending-review.json", "utf8"),
  ) as { candidate: GovernedArcaCandidateArtifact };
  const candidate = source.candidate;
  const review = approvedReview(candidate);
  const evaluation = evaluateGovernedArcaCandidateReview(
    candidate,
    review,
    "2026-07-22T14:00:00.000Z",
  );
  const prepared = prepareApprovedArcaArtifact({
    candidate,
    review,
    evaluation,
    builderIdentity: APPROVED_ARCA_SERVICE_BUILDER_IDENTITY,
    buildTimestamp: "2026-07-22T15:00:00.000Z",
  });
  assert.ok("artifact" in prepared);
  const artifact = prepared.artifact;
  for (const [operation, value, timestamp] of [
    ["record_candidate", candidate, "2026-07-22T15:00:00.000Z"],
    ["record_review", review, "2026-07-22T15:01:00.000Z"],
    ["record_evaluation", evaluation, "2026-07-22T15:02:00.000Z"],
    ["record_approved_artifact", artifact, "2026-07-22T15:03:00.000Z"],
  ] as const) {
    const recorded = await executeDurableArcaStoreCommand(
      store,
      command(operation, value, timestamp),
    );
    assert.equal(recorded.success, true, recorded.details.join(","));
  }
  const eventNames = await readdir(join(store, "events"));
  const event = JSON.parse(
    await readFile(join(store, "events", eventNames.sort().at(-1)!), "utf8"),
  ) as { event_id: string; event_sha256: string };
  let configuration: ArcaExportRootConfiguration = {
    schema_version: "1.0.0",
    configuration_id: "synthetic-ai-132-roots",
    configuration_sha256: "0".repeat(64),
    durable_store: {
      identity: "root:synthetic-durable-store",
      path: store,
      configuration_sha256: DURABLE_ARCA_STORE_CONFIGURATION_SHA256,
    },
    export_root: { identity: "root:synthetic-export", path: exportRoot },
    export_state_root: { identity: "root:synthetic-export-state", path: state },
  };
  configuration = {
    ...configuration,
    configuration_sha256: computeArcaExportConfigurationSha256(configuration),
  };
  const proposal = rehashProposal({
    schema_version: "1.0.0",
    proposal_id: `arca-export-proposal--${"0".repeat(64)}`,
    proposal_sha256: "0".repeat(64),
    approved_artifact_id: artifact.approved_artifact_id,
    approved_artifact_sha256: artifact.approved_artifact_sha256,
    candidate_id: artifact.candidate_binding.candidate_artifact_id,
    candidate_sha256: artifact.candidate_binding.candidate_sha256,
    review_id: artifact.review_binding.review_id,
    review_sha256: artifact.review_binding.review_sha256,
    evaluation_id: artifact.evaluation_binding.evaluation_id,
    evaluation_sha256: artifact.evaluation_binding.evaluation_sha256,
    durable_store_configuration_sha256: DURABLE_ARCA_STORE_CONFIGURATION_SHA256,
    durable_store_event_id: event.event_id,
    durable_store_event_sha256: event.event_sha256,
    export_format: "vlatam-arca-approved-tariff-json",
    export_format_version: "1.0.0",
    package_schema_version: "1.0.0",
    target_logical_consumer: "vlatam-global",
    target_environment: "handoff_only",
    export_root_identity: configuration.export_root.identity,
    proposal_author_identity: "human:synthetic-proposer",
    proposed_at: "2026-07-22T16:00:00.000Z",
    export_window: {
      starts_at: "2026-07-22T17:00:00.000Z",
      expires_at: "2026-07-22T19:00:00.000Z",
    },
    maximum_exports: 1,
    publication_authority: false,
    deployment_authority: false,
    production_authority: false,
  });
  const authorization = rehashAuthorization({
    schema_version: "1.0.0",
    authorization_id: `arca-export-authorization--${"0".repeat(64)}`,
    authorization_sha256: "0".repeat(64),
    proposal_id: proposal.proposal_id,
    proposal_sha256: proposal.proposal_sha256,
    approved_artifact_id: proposal.approved_artifact_id,
    approved_artifact_sha256: proposal.approved_artifact_sha256,
    durable_store_event_id: proposal.durable_store_event_id,
    durable_store_event_sha256: proposal.durable_store_event_sha256,
    export_format: proposal.export_format,
    export_format_version: proposal.export_format_version,
    target_logical_consumer: "vlatam-global",
    authorization_identity: "human:synthetic-export-authorizer",
    authorized_at: "2026-07-22T16:30:00.000Z",
    not_before: "2026-07-22T17:00:00.000Z",
    expires_at: "2026-07-22T19:00:00.000Z",
    one_shot_nonce: "synthetic-one-shot-nonce-0001",
    scope: "governed_arca_export_package_only",
  });
  let killSwitch: ArcaExportKillSwitch = {
    schema_version: "1.0.0",
    kill_switch_id: "governed-arca-export",
    kill_switch_sha256: "0".repeat(64),
    state: "disabled",
    reviewed_artifact_id: "synthetic-test-only-disablement",
    reviewed_by: "human:synthetic-switch-reviewer",
    reviewed_at: "2026-07-22T16:45:00.000Z",
    reason: "Synthetic test fixture only.",
    export_blocked: false,
  };
  killSwitch = {
    ...killSwitch,
    kill_switch_sha256: computeArcaExportKillSwitchSha256(killSwitch),
  };
  const killSwitchPath = join(root, "kill-switch.json");
  await writeFile(killSwitchPath, `${JSON.stringify(killSwitch, null, 2)}\n`);
  return {
    root,
    proposal,
    authorization,
    killSwitch,
    killSwitchPath,
    configuration,
    artifact,
  };
}

function recoveryInput(value: Fixture, journalName: string) {
  return {
    configuration: value.configuration,
    journalId: journalName.slice(0, -5),
    killSwitch: value.killSwitch,
    killSwitchPath: value.killSwitchPath,
    recoveryTimestamp: NOW,
  };
}

test("synthetic preflight validates exact durable source with zero writes", async (t) => {
  const value = await fixture();
  t.after(() => rm(value.root, { recursive: true, force: true }));
  const before = await readdir(value.configuration.export_state_root.path);
  let networkCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    networkCalls += 1;
    throw new Error("AI-132 must not call fetch");
  }) as typeof fetch;
  const checked = await preflightGovernedArcaExport({
    proposal: value.proposal,
    authorization: value.authorization,
    killSwitch: value.killSwitch,
    configuration: value.configuration,
    executionTimestamp: NOW,
  }).finally(() => {
    globalThis.fetch = originalFetch;
  });
  assert.equal(checked.outcome, "package_exported", checked.details.join(","));
  assert.equal(checked.authorization_consumed, false);
  assert.deepEqual(
    await readdir(value.configuration.export_state_root.path),
    before,
  );
  assert.equal(networkCalls, 0);
  assert.match(ARCA_EXPORTER_CONFIGURATION_SHA256, /^[a-f0-9]{64}$/);
  assert.equal(
    Object.values(arcaExportSchemaHashes()).every((hash) =>
      /^[a-f0-9]{64}$/.test(hash),
    ),
    true,
  );
});

test("AI-132 in-memory and checked-in schemas compile as closed contracts", async () => {
  const inMemory = [
    ARCA_EXPORT_PROPOSAL_SCHEMA,
    ARCA_EXPORT_AUTHORIZATION_SCHEMA,
    ARCA_EXPORT_PACKAGE_SCHEMA,
    ARCA_EXPORT_RESULT_SCHEMA,
    DURABLE_ARCA_EXPORT_RECORD_SCHEMA,
    ARCA_EXPORT_JOURNAL_SCHEMA,
    ARCA_EXPORT_KILL_SWITCH_SCHEMA,
    ARCA_EXPORT_ROOT_CONFIGURATION_SCHEMA,
  ];
  for (const schema of inMemory) {
    assert.equal(schema.additionalProperties, false);
    assert.doesNotThrow(() => new Ajv({ strict: false }).compile(schema));
  }
  const approved = JSON.parse(
    await readFile("schemas/approved-arca-artifact.schema.json", "utf8"),
  );
  for (const path of [
    "schemas/arca-export-proposal.schema.json",
    "schemas/arca-export-authorization.schema.json",
    "schemas/arca-export-package.schema.json",
    "schemas/arca-export-result.schema.json",
    "schemas/durable-arca-export-record.schema.json",
    "schemas/arca-export-journal.schema.json",
    "schemas/arca-export-kill-switch.schema.json",
    "schemas/arca-export-root-configuration.schema.json",
  ]) {
    const schema = JSON.parse(await readFile(path, "utf8"));
    assert.equal(schema.additionalProperties, false, path);
    const ajv = new Ajv({ strict: false });
    ajv.addSchema(approved);
    assert.doesNotThrow(() => ajv.compile(schema), path);
  }
  const checkedJournal = JSON.parse(
    await readFile("schemas/arca-export-journal.schema.json", "utf8"),
  ) as { required: string[] };
  assert.deepEqual(
    [...ARCA_EXPORT_JOURNAL_SCHEMA.required].sort(),
    [...checkedJournal.required].sort(),
  );
  for (const binding of [
    "root_configuration_sha256",
    "export_root_identity",
    "export_state_root_identity",
    "kill_switch_sha256",
    "kill_switch_path",
    "consumption_relative_path",
    "consumption_bytes_sha256",
    "consumption_json",
  ]) {
    assert.equal(
      (ARCA_EXPORT_JOURNAL_SCHEMA.required as readonly string[]).includes(
        binding,
      ),
      true,
    );
    assert.equal(
      (
        DURABLE_ARCA_EXPORT_RECORD_SCHEMA.required as readonly string[]
      ).includes(binding),
      false,
    );
  }
});

test("repository-current, missing, and malformed export switches block", async (t) => {
  const value = await fixture();
  t.after(() => rm(value.root, { recursive: true, force: true }));
  const current = JSON.parse(
    await readFile(
      "config/ai-132-governed-arca-export-kill-switch.json",
      "utf8",
    ),
  );
  for (const killSwitch of [current, null, { schema_version: "1.0.0" }]) {
    const checked = await preflightGovernedArcaExport({
      proposal: value.proposal,
      authorization: value.authorization,
      killSwitch,
      configuration: value.configuration,
      executionTimestamp: NOW,
    });
    assert.equal(checked.outcome, "kill_switch_active");
  }
});

test("proposal, authorization, time, binding, and separation failures are fail closed", async (t) => {
  const value = await fixture();
  t.after(() => rm(value.root, { recursive: true, force: true }));
  const cases: ReadonlyArray<[unknown, unknown, string, string]> = [
    [{}, value.authorization, NOW, "invalid_proposal"],
    [value.proposal, {}, NOW, "invalid_authorization"],
    [
      value.proposal,
      value.authorization,
      "2026-07-22T16:59:00.000Z",
      "export_window_invalid",
    ],
    [
      value.proposal,
      value.authorization,
      "2026-07-22T19:00:00.000Z",
      "export_window_invalid",
    ],
    [
      value.proposal,
      rehashAuthorization({
        ...value.authorization,
        approved_artifact_sha256: "f".repeat(64),
      }),
      NOW,
      "binding_mismatch",
    ],
    [
      value.proposal,
      rehashAuthorization({
        ...value.authorization,
        authorization_identity: value.proposal.proposal_author_identity,
      }),
      NOW,
      "separation_of_duties_violation",
    ],
  ];
  for (const [proposal, authorization, executionTimestamp, expected] of cases) {
    const checked = await preflightGovernedArcaExport({
      proposal,
      authorization,
      killSwitch: value.killSwitch,
      configuration: value.configuration,
      executionTimestamp,
    });
    assert.equal(checked.outcome, expected);
  }
});

test("one competing export wins and exact package bytes are deterministic", async (t) => {
  const value = await fixture();
  t.after(() => rm(value.root, { recursive: true, force: true }));
  const input = {
    proposal: value.proposal,
    authorization: value.authorization,
    killSwitch: value.killSwitch,
    killSwitchPath: value.killSwitchPath,
    configuration: value.configuration,
    executionTimestamp: NOW,
  };
  const [first, second] = await Promise.all([
    executeGovernedArcaExport(input),
    executeGovernedArcaExport(input),
  ]);
  assert.deepEqual(
    new Set([first.outcome, second.outcome]),
    new Set(["completed", "authorization_already_consumed"]),
  );
  const packages = await readdir(
    join(value.configuration.export_root.path, "packages"),
  );
  assert.equal(packages.length, 1);
  const pkg = JSON.parse(
    await readFile(
      join(value.configuration.export_root.path, "packages", packages[0]!),
      "utf8",
    ),
  );
  assert.deepEqual(
    pkg.approved_tariff_payload,
    value.artifact.approved_payload,
  );
  assert.equal(pkg.external_network_transfer_performed, false);
  assert.equal(
    (await readdir(join(value.configuration.export_state_root.path, "records")))
      .length,
    1,
  );
});

test("crash after consumption recovers exact package and record without duplication", async (t) => {
  const value = await fixture();
  t.after(() => rm(value.root, { recursive: true, force: true }));
  await assert.rejects(
    () =>
      executeGovernedArcaExport({
        proposal: value.proposal,
        authorization: value.authorization,
        killSwitch: value.killSwitch,
        killSwitchPath: value.killSwitchPath,
        configuration: value.configuration,
        executionTimestamp: NOW,
        interruptAfterStage: "authorization_consumed",
      }),
    /interrupted_after/,
  );
  const [journalName] = await readdir(
    join(value.configuration.export_state_root.path, "journals"),
  );
  assert.ok(journalName);
  const recovered = await recoverGovernedArcaExport(
    recoveryInput(value, journalName),
  );
  assert.equal(recovered.outcome, "completed", recovered.details.join(","));
  assert.equal(
    (await readdir(join(value.configuration.export_root.path, "packages")))
      .length,
    1,
  );
  assert.equal(
    (await readdir(join(value.configuration.export_state_root.path, "records")))
      .length,
    1,
  );
  assert.equal(
    (
      await readdir(
        join(value.configuration.export_state_root.path, "journals"),
      )
    ).length,
    0,
  );
});

test("crash after package publication converges without a duplicate", async (t) => {
  const value = await fixture();
  t.after(() => rm(value.root, { recursive: true, force: true }));
  await assert.rejects(
    () =>
      executeGovernedArcaExport({
        proposal: value.proposal,
        authorization: value.authorization,
        killSwitch: value.killSwitch,
        killSwitchPath: value.killSwitchPath,
        configuration: value.configuration,
        executionTimestamp: NOW,
        interruptAfterStage: "package_published",
      }),
    /interrupted_after/,
  );
  const [journalName] = await readdir(
    join(value.configuration.export_state_root.path, "journals"),
  );
  const recovered = await recoverGovernedArcaExport(
    recoveryInput(value, journalName!),
  );
  assert.equal(recovered.outcome, "completed");
  assert.equal(
    (await readdir(join(value.configuration.export_root.path, "packages")))
      .length,
    1,
  );
});

test("prepared journal distinguishes absent from exact visible consumption", async (t) => {
  const beforeConsumption = await fixture();
  t.after(() => rm(beforeConsumption.root, { recursive: true, force: true }));
  await assert.rejects(
    () =>
      executeGovernedArcaExport({
        proposal: beforeConsumption.proposal,
        authorization: beforeConsumption.authorization,
        killSwitch: beforeConsumption.killSwitch,
        killSwitchPath: beforeConsumption.killSwitchPath,
        configuration: beforeConsumption.configuration,
        executionTimestamp: NOW,
        interruptAfterStage: "prepared",
      }),
    /interrupted_after/,
  );
  const [beforeJournal] = await readdir(
    join(beforeConsumption.configuration.export_state_root.path, "journals"),
  );
  const safeAbort = await recoverGovernedArcaExport(
    recoveryInput(beforeConsumption, beforeJournal!),
  );
  assert.equal(safeAbort.outcome, "recovery_required");
  assert.deepEqual(safeAbort.details, ["safe_abort_before_consumption"]);
  assert.equal(safeAbort.authorization_consumed, false);

  const afterConsumption = await fixture();
  t.after(() => rm(afterConsumption.root, { recursive: true, force: true }));
  await assert.rejects(
    () =>
      executeGovernedArcaExport({
        proposal: afterConsumption.proposal,
        authorization: afterConsumption.authorization,
        killSwitch: afterConsumption.killSwitch,
        killSwitchPath: afterConsumption.killSwitchPath,
        configuration: afterConsumption.configuration,
        executionTimestamp: NOW,
        interruptAfterConsumptionBeforeJournalUpdate: true,
      }),
    /consumption_visible_before_journal_update/,
  );
  const [afterJournal] = await readdir(
    join(afterConsumption.configuration.export_state_root.path, "journals"),
  );
  const recovered = await recoverGovernedArcaExport(
    recoveryInput(afterConsumption, afterJournal!),
  );
  assert.equal(recovered.outcome, "completed", recovered.details.join(","));
  assert.equal(recovered.authorization_consumed, true);
});

test("recovery fails closed for divergent or missing consumption evidence", async (t) => {
  const divergent = await fixture();
  t.after(() => rm(divergent.root, { recursive: true, force: true }));
  await assert.rejects(
    () =>
      executeGovernedArcaExport({
        proposal: divergent.proposal,
        authorization: divergent.authorization,
        killSwitch: divergent.killSwitch,
        killSwitchPath: divergent.killSwitchPath,
        configuration: divergent.configuration,
        executionTimestamp: NOW,
        interruptAfterConsumptionBeforeJournalUpdate: true,
      }),
    /interrupted_after/,
  );
  const consumptionPath = join(
    divergent.configuration.export_state_root.path,
    "consumptions",
    `${divergent.authorization.authorization_id}.json`,
  );
  await writeFile(consumptionPath, "{}\n");
  const [divergentJournal] = await readdir(
    join(divergent.configuration.export_state_root.path, "journals"),
  );
  const rejected = await recoverGovernedArcaExport(
    recoveryInput(divergent, divergentJournal!),
  );
  assert.equal(rejected.outcome, "recovery_required");
  assert.deepEqual(rejected.details, ["authorization_consumption_divergent"]);

  const missing = await fixture();
  t.after(() => rm(missing.root, { recursive: true, force: true }));
  await assert.rejects(
    () =>
      executeGovernedArcaExport({
        proposal: missing.proposal,
        authorization: missing.authorization,
        killSwitch: missing.killSwitch,
        killSwitchPath: missing.killSwitchPath,
        configuration: missing.configuration,
        executionTimestamp: NOW,
        interruptAfterStage: "authorization_consumed",
      }),
    /interrupted_after/,
  );
  await rm(
    join(
      missing.configuration.export_state_root.path,
      "consumptions",
      `${missing.authorization.authorization_id}.json`,
    ),
  );
  const [missingJournal] = await readdir(
    join(missing.configuration.export_state_root.path, "journals"),
  );
  const missingResult = await recoverGovernedArcaExport(
    recoveryInput(missing, missingJournal!),
  );
  assert.equal(missingResult.outcome, "recovery_required");
  assert.deepEqual(missingResult.details, [
    "authorization_consumption_missing",
  ]);
});

test("recovery requires the exact reviewed disabled kill switch", async (t) => {
  const value = await fixture();
  t.after(() => rm(value.root, { recursive: true, force: true }));
  await assert.rejects(
    () =>
      executeGovernedArcaExport({
        proposal: value.proposal,
        authorization: value.authorization,
        killSwitch: value.killSwitch,
        killSwitchPath: value.killSwitchPath,
        configuration: value.configuration,
        executionTimestamp: NOW,
        interruptAfterStage: "authorization_consumed",
      }),
    /interrupted_after/,
  );
  const [journalName] = await readdir(
    join(value.configuration.export_state_root.path, "journals"),
  );
  const activeBytes = await readFile(
    "config/ai-132-governed-arca-export-kill-switch.json",
    "utf8",
  );
  await writeFile(value.killSwitchPath, activeBytes);
  const active = JSON.parse(activeBytes);
  for (const [killSwitch, path] of [
    [active, value.killSwitchPath],
    [value.killSwitch, join(value.root, "missing-switch.json")],
  ] as const) {
    const blocked = await recoverGovernedArcaExport({
      ...recoveryInput(value, journalName!),
      killSwitch,
      killSwitchPath: path,
    });
    assert.equal(blocked.outcome, "kill_switch_active");
  }
  await rm(value.killSwitchPath);
  assert.equal(
    (await recoverGovernedArcaExport(recoveryInput(value, journalName!)))
      .outcome,
    "kill_switch_active",
  );
  await writeFile(value.killSwitchPath, "{}\n");
  assert.equal(
    (await recoverGovernedArcaExport(recoveryInput(value, journalName!)))
      .outcome,
    "kill_switch_active",
  );
  await writeFile(
    value.killSwitchPath,
    `${JSON.stringify({
      ...value.killSwitch,
      kill_switch_sha256: "f".repeat(64),
    })}\n`,
  );
  assert.equal(
    (await recoverGovernedArcaExport(recoveryInput(value, journalName!)))
      .outcome,
    "kill_switch_active",
  );
  const substitutedSwitch = {
    ...value.killSwitch,
    reason: "Different synthetic reviewed disablement.",
    kill_switch_sha256: "0".repeat(64),
  };
  substitutedSwitch.kill_switch_sha256 =
    computeArcaExportKillSwitchSha256(substitutedSwitch);
  await writeFile(
    value.killSwitchPath,
    `${JSON.stringify(substitutedSwitch)}\n`,
  );
  assert.equal(
    (
      await recoverGovernedArcaExport({
        ...recoveryInput(value, journalName!),
        killSwitch: substitutedSwitch,
      })
    ).outcome,
    "kill_switch_active",
  );
  assert.equal(
    (await readdir(join(value.configuration.export_root.path, "packages")))
      .length,
    0,
  );
  await writeFile(
    value.killSwitchPath,
    `${JSON.stringify(value.killSwitch, null, 2)}\n`,
  );
  let recoveryNetworkCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    recoveryNetworkCalls += 1;
    throw new Error("AI-132 recovery must not call fetch");
  }) as typeof fetch;
  const completed = await recoverGovernedArcaExport(
    recoveryInput(value, journalName!),
  ).finally(() => {
    globalThis.fetch = originalFetch;
  });
  assert.equal(completed.outcome, "completed");
  assert.equal(recoveryNetworkCalls, 0);
});

test("package-visible recovery validates exact bytes before recording", async (t) => {
  const value = await fixture();
  t.after(() => rm(value.root, { recursive: true, force: true }));
  await assert.rejects(
    () =>
      executeGovernedArcaExport({
        proposal: value.proposal,
        authorization: value.authorization,
        killSwitch: value.killSwitch,
        killSwitchPath: value.killSwitchPath,
        configuration: value.configuration,
        executionTimestamp: NOW,
        interruptAfterStage: "package_published",
      }),
    /interrupted_after/,
  );
  const [packageName] = await readdir(
    join(value.configuration.export_root.path, "packages"),
  );
  await writeFile(
    join(value.configuration.export_root.path, "packages", packageName!),
    "{}\n",
  );
  const [journalName] = await readdir(
    join(value.configuration.export_state_root.path, "journals"),
  );
  const rejected = await recoverGovernedArcaExport(
    recoveryInput(value, journalName!),
  );
  assert.equal(rejected.outcome, "package_collision");
  assert.equal(
    (await readdir(join(value.configuration.export_state_root.path, "records")))
      .length,
    0,
  );
});

test("duplicate recovery never creates a second package or record", async (t) => {
  const value = await fixture();
  t.after(() => rm(value.root, { recursive: true, force: true }));
  await assert.rejects(
    () =>
      executeGovernedArcaExport({
        proposal: value.proposal,
        authorization: value.authorization,
        killSwitch: value.killSwitch,
        killSwitchPath: value.killSwitchPath,
        configuration: value.configuration,
        executionTimestamp: NOW,
        interruptAfterStage: "package_published",
      }),
    /interrupted_after/,
  );
  const [journalName] = await readdir(
    join(value.configuration.export_state_root.path, "journals"),
  );
  assert.equal(
    (await recoverGovernedArcaExport(recoveryInput(value, journalName!)))
      .outcome,
    "completed",
  );
  assert.equal(
    (await recoverGovernedArcaExport(recoveryInput(value, journalName!)))
      .outcome,
    "recovery_required",
  );
  assert.equal(
    (await readdir(join(value.configuration.export_root.path, "packages")))
      .length,
    1,
  );
  assert.equal(
    (await readdir(join(value.configuration.export_state_root.path, "records")))
      .length,
    1,
  );
});

test("final kill-switch reread blocks publication after consumption", async (t) => {
  const value = await fixture();
  t.after(() => rm(value.root, { recursive: true, force: true }));
  await writeFile(
    value.killSwitchPath,
    await readFile(
      "config/ai-132-governed-arca-export-kill-switch.json",
      "utf8",
    ),
  );
  const blocked = await executeGovernedArcaExport({
    proposal: value.proposal,
    authorization: value.authorization,
    killSwitch: value.killSwitch,
    killSwitchPath: value.killSwitchPath,
    configuration: value.configuration,
    executionTimestamp: NOW,
  });
  assert.equal(blocked.outcome, "kill_switch_active");
  assert.equal(blocked.authorization_consumed, true);
  assert.equal(
    await readdir(value.configuration.export_root.path).then((entries) =>
      entries.includes("packages"),
    ),
    true,
  );
  assert.equal(
    (await readdir(join(value.configuration.export_root.path, "packages")))
      .length,
    0,
  );
  const [journalName] = await readdir(
    join(value.configuration.export_state_root.path, "journals"),
  );
  const activeSwitch = JSON.parse(await readFile(value.killSwitchPath, "utf8"));
  const recoveryBlocked = await recoverGovernedArcaExport({
    ...recoveryInput(value, journalName!),
    killSwitch: activeSwitch,
  });
  assert.equal(recoveryBlocked.outcome, "kill_switch_active");
  assert.equal(
    (await readdir(join(value.configuration.export_root.path, "packages")))
      .length,
    0,
  );
});

test("active AI-130 journal and symlinked export root fail closed", async (t) => {
  const value = await fixture();
  t.after(() => rm(value.root, { recursive: true, force: true }));
  await writeFile(
    join(value.configuration.durable_store.path, "journals", "active.json"),
    "{}\n",
  );
  const journalBlocked = await preflightGovernedArcaExport({
    proposal: value.proposal,
    authorization: value.authorization,
    killSwitch: value.killSwitch,
    configuration: value.configuration,
    executionTimestamp: NOW,
  });
  assert.equal(journalBlocked.outcome, "durable_store_invalid");
  await rm(
    join(value.configuration.durable_store.path, "journals", "active.json"),
  );
  const symlinkPath = join(value.root, "export-link");
  await symlink(value.configuration.export_root.path, symlinkPath);
  let unsafeConfiguration = {
    ...value.configuration,
    configuration_sha256: "0".repeat(64),
    export_root: { ...value.configuration.export_root, path: symlinkPath },
  };
  unsafeConfiguration = {
    ...unsafeConfiguration,
    configuration_sha256:
      computeArcaExportConfigurationSha256(unsafeConfiguration),
  };
  const unsafe = await preflightGovernedArcaExport({
    proposal: value.proposal,
    authorization: value.authorization,
    killSwitch: value.killSwitch,
    configuration: unsafeConfiguration,
    executionTimestamp: NOW,
  });
  assert.equal(unsafe.outcome, "binding_mismatch");
});

test("CLI accepts only the narrow local argument surface", () => {
  assert.throws(
    () => parseGovernedArcaExportArguments(["--url", "https://example.test"]),
    /unsupported_argument/,
  );
  assert.throws(
    () => parseGovernedArcaExportArguments(["--publication"]),
    /unsupported_argument/,
  );
  assert.deepEqual(parseGovernedArcaExportArguments(["--preflight"]), {
    preflight: "true",
  });
  assert.deepEqual(
    parseGovernedArcaExportArguments(["--recover-journal", "journal-id"]),
    { "recover-journal": "journal-id" },
  );
});

import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GOVERNED_ARCA_ACQUISITION_POLICY_SHA256 } from "../../src/acquisition/governed-source-acquisition.js";
import {
  APPROVED_ARCA_SERVICE_BUILDER_IDENTITY,
  prepareApprovedArcaArtifact,
  type ApprovedArcaArtifact,
} from "../../src/artifacts/approved-arca-artifact-builder.js";
import {
  computeArcaExportAuthorizationSha256,
  computeArcaExportConfigurationSha256,
  computeArcaExportKillSwitchSha256,
  computeArcaExportProposalSha256,
  executeGovernedArcaExport,
  type ArcaExportAuthorization,
  type ArcaExportExecutionInput,
  type ArcaExportKillSwitch,
  type ArcaExportProposal,
  type ArcaExportRootConfiguration,
} from "../../src/export/governed-arca-export.js";
import type { GovernedArcaCandidateArtifact } from "../../src/ingestion/governed-arca-acquired-source.js";
import {
  computeControlledLiveAuthorizationSha256,
  computeControlledLiveConfigurationSha256,
  computeControlledLiveKillSwitchSha256,
  computeControlledLiveProposalSha256,
  executeControlledLiveArcaRun,
  type ControlledLiveRunAuthorization,
  type ControlledLiveRunExecutionInput,
  type ControlledLiveRunKillSwitch,
  type ControlledLiveRunProposal,
  type ControlledLiveRunRootConfiguration,
} from "../../src/live-run/controlled-live-arca-run.js";
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

const AI131_NOW = "2026-07-22T12:00:00.000Z";
const AI132_NOW = "2026-07-22T18:00:00.000Z";
const URL = "https://www.arca.gob.ar/aduana/arancelintegrado/nomenclador.txt";
const CONTENT = "2@4202.92.00@10.00@20.00@3.00@@@@UN@@BOLSOS DE VIAJE\n";
const FALSE_AUTHORITIES = {
  export_authorized: false,
  publication_authorized: false,
  production_authorized: false,
  network_authorized: false,
  database_authorized: false,
  scheduler_authorized: false,
  deployment_authorized: false,
  vlatam_global_access_authorized: false,
} as const;

export interface RealAi131BoundaryFixture {
  readonly root: string;
  readonly runId: string;
  readonly configuration: ControlledLiveRunRootConfiguration;
  readonly killSwitch: ControlledLiveRunKillSwitch;
  readonly killSwitchPath: string;
  readonly execute: (
    overrides?: Partial<ControlledLiveRunExecutionInput>,
  ) => ReturnType<typeof executeControlledLiveArcaRun>;
  readonly cleanup: () => Promise<void>;
}

export async function createRealAi131BoundaryFixture(
  runId = "real-ai-131-run",
): Promise<RealAi131BoundaryFixture> {
  const root = await mkdtemp(
    join(await realpath(tmpdir()), "ai-133-real-ai-131-"),
  );
  const roots = {
    acquisition: join(root, "acquisitions"),
    candidate: join(root, "candidates"),
    store: join(root, "store"),
    state: join(root, "state"),
  };
  await Promise.all(
    Object.values(roots).map((path) => mkdir(path, { recursive: true })),
  );
  let configuration: ControlledLiveRunRootConfiguration = {
    schema_version: "1.0.0",
    configuration_id: "synthetic-ai-131-roots",
    configuration_sha256: "0".repeat(64),
    acquisition_output: {
      identity: "root:synthetic-acquisition",
      path: roots.acquisition,
    },
    candidate_output: {
      identity: "root:synthetic-candidate",
      path: roots.candidate,
    },
    durable_store: {
      identity: "root:synthetic-store",
      path: roots.store,
      configuration_sha256: DURABLE_ARCA_STORE_CONFIGURATION_SHA256,
    },
    run_state: { identity: "root:synthetic-run-state", path: roots.state },
  };
  configuration = {
    ...configuration,
    configuration_sha256:
      computeControlledLiveConfigurationSha256(configuration),
  };
  let proposal: ControlledLiveRunProposal = {
    schema_version: "1.0.0",
    proposal_id: `arca-live-proposal--${"0".repeat(64)}`,
    proposal_sha256: "0".repeat(64),
    created_at: "2026-07-22T10:00:00.000Z",
    proposal_author_identity: "human:proposer",
    requested_url: URL,
    expected_source_identity: "ar-arca-arancel-integrado",
    acquisition_policy_sha256: GOVERNED_ARCA_ACQUISITION_POLICY_SHA256,
    expected_media_type_family: "arca_delimited_text",
    maximum_response_bytes: 4096,
    timeout_ms: 1000,
    redirect_policy: "manual_allowlisted_host_only",
    acquisition_output_root_identity: configuration.acquisition_output.identity,
    candidate_output_root_identity: configuration.candidate_output.identity,
    durable_store_configuration_sha256: DURABLE_ARCA_STORE_CONFIGURATION_SHA256,
    acquisition_operator_identity: "human:operator",
    parser_runtime_identity: "service:arca-parser@1.0.0",
    candidate_producer_identity: "service:arca-candidate-producer@1.0.0",
    evidence_reviewer_identity: "human:reviewer",
    artifact_builder_identity: "service:arca-builder@1.0.0",
    future_publisher_identity: "human:publisher",
    execution_window: {
      starts_at: "2026-07-22T11:00:00.000Z",
      expires_at: "2026-07-22T13:00:00.000Z",
    },
    maximum_attempts: 1,
    maximum_successful_network_calls: 1,
    scheduler_authorized: false,
    export_authorized: false,
    publication_authorized: false,
    production_reliance_authorized: false,
  };
  const proposalHash = computeControlledLiveProposalSha256(proposal);
  proposal = {
    ...proposal,
    proposal_sha256: proposalHash,
    proposal_id: `arca-live-proposal--${proposalHash}`,
  };
  let authorization: ControlledLiveRunAuthorization = {
    schema_version: "1.0.0",
    authorization_id: `arca-live-authorization--${"0".repeat(64)}`,
    authorization_sha256: "0".repeat(64),
    proposal_id: proposal.proposal_id,
    proposal_sha256: proposal.proposal_sha256,
    requested_url: URL,
    acquisition_policy_sha256: GOVERNED_ARCA_ACQUISITION_POLICY_SHA256,
    expected_source_identity: "ar-arca-arancel-integrado",
    authorization_identity: "human:independent-authorizer",
    authorized_at: "2026-07-22T10:30:00.000Z",
    not_before: "2026-07-22T11:00:00.000Z",
    expires_at: "2026-07-22T13:00:00.000Z",
    maximum_attempts: 1,
    maximum_network_calls: 1,
    scope: "controlled_live_arca_acquisition_only",
  };
  const authorizationHash =
    computeControlledLiveAuthorizationSha256(authorization);
  authorization = {
    ...authorization,
    authorization_sha256: authorizationHash,
    authorization_id: `arca-live-authorization--${authorizationHash}`,
  };
  let killSwitch: ControlledLiveRunKillSwitch = {
    schema_version: "1.0.0",
    kill_switch_id: "controlled-live-arca-run",
    kill_switch_sha256: "0".repeat(64),
    state: "disabled",
    reviewed_artifact_id: "synthetic-reviewed-disablement",
    reviewed_by: "human:kill-switch-reviewer",
    reviewed_at: "2026-07-22T10:45:00.000Z",
    reason: "Synthetic local test fixture only.",
    live_execution_blocked: false,
  };
  killSwitch = {
    ...killSwitch,
    kill_switch_sha256: computeControlledLiveKillSwitchSha256(killSwitch),
  };
  const killSwitchPath = join(root, "kill-switch.json");
  await writeFile(killSwitchPath, `${JSON.stringify(killSwitch, null, 2)}\n`);
  const base: ControlledLiveRunExecutionInput = {
    runId,
    proposal,
    authorization,
    killSwitch,
    killSwitchPath,
    configuration,
    executionTimestamp: AI131_NOW,
    transport: async () =>
      new Response(CONTENT, {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
  };
  return {
    root,
    runId,
    configuration,
    killSwitch,
    killSwitchPath,
    execute: (overrides = {}) =>
      executeControlledLiveArcaRun({ ...base, ...overrides }),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
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
    ...FALSE_AUTHORITIES,
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

function rehashExportProposal(value: ArcaExportProposal): ArcaExportProposal {
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

function rehashExportAuthorization(
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

export interface RealAi132BoundaryFixture {
  readonly root: string;
  readonly configuration: ArcaExportRootConfiguration;
  readonly killSwitch: ArcaExportKillSwitch;
  readonly killSwitchPath: string;
  readonly execute: (
    overrides?: Partial<ArcaExportExecutionInput>,
  ) => ReturnType<typeof executeGovernedArcaExport>;
  readonly journalId: () => Promise<string>;
  readonly cleanup: () => Promise<void>;
}

export async function createRealAi132BoundaryFixture(): Promise<RealAi132BoundaryFixture> {
  const root = await mkdtemp(
    join(await realpath(tmpdir()), "ai-133-real-ai-132-"),
  );
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
  const artifact: ApprovedArcaArtifact = prepared.artifact;
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
  const proposal = rehashExportProposal({
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
  const authorization = rehashExportAuthorization({
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
    reason: "Synthetic local test fixture only.",
    export_blocked: false,
  };
  killSwitch = {
    ...killSwitch,
    kill_switch_sha256: computeArcaExportKillSwitchSha256(killSwitch),
  };
  const killSwitchPath = join(root, "kill-switch.json");
  await writeFile(killSwitchPath, `${JSON.stringify(killSwitch, null, 2)}\n`);
  const base: ArcaExportExecutionInput = {
    proposal,
    authorization,
    killSwitch,
    killSwitchPath,
    configuration,
    executionTimestamp: AI132_NOW,
  };
  return {
    root,
    configuration,
    killSwitch,
    killSwitchPath,
    execute: (overrides = {}) =>
      executeGovernedArcaExport({ ...base, ...overrides }),
    journalId: async () => {
      const active = await readdir(join(state, "journals"));
      const completed = await readdir(join(state, "completed-journals"));
      const [name] = [...active, ...completed];
      assert.ok(name);
      return name.slice(0, -5);
    },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

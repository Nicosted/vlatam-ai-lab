import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, mkdir, open, readFile, rename } from "node:fs/promises";
import { dirname, join, parse, relative, resolve, sep } from "node:path";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import {
  GOVERNED_ARCA_ACQUISITION_POLICY_SHA256,
  GOVERNED_ARCA_SOURCE_IDENTITY,
  SourceAcquisitionError,
  acquireSource,
  resolveGovernedArcaSourceIdentity,
  type SourceAcquisitionExecutionOptions,
  type SourceAcquisitionRecord,
} from "../acquisition/governed-source-acquisition.js";
import {
  ingestGovernedArcaAcquiredSource,
  type GovernedArcaAcquiredSourceInput,
  type GovernedArcaCandidateArtifact,
} from "../ingestion/governed-arca-acquired-source.js";
import {
  ARCA_NOMENCLADOR_PARSER_CONFIGURATION_HASH,
  ARCA_NOMENCLADOR_PARSER_ID,
  ARCA_NOMENCLADOR_PARSER_VERSION,
} from "../parsers/arca-nomenclador.js";
import {
  DURABLE_ARCA_STORE_CONFIGURATION_SHA256,
  DURABLE_ARCA_STORE_SERVICE_IDENTITY,
  executeDurableArcaStoreCommand,
  type DurableArcaStoreOperationResult,
} from "../store/durable-arca-review-store.js";

export const CONTROLLED_LIVE_RUN_PROPOSAL_VERSION = "1.0.0" as const;
export const CONTROLLED_LIVE_RUN_AUTHORIZATION_VERSION = "1.0.0" as const;
export const CONTROLLED_LIVE_RUN_RESULT_VERSION = "1.0.0" as const;
export const CONTROLLED_LIVE_RUN_RECORD_VERSION = "1.0.0" as const;
export const CONTROLLED_LIVE_RUN_JOURNAL_VERSION = "1.0.0" as const;
export const CONTROLLED_LIVE_RUN_KILL_SWITCH_VERSION = "1.0.0" as const;
export const CONTROLLED_LIVE_RUN_CONFIGURATION_VERSION = "1.0.0" as const;

const SHA256 = "^[a-f0-9]{64}$";
const TIMESTAMP =
  "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$";
const HUMAN = "^human:[a-z0-9][a-z0-9._@-]*$";
const IDENTITY = "^(?:human|service):[a-z0-9][a-z0-9._@/-]*$";
const RUN_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const AUTHORITY_FIELDS = {
  review_required: { const: true },
  approval: { const: false },
  approved_artifact_created: { const: false },
  export_authorized: { const: false },
  publication_authorized: { const: false },
  production_reliance_authorized: { const: false },
  scheduler_authorized: { const: false },
  deployment_authorized: { const: false },
  vlatam_global_access_authorized: { const: false },
} as const;
const AUTHORITY_KEYS = Object.keys(AUTHORITY_FIELDS);

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(",")}}`;
}

function domainHash(domain: string, value: unknown): string {
  return createHash("sha256")
    .update(domain)
    .update("\n")
    .update(canonicalize(value))
    .digest("hex");
}

function without<T extends Record<string, unknown>>(
  value: T,
  keys: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key)),
  );
}

export interface ControlledLiveRunProposal {
  readonly schema_version: "1.0.0";
  readonly proposal_id: string;
  readonly proposal_sha256: string;
  readonly created_at: string;
  readonly proposal_author_identity: string;
  readonly requested_url: string;
  readonly expected_source_identity: typeof GOVERNED_ARCA_SOURCE_IDENTITY;
  readonly acquisition_policy_sha256: string;
  readonly expected_media_type_family: "arca_delimited_text";
  readonly maximum_response_bytes: number;
  readonly timeout_ms: number;
  readonly redirect_policy: "manual_allowlisted_host_only";
  readonly acquisition_output_root_identity: string;
  readonly candidate_output_root_identity: string;
  readonly durable_store_configuration_sha256: string;
  readonly acquisition_operator_identity: string;
  readonly parser_runtime_identity: string;
  readonly candidate_producer_identity: string;
  readonly evidence_reviewer_identity: string;
  readonly artifact_builder_identity: string;
  readonly future_publisher_identity: string;
  readonly execution_window: {
    readonly starts_at: string;
    readonly expires_at: string;
  };
  readonly maximum_attempts: 1;
  readonly maximum_successful_network_calls: 1;
  readonly scheduler_authorized: false;
  readonly export_authorized: false;
  readonly publication_authorized: false;
  readonly production_reliance_authorized: false;
}

export interface ControlledLiveRunAuthorization {
  readonly schema_version: "1.0.0";
  readonly authorization_id: string;
  readonly authorization_sha256: string;
  readonly proposal_id: string;
  readonly proposal_sha256: string;
  readonly requested_url: string;
  readonly acquisition_policy_sha256: string;
  readonly expected_source_identity: typeof GOVERNED_ARCA_SOURCE_IDENTITY;
  readonly authorization_identity: string;
  readonly authorized_at: string;
  readonly not_before: string;
  readonly expires_at: string;
  readonly maximum_attempts: 1;
  readonly maximum_network_calls: 1;
  readonly scope: "controlled_live_arca_acquisition_only";
}

export interface ControlledLiveRunKillSwitch {
  readonly schema_version: "1.0.0";
  readonly kill_switch_id: "controlled-live-arca-run";
  readonly kill_switch_sha256: string;
  readonly state: "active" | "disabled";
  readonly reviewed_artifact_id: string;
  readonly reviewed_by: string;
  readonly reviewed_at: string;
  readonly reason: string;
  readonly live_execution_blocked: boolean;
}

export interface ControlledLiveRunRootConfiguration {
  readonly schema_version: "1.0.0";
  readonly configuration_id: string;
  readonly configuration_sha256: string;
  readonly acquisition_output: {
    readonly identity: string;
    readonly path: string;
  };
  readonly candidate_output: {
    readonly identity: string;
    readonly path: string;
  };
  readonly durable_store: {
    readonly identity: string;
    readonly path: string;
    readonly configuration_sha256: string;
  };
  readonly run_state: { readonly identity: string; readonly path: string };
}

export type ControlledLiveRunOutcome =
  | "invalid_proposal"
  | "invalid_authorization"
  | "authorization_expired"
  | "authorization_not_yet_valid"
  | "authorization_already_consumed"
  | "separation_of_duties_violation"
  | "kill_switch_active"
  | "source_not_allowlisted"
  | "source_binding_mismatch"
  | "policy_binding_mismatch"
  | "execution_window_invalid"
  | "run_already_exists"
  | "network_call_not_performed"
  | "acquisition_failed"
  | "ingestion_failed"
  | "candidate_persistence_failed"
  | "recovery_required"
  | "candidate_persisted"
  | "completed";

export type ControlledLiveRunLifecycle =
  | "proposed"
  | "authorized"
  | "authorization_consumed"
  | "acquisition_started"
  | "acquisition_succeeded"
  | "acquisition_failed"
  | "ingestion_succeeded"
  | "ingestion_failed"
  | "candidate_persisted"
  | "completed"
  | "recovery_required";

export interface ControlledLiveRunResult {
  readonly schema_version: "1.0.0";
  readonly result_type: "controlled_live_arca_run_result";
  readonly run_id: string;
  readonly proposal_id: string | null;
  readonly authorization_id: string | null;
  readonly lifecycle: ControlledLiveRunLifecycle;
  readonly outcome: ControlledLiveRunOutcome;
  readonly result_timestamp: string;
  readonly network_calls_attempted: number;
  readonly network_calls_completed: number;
  readonly authorization_consumed: boolean;
  readonly acquisition_bytes_persisted: boolean;
  readonly candidate_created: boolean;
  readonly candidate_durably_persisted: boolean;
  readonly details: readonly string[];
  readonly review_required: true;
  readonly approval: false;
  readonly approved_artifact_created: false;
  readonly export_authorized: false;
  readonly publication_authorized: false;
  readonly production_reliance_authorized: false;
  readonly scheduler_authorized: false;
  readonly deployment_authorized: false;
  readonly vlatam_global_access_authorized: false;
}

export interface ControlledLiveRunJournal {
  readonly schema_version: "1.0.0";
  readonly journal_type: "controlled_live_arca_run_journal";
  readonly journal_sha256: string;
  readonly run_id: string;
  readonly run_sha256: string;
  readonly proposal_id: string;
  readonly proposal_sha256: string;
  readonly authorization_id: string;
  readonly authorization_sha256: string;
  readonly authorization_consumption_id: string;
  readonly requested_url: string;
  readonly source_identity: string;
  readonly attempt_number: 1;
  readonly attempt_id: string;
  readonly transport_attempt_id: string;
  readonly lifecycle: ControlledLiveRunLifecycle;
  readonly delivery_status: "not_started" | "unknown" | "completed" | "failed";
  readonly created_at: string;
  readonly updated_at: string;
  readonly acquisition_record_id: string | null;
  readonly acquisition_record_sha256: string | null;
  readonly candidate_id: string | null;
  readonly candidate_sha256: string | null;
  readonly durable_store_event_id: string | null;
  readonly durable_store_event_sha256: string | null;
  readonly export_authorized: false;
  readonly publication_authorized: false;
  readonly production_reliance_authorized: false;
  readonly scheduler_authorized: false;
  readonly deployment_authorized: false;
  readonly vlatam_global_access_authorized: false;
}

export interface ControlledLiveRunRecord extends ControlledLiveRunResult {
  readonly record_type: "durable_controlled_live_arca_run_record";
  readonly record_sha256: string;
  readonly proposal_sha256: string;
  readonly authorization_sha256: string;
  readonly requested_url: string;
  readonly expected_source_identity: string;
  readonly acquisition_policy_sha256: string;
  readonly acquisition_record_id: string | null;
  readonly acquisition_record_sha256: string | null;
  readonly candidate_id: string | null;
  readonly candidate_sha256: string | null;
  readonly durable_store_event_id: string | null;
  readonly durable_store_event_sha256: string | null;
}

const proposalSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/controlled-live-arca-run-proposal.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "proposal_id",
    "proposal_sha256",
    "created_at",
    "proposal_author_identity",
    "requested_url",
    "expected_source_identity",
    "acquisition_policy_sha256",
    "expected_media_type_family",
    "maximum_response_bytes",
    "timeout_ms",
    "redirect_policy",
    "acquisition_output_root_identity",
    "candidate_output_root_identity",
    "durable_store_configuration_sha256",
    "acquisition_operator_identity",
    "parser_runtime_identity",
    "candidate_producer_identity",
    "evidence_reviewer_identity",
    "artifact_builder_identity",
    "future_publisher_identity",
    "execution_window",
    "maximum_attempts",
    "maximum_successful_network_calls",
    "scheduler_authorized",
    "export_authorized",
    "publication_authorized",
    "production_reliance_authorized",
  ],
  properties: {
    schema_version: { const: CONTROLLED_LIVE_RUN_PROPOSAL_VERSION },
    proposal_id: {
      type: "string",
      pattern: "^arca-live-proposal--[a-f0-9]{64}$",
    },
    proposal_sha256: { type: "string", pattern: SHA256 },
    created_at: { type: "string", pattern: TIMESTAMP },
    proposal_author_identity: { type: "string", pattern: IDENTITY },
    requested_url: { type: "string", minLength: 1 },
    expected_source_identity: { const: GOVERNED_ARCA_SOURCE_IDENTITY },
    acquisition_policy_sha256: { type: "string", pattern: SHA256 },
    expected_media_type_family: { const: "arca_delimited_text" },
    maximum_response_bytes: { type: "integer", minimum: 1 },
    timeout_ms: { type: "integer", minimum: 1 },
    redirect_policy: { const: "manual_allowlisted_host_only" },
    acquisition_output_root_identity: { type: "string", minLength: 1 },
    candidate_output_root_identity: { type: "string", minLength: 1 },
    durable_store_configuration_sha256: { type: "string", pattern: SHA256 },
    acquisition_operator_identity: { type: "string", pattern: IDENTITY },
    parser_runtime_identity: { type: "string", pattern: IDENTITY },
    candidate_producer_identity: { type: "string", pattern: IDENTITY },
    evidence_reviewer_identity: { type: "string", pattern: HUMAN },
    artifact_builder_identity: { type: "string", pattern: IDENTITY },
    future_publisher_identity: { type: "string", pattern: HUMAN },
    execution_window: {
      type: "object",
      additionalProperties: false,
      required: ["starts_at", "expires_at"],
      properties: {
        starts_at: { type: "string", pattern: TIMESTAMP },
        expires_at: { type: "string", pattern: TIMESTAMP },
      },
    },
    maximum_attempts: { const: 1 },
    maximum_successful_network_calls: { const: 1 },
    scheduler_authorized: { const: false },
    export_authorized: { const: false },
    publication_authorized: { const: false },
    production_reliance_authorized: { const: false },
  },
} as const;

const authorizationSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/controlled-live-arca-run-authorization.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "authorization_id",
    "authorization_sha256",
    "proposal_id",
    "proposal_sha256",
    "requested_url",
    "acquisition_policy_sha256",
    "expected_source_identity",
    "authorization_identity",
    "authorized_at",
    "not_before",
    "expires_at",
    "maximum_attempts",
    "maximum_network_calls",
    "scope",
  ],
  properties: {
    schema_version: { const: CONTROLLED_LIVE_RUN_AUTHORIZATION_VERSION },
    authorization_id: {
      type: "string",
      pattern: "^arca-live-authorization--[a-f0-9]{64}$",
    },
    authorization_sha256: { type: "string", pattern: SHA256 },
    proposal_id: { type: "string", minLength: 1 },
    proposal_sha256: { type: "string", pattern: SHA256 },
    requested_url: { type: "string", minLength: 1 },
    acquisition_policy_sha256: { type: "string", pattern: SHA256 },
    expected_source_identity: { const: GOVERNED_ARCA_SOURCE_IDENTITY },
    authorization_identity: { type: "string", pattern: HUMAN },
    authorized_at: { type: "string", pattern: TIMESTAMP },
    not_before: { type: "string", pattern: TIMESTAMP },
    expires_at: { type: "string", pattern: TIMESTAMP },
    maximum_attempts: { const: 1 },
    maximum_network_calls: { const: 1 },
    scope: { const: "controlled_live_arca_acquisition_only" },
  },
} as const;

const killSwitchSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/controlled-live-arca-kill-switch.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "kill_switch_id",
    "kill_switch_sha256",
    "state",
    "reviewed_artifact_id",
    "reviewed_by",
    "reviewed_at",
    "reason",
    "live_execution_blocked",
  ],
  properties: {
    schema_version: { const: CONTROLLED_LIVE_RUN_KILL_SWITCH_VERSION },
    kill_switch_id: { const: "controlled-live-arca-run" },
    kill_switch_sha256: { type: "string", pattern: SHA256 },
    state: { enum: ["active", "disabled"] },
    reviewed_artifact_id: { type: "string", minLength: 1 },
    reviewed_by: { type: "string", pattern: HUMAN },
    reviewed_at: { type: "string", pattern: TIMESTAMP },
    reason: { type: "string", minLength: 1 },
    live_execution_blocked: { type: "boolean" },
  },
} as const;

const resultSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/controlled-live-arca-run-result.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "result_type",
    "run_id",
    "proposal_id",
    "authorization_id",
    "lifecycle",
    "outcome",
    "result_timestamp",
    "network_calls_attempted",
    "network_calls_completed",
    "authorization_consumed",
    "acquisition_bytes_persisted",
    "candidate_created",
    "candidate_durably_persisted",
    "details",
    ...AUTHORITY_KEYS,
  ],
  properties: {
    schema_version: { const: CONTROLLED_LIVE_RUN_RESULT_VERSION },
    result_type: { const: "controlled_live_arca_run_result" },
    run_id: { type: "string", minLength: 1 },
    proposal_id: { type: ["string", "null"] },
    authorization_id: { type: ["string", "null"] },
    lifecycle: {
      enum: [
        "proposed",
        "authorized",
        "authorization_consumed",
        "acquisition_started",
        "acquisition_succeeded",
        "acquisition_failed",
        "ingestion_succeeded",
        "ingestion_failed",
        "candidate_persisted",
        "completed",
        "recovery_required",
      ],
    },
    outcome: {
      enum: [
        "invalid_proposal",
        "invalid_authorization",
        "authorization_expired",
        "authorization_not_yet_valid",
        "authorization_already_consumed",
        "separation_of_duties_violation",
        "kill_switch_active",
        "source_not_allowlisted",
        "source_binding_mismatch",
        "policy_binding_mismatch",
        "execution_window_invalid",
        "run_already_exists",
        "network_call_not_performed",
        "acquisition_failed",
        "ingestion_failed",
        "candidate_persistence_failed",
        "recovery_required",
        "candidate_persisted",
        "completed",
      ],
    },
    result_timestamp: { type: "string", pattern: TIMESTAMP },
    network_calls_attempted: { type: "integer", minimum: 0, maximum: 1 },
    network_calls_completed: { type: "integer", minimum: 0, maximum: 1 },
    authorization_consumed: { type: "boolean" },
    acquisition_bytes_persisted: { type: "boolean" },
    candidate_created: { type: "boolean" },
    candidate_durably_persisted: { type: "boolean" },
    details: { type: "array", items: { type: "string" } },
    ...AUTHORITY_FIELDS,
  },
} as const;

export const CONTROLLED_LIVE_RUN_PROPOSAL_SCHEMA = proposalSchema;
export const CONTROLLED_LIVE_RUN_AUTHORIZATION_SCHEMA = authorizationSchema;
export const CONTROLLED_LIVE_RUN_KILL_SWITCH_SCHEMA = killSwitchSchema;
export const CONTROLLED_LIVE_RUN_RESULT_SCHEMA = resultSchema;

const ajv = new Ajv({ allErrors: true, strict: true });
const validateProposalSchema = ajv.compile(proposalSchema);
const validateAuthorizationSchema = ajv.compile(authorizationSchema);
const validateKillSwitchSchema = ajv.compile(killSwitchSchema);
const validateResultSchema = ajv.compile(resultSchema);

export function computeControlledLiveProposalSha256(
  value: ControlledLiveRunProposal,
): string {
  return domainHash(
    "vlatam-ai-lab/controlled-live-arca-proposal/v1",
    without(value as unknown as Record<string, unknown>, [
      "proposal_id",
      "proposal_sha256",
    ]),
  );
}
export function computeControlledLiveAuthorizationSha256(
  value: ControlledLiveRunAuthorization,
): string {
  return domainHash(
    "vlatam-ai-lab/controlled-live-arca-authorization/v1",
    without(value as unknown as Record<string, unknown>, [
      "authorization_id",
      "authorization_sha256",
    ]),
  );
}
export function computeControlledLiveKillSwitchSha256(
  value: ControlledLiveRunKillSwitch,
): string {
  return domainHash(
    "vlatam-ai-lab/controlled-live-arca-kill-switch/v1",
    without(value as unknown as Record<string, unknown>, [
      "kill_switch_sha256",
    ]),
  );
}
export function computeControlledLiveConfigurationSha256(
  value: ControlledLiveRunRootConfiguration,
): string {
  return domainHash(
    "vlatam-ai-lab/controlled-live-arca-root-configuration/v1",
    without(value as unknown as Record<string, unknown>, [
      "configuration_sha256",
    ]),
  );
}
function computeJournalSha256(value: ControlledLiveRunJournal): string {
  return domainHash(
    "vlatam-ai-lab/controlled-live-arca-journal/v1",
    without(value as unknown as Record<string, unknown>, ["journal_sha256"]),
  );
}

function validTimestamp(value: string): boolean {
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}
function errorText(validate: { errors?: unknown }): string {
  return ajv.errorsText(validate.errors as never);
}

function baseResult(
  runId: string,
  timestamp: string,
  outcome: ControlledLiveRunOutcome,
  details: string[],
  proposalId: string | null = null,
  authorizationId: string | null = null,
): ControlledLiveRunResult {
  const result: ControlledLiveRunResult = {
    schema_version: "1.0.0",
    result_type: "controlled_live_arca_run_result",
    run_id: runId,
    proposal_id: proposalId,
    authorization_id: authorizationId,
    lifecycle:
      outcome === "completed"
        ? "completed"
        : outcome === "candidate_persisted"
          ? "candidate_persisted"
          : outcome === "recovery_required"
            ? "recovery_required"
            : "proposed",
    outcome,
    result_timestamp: timestamp,
    network_calls_attempted: 0,
    network_calls_completed: 0,
    authorization_consumed: false,
    acquisition_bytes_persisted: false,
    candidate_created: false,
    candidate_durably_persisted: false,
    details,
    review_required: true,
    approval: false,
    approved_artifact_created: false,
    export_authorized: false,
    publication_authorized: false,
    production_reliance_authorized: false,
    scheduler_authorized: false,
    deployment_authorized: false,
    vlatam_global_access_authorized: false,
  };
  if (!validateResultSchema(result))
    throw new Error(errorText(validateResultSchema));
  return result;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function validateExistingRoot(path: string): Promise<string> {
  const resolved = resolve(path);
  const filesystemRoot = parse(resolved).root;
  const components = relative(filesystemRoot, resolved)
    .split(sep)
    .filter(Boolean);
  let current = filesystemRoot;
  for (const component of components) {
    current = join(current, component);
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw new Error("unsafe_root");
  }
  return resolved;
}

function validateConfiguration(
  value: ControlledLiveRunRootConfiguration,
): string[] {
  const keys = [
    "schema_version",
    "configuration_id",
    "configuration_sha256",
    "acquisition_output",
    "candidate_output",
    "durable_store",
    "run_state",
  ];
  if (
    !value ||
    typeof value !== "object" ||
    Object.keys(value).sort().join() !== keys.sort().join()
  )
    return ["configuration_shape_invalid"];
  const exactNestedKeys = (
    candidate: unknown,
    expected: readonly string[],
  ): candidate is Record<string, unknown> =>
    typeof candidate === "object" &&
    candidate !== null &&
    !Array.isArray(candidate) &&
    Object.keys(candidate).sort().join() === [...expected].sort().join();
  if (
    !exactNestedKeys(value.acquisition_output, ["identity", "path"]) ||
    !exactNestedKeys(value.candidate_output, ["identity", "path"]) ||
    !exactNestedKeys(value.run_state, ["identity", "path"]) ||
    !exactNestedKeys(value.durable_store, [
      "identity",
      "path",
      "configuration_sha256",
    ])
  )
    return ["configuration_nested_shape_invalid"];
  if (
    value.schema_version !== "1.0.0" ||
    value.configuration_sha256 !==
      computeControlledLiveConfigurationSha256(value)
  )
    return ["configuration_hash_invalid"];
  if (
    value.durable_store.configuration_sha256 !==
    DURABLE_ARCA_STORE_CONFIGURATION_SHA256
  )
    return ["durable_store_configuration_mismatch"];
  for (const root of [
    value.acquisition_output,
    value.candidate_output,
    value.durable_store,
    value.run_state,
  ])
    if (
      typeof root.identity !== "string" ||
      root.identity.length === 0 ||
      typeof root.path !== "string" ||
      root.path.length === 0 ||
      !resolve(root.path).startsWith(parse(resolve(root.path)).root)
    )
      return ["configuration_root_invalid"];
  return [];
}

export interface ControlledLiveRunPreflightInput {
  readonly runId: string;
  readonly proposal: unknown;
  readonly authorization: unknown;
  readonly killSwitch: unknown;
  readonly configuration: ControlledLiveRunRootConfiguration;
  readonly executionTimestamp: string;
}

export async function preflightControlledLiveArcaRun(
  input: ControlledLiveRunPreflightInput,
): Promise<ControlledLiveRunResult> {
  const { runId, executionTimestamp } = input;
  const safeResultTimestamp = validTimestamp(executionTimestamp)
    ? executionTimestamp
    : "1970-01-01T00:00:00.000Z";
  if (!RUN_ID.test(runId))
    return baseResult(runId, safeResultTimestamp, "invalid_proposal", [
      "run_id_invalid",
    ]);
  if (!validTimestamp(executionTimestamp))
    return baseResult(runId, safeResultTimestamp, "execution_window_invalid", [
      "execution_timestamp_invalid",
    ]);
  if (!validateProposalSchema(input.proposal))
    return baseResult(runId, executionTimestamp, "invalid_proposal", [
      errorText(validateProposalSchema),
    ]);
  const proposal = input.proposal as ControlledLiveRunProposal;
  if (
    !validTimestamp(proposal.created_at) ||
    !validTimestamp(proposal.execution_window.starts_at) ||
    !validTimestamp(proposal.execution_window.expires_at) ||
    Date.parse(proposal.execution_window.starts_at) >=
      Date.parse(proposal.execution_window.expires_at)
  )
    return baseResult(
      runId,
      executionTimestamp,
      "invalid_proposal",
      ["proposal_timestamp_or_window_invalid"],
      proposal.proposal_id,
    );
  if (
    proposal.proposal_sha256 !==
      computeControlledLiveProposalSha256(proposal) ||
    proposal.proposal_id !== `arca-live-proposal--${proposal.proposal_sha256}`
  )
    return baseResult(
      runId,
      executionTimestamp,
      "invalid_proposal",
      ["proposal_hash_invalid"],
      proposal.proposal_id,
    );
  try {
    resolveGovernedArcaSourceIdentity(proposal.requested_url);
  } catch {
    return baseResult(
      runId,
      executionTimestamp,
      "source_not_allowlisted",
      ["exact_source_url_not_allowlisted"],
      proposal.proposal_id,
    );
  }
  if (proposal.expected_source_identity !== GOVERNED_ARCA_SOURCE_IDENTITY)
    return baseResult(
      runId,
      executionTimestamp,
      "source_binding_mismatch",
      ["proposal_source_identity_mismatch"],
      proposal.proposal_id,
    );
  if (
    proposal.acquisition_policy_sha256 !==
    GOVERNED_ARCA_ACQUISITION_POLICY_SHA256
  )
    return baseResult(
      runId,
      executionTimestamp,
      "policy_binding_mismatch",
      ["proposal_policy_hash_mismatch"],
      proposal.proposal_id,
    );
  const configurationErrors = validateConfiguration(input.configuration);
  if (
    configurationErrors.length ||
    proposal.acquisition_output_root_identity !==
      input.configuration.acquisition_output.identity ||
    proposal.candidate_output_root_identity !==
      input.configuration.candidate_output.identity ||
    proposal.durable_store_configuration_sha256 !==
      input.configuration.durable_store.configuration_sha256
  )
    return baseResult(
      runId,
      executionTimestamp,
      "policy_binding_mismatch",
      [...configurationErrors, "root_configuration_binding_mismatch"],
      proposal.proposal_id,
    );
  if (!validateAuthorizationSchema(input.authorization))
    return baseResult(
      runId,
      executionTimestamp,
      "invalid_authorization",
      [errorText(validateAuthorizationSchema)],
      proposal.proposal_id,
    );
  const authorization = input.authorization as ControlledLiveRunAuthorization;
  if (
    !validTimestamp(authorization.authorized_at) ||
    !validTimestamp(authorization.not_before) ||
    !validTimestamp(authorization.expires_at) ||
    Date.parse(authorization.authorized_at) >
      Date.parse(authorization.not_before) ||
    Date.parse(authorization.not_before) >= Date.parse(authorization.expires_at)
  )
    return baseResult(
      runId,
      executionTimestamp,
      "invalid_authorization",
      ["authorization_timestamp_window_invalid"],
      proposal.proposal_id,
      authorization.authorization_id,
    );
  if (
    authorization.authorization_sha256 !==
      computeControlledLiveAuthorizationSha256(authorization) ||
    authorization.authorization_id !==
      `arca-live-authorization--${authorization.authorization_sha256}`
  )
    return baseResult(
      runId,
      executionTimestamp,
      "invalid_authorization",
      ["authorization_hash_invalid"],
      proposal.proposal_id,
      authorization.authorization_id,
    );
  if (
    authorization.proposal_id !== proposal.proposal_id ||
    authorization.proposal_sha256 !== proposal.proposal_sha256
  )
    return baseResult(
      runId,
      executionTimestamp,
      "invalid_authorization",
      ["proposal_binding_mismatch"],
      proposal.proposal_id,
      authorization.authorization_id,
    );
  if (authorization.requested_url !== proposal.requested_url)
    return baseResult(
      runId,
      executionTimestamp,
      "source_binding_mismatch",
      ["authorization_url_mismatch"],
      proposal.proposal_id,
      authorization.authorization_id,
    );
  if (
    authorization.expected_source_identity !== proposal.expected_source_identity
  )
    return baseResult(
      runId,
      executionTimestamp,
      "source_binding_mismatch",
      ["authorization_source_mismatch"],
      proposal.proposal_id,
      authorization.authorization_id,
    );
  if (
    authorization.acquisition_policy_sha256 !==
    proposal.acquisition_policy_sha256
  )
    return baseResult(
      runId,
      executionTimestamp,
      "policy_binding_mismatch",
      ["authorization_policy_mismatch"],
      proposal.proposal_id,
      authorization.authorization_id,
    );
  const now = Date.parse(executionTimestamp);
  if (
    Date.parse(authorization.authorized_at) > now ||
    Date.parse(authorization.not_before) > now
  )
    return baseResult(
      runId,
      executionTimestamp,
      "authorization_not_yet_valid",
      ["authorization_future_dated"],
      proposal.proposal_id,
      authorization.authorization_id,
    );
  if (Date.parse(authorization.expires_at) < now)
    return baseResult(
      runId,
      executionTimestamp,
      "authorization_expired",
      ["authorization_expired"],
      proposal.proposal_id,
      authorization.authorization_id,
    );
  if (
    now < Date.parse(proposal.execution_window.starts_at) ||
    now > Date.parse(proposal.execution_window.expires_at) ||
    now > Date.parse(authorization.expires_at)
  )
    return baseResult(
      runId,
      executionTimestamp,
      "execution_window_invalid",
      ["outside_authorized_execution_window"],
      proposal.proposal_id,
      authorization.authorization_id,
    );
  const authorizer = authorization.authorization_identity;
  if (
    [
      proposal.proposal_author_identity,
      proposal.acquisition_operator_identity,
      proposal.parser_runtime_identity,
      proposal.candidate_producer_identity,
      proposal.evidence_reviewer_identity,
      proposal.artifact_builder_identity,
      proposal.future_publisher_identity,
    ].includes(authorizer)
  )
    return baseResult(
      runId,
      executionTimestamp,
      "separation_of_duties_violation",
      ["authorizer_role_conflict"],
      proposal.proposal_id,
      authorization.authorization_id,
    );
  if (!validateKillSwitchSchema(input.killSwitch))
    return baseResult(
      runId,
      executionTimestamp,
      "kill_switch_active",
      ["kill_switch_invalid_or_missing"],
      proposal.proposal_id,
      authorization.authorization_id,
    );
  const killSwitch = input.killSwitch as ControlledLiveRunKillSwitch;
  if (
    !validTimestamp(killSwitch.reviewed_at) ||
    killSwitch.kill_switch_sha256 !==
      computeControlledLiveKillSwitchSha256(killSwitch) ||
    (killSwitch.state === "active") !== killSwitch.live_execution_blocked ||
    killSwitch.state !== "disabled"
  )
    return baseResult(
      runId,
      executionTimestamp,
      "kill_switch_active",
      ["kill_switch_blocks_live_execution"],
      proposal.proposal_id,
      authorization.authorization_id,
    );
  try {
    await Promise.all([
      validateExistingRoot(input.configuration.acquisition_output.path),
      validateExistingRoot(input.configuration.candidate_output.path),
      validateExistingRoot(input.configuration.durable_store.path),
      validateExistingRoot(input.configuration.run_state.path),
    ]);
  } catch {
    return baseResult(
      runId,
      executionTimestamp,
      "policy_binding_mismatch",
      ["configured_root_missing_or_unsafe"],
      proposal.proposal_id,
      authorization.authorization_id,
    );
  }
  const consumptionPath = join(
    resolve(input.configuration.run_state.path),
    "consumptions",
    `${authorization.authorization_id}.json`,
  );
  if (await pathExists(consumptionPath))
    return baseResult(
      runId,
      executionTimestamp,
      "authorization_already_consumed",
      ["authorization_consumption_exists"],
      proposal.proposal_id,
      authorization.authorization_id,
    );
  const success = baseResult(
    runId,
    executionTimestamp,
    "network_call_not_performed",
    ["preflight_valid_zero_network_calls"],
    proposal.proposal_id,
    authorization.authorization_id,
  );
  return { ...success, lifecycle: "authorized" };
}

async function writeExclusiveJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(
    path,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    0o600,
  );
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncDirectory(dirname(path));
}
async function syncDirectory(path: string): Promise<void> {
  const directory = await open(path, constants.O_RDONLY);
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}
async function replaceJson(path: string, value: unknown): Promise<void> {
  const staging = `${path}.staging-${randomUUID()}`;
  await writeExclusiveJson(staging, value);
  await rename(staging, path);
  await syncDirectory(dirname(path));
}
function withJournalHash(
  value: Omit<ControlledLiveRunJournal, "journal_sha256">,
): ControlledLiveRunJournal {
  const candidate = {
    ...value,
    journal_sha256: "0".repeat(64),
  } as ControlledLiveRunJournal;
  return { ...candidate, journal_sha256: computeJournalSha256(candidate) };
}

export interface ControlledLiveRunExecutionInput extends ControlledLiveRunPreflightInput {
  readonly killSwitchPath: string;
  readonly transport?: typeof fetch;
  readonly interruptAfterLifecycle?: ControlledLiveRunLifecycle;
}

function interrupt(
  stage: ControlledLiveRunLifecycle,
  requested?: ControlledLiveRunLifecycle,
): void {
  if (stage === requested)
    throw new Error(`controlled_live_run_interrupted_after:${stage}`);
}

function acquisitionRecordHash(
  record: SourceAcquisitionRecord,
): Promise<string> {
  return readFile(record.metadata_path).then((bytes) =>
    createHash("sha256").update(bytes).digest("hex"),
  );
}

function candidateHash(candidate: GovernedArcaCandidateArtifact): string {
  return domainHash("vlatam-ai-lab/governed-arca-candidate/v1", candidate);
}

export async function executeControlledLiveArcaRun(
  input: ControlledLiveRunExecutionInput,
): Promise<ControlledLiveRunResult> {
  const preflight = await preflightControlledLiveArcaRun(input);
  if (preflight.lifecycle !== "authorized") return preflight;
  const proposal = input.proposal as ControlledLiveRunProposal;
  const authorization = input.authorization as ControlledLiveRunAuthorization;
  const stateRoot = resolve(input.configuration.run_state.path);
  const journalPath = join(stateRoot, "journals", `${input.runId}.json`);
  const recordPath = join(stateRoot, "records", `${input.runId}.json`);
  if ((await pathExists(journalPath)) || (await pathExists(recordPath)))
    return baseResult(
      input.runId,
      input.executionTimestamp,
      "run_already_exists",
      ["run_identity_exists"],
      proposal.proposal_id,
      authorization.authorization_id,
    );
  const runSha256 = domainHash("vlatam-ai-lab/controlled-live-arca-run/v1", {
    run_id: input.runId,
    proposal_id: proposal.proposal_id,
    authorization_id: authorization.authorization_id,
    requested_url: proposal.requested_url,
  });
  const consumptionId = `arca-live-consumption--${domainHash("vlatam-ai-lab/controlled-live-arca-consumption/v1", { proposal_id: proposal.proposal_id, authorization_id: authorization.authorization_id, requested_url: proposal.requested_url, run_id: input.runId, attempt_id: `${input.runId}--attempt-1` })}`;
  let journal = withJournalHash({
    schema_version: "1.0.0",
    journal_type: "controlled_live_arca_run_journal",
    run_id: input.runId,
    run_sha256: runSha256,
    proposal_id: proposal.proposal_id,
    proposal_sha256: proposal.proposal_sha256,
    authorization_id: authorization.authorization_id,
    authorization_sha256: authorization.authorization_sha256,
    authorization_consumption_id: consumptionId,
    requested_url: proposal.requested_url,
    source_identity: proposal.expected_source_identity,
    attempt_number: 1,
    attempt_id: `${input.runId}--attempt-1`,
    transport_attempt_id: `${input.runId}--transport-1`,
    lifecycle: "authorized",
    delivery_status: "not_started",
    created_at: input.executionTimestamp,
    updated_at: input.executionTimestamp,
    acquisition_record_id: null,
    acquisition_record_sha256: null,
    candidate_id: null,
    candidate_sha256: null,
    durable_store_event_id: null,
    durable_store_event_sha256: null,
    export_authorized: false,
    publication_authorized: false,
    production_reliance_authorized: false,
    scheduler_authorized: false,
    deployment_authorized: false,
    vlatam_global_access_authorized: false,
  });
  await writeExclusiveJson(journalPath, journal);
  interrupt("authorized", input.interruptAfterLifecycle);
  const consumptionPath = join(
    stateRoot,
    "consumptions",
    `${authorization.authorization_id}.json`,
  );
  const consumption = {
    schema_version: "1.0.0",
    consumption_id: consumptionId,
    proposal_id: proposal.proposal_id,
    proposal_sha256: proposal.proposal_sha256,
    authorization_id: authorization.authorization_id,
    authorization_sha256: authorization.authorization_sha256,
    requested_url: proposal.requested_url,
    run_id: input.runId,
    attempt_id: journal.attempt_id,
    consumed_at: input.executionTimestamp,
  };
  try {
    await writeExclusiveJson(consumptionPath, consumption);
  } catch {
    return baseResult(
      input.runId,
      input.executionTimestamp,
      "authorization_already_consumed",
      ["atomic_consumption_lost"],
      proposal.proposal_id,
      authorization.authorization_id,
    );
  }
  journal = withJournalHash({
    ...journal,
    lifecycle: "authorization_consumed",
    updated_at: input.executionTimestamp,
  });
  await replaceJson(journalPath, journal);
  interrupt("authorization_consumed", input.interruptAfterLifecycle);
  let exactKillSwitch: unknown;
  try {
    exactKillSwitch = JSON.parse(await readFile(input.killSwitchPath, "utf8"));
  } catch {
    return {
      ...baseResult(
        input.runId,
        input.executionTimestamp,
        "recovery_required",
        ["kill_switch_reread_failed_after_consumption"],
        proposal.proposal_id,
        authorization.authorization_id,
      ),
      lifecycle: "recovery_required",
      authorization_consumed: true,
    };
  }
  if (
    !validateKillSwitchSchema(exactKillSwitch) ||
    (exactKillSwitch as ControlledLiveRunKillSwitch).state !== "disabled" ||
    (exactKillSwitch as ControlledLiveRunKillSwitch).kill_switch_sha256 !==
      computeControlledLiveKillSwitchSha256(
        exactKillSwitch as ControlledLiveRunKillSwitch,
      )
  )
    return {
      ...baseResult(
        input.runId,
        input.executionTimestamp,
        "kill_switch_active",
        ["final_kill_switch_revalidation_blocked"],
        proposal.proposal_id,
        authorization.authorization_id,
      ),
      lifecycle: "authorization_consumed",
      authorization_consumed: true,
    };
  journal = withJournalHash({
    ...journal,
    lifecycle: "acquisition_started",
    delivery_status: "unknown",
    updated_at: input.executionTimestamp,
  });
  await replaceJson(journalPath, journal);
  interrupt("acquisition_started", input.interruptAfterLifecycle);
  let callsAttempted = 0;
  let callsCompleted = 0;
  let record: SourceAcquisitionRecord;
  try {
    const executionOptions: SourceAcquisitionExecutionOptions = {
      maximumNetworkCalls: 1,
      onNetworkCall: () => {
        callsAttempted += 1;
      },
      ...(input.transport
        ? {
            fetchImplementation: async (...args: Parameters<typeof fetch>) => {
              const response = await input.transport!(...args);
              callsCompleted += 1;
              return response;
            },
          }
        : {}),
    };
    record = await acquireSource(
      {
        sourceId: GOVERNED_ARCA_SOURCE_IDENTITY,
        sourceUrl: proposal.requested_url,
        outputDirectory: input.configuration.acquisition_output.path,
        mode: "live",
        capturedAt: new Date(input.executionTimestamp),
        timeoutMs: proposal.timeout_ms,
        maxBytes: proposal.maximum_response_bytes,
      },
      executionOptions,
    );
  } catch (error: unknown) {
    journal = withJournalHash({
      ...journal,
      lifecycle: "acquisition_failed",
      delivery_status: "failed",
      updated_at: input.executionTimestamp,
    });
    await replaceJson(journalPath, journal);
    return {
      ...baseResult(
        input.runId,
        input.executionTimestamp,
        "acquisition_failed",
        [
          error instanceof SourceAcquisitionError
            ? error.code
            : "transport_failure",
        ],
        proposal.proposal_id,
        authorization.authorization_id,
      ),
      lifecycle: "acquisition_failed",
      authorization_consumed: true,
      network_calls_attempted: callsAttempted,
      network_calls_completed: callsCompleted,
    };
  }
  const recordSha256 = await acquisitionRecordHash(record);
  journal = withJournalHash({
    ...journal,
    lifecycle: "acquisition_succeeded",
    delivery_status: "completed",
    updated_at: input.executionTimestamp,
    acquisition_record_id: record.acquisition_id,
    acquisition_record_sha256: recordSha256,
  });
  await replaceJson(journalPath, journal);
  interrupt("acquisition_succeeded", input.interruptAfterLifecycle);
  const ingestionInput: GovernedArcaAcquiredSourceInput = {
    schema_version: "1.0.0",
    acquisition: {
      acquisition_id: record.acquisition_id,
      acquisition_record_sha256: recordSha256,
      source_id: record.source_id,
      requested_url: record.requested_url,
      effective_url: record.effective_url,
      captured_at: record.captured_at,
      media_type: record.content_type,
      raw_sha256: record.sha256,
    },
    parser: {
      parser_id: ARCA_NOMENCLADOR_PARSER_ID,
      parser_version: ARCA_NOMENCLADOR_PARSER_VERSION,
      configuration_sha256: ARCA_NOMENCLADOR_PARSER_CONFIGURATION_HASH,
    },
    parsing_timestamp: input.executionTimestamp,
  };
  let candidate: GovernedArcaCandidateArtifact;
  try {
    candidate = (
      await ingestGovernedArcaAcquiredSource(ingestionInput, {
        acquisitionRoot: input.configuration.acquisition_output.path,
        candidateRoot: input.configuration.candidate_output.path,
      })
    ).candidate;
  } catch (error: unknown) {
    journal = withJournalHash({
      ...journal,
      lifecycle: "ingestion_failed",
      updated_at: input.executionTimestamp,
    });
    await replaceJson(journalPath, journal);
    return {
      ...baseResult(
        input.runId,
        input.executionTimestamp,
        "ingestion_failed",
        [error instanceof Error ? error.name : "ingestion_failure"],
        proposal.proposal_id,
        authorization.authorization_id,
      ),
      lifecycle: "ingestion_failed",
      authorization_consumed: true,
      acquisition_bytes_persisted: true,
      network_calls_attempted: callsAttempted,
      network_calls_completed: callsCompleted,
    };
  }
  const candidateSha256 = candidateHash(candidate);
  const candidateId = `arca-candidate--${candidateSha256}`;
  journal = withJournalHash({
    ...journal,
    lifecycle: "ingestion_succeeded",
    updated_at: input.executionTimestamp,
    candidate_id: candidateId,
    candidate_sha256: candidateSha256,
  });
  await replaceJson(journalPath, journal);
  interrupt("ingestion_succeeded", input.interruptAfterLifecycle);
  const durable = await executeDurableArcaStoreCommand(
    input.configuration.durable_store.path,
    {
      schema_version: "1.0.0",
      operation: "record_candidate",
      actor_identity: DURABLE_ARCA_STORE_SERVICE_IDENTITY,
      event_timestamp: input.executionTimestamp,
      candidate_id: null,
      governed_record: candidate,
      export_authorized: false,
      publication_authorized: false,
      production_authorized: false,
      network_authorized: false,
      database_authorized: false,
      scheduler_authorized: false,
      deployment_authorized: false,
      vlatam_global_access_authorized: false,
    },
  );
  if (!durable.success)
    return {
      ...baseResult(
        input.runId,
        input.executionTimestamp,
        "candidate_persistence_failed",
        [...durable.details],
        proposal.proposal_id,
        authorization.authorization_id,
      ),
      lifecycle: "ingestion_succeeded",
      authorization_consumed: true,
      acquisition_bytes_persisted: true,
      candidate_created: true,
      network_calls_attempted: callsAttempted,
      network_calls_completed: callsCompleted,
    };
  journal = withJournalHash({
    ...journal,
    lifecycle: "candidate_persisted",
    updated_at: input.executionTimestamp,
    durable_store_event_id: durable.event_id,
    durable_store_event_sha256: durable.event_sha256,
  });
  await replaceJson(journalPath, journal);
  interrupt("candidate_persisted", input.interruptAfterLifecycle);
  const completed: ControlledLiveRunResult = {
    ...baseResult(
      input.runId,
      input.executionTimestamp,
      "completed",
      ["candidate_persisted_review_required"],
      proposal.proposal_id,
      authorization.authorization_id,
    ),
    lifecycle: "completed",
    network_calls_attempted: callsAttempted,
    network_calls_completed: callsCompleted,
    authorization_consumed: true,
    acquisition_bytes_persisted: true,
    candidate_created: true,
    candidate_durably_persisted: true,
  };
  const durableRecordWithoutHash = {
    ...completed,
    record_type: "durable_controlled_live_arca_run_record" as const,
    proposal_sha256: proposal.proposal_sha256,
    authorization_sha256: authorization.authorization_sha256,
    requested_url: proposal.requested_url,
    expected_source_identity: proposal.expected_source_identity,
    acquisition_policy_sha256: proposal.acquisition_policy_sha256,
    acquisition_record_id: record.acquisition_id,
    acquisition_record_sha256: recordSha256,
    candidate_id: candidateId,
    candidate_sha256: candidateSha256,
    durable_store_event_id: durable.event_id,
    durable_store_event_sha256: durable.event_sha256,
  };
  const durableRecord: ControlledLiveRunRecord = {
    ...durableRecordWithoutHash,
    record_sha256: domainHash(
      "vlatam-ai-lab/controlled-live-arca-run-record/v1",
      durableRecordWithoutHash,
    ),
  };
  await writeExclusiveJson(recordPath, durableRecord);
  journal = withJournalHash({
    ...journal,
    lifecycle: "completed",
    updated_at: input.executionTimestamp,
  });
  await replaceJson(journalPath, journal);
  return completed;
}

export async function inspectControlledLiveRunRecovery(
  stateRoot: string,
  runId: string,
  timestamp: string,
): Promise<ControlledLiveRunResult> {
  let journal: ControlledLiveRunJournal;
  try {
    journal = JSON.parse(
      await readFile(
        join(resolve(stateRoot), "journals", `${runId}.json`),
        "utf8",
      ),
    ) as ControlledLiveRunJournal;
  } catch {
    return baseResult(runId, timestamp, "network_call_not_performed", [
      "no_live_run_journal",
    ]);
  }
  if (journal.journal_sha256 !== computeJournalSha256(journal))
    return {
      ...baseResult(
        runId,
        timestamp,
        "recovery_required",
        ["journal_hash_invalid"],
        journal.proposal_id,
        journal.authorization_id,
      ),
      lifecycle: "recovery_required",
    };
  if (journal.lifecycle === "authorized")
    return baseResult(
      runId,
      timestamp,
      "network_call_not_performed",
      ["safe_to_abort_before_consumption"],
      journal.proposal_id,
      journal.authorization_id,
    );
  if (journal.lifecycle === "completed")
    return {
      ...baseResult(
        runId,
        timestamp,
        "completed",
        ["already_completed_no_network_call"],
        journal.proposal_id,
        journal.authorization_id,
      ),
      lifecycle: "completed",
      authorization_consumed: true,
      acquisition_bytes_persisted: true,
      candidate_created: true,
      candidate_durably_persisted: true,
    };
  const detail =
    journal.lifecycle === "acquisition_started"
      ? "delivery_unknown_never_retry_automatically"
      : journal.lifecycle === "acquisition_succeeded"
        ? "resume_ingestion_from_immutable_acquisition_without_fetch"
        : journal.lifecycle === "ingestion_succeeded" ||
            journal.lifecycle === "candidate_persisted"
          ? "resume_durable_persistence_or_completion_without_fetch"
          : "authorization_consumed_operator_recovery_required";
  return {
    ...baseResult(
      runId,
      timestamp,
      "recovery_required",
      [detail],
      journal.proposal_id,
      journal.authorization_id,
    ),
    lifecycle: "recovery_required",
    authorization_consumed: true,
    acquisition_bytes_persisted: [
      "acquisition_succeeded",
      "ingestion_succeeded",
      "candidate_persisted",
      "completed",
    ].includes(journal.lifecycle),
    candidate_created: [
      "ingestion_succeeded",
      "candidate_persisted",
      "completed",
    ].includes(journal.lifecycle),
    candidate_durably_persisted: ["candidate_persisted", "completed"].includes(
      journal.lifecycle,
    ),
  };
}

export interface ControlledLiveRunRecoveryInput {
  readonly runId: string;
  readonly proposal: ControlledLiveRunProposal;
  readonly authorization: ControlledLiveRunAuthorization;
  readonly configuration: ControlledLiveRunRootConfiguration;
  readonly recoveryTimestamp: string;
}

/**
 * Resumes only from already-persisted immutable bytes. It has no transport
 * parameter and cannot invoke acquisition, so an uncertain delivery is never
 * converted into a second HTTP attempt.
 */
export async function recoverControlledLiveArcaRun(
  input: ControlledLiveRunRecoveryInput,
): Promise<ControlledLiveRunResult> {
  const journalPath = join(
    resolve(input.configuration.run_state.path),
    "journals",
    `${input.runId}.json`,
  );
  let journal: ControlledLiveRunJournal;
  try {
    journal = JSON.parse(
      await readFile(journalPath, "utf8"),
    ) as ControlledLiveRunJournal;
  } catch {
    return baseResult(
      input.runId,
      input.recoveryTimestamp,
      "network_call_not_performed",
      ["no_live_run_journal"],
      input.proposal.proposal_id,
      input.authorization.authorization_id,
    );
  }
  if (
    journal.journal_sha256 !== computeJournalSha256(journal) ||
    journal.proposal_id !== input.proposal.proposal_id ||
    journal.proposal_sha256 !== input.proposal.proposal_sha256 ||
    journal.authorization_id !== input.authorization.authorization_id ||
    journal.authorization_sha256 !== input.authorization.authorization_sha256
  )
    return {
      ...baseResult(
        input.runId,
        input.recoveryTimestamp,
        "recovery_required",
        ["recovery_binding_or_journal_hash_invalid"],
        journal.proposal_id,
        journal.authorization_id,
      ),
      lifecycle: "recovery_required",
    };
  if (journal.lifecycle === "authorized")
    return baseResult(
      input.runId,
      input.recoveryTimestamp,
      "network_call_not_performed",
      ["safe_to_abort_before_consumption"],
      journal.proposal_id,
      journal.authorization_id,
    );
  if (
    journal.lifecycle === "authorization_consumed" ||
    journal.lifecycle === "acquisition_started"
  )
    return {
      ...baseResult(
        input.runId,
        input.recoveryTimestamp,
        "recovery_required",
        [
          journal.lifecycle === "acquisition_started"
            ? "delivery_unknown_never_retry_automatically"
            : "consumed_before_transport_operator_recovery_required",
        ],
        journal.proposal_id,
        journal.authorization_id,
      ),
      lifecycle: "recovery_required",
      authorization_consumed: true,
    };
  if (journal.lifecycle === "completed")
    return {
      ...baseResult(
        input.runId,
        input.recoveryTimestamp,
        "completed",
        ["already_completed_without_fetch"],
        journal.proposal_id,
        journal.authorization_id,
      ),
      lifecycle: "completed",
      authorization_consumed: true,
      acquisition_bytes_persisted: true,
      candidate_created: true,
      candidate_durably_persisted: true,
    };
  if (!journal.acquisition_record_id || !journal.acquisition_record_sha256)
    return {
      ...baseResult(
        input.runId,
        input.recoveryTimestamp,
        "recovery_required",
        ["persisted_acquisition_binding_missing"],
        journal.proposal_id,
        journal.authorization_id,
      ),
      lifecycle: "recovery_required",
      authorization_consumed: true,
    };
  const acquisitionDirectory = join(
    resolve(input.configuration.acquisition_output.path),
    journal.source_identity,
    journal.created_at.slice(0, 10),
    journal.acquisition_record_id,
  );
  const metadataPath = join(acquisitionDirectory, "metadata.json");
  let record: SourceAcquisitionRecord;
  try {
    const metadata = await readFile(metadataPath);
    if (
      createHash("sha256").update(metadata).digest("hex") !==
      journal.acquisition_record_sha256
    )
      throw new Error("acquisition_record_hash_mismatch");
    record = JSON.parse(metadata.toString("utf8")) as SourceAcquisitionRecord;
  } catch (error: unknown) {
    return {
      ...baseResult(
        input.runId,
        input.recoveryTimestamp,
        "recovery_required",
        [
          error instanceof Error
            ? error.message
            : "acquisition_record_unavailable",
        ],
        journal.proposal_id,
        journal.authorization_id,
      ),
      lifecycle: "recovery_required",
      authorization_consumed: true,
    };
  }
  let candidate: GovernedArcaCandidateArtifact;
  if (journal.lifecycle === "acquisition_succeeded") {
    const ingestionInput: GovernedArcaAcquiredSourceInput = {
      schema_version: "1.0.0",
      acquisition: {
        acquisition_id: record.acquisition_id,
        acquisition_record_sha256: journal.acquisition_record_sha256,
        source_id: record.source_id,
        requested_url: record.requested_url,
        effective_url: record.effective_url,
        captured_at: record.captured_at,
        media_type: record.content_type,
        raw_sha256: record.sha256,
      },
      parser: {
        parser_id: ARCA_NOMENCLADOR_PARSER_ID,
        parser_version: ARCA_NOMENCLADOR_PARSER_VERSION,
        configuration_sha256: ARCA_NOMENCLADOR_PARSER_CONFIGURATION_HASH,
      },
      parsing_timestamp: journal.created_at,
    };
    try {
      candidate = (
        await ingestGovernedArcaAcquiredSource(ingestionInput, {
          acquisitionRoot: input.configuration.acquisition_output.path,
          candidateRoot: input.configuration.candidate_output.path,
        })
      ).candidate;
    } catch (error: unknown) {
      return {
        ...baseResult(
          input.runId,
          input.recoveryTimestamp,
          "recovery_required",
          [error instanceof Error ? error.name : "recovery_ingestion_failed"],
          journal.proposal_id,
          journal.authorization_id,
        ),
        lifecycle: "recovery_required",
        authorization_consumed: true,
        acquisition_bytes_persisted: true,
      };
    }
    const hash = candidateHash(candidate);
    journal = withJournalHash({
      ...journal,
      lifecycle: "ingestion_succeeded",
      updated_at: input.recoveryTimestamp,
      candidate_id: `arca-candidate--${hash}`,
      candidate_sha256: hash,
    });
    await replaceJson(journalPath, journal);
  } else {
    const candidatePath = join(
      resolve(input.configuration.candidate_output.path),
      record.source_id,
      record.captured_at.slice(0, 10),
      record.acquisition_id,
      `candidate--${ARCA_NOMENCLADOR_PARSER_ID}--${ARCA_NOMENCLADOR_PARSER_VERSION}.json`,
    );
    try {
      candidate = JSON.parse(
        await readFile(candidatePath, "utf8"),
      ) as GovernedArcaCandidateArtifact;
    } catch {
      return {
        ...baseResult(
          input.runId,
          input.recoveryTimestamp,
          "recovery_required",
          ["persisted_candidate_unavailable"],
          journal.proposal_id,
          journal.authorization_id,
        ),
        lifecycle: "recovery_required",
        authorization_consumed: true,
        acquisition_bytes_persisted: true,
      };
    }
    if (journal.candidate_sha256 !== candidateHash(candidate))
      return {
        ...baseResult(
          input.runId,
          input.recoveryTimestamp,
          "recovery_required",
          ["persisted_candidate_hash_mismatch"],
          journal.proposal_id,
          journal.authorization_id,
        ),
        lifecycle: "recovery_required",
        authorization_consumed: true,
        acquisition_bytes_persisted: true,
      };
  }
  if (journal.lifecycle === "ingestion_succeeded") {
    const durable = await executeDurableArcaStoreCommand(
      input.configuration.durable_store.path,
      {
        schema_version: "1.0.0",
        operation: "record_candidate",
        actor_identity: DURABLE_ARCA_STORE_SERVICE_IDENTITY,
        event_timestamp: input.recoveryTimestamp,
        candidate_id: null,
        governed_record: candidate,
        export_authorized: false,
        publication_authorized: false,
        production_authorized: false,
        network_authorized: false,
        database_authorized: false,
        scheduler_authorized: false,
        deployment_authorized: false,
        vlatam_global_access_authorized: false,
      },
    );
    if (!durable.success)
      return {
        ...baseResult(
          input.runId,
          input.recoveryTimestamp,
          "candidate_persistence_failed",
          [...durable.details],
          journal.proposal_id,
          journal.authorization_id,
        ),
        lifecycle: "recovery_required",
        authorization_consumed: true,
        acquisition_bytes_persisted: true,
        candidate_created: true,
      };
    journal = withJournalHash({
      ...journal,
      lifecycle: "candidate_persisted",
      updated_at: input.recoveryTimestamp,
      durable_store_event_id: durable.event_id,
      durable_store_event_sha256: durable.event_sha256,
    });
    await replaceJson(journalPath, journal);
  }
  journal = withJournalHash({
    ...journal,
    lifecycle: "completed",
    updated_at: input.recoveryTimestamp,
  });
  await replaceJson(journalPath, journal);
  return {
    ...baseResult(
      input.runId,
      input.recoveryTimestamp,
      "completed",
      ["recovered_from_immutable_local_bytes_without_fetch"],
      journal.proposal_id,
      journal.authorization_id,
    ),
    lifecycle: "completed",
    authorization_consumed: true,
    acquisition_bytes_persisted: true,
    candidate_created: true,
    candidate_durably_persisted: true,
  };
}

export function controlledLiveSchemaHashes(): Record<string, string> {
  return {
    proposal: domainHash("vlatam-ai-lab/schema/v1", proposalSchema),
    authorization: domainHash("vlatam-ai-lab/schema/v1", authorizationSchema),
    kill_switch: domainHash("vlatam-ai-lab/schema/v1", killSwitchSchema),
    result: domainHash("vlatam-ai-lab/schema/v1", resultSchema),
  };
}

export type { DurableArcaStoreOperationResult };

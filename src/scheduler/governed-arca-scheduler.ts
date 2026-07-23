import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  unlink,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  parse,
  resolve,
  sep,
} from "node:path";

import { Ajv2020 as Ajv } from "ajv/dist/2020.js";

export const GOVERNED_ARCA_SCHEDULER_VERSION = "1.0.0" as const;
export const GOVERNED_ARCA_SCHEDULER_IDENTITY =
  "service:governed-arca-scheduler@1.0.0" as const;
export const MAXIMUM_ACTIVATION_MILLISECONDS = 72 * 60 * 60 * 1_000;

const SHA256 = "^[a-f0-9]{64}$";
const TIMESTAMP =
  "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$";
const HUMAN = "^human:[a-z0-9][a-z0-9._@-]*$";
const ID = "^[a-z0-9][a-z0-9._-]{0,127}$";
const FALSE_AUTHORITIES = {
  acquisition_authority_created: { const: false },
  export_authority_created: { const: false },
  import_authorized: { const: false },
  publication_authorized: { const: false },
  deployment_authorized: { const: false },
  database_write_authorized: { const: false },
  production_reliance_authorized: { const: false },
  downstream_scheduling_authorized: { const: false },
  vlatam_global_access_authorized: { const: false },
} as const;
const FALSE_AUTHORITY_KEYS = Object.keys(FALSE_AUTHORITIES);

export function canonicalizeSchedulerJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map(canonicalizeSchedulerJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalizeSchedulerJson(record[key])}`,
    )
    .join(",")}}`;
}

function domainHash(domain: string, value: unknown): string {
  return createHash("sha256")
    .update(domain)
    .update("\n")
    .update(canonicalizeSchedulerJson(value))
    .digest("hex");
}

function without(value: object, ...keys: string[]): unknown {
  const copy = structuredClone(value) as Record<string, unknown>;
  for (const key of keys) delete copy[key];
  return copy;
}

function canonicalBytes(value: unknown): string {
  return `${canonicalizeSchedulerJson(value)}\n`;
}

const rootBindingSchema = {
  type: "object",
  additionalProperties: false,
  required: ["identity", "path"],
  properties: {
    identity: { type: "string", pattern: ID },
    path: { type: "string", minLength: 1 },
  },
} as const;

const falseAuthorityRequired = [...FALSE_AUTHORITY_KEYS];

export const SCHEDULER_CONFIGURATION_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/arca-scheduler-configuration.schema.json",
  title: "Governed ARCA scheduler configuration",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "configuration_id",
    "configuration_sha256",
    "scheduler_identity",
    "active",
    "schedule_mode",
    "observation_interval_seconds",
    "allowed_utc_operating_windows",
    "maximum_run_duration_seconds",
    "lease_duration_seconds",
    "heartbeat_interval_seconds",
    "stale_lease_recovery_threshold_seconds",
    "maximum_observations_per_24_hours",
    "maximum_runs_per_24_hours",
    "state_root",
    "observation_root",
    "ai_131",
    "ai_132",
    "durable_ai_130_store",
    "automatic_retries",
    ...falseAuthorityRequired,
  ],
  properties: {
    schema_version: { const: "1.0.0" },
    configuration_id: { type: "string", pattern: ID },
    configuration_sha256: { type: "string", pattern: SHA256 },
    scheduler_identity: { const: GOVERNED_ARCA_SCHEDULER_IDENTITY },
    active: { type: "boolean" },
    schedule_mode: { enum: ["observation_only", "authorized_one_shot"] },
    observation_interval_seconds: {
      type: "integer",
      minimum: 300,
      maximum: 86_400,
    },
    allowed_utc_operating_windows: {
      type: "array",
      minItems: 1,
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["starts_at_utc", "ends_at_utc"],
        properties: {
          starts_at_utc: {
            type: "string",
            pattern: "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$",
          },
          ends_at_utc: {
            type: "string",
            pattern: "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$",
          },
        },
      },
    },
    maximum_run_duration_seconds: {
      type: "integer",
      minimum: 60,
      maximum: 3600,
    },
    lease_duration_seconds: { type: "integer", minimum: 60, maximum: 7200 },
    heartbeat_interval_seconds: {
      type: "integer",
      minimum: 10,
      maximum: 1800,
    },
    stale_lease_recovery_threshold_seconds: {
      type: "integer",
      minimum: 60,
      maximum: 86_400,
    },
    maximum_observations_per_24_hours: {
      type: "integer",
      minimum: 1,
      maximum: 288,
    },
    maximum_runs_per_24_hours: {
      type: "integer",
      minimum: 0,
      maximum: 24,
    },
    state_root: rootBindingSchema,
    observation_root: rootBindingSchema,
    ai_131: {
      type: "object",
      additionalProperties: false,
      required: [
        "configuration_id",
        "configuration_sha256",
        "kill_switch_path",
        "kill_switch_reviewed_sha256",
      ],
      properties: {
        configuration_id: { type: "string", pattern: ID },
        configuration_sha256: { type: "string", pattern: SHA256 },
        kill_switch_path: { type: "string", minLength: 1 },
        kill_switch_reviewed_sha256: { type: "string", pattern: SHA256 },
      },
    },
    ai_132: {
      type: "object",
      additionalProperties: false,
      required: [
        "configuration_id",
        "configuration_sha256",
        "kill_switch_path",
        "kill_switch_reviewed_sha256",
      ],
      properties: {
        configuration_id: { type: "string", pattern: ID },
        configuration_sha256: { type: "string", pattern: SHA256 },
        kill_switch_path: { type: "string", minLength: 1 },
        kill_switch_reviewed_sha256: { type: "string", pattern: SHA256 },
      },
    },
    durable_ai_130_store: {
      type: "object",
      additionalProperties: false,
      required: ["identity", "configuration_sha256", "root_path"],
      properties: {
        identity: { type: "string", minLength: 1 },
        configuration_sha256: { type: "string", pattern: SHA256 },
        root_path: { type: "string", minLength: 1 },
      },
    },
    automatic_retries: { const: false },
    ...FALSE_AUTHORITIES,
  },
} as const;

export const SCHEDULER_ACTIVATION_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/arca-scheduler-activation.schema.json",
  title: "Governed ARCA scheduler activation",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "activation_id",
    "activation_sha256",
    "scheduler_configuration_id",
    "scheduler_configuration_sha256",
    "starts_at",
    "expires_at",
    "maximum_scheduler_observations",
    "maximum_authorized_execution_attempts",
    "approver_identity",
    "reviewer_identity",
    "separation_of_duties",
    "reason",
    "rollback_owner_identity",
    "self_renewal_authorized",
    ...falseAuthorityRequired,
  ],
  properties: {
    schema_version: { const: "1.0.0" },
    activation_id: { type: "string", pattern: ID },
    activation_sha256: { type: "string", pattern: SHA256 },
    scheduler_configuration_id: { type: "string", pattern: ID },
    scheduler_configuration_sha256: { type: "string", pattern: SHA256 },
    starts_at: { type: "string", pattern: TIMESTAMP },
    expires_at: { type: "string", pattern: TIMESTAMP },
    maximum_scheduler_observations: {
      type: "integer",
      minimum: 1,
      maximum: 216,
    },
    maximum_authorized_execution_attempts: {
      type: "integer",
      minimum: 0,
      maximum: 72,
    },
    approver_identity: { type: "string", pattern: HUMAN },
    reviewer_identity: { type: "string", pattern: HUMAN },
    separation_of_duties: { const: true },
    reason: { type: "string", minLength: 1, maxLength: 1000 },
    rollback_owner_identity: { type: "string", pattern: HUMAN },
    self_renewal_authorized: { const: false },
    ...FALSE_AUTHORITIES,
  },
} as const;

export const SCHEDULED_RUN_REQUEST_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/arca-scheduled-run-request.schema.json",
  title: "Governed ARCA scheduled run request",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "request_id",
    "request_sha256",
    "configuration_id",
    "configuration_sha256",
    "activation_id",
    "activation_sha256",
    "mode",
    "scheduled_for",
    "created_at",
    "created_by",
    "ai_131_proposal_path",
    "ai_131_authorization_path",
    "ai_132_proposal_path",
    "ai_132_authorization_path",
    ...falseAuthorityRequired,
  ],
  properties: {
    schema_version: { const: "1.0.0" },
    request_id: { type: "string", pattern: ID },
    request_sha256: { type: "string", pattern: SHA256 },
    configuration_id: { type: "string", pattern: ID },
    configuration_sha256: { type: "string", pattern: SHA256 },
    activation_id: { type: "string", pattern: ID },
    activation_sha256: { type: "string", pattern: SHA256 },
    mode: { enum: ["observe", "run_once"] },
    scheduled_for: { type: "string", pattern: TIMESTAMP },
    created_at: { type: "string", pattern: TIMESTAMP },
    created_by: { type: "string", pattern: HUMAN },
    ai_131_proposal_path: { type: ["string", "null"] },
    ai_131_authorization_path: { type: ["string", "null"] },
    ai_132_proposal_path: { type: ["string", "null"] },
    ai_132_authorization_path: { type: ["string", "null"] },
    ...FALSE_AUTHORITIES,
  },
} as const;

export const SCHEDULER_LEASE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/arca-scheduler-lease.schema.json",
  title: "Governed ARCA durable scheduler lease",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "lease_id",
    "lease_sha256",
    "scheduler_configuration_id",
    "scheduler_configuration_sha256",
    "activation_id",
    "activation_sha256",
    "owner_id",
    "process_identity",
    "acquired_at",
    "expires_at",
    "heartbeat_at",
  ],
  properties: {
    schema_version: { const: "1.0.0" },
    lease_id: { type: "string", pattern: ID },
    lease_sha256: { type: "string", pattern: SHA256 },
    scheduler_configuration_id: { type: "string", pattern: ID },
    scheduler_configuration_sha256: { type: "string", pattern: SHA256 },
    activation_id: { type: "string", pattern: ID },
    activation_sha256: { type: "string", pattern: SHA256 },
    owner_id: { type: "string", pattern: ID },
    process_identity: { type: "string", minLength: 1, maxLength: 256 },
    acquired_at: { type: "string", pattern: TIMESTAMP },
    expires_at: { type: "string", pattern: TIMESTAMP },
    heartbeat_at: { type: "string", pattern: TIMESTAMP },
  },
} as const;

export const SCHEDULER_STATES = [
  "scheduled",
  "lease_acquired",
  "configuration_verified",
  "activation_verified",
  "observation_started",
  "acquisition_preflight_checked",
  "acquisition_execution_started",
  "acquisition_not_authorized",
  "acquisition_verified",
  "acquisition_blocked",
  "acquisition_unknown",
  "export_preflight_checked",
  "export_execution_started",
  "export_not_authorized",
  "export_verified",
  "export_blocked",
  "observation_recorded",
  "recovery_required",
  "safe_abort_before_authority",
  "authority_consumed_recovery",
  "unknown_delivery_manual_review",
  "lease_expired_recovery",
  "completed",
] as const;

const journalEntrySchema = {
  type: "object",
  additionalProperties: false,
  required: ["sequence", "state", "timestamp", "evidence_sha256"],
  properties: {
    sequence: { type: "integer", minimum: 0 },
    state: { enum: SCHEDULER_STATES },
    timestamp: { type: "string", pattern: TIMESTAMP },
    evidence_sha256: { type: ["string", "null"], pattern: SHA256 },
  },
} as const;

export const SCHEDULER_RUN_JOURNAL_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/arca-scheduler-run-journal.schema.json",
  title: "Governed ARCA scheduler run journal",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "journal_id",
    "journal_sha256",
    "run_id",
    "request_id",
    "request_sha256",
    "configuration_sha256",
    "activation_sha256",
    "lease_sha256",
    "entries",
    "acquisition_authorization_consumed",
    "export_authorization_consumed",
    "unknown_delivery",
    ...falseAuthorityRequired,
  ],
  properties: {
    schema_version: { const: "1.0.0" },
    journal_id: { type: "string", pattern: ID },
    journal_sha256: { type: "string", pattern: SHA256 },
    run_id: { type: "string", pattern: ID },
    request_id: { type: "string", pattern: ID },
    request_sha256: { type: "string", pattern: SHA256 },
    configuration_sha256: { type: "string", pattern: SHA256 },
    activation_sha256: { type: "string", pattern: SHA256 },
    lease_sha256: { type: "string", pattern: SHA256 },
    entries: { type: "array", minItems: 1, items: journalEntrySchema },
    acquisition_authorization_consumed: { type: "boolean" },
    export_authorization_consumed: { type: "boolean" },
    unknown_delivery: { type: "boolean" },
    ...FALSE_AUTHORITIES,
  },
} as const;

const readinessEnum = [
  "ready",
  "not_authorized",
  "kill_switch_active",
  "recovery_required",
  "missing",
  "invalid",
] as const;

export const SCHEDULER_OBSERVATION_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/arca-scheduler-observation.schema.json",
  title: "Governed ARCA scheduler observation record",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "observation_id",
    "observation_sha256",
    "timestamp",
    "configuration_id",
    "configuration_sha256",
    "activation_status",
    "scheduler_kill_switch_status",
    "lease_status",
    "ai_131_readiness",
    "ai_131_authorization_available",
    "ai_131_recovery_state",
    "ai_132_readiness",
    "ai_132_authorization_available",
    "ai_132_recovery_state",
    "ai_130_integrity_status",
    "daily_observation_count",
    "daily_execution_attempt_count",
    "activation_execution_attempt_count",
    "next_eligible_observation_at",
    "reasons_for_not_executing",
    ...falseAuthorityRequired,
  ],
  properties: {
    schema_version: { const: "1.0.0" },
    observation_id: { type: "string", pattern: ID },
    observation_sha256: { type: "string", pattern: SHA256 },
    timestamp: { type: "string", pattern: TIMESTAMP },
    configuration_id: { type: "string", pattern: ID },
    configuration_sha256: { type: "string", pattern: SHA256 },
    activation_status: {
      enum: ["missing", "future", "active", "expired", "invalid"],
    },
    scheduler_kill_switch_status: {
      enum: ["active", "disabled", "missing", "invalid"],
    },
    lease_status: {
      enum: ["absent", "owned", "competing", "expired", "invalid"],
    },
    ai_131_readiness: { enum: readinessEnum },
    ai_131_authorization_available: { type: "boolean" },
    ai_131_recovery_state: {
      enum: ["clear", "recovery_required", "unknown"],
    },
    ai_132_readiness: { enum: readinessEnum },
    ai_132_authorization_available: { type: "boolean" },
    ai_132_recovery_state: {
      enum: ["clear", "recovery_required", "unknown"],
    },
    ai_130_integrity_status: { enum: ["verified", "unavailable", "invalid"] },
    daily_observation_count: { type: "integer", minimum: 0 },
    daily_execution_attempt_count: { type: "integer", minimum: 0 },
    activation_execution_attempt_count: { type: "integer", minimum: 0 },
    next_eligible_observation_at: { type: "string", pattern: TIMESTAMP },
    reasons_for_not_executing: {
      type: "array",
      uniqueItems: true,
      items: { type: "string", minLength: 1 },
    },
    ...FALSE_AUTHORITIES,
  },
} as const;

export const SCHEDULER_RECOVERY_DECISION_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/arca-scheduler-recovery-decision.schema.json",
  title: "Governed ARCA scheduler recovery decision",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "decision_id",
    "decision_sha256",
    "run_id",
    "decided_at",
    "lease_sha256",
    "journal_sha256",
    "decision",
    "automatic_retry_authorized",
    "authorization_regeneration_authorized",
    "kill_switch_change_authorized",
    "reasons",
    ...falseAuthorityRequired,
  ],
  properties: {
    schema_version: { const: "1.0.0" },
    decision_id: { type: "string", pattern: ID },
    decision_sha256: { type: "string", pattern: SHA256 },
    run_id: { type: "string", pattern: ID },
    decided_at: { type: "string", pattern: TIMESTAMP },
    lease_sha256: { type: "string", pattern: SHA256 },
    journal_sha256: { type: ["string", "null"], pattern: SHA256 },
    decision: {
      enum: [
        "safe_abort_before_authority",
        "authority_consumed_recovery",
        "unknown_delivery_manual_review",
        "lease_expired_recovery",
        "malformed_evidence_fail_closed",
      ],
    },
    automatic_retry_authorized: { const: false },
    authorization_regeneration_authorized: { const: false },
    kill_switch_change_authorized: { const: false },
    reasons: {
      type: "array",
      minItems: 1,
      items: { type: "string", minLength: 1 },
    },
    ...FALSE_AUTHORITIES,
  },
} as const;

export const SCHEDULER_KILL_SWITCH_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/arca-scheduler-kill-switch.schema.json",
  title: "Governed ARCA scheduler kill switch",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "kill_switch_id",
    "kill_switch_sha256",
    "state",
    "observation_blocked",
    "execution_blocked",
    "reviewed_artifact_id",
    "reviewed_by",
    "reviewed_at",
    "reason",
  ],
  properties: {
    schema_version: { const: "1.0.0" },
    kill_switch_id: { const: "governed-arca-scheduler" },
    kill_switch_sha256: { type: "string", pattern: SHA256 },
    state: { enum: ["active", "disabled"] },
    observation_blocked: { type: "boolean" },
    execution_blocked: { type: "boolean" },
    reviewed_artifact_id: { type: ["string", "null"] },
    reviewed_by: { type: ["string", "null"] },
    reviewed_at: { type: ["string", "null"], pattern: TIMESTAMP },
    reason: { type: "string", minLength: 1 },
  },
} as const;

export const SCHEDULER_RUN_RESULT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/arca-scheduler-run-result.schema.json",
  title: "Governed ARCA scheduler run result",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "result_id",
    "result_sha256",
    "run_id",
    "request_id",
    "completed_at",
    "final_state",
    "acquisition_outcome",
    "export_outcome",
    "observation_sha256",
    "stop_reason",
    "automatic_retry_eligible",
    ...falseAuthorityRequired,
  ],
  properties: {
    schema_version: { const: "1.0.0" },
    result_id: { type: "string", pattern: ID },
    result_sha256: { type: "string", pattern: SHA256 },
    run_id: { type: "string", pattern: ID },
    request_id: { type: "string", pattern: ID },
    completed_at: { type: "string", pattern: TIMESTAMP },
    final_state: { enum: SCHEDULER_STATES },
    acquisition_outcome: {
      enum: ["not_authorized", "blocked", "verified", "unknown"],
    },
    export_outcome: { enum: ["not_authorized", "blocked", "verified"] },
    observation_sha256: { type: "string", pattern: SHA256 },
    stop_reason: { type: "string", minLength: 1 },
    automatic_retry_eligible: { const: false },
    ...FALSE_AUTHORITIES,
  },
} as const;

const schemas = {
  configuration: SCHEDULER_CONFIGURATION_SCHEMA,
  activation: SCHEDULER_ACTIVATION_SCHEMA,
  run_request: SCHEDULED_RUN_REQUEST_SCHEMA,
  lease: SCHEDULER_LEASE_SCHEMA,
  run_journal: SCHEDULER_RUN_JOURNAL_SCHEMA,
  run_result: SCHEDULER_RUN_RESULT_SCHEMA,
  observation: SCHEDULER_OBSERVATION_SCHEMA,
  recovery_decision: SCHEDULER_RECOVERY_DECISION_SCHEMA,
  kill_switch: SCHEDULER_KILL_SWITCH_SCHEMA,
} as const;

const validators = Object.fromEntries(
  Object.entries(schemas).map(([name, schema]) => [
    name,
    new Ajv({ allErrors: true, strict: true }).compile(schema),
  ]),
);

export type SchedulerContractName = keyof typeof schemas;

export function validateSchedulerContract(
  name: SchedulerContractName,
  value: unknown,
): boolean {
  return Boolean(validators[name]?.(value));
}

export function schedulerSchemaHashes(): Record<SchedulerContractName, string> {
  return Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => [
      name,
      domainHash(`vlatam-ai-lab/arca-scheduler-schema/${name}/v1`, schema),
    ]),
  ) as Record<SchedulerContractName, string>;
}

export interface SchedulerConfiguration {
  readonly schema_version: "1.0.0";
  readonly configuration_id: string;
  readonly configuration_sha256: string;
  readonly scheduler_identity: typeof GOVERNED_ARCA_SCHEDULER_IDENTITY;
  readonly active: boolean;
  readonly schedule_mode: "observation_only" | "authorized_one_shot";
  readonly observation_interval_seconds: number;
  readonly allowed_utc_operating_windows: readonly {
    readonly starts_at_utc: string;
    readonly ends_at_utc: string;
  }[];
  readonly maximum_run_duration_seconds: number;
  readonly lease_duration_seconds: number;
  readonly heartbeat_interval_seconds: number;
  readonly stale_lease_recovery_threshold_seconds: number;
  readonly maximum_observations_per_24_hours: number;
  readonly maximum_runs_per_24_hours: number;
  readonly state_root: { readonly identity: string; readonly path: string };
  readonly observation_root: {
    readonly identity: string;
    readonly path: string;
  };
  readonly ai_131: BoundaryBinding;
  readonly ai_132: BoundaryBinding;
  readonly durable_ai_130_store: {
    readonly identity: string;
    readonly configuration_sha256: string;
    readonly root_path: string;
  };
  readonly automatic_retries: false;
  readonly acquisition_authority_created: false;
  readonly export_authority_created: false;
  readonly import_authorized: false;
  readonly publication_authorized: false;
  readonly deployment_authorized: false;
  readonly database_write_authorized: false;
  readonly production_reliance_authorized: false;
  readonly downstream_scheduling_authorized: false;
  readonly vlatam_global_access_authorized: false;
}

interface BoundaryBinding {
  readonly configuration_id: string;
  readonly configuration_sha256: string;
  readonly kill_switch_path: string;
  readonly kill_switch_reviewed_sha256: string;
}

export interface SchedulerActivation {
  readonly schema_version: "1.0.0";
  readonly activation_id: string;
  readonly activation_sha256: string;
  readonly scheduler_configuration_id: string;
  readonly scheduler_configuration_sha256: string;
  readonly starts_at: string;
  readonly expires_at: string;
  readonly maximum_scheduler_observations: number;
  readonly maximum_authorized_execution_attempts: number;
  readonly approver_identity: string;
  readonly reviewer_identity: string;
  readonly separation_of_duties: true;
  readonly reason: string;
  readonly rollback_owner_identity: string;
  readonly self_renewal_authorized: false;
  readonly acquisition_authority_created: false;
  readonly export_authority_created: false;
  readonly import_authorized: false;
  readonly publication_authorized: false;
  readonly deployment_authorized: false;
  readonly database_write_authorized: false;
  readonly production_reliance_authorized: false;
  readonly downstream_scheduling_authorized: false;
  readonly vlatam_global_access_authorized: false;
}

export interface SchedulerKillSwitch {
  readonly schema_version: "1.0.0";
  readonly kill_switch_id: "governed-arca-scheduler";
  readonly kill_switch_sha256: string;
  readonly state: "active" | "disabled";
  readonly observation_blocked: boolean;
  readonly execution_blocked: boolean;
  readonly reviewed_artifact_id: string | null;
  readonly reviewed_by: string | null;
  readonly reviewed_at: string | null;
  readonly reason: string;
}

export interface SchedulerLease {
  readonly schema_version: "1.0.0";
  readonly lease_id: string;
  readonly lease_sha256: string;
  readonly scheduler_configuration_id: string;
  readonly scheduler_configuration_sha256: string;
  readonly activation_id: string;
  readonly activation_sha256: string;
  readonly owner_id: string;
  readonly process_identity: string;
  readonly acquired_at: string;
  readonly expires_at: string;
  readonly heartbeat_at: string;
}

export interface SchedulerRunJournal {
  readonly schema_version: "1.0.0";
  readonly journal_id: string;
  readonly journal_sha256: string;
  readonly run_id: string;
  readonly request_id: string;
  readonly request_sha256: string;
  readonly configuration_sha256: string;
  readonly activation_sha256: string;
  readonly lease_sha256: string;
  readonly entries: readonly {
    readonly sequence: number;
    readonly state: (typeof SCHEDULER_STATES)[number];
    readonly timestamp: string;
    readonly evidence_sha256: string | null;
  }[];
  readonly acquisition_authorization_consumed: boolean;
  readonly export_authorization_consumed: boolean;
  readonly unknown_delivery: boolean;
  readonly acquisition_authority_created: false;
  readonly export_authority_created: false;
  readonly import_authorized: false;
  readonly publication_authorized: false;
  readonly deployment_authorized: false;
  readonly database_write_authorized: false;
  readonly production_reliance_authorized: false;
  readonly downstream_scheduling_authorized: false;
  readonly vlatam_global_access_authorized: false;
}

const falseAuthorities = {
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

export function computeSchedulerConfigurationSha256(
  value: SchedulerConfiguration,
): string {
  return domainHash(
    "vlatam-ai-lab/arca-scheduler-configuration/v1",
    without(value, "configuration_sha256"),
  );
}

export function computeSchedulerActivationSha256(
  value: SchedulerActivation,
): string {
  return domainHash(
    "vlatam-ai-lab/arca-scheduler-activation/v1",
    without(value, "activation_sha256"),
  );
}

export function computeSchedulerKillSwitchSha256(
  value: SchedulerKillSwitch,
): string {
  return domainHash(
    "vlatam-ai-lab/arca-scheduler-kill-switch/v1",
    without(value, "kill_switch_sha256"),
  );
}

export function computeSchedulerLeaseSha256(value: SchedulerLease): string {
  return domainHash(
    "vlatam-ai-lab/arca-scheduler-lease/v1",
    without(value, "lease_sha256"),
  );
}

export function computeSchedulerJournalSha256(
  value: SchedulerRunJournal,
): string {
  return domainHash(
    "vlatam-ai-lab/arca-scheduler-run-journal/v1",
    without(value, "journal_sha256"),
  );
}

export function computeScheduledRunRequestSha256(value: object): string {
  return domainHash(
    "vlatam-ai-lab/arca-scheduled-run-request/v1",
    without(value, "request_sha256"),
  );
}

export function computeSchedulerObservationSha256(value: object): string {
  return domainHash(
    "vlatam-ai-lab/arca-scheduler-observation/v1",
    without(value, "observation_sha256"),
  );
}

export function computeSchedulerRunResultSha256(value: object): string {
  return domainHash(
    "vlatam-ai-lab/arca-scheduler-run-result/v1",
    without(value, "result_sha256"),
  );
}

function exactHashValid(
  name: SchedulerContractName,
  value: unknown,
  hashKey: string,
  compute: (typed: never) => string,
): boolean {
  if (!validateSchedulerContract(name, value)) return false;
  const record = value as Record<string, unknown>;
  return record[hashKey] === compute(value as never);
}

export function validateSchedulerConfiguration(
  value: unknown,
): value is SchedulerConfiguration {
  if (
    !exactHashValid(
      "configuration",
      value,
      "configuration_sha256",
      computeSchedulerConfigurationSha256,
    )
  )
    return false;
  const typed = value as SchedulerConfiguration;
  return (
    typed.heartbeat_interval_seconds < typed.lease_duration_seconds &&
    typed.lease_duration_seconds <= typed.stale_lease_recovery_threshold_seconds
  );
}

export type ActivationStatus =
  | "missing"
  | "future"
  | "active"
  | "expired"
  | "invalid";

export function schedulerActivationStatus(
  value: unknown,
  configuration: SchedulerConfiguration,
  timestamp: string,
): ActivationStatus {
  if (value === null || value === undefined) return "missing";
  if (
    !exactHashValid(
      "activation",
      value,
      "activation_sha256",
      computeSchedulerActivationSha256,
    )
  )
    return "invalid";
  const activation = value as SchedulerActivation;
  const starts = Date.parse(activation.starts_at);
  const expires = Date.parse(activation.expires_at);
  const now = Date.parse(timestamp);
  if (
    !Number.isFinite(starts) ||
    !Number.isFinite(expires) ||
    expires <= starts ||
    expires - starts > MAXIMUM_ACTIVATION_MILLISECONDS ||
    activation.scheduler_configuration_id !== configuration.configuration_id ||
    activation.scheduler_configuration_sha256 !==
      configuration.configuration_sha256 ||
    activation.approver_identity === activation.reviewer_identity ||
    activation.approver_identity === activation.rollback_owner_identity ||
    !activation.separation_of_duties
  )
    return "invalid";
  if (now < starts) return "future";
  if (now >= expires) return "expired";
  return "active";
}

async function assertSafePath(
  path: string,
  allowMissingLeaf: boolean,
): Promise<void> {
  if (!isAbsolute(path)) throw new Error("path_must_be_absolute");
  const normalized = resolve(path);
  if (normalized !== path || path.split(sep).includes(".."))
    throw new Error("path_traversal_or_substitution");
  const parsed = parse(normalized);
  const parts = normalized.slice(parsed.root.length).split(sep).filter(Boolean);
  let current = parsed.root;
  for (let index = 0; index < parts.length; index += 1) {
    current = join(current, parts[index]!);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new Error("symbolic_link_rejected");
      const isLeaf = index === parts.length - 1;
      if (!isLeaf && !stat.isDirectory())
        throw new Error("non_directory_path_component");
      if (isLeaf && (stat.mode & 0o170000) !== 0o100000 && !stat.isDirectory())
        throw new Error("non_regular_path_rejected");
    } catch (error: unknown) {
      if (
        allowMissingLeaf &&
        index === parts.length - 1 &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      )
        return;
      throw error;
    }
  }
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeExclusiveDurable(
  path: string,
  bytes: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await assertSafePath(dirname(path), false);
  await assertSafePath(path, true);
  const handle = await open(
    path,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    0o600,
  );
  try {
    await handle.writeFile(bytes, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncDirectory(dirname(path));
}

async function readExactRegular(path: string): Promise<string> {
  await assertSafePath(path, false);
  const stat = await lstat(path);
  if ((stat.mode & 0o170000) !== 0o100000 || stat.isSymbolicLink())
    throw new Error("non_regular_file_rejected");
  return readFile(path, "utf8");
}

export function schedulerLeasePath(
  configuration: SchedulerConfiguration,
): string {
  const identity = domainHash(
    "vlatam-ai-lab/arca-scheduler-lease-identity/v1",
    {
      configuration_id: configuration.configuration_id,
      configuration_sha256: configuration.configuration_sha256,
    },
  );
  return join(
    resolve(configuration.state_root.path),
    "leases",
    `${identity}.json`,
  );
}

export async function acquireSchedulerLease(input: {
  readonly configuration: SchedulerConfiguration;
  readonly activation: SchedulerActivation;
  readonly ownerId: string;
  readonly processIdentity: string;
  readonly timestamp: string;
}): Promise<{
  readonly status: "acquired" | "competing" | "recovery_required";
  readonly lease: SchedulerLease | null;
}> {
  if (!validateSchedulerConfiguration(input.configuration))
    throw new Error("invalid_scheduler_configuration");
  if (
    schedulerActivationStatus(
      input.activation,
      input.configuration,
      input.timestamp,
    ) !== "active"
  )
    throw new Error("activation_not_active");
  const acquired = Date.parse(input.timestamp);
  const unsigned = {
    schema_version: "1.0.0",
    lease_id: domainHash("vlatam-ai-lab/arca-scheduler-lease-id/v1", {
      configuration_sha256: input.configuration.configuration_sha256,
      activation_sha256: input.activation.activation_sha256,
    }),
    lease_sha256: "0".repeat(64),
    scheduler_configuration_id: input.configuration.configuration_id,
    scheduler_configuration_sha256: input.configuration.configuration_sha256,
    activation_id: input.activation.activation_id,
    activation_sha256: input.activation.activation_sha256,
    owner_id: input.ownerId,
    process_identity: input.processIdentity,
    acquired_at: input.timestamp,
    expires_at: new Date(
      acquired + input.configuration.lease_duration_seconds * 1000,
    ).toISOString(),
    heartbeat_at: input.timestamp,
  } satisfies SchedulerLease;
  const lease: SchedulerLease = {
    ...unsigned,
    lease_sha256: computeSchedulerLeaseSha256(unsigned),
  };
  const path = schedulerLeasePath(input.configuration);
  try {
    await writeExclusiveDurable(path, canonicalBytes(lease));
    return { status: "acquired", lease };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const bytes = await readExactRegular(path);
    let existing: unknown;
    try {
      existing = JSON.parse(bytes);
    } catch {
      return { status: "recovery_required", lease: null };
    }
    if (
      !exactHashValid(
        "lease",
        existing,
        "lease_sha256",
        computeSchedulerLeaseSha256,
      )
    )
      return { status: "recovery_required", lease: null };
    const typed = existing as SchedulerLease;
    return {
      status:
        Date.parse(typed.expires_at) <= acquired
          ? "recovery_required"
          : "competing",
      lease: typed,
    };
  }
}

export async function heartbeatSchedulerLease(input: {
  readonly configuration: SchedulerConfiguration;
  readonly expectedLease: SchedulerLease;
  readonly ownerId: string;
  readonly processIdentity: string;
  readonly timestamp: string;
}): Promise<SchedulerLease> {
  const path = schedulerLeasePath(input.configuration);
  const expectedBytes = canonicalBytes(input.expectedLease);
  if ((await readExactRegular(path)) !== expectedBytes)
    throw new Error("divergent_lease_bytes");
  if (
    input.expectedLease.owner_id !== input.ownerId ||
    input.expectedLease.process_identity !== input.processIdentity
  )
    throw new Error("lease_owner_mismatch");
  const nextUnsigned: SchedulerLease = {
    ...input.expectedLease,
    lease_sha256: "0".repeat(64),
    heartbeat_at: input.timestamp,
    expires_at: new Date(
      Date.parse(input.timestamp) +
        input.configuration.lease_duration_seconds * 1000,
    ).toISOString(),
  };
  const next = {
    ...nextUnsigned,
    lease_sha256: computeSchedulerLeaseSha256(nextUnsigned),
  };
  const temporary = join(
    dirname(path),
    `.${basename(path)}.${randomUUID()}.heartbeat`,
  );
  await writeExclusiveDurable(temporary, canonicalBytes(next));
  if ((await readExactRegular(path)) !== expectedBytes)
    throw new Error("divergent_lease_bytes");
  await rename(temporary, path);
  await syncDirectory(dirname(path));
  return next;
}

export async function releaseSchedulerLease(input: {
  readonly configuration: SchedulerConfiguration;
  readonly expectedLease: SchedulerLease;
  readonly ownerId: string;
  readonly processIdentity: string;
}): Promise<void> {
  const path = schedulerLeasePath(input.configuration);
  if (
    input.expectedLease.owner_id !== input.ownerId ||
    input.expectedLease.process_identity !== input.processIdentity
  )
    throw new Error("lease_owner_mismatch");
  if ((await readExactRegular(path)) !== canonicalBytes(input.expectedLease))
    throw new Error("divergent_lease_bytes");
  await unlink(path);
  await syncDirectory(dirname(path));
}

export function computeSchedulerRecoveryDecisionSha256(value: object): string {
  return domainHash(
    "vlatam-ai-lab/arca-scheduler-recovery-decision/v1",
    without(value, "decision_sha256"),
  );
}

export function inspectSchedulerRecovery(input: {
  readonly lease: SchedulerLease;
  readonly journal: unknown;
  readonly timestamp: string;
}): Record<string, unknown> {
  let decision:
    | "safe_abort_before_authority"
    | "authority_consumed_recovery"
    | "unknown_delivery_manual_review"
    | "lease_expired_recovery"
    | "malformed_evidence_fail_closed";
  let journalSha256: string | null = null;
  const reasons: string[] = [];
  if (
    !exactHashValid(
      "lease",
      input.lease,
      "lease_sha256",
      computeSchedulerLeaseSha256,
    )
  ) {
    decision = "malformed_evidence_fail_closed";
    reasons.push("lease_missing_malformed_or_divergent");
  } else if (input.journal === null) {
    decision = "lease_expired_recovery";
    reasons.push("expired_lease_without_run_journal_requires_review");
  } else if (
    !exactHashValid(
      "run_journal",
      input.journal,
      "journal_sha256",
      computeSchedulerJournalSha256,
    )
  ) {
    decision = "malformed_evidence_fail_closed";
    reasons.push("journal_missing_malformed_or_divergent");
  } else {
    const journal = input.journal as SchedulerRunJournal;
    journalSha256 = journal.journal_sha256;
    if (journal.unknown_delivery) {
      decision = "unknown_delivery_manual_review";
      reasons.push("unknown_transport_delivery_is_never_automatically_retried");
    } else if (
      journal.acquisition_authorization_consumed ||
      journal.export_authorization_consumed
    ) {
      decision = "authority_consumed_recovery";
      reasons.push(
        "one_shot_authority_consumed_requires_boundary_reconciliation",
      );
    } else {
      decision = "safe_abort_before_authority";
      reasons.push("journal_proves_no_one_shot_authority_was_consumed");
    }
  }
  const unsigned = {
    schema_version: "1.0.0",
    decision_id: domainHash("vlatam-ai-lab/arca-scheduler-recovery-id/v1", {
      lease_sha256: input.lease.lease_sha256,
      journal_sha256: journalSha256,
    }),
    decision_sha256: "0".repeat(64),
    run_id:
      input.journal &&
      typeof input.journal === "object" &&
      "run_id" in input.journal &&
      typeof input.journal.run_id === "string"
        ? input.journal.run_id
        : "unknown-run",
    decided_at: input.timestamp,
    lease_sha256: input.lease.lease_sha256,
    journal_sha256: journalSha256,
    decision,
    automatic_retry_authorized: false,
    authorization_regeneration_authorized: false,
    kill_switch_change_authorized: false,
    reasons,
    ...falseAuthorities,
  };
  return {
    ...unsigned,
    decision_sha256: computeSchedulerRecoveryDecisionSha256(unsigned),
  };
}

function utcDay(timestamp: string): string {
  return timestamp.slice(0, 10);
}

async function countCanonicalRecords(
  root: string,
  prefix: string,
  timestamp: string,
): Promise<number> {
  try {
    await assertSafePath(root, false);
    const names = await readdir(root);
    return names.filter(
      (name) =>
        name.startsWith(`${prefix}-${utcDay(timestamp)}`) &&
        name.endsWith(".json"),
    ).length;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
}

export interface SchedulerObservationInput {
  readonly configuration: SchedulerConfiguration;
  readonly activation: SchedulerActivation | null;
  readonly killSwitch: SchedulerKillSwitch | null;
  readonly timestamp: string;
  readonly ai131: {
    readonly readiness: (typeof readinessEnum)[number];
    readonly authorizationAvailable: boolean;
    readonly recoveryState: "clear" | "recovery_required" | "unknown";
  };
  readonly ai132: {
    readonly readiness: (typeof readinessEnum)[number];
    readonly authorizationAvailable: boolean;
    readonly recoveryState: "clear" | "recovery_required" | "unknown";
  };
  readonly ai130IntegrityStatus: "verified" | "unavailable" | "invalid";
  readonly persist?: boolean;
}

export async function observeGovernedArcaScheduler(
  input: SchedulerObservationInput,
): Promise<Record<string, unknown>> {
  if (!validateSchedulerConfiguration(input.configuration))
    throw new Error("invalid_scheduler_configuration");
  const activationStatus = schedulerActivationStatus(
    input.activation,
    input.configuration,
    input.timestamp,
  );
  let switchStatus: "active" | "disabled" | "missing" | "invalid" = "missing";
  if (input.killSwitch) {
    switchStatus = exactHashValid(
      "kill_switch",
      input.killSwitch,
      "kill_switch_sha256",
      computeSchedulerKillSwitchSha256,
    )
      ? input.killSwitch.state
      : "invalid";
  }
  const observationRoot = resolve(input.configuration.observation_root.path);
  const runRoot = join(resolve(input.configuration.state_root.path), "results");
  const dailyObservationCount = await countCanonicalRecords(
    observationRoot,
    "observation",
    input.timestamp,
  );
  const dailyExecutionCount = await countCanonicalRecords(
    runRoot,
    "execution",
    input.timestamp,
  );
  const reasons: string[] = [];
  if (!input.configuration.active)
    reasons.push("scheduler_configuration_inactive");
  if (activationStatus !== "active")
    reasons.push(`activation_${activationStatus}`);
  if (switchStatus !== "disabled")
    reasons.push(`scheduler_kill_switch_${switchStatus}`);
  if (
    dailyObservationCount >=
    input.configuration.maximum_observations_per_24_hours
  )
    reasons.push("daily_observation_cap_reached");
  if (dailyExecutionCount >= input.configuration.maximum_runs_per_24_hours)
    reasons.push("daily_execution_cap_reached");
  if (input.ai131.readiness !== "ready")
    reasons.push(`ai_131_${input.ai131.readiness}`);
  if (input.ai132.readiness !== "ready")
    reasons.push(`ai_132_${input.ai132.readiness}`);
  if (input.ai130IntegrityStatus !== "verified")
    reasons.push(`ai_130_${input.ai130IntegrityStatus}`);
  const observationId = domainHash(
    "vlatam-ai-lab/arca-scheduler-observation-id/v1",
    {
      configuration_sha256: input.configuration.configuration_sha256,
      timestamp: input.timestamp,
    },
  );
  const unsigned = {
    schema_version: "1.0.0",
    observation_id: observationId,
    observation_sha256: "0".repeat(64),
    timestamp: input.timestamp,
    configuration_id: input.configuration.configuration_id,
    configuration_sha256: input.configuration.configuration_sha256,
    activation_status: activationStatus,
    scheduler_kill_switch_status: switchStatus,
    lease_status: "absent",
    ai_131_readiness: input.ai131.readiness,
    ai_131_authorization_available: input.ai131.authorizationAvailable,
    ai_131_recovery_state: input.ai131.recoveryState,
    ai_132_readiness: input.ai132.readiness,
    ai_132_authorization_available: input.ai132.authorizationAvailable,
    ai_132_recovery_state: input.ai132.recoveryState,
    ai_130_integrity_status: input.ai130IntegrityStatus,
    daily_observation_count: dailyObservationCount,
    daily_execution_attempt_count: dailyExecutionCount,
    activation_execution_attempt_count: dailyExecutionCount,
    next_eligible_observation_at: new Date(
      Date.parse(input.timestamp) +
        input.configuration.observation_interval_seconds * 1000,
    ).toISOString(),
    reasons_for_not_executing: [...new Set(reasons)].sort(),
    ...falseAuthorities,
  };
  const observation = {
    ...unsigned,
    observation_sha256: domainHash(
      "vlatam-ai-lab/arca-scheduler-observation/v1",
      without(unsigned, "observation_sha256"),
    ),
  };
  if (!validateSchedulerContract("observation", observation))
    throw new Error("generated_observation_invalid");
  if (input.persist !== false) {
    const path = join(
      observationRoot,
      `observation-${utcDay(input.timestamp)}-${observationId}.json`,
    );
    await writeExclusiveDurable(path, canonicalBytes(observation));
  }
  return observation;
}

export async function generateSchedulerPilotSummary(input: {
  readonly configuration: SchedulerConfiguration;
  readonly activation: SchedulerActivation;
  readonly timestamp: string;
}): Promise<Record<string, unknown>> {
  const observations = await countCanonicalRecords(
    resolve(input.configuration.observation_root.path),
    "observation",
    input.timestamp,
  );
  const attempts = await countCanonicalRecords(
    join(resolve(input.configuration.state_root.path), "results"),
    "execution",
    input.timestamp,
  );
  return {
    schema_version: "1.0.0",
    summary_type: "governed_arca_scheduler_pilot_summary",
    configuration_id: input.configuration.configuration_id,
    configuration_sha256: input.configuration.configuration_sha256,
    activation_id: input.activation.activation_id,
    activation_sha256: input.activation.activation_sha256,
    generated_at: input.timestamp,
    activation_status: schedulerActivationStatus(
      input.activation,
      input.configuration,
      input.timestamp,
    ),
    observations_recorded: observations,
    authorized_execution_attempts: attempts,
    observation_limit: input.activation.maximum_scheduler_observations,
    execution_attempt_limit:
      input.activation.maximum_authorized_execution_attempts,
    stop_reason:
      Date.parse(input.timestamp) >= Date.parse(input.activation.expires_at)
        ? "activation_expired"
        : attempts >= input.activation.maximum_authorized_execution_attempts
          ? "activation_attempt_cap_reached"
          : "pilot_window_open_no_unattended_authority",
    automatic_retries: false,
    ...falseAuthorities,
  };
}

export interface ScheduledBoundaryOutcome {
  readonly outcome: "blocked" | "verified" | "unknown";
  readonly authorizationConsumed: boolean;
  readonly evidenceSha256: string | null;
}

export interface ScheduledBoundary {
  readonly preflight: () => Promise<{
    readonly authorized: boolean;
    readonly evidenceSha256: string | null;
  }>;
  readonly execute: () => Promise<ScheduledBoundaryOutcome>;
}

async function sealJournal(
  configuration: SchedulerConfiguration,
  journal: SchedulerRunJournal,
): Promise<void> {
  const path = join(
    resolve(configuration.state_root.path),
    "journals",
    `${journal.run_id}.json`,
  );
  await writeExclusiveDurable(path, canonicalBytes(journal));
}

async function replaceJournalExact(
  configuration: SchedulerConfiguration,
  expected: SchedulerRunJournal,
  next: SchedulerRunJournal,
): Promise<void> {
  const path = join(
    resolve(configuration.state_root.path),
    "journals",
    `${expected.run_id}.json`,
  );
  if ((await readExactRegular(path)) !== canonicalBytes(expected))
    throw new Error("divergent_scheduler_journal");
  const staging = join(
    dirname(path),
    `.${basename(path)}.${randomUUID()}.journal`,
  );
  await writeExclusiveDurable(staging, canonicalBytes(next));
  if ((await readExactRegular(path)) !== canonicalBytes(expected))
    throw new Error("divergent_scheduler_journal");
  await rename(staging, path);
  await syncDirectory(dirname(path));
}

async function completeJournal(
  configuration: SchedulerConfiguration,
  journal: SchedulerRunJournal,
): Promise<void> {
  const active = join(
    resolve(configuration.state_root.path),
    "journals",
    `${journal.run_id}.json`,
  );
  const completed = join(
    resolve(configuration.state_root.path),
    "completed-journals",
    `${journal.run_id}.json`,
  );
  await mkdir(dirname(completed), { recursive: true, mode: 0o700 });
  await assertSafePath(dirname(completed), false);
  await assertSafePath(completed, true);
  await link(active, completed);
  await syncDirectory(dirname(completed));
  if ((await readExactRegular(completed)) !== canonicalBytes(journal))
    throw new Error("completed_scheduler_journal_divergent");
  await unlink(active);
  await syncDirectory(dirname(active));
}

export async function runGovernedArcaSchedulerOnce(input: {
  readonly configuration: SchedulerConfiguration;
  readonly activation: SchedulerActivation;
  readonly killSwitch: SchedulerKillSwitch;
  readonly request: Record<string, unknown>;
  readonly runId: string;
  readonly ownerId: string;
  readonly processIdentity: string;
  readonly timestamp: string;
  readonly observation: Omit<SchedulerObservationInput, "persist">;
  readonly acquisitionBoundary: ScheduledBoundary | null;
  readonly exportBoundary: ScheduledBoundary | null;
}): Promise<Record<string, unknown>> {
  if (!validateSchedulerConfiguration(input.configuration))
    throw new Error("invalid_scheduler_configuration");
  if (!input.configuration.active) throw new Error("scheduler_inactive");
  if (
    schedulerActivationStatus(
      input.activation,
      input.configuration,
      input.timestamp,
    ) !== "active"
  )
    throw new Error("activation_not_active");
  if (
    !exactHashValid(
      "kill_switch",
      input.killSwitch,
      "kill_switch_sha256",
      computeSchedulerKillSwitchSha256,
    ) ||
    input.killSwitch.state !== "disabled" ||
    input.killSwitch.execution_blocked ||
    !input.killSwitch.reviewed_artifact_id ||
    !input.killSwitch.reviewed_by ||
    !input.killSwitch.reviewed_at
  )
    throw new Error("scheduler_kill_switch_active");
  if (
    !exactHashValid(
      "run_request",
      input.request,
      "request_sha256",
      computeScheduledRunRequestSha256,
    )
  )
    throw new Error("invalid_run_request");
  if (
    input.request["configuration_sha256"] !==
      input.configuration.configuration_sha256 ||
    input.request["activation_sha256"] !== input.activation.activation_sha256 ||
    input.request["mode"] !== "run_once"
  )
    throw new Error("run_request_binding_mismatch");

  const leaseResult = await acquireSchedulerLease({
    configuration: input.configuration,
    activation: input.activation,
    ownerId: input.ownerId,
    processIdentity: input.processIdentity,
    timestamp: input.timestamp,
  });
  if (leaseResult.status !== "acquired" || !leaseResult.lease)
    throw new Error(`scheduler_lease_${leaseResult.status}`);
  const lease = leaseResult.lease;
  const entries: SchedulerRunJournal["entries"][number][] = [
    {
      sequence: 0,
      state: "scheduled",
      timestamp: input.timestamp,
      evidence_sha256: input.request["request_sha256"] as string,
    },
    {
      sequence: 1,
      state: "lease_acquired",
      timestamp: input.timestamp,
      evidence_sha256: lease.lease_sha256,
    },
    {
      sequence: 2,
      state: "configuration_verified",
      timestamp: input.timestamp,
      evidence_sha256: input.configuration.configuration_sha256,
    },
    {
      sequence: 3,
      state: "activation_verified",
      timestamp: input.timestamp,
      evidence_sha256: input.activation.activation_sha256,
    },
  ];
  const initialUnsigned: SchedulerRunJournal = {
    schema_version: "1.0.0",
    journal_id: domainHash("vlatam-ai-lab/arca-scheduler-journal-id/v1", {
      run_id: input.runId,
      request_sha256: input.request["request_sha256"],
    }),
    journal_sha256: "0".repeat(64),
    run_id: input.runId,
    request_id: input.request["request_id"] as string,
    request_sha256: input.request["request_sha256"] as string,
    configuration_sha256: input.configuration.configuration_sha256,
    activation_sha256: input.activation.activation_sha256,
    lease_sha256: lease.lease_sha256,
    entries,
    acquisition_authorization_consumed: false,
    export_authorization_consumed: false,
    unknown_delivery: false,
    ...falseAuthorities,
  };
  const initial: SchedulerRunJournal = {
    ...initialUnsigned,
    journal_sha256: computeSchedulerJournalSha256(initialUnsigned),
  };
  await sealJournal(input.configuration, initial);
  let currentJournal = initial;
  const advanceJournal = async (
    state: SchedulerRunJournal["entries"][number]["state"],
    evidenceSha256: string | null,
    changes: {
      readonly acquisitionConsumed?: boolean;
      readonly exportConsumed?: boolean;
      readonly unknownDelivery?: boolean;
    } = {},
  ): Promise<void> => {
    const unsigned: SchedulerRunJournal = {
      ...currentJournal,
      journal_sha256: "0".repeat(64),
      entries: [
        ...currentJournal.entries,
        {
          sequence: currentJournal.entries.length,
          state,
          timestamp: input.timestamp,
          evidence_sha256: evidenceSha256,
        },
      ],
      acquisition_authorization_consumed:
        changes.acquisitionConsumed ??
        currentJournal.acquisition_authorization_consumed,
      export_authorization_consumed:
        changes.exportConsumed ?? currentJournal.export_authorization_consumed,
      unknown_delivery:
        changes.unknownDelivery ?? currentJournal.unknown_delivery,
    };
    const next: SchedulerRunJournal = {
      ...unsigned,
      journal_sha256: computeSchedulerJournalSha256(unsigned),
    };
    await replaceJournalExact(input.configuration, currentJournal, next);
    currentJournal = next;
  };

  let acquisitionOutcome:
    | "not_authorized"
    | "blocked"
    | "verified"
    | "unknown" = "not_authorized";
  let exportOutcome: "not_authorized" | "blocked" | "verified" =
    "not_authorized";
  let consumedAcquisition = false;
  let consumedExport = false;
  let unknownDelivery = false;
  if (input.acquisitionBoundary) {
    const preflight = await input.acquisitionBoundary.preflight();
    await advanceJournal(
      "acquisition_preflight_checked",
      preflight.evidenceSha256,
    );
    if (preflight.authorized) {
      await advanceJournal("acquisition_execution_started", null);
      const outcome = await input.acquisitionBoundary.execute();
      acquisitionOutcome = outcome.outcome;
      consumedAcquisition = outcome.authorizationConsumed;
      unknownDelivery = outcome.outcome === "unknown";
      await advanceJournal(
        outcome.outcome === "verified"
          ? "acquisition_verified"
          : outcome.outcome === "unknown"
            ? "acquisition_unknown"
            : "acquisition_blocked",
        outcome.evidenceSha256,
        {
          acquisitionConsumed: consumedAcquisition,
          unknownDelivery,
        },
      );
    } else acquisitionOutcome = "blocked";
  } else await advanceJournal("acquisition_not_authorized", null);
  if (!unknownDelivery && input.exportBoundary) {
    const preflight = await input.exportBoundary.preflight();
    await advanceJournal("export_preflight_checked", preflight.evidenceSha256);
    if (preflight.authorized) {
      await advanceJournal("export_execution_started", null);
      const outcome = await input.exportBoundary.execute();
      exportOutcome = outcome.outcome === "verified" ? "verified" : "blocked";
      consumedExport = outcome.authorizationConsumed;
      await advanceJournal(
        outcome.outcome === "verified" ? "export_verified" : "export_blocked",
        outcome.evidenceSha256,
        { exportConsumed: consumedExport },
      );
    } else exportOutcome = "blocked";
  } else if (!unknownDelivery)
    await advanceJournal("export_not_authorized", null);
  const observation = await observeGovernedArcaScheduler({
    ...input.observation,
    persist: true,
  });
  await advanceJournal(
    "observation_recorded",
    observation["observation_sha256"] as string,
  );
  const finalState = unknownDelivery
    ? "unknown_delivery_manual_review"
    : "completed";
  const resultUnsigned = {
    schema_version: "1.0.0",
    result_id: domainHash("vlatam-ai-lab/arca-scheduler-result-id/v1", {
      run_id: input.runId,
      request_sha256: input.request["request_sha256"],
    }),
    result_sha256: "0".repeat(64),
    run_id: input.runId,
    request_id: input.request["request_id"],
    completed_at: input.timestamp,
    final_state: finalState,
    acquisition_outcome: acquisitionOutcome,
    export_outcome: exportOutcome,
    observation_sha256: observation["observation_sha256"],
    stop_reason: unknownDelivery
      ? "unknown_delivery_requires_manual_review_no_retry"
      : "exact_one_shot_iteration_completed",
    automatic_retry_eligible: false,
    ...falseAuthorities,
  };
  const result = {
    ...resultUnsigned,
    result_sha256: computeSchedulerRunResultSha256(resultUnsigned),
  };
  if (!validateSchedulerContract("run_result", result))
    throw new Error("generated_run_result_invalid");
  await writeExclusiveDurable(
    join(
      resolve(input.configuration.state_root.path),
      "results",
      `execution-${utcDay(input.timestamp)}-${input.runId}.json`,
    ),
    canonicalBytes(result),
  );
  await advanceJournal(finalState, result.result_sha256 as string, {
    acquisitionConsumed: consumedAcquisition,
    exportConsumed: consumedExport,
    unknownDelivery,
  });
  await completeJournal(input.configuration, currentJournal);
  await releaseSchedulerLease({
    configuration: input.configuration,
    expectedLease: lease,
    ownerId: input.ownerId,
    processIdentity: input.processIdentity,
  });
  return result;
}

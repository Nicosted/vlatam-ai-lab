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
import { fileURLToPath } from "node:url";

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
export const AUTHORITATIVE_BOUNDARY_DISPOSITIONS = [
  "not_authorized",
  "positively_not_consumed",
  "consumed_completed",
  "consumed_recovery_required",
  "unknown_delivery",
  "divergent_evidence",
  "malformed_evidence",
] as const;
export type AuthoritativeBoundaryDisposition =
  (typeof AUTHORITATIVE_BOUNDARY_DISPOSITIONS)[number];

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

const exactArtifactBindingSchema = {
  type: "object",
  additionalProperties: false,
  required: ["path", "identity", "sha256", "canonical_sha256"],
  properties: {
    path: { type: "string", minLength: 1 },
    identity: { type: "string", minLength: 1 },
    sha256: { type: "string", pattern: SHA256 },
    canonical_sha256: { type: "string", pattern: SHA256 },
  },
} as const;

const expectedArtifactBindingSchema = {
  type: "object",
  additionalProperties: false,
  required: ["path", "identity"],
  properties: {
    path: { type: "string", minLength: 1 },
    identity: { type: "string", minLength: 1 },
  },
} as const;

const boundaryEvidenceBindingSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "configuration",
    "proposal",
    "authorization",
    "expected_consumption",
    "authoritative_journal",
    "durable_result",
    "primary_evidence",
    "secondary_evidence",
    "kill_switch",
    "recovery_root",
  ],
  properties: {
    configuration: exactArtifactBindingSchema,
    proposal: exactArtifactBindingSchema,
    authorization: exactArtifactBindingSchema,
    expected_consumption: exactArtifactBindingSchema,
    authoritative_journal: exactArtifactBindingSchema,
    durable_result: exactArtifactBindingSchema,
    primary_evidence: exactArtifactBindingSchema,
    secondary_evidence: exactArtifactBindingSchema,
    kill_switch: exactArtifactBindingSchema,
    recovery_root: expectedArtifactBindingSchema,
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
    "kill_switch_path",
    "kill_switch_reviewed_sha256",
    "kill_switch_canonical_sha256",
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
    kill_switch_path: { type: "string", minLength: 1 },
    kill_switch_reviewed_sha256: { type: "string", pattern: SHA256 },
    kill_switch_canonical_sha256: { type: "string", pattern: SHA256 },
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
        "kill_switch_canonical_sha256",
      ],
      properties: {
        configuration_id: { type: "string", pattern: ID },
        configuration_sha256: { type: "string", pattern: SHA256 },
        kill_switch_path: { type: "string", minLength: 1 },
        kill_switch_reviewed_sha256: { type: "string", pattern: SHA256 },
        kill_switch_canonical_sha256: { type: "string", pattern: SHA256 },
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
        "kill_switch_canonical_sha256",
      ],
      properties: {
        configuration_id: { type: "string", pattern: ID },
        configuration_sha256: { type: "string", pattern: SHA256 },
        kill_switch_path: { type: "string", minLength: 1 },
        kill_switch_reviewed_sha256: { type: "string", pattern: SHA256 },
        kill_switch_canonical_sha256: { type: "string", pattern: SHA256 },
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
    "eligible_slot_id",
    "ai_131",
    "ai_132",
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
    eligible_slot_id: { type: "string", pattern: SHA256 },
    ai_131: boundaryEvidenceBindingSchema,
    ai_132: boundaryEvidenceBindingSchema,
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
    evidence_sha256: { type: "string", pattern: SHA256 },
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
    "ai_131_evidence",
    "ai_132_evidence",
    "authority_outcome",
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
    ai_131_evidence: boundaryEvidenceBindingSchema,
    ai_132_evidence: boundaryEvidenceBindingSchema,
    authority_outcome: {
      enum: [
        "not_started",
        "authority_outcome_unknown",
        "not_consumed",
        "consumed_completed",
        "consumed_recovery_required",
        "unknown_delivery",
        "divergent_evidence",
      ],
    },
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
  "unverified_reported_input",
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
    ai_130_integrity_status: {
      enum: ["verified", "unavailable", "invalid", "unverified_reported_input"],
    },
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
        "active_lease_not_stale",
        "completed_after_recovery",
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

export const SCHEDULER_RECOVERY_INPUT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/arca-scheduler-recovery-input.schema.json",
  title: "Governed ARCA scheduler exact durable recovery input",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "environment_id",
    "run_id",
    "request_id",
    "timestamp",
  ],
  properties: {
    schema_version: { const: "1.0.0" },
    environment_id: { type: "string", pattern: ID },
    run_id: { type: "string", pattern: ID },
    request_id: { type: "string", pattern: ID },
    timestamp: { type: "string", pattern: TIMESTAMP },
  },
} as const;

const reviewedEnvironmentPathFields = [
  "repository_root",
  "scheduler_configuration_path",
  "scheduler_switch_path",
  "ai_131_configuration_path",
  "ai_131_switch_path",
  "ai_132_configuration_path",
  "ai_132_switch_path",
  "scheduler_state_root",
  "scheduler_observation_root",
  "ai_130_root",
  "ai_131_state_root",
  "ai_131_acquisition_root",
  "ai_131_candidate_root",
  "ai_132_state_root",
  "ai_132_export_root",
  "ai_132_recovery_root",
] as const;

export const SCHEDULER_REVIEWED_ENVIRONMENT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/arca-scheduler-reviewed-environment.schema.json",
  title: "Governed ARCA scheduler independently reviewed environment",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "environment_id",
    "environment_sha256",
    ...reviewedEnvironmentPathFields,
  ],
  properties: {
    schema_version: { const: "1.0.0" },
    environment_id: { type: "string", pattern: ID },
    environment_sha256: { type: "string", pattern: SHA256 },
    ...Object.fromEntries(
      reviewedEnvironmentPathFields.map((field) => [
        field,
        { type: "string", minLength: 1 },
      ]),
    ),
  },
} as const;

const boundaryDispositionSchema = (boundaryType: "ai_131" | "ai_132") =>
  ({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `https://schemas.vlatam.local/arca-scheduler-${boundaryType.replace("_", "-")}-disposition.schema.json`,
    title: `Governed ARCA scheduler ${boundaryType} authoritative disposition`,
    type: "object",
    additionalProperties: false,
    required: [
      "schema_version",
      "boundary_type",
      "disposition_sha256",
      "request_id",
      "reconciled_at",
      "disposition",
      "authoritative_evidence",
      "reason",
    ],
    properties: {
      schema_version: { const: "1.0.0" },
      boundary_type: { const: boundaryType },
      disposition_sha256: { type: "string", pattern: SHA256 },
      request_id: { type: "string", pattern: ID },
      reconciled_at: { type: "string", pattern: TIMESTAMP },
      disposition: { enum: AUTHORITATIVE_BOUNDARY_DISPOSITIONS },
      authoritative_evidence: {
        anyOf: [{ type: "null" }, exactArtifactBindingSchema],
      },
      reason: { type: "string", minLength: 1 },
    },
  }) as const;

export const SCHEDULER_AI_131_DISPOSITION_SCHEMA =
  boundaryDispositionSchema("ai_131");
export const SCHEDULER_AI_132_DISPOSITION_SCHEMA =
  boundaryDispositionSchema("ai_132");

const ledgerReservationBindingSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reservation_id", "reservation_sha256"],
  properties: {
    reservation_id: { type: "string", pattern: SHA256 },
    reservation_sha256: { type: "string", pattern: SHA256 },
  },
} as const;

export const SCHEDULER_ATTEMPT_LEDGER_MANIFEST_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/arca-scheduler-attempt-ledger-manifest.schema.json",
  title: "Governed ARCA scheduler authenticated attempt-ledger manifest",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "ledger_version",
    "manifest_sha256",
    "canonical_sha256",
    "scheduler_configuration_id",
    "scheduler_configuration_sha256",
    "activation_id",
    "activation_sha256",
    "state_root_identity",
    "state_root_path",
    "initialized_at",
    "reservation_directory",
    "reservations",
  ],
  properties: {
    schema_version: { const: "1.0.0" },
    ledger_version: { const: "1.0.0" },
    manifest_sha256: { type: "string", pattern: SHA256 },
    canonical_sha256: { type: "string", pattern: SHA256 },
    scheduler_configuration_id: { type: "string", pattern: ID },
    scheduler_configuration_sha256: { type: "string", pattern: SHA256 },
    activation_id: { type: "string", pattern: ID },
    activation_sha256: { type: "string", pattern: SHA256 },
    state_root_identity: { type: "string", pattern: ID },
    state_root_path: { type: "string", minLength: 1 },
    initialized_at: { type: "string", pattern: TIMESTAMP },
    reservation_directory: { type: "string", minLength: 1 },
    reservations: {
      type: "array",
      items: ledgerReservationBindingSchema,
    },
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
      enum: AUTHORITATIVE_BOUNDARY_DISPOSITIONS,
    },
    export_outcome: { enum: AUTHORITATIVE_BOUNDARY_DISPOSITIONS },
    observation_sha256: { type: "string", pattern: SHA256 },
    stop_reason: { type: "string", minLength: 1 },
    automatic_retry_eligible: { const: false },
    ...FALSE_AUTHORITIES,
  },
} as const;

export const SCHEDULER_ATTEMPT_LEDGER_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/arca-scheduler-attempt-ledger.schema.json",
  title: "Governed ARCA scheduler activation-scoped attempt ledger record",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "reservation_id",
    "reservation_sha256",
    "scheduler_configuration_id",
    "scheduler_configuration_sha256",
    "activation_id",
    "activation_sha256",
    "eligible_slot_id",
    "scheduled_for",
    "request_id",
    "request_sha256",
    "boundary_type",
    "reserved_at",
    "state",
    "authoritative_consumption_evidence",
    ...falseAuthorityRequired,
  ],
  properties: {
    schema_version: { const: "1.0.0" },
    reservation_id: { type: "string", pattern: SHA256 },
    reservation_sha256: { type: "string", pattern: SHA256 },
    scheduler_configuration_id: { type: "string", pattern: ID },
    scheduler_configuration_sha256: { type: "string", pattern: SHA256 },
    activation_id: { type: "string", pattern: ID },
    activation_sha256: { type: "string", pattern: SHA256 },
    eligible_slot_id: { type: "string", pattern: SHA256 },
    scheduled_for: { type: "string", pattern: TIMESTAMP },
    request_id: { type: "string", pattern: ID },
    request_sha256: { type: "string", pattern: SHA256 },
    boundary_type: { enum: ["ai_131", "ai_132"] },
    reserved_at: { type: "string", pattern: TIMESTAMP },
    state: {
      enum: ["reserved", "consumed", "completed", "recovery_required"],
    },
    authoritative_consumption_evidence: {
      anyOf: [{ type: "null" }, exactArtifactBindingSchema],
    },
    ...FALSE_AUTHORITIES,
  },
} as const;

export const SCHEDULER_SLOT_ACCEPTANCE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/arca-scheduler-slot-acceptance.schema.json",
  title: "Governed ARCA scheduler durable eligible-slot acceptance",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "slot_id",
    "slot_sha256",
    "configuration_sha256",
    "activation_sha256",
    "observation_interval_seconds",
    "scheduled_for",
    "request_id",
    "request_sha256",
    "accepted_at",
    ...falseAuthorityRequired,
  ],
  properties: {
    schema_version: { const: "1.0.0" },
    slot_id: { type: "string", pattern: SHA256 },
    slot_sha256: { type: "string", pattern: SHA256 },
    configuration_sha256: { type: "string", pattern: SHA256 },
    activation_sha256: { type: "string", pattern: SHA256 },
    observation_interval_seconds: { type: "integer", minimum: 300 },
    scheduled_for: { type: "string", pattern: TIMESTAMP },
    request_id: { type: "string", pattern: ID },
    request_sha256: { type: "string", pattern: SHA256 },
    accepted_at: { type: "string", pattern: TIMESTAMP },
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
  recovery_input: SCHEDULER_RECOVERY_INPUT_SCHEMA,
  recovery_decision: SCHEDULER_RECOVERY_DECISION_SCHEMA,
  kill_switch: SCHEDULER_KILL_SWITCH_SCHEMA,
  attempt_ledger: SCHEDULER_ATTEMPT_LEDGER_SCHEMA,
  attempt_ledger_manifest: SCHEDULER_ATTEMPT_LEDGER_MANIFEST_SCHEMA,
  slot_acceptance: SCHEDULER_SLOT_ACCEPTANCE_SCHEMA,
  reviewed_environment: SCHEDULER_REVIEWED_ENVIRONMENT_SCHEMA,
  ai_131_disposition: SCHEDULER_AI_131_DISPOSITION_SCHEMA,
  ai_132_disposition: SCHEDULER_AI_132_DISPOSITION_SCHEMA,
} as const;

const validators = Object.fromEntries(
  Object.entries(schemas).map(([name, schema]) => [
    name,
    new Ajv({ allErrors: true, strict: true }).compile(schema),
  ]),
);

export type SchedulerContractName = keyof typeof schemas;

export function schedulerContractSchemas(): Readonly<
  Record<SchedulerContractName, unknown>
> {
  return schemas;
}

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
  readonly kill_switch_path: string;
  readonly kill_switch_reviewed_sha256: string;
  readonly kill_switch_canonical_sha256: string;
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
  readonly kill_switch_canonical_sha256: string;
}

export interface ExactArtifactBinding {
  readonly path: string;
  readonly identity: string;
  readonly sha256: string;
  readonly canonical_sha256: string;
}

export interface ReviewedRecoveryEnvironment {
  readonly schema_version: "1.0.0";
  readonly environment_id: string;
  readonly environment_sha256: string;
  readonly repository_root: string;
  readonly scheduler_configuration_path: string;
  readonly scheduler_switch_path: string;
  readonly ai_131_configuration_path: string;
  readonly ai_131_switch_path: string;
  readonly ai_132_configuration_path: string;
  readonly ai_132_switch_path: string;
  readonly scheduler_state_root: string;
  readonly scheduler_observation_root: string;
  readonly ai_130_root: string;
  readonly ai_131_state_root: string;
  readonly ai_131_acquisition_root: string;
  readonly ai_131_candidate_root: string;
  readonly ai_132_state_root: string;
  readonly ai_132_export_root: string;
  readonly ai_132_recovery_root: string;
}

export interface SchedulerBoundaryDispositionRecord {
  readonly schema_version: "1.0.0";
  readonly boundary_type: "ai_131" | "ai_132";
  readonly disposition_sha256: string;
  readonly request_id: string;
  readonly reconciled_at: string;
  readonly disposition: AuthoritativeBoundaryDisposition;
  readonly authoritative_evidence: ExactArtifactBinding | null;
  readonly reason: string;
}

export interface SchedulerAttemptLedgerManifest {
  readonly schema_version: "1.0.0";
  readonly ledger_version: "1.0.0";
  readonly manifest_sha256: string;
  readonly canonical_sha256: string;
  readonly scheduler_configuration_id: string;
  readonly scheduler_configuration_sha256: string;
  readonly activation_id: string;
  readonly activation_sha256: string;
  readonly state_root_identity: string;
  readonly state_root_path: string;
  readonly initialized_at: string;
  readonly reservation_directory: string;
  readonly reservations: readonly {
    readonly reservation_id: string;
    readonly reservation_sha256: string;
  }[];
}

export interface ExpectedArtifactBinding {
  readonly path: string;
  readonly identity: string;
}

export interface SchedulerBoundaryEvidenceBinding {
  readonly configuration: ExactArtifactBinding;
  readonly proposal: ExactArtifactBinding;
  readonly authorization: ExactArtifactBinding;
  readonly expected_consumption: ExactArtifactBinding;
  readonly authoritative_journal: ExactArtifactBinding;
  readonly durable_result: ExactArtifactBinding;
  readonly primary_evidence: ExactArtifactBinding;
  readonly secondary_evidence: ExactArtifactBinding;
  readonly kill_switch: ExactArtifactBinding;
  readonly recovery_root: ExpectedArtifactBinding;
}

export interface ScheduledRunRequest {
  readonly schema_version: "1.0.0";
  readonly request_id: string;
  readonly request_sha256: string;
  readonly configuration_id: string;
  readonly configuration_sha256: string;
  readonly activation_id: string;
  readonly activation_sha256: string;
  readonly mode: "observe" | "run_once";
  readonly scheduled_for: string;
  readonly created_at: string;
  readonly created_by: string;
  readonly eligible_slot_id: string;
  readonly ai_131: SchedulerBoundaryEvidenceBinding;
  readonly ai_132: SchedulerBoundaryEvidenceBinding;
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
    readonly evidence_sha256: string;
  }[];
  readonly ai_131_evidence: SchedulerBoundaryEvidenceBinding;
  readonly ai_132_evidence: SchedulerBoundaryEvidenceBinding;
  readonly authority_outcome:
    | "not_started"
    | "authority_outcome_unknown"
    | "not_consumed"
    | "consumed_completed"
    | "consumed_recovery_required"
    | "unknown_delivery"
    | "divergent_evidence";
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

export function computeSchedulerAttemptReservationSha256(
  value: object,
): string {
  return domainHash(
    "vlatam-ai-lab/arca-scheduler-attempt-reservation/v1",
    without(value, "reservation_sha256"),
  );
}

export function computeSchedulerAttemptLedgerManifestCanonicalSha256(
  value: object,
): string {
  return bytesSha256(
    canonicalBytes(without(value, "manifest_sha256", "canonical_sha256")),
  );
}

export function computeSchedulerAttemptLedgerManifestSha256(
  value: object,
): string {
  return domainHash(
    "vlatam-ai-lab/arca-scheduler-attempt-ledger-manifest/v1",
    without(value, "manifest_sha256"),
  );
}

export function computeSchedulerBoundaryDispositionSha256(
  value: object,
): string {
  return domainHash(
    "vlatam-ai-lab/arca-scheduler-boundary-disposition/v1",
    without(value, "disposition_sha256"),
  );
}

export function computeReviewedRecoveryEnvironmentSha256(
  value: object,
): string {
  return domainHash(
    "vlatam-ai-lab/arca-scheduler-reviewed-environment/v1",
    without(value, "environment_sha256"),
  );
}

export function computeSchedulerSlotAcceptanceSha256(value: object): string {
  return domainHash(
    "vlatam-ai-lab/arca-scheduler-slot-acceptance/v1",
    without(value, "slot_sha256"),
  );
}

export function computeEligibleSlotId(input: {
  readonly configurationSha256: string;
  readonly activationSha256: string;
  readonly observationIntervalSeconds: number;
  readonly scheduledFor: string;
}): string {
  return domainHash("vlatam-ai-lab/arca-scheduler-eligible-slot/v1", {
    configuration_sha256: input.configurationSha256,
    activation_sha256: input.activationSha256,
    observation_interval_seconds: input.observationIntervalSeconds,
    scheduled_for: input.scheduledFor,
  });
}

function bytesSha256(bytes: string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export interface ExactArtifactFieldBinding {
  readonly identityField: string;
  readonly sha256Field: string;
}

export async function loadExactRequestBoundArtifact(
  binding: ExactArtifactBinding,
  allowedRoot: string,
  fields: ExactArtifactFieldBinding,
): Promise<Record<string, unknown>> {
  const path = binding.path;
  if (!isAbsolute(path) || resolve(path) !== path)
    throw new Error("bound_artifact_path_not_absolute");
  const root = resolve(allowedRoot);
  if (!isAbsolute(allowedRoot) || root !== allowedRoot)
    throw new Error("bound_artifact_root_not_absolute");
  if (path !== root && !path.startsWith(`${root}${sep}`))
    throw new Error("bound_artifact_root_substitution");
  const raw = await readExactRegular(path);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("bound_artifact_malformed");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("bound_artifact_malformed");
  const record = value as Record<string, unknown>;
  if (bytesSha256(raw) !== binding.canonical_sha256)
    throw new Error("bound_artifact_hash_mismatch");
  if (record[fields.identityField] !== binding.identity)
    throw new Error("bound_artifact_identity_mismatch");
  if (record[fields.sha256Field] !== binding.sha256)
    throw new Error("bound_artifact_semantic_hash_mismatch");
  return record;
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
  try {
    if ((await readExactRegular(path)) !== expectedBytes)
      throw new Error("divergent_lease_bytes");
    await rename(temporary, path);
    await syncDirectory(dirname(path));
  } catch (error: unknown) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
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

export interface AuthoritativeRecoveryInspection {
  readonly status:
    | "not_authorized"
    | "positively_not_consumed"
    | "consumed_completed"
    | "consumed_recovery_required"
    | "unknown_delivery"
    | "divergent_evidence"
    | "malformed_evidence";
  readonly evidence: ExactArtifactBinding | null;
  readonly reason?: string;
}

export interface SchedulerDurableRecoveryInput {
  readonly schema_version: "1.0.0";
  readonly environment_id: string;
  readonly run_id: string;
  readonly request_id: string;
  readonly timestamp: string;
}

const repositoryRoot = resolve(
  fileURLToPath(new URL("../..", import.meta.url)),
);
const repositoryCurrentEnvironmentUnsigned = {
  schema_version: "1.0.0" as const,
  environment_id: "repository-current-ai-133",
  environment_sha256: "0".repeat(64),
  repository_root: repositoryRoot,
  scheduler_configuration_path: join(
    repositoryRoot,
    "config",
    "ai-133-governed-arca-scheduler.json",
  ),
  scheduler_switch_path: join(
    repositoryRoot,
    "config",
    "ai-133-governed-arca-scheduler-kill-switch.json",
  ),
  ai_131_configuration_path: join(
    repositoryRoot,
    "var",
    "arca-scheduler",
    "reviewed",
    "ai-131-configuration.json",
  ),
  ai_131_switch_path: join(
    repositoryRoot,
    "config",
    "ai-131-controlled-live-arca-kill-switch.json",
  ),
  ai_132_configuration_path: join(
    repositoryRoot,
    "var",
    "arca-scheduler",
    "reviewed",
    "ai-132-configuration.json",
  ),
  ai_132_switch_path: join(
    repositoryRoot,
    "config",
    "ai-132-governed-arca-export-kill-switch.json",
  ),
  scheduler_state_root: join(repositoryRoot, "var", "arca-scheduler", "state"),
  scheduler_observation_root: join(
    repositoryRoot,
    "var",
    "arca-scheduler",
    "observations",
  ),
  ai_130_root: join(repositoryRoot, "var", "arca-review-store"),
  ai_131_state_root: join(
    repositoryRoot,
    "var",
    "arca-scheduler",
    "ai-131",
    "state",
  ),
  ai_131_acquisition_root: join(
    repositoryRoot,
    "var",
    "arca-scheduler",
    "ai-131",
    "acquisitions",
  ),
  ai_131_candidate_root: join(
    repositoryRoot,
    "var",
    "arca-scheduler",
    "ai-131",
    "candidates",
  ),
  ai_132_state_root: join(
    repositoryRoot,
    "var",
    "arca-scheduler",
    "ai-132",
    "state",
  ),
  ai_132_export_root: join(
    repositoryRoot,
    "var",
    "arca-scheduler",
    "ai-132",
    "exports",
  ),
  ai_132_recovery_root: join(
    repositoryRoot,
    "var",
    "arca-scheduler",
    "ai-132",
    "state",
    "recovery",
  ),
};
const repositoryCurrentEnvironment: ReviewedRecoveryEnvironment = {
  ...repositoryCurrentEnvironmentUnsigned,
  environment_sha256: computeReviewedRecoveryEnvironmentSha256(
    repositoryCurrentEnvironmentUnsigned,
  ),
};

export const REVIEWED_RECOVERY_ENVIRONMENTS: Readonly<
  Record<string, ReviewedRecoveryEnvironment>
> = Object.freeze({
  [repositoryCurrentEnvironment.environment_id]: Object.freeze(
    repositoryCurrentEnvironment,
  ),
});

export function resolveReviewedRecoveryEnvironment(
  environmentId: string,
  registry: Readonly<
    Record<string, ReviewedRecoveryEnvironment>
  > = REVIEWED_RECOVERY_ENVIRONMENTS,
): ReviewedRecoveryEnvironment {
  const environment = registry[environmentId];
  if (
    !environment ||
    !validateSchedulerContract("reviewed_environment", environment) ||
    environment.environment_sha256 !==
      computeReviewedRecoveryEnvironmentSha256(environment) ||
    Object.values(environment)
      .filter((value) => typeof value === "string" && value.startsWith(sep))
      .some((path) => !isAbsolute(path) || resolve(path) !== path) ||
    environment.repository_root === parse(environment.repository_root).root
  )
    throw new Error("reviewed_recovery_environment_unknown_or_invalid");
  return environment;
}

export interface SchedulerDurableRecoveryEvidence {
  readonly configuration: SchedulerConfiguration;
  readonly lease: SchedulerLease;
  readonly journal: SchedulerRunJournal;
  readonly request: ScheduledRunRequest;
  readonly attemptLedgerManifest: SchedulerAttemptLedgerManifest | undefined;
  readonly reservations: readonly SchedulerAttemptReservation[] | undefined;
  readonly slot: Record<string, unknown>;
  readonly resultPresent: boolean;
  readonly recoveryResultPresent: boolean;
}

async function loadExactSchedulerArtifact(
  path: string,
  root: string,
  name: SchedulerContractName,
  hashKey: string,
  compute: (value: never) => string,
): Promise<Record<string, unknown>> {
  const resolvedRoot = resolve(root);
  if (
    !isAbsolute(path) ||
    resolve(path) !== path ||
    !isAbsolute(root) ||
    resolvedRoot !== root ||
    (path !== resolvedRoot && !path.startsWith(`${resolvedRoot}${sep}`))
  )
    throw new Error("scheduler_recovery_path_substituted");
  const raw = await readExactRegular(path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("scheduler_recovery_artifact_malformed");
  }
  if (
    raw !== canonicalBytes(parsed) ||
    !exactHashValid(name, parsed, hashKey, compute)
  )
    throw new Error("scheduler_recovery_artifact_divergent");
  return parsed as Record<string, unknown>;
}

export async function loadDurableSchedulerRecoveryEvidence(
  input: SchedulerDurableRecoveryInput,
  registry: Readonly<
    Record<string, ReviewedRecoveryEnvironment>
  > = REVIEWED_RECOVERY_ENVIRONMENTS,
): Promise<SchedulerDurableRecoveryEvidence> {
  if (!validateSchedulerContract("recovery_input", input))
    throw new Error("invalid_scheduler_recovery_input");
  const environment = resolveReviewedRecoveryEnvironment(
    input.environment_id,
    registry,
  );
  const configurationRaw = await readExactRegular(
    environment.scheduler_configuration_path,
  );
  let configuration: SchedulerConfiguration;
  try {
    configuration = JSON.parse(configurationRaw) as SchedulerConfiguration;
  } catch {
    throw new Error("scheduler_recovery_configuration_malformed");
  }
  if (
    configurationRaw !== canonicalBytes(configuration) ||
    !validateSchedulerConfiguration(configuration)
  )
    throw new Error("scheduler_recovery_configuration_divergent");
  const pinnedConfigurationPathsMatch =
    resolve(configuration.kill_switch_path) ===
      environment.scheduler_switch_path &&
    resolve(configuration.state_root.path) ===
      environment.scheduler_state_root &&
    resolve(configuration.observation_root.path) ===
      environment.scheduler_observation_root &&
    resolve(configuration.durable_ai_130_store.root_path) ===
      environment.ai_130_root &&
    resolve(configuration.ai_131.kill_switch_path) ===
      environment.ai_131_switch_path &&
    resolve(configuration.ai_132.kill_switch_path) ===
      environment.ai_132_switch_path;
  if (!pinnedConfigurationPathsMatch)
    throw new Error("scheduler_recovery_trust_anchor_substituted");
  const switchRaw = await readExactRegular(environment.scheduler_switch_path);
  const schedulerSwitch = JSON.parse(switchRaw) as SchedulerKillSwitch;
  if (
    bytesSha256(switchRaw) !== configuration.kill_switch_canonical_sha256 ||
    schedulerSwitch.kill_switch_sha256 !==
      configuration.kill_switch_reviewed_sha256 ||
    !exactHashValid(
      "kill_switch",
      schedulerSwitch,
      "kill_switch_sha256",
      computeSchedulerKillSwitchSha256,
    )
  )
    throw new Error("scheduler_recovery_switch_divergent");
  const stateRoot = environment.scheduler_state_root;
  if (stateRoot !== resolve(configuration.state_root.path))
    throw new Error("scheduler_recovery_root_substituted");
  await assertSafePath(stateRoot, false);
  const expectedLeasePath = schedulerLeasePath(configuration);
  if (
    !expectedLeasePath.startsWith(`${environment.scheduler_state_root}${sep}`)
  )
    throw new Error("scheduler_recovery_lease_path_substituted");
  const expectedJournalPath = join(
    stateRoot,
    "journals",
    `${input.run_id}.json`,
  );
  const expectedRequestPath = join(
    stateRoot,
    "requests",
    `${input.request_id}.json`,
  );
  const lease = (await loadExactSchedulerArtifact(
    expectedLeasePath,
    stateRoot,
    "lease",
    "lease_sha256",
    computeSchedulerLeaseSha256,
  )) as unknown as SchedulerLease;
  const journal = (await loadExactSchedulerArtifact(
    expectedJournalPath,
    stateRoot,
    "run_journal",
    "journal_sha256",
    computeSchedulerJournalSha256,
  )) as unknown as SchedulerRunJournal;
  const request = (await loadExactSchedulerArtifact(
    expectedRequestPath,
    stateRoot,
    "run_request",
    "request_sha256",
    computeScheduledRunRequestSha256,
  )) as unknown as ScheduledRunRequest;
  if (
    journal.run_id !== input.run_id ||
    journal.request_id !== input.request_id ||
    journal.request_sha256 !== request.request_sha256 ||
    journal.configuration_sha256 !== configuration.configuration_sha256 ||
    journal.lease_sha256 !== lease.lease_sha256 ||
    lease.scheduler_configuration_sha256 !==
      configuration.configuration_sha256 ||
    request.configuration_sha256 !== configuration.configuration_sha256
  )
    throw new Error("scheduler_recovery_binding_divergent");
  if (
    request.ai_131.configuration.path !==
      environment.ai_131_configuration_path ||
    request.ai_131.kill_switch.path !== environment.ai_131_switch_path ||
    request.ai_132.configuration.path !==
      environment.ai_132_configuration_path ||
    request.ai_132.kill_switch.path !== environment.ai_132_switch_path ||
    request.ai_131.recovery_root.path !==
      join(environment.ai_131_state_root, "recovery") ||
    request.ai_132.recovery_root.path !== environment.ai_132_recovery_root
  )
    throw new Error("scheduler_recovery_boundary_trust_anchor_substituted");
  const slotPath = join(
    stateRoot,
    "slot-acceptances",
    `${request.eligible_slot_id}.json`,
  );
  const slot = await loadExactSchedulerArtifact(
    slotPath,
    stateRoot,
    "slot_acceptance",
    "slot_sha256",
    computeSchedulerSlotAcceptanceSha256,
  );
  if (
    slot["request_id"] !== request.request_id ||
    slot["request_sha256"] !== request.request_sha256
  )
    throw new Error("scheduler_recovery_slot_divergent");
  let attemptLedgerManifest: SchedulerAttemptLedgerManifest | undefined;
  let reservations: readonly SchedulerAttemptReservation[] | undefined;
  try {
    attemptLedgerManifest = await readAttemptLedgerManifest(configuration, {
      activation_id: lease.activation_id,
      activation_sha256: lease.activation_sha256,
    });
    reservations = (
      await readAttemptReservations(configuration, {
        activation_id: lease.activation_id,
        activation_sha256: lease.activation_sha256,
      })
    ).filter(
      (record) =>
        record.request_id === request.request_id &&
        record.request_sha256 === request.request_sha256,
    );
  } catch {
    attemptLedgerManifest = undefined;
    reservations = undefined;
  }
  const optionalExactResult = async (
    path: string,
  ): Promise<Record<string, unknown> | null> => {
    try {
      const result = await loadExactSchedulerArtifact(
        path,
        stateRoot,
        "run_result",
        "result_sha256",
        computeSchedulerRunResultSha256,
      );
      if (result["run_id"] !== input.run_id)
        throw new Error("scheduler_recovery_result_divergent");
      return result;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  };
  const recoveryResultPresent =
    (await optionalExactResult(
      join(stateRoot, "recovery-results", `${input.run_id}.json`),
    )) !== null;
  let resultPresent = false;
  const resultRoot = join(stateRoot, "results");
  try {
    for (const name of await readdir(resultRoot)) {
      if (!name.endsWith(`-${input.run_id}.json`)) continue;
      if (resultPresent) throw new Error("scheduler_recovery_multiple_results");
      const path = join(resultRoot, name);
      const result = await optionalExactResult(path);
      if (!result) continue;
      const completedAt = result["completed_at"];
      if (
        typeof completedAt !== "string" ||
        path !==
          join(
            resultRoot,
            `execution-${utcDay(completedAt)}-${input.run_id}.json`,
          )
      )
        throw new Error("scheduler_recovery_result_path_substituted");
      resultPresent = true;
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return {
    configuration,
    lease,
    journal,
    request,
    attemptLedgerManifest,
    reservations,
    slot,
    resultPresent,
    recoveryResultPresent,
  };
}

export async function inspectSchedulerRecovery(input: {
  readonly configuration: SchedulerConfiguration;
  readonly lease: SchedulerLease;
  readonly journal: unknown;
  readonly timestamp: string;
  readonly inspectAi131?: () => Promise<AuthoritativeRecoveryInspection>;
  readonly inspectAi132?: () => Promise<AuthoritativeRecoveryInspection>;
  readonly attemptLedgerManifest?: SchedulerAttemptLedgerManifest | undefined;
  readonly attemptReservations?:
    | readonly SchedulerAttemptReservation[]
    | undefined;
  readonly schedulerResultPresent?: boolean;
  readonly recoveryResultPresent?: boolean;
}): Promise<Record<string, unknown>> {
  let decision:
    | "safe_abort_before_authority"
    | "authority_consumed_recovery"
    | "unknown_delivery_manual_review"
    | "lease_expired_recovery"
    | "malformed_evidence_fail_closed"
    | "active_lease_not_stale"
    | "completed_after_recovery" = "lease_expired_recovery";
  let journalSha256: string | null = null;
  const reasons: string[] = [];
  let durableManifest = input.attemptLedgerManifest;
  let durableReservations = input.attemptReservations;
  if (!durableManifest) {
    try {
      durableManifest = await readAttemptLedgerManifest(input.configuration, {
        activation_id: input.lease.activation_id,
        activation_sha256: input.lease.activation_sha256,
      });
    } catch {
      durableManifest = undefined;
    }
  }
  if (!durableReservations && durableManifest) {
    try {
      durableReservations = await readAttemptReservations(input.configuration, {
        activation_id: input.lease.activation_id,
        activation_sha256: input.lease.activation_sha256,
      });
    } catch {
      durableReservations = undefined;
    }
  }
  if (
    !validateSchedulerConfiguration(input.configuration) ||
    !exactHashValid(
      "lease",
      input.lease,
      "lease_sha256",
      computeSchedulerLeaseSha256,
    )
  ) {
    decision = "malformed_evidence_fail_closed";
    reasons.push("scheduler_or_lease_missing_malformed_or_substituted");
  } else if (
    input.lease.scheduler_configuration_sha256 !==
      input.configuration.configuration_sha256 ||
    Math.max(
      Date.parse(input.lease.expires_at),
      Date.parse(input.lease.heartbeat_at) +
        input.configuration.stale_lease_recovery_threshold_seconds * 1_000,
    ) > Date.parse(input.timestamp)
  ) {
    decision = "active_lease_not_stale";
    reasons.push("active_heartbeating_lease_is_not_recoverable");
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
    const bindingMatches = (
      evidence: SchedulerBoundaryEvidenceBinding,
      configured: BoundaryBinding,
    ): boolean =>
      evidence.configuration.identity === configured.configuration_id &&
      evidence.configuration.sha256 === configured.configuration_sha256 &&
      resolve(evidence.kill_switch.path) ===
        resolve(configured.kill_switch_path) &&
      evidence.kill_switch.sha256 === configured.kill_switch_reviewed_sha256 &&
      evidence.kill_switch.canonical_sha256 ===
        configured.kill_switch_canonical_sha256 &&
      Object.values(evidence).every(
        (binding) =>
          isAbsolute(binding.path) &&
          resolve(binding.path) === binding.path &&
          !binding.path.split(sep).includes(".."),
      );
    if (
      journal.configuration_sha256 !==
        input.configuration.configuration_sha256 ||
      journal.activation_sha256 !== input.lease.activation_sha256 ||
      journal.lease_sha256 !== input.lease.lease_sha256 ||
      journal.entries.some((entry, index) => entry.sequence !== index) ||
      !bindingMatches(journal.ai_131_evidence, input.configuration.ai_131) ||
      !bindingMatches(journal.ai_132_evidence, input.configuration.ai_132)
    ) {
      decision = "malformed_evidence_fail_closed";
      reasons.push("scheduler_journal_binding_substituted_or_divergent");
    }
    const ai131Started = journal.entries.some(
      (entry) => entry.state === "acquisition_execution_started",
    );
    const ai132Started = journal.entries.some(
      (entry) => entry.state === "export_execution_started",
    );
    const reservations = durableReservations;
    const manifest = durableManifest;
    if (
      !manifest ||
      !validateSchedulerContract("attempt_ledger_manifest", manifest) ||
      manifest.manifest_sha256 !==
        computeSchedulerAttemptLedgerManifestSha256(manifest) ||
      manifest.canonical_sha256 !==
        computeSchedulerAttemptLedgerManifestCanonicalSha256(manifest) ||
      manifest.scheduler_configuration_sha256 !==
        input.configuration.configuration_sha256 ||
      manifest.activation_sha256 !== input.lease.activation_sha256
    ) {
      decision = "malformed_evidence_fail_closed";
      reasons.push("attempt_ledger_manifest_missing_or_divergent");
    } else if (!reservations) {
      decision = "malformed_evidence_fail_closed";
      reasons.push("attempt_ledger_evidence_missing");
    } else if (
      manifest.reservations.length !== reservations.length ||
      reservations.some(
        (record) =>
          !manifest.reservations.some(
            (entry) =>
              entry.reservation_id === record.reservation_id &&
              entry.reservation_sha256 === record.reservation_sha256,
          ),
      )
    ) {
      decision = "malformed_evidence_fail_closed";
      reasons.push("attempt_ledger_inventory_divergent");
    } else if (
      reservations.some(
        (record) =>
          record.request_id !== journal.request_id ||
          record.request_sha256 !== journal.request_sha256,
      )
    ) {
      decision = "malformed_evidence_fail_closed";
      reasons.push("attempt_ledger_evidence_divergent");
    } else if (
      (ai131Started &&
        !reservations.some((record) => record.boundary_type === "ai_131")) ||
      (ai132Started &&
        !reservations.some((record) => record.boundary_type === "ai_132"))
    ) {
      decision = "malformed_evidence_fail_closed";
      reasons.push("execution_started_without_attempt_reservation");
    } else if (
      input.recoveryResultPresent &&
      !journal.entries.some((entry) => entry.state === "recovery_required")
    ) {
      decision = "malformed_evidence_fail_closed";
      reasons.push("unresolved_recovery_record_visible");
    }
    const inspections: AuthoritativeRecoveryInspection[] = [];
    try {
      if (reasons.length) throw new Error(reasons[0]);
      if (ai131Started) {
        if (!input.inspectAi131)
          throw new Error("ai_131_authoritative_inspector_missing");
        const inspection = await input.inspectAi131();
        if (
          inspection.evidence !== null &&
          canonicalizeSchedulerJson(inspection.evidence) !==
            canonicalizeSchedulerJson(
              journal.ai_131_evidence.expected_consumption,
            )
        )
          throw new Error("ai_131_inspection_evidence_substituted");
        inspections.push(inspection);
      }
      if (ai132Started) {
        if (!input.inspectAi132)
          throw new Error("ai_132_authoritative_inspector_missing");
        const inspection = await input.inspectAi132();
        if (
          inspection.evidence !== null &&
          canonicalizeSchedulerJson(inspection.evidence) !==
            canonicalizeSchedulerJson(
              journal.ai_132_evidence.expected_consumption,
            )
        )
          throw new Error("ai_132_inspection_evidence_substituted");
        inspections.push(inspection);
      }
    } catch (error: unknown) {
      if (decision !== "malformed_evidence_fail_closed") {
        decision = "lease_expired_recovery";
        reasons.push(
          error instanceof Error
            ? error.message
            : "authoritative_recovery_inspection_failed",
        );
      }
      inspections.length = 0;
    }
    if (reasons.length) {
      // The inspector failure above has precedence over scheduler booleans.
    } else if (
      inspections.some(
        (inspection) =>
          inspection.status === "divergent_evidence" ||
          inspection.status === "malformed_evidence",
      )
    ) {
      decision = "malformed_evidence_fail_closed";
      reasons.push("authoritative_boundary_evidence_divergent");
    } else if (
      inspections.some((inspection) => inspection.status === "unknown_delivery")
    ) {
      decision = "unknown_delivery_manual_review";
      reasons.push("unknown_transport_delivery_is_never_automatically_retried");
    } else if (
      inspections.some(
        (inspection) => inspection.status === "consumed_recovery_required",
      )
    ) {
      decision = "authority_consumed_recovery";
      reasons.push(
        "exact_visible_consumption_requires_boundary_reconciliation",
      );
    } else if (
      inspections.length > 0 &&
      inspections.every(
        (inspection) => inspection.status === "consumed_completed",
      )
    ) {
      decision = "completed_after_recovery";
      reasons.push("exact_durable_boundary_completion_visible");
    } else if (
      (!ai131Started &&
        !ai132Started &&
        reservations?.length === 0 &&
        !input.schedulerResultPresent &&
        !input.recoveryResultPresent) ||
      (inspections.length > 0 &&
        inspections.every(
          (inspection) =>
            inspection.status === "positively_not_consumed" ||
            inspection.status === "not_authorized",
        ))
    ) {
      decision = "safe_abort_before_authority";
      reasons.push("exact_authoritative_non_consumption_positively_proven");
    } else {
      decision = "lease_expired_recovery";
      reasons.push("authority_outcome_unresolved_recovery_required");
    }
  }
  const unsigned = {
    schema_version: "1.0.0",
    decision_id: domainHash("vlatam-ai-lab/arca-scheduler-recovery-id/v1", {
      lease_sha256:
        typeof input.lease?.lease_sha256 === "string"
          ? input.lease.lease_sha256
          : "0".repeat(64),
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
    lease_sha256:
      typeof input.lease?.lease_sha256 === "string"
        ? input.lease.lease_sha256
        : "0".repeat(64),
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

async function withExclusiveStateLock<T>(
  configuration: SchedulerConfiguration,
  name: string,
  operation: () => Promise<T>,
): Promise<T> {
  const lockPath = join(resolve(configuration.state_root.path), "locks", name);
  await mkdir(dirname(lockPath), { recursive: true, mode: 0o700 });
  await assertSafePath(dirname(lockPath), false);
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  for (let attempt = 0; attempt < 10_000 && !handle; attempt += 1) {
    try {
      handle = await open(
        lockPath,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        0o600,
      );
      await handle.writeFile(`${process.pid}\n`, "utf8");
      await handle.sync();
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await new Promise<void>((resolveImmediate) =>
        setImmediate(resolveImmediate),
      );
    }
  }
  if (!handle) throw new Error("scheduler_state_lock_competing");
  try {
    return await operation();
  } finally {
    await handle.close();
    await unlink(lockPath);
    await syncDirectory(dirname(lockPath));
  }
}

export interface SchedulerAttemptReservation {
  readonly schema_version: "1.0.0";
  readonly reservation_id: string;
  readonly reservation_sha256: string;
  readonly scheduler_configuration_id: string;
  readonly scheduler_configuration_sha256: string;
  readonly activation_id: string;
  readonly activation_sha256: string;
  readonly eligible_slot_id: string;
  readonly scheduled_for: string;
  readonly request_id: string;
  readonly request_sha256: string;
  readonly boundary_type: "ai_131" | "ai_132";
  readonly reserved_at: string;
  readonly state: "reserved" | "consumed" | "completed" | "recovery_required";
  readonly authoritative_consumption_evidence: ExactArtifactBinding | null;
}

function attemptLedgerRoot(configuration: SchedulerConfiguration): string {
  return join(resolve(configuration.state_root.path), "attempt-ledger");
}

function attemptLedgerManifestPath(
  configuration: SchedulerConfiguration,
): string {
  return join(attemptLedgerRoot(configuration), "manifest.json");
}

function attemptReservationDirectory(
  configuration: SchedulerConfiguration,
): string {
  return join(attemptLedgerRoot(configuration), "reservations");
}

function createAttemptLedgerManifest(input: {
  configuration: SchedulerConfiguration;
  activation: Pick<SchedulerActivation, "activation_id" | "activation_sha256">;
  initializedAt: string;
  reservations?: SchedulerAttemptLedgerManifest["reservations"];
}): SchedulerAttemptLedgerManifest {
  const base = {
    schema_version: "1.0.0" as const,
    ledger_version: "1.0.0" as const,
    manifest_sha256: "0".repeat(64),
    canonical_sha256: "0".repeat(64),
    scheduler_configuration_id: input.configuration.configuration_id,
    scheduler_configuration_sha256: input.configuration.configuration_sha256,
    activation_id: input.activation.activation_id,
    activation_sha256: input.activation.activation_sha256,
    state_root_identity: input.configuration.state_root.identity,
    state_root_path: resolve(input.configuration.state_root.path),
    initialized_at: input.initializedAt,
    reservation_directory: attemptReservationDirectory(input.configuration),
    reservations: [...(input.reservations ?? [])].sort((left, right) =>
      left.reservation_id.localeCompare(right.reservation_id),
    ),
  };
  const withCanonical = {
    ...base,
    canonical_sha256:
      computeSchedulerAttemptLedgerManifestCanonicalSha256(base),
  };
  return {
    ...withCanonical,
    manifest_sha256: computeSchedulerAttemptLedgerManifestSha256(withCanonical),
  };
}

async function readAttemptLedgerManifest(
  configuration: SchedulerConfiguration,
  activation: Pick<SchedulerActivation, "activation_id" | "activation_sha256">,
): Promise<SchedulerAttemptLedgerManifest> {
  const raw = await readExactRegular(attemptLedgerManifestPath(configuration));
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("attempt_ledger_manifest_malformed");
  }
  if (
    raw !== canonicalBytes(parsed) ||
    !validateSchedulerContract("attempt_ledger_manifest", parsed)
  )
    throw new Error("attempt_ledger_manifest_malformed");
  const manifest = parsed as SchedulerAttemptLedgerManifest;
  if (
    manifest.manifest_sha256 !==
      computeSchedulerAttemptLedgerManifestSha256(manifest) ||
    manifest.canonical_sha256 !==
      computeSchedulerAttemptLedgerManifestCanonicalSha256(manifest) ||
    manifest.scheduler_configuration_id !== configuration.configuration_id ||
    manifest.scheduler_configuration_sha256 !==
      configuration.configuration_sha256 ||
    manifest.activation_id !== activation.activation_id ||
    manifest.activation_sha256 !== activation.activation_sha256 ||
    manifest.state_root_identity !== configuration.state_root.identity ||
    manifest.state_root_path !== resolve(configuration.state_root.path) ||
    manifest.reservation_directory !==
      attemptReservationDirectory(configuration)
  )
    throw new Error("attempt_ledger_manifest_divergent");
  return manifest;
}

export async function loadSchedulerAttemptLedgerManifest(input: {
  readonly configuration: SchedulerConfiguration;
  readonly activation: Pick<
    SchedulerActivation,
    "activation_id" | "activation_sha256"
  >;
}): Promise<SchedulerAttemptLedgerManifest> {
  return readAttemptLedgerManifest(input.configuration, input.activation);
}

export async function initializeSchedulerAttemptLedger(input: {
  readonly configuration: SchedulerConfiguration;
  readonly activation: Pick<
    SchedulerActivation,
    "activation_id" | "activation_sha256"
  >;
  readonly initializedAt: string;
}): Promise<SchedulerAttemptLedgerManifest> {
  const root = attemptLedgerRoot(input.configuration);
  const reservationDirectory = attemptReservationDirectory(input.configuration);
  await mkdir(reservationDirectory, { recursive: true, mode: 0o700 });
  await assertSafePath(root, false);
  await assertSafePath(reservationDirectory, false);
  const existingNames = await readdir(reservationDirectory);
  if (existingNames.length > 0)
    throw new Error("attempt_ledger_uninitialized_reservations_visible");
  const manifest = createAttemptLedgerManifest(input);
  try {
    await writeExclusiveDurable(
      attemptLedgerManifestPath(input.configuration),
      canonicalBytes(manifest),
    );
    return manifest;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return readAttemptLedgerManifest(input.configuration, input.activation);
  }
}

async function replaceAttemptLedgerManifest(
  configuration: SchedulerConfiguration,
  expected: SchedulerAttemptLedgerManifest,
  reservations: SchedulerAttemptLedgerManifest["reservations"],
): Promise<SchedulerAttemptLedgerManifest> {
  const next = createAttemptLedgerManifest({
    configuration,
    activation: expected,
    initializedAt: expected.initialized_at,
    reservations,
  });
  const path = attemptLedgerManifestPath(configuration);
  if ((await readExactRegular(path)) !== canonicalBytes(expected))
    throw new Error("attempt_ledger_manifest_divergent");
  const staging = join(
    dirname(path),
    `.${basename(path)}.${randomUUID()}.manifest`,
  );
  await writeExclusiveDurable(staging, canonicalBytes(next));
  if ((await readExactRegular(path)) !== canonicalBytes(expected))
    throw new Error("attempt_ledger_manifest_divergent");
  await rename(staging, path);
  await syncDirectory(dirname(path));
  return next;
}

async function readAttemptReservations(
  configuration: SchedulerConfiguration,
  activation: Pick<SchedulerActivation, "activation_id" | "activation_sha256">,
): Promise<SchedulerAttemptReservation[]> {
  const manifest = await readAttemptLedgerManifest(configuration, activation);
  const root = attemptReservationDirectory(configuration);
  let names: string[];
  try {
    await assertSafePath(root, false);
    names = await readdir(root);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new Error("attempt_ledger_reservation_directory_missing");
    throw error;
  }
  const expectedNames = manifest.reservations.map(
    (entry) => `${entry.reservation_id}.json`,
  );
  if (
    canonicalizeSchedulerJson(names.sort()) !==
    canonicalizeSchedulerJson(expectedNames.sort())
  )
    throw new Error("attempt_ledger_inventory_divergent");
  const records: SchedulerAttemptReservation[] = [];
  for (const name of names.sort()) {
    if (!/^[a-f0-9]{64}\.json$/.test(name))
      throw new Error("attempt_ledger_unexpected_entry");
    const raw = await readExactRegular(join(root, name));
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("attempt_ledger_malformed");
    }
    if (
      raw !== canonicalBytes(parsed) ||
      !exactHashValid(
        "attempt_ledger",
        parsed,
        "reservation_sha256",
        computeSchedulerAttemptReservationSha256,
      )
    )
      throw new Error("attempt_ledger_divergent");
    const record = parsed as SchedulerAttemptReservation;
    const binding = manifest.reservations.find(
      (entry) => entry.reservation_id === record.reservation_id,
    );
    if (!binding || binding.reservation_sha256 !== record.reservation_sha256)
      throw new Error("attempt_ledger_inventory_divergent");
    records.push(record);
  }
  return records;
}

export async function reserveSchedulerAttempt(input: {
  readonly configuration: SchedulerConfiguration;
  readonly activation: SchedulerActivation;
  readonly request: ScheduledRunRequest;
  readonly boundaryType: "ai_131" | "ai_132";
  readonly reservedAt: string;
}): Promise<SchedulerAttemptReservation> {
  return withExclusiveStateLock(
    input.configuration,
    "attempt-ledger.lock",
    async () => {
      const manifest = await readAttemptLedgerManifest(
        input.configuration,
        input.activation,
      );
      const records = await readAttemptReservations(
        input.configuration,
        input.activation,
      );
      const now = Date.parse(input.reservedAt);
      const daily = records.filter(
        (record) =>
          Date.parse(record.reserved_at) > now - 24 * 60 * 60 * 1_000 &&
          Date.parse(record.reserved_at) <= now,
      );
      const activation = records.filter(
        (record) =>
          record.activation_id === input.activation.activation_id &&
          record.activation_sha256 === input.activation.activation_sha256,
      );
      if (daily.length >= input.configuration.maximum_runs_per_24_hours)
        throw new Error("daily_execution_attempt_cap_reached");
      if (
        activation.length >=
        input.activation.maximum_authorized_execution_attempts
      )
        throw new Error("activation_execution_attempt_cap_reached");
      if (
        records.some(
          (record) =>
            record.request_id === input.request.request_id &&
            record.eligible_slot_id === input.request.eligible_slot_id &&
            record.boundary_type === input.boundaryType,
        )
      )
        throw new Error("duplicate_attempt_reservation");
      const reservationId = domainHash(
        "vlatam-ai-lab/arca-scheduler-attempt-reservation-id/v1",
        {
          request_sha256: input.request.request_sha256,
          eligible_slot_id: input.request.eligible_slot_id,
          boundary_type: input.boundaryType,
        },
      );
      const unsigned = {
        schema_version: "1.0.0" as const,
        reservation_id: reservationId,
        reservation_sha256: "0".repeat(64),
        scheduler_configuration_id: input.configuration.configuration_id,
        scheduler_configuration_sha256:
          input.configuration.configuration_sha256,
        activation_id: input.activation.activation_id,
        activation_sha256: input.activation.activation_sha256,
        eligible_slot_id: input.request.eligible_slot_id,
        scheduled_for: input.request.scheduled_for,
        request_id: input.request.request_id,
        request_sha256: input.request.request_sha256,
        boundary_type: input.boundaryType,
        reserved_at: input.reservedAt,
        state: "reserved" as const,
        authoritative_consumption_evidence: null,
        ...falseAuthorities,
      };
      const reservation = {
        ...unsigned,
        reservation_sha256: computeSchedulerAttemptReservationSha256(unsigned),
      } as SchedulerAttemptReservation;
      await writeExclusiveDurable(
        join(
          resolve(input.configuration.state_root.path),
          "attempt-ledger",
          "reservations",
          `${reservationId}.json`,
        ),
        canonicalBytes(reservation),
      );
      await replaceAttemptLedgerManifest(input.configuration, manifest, [
        ...manifest.reservations,
        {
          reservation_id: reservation.reservation_id,
          reservation_sha256: reservation.reservation_sha256,
        },
      ]);
      return reservation;
    },
  );
}

export async function advanceSchedulerAttempt(input: {
  readonly configuration: SchedulerConfiguration;
  readonly expected: SchedulerAttemptReservation;
  readonly state: SchedulerAttemptReservation["state"];
  readonly authoritativeConsumptionEvidence?: ExactArtifactBinding;
}): Promise<SchedulerAttemptReservation> {
  return withExclusiveStateLock(
    input.configuration,
    "attempt-ledger.lock",
    async () => {
      const allowed: Record<
        SchedulerAttemptReservation["state"],
        readonly SchedulerAttemptReservation["state"][]
      > = {
        reserved: ["consumed", "completed", "recovery_required"],
        consumed: ["completed", "recovery_required"],
        completed: ["completed"],
        recovery_required: ["recovery_required", "completed"],
      };
      if (!allowed[input.expected.state].includes(input.state))
        throw new Error("attempt_ledger_state_regression");
      if (
        input.expected.authoritative_consumption_evidence &&
        input.authoritativeConsumptionEvidence &&
        canonicalizeSchedulerJson(
          input.expected.authoritative_consumption_evidence,
        ) !== canonicalizeSchedulerJson(input.authoritativeConsumptionEvidence)
      )
        throw new Error("attempt_consumption_evidence_divergent");
      const path = join(
        resolve(input.configuration.state_root.path),
        "attempt-ledger",
        "reservations",
        `${input.expected.reservation_id}.json`,
      );
      const unsigned = {
        ...input.expected,
        reservation_sha256: "0".repeat(64),
        state: input.state,
        authoritative_consumption_evidence:
          input.authoritativeConsumptionEvidence ??
          input.expected.authoritative_consumption_evidence,
      };
      const next = {
        ...unsigned,
        reservation_sha256: computeSchedulerAttemptReservationSha256(unsigned),
      };
      if (!validateSchedulerContract("attempt_ledger", next))
        throw new Error("attempt_ledger_transition_invalid");
      const staging = join(
        dirname(path),
        `.${basename(path)}.${randomUUID()}.attempt`,
      );
      if ((await readExactRegular(path)) !== canonicalBytes(input.expected))
        throw new Error("attempt_ledger_divergent");
      await writeExclusiveDurable(staging, canonicalBytes(next));
      if ((await readExactRegular(path)) !== canonicalBytes(input.expected))
        throw new Error("attempt_ledger_divergent");
      await rename(staging, path);
      await syncDirectory(dirname(path));
      const manifest = await readAttemptLedgerManifest(input.configuration, {
        activation_id: input.expected.activation_id,
        activation_sha256: input.expected.activation_sha256,
      });
      await replaceAttemptLedgerManifest(
        input.configuration,
        manifest,
        manifest.reservations.map((entry) =>
          entry.reservation_id === next.reservation_id
            ? {
                reservation_id: next.reservation_id,
                reservation_sha256: next.reservation_sha256,
              }
            : entry,
        ),
      );
      return next as SchedulerAttemptReservation;
    },
  );
}

function minuteOfDay(timestamp: string): number {
  const date = new Date(timestamp);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function inAllowedOperatingWindow(
  configuration: SchedulerConfiguration,
  timestamp: string,
): boolean {
  const minute = minuteOfDay(timestamp);
  return configuration.allowed_utc_operating_windows.some((window) => {
    const [startHour = 0, startMinute = 0] = window.starts_at_utc
      .split(":")
      .map(Number);
    const [endHour = 0, endMinute = 0] = window.ends_at_utc
      .split(":")
      .map(Number);
    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;
    return start <= end
      ? minute >= start && minute <= end
      : minute >= start || minute <= end;
  });
}

export async function acceptSchedulerSlot(input: {
  readonly configuration: SchedulerConfiguration;
  readonly activation: SchedulerActivation;
  readonly request: ScheduledRunRequest;
  readonly acceptedAt: string;
}): Promise<Record<string, unknown>> {
  const interval = input.configuration.observation_interval_seconds * 1_000;
  const now = Date.parse(input.acceptedAt);
  const currentSlot = Math.floor(now / interval) * interval;
  const scheduled = Date.parse(input.request.scheduled_for);
  if (scheduled < currentSlot)
    throw new Error("historical_missed_slot_rejected");
  if (scheduled !== currentSlot && scheduled !== currentSlot + interval)
    throw new Error("scheduled_slot_not_current_or_next");
  if (
    !inAllowedOperatingWindow(input.configuration, input.request.scheduled_for)
  )
    throw new Error("scheduled_slot_outside_operating_window");
  const expectedSlotId = computeEligibleSlotId({
    configurationSha256: input.configuration.configuration_sha256,
    activationSha256: input.activation.activation_sha256,
    observationIntervalSeconds:
      input.configuration.observation_interval_seconds,
    scheduledFor: input.request.scheduled_for,
  });
  if (input.request.eligible_slot_id !== expectedSlotId)
    throw new Error("eligible_slot_binding_mismatch");
  return withExclusiveStateLock(
    input.configuration,
    "slot-acceptance.lock",
    async () => {
      const root = join(
        resolve(input.configuration.state_root.path),
        "slot-acceptances",
      );
      let names: string[] = [];
      try {
        names = await readdir(root);
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      for (const name of names) {
        const existing = JSON.parse(
          await readExactRegular(join(root, name)),
        ) as Record<string, unknown>;
        if (existing["request_id"] === input.request.request_id)
          throw new Error("duplicate_request_rejected");
      }
      const unsigned = {
        schema_version: "1.0.0",
        slot_id: expectedSlotId,
        slot_sha256: "0".repeat(64),
        configuration_sha256: input.configuration.configuration_sha256,
        activation_sha256: input.activation.activation_sha256,
        observation_interval_seconds:
          input.configuration.observation_interval_seconds,
        scheduled_for: input.request.scheduled_for,
        request_id: input.request.request_id,
        request_sha256: input.request.request_sha256,
        accepted_at: input.acceptedAt,
        ...falseAuthorities,
      };
      const acceptance = {
        ...unsigned,
        slot_sha256: computeSchedulerSlotAcceptanceSha256(unsigned),
      };
      await writeExclusiveDurable(
        join(root, `${expectedSlotId}.json`),
        canonicalBytes(acceptance),
      ).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === "EEXIST")
          throw new Error("duplicate_semantic_slot_rejected");
        throw error;
      });
      return acceptance;
    },
  );
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
    readonly authoritative?: boolean;
  };
  readonly ai132: {
    readonly readiness: (typeof readinessEnum)[number];
    readonly authorizationAvailable: boolean;
    readonly recoveryState: "clear" | "recovery_required" | "unknown";
    readonly authoritative?: boolean;
  };
  readonly ai130IntegrityStatus:
    | "verified"
    | "unavailable"
    | "invalid"
    | "unverified_reported_input";
  readonly ai130Authoritative?: boolean;
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
  const dailyObservationCount = await countCanonicalRecords(
    observationRoot,
    "observation",
    input.timestamp,
  );
  const reservations = input.activation
    ? await readAttemptReservations(input.configuration, input.activation)
    : [];
  const now = Date.parse(input.timestamp);
  const dailyExecutionCount = reservations.filter(
    (record) =>
      Date.parse(record.reserved_at) > now - 24 * 60 * 60 * 1_000 &&
      Date.parse(record.reserved_at) <= now,
  ).length;
  const activationExecutionCount = input.activation
    ? reservations.filter(
        (record) =>
          record.activation_id === input.activation?.activation_id &&
          record.activation_sha256 === input.activation?.activation_sha256,
      ).length
    : 0;
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
  const ai131Readiness = input.ai131.authoritative
    ? input.ai131.readiness
    : "unverified_reported_input";
  const ai132Readiness = input.ai132.authoritative
    ? input.ai132.readiness
    : "unverified_reported_input";
  const ai130IntegrityStatus = input.ai130Authoritative
    ? input.ai130IntegrityStatus
    : "unverified_reported_input";
  if (ai131Readiness !== "ready") reasons.push(`ai_131_${ai131Readiness}`);
  if (ai132Readiness !== "ready") reasons.push(`ai_132_${ai132Readiness}`);
  if (ai130IntegrityStatus !== "verified")
    reasons.push(`ai_130_${ai130IntegrityStatus}`);
  if (!(input.ai131.authoritative && input.ai131.authorizationAvailable))
    reasons.push("ai_131_authorization_missing_or_unverified");
  if (!(input.ai132.authoritative && input.ai132.authorizationAvailable))
    reasons.push("ai_132_authorization_missing_or_unverified");
  if (input.ai131.recoveryState !== "clear")
    reasons.push(`ai_131_recovery_${input.ai131.recoveryState}`);
  if (input.ai132.recoveryState !== "clear")
    reasons.push(`ai_132_recovery_${input.ai132.recoveryState}`);
  reasons.push("slot_eligibility_unverified");
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
    ai_131_readiness: ai131Readiness,
    ai_131_authorization_available: Boolean(
      input.ai131.authoritative && input.ai131.authorizationAvailable,
    ),
    ai_131_recovery_state: input.ai131.recoveryState,
    ai_132_readiness: ai132Readiness,
    ai_132_authorization_available: Boolean(
      input.ai132.authoritative && input.ai132.authorizationAvailable,
    ),
    ai_132_recovery_state: input.ai132.recoveryState,
    ai_130_integrity_status: ai130IntegrityStatus,
    daily_observation_count: dailyObservationCount,
    daily_execution_attempt_count: dailyExecutionCount,
    activation_execution_attempt_count: activationExecutionCount,
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
  const records = await readAttemptReservations(
    input.configuration,
    input.activation,
  );
  const attempts = records.filter(
    (record) =>
      record.activation_id === input.activation.activation_id &&
      record.activation_sha256 === input.activation.activation_sha256,
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
    authorized_execution_attempts: attempts.length,
    reserved_attempts: attempts.filter((record) => record.state === "reserved")
      .length,
    consumed_attempts: attempts.filter((record) => record.state === "consumed")
      .length,
    completed_attempts: attempts.filter(
      (record) => record.state === "completed",
    ).length,
    recovery_required_attempts: attempts.filter(
      (record) => record.state === "recovery_required",
    ).length,
    observation_limit: input.activation.maximum_scheduler_observations,
    execution_attempt_limit:
      input.activation.maximum_authorized_execution_attempts,
    stop_reason:
      Date.parse(input.timestamp) >= Date.parse(input.activation.expires_at)
        ? "activation_expired"
        : attempts.length >=
            input.activation.maximum_authorized_execution_attempts
          ? "activation_attempt_cap_reached"
          : "pilot_window_open_no_unattended_authority",
    automatic_retries: false,
    ...falseAuthorities,
  };
}

export interface ScheduledBoundaryOutcome {
  readonly outcome: "blocked" | "verified" | "unknown";
  readonly authorizationConsumed: boolean;
  readonly evidenceSha256: string;
  readonly authoritativeConsumptionEvidence?: ExactArtifactBinding;
}

export interface ScheduledBoundary {
  readonly preflight: (trustedTimestamp: string) => Promise<{
    readonly authorized: boolean;
    readonly evidenceSha256: string;
  }>;
  readonly execute: (
    trustedTimestamp: string,
  ) => Promise<ScheduledBoundaryOutcome>;
}

const exactFields = {
  configuration: {
    identityField: "configuration_id",
    sha256Field: "configuration_sha256",
  },
  proposal: { identityField: "proposal_id", sha256Field: "proposal_sha256" },
  authorization: {
    identityField: "authorization_id",
    sha256Field: "authorization_sha256",
  },
  killSwitch: {
    identityField: "kill_switch_id",
    sha256Field: "kill_switch_sha256",
  },
  ai131Consumption: {
    identityField: "consumption_id",
    sha256Field: "consumption_sha256",
  },
  ai131Journal: {
    identityField: "run_id",
    sha256Field: "journal_sha256",
  },
  ai131Record: {
    identityField: "run_id",
    sha256Field: "record_sha256",
  },
  acquisition: {
    identityField: "acquisition_id",
    sha256Field: "acquisition_record_sha256",
  },
  candidate: {
    identityField: "candidate_id",
    sha256Field: "candidate_sha256",
  },
  ai132Consumption: {
    identityField: "consumption_id",
    sha256Field: "consumption_sha256",
  },
  ai132Journal: {
    identityField: "journal_id",
    sha256Field: "journal_sha256",
  },
  ai132Record: {
    identityField: "package_id",
    sha256Field: "record_sha256",
  },
  package: { identityField: "package_id", sha256Field: "package_sha256" },
} as const satisfies Record<string, ExactArtifactFieldBinding>;

async function verifyRecoveryRoot(
  binding: ExpectedArtifactBinding,
): Promise<void> {
  if (!isAbsolute(binding.path) || resolve(binding.path) !== binding.path)
    throw new Error("boundary_recovery_root_substituted");
  await assertSafePath(binding.path, false);
  const stat = await lstat(binding.path);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("boundary_recovery_root_invalid");
  if ((await readdir(binding.path)).length > 0)
    throw new Error("boundary_recovery_state_unresolved");
}

async function verifyBoundaryInputs(
  boundaryType: "ai_131" | "ai_132",
  binding: SchedulerBoundaryEvidenceBinding,
  environment: ReviewedRecoveryEnvironment,
): Promise<Record<string, unknown>> {
  const configurationPath =
    boundaryType === "ai_131"
      ? environment.ai_131_configuration_path
      : environment.ai_132_configuration_path;
  const switchPath =
    boundaryType === "ai_131"
      ? environment.ai_131_switch_path
      : environment.ai_132_switch_path;
  if (
    binding.configuration.path !== configurationPath ||
    binding.kill_switch.path !== switchPath
  )
    throw new Error("boundary_reviewed_environment_path_substituted");
  const configuration = await loadExactRequestBoundArtifact(
    binding.configuration,
    dirname(configurationPath),
    exactFields.configuration,
  );
  await loadExactRequestBoundArtifact(
    binding.proposal,
    dirname(binding.proposal.path),
    exactFields.proposal,
  );
  await loadExactRequestBoundArtifact(
    binding.authorization,
    dirname(binding.authorization.path),
    exactFields.authorization,
  );
  await loadExactRequestBoundArtifact(
    binding.kill_switch,
    dirname(switchPath),
    exactFields.killSwitch,
  );
  return configuration;
}

function reviewedBoundaryRoot(
  configuration: Record<string, unknown>,
  field: string,
): string {
  const binding = configuration[field];
  if (!binding || typeof binding !== "object" || Array.isArray(binding))
    throw new Error(`boundary_reviewed_root_missing:${field}`);
  const path = (binding as Record<string, unknown>)["path"];
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path)
    throw new Error(`boundary_reviewed_root_invalid:${field}`);
  return path;
}

async function verifyBoundaryOutputs(
  boundaryType: "ai_131" | "ai_132",
  binding: SchedulerBoundaryEvidenceBinding,
  environment: ReviewedRecoveryEnvironment,
): Promise<void> {
  const configuration = await verifyBoundaryInputs(
    boundaryType,
    binding,
    environment,
  );
  if (boundaryType === "ai_131") {
    const stateRoot = environment.ai_131_state_root;
    const acquisitionRoot = environment.ai_131_acquisition_root;
    const candidateRoot = environment.ai_131_candidate_root;
    if (
      reviewedBoundaryRoot(configuration, "run_state") !== stateRoot ||
      reviewedBoundaryRoot(configuration, "acquisition_output") !==
        acquisitionRoot ||
      reviewedBoundaryRoot(configuration, "candidate_output") !== candidateRoot
    )
      throw new Error("ai_131_reviewed_environment_root_substituted");
    await loadExactRequestBoundArtifact(
      binding.expected_consumption,
      stateRoot,
      exactFields.ai131Consumption,
    );
    await loadExactRequestBoundArtifact(
      binding.authoritative_journal as ExactArtifactBinding,
      stateRoot,
      exactFields.ai131Journal,
    );
    await loadExactRequestBoundArtifact(
      binding.durable_result,
      stateRoot,
      exactFields.ai131Record,
    );
    await loadExactRequestBoundArtifact(
      binding.primary_evidence,
      acquisitionRoot,
      exactFields.acquisition,
    );
    await loadExactRequestBoundArtifact(
      binding.secondary_evidence,
      candidateRoot,
      exactFields.candidate,
    );
  } else {
    const stateRoot = environment.ai_132_state_root;
    const exportRoot = environment.ai_132_export_root;
    if (
      reviewedBoundaryRoot(configuration, "export_state_root") !== stateRoot ||
      reviewedBoundaryRoot(configuration, "export_root") !== exportRoot
    )
      throw new Error("ai_132_reviewed_environment_root_substituted");
    await loadExactRequestBoundArtifact(
      binding.expected_consumption,
      stateRoot,
      exactFields.ai132Consumption,
    );
    await loadExactRequestBoundArtifact(
      binding.authoritative_journal as ExactArtifactBinding,
      stateRoot,
      exactFields.ai132Journal,
    );
    await loadExactRequestBoundArtifact(
      binding.durable_result,
      stateRoot,
      exactFields.ai132Record,
    );
    await loadExactRequestBoundArtifact(
      binding.primary_evidence,
      exportRoot,
      exactFields.package,
    );
    await loadExactRequestBoundArtifact(
      binding.secondary_evidence,
      stateRoot,
      exactFields.ai132Record,
    );
  }
  const expectedRecoveryRoot =
    boundaryType === "ai_131"
      ? join(environment.ai_131_state_root, "recovery")
      : environment.ai_132_recovery_root;
  if (binding.recovery_root.path !== expectedRecoveryRoot)
    throw new Error("boundary_recovery_root_substituted");
  await verifyRecoveryRoot(binding.recovery_root);
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
  readonly reviewedEnvironment: ReviewedRecoveryEnvironment;
  readonly request: ScheduledRunRequest;
  readonly runId: string;
  readonly ownerId: string;
  readonly processIdentity: string;
  readonly timestamp: string;
  readonly trustedNow?: () => string | Promise<string>;
  readonly heartbeatWait?: (signal: AbortSignal) => Promise<void>;
  readonly observation: Omit<SchedulerObservationInput, "persist">;
  readonly acquisitionBoundary: ScheduledBoundary | null;
  readonly exportBoundary: ScheduledBoundary | null;
  readonly inspectAi131?: (
    trustedTimestamp: string,
  ) => Promise<AuthoritativeRecoveryInspection>;
  readonly inspectAi132?: (
    trustedTimestamp: string,
  ) => Promise<AuthoritativeRecoveryInspection>;
}): Promise<Record<string, unknown>> {
  const trustedNow = async (): Promise<string> => {
    const timestamp = await (input.trustedNow?.() ?? new Date().toISOString());
    if (!new RegExp(TIMESTAMP).test(timestamp))
      throw new Error("trusted_time_invalid");
    return timestamp;
  };
  const initialTimestamp = await trustedNow();
  const reviewedEnvironment = resolveReviewedRecoveryEnvironment(
    input.reviewedEnvironment.environment_id,
    {
      [input.reviewedEnvironment.environment_id]: input.reviewedEnvironment,
    },
  );
  if (!validateSchedulerConfiguration(input.configuration))
    throw new Error("invalid_scheduler_configuration");
  if (
    resolve(input.configuration.kill_switch_path) !==
      reviewedEnvironment.scheduler_switch_path ||
    resolve(input.configuration.state_root.path) !==
      reviewedEnvironment.scheduler_state_root ||
    resolve(input.configuration.observation_root.path) !==
      reviewedEnvironment.scheduler_observation_root ||
    resolve(input.configuration.durable_ai_130_store.root_path) !==
      reviewedEnvironment.ai_130_root
  )
    throw new Error("scheduler_reviewed_environment_root_substituted");
  if (!input.configuration.active) throw new Error("scheduler_inactive");
  if (
    schedulerActivationStatus(
      input.activation,
      input.configuration,
      initialTimestamp,
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
    input.request.configuration_sha256 !==
      input.configuration.configuration_sha256 ||
    input.request.configuration_id !== input.configuration.configuration_id ||
    input.request.activation_sha256 !== input.activation.activation_sha256 ||
    input.request.activation_id !== input.activation.activation_id ||
    input.request.mode !== "run_once"
  )
    throw new Error("run_request_binding_mismatch");
  await initializeSchedulerAttemptLedger({
    configuration: input.configuration,
    activation: input.activation,
    initializedAt: initialTimestamp,
  });
  await acceptSchedulerSlot({
    configuration: input.configuration,
    activation: input.activation,
    request: input.request,
    acceptedAt: initialTimestamp,
  });
  await writeExclusiveDurable(
    join(
      resolve(input.configuration.state_root.path),
      "requests",
      `${input.request.request_id}.json`,
    ),
    canonicalBytes(input.request),
  );

  const leaseResult = await acquireSchedulerLease({
    configuration: input.configuration,
    activation: input.activation,
    ownerId: input.ownerId,
    processIdentity: input.processIdentity,
    timestamp: initialTimestamp,
  });
  if (leaseResult.status !== "acquired" || !leaseResult.lease)
    throw new Error(`scheduler_lease_${leaseResult.status}`);
  let lease = leaseResult.lease;
  const entries: SchedulerRunJournal["entries"][number][] = [
    {
      sequence: 0,
      state: "scheduled",
      timestamp: initialTimestamp,
      evidence_sha256: input.request.request_sha256,
    },
    {
      sequence: 1,
      state: "lease_acquired",
      timestamp: initialTimestamp,
      evidence_sha256: lease.lease_sha256,
    },
    {
      sequence: 2,
      state: "configuration_verified",
      timestamp: initialTimestamp,
      evidence_sha256: input.configuration.configuration_sha256,
    },
    {
      sequence: 3,
      state: "activation_verified",
      timestamp: initialTimestamp,
      evidence_sha256: input.activation.activation_sha256,
    },
  ];
  const initialUnsigned: SchedulerRunJournal = {
    schema_version: "1.0.0",
    journal_id: domainHash("vlatam-ai-lab/arca-scheduler-journal-id/v1", {
      run_id: input.runId,
      request_sha256: input.request.request_sha256,
    }),
    journal_sha256: "0".repeat(64),
    run_id: input.runId,
    request_id: input.request.request_id,
    request_sha256: input.request.request_sha256,
    configuration_sha256: input.configuration.configuration_sha256,
    activation_sha256: input.activation.activation_sha256,
    lease_sha256: lease.lease_sha256,
    entries,
    ai_131_evidence: input.request.ai_131,
    ai_132_evidence: input.request.ai_132,
    authority_outcome: "not_started",
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
    evidenceSha256: string,
    authorityOutcome: SchedulerRunJournal["authority_outcome"] = currentJournal.authority_outcome,
  ): Promise<void> => {
    const unsigned: SchedulerRunJournal = {
      ...currentJournal,
      journal_sha256: "0".repeat(64),
      lease_sha256: lease.lease_sha256,
      entries: [
        ...currentJournal.entries,
        {
          sequence: currentJournal.entries.length,
          state,
          timestamp: await trustedNow(),
          evidence_sha256: evidenceSha256,
        },
      ],
      authority_outcome: authorityOutcome,
    };
    const next: SchedulerRunJournal = {
      ...unsigned,
      journal_sha256: computeSchedulerJournalSha256(unsigned),
    };
    await replaceJournalExact(input.configuration, currentJournal, next);
    currentJournal = next;
  };

  let acquisitionOutcome: AuthoritativeBoundaryDisposition = "not_authorized";
  let exportOutcome: AuthoritativeBoundaryDisposition = "not_authorized";
  let acquisitionReservation: SchedulerAttemptReservation | null = null;
  let exportReservation: SchedulerAttemptReservation | null = null;
  const boundaryEvidenceHash = (
    binding: SchedulerBoundaryEvidenceBinding,
  ): string =>
    domainHash("vlatam-ai-lab/arca-scheduler-boundary-evidence/v1", binding);
  const heartbeat = async (): Promise<string> => {
    const timestamp = await trustedNow();
    lease = await heartbeatSchedulerLease({
      configuration: input.configuration,
      expectedLease: lease,
      ownerId: input.ownerId,
      processIdentity: input.processIdentity,
      timestamp,
    });
    return timestamp;
  };
  const withHeartbeatLifecycle = async <T>(
    operation: () => Promise<T>,
  ): Promise<T> => {
    const stop = new AbortController();
    let failure: Error | null = null;
    const loop = (async () => {
      while (!stop.signal.aborted) {
        try {
          if (input.heartbeatWait) await input.heartbeatWait(stop.signal);
          else {
            const pulse = AbortSignal.timeout(
              input.configuration.heartbeat_interval_seconds * 1_000,
            );
            await new Promise<void>((resolvePulse) => {
              const finish = (): void => {
                pulse.removeEventListener("abort", finish);
                stop.signal.removeEventListener("abort", finish);
                resolvePulse();
              };
              pulse.addEventListener("abort", finish, { once: true });
              stop.signal.addEventListener("abort", finish, { once: true });
            });
          }
          if (stop.signal.aborted) break;
          await heartbeat();
        } catch (error: unknown) {
          failure =
            error instanceof Error ? error : new Error("heartbeat_failed");
          stop.abort();
          break;
        }
      }
    })();
    let value: T | undefined;
    let operationError: unknown;
    try {
      value = await operation();
    } catch (error: unknown) {
      operationError = error;
    } finally {
      stop.abort();
      await loop;
    }
    if (failure) throw failure;
    if (operationError) throw operationError;
    return value as T;
  };
  const validateAuthorityTransition = async (
    boundaryType: "ai_131" | "ai_132",
  ): Promise<{
    timestamp: string;
    reservation: SchedulerAttemptReservation;
  }> => {
    const timestamp = await heartbeat();
    const schedulerSwitchPath = resolve(input.configuration.kill_switch_path);
    const switchBytes = await readExactRegular(schedulerSwitchPath);
    const schedulerSwitch = JSON.parse(switchBytes) as SchedulerKillSwitch;
    if (
      bytesSha256(switchBytes) !==
        input.configuration.kill_switch_canonical_sha256 ||
      schedulerSwitch.kill_switch_sha256 !==
        input.configuration.kill_switch_reviewed_sha256 ||
      schedulerSwitch.kill_switch_sha256 !==
        input.killSwitch.kill_switch_sha256 ||
      !exactHashValid(
        "kill_switch",
        schedulerSwitch,
        "kill_switch_sha256",
        computeSchedulerKillSwitchSha256,
      ) ||
      schedulerSwitch.state !== "disabled" ||
      schedulerSwitch.execution_blocked
    )
      throw new Error("scheduler_kill_switch_changed_or_substituted");
    if (!validateSchedulerConfiguration(input.configuration))
      throw new Error("scheduler_configuration_binding_changed");
    if (
      schedulerActivationStatus(
        input.activation,
        input.configuration,
        timestamp,
      ) !== "active"
    )
      throw new Error("activation_expired_before_authority");
    if (!inAllowedOperatingWindow(input.configuration, timestamp))
      throw new Error("outside_allowed_operating_window");
    if (Date.parse(timestamp) < Date.parse(input.request.scheduled_for))
      throw new Error("eligible_slot_not_due");
    if (
      Date.parse(timestamp) - Date.parse(initialTimestamp) >
      input.configuration.maximum_run_duration_seconds * 1_000
    )
      throw new Error("maximum_run_duration_exceeded");
    const binding =
      boundaryType === "ai_131" ? input.request.ai_131 : input.request.ai_132;
    await verifyBoundaryInputs(boundaryType, binding, reviewedEnvironment);
    const configured =
      boundaryType === "ai_131"
        ? input.configuration.ai_131
        : input.configuration.ai_132;
    if (
      binding.configuration.identity !== configured.configuration_id ||
      binding.configuration.sha256 !== configured.configuration_sha256 ||
      resolve(binding.kill_switch.path) !==
        resolve(configured.kill_switch_path) ||
      binding.kill_switch.sha256 !== configured.kill_switch_reviewed_sha256 ||
      binding.kill_switch.canonical_sha256 !==
        configured.kill_switch_canonical_sha256
    )
      throw new Error("boundary_configuration_or_switch_substitution");
    return {
      timestamp,
      reservation: await reserveSchedulerAttempt({
        configuration: input.configuration,
        activation: input.activation,
        request: input.request,
        boundaryType,
        reservedAt: timestamp,
      }),
    };
  };
  const persistRecovery = async (
    boundaryType: "ai_131" | "ai_132",
    reservation: SchedulerAttemptReservation | null,
    reason: string,
  ): Promise<Record<string, unknown>> => {
    if (reservation && reservation.state !== "recovery_required")
      await advanceSchedulerAttempt({
        configuration: input.configuration,
        expected: reservation,
        state: "recovery_required",
      });
    await advanceJournal(
      "recovery_required",
      boundaryEvidenceHash(
        boundaryType === "ai_131" ? input.request.ai_131 : input.request.ai_132,
      ),
      reason.includes("unknown_delivery")
        ? "unknown_delivery"
        : "consumed_recovery_required",
    ).catch(() => undefined);
    const unsigned = {
      schema_version: "1.0.0",
      result_id: domainHash("vlatam-ai-lab/arca-scheduler-result-id/v1", {
        run_id: input.runId,
        request_sha256: input.request.request_sha256,
      }),
      result_sha256: "0".repeat(64),
      run_id: input.runId,
      request_id: input.request.request_id,
      completed_at: await trustedNow(),
      final_state: "recovery_required",
      acquisition_outcome: acquisitionOutcome,
      export_outcome: exportOutcome,
      observation_sha256: input.request.request_sha256,
      stop_reason: reason,
      automatic_retry_eligible: false,
      ...falseAuthorities,
    };
    const recoveryResult = {
      ...unsigned,
      result_sha256: computeSchedulerRunResultSha256(unsigned),
    };
    await writeExclusiveDurable(
      join(
        resolve(input.configuration.state_root.path),
        "recovery-results",
        `${input.runId}.json`,
      ),
      canonicalBytes(recoveryResult),
    );
    return recoveryResult;
  };
  const reconcileBoundary = async (
    boundaryType: "ai_131" | "ai_132",
    callback:
      | Awaited<ReturnType<ScheduledBoundary["preflight"]>>
      | ScheduledBoundaryOutcome
      | null,
    callbackError: unknown,
    phase: "preflight" | "execution",
    callbackInvoked: boolean,
  ): Promise<SchedulerBoundaryDispositionRecord> => {
    const inspector =
      boundaryType === "ai_131" ? input.inspectAi131 : input.inspectAi132;
    let inspection: AuthoritativeRecoveryInspection;
    try {
      if (!inspector)
        throw new Error(`${boundaryType}_authoritative_inspector_missing`);
      inspection = await inspector(await heartbeat());
      if (!AUTHORITATIVE_BOUNDARY_DISPOSITIONS.includes(inspection.status))
        throw new Error(`${boundaryType}_authoritative_inspector_malformed`);
      if (
        inspection.evidence &&
        canonicalizeSchedulerJson(inspection.evidence) !==
          canonicalizeSchedulerJson(
            boundaryType === "ai_131"
              ? input.request.ai_131.expected_consumption
              : input.request.ai_132.expected_consumption,
          )
      )
        throw new Error(`${boundaryType}_inspection_evidence_substituted`);
      if (inspection.status === "consumed_completed") {
        if (phase === "execution" && !callbackInvoked)
          throw new Error(
            `${boundaryType}_completion_claimed_before_boundary_invocation`,
          );
        if (!inspection.evidence)
          throw new Error(`${boundaryType}_completion_evidence_missing`);
        await verifyBoundaryOutputs(
          boundaryType,
          boundaryType === "ai_131"
            ? input.request.ai_131
            : input.request.ai_132,
          reviewedEnvironment,
        );
      }
    } catch (error: unknown) {
      inspection = {
        status: "malformed_evidence",
        evidence: null,
        reason: error instanceof Error ? error.message : "inspection_failed",
      };
    }
    const reason = [
      `${boundaryType}_${phase}_authoritative_reconciliation`,
      `callback:${
        callbackError
          ? `exception:${callbackError instanceof Error ? callbackError.message : "unknown"}`
          : callback
            ? "returned"
            : "absent"
      }`,
      `inspector:${inspection.reason ?? inspection.status}`,
    ].join(":");
    const unsigned = {
      schema_version: "1.0.0" as const,
      boundary_type: boundaryType,
      disposition_sha256: "0".repeat(64),
      request_id: input.request.request_id,
      reconciled_at: await trustedNow(),
      disposition: inspection.status,
      authoritative_evidence: inspection.evidence,
      reason,
    };
    const record = {
      ...unsigned,
      disposition_sha256: computeSchedulerBoundaryDispositionSha256(unsigned),
    };
    const contract =
      boundaryType === "ai_131" ? "ai_131_disposition" : "ai_132_disposition";
    if (!validateSchedulerContract(contract, record))
      throw new Error(`${boundaryType}_generated_disposition_invalid`);
    return record;
  };
  const persistDisposition = async (
    record: SchedulerBoundaryDispositionRecord,
  ): Promise<void> => {
    await writeExclusiveDurable(
      join(
        resolve(input.configuration.state_root.path),
        "boundary-dispositions",
        `${input.runId}-${record.boundary_type}.json`,
      ),
      canonicalBytes(record),
    );
  };
  const advanceAttemptForDisposition = async (
    reservation: SchedulerAttemptReservation,
    record: SchedulerBoundaryDispositionRecord,
  ): Promise<SchedulerAttemptReservation> => {
    let current = reservation;
    if (
      [
        "consumed_completed",
        "consumed_recovery_required",
        "unknown_delivery",
      ].includes(record.disposition) &&
      record.authoritative_evidence
    )
      current = await advanceSchedulerAttempt({
        configuration: input.configuration,
        expected: current,
        state: "consumed",
        authoritativeConsumptionEvidence: record.authoritative_evidence,
      });
    return advanceSchedulerAttempt({
      configuration: input.configuration,
      expected: current,
      state:
        record.disposition === "consumed_completed"
          ? "completed"
          : "recovery_required",
    });
  };

  if (!input.acquisitionBoundary) {
    acquisitionOutcome = "not_authorized";
    await advanceJournal(
      "acquisition_not_authorized",
      boundaryEvidenceHash(input.request.ai_131),
      "not_consumed",
    );
    return persistRecovery(
      "ai_131",
      null,
      "ai_131_not_authorized_current_workflow_requires_consumed_completed",
    );
  }
  let ai131Preflight: Awaited<
    ReturnType<ScheduledBoundary["preflight"]>
  > | null = null;
  let ai131PreflightError: unknown;
  try {
    ai131Preflight = await withHeartbeatLifecycle(async () =>
      input.acquisitionBoundary!.preflight(await heartbeat()),
    );
    await advanceJournal(
      "acquisition_preflight_checked",
      ai131Preflight.evidenceSha256,
    );
  } catch (error: unknown) {
    ai131PreflightError = error;
  }
  const ai131PreflightDisposition = await reconcileBoundary(
    "ai_131",
    ai131Preflight,
    ai131PreflightError,
    "preflight",
    true,
  );
  acquisitionOutcome = ai131PreflightDisposition.disposition;
  if (acquisitionOutcome !== "positively_not_consumed") {
    await persistDisposition(ai131PreflightDisposition);
    if (acquisitionOutcome === "consumed_completed") {
      await advanceJournal(
        "acquisition_verified",
        ai131PreflightDisposition.disposition_sha256,
        "consumed_completed",
      );
    } else
      return persistRecovery(
        "ai_131",
        null,
        `ai_131_${acquisitionOutcome}_after_preflight_no_export`,
      );
  }
  if (acquisitionOutcome !== "consumed_completed") {
    if (!ai131Preflight?.authorized) {
      acquisitionOutcome = "not_authorized";
      const unauthorized = {
        ...ai131PreflightDisposition,
        disposition_sha256: "0".repeat(64),
        disposition: "not_authorized" as const,
        reason: `${ai131PreflightDisposition.reason}:preflight_not_authorized`,
      };
      const sealedUnauthorized = {
        ...unauthorized,
        disposition_sha256:
          computeSchedulerBoundaryDispositionSha256(unauthorized),
      };
      await persistDisposition(sealedUnauthorized);
      return persistRecovery(
        "ai_131",
        null,
        "ai_131_not_authorized_after_authoritative_preflight_reconciliation",
      );
    }
    let ai131Callback: ScheduledBoundaryOutcome | null = null;
    let ai131CallbackError: unknown;
    let ai131Invoked = false;
    try {
      const checked = await validateAuthorityTransition("ai_131");
      acquisitionReservation = checked.reservation;
      await advanceJournal(
        "acquisition_execution_started",
        boundaryEvidenceHash(input.request.ai_131),
        "authority_outcome_unknown",
      );
      ai131Invoked = true;
      ai131Callback = await withHeartbeatLifecycle(() =>
        input.acquisitionBoundary!.execute(checked.timestamp),
      );
    } catch (error: unknown) {
      ai131CallbackError = error;
    }
    const ai131Disposition = await reconcileBoundary(
      "ai_131",
      ai131Callback,
      ai131CallbackError,
      "execution",
      ai131Invoked,
    );
    acquisitionOutcome = ai131Disposition.disposition;
    await persistDisposition(ai131Disposition);
    if (acquisitionReservation)
      acquisitionReservation = await advanceAttemptForDisposition(
        acquisitionReservation,
        ai131Disposition,
      );
    await advanceJournal(
      acquisitionOutcome === "consumed_completed"
        ? "acquisition_verified"
        : acquisitionOutcome === "unknown_delivery"
          ? "acquisition_unknown"
          : "acquisition_blocked",
      ai131Disposition.disposition_sha256,
      acquisitionOutcome === "consumed_completed"
        ? "consumed_completed"
        : acquisitionOutcome === "unknown_delivery"
          ? "unknown_delivery"
          : "consumed_recovery_required",
    );
    if (acquisitionOutcome !== "consumed_completed")
      return persistRecovery(
        "ai_131",
        acquisitionReservation,
        `ai_131_${acquisitionOutcome}_authoritative_disposition_no_export`,
      );
  }

  if (!input.exportBoundary) {
    exportOutcome = "not_authorized";
    await advanceJournal(
      "export_not_authorized",
      boundaryEvidenceHash(input.request.ai_132),
    );
    return persistRecovery(
      "ai_132",
      null,
      "ai_132_not_authorized_full_pipeline_not_completed",
    );
  }
  let ai132Preflight: Awaited<
    ReturnType<ScheduledBoundary["preflight"]>
  > | null = null;
  let ai132PreflightError: unknown;
  try {
    ai132Preflight = await withHeartbeatLifecycle(async () =>
      input.exportBoundary!.preflight(await heartbeat()),
    );
    await advanceJournal(
      "export_preflight_checked",
      ai132Preflight.evidenceSha256,
    );
  } catch (error: unknown) {
    ai132PreflightError = error;
  }
  const ai132PreflightDisposition = await reconcileBoundary(
    "ai_132",
    ai132Preflight,
    ai132PreflightError,
    "preflight",
    true,
  );
  exportOutcome = ai132PreflightDisposition.disposition;
  if (exportOutcome !== "positively_not_consumed") {
    await persistDisposition(ai132PreflightDisposition);
    if (exportOutcome !== "consumed_completed")
      return persistRecovery(
        "ai_132",
        null,
        `ai_132_${exportOutcome}_after_preflight`,
      );
  }
  if (exportOutcome !== "consumed_completed") {
    if (!ai132Preflight?.authorized) {
      exportOutcome = "not_authorized";
      return persistRecovery(
        "ai_132",
        null,
        "ai_132_not_authorized_after_authoritative_preflight_reconciliation",
      );
    }
    let ai132Callback: ScheduledBoundaryOutcome | null = null;
    let ai132CallbackError: unknown;
    let ai132Invoked = false;
    try {
      const checked = await validateAuthorityTransition("ai_132");
      exportReservation = checked.reservation;
      await advanceJournal(
        "export_execution_started",
        boundaryEvidenceHash(input.request.ai_132),
        "authority_outcome_unknown",
      );
      ai132Invoked = true;
      ai132Callback = await withHeartbeatLifecycle(() =>
        input.exportBoundary!.execute(checked.timestamp),
      );
    } catch (error: unknown) {
      ai132CallbackError = error;
    }
    const ai132Disposition = await reconcileBoundary(
      "ai_132",
      ai132Callback,
      ai132CallbackError,
      "execution",
      ai132Invoked,
    );
    exportOutcome = ai132Disposition.disposition;
    await persistDisposition(ai132Disposition);
    if (exportReservation)
      exportReservation = await advanceAttemptForDisposition(
        exportReservation,
        ai132Disposition,
      );
    await advanceJournal(
      exportOutcome === "consumed_completed"
        ? "export_verified"
        : "export_blocked",
      ai132Disposition.disposition_sha256,
      exportOutcome === "consumed_completed"
        ? "consumed_completed"
        : exportOutcome === "unknown_delivery"
          ? "unknown_delivery"
          : "consumed_recovery_required",
    );
    if (exportOutcome !== "consumed_completed")
      return persistRecovery(
        "ai_132",
        exportReservation,
        `ai_132_${exportOutcome}_authoritative_disposition`,
      );
  }
  try {
    const result = await withHeartbeatLifecycle(async () => {
      await heartbeat();
      const observation = await observeGovernedArcaScheduler({
        ...input.observation,
        timestamp: await trustedNow(),
        persist: true,
      });
      await heartbeat();
      await advanceJournal(
        "observation_recorded",
        observation["observation_sha256"] as string,
      );
      const fullPipelineCompleted =
        acquisitionOutcome === "consumed_completed" &&
        exportOutcome === "consumed_completed";
      const finalState = fullPipelineCompleted
        ? "completed"
        : "recovery_required";
      const resultUnsigned = {
        schema_version: "1.0.0",
        result_id: domainHash("vlatam-ai-lab/arca-scheduler-result-id/v1", {
          run_id: input.runId,
          request_sha256: input.request.request_sha256,
        }),
        result_sha256: "0".repeat(64),
        run_id: input.runId,
        request_id: input.request.request_id,
        completed_at: await trustedNow(),
        final_state: finalState,
        acquisition_outcome: acquisitionOutcome,
        export_outcome: exportOutcome,
        observation_sha256: observation["observation_sha256"],
        stop_reason: fullPipelineCompleted
          ? "exact_authoritative_acquisition_and_export_completed"
          : "boundary_disposition_requires_recovery_no_retry",
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
          `execution-${utcDay(await trustedNow())}-${input.runId}.json`,
        ),
        canonicalBytes(result),
      );
      await heartbeat();
      await advanceJournal(
        finalState,
        result.result_sha256 as string,
        fullPipelineCompleted
          ? "consumed_completed"
          : "consumed_recovery_required",
      );
      await completeJournal(input.configuration, currentJournal);
      return result;
    });
    if (result["final_state"] === "completed")
      await releaseSchedulerLease({
        configuration: input.configuration,
        expectedLease: lease,
        ownerId: input.ownerId,
        processIdentity: input.processIdentity,
      });
    return result;
  } catch (error: unknown) {
    return persistRecovery(
      exportReservation ? "ai_132" : "ai_131",
      null,
      `scheduler_finalization_heartbeat_or_persistence_failure:${
        error instanceof Error ? error.message : "unknown"
      }`,
    );
  }
}

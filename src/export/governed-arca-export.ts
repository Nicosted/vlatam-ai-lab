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
  rm,
} from "node:fs/promises";
import { dirname, join, parse, relative, resolve, sep } from "node:path";

import { Ajv2020 as Ajv } from "ajv/dist/2020.js";

import {
  APPROVED_ARCA_ARTIFACT_SCHEMA,
  computeApprovedArcaArtifactSha256,
  validateApprovedArcaArtifact,
  type ApprovedArcaArtifact,
} from "../artifacts/approved-arca-artifact-builder.js";
import {
  computeGovernedArcaCandidateSha256,
  computeGovernedArcaReviewSha256,
} from "../review/governed-arca-candidate-review.js";
import { canonicalizeReviewJson } from "../review/review-artifact-binding.js";
import {
  DURABLE_ARCA_STORE_CONFIGURATION_SHA256,
  computeDurableArcaStoreEventSha256,
  readVerifiedDurableArcaExportSource,
  type DurableArcaVerifiedExportSource,
} from "../store/durable-arca-review-store.js";

export const ARCA_EXPORT_CONTRACT_VERSION = "1.0.0" as const;
export const ARCA_EXPORTER_VERSION = "1.0.0" as const;
export const ARCA_EXPORT_FORMAT = "vlatam-arca-approved-tariff-json" as const;
export const ARCA_EXPORT_FORMAT_VERSION = "1.0.0" as const;
export const ARCA_EXPORT_PACKAGE_TYPE = "governed_arca_export_package" as const;
export const ARCA_EXPORTER_IDENTITY =
  "service:governed-arca-exporter@1.0.0" as const;

const SHA256 = "^[a-f0-9]{64}$";
const TIMESTAMP =
  "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$";
const HUMAN = "^human:[a-z0-9][a-z0-9._@-]*$";
const FALSE_RESULT_AUTHORITIES = {
  external_transfer_performed: { const: false },
  imported: { const: false },
  published: { const: false },
  deployed: { const: false },
  production_authorized: { const: false },
  scheduler_authorized: { const: false },
  database_write_authorized: { const: false },
  vlatam_global_access_performed: { const: false },
} as const;

function domainHash(domain: string, value: unknown): string {
  return createHash("sha256")
    .update(domain)
    .update("\n")
    .update(canonicalizeReviewJson(value))
    .digest("hex");
}
function bytesHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
function canonicalBytes(value: unknown): string {
  return `${canonicalizeReviewJson(value)}\n`;
}
function without<T extends object>(value: T, ...keys: string[]): unknown {
  const clone = structuredClone(value) as Record<string, unknown>;
  for (const key of keys) delete clone[key];
  return clone;
}

export const ARCA_EXPORTER_CONFIGURATION = {
  configuration_version: "1.0.0",
  exporter_version: ARCA_EXPORTER_VERSION,
  export_format: ARCA_EXPORT_FORMAT,
  export_format_version: ARCA_EXPORT_FORMAT_VERSION,
  canonicalization_version: "review-json-v1",
  target_logical_consumer: "vlatam-global",
  target_environment: "handoff_only",
  package_layout: "packages/<package-id>.json",
  state_layout:
    "consumptions|journals|completed-journals|records/<identity>.json",
  publication_strategy: "staging-hard-link-no-overwrite-fsync-v1",
  payload_policy: "exact-approved-artifact-approved-payload-v1",
  authorization_consumption:
    "journal-sealed-canonical-no-overwrite-consumption-v1",
  recovery_policy: "exact-consumption-reconciliation-and-kill-switch-reread-v1",
  external_transfer: false,
} as const;
export const ARCA_EXPORTER_CONFIGURATION_SHA256 = domainHash(
  "vlatam-ai-lab/governed-arca-exporter-configuration/v1",
  ARCA_EXPORTER_CONFIGURATION,
);

export interface ArcaExportProposal {
  readonly schema_version: "1.0.0";
  readonly proposal_id: string;
  readonly proposal_sha256: string;
  readonly approved_artifact_id: string;
  readonly approved_artifact_sha256: string;
  readonly candidate_id: string;
  readonly candidate_sha256: string;
  readonly review_id: string;
  readonly review_sha256: string;
  readonly evaluation_id: string;
  readonly evaluation_sha256: string;
  readonly durable_store_configuration_sha256: string;
  readonly durable_store_event_id: string;
  readonly durable_store_event_sha256: string;
  readonly export_format: typeof ARCA_EXPORT_FORMAT;
  readonly export_format_version: "1.0.0";
  readonly package_schema_version: "1.0.0";
  readonly target_logical_consumer: "vlatam-global";
  readonly target_environment: "handoff_only";
  readonly export_root_identity: string;
  readonly proposal_author_identity: string;
  readonly proposed_at: string;
  readonly export_window: {
    readonly starts_at: string;
    readonly expires_at: string;
  };
  readonly maximum_exports: 1;
  readonly publication_authority: false;
  readonly deployment_authority: false;
  readonly production_authority: false;
}

export interface ArcaExportAuthorization {
  readonly schema_version: "1.0.0";
  readonly authorization_id: string;
  readonly authorization_sha256: string;
  readonly proposal_id: string;
  readonly proposal_sha256: string;
  readonly approved_artifact_id: string;
  readonly approved_artifact_sha256: string;
  readonly durable_store_event_id: string;
  readonly durable_store_event_sha256: string;
  readonly export_format: typeof ARCA_EXPORT_FORMAT;
  readonly export_format_version: "1.0.0";
  readonly target_logical_consumer: "vlatam-global";
  readonly authorization_identity: string;
  readonly authorized_at: string;
  readonly not_before: string;
  readonly expires_at: string;
  readonly one_shot_nonce: string;
  readonly scope: "governed_arca_export_package_only";
}

export interface ArcaExportKillSwitch {
  readonly schema_version: "1.0.0";
  readonly kill_switch_id: "governed-arca-export";
  readonly kill_switch_sha256: string;
  readonly state: "active" | "disabled";
  readonly reviewed_artifact_id: string | null;
  readonly reviewed_by: string | null;
  readonly reviewed_at: string | null;
  readonly reason: string;
  readonly export_blocked: boolean;
}

export interface ArcaExportRootConfiguration {
  readonly schema_version: "1.0.0";
  readonly configuration_id: string;
  readonly configuration_sha256: string;
  readonly durable_store: {
    readonly identity: string;
    readonly path: string;
    readonly configuration_sha256: string;
  };
  readonly export_root: { readonly identity: string; readonly path: string };
  readonly export_state_root: {
    readonly identity: string;
    readonly path: string;
  };
}

export interface GovernedArcaExportPackage {
  readonly schema_version: "1.0.0";
  readonly package_id: string;
  readonly package_sha256: string;
  readonly package_type: typeof ARCA_EXPORT_PACKAGE_TYPE;
  readonly generated_at: string;
  readonly exporter: {
    readonly identity: typeof ARCA_EXPORTER_IDENTITY;
    readonly version: "1.0.0";
    readonly configuration_sha256: string;
  };
  readonly source_approved_artifact_id: string;
  readonly source_approved_artifact_sha256: string;
  readonly candidate_binding: ApprovedArcaArtifact["candidate_binding"];
  readonly review_binding: ApprovedArcaArtifact["review_binding"];
  readonly evaluation_binding: ApprovedArcaArtifact["evaluation_binding"];
  readonly durable_store_event_id: string;
  readonly durable_store_event_sha256: string;
  readonly source_provenance: {
    readonly acquisition_id: string;
    readonly acquisition_record_sha256: string;
    readonly source_id: string;
    readonly requested_url: string;
    readonly effective_url: string;
    readonly captured_at: string;
    readonly raw_byte_sha256: string;
    readonly parser_id: string;
    readonly parser_version: string;
    readonly parser_configuration_sha256: string;
    readonly parsing_timestamp: string;
  };
  readonly approved_tariff_payload: ApprovedArcaArtifact["approved_payload"];
  readonly payload_sha256: string;
  readonly target_logical_consumer: "vlatam-global";
  readonly target_environment: "handoff_only";
  readonly handoff_format: typeof ARCA_EXPORT_FORMAT;
  readonly handoff_format_version: "1.0.0";
  readonly import_status: "not_imported";
  readonly publication_status: "not_published";
  readonly deployment_status: "not_deployed";
  readonly production_reliance: "not_authorized";
  readonly acknowledgment_required: true;
  readonly external_network_transfer_performed: false;
  readonly import_authority: false;
  readonly publication_authority: false;
  readonly deployment_authority: false;
  readonly production_authority: false;
  readonly scheduler_authority: false;
  readonly database_write_authority: false;
  readonly external_network_transfer_authority: false;
  readonly vlatam_global_access_authority: false;
}

export type ArcaExportOutcome =
  | "invalid_proposal"
  | "invalid_authorization"
  | "authorization_expired"
  | "authorization_not_yet_valid"
  | "authorization_already_consumed"
  | "separation_of_duties_violation"
  | "kill_switch_active"
  | "invalid_approved_artifact"
  | "durable_store_invalid"
  | "artifact_not_durably_persisted"
  | "binding_mismatch"
  | "export_window_invalid"
  | "export_already_exists"
  | "package_collision"
  | "package_publication_failed"
  | "recovery_required"
  | "package_exported"
  | "completed";

export interface ArcaExportResult {
  readonly schema_version: "1.0.0";
  readonly result_type: "governed_arca_export_result";
  readonly outcome: ArcaExportOutcome;
  readonly result_timestamp: string;
  readonly proposal_id: string | null;
  readonly authorization_id: string | null;
  readonly package_id: string | null;
  readonly package_sha256: string | null;
  readonly details: readonly string[];
  readonly authorization_consumed: boolean;
  readonly package_created: boolean;
  readonly package_durably_recorded: boolean;
  readonly external_transfer_performed: false;
  readonly imported: false;
  readonly published: false;
  readonly deployed: false;
  readonly production_authorized: false;
  readonly scheduler_authorized: false;
  readonly database_write_authorized: false;
  readonly vlatam_global_access_performed: false;
}

export interface DurableArcaExportRecord extends ArcaExportResult {
  readonly record_type: "durable_governed_arca_export_record";
  readonly record_sha256: string;
  readonly proposal_sha256: string;
  readonly authorization_sha256: string;
  readonly approved_artifact_id: string;
  readonly approved_artifact_sha256: string;
  readonly durable_store_event_id: string;
  readonly durable_store_event_sha256: string;
  readonly export_attempt_id: string;
  readonly package_bytes_sha256: string;
}

export type ArcaExportJournalStage =
  | "prepared"
  | "authorization_consumed"
  | "package_published"
  | "record_published"
  | "completed";
export interface ArcaExportJournal {
  readonly schema_version: "1.0.0";
  readonly journal_type: "governed_arca_export_journal";
  readonly journal_id: string;
  readonly journal_sha256: string;
  readonly stage: ArcaExportJournalStage;
  readonly proposal_id: string;
  readonly proposal_sha256: string;
  readonly authorization_id: string;
  readonly authorization_sha256: string;
  readonly approved_artifact_id: string;
  readonly approved_artifact_sha256: string;
  readonly durable_store_event_id: string;
  readonly durable_store_event_sha256: string;
  readonly export_attempt_id: string;
  readonly root_configuration_sha256: string;
  readonly export_root_identity: string;
  readonly export_state_root_identity: string;
  readonly kill_switch_sha256: string;
  readonly kill_switch_path: string;
  readonly consumption_relative_path: string;
  readonly consumption_bytes_sha256: string;
  readonly consumption_json: string;
  readonly package_id: string;
  readonly package_sha256: string;
  readonly package_bytes_sha256: string;
  readonly package_json: string;
  readonly record_json: string;
  readonly created_at: string;
  readonly updated_at: string;
}

const bindingProperties = {
  approved_artifact_id: {
    type: "string",
    pattern: "^approved-arca-artifact--[a-f0-9]{64}$",
  },
  approved_artifact_sha256: { type: "string", pattern: SHA256 },
  candidate_id: { type: "string", pattern: "^arca-candidate--[a-f0-9]{64}$" },
  candidate_sha256: { type: "string", pattern: SHA256 },
  review_id: { type: "string", pattern: "^arca-review--[a-f0-9]{64}$" },
  review_sha256: { type: "string", pattern: SHA256 },
  evaluation_id: {
    type: "string",
    pattern: "^arca-review-evaluation--[a-f0-9]{64}$",
  },
  evaluation_sha256: { type: "string", pattern: SHA256 },
  durable_store_event_id: {
    type: "string",
    pattern: "^arca-store-event--[a-f0-9]{64}$",
  },
  durable_store_event_sha256: { type: "string", pattern: SHA256 },
} as const;
const timeWindowSchema = {
  type: "object",
  additionalProperties: false,
  required: ["starts_at", "expires_at"],
  properties: {
    starts_at: { type: "string", pattern: TIMESTAMP },
    expires_at: { type: "string", pattern: TIMESTAMP },
  },
} as const;

export const ARCA_EXPORT_PROPOSAL_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/arca-export-proposal.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "proposal_id",
    "proposal_sha256",
    ...Object.keys(bindingProperties),
    "durable_store_configuration_sha256",
    "export_format",
    "export_format_version",
    "package_schema_version",
    "target_logical_consumer",
    "target_environment",
    "export_root_identity",
    "proposal_author_identity",
    "proposed_at",
    "export_window",
    "maximum_exports",
    "publication_authority",
    "deployment_authority",
    "production_authority",
  ],
  properties: {
    schema_version: { const: "1.0.0" },
    proposal_id: {
      type: "string",
      pattern: "^arca-export-proposal--[a-f0-9]{64}$",
    },
    proposal_sha256: { type: "string", pattern: SHA256 },
    ...bindingProperties,
    durable_store_configuration_sha256: {
      const: DURABLE_ARCA_STORE_CONFIGURATION_SHA256,
    },
    export_format: { const: ARCA_EXPORT_FORMAT },
    export_format_version: { const: "1.0.0" },
    package_schema_version: { const: "1.0.0" },
    target_logical_consumer: { const: "vlatam-global" },
    target_environment: { const: "handoff_only" },
    export_root_identity: { type: "string", minLength: 1, maxLength: 128 },
    proposal_author_identity: { type: "string", pattern: HUMAN },
    proposed_at: { type: "string", pattern: TIMESTAMP },
    export_window: timeWindowSchema,
    maximum_exports: { const: 1 },
    publication_authority: { const: false },
    deployment_authority: { const: false },
    production_authority: { const: false },
  },
} as const;

export const ARCA_EXPORT_AUTHORIZATION_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/arca-export-authorization.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "authorization_id",
    "authorization_sha256",
    "proposal_id",
    "proposal_sha256",
    "approved_artifact_id",
    "approved_artifact_sha256",
    "durable_store_event_id",
    "durable_store_event_sha256",
    "export_format",
    "export_format_version",
    "target_logical_consumer",
    "authorization_identity",
    "authorized_at",
    "not_before",
    "expires_at",
    "one_shot_nonce",
    "scope",
  ],
  properties: {
    schema_version: { const: "1.0.0" },
    authorization_id: {
      type: "string",
      pattern: "^arca-export-authorization--[a-f0-9]{64}$",
    },
    authorization_sha256: { type: "string", pattern: SHA256 },
    proposal_id: {
      type: "string",
      pattern: "^arca-export-proposal--[a-f0-9]{64}$",
    },
    proposal_sha256: { type: "string", pattern: SHA256 },
    approved_artifact_id: bindingProperties.approved_artifact_id,
    approved_artifact_sha256: bindingProperties.approved_artifact_sha256,
    durable_store_event_id: bindingProperties.durable_store_event_id,
    durable_store_event_sha256: bindingProperties.durable_store_event_sha256,
    export_format: { const: ARCA_EXPORT_FORMAT },
    export_format_version: { const: "1.0.0" },
    target_logical_consumer: { const: "vlatam-global" },
    authorization_identity: { type: "string", pattern: HUMAN },
    authorized_at: { type: "string", pattern: TIMESTAMP },
    not_before: { type: "string", pattern: TIMESTAMP },
    expires_at: { type: "string", pattern: TIMESTAMP },
    one_shot_nonce: {
      type: "string",
      pattern: "^[a-z0-9][a-z0-9._-]{15,127}$",
    },
    scope: { const: "governed_arca_export_package_only" },
  },
} as const;

export const ARCA_EXPORT_KILL_SWITCH_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/arca-export-kill-switch.schema.json",
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
    "export_blocked",
  ],
  properties: {
    schema_version: { const: "1.0.0" },
    kill_switch_id: { const: "governed-arca-export" },
    kill_switch_sha256: { type: "string", pattern: SHA256 },
    state: { enum: ["active", "disabled"] },
    reviewed_artifact_id: {
      anyOf: [{ type: "null" }, { type: "string", minLength: 1 }],
    },
    reviewed_by: {
      anyOf: [{ type: "null" }, { type: "string", pattern: HUMAN }],
    },
    reviewed_at: {
      anyOf: [{ type: "null" }, { type: "string", pattern: TIMESTAMP }],
    },
    reason: { type: "string", minLength: 1, maxLength: 512 },
    export_blocked: { type: "boolean" },
  },
} as const;

export const ARCA_EXPORT_ROOT_CONFIGURATION_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/arca-export-root-configuration.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "configuration_id",
    "configuration_sha256",
    "durable_store",
    "export_root",
    "export_state_root",
  ],
  properties: {
    schema_version: { const: "1.0.0" },
    configuration_id: { type: "string", minLength: 1, maxLength: 128 },
    configuration_sha256: { type: "string", pattern: SHA256 },
    durable_store: {
      type: "object",
      additionalProperties: false,
      required: ["identity", "path", "configuration_sha256"],
      properties: {
        identity: { type: "string", minLength: 1 },
        path: { type: "string", minLength: 1 },
        configuration_sha256: {
          const: DURABLE_ARCA_STORE_CONFIGURATION_SHA256,
        },
      },
    },
    export_root: {
      type: "object",
      additionalProperties: false,
      required: ["identity", "path"],
      properties: {
        identity: { type: "string", minLength: 1 },
        path: { type: "string", minLength: 1 },
      },
    },
    export_state_root: {
      type: "object",
      additionalProperties: false,
      required: ["identity", "path"],
      properties: {
        identity: { type: "string", minLength: 1 },
        path: { type: "string", minLength: 1 },
      },
    },
  },
} as const;

const packageSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/arca-export-package.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "package_id",
    "package_sha256",
    "package_type",
    "generated_at",
    "exporter",
    "source_approved_artifact_id",
    "source_approved_artifact_sha256",
    "candidate_binding",
    "review_binding",
    "evaluation_binding",
    "durable_store_event_id",
    "durable_store_event_sha256",
    "source_provenance",
    "approved_tariff_payload",
    "payload_sha256",
    "target_logical_consumer",
    "target_environment",
    "handoff_format",
    "handoff_format_version",
    "import_status",
    "publication_status",
    "deployment_status",
    "production_reliance",
    "acknowledgment_required",
    "external_network_transfer_performed",
    "import_authority",
    "publication_authority",
    "deployment_authority",
    "production_authority",
    "scheduler_authority",
    "database_write_authority",
    "external_network_transfer_authority",
    "vlatam_global_access_authority",
  ],
  properties: {
    schema_version: { const: "1.0.0" },
    package_id: {
      type: "string",
      pattern: "^arca-export-package--[a-f0-9]{64}$",
    },
    package_sha256: { type: "string", pattern: SHA256 },
    package_type: { const: ARCA_EXPORT_PACKAGE_TYPE },
    generated_at: { type: "string", pattern: TIMESTAMP },
    exporter: {
      type: "object",
      additionalProperties: false,
      required: ["identity", "version", "configuration_sha256"],
      properties: {
        identity: { const: ARCA_EXPORTER_IDENTITY },
        version: { const: "1.0.0" },
        configuration_sha256: { const: ARCA_EXPORTER_CONFIGURATION_SHA256 },
      },
    },
    source_approved_artifact_id: bindingProperties.approved_artifact_id,
    source_approved_artifact_sha256: bindingProperties.approved_artifact_sha256,
    candidate_binding:
      APPROVED_ARCA_ARTIFACT_SCHEMA.properties.candidate_binding,
    review_binding: APPROVED_ARCA_ARTIFACT_SCHEMA.properties.review_binding,
    evaluation_binding:
      APPROVED_ARCA_ARTIFACT_SCHEMA.properties.evaluation_binding,
    durable_store_event_id: bindingProperties.durable_store_event_id,
    durable_store_event_sha256: bindingProperties.durable_store_event_sha256,
    source_provenance: {
      type: "object",
      additionalProperties: false,
      required: [
        "acquisition_id",
        "acquisition_record_sha256",
        "source_id",
        "requested_url",
        "effective_url",
        "captured_at",
        "raw_byte_sha256",
        "parser_id",
        "parser_version",
        "parser_configuration_sha256",
        "parsing_timestamp",
      ],
      properties: {
        acquisition_id: { type: "string", minLength: 1 },
        acquisition_record_sha256: { type: "string", pattern: SHA256 },
        source_id: { type: "string", minLength: 1 },
        requested_url: { type: "string", minLength: 1 },
        effective_url: { type: "string", minLength: 1 },
        captured_at: { type: "string", pattern: TIMESTAMP },
        raw_byte_sha256: { type: "string", pattern: SHA256 },
        parser_id: { type: "string", minLength: 1 },
        parser_version: { type: "string", minLength: 1 },
        parser_configuration_sha256: { type: "string", pattern: SHA256 },
        parsing_timestamp: { type: "string", pattern: TIMESTAMP },
      },
    },
    approved_tariff_payload:
      APPROVED_ARCA_ARTIFACT_SCHEMA.properties.approved_payload,
    payload_sha256: { type: "string", pattern: SHA256 },
    target_logical_consumer: { const: "vlatam-global" },
    target_environment: { const: "handoff_only" },
    handoff_format: { const: ARCA_EXPORT_FORMAT },
    handoff_format_version: { const: "1.0.0" },
    import_status: { const: "not_imported" },
    publication_status: { const: "not_published" },
    deployment_status: { const: "not_deployed" },
    production_reliance: { const: "not_authorized" },
    acknowledgment_required: { const: true },
    external_network_transfer_performed: { const: false },
    import_authority: { const: false },
    publication_authority: { const: false },
    deployment_authority: { const: false },
    production_authority: { const: false },
    scheduler_authority: { const: false },
    database_write_authority: { const: false },
    external_network_transfer_authority: { const: false },
    vlatam_global_access_authority: { const: false },
  },
} as const;
export const ARCA_EXPORT_PACKAGE_SCHEMA = packageSchema;

export const ARCA_EXPORT_RESULT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/arca-export-result.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "result_type",
    "outcome",
    "result_timestamp",
    "proposal_id",
    "authorization_id",
    "package_id",
    "package_sha256",
    "details",
    "authorization_consumed",
    "package_created",
    "package_durably_recorded",
    ...Object.keys(FALSE_RESULT_AUTHORITIES),
  ],
  properties: {
    schema_version: { const: "1.0.0" },
    result_type: { const: "governed_arca_export_result" },
    outcome: {
      enum: [
        "invalid_proposal",
        "invalid_authorization",
        "authorization_expired",
        "authorization_not_yet_valid",
        "authorization_already_consumed",
        "separation_of_duties_violation",
        "kill_switch_active",
        "invalid_approved_artifact",
        "durable_store_invalid",
        "artifact_not_durably_persisted",
        "binding_mismatch",
        "export_window_invalid",
        "export_already_exists",
        "package_collision",
        "package_publication_failed",
        "recovery_required",
        "package_exported",
        "completed",
      ],
    },
    result_timestamp: { type: "string", pattern: TIMESTAMP },
    proposal_id: {
      anyOf: [
        { type: "null" },
        ARCA_EXPORT_PROPOSAL_SCHEMA.properties.proposal_id,
      ],
    },
    authorization_id: {
      anyOf: [
        { type: "null" },
        ARCA_EXPORT_AUTHORIZATION_SCHEMA.properties.authorization_id,
      ],
    },
    package_id: {
      anyOf: [{ type: "null" }, packageSchema.properties.package_id],
    },
    package_sha256: {
      anyOf: [{ type: "null" }, { type: "string", pattern: SHA256 }],
    },
    details: { type: "array", items: { type: "string" } },
    authorization_consumed: { type: "boolean" },
    package_created: { type: "boolean" },
    package_durably_recorded: { type: "boolean" },
    ...FALSE_RESULT_AUTHORITIES,
  },
} as const;

export const DURABLE_ARCA_EXPORT_RECORD_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/durable-arca-export-record.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    ...ARCA_EXPORT_RESULT_SCHEMA.required,
    "record_type",
    "record_sha256",
    "proposal_sha256",
    "authorization_sha256",
    "approved_artifact_id",
    "approved_artifact_sha256",
    "durable_store_event_id",
    "durable_store_event_sha256",
    "export_attempt_id",
    "package_bytes_sha256",
  ],
  properties: {
    ...ARCA_EXPORT_RESULT_SCHEMA.properties,
    result_type: { const: "governed_arca_export_result" },
    outcome: { const: "completed" },
    authorization_consumed: { const: true },
    package_created: { const: true },
    package_durably_recorded: { const: true },
    record_type: { const: "durable_governed_arca_export_record" },
    record_sha256: { type: "string", pattern: SHA256 },
    proposal_sha256: { type: "string", pattern: SHA256 },
    authorization_sha256: { type: "string", pattern: SHA256 },
    approved_artifact_id: bindingProperties.approved_artifact_id,
    approved_artifact_sha256: bindingProperties.approved_artifact_sha256,
    durable_store_event_id: bindingProperties.durable_store_event_id,
    durable_store_event_sha256: bindingProperties.durable_store_event_sha256,
    export_attempt_id: {
      type: "string",
      pattern: "^arca-export-attempt--[a-f0-9]{64}$",
    },
    package_bytes_sha256: { type: "string", pattern: SHA256 },
  },
} as const;

export const ARCA_EXPORT_JOURNAL_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/arca-export-journal.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "journal_type",
    "journal_id",
    "journal_sha256",
    "stage",
    "proposal_id",
    "proposal_sha256",
    "authorization_id",
    "authorization_sha256",
    "approved_artifact_id",
    "approved_artifact_sha256",
    "durable_store_event_id",
    "durable_store_event_sha256",
    "export_attempt_id",
    "root_configuration_sha256",
    "export_root_identity",
    "export_state_root_identity",
    "kill_switch_sha256",
    "kill_switch_path",
    "consumption_relative_path",
    "consumption_bytes_sha256",
    "consumption_json",
    "package_id",
    "package_sha256",
    "package_bytes_sha256",
    "package_json",
    "record_json",
    "created_at",
    "updated_at",
  ],
  properties: {
    schema_version: { const: "1.0.0" },
    journal_type: { const: "governed_arca_export_journal" },
    journal_id: {
      type: "string",
      pattern: "^arca-export-journal--[a-f0-9]{64}$",
    },
    journal_sha256: { type: "string", pattern: SHA256 },
    stage: {
      enum: [
        "prepared",
        "authorization_consumed",
        "package_published",
        "record_published",
        "completed",
      ],
    },
    proposal_id: ARCA_EXPORT_PROPOSAL_SCHEMA.properties.proposal_id,
    proposal_sha256: { type: "string", pattern: SHA256 },
    authorization_id:
      ARCA_EXPORT_AUTHORIZATION_SCHEMA.properties.authorization_id,
    authorization_sha256: { type: "string", pattern: SHA256 },
    approved_artifact_id: bindingProperties.approved_artifact_id,
    approved_artifact_sha256: bindingProperties.approved_artifact_sha256,
    durable_store_event_id: bindingProperties.durable_store_event_id,
    durable_store_event_sha256: bindingProperties.durable_store_event_sha256,
    export_attempt_id: { type: "string" },
    root_configuration_sha256: { type: "string", pattern: SHA256 },
    export_root_identity: { type: "string", minLength: 1 },
    export_state_root_identity: { type: "string", minLength: 1 },
    kill_switch_sha256: { type: "string", pattern: SHA256 },
    kill_switch_path: { type: "string", minLength: 1 },
    consumption_relative_path: {
      type: "string",
      pattern: "^consumptions/arca-export-authorization--[a-f0-9]{64}\\.json$",
    },
    consumption_bytes_sha256: { type: "string", pattern: SHA256 },
    consumption_json: { type: "string", minLength: 3 },
    package_id: packageSchema.properties.package_id,
    package_sha256: { type: "string", pattern: SHA256 },
    package_bytes_sha256: { type: "string", pattern: SHA256 },
    package_json: { type: "string", minLength: 3 },
    record_json: { type: "string", minLength: 3 },
    created_at: { type: "string", pattern: TIMESTAMP },
    updated_at: { type: "string", pattern: TIMESTAMP },
  },
} as const;

const ajv = new Ajv({ allErrors: true, strict: false });
const validateProposal = ajv.compile(ARCA_EXPORT_PROPOSAL_SCHEMA);
const validateAuthorization = ajv.compile(ARCA_EXPORT_AUTHORIZATION_SCHEMA);
const validateKillSwitch = ajv.compile(ARCA_EXPORT_KILL_SWITCH_SCHEMA);
const validateConfiguration = ajv.compile(
  ARCA_EXPORT_ROOT_CONFIGURATION_SCHEMA,
);
const validatePackage = ajv.compile(ARCA_EXPORT_PACKAGE_SCHEMA);
const validateRecord = ajv.compile(DURABLE_ARCA_EXPORT_RECORD_SCHEMA);
const validateJournal = ajv.compile(ARCA_EXPORT_JOURNAL_SCHEMA);

export function computeArcaExportProposalSha256(
  value: ArcaExportProposal,
): string {
  return domainHash(
    "vlatam-ai-lab/arca-export-proposal/v1",
    without(value, "proposal_id", "proposal_sha256"),
  );
}
export function computeArcaExportAuthorizationSha256(
  value: ArcaExportAuthorization,
): string {
  return domainHash(
    "vlatam-ai-lab/arca-export-authorization/v1",
    without(value, "authorization_id", "authorization_sha256"),
  );
}
export function computeArcaExportKillSwitchSha256(
  value: ArcaExportKillSwitch,
): string {
  return domainHash(
    "vlatam-ai-lab/arca-export-kill-switch/v1",
    without(value, "kill_switch_sha256"),
  );
}
export function computeArcaExportConfigurationSha256(
  value: ArcaExportRootConfiguration,
): string {
  return domainHash(
    "vlatam-ai-lab/arca-export-root-configuration/v1",
    without(value, "configuration_sha256"),
  );
}
export function computeArcaExportPackageSha256(
  value: GovernedArcaExportPackage,
): string {
  return domainHash(
    "vlatam-ai-lab/arca-export-package/v1",
    without(value, "package_id", "package_sha256"),
  );
}
function computeRecordSha256(value: DurableArcaExportRecord): string {
  return domainHash(
    "vlatam-ai-lab/durable-arca-export-record/v1",
    without(value, "record_sha256"),
  );
}
function computeJournalSha256(value: ArcaExportJournal): string {
  return domainHash(
    "vlatam-ai-lab/arca-export-journal-state/v1",
    without(value, "journal_sha256"),
  );
}

function result(
  timestamp: string,
  outcome: ArcaExportOutcome,
  details: string[],
  proposal?: ArcaExportProposal,
  authorization?: ArcaExportAuthorization,
  pkg?: GovernedArcaExportPackage,
  flags: { consumed?: boolean; created?: boolean; recorded?: boolean } = {},
): ArcaExportResult {
  return {
    schema_version: "1.0.0",
    result_type: "governed_arca_export_result",
    outcome,
    result_timestamp: timestamp,
    proposal_id: proposal?.proposal_id ?? null,
    authorization_id: authorization?.authorization_id ?? null,
    package_id: pkg?.package_id ?? null,
    package_sha256: pkg?.package_sha256 ?? null,
    details,
    authorization_consumed: flags.consumed ?? false,
    package_created: flags.created ?? false,
    package_durably_recorded: flags.recorded ?? false,
    external_transfer_performed: false,
    imported: false,
    published: false,
    deployed: false,
    production_authorized: false,
    scheduler_authorized: false,
    database_write_authorized: false,
    vlatam_global_access_performed: false,
  };
}
function canonicalTimestamp(value: string): boolean {
  return (
    new RegExp(TIMESTAMP).test(value) && new Date(value).toISOString() === value
  );
}
function fsError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error: unknown) {
    if (fsError(error, "ENOENT")) return false;
    throw error;
  }
}
function isReviewedDisabledExportSwitch(
  value: unknown,
): value is ArcaExportKillSwitch {
  if (!validateKillSwitch(value)) return false;
  const typed = value as ArcaExportKillSwitch;
  return (
    typed.kill_switch_id === "governed-arca-export" &&
    typed.kill_switch_sha256 === computeArcaExportKillSwitchSha256(typed) &&
    typed.state === "disabled" &&
    typed.export_blocked === false &&
    typeof typed.reviewed_artifact_id === "string" &&
    typed.reviewed_artifact_id.length > 0 &&
    typeof typed.reviewed_by === "string" &&
    typeof typed.reviewed_at === "string" &&
    canonicalTimestamp(typed.reviewed_at)
  );
}
async function rereadExactReviewedDisabledSwitch(
  expected: unknown,
  path: string,
): Promise<boolean> {
  if (!isReviewedDisabledExportSwitch(expected)) return false;
  try {
    const stat = await lstat(resolve(path));
    if (stat.isSymbolicLink() || !stat.isFile()) return false;
    const reread = JSON.parse(await readFile(resolve(path), "utf8")) as unknown;
    return (
      isReviewedDisabledExportSwitch(reread) &&
      canonicalizeReviewJson(reread) === canonicalizeReviewJson(expected)
    );
  } catch {
    return false;
  }
}
async function readExactVisibleBytes(path: string): Promise<string | null> {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || !stat.isFile())
      throw new Error("recovery_visible_file_invalid");
    return await readFile(path, "utf8");
  } catch (error: unknown) {
    if (fsError(error, "ENOENT")) return null;
    throw error;
  }
}
async function validateExistingRoot(path: string): Promise<string> {
  if (!path.trim()) throw new Error("unsafe_export_root");
  const root = resolve(path);
  let current = parse(root).root;
  for (const component of relative(current, root).split(sep).filter(Boolean)) {
    current = join(current, component);
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw new Error("unsafe_export_root");
  }
  return root;
}
async function validateOptionalChildDirectory(
  root: string,
  name: string,
): Promise<void> {
  const target = join(root, name);
  if (dirname(target) !== root) throw new Error("unsafe_export_root");
  try {
    const stat = await lstat(target);
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw new Error("unsafe_export_root");
  } catch (error: unknown) {
    if (!fsError(error, "ENOENT")) throw error;
  }
}
async function ensureChildDirectory(
  root: string,
  name: string,
): Promise<string> {
  await validateExistingRoot(root);
  const target = join(root, name);
  if (dirname(target) !== root) throw new Error("unsafe_export_root");
  await mkdir(target);
  const stat = await lstat(target);
  if (stat.isSymbolicLink() || !stat.isDirectory())
    throw new Error("unsafe_export_root");
  return target;
}
async function assertEmptyActiveJournals(stateRoot: string): Promise<void> {
  const path = join(stateRoot, "journals");
  if (!(await exists(path))) return;
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !stat.isDirectory())
    throw new Error("unsafe_export_root");
  if ((await readdir(path)).length) throw new Error("recovery_required");
}
function packageFor(
  source: DurableArcaVerifiedExportSource,
  generatedAt: string,
): GovernedArcaExportPackage {
  const artifact = source.approved_artifact;
  const unsealed = {
    schema_version: "1.0.0" as const,
    package_type: ARCA_EXPORT_PACKAGE_TYPE,
    generated_at: generatedAt,
    exporter: {
      identity: ARCA_EXPORTER_IDENTITY,
      version: ARCA_EXPORTER_VERSION,
      configuration_sha256: ARCA_EXPORTER_CONFIGURATION_SHA256,
    },
    source_approved_artifact_id: artifact.approved_artifact_id,
    source_approved_artifact_sha256: artifact.approved_artifact_sha256,
    candidate_binding: structuredClone(artifact.candidate_binding),
    review_binding: structuredClone(artifact.review_binding),
    evaluation_binding: structuredClone(artifact.evaluation_binding),
    durable_store_event_id: source.approved_artifact_event.event_id,
    durable_store_event_sha256: source.approved_artifact_event.event_sha256,
    source_provenance: {
      acquisition_id: artifact.acquisition_id,
      acquisition_record_sha256: artifact.acquisition_record_sha256,
      source_id: source.candidate.acquisition_artifact.source_id,
      requested_url: source.candidate.acquisition_artifact.requested_url,
      effective_url: source.candidate.acquisition_artifact.effective_url,
      captured_at: source.candidate.acquisition_artifact.captured_at,
      raw_byte_sha256: artifact.raw_byte_sha256,
      parser_id: artifact.parser.parser_id,
      parser_version: artifact.parser.parser_version,
      parser_configuration_sha256: artifact.parser.configuration_sha256,
      parsing_timestamp: artifact.parsing_timestamp,
    },
    approved_tariff_payload: structuredClone(artifact.approved_payload),
    payload_sha256: createHash("sha256")
      .update(JSON.stringify(artifact.approved_payload))
      .digest("hex"),
    target_logical_consumer: "vlatam-global" as const,
    target_environment: "handoff_only" as const,
    handoff_format: ARCA_EXPORT_FORMAT,
    handoff_format_version: ARCA_EXPORT_FORMAT_VERSION,
    import_status: "not_imported" as const,
    publication_status: "not_published" as const,
    deployment_status: "not_deployed" as const,
    production_reliance: "not_authorized" as const,
    acknowledgment_required: true as const,
    external_network_transfer_performed: false as const,
    import_authority: false as const,
    publication_authority: false as const,
    deployment_authority: false as const,
    production_authority: false as const,
    scheduler_authority: false as const,
    database_write_authority: false as const,
    external_network_transfer_authority: false as const,
    vlatam_global_access_authority: false as const,
  };
  const hash = domainHash("vlatam-ai-lab/arca-export-package/v1", unsealed);
  return {
    ...unsealed,
    package_id: `arca-export-package--${hash}`,
    package_sha256: hash,
  };
}

export interface ArcaExportPreflightInput {
  readonly proposal: unknown;
  readonly authorization: unknown;
  readonly killSwitch: unknown;
  readonly configuration: ArcaExportRootConfiguration;
  readonly executionTimestamp: string;
}

export async function preflightGovernedArcaExport(
  input: ArcaExportPreflightInput,
): Promise<ArcaExportResult> {
  const timestamp = canonicalTimestamp(input.executionTimestamp)
    ? input.executionTimestamp
    : "1970-01-01T00:00:00.000Z";
  if (!validateProposal(input.proposal))
    return result(timestamp, "invalid_proposal", [
      ajv.errorsText(validateProposal.errors),
    ]);
  const proposal = input.proposal as unknown as ArcaExportProposal;
  if (
    !canonicalTimestamp(input.executionTimestamp) ||
    !canonicalTimestamp(proposal.proposed_at) ||
    !canonicalTimestamp(proposal.export_window.starts_at) ||
    !canonicalTimestamp(proposal.export_window.expires_at) ||
    Date.parse(proposal.export_window.starts_at) >=
      Date.parse(proposal.export_window.expires_at) ||
    input.executionTimestamp < proposal.export_window.starts_at ||
    input.executionTimestamp >= proposal.export_window.expires_at
  )
    return result(
      timestamp,
      "export_window_invalid",
      ["proposal_or_export_window_invalid"],
      proposal,
    );
  if (
    proposal.proposal_sha256 !== computeArcaExportProposalSha256(proposal) ||
    proposal.proposal_id !== `arca-export-proposal--${proposal.proposal_sha256}`
  )
    return result(
      timestamp,
      "invalid_proposal",
      ["proposal_hash_invalid"],
      proposal,
    );
  if (!validateAuthorization(input.authorization))
    return result(
      timestamp,
      "invalid_authorization",
      [ajv.errorsText(validateAuthorization.errors)],
      proposal,
    );
  const authorization = input.authorization as ArcaExportAuthorization;
  if (
    !canonicalTimestamp(authorization.authorized_at) ||
    !canonicalTimestamp(authorization.not_before) ||
    !canonicalTimestamp(authorization.expires_at) ||
    authorization.authorized_at > authorization.not_before ||
    authorization.not_before >= authorization.expires_at
  )
    return result(
      timestamp,
      "invalid_authorization",
      ["authorization_window_invalid"],
      proposal,
      authorization,
    );
  if (
    authorization.authorization_sha256 !==
      computeArcaExportAuthorizationSha256(authorization) ||
    authorization.authorization_id !==
      `arca-export-authorization--${authorization.authorization_sha256}`
  )
    return result(
      timestamp,
      "invalid_authorization",
      ["authorization_hash_invalid"],
      proposal,
      authorization,
    );
  if (input.executionTimestamp < authorization.not_before)
    return result(
      timestamp,
      "authorization_not_yet_valid",
      ["authorization_not_before"],
      proposal,
      authorization,
    );
  if (input.executionTimestamp >= authorization.expires_at)
    return result(
      timestamp,
      "authorization_expired",
      ["authorization_expired"],
      proposal,
      authorization,
    );
  const exact =
    authorization.proposal_id === proposal.proposal_id &&
    authorization.proposal_sha256 === proposal.proposal_sha256 &&
    authorization.approved_artifact_id === proposal.approved_artifact_id &&
    authorization.approved_artifact_sha256 ===
      proposal.approved_artifact_sha256 &&
    authorization.durable_store_event_id === proposal.durable_store_event_id &&
    authorization.durable_store_event_sha256 ===
      proposal.durable_store_event_sha256 &&
    authorization.export_format === proposal.export_format &&
    authorization.export_format_version === proposal.export_format_version &&
    authorization.target_logical_consumer === proposal.target_logical_consumer;
  if (!exact)
    return result(
      timestamp,
      "binding_mismatch",
      ["proposal_authorization_binding_mismatch"],
      proposal,
      authorization,
    );
  if (
    !validateConfiguration(input.configuration) ||
    input.configuration.configuration_sha256 !==
      computeArcaExportConfigurationSha256(input.configuration) ||
    input.configuration.durable_store.configuration_sha256 !==
      DURABLE_ARCA_STORE_CONFIGURATION_SHA256 ||
    proposal.export_root_identity !== input.configuration.export_root.identity
  )
    return result(
      timestamp,
      "binding_mismatch",
      ["configuration_binding_mismatch"],
      proposal,
      authorization,
    );
  if (!validateKillSwitch(input.killSwitch))
    return result(
      timestamp,
      "kill_switch_active",
      ["kill_switch_missing_or_malformed"],
      proposal,
      authorization,
    );
  const killSwitch = input.killSwitch as ArcaExportKillSwitch;
  if (
    killSwitch.kill_switch_sha256 !==
      computeArcaExportKillSwitchSha256(killSwitch) ||
    killSwitch.state !== "disabled" ||
    killSwitch.export_blocked ||
    !killSwitch.reviewed_artifact_id ||
    !killSwitch.reviewed_by ||
    !killSwitch.reviewed_at
  )
    return result(
      timestamp,
      "kill_switch_active",
      ["export_kill_switch_active"],
      proposal,
      authorization,
    );
  try {
    const exportRoot = await validateExistingRoot(
      input.configuration.export_root.path,
    );
    const stateRoot = await validateExistingRoot(
      input.configuration.export_state_root.path,
    );
    for (const name of ["packages"])
      await validateOptionalChildDirectory(exportRoot, name);
    for (const name of [
      "consumptions",
      "journals",
      "completed-journals",
      "records",
    ])
      await validateOptionalChildDirectory(stateRoot, name);
    await assertEmptyActiveJournals(stateRoot);
    const consumption = join(
      stateRoot,
      "consumptions",
      `${authorization.authorization_id}.json`,
    );
    if (await exists(consumption))
      return result(
        timestamp,
        "authorization_already_consumed",
        ["authorization_consumption_exists"],
        proposal,
        authorization,
      );
    const source = await readVerifiedDurableArcaExportSource(
      input.configuration.durable_store.path,
      proposal.approved_artifact_id,
    );
    const artifact = source.approved_artifact;
    if (
      !validateApprovedArcaArtifact(artifact).valid ||
      artifact.approval_status !== "approved" ||
      artifact.export_status !== "not_exported" ||
      artifact.publication_status !== "not_published" ||
      artifact.production_reliance !== "not_authorized" ||
      artifact.vlatam_global_consumption !== "not_authorized"
    )
      return result(
        timestamp,
        "invalid_approved_artifact",
        ["approved_artifact_invalid_or_state_changed"],
        proposal,
        authorization,
      );
    if (
      computeApprovedArcaArtifactSha256(artifact) !==
        proposal.approved_artifact_sha256 ||
      computeGovernedArcaCandidateSha256(source.candidate) !==
        proposal.candidate_sha256 ||
      computeGovernedArcaReviewSha256(source.review) !==
        proposal.review_sha256 ||
      source.evaluation.evaluation_sha256 !== proposal.evaluation_sha256 ||
      source.approved_artifact_event.event_sha256 !==
        computeDurableArcaStoreEventSha256(source.approved_artifact_event)
    )
      return result(
        timestamp,
        "binding_mismatch",
        ["immutable_source_hash_mismatch"],
        proposal,
        authorization,
      );
    if (
      artifact.approved_artifact_id !== proposal.approved_artifact_id ||
      artifact.candidate_binding.candidate_artifact_id !==
        proposal.candidate_id ||
      artifact.review_binding.review_id !== proposal.review_id ||
      artifact.evaluation_binding.evaluation_id !== proposal.evaluation_id ||
      source.approved_artifact_event.event_id !==
        proposal.durable_store_event_id ||
      source.approved_artifact_event.approved_artifact_sha256 !==
        proposal.approved_artifact_sha256
    )
      return result(
        timestamp,
        "binding_mismatch",
        ["immutable_source_identity_mismatch"],
        proposal,
        authorization,
      );
    const prohibited = new Set(
      [
        proposal.proposal_author_identity,
        source.review.separation_of_duties.acquisition_operator_identity,
        source.review.separation_of_duties.candidate_producer_identity,
        source.review.reviewer?.identity,
        artifact.builder_identity,
        source.approved_artifact_event.actor_identity,
      ].filter((value): value is string => typeof value === "string"),
    );
    if (prohibited.has(authorization.authorization_identity))
      return result(
        timestamp,
        "separation_of_duties_violation",
        ["export_authorizer_role_conflict"],
        proposal,
        authorization,
      );
    const pkg = packageFor(source, input.executionTimestamp);
    if (
      !validatePackage(pkg) ||
      pkg.package_sha256 !== computeArcaExportPackageSha256(pkg) ||
      canonicalizeReviewJson(pkg.approved_tariff_payload) !==
        canonicalizeReviewJson(artifact.approved_payload)
    )
      return result(
        timestamp,
        "binding_mismatch",
        ["deterministic_package_validation_failed"],
        proposal,
        authorization,
      );
    if (await exists(join(exportRoot, "packages", `${pkg.package_id}.json`)))
      return result(
        timestamp,
        "export_already_exists",
        ["package_identity_already_exists"],
        proposal,
        authorization,
        pkg,
      );
    return result(
      timestamp,
      "package_exported",
      ["preflight_valid_zero_writes_zero_network_calls"],
      proposal,
      authorization,
      pkg,
    );
  } catch (error: unknown) {
    const detail =
      error instanceof Error ? error.message : "durable_store_invalid";
    const outcome: ArcaExportOutcome =
      detail === "recovery_required"
        ? "recovery_required"
        : detail.includes("artifact_not_durably")
          ? "artifact_not_durably_persisted"
          : detail.includes("unsafe_export_root")
            ? "binding_mismatch"
            : "durable_store_invalid";
    return result(timestamp, outcome, [detail], proposal, authorization);
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
async function writeExclusive(path: string, bytes: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(
    path,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    0o600,
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncDirectory(dirname(path));
}
async function replace(path: string, bytes: string): Promise<void> {
  const staging = `${path}.staging-${randomUUID()}`;
  try {
    await writeExclusive(staging, bytes);
    await rename(staging, path);
    await syncDirectory(dirname(path));
  } finally {
    await rm(staging, { force: true });
  }
}
async function publishNoOverwrite(
  path: string,
  bytes: string,
): Promise<"created" | "same" | "collision"> {
  await mkdir(dirname(path), { recursive: true });
  if (await exists(path)) {
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || !stat.isFile())
      throw new Error("package_collision");
    return (await readFile(path, "utf8")) === bytes ? "same" : "collision";
  }
  const staging = join(dirname(path), `.staging-${randomUUID()}`);
  try {
    await writeExclusive(staging, bytes);
    try {
      await link(staging, path);
    } catch (error: unknown) {
      if (!fsError(error, "EEXIST")) throw error;
      return (await readFile(path, "utf8")) === bytes ? "same" : "collision";
    }
    await syncDirectory(dirname(path));
    return "created";
  } finally {
    await rm(staging, { force: true });
  }
}
function sealJournal(
  value: Omit<ArcaExportJournal, "journal_sha256">,
): ArcaExportJournal {
  const candidate = { ...value, journal_sha256: "0".repeat(64) };
  return { ...candidate, journal_sha256: computeJournalSha256(candidate) };
}

export interface ArcaExportExecutionInput extends ArcaExportPreflightInput {
  readonly killSwitchPath: string;
  readonly interruptAfterStage?: ArcaExportJournalStage;
  /** Test-only crash injection after consumption visibility, before stage update. */
  readonly interruptAfterConsumptionBeforeJournalUpdate?: boolean;
}
function interrupt(
  stage: ArcaExportJournalStage,
  requested?: ArcaExportJournalStage,
): void {
  if (stage === requested)
    throw new Error(`governed_arca_export_interrupted_after:${stage}`);
}

export async function executeGovernedArcaExport(
  input: ArcaExportExecutionInput,
): Promise<ArcaExportResult> {
  const checked = await preflightGovernedArcaExport(input);
  if (checked.outcome !== "package_exported") return checked;
  const proposal = input.proposal as ArcaExportProposal;
  const authorization = input.authorization as ArcaExportAuthorization;
  const source = await readVerifiedDurableArcaExportSource(
    input.configuration.durable_store.path,
    proposal.approved_artifact_id,
  );
  const pkg = packageFor(source, input.executionTimestamp);
  const stateRoot = resolve(input.configuration.export_state_root.path);
  const exportRoot = resolve(input.configuration.export_root.path);
  for (const directory of [
    "consumptions",
    "journals",
    "completed-journals",
    "records",
  ])
    await ensureChildDirectory(stateRoot, directory).catch(
      async (error: unknown) => {
        if (!fsError(error, "EEXIST")) throw error;
        await validateOptionalChildDirectory(stateRoot, directory);
        return join(stateRoot, directory);
      },
    );
  await ensureChildDirectory(exportRoot, "packages").catch(
    async (error: unknown) => {
      if (!fsError(error, "EEXIST")) throw error;
      await validateOptionalChildDirectory(exportRoot, "packages");
      return join(exportRoot, "packages");
    },
  );
  const attemptHash = domainHash("vlatam-ai-lab/arca-export-attempt/v1", {
    proposal_id: proposal.proposal_id,
    authorization_id: authorization.authorization_id,
    approved_artifact_id: proposal.approved_artifact_id,
    durable_store_event_id: proposal.durable_store_event_id,
    package_id: pkg.package_id,
  });
  const attemptId = `arca-export-attempt--${attemptHash}`;
  const packageJson = canonicalBytes(pkg);
  const baseCompleted = result(
    input.executionTimestamp,
    "completed",
    ["local_handoff_package_completed"],
    proposal,
    authorization,
    pkg,
    { consumed: true, created: true, recorded: true },
  );
  const recordBase = {
    ...baseCompleted,
    record_type: "durable_governed_arca_export_record" as const,
    record_sha256: "0".repeat(64),
    proposal_sha256: proposal.proposal_sha256,
    authorization_sha256: authorization.authorization_sha256,
    approved_artifact_id: proposal.approved_artifact_id,
    approved_artifact_sha256: proposal.approved_artifact_sha256,
    durable_store_event_id: proposal.durable_store_event_id,
    durable_store_event_sha256: proposal.durable_store_event_sha256,
    export_attempt_id: attemptId,
    package_bytes_sha256: bytesHash(packageJson),
  };
  const record = {
    ...recordBase,
    record_sha256: computeRecordSha256(recordBase),
  };
  const recordJson = canonicalBytes(record);
  const consumptionId = `arca-export-consumption--${attemptHash}`;
  const consumptionWithoutHash = {
    schema_version: "1.0.0",
    consumption_type: "arca_export_authorization_consumption",
    consumption_id: consumptionId,
    consumption_sha256: "0".repeat(64),
    proposal_id: proposal.proposal_id,
    proposal_sha256: proposal.proposal_sha256,
    authorization_id: authorization.authorization_id,
    authorization_sha256: authorization.authorization_sha256,
    approved_artifact_id: proposal.approved_artifact_id,
    approved_artifact_sha256: proposal.approved_artifact_sha256,
    durable_store_event_id: proposal.durable_store_event_id,
    durable_store_event_sha256: proposal.durable_store_event_sha256,
    package_id: pkg.package_id,
    package_sha256: pkg.package_sha256,
    export_attempt_id: attemptId,
    consumed_at: input.executionTimestamp,
  };
  const consumption = {
    ...consumptionWithoutHash,
    consumption_sha256: domainHash(
      "vlatam-ai-lab/arca-export-consumption-record/v1",
      without(consumptionWithoutHash, "consumption_sha256"),
    ),
  };
  const consumptionJson = canonicalBytes(consumption);
  const consumptionRelativePath = `consumptions/${authorization.authorization_id}.json`;
  const journalId = `arca-export-journal--${attemptHash}`;
  let journal = sealJournal({
    schema_version: "1.0.0",
    journal_type: "governed_arca_export_journal",
    journal_id: journalId,
    stage: "prepared",
    proposal_id: proposal.proposal_id,
    proposal_sha256: proposal.proposal_sha256,
    authorization_id: authorization.authorization_id,
    authorization_sha256: authorization.authorization_sha256,
    approved_artifact_id: proposal.approved_artifact_id,
    approved_artifact_sha256: proposal.approved_artifact_sha256,
    durable_store_event_id: proposal.durable_store_event_id,
    durable_store_event_sha256: proposal.durable_store_event_sha256,
    export_attempt_id: attemptId,
    root_configuration_sha256: input.configuration.configuration_sha256,
    export_root_identity: input.configuration.export_root.identity,
    export_state_root_identity: input.configuration.export_state_root.identity,
    kill_switch_sha256: (input.killSwitch as ArcaExportKillSwitch)
      .kill_switch_sha256,
    kill_switch_path: resolve(input.killSwitchPath),
    consumption_relative_path: consumptionRelativePath,
    consumption_bytes_sha256: bytesHash(consumptionJson),
    consumption_json: consumptionJson,
    package_id: pkg.package_id,
    package_sha256: pkg.package_sha256,
    package_bytes_sha256: bytesHash(packageJson),
    package_json: packageJson,
    record_json: recordJson,
    created_at: input.executionTimestamp,
    updated_at: input.executionTimestamp,
  });
  const journalPath = join(stateRoot, "journals", `${journalId}.json`);
  try {
    await writeExclusive(journalPath, canonicalBytes(journal));
  } catch (error: unknown) {
    if (fsError(error, "EEXIST"))
      return result(
        input.executionTimestamp,
        "authorization_already_consumed",
        ["competing_export_attempt_exists"],
        proposal,
        authorization,
      );
    throw error;
  }
  interrupt("prepared", input.interruptAfterStage);
  try {
    await writeExclusive(
      join(stateRoot, consumptionRelativePath),
      consumptionJson,
    );
  } catch (error: unknown) {
    if (fsError(error, "EEXIST"))
      return result(
        input.executionTimestamp,
        "authorization_already_consumed",
        ["atomic_authorization_consumption_lost"],
        proposal,
        authorization,
      );
    throw error;
  }
  if (input.interruptAfterConsumptionBeforeJournalUpdate)
    throw new Error(
      "governed_arca_export_interrupted_after:consumption_visible_before_journal_update",
    );
  journal = sealJournal({
    ...journal,
    stage: "authorization_consumed",
    updated_at: input.executionTimestamp,
  });
  await replace(journalPath, canonicalBytes(journal));
  interrupt("authorization_consumed", input.interruptAfterStage);
  if (
    !(await rereadExactReviewedDisabledSwitch(
      input.killSwitch,
      input.killSwitchPath,
    ))
  )
    return result(
      input.executionTimestamp,
      "kill_switch_active",
      ["final_kill_switch_reread_blocked"],
      proposal,
      authorization,
      pkg,
      { consumed: true },
    );
  const packageState = await publishNoOverwrite(
    join(exportRoot, "packages", `${pkg.package_id}.json`),
    packageJson,
  );
  if (packageState === "collision")
    return result(
      input.executionTimestamp,
      "package_collision",
      ["package_bytes_collision"],
      proposal,
      authorization,
      pkg,
      { consumed: true },
    );
  journal = sealJournal({
    ...journal,
    stage: "package_published",
    updated_at: input.executionTimestamp,
  });
  await replace(journalPath, canonicalBytes(journal));
  interrupt("package_published", input.interruptAfterStage);
  const recordState = await publishNoOverwrite(
    join(stateRoot, "records", `${pkg.package_id}.json`),
    recordJson,
  );
  if (recordState === "collision")
    return result(
      input.executionTimestamp,
      "package_collision",
      ["durable_record_collision"],
      proposal,
      authorization,
      pkg,
      { consumed: true, created: true },
    );
  journal = sealJournal({
    ...journal,
    stage: "record_published",
    updated_at: input.executionTimestamp,
  });
  await replace(journalPath, canonicalBytes(journal));
  interrupt("record_published", input.interruptAfterStage);
  journal = sealJournal({
    ...journal,
    stage: "completed",
    updated_at: input.executionTimestamp,
  });
  await replace(journalPath, canonicalBytes(journal));
  await rename(
    journalPath,
    join(stateRoot, "completed-journals", `${journalId}.json`),
  );
  await syncDirectory(join(stateRoot, "completed-journals"));
  return baseCompleted;
}

export interface ArcaExportRecoveryInput {
  readonly configuration: unknown;
  readonly journalId: string;
  readonly killSwitch: unknown;
  readonly killSwitchPath: string;
  readonly recoveryTimestamp: string;
}

/**
 * Read-only authoritative reconciliation for an existing AI-132 journal.
 * Unlike recovery, this inspector never publishes a package or record and
 * never changes a journal, consumption, authorization, switch, or root.
 */
export async function inspectGovernedArcaExportRecovery(
  input: ArcaExportRecoveryInput,
): Promise<ArcaExportResult> {
  const timestamp = canonicalTimestamp(input.recoveryTimestamp)
    ? input.recoveryTimestamp
    : "1970-01-01T00:00:00.000Z";
  if (
    !canonicalTimestamp(input.recoveryTimestamp) ||
    !validateConfiguration(input.configuration) ||
    !/^arca-export-journal--[a-f0-9]{64}$/.test(input.journalId)
  )
    return result(timestamp, "recovery_required", [
      "inspection_binding_invalid",
    ]);
  const configuration = input.configuration as ArcaExportRootConfiguration;
  if (
    configuration.configuration_sha256 !==
    computeArcaExportConfigurationSha256(configuration)
  )
    return result(timestamp, "recovery_required", [
      "inspection_configuration_divergent",
    ]);
  let stateRoot: string;
  try {
    stateRoot = await validateExistingRoot(
      configuration.export_state_root.path,
    );
  } catch {
    return result(timestamp, "recovery_required", [
      "inspection_root_missing_or_substituted",
    ]);
  }
  const journalPath = join(stateRoot, "journals", `${input.journalId}.json`);
  let journal: ArcaExportJournal;
  try {
    const bytes = await readExactVisibleBytes(journalPath);
    if (bytes === null) throw new Error("missing");
    journal = JSON.parse(bytes) as ArcaExportJournal;
  } catch {
    return result(timestamp, "recovery_required", [
      "inspection_journal_missing_or_malformed",
    ]);
  }
  if (
    !validateJournal(journal) ||
    journal.journal_sha256 !== computeJournalSha256(journal) ||
    journal.journal_id !== input.journalId ||
    journal.root_configuration_sha256 !== configuration.configuration_sha256 ||
    journal.export_state_root_identity !==
      configuration.export_state_root.identity
  )
    return result(timestamp, "recovery_required", [
      "inspection_journal_divergent",
    ]);
  let consumption: string | null;
  try {
    consumption = await readExactVisibleBytes(
      join(stateRoot, journal.consumption_relative_path),
    );
  } catch {
    return result(timestamp, "recovery_required", [
      "inspection_consumption_substituted",
    ]);
  }
  if (consumption === null && journal.stage === "prepared")
    return result(timestamp, "authorization_not_yet_valid", [
      "exact_pre_authority_non_consumption_proven",
    ]);
  if (consumption === null || consumption !== journal.consumption_json)
    return result(
      timestamp,
      "recovery_required",
      ["inspection_consumption_missing_or_divergent"],
      undefined,
      undefined,
      undefined,
      { consumed: consumption !== null },
    );
  if (journal.stage !== "completed")
    return result(
      timestamp,
      "recovery_required",
      ["exact_authorization_consumption_visible_recovery_required"],
      undefined,
      undefined,
      undefined,
      { consumed: true },
    );
  const packageBytes = await readExactVisibleBytes(
    join(
      resolve(configuration.export_root.path),
      "packages",
      `${journal.package_id}.json`,
    ),
  ).catch(() => null);
  const recordBytes = await readExactVisibleBytes(
    join(stateRoot, "records", `${journal.package_id}.json`),
  ).catch(() => null);
  if (
    packageBytes !== journal.package_json ||
    recordBytes !== journal.record_json
  )
    return result(
      timestamp,
      "recovery_required",
      ["completed_journal_durable_evidence_missing_or_divergent"],
      undefined,
      undefined,
      undefined,
      { consumed: true },
    );
  return result(
    timestamp,
    "completed",
    ["exact_durable_export_completion_visible"],
    undefined,
    undefined,
    undefined,
    { consumed: true, created: true, recorded: true },
  );
}

export async function recoverGovernedArcaExport(
  input: ArcaExportRecoveryInput,
): Promise<ArcaExportResult> {
  const timestamp = canonicalTimestamp(input.recoveryTimestamp)
    ? input.recoveryTimestamp
    : "1970-01-01T00:00:00.000Z";
  if (
    !canonicalTimestamp(input.recoveryTimestamp) ||
    !validateConfiguration(input.configuration) ||
    !/^arca-export-journal--[a-f0-9]{64}$/.test(input.journalId)
  )
    return result(timestamp, "recovery_required", [
      "recovery_timestamp_or_root_configuration_invalid",
    ]);
  const configuration = input.configuration as ArcaExportRootConfiguration;
  if (
    configuration.configuration_sha256 !==
    computeArcaExportConfigurationSha256(configuration)
  )
    return result(timestamp, "recovery_required", [
      "root_configuration_hash_invalid",
    ]);
  const stateRoot = await validateExistingRoot(
    configuration.export_state_root.path,
  );
  const exportRoot = await validateExistingRoot(configuration.export_root.path);
  for (const name of ["journals", "completed-journals", "records"])
    await validateOptionalChildDirectory(stateRoot, name);
  await validateOptionalChildDirectory(exportRoot, "packages");
  const path = join(stateRoot, "journals", `${input.journalId}.json`);
  let journal: ArcaExportJournal;
  try {
    journal = JSON.parse(await readFile(path, "utf8")) as ArcaExportJournal;
  } catch {
    return result(timestamp, "recovery_required", [
      "export_journal_missing_or_invalid",
    ]);
  }
  if (
    !validateJournal(journal) ||
    journal.journal_sha256 !== computeJournalSha256(journal) ||
    bytesHash(journal.package_json) !== journal.package_bytes_sha256 ||
    bytesHash(journal.consumption_json) !== journal.consumption_bytes_sha256 ||
    journal.journal_id !== input.journalId ||
    journal.consumption_relative_path !==
      `consumptions/${journal.authorization_id}.json` ||
    journal.root_configuration_sha256 !== configuration.configuration_sha256 ||
    journal.export_root_identity !== configuration.export_root.identity ||
    journal.export_state_root_identity !==
      configuration.export_state_root.identity
  )
    return result(timestamp, "recovery_required", [
      "export_journal_integrity_invalid",
    ]);
  const consumptionPath = join(stateRoot, journal.consumption_relative_path);
  let visibleConsumption: string | null;
  try {
    visibleConsumption = await readExactVisibleBytes(consumptionPath);
  } catch {
    return result(timestamp, "recovery_required", [
      "authorization_consumption_integrity_invalid",
    ]);
  }
  if (visibleConsumption === null && journal.stage === "prepared")
    return result(
      timestamp,
      "recovery_required",
      ["safe_abort_before_consumption"],
      undefined,
      undefined,
    );
  if (
    visibleConsumption === null ||
    visibleConsumption !== journal.consumption_json
  )
    return result(
      timestamp,
      "recovery_required",
      [
        visibleConsumption === null
          ? "authorization_consumption_missing"
          : "authorization_consumption_divergent",
      ],
      undefined,
      undefined,
      undefined,
      { consumed: visibleConsumption !== null },
    );
  let parsedConsumption: unknown;
  try {
    parsedConsumption = JSON.parse(journal.consumption_json) as unknown;
  } catch {
    return result(timestamp, "recovery_required", [
      "authorization_consumption_integrity_invalid",
    ]);
  }
  const expectedConsumptionWithoutHash = {
    schema_version: "1.0.0",
    consumption_type: "arca_export_authorization_consumption",
    consumption_id: `arca-export-consumption--${journal.export_attempt_id.replace(
      "arca-export-attempt--",
      "",
    )}`,
    consumption_sha256: "0".repeat(64),
    proposal_id: journal.proposal_id,
    proposal_sha256: journal.proposal_sha256,
    authorization_id: journal.authorization_id,
    authorization_sha256: journal.authorization_sha256,
    approved_artifact_id: journal.approved_artifact_id,
    approved_artifact_sha256: journal.approved_artifact_sha256,
    durable_store_event_id: journal.durable_store_event_id,
    durable_store_event_sha256: journal.durable_store_event_sha256,
    package_id: journal.package_id,
    package_sha256: journal.package_sha256,
    export_attempt_id: journal.export_attempt_id,
    consumed_at: journal.created_at,
  };
  const expectedConsumption = {
    ...expectedConsumptionWithoutHash,
    consumption_sha256: domainHash(
      "vlatam-ai-lab/arca-export-consumption-record/v1",
      without(expectedConsumptionWithoutHash, "consumption_sha256"),
    ),
  };
  if (
    canonicalBytes(parsedConsumption) !== journal.consumption_json ||
    canonicalizeReviewJson(parsedConsumption) !==
      canonicalizeReviewJson(expectedConsumption)
  )
    return result(timestamp, "recovery_required", [
      "authorization_consumption_integrity_invalid",
    ]);
  let parsedPackage: GovernedArcaExportPackage;
  try {
    parsedPackage = JSON.parse(
      journal.package_json,
    ) as GovernedArcaExportPackage;
  } catch {
    return result(timestamp, "recovery_required", ["journal_package_invalid"]);
  }
  if (
    !validatePackage(parsedPackage) ||
    parsedPackage.package_sha256 !== journal.package_sha256 ||
    parsedPackage.package_id !== journal.package_id ||
    parsedPackage.package_sha256 !==
      computeArcaExportPackageSha256(parsedPackage)
  )
    return result(timestamp, "recovery_required", ["journal_package_invalid"]);
  let parsedRecord: DurableArcaExportRecord;
  try {
    parsedRecord = JSON.parse(journal.record_json) as DurableArcaExportRecord;
  } catch {
    return result(timestamp, "recovery_required", ["journal_record_invalid"]);
  }
  if (
    canonicalBytes(parsedRecord) !== journal.record_json ||
    !validateRecord(parsedRecord) ||
    parsedRecord.record_sha256 !== computeRecordSha256(parsedRecord) ||
    parsedRecord.proposal_id !== journal.proposal_id ||
    parsedRecord.proposal_sha256 !== journal.proposal_sha256 ||
    parsedRecord.authorization_id !== journal.authorization_id ||
    parsedRecord.authorization_sha256 !== journal.authorization_sha256 ||
    parsedRecord.approved_artifact_id !== journal.approved_artifact_id ||
    parsedRecord.approved_artifact_sha256 !==
      journal.approved_artifact_sha256 ||
    parsedRecord.durable_store_event_id !== journal.durable_store_event_id ||
    parsedRecord.durable_store_event_sha256 !==
      journal.durable_store_event_sha256 ||
    parsedRecord.export_attempt_id !== journal.export_attempt_id ||
    parsedRecord.package_id !== journal.package_id ||
    parsedRecord.package_sha256 !== journal.package_sha256 ||
    parsedRecord.package_bytes_sha256 !== journal.package_bytes_sha256
  )
    return result(timestamp, "recovery_required", ["journal_record_invalid"]);
  const packagePath = join(
    exportRoot,
    "packages",
    `${journal.package_id}.json`,
  );
  let visiblePackage: string | null;
  try {
    visiblePackage = await readExactVisibleBytes(packagePath);
  } catch {
    return result(timestamp, "package_collision", [
      "recovery_package_visible_file_invalid",
    ]);
  }
  if (visiblePackage !== null && visiblePackage !== journal.package_json)
    return result(
      timestamp,
      "package_collision",
      ["recovery_package_divergent"],
      undefined,
      undefined,
      parsedPackage,
      { consumed: true },
    );
  if (
    journal.kill_switch_path !== resolve(input.killSwitchPath) ||
    !isReviewedDisabledExportSwitch(input.killSwitch) ||
    input.killSwitch.kill_switch_sha256 !== journal.kill_switch_sha256 ||
    !(await rereadExactReviewedDisabledSwitch(
      input.killSwitch,
      input.killSwitchPath,
    ))
  )
    return result(
      timestamp,
      "kill_switch_active",
      ["recovery_kill_switch_missing_malformed_active_or_changed"],
      undefined,
      undefined,
      parsedPackage,
      { consumed: true, created: visiblePackage !== null },
    );
  if (
    visiblePackage === null &&
    !(await rereadExactReviewedDisabledSwitch(
      input.killSwitch,
      input.killSwitchPath,
    ))
  )
    return result(
      timestamp,
      "kill_switch_active",
      ["final_recovery_kill_switch_reread_blocked"],
      undefined,
      undefined,
      parsedPackage,
      { consumed: true },
    );
  const packageState =
    visiblePackage === null
      ? await publishNoOverwrite(packagePath, journal.package_json)
      : "same";
  if (packageState === "collision")
    return result(
      timestamp,
      "package_collision",
      ["recovery_package_divergent"],
      undefined,
      undefined,
      parsedPackage,
      { consumed: true },
    );
  const recordState = await publishNoOverwrite(
    join(stateRoot, "records", `${journal.package_id}.json`),
    journal.record_json,
  );
  if (recordState === "collision")
    return result(
      timestamp,
      "package_collision",
      ["recovery_record_divergent"],
      undefined,
      undefined,
      parsedPackage,
      { consumed: true, created: true },
    );
  journal = sealJournal({
    ...journal,
    stage: "completed",
    updated_at: timestamp,
  });
  await replace(path, canonicalBytes(journal));
  await rename(
    path,
    join(stateRoot, "completed-journals", `${journal.journal_id}.json`),
  );
  await syncDirectory(join(stateRoot, "completed-journals"));
  return result(
    timestamp,
    "completed",
    ["recovery_completed_exact_local_package_and_record"],
    undefined,
    undefined,
    parsedPackage,
    { consumed: true, created: true, recorded: true },
  );
}

export function arcaExportSchemaHashes(): Record<string, string> {
  return {
    proposal: domainHash(
      "vlatam-ai-lab/schema/v1",
      ARCA_EXPORT_PROPOSAL_SCHEMA,
    ),
    authorization: domainHash(
      "vlatam-ai-lab/schema/v1",
      ARCA_EXPORT_AUTHORIZATION_SCHEMA,
    ),
    package: domainHash("vlatam-ai-lab/schema/v1", ARCA_EXPORT_PACKAGE_SCHEMA),
    result: domainHash("vlatam-ai-lab/schema/v1", ARCA_EXPORT_RESULT_SCHEMA),
    record: domainHash(
      "vlatam-ai-lab/schema/v1",
      DURABLE_ARCA_EXPORT_RECORD_SCHEMA,
    ),
    journal: domainHash("vlatam-ai-lab/schema/v1", ARCA_EXPORT_JOURNAL_SCHEMA),
    kill_switch: domainHash(
      "vlatam-ai-lab/schema/v1",
      ARCA_EXPORT_KILL_SWITCH_SCHEMA,
    ),
    root_configuration: domainHash(
      "vlatam-ai-lab/schema/v1",
      ARCA_EXPORT_ROOT_CONFIGURATION_SCHEMA,
    ),
  };
}

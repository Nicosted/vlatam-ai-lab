import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
} from "node:fs/promises";
import {
  basename,
  dirname,
  join,
  parse,
  relative,
  resolve,
  sep,
} from "node:path";

import { Ajv2020 as Ajv } from "ajv/dist/2020.js";

import {
  validateApprovedArcaArtifact,
  type ApprovedArcaArtifact,
} from "../artifacts/approved-arca-artifact-builder.js";
import {
  validateGovernedArcaCandidate,
  type GovernedArcaCandidateArtifact,
} from "../ingestion/governed-arca-acquired-source.js";
import {
  computeGovernedArcaCandidateArtifactId,
  computeGovernedArcaCandidateSha256,
  computeGovernedArcaReviewSha256,
  evaluateGovernedArcaCandidateReview,
  validateGovernedArcaCandidateReviewEvaluation,
  type GovernedArcaCandidateReview,
  type GovernedArcaCandidateReviewEvaluation,
} from "../review/governed-arca-candidate-review.js";
import { canonicalizeReviewJson } from "../review/review-artifact-binding.js";

export const DURABLE_ARCA_STORE_COMMAND_VERSION = "1.0.0" as const;
export const DURABLE_ARCA_STORE_EVENT_VERSION = "1.0.0" as const;
export const DURABLE_ARCA_STORE_PROJECTION_VERSION = "1.0.0" as const;
export const DURABLE_ARCA_STORE_RESULT_VERSION = "1.0.0" as const;
export const DURABLE_ARCA_STORE_IMPLEMENTATION_VERSION = "1.0.0" as const;
export const DURABLE_ARCA_STORE_SERVICE_IDENTITY =
  "service:durable-arca-store@1.0.0" as const;

export const DURABLE_ARCA_STORE_LAYOUT = {
  layout_version: "1.0.0",
  canonicalization_version: "review-json-v1",
  directories: {
    candidates: "candidates",
    reviews: "reviews",
    evaluations: "evaluations",
    approved_artifacts: "approved-artifacts",
    events: "events",
    workflow_projections: "projections/arca-workflows",
  },
  filename_encoding: "validated-identity-plus-json",
  event_ordering: "twelve-digit-sequence-then-event-id",
  upstream_model: "upstream-record-must-already-exist",
} as const;

const SHA256 = "^[a-f0-9]{64}$";
const TIMESTAMP =
  "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$";
const ACTOR =
  "^(?:human:[a-z0-9][a-z0-9._@-]*|service:durable-arca-store@1\\.0\\.0)$";
const EVENT_HASH_DOMAIN = "vlatam-ai-lab/durable-arca-store-event/v1";
const CONFIG_HASH_DOMAIN = "vlatam-ai-lab/durable-arca-store-configuration/v1";
const PROJECTION_HASH_DOMAIN =
  "vlatam-ai-lab/durable-arca-workflow-projection/v1";

function domainHash(domain: string, value: unknown): string {
  return createHash("sha256")
    .update(domain)
    .update("\n")
    .update(canonicalizeReviewJson(value))
    .digest("hex");
}

export const DURABLE_ARCA_STORE_CONFIGURATION_SHA256 = domainHash(
  CONFIG_HASH_DOMAIN,
  {
    implementation_version: DURABLE_ARCA_STORE_IMPLEMENTATION_VERSION,
    layout: DURABLE_ARCA_STORE_LAYOUT,
    contracts: {
      command: DURABLE_ARCA_STORE_COMMAND_VERSION,
      event: DURABLE_ARCA_STORE_EVENT_VERSION,
      projection: DURABLE_ARCA_STORE_PROJECTION_VERSION,
      result: DURABLE_ARCA_STORE_RESULT_VERSION,
    },
  },
);

export type DurableArcaStoreOperation =
  | "record_candidate"
  | "record_review"
  | "record_evaluation"
  | "record_approved_artifact"
  | "rebuild_projection"
  | "verify_store";

export interface DurableArcaStoreCommand {
  readonly schema_version: "1.0.0";
  readonly operation: DurableArcaStoreOperation;
  readonly actor_identity: string;
  readonly event_timestamp: string;
  readonly candidate_id: string | null;
  readonly governed_record: unknown | null;
  readonly export_authorized: false;
  readonly publication_authorized: false;
  readonly production_authorized: false;
  readonly network_authorized: false;
  readonly database_authorized: false;
  readonly scheduler_authorized: false;
  readonly deployment_authorized: false;
  readonly vlatam_global_access_authorized: false;
}

export interface DurableArcaStoreAuditEvent {
  readonly schema_version: "1.0.0";
  readonly event_type: "durable_arca_store_audit_event";
  readonly event_id: string;
  readonly event_sha256: string;
  readonly event_timestamp: string;
  readonly sequence: number;
  readonly operation: Exclude<DurableArcaStoreOperation, "verify_store">;
  readonly actor_identity: string;
  readonly candidate_id: string;
  readonly candidate_sha256: string;
  readonly review_id: string | null;
  readonly review_sha256: string | null;
  readonly evaluation_id: string | null;
  readonly evaluation_sha256: string | null;
  readonly approved_artifact_id: string | null;
  readonly approved_artifact_sha256: string | null;
  readonly previous_event_id: string | null;
  readonly previous_event_sha256: string | null;
  readonly store_configuration_sha256: string;
  readonly outcome: "recorded" | "projection_rebuilt";
  readonly export_authorized: false;
  readonly publication_authorized: false;
  readonly production_authorized: false;
  readonly network_authorized: false;
  readonly database_authorized: false;
  readonly scheduler_authorized: false;
  readonly deployment_authorized: false;
  readonly vlatam_global_access_authorized: false;
}

export interface DurableArcaWorkflowProjection {
  readonly schema_version: "1.0.0";
  readonly projection_type: "durable_arca_workflow_projection";
  readonly projection_sha256: string;
  readonly candidate_id: string;
  readonly candidate_sha256: string;
  readonly candidate_persisted: boolean;
  readonly review: {
    readonly persisted: boolean;
    readonly lifecycle: GovernedArcaCandidateReview["lifecycle"] | null;
    readonly review_id: string | null;
    readonly review_sha256: string | null;
  };
  readonly evaluation: {
    readonly persisted: boolean;
    readonly outcome: GovernedArcaCandidateReviewEvaluation["outcome"] | null;
    readonly evaluation_id: string | null;
    readonly evaluation_sha256: string | null;
  };
  readonly approved_artifact: {
    readonly persisted: boolean;
    readonly approved_artifact_id: string | null;
    readonly approved_artifact_sha256: string | null;
  };
  readonly latest_event_id: string;
  readonly latest_event_sha256: string;
  readonly event_count: number;
  readonly integrity_status: "verified";
  readonly authoritative_over_records: false;
  readonly export_status: "not_exported";
  readonly publication_status: "not_published";
  readonly production_status: "not_authorized";
  readonly export_authorized: false;
  readonly publication_authorized: false;
  readonly production_authorized: false;
  readonly network_authorized: false;
  readonly database_authorized: false;
  readonly scheduler_authorized: false;
  readonly deployment_authorized: false;
  readonly vlatam_global_access_authorized: false;
}

export type DurableArcaStoreOutcome =
  | "recorded"
  | "duplicate_unchanged"
  | "projection_rebuilt"
  | "store_verified"
  | "invalid_command"
  | "invalid_record"
  | "binding_mismatch"
  | "orphan_record"
  | "identity_collision"
  | "unsafe_store_root"
  | "store_busy"
  | "integrity_invalid"
  | "publication_failed";

export interface DurableArcaStoreOperationResult {
  readonly schema_version: "1.0.0";
  readonly result_type: "durable_arca_store_operation_result";
  readonly operation: DurableArcaStoreOperation;
  readonly outcome: DurableArcaStoreOutcome;
  readonly success: boolean;
  readonly idempotent: boolean;
  readonly record_created: boolean;
  readonly event_created: boolean;
  readonly projection_rebuilt: boolean;
  readonly event_id: string | null;
  readonly event_sha256: string | null;
  readonly details: readonly string[];
  readonly export_authorized: false;
  readonly publication_authorized: false;
  readonly production_authorized: false;
  readonly network_authorized: false;
  readonly database_authorized: false;
  readonly scheduler_authorized: false;
  readonly deployment_authorized: false;
  readonly vlatam_global_access_authorized: false;
}

const OPERATIONS: readonly DurableArcaStoreOperation[] = [
  "record_candidate",
  "record_review",
  "record_evaluation",
  "record_approved_artifact",
  "rebuild_projection",
  "verify_store",
];

const FALSE_AUTHORITIES = {
  export_authorized: { const: false },
  publication_authorized: { const: false },
  production_authorized: { const: false },
  network_authorized: { const: false },
  database_authorized: { const: false },
  scheduler_authorized: { const: false },
  deployment_authorized: { const: false },
  vlatam_global_access_authorized: { const: false },
} as const;
const AUTHORITY_KEYS = Object.keys(FALSE_AUTHORITIES);

export const DURABLE_ARCA_STORE_COMMAND_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/durable-arca-store-command.schema.json",
  title: "Durable ARCA store command",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "operation",
    "actor_identity",
    "event_timestamp",
    "candidate_id",
    "governed_record",
    ...AUTHORITY_KEYS,
  ],
  properties: {
    schema_version: { const: DURABLE_ARCA_STORE_COMMAND_VERSION },
    operation: { enum: OPERATIONS },
    actor_identity: { type: "string", pattern: ACTOR },
    event_timestamp: { type: "string", pattern: TIMESTAMP },
    candidate_id: {
      anyOf: [
        { type: "null" },
        { type: "string", pattern: "^arca-candidate--[a-f0-9]{64}$" },
      ],
    },
    governed_record: {},
    ...FALSE_AUTHORITIES,
  },
} as const;

export const DURABLE_ARCA_STORE_EVENT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/durable-arca-store-audit-event.schema.json",
  title: "Durable ARCA append-only audit event",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "event_type",
    "event_id",
    "event_sha256",
    "event_timestamp",
    "sequence",
    "operation",
    "actor_identity",
    "candidate_id",
    "candidate_sha256",
    "review_id",
    "review_sha256",
    "evaluation_id",
    "evaluation_sha256",
    "approved_artifact_id",
    "approved_artifact_sha256",
    "previous_event_id",
    "previous_event_sha256",
    "store_configuration_sha256",
    "outcome",
    ...AUTHORITY_KEYS,
  ],
  properties: {
    schema_version: { const: DURABLE_ARCA_STORE_EVENT_VERSION },
    event_type: { const: "durable_arca_store_audit_event" },
    event_id: { type: "string", pattern: "^arca-store-event--[a-f0-9]{64}$" },
    event_sha256: { type: "string", pattern: SHA256 },
    event_timestamp: { type: "string", pattern: TIMESTAMP },
    sequence: { type: "integer", minimum: 1 },
    operation: { enum: OPERATIONS.filter((value) => value !== "verify_store") },
    actor_identity: { type: "string", pattern: ACTOR },
    candidate_id: { type: "string", pattern: "^arca-candidate--[a-f0-9]{64}$" },
    candidate_sha256: { type: "string", pattern: SHA256 },
    review_id: {
      anyOf: [
        { type: "null" },
        { type: "string", pattern: "^arca-review--[a-f0-9]{64}$" },
      ],
    },
    review_sha256: {
      anyOf: [{ type: "null" }, { type: "string", pattern: SHA256 }],
    },
    evaluation_id: {
      anyOf: [
        { type: "null" },
        { type: "string", pattern: "^arca-review-evaluation--[a-f0-9]{64}$" },
      ],
    },
    evaluation_sha256: {
      anyOf: [{ type: "null" }, { type: "string", pattern: SHA256 }],
    },
    approved_artifact_id: {
      anyOf: [
        { type: "null" },
        { type: "string", pattern: "^approved-arca-artifact--[a-f0-9]{64}$" },
      ],
    },
    approved_artifact_sha256: {
      anyOf: [{ type: "null" }, { type: "string", pattern: SHA256 }],
    },
    previous_event_id: {
      anyOf: [
        { type: "null" },
        { type: "string", pattern: "^arca-store-event--[a-f0-9]{64}$" },
      ],
    },
    previous_event_sha256: {
      anyOf: [{ type: "null" }, { type: "string", pattern: SHA256 }],
    },
    store_configuration_sha256: {
      const: DURABLE_ARCA_STORE_CONFIGURATION_SHA256,
    },
    outcome: { enum: ["recorded", "projection_rebuilt"] },
    ...FALSE_AUTHORITIES,
  },
} as const;

export const DURABLE_ARCA_STORE_PROJECTION_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/durable-arca-workflow-projection.schema.json",
  title: "Durable ARCA workflow read projection",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "projection_type",
    "projection_sha256",
    "candidate_id",
    "candidate_sha256",
    "candidate_persisted",
    "review",
    "evaluation",
    "approved_artifact",
    "latest_event_id",
    "latest_event_sha256",
    "event_count",
    "integrity_status",
    "authoritative_over_records",
    "export_status",
    "publication_status",
    "production_status",
    ...AUTHORITY_KEYS,
  ],
  properties: {
    schema_version: { const: DURABLE_ARCA_STORE_PROJECTION_VERSION },
    projection_type: { const: "durable_arca_workflow_projection" },
    projection_sha256: { type: "string", pattern: SHA256 },
    candidate_id: { type: "string", pattern: "^arca-candidate--[a-f0-9]{64}$" },
    candidate_sha256: { type: "string", pattern: SHA256 },
    candidate_persisted: { const: true },
    review: {
      type: "object",
      additionalProperties: false,
      required: ["persisted", "lifecycle", "review_id", "review_sha256"],
      properties: {
        persisted: { type: "boolean" },
        lifecycle: {
          enum: [
            null,
            "pending",
            "approved",
            "rejected",
            "expired",
            "superseded",
          ],
        },
        review_id: {
          anyOf: [
            { type: "null" },
            { type: "string", pattern: "^arca-review--[a-f0-9]{64}$" },
          ],
        },
        review_sha256: {
          anyOf: [{ type: "null" }, { type: "string", pattern: SHA256 }],
        },
      },
    },
    evaluation: {
      type: "object",
      additionalProperties: false,
      required: ["persisted", "outcome", "evaluation_id", "evaluation_sha256"],
      properties: {
        persisted: { type: "boolean" },
        outcome: {
          enum: [
            null,
            "invalid_review",
            "invalid_candidate",
            "candidate_binding_mismatch",
            "pending_human_review",
            "rejected",
            "expired",
            "superseded",
            "eligible_for_approved_artifact_building",
          ],
        },
        evaluation_id: {
          anyOf: [
            { type: "null" },
            {
              type: "string",
              pattern: "^arca-review-evaluation--[a-f0-9]{64}$",
            },
          ],
        },
        evaluation_sha256: {
          anyOf: [{ type: "null" }, { type: "string", pattern: SHA256 }],
        },
      },
    },
    approved_artifact: {
      type: "object",
      additionalProperties: false,
      required: [
        "persisted",
        "approved_artifact_id",
        "approved_artifact_sha256",
      ],
      properties: {
        persisted: { type: "boolean" },
        approved_artifact_id: {
          anyOf: [
            { type: "null" },
            {
              type: "string",
              pattern: "^approved-arca-artifact--[a-f0-9]{64}$",
            },
          ],
        },
        approved_artifact_sha256: {
          anyOf: [{ type: "null" }, { type: "string", pattern: SHA256 }],
        },
      },
    },
    latest_event_id: {
      type: "string",
      pattern: "^arca-store-event--[a-f0-9]{64}$",
    },
    latest_event_sha256: { type: "string", pattern: SHA256 },
    event_count: { type: "integer", minimum: 1 },
    integrity_status: { const: "verified" },
    authoritative_over_records: { const: false },
    export_status: { const: "not_exported" },
    publication_status: { const: "not_published" },
    production_status: { const: "not_authorized" },
    ...FALSE_AUTHORITIES,
  },
} as const;

export const DURABLE_ARCA_STORE_RESULT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vlatam.local/durable-arca-store-operation-result.schema.json",
  title: "Durable ARCA store operation result",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "result_type",
    "operation",
    "outcome",
    "success",
    "idempotent",
    "record_created",
    "event_created",
    "projection_rebuilt",
    "event_id",
    "event_sha256",
    "details",
    ...AUTHORITY_KEYS,
  ],
  properties: {
    schema_version: { const: DURABLE_ARCA_STORE_RESULT_VERSION },
    result_type: { const: "durable_arca_store_operation_result" },
    operation: { enum: OPERATIONS },
    outcome: {
      enum: [
        "recorded",
        "duplicate_unchanged",
        "projection_rebuilt",
        "store_verified",
        "invalid_command",
        "invalid_record",
        "binding_mismatch",
        "orphan_record",
        "identity_collision",
        "unsafe_store_root",
        "store_busy",
        "integrity_invalid",
        "publication_failed",
      ],
    },
    success: { type: "boolean" },
    idempotent: { type: "boolean" },
    record_created: { type: "boolean" },
    event_created: { type: "boolean" },
    projection_rebuilt: { type: "boolean" },
    event_id: {
      anyOf: [
        { type: "null" },
        { type: "string", pattern: "^arca-store-event--[a-f0-9]{64}$" },
      ],
    },
    event_sha256: {
      anyOf: [{ type: "null" }, { type: "string", pattern: SHA256 }],
    },
    details: { type: "array", items: { type: "string" } },
    ...FALSE_AUTHORITIES,
  },
} as const;

const ajv = new Ajv({ allErrors: true, strict: true });
const validateCommandSchema = ajv.compile(DURABLE_ARCA_STORE_COMMAND_SCHEMA);
const validateEventSchema = ajv.compile(DURABLE_ARCA_STORE_EVENT_SCHEMA);
const validateProjectionSchema = ajv.compile(
  DURABLE_ARCA_STORE_PROJECTION_SCHEMA,
);

function isCanonicalTimestamp(value: string): boolean {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function result(
  operation: DurableArcaStoreOperation,
  outcome: DurableArcaStoreOutcome,
  details: readonly string[] = [],
  event: DurableArcaStoreAuditEvent | null = null,
  flags: { idempotent?: boolean; record?: boolean; projection?: boolean } = {},
): DurableArcaStoreOperationResult {
  return {
    schema_version: DURABLE_ARCA_STORE_RESULT_VERSION,
    result_type: "durable_arca_store_operation_result",
    operation,
    outcome,
    success: [
      "recorded",
      "duplicate_unchanged",
      "projection_rebuilt",
      "store_verified",
    ].includes(outcome),
    idempotent: flags.idempotent ?? false,
    record_created: flags.record ?? false,
    event_created: event !== null,
    projection_rebuilt: flags.projection ?? false,
    event_id: event?.event_id ?? null,
    event_sha256: event?.event_sha256 ?? null,
    details,
    export_authorized: false,
    publication_authorized: false,
    production_authorized: false,
    network_authorized: false,
    database_authorized: false,
    scheduler_authorized: false,
    deployment_authorized: false,
    vlatam_global_access_authorized: false,
  };
}

function eventHashPayload(
  event:
    | Omit<DurableArcaStoreAuditEvent, "event_id" | "event_sha256">
    | DurableArcaStoreAuditEvent,
): unknown {
  const payload = structuredClone(event) as Record<string, unknown>;
  delete payload["event_id"];
  delete payload["event_sha256"];
  return payload;
}

export function computeDurableArcaStoreEventSha256(
  event:
    | Omit<DurableArcaStoreAuditEvent, "event_id" | "event_sha256">
    | DurableArcaStoreAuditEvent,
): string {
  return domainHash(EVENT_HASH_DOMAIN, eventHashPayload(event));
}

function projectionHashPayload(
  projection:
    | Omit<DurableArcaWorkflowProjection, "projection_sha256">
    | DurableArcaWorkflowProjection,
): unknown {
  const payload = structuredClone(projection) as Record<string, unknown>;
  delete payload["projection_sha256"];
  return payload;
}

export function computeDurableArcaProjectionSha256(
  projection:
    | Omit<DurableArcaWorkflowProjection, "projection_sha256">
    | DurableArcaWorkflowProjection,
): string {
  return domainHash(PROJECTION_HASH_DOMAIN, projectionHashPayload(projection));
}

function recordBytes(value: unknown): string {
  // Preserve the authoritative AI-126 parsed-output JSON byte convention.
  // Identity hashes remain canonical and domain-separated; persisted bytes are
  // compared exactly for idempotency and collision detection.
  return `${JSON.stringify(value)}\n`;
}

function isFsError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

async function validateConfiguredRoot(root: string): Promise<string> {
  if (!root.trim()) throw new Error("unsafe_store_root");
  const resolvedRoot = resolve(root);
  const filesystemRoot = parse(resolvedRoot).root;
  const components = relative(filesystemRoot, resolvedRoot)
    .split(sep)
    .filter(Boolean);
  let current = filesystemRoot;
  for (const component of components) {
    current = join(current, component);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory())
        throw new Error("unsafe_store_root");
    } catch (error: unknown) {
      if (isFsError(error, "ENOENT")) break;
      throw error;
    }
  }
  return resolvedRoot;
}

async function initializeRoot(root: string): Promise<string> {
  const resolvedRoot = await validateConfiguredRoot(root);
  await mkdir(resolvedRoot, { recursive: true });
  await validateConfiguredRoot(resolvedRoot);
  for (const directory of Object.values(
    DURABLE_ARCA_STORE_LAYOUT.directories,
  )) {
    const target = join(resolvedRoot, directory);
    await mkdir(target, { recursive: true });
    const stat = await lstat(target);
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw new Error("unsafe_store_root");
  }
  return resolvedRoot;
}

function assertDerivedPath(root: string, target: string): void {
  const rel = relative(root, target);
  if (
    !rel ||
    rel === ".." ||
    rel.startsWith(`..${sep}`) ||
    resolve(root, rel) !== target
  )
    throw new Error("unsafe_store_root");
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function publishImmutable(
  root: string,
  target: string,
  bytes: string,
): Promise<"created" | "same" | "collision"> {
  assertDerivedPath(root, target);
  const parent = dirname(target);
  const parentStat = await lstat(parent);
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory())
    throw new Error("unsafe_store_root");
  try {
    const targetStat = await lstat(target);
    if (targetStat.isSymbolicLink() || !targetStat.isFile())
      throw new Error("unsafe_store_root");
    const existing = await readFile(target, "utf8");
    return existing === bytes ? "same" : "collision";
  } catch (error: unknown) {
    if (!isFsError(error, "ENOENT")) throw error;
  }
  const staging = join(parent, `.staging-${randomUUID()}`);
  try {
    const handle = await open(staging, "wx", 0o600);
    try {
      await handle.writeFile(bytes, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await link(staging, target);
    } catch (error: unknown) {
      if (!isFsError(error, "EEXIST")) throw error;
      const targetStat = await lstat(target);
      if (targetStat.isSymbolicLink() || !targetStat.isFile())
        throw new Error("unsafe_store_root");
      const existing = await readFile(target, "utf8");
      return existing === bytes ? "same" : "collision";
    }
    await syncDirectory(parent);
    return "created";
  } finally {
    await rm(staging, { force: true });
  }
}

async function publishProjection(
  root: string,
  target: string,
  bytes: string,
): Promise<void> {
  assertDerivedPath(root, target);
  const parent = dirname(target);
  try {
    const targetStat = await lstat(target);
    if (targetStat.isSymbolicLink() || !targetStat.isFile())
      throw new Error("unsafe_store_root");
  } catch (error: unknown) {
    if (!isFsError(error, "ENOENT")) throw error;
  }
  const staging = join(parent, `.staging-${randomUUID()}`);
  try {
    const handle = await open(staging, "wx", 0o600);
    try {
      await handle.writeFile(bytes, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(staging, target);
    await syncDirectory(parent);
  } finally {
    await rm(staging, { force: true });
  }
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

interface VerifiedChain {
  readonly events: readonly DurableArcaStoreAuditEvent[];
}

async function verifyEventChain(root: string): Promise<VerifiedChain> {
  const eventRoot = join(root, DURABLE_ARCA_STORE_LAYOUT.directories.events);
  const entries = await readdir(eventRoot);
  if (entries.some((name) => !name.endsWith(".json")))
    throw new Error("unexpected_event_entry");
  const names = entries.sort();
  const events: DurableArcaStoreAuditEvent[] = [];
  let prior: DurableArcaStoreAuditEvent | null = null;
  for (const [index, name] of names.entries()) {
    if (!/^\d{12}--arca-store-event--[a-f0-9]{64}\.json$/.test(name))
      throw new Error("invalid_event_filename");
    const event = await readJson(join(eventRoot, name));
    if (!validateEventSchema(event))
      throw new Error(
        `invalid_event_schema:${ajv.errorsText(validateEventSchema.errors)}`,
      );
    const typed = event as unknown as DurableArcaStoreAuditEvent;
    const expectedSequence = index + 1;
    const expectedHash = computeDurableArcaStoreEventSha256(typed);
    if (
      typed.sequence !== expectedSequence ||
      !name.startsWith(`${String(expectedSequence).padStart(12, "0")}--`)
    )
      throw new Error("event_sequence_invalid");
    if (
      typed.event_sha256 !== expectedHash ||
      typed.event_id !== `arca-store-event--${expectedHash}` ||
      !name.endsWith(`${typed.event_id}.json`)
    )
      throw new Error("event_identity_invalid");
    if (
      (typed.previous_event_id ?? null) !== (prior?.event_id ?? null) ||
      (typed.previous_event_sha256 ?? null) !== (prior?.event_sha256 ?? null)
    )
      throw new Error("event_prior_binding_invalid");
    if (!isCanonicalTimestamp(typed.event_timestamp))
      throw new Error("event_timestamp_invalid");
    events.push(typed);
    prior = typed;
  }
  return { events };
}

async function assertNoOrphanRecords(
  root: string,
  events: readonly DurableArcaStoreAuditEvent[],
): Promise<void> {
  const expected = {
    candidates: new Set(events.map((event) => event.candidate_id)),
    reviews: new Set(
      events.flatMap((event) => (event.review_id ? [event.review_id] : [])),
    ),
    evaluations: new Set(
      events.flatMap((event) =>
        event.evaluation_id ? [event.evaluation_id] : [],
      ),
    ),
    approved_artifacts: new Set(
      events.flatMap((event) =>
        event.approved_artifact_id ? [event.approved_artifact_id] : [],
      ),
    ),
  };
  const checks: ReadonlyArray<[string, ReadonlySet<string>]> = [
    [DURABLE_ARCA_STORE_LAYOUT.directories.candidates, expected.candidates],
    [DURABLE_ARCA_STORE_LAYOUT.directories.reviews, expected.reviews],
    [DURABLE_ARCA_STORE_LAYOUT.directories.evaluations, expected.evaluations],
    [
      DURABLE_ARCA_STORE_LAYOUT.directories.approved_artifacts,
      expected.approved_artifacts,
    ],
  ];
  for (const [directory, identities] of checks) {
    const entries = await readdir(join(root, directory));
    if (entries.some((name) => !name.endsWith(".json")))
      throw new Error("unexpected_record_entry");
    const actual = entries.map((name) => name.slice(0, -5));
    if (
      actual.length !== identities.size ||
      actual.some((identity) => !identities.has(identity))
    )
      throw new Error("orphan_record_detected");
  }
}

async function assertProjectionSet(
  root: string,
  candidateIds: readonly string[],
): Promise<void> {
  const entries = await readdir(
    join(root, DURABLE_ARCA_STORE_LAYOUT.directories.workflow_projections),
  );
  if (entries.some((name) => !name.endsWith(".json")))
    throw new Error("unexpected_projection_entry");
  const actual = new Set(entries.map((name) => name.slice(0, -5)));
  if (
    actual.size !== candidateIds.length ||
    candidateIds.some((candidateId) => !actual.has(candidateId))
  )
    throw new Error("projection_set_invalid");
}

function candidatePath(root: string, id: string): string {
  return join(
    root,
    DURABLE_ARCA_STORE_LAYOUT.directories.candidates,
    `${id}.json`,
  );
}
function reviewPath(root: string, id: string): string {
  return join(
    root,
    DURABLE_ARCA_STORE_LAYOUT.directories.reviews,
    `${id}.json`,
  );
}
function evaluationPath(root: string, id: string): string {
  return join(
    root,
    DURABLE_ARCA_STORE_LAYOUT.directories.evaluations,
    `${id}.json`,
  );
}
function artifactPath(root: string, id: string): string {
  return join(
    root,
    DURABLE_ARCA_STORE_LAYOUT.directories.approved_artifacts,
    `${id}.json`,
  );
}
function projectionPath(root: string, id: string): string {
  return join(
    root,
    DURABLE_ARCA_STORE_LAYOUT.directories.workflow_projections,
    `${id}.json`,
  );
}

async function requireJson(path: string): Promise<unknown> {
  try {
    return await readJson(path);
  } catch (error: unknown) {
    if (isFsError(error, "ENOENT")) throw new Error("orphan_record");
    throw error;
  }
}

interface WorkflowRecords {
  candidate: GovernedArcaCandidateArtifact;
  review: GovernedArcaCandidateReview | null;
  evaluation: GovernedArcaCandidateReviewEvaluation | null;
  artifact: ApprovedArcaArtifact | null;
}

async function loadWorkflow(
  root: string,
  candidateId: string,
): Promise<WorkflowRecords> {
  const candidate = (await requireJson(
    candidatePath(root, candidateId),
  )) as GovernedArcaCandidateArtifact;
  const chain = await verifyEventChain(root);
  const related = chain.events.filter(
    (event) => event.candidate_id === candidateId,
  );
  const lastWith = <
    K extends "review_id" | "evaluation_id" | "approved_artifact_id",
  >(
    field: K,
  ): string | null => {
    for (let index = related.length - 1; index >= 0; index -= 1) {
      const value = related[index]?.[field];
      if (typeof value === "string") return value;
    }
    return null;
  };
  const reviewId = lastWith("review_id");
  const evaluationId = lastWith("evaluation_id");
  const artifactId = lastWith("approved_artifact_id");
  return {
    candidate,
    review: reviewId
      ? ((await requireJson(
          reviewPath(root, reviewId),
        )) as GovernedArcaCandidateReview)
      : null,
    evaluation: evaluationId
      ? ((await requireJson(
          evaluationPath(root, evaluationId),
        )) as GovernedArcaCandidateReviewEvaluation)
      : null,
    artifact: artifactId
      ? ((await requireJson(
          artifactPath(root, artifactId),
        )) as ApprovedArcaArtifact)
      : null,
  };
}

function makeProjection(
  records: WorkflowRecords,
  relatedEvents: readonly DurableArcaStoreAuditEvent[],
): DurableArcaWorkflowProjection {
  const candidateSha = computeGovernedArcaCandidateSha256(records.candidate);
  const last = relatedEvents.at(-1);
  if (!last) throw new Error("missing_candidate_event");
  const unsealed: Omit<DurableArcaWorkflowProjection, "projection_sha256"> = {
    schema_version: DURABLE_ARCA_STORE_PROJECTION_VERSION,
    projection_type: "durable_arca_workflow_projection",
    candidate_id: last.candidate_id,
    candidate_sha256: candidateSha,
    candidate_persisted: true,
    review: {
      persisted: records.review !== null,
      lifecycle: records.review?.lifecycle ?? null,
      review_id: records.review?.review_id ?? null,
      review_sha256: records.review?.review_sha256 ?? null,
    },
    evaluation: {
      persisted: records.evaluation !== null,
      outcome: records.evaluation?.outcome ?? null,
      evaluation_id: records.evaluation?.evaluation_id ?? null,
      evaluation_sha256: records.evaluation?.evaluation_sha256 ?? null,
    },
    approved_artifact: {
      persisted: records.artifact !== null,
      approved_artifact_id: records.artifact?.approved_artifact_id ?? null,
      approved_artifact_sha256:
        records.artifact?.approved_artifact_sha256 ?? null,
    },
    latest_event_id: last.event_id,
    latest_event_sha256: last.event_sha256,
    event_count: relatedEvents.length,
    integrity_status: "verified",
    authoritative_over_records: false,
    export_status: records.artifact?.export_status ?? "not_exported",
    publication_status: records.artifact?.publication_status ?? "not_published",
    production_status: "not_authorized",
    export_authorized: false,
    publication_authorized: false,
    production_authorized: false,
    network_authorized: false,
    database_authorized: false,
    scheduler_authorized: false,
    deployment_authorized: false,
    vlatam_global_access_authorized: false,
  };
  return {
    ...unsealed,
    projection_sha256: computeDurableArcaProjectionSha256(unsealed),
  };
}

async function rebuildOneProjection(
  root: string,
  candidateId: string,
): Promise<DurableArcaWorkflowProjection> {
  const chain = await verifyEventChain(root);
  const records = await loadWorkflow(root, candidateId);
  const projection = makeProjection(
    records,
    chain.events.filter((event) => event.candidate_id === candidateId),
  );
  await publishProjection(
    root,
    projectionPath(root, candidateId),
    recordBytes(projection),
  );
  return projection;
}

function makeEvent(
  command: DurableArcaStoreCommand,
  sequence: number,
  prior: DurableArcaStoreAuditEvent | null,
  bindings: Omit<
    DurableArcaStoreAuditEvent,
    | "schema_version"
    | "event_type"
    | "event_id"
    | "event_sha256"
    | "event_timestamp"
    | "sequence"
    | "operation"
    | "actor_identity"
    | "previous_event_id"
    | "previous_event_sha256"
    | "store_configuration_sha256"
    | "outcome"
    | keyof typeof NO_AUTHORITIES
  >,
  outcome: "recorded" | "projection_rebuilt",
): DurableArcaStoreAuditEvent {
  const unsealed = {
    schema_version: DURABLE_ARCA_STORE_EVENT_VERSION,
    event_type: "durable_arca_store_audit_event" as const,
    event_timestamp: command.event_timestamp,
    sequence,
    operation: command.operation as Exclude<
      DurableArcaStoreOperation,
      "verify_store"
    >,
    actor_identity: command.actor_identity,
    ...bindings,
    previous_event_id: prior?.event_id ?? null,
    previous_event_sha256: prior?.event_sha256 ?? null,
    store_configuration_sha256: DURABLE_ARCA_STORE_CONFIGURATION_SHA256,
    outcome,
    ...NO_AUTHORITIES,
  };
  const eventSha = computeDurableArcaStoreEventSha256(unsealed);
  return {
    ...unsealed,
    event_id: `arca-store-event--${eventSha}`,
    event_sha256: eventSha,
  };
}

const NO_AUTHORITIES = {
  export_authorized: false,
  publication_authorized: false,
  production_authorized: false,
  network_authorized: false,
  database_authorized: false,
  scheduler_authorized: false,
  deployment_authorized: false,
  vlatam_global_access_authorized: false,
} as const;

async function publishEvent(
  root: string,
  event: DurableArcaStoreAuditEvent,
): Promise<"created" | "same" | "collision"> {
  const name = `${String(event.sequence).padStart(12, "0")}--${event.event_id}.json`;
  return publishImmutable(
    root,
    join(root, DURABLE_ARCA_STORE_LAYOUT.directories.events, name),
    recordBytes(event),
  );
}

function bindingsFrom(
  records: WorkflowRecords,
): Pick<
  DurableArcaStoreAuditEvent,
  | "candidate_id"
  | "candidate_sha256"
  | "review_id"
  | "review_sha256"
  | "evaluation_id"
  | "evaluation_sha256"
  | "approved_artifact_id"
  | "approved_artifact_sha256"
> {
  const candidateSha = computeGovernedArcaCandidateSha256(records.candidate);
  return {
    candidate_id: computeGovernedArcaCandidateArtifactId(records.candidate),
    candidate_sha256: candidateSha,
    review_id: records.review?.review_id ?? null,
    review_sha256: records.review?.review_sha256 ?? null,
    evaluation_id: records.evaluation?.evaluation_id ?? null,
    evaluation_sha256: records.evaluation?.evaluation_sha256 ?? null,
    approved_artifact_id: records.artifact?.approved_artifact_id ?? null,
    approved_artifact_sha256:
      records.artifact?.approved_artifact_sha256 ?? null,
  };
}

async function assertReview(
  candidate: GovernedArcaCandidateArtifact,
  value: unknown,
  timestamp: string,
): Promise<GovernedArcaCandidateReview> {
  const review = value as GovernedArcaCandidateReview;
  const evaluation = evaluateGovernedArcaCandidateReview(
    candidate,
    value,
    timestamp,
  );
  if (
    [
      "invalid_review",
      "invalid_candidate",
      "candidate_binding_mismatch",
    ].includes(evaluation.outcome)
  )
    throw new Error(
      evaluation.outcome === "candidate_binding_mismatch"
        ? "binding_mismatch"
        : "invalid_record",
    );
  const expected = computeGovernedArcaReviewSha256(review);
  if (
    review.review_sha256 !== expected ||
    review.review_id !== `arca-review--${expected}`
  )
    throw new Error("invalid_record");
  return review;
}

async function acquireLock(root: string): Promise<string> {
  const lock = join(root, ".operation-lock");
  try {
    await mkdir(lock);
    return lock;
  } catch (error: unknown) {
    if (isFsError(error, "EEXIST")) {
      const stat = await lstat(lock);
      if (stat.isSymbolicLink() || !stat.isDirectory())
        throw new Error("unsafe_store_root");
      throw new Error("store_busy");
    }
    throw error;
  }
}

async function withLock<T>(root: string, action: () => Promise<T>): Promise<T> {
  const lock = await acquireLock(root);
  try {
    return await action();
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

async function validateProjection(
  root: string,
  candidateId: string,
  expected: DurableArcaWorkflowProjection,
): Promise<void> {
  const stored = (await requireJson(
    projectionPath(root, candidateId),
  )) as DurableArcaWorkflowProjection;
  if (
    !validateProjectionSchema(stored) ||
    recordBytes(stored) !== recordBytes(expected) ||
    stored.projection_sha256 !== computeDurableArcaProjectionSha256(stored)
  )
    throw new Error("projection_invalid");
}

export async function verifyDurableArcaStore(
  storeRoot: string,
): Promise<DurableArcaStoreOperationResult> {
  try {
    const root = await initializeRoot(storeRoot);
    return await withLock(root, async () => {
      const chain = await verifyEventChain(root);
      await assertNoOrphanRecords(root, chain.events);
      const candidateIds = [
        ...new Set(chain.events.map((event) => event.candidate_id)),
      ];
      await assertProjectionSet(root, candidateIds);
      for (const candidateId of candidateIds) {
        const records = await loadWorkflow(root, candidateId);
        if (
          !validateGovernedArcaCandidate(records.candidate).valid ||
          computeGovernedArcaCandidateArtifactId(records.candidate) !==
            candidateId
        )
          throw new Error("candidate_invalid");
        if (records.review)
          await assertReview(
            records.candidate,
            records.review,
            chain.events.find(
              (event) => event.review_id === records.review?.review_id,
            )?.event_timestamp ?? "",
          );
        if (records.evaluation) {
          if (
            !validateGovernedArcaCandidateReviewEvaluation(records.evaluation)
              .valid ||
            records.evaluation.candidate_artifact_id !== candidateId ||
            records.evaluation.review_id !== records.review?.review_id
          )
            throw new Error("evaluation_invalid");
        }
        if (records.artifact) {
          if (
            !validateApprovedArcaArtifact(records.artifact).valid ||
            records.artifact.candidate_binding.candidate_artifact_id !==
              candidateId ||
            records.artifact.review_binding.review_id !==
              records.review?.review_id ||
            records.artifact.evaluation_binding.evaluation_id !==
              records.evaluation?.evaluation_id
          )
            throw new Error("artifact_invalid");
        }
        const expected = makeProjection(
          records,
          chain.events.filter((event) => event.candidate_id === candidateId),
        );
        await validateProjection(root, candidateId, expected);
      }
      return result("verify_store", "store_verified", [
        `events:${chain.events.length}`,
        `workflows:${candidateIds.length}`,
      ]);
    });
  } catch (error: unknown) {
    const detail =
      error instanceof Error ? error.message : "unknown_integrity_error";
    return result(
      "verify_store",
      detail === "unsafe_store_root"
        ? "unsafe_store_root"
        : detail === "store_busy"
          ? "store_busy"
          : "integrity_invalid",
      [detail],
    );
  }
}

export async function executeDurableArcaStoreCommand(
  storeRoot: string,
  commandValue: unknown,
): Promise<DurableArcaStoreOperationResult> {
  const operation =
    typeof commandValue === "object" &&
    commandValue !== null &&
    "operation" in commandValue &&
    typeof commandValue.operation === "string" &&
    OPERATIONS.includes(commandValue.operation as DurableArcaStoreOperation)
      ? (commandValue.operation as DurableArcaStoreOperation)
      : "verify_store";
  if (!validateCommandSchema(commandValue))
    return result(operation, "invalid_command", [
      ajv.errorsText(validateCommandSchema.errors),
    ]);
  const command = commandValue as unknown as DurableArcaStoreCommand;
  if (!isCanonicalTimestamp(command.event_timestamp))
    return result(command.operation, "invalid_command", [
      "event_timestamp_not_canonical_utc",
    ]);
  if (command.operation === "verify_store")
    return verifyDurableArcaStore(storeRoot);
  try {
    const root = await initializeRoot(storeRoot);
    return await withLock(root, async () => {
      const chain = await verifyEventChain(root);
      const prior = chain.events.at(-1) ?? null;
      if (command.operation === "rebuild_projection") {
        if (!command.candidate_id || command.governed_record !== null)
          return result(command.operation, "invalid_command", [
            "rebuild_requires_candidate_id_only",
          ]);
        const records = await loadWorkflow(root, command.candidate_id);
        const event = makeEvent(
          command,
          chain.events.length + 1,
          prior,
          bindingsFrom(records),
          "projection_rebuilt",
        );
        const eventState = await publishEvent(root, event);
        if (eventState !== "created")
          return result(command.operation, "identity_collision", [
            "event_collision",
          ]);
        await rebuildOneProjection(root, command.candidate_id);
        return result(command.operation, "projection_rebuilt", [], event, {
          projection: true,
        });
      }
      if (command.candidate_id !== null || command.governed_record === null)
        return result(command.operation, "invalid_command", [
          "record_operation_requires_governed_record_only",
        ]);

      let records: WorkflowRecords;
      let target: string;
      const governed = command.governed_record;
      if (command.operation === "record_candidate") {
        const validation = validateGovernedArcaCandidate(governed);
        if (!validation.valid)
          return result(command.operation, "invalid_record", validation.errors);
        const candidate = governed as GovernedArcaCandidateArtifact;
        const id = computeGovernedArcaCandidateArtifactId(candidate);
        target = candidatePath(root, id);
        records = { candidate, review: null, evaluation: null, artifact: null };
      } else {
        const raw = governed as Record<string, unknown>;
        const candidateId =
          command.operation === "record_review"
            ? (
                raw["candidate_binding"] as Record<string, unknown> | undefined
              )?.["candidate_artifact_id"]
            : command.operation === "record_evaluation"
              ? raw["candidate_artifact_id"]
              : (
                  raw["candidate_binding"] as
                    | Record<string, unknown>
                    | undefined
                )?.["candidate_artifact_id"];
        if (typeof candidateId !== "string")
          return result(command.operation, "invalid_record", [
            "candidate_identity_missing",
          ]);
        const candidate = (await requireJson(
          candidatePath(root, candidateId),
        )) as GovernedArcaCandidateArtifact;
        if (command.operation === "record_review") {
          const review = await assertReview(
            candidate,
            governed,
            command.event_timestamp,
          );
          target = reviewPath(root, review.review_id);
          records = { candidate, review, evaluation: null, artifact: null };
        } else if (command.operation === "record_evaluation") {
          if (!validateGovernedArcaCandidateReviewEvaluation(governed).valid)
            return result(
              command.operation,
              "invalid_record",
              validateGovernedArcaCandidateReviewEvaluation(governed).errors,
            );
          const evaluation = governed as GovernedArcaCandidateReviewEvaluation;
          const review = (await requireJson(
            reviewPath(root, evaluation.review_id ?? ""),
          )) as GovernedArcaCandidateReview;
          await assertReview(candidate, review, evaluation.evaluated_at);
          if (
            evaluation.candidate_artifact_id !== candidateId ||
            evaluation.candidate_sha256 !==
              computeGovernedArcaCandidateSha256(candidate) ||
            evaluation.review_sha256 !== review.review_sha256
          )
            return result(command.operation, "binding_mismatch", [
              "evaluation_upstream_binding_mismatch",
            ]);
          target = evaluationPath(root, evaluation.evaluation_id);
          records = { candidate, review, evaluation, artifact: null };
        } else {
          if (!validateApprovedArcaArtifact(governed).valid)
            return result(
              command.operation,
              "invalid_record",
              validateApprovedArcaArtifact(governed).errors,
            );
          const artifact = governed as ApprovedArcaArtifact;
          const review = (await requireJson(
            reviewPath(root, artifact.review_binding.review_id),
          )) as GovernedArcaCandidateReview;
          const evaluation = (await requireJson(
            evaluationPath(root, artifact.evaluation_binding.evaluation_id),
          )) as GovernedArcaCandidateReviewEvaluation;
          if (
            artifact.candidate_binding.candidate_sha256 !==
              computeGovernedArcaCandidateSha256(candidate) ||
            artifact.review_binding.review_sha256 !== review.review_sha256 ||
            artifact.evaluation_binding.evaluation_sha256 !==
              evaluation.evaluation_sha256
          )
            return result(command.operation, "binding_mismatch", [
              "approved_artifact_upstream_binding_mismatch",
            ]);
          target = artifactPath(root, artifact.approved_artifact_id);
          records = { candidate, review, evaluation, artifact };
        }
      }

      const state = await publishImmutable(root, target, recordBytes(governed));
      if (state === "collision")
        return result(command.operation, "identity_collision", [
          `collision:${basename(target)}`,
        ]);
      if (state === "same")
        return result(command.operation, "duplicate_unchanged", [], null, {
          idempotent: true,
        });
      const event = makeEvent(
        command,
        chain.events.length + 1,
        prior,
        bindingsFrom(records),
        "recorded",
      );
      const eventState = await publishEvent(root, event);
      if (eventState !== "created")
        return result(command.operation, "identity_collision", [
          "event_collision",
        ]);
      await rebuildOneProjection(root, event.candidate_id);
      return result(command.operation, "recorded", [], event, {
        record: true,
        projection: true,
      });
    });
  } catch (error: unknown) {
    const detail =
      error instanceof Error ? error.message : "unknown_store_error";
    const outcome: DurableArcaStoreOutcome =
      detail === "unsafe_store_root"
        ? "unsafe_store_root"
        : detail === "store_busy"
          ? "store_busy"
          : detail === "orphan_record"
            ? "orphan_record"
            : detail === "binding_mismatch"
              ? "binding_mismatch"
              : detail.includes("event_") || detail.includes("projection_")
                ? "integrity_invalid"
                : "publication_failed";
    return result(command.operation, outcome, [detail]);
  }
}

export async function assertNoDurableStoreStagingFiles(
  storeRoot: string,
): Promise<boolean> {
  const root = resolve(storeRoot);
  try {
    await access(root);
    const directories = [
      root,
      ...Object.values(DURABLE_ARCA_STORE_LAYOUT.directories).map((value) =>
        join(root, value),
      ),
    ];
    for (const directory of directories) {
      try {
        if (
          (await readdir(directory)).some((name) =>
            name.startsWith(".staging-"),
          )
        )
          return false;
      } catch (error: unknown) {
        if (!isFsError(error, "ENOENT")) throw error;
      }
    }
    return true;
  } catch (error: unknown) {
    if (isFsError(error, "ENOENT")) return true;
    throw error;
  }
}

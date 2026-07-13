import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AuthorizationMode } from "./contracts.js";

export const AUTHORIZATION_STORE_SCHEMA_VERSION = 2 as const;
const ID = /^[a-z0-9][a-z0-9._-]{1,127}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const HASH = /^[a-f0-9]{64}$/;
const MODES = new Set(["single_use", "reusable"]);
const STATES = new Set(["consumed", "superseded"]);

const SCHEMA_DDL = `CREATE TABLE authorization_store_schema (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  schema_version INTEGER NOT NULL,
  ddl_hash TEXT NOT NULL,
  initialized_at TEXT NOT NULL
);
CREATE TABLE authorization_consumption (
  authorization_id TEXT PRIMARY KEY,
  handoff_policy_id TEXT NOT NULL,
  handoff_policy_version TEXT NOT NULL,
  handoff_policy_hash TEXT NOT NULL,
  decision_hash TEXT NOT NULL,
  authorization_mode TEXT NOT NULL CHECK (authorization_mode IN ('single_use', 'reusable')),
  state TEXT NOT NULL CHECK (state IN ('consumed', 'superseded')),
  consumed_at TEXT NOT NULL,
  execution_correlation_id TEXT NOT NULL,
  audit_correlation_id TEXT NOT NULL,
  superseded_by TEXT,
  created_at TEXT NOT NULL
);`;
const normalizeDdl = (value: string) =>
  value
    .replace(/\s+/g, " ")
    .replace(/\s*([(),;=])\s*/g, "$1")
    .trim()
    .toLowerCase();
const tableDdl = (name: string) => {
  const marker = `create table ${name}`;
  const normalized = normalizeDdl(SCHEMA_DDL);
  const start = normalized.indexOf(marker);
  const end = normalized.indexOf(";", start);
  return normalized.slice(start, end + 1);
};
export const AUTHORIZATION_STORE_DDL_HASH = createHash("sha256")
  .update(normalizeDdl(SCHEMA_DDL))
  .digest("hex");

export type AuthorizationConsumeResult =
  | "consumed"
  | "already_consumed"
  | "binding_conflict"
  | "invalid_binding"
  | "superseded"
  | "store_unavailable"
  | "store_error";

export interface AuthorizationConsumptionBinding {
  readonly authorization_id: string;
  readonly handoff_policy_id: string;
  readonly handoff_policy_version: string;
  readonly handoff_policy_hash: string;
  readonly decision_hash: string;
  readonly authorization_mode: AuthorizationMode;
  readonly execution_correlation_id: string;
  readonly audit_correlation_id: string;
  readonly superseded_by?: string;
  readonly consumed_at: string;
}
export interface AuthorizationConsumptionRecord extends AuthorizationConsumptionBinding {
  readonly state: "consumed" | "superseded";
  readonly created_at: string;
}
export type AuthorizationInspectionResult =
  | { readonly status: "ok"; readonly record?: AuthorizationConsumptionRecord }
  | {
      readonly status: "store_unavailable" | "store_error";
      readonly error: string;
    };
export type AuthorizationListResult =
  | {
      readonly status: "ok";
      readonly records: readonly AuthorizationConsumptionRecord[];
    }
  | {
      readonly status: "store_unavailable" | "store_error";
      readonly error: string;
    };
export interface AuthorizationStateStore {
  consume(binding: AuthorizationConsumptionBinding): AuthorizationConsumeResult;
}

export const validateAuthorizationConsumptionBinding = (
  value: unknown,
): value is AuthorizationConsumptionBinding => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const b = value as Record<string, unknown>;
  const keys = Object.keys(b);
  const allowed = [
    "authorization_id",
    "handoff_policy_id",
    "handoff_policy_version",
    "handoff_policy_hash",
    "decision_hash",
    "authorization_mode",
    "execution_correlation_id",
    "audit_correlation_id",
    "superseded_by",
    "consumed_at",
  ];
  if (keys.some((key) => !allowed.includes(key))) return false;
  const iso =
    typeof b.consumed_at === "string" &&
    Number.isFinite(Date.parse(b.consumed_at)) &&
    new Date(b.consumed_at).toISOString() === b.consumed_at;
  return (
    ID.test(String(b.authorization_id ?? "")) &&
    ID.test(String(b.handoff_policy_id ?? "")) &&
    SEMVER.test(String(b.handoff_policy_version ?? "")) &&
    HASH.test(String(b.handoff_policy_hash ?? "")) &&
    HASH.test(String(b.decision_hash ?? "")) &&
    MODES.has(String(b.authorization_mode ?? "")) &&
    ID.test(String(b.execution_correlation_id ?? "")) &&
    ID.test(String(b.audit_correlation_id ?? "")) &&
    (b.superseded_by === undefined || ID.test(String(b.superseded_by))) &&
    iso
  );
};

const sameBinding = (
  left: AuthorizationConsumptionBinding,
  right: AuthorizationConsumptionBinding,
) =>
  left.authorization_id === right.authorization_id &&
  left.handoff_policy_id === right.handoff_policy_id &&
  left.handoff_policy_version === right.handoff_policy_version &&
  left.handoff_policy_hash === right.handoff_policy_hash &&
  left.decision_hash === right.decision_hash &&
  left.authorization_mode === right.authorization_mode &&
  left.execution_correlation_id === right.execution_correlation_id &&
  left.audit_correlation_id === right.audit_correlation_id;

export class InMemoryAuthorizationStateStore implements AuthorizationStateStore {
  private readonly records = new Map<string, AuthorizationConsumptionBinding>();
  consume(
    binding: AuthorizationConsumptionBinding,
  ): AuthorizationConsumeResult {
    if (!validateAuthorizationConsumptionBinding(binding))
      return "invalid_binding";
    if (binding.superseded_by) return "superseded";
    const current = this.records.get(binding.authorization_id);
    if (current)
      return sameBinding(current, binding)
        ? "already_consumed"
        : "binding_conflict";
    this.records.set(binding.authorization_id, binding);
    return "consumed";
  }
}

export interface SqliteAuthorizationStateStoreOptions {
  readonly databasePath: string;
  readonly busyTimeoutMs?: number;
  readonly createParentDirectory?: boolean;
}
type StoredRow = AuthorizationConsumptionRecord;
type Column = { name: string; type: string; notnull: number; pk: number };

export class SqliteAuthorizationStateStore implements AuthorizationStateStore {
  private database: DatabaseSync | undefined;
  constructor(private readonly options: SqliteAuthorizationStateStoreOptions) {}

  initialize(): void {
    const db = this.open();
    db.exec(SCHEMA_DDL);
    db.prepare(
      "INSERT INTO authorization_store_schema(singleton, schema_version, ddl_hash, initialized_at) VALUES(1, ?, ?, ?)",
    ).run(
      AUTHORIZATION_STORE_SCHEMA_VERSION,
      AUTHORIZATION_STORE_DDL_HASH,
      new Date().toISOString(),
    );
    this.assertSchema(db);
  }
  validateSchema(): {
    readonly valid: boolean;
    readonly schema_version?: number;
    readonly ddl_hash?: string;
    readonly error?: string;
  } {
    try {
      this.assertSchema(this.open());
      return {
        valid: true,
        schema_version: AUTHORIZATION_STORE_SCHEMA_VERSION,
        ddl_hash: AUTHORIZATION_STORE_DDL_HASH,
      };
    } catch (error) {
      return { valid: false, error: message(error) };
    }
  }
  consume(
    binding: AuthorizationConsumptionBinding,
  ): AuthorizationConsumeResult {
    if (!validateAuthorizationConsumptionBinding(binding))
      return "invalid_binding";
    if (binding.superseded_by) return "superseded";
    let db: DatabaseSync;
    try {
      db = this.open();
      this.assertSchema(db);
    } catch (error) {
      return isUnavailable(error) ? "store_unavailable" : "store_error";
    }
    try {
      db.exec("BEGIN IMMEDIATE");
      const current = db
        .prepare(
          "SELECT * FROM authorization_consumption WHERE authorization_id = ?",
        )
        .get(binding.authorization_id) as StoredRow | undefined;
      if (current) {
        db.exec("ROLLBACK");
        return sameBinding(current, binding)
          ? "already_consumed"
          : "binding_conflict";
      }
      db.prepare(
        `INSERT INTO authorization_consumption (
        authorization_id, handoff_policy_id, handoff_policy_version, handoff_policy_hash, decision_hash,
        authorization_mode, state, consumed_at, execution_correlation_id, audit_correlation_id, superseded_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'consumed', ?, ?, ?, ?, ?)`,
      ).run(
        binding.authorization_id,
        binding.handoff_policy_id,
        binding.handoff_policy_version,
        binding.handoff_policy_hash,
        binding.decision_hash,
        binding.authorization_mode,
        binding.consumed_at,
        binding.execution_correlation_id,
        binding.audit_correlation_id,
        binding.superseded_by ?? null,
        binding.consumed_at,
      );
      db.exec("COMMIT");
      return "consumed";
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        /* transaction did not start */
      }
      return isUnavailable(error) ? "store_unavailable" : "store_error";
    }
  }
  inspect(authorizationId: string): AuthorizationInspectionResult {
    if (!ID.test(authorizationId))
      return { status: "store_error", error: "invalid authorization ID" };
    try {
      const db = this.open();
      this.assertSchema(db);
      const row = db
        .prepare(
          "SELECT * FROM authorization_consumption WHERE authorization_id = ?",
        )
        .get(authorizationId) as StoredRow | undefined;
      if (!row) return { status: "ok" };
      const record = normalizeRow(row);
      return record
        ? { status: "ok", record }
        : { status: "store_error", error: "malformed authorization record" };
    } catch (error) {
      return failure(error);
    }
  }
  listRecent(limit = 20): AuthorizationListResult {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    try {
      const db = this.open();
      this.assertSchema(db);
      const rows = db
        .prepare(
          "SELECT * FROM authorization_consumption ORDER BY consumed_at DESC LIMIT ?",
        )
        .all(safeLimit) as unknown as StoredRow[];
      const records = rows.map(normalizeRow);
      return records.every(Boolean)
        ? { status: "ok", records: records as AuthorizationConsumptionRecord[] }
        : { status: "store_error", error: "malformed authorization record" };
    } catch (error) {
      return failure(error);
    }
  }
  close(): void {
    this.database?.close();
    this.database = undefined;
  }
  private open(): DatabaseSync {
    if (this.database) return this.database;
    if (this.options.createParentDirectory)
      mkdirSync(dirname(this.options.databasePath), { recursive: true });
    const db = new DatabaseSync(this.options.databasePath);
    db.exec(
      `PRAGMA busy_timeout = ${this.options.busyTimeoutMs ?? 250}; PRAGMA journal_mode = WAL;`,
    );
    this.database = db;
    return db;
  }
  private assertSchema(db: DatabaseSync): void {
    const objects = db
      .prepare(
        "SELECT type, name, sql FROM sqlite_master WHERE name IN ('authorization_store_schema', 'authorization_consumption') OR tbl_name = 'authorization_consumption' ORDER BY type, name",
      )
      .all() as { type: string; name: string; sql: string | null }[];
    const tables = objects.filter(({ type }) => type === "table");
    if (
      tables.length !== 2 ||
      !tables.some(({ name }) => name === "authorization_store_schema") ||
      !tables.some(({ name }) => name === "authorization_consumption")
    )
      throw new Error("authorization store tables missing or replaced");
    if (objects.some(({ type }) => type === "trigger" || type === "view"))
      throw new Error(
        "authorization store has incompatible trigger or replacement object",
      );
    for (const table of tables)
      if (normalizeDdl(`${table.sql};`) !== tableDdl(table.name))
        throw new Error(`authorization store DDL mismatch: ${table.name}`);
    const marker = db
      .prepare(
        "SELECT schema_version, ddl_hash FROM authorization_store_schema WHERE singleton = 1",
      )
      .get() as { schema_version?: number; ddl_hash?: string } | undefined;
    if (marker?.schema_version !== AUTHORIZATION_STORE_SCHEMA_VERSION)
      throw new Error(
        `authorization store schema version mismatch: expected ${AUTHORIZATION_STORE_SCHEMA_VERSION}, received ${String(marker?.schema_version ?? "missing")}`,
      );
    if (marker.ddl_hash !== AUTHORIZATION_STORE_DDL_HASH)
      throw new Error("authorization store DDL hash mismatch");
    this.assertColumns(db, "authorization_store_schema", [
      ["singleton", "INTEGER", 0, 1],
      ["schema_version", "INTEGER", 1, 0],
      ["ddl_hash", "TEXT", 1, 0],
      ["initialized_at", "TEXT", 1, 0],
    ]);
    this.assertColumns(db, "authorization_consumption", [
      ["authorization_id", "TEXT", 0, 1],
      ["handoff_policy_id", "TEXT", 1, 0],
      ["handoff_policy_version", "TEXT", 1, 0],
      ["handoff_policy_hash", "TEXT", 1, 0],
      ["decision_hash", "TEXT", 1, 0],
      ["authorization_mode", "TEXT", 1, 0],
      ["state", "TEXT", 1, 0],
      ["consumed_at", "TEXT", 1, 0],
      ["execution_correlation_id", "TEXT", 1, 0],
      ["audit_correlation_id", "TEXT", 1, 0],
      ["superseded_by", "TEXT", 0, 0],
      ["created_at", "TEXT", 1, 0],
    ]);
    const indexes = db
      .prepare("PRAGMA index_list(authorization_consumption)")
      .all() as { name: string; unique: number; origin: string }[];
    const pkIndex = indexes.find(
      ({ unique, origin }) => unique === 1 && origin === "pk",
    );
    if (pkIndex) {
      const indexed = db
        .prepare(`PRAGMA index_info('${pkIndex.name.replaceAll("'", "''")}')`)
        .all() as { name: string }[];
      if (indexed.length !== 1 || indexed[0]?.name !== "authorization_id")
        throw new Error("authorization ID uniqueness mismatch");
    }
  }
  private assertColumns(
    db: DatabaseSync,
    table: string,
    expected: readonly (readonly [string, string, number, number])[],
  ): void {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Column[];
    if (
      columns.length !== expected.length ||
      columns.some((column, index) => {
        const item = expected[index];
        return (
          !item ||
          column.name !== item[0] ||
          column.type.toUpperCase() !== item[1] ||
          column.notnull !== item[2] ||
          column.pk !== item[3]
        );
      })
    )
      throw new Error(`authorization store column contract mismatch: ${table}`);
  }
}

const normalizeRow = (
  row: StoredRow,
): AuthorizationConsumptionRecord | undefined => {
  const binding: AuthorizationConsumptionBinding = {
    authorization_id: row.authorization_id,
    handoff_policy_id: row.handoff_policy_id,
    handoff_policy_version: row.handoff_policy_version,
    handoff_policy_hash: row.handoff_policy_hash,
    decision_hash: row.decision_hash,
    authorization_mode: row.authorization_mode,
    consumed_at: row.consumed_at,
    execution_correlation_id: row.execution_correlation_id,
    audit_correlation_id: row.audit_correlation_id,
    ...(row.superseded_by ? { superseded_by: row.superseded_by } : {}),
  };
  return validateAuthorizationConsumptionBinding(binding) &&
    STATES.has(row.state) &&
    row.created_at === row.consumed_at
    ? { ...binding, state: row.state, created_at: row.created_at }
    : undefined;
};
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const isUnavailable = (error: unknown) =>
  /unable to open|database is locked|database is busy|readonly|permission denied|no such file/i.test(
    message(error),
  );
const failure = (
  error: unknown,
): Extract<
  AuthorizationInspectionResult,
  { status: "store_error" | "store_unavailable" }
> => ({
  status: isUnavailable(error) ? "store_unavailable" : "store_error",
  error: message(error),
});

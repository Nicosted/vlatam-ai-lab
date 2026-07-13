import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AuthorizationMode } from "./contracts.js";

export const AUTHORIZATION_STORE_SCHEMA_VERSION = 1 as const;

export type AuthorizationConsumeResult =
  | "consumed"
  | "already_consumed"
  | "binding_conflict"
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

export interface AuthorizationStateStore {
  consume(binding: AuthorizationConsumptionBinding): AuthorizationConsumeResult;
}

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

type StoredRow = Omit<AuthorizationConsumptionRecord, "authorization_mode"> & {
  authorization_mode: AuthorizationMode;
};

export class SqliteAuthorizationStateStore implements AuthorizationStateStore {
  private database: DatabaseSync | undefined;
  constructor(private readonly options: SqliteAuthorizationStateStoreOptions) {}

  initialize(): void {
    const db = this.open();
    db.exec(`
      CREATE TABLE IF NOT EXISTS authorization_store_schema (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        schema_version INTEGER NOT NULL,
        initialized_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS authorization_consumption (
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
      );
    `);
    db.prepare(
      "INSERT OR IGNORE INTO authorization_store_schema(singleton, schema_version, initialized_at) VALUES(1, ?, ?)",
    ).run(AUTHORIZATION_STORE_SCHEMA_VERSION, new Date().toISOString());
    this.assertSchema(db);
  }

  validateSchema(): {
    readonly valid: boolean;
    readonly schema_version?: number;
    readonly error?: string;
  } {
    try {
      const db = this.open();
      this.assertSchema(db);
      return {
        valid: true,
        schema_version: AUTHORIZATION_STORE_SCHEMA_VERSION,
      };
    } catch (error) {
      return { valid: false, error: message(error) };
    }
  }

  consume(
    binding: AuthorizationConsumptionBinding,
  ): AuthorizationConsumeResult {
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
        authorization_id, handoff_policy_id, handoff_policy_version,
        handoff_policy_hash, decision_hash, authorization_mode, state,
        consumed_at, execution_correlation_id, audit_correlation_id,
        superseded_by, created_at
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

  inspect(authorizationId: string): AuthorizationConsumptionRecord | undefined {
    const row = this.open()
      .prepare(
        "SELECT * FROM authorization_consumption WHERE authorization_id = ?",
      )
      .get(authorizationId) as StoredRow | undefined;
    return row ? normalizeRow(row) : undefined;
  }

  listRecent(limit = 20): readonly AuthorizationConsumptionRecord[] {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    return (
      this.open()
        .prepare(
          "SELECT * FROM authorization_consumption ORDER BY consumed_at DESC LIMIT ?",
        )
        .all(safeLimit) as StoredRow[]
    ).map(normalizeRow);
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
    const row = db
      .prepare(
        "SELECT schema_version FROM authorization_store_schema WHERE singleton = 1",
      )
      .get() as { schema_version?: number } | undefined;
    if (row?.schema_version !== AUTHORIZATION_STORE_SCHEMA_VERSION)
      throw new Error(
        `authorization store schema version mismatch: expected ${AUTHORIZATION_STORE_SCHEMA_VERSION}, received ${String(row?.schema_version ?? "missing")}`,
      );
    const columns = db
      .prepare("PRAGMA table_info(authorization_consumption)")
      .all() as { name: string }[];
    const expected = [
      "authorization_id",
      "handoff_policy_id",
      "handoff_policy_version",
      "handoff_policy_hash",
      "decision_hash",
      "authorization_mode",
      "state",
      "consumed_at",
      "execution_correlation_id",
      "audit_correlation_id",
      "superseded_by",
      "created_at",
    ];
    if (columns.map(({ name }) => name).join("|") !== expected.join("|"))
      throw new Error(
        "authorization store schema is corrupted or incompatible",
      );
  }
}

const normalizeRow = (row: StoredRow): AuthorizationConsumptionRecord => ({
  authorization_id: row.authorization_id,
  handoff_policy_id: row.handoff_policy_id,
  handoff_policy_version: row.handoff_policy_version,
  handoff_policy_hash: row.handoff_policy_hash,
  decision_hash: row.decision_hash,
  authorization_mode: row.authorization_mode,
  state: row.state,
  consumed_at: row.consumed_at,
  execution_correlation_id: row.execution_correlation_id,
  audit_correlation_id: row.audit_correlation_id,
  ...(row.superseded_by ? { superseded_by: row.superseded_by } : {}),
  created_at: row.created_at,
});
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const isUnavailable = (error: unknown) =>
  /unable to open|database is locked|database is busy|readonly|permission denied|no such file/i.test(
    message(error),
  );

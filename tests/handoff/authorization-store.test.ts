import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  AUTHORIZATION_STORE_SCHEMA_VERSION,
  AUTHORIZATION_STORE_DDL_HASH,
  InMemoryAuthorizationStateStore,
  SqliteAuthorizationStateStore,
  type AuthorizationConsumptionBinding,
} from "../../src/handoff/index.js";

const binding = (
  patch: Partial<AuthorizationConsumptionBinding> = {},
): AuthorizationConsumptionBinding => ({
  authorization_id: "authorization.one",
  handoff_policy_id: "handoff.reviewed-routing",
  handoff_policy_version: "1.0.0",
  handoff_policy_hash: "a".repeat(64),
  decision_hash: "b".repeat(64),
  authorization_mode: "single_use",
  execution_correlation_id: "execution.correlation",
  audit_correlation_id: "audit.correlation",
  consumed_at: "2026-07-12T12:00:00.000Z",
  ...patch,
});
const databasePath = () =>
  join(mkdtempSync(join(tmpdir(), "ai-80-")), "authorization.sqlite");

describe("AI-80 durable authorization consumption store", () => {
  it("preserves in-memory single-use and binding-conflict semantics", () => {
    const store = new InMemoryAuthorizationStateStore();
    assert.equal(store.consume(binding()), "consumed");
    assert.equal(store.consume(binding()), "already_consumed");
    assert.equal(
      store.consume(binding({ decision_hash: "c".repeat(64) })),
      "binding_conflict",
    );
    assert.equal(
      store.consume(
        binding({
          authorization_id: "authorization.two",
          superseded_by: "authorization.new",
        }),
      ),
      "superseded",
    );
  });

  it("persists across restart and blocks duplicates across instances", () => {
    const path = databasePath();
    const first = new SqliteAuthorizationStateStore({ databasePath: path });
    first.initialize();
    assert.equal(first.consume(binding()), "consumed");
    first.close();
    const restarted = new SqliteAuthorizationStateStore({ databasePath: path });
    const second = new SqliteAuthorizationStateStore({ databasePath: path });
    assert.equal(restarted.consume(binding()), "already_consumed");
    assert.equal(second.consume(binding()), "already_consumed");
    const inspected = restarted.inspect("authorization.one");
    assert.equal(inspected.status, "ok");
    assert.equal(
      inspected.status === "ok" ? inspected.record?.state : undefined,
      "consumed",
    );
    const listed = restarted.listRecent();
    assert.equal(listed.status === "ok" ? listed.records.length : 0, 1);
    restarted.close();
    second.close();
  });

  it("fails closed on every binding change", () => {
    for (const patch of [
      { decision_hash: "c".repeat(64) },
      { handoff_policy_hash: "d".repeat(64) },
      { handoff_policy_version: "2.0.0" },
      { execution_correlation_id: "execution.other" },
      { audit_correlation_id: "audit.other" },
    ]) {
      const path = databasePath();
      const store = new SqliteAuthorizationStateStore({ databasePath: path });
      store.initialize();
      assert.equal(store.consume(binding()), "consumed");
      assert.equal(store.consume(binding(patch)), "binding_conflict");
      store.close();
    }
  });

  it("reports unavailable, locked, and incompatible stores without throwing", () => {
    const unavailable = new SqliteAuthorizationStateStore({
      databasePath: "/missing-ai-80-parent/store.sqlite",
    });
    assert.equal(unavailable.consume(binding()), "store_unavailable");
    const path = databasePath();
    const store = new SqliteAuthorizationStateStore({
      databasePath: path,
      busyTimeoutMs: 1,
    });
    store.initialize();
    const db = new DatabaseSync(path);
    db.exec("BEGIN EXCLUSIVE");
    assert.equal(store.consume(binding()), "store_unavailable");
    db.exec("ROLLBACK");
    db.close();
    store.close();
    const mismatchPath = databasePath();
    const mismatch = new SqliteAuthorizationStateStore({
      databasePath: mismatchPath,
    });
    mismatch.initialize();
    mismatch.close();
    const corrupt = new DatabaseSync(mismatchPath);
    corrupt
      .prepare("UPDATE authorization_store_schema SET schema_version = ?")
      .run(AUTHORIZATION_STORE_SCHEMA_VERSION + 1);
    corrupt.close();
    assert.equal(
      new SqliteAuthorizationStateStore({ databasePath: mismatchPath }).consume(
        binding(),
      ),
      "store_error",
    );
  });

  it("rejects every invalid binding before creating a database file", () => {
    const mutations: Partial<AuthorizationConsumptionBinding>[] = [
      { authorization_id: "" },
      { handoff_policy_id: "INVALID" },
      { handoff_policy_version: "1" },
      { handoff_policy_hash: "a" },
      { decision_hash: "b" },
      { authorization_mode: "invalid" as never },
      { execution_correlation_id: "" },
      { audit_correlation_id: "x" },
      { superseded_by: "INVALID" },
      { consumed_at: "not-a-date" },
    ];
    for (const mutation of mutations) {
      const path = databasePath();
      const sqlite = new SqliteAuthorizationStateStore({ databasePath: path });
      const memory = new InMemoryAuthorizationStateStore();
      assert.equal(sqlite.consume(binding(mutation)), "invalid_binding");
      assert.equal(memory.consume(binding(mutation)), "invalid_binding");
      assert.equal(existsSync(path), false);
    }
  });

  it("validates full DDL integrity, constraints, triggers, version, and hash", () => {
    const sourcePath = databasePath();
    const source = new SqliteAuthorizationStateStore({
      databasePath: sourcePath,
    });
    source.initialize();
    source.close();
    const sourceDb = new DatabaseSync(sourcePath);
    const consumptionSql = (
      sourceDb
        .prepare(
          "SELECT sql FROM sqlite_master WHERE name = 'authorization_consumption'",
        )
        .get() as { sql: string }
    ).sql;
    const metadataSql = (
      sourceDb
        .prepare(
          "SELECT sql FROM sqlite_master WHERE name = 'authorization_store_schema'",
        )
        .get() as { sql: string }
    ).sql;
    sourceDb.close();
    const variants = [
      consumptionSql.replace(
        "authorization_id TEXT PRIMARY KEY",
        "authorization_id TEXT",
      ),
      consumptionSql.replace(
        "handoff_policy_id TEXT NOT NULL",
        "handoff_policy_id TEXT",
      ),
      consumptionSql.replace(
        "decision_hash TEXT NOT NULL",
        "decision_hash BLOB NOT NULL",
      ),
      consumptionSql.replace(
        " CHECK (authorization_mode IN ('single_use', 'reusable'))",
        "",
      ),
      consumptionSql.replace(
        " CHECK (state IN ('consumed', 'superseded'))",
        "",
      ),
    ];
    for (const [index, ddl] of variants.entries()) {
      const path = databasePath();
      const db = new DatabaseSync(path);
      db.exec(`${metadataSql}; ${ddl};`);
      db.prepare(
        "INSERT INTO authorization_store_schema VALUES(1, ?, ?, ?)",
      ).run(
        AUTHORIZATION_STORE_SCHEMA_VERSION,
        AUTHORIZATION_STORE_DDL_HASH,
        "2026-07-12T12:00:00.000Z",
      );
      db.close();
      assert.equal(
        new SqliteAuthorizationStateStore({ databasePath: path }).consume(
          binding({ authorization_id: `authorization.variant-${index}` }),
        ),
        "store_error",
      );
    }
    const triggerPath = databasePath();
    const trigger = new SqliteAuthorizationStateStore({
      databasePath: triggerPath,
    });
    trigger.initialize();
    trigger.close();
    const triggerDb = new DatabaseSync(triggerPath);
    triggerDb.exec(
      "CREATE TRIGGER unexpected AFTER INSERT ON authorization_consumption BEGIN SELECT 1; END",
    );
    triggerDb.close();
    assert.equal(
      new SqliteAuthorizationStateStore({ databasePath: triggerPath }).consume(
        binding(),
      ),
      "store_error",
    );
    const hashPath = databasePath();
    const hashStore = new SqliteAuthorizationStateStore({
      databasePath: hashPath,
    });
    hashStore.initialize();
    hashStore.close();
    const hashDb = new DatabaseSync(hashPath);
    hashDb
      .prepare("UPDATE authorization_store_schema SET ddl_hash = ?")
      .run("0".repeat(64));
    hashDb.close();
    assert.equal(
      new SqliteAuthorizationStateStore({ databasePath: hashPath }).consume(
        binding(),
      ),
      "store_error",
    );
  });

  it("returns controlled inspection failures and rejects malformed rows", () => {
    const unavailable = new SqliteAuthorizationStateStore({
      databasePath: "/missing-ai-80-inspection/store.sqlite",
    });
    assert.equal(
      unavailable.inspect("authorization.one").status,
      "store_unavailable",
    );
    assert.equal(unavailable.listRecent().status, "store_unavailable");
    const path = databasePath();
    const store = new SqliteAuthorizationStateStore({ databasePath: path });
    store.initialize();
    store.close();
    const db = new DatabaseSync(path);
    db.prepare("UPDATE authorization_store_schema SET ddl_hash = ?").run(
      "0".repeat(64),
    );
    db.close();
    const incompatible = new SqliteAuthorizationStateStore({
      databasePath: path,
    });
    assert.equal(
      incompatible.inspect("authorization.one").status,
      "store_error",
    );
    assert.equal(incompatible.listRecent().status, "store_error");
    const malformedPath = databasePath();
    const valid = new SqliteAuthorizationStateStore({
      databasePath: malformedPath,
    });
    valid.initialize();
    valid.close();
    const malformedDb = new DatabaseSync(malformedPath);
    malformedDb
      .prepare(
        "INSERT INTO authorization_consumption VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "authorization.malformed",
        "handoff.reviewed-routing",
        "1.0.0",
        "a".repeat(64),
        "not-a-hash",
        "single_use",
        "consumed",
        "2026-07-12T12:00:00.000Z",
        "execution.correlation",
        "audit.correlation",
        null,
        "2026-07-12T12:00:00.000Z",
      );
    malformedDb.close();
    const malformed = new SqliteAuthorizationStateStore({
      databasePath: malformedPath,
    });
    assert.equal(
      malformed.inspect("authorization.malformed").status,
      "store_error",
    );
    assert.equal(malformed.listRecent().status, "store_error");
  });

  it("proves true cross-process consumption and one guarded gateway invocation", () => {
    for (const command of [
      "concurrency-fixture",
      "handoff-concurrency-fixture",
    ]) {
      const path = databasePath();
      const result = spawnSync(
        process.execPath,
        ["--import", "tsx", "scripts/authorization-store.ts", command, path],
        { encoding: "utf8" },
      );
      assert.equal(result.status, 0, result.stderr);
      const output = JSON.parse(result.stdout.trim()) as {
        results: { consumed: string }[];
        listed: { status: string; records: unknown[] };
        gateway_invocations: number;
      };
      assert.deepEqual(output.results.map(({ consumed }) => consumed).sort(), [
        "already_consumed",
        "consumed",
      ]);
      assert.equal(output.listed.records.length, 1);
      if (command === "handoff-concurrency-fixture")
        assert.equal(output.gateway_invocations, 1);
    }
  });

  it("persists metadata only", () => {
    const path = databasePath();
    const store = new SqliteAuthorizationStateStore({ databasePath: path });
    store.initialize();
    store.consume(binding());
    const inspected = store.inspect("authorization.one");
    const listed = store.listRecent();
    assert.deepEqual(Object.keys(inspected).sort(), ["record", "status"]);
    assert.deepEqual(Object.keys(listed).sort(), ["records", "status"]);
    const allowed = [
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
      "created_at",
    ];
    assert.deepEqual(
      inspected.status === "ok" && inspected.record
        ? Object.keys(inspected.record).sort()
        : [],
      allowed.sort(),
    );
    const files = [path, `${path}-wal`, `${path}-shm`].filter(existsSync);
    const serialized = [
      JSON.stringify(inspected),
      JSON.stringify(listed),
      ...files.map((file) => readFileSync(file).toString("latin1")),
    ].join("\n");
    store.close();
    for (const forbidden of [
      "prompt",
      "request_payload",
      "provider_output",
      "credential",
      "benchmark_result",
      "personal_data",
      "sensitive_context",
      "model_response",
      "capability_input",
    ])
      assert.equal(serialized.includes(forbidden), false);
  });
});

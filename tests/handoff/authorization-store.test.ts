import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  AUTHORIZATION_STORE_SCHEMA_VERSION,
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
    assert.equal(restarted.inspect("authorization.one")?.state, "consumed");
    assert.equal(restarted.listRecent().length, 1);
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

  it("persists metadata only", () => {
    const path = databasePath();
    const store = new SqliteAuthorizationStateStore({ databasePath: path });
    store.initialize();
    store.consume(binding());
    store.close();
    const raw = readFileSync(path, "utf8");
    for (const forbidden of [
      "prompt",
      "provider_response",
      "credential",
      "benchmark_result",
      "personal_data",
      "sensitive_context",
    ])
      assert.equal(raw.includes(forbidden), false);
  });
});

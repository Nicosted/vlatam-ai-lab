import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import {
  BUDGET_LEDGER_DDL_HASH,
  BUDGET_LEDGER_SCHEMA_VERSION,
  GovernanceError,
  SqliteBudgetLedger,
  budgetBindingHash,
  type BudgetPolicy,
  type BudgetReservationBinding,
} from "../../src/governance/index.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (
  ajv: Ajv,
) => void;

const databasePath = () =>
  join(mkdtempSync(join(tmpdir(), "ai-budget-")), "ledger.sqlite");
const now = new Date("2026-07-13T12:00:00.000Z");
const policy = (patch: Partial<BudgetPolicy> = {}): BudgetPolicy => ({
  policy_id: "policy.test",
  schema_version: "1.0.0",
  priority: 1,
  capability_id: "capability.test",
  execution_mode: "replay",
  request_classification: "*",
  environment_id: "local",
  project_id: "vlatam-ai-lab",
  tenant_id: "sandbox",
  scope_id: "scope.test",
  currency: "USD",
  require_usage: false,
  require_verified_pricing: true,
  behavior: "hard_block",
  max_estimated_tokens_per_request: 20,
  max_actual_tokens_per_request: 40,
  max_estimated_cost_minor_per_request: 20,
  max_actual_cost_minor_per_request: 40,
  rolling_request_limit: 2,
  rolling_token_limit: 40,
  rolling_cost_minor_limit: 40,
  rolling_window_seconds: 3600,
  reservation_ttl_seconds: 60,
  ...patch,
});
const binding = (
  patch: Partial<BudgetReservationBinding> = {},
): BudgetReservationBinding => ({
  execution_id: "execution.one",
  request_id: "request.one",
  capability_id: "capability.test",
  profile_id: "profile.test",
  profile_version: "1.0.0",
  budget_policy_id: "policy.test",
  budget_policy_version: "1.0.0",
  pricing_id: "pricing.test",
  pricing_evidence_id: "repo:test-fixture",
  pricing_evidence_hash: "a".repeat(64),
  scope_id: "scope.test",
  currency: "USD",
  estimated_input_tokens: 5,
  estimated_output_tokens: 5,
  estimated_cost_minor: 10n,
  reserved_cost_minor: 10n,
  schema_version: BUDGET_LEDGER_SCHEMA_VERSION,
  ...patch,
});
const code = (operation: () => unknown) => {
  try {
    operation();
    return "none";
  } catch (error) {
    assert.ok(error instanceof GovernanceError);
    return error.governance_code;
  }
};

describe("durable AI-74 budget and usage ledger", () => {
  it("reserves, reconciles below estimate, persists across restart, and is idempotent", () => {
    const path = databasePath();
    const first = new SqliteBudgetLedger({ databasePath: path });
    const reserved = first.reserve(binding(), policy(), now);
    assert.equal(reserved.reservation_status, "reserved");
    assert.equal(reserved.binding_hash, budgetBindingHash(binding()));
    const input = {
      reservation_id: reserved.reservation_id,
      execution_id: reserved.execution_id,
      actual_usage_state: "known" as const,
      actual_input_tokens: 3,
      actual_output_tokens: 2,
      actual_cost_minor: 6n,
      reconciled_at: "2026-07-13T12:00:01.000Z",
    };
    const reconciled = first.reconcile(input);
    assert.equal(reconciled.reservation_status, "consumed");
    assert.equal(reconciled.reconciliation_status, "reconciled");
    assert.equal(reconciled.actual_cost_minor, 6n);
    assert.equal(reconciled.released_cost_minor, 4n);
    assert.equal(first.reconcile(input).actual_cost_minor, 6n);
    first.close();
    const restarted = new SqliteBudgetLedger({ databasePath: path });
    assert.equal(restarted.inspect(reserved.reservation_id).status, "ok");
    assert.equal(restarted.get(reserved.reservation_id)?.actual_cost_minor, 6n);
    restarted.close();
  });

  it("records actual usage above estimate and unavailable usage exactly", () => {
    const path = databasePath();
    const store = new SqliteBudgetLedger({ databasePath: path });
    const above = store.reserve(binding(), policy(), now);
    const consumed = store.reconcile({
      reservation_id: above.reservation_id,
      execution_id: above.execution_id,
      actual_usage_state: "known",
      actual_input_tokens: 8,
      actual_output_tokens: 8,
      actual_cost_minor: 18n,
      reconciled_at: "2026-07-13T12:00:01.000Z",
    });
    assert.equal(consumed.actual_cost_minor, 18n);
    assert.equal(consumed.released_cost_minor, 0n);
    const unknown = store.reserve(
      binding({ execution_id: "execution.two", request_id: "request.two" }),
      policy(),
      now,
    );
    const unavailable = store.reconcile({
      reservation_id: unknown.reservation_id,
      execution_id: unknown.execution_id,
      actual_usage_state: "unavailable",
      reconciled_at: "2026-07-13T12:00:02.000Z",
    });
    assert.equal(unavailable.actual_usage_state, "unavailable");
    assert.equal(unavailable.reconciliation_status, "unavailable");
    assert.equal(unavailable.actual_cost_minor, undefined);
    store.close();
  });

  it("releases unused reservations and expires abandoned reservations atomically", () => {
    const store = new SqliteBudgetLedger({ databasePath: databasePath() });
    const released = store.reserve(binding(), policy(), now);
    assert.equal(
      store.release(
        released.reservation_id,
        released.execution_id,
        new Date("2026-07-13T12:00:01.000Z"),
      ).reservation_status,
      "released",
    );
    assert.equal(
      store.release(
        released.reservation_id,
        released.execution_id,
        new Date("2026-07-13T12:00:02.000Z"),
      ).reservation_status,
      "released",
    );
    const expiring = store.reserve(
      binding({
        execution_id: "execution.expiring",
        request_id: "request.expiring",
      }),
      policy({ reservation_ttl_seconds: 1 }),
      now,
    );
    store.reserve(
      binding({
        execution_id: "execution.after-expiry",
        request_id: "request.after-expiry",
      }),
      policy({ rolling_request_limit: 1, reservation_ttl_seconds: 1 }),
      new Date("2026-07-13T12:00:02.000Z"),
    );
    assert.equal(
      store.get(expiring.reservation_id)?.reservation_status,
      "expired",
    );
    store.close();
  });

  it("blocks duplicate executions and every exact-binding conflict", () => {
    for (const patch of [
      {},
      { request_id: "request.changed" },
      { profile_version: "2.0.0" },
      { budget_policy_version: "2.0.0" },
      { pricing_evidence_hash: "b".repeat(64) },
      { estimated_output_tokens: 6 },
      { reserved_cost_minor: 11n },
    ]) {
      const store = new SqliteBudgetLedger({ databasePath: databasePath() });
      store.reserve(binding(), policy(), now);
      assert.equal(
        code(() =>
          store.reserve(
            binding(patch),
            patch.budget_policy_version
              ? policy({ schema_version: "2.0.0" })
              : policy(),
            now,
          ),
        ),
        Object.keys(patch).length === 0
          ? "DUPLICATE_EXECUTION_BLOCKED"
          : "BUDGET_BINDING_CONFLICT",
      );
      store.close();
    }
  });

  it("serializes two instances and isolates scope, currency, and rolling windows across restart", () => {
    const path = databasePath();
    const first = new SqliteBudgetLedger({ databasePath: path });
    const second = new SqliteBudgetLedger({ databasePath: path });
    first.reserve(binding(), policy({ rolling_request_limit: 1 }), now);
    assert.equal(
      code(() =>
        second.reserve(
          binding({ execution_id: "execution.two", request_id: "request.two" }),
          policy({ rolling_request_limit: 1 }),
          now,
        ),
      ),
      "ROLLING_REQUEST_LIMIT_EXCEEDED",
    );
    assert.ok(
      second.reserve(
        binding({
          execution_id: "execution.scope",
          request_id: "request.scope",
          scope_id: "scope.other",
          budget_policy_id: "policy.scope",
        }),
        policy({
          policy_id: "policy.scope",
          scope_id: "scope.other",
          rolling_request_limit: 1,
        }),
        now,
      ),
    );
    assert.ok(
      second.reserve(
        binding({
          execution_id: "execution.currency",
          request_id: "request.currency",
          currency: "EUR",
          budget_policy_id: "policy.eur",
        }),
        policy({
          policy_id: "policy.eur",
          currency: "EUR",
          rolling_request_limit: 1,
        }),
        now,
      ),
    );
    first.close();
    second.close();
    const restarted = new SqliteBudgetLedger({ databasePath: path });
    assert.ok(
      restarted.reserve(
        binding({
          execution_id: "execution.window",
          request_id: "request.window",
        }),
        policy({ rolling_request_limit: 1, rolling_window_seconds: 1 }),
        new Date("2026-07-13T12:00:02.000Z"),
      ),
    );
    restarted.close();
  });

  it("enforces request and rolling token/cost limits", () => {
    for (const [expected, b, p] of [
      [
        "REQUEST_TOKEN_LIMIT_EXCEEDED",
        binding(),
        policy({ max_estimated_tokens_per_request: 9 }),
      ],
      [
        "REQUEST_COST_LIMIT_EXCEEDED",
        binding(),
        policy({ max_estimated_cost_minor_per_request: 9 }),
      ],
      [
        "ROLLING_TOKEN_LIMIT_EXCEEDED",
        binding(),
        policy({ rolling_token_limit: 9 }),
      ],
      [
        "ROLLING_COST_LIMIT_EXCEEDED",
        binding(),
        policy({ rolling_cost_minor_limit: 9 }),
      ],
    ] as const) {
      const store = new SqliteBudgetLedger({ databasePath: databasePath() });
      assert.equal(
        code(() => store.reserve(b, p, now)),
        expected,
      );
      store.close();
    }
  });

  it("rejects invalid bindings before database creation", () => {
    for (const mutation of [
      { execution_id: "" },
      { profile_version: "invalid" },
      { pricing_evidence_hash: "bad" },
      { currency: "usd" },
      { estimated_input_tokens: -1 },
      { estimated_cost_minor: -1n },
      { schema_version: 2 as never },
    ]) {
      const path = databasePath();
      const store = new SqliteBudgetLedger({ databasePath: path });
      assert.equal(
        code(() => store.reserve(binding(mutation), policy(), now)),
        "BUDGET_BINDING_INVALID",
      );
      assert.equal(existsSync(path), false);
    }
  });

  it("fails closed for unavailable, locked, incompatible, DDL-mismatched, corrupt, and malformed stores", () => {
    const unavailable = new SqliteBudgetLedger({
      databasePath: "/missing-budget-parent/ledger.sqlite",
    });
    assert.equal(
      code(() => unavailable.reserve(binding(), policy(), now)),
      "BUDGET_STORE_UNAVAILABLE",
    );

    const lockedPath = databasePath();
    const initialized = new SqliteBudgetLedger({ databasePath: lockedPath });
    initialized.initialize();
    initialized.close();
    const lock = new DatabaseSync(lockedPath);
    lock.exec("BEGIN IMMEDIATE");
    const locked = new SqliteBudgetLedger({
      databasePath: lockedPath,
      busyTimeoutMs: 1,
    });
    assert.equal(
      code(() => locked.reserve(binding(), policy(), now)),
      "BUDGET_STORE_UNAVAILABLE",
    );
    lock.exec("ROLLBACK");
    lock.close();
    locked.close();

    const incompatiblePath = databasePath();
    const incompatible = new SqliteBudgetLedger({
      databasePath: incompatiblePath,
    });
    incompatible.initialize();
    incompatible.close();
    const versionDb = new DatabaseSync(incompatiblePath);
    versionDb
      .prepare("UPDATE budget_ledger_schema SET schema_version = ?")
      .run(2);
    versionDb.close();
    assert.equal(
      code(() =>
        new SqliteBudgetLedger({ databasePath: incompatiblePath }).reserve(
          binding(),
          policy(),
          now,
        ),
      ),
      "BUDGET_STORE_ERROR",
    );

    const ddlPath = databasePath();
    const ddl = new SqliteBudgetLedger({ databasePath: ddlPath });
    ddl.initialize();
    ddl.close();
    const ddlDb = new DatabaseSync(ddlPath);
    ddlDb.exec("DROP INDEX budget_reservation_expiry_idx");
    ddlDb.close();
    assert.equal(
      code(() =>
        new SqliteBudgetLedger({ databasePath: ddlPath }).reserve(
          binding(),
          policy(),
          now,
        ),
      ),
      "BUDGET_STORE_ERROR",
    );

    const corruptPath = databasePath();
    writeFileSync(corruptPath, "not sqlite");
    assert.equal(
      code(() =>
        new SqliteBudgetLedger({ databasePath: corruptPath }).reserve(
          binding(),
          policy(),
          now,
        ),
      ),
      "BUDGET_STORE_ERROR",
    );

    const malformedPath = databasePath();
    const valid = new SqliteBudgetLedger({ databasePath: malformedPath });
    const reserved = valid.reserve(binding(), policy(), now);
    valid.close();
    const malformedDb = new DatabaseSync(malformedPath);
    malformedDb
      .prepare(
        "UPDATE budget_reservation SET request_id = ? WHERE execution_id = ?",
      )
      .run("request.tampered", binding().execution_id);
    malformedDb.close();
    const malformed = new SqliteBudgetLedger({ databasePath: malformedPath });
    assert.equal(
      malformed.inspect(reserved.reservation_id).status,
      "store_error",
    );
    assert.equal(malformed.listRecent().status, "store_error");
    malformed.close();
  });

  it("proves true cross-process reservation exclusion", () => {
    const path = databasePath();
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/budget-ledger.ts",
        "concurrency-fixture",
        path,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout.trim()) as {
      results: { result: string }[];
      listed: { status: string; records: unknown[] };
    };
    assert.deepEqual(output.results.map(({ result: value }) => value).sort(), [
      "ROLLING_REQUEST_LIMIT_EXCEEDED",
      "reserved",
    ]);
    assert.equal(output.listed.status, "ok");
    assert.equal(output.listed.records.length, 1);
  });

  it("exposes metadata-only controlled inspection and exact schema identity", () => {
    const path = databasePath();
    const store = new SqliteBudgetLedger({ databasePath: path });
    const record = store.reserve(binding(), policy(), now);
    assert.deepEqual(store.validateSchema(), {
      valid: true,
      schema_version: BUDGET_LEDGER_SCHEMA_VERSION,
      ddl_hash: BUDGET_LEDGER_DDL_HASH,
    });
    const inspected = store.inspect(record.reservation_id);
    const listed = store.listRecent();
    const ajv = new Ajv({ strict: true });
    addFormats(ajv);
    const validate = ajv.compile(
      JSON.parse(
        readFileSync(
          "schemas/ai-budget-ledger-inspection-result.schema.json",
          "utf8",
        ),
      ) as object,
    );
    assert.equal(validate(inspected), true, JSON.stringify(validate.errors));
    const serialized = JSON.stringify([inspected, listed], (_, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );
    const files = [path, `${path}-wal`, `${path}-shm`].filter(existsSync);
    const disk = files
      .map((file) => readFileSync(file).toString("latin1"))
      .join("\n");
    for (const forbidden of [
      "prompt-canary",
      "response-canary",
      "credential-canary",
      "api-key-canary",
      "reviewer-canary",
      "provider-error-canary",
    ]) {
      assert.equal(serialized.includes(forbidden), false);
      assert.equal(disk.includes(forbidden), false);
    }
    assert.equal(serialized.includes("request_payload"), false);
    store.close();
  });
});

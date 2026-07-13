import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import {
  BUDGET_LEDGER_DDL_HASH,
  BUDGET_LEDGER_SCHEMA_VERSION,
  GovernanceError,
  SqliteBudgetLedger,
  type GovernanceErrorCode,
} from "../../src/governance/index.js";
import { binding, policy, reconciliation } from "../helpers/governance.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (
  ajv: Ajv,
) => void;
const now = new Date("2026-07-13T12:00:00.000Z");
const databasePath = () =>
  join(mkdtempSync(join(tmpdir(), "budget-v2-")), "ledger.sqlite");
const code = (operation: () => unknown): GovernanceErrorCode | undefined => {
  try {
    operation();
  } catch (error) {
    return error instanceof GovernanceError ? error.governance_code : undefined;
  }
};

describe("durable rational budget ledger v2", () => {
  it("persists exact reservation and idempotent reconciliation across restart", () => {
    const path = databasePath();
    const first = new SqliteBudgetLedger({ databasePath: path });
    const reserved = first.reserve(binding(), policy(), now);
    const input = reconciliation(reserved.reservation_id);
    const reconciled = first.reconcile(input);
    assert.deepEqual(reconciled.actual_exact_cost, {
      numerator: "3",
      denominator: "500000",
    });
    assert.equal(reconciled.actual_accounting_units, 6n);
    assert.equal(reconciled.released_accounting_units, 4n);
    assert.equal(first.reconcile(input).binding_hash, reconciled.binding_hash);
    first.close();
    const restarted = new SqliteBudgetLedger({ databasePath: path });
    assert.equal(
      restarted.get(reserved.reservation_id)?.actual_accounting_units,
      6n,
    );
    restarted.close();
  });

  it("supports exact actual cost below and above estimate", () => {
    for (const [suffix, exact, units] of [
      ["below", { numerator: "3", denominator: "500000" }, 6n],
      ["above", { numerator: "9", denominator: "500000" }, 18n],
    ] as const) {
      const store = new SqliteBudgetLedger({ databasePath: databasePath() });
      const source = binding({
        execution_id: `execution.${suffix}`,
        request_id: `request.${suffix}`,
      });
      const reserved = store.reserve(source, policy(), now);
      const actual = store.reconcile(
        reconciliation(reserved.reservation_id, {
          execution_id: source.execution_id,
          actual_exact_cost: exact,
          actual_accounting_units: units,
        }),
      );
      assert.deepEqual(actual.actual_exact_cost, exact);
      assert.equal(actual.actual_accounting_units, units);
      store.close();
    }
  });

  it("blocks duplicate reservation under every changed pricing and policy binding", () => {
    for (const patch of [
      {},
      { pricing_contract_hash: "b".repeat(64) },
      { pricing_evidence_hash: "b".repeat(64) },
      { accounting_scale: "100" },
      { reservation_rounding_policy: "HALF_EVEN" as never },
      { reconciliation_rounding_policy: "HALF_EVEN" as never },
      { profile_version: "2.0.0" },
      { budget_policy_version: "3.0.0" },
      { scope_id: "scope.changed" },
      { currency: "EUR" },
    ]) {
      const mutation = patch as Record<string, unknown>;
      const store = new SqliteBudgetLedger({ databasePath: databasePath() });
      store.reserve(binding(), policy(), now);
      const result = code(() =>
        store.reserve(
          binding(patch),
          policy({
            ...(patch.accounting_scale
              ? { accounting_scale: patch.accounting_scale }
              : {}),
            ...(mutation.reservation_rounding_policy
              ? {
                  reservation_rounding_policy:
                    mutation.reservation_rounding_policy as never,
                }
              : {}),
            ...(mutation.reconciliation_rounding_policy
              ? {
                  reconciliation_rounding_policy:
                    mutation.reconciliation_rounding_policy as never,
                }
              : {}),
            ...(patch.budget_policy_version
              ? { schema_version: patch.budget_policy_version as never }
              : {}),
            ...(patch.scope_id ? { scope_id: patch.scope_id } : {}),
            ...(patch.currency ? { currency: patch.currency } : {}),
          }),
          now,
        ),
      );
      if (Object.keys(patch).length === 0)
        assert.equal(result, "DUPLICATE_EXECUTION_BLOCKED");
      else
        assert.ok(
          result === "BUDGET_BINDING_INVALID" ||
            result === "BUDGET_BINDING_CONFLICT",
          String(result),
        );
      store.close();
    }
  });

  it("serializes two instances and preserves rolling windows across restart", () => {
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
    first.close();
    second.close();
    const restarted = new SqliteBudgetLedger({ databasePath: path });
    assert.doesNotThrow(() =>
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

  it("rejects invalid bindings before creating a database", () => {
    for (const mutation of [
      { execution_id: "" },
      { pricing_contract_hash: "bad" },
      { estimated_exact_cost: { numerator: "2", denominator: "4" } },
      { estimated_accounting_units: 9n },
      { reserved_accounting_units: -1n },
      { schema_version: 1 as never },
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

  it("fails closed on legacy v1 schemas without migration or repair", () => {
    const path = databasePath();
    const legacy = new DatabaseSync(path);
    legacy.exec(
      "CREATE TABLE budget_ledger_schema(singleton INTEGER PRIMARY KEY, schema_version INTEGER, ddl_hash TEXT, initialized_at TEXT); INSERT INTO budget_ledger_schema VALUES(1,1,'legacy','2026-07-13T00:00:00.000Z');",
    );
    legacy.close();
    const store = new SqliteBudgetLedger({ databasePath: path });
    assert.equal(
      code(() => store.reserve(binding(), policy(), now)),
      "BUDGET_STORE_ERROR",
    );
    const verify = new DatabaseSync(path);
    assert.equal(
      (
        verify
          .prepare("SELECT schema_version FROM budget_ledger_schema")
          .get() as { schema_version: number }
      ).schema_version,
      1,
    );
    verify.close();
  });

  it("retains WAL, busy timeout, DDL hash validation, and controlled lock failure", () => {
    const path = databasePath();
    const initialized = new SqliteBudgetLedger({ databasePath: path });
    initialized.initialize();
    assert.deepEqual(initialized.validateSchema(), {
      valid: true,
      schema_version: BUDGET_LEDGER_SCHEMA_VERSION,
      ddl_hash: BUDGET_LEDGER_DDL_HASH,
    });
    initialized.close();
    const lock = new DatabaseSync(path);
    lock.exec("BEGIN IMMEDIATE");
    const blocked = new SqliteBudgetLedger({
      databasePath: path,
      busyTimeoutMs: 1,
    });
    assert.equal(
      code(() => blocked.reserve(binding(), policy(), now)),
      "BUDGET_STORE_UNAVAILABLE",
    );
    lock.exec("ROLLBACK");
    lock.close();
    blocked.close();
  });

  it("proves cross-process duplicate prevention", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/budget-ledger.ts",
        "concurrency-fixture",
        databasePath(),
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
    assert.equal(output.listed.records.length, 1);
  });

  it("exposes metadata-only inspection under the v2 schema", () => {
    const path = databasePath();
    const store = new SqliteBudgetLedger({ databasePath: path });
    const reserved = store.reserve(binding(), policy(), now);
    const inspected = store.inspect(reserved.reservation_id);
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
    const serialized = JSON.stringify(inspected);
    for (const forbidden of [
      "prompt",
      "response",
      "credential",
      "reviewer",
      "request_payload",
    ])
      assert.equal(serialized.includes(forbidden), false);
    store.close();
  });

  it("reports corrupt stores as controlled errors", () => {
    const path = databasePath();
    writeFileSync(path, "not sqlite");
    const store = new SqliteBudgetLedger({ databasePath: path });
    assert.equal(
      code(() => store.reserve(binding(), policy(), now)),
      "BUDGET_STORE_ERROR",
    );
  });
});

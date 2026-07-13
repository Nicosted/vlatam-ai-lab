import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BudgetPolicyCatalog,
  GovernanceError,
  InMemoryBudgetLedger,
} from "../../src/governance/index.js";
import { binding, policy, reconciliation } from "../helpers/governance.js";

const now = new Date("2026-07-13T12:00:00.000Z");

describe("AI-74 rational policy and in-memory ledger", () => {
  it("resolves v2 policies and rejects ambiguous or mismatched accounting policy", () => {
    const request = {
      capability_id: "cap.test",
      context: { data_classification: "public" },
    } as never;
    const profile = {
      profile_id: "profile.test",
      mode: "replay",
      eligibility: { budget_class: "development" },
    } as never;
    assert.equal(
      new BudgetPolicyCatalog({
        schema_version: "2.0.0",
        policies: [policy()],
      }).resolve(request, profile).policy_id,
      "policy.test.v2",
    );
    assert.throws(
      () =>
        new BudgetPolicyCatalog({
          schema_version: "2.0.0",
          policies: [policy(), policy({ policy_id: "policy.other" })],
        }).resolve(request, profile),
      GovernanceError,
    );
    assert.throws(
      () =>
        new BudgetPolicyCatalog({
          schema_version: "2.0.0",
          policies: [policy({ accounting_scale: "100" as never })],
        }),
      GovernanceError,
    );
  });

  it("enforces exact accounting-unit request and rolling limits", () => {
    const ledger = new InMemoryBudgetLedger();
    assert.throws(
      () =>
        ledger.reserve(
          binding(),
          policy({ max_estimated_cost_accounting_units_per_request: "9" }),
          now,
        ),
      GovernanceError,
    );
    ledger.reserve(binding(), policy({ rolling_request_limit: 1 }), now);
    assert.throws(
      () =>
        ledger.reserve(
          binding({ execution_id: "execution.two", request_id: "request.two" }),
          policy({ rolling_request_limit: 1 }),
          now,
        ),
      GovernanceError,
    );
  });

  it("reconciles exact actual cost idempotently below and above estimate", () => {
    for (const [id, exact, units] of [
      ["execution.below", { numerator: "3", denominator: "500000" }, 6n],
      ["execution.above", { numerator: "9", denominator: "500000" }, 18n],
    ] as const) {
      const ledger = new InMemoryBudgetLedger();
      const source = binding({ execution_id: id, request_id: `request.${id}` });
      const reserved = ledger.reserve(source, policy(), now);
      const input = reconciliation(reserved.reservation_id, {
        execution_id: id,
        actual_exact_cost: exact,
        actual_accounting_units: units,
      });
      const first = ledger.reconcile(input);
      assert.equal(first.actual_accounting_units, units);
      assert.deepEqual(first.actual_exact_cost, exact);
      assert.equal(ledger.reconcile(input).binding_hash, first.binding_hash);
    }
  });

  it("fails reconciliation when price, evidence, scale, or rounding changes", () => {
    for (const patch of [
      { pricing_contract_hash: "b".repeat(64) },
      { pricing_evidence_hash: "b".repeat(64) },
      { accounting_scale: "100" },
      { reconciliation_rounding_policy: "HALF_EVEN" as never },
    ]) {
      const ledger = new InMemoryBudgetLedger();
      const reserved = ledger.reserve(binding(), policy(), now);
      assert.throws(
        () => ledger.reconcile(reconciliation(reserved.reservation_id, patch)),
        GovernanceError,
      );
    }
  });
});

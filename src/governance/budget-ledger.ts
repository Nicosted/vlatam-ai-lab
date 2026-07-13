import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { BudgetPolicy } from "./budget-policy.js";
import { governanceError } from "./errors.js";

export const BUDGET_LEDGER_SCHEMA_VERSION = 1 as const;
export const BUDGET_BINDING_DOMAIN =
  "vlatam-ai-lab:budget-reservation-binding:v1" as const;
const ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const SEMVER = /^\d+(?:\.\d+){0,2}$/;
const HASH = /^[a-f0-9]{64}$/;
const CURRENCY = /^[A-Z]{3}$/;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const RESERVATION_STATES = new Set([
  "reserved",
  "released",
  "expired",
  "consumed",
]);
const RECONCILIATION_STATES = new Set(["pending", "reconciled", "unavailable"]);
const ACTUAL_USAGE_STATES = new Set(["unknown", "known", "unavailable"]);

const SCHEMA_DDL = `CREATE TABLE budget_ledger_schema (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  schema_version INTEGER NOT NULL,
  ddl_hash TEXT NOT NULL,
  initialized_at TEXT NOT NULL
);
CREATE TABLE budget_reservation (
  execution_id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL UNIQUE,
  request_id TEXT NOT NULL,
  capability_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  profile_version TEXT NOT NULL,
  budget_policy_id TEXT NOT NULL,
  budget_policy_version TEXT NOT NULL,
  pricing_id TEXT NOT NULL,
  pricing_evidence_id TEXT NOT NULL,
  pricing_evidence_hash TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  currency TEXT NOT NULL,
  estimated_input_tokens INTEGER NOT NULL CHECK (typeof(estimated_input_tokens) = 'integer' AND estimated_input_tokens >= 0),
  estimated_output_tokens INTEGER NOT NULL CHECK (typeof(estimated_output_tokens) = 'integer' AND estimated_output_tokens >= 0),
  estimated_cost_minor INTEGER NOT NULL CHECK (typeof(estimated_cost_minor) = 'integer' AND estimated_cost_minor >= 0),
  reserved_cost_minor INTEGER NOT NULL CHECK (typeof(reserved_cost_minor) = 'integer' AND reserved_cost_minor >= 0),
  actual_usage_state TEXT NOT NULL CHECK (actual_usage_state IN ('unknown', 'known', 'unavailable')),
  actual_input_tokens INTEGER CHECK (actual_input_tokens IS NULL OR (typeof(actual_input_tokens) = 'integer' AND actual_input_tokens >= 0)),
  actual_output_tokens INTEGER CHECK (actual_output_tokens IS NULL OR (typeof(actual_output_tokens) = 'integer' AND actual_output_tokens >= 0)),
  actual_cost_minor INTEGER CHECK (actual_cost_minor IS NULL OR (typeof(actual_cost_minor) = 'integer' AND actual_cost_minor >= 0)),
  reservation_status TEXT NOT NULL CHECK (reservation_status IN ('reserved', 'released', 'expired', 'consumed')),
  reconciliation_status TEXT NOT NULL CHECK (reconciliation_status IN ('pending', 'reconciled', 'unavailable')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  reconciled_at TEXT,
  released_at TEXT,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  binding_hash TEXT NOT NULL,
  CHECK (length(execution_id) BETWEEN 1 AND 128 AND execution_id NOT GLOB '*[^a-z0-9._-]*'),
  CHECK (length(request_id) BETWEEN 1 AND 128 AND request_id NOT GLOB '*[^a-z0-9._-]*'),
  CHECK (length(capability_id) BETWEEN 1 AND 128 AND capability_id NOT GLOB '*[^a-z0-9._-]*'),
  CHECK (length(profile_id) BETWEEN 1 AND 128 AND profile_id NOT GLOB '*[^a-z0-9._-]*'),
  CHECK (length(budget_policy_id) BETWEEN 1 AND 128 AND budget_policy_id NOT GLOB '*[^a-z0-9._-]*'),
  CHECK (length(scope_id) BETWEEN 1 AND 128 AND scope_id NOT GLOB '*[^a-z0-9._-]*'),
  CHECK (length(currency) = 3 AND currency NOT GLOB '*[^A-Z]*'),
  CHECK (length(pricing_evidence_hash) = 64 AND pricing_evidence_hash NOT GLOB '*[^a-f0-9]*'),
  CHECK (length(binding_hash) = 64 AND binding_hash NOT GLOB '*[^a-f0-9]*'),
  CHECK (expires_at > created_at),
  CHECK ((actual_usage_state = 'known') = (actual_input_tokens IS NOT NULL AND actual_output_tokens IS NOT NULL AND actual_cost_minor IS NOT NULL)),
  CHECK ((reconciliation_status = 'pending') = (reconciled_at IS NULL)),
  CHECK ((reservation_status = 'reserved') = (released_at IS NULL)),
  CHECK (reservation_status != 'consumed' OR reconciliation_status IN ('reconciled', 'unavailable'))
);
CREATE INDEX budget_reservation_scope_window_idx ON budget_reservation(scope_id, currency, created_at);
CREATE INDEX budget_reservation_expiry_idx ON budget_reservation(reservation_status, expires_at);
CREATE TRIGGER budget_reservation_binding_immutable
BEFORE UPDATE ON budget_reservation
WHEN OLD.binding_hash != NEW.binding_hash OR OLD.execution_id != NEW.execution_id
BEGIN SELECT RAISE(ABORT, 'budget binding is immutable'); END;
CREATE TRIGGER budget_reservation_transition_guard
BEFORE UPDATE OF reservation_status, reconciliation_status ON budget_reservation
WHEN NOT (
  (OLD.reservation_status = 'reserved' AND NEW.reservation_status IN ('released', 'expired', 'consumed')) OR
  (OLD.reservation_status = NEW.reservation_status AND OLD.reconciliation_status = NEW.reconciliation_status)
)
BEGIN SELECT RAISE(ABORT, 'invalid budget reservation transition'); END;`;

const normalizeDdl = (value: string) =>
  value
    .replace(/\s+/g, " ")
    .replace(/\s*([(),;=])\s*/g, "$1")
    .trim()
    .toLowerCase();
export const BUDGET_LEDGER_DDL_HASH = createHash("sha256")
  .update(normalizeDdl(SCHEMA_DDL))
  .digest("hex");

export type ReservationStatus =
  | "reserved"
  | "released"
  | "expired"
  | "consumed";
export type ReconciliationStatus = "pending" | "reconciled" | "unavailable";
export type ActualUsageState = "unknown" | "known" | "unavailable";
export type ReservationState = ReservationStatus | "blocked";

export interface BudgetReservationBinding {
  readonly execution_id: string;
  readonly request_id: string;
  readonly capability_id: string;
  readonly profile_id: string;
  readonly profile_version: string;
  readonly budget_policy_id: string;
  readonly budget_policy_version: string;
  readonly pricing_id: string;
  readonly pricing_evidence_id: string;
  readonly pricing_evidence_hash: string;
  readonly scope_id: string;
  readonly currency: string;
  readonly estimated_input_tokens: number;
  readonly estimated_output_tokens: number;
  readonly estimated_cost_minor: bigint;
  readonly reserved_cost_minor: bigint;
  readonly schema_version: typeof BUDGET_LEDGER_SCHEMA_VERSION;
}

export interface Reservation extends BudgetReservationBinding {
  readonly reservation_id: string;
  readonly binding_hash: string;
  readonly actual_usage_state: ActualUsageState;
  readonly actual_input_tokens?: number;
  readonly actual_output_tokens?: number;
  readonly actual_cost_minor?: bigint;
  readonly reservation_status: ReservationStatus;
  readonly reconciliation_status: ReconciliationStatus;
  readonly created_at: string;
  readonly expires_at: string;
  readonly reconciled_at?: string;
  readonly released_at?: string;
  /** Compatibility view for existing metadata-only audits. */
  readonly state: ReservationStatus;
  readonly policy_id: string;
  readonly reserved_tokens: number;
  readonly released_cost_minor?: bigint;
}

export interface BudgetReconciliation {
  readonly reservation_id: string;
  readonly execution_id: string;
  readonly actual_usage_state: "known" | "unavailable";
  readonly actual_input_tokens?: number;
  readonly actual_output_tokens?: number;
  readonly actual_cost_minor?: bigint;
  readonly reconciled_at: string;
}

export type SerializedBudgetReservation = Omit<
  Reservation,
  | "estimated_cost_minor"
  | "reserved_cost_minor"
  | "actual_cost_minor"
  | "released_cost_minor"
> & {
  readonly estimated_cost_minor: string;
  readonly reserved_cost_minor: string;
  readonly actual_cost_minor?: string;
  readonly released_cost_minor?: string;
};
export type BudgetInspectionResult =
  | { readonly status: "ok"; readonly record?: SerializedBudgetReservation }
  | {
      readonly status: "store_unavailable" | "store_error";
      readonly error: string;
    };
export type BudgetListResult =
  | {
      readonly status: "ok";
      readonly records: readonly SerializedBudgetReservation[];
    }
  | {
      readonly status: "store_unavailable" | "store_error";
      readonly error: string;
    };

export interface BudgetLedger {
  reserve(
    binding: BudgetReservationBinding,
    policy: BudgetPolicy,
    at: Date,
  ): Reservation;
  reconcile(input: BudgetReconciliation): Reservation;
  release(reservationId: string, executionId: string, at: Date): Reservation;
  get(reservationId: string): Reservation | undefined;
}

const canonicalBinding = (binding: BudgetReservationBinding) => ({
  domain: BUDGET_BINDING_DOMAIN,
  execution_id: binding.execution_id,
  request_id: binding.request_id,
  capability_id: binding.capability_id,
  profile_id: binding.profile_id,
  profile_version: binding.profile_version,
  budget_policy_id: binding.budget_policy_id,
  budget_policy_version: binding.budget_policy_version,
  pricing_id: binding.pricing_id,
  pricing_evidence_id: binding.pricing_evidence_id,
  pricing_evidence_hash: binding.pricing_evidence_hash,
  scope_id: binding.scope_id,
  currency: binding.currency,
  estimated_input_tokens: binding.estimated_input_tokens,
  estimated_output_tokens: binding.estimated_output_tokens,
  estimated_cost_minor: binding.estimated_cost_minor.toString(),
  reserved_cost_minor: binding.reserved_cost_minor.toString(),
  schema_version: binding.schema_version,
});

export const budgetBindingHash = (binding: BudgetReservationBinding): string =>
  createHash("sha256")
    .update(JSON.stringify(canonicalBinding(binding)))
    .digest("hex");

export const pricingEvidenceHash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export const validateBudgetReservationBinding = (
  value: unknown,
): value is BudgetReservationBinding => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const b = value as Record<string, unknown>;
  const exactKeys = Object.keys(
    canonicalBinding(b as unknown as BudgetReservationBinding),
  ).filter((key) => key !== "domain");
  if (
    Object.keys(b).length !== exactKeys.length ||
    Object.keys(b).some((key) => !exactKeys.includes(key))
  )
    return false;
  const integer = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
  const money = (v: unknown) =>
    typeof v === "bigint" && v >= 0n && v <= MAX_SAFE;
  return (
    ID.test(String(b.execution_id ?? "")) &&
    ID.test(String(b.request_id ?? "")) &&
    ID.test(String(b.capability_id ?? "")) &&
    ID.test(String(b.profile_id ?? "")) &&
    SEMVER.test(String(b.profile_version ?? "")) &&
    ID.test(String(b.budget_policy_id ?? "")) &&
    SEMVER.test(String(b.budget_policy_version ?? "")) &&
    ID.test(String(b.pricing_id ?? "")) &&
    typeof b.pricing_evidence_id === "string" &&
    b.pricing_evidence_id.length > 0 &&
    b.pricing_evidence_id.length <= 256 &&
    HASH.test(String(b.pricing_evidence_hash ?? "")) &&
    ID.test(String(b.scope_id ?? "")) &&
    CURRENCY.test(String(b.currency ?? "")) &&
    integer(b.estimated_input_tokens) &&
    integer(b.estimated_output_tokens) &&
    money(b.estimated_cost_minor) &&
    money(b.reserved_cost_minor) &&
    b.schema_version === BUDGET_LEDGER_SCHEMA_VERSION
  );
};

const validIso = (value: string) =>
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const reservationId = (executionId: string) =>
  `budget.${createHash("sha256").update(executionId).digest("hex").slice(0, 32)}`;
const expiry = (at: Date, policy: BudgetPolicy) =>
  new Date(
    at.getTime() + (policy.reservation_ttl_seconds ?? 300) * 1000,
  ).toISOString();
const rollingCutoff = (at: Date, policy: BudgetPolicy) =>
  new Date(
    at.getTime() - (policy.rolling_window_seconds ?? 86_400) * 1000,
  ).toISOString();
const fail = (code: Parameters<typeof governanceError>[0]): never => {
  throw governanceError(code);
};
const assertPolicyForBinding = (
  binding: BudgetReservationBinding,
  policy: BudgetPolicy,
) => {
  if (
    binding.budget_policy_id !== policy.policy_id ||
    binding.budget_policy_version !== policy.schema_version ||
    binding.scope_id !== policy.scope_id ||
    binding.currency !== policy.currency
  )
    fail("BUDGET_BINDING_CONFLICT");
  const estimatedTokens =
    binding.estimated_input_tokens + binding.estimated_output_tokens;
  if (estimatedTokens > policy.max_estimated_tokens_per_request)
    fail("REQUEST_TOKEN_LIMIT_EXCEEDED");
  if (
    binding.estimated_cost_minor >
    BigInt(policy.max_estimated_cost_minor_per_request)
  )
    fail("REQUEST_COST_LIMIT_EXCEEDED");
};

interface ScopeTotals {
  requests: number;
  tokens: number;
  cost: bigint;
  reservedRequests: number;
  reservedTokens: number;
  reservedCost: bigint;
}

export class InMemoryBudgetLedger implements BudgetLedger {
  private readonly reservations = new Map<string, Reservation>();
  private readonly executions = new Map<string, Reservation>();
  constructor(
    private readonly id: (executionId: string) => string = reservationId,
  ) {}
  reserve(
    binding: BudgetReservationBinding,
    policy: BudgetPolicy,
    at: Date,
  ): Reservation;
  reserve(
    executionId: string,
    policy: BudgetPolicy,
    tokens: number,
    cost: bigint,
  ): Reservation;
  reserve(
    input: BudgetReservationBinding | string,
    policy: BudgetPolicy,
    atOrTokens: Date | number,
    legacyCost?: bigint,
  ): Reservation {
    const at = atOrTokens instanceof Date ? atOrTokens : new Date(0);
    const binding: BudgetReservationBinding =
      typeof input === "string"
        ? {
            execution_id: input,
            request_id: `request.${input}`,
            capability_id: policy.capability_id,
            profile_id: "profile.test",
            profile_version: "1.0.0",
            budget_policy_id: policy.policy_id,
            budget_policy_version: policy.schema_version.includes(".")
              ? policy.schema_version
              : "1.0.0",
            pricing_id: "pricing.test",
            pricing_evidence_id: "fixture",
            pricing_evidence_hash: "0".repeat(64),
            scope_id: policy.scope_id,
            currency: policy.currency,
            estimated_input_tokens: atOrTokens as number,
            estimated_output_tokens: 0,
            estimated_cost_minor: legacyCost!,
            reserved_cost_minor: legacyCost!,
            schema_version: BUDGET_LEDGER_SCHEMA_VERSION,
          }
        : input;
    if (!validateBudgetReservationBinding(binding))
      fail("BUDGET_BINDING_INVALID");
    assertPolicyForBinding(binding, {
      ...policy,
      schema_version: binding.budget_policy_version,
    });
    this.expire(at);
    const current = this.executions.get(binding.execution_id);
    if (current)
      fail(
        current.binding_hash === budgetBindingHash(binding)
          ? "DUPLICATE_EXECUTION_BLOCKED"
          : "BUDGET_BINDING_CONFLICT",
      );
    const totals = this.totals(binding.scope_id, binding.currency, at, policy);
    this.assertRolling(totals, binding, policy);
    const createdAt = at.toISOString();
    const record = materialize(binding, {
      reservation_id: this.id(binding.execution_id),
      binding_hash: budgetBindingHash(binding),
      actual_usage_state: "unknown",
      reservation_status: "reserved",
      reconciliation_status: "pending",
      created_at: createdAt,
      expires_at: expiry(at, policy),
    });
    this.reservations.set(record.reservation_id, record);
    this.executions.set(record.execution_id, record);
    return record;
  }
  reconcile(input: BudgetReconciliation): Reservation;
  reconcile(
    id: string,
    executionId: string,
    actualTokens: number,
    actualCost: bigint,
    final: "consumed" | "failed",
  ): Reservation;
  reconcile(
    input: BudgetReconciliation | string,
    executionId?: string,
    actualTokens?: number,
    actualCost?: bigint,
    final?: "consumed" | "failed",
  ): Reservation {
    if (typeof input === "string") {
      return final === "failed"
        ? this.release(input, executionId!, new Date(0))
        : this.reconcile({
            reservation_id: input,
            execution_id: executionId!,
            actual_usage_state: "known",
            actual_input_tokens: actualTokens!,
            actual_output_tokens: 0,
            actual_cost_minor: actualCost!,
            reconciled_at: new Date(0).toISOString(),
          });
    }
    const found = this.reservations.get(input.reservation_id);
    if (!found || found.execution_id !== input.execution_id)
      return fail("BUDGET_RECONCILIATION_FAILED");
    const current = found;
    if (current.reservation_status === "consumed") {
      if (sameReconciliation(current, input)) return current;
      fail("BUDGET_RECONCILIATION_FAILED");
    }
    if (current.reservation_status !== "reserved")
      fail("BUDGET_RECONCILIATION_FAILED");
    const updated = reconciledRecord(current, input);
    this.replace(updated);
    return updated;
  }
  release(
    reservationIdValue: string,
    executionId: string,
    at: Date,
  ): Reservation {
    const found = this.reservations.get(reservationIdValue);
    if (!found || found.execution_id !== executionId)
      return fail("BUDGET_RECONCILIATION_FAILED");
    const current = found;
    if (current.reservation_status === "released") return current;
    if (current.reservation_status !== "reserved")
      fail("BUDGET_RECONCILIATION_FAILED");
    const updated = materialize(current, {
      ...current,
      reservation_status: "released",
      reconciliation_status: "unavailable",
      actual_usage_state: "unavailable",
      reconciled_at: at.toISOString(),
      released_at: at.toISOString(),
    });
    this.replace(updated);
    return updated;
  }
  get(id: string): Reservation | undefined {
    return this.reservations.get(id);
  }
  snapshot(scope: string): Readonly<ScopeTotals> | undefined {
    const records = [...this.reservations.values()].filter(
      (r) => r.scope_id === scope,
    );
    if (!records.length) return undefined;
    const totals: ScopeTotals = {
      requests: 0,
      tokens: 0,
      cost: 0n,
      reservedRequests: 0,
      reservedTokens: 0,
      reservedCost: 0n,
    };
    for (const record of records) {
      if (record.reservation_status === "reserved") {
        totals.reservedRequests++;
        totals.reservedTokens += record.reserved_tokens;
        totals.reservedCost += record.reserved_cost_minor;
      } else if (record.reservation_status === "consumed") {
        totals.requests++;
        totals.tokens +=
          record.actual_input_tokens! + record.actual_output_tokens!;
        totals.cost += record.actual_cost_minor ?? record.reserved_cost_minor;
      }
    }
    return totals;
  }
  private replace(record: Reservation) {
    this.reservations.set(record.reservation_id, record);
    this.executions.set(record.execution_id, record);
  }
  private expire(at: Date) {
    for (const record of this.reservations.values()) {
      if (
        record.reservation_status === "reserved" &&
        record.expires_at <= at.toISOString()
      ) {
        this.replace(
          materialize(record, {
            ...record,
            reservation_status: "expired",
            reconciliation_status: "unavailable",
            actual_usage_state: "unavailable",
            reconciled_at: at.toISOString(),
            released_at: at.toISOString(),
          }),
        );
      }
    }
  }
  private totals(
    scope: string,
    currency: string,
    at: Date,
    policy: BudgetPolicy,
  ): ScopeTotals {
    const cutoff = rollingCutoff(at, policy);
    const totals: ScopeTotals = {
      requests: 0,
      tokens: 0,
      cost: 0n,
      reservedRequests: 0,
      reservedTokens: 0,
      reservedCost: 0n,
    };
    for (const record of this.reservations.values()) {
      if (
        record.scope_id !== scope ||
        record.currency !== currency ||
        record.created_at < cutoff
      )
        continue;
      if (record.reservation_status === "reserved") {
        totals.reservedRequests++;
        totals.reservedTokens +=
          record.estimated_input_tokens + record.estimated_output_tokens;
        totals.reservedCost += record.reserved_cost_minor;
      } else if (record.reservation_status === "consumed") {
        totals.requests++;
        totals.tokens +=
          record.actual_usage_state === "known"
            ? record.actual_input_tokens! + record.actual_output_tokens!
            : record.estimated_input_tokens + record.estimated_output_tokens;
        totals.cost += record.actual_cost_minor ?? record.reserved_cost_minor;
      }
    }
    return totals;
  }
  private assertRolling(
    totals: ScopeTotals,
    binding: BudgetReservationBinding,
    policy: BudgetPolicy,
  ) {
    const tokens =
      binding.estimated_input_tokens + binding.estimated_output_tokens;
    if (
      totals.requests + totals.reservedRequests + 1 >
      policy.rolling_request_limit
    )
      fail("ROLLING_REQUEST_LIMIT_EXCEEDED");
    if (
      totals.tokens + totals.reservedTokens + tokens >
      policy.rolling_token_limit
    )
      fail("ROLLING_TOKEN_LIMIT_EXCEEDED");
    if (
      totals.cost + totals.reservedCost + binding.reserved_cost_minor >
      BigInt(policy.rolling_cost_minor_limit)
    )
      fail("ROLLING_COST_LIMIT_EXCEEDED");
  }
}

export interface SqliteBudgetLedgerOptions {
  readonly databasePath: string;
  readonly busyTimeoutMs?: number;
  readonly createParentDirectory?: boolean;
}
type StoredRow = Record<string, unknown>;
type Column = { name: string; type: string; notnull: number; pk: number };

export const defaultBudgetLedgerPath = () =>
  join(process.cwd(), ".local", "ai-budget-usage-ledger.sqlite");

export class SqliteBudgetLedger implements BudgetLedger {
  private database: DatabaseSync | undefined;
  constructor(private readonly options: SqliteBudgetLedgerOptions) {}
  initialize(): void {
    try {
      this.ensureOpen(true);
    } catch {
      fail("BUDGET_STORE_ERROR");
    }
  }
  validateSchema(): {
    valid: boolean;
    schema_version?: number;
    ddl_hash?: string;
    error?: string;
  } {
    try {
      this.assertSchema(this.ensureOpen(false));
      return {
        valid: true,
        schema_version: BUDGET_LEDGER_SCHEMA_VERSION,
        ddl_hash: BUDGET_LEDGER_DDL_HASH,
      };
    } catch (error) {
      return { valid: false, error: message(error) };
    }
  }
  reserve(
    binding: BudgetReservationBinding,
    policy: BudgetPolicy,
    at: Date,
  ): Reservation {
    if (!validateBudgetReservationBinding(binding) || !validDate(at))
      fail("BUDGET_BINDING_INVALID");
    assertPolicyForBinding(binding, policy);
    let db: DatabaseSync;
    try {
      db = this.ensureOpen(true);
      db.exec("BEGIN IMMEDIATE");
      this.expire(db, at.toISOString());
      const current = this.byExecution(db, binding.execution_id);
      if (current) {
        db.exec("ROLLBACK");
        fail(
          current.binding_hash === budgetBindingHash(binding)
            ? "DUPLICATE_EXECUTION_BLOCKED"
            : "BUDGET_BINDING_CONFLICT",
        );
      }
      const totals = this.scopeTotals(db, binding, rollingCutoff(at, policy));
      const tokens =
        binding.estimated_input_tokens + binding.estimated_output_tokens;
      if (totals.requests + 1 > policy.rolling_request_limit) {
        db.exec("ROLLBACK");
        fail("ROLLING_REQUEST_LIMIT_EXCEEDED");
      }
      if (totals.tokens + tokens > policy.rolling_token_limit) {
        db.exec("ROLLBACK");
        fail("ROLLING_TOKEN_LIMIT_EXCEEDED");
      }
      if (
        totals.cost + binding.reserved_cost_minor >
        BigInt(policy.rolling_cost_minor_limit)
      ) {
        db.exec("ROLLBACK");
        fail("ROLLING_COST_LIMIT_EXCEEDED");
      }
      const createdAt = at.toISOString();
      const id = reservationId(binding.execution_id);
      db.prepare(
        `INSERT INTO budget_reservation (
          execution_id, reservation_id, request_id, capability_id, profile_id, profile_version,
          budget_policy_id, budget_policy_version, pricing_id, pricing_evidence_id, pricing_evidence_hash,
          scope_id, currency, estimated_input_tokens, estimated_output_tokens, estimated_cost_minor,
          reserved_cost_minor, actual_usage_state, actual_input_tokens, actual_output_tokens, actual_cost_minor,
          reservation_status, reconciliation_status, created_at, expires_at, reconciled_at, released_at,
          schema_version, binding_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unknown', NULL, NULL, NULL, 'reserved', 'pending', ?, ?, NULL, NULL, ?, ?)`,
      ).run(
        binding.execution_id,
        id,
        binding.request_id,
        binding.capability_id,
        binding.profile_id,
        binding.profile_version,
        binding.budget_policy_id,
        binding.budget_policy_version,
        binding.pricing_id,
        binding.pricing_evidence_id,
        binding.pricing_evidence_hash,
        binding.scope_id,
        binding.currency,
        binding.estimated_input_tokens,
        binding.estimated_output_tokens,
        binding.estimated_cost_minor,
        binding.reserved_cost_minor,
        createdAt,
        expiry(at, policy),
        binding.schema_version,
        budgetBindingHash(binding),
      );
      db.exec("COMMIT");
      return this.requiredByReservation(db, id);
    } catch (error) {
      rollback(db!);
      if (error instanceof Error && error.name === "GovernanceError")
        throw error;
      return fail(
        isUnavailable(error)
          ? "BUDGET_STORE_UNAVAILABLE"
          : "BUDGET_STORE_ERROR",
      );
    }
  }
  reconcile(input: BudgetReconciliation): Reservation {
    if (!validReconciliation(input)) fail("BUDGET_RECONCILIATION_FAILED");
    let db: DatabaseSync;
    try {
      db = this.ensureOpen(false);
      db.exec("BEGIN IMMEDIATE");
      const current = this.requiredByReservation(db, input.reservation_id);
      if (current.execution_id !== input.execution_id)
        fail("BUDGET_RECONCILIATION_FAILED");
      if (current.reservation_status === "consumed") {
        db.exec("ROLLBACK");
        if (sameReconciliation(current, input)) return current;
        fail("BUDGET_RECONCILIATION_FAILED");
      }
      if (current.reservation_status !== "reserved")
        fail("BUDGET_RECONCILIATION_FAILED");
      db.prepare(
        `UPDATE budget_reservation SET
          actual_usage_state = ?, actual_input_tokens = ?, actual_output_tokens = ?, actual_cost_minor = ?,
          reservation_status = 'consumed', reconciliation_status = ?, reconciled_at = ?, released_at = ?
        WHERE reservation_id = ? AND execution_id = ? AND reservation_status = 'reserved'`,
      ).run(
        input.actual_usage_state,
        input.actual_input_tokens ?? null,
        input.actual_output_tokens ?? null,
        input.actual_cost_minor ?? null,
        input.actual_usage_state === "known" ? "reconciled" : "unavailable",
        input.reconciled_at,
        input.reconciled_at,
        input.reservation_id,
        input.execution_id,
      );
      db.exec("COMMIT");
      return this.requiredByReservation(db, input.reservation_id);
    } catch (error) {
      rollback(db!);
      if (error instanceof Error && error.name === "GovernanceError")
        throw error;
      return fail(
        isUnavailable(error)
          ? "BUDGET_STORE_UNAVAILABLE"
          : "BUDGET_STORE_ERROR",
      );
    }
  }
  release(id: string, executionId: string, at: Date): Reservation {
    if (!ID.test(id) || !ID.test(executionId) || !validDate(at))
      fail("BUDGET_RECONCILIATION_FAILED");
    let db: DatabaseSync;
    try {
      db = this.ensureOpen(false);
      db.exec("BEGIN IMMEDIATE");
      const current = this.requiredByReservation(db, id);
      if (current.execution_id !== executionId)
        fail("BUDGET_RECONCILIATION_FAILED");
      if (current.reservation_status === "released") {
        db.exec("ROLLBACK");
        return current;
      }
      if (current.reservation_status !== "reserved")
        fail("BUDGET_RECONCILIATION_FAILED");
      const iso = at.toISOString();
      db.prepare(
        `UPDATE budget_reservation SET actual_usage_state = 'unavailable', reservation_status = 'released',
          reconciliation_status = 'unavailable', reconciled_at = ?, released_at = ?
         WHERE reservation_id = ? AND execution_id = ? AND reservation_status = 'reserved'`,
      ).run(iso, iso, id, executionId);
      db.exec("COMMIT");
      return this.requiredByReservation(db, id);
    } catch (error) {
      rollback(db!);
      if (error instanceof Error && error.name === "GovernanceError")
        throw error;
      return fail(
        isUnavailable(error)
          ? "BUDGET_STORE_UNAVAILABLE"
          : "BUDGET_STORE_ERROR",
      );
    }
  }
  get(id: string): Reservation | undefined {
    try {
      const row = this.rowByReservation(this.ensureOpen(false), id);
      return row ? normalizeRow(row) : undefined;
    } catch {
      return undefined;
    }
  }
  inspect(id: string): BudgetInspectionResult {
    if (!ID.test(id))
      return { status: "store_error", error: "invalid reservation ID" };
    try {
      const row = this.rowByReservation(this.ensureOpen(false), id);
      if (!row) return { status: "ok" };
      const record = normalizeRow(row);
      return record
        ? { status: "ok", record: serializeRecord(record) }
        : { status: "store_error", error: "malformed budget reservation" };
    } catch (error) {
      return failure(error);
    }
  }
  listRecent(limit = 20): BudgetListResult {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    try {
      const statement = this.ensureOpen(false).prepare(
        "SELECT * FROM budget_reservation ORDER BY created_at DESC LIMIT ?",
      );
      statement.setReadBigInts(true);
      const records = (statement.all(safeLimit) as unknown as StoredRow[]).map(
        normalizeRow,
      );
      return records.every(Boolean)
        ? {
            status: "ok",
            records: (records as Reservation[]).map(serializeRecord),
          }
        : { status: "store_error", error: "malformed budget reservation" };
    } catch (error) {
      return failure(error);
    }
  }
  close(): void {
    this.database?.close();
    this.database = undefined;
  }
  private ensureOpen(allowInitialize: boolean): DatabaseSync {
    if (this.database) {
      this.assertSchema(this.database);
      return this.database;
    }
    const existed = existsSync(this.options.databasePath);
    if (!existed && !allowInitialize)
      throw new Error("budget store does not exist");
    if (!existed && this.options.createParentDirectory)
      mkdirSync(dirname(this.options.databasePath), { recursive: true });
    const db = new DatabaseSync(this.options.databasePath);
    const timeout = this.options.busyTimeoutMs ?? 250;
    if (!Number.isSafeInteger(timeout) || timeout < 0 || timeout > 60_000)
      throw new Error("invalid busy timeout");
    db.exec(`PRAGMA busy_timeout = ${timeout}; PRAGMA journal_mode = WAL;`);
    this.database = db;
    if (!existed) {
      try {
        db.exec("BEGIN IMMEDIATE");
        const count = (
          db.prepare("SELECT count(*) AS count FROM sqlite_master").get() as {
            count: number;
          }
        ).count;
        if (count === 0) {
          db.exec(SCHEMA_DDL);
          db.prepare(
            "INSERT INTO budget_ledger_schema(singleton, schema_version, ddl_hash, initialized_at) VALUES(1, ?, ?, ?)",
          ).run(
            BUDGET_LEDGER_SCHEMA_VERSION,
            BUDGET_LEDGER_DDL_HASH,
            new Date().toISOString(),
          );
        }
        db.exec("COMMIT");
      } catch (error) {
        rollback(db);
        throw error;
      }
    }
    this.assertSchema(db);
    return db;
  }
  private assertSchema(db: DatabaseSync) {
    const integrity = db.prepare("PRAGMA integrity_check").get() as {
      integrity_check?: string;
    };
    if (integrity.integrity_check !== "ok")
      throw new Error("budget store integrity check failed");
    const objects = db
      .prepare(
        "SELECT type, name, sql FROM sqlite_master WHERE name IN ('budget_ledger_schema', 'budget_reservation', 'budget_reservation_scope_window_idx', 'budget_reservation_expiry_idx', 'budget_reservation_binding_immutable', 'budget_reservation_transition_guard') ORDER BY type, name",
      )
      .all() as { type: string; name: string; sql: string | null }[];
    const expectedNames = [
      "budget_ledger_schema",
      "budget_reservation",
      "budget_reservation_scope_window_idx",
      "budget_reservation_expiry_idx",
      "budget_reservation_binding_immutable",
      "budget_reservation_transition_guard",
    ];
    if (
      objects.length !== expectedNames.length ||
      expectedNames.some((name) => !objects.some((o) => o.name === name))
    )
      throw new Error("budget store objects missing or replaced");
    const actualDdl = normalizeDdl(
      expectedNames
        .map(
          (name) => `${objects.find((object) => object.name === name)!.sql};`,
        )
        .join("\n"),
    );
    if (
      createHash("sha256").update(actualDdl).digest("hex") !==
      BUDGET_LEDGER_DDL_HASH
    )
      throw new Error("budget store DDL mismatch");
    const marker = db
      .prepare(
        "SELECT schema_version, ddl_hash FROM budget_ledger_schema WHERE singleton = 1",
      )
      .get() as { schema_version?: number; ddl_hash?: string } | undefined;
    if (marker?.schema_version !== BUDGET_LEDGER_SCHEMA_VERSION)
      throw new Error("budget store schema version mismatch");
    if (marker.ddl_hash !== BUDGET_LEDGER_DDL_HASH)
      throw new Error("budget store DDL hash mismatch");
    const columns = db
      .prepare("PRAGMA table_info(budget_reservation)")
      .all() as Column[];
    if (
      columns.length !== 29 ||
      columns[0]?.name !== "execution_id" ||
      columns[0].pk !== 1 ||
      columns[28]?.name !== "binding_hash"
    )
      throw new Error("budget store column contract mismatch");
  }
  private expire(db: DatabaseSync, now: string) {
    db.prepare(
      `UPDATE budget_reservation SET actual_usage_state = 'unavailable', reservation_status = 'expired',
       reconciliation_status = 'unavailable', reconciled_at = ?, released_at = ?
       WHERE reservation_status = 'reserved' AND expires_at <= ?`,
    ).run(now, now, now);
  }
  private scopeTotals(
    db: DatabaseSync,
    binding: BudgetReservationBinding,
    cutoff: string,
  ) {
    const statement = db.prepare(
      `SELECT
        count(*) AS requests,
        coalesce(sum(CASE WHEN reservation_status = 'consumed' AND actual_usage_state = 'known'
          THEN actual_input_tokens + actual_output_tokens ELSE estimated_input_tokens + estimated_output_tokens END), 0) AS tokens,
        coalesce(sum(CASE WHEN reservation_status = 'consumed' THEN coalesce(actual_cost_minor, reserved_cost_minor)
          ELSE reserved_cost_minor END), 0) AS cost
       FROM budget_reservation
       WHERE scope_id = ? AND currency = ? AND created_at >= ? AND reservation_status IN ('reserved', 'consumed')`,
    );
    statement.setReadBigInts(true);
    const row = statement.get(binding.scope_id, binding.currency, cutoff) as {
      requests: bigint;
      tokens: bigint;
      cost: bigint;
    };
    return {
      requests: Number(row.requests),
      tokens: Number(row.tokens),
      cost: row.cost,
    };
  }
  private rowByReservation(
    db: DatabaseSync,
    id: string,
  ): StoredRow | undefined {
    const statement = db.prepare(
      "SELECT * FROM budget_reservation WHERE reservation_id = ?",
    );
    statement.setReadBigInts(true);
    return statement.get(id) as StoredRow | undefined;
  }
  private byExecution(db: DatabaseSync, id: string): Reservation | undefined {
    const statement = db.prepare(
      "SELECT * FROM budget_reservation WHERE execution_id = ?",
    );
    statement.setReadBigInts(true);
    const row = statement.get(id) as StoredRow | undefined;
    if (!row) return undefined;
    const record = normalizeRow(row);
    if (!record) throw new Error("malformed budget reservation");
    return record;
  }
  private requiredByReservation(db: DatabaseSync, id: string): Reservation {
    const row = this.rowByReservation(db, id);
    const record = row && normalizeRow(row);
    return record ?? fail("BUDGET_RECONCILIATION_FAILED");
  }
}

const materialize = (
  binding: BudgetReservationBinding,
  values: Omit<
    Reservation,
    | keyof BudgetReservationBinding
    | "state"
    | "policy_id"
    | "reserved_tokens"
    | "released_cost_minor"
  > &
    Partial<Reservation>,
): Reservation => {
  const reservedTokens =
    binding.estimated_input_tokens + binding.estimated_output_tokens;
  const released =
    values.reservation_status === "released" ||
    values.reservation_status === "expired"
      ? binding.reserved_cost_minor
      : values.reservation_status === "consumed" &&
          values.actual_cost_minor !== undefined &&
          binding.reserved_cost_minor > values.actual_cost_minor
        ? binding.reserved_cost_minor - values.actual_cost_minor
        : 0n;
  return {
    ...binding,
    ...values,
    state: values.reservation_status,
    policy_id: binding.budget_policy_id,
    reserved_tokens: reservedTokens,
    released_cost_minor: released,
  } as Reservation;
};

const serializeRecord = (record: Reservation): SerializedBudgetReservation => {
  const {
    estimated_cost_minor,
    reserved_cost_minor,
    actual_cost_minor,
    released_cost_minor,
    ...metadata
  } = record;
  return {
    ...metadata,
    estimated_cost_minor: estimated_cost_minor.toString(),
    reserved_cost_minor: reserved_cost_minor.toString(),
    ...(actual_cost_minor === undefined
      ? {}
      : { actual_cost_minor: actual_cost_minor.toString() }),
    ...(released_cost_minor === undefined
      ? {}
      : { released_cost_minor: released_cost_minor.toString() }),
  };
};

const normalizeRow = (row: StoredRow): Reservation | undefined => {
  const binding: BudgetReservationBinding = {
    execution_id: String(row.execution_id),
    request_id: String(row.request_id),
    capability_id: String(row.capability_id),
    profile_id: String(row.profile_id),
    profile_version: String(row.profile_version),
    budget_policy_id: String(row.budget_policy_id),
    budget_policy_version: String(row.budget_policy_version),
    pricing_id: String(row.pricing_id),
    pricing_evidence_id: String(row.pricing_evidence_id),
    pricing_evidence_hash: String(row.pricing_evidence_hash),
    scope_id: String(row.scope_id),
    currency: String(row.currency),
    estimated_input_tokens: Number(row.estimated_input_tokens),
    estimated_output_tokens: Number(row.estimated_output_tokens),
    estimated_cost_minor: BigInt(row.estimated_cost_minor as bigint),
    reserved_cost_minor: BigInt(row.reserved_cost_minor as bigint),
    schema_version: Number(row.schema_version) as 1,
  };
  const actualState = String(row.actual_usage_state) as ActualUsageState;
  const reservationStatus = String(row.reservation_status) as ReservationStatus;
  const reconciliationStatus = String(
    row.reconciliation_status,
  ) as ReconciliationStatus;
  const candidate = materialize(binding, {
    reservation_id: String(row.reservation_id),
    binding_hash: String(row.binding_hash),
    actual_usage_state: actualState,
    ...(row.actual_input_tokens !== null
      ? { actual_input_tokens: Number(row.actual_input_tokens) }
      : {}),
    ...(row.actual_output_tokens !== null
      ? { actual_output_tokens: Number(row.actual_output_tokens) }
      : {}),
    ...(row.actual_cost_minor !== null
      ? { actual_cost_minor: BigInt(row.actual_cost_minor as bigint) }
      : {}),
    reservation_status: reservationStatus,
    reconciliation_status: reconciliationStatus,
    created_at: String(row.created_at),
    expires_at: String(row.expires_at),
    ...(row.reconciled_at !== null
      ? { reconciled_at: String(row.reconciled_at) }
      : {}),
    ...(row.released_at !== null
      ? { released_at: String(row.released_at) }
      : {}),
  });
  return validateBudgetReservationBinding(binding) &&
    candidate.binding_hash === budgetBindingHash(binding) &&
    ID.test(candidate.reservation_id) &&
    RESERVATION_STATES.has(reservationStatus) &&
    RECONCILIATION_STATES.has(reconciliationStatus) &&
    ACTUAL_USAGE_STATES.has(actualState) &&
    validIso(candidate.created_at) &&
    validIso(candidate.expires_at) &&
    (!candidate.reconciled_at || validIso(candidate.reconciled_at)) &&
    (!candidate.released_at || validIso(candidate.released_at))
    ? candidate
    : undefined;
};

const validReconciliation = (input: BudgetReconciliation) =>
  ID.test(input.reservation_id) &&
  ID.test(input.execution_id) &&
  validIso(input.reconciled_at) &&
  (input.actual_usage_state === "unavailable"
    ? input.actual_input_tokens === undefined &&
      input.actual_output_tokens === undefined &&
      input.actual_cost_minor === undefined
    : Number.isSafeInteger(input.actual_input_tokens) &&
      input.actual_input_tokens! >= 0 &&
      Number.isSafeInteger(input.actual_output_tokens) &&
      input.actual_output_tokens! >= 0 &&
      typeof input.actual_cost_minor === "bigint" &&
      input.actual_cost_minor >= 0n &&
      input.actual_cost_minor <= MAX_SAFE);
const sameReconciliation = (record: Reservation, input: BudgetReconciliation) =>
  record.actual_usage_state === input.actual_usage_state &&
  record.actual_input_tokens === input.actual_input_tokens &&
  record.actual_output_tokens === input.actual_output_tokens &&
  record.actual_cost_minor === input.actual_cost_minor;
const reconciledRecord = (current: Reservation, input: BudgetReconciliation) =>
  materialize(current, {
    ...current,
    actual_usage_state: input.actual_usage_state,
    ...(input.actual_input_tokens !== undefined
      ? { actual_input_tokens: input.actual_input_tokens }
      : {}),
    ...(input.actual_output_tokens !== undefined
      ? { actual_output_tokens: input.actual_output_tokens }
      : {}),
    ...(input.actual_cost_minor !== undefined
      ? { actual_cost_minor: input.actual_cost_minor }
      : {}),
    reservation_status: "consumed",
    reconciliation_status:
      input.actual_usage_state === "known" ? "reconciled" : "unavailable",
    reconciled_at: input.reconciled_at,
    released_at: input.reconciled_at,
  });
const validDate = (value: Date) => Number.isFinite(value.getTime());
const rollback = (db: DatabaseSync | undefined) => {
  try {
    db?.exec("ROLLBACK");
  } catch {
    /* transaction did not start */
  }
};
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const isUnavailable = (error: unknown) =>
  /unable to open|database is locked|database is busy|readonly|permission denied|no such file|does not exist/i.test(
    message(error),
  );
const failure = (
  error: unknown,
): Extract<
  BudgetInspectionResult,
  { status: "store_error" | "store_unavailable" }
> => ({
  status: isUnavailable(error) ? "store_unavailable" : "store_error",
  error: message(error),
});

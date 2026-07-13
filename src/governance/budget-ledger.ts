import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseAccountingUnits, type BudgetPolicy } from "./budget-policy.js";
import { governanceError } from "./errors.js";
import {
  compareRational,
  convertRationalToInteger,
  deterministicRationalHash,
  parseRational,
  type Rational,
} from "./rational.js";

export const BUDGET_LEDGER_SCHEMA_VERSION = 2 as const;
export const BUDGET_BINDING_DOMAIN =
  "vlatam-ai-lab:budget-reservation-binding:v2" as const;
const ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const HASH = /^[a-f0-9]{64}$/;
const CURRENCY = /^[A-Z]{3}$/;
const UNSIGNED = /^(0|[1-9][0-9]*)$/;
const SQLITE_MAX = 9_007_199_254_740_991n;

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
  pricing_contract_version TEXT NOT NULL,
  pricing_contract_hash TEXT NOT NULL,
  pricing_evidence_id TEXT NOT NULL,
  pricing_evidence_hash TEXT NOT NULL,
  pricing_evidence_version TEXT NOT NULL,
  pricing_evidence_reviewed_at TEXT NOT NULL,
  pricing_evidence_expires_at TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  currency TEXT NOT NULL,
  accounting_scale TEXT NOT NULL,
  reservation_rounding_policy TEXT NOT NULL CHECK (reservation_rounding_policy = 'CEILING'),
  reconciliation_rounding_policy TEXT NOT NULL CHECK (reconciliation_rounding_policy = 'CEILING'),
  estimated_input_tokens INTEGER NOT NULL CHECK (typeof(estimated_input_tokens) = 'integer' AND estimated_input_tokens >= 0),
  estimated_output_tokens INTEGER NOT NULL CHECK (typeof(estimated_output_tokens) = 'integer' AND estimated_output_tokens >= 0),
  estimated_exact_numerator TEXT NOT NULL,
  estimated_exact_denominator TEXT NOT NULL,
  estimated_accounting_units INTEGER NOT NULL CHECK (typeof(estimated_accounting_units) = 'integer' AND estimated_accounting_units >= 0),
  reserved_accounting_units INTEGER NOT NULL CHECK (typeof(reserved_accounting_units) = 'integer' AND reserved_accounting_units >= 0),
  actual_usage_state TEXT NOT NULL CHECK (actual_usage_state IN ('unknown', 'known', 'unavailable')),
  actual_input_tokens INTEGER CHECK (actual_input_tokens IS NULL OR (typeof(actual_input_tokens) = 'integer' AND actual_input_tokens >= 0)),
  actual_output_tokens INTEGER CHECK (actual_output_tokens IS NULL OR (typeof(actual_output_tokens) = 'integer' AND actual_output_tokens >= 0)),
  actual_exact_numerator TEXT,
  actual_exact_denominator TEXT,
  actual_accounting_units INTEGER CHECK (actual_accounting_units IS NULL OR (typeof(actual_accounting_units) = 'integer' AND actual_accounting_units >= 0)),
  reservation_status TEXT NOT NULL CHECK (reservation_status IN ('reserved', 'released', 'expired', 'consumed')),
  reconciliation_status TEXT NOT NULL CHECK (reconciliation_status IN ('pending', 'reconciled', 'unavailable')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  reconciled_at TEXT,
  released_at TEXT,
  schema_version INTEGER NOT NULL CHECK (schema_version = 2),
  binding_hash TEXT NOT NULL,
  CHECK (length(execution_id) BETWEEN 1 AND 128 AND execution_id NOT GLOB '*[^a-z0-9._-]*'),
  CHECK (length(request_id) BETWEEN 1 AND 128 AND request_id NOT GLOB '*[^a-z0-9._-]*'),
  CHECK (length(capability_id) BETWEEN 1 AND 128 AND capability_id NOT GLOB '*[^a-z0-9._-]*'),
  CHECK (length(profile_id) BETWEEN 1 AND 128 AND profile_id NOT GLOB '*[^a-z0-9._-]*'),
  CHECK (length(budget_policy_id) BETWEEN 1 AND 128 AND budget_policy_id NOT GLOB '*[^a-z0-9._-]*'),
  CHECK (length(scope_id) BETWEEN 1 AND 128 AND scope_id NOT GLOB '*[^a-z0-9._-]*'),
  CHECK (length(currency) = 3 AND currency NOT GLOB '*[^A-Z]*'),
  CHECK (length(pricing_contract_hash) = 64 AND pricing_contract_hash NOT GLOB '*[^a-f0-9]*'),
  CHECK (length(pricing_evidence_hash) = 64 AND pricing_evidence_hash NOT GLOB '*[^a-f0-9]*'),
  CHECK (accounting_scale = '1000000'),
  CHECK (estimated_exact_numerator GLOB '0' OR estimated_exact_numerator NOT GLOB '*[^0-9]*'),
  CHECK (estimated_exact_denominator NOT GLOB '*[^0-9]*' AND estimated_exact_denominator != '0'),
  CHECK (expires_at > created_at),
  CHECK ((actual_usage_state = 'known') = (actual_input_tokens IS NOT NULL AND actual_output_tokens IS NOT NULL AND actual_exact_numerator IS NOT NULL AND actual_exact_denominator IS NOT NULL AND actual_accounting_units IS NOT NULL)),
  CHECK ((reconciliation_status = 'pending') = (reconciled_at IS NULL)),
  CHECK ((reservation_status = 'reserved') = (released_at IS NULL)),
  CHECK (reservation_status != 'consumed' OR reconciliation_status IN ('reconciled', 'unavailable'))
);
CREATE INDEX budget_reservation_scope_window_idx ON budget_reservation(scope_id, currency, accounting_scale, created_at);
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
  readonly pricing_contract_version: string;
  readonly pricing_contract_hash: string;
  readonly pricing_evidence_id: string;
  readonly pricing_evidence_hash: string;
  readonly pricing_evidence_version: string;
  readonly pricing_evidence_reviewed_at: string;
  readonly pricing_evidence_expires_at: string;
  readonly scope_id: string;
  readonly currency: string;
  readonly accounting_scale: string;
  readonly reservation_rounding_policy: "CEILING";
  readonly reconciliation_rounding_policy: "CEILING";
  readonly estimated_input_tokens: number;
  readonly estimated_output_tokens: number;
  readonly estimated_exact_cost: Rational;
  readonly estimated_accounting_units: bigint;
  readonly reserved_accounting_units: bigint;
  readonly schema_version: typeof BUDGET_LEDGER_SCHEMA_VERSION;
}

export interface Reservation extends BudgetReservationBinding {
  readonly reservation_id: string;
  readonly binding_hash: string;
  readonly actual_usage_state: ActualUsageState;
  readonly actual_input_tokens?: number;
  readonly actual_output_tokens?: number;
  readonly actual_exact_cost?: Rational;
  readonly actual_accounting_units?: bigint;
  readonly reservation_status: ReservationStatus;
  readonly reconciliation_status: ReconciliationStatus;
  readonly created_at: string;
  readonly expires_at: string;
  readonly reconciled_at?: string;
  readonly released_at?: string;
  readonly state: ReservationStatus;
  readonly policy_id: string;
  readonly reserved_tokens: number;
  readonly released_accounting_units: bigint;
}

export interface BudgetReconciliation {
  readonly reservation_id: string;
  readonly execution_id: string;
  readonly pricing_contract_version: string;
  readonly pricing_contract_hash: string;
  readonly pricing_evidence_hash: string;
  readonly accounting_scale: string;
  readonly reconciliation_rounding_policy: "CEILING";
  readonly actual_usage_state: "known" | "unavailable";
  readonly actual_input_tokens?: number;
  readonly actual_output_tokens?: number;
  readonly actual_exact_cost?: Rational;
  readonly actual_accounting_units?: bigint;
  readonly reconciled_at: string;
}

export type SerializedBudgetReservation = Omit<
  Reservation,
  | "estimated_accounting_units"
  | "reserved_accounting_units"
  | "actual_accounting_units"
  | "released_accounting_units"
> & {
  readonly estimated_accounting_units: string;
  readonly reserved_accounting_units: string;
  readonly actual_accounting_units?: string;
  readonly released_accounting_units: string;
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
  pricing_contract_version: binding.pricing_contract_version,
  pricing_contract_hash: binding.pricing_contract_hash,
  pricing_evidence_id: binding.pricing_evidence_id,
  pricing_evidence_hash: binding.pricing_evidence_hash,
  pricing_evidence_version: binding.pricing_evidence_version,
  pricing_evidence_reviewed_at: binding.pricing_evidence_reviewed_at,
  pricing_evidence_expires_at: binding.pricing_evidence_expires_at,
  scope_id: binding.scope_id,
  currency: binding.currency,
  accounting_scale: binding.accounting_scale,
  reservation_rounding_policy: binding.reservation_rounding_policy,
  reconciliation_rounding_policy: binding.reconciliation_rounding_policy,
  estimated_input_tokens: binding.estimated_input_tokens,
  estimated_output_tokens: binding.estimated_output_tokens,
  estimated_exact_cost: parseRational(binding.estimated_exact_cost),
  estimated_accounting_units: binding.estimated_accounting_units.toString(),
  reserved_accounting_units: binding.reserved_accounting_units.toString(),
  schema_version: binding.schema_version,
});

export const budgetBindingHash = (binding: BudgetReservationBinding): string =>
  deterministicRationalHash(BUDGET_BINDING_DOMAIN, canonicalBinding(binding));

export const pricingEvidenceHash = (value: unknown): string =>
  deterministicRationalHash("vlatam-ai-lab:pricing-evidence:v2", value);

const validIso = (value: string) =>
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const validDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const money = (value: unknown): value is bigint =>
  typeof value === "bigint" && value >= 0n && value <= SQLITE_MAX;
const integer = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

export function validateBudgetReservationBinding(
  value: unknown,
): value is BudgetReservationBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const binding = value as BudgetReservationBinding;
  try {
    const exactKeys = Object.keys(canonicalBinding(binding)).filter(
      (key) => key !== "domain",
    );
    const keys = Object.keys(value);
    if (
      keys.length !== exactKeys.length ||
      keys.some((key) => !exactKeys.includes(key))
    )
      return false;
    const exact = parseRational(binding.estimated_exact_cost);
    return (
      ID.test(binding.execution_id) &&
      ID.test(binding.request_id) &&
      ID.test(binding.capability_id) &&
      ID.test(binding.profile_id) &&
      SEMVER.test(binding.profile_version) &&
      ID.test(binding.budget_policy_id) &&
      SEMVER.test(binding.budget_policy_version) &&
      ID.test(binding.pricing_id) &&
      SEMVER.test(binding.pricing_contract_version) &&
      HASH.test(binding.pricing_contract_hash) &&
      binding.pricing_evidence_id.length > 0 &&
      binding.pricing_evidence_id.length <= 256 &&
      HASH.test(binding.pricing_evidence_hash) &&
      SEMVER.test(binding.pricing_evidence_version) &&
      validDateOnly(binding.pricing_evidence_reviewed_at) &&
      validIso(binding.pricing_evidence_expires_at) &&
      ID.test(binding.scope_id) &&
      CURRENCY.test(binding.currency) &&
      UNSIGNED.test(binding.accounting_scale) &&
      binding.accounting_scale === "1000000" &&
      binding.reservation_rounding_policy === "CEILING" &&
      binding.reconciliation_rounding_policy === "CEILING" &&
      integer(binding.estimated_input_tokens) &&
      integer(binding.estimated_output_tokens) &&
      money(binding.estimated_accounting_units) &&
      money(binding.reserved_accounting_units) &&
      binding.estimated_accounting_units ===
        convertRationalToInteger(exact, binding.accounting_scale, "CEILING") &&
      binding.reserved_accounting_units >= binding.estimated_accounting_units &&
      binding.schema_version === BUDGET_LEDGER_SCHEMA_VERSION
    );
  } catch {
    return false;
  }
}

const fail = (code: Parameters<typeof governanceError>[0]): never => {
  throw governanceError(code);
};
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

const assertPolicyForBinding = (
  binding: BudgetReservationBinding,
  policy: BudgetPolicy,
) => {
  if (
    binding.budget_policy_id !== policy.policy_id ||
    binding.budget_policy_version !== policy.schema_version ||
    binding.scope_id !== policy.scope_id ||
    binding.currency !== policy.currency ||
    binding.accounting_scale !== policy.accounting_scale ||
    binding.reservation_rounding_policy !==
      policy.reservation_rounding_policy ||
    binding.reconciliation_rounding_policy !==
      policy.reconciliation_rounding_policy
  )
    fail("BUDGET_BINDING_CONFLICT");
  if (
    binding.estimated_input_tokens + binding.estimated_output_tokens >
    policy.max_estimated_tokens_per_request
  )
    fail("REQUEST_TOKEN_LIMIT_EXCEEDED");
  if (
    binding.estimated_accounting_units >
    parseAccountingUnits(policy.max_estimated_cost_accounting_units_per_request)
  )
    fail("REQUEST_COST_LIMIT_EXCEEDED");
};

interface ScopeTotals {
  requests: number;
  tokens: number;
  cost: bigint;
}

const releasedUnits = (
  reserved: bigint,
  status: ReservationStatus,
  actual?: bigint,
) =>
  status === "released" || status === "expired"
    ? reserved
    : status === "consumed" && actual !== undefined && reserved > actual
      ? reserved - actual
      : 0n;

const materialize = (
  binding: BudgetReservationBinding,
  values: Omit<
    Reservation,
    | keyof BudgetReservationBinding
    | "state"
    | "policy_id"
    | "reserved_tokens"
    | "released_accounting_units"
  > &
    Partial<Reservation>,
): Reservation =>
  ({
    ...binding,
    ...values,
    state: values.reservation_status,
    policy_id: binding.budget_policy_id,
    reserved_tokens:
      binding.estimated_input_tokens + binding.estimated_output_tokens,
    released_accounting_units: releasedUnits(
      binding.reserved_accounting_units,
      values.reservation_status,
      values.actual_accounting_units,
    ),
  }) as Reservation;

const assertRolling = (
  totals: ScopeTotals,
  binding: BudgetReservationBinding,
  policy: BudgetPolicy,
) => {
  const tokens =
    binding.estimated_input_tokens + binding.estimated_output_tokens;
  if (totals.requests + 1 > policy.rolling_request_limit)
    fail("ROLLING_REQUEST_LIMIT_EXCEEDED");
  if (totals.tokens + tokens > policy.rolling_token_limit)
    fail("ROLLING_TOKEN_LIMIT_EXCEEDED");
  if (
    totals.cost + binding.reserved_accounting_units >
    parseAccountingUnits(policy.rolling_cost_accounting_units_limit)
  )
    fail("ROLLING_COST_LIMIT_EXCEEDED");
};

const bindingMatchesReconciliation = (
  reservation: Reservation,
  input: BudgetReconciliation,
) =>
  reservation.pricing_contract_version === input.pricing_contract_version &&
  reservation.pricing_contract_hash === input.pricing_contract_hash &&
  reservation.pricing_evidence_hash === input.pricing_evidence_hash &&
  reservation.accounting_scale === input.accounting_scale &&
  reservation.reconciliation_rounding_policy ===
    input.reconciliation_rounding_policy;

const validReconciliation = (input: BudgetReconciliation): boolean => {
  try {
    if (
      !ID.test(input.reservation_id) ||
      !ID.test(input.execution_id) ||
      !SEMVER.test(input.pricing_contract_version) ||
      !HASH.test(input.pricing_contract_hash) ||
      !HASH.test(input.pricing_evidence_hash) ||
      input.accounting_scale !== "1000000" ||
      input.reconciliation_rounding_policy !== "CEILING" ||
      !validIso(input.reconciled_at)
    )
      return false;
    if (input.actual_usage_state === "unavailable")
      return (
        input.actual_input_tokens === undefined &&
        input.actual_output_tokens === undefined &&
        input.actual_exact_cost === undefined &&
        input.actual_accounting_units === undefined
      );
    if (
      !integer(input.actual_input_tokens) ||
      !integer(input.actual_output_tokens) ||
      !money(input.actual_accounting_units) ||
      input.actual_exact_cost === undefined
    )
      return false;
    const exact = parseRational(input.actual_exact_cost);
    return (
      input.actual_accounting_units ===
      convertRationalToInteger(exact, input.accounting_scale, "CEILING")
    );
  } catch {
    return false;
  }
};

const sameReconciliation = (record: Reservation, input: BudgetReconciliation) =>
  bindingMatchesReconciliation(record, input) &&
  record.actual_usage_state === input.actual_usage_state &&
  record.actual_input_tokens === input.actual_input_tokens &&
  record.actual_output_tokens === input.actual_output_tokens &&
  (record.actual_exact_cost === undefined
    ? input.actual_exact_cost === undefined
    : input.actual_exact_cost !== undefined &&
      compareRational(record.actual_exact_cost, input.actual_exact_cost) ===
        0) &&
  record.actual_accounting_units === input.actual_accounting_units;

const reconciledRecord = (current: Reservation, input: BudgetReconciliation) =>
  materialize(current, {
    ...current,
    actual_usage_state: input.actual_usage_state,
    ...(input.actual_input_tokens === undefined
      ? {}
      : { actual_input_tokens: input.actual_input_tokens }),
    ...(input.actual_output_tokens === undefined
      ? {}
      : { actual_output_tokens: input.actual_output_tokens }),
    ...(input.actual_exact_cost === undefined
      ? {}
      : { actual_exact_cost: parseRational(input.actual_exact_cost) }),
    ...(input.actual_accounting_units === undefined
      ? {}
      : { actual_accounting_units: input.actual_accounting_units }),
    reservation_status: "consumed",
    reconciliation_status:
      input.actual_usage_state === "known" ? "reconciled" : "unavailable",
    reconciled_at: input.reconciled_at,
    released_at: input.reconciled_at,
  });

export class InMemoryBudgetLedger implements BudgetLedger {
  private readonly reservations = new Map<string, Reservation>();
  private readonly executions = new Map<string, Reservation>();

  reserve(
    binding: BudgetReservationBinding,
    policy: BudgetPolicy,
    at: Date,
  ): Reservation {
    if (!validateBudgetReservationBinding(binding) || !validDate(at))
      fail("BUDGET_BINDING_INVALID");
    assertPolicyForBinding(binding, policy);
    this.expire(at);
    const current = this.executions.get(binding.execution_id);
    if (current)
      fail(
        current.binding_hash === budgetBindingHash(binding)
          ? "DUPLICATE_EXECUTION_BLOCKED"
          : "BUDGET_BINDING_CONFLICT",
      );
    assertRolling(this.totals(binding, at, policy), binding, policy);
    const record = materialize(binding, {
      reservation_id: reservationId(binding.execution_id),
      binding_hash: budgetBindingHash(binding),
      actual_usage_state: "unknown",
      reservation_status: "reserved",
      reconciliation_status: "pending",
      created_at: at.toISOString(),
      expires_at: expiry(at, policy),
    });
    this.replace(record);
    return record;
  }

  reconcile(input: BudgetReconciliation): Reservation {
    if (!validReconciliation(input)) fail("BUDGET_RECONCILIATION_FAILED");
    const current = this.reservations.get(input.reservation_id);
    if (!current) fail("BUDGET_RECONCILIATION_FAILED");
    const found = current as Reservation;
    if (
      found.execution_id !== input.execution_id ||
      !bindingMatchesReconciliation(found, input)
    )
      fail("BUDGET_RECONCILIATION_FAILED");
    if (found.reservation_status === "consumed") {
      if (sameReconciliation(found, input)) return found;
      fail("BUDGET_RECONCILIATION_FAILED");
    }
    if (found.reservation_status !== "reserved")
      fail("BUDGET_RECONCILIATION_FAILED");
    const updated = reconciledRecord(found, input);
    this.replace(updated);
    return updated;
  }

  release(id: string, executionId: string, at: Date): Reservation {
    const current = this.reservations.get(id);
    if (!current) fail("BUDGET_RECONCILIATION_FAILED");
    const found = current as Reservation;
    if (found.execution_id !== executionId)
      fail("BUDGET_RECONCILIATION_FAILED");
    if (found.reservation_status === "released") return found;
    if (found.reservation_status !== "reserved")
      fail("BUDGET_RECONCILIATION_FAILED");
    const updated = materialize(found, {
      ...found,
      actual_usage_state: "unavailable",
      reservation_status: "released",
      reconciliation_status: "unavailable",
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
      (record) => record.scope_id === scope,
    );
    if (!records.length) return undefined;
    return records.reduce<ScopeTotals>(
      (totals, record) => {
        if (record.reservation_status === "reserved") {
          totals.requests += 1;
          totals.tokens += record.reserved_tokens;
          totals.cost += record.reserved_accounting_units;
        } else if (record.reservation_status === "consumed") {
          totals.requests += 1;
          totals.tokens +=
            record.actual_usage_state === "known"
              ? record.actual_input_tokens! + record.actual_output_tokens!
              : record.reserved_tokens;
          totals.cost +=
            record.actual_accounting_units ?? record.reserved_accounting_units;
        }
        return totals;
      },
      { requests: 0, tokens: 0, cost: 0n },
    );
  }

  private replace(record: Reservation) {
    this.reservations.set(record.reservation_id, record);
    this.executions.set(record.execution_id, record);
  }

  private expire(at: Date) {
    for (const record of this.reservations.values())
      if (
        record.reservation_status === "reserved" &&
        record.expires_at <= at.toISOString()
      )
        this.replace(
          materialize(record, {
            ...record,
            actual_usage_state: "unavailable",
            reservation_status: "expired",
            reconciliation_status: "unavailable",
            reconciled_at: at.toISOString(),
            released_at: at.toISOString(),
          }),
        );
  }

  private totals(
    binding: BudgetReservationBinding,
    at: Date,
    policy: BudgetPolicy,
  ): ScopeTotals {
    const cutoff = rollingCutoff(at, policy);
    const totals: ScopeTotals = { requests: 0, tokens: 0, cost: 0n };
    for (const record of this.reservations.values()) {
      if (
        record.scope_id !== binding.scope_id ||
        record.currency !== binding.currency ||
        record.accounting_scale !== binding.accounting_scale ||
        record.created_at < cutoff ||
        !["reserved", "consumed"].includes(record.reservation_status)
      )
        continue;
      totals.requests += 1;
      totals.tokens +=
        record.reservation_status === "consumed" &&
        record.actual_usage_state === "known"
          ? record.actual_input_tokens! + record.actual_output_tokens!
          : record.reserved_tokens;
      totals.cost +=
        record.reservation_status === "consumed"
          ? (record.actual_accounting_units ?? record.reserved_accounting_units)
          : record.reserved_accounting_units;
    }
    return totals;
  }
}

export interface SqliteBudgetLedgerOptions {
  readonly databasePath: string;
  readonly busyTimeoutMs?: number;
  readonly createParentDirectory?: boolean;
}
type StoredRow = Record<string, unknown>;

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
    let db: DatabaseSync | undefined;
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
      assertRolling(
        this.scopeTotals(db, binding, rollingCutoff(at, policy)),
        binding,
        policy,
      );
      const id = reservationId(binding.execution_id);
      db.prepare(
        `INSERT INTO budget_reservation (
          execution_id, reservation_id, request_id, capability_id, profile_id, profile_version,
          budget_policy_id, budget_policy_version, pricing_id, pricing_contract_version, pricing_contract_hash,
          pricing_evidence_id, pricing_evidence_hash, pricing_evidence_version, pricing_evidence_reviewed_at,
          pricing_evidence_expires_at, scope_id, currency, accounting_scale, reservation_rounding_policy,
          reconciliation_rounding_policy, estimated_input_tokens, estimated_output_tokens,
          estimated_exact_numerator, estimated_exact_denominator, estimated_accounting_units,
          reserved_accounting_units, actual_usage_state, actual_input_tokens, actual_output_tokens,
          actual_exact_numerator, actual_exact_denominator, actual_accounting_units, reservation_status,
          reconciliation_status, created_at, expires_at, reconciled_at, released_at, schema_version, binding_hash
        ) VALUES (${Array.from({ length: 41 }, () => "?").join(", ")})`,
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
        binding.pricing_contract_version,
        binding.pricing_contract_hash,
        binding.pricing_evidence_id,
        binding.pricing_evidence_hash,
        binding.pricing_evidence_version,
        binding.pricing_evidence_reviewed_at,
        binding.pricing_evidence_expires_at,
        binding.scope_id,
        binding.currency,
        binding.accounting_scale,
        binding.reservation_rounding_policy,
        binding.reconciliation_rounding_policy,
        binding.estimated_input_tokens,
        binding.estimated_output_tokens,
        binding.estimated_exact_cost.numerator,
        binding.estimated_exact_cost.denominator,
        binding.estimated_accounting_units,
        binding.reserved_accounting_units,
        "unknown",
        null,
        null,
        null,
        null,
        null,
        "reserved",
        "pending",
        at.toISOString(),
        expiry(at, policy),
        null,
        null,
        binding.schema_version,
        budgetBindingHash(binding),
      );
      db.exec("COMMIT");
      return this.requiredByReservation(db, id);
    } catch (error) {
      rollback(db);
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
    let db: DatabaseSync | undefined;
    try {
      db = this.ensureOpen(false);
      db.exec("BEGIN IMMEDIATE");
      const current = this.requiredByReservation(db, input.reservation_id);
      if (
        current.execution_id !== input.execution_id ||
        !bindingMatchesReconciliation(current, input)
      )
        fail("BUDGET_RECONCILIATION_FAILED");
      if (current.reservation_status === "consumed") {
        db.exec("ROLLBACK");
        if (sameReconciliation(current, input)) return current;
        fail("BUDGET_RECONCILIATION_FAILED");
      }
      if (current.reservation_status !== "reserved")
        fail("BUDGET_RECONCILIATION_FAILED");
      db.prepare(
        `UPDATE budget_reservation SET actual_usage_state = ?, actual_input_tokens = ?, actual_output_tokens = ?,
          actual_exact_numerator = ?, actual_exact_denominator = ?, actual_accounting_units = ?,
          reservation_status = 'consumed', reconciliation_status = ?, reconciled_at = ?, released_at = ?
         WHERE reservation_id = ? AND execution_id = ? AND reservation_status = 'reserved'`,
      ).run(
        input.actual_usage_state,
        input.actual_input_tokens ?? null,
        input.actual_output_tokens ?? null,
        input.actual_exact_cost?.numerator ?? null,
        input.actual_exact_cost?.denominator ?? null,
        input.actual_accounting_units ?? null,
        input.actual_usage_state === "known" ? "reconciled" : "unavailable",
        input.reconciled_at,
        input.reconciled_at,
        input.reservation_id,
        input.execution_id,
      );
      db.exec("COMMIT");
      return this.requiredByReservation(db, input.reservation_id);
    } catch (error) {
      rollback(db);
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
    let db: DatabaseSync | undefined;
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
      rollback(db);
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
    const database = new DatabaseSync(this.options.databasePath);
    const timeout = this.options.busyTimeoutMs ?? 250;
    if (!Number.isSafeInteger(timeout) || timeout < 0 || timeout > 60_000)
      throw new Error("invalid busy timeout");
    database.exec(
      `PRAGMA busy_timeout = ${timeout}; PRAGMA journal_mode = WAL;`,
    );
    this.database = database;
    if (!existed) {
      try {
        database.exec("BEGIN IMMEDIATE");
        const count = (
          database
            .prepare("SELECT count(*) AS count FROM sqlite_master")
            .get() as {
            count: number;
          }
        ).count;
        if (count === 0) {
          database.exec(SCHEMA_DDL);
          database
            .prepare(
              "INSERT INTO budget_ledger_schema(singleton, schema_version, ddl_hash, initialized_at) VALUES(1, ?, ?, ?)",
            )
            .run(
              BUDGET_LEDGER_SCHEMA_VERSION,
              BUDGET_LEDGER_DDL_HASH,
              new Date().toISOString(),
            );
        }
        database.exec("COMMIT");
      } catch (error) {
        rollback(database);
        throw error;
      }
    }
    this.assertSchema(database);
    return database;
  }

  private assertSchema(database: DatabaseSync) {
    const integrity = database.prepare("PRAGMA integrity_check").get() as {
      integrity_check?: string;
    };
    if (integrity.integrity_check !== "ok")
      throw new Error("budget store integrity check failed");
    const expectedNames = [
      "budget_ledger_schema",
      "budget_reservation",
      "budget_reservation_scope_window_idx",
      "budget_reservation_expiry_idx",
      "budget_reservation_binding_immutable",
      "budget_reservation_transition_guard",
    ];
    const objects = database
      .prepare(
        `SELECT type, name, sql FROM sqlite_master WHERE name IN (${expectedNames.map(() => "?").join(",")}) ORDER BY type, name`,
      )
      .all(...expectedNames) as {
      type: string;
      name: string;
      sql: string | null;
    }[];
    if (
      objects.length !== expectedNames.length ||
      expectedNames.some(
        (name) => !objects.some((object) => object.name === name),
      )
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
    const marker = database
      .prepare(
        "SELECT schema_version, ddl_hash FROM budget_ledger_schema WHERE singleton = 1",
      )
      .get() as { schema_version?: number; ddl_hash?: string } | undefined;
    if (
      marker?.schema_version !== BUDGET_LEDGER_SCHEMA_VERSION ||
      marker.ddl_hash !== BUDGET_LEDGER_DDL_HASH
    )
      throw new Error("budget store schema identity mismatch");
    const expectedColumns = [
      "execution_id",
      "reservation_id",
      "request_id",
      "capability_id",
      "profile_id",
      "profile_version",
      "budget_policy_id",
      "budget_policy_version",
      "pricing_id",
      "pricing_contract_version",
      "pricing_contract_hash",
      "pricing_evidence_id",
      "pricing_evidence_hash",
      "pricing_evidence_version",
      "pricing_evidence_reviewed_at",
      "pricing_evidence_expires_at",
      "scope_id",
      "currency",
      "accounting_scale",
      "reservation_rounding_policy",
      "reconciliation_rounding_policy",
      "estimated_input_tokens",
      "estimated_output_tokens",
      "estimated_exact_numerator",
      "estimated_exact_denominator",
      "estimated_accounting_units",
      "reserved_accounting_units",
      "actual_usage_state",
      "actual_input_tokens",
      "actual_output_tokens",
      "actual_exact_numerator",
      "actual_exact_denominator",
      "actual_accounting_units",
      "reservation_status",
      "reconciliation_status",
      "created_at",
      "expires_at",
      "reconciled_at",
      "released_at",
      "schema_version",
      "binding_hash",
    ];
    const columns = database
      .prepare("PRAGMA table_info(budget_reservation)")
      .all() as {
      name: string;
      pk: number;
    }[];
    if (
      columns.length !== expectedColumns.length ||
      columns.some((column, index) => column.name !== expectedColumns[index]) ||
      columns[0]?.pk !== 1
    )
      throw new Error("budget store column contract mismatch");
  }

  private expire(database: DatabaseSync, now: string) {
    database
      .prepare(
        `UPDATE budget_reservation SET actual_usage_state = 'unavailable', reservation_status = 'expired',
          reconciliation_status = 'unavailable', reconciled_at = ?, released_at = ?
         WHERE reservation_status = 'reserved' AND expires_at <= ?`,
      )
      .run(now, now, now);
  }

  private scopeTotals(
    database: DatabaseSync,
    binding: BudgetReservationBinding,
    cutoff: string,
  ): ScopeTotals {
    const statement = database.prepare(
      `SELECT count(*) AS requests,
        coalesce(sum(CASE WHEN reservation_status = 'consumed' AND actual_usage_state = 'known'
          THEN actual_input_tokens + actual_output_tokens ELSE estimated_input_tokens + estimated_output_tokens END), 0) AS tokens,
        coalesce(sum(CASE WHEN reservation_status = 'consumed' THEN coalesce(actual_accounting_units, reserved_accounting_units)
          ELSE reserved_accounting_units END), 0) AS cost
       FROM budget_reservation
       WHERE scope_id = ? AND currency = ? AND accounting_scale = ? AND created_at >= ?
         AND reservation_status IN ('reserved', 'consumed')`,
    );
    statement.setReadBigInts(true);
    const row = statement.get(
      binding.scope_id,
      binding.currency,
      binding.accounting_scale,
      cutoff,
    ) as { requests: bigint; tokens: bigint; cost: bigint };
    return {
      requests: Number(row.requests),
      tokens: Number(row.tokens),
      cost: row.cost,
    };
  }

  private rowByReservation(
    database: DatabaseSync,
    id: string,
  ): StoredRow | undefined {
    const statement = database.prepare(
      "SELECT * FROM budget_reservation WHERE reservation_id = ?",
    );
    statement.setReadBigInts(true);
    return statement.get(id) as StoredRow | undefined;
  }

  private byExecution(
    database: DatabaseSync,
    id: string,
  ): Reservation | undefined {
    const statement = database.prepare(
      "SELECT * FROM budget_reservation WHERE execution_id = ?",
    );
    statement.setReadBigInts(true);
    const row = statement.get(id) as StoredRow | undefined;
    if (!row) return undefined;
    const record = normalizeRow(row);
    if (!record) throw new Error("malformed budget reservation");
    return record;
  }

  private requiredByReservation(
    database: DatabaseSync,
    id: string,
  ): Reservation {
    const row = this.rowByReservation(database, id);
    return (row && normalizeRow(row)) ?? fail("BUDGET_RECONCILIATION_FAILED");
  }
}

const serializeRecord = (record: Reservation): SerializedBudgetReservation => {
  const {
    estimated_accounting_units,
    reserved_accounting_units,
    actual_accounting_units,
    released_accounting_units,
    ...metadata
  } = record;
  return {
    ...metadata,
    estimated_accounting_units: estimated_accounting_units.toString(),
    reserved_accounting_units: reserved_accounting_units.toString(),
    ...(actual_accounting_units === undefined
      ? {}
      : { actual_accounting_units: actual_accounting_units.toString() }),
    released_accounting_units: released_accounting_units.toString(),
  };
};

const normalizeRow = (row: StoredRow): Reservation | undefined => {
  try {
    const binding: BudgetReservationBinding = {
      execution_id: String(row.execution_id),
      request_id: String(row.request_id),
      capability_id: String(row.capability_id),
      profile_id: String(row.profile_id),
      profile_version: String(row.profile_version),
      budget_policy_id: String(row.budget_policy_id),
      budget_policy_version: String(row.budget_policy_version),
      pricing_id: String(row.pricing_id),
      pricing_contract_version: String(row.pricing_contract_version),
      pricing_contract_hash: String(row.pricing_contract_hash),
      pricing_evidence_id: String(row.pricing_evidence_id),
      pricing_evidence_hash: String(row.pricing_evidence_hash),
      pricing_evidence_version: String(row.pricing_evidence_version),
      pricing_evidence_reviewed_at: String(row.pricing_evidence_reviewed_at),
      pricing_evidence_expires_at: String(row.pricing_evidence_expires_at),
      scope_id: String(row.scope_id),
      currency: String(row.currency),
      accounting_scale: String(row.accounting_scale),
      reservation_rounding_policy: String(
        row.reservation_rounding_policy,
      ) as "CEILING",
      reconciliation_rounding_policy: String(
        row.reconciliation_rounding_policy,
      ) as "CEILING",
      estimated_input_tokens: Number(row.estimated_input_tokens),
      estimated_output_tokens: Number(row.estimated_output_tokens),
      estimated_exact_cost: {
        numerator: String(row.estimated_exact_numerator),
        denominator: String(row.estimated_exact_denominator),
      },
      estimated_accounting_units: BigInt(
        row.estimated_accounting_units as bigint,
      ),
      reserved_accounting_units: BigInt(
        row.reserved_accounting_units as bigint,
      ),
      schema_version: Number(row.schema_version) as 2,
    };
    const actualState = String(row.actual_usage_state) as ActualUsageState;
    const reservationStatus = String(
      row.reservation_status,
    ) as ReservationStatus;
    const reconciliationStatus = String(
      row.reconciliation_status,
    ) as ReconciliationStatus;
    const candidate = materialize(binding, {
      reservation_id: String(row.reservation_id),
      binding_hash: String(row.binding_hash),
      actual_usage_state: actualState,
      ...(row.actual_input_tokens === null
        ? {}
        : { actual_input_tokens: Number(row.actual_input_tokens) }),
      ...(row.actual_output_tokens === null
        ? {}
        : { actual_output_tokens: Number(row.actual_output_tokens) }),
      ...(row.actual_exact_numerator === null
        ? {}
        : {
            actual_exact_cost: {
              numerator: String(row.actual_exact_numerator),
              denominator: String(row.actual_exact_denominator),
            },
          }),
      ...(row.actual_accounting_units === null
        ? {}
        : {
            actual_accounting_units: BigInt(
              row.actual_accounting_units as bigint,
            ),
          }),
      reservation_status: reservationStatus,
      reconciliation_status: reconciliationStatus,
      created_at: String(row.created_at),
      expires_at: String(row.expires_at),
      ...(row.reconciled_at === null
        ? {}
        : { reconciled_at: String(row.reconciled_at) }),
      ...(row.released_at === null
        ? {}
        : { released_at: String(row.released_at) }),
    });
    if (
      !validateBudgetReservationBinding(binding) ||
      candidate.binding_hash !== budgetBindingHash(binding) ||
      !ID.test(candidate.reservation_id) ||
      !["reserved", "released", "expired", "consumed"].includes(
        reservationStatus,
      ) ||
      !["pending", "reconciled", "unavailable"].includes(
        reconciliationStatus,
      ) ||
      !["unknown", "known", "unavailable"].includes(actualState) ||
      !validIso(candidate.created_at) ||
      !validIso(candidate.expires_at) ||
      (candidate.reconciled_at !== undefined &&
        !validIso(candidate.reconciled_at)) ||
      (candidate.released_at !== undefined && !validIso(candidate.released_at))
    )
      return undefined;
    if (candidate.actual_exact_cost) parseRational(candidate.actual_exact_cost);
    return candidate;
  } catch {
    return undefined;
  }
};

const validDate = (value: Date) => Number.isFinite(value.getTime());
const rollback = (database: DatabaseSync | undefined) => {
  try {
    database?.exec("ROLLBACK");
  } catch {
    // A transaction was not active.
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

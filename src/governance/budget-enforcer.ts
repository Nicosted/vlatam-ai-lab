import type { CapabilityRequest } from "../capabilities/index.js";
import type { ExecutionProfile } from "../execution/execution-profile.js";
import { BudgetPolicyCatalog } from "./budget-policy.js";
import {
  BUDGET_LEDGER_SCHEMA_VERSION,
  SqliteBudgetLedger,
  defaultBudgetLedgerPath,
  type BudgetLedger,
  type BudgetReconciliation,
  type Reservation,
} from "./budget-ledger.js";
import {
  PricingCatalog,
  pricingContractHash,
  type PricingEntry,
} from "./pricing.js";
import {
  calculateCost,
  costToAccountingUnits,
  type CostBreakdown,
} from "./cost.js";
import { estimateUsage, type NormalizedUsage } from "./usage.js";
import { governanceError } from "./errors.js";

export interface GovernanceReservation {
  readonly policy: ReturnType<BudgetPolicyCatalog["resolve"]>;
  readonly pricing: PricingEntry;
  readonly estimated_usage: NormalizedUsage;
  readonly estimated_cost: CostBreakdown;
  readonly reservation: Reservation;
}

export class BudgetEnforcer {
  constructor(
    readonly options: {
      policyCatalog?: BudgetPolicyCatalog;
      pricingCatalog?: PricingCatalog;
      ledger?: BudgetLedger;
      clock?: () => Date;
    } = {},
  ) {}
  get ledger(): BudgetLedger {
    return this.options.ledger ?? sharedLedger;
  }
  reserve(
    executionId: string,
    request: CapabilityRequest,
    privacyClearedRequest: CapabilityRequest,
    profile: ExecutionProfile,
  ): GovernanceReservation {
    const at = (this.options.clock ?? (() => new Date()))();
    const policy = (this.options.policyCatalog ?? defaultPolicies).resolve(
      request,
      profile,
    );
    const usage = estimateUsage(
      privacyClearedRequest,
      profile.configuration.max_output_tokens ?? 2048,
    );
    const pricing = (this.options.pricingCatalog ?? defaultPricing).resolve(
      profile,
      at,
      policy.require_verified_pricing,
    );
    if (pricing.currency !== policy.currency)
      throw governanceError("GOVERNANCE_CONFIGURATION_INVALID");
    const cost = calculateCost(usage, pricing, "estimated");
    const accountingUnits = costToAccountingUnits(
      cost,
      policy.accounting_scale,
      policy.reservation_rounding_policy,
    );
    const reservation = this.ledger.reserve(
      {
        execution_id: executionId,
        request_id: request.request_id,
        capability_id: request.capability_id,
        profile_id: profile.profile_id,
        profile_version: profile.contract_version,
        budget_policy_id: policy.policy_id,
        budget_policy_version: policy.schema_version,
        pricing_id: pricing.pricing_id,
        pricing_contract_version: pricing.pricing_contract_version,
        pricing_contract_hash: pricingContractHash(pricing),
        pricing_evidence_id: pricing.evidence.evidence_id,
        pricing_evidence_hash: pricing.evidence.evidence_hash,
        pricing_evidence_version: pricing.evidence.evidence_version,
        pricing_evidence_reviewed_at: pricing.evidence.reviewed_at,
        pricing_evidence_expires_at: pricing.evidence.expires_at,
        scope_id: policy.scope_id,
        currency: policy.currency,
        accounting_scale: policy.accounting_scale,
        reservation_rounding_policy: policy.reservation_rounding_policy,
        reconciliation_rounding_policy: policy.reconciliation_rounding_policy,
        estimated_input_tokens: usage.input_tokens!,
        estimated_output_tokens: usage.output_tokens!,
        estimated_exact_cost: cost.total_exact_cost,
        estimated_accounting_units: accountingUnits,
        reserved_accounting_units: accountingUnits,
        schema_version: BUDGET_LEDGER_SCHEMA_VERSION,
      },
      policy,
      at,
    );
    return {
      policy,
      pricing,
      estimated_usage: usage,
      estimated_cost: cost,
      reservation,
    };
  }
  reconcile(
    reservation: GovernanceReservation,
    executionId: string,
    input: Omit<
      BudgetReconciliation,
      | "reservation_id"
      | "execution_id"
      | "pricing_contract_version"
      | "pricing_contract_hash"
      | "pricing_evidence_hash"
      | "accounting_scale"
      | "reconciliation_rounding_policy"
      | "reconciled_at"
    >,
  ): Reservation {
    return this.ledger.reconcile({
      reservation_id: reservation.reservation.reservation_id,
      execution_id: executionId,
      pricing_contract_version:
        reservation.reservation.pricing_contract_version,
      pricing_contract_hash: reservation.reservation.pricing_contract_hash,
      pricing_evidence_hash: reservation.reservation.pricing_evidence_hash,
      accounting_scale: reservation.reservation.accounting_scale,
      reconciliation_rounding_policy:
        reservation.reservation.reconciliation_rounding_policy,
      ...input,
      reconciled_at: (this.options.clock ?? (() => new Date()))().toISOString(),
    });
  }
  release(
    reservation: GovernanceReservation,
    executionId: string,
  ): Reservation {
    return this.ledger.release(
      reservation.reservation.reservation_id,
      executionId,
      (this.options.clock ?? (() => new Date()))(),
    );
  }
}

const defaultPolicies = new BudgetPolicyCatalog();
const defaultPricing = new PricingCatalog();
const sharedLedger = new SqliteBudgetLedger({
  databasePath: defaultBudgetLedgerPath(),
  createParentDirectory: true,
});

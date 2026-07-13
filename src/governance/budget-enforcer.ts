import type { CapabilityRequest } from "../capabilities/index.js";
import type { ExecutionProfile } from "../execution/execution-profile.js";
import { BudgetPolicyCatalog } from "./budget-policy.js";
import {
  BUDGET_LEDGER_SCHEMA_VERSION,
  SqliteBudgetLedger,
  defaultBudgetLedgerPath,
  pricingEvidenceHash,
  type BudgetLedger,
  type BudgetReconciliation,
  type Reservation,
} from "./budget-ledger.js";
import { PricingCatalog, type PricingEntry } from "./pricing.js";
import { calculateCost, type CostBreakdown } from "./cost.js";
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
        pricing_evidence_id: pricing.evidence_ref,
        pricing_evidence_hash: pricingEvidenceHash(pricing),
        scope_id: policy.scope_id,
        currency: policy.currency,
        estimated_input_tokens: usage.input_tokens!,
        estimated_output_tokens: usage.output_tokens!,
        estimated_cost_minor: cost.total_cost_minor,
        reserved_cost_minor: cost.total_cost_minor,
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
      "reservation_id" | "execution_id" | "reconciled_at"
    >,
  ): Reservation {
    return this.ledger.reconcile({
      reservation_id: reservation.reservation.reservation_id,
      execution_id: executionId,
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

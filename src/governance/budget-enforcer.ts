import type { CapabilityRequest } from '../capabilities/index.js';
import type { ExecutionProfile } from '../execution/execution-profile.js';
import { BudgetPolicyCatalog } from './budget-policy.js';
import { InMemoryBudgetLedger, type Reservation } from './budget-ledger.js';
import { PricingCatalog, type PricingEntry } from './pricing.js';
import { calculateCost, type CostBreakdown } from './cost.js';
import { estimateUsage, type NormalizedUsage } from './usage.js';
export interface GovernanceReservation { readonly policy: ReturnType<BudgetPolicyCatalog['resolve']>; readonly pricing: PricingEntry; readonly estimated_usage: NormalizedUsage; readonly estimated_cost: CostBreakdown; readonly reservation: Reservation; }
export class BudgetEnforcer {
  constructor(readonly options: { policyCatalog?: BudgetPolicyCatalog; pricingCatalog?: PricingCatalog; ledger?: InMemoryBudgetLedger; clock?: () => Date } = {}) {}
  get ledger(): InMemoryBudgetLedger { return this.options.ledger ?? sharedLedger; }
  reserve(executionId: string, request: CapabilityRequest, privacyClearedRequest: CapabilityRequest, profile: ExecutionProfile): GovernanceReservation {
    const policy = (this.options.policyCatalog ?? defaultPolicies).resolve(request, profile);
    const usage = estimateUsage(privacyClearedRequest, profile.configuration.max_output_tokens ?? 2048);
    const pricing = (this.options.pricingCatalog ?? defaultPricing).resolve(profile, (this.options.clock ?? (()=>new Date()))(), policy.require_verified_pricing);
    const cost = calculateCost(usage, pricing, 'estimated');
    const reservation = this.ledger.reserve(executionId, policy, usage.total_tokens!, cost.total_cost_minor);
    return { policy, pricing, estimated_usage: usage, estimated_cost: cost, reservation };
  }
}
const defaultPolicies = new BudgetPolicyCatalog(); const defaultPricing = new PricingCatalog(); const sharedLedger = new InMemoryBudgetLedger();

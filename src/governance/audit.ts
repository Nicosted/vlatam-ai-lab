import type { NormalizedUsage } from "./usage.js";
import type { ReservationState } from "./budget-ledger.js";
import type { GovernanceErrorCode } from "./errors.js";
import type { ExactEstimateDelta } from "./cost.js";
import type { Rational } from "./rational.js";
export interface UsageAuditRecord {
  readonly execution_id: string;
  readonly request_id: string;
  readonly capability_id: string;
  readonly profile_id?: string | undefined;
  readonly provider_id?: string | undefined;
  readonly model_id?: string | undefined;
  readonly estimated_usage?: NormalizedUsage | undefined;
  readonly actual_usage?: NormalizedUsage | undefined;
  readonly pricing_id?: string | undefined;
  readonly pricing_contract_version?: string | undefined;
  readonly pricing_contract_hash?: string | undefined;
  readonly estimated_exact_cost?: Rational | undefined;
  readonly actual_exact_cost?: Rational | undefined;
  readonly actual_over_estimate?: ExactEstimateDelta | undefined;
  readonly currency?: string | undefined;
  readonly calculation_version?: string | undefined;
}
export interface BudgetAuditRecord {
  readonly execution_id: string;
  readonly reservation_id?: string | undefined;
  readonly policy_id?: string | undefined;
  readonly scope_id?: string | undefined;
  readonly accounting_scale?: string | undefined;
  readonly reservation_rounding_policy?: "CEILING" | undefined;
  readonly reconciliation_rounding_policy?: "CEILING" | undefined;
  readonly estimated_accounting_units?: string | undefined;
  readonly reserved_accounting_units?: string | undefined;
  readonly actual_accounting_units?: string | undefined;
  readonly released_accounting_units?: string | undefined;
  readonly final_state: ReservationState;
  readonly reason_code?: GovernanceErrorCode | undefined;
  readonly started_at: string;
  readonly finished_at: string;
}
const FORBIDDEN =
  /prompt|messages|content|excerpt|api[_-]?key|secret|bearer|authorization|reviewer|legal_text|raw_response/i;
export function assertGovernanceAuditMetadataOnly(audit: unknown): void {
  if (FORBIDDEN.test(JSON.stringify(audit))) throw governanceErrorForLeak();
}
function governanceErrorForLeak(): Error {
  return new Error("Governance audit contains forbidden fields.");
}

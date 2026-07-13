import { ExecutionError } from "../execution/errors.js";

export const GOVERNANCE_ERROR_CODES = [
  "USAGE_ESTIMATE_UNAVAILABLE",
  "USAGE_UNAVAILABLE",
  "USAGE_INVALID",
  "PRICING_MISSING",
  "PRICING_AMBIGUOUS",
  "PRICING_EXPIRED",
  "PRICING_UNVERIFIED",
  "PRICING_CONTRACT_MIGRATION_REQUIRED",
  "COST_CALCULATION_FAILED",
  "BUDGET_POLICY_MISSING",
  "BUDGET_POLICY_AMBIGUOUS",
  "REQUEST_TOKEN_LIMIT_EXCEEDED",
  "REQUEST_COST_LIMIT_EXCEEDED",
  "ROLLING_REQUEST_LIMIT_EXCEEDED",
  "ROLLING_TOKEN_LIMIT_EXCEEDED",
  "ROLLING_COST_LIMIT_EXCEEDED",
  "BUDGET_RESERVATION_FAILED",
  "BUDGET_EXHAUSTED",
  "BUDGET_BINDING_INVALID",
  "BUDGET_BINDING_CONFLICT",
  "DUPLICATE_EXECUTION_BLOCKED",
  "BUDGET_STORE_UNAVAILABLE",
  "BUDGET_STORE_ERROR",
  "BUDGET_RECONCILIATION_FAILED",
  "GOVERNANCE_CONFIGURATION_INVALID",
] as const;
export type GovernanceErrorCode = (typeof GOVERNANCE_ERROR_CODES)[number];

const MESSAGES: Record<GovernanceErrorCode, string> = Object.fromEntries(
  GOVERNANCE_ERROR_CODES.map((code) => [
    code,
    "Execution was blocked by usage and budget governance.",
  ]),
) as Record<GovernanceErrorCode, string>;

export class GovernanceError extends ExecutionError {
  constructor(readonly governance_code: GovernanceErrorCode) {
    super(governance_code, MESSAGES[governance_code]);
    this.name = "GovernanceError";
  }
}
export const governanceError = (code: GovernanceErrorCode): GovernanceError =>
  new GovernanceError(code);

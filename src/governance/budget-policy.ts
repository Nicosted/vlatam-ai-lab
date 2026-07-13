import policiesJson from "../../config/ai-budget-policies.json" with { type: "json" };
import type { CapabilityRequest } from "../capabilities/index.js";
import type { ExecutionProfile } from "../execution/execution-profile.js";
import { governanceError } from "./errors.js";

export const BUDGET_POLICY_VERSION = "2.0.0" as const;
export const LEDGER_ACCOUNTING_SCALE = "1000000" as const;
export const RESERVATION_ROUNDING_POLICY = "CEILING" as const;
export const RECONCILIATION_ROUNDING_POLICY = "CEILING" as const;
export const DISPLAY_ROUNDING_POLICY = "HALF_EVEN" as const;

export interface BudgetPolicy {
  readonly policy_id: string;
  readonly schema_version: typeof BUDGET_POLICY_VERSION;
  readonly priority: number;
  readonly capability_id: string;
  readonly profile_id?: string;
  readonly profile_class?: string;
  readonly execution_mode: "replay" | "live";
  readonly request_classification: string | "*";
  readonly environment_id: string;
  readonly project_id: string;
  readonly tenant_id: string;
  readonly scope_id: string;
  readonly currency: string;
  readonly accounting_scale: string;
  readonly reservation_rounding_policy: "CEILING";
  readonly reconciliation_rounding_policy: "CEILING";
  readonly display_rounding_policy: "HALF_EVEN";
  readonly require_usage: boolean;
  readonly require_verified_pricing: boolean;
  readonly behavior: "hard_block" | "human_review_required";
  readonly max_estimated_tokens_per_request: number;
  readonly max_actual_tokens_per_request: number;
  readonly max_estimated_cost_accounting_units_per_request: string;
  readonly max_actual_cost_accounting_units_per_request: string;
  readonly rolling_request_limit: number;
  readonly rolling_token_limit: number;
  readonly rolling_cost_accounting_units_limit: string;
  readonly rolling_window_seconds?: number;
  readonly reservation_ttl_seconds?: number;
}

export interface BudgetPolicyCatalogData {
  readonly schema_version: typeof BUDGET_POLICY_VERSION;
  readonly policies: readonly BudgetPolicy[];
}

const UNSIGNED = /^(0|[1-9][0-9]*)$/;
const SQLITE_MAX = 9_007_199_254_740_991n;

export function parseAccountingUnits(value: string): bigint {
  if (!UNSIGNED.test(value))
    throw governanceError("GOVERNANCE_CONFIGURATION_INVALID");
  const parsed = BigInt(value);
  if (parsed > SQLITE_MAX)
    throw governanceError("GOVERNANCE_CONFIGURATION_INVALID");
  return parsed;
}

function validPolicy(policy: BudgetPolicy): boolean {
  try {
    if (
      policy.schema_version !== BUDGET_POLICY_VERSION ||
      ![
        policy.environment_id,
        policy.project_id,
        policy.tenant_id,
        policy.scope_id,
      ].every((value) => /^[a-z0-9][a-z0-9._-]+$/.test(value)) ||
      policy.currency !== "USD" ||
      policy.accounting_scale !== LEDGER_ACCOUNTING_SCALE ||
      policy.reservation_rounding_policy !== RESERVATION_ROUNDING_POLICY ||
      policy.reconciliation_rounding_policy !==
        RECONCILIATION_ROUNDING_POLICY ||
      policy.display_rounding_policy !== DISPLAY_ROUNDING_POLICY ||
      ![
        policy.max_estimated_tokens_per_request,
        policy.max_actual_tokens_per_request,
        policy.rolling_request_limit,
        policy.rolling_token_limit,
      ].every((value) => Number.isSafeInteger(value) && value >= 0) ||
      ![
        policy.rolling_window_seconds ?? 86_400,
        policy.reservation_ttl_seconds ?? 300,
      ].every((value) => Number.isSafeInteger(value) && value > 0)
    )
      return false;
    parseAccountingUnits(
      policy.max_estimated_cost_accounting_units_per_request,
    );
    parseAccountingUnits(policy.max_actual_cost_accounting_units_per_request);
    parseAccountingUnits(policy.rolling_cost_accounting_units_limit);
    return true;
  } catch {
    return false;
  }
}

export class BudgetPolicyCatalog {
  constructor(
    readonly data: BudgetPolicyCatalogData = policiesJson as BudgetPolicyCatalogData,
  ) {
    if (
      data.schema_version !== BUDGET_POLICY_VERSION ||
      new Set(data.policies.map((policy) => policy.policy_id)).size !==
        data.policies.length ||
      data.policies.some((policy) => !validPolicy(policy))
    )
      throw governanceError("GOVERNANCE_CONFIGURATION_INVALID");
  }

  resolve(request: CapabilityRequest, profile: ExecutionProfile): BudgetPolicy {
    const classification = request.context?.data_classification;
    const matches = this.data.policies
      .filter(
        (policy) =>
          policy.capability_id === request.capability_id &&
          policy.execution_mode === profile.mode &&
          (policy.profile_id === undefined ||
            policy.profile_id === profile.profile_id) &&
          (policy.profile_class === undefined ||
            policy.profile_class === profile.eligibility.budget_class) &&
          (policy.request_classification === "*" ||
            policy.request_classification === classification),
      )
      .sort((left, right) => right.priority - left.priority);
    if (!matches.length) throw governanceError("BUDGET_POLICY_MISSING");
    if (matches.length > 1 && matches[0]!.priority === matches[1]!.priority)
      throw governanceError("BUDGET_POLICY_AMBIGUOUS");
    return matches[0]!;
  }
}

import {
  BUDGET_LEDGER_SCHEMA_VERSION,
  pricingContractHash,
  type BudgetPolicy,
  type BudgetReservationBinding,
  type BudgetReconciliation,
  type PriceContract,
  type PricingEntry,
} from "../../src/governance/index.js";

export const rate = (
  usage_category: PriceContract["usage_category"],
  numerator: string,
  denominator = "1",
  billing_unit: PriceContract["billing_unit"] = usage_category === "request"
    ? "request"
    : "million_tokens",
): PriceContract => ({
  contract_version: "1.0.0",
  amount: { numerator, denominator },
  currency: "USD",
  billing_unit,
  usage_category,
});

export const pricing = (
  overrides: Partial<PricingEntry> = {},
): PricingEntry => ({
  pricing_id: "pricing.test.v2",
  schema_version: "2.0.0",
  pricing_contract_version: "1.0.0",
  provider_id: "replay",
  model_id: "model.test",
  currency: "USD",
  rates: [rate("input", "10"), rate("output", "20")],
  effective_from: "1970-01-01T00:00:00.000Z",
  permitted_execution_modes: ["replay"],
  evidence: {
    evidence_id: "repo:test-pricing",
    evidence_hash: "a".repeat(64),
    evidence_version: "1.0.0",
    reviewed_at: "2026-07-13",
    expires_at: "2099-01-01T00:00:00.000Z",
    status: "fixture",
  },
  ...overrides,
});

export const policy = (
  overrides: Partial<BudgetPolicy> = {},
): BudgetPolicy => ({
  policy_id: "policy.test.v2",
  schema_version: "2.0.0",
  priority: 1,
  capability_id: "cap.test",
  profile_class: "development",
  execution_mode: "replay",
  request_classification: "*",
  environment_id: "local",
  project_id: "project.test",
  tenant_id: "tenant.test",
  scope_id: "scope.test",
  currency: "USD",
  accounting_scale: "1000000",
  reservation_rounding_policy: "CEILING",
  reconciliation_rounding_policy: "CEILING",
  display_rounding_policy: "HALF_EVEN",
  require_usage: true,
  require_verified_pricing: true,
  behavior: "hard_block",
  max_estimated_tokens_per_request: 100,
  max_actual_tokens_per_request: 100,
  max_estimated_cost_accounting_units_per_request: "100",
  max_actual_cost_accounting_units_per_request: "100",
  rolling_request_limit: 10,
  rolling_token_limit: 1000,
  rolling_cost_accounting_units_limit: "1000",
  rolling_window_seconds: 86400,
  reservation_ttl_seconds: 300,
  ...overrides,
});

export const binding = (
  overrides: Partial<BudgetReservationBinding> = {},
): BudgetReservationBinding => {
  const price = pricing();
  return {
    execution_id: "execution.test",
    request_id: "request.test",
    capability_id: "cap.test",
    profile_id: "profile.test",
    profile_version: "1.0.0",
    budget_policy_id: "policy.test.v2",
    budget_policy_version: "2.0.0",
    pricing_id: price.pricing_id,
    pricing_contract_version: price.pricing_contract_version,
    pricing_contract_hash: pricingContractHash(price),
    pricing_evidence_id: price.evidence.evidence_id,
    pricing_evidence_hash: price.evidence.evidence_hash,
    pricing_evidence_version: price.evidence.evidence_version,
    pricing_evidence_reviewed_at: price.evidence.reviewed_at,
    pricing_evidence_expires_at: price.evidence.expires_at,
    scope_id: "scope.test",
    currency: "USD",
    accounting_scale: "1000000",
    reservation_rounding_policy: "CEILING",
    reconciliation_rounding_policy: "CEILING",
    estimated_input_tokens: 5,
    estimated_output_tokens: 5,
    estimated_exact_cost: { numerator: "1", denominator: "100000" },
    estimated_accounting_units: 10n,
    reserved_accounting_units: 10n,
    schema_version: BUDGET_LEDGER_SCHEMA_VERSION,
    ...overrides,
  };
};

export const reconciliation = (
  reservation_id: string,
  overrides: Partial<BudgetReconciliation> = {},
): BudgetReconciliation => {
  const source = binding();
  return {
    reservation_id,
    execution_id: source.execution_id,
    pricing_contract_version: source.pricing_contract_version,
    pricing_contract_hash: source.pricing_contract_hash,
    pricing_evidence_hash: source.pricing_evidence_hash,
    accounting_scale: source.accounting_scale,
    reconciliation_rounding_policy: "CEILING",
    actual_usage_state: "known",
    actual_input_tokens: 3,
    actual_output_tokens: 3,
    actual_exact_cost: { numerator: "3", denominator: "500000" },
    actual_accounting_units: 6n,
    reconciled_at: "2026-07-13T12:00:01.000Z",
    ...overrides,
  };
};

import type { NormalizedUsage } from "./usage.js";
import {
  PRICING_USAGE_CATEGORIES,
  type PriceContract,
  type PricingEntry,
  type PricingUsageCategory,
} from "./pricing.js";
import {
  addRational,
  compareRational,
  convertRationalToInteger,
  createRational,
  multiplyRational,
  parseRational,
  rationalFromUnsigned,
  subtractRationalAbsolute,
  type MonetaryRoundingPolicy,
  type Rational,
} from "./rational.js";
import { governanceError } from "./errors.js";

export const COST_CALCULATION_VERSION = "2.0.0" as const;

export interface CostCharge {
  readonly usage_category: PricingUsageCategory;
  readonly usage_amount: string;
  readonly billing_unit: PriceContract["billing_unit"];
  readonly unit_price: Rational;
  readonly exact_cost: Rational;
}

export interface CostBreakdown {
  readonly charges: readonly CostCharge[];
  readonly total_exact_cost: Rational;
  readonly currency: string;
  readonly pricing_id: string;
  readonly pricing_contract_version: PricingEntry["pricing_contract_version"];
  readonly calculation_version: typeof COST_CALCULATION_VERSION;
  readonly status: "estimated" | "actual";
}

export interface ExactEstimateDelta {
  readonly direction: "below" | "equal" | "above";
  readonly amount: Rational;
}

const fail = (): never => {
  throw governanceError("COST_CALCULATION_FAILED");
};

export function calculateUsagePrice(
  usageAmount: string | bigint,
  rate: PriceContract,
): Rational {
  const usage = rationalFromUnsigned(usageAmount);
  const price = parseRational(rate.amount);
  if (rate.billing_unit === "token" || rate.billing_unit === "request")
    return multiplyRational(usage, price);
  if (rate.billing_unit === "million_tokens")
    return multiplyRational(
      usage,
      createRational(
        BigInt(price.numerator),
        BigInt(price.denominator) * 1_000_000n,
      ),
    );
  return fail();
}

function usageByCategory(
  usage: NormalizedUsage,
  pricing: PricingEntry,
): ReadonlyMap<PricingUsageCategory, bigint> {
  if (
    usage.status !== "complete" ||
    usage.input_tokens === undefined ||
    usage.output_tokens === undefined
  )
    throw governanceError("USAGE_UNAVAILABLE");
  const priced = new Set(pricing.rates.map((rate) => rate.usage_category));
  const cacheRead = usage.cached_input_tokens;
  const cacheWrite = usage.cache_write_input_tokens;
  const reasoning = usage.reasoning_tokens;
  if (
    (priced.has("cache_read") && cacheRead === undefined) ||
    (priced.has("cache_write") && cacheWrite === undefined) ||
    (priced.has("reasoning") && reasoning === undefined)
  )
    throw governanceError("USAGE_UNAVAILABLE");
  const input =
    BigInt(usage.input_tokens) -
    BigInt(priced.has("cache_read") ? (cacheRead ?? 0) : 0) -
    BigInt(priced.has("cache_write") ? (cacheWrite ?? 0) : 0);
  const output =
    BigInt(usage.output_tokens) -
    BigInt(priced.has("reasoning") ? (reasoning ?? 0) : 0);
  if (input < 0n || output < 0n) fail();
  const values = new Map<PricingUsageCategory, bigint>([
    ["input", input],
    ["output", output],
    ["request", BigInt(usage.request_count)],
  ]);
  if (cacheRead !== undefined) values.set("cache_read", BigInt(cacheRead));
  if (cacheWrite !== undefined) values.set("cache_write", BigInt(cacheWrite));
  if (reasoning !== undefined) values.set("reasoning", BigInt(reasoning));
  return values;
}

export function validateCostBreakdown(
  value: CostBreakdown,
  pricing: PricingEntry,
): void {
  if (
    value.currency !== pricing.currency ||
    value.pricing_id !== pricing.pricing_id ||
    value.pricing_contract_version !== pricing.pricing_contract_version ||
    value.calculation_version !== COST_CALCULATION_VERSION
  )
    fail();
  let total = createRational(0n, 1n);
  const categories = new Set<PricingUsageCategory>();
  for (const charge of value.charges) {
    if (
      categories.has(charge.usage_category) ||
      !(PRICING_USAGE_CATEGORIES as readonly string[]).includes(
        charge.usage_category,
      )
    )
      fail();
    categories.add(charge.usage_category);
    parseRational(charge.unit_price);
    parseRational(charge.exact_cost);
    total = addRational(total, charge.exact_cost);
  }
  if (compareRational(total, value.total_exact_cost) !== 0) fail();
}

export function calculateCost(
  usage: NormalizedUsage,
  pricing: PricingEntry,
  status: "estimated" | "actual",
): CostBreakdown {
  try {
    const values = usageByCategory(usage, pricing);
    const charges = [...pricing.rates]
      .sort((left, right) =>
        left.usage_category.localeCompare(right.usage_category),
      )
      .map((rate): CostCharge => {
        const amount = values.get(rate.usage_category);
        if (amount === undefined) throw governanceError("USAGE_UNAVAILABLE");
        return {
          usage_category: rate.usage_category,
          usage_amount: amount.toString(),
          billing_unit: rate.billing_unit,
          unit_price: parseRational(rate.amount),
          exact_cost: calculateUsagePrice(amount, rate),
        };
      });
    const total = charges.reduce(
      (sum, charge) => addRational(sum, charge.exact_cost),
      createRational(0n, 1n),
    );
    const result: CostBreakdown = {
      charges,
      total_exact_cost: total,
      currency: pricing.currency,
      pricing_id: pricing.pricing_id,
      pricing_contract_version: pricing.pricing_contract_version,
      calculation_version: COST_CALCULATION_VERSION,
      status,
    };
    validateCostBreakdown(result, pricing);
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === "GovernanceError") throw error;
    return fail();
  }
}

export function exactEstimateDelta(
  estimated: Rational,
  actual: Rational,
): ExactEstimateDelta {
  const comparison = compareRational(actual, estimated);
  return {
    direction: comparison === 0 ? "equal" : comparison < 0 ? "below" : "above",
    amount: subtractRationalAbsolute(actual, estimated),
  };
}

export function costToAccountingUnits(
  cost: CostBreakdown | Rational,
  accountingScale: string,
  roundingPolicy: MonetaryRoundingPolicy,
): bigint {
  return convertRationalToInteger(
    "total_exact_cost" in cost ? cost.total_exact_cost : cost,
    accountingScale,
    roundingPolicy,
  );
}

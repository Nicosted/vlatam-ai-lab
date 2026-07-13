import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GovernanceError,
  PricingCatalog,
  addRational,
  calculateCost,
  calculateUsagePrice,
  canonicalRationalJson,
  compareRational,
  convertRationalToInteger,
  createRational,
  deterministicRationalHash,
  multiplyRational,
  normalizeUsage,
  parseRational,
  pricingContractHash,
  validateCostBreakdown,
  validatePriceContract,
  type NormalizedUsage,
} from "../../src/governance/index.js";
import { pricing, rate } from "../helpers/governance.js";

const usage = (overrides: Partial<NormalizedUsage> = {}): NormalizedUsage => ({
  input_tokens: 1000,
  output_tokens: 1000,
  total_tokens: 2000,
  cached_input_tokens: 0,
  cache_write_input_tokens: 0,
  reasoning_tokens: 0,
  request_count: 1,
  source: "fixture",
  status: "complete",
  confidence: "high",
  fixture_origin: "synthetic",
  ...overrides,
});

describe("lossless rational pricing", () => {
  it("accepts only canonical reduced unsigned rationals", () => {
    assert.deepEqual(parseRational({ numerator: "0", denominator: "1" }), {
      numerator: "0",
      denominator: "1",
    });
    for (const invalid of [
      { numerator: "1", denominator: "0" },
      { numerator: "-1", denominator: "1" },
      { numerator: "+1", denominator: "1" },
      { numerator: "1.0", denominator: "1" },
      { numerator: "1e3", denominator: "1" },
      { numerator: " 1", denominator: "1" },
      { numerator: "01", denominator: "1" },
      { numerator: "2", denominator: "4" },
      { numerator: "nope", denominator: "1" },
      { numerator: "1", denominator: "1", extra: "x" },
    ])
      assert.throws(() => parseRational(invalid), GovernanceError);
  });

  it("normalizes equivalent fractions only at construction boundaries", () => {
    assert.deepEqual(createRational(2n, 4n), {
      numerator: "1",
      denominator: "2",
    });
    assert.deepEqual(
      createRational(150n, 1_000_000_000n),
      createRational(3n, 20_000_000n),
    );
    assert.throws(
      () => parseRational({ numerator: "150", denominator: "1000000000" }),
      GovernanceError,
    );
  });

  it("performs 10,000 deterministic additions and multiplications without drift", () => {
    let sum = createRational(0n, 1n);
    let product = createRational(1n, 1n);
    for (let index = 0; index < 10_000; index += 1) {
      sum = addRational(sum, { numerator: "1", denominator: "3" });
      product = multiplyRational(product, { numerator: "1", denominator: "1" });
    }
    assert.deepEqual(sum, { numerator: "10000", denominator: "3" });
    assert.deepEqual(product, { numerator: "1", denominator: "1" });
  });

  it("hashes object order and rate order deterministically", () => {
    const first = { b: { numerator: "1", denominator: "3" }, a: "x" };
    const second = { a: "x", b: { denominator: "3", numerator: "1" } };
    assert.equal(
      deterministicRationalHash("test", first),
      deterministicRationalHash("test", second),
    );
    const price = pricing({ rates: [rate("output", "2"), rate("input", "1")] });
    assert.equal(
      pricingContractHash(price),
      pricingContractHash({ ...price, rates: [...price.rates].reverse() }),
    );
    assert.equal(canonicalRationalJson(first), canonicalRationalJson(second));
  });

  it("represents MiniMax cache-write pricing and OpenRouter sub-cent token prices exactly", () => {
    const minimax = rate("cache_write", "3", "8", "million_tokens");
    assert.deepEqual(calculateUsagePrice("1000000", minimax), {
      numerator: "3",
      denominator: "8",
    });
    const openRouter = rate("input", "3", "20000000", "token");
    assert.deepEqual(calculateUsagePrice("1", openRouter), {
      numerator: "3",
      denominator: "20000000",
    });
  });

  it("keeps every usage category separate and totals independently of category order", () => {
    const prices = pricing({
      rates: [
        rate("request", "1", "100", "request"),
        rate("reasoning", "5"),
        rate("cache_write", "3", "8"),
        rate("cache_read", "3", "50"),
        rate("output", "6", "5"),
        rate("input", "3", "10"),
      ],
    });
    const normalized = usage({
      input_tokens: 10,
      output_tokens: 10,
      total_tokens: 20,
      cached_input_tokens: 2,
      cache_write_input_tokens: 3,
      reasoning_tokens: 4,
    });
    const first = calculateCost(normalized, prices, "actual");
    const second = calculateCost(
      normalized,
      { ...prices, rates: [...prices.rates].reverse() },
      "actual",
    );
    assert.deepEqual(first.total_exact_cost, second.total_exact_cost);
    assert.deepEqual(
      first.charges.map((charge) => charge.usage_category),
      ["cache_read", "cache_write", "input", "output", "reasoning", "request"],
    );
    assert.throws(
      () =>
        validateCostBreakdown(
          {
            ...first,
            total_exact_cost: { numerator: "0", denominator: "1" },
          },
          prices,
        ),
      GovernanceError,
      "runtime validation recomputes the exact category sum",
    );
  });

  it("distinguishes absent pricing from explicitly free pricing", () => {
    const absent = pricing({ rates: [rate("input", "1")] });
    const free = pricing({
      rates: [rate("input", "1"), rate("request", "0", "1", "request")],
    });
    assert.equal(
      absent.rates.some((entry) => entry.usage_category === "request"),
      false,
    );
    assert.deepEqual(
      free.rates.find((entry) => entry.usage_category === "request")?.amount,
      { numerator: "0", denominator: "1" },
    );
    assert.equal(
      calculateCost(usage(), absent, "actual").charges.some(
        (charge) => charge.usage_category === "request",
      ),
      false,
      "absence stays absent and is not emitted as a zero charge",
    );
  });

  it("keeps unknown optional usage unknown while deterministic fixtures can declare zero", () => {
    const reported = normalizeUsage({
      input_tokens: 1,
      output_tokens: 2,
      total_tokens: 3,
    });
    assert.equal(reported.cached_input_tokens, undefined);
    const fixture = normalizeUsage({
      input_tokens: 1,
      output_tokens: 2,
      total_tokens: 3,
      source: "fixture",
      fixture_origin: "synthetic",
    });
    assert.equal(fixture.cached_input_tokens, 0);
    assert.equal(normalizeUsage(undefined).input_tokens, undefined);
  });

  it("rejects incompatible units, unknown versions, currencies, categories, and fields", () => {
    const base = rate("input", "1");
    for (const invalid of [
      { ...base, contract_version: "2.0.0" },
      { ...base, currency: "EUR" },
      { ...base, usage_category: "unknown" },
      { ...base, billing_unit: "request" },
      { ...base, unknown: true },
    ])
      assert.equal(validatePriceContract(invalid), false);
  });

  it("ceil conversion never rounds down and HALF_EVEN remains display-only", () => {
    const exact = { numerator: "3", denominator: "8" };
    assert.equal(
      convertRationalToInteger(exact, "1000000", "CEILING"),
      375000n,
    );
    assert.equal(
      convertRationalToInteger(
        { numerator: "1", denominator: "3" },
        "1",
        "CEILING",
      ),
      1n,
    );
    assert.equal(
      convertRationalToInteger(
        { numerator: "1", denominator: "2" },
        "1",
        "HALF_EVEN",
      ),
      0n,
    );
  });

  it("fails controlled when addition or multiplication resource bounds are exceeded", () => {
    const huge = { numerator: "9".repeat(3000), denominator: "1" };
    assert.throws(() => multiplyRational(huge, huge), GovernanceError);
    assert.throws(
      () =>
        addRational(
          { numerator: "1", denominator: `1${"0".repeat(2999)}` },
          { numerator: "1", denominator: "9".repeat(3000) },
        ),
      GovernanceError,
    );
  });

  it("fails legacy pricing closed without inferred decimal migration", () => {
    const catalog = new PricingCatalog({
      schema_version: "2.0.0",
      prices: [
        pricing({
          provider_id: "*",
          model_id: "*",
          permitted_execution_modes: ["live"],
        }),
      ],
      legacy_prices: [
        {
          pricing_id: "legacy",
          provider_id: "legacy-provider",
          model_id: "legacy-model",
          permitted_execution_modes: ["live"],
          price_per_million: 0.375,
        },
      ],
    });
    assert.throws(
      () =>
        catalog.resolve(
          {
            provider_id: "legacy-provider",
            model_id: "legacy-model",
            mode: "live",
          } as never,
          new Date("2026-07-13T00:00:00.000Z"),
          true,
        ),
      (error) =>
        error instanceof GovernanceError &&
        error.governance_code === "PRICING_CONTRACT_MIGRATION_REQUIRED",
    );
  });

  it("compares exact totals without floating point", () => {
    assert.equal(
      compareRational(
        { numerator: "1", denominator: "3" },
        createRational(2n, 6n),
      ),
      0,
    );
  });
});

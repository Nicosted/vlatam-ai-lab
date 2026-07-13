import pricingJson from "../../config/ai-pricing.json" with { type: "json" };
import type { ExecutionProfile } from "../execution/execution-profile.js";
import { governanceError } from "./errors.js";
import {
  deterministicRationalHash,
  parseRational,
  type Rational,
} from "./rational.js";

export const PRICING_CATALOG_VERSION = "2.0.0" as const;
export const PRICE_CONTRACT_VERSION = "1.0.0" as const;
export const PRICING_HASH_DOMAIN = "vlatam-ai-lab:pricing-contract:v1" as const;
export const PRICING_USAGE_CATEGORIES = [
  "input",
  "output",
  "cache_read",
  "cache_write",
  "reasoning",
  "request",
] as const;
export const PRICING_BILLING_UNITS = [
  "token",
  "million_tokens",
  "request",
] as const;
export const PRICING_CURRENCIES = ["USD"] as const;

export type PricingUsageCategory = (typeof PRICING_USAGE_CATEGORIES)[number];
export type PricingBillingUnit = (typeof PRICING_BILLING_UNITS)[number];
export type PricingCurrency = (typeof PRICING_CURRENCIES)[number];

export interface PriceContract {
  readonly contract_version: typeof PRICE_CONTRACT_VERSION;
  readonly amount: Rational;
  readonly currency: PricingCurrency;
  readonly billing_unit: PricingBillingUnit;
  readonly usage_category: PricingUsageCategory;
}

export interface PricingEvidence {
  readonly evidence_id: string;
  readonly evidence_hash: string;
  readonly evidence_version: string;
  readonly reviewed_at: string;
  readonly expires_at: string;
  readonly status: "fixture" | "verified" | "declared_unverified" | "unknown";
}

export interface PricingEntry {
  readonly pricing_id: string;
  readonly schema_version: typeof PRICING_CATALOG_VERSION;
  readonly pricing_contract_version: typeof PRICE_CONTRACT_VERSION;
  readonly provider_id: string;
  readonly model_id: string;
  readonly currency: PricingCurrency;
  readonly rates: readonly PriceContract[];
  readonly effective_from: string;
  readonly permitted_execution_modes: readonly ("replay" | "live")[];
  readonly evidence: PricingEvidence;
}

export interface LegacyPricingEntry {
  readonly pricing_id?: unknown;
  readonly provider_id?: unknown;
  readonly model_id?: unknown;
  readonly permitted_execution_modes?: unknown;
  readonly [key: string]: unknown;
}

export interface PricingCatalogData {
  readonly schema_version: typeof PRICING_CATALOG_VERSION;
  readonly prices: readonly PricingEntry[];
  readonly legacy_prices: readonly LegacyPricingEntry[];
}

const ID = /^[a-z0-9][a-z0-9._-]+$/;
const HASH = /^[a-f0-9]{64}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const validInstant = (value: unknown): value is string =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

const compatibleUnit = (rate: PriceContract): boolean =>
  rate.usage_category === "request"
    ? rate.billing_unit === "request"
    : rate.billing_unit === "token" || rate.billing_unit === "million_tokens";

export function validatePriceContract(value: unknown): value is PriceContract {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rate = value as Record<string, unknown>;
  if (
    Object.keys(rate).length !== 5 ||
    ![
      "contract_version",
      "amount",
      "currency",
      "billing_unit",
      "usage_category",
    ].every((key) => key in rate) ||
    rate.contract_version !== PRICE_CONTRACT_VERSION ||
    !(PRICING_CURRENCIES as readonly unknown[]).includes(rate.currency) ||
    !(PRICING_BILLING_UNITS as readonly unknown[]).includes(
      rate.billing_unit,
    ) ||
    !(PRICING_USAGE_CATEGORIES as readonly unknown[]).includes(
      rate.usage_category,
    )
  )
    return false;
  try {
    parseRational(rate.amount);
  } catch {
    return false;
  }
  return compatibleUnit(rate as unknown as PriceContract);
}

export function validatePricingEntry(value: unknown): value is PricingEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  const expected = [
    "pricing_id",
    "schema_version",
    "pricing_contract_version",
    "provider_id",
    "model_id",
    "currency",
    "rates",
    "effective_from",
    "permitted_execution_modes",
    "evidence",
  ];
  if (
    Object.keys(entry).length !== expected.length ||
    !expected.every((key) => key in entry) ||
    !ID.test(String(entry.pricing_id ?? "")) ||
    entry.schema_version !== PRICING_CATALOG_VERSION ||
    entry.pricing_contract_version !== PRICE_CONTRACT_VERSION ||
    typeof entry.provider_id !== "string" ||
    entry.provider_id.length === 0 ||
    typeof entry.model_id !== "string" ||
    entry.model_id.length === 0 ||
    !(PRICING_CURRENCIES as readonly unknown[]).includes(entry.currency) ||
    !Array.isArray(entry.rates) ||
    entry.rates.length === 0 ||
    !entry.rates.every(validatePriceContract) ||
    entry.rates.some(
      (rate) => (rate as PriceContract).currency !== entry.currency,
    ) ||
    new Set(entry.rates.map((rate) => (rate as PriceContract).usage_category))
      .size !== entry.rates.length ||
    !validInstant(entry.effective_from) ||
    !Array.isArray(entry.permitted_execution_modes) ||
    entry.permitted_execution_modes.length === 0 ||
    entry.permitted_execution_modes.some(
      (mode) => mode !== "replay" && mode !== "live",
    ) ||
    new Set(entry.permitted_execution_modes).size !==
      entry.permitted_execution_modes.length ||
    !entry.evidence ||
    typeof entry.evidence !== "object" ||
    Array.isArray(entry.evidence)
  )
    return false;
  const evidence = entry.evidence as Record<string, unknown>;
  return (
    Object.keys(evidence).length === 6 &&
    [
      "evidence_id",
      "evidence_hash",
      "evidence_version",
      "reviewed_at",
      "expires_at",
      "status",
    ].every((key) => key in evidence) &&
    typeof evidence.evidence_id === "string" &&
    evidence.evidence_id.length > 0 &&
    evidence.evidence_id.length <= 256 &&
    HASH.test(String(evidence.evidence_hash ?? "")) &&
    SEMVER.test(String(evidence.evidence_version ?? "")) &&
    ISO_DATE.test(String(evidence.reviewed_at ?? "")) &&
    validInstant(evidence.expires_at) &&
    ["fixture", "verified", "declared_unverified", "unknown"].includes(
      String(evidence.status),
    )
  );
}

const canonicalPricing = (entry: PricingEntry) => ({
  ...entry,
  rates: [...entry.rates].sort((left, right) =>
    left.usage_category.localeCompare(right.usage_category),
  ),
});

export const pricingContractHash = (entry: PricingEntry): string =>
  deterministicRationalHash(PRICING_HASH_DOMAIN, canonicalPricing(entry));

const legacyMatches = (
  legacy: LegacyPricingEntry,
  profile: ExecutionProfile,
): boolean =>
  (legacy.provider_id === profile.provider_id || legacy.provider_id === "*") &&
  (legacy.model_id === profile.model_id || legacy.model_id === "*") &&
  Array.isArray(legacy.permitted_execution_modes) &&
  legacy.permitted_execution_modes.includes(profile.mode);

export class PricingCatalog {
  constructor(
    readonly data: PricingCatalogData = pricingJson as PricingCatalogData,
  ) {
    if (
      data.schema_version !== PRICING_CATALOG_VERSION ||
      !Array.isArray(data.prices) ||
      !Array.isArray(data.legacy_prices) ||
      data.prices.some((entry) => !validatePricingEntry(entry)) ||
      new Set(data.prices.map((entry) => entry.pricing_id)).size !==
        data.prices.length
    )
      throw governanceError("GOVERNANCE_CONFIGURATION_INVALID");
  }

  resolve(
    profile: ExecutionProfile,
    at: Date,
    requireVerified: boolean,
  ): PricingEntry {
    if (
      this.data.legacy_prices.some((legacy) => legacyMatches(legacy, profile))
    )
      throw governanceError("PRICING_CONTRACT_MIGRATION_REQUIRED");
    const modeCandidates = this.data.prices.filter(
      (price) =>
        (price.provider_id === profile.provider_id ||
          price.provider_id === "*") &&
        (price.model_id === profile.model_id || price.model_id === "*") &&
        price.permitted_execution_modes.includes(profile.mode),
    );
    const active = modeCandidates.filter(
      (price) =>
        Date.parse(price.effective_from) <= at.getTime() &&
        Date.parse(price.evidence.expires_at) > at.getTime(),
    );
    const specificity = (price: PricingEntry) =>
      (price.provider_id === profile.provider_id ? 1 : 0) +
      (price.model_id === profile.model_id ? 1 : 0);
    const best = active.length
      ? active.reduce(
          (maximum, price) =>
            specificity(price) > maximum ? specificity(price) : maximum,
          -1,
        )
      : -1;
    const matches = active.filter((price) => specificity(price) === best);
    if (!matches.length)
      throw governanceError(
        modeCandidates.some(
          (price) => Date.parse(price.evidence.expires_at) <= at.getTime(),
        )
          ? "PRICING_EXPIRED"
          : "PRICING_MISSING",
      );
    if (matches.length !== 1) throw governanceError("PRICING_AMBIGUOUS");
    const price = matches[0]!;
    if (
      requireVerified &&
      price.evidence.status !== "verified" &&
      price.evidence.status !== "fixture"
    )
      throw governanceError("PRICING_UNVERIFIED");
    return price;
  }
}

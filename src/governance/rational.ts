import { createHash } from "node:crypto";
import { governanceError } from "./errors.js";

export const RATIONAL_CONTRACT_VERSION = "1.0.0" as const;
export const RATIONAL_CANONICALIZATION_VERSION = "rational-json-v1" as const;
export const MAX_RATIONAL_DIGITS = 4096;

export interface Rational {
  readonly numerator: string;
  readonly denominator: string;
}

export type MonetaryRoundingPolicy = "CEILING" | "HALF_EVEN";

const UNSIGNED = /^(0|[1-9][0-9]*)$/;

const fail = (): never => {
  throw governanceError("COST_CALCULATION_FAILED");
};

const boundedUnsigned = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= MAX_RATIONAL_DIGITS &&
  UNSIGNED.test(value);

export function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  if (left < 0n || right < 0n) fail();
  let a = left;
  let b = right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function assertBound(value: bigint): void {
  if (value.toString().length > MAX_RATIONAL_DIGITS) fail();
}

function assertProductBound(left: bigint, right: bigint): void {
  if (
    left !== 0n &&
    right !== 0n &&
    left.toString().length + right.toString().length - 1 > MAX_RATIONAL_DIGITS
  )
    fail();
}

export function createRational(
  numerator: bigint,
  denominator: bigint,
): Rational {
  if (numerator < 0n || denominator <= 0n) fail();
  assertBound(numerator);
  assertBound(denominator);
  const divisor = greatestCommonDivisor(numerator, denominator);
  const reducedNumerator = numerator / divisor;
  const reducedDenominator = denominator / divisor;
  return {
    numerator: reducedNumerator.toString(),
    denominator: reducedDenominator.toString(),
  };
}

export function parseRational(value: unknown): Rational {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== 2 ||
    !keys.includes("numerator") ||
    !keys.includes("denominator") ||
    !boundedUnsigned(record.numerator) ||
    !boundedUnsigned(record.denominator) ||
    record.denominator === "0"
  )
    fail();
  const numeratorText = record.numerator;
  const denominatorText = record.denominator;
  if (!boundedUnsigned(numeratorText)) fail();
  if (!boundedUnsigned(denominatorText)) fail();
  const canonicalNumerator = numeratorText as string;
  const canonicalDenominator = denominatorText as string;
  const numerator = BigInt(canonicalNumerator);
  const denominator = BigInt(canonicalDenominator);
  if (greatestCommonDivisor(numerator, denominator) !== 1n) fail();
  return { numerator: canonicalNumerator, denominator: canonicalDenominator };
}

const parts = (value: Rational): readonly [bigint, bigint] => {
  const parsed = parseRational(value);
  return [BigInt(parsed.numerator), BigInt(parsed.denominator)];
};

export function addRational(left: Rational, right: Rational): Rational {
  const [an, ad] = parts(left);
  const [bn, bd] = parts(right);
  const denominatorDivisor = greatestCommonDivisor(ad, bd);
  const leftMultiplier = bd / denominatorDivisor;
  const rightMultiplier = ad / denominatorDivisor;
  assertProductBound(an, leftMultiplier);
  assertProductBound(bn, rightMultiplier);
  assertProductBound(ad, leftMultiplier);
  const numerator = an * leftMultiplier + bn * rightMultiplier;
  assertBound(numerator);
  return createRational(numerator, ad * leftMultiplier);
}

export function multiplyRational(left: Rational, right: Rational): Rational {
  let [an, ad] = parts(left);
  let [bn, bd] = parts(right);
  const crossA = greatestCommonDivisor(an, bd);
  const crossB = greatestCommonDivisor(bn, ad);
  an /= crossA;
  bd /= crossA;
  bn /= crossB;
  ad /= crossB;
  assertProductBound(an, bn);
  assertProductBound(ad, bd);
  return createRational(an * bn, ad * bd);
}

export function compareRational(left: Rational, right: Rational): -1 | 0 | 1 {
  let [an, ad] = parts(left);
  let [bn, bd] = parts(right);
  const numeratorDivisor = greatestCommonDivisor(an, bn);
  const denominatorDivisor = greatestCommonDivisor(ad, bd);
  if (numeratorDivisor !== 0n) {
    an /= numeratorDivisor;
    bn /= numeratorDivisor;
  }
  ad /= denominatorDivisor;
  bd /= denominatorDivisor;
  assertProductBound(an, bd);
  assertProductBound(bn, ad);
  const crossA = an * bd;
  const crossB = bn * ad;
  return crossA === crossB ? 0 : crossA < crossB ? -1 : 1;
}

export function subtractRationalAbsolute(
  left: Rational,
  right: Rational,
): Rational {
  const [an, ad] = parts(left);
  const [bn, bd] = parts(right);
  const denominatorDivisor = greatestCommonDivisor(ad, bd);
  const leftMultiplier = bd / denominatorDivisor;
  const rightMultiplier = ad / denominatorDivisor;
  assertProductBound(an, leftMultiplier);
  assertProductBound(bn, rightMultiplier);
  assertProductBound(ad, leftMultiplier);
  const l = an * leftMultiplier;
  const r = bn * rightMultiplier;
  return createRational(l >= r ? l - r : r - l, ad * leftMultiplier);
}

export function rationalFromUnsigned(value: string | bigint): Rational {
  if (typeof value === "string" && !boundedUnsigned(value)) fail();
  const parsed = typeof value === "bigint" ? value : BigInt(value);
  return createRational(parsed, 1n);
}

export function convertRationalToInteger(
  value: Rational,
  scale: string,
  rounding: MonetaryRoundingPolicy,
): bigint {
  if (!boundedUnsigned(scale) || scale === "0") fail();
  const [numerator, denominator] = parts(value);
  assertProductBound(numerator, BigInt(scale));
  const scaled = numerator * BigInt(scale);
  const quotient = scaled / denominator;
  const remainder = scaled % denominator;
  if (rounding === "CEILING") return quotient + (remainder === 0n ? 0n : 1n);
  if (rounding !== "HALF_EVEN") fail();
  const doubled = remainder * 2n;
  if (doubled < denominator) return quotient;
  if (doubled > denominator) return quotient + 1n;
  return quotient % 2n === 0n ? quotient : quotient + 1n;
}

function canonical(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail();
    return JSON.stringify(value);
  }
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (!value || typeof value !== "object") fail();
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

export function canonicalRationalJson(value: unknown): string {
  return canonical(value);
}

export function deterministicRationalHash(
  domain: string,
  value: unknown,
): string {
  return createHash("sha256")
    .update(domain)
    .update("\n")
    .update(canonicalRationalJson(value))
    .digest("hex");
}

import type { NormalizedUsage } from './usage.js';
import type { PricingEntry } from './pricing.js';
import { governanceError } from './errors.js';

export interface CostBreakdown { readonly input_cost_minor: bigint; readonly output_cost_minor: bigint; readonly cached_input_cost_minor: bigint; readonly reasoning_cost_minor: bigint; readonly total_cost_minor: bigint; readonly currency: string; readonly pricing_id: string; readonly calculation_version: '1.0.0'; readonly rounding_mode: 'ceiling'; readonly status: 'estimated'|'actual'; }
const MAX = BigInt(Number.MAX_SAFE_INTEGER);
const ceilDiv = (n: bigint, d: bigint) => (n + d - 1n) / d;
export function calculateCost(usage: NormalizedUsage, pricing: PricingEntry, status: 'estimated'|'actual'): CostBreakdown {
  if (usage.status !== 'complete' || usage.input_tokens === undefined || usage.output_tokens === undefined) throw governanceError('USAGE_UNAVAILABLE');
  try {
    const denominator = BigInt(pricing.pricing_denominator_tokens);
    const cached = BigInt(usage.cached_input_tokens ?? 0); const input = BigInt(usage.input_tokens) - cached;
    const reasoning = BigInt(usage.reasoning_tokens ?? 0); const output = BigInt(usage.output_tokens) - reasoning;
    if (input < 0n || output < 0n) throw new Error('invalid');
    const part = (tokens: bigint, price: number | undefined): bigint => tokens === 0n ? 0n : price === undefined ? (() => { throw governanceError('COST_CALCULATION_FAILED'); })() : ceilDiv(tokens * BigInt(price), denominator);
    const inputCost = part(input, pricing.input_price_minor); const outputCost = part(output, pricing.output_price_minor); const cachedCost = part(cached, pricing.cached_input_price_minor); const reasoningCost = part(reasoning, pricing.reasoning_price_minor); const total = inputCost + outputCost + cachedCost + reasoningCost;
    if (total > MAX) throw governanceError('COST_CALCULATION_FAILED');
    return { input_cost_minor: inputCost, output_cost_minor: outputCost, cached_input_cost_minor: cachedCost, reasoning_cost_minor: reasoningCost, total_cost_minor: total, currency: pricing.currency, pricing_id: pricing.pricing_id, calculation_version: '1.0.0', rounding_mode: 'ceiling', status };
  } catch (error) { if (error instanceof Error && error.name === 'GovernanceError') throw error; throw governanceError('COST_CALCULATION_FAILED'); }
}

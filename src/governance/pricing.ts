import pricingJson from '../../config/ai-pricing.json' with { type: 'json' };
import type { ExecutionProfile } from '../execution/execution-profile.js';
import { governanceError } from './errors.js';

export interface PricingEntry { readonly pricing_id: string; readonly schema_version: string; readonly provider_id: string; readonly model_id: string; readonly currency: string; readonly input_price_minor: number; readonly output_price_minor: number; readonly cached_input_price_minor?: number; readonly reasoning_price_minor?: number; readonly pricing_denominator_tokens: number; readonly effective_from: string; readonly expires_at?: string; readonly evidence_status: 'fixture'|'declared_unverified'|'verified'|'unknown'; readonly permitted_execution_modes: readonly ('replay'|'live')[]; readonly evidence_ref: string; }
export interface PricingCatalogData { readonly schema_version: string; readonly prices: readonly PricingEntry[]; }
export class PricingCatalog {
  constructor(readonly data: PricingCatalogData = pricingJson as PricingCatalogData) {
    if (new Set(data.prices.map(p => p.pricing_id)).size !== data.prices.length) throw governanceError('GOVERNANCE_CONFIGURATION_INVALID');
  }
  resolve(profile: ExecutionProfile, at: Date, requireVerified: boolean): PricingEntry {
    const candidates = this.data.prices.filter(p => (p.provider_id === profile.provider_id || p.provider_id === '*') && (p.model_id === profile.model_id || p.model_id === '*') && p.permitted_execution_modes.includes(profile.mode) && Date.parse(p.effective_from) <= at.getTime() && (p.expires_at === undefined || Date.parse(p.expires_at) > at.getTime()));
    const specificity = (p: PricingEntry) => Number(p.provider_id === profile.provider_id) + Number(p.model_id === profile.model_id);
    const best = Math.max(...candidates.map(specificity)); const matches = candidates.filter(p => specificity(p) === best);
    if (!matches.length) throw governanceError(this.data.prices.some(p => p.provider_id === profile.provider_id && (p.model_id === profile.model_id || p.model_id === '*') && p.expires_at !== undefined && Date.parse(p.expires_at) <= at.getTime()) ? 'PRICING_EXPIRED' : 'PRICING_MISSING');
    if (matches.length !== 1) throw governanceError('PRICING_AMBIGUOUS');
    const price = matches[0]!;
    if (requireVerified && price.evidence_status !== 'verified' && price.evidence_status !== 'fixture') throw governanceError('PRICING_UNVERIFIED');
    if (!/^[A-Z]{3}$/.test(price.currency) || !Number.isSafeInteger(price.pricing_denominator_tokens) || price.pricing_denominator_tokens < 1) throw governanceError('GOVERNANCE_CONFIGURATION_INVALID');
    return price;
  }
}

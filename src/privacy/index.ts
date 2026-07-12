/**
 * AI-73 privacy enforcement — public surface.
 *
 * The privacy layer is the hard execution-eligibility gate between
 * explicit profile resolution and capability mapping. Import from
 * this module only; individual files are internal and may move.
 */

export * from './data-classification.js';
export * from './errors.js';
export * from './privacy-policy.js';
export * from './zdr-evidence.js';
export * from './redaction.js';
export * from './privacy-audit.js';
export * from './privacy-enforcer.js';

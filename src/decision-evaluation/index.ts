/**
 * AI-141 — Gold Decision Evaluation Set public surface.
 *
 * Contracts, pure fail-closed validators, deterministic hashing, a pure
 * case evaluator and deterministic aggregation only. There is no
 * candidate registry, runner, runtime, provider, model, transport,
 * scheduler, promotion or routing path behind this module.
 *
 * Candidates may produce answers. Evaluators may measure them.
 * Candidates may not define their own truth.
 */

export * from "./contracts.js";
export * from "./canonical.js";
export * from "./validation.js";
export * from "./evaluator.js";
export * from "./metrics.js";

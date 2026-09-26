/**
 * AI-142 — Governed Typed Decision Candidate Registry public surface.
 *
 * Contracts, pure fail-closed validators and deterministic hashing only.
 * There is no adapter, loader, sandbox, runner, transport, benchmark,
 * promotion or routing path behind this module.
 *
 * A candidate registry records what we know.
 * It does not authorize what may run.
 */

export * from "./contracts.js";
export * from "./canonical.js";
export * from "./validation.js";

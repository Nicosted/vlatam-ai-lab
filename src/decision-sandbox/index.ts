/**
 * AI-143 — Governed Decision Sandbox Runtime and Common Adapter Protocol:
 * pure public surface.
 *
 * Contracts, the fixed fixture policy, the common adapter protocol
 * framing, pure validators, the pure preflight, record construction and
 * domain-separated hashing. The process executor lives in `executor.ts`
 * and is deliberately not re-exported here: nothing that imports this
 * module gains the ability to create a process.
 *
 * Sandbox output is not approved intelligence. Sandbox success is not
 * benchmark success and not promotion eligibility.
 */

export * from "./contracts.js";
export * from "./canonical.js";
export * from "./validation.js";
export * from "./protocol.js";
export * from "./preflight.js";
export * from "./record.js";

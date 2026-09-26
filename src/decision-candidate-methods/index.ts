/**
 * AI-144 — SemIf Direct-Logit Method Adapter Baseline (evidence only).
 *
 * AI-144 evaluates an AI-LAB-owned implementation of a pinned SemIf
 * methodology using synthetic logits. It does not execute SemIf upstream
 * code or any SemIf/Qwen model artifact.
 *
 * This surface is pure: contracts, hashing, validators, the exact
 * candidate binding check and the actual-candidate execution readiness
 * evaluator (always `not_eligible_for_candidate_execution`). It reaches no
 * process, filesystem, network, clock, provider, sandbox runtime, AI-141
 * evaluator or AI-120 lifecycle.
 */

export * from "./contracts.js";
export * from "./canonical.js";
export * from "./validation.js";
export * from "./readiness.js";

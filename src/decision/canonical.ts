/**
 * AI-140 — deterministic canonicalization and domain-separated hashing
 * for typed decision contracts.
 *
 * Canonicalization is byte-compatible with the repository's existing
 * `registry-json-v1` form used by the governed provider registries: object
 * keys sorted by UTF-16 code unit order, no whitespace, `JSON.stringify`
 * for strings/booleans/null, and only safe integers as numbers. It is
 * implemented locally so that the decision plane never imports the
 * provider layer; equality with the existing implementation is proven
 * by `tests/decision/typed-decision-contracts.test.ts`.
 *
 * Hash = SHA-256( domain_separator || "\n" || canonical_json(payload) ).
 *
 * Ordering rules:
 *  - `request_hash` preserves the exact presented candidate order,
 *    because display order is part of what a candidate engine was shown
 *    and must be replayable.
 *  - `semantic_request_hash` sorts candidates by `candidate_id` and
 *    facts by `fact_id`; two requests that differ only in candidate or
 *    fact display order share it. AI-141+ permutation-invariance checks
 *    group results by this hash.
 *  - `result_hash` excludes the self-hash field `result_hash`.
 */

import { createHash } from "node:crypto";

import type { TypedDecisionRequest, TypedDecisionResult } from "./contracts.js";

export const TYPED_DECISION_CANONICALIZATION_VERSION =
  "registry-json-v1" as const;
export const TYPED_DECISION_REQUEST_HASH_DOMAIN =
  "vlatam-ai-lab:typed-decision-request:v1" as const;
export const TYPED_DECISION_SEMANTIC_REQUEST_HASH_DOMAIN =
  "vlatam-ai-lab:typed-decision-request-semantic:v1" as const;
export const TYPED_DECISION_RESULT_HASH_DOMAIN =
  "vlatam-ai-lab:typed-decision-result:v1" as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonical(value: unknown, ancestors: Set<object>): string {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value))
      throw new Error("typed_decision_non_integer_number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new Error("typed_decision_cyclic_value");
    ancestors.add(value);
    const result = `[${value.map((item) => canonical(item, ancestors)).join(",")}]`;
    ancestors.delete(value);
    return result;
  }
  if (isRecord(value)) {
    if (Object.getPrototypeOf(value) !== Object.prototype)
      throw new Error("typed_decision_exotic_object");
    if (ancestors.has(value)) throw new Error("typed_decision_cyclic_value");
    ancestors.add(value);
    const keys = Object.keys(value).sort();
    const result = `{${keys
      .map(
        (key) => `${JSON.stringify(key)}:${canonical(value[key], ancestors)}`,
      )
      .join(",")}}`;
    ancestors.delete(value);
    return result;
  }
  throw new Error("typed_decision_unsupported_json_value");
}

/** Canonical JSON (`registry-json-v1`). Throws on non-JSON input. */
export function canonicalizeTypedDecisionJson(value: unknown): string {
  return canonical(value, new Set<object>());
}

function domainHash(domain: string, value: unknown): string {
  return createHash("sha256")
    .update(domain)
    .update("\n")
    .update(canonicalizeTypedDecisionJson(value))
    .digest("hex");
}

function byKey<T>(key: keyof T) {
  return (left: T, right: T): number => {
    const a = String(left[key]);
    const b = String(right[key]);
    return a < b ? -1 : a > b ? 1 : 0;
  };
}

/** Exact request identity, preserving presented candidate order. */
export function computeTypedDecisionRequestHash(
  request: TypedDecisionRequest,
): string {
  return domainHash(TYPED_DECISION_REQUEST_HASH_DOMAIN, request);
}

/**
 * Display-order-independent request identity. Candidates are sorted by
 * `candidate_id`, facts by `fact_id` and evidence by `evidence_id`.
 * `request_id` is excluded because it identifies an invocation, not the
 * semantic question.
 */
export function computeTypedDecisionSemanticRequestHash(
  request: TypedDecisionRequest,
): string {
  const domain = request.output_domain;
  const semanticDomain =
    domain.kind === "choice" || domain.kind === "ranking"
      ? {
          ...domain,
          candidates: [...domain.candidates].sort(byKey("candidate_id")),
        }
      : domain;
  const payload: Record<string, unknown> = {
    ...request,
    bounded_state: {
      ...request.bounded_state,
      facts: [...request.bounded_state.facts].sort(byKey("fact_id")),
    },
    output_domain: semanticDomain,
    evidence_refs: [...request.evidence_refs].sort(byKey("evidence_id")),
  };
  delete payload["request_id"];
  return domainHash(TYPED_DECISION_SEMANTIC_REQUEST_HASH_DOMAIN, payload);
}

/** Result identity excluding the self-hash field `result_hash`. */
export function computeTypedDecisionResultHash(
  result: TypedDecisionResult | Omit<TypedDecisionResult, "result_hash">,
): string {
  const payload = { ...result } as Record<string, unknown>;
  delete payload["result_hash"];
  return domainHash(TYPED_DECISION_RESULT_HASH_DOMAIN, payload);
}

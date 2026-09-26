/**
 * AI-142 — domain-separated hashing for typed decision candidate registry
 * artifacts.
 *
 * Reuses the AI-140 `registry-json-v1` canonicalizer
 * (`canonicalizeTypedDecisionJson`), exactly as AI-141 does, so there is
 * one canonical JSON form for the typed decision plane, its evaluation
 * layer and its candidate registry. No second canonicalizer is introduced.
 *
 * Hash = SHA-256( domain_separator || "\n" || canonical_json(payload) ),
 * where the payload is the whole artifact minus its own self-hash field.
 *
 *  - `candidate_hash` covers the candidate identity, evidence revision and
 *    supersession, roles, the pinned upstream revision, every evidence
 *    binding (path, blob SHA, content SHA-256), layered licensing, claims,
 *    derived gaps and the fail-closed lifecycle. Changing a pinned commit
 *    or any evidence changes the candidate hash.
 *  - `registry_hash` covers the registry version, review state,
 *    supersession and the ordered `(candidate_id, evidence_revision,
 *    candidate_hash, repository, pinned_commit_sha)` bindings. Changing any
 *    candidate changes the registry hash.
 */

import { createHash } from "node:crypto";

import { canonicalizeTypedDecisionJson } from "../decision/canonical.js";
import type {
  DecisionCandidateEntry,
  DecisionCandidateRegistry,
} from "./contracts.js";

export const DECISION_CANDIDATE_HASH_DOMAIN =
  "vlatam-ai-lab:typed-decision-candidate:v1" as const;
export const DECISION_CANDIDATE_REGISTRY_HASH_DOMAIN =
  "vlatam-ai-lab:typed-decision-candidate-registry:v1" as const;

function domainHash(
  domain: string,
  value: object,
  selfHashField: string,
): string {
  const payload = { ...value } as Record<string, unknown>;
  delete payload[selfHashField];
  return createHash("sha256")
    .update(domain)
    .update("\n")
    .update(canonicalizeTypedDecisionJson(payload))
    .digest("hex");
}

/** Candidate entry identity excluding the self-hash field `candidate_hash`. */
export function computeDecisionCandidateHash(
  entry:
    | DecisionCandidateEntry
    | Omit<DecisionCandidateEntry, "candidate_hash">,
): string {
  return domainHash(DECISION_CANDIDATE_HASH_DOMAIN, entry, "candidate_hash");
}

/** Registry identity excluding the self-hash field `registry_hash`. */
export function computeDecisionCandidateRegistryHash(
  registry:
    | DecisionCandidateRegistry
    | Omit<DecisionCandidateRegistry, "registry_hash">,
): string {
  return domainHash(
    DECISION_CANDIDATE_REGISTRY_HASH_DOMAIN,
    registry,
    "registry_hash",
  );
}

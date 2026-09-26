/**
 * AI-144 — domain-separated hashing for candidate method artifacts.
 *
 * Reuses the AI-140 `registry-json-v1` canonicalizer
 * (`canonicalizeTypedDecisionJson`), exactly as AI-141, AI-142 and AI-143
 * do. No second canonicalizer is introduced.
 *
 * Hash = SHA-256( domain_separator || "\n" || canonical_json(payload) ),
 * where the payload is the artifact minus its own self-hash field and
 * nothing else.
 *
 *  - `adapter_spec_hash` covers the exact AI-142 candidate binding, every
 *    pinned methodology evidence locator and interpretation, the method
 *    artifact identity and every method parameter.
 *  - `fixture_hash` covers the request binding and every synthetic logit.
 *  - `evidence_pack_hash` covers the whole pack, including the spec hash,
 *    fixture hashes and readiness blockers.
 */

import { createHash } from "node:crypto";

import { canonicalizeTypedDecisionJson } from "../decision/canonical.js";
import type {
  CandidateAdapterEvidencePack,
  CandidateAdapterSpec,
  SyntheticLogitFixture,
} from "./contracts.js";

export const CANDIDATE_ADAPTER_SPEC_HASH_DOMAIN =
  "vlatam-ai-lab:typed-decision-candidate-adapter-spec:v1" as const;
export const SYNTHETIC_LOGIT_FIXTURE_HASH_DOMAIN =
  "vlatam-ai-lab:typed-decision-synthetic-logit-fixture:v1" as const;
export const CANDIDATE_ADAPTER_EVIDENCE_PACK_HASH_DOMAIN =
  "vlatam-ai-lab:typed-decision-candidate-adapter-evidence-pack:v1" as const;

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

/** Specification identity excluding `adapter_spec_hash`. */
export function computeCandidateAdapterSpecHash(
  spec: CandidateAdapterSpec | Omit<CandidateAdapterSpec, "adapter_spec_hash">,
): string {
  return domainHash(
    CANDIDATE_ADAPTER_SPEC_HASH_DOMAIN,
    spec,
    "adapter_spec_hash",
  );
}

/** Fixture identity excluding `fixture_hash`. */
export function computeSyntheticLogitFixtureHash(
  fixture: SyntheticLogitFixture | Omit<SyntheticLogitFixture, "fixture_hash">,
): string {
  return domainHash(
    SYNTHETIC_LOGIT_FIXTURE_HASH_DOMAIN,
    fixture,
    "fixture_hash",
  );
}

/** Evidence pack identity excluding `evidence_pack_hash`. */
export function computeCandidateAdapterEvidencePackHash(
  pack:
    | CandidateAdapterEvidencePack
    | Omit<CandidateAdapterEvidencePack, "evidence_pack_hash">,
): string {
  return domainHash(
    CANDIDATE_ADAPTER_EVIDENCE_PACK_HASH_DOMAIN,
    pack,
    "evidence_pack_hash",
  );
}

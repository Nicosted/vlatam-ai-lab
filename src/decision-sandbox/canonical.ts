/**
 * AI-143 — domain-separated hashing for decision sandbox artifacts.
 *
 * Reuses the AI-140 `registry-json-v1` canonicalizer
 * (`canonicalizeTypedDecisionJson`), exactly as AI-141 and AI-142 do.
 * No second canonicalizer is introduced.
 *
 * Hash = SHA-256( domain_separator || "\n" || canonical_json(payload) ),
 * where the payload is the artifact minus its own self-hash field.
 *
 *  - `policy_hash` covers every policy field, limit and isolation claim.
 *  - The envelope hash covers a whole adapter input or output envelope
 *    (neither carries a self-hash field).
 *  - `semantic_execution_hash` is the deterministic identity of the
 *    semantic execution outcome. It excludes `telemetry`,
 *    `semantic_execution_hash` and `execution_record_hash`, so operational
 *    observations (duration, observed byte counts and hashes) never change
 *    it.
 *  - `execution_record_hash` is the tamper-evident hash of the complete
 *    persisted record, including `telemetry` and `semantic_execution_hash`;
 *    it excludes only itself. The two use distinct domains.
 */

import { createHash } from "node:crypto";

import { canonicalizeTypedDecisionJson } from "../decision/canonical.js";
import type {
  DecisionAdapterInput,
  DecisionAdapterOutput,
  DecisionSandboxExecutionRecord,
  DecisionSandboxPolicy,
} from "./contracts.js";

export const DECISION_SANDBOX_POLICY_HASH_DOMAIN =
  "vlatam-ai-lab:decision-sandbox-policy:v1" as const;
export const DECISION_ADAPTER_ENVELOPE_HASH_DOMAIN =
  "vlatam-ai-lab:decision-adapter-envelope:v1" as const;
export const DECISION_SANDBOX_SEMANTIC_EXECUTION_HASH_DOMAIN =
  "vlatam-ai-lab:decision-sandbox-execution-semantic:v1" as const;
export const DECISION_SANDBOX_EXECUTION_RECORD_HASH_DOMAIN =
  "vlatam-ai-lab:decision-sandbox-execution-record:v1" as const;

function domainHash(
  domain: string,
  value: object,
  excluded: readonly string[],
): string {
  const payload = { ...value } as Record<string, unknown>;
  for (const key of excluded) delete payload[key];
  return createHash("sha256")
    .update(domain)
    .update("\n")
    .update(canonicalizeTypedDecisionJson(payload))
    .digest("hex");
}

/** Policy identity excluding the self-hash field `policy_hash`. */
export function computeDecisionSandboxPolicyHash(
  policy: DecisionSandboxPolicy | Omit<DecisionSandboxPolicy, "policy_hash">,
): string {
  return domainHash(DECISION_SANDBOX_POLICY_HASH_DOMAIN, policy, [
    "policy_hash",
  ]);
}

/** Identity of one adapter protocol envelope (input or output). */
export function computeDecisionAdapterEnvelopeHash(
  envelope: DecisionAdapterInput | DecisionAdapterOutput,
): string {
  return domainHash(DECISION_ADAPTER_ENVELOPE_HASH_DOMAIN, envelope, []);
}

/**
 * Semantic execution identity excluding `telemetry`,
 * `semantic_execution_hash` and `execution_record_hash`.
 */
export function computeDecisionSandboxSemanticExecutionHash(
  record:
    | DecisionSandboxExecutionRecord
    | Omit<
        DecisionSandboxExecutionRecord,
        "semantic_execution_hash" | "execution_record_hash"
      >,
): string {
  return domainHash(DECISION_SANDBOX_SEMANTIC_EXECUTION_HASH_DOMAIN, record, [
    "telemetry",
    "semantic_execution_hash",
    "execution_record_hash",
  ]);
}

/**
 * Complete-record identity: every persisted field, including `telemetry`
 * and `semantic_execution_hash`, excluding only `execution_record_hash`.
 */
export function computeDecisionSandboxExecutionRecordHash(
  record:
    | DecisionSandboxExecutionRecord
    | Omit<DecisionSandboxExecutionRecord, "execution_record_hash">,
): string {
  return domainHash(DECISION_SANDBOX_EXECUTION_RECORD_HASH_DOMAIN, record, [
    "execution_record_hash",
  ]);
}

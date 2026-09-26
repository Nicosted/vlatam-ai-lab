/**
 * AI-141 — domain-separated hashing for Gold Decision artifacts.
 *
 * Reuses the AI-140 `registry-json-v1` canonicalizer
 * (`canonicalizeTypedDecisionJson`) so that there is exactly one
 * canonical JSON form for the typed decision plane and its evaluation
 * layer. No second canonicalization scheme is introduced.
 *
 * Hash = SHA-256( domain_separator || "\n" || canonical_json(payload) ),
 * where the payload is the whole artifact minus its own self-hash field.
 *
 *  - `case_hash` covers the exact request (presented option order
 *    included), expected answer, abstention policy, split, dataset
 *    identity, provenance, language, jurisdiction, tags and permutation
 *    group. Changing any of them changes the case identity.
 *  - `dataset_hash` covers the dataset version, scoring policy, split
 *    policy, review state, labeling rules and the ordered
 *    `(case_id, case_hash, split)` entries. Changing any case changes
 *    the dataset identity.
 *  - `evaluation_hash` and `report_hash` bind evaluation evidence to the
 *    exact case, candidate result and scoring policy.
 */

import { createHash } from "node:crypto";

import { canonicalizeTypedDecisionJson } from "../decision/canonical.js";
import type {
  GoldDecisionCase,
  GoldDecisionCaseEvaluation,
  GoldDecisionEvaluationReport,
  GoldDecisionSet,
} from "./contracts.js";

export const GOLD_DECISION_CASE_HASH_DOMAIN =
  "vlatam-ai-lab:gold-decision-case:v1" as const;
export const GOLD_DECISION_SET_HASH_DOMAIN =
  "vlatam-ai-lab:gold-decision-set:v1" as const;
export const GOLD_DECISION_EVALUATION_HASH_DOMAIN =
  "vlatam-ai-lab:gold-decision-evaluation:v1" as const;
export const GOLD_DECISION_REPORT_HASH_DOMAIN =
  "vlatam-ai-lab:gold-decision-evaluation-report:v1" as const;

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

/** Case identity excluding the self-hash field `case_hash`. */
export function computeGoldDecisionCaseHash(
  goldCase: GoldDecisionCase | Omit<GoldDecisionCase, "case_hash">,
): string {
  return domainHash(GOLD_DECISION_CASE_HASH_DOMAIN, goldCase, "case_hash");
}

/** Dataset identity excluding the self-hash field `dataset_hash`. */
export function computeGoldDecisionSetHash(
  set: GoldDecisionSet | Omit<GoldDecisionSet, "dataset_hash">,
): string {
  return domainHash(GOLD_DECISION_SET_HASH_DOMAIN, set, "dataset_hash");
}

/** Evaluation identity excluding the self-hash field `evaluation_hash`. */
export function computeGoldDecisionEvaluationHash(
  evaluation:
    | GoldDecisionCaseEvaluation
    | Omit<GoldDecisionCaseEvaluation, "evaluation_hash">,
): string {
  return domainHash(
    GOLD_DECISION_EVALUATION_HASH_DOMAIN,
    evaluation,
    "evaluation_hash",
  );
}

/** Report identity excluding the self-hash field `report_hash`. */
export function computeGoldDecisionReportHash(
  report:
    | GoldDecisionEvaluationReport
    | Omit<GoldDecisionEvaluationReport, "report_hash">,
): string {
  return domainHash(GOLD_DECISION_REPORT_HASH_DOMAIN, report, "report_hash");
}

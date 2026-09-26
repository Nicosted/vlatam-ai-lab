/**
 * AI-144 — exact candidate binding check and actual-candidate execution
 * readiness.
 *
 * Two separate questions, deliberately separate from the synthetic
 * method adapter:
 *
 *  1. Is the AI-144 specification still bound to the current AI-142
 *     candidate evidence revision? (`checkCandidateAdapterBinding`)
 *  2. May AI LAB execute the actual upstream candidate/model path?
 *     (`evaluateCandidateExecutionReadiness`)
 *
 * The answer to (2) is always `not_eligible_for_candidate_execution` in
 * contract `1.0.0`, with explicit blockers. The evaluator grants no
 * authority and has no eligible, ready or approved outcome. Evidence is
 * never fabricated to shorten the blocker list: AI-142 evidence gaps are
 * carried through verbatim.
 *
 * Pure: no clock, environment, filesystem, network or process access.
 */

import {
  DECISION_CANDIDATE_EVIDENCE_GAPS,
  type DecisionCandidateEntry,
} from "../decision-candidates/contracts.js";
import { validateDecisionCandidateEntry } from "../decision-candidates/validation.js";
import {
  CANDIDATE_EXECUTION_BLOCKERS,
  CANDIDATE_EXECUTION_STANDING_BLOCKERS,
  type CandidateAdapterSpec,
  type CandidateExecutionBlocker,
  type CandidateExecutionReadiness,
} from "./contracts.js";
import type { CandidateMethodIssue } from "./validation.js";

export interface CandidateAdapterBindingCheck {
  /** `current` only when the entry is valid and matches exactly. */
  readonly state: "current" | "stale" | "invalid";
  /** Deterministically ordered. */
  readonly issues: readonly CandidateMethodIssue[];
}

function ordered(
  issues: readonly CandidateMethodIssue[],
): CandidateMethodIssue[] {
  const unique = new Map(
    issues.map((issue) => [`${issue.path}\u0000${issue.code}`, issue]),
  );
  return [...unique.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, issue]) => issue);
}

/**
 * Checks a specification against the current AI-142 entry. The entry is
 * first re-validated by the AI-142 validator, which recomputes its
 * `candidate_hash`. Then candidate id, candidate hash, evidence revision,
 * repository, pinned commit and every shared evidence locator must match
 * exactly. Any drift is `stale`: the specification must be re-reviewed
 * and rebound, never silently follow the candidate id.
 */
export function checkCandidateAdapterBinding(
  spec: CandidateAdapterSpec,
  entryValue: unknown,
): CandidateAdapterBindingCheck {
  const issues: CandidateMethodIssue[] = [];
  const entryCheck = validateDecisionCandidateEntry(entryValue);
  if (!entryCheck.ok)
    return {
      state: "invalid",
      issues: [{ code: "candidate_entry_invalid", path: "entry" }],
    };
  const entry: DecisionCandidateEntry = entryCheck.value;
  const binding = spec.candidate_binding;
  if (
    entry.candidate_id !== binding.candidate_id ||
    entry.candidate_hash !== binding.candidate_hash ||
    entry.evidence_revision !== binding.evidence_revision
  )
    issues.push({
      code: "candidate_binding_stale",
      path: "spec.candidate_binding",
    });
  if (
    entry.upstream.repository !== spec.methodology.upstream_repository ||
    entry.upstream.pinned_commit_sha !== spec.methodology.upstream_commit
  )
    issues.push({
      code: "candidate_binding_stale",
      path: "spec.methodology.upstream_commit",
    });
  const shared = new Map(
    entry.evidence
      .filter((item) => item.locator.path !== null)
      .map((item) => [item.locator.path, item] as const),
  );
  spec.methodology.evidence.forEach((item, index) => {
    const bound = shared.get(item.path);
    if (
      bound !== undefined &&
      (bound.locator.blob_sha !== item.blob_sha ||
        bound.locator.commit_sha !== spec.methodology.upstream_commit ||
        bound.content_sha256 !== item.content_sha256)
    )
      issues.push({
        code: "evidence_conflicts_with_candidate_entry",
        path: `spec.methodology.evidence[${index}]`,
      });
  });
  return {
    state: issues.length === 0 ? "current" : "stale",
    issues: ordered(issues),
  };
}

/**
 * Answers "may AI LAB execute the actual upstream candidate/model path?"
 * for a specification and the current AI-142 entry. Always
 * `not_eligible_for_candidate_execution`; the blockers are:
 *
 *  - the standing AI-144 blockers (no authority; upstream code not
 *    admitted to the AI-143 sandbox; hostile-code isolation not
 *    established; no model artifact and no runtime dependency set bound);
 *  - every AI-142 evidence gap of the entry, verbatim;
 *  - `base_model_license_unresolved` whenever the base-model licensing
 *    layer is not `evidenced` (a code license is never a model license);
 *  - `candidate_entry_invalid` or `candidate_binding_stale` when the entry
 *    no longer validates or no longer matches the specification exactly.
 */
export function evaluateCandidateExecutionReadiness(
  spec: CandidateAdapterSpec,
  entryValue: unknown,
): CandidateExecutionReadiness {
  const blockers = new Set<CandidateExecutionBlocker>(
    CANDIDATE_EXECUTION_STANDING_BLOCKERS,
  );
  const binding = checkCandidateAdapterBinding(spec, entryValue);
  if (binding.state === "invalid") blockers.add("candidate_entry_invalid");
  else {
    if (binding.state === "stale") blockers.add("candidate_binding_stale");
    const entry = entryValue as DecisionCandidateEntry;
    for (const gap of entry.evidence_gaps)
      if ((DECISION_CANDIDATE_EVIDENCE_GAPS as readonly string[]).includes(gap))
        blockers.add(gap);
    if (entry.licensing.base_model.status !== "evidenced")
      blockers.add("base_model_license_unresolved");
  }
  return {
    state: "not_eligible_for_candidate_execution",
    blockers: CANDIDATE_EXECUTION_BLOCKERS.filter((code) => blockers.has(code)),
  };
}

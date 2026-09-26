import { readFileSync } from "node:fs";

import {
  computeDecisionCandidateHash,
  computeDecisionCandidateRegistryHash,
  deriveDecisionCandidateEvidenceGaps,
  type DecisionCandidateEntry,
  type DecisionCandidateIssueCode,
  type DecisionCandidateRegistry,
  type DecisionCandidateValidation,
} from "../../src/decision-candidates/index.js";

export const FIXTURE_ROOT = "data/fixtures/decision-candidates";

export function load<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Mutable = Record<string, any>;

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function modelEntry(): Mutable {
  return load<Mutable>(`${FIXTURE_ROOT}/valid-candidate-entry.json`);
}

export function adapterEntry(): Mutable {
  return load<Mutable>(`${FIXTURE_ROOT}/valid-candidate-entry-multi-role.json`);
}

/** A candidate whose requested repository moved to a resolved one. */
export function movedEntry(): Mutable {
  return load<Mutable>(
    `${FIXTURE_ROOT}/valid-candidate-entry-moved-repository.json`,
  );
}

export function fixtureRegistry(): Mutable {
  return load<Mutable>(`${FIXTURE_ROOT}/valid-candidate-registry.json`);
}

/** Re-derives gaps/completeness and recomputes the self-hash. */
export function rehashEntry(entry: Mutable, derive = true): Mutable {
  if (derive) {
    const gaps = deriveDecisionCandidateEvidenceGaps(
      entry as DecisionCandidateEntry,
    );
    entry["evidence_gaps"] = [...gaps];
    entry["evidence_completeness"] =
      gaps.length === 0 ? "complete" : "incomplete";
  }
  entry["candidate_hash"] = computeDecisionCandidateHash(
    entry as DecisionCandidateEntry,
  );
  return entry;
}

/** Applies a mutation to a copy of `base` and recomputes its hash. */
export function mutateEntry(
  base: Mutable,
  mutate: (entry: Mutable) => void,
  derive = true,
): Mutable {
  const entry = clone(base);
  mutate(entry);
  return rehashEntry(entry, derive);
}

export function rehashRegistry(registry: Mutable): Mutable {
  registry["registry_hash"] = computeDecisionCandidateRegistryHash(
    registry as DecisionCandidateRegistry,
  );
  return registry;
}

/** Builds an exact registry manifest for the given valid entries. */
export function registryFor(
  entries: readonly Mutable[],
  overrides: Mutable = {},
): Mutable {
  const sorted = [...entries].sort((a, b) =>
    a["candidate_id"] < b["candidate_id"] ? -1 : 1,
  );
  const role: Record<string, number> = {};
  const completeness: Record<string, number> = {};
  const candidates = sorted.map((entry) => {
    const roles = (entry["roles"] as { role: string }[]).map((r) => r.role);
    for (const r of roles) role[r] = (role[r] ?? 0) + 1;
    const c = entry["evidence_completeness"] as string;
    completeness[c] = (completeness[c] ?? 0) + 1;
    return {
      candidate_id: entry["candidate_id"],
      evidence_revision: entry["evidence_revision"],
      candidate_hash: entry["candidate_hash"],
      repository: entry["upstream"]["repository"],
      pinned_commit_sha: entry["upstream"]["pinned_commit_sha"],
      roles,
      evidence_completeness: c,
    };
  });
  return rehashRegistry({
    contract: "typed_decision_candidate_registry",
    schema_version: "1.0.0",
    registry_id: "ai-lab-fixture-decision-candidates",
    registry_version: "1.0.0",
    review: { state: "in_review", human_review_required: true },
    supersedes: null,
    authority: "evidence_only",
    universal_winner: false,
    candidates,
    role_distribution: role,
    evidence_completeness_distribution: completeness,
    registry_hash: "",
    ...overrides,
  });
}

export function codes<T>(
  check: DecisionCandidateValidation<T>,
): DecisionCandidateIssueCode[] {
  return check.ok ? [] : check.issues.map((issue) => issue.code);
}

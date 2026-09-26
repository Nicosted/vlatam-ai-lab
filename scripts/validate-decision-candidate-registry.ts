/**
 * AI-142 — offline, read-only validation of a typed decision candidate
 * registry directory (`<root>/registry.json` + `<root>/candidates/*.json`).
 * Prints the registry identity, bindings and distributions, or the
 * fail-closed issues. It never fetches, clones, installs, loads or runs any
 * candidate, and never touches the network.
 */
import { readFileSync, readdirSync } from "node:fs";

import { validateDecisionCandidateRegistry } from "../src/decision-candidates/index.js";

const root = process.argv[2] ?? "data/decision-candidates/v1";
const read = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const candidates = readdirSync(`${root}/candidates`)
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => read(`${root}/candidates/${name}`));
const check = validateDecisionCandidateRegistry(
  read(`${root}/registry.json`),
  candidates,
);
if (!check.ok) {
  console.error(JSON.stringify({ ok: false, issues: check.issues }, null, 2));
  process.exitCode = 1;
} else {
  const { registry, candidates: entries } = check.value;
  console.log(
    JSON.stringify(
      {
        ok: true,
        registry_id: registry.registry_id,
        registry_version: registry.registry_version,
        registry_hash: registry.registry_hash,
        review_state: registry.review.state,
        authority: registry.authority,
        universal_winner: registry.universal_winner,
        candidates: entries.map((entry) => ({
          candidate_id: entry.candidate_id,
          repository: entry.upstream.repository,
          pinned_commit_sha: entry.upstream.pinned_commit_sha,
          roles: entry.roles.map((role) => role.role),
          evidence_gaps: entry.evidence_gaps,
          registry_state: entry.lifecycle.registry_state,
          execution_enabled: entry.lifecycle.execution_enabled,
        })),
        role_distribution: registry.role_distribution,
        evidence_completeness_distribution:
          registry.evidence_completeness_distribution,
      },
      null,
      2,
    ),
  );
}

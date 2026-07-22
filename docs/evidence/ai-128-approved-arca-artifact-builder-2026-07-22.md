# AI-128 Approved ARCA Artifact Builder Evidence

Date: 2026-07-22
Status: implemented locally for human review; no real artifact created

## Baseline and preconditions

- Repository: `Nicosted/vlatam-ai-lab`.
- Required starting branch: clean `main` with clean index and worktree.
- `git fetch origin --prune`: succeeded before branch creation.
- Local `main` and `origin/main`: exact commit
  `8cd7a3149558f4fccf263393c72b37f86d7942a4`.
- PR #122: merged into `main` on 2026-07-22; merge commit `8cd7a31`.
- AI-126 authoritative candidate validator and AI-127 review/evaluation
  contracts and evaluator were present and verified before branch creation.
- Implementation branch: `feat/ai-128-approved-arca-artifact-builder`.
- Graphify baseline: absent; repository governance therefore required normal
  local inspection. No Graphify output was fabricated or generated.

## Contracts, configuration, and canonical hashing

Contract versions:

- AI-126 Governed ARCA Candidate: `1.0.0`.
- AI-127 Governed ARCA Candidate Review: `1.0.0`.
- AI-127 review evaluation: `1.0.0`.
- AI-128 Approved ARCA Artifact: `1.0.0`.
- AI-128 build result: `1.0.0`.
- AI-128 builder version: `1.0.0`.
- Operator Read Model: `1.6.0`.

Published schema file SHA-256 values:

- Candidate: `47751930c574b17622c2abfa0081b30b74964ee1309b726f1a8a1aad0455ff37`.
- Review: `3ced2b680961ff26dcb0d999410df16b2789adb0c5cef24e1702215256857af1`.
- Evaluation: `6bc5cf9555f04fe9ea4b17f5f354225738786a11fe6340076f46c9ac533f934f`.
- Approved Artifact: `b3d6c9a6cf26de3cd3ba5b7a1550be08816b8f75308fd23476bf4990041a3754`.
- Build result: `bf23a859441a4175e2c7fb9454d3640216e88e3adba866a2d5f86a5eec06c29f`.

Builder configuration SHA-256:
`608721250f62c041a33f605008ffa6f3ac7e8b827b8bf433d380986c7ba25c13`.
It binds builder version, canonicalization version, artifact hash domain,
evaluation-time policy, local layout, no-overwrite publication strategy, and
exact-payload policy.

Canonicalization is `review-json-v1`: recursively sorted plain-object keys,
preserved array order, finite JSON primitives only. Domain-separated SHA-256
is computed over `domain + "\n" + canonical JSON`. AI-128 adds:

- `vlatam-ai-lab/approved-arca-builder-configuration/v1`;
- `vlatam-ai-lab/approved-arca-artifact/v1`.

Only `approved_artifact_id` and `approved_artifact_sha256` are excluded from
their own artifact hash payload. The ID is
`approved-arca-artifact--<approved_artifact_sha256>`. Mutation coverage walks
every other leaf value and proves each participates in the canonical hash.

## Exact eligibility logic and outcome precedence

The builder does not trust a supplied `eligible_for_approved_artifact_building`
string. Before any filesystem access it:

1. validates the explicit builder identity;
2. validates the canonical build timestamp;
3. invokes the authoritative AI-126 candidate validator;
4. invokes the authoritative AI-127 supplied-evaluation schema, timestamp,
   ID, and self-hash validator;
5. detects exact prohibited role reuse, including inconsistent future role
   assignment;
6. recomputes AI-127 from the supplied candidate and review at the supplied
   evaluation's exact `evaluated_at` timestamp;
7. rejects an invalid review/candidate;
8. requires complete canonical equality between supplied and recomputed
   evaluations, which is stronger than ID/hash comparison alone;
9. requires the recomputed outcome to be
   `eligible_for_approved_artifact_building`;
10. rechecks review expiry at the build timestamp;
11. requires build time at or after parsing, review decision, and evaluation;
12. rechecks all builder separation-of-duties roles;
13. builds the artifact from the exact candidate parsed output and validates
    its closed schema, ID/hash, duplicate bindings, count, and payload hash.

Outcome precedence is:

1. `invalid_builder_identity`;
2. `invalid_build_timestamp` for malformed timestamps;
3. `invalid_candidate`;
4. `invalid_evaluation`;
5. `separation_of_duties_violation` for an exact prohibited role conflict;
6. `invalid_review`;
7. `evaluation_mismatch`;
8. `review_expired` at evaluation or build time;
9. `not_eligible` for pending, rejected, superseded, or any other valid
   non-eligible AI-127 outcome;
10. `invalid_build_timestamp` for valid but non-monotonic timestamps;
11. `approved_artifact_exists`;
12. `approved_artifact_build_failed`;
13. `approved_artifact_built`.

Every result fixes export, publication, production reliance, database write,
network call, scheduler, deployment, and `vlatam-global` access authority to
false.

## Separation of duties

Builder identity is mandatory and closed to either
`human:<stable-id>` or the exact service identity
`service:approved-arca-builder@1.0.0`. Comparisons are exact and performed only
after identity validation. The builder must differ from:

- evidence reviewer;
- acquisition operator;
- candidate producer;
- parser/runtime identity;
- any future publisher/export approver.

AI-127's future artifact-builder and future publisher/export-approver fields
must remain null. A non-null field equal to the requested builder is an exact
separation-of-duties violation; any other non-null assignment invalidates the
review. AI-128 records the actual builder identity only in the immutable
Approved Artifact.

## Local publication guarantees

- Publication is limited to an explicitly configured local root.
- Every existing root ancestor and the final root are inspected with `lstat`;
  symbolic links and non-directories are rejected.
- Root validation runs before and after recursive directory creation and again
  immediately before atomic publication.
- The artifact filename is derived only from the canonical artifact ID.
- A uniquely named staging file is opened with exclusive creation, written,
  synchronized, and hard-linked atomically to the final no-overwrite name.
- Any existing final component returns `approved_artifact_exists`; it is never
  overwritten or mutated.
- Staging cleanup runs after success, collision, and failure.
- Every contract, identity, hash, eligibility, temporal, and role failure
  occurs before root creation or any other filesystem write.

The local write is artifact construction, not external publication. Artifact
state remains `not_exported`, `not_published`, and production/vLatamGlobal
reliance remains `not_authorized`.

## Synthetic evidence and repository-current state

Positive fixtures exist only as values constructed inside tests. They use
explicitly synthetic reviewer, operator, producer, and builder identities and
temporary local roots. No positive fixture, review, evaluation, or Approved
Artifact was added to repository data.

The repository-backed Operator state remains:

- synthetic pending AI-127 review;
- no real reviewer or human approval;
- no Approved ARCA Artifact;
- null artifact/candidate/review/evaluation/builder/build bindings;
- `not_exported`, `not_published`, and `not_authorized` production reliance;
- all external/write authorities false.

The Operator change is read-only contract `1.6.0`; no form, button, POST
endpoint, persistence path, or mutation control was added.

## Validation record

- Focused AI-128 plus AI-126 candidate/parser, AI-127 review/evaluation,
  Operator, schema, CLI, and architecture-boundary regressions: **72 passed, 0
  failed** across **63 top-level tests** and **2 suites**.
- Full repository suite: **1,170 passed, 0 failed** across **228 top-level
  tests** and **152 suites**.
- TypeScript typecheck: passed.
- TypeScript build: passed.
- Scoped ESLint for all changed TypeScript files: passed.
- Scoped Prettier for new and clean modified source, tests, schemas,
  documentation, registry, and package metadata: passed. The pre-existing
  unformatted roadmap was intentionally kept to a one-line targeted edit.
- `git diff --check`: passed before evidence finalization and must be rerun at
  handoff.
- The full suite initially encountered a sandbox-only `tsx` IPC `EPERM`; the
  identical local command passed when permitted to create its temporary IPC
  socket. No network or external service was used.

## Pre-existing repository-wide debt

- Repository-wide ESLint still reports **42 existing errors** in legacy
  validation scripts and crawler modules. No changed AI-128 TypeScript file is
  in that set.
- Repository-wide Prettier still reports **194 existing files**, including
  `docs/architecture/ai-roadmap-dependency-map.md`. No new AI-128 file is in
  that set. The roadmap was not broadly reformatted.
- No unrelated lint or format debt was repaired.

## Assumptions and known limitations

- Identity strings are controlled contract metadata, not cryptographic
  authentication or signatures. Identity assurance remains a human/operator
  governance responsibility.
- The builder accepts already governed JSON contracts; it does not discover
  them, read arbitrary raw source files, or re-open acquisition bytes.
- AI-126's existing `JSON.stringify(parsed_output)` hash remains authoritative
  for `parsed_output_sha256`; AI-128 separately uses stable canonical JSON for
  complete artifact identity.
- Local hard-link publication assumes the staging file and final artifact are
  on the same filesystem because both are created inside the configured root.
- This phase creates no repository-current artifact catalog or discovery
  service. The Operator projection therefore reports the reviewed repository
  fact that no Approved ARCA Artifact is present.

## Security, governance, and explicit non-authorization

AI-128 imports no network transport, model/provider adapter, secret resolver,
scheduler, database client, deployment code, export/publisher module, or
`vlatam-global` integration. It performs no network/provider/LLM call,
database write, scheduler activation, deployment, export, external
publication, production activation, or `vlatam-global` access. It reads no
credential, `.env*`, customer, production, or workstation-history data.

No real reviewer, builder, approval, evaluation, or Approved Artifact was
fabricated. No repository-current pending fixture was built. No branch was
merged or deleted, and no deployment was attempted.

## Exact next step

AI-129 ARCA Operator Review Console, preserving the read-only and
non-authorizing boundary until separately reviewed mutation, export,
publication, and production-reliance contracts exist.

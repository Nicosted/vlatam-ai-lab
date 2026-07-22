# AI-127 governed ARCA candidate human-review evidence

Date: 2026-07-22

## Source snapshot and preconditions

- Repository: `Nicosted/vlatam-ai-lab`.
- Baseline branch: `main`; worktree and index were clean.
- `git fetch origin` succeeded and local `main` exactly matched `origin/main`.
- Baseline commit: `f4549b53ede292b09004c3fd4a3cf6b09b1ce3ea`.
- PR #121 was merged at that baseline commit on 2026-07-22.
- The AI-126 acquired-source input/candidate schemas, shared parser, governed
  ingestion adapter, tests, architecture boundary, and dated evidence report
  were present before branch creation.
- Implementation branch: `feat/ai-127-arca-candidate-human-review`.

### PR #122 follow-up hardening baseline

- Follow-up baseline commit:
  `5fb905197a73d988714be2ad6a6e461e9fe978e4`.
- Before the follow-up, the worktree and index were clean, the local branch
  exactly matched origin, and PR #122 remained open and draft against `main`.
- The follow-up addresses temporal validity and a closed reviewer identity
  namespace without changing the contract versions or evaluator precedence.

## Contracts, canonicalization, and identities

- Review contract: `governed_arca_candidate_review`, version `1.0.0`.
- Evaluation contract: `governed_arca_candidate_review_evaluation`, version
  `1.0.0`.
- Canonicalization: recursively sorted plain JSON object keys, preserved array
  order, finite JSON primitives only; version `review-json-v1`.
- Candidate domain: `vlatam-ai-lab/governed-arca-candidate/v1`.
- Review domain: `vlatam-ai-lab/governed-arca-candidate-review/v1`.
- Evaluation domain:
  `vlatam-ai-lab/governed-arca-candidate-review-evaluation/v1`.
- Domain hashes are SHA-256 of `domain + "\n" + canonical JSON`. Candidate IDs,
  review IDs, and evaluation IDs are deterministically derived from their
  corresponding complete content hashes. Review hashing omits only the two
  derived review identity fields; evaluation hashing likewise omits only its
  two derived evaluation identity fields.
- Published review schema file SHA-256:
  `3ced2b680961ff26dcb0d999410df16b2789adb0c5cef24e1702215256857af1`.
- Published evaluation schema file SHA-256:
  `6bc5cf9555f04fe9ea4b17f5f354225738786a11fe6340076f46c9ac533f934f`.
- Repository synthetic candidate canonical SHA-256:
  `7d6bd452fe023a6cf2b946a01065817eeda756f3e7b57b963d151d41e8bb6073`.
- Repository pending review canonical SHA-256:
  `c1ac0ed41aa5128cfda67758f042272f02830c3759f51884091e3e19ed4a0205`.
- Repository pending evaluation SHA-256 at
  `2026-07-22T15:00:00.000Z`:
  `febe2869c263f268fa2859d8390fef077ecd8a69d2a7dbb09877fb16769f6d52`.

The candidate binding includes schema version, artifact type,
filesystem-independent artifact ID, complete candidate SHA-256, acquisition
ID, acquisition-record SHA-256, raw-byte SHA-256, parser ID/version/
configuration SHA-256, parsing timestamp, parsed-output SHA-256, and tariff-line
count. A repository-relative path is provenance metadata only.

## Lifecycle, precedence, and separation of duties

Lifecycle values are closed to `pending`, `approved`, `rejected`, `expired`,
and `superseded`; unknown or skipped values are invalid. Evaluator precedence:

1. `invalid_candidate` (authoritative AI-126 schema/semantic validation);
2. `invalid_review` (closed schema, deterministic identity/hash, reviewer,
   timestamps, future-decision rejection, expiry-after-decision requirements,
   closed human identity namespace, separation of duties, statements/reasons,
   supersession shape, and blocking findings);
3. `candidate_binding_mismatch` (every exact load-bearing binding);
4. `superseded`;
5. `expired` (explicit state or reached expiry);
6. `rejected`;
7. `pending_human_review`;
8. `eligible_for_approved_artifact_building`.

The acquisition operator, parser/runtime, candidate producer, evidence
reviewer, future builder, and future publisher/export approver are explicit
roles. The evidence reviewer must use the closed `human:<stable-id>` namespace,
must match the reviewer role assignment exactly, must explicitly assert
independence, and must differ exactly from the acquisition operator, candidate
producer, and parser/runtime identity. Decided reviews must identify the
acquisition operator and candidate producer; the evaluator never infers or
normalizes any role identity. Future builder and publisher/export approver
identities are contractually null in AI-127.

Every decided lifecycle requires a canonical decision timestamp at or before
the explicitly injected evaluation time. A decided review carrying an expiry
must place it strictly after the decision. Future decisions return
`invalid_review` with `review_decision_in_future`; equal or earlier expiries
return `invalid_review` with `review_expiry_not_after_decision`. The evaluator
does not consult local wall-clock time.

## Synthetic evidence versus repository current state

Tests use an explicitly synthetic approved review only to demonstrate the
positive evaluator outcome. It is not stored as current approval evidence.
The repository fixture is explicitly synthetic and pending, with no reviewer,
decision timestamp, review statement, rejection reason, independence claim, or
eligibility. The Operator Read Model `1.5.0` projects that pending state without
adding mutation UI or endpoints.

## Validation record

- Focused AI-127 review/schema/fixture/boundary/Operator tests plus AI-126
  ingestion/parser and existing review-governance regressions: **78 passed, 0
  failed** across **52 top-level tests** and **9 suites**.
- Temporal coverage includes future approved, rejected, and superseded
  decisions; expiry equal to and before the decision; valid approval before
  expiry; equality at the injected evaluation timestamp; and temporal hash
  mutation.
- Identity coverage rejects arbitrary identities and the requested automated
  forms while accepting only the closed `human:<stable-id>` namespace. The
  synthetic approved test identity is
  `human:synthetic-independent-reviewer`; the repository-current pending
  fixture still has no reviewer or decision.
- Published review and result schemas compile in strict AJV, match their source
  constants, reject unknown fields, and validate the repository pending state
  and deterministic result.
- Full repository test suite: **1,153 passed, 0 failed** across **211 top-level
  tests** and **152 suites**.
- TypeScript typecheck: passed.
- TypeScript build: passed.
- Scoped ESLint across every changed TypeScript source/test file: passed.
- Scoped Prettier across all new files and clean modified code/schema/fixture/
  documentation files: passed. The pre-existing unformatted roadmap file was
  not broadly reformatted.
- `git diff --check`: passed.
- Changed-file scan found no credential values, workstation absolute paths,
  environment/secret resolution, network primitives, LLM/provider calls,
  database writes, scheduler activation, approval fabrication, executable
  publication/export route, or `vlatam-global` integration. Matches were
  imports/exports in the TypeScript language, synthetic test identities,
  required false-authority fields, negative architecture assertions, and
  explicit non-authorization documentation.
- Review schema file SHA-256:
  `3ced2b680961ff26dcb0d999410df16b2789adb0c5cef24e1702215256857af1`.
- Evaluation schema file SHA-256:
  `6bc5cf9555f04fe9ea4b17f5f354225738786a11fe6340076f46c9ac533f934f`.

## Pre-existing repository-wide debt

- Repository-wide ESLint reports **42 existing errors** in legacy scripts and
  crawler modules. No changed AI-127 TypeScript file is in that set.
- Repository-wide Prettier reports **194 existing files**, including
  `docs/architecture/ai-roadmap-dependency-map.md`. No new AI-127 file is in
  that set; the roadmap was kept as a targeted line edit to avoid unrelated
  broad reformatting.
- No unrelated lint or formatting debt was repaired.

## Assumptions and limitations

- AI-127 evaluates only explicitly injected candidate, review, and timestamp
  values. It does not discover or persist reviews.
- The AI-126 parsed-output hash convention remains authoritative for that
  existing field; AI-127 adds a separate stable canonical hash over the
  complete candidate without changing AI-126 artifacts.
- Identity strings are controlled metadata, not authentication. Actual human
  identity assurance/signature infrastructure remains separately governed.
- The repository pending fixture is synthetic contract evidence, not an actual
  acquired candidate or performed human review.

## Security, governance, and explicit non-authorization

The evaluator imports no filesystem writer, network transport, provider/model
adapter, secret/environment resolver, scheduler, database client, deployment
code, publisher/export module, future Approved Artifact builder, or
`vlatam-global` integration. It performs no LLM/provider call, filesystem write,
database operation, approval action, or publication.

Even `eligible_for_approved_artifact_building` authorizes only a later AI-128
builder to evaluate the same separately supplied candidate and review. It does
not create an Approved Artifact and does not authorize export, publication,
production reliance, database writes, network calls, scheduling, deployment,
or `vlatam-global` access. Every one of those non-authorities is explicit in the
evaluation result contract.

## Exact next step

AI-128 Approved ARCA Artifact Builder, in a separate reviewed PR. AI-128 must
reuse the AI-126 candidate validator and AI-127 evaluator, accept the exact
candidate/review pair explicitly, and preserve all later export/publication
approval gates.

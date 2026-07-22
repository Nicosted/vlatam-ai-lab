# AI-130 Durable ARCA Review and Artifact Store evidence

Date: 2026-07-22
Branch: `feat/ai-130-durable-arca-review-artifact-store`
Original baseline: `d1305f1a05a7691012f6fa615601624c24e5de21`
Crash-recovery follow-up baseline: `1078771a23dca982a2140bed456bb45545749ead`

## Crash-recovery follow-up preconditions

- Work continued on existing branch
  `feat/ai-130-durable-arca-review-artifact-store`; no branch or PR was
  created.
- The worktree and index were clean before the follow-up.
- Local `HEAD`, fetched `origin/feat/ai-130-durable-arca-review-artifact-store`,
  and the required baseline exactly matched
  `1078771a23dca982a2140bed456bb45545749ead`.
- Existing PR #125 was open, draft, and targeted `main`; it remains the only PR
  in scope.
- The repository still had no `graphify-out/graph.json`; direct local source
  inspection was used after checking the Graphify boundary.

## Baseline and preconditions

- Repository remote verified as `https://github.com/Nicosted/vlatam-ai-lab.git`.
- Work started from clean `main` after `git fetch origin` succeeded.
- Local `main`, `origin/main`, and `HEAD` exactly matched `d1305f1`.
- The baseline commit is `feat(ai): add ARCA operator review console (#124)`;
  PR #124 is therefore present on merged main.
- AI-126 candidate/input contracts and authoritative validator, AI-127
  review/evaluation contracts and evaluator, AI-128 Approved Artifact/result
  contracts and validator, and AI-129 Operator Console/read model were present.
- Only root `AGENTS.md` applies; no nested `AGENTS.md` exists.
- The repository had no `graphify-out/graph.json`; Graphify was not fabricated
  and direct source verification was used.

## Implemented boundary

AI-130 adds one repository-owned filesystem store for already-created governed
records:

`candidate → review → evaluation → Approved Artifact → durable audit projection`

The chosen upstream model is `upstream-record-must-already-exist`. Each
downstream operation loads and verifies exact immutable predecessor records.
The store never infers a missing record and never creates a governance
decision, evaluation, or Approved Artifact.

## Contracts and hashes

All AI-130 contracts are closed Draft 2020-12 schemas at `1.0.0`:

| Contract                    | Schema SHA-256                                                     |
| --------------------------- | ------------------------------------------------------------------ |
| Durable store command       | `6d6e4ac4efc952ec3b8fc2dc6d993603fafe35ef145055bcd5f89c3c2f92d153` |
| Append-only audit event     | `07787dc63a652eaf82985c72eed0c05024d0c9c8896a8eae94bf3492fd33b158` |
| Operation recovery journal  | `05acfce2eabd65c7de23ce291dd12bfbbf24ef0a1c87ab103b0a4f86fc829c98` |
| Durable workflow projection | `d0cd383ae1b7e70bb4316d3d36346430046eabe2cacf4bf8de5661a8e186caf7` |
| Store operation result      | `06ca112b787cedf2cf1111c87a8391143851c103ce33f0e7222ddc69e79e8b67` |

The store configuration SHA-256 is
`1e3361cef3869214eee6488a9a6a341aa89a5a9052e735c5b95669a3d3a6c086`.
It domain-binds implementation `1.0.0`, layout `1.0.0`, canonicalization
`review-json-v1`, all five contract versions, filename encoding, event
ordering, and the upstream model. The checked-in event schema fixes the exact
configuration hash.

## Layout and path authority

- `candidates/<candidate-id>.json`
- `reviews/<review-id>.json`
- `evaluations/<evaluation-id>.json`
- `approved-artifacts/<approved-artifact-id>.json`
- `events/<12-digit-sequence>--<event-id>.json`
- `journals/arca-store-journal--<plan-sha256>.json`
- `projections/arca-workflows/<candidate-id>.json`

Record paths come only from IDs whose authoritative schemas/self-hashes have
validated. Governed records cannot supply arbitrary paths. Root validation
walks every configured-root component, rejects symbolic-link ancestors and
final components, rejects non-directories, creates only the closed layout,
and revalidates each known directory. Publication also rejects symbolic-link
or non-file final record/projection components.

## Validation and binding

- Candidate persistence reuses `validateGovernedArcaCandidate()` and derives
  the candidate ID/domain hash through the AI-127 binding helper.
- Review persistence runs the authoritative AI-127 evaluator against the exact
  stored candidate at the explicit event timestamp and independently verifies
  review hash/ID.
- Evaluation persistence reuses the authoritative evaluation validator and
  verifies exact candidate/review ID and hash bindings.
- Approved Artifact persistence reuses `validateApprovedArcaArtifact()` and
  verifies the exact stored candidate/review/evaluation identities and hashes.
- Unknown fields fail the authoritative closed schemas. Orphan downstream
  records and inconsistent identities fail closed.
- Candidate bytes preserve AI-126's authoritative legacy
  `JSON.stringify(parsed_output)` convention. Domain-separated candidate,
  review, evaluation, artifact, event, configuration, and projection hashes
  remain canonical.

## Append-only chain and replay

Each event binds its schema/type/version, ID/hash, explicit canonical UTC
timestamp, operation/outcome, actor, exact workflow identities/hashes, prior
event ID/hash, sequence, store configuration hash, and false external
authority fields. Genesis alone has null prior bindings.

Replay sorts identity-derived filenames and requires contiguous sequence from
one. It recomputes every event hash/ID, verifies prior bindings, validates all
immutable records, rejects orphan records, and reconstructs each projection.
Tests detect modified prior hashes, missing events, reordered filenames,
duplicate sequences, modified records, and projection tampering.

No code obtains the current time. Contract-relevant timestamps are supplied
explicitly by the caller. Randomness is used only for unobservable staging
filenames.

## Durability, idempotency, and concurrency

Immutable record/event publication writes an exclusive mode-`0600` staging
file, calls file `fsync`, publishes with an atomic no-overwrite hard link, and
calls parent-directory `fsync`. Staging cleanup runs in `finally`. Equal
existing bytes return `duplicate_unchanged` without a new event. Different
bytes at the same identity return `identity_collision`; no overwrite occurs.

Projection publication writes and `fsync`s a complete staging file and uses
atomic rename followed by parent-directory `fsync`. A failed publication does
not expose partial projection bytes and leaves no staging file. The projection
is replaceable only because it is derived and explicitly says
`authoritative_over_records: false`.

An exclusive `.operation-lock` directory serializes writers and verification
across competing processes. A contender fails closed as `store_busy`; there
is no waiting loop, guessed lock takeover, scheduler, or distributed lock
service. Exclusive immutable publication remains a second collision barrier.

Every mutating operation now first publishes a closed, domain-hashed journal
containing the exact planned record, event, and projection bytes and hashes;
derived paths; prior event/projection bindings; configuration hash; and false
external authorities. Journal stages are atomically replaced and directory
`fsync`ed. The journal is deleted only after its completed stage is durable.

Recovery runs under the exclusive lock before ordinary chain replay and uses
only recorded bytes. Record operations complete
`record → event → projection`; rebuilds complete `projection → event`, so an
audit event cannot durably claim a rebuild whose exact projection is missing.
A retry reuses the planned event sequence/identity and cannot append a
replacement event. Mismatched visible bytes, malformed/hash-invalid journals,
multiple journals, and unexpected journal entries fail closed as integrity
errors and preserve the journal for human inspection.

## Operation/result precedence

1. closed command/schema, actor, and explicit timestamp validation;
2. configured-root safety and closed-layout initialization;
3. exclusive lock acquisition;
4. active-journal validation and deterministic recovery;
5. existing event-chain replay/integrity verification;
6. authoritative record validation and exact upstream binding;
7. byte-equal idempotency or fail-closed identity collision;
8. durable journal-plan publication;
9. operation-specific exact-byte publication and durable stage updates;
10. journal completion/removal and closed result with every
    external-authority field false.

`invalid_command` precedes filesystem access. Unsafe roots and `store_busy`
precede record validation. Orphan/binding/schema failures precede publication.
`duplicate_unchanged` creates neither event nor projection churn.

## Operator integration

AI-129 remains unchanged. No reviewed repository-current durable-store root
configuration exists, and the HTTP/read-model boundary must not accept path
authority from requests or environment values. AI-130 therefore adds no form,
button, POST route, store write handler, or misleading configured-state
display. The Operator docs explicitly record this absence and require any
future store display to be separately reviewed and read-only.

## Validation evidence

- Final focused AI-130 store run: **20/20 tests passed**, including all
  journal stages, both publication-order asymmetries, retry idempotency,
  visible-byte mismatch, tampered journal, and unexpected journal coverage.
- AI-126/127/128/129 focused regression run: **129/129 tests passed**.
- Full repository suite: **1198/1198 tests passed** across **250** top-level
  test groups and **153** suites.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Scoped ESLint for all changed TypeScript: passed with zero findings.
- Scoped Prettier for all changed files: passed with zero findings.
- Schema compilation and closed-schema validation: passed.
- `git diff --check`: passed.
- Changed-file boundary scan found no network/provider/LLM/external database,
  scheduler, deployment, publisher/export, production activation,
  approval-fabrication, builder invocation, credential/workstation path, or
  `vlatam-global` integration. Matches were schema `$id` values, fixed-false
  authority fields, documentation, and negative architecture assertions.

## Pre-existing lint and format debt

Repository-wide ESLint still reports the same **42 existing errors** in legacy
validation/crawler files. Repository-wide Prettier reports **193 existing
unformatted files**. All AI-130 changed files pass scoped lint and format.
This PR does not repair unrelated debt.

## Known limitations

- The store is single-host local filesystem infrastructure. It provides no
  distributed coordination and assumes filesystem support for atomic hard
  links/renames and meaningful `fsync`.
- A process crash can leave `.operation-lock`; AI-130 intentionally does not
  guess that a lock is stale. Human inspection is required before recovery.
- The journal is a single-host filesystem recovery protocol, not a distributed
  transaction or protection against a malicious local operator who can rewrite
  both governed files and their hashes. Unexpected or divergent state requires
  human inspection; it is never guessed through.
- No real human approval, repository-current Approved Artifact, or production
  workflow was created. Positive Approved Artifact coverage is synthetic and
  test-only.
- The Operator Console does not read this store until a reviewed, trusted
  local root configuration and read-only contract are introduced.

## Explicit non-authorization statement

AI-130 authorizes only local persistence and integrity verification of
already-created governed records. It does **not** authorize live ARCA
acquisition, approval/rejection, review fabrication, artifact building,
export, publication, production reliance or activation, scheduling,
deployment, external database/network access, credentials, provider/LLM use,
or `vlatam-global` access.

## Exact next step

**AI-131 Controlled Live ARCA Run**, in a separate reviewed change with its
own explicit authority gates. AI-130 does not start or pre-authorize that run.

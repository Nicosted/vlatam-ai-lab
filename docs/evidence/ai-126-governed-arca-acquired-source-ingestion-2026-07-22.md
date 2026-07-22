# AI-126 governed ARCA acquired-source ingestion evidence

Date: 2026-07-22

## Source snapshot

- Repository: `Nicosted/vlatam-ai-lab`.
- Baseline branch: `main`.
- Baseline commit: `5efedcf13aaeddf22bed1f9a69e2b5780d3a45d3`.
- Remote comparison after `git fetch origin`: local `main` and `origin/main`
  were identical (`0 0` divergence).
- Baseline worktree and index: clean.
- Required predecessors: PRs #118, #119, and #120 were merged and their merge
  commits were ancestors of the baseline.
- Governed acquisition implementation and its final response-disposal,
  cancellation-failure, overflow, and failure-side-effect tests were present.

## Transparent delta

- Extracted the existing ARCA nomenclador algorithm into one shared parser
  module. The legacy crawler and AI-126 adapter both use that module; no
  competing parser was added.
- Added versioned closed input and candidate JSON Schemas and registered both
  contracts.
- Added a replay-only ingestion adapter that derives paths from governed
  identities, rejects traversal/symlinks, verifies acquisition-record and raw
  hashes and all provenance bindings, classifies supported content, validates
  parser identity/configuration, and atomically publishes one immutable
  candidate.
- Added a narrow local CLI that accepts a governed input contract and configured
  roots. It has no URL, prompt, live acquisition, or arbitrary raw-file input.
- Added deterministic parser, positive, negative, provenance-mutation,
  raw-byte-replacement, symlink, missing-file, collision, no-partial-output,
  schema, and architecture-boundary tests.

## Security and governance findings

- Acquisition metadata is treated as untrusted until its exact byte hash is
  verified against the closed parser input.
- Raw bytes are opened only from the identity-derived acquisition directory,
  through no-symlink/no-follow checks, and are hashed before parser invocation.
- Only acquisition records with `mode: replay` are accepted in this phase.
- Candidate publication uses a complete staging file plus an atomic hard-link
  no-overwrite step; failures remove staging and never replace an existing
  candidate.
- Candidate states are fixed to `human_review_required`, `not_approved`, and
  `not_publishable`.
- No credential, environment file, database, production service, scheduler,
  discovery loop, network acquisition, LLM execution, approval action,
  Approved Artifact publication, deployment, or `vlatam-global` integration
  was added or exercised.

## Assumptions and limitations

- The trusted operator supplies the governed acquisition root and candidate
  root as local configuration. Raw artifact paths are never accepted by the
  input contract or CLI.
- This initial boundary accepts only the exact governed ARCA source identity,
  parser identity/version/configuration, replay provenance, and supported
  delimiter-text classification.
- A successful candidate is syntactically valid parser output, not reviewed
  regulatory truth. Human review and all later snapshot/evidence/export steps
  remain separate.
- Live acquisition-to-parser execution, automatic discovery, concurrency
  coordination, recurring execution, approval, publication, and downstream
  integration remain out of scope.

## Validation record

- Focused AI-126 ingestion, existing parser, governed acquisition regression,
  schema, and architecture tests: **39 passed, 0 failed**.
- Complete architecture-boundary suite: **54 passed, 0 failed**.
- Dedicated published-schema validation: **1 passed, 0 failed**.
- Full repository suite: **1,127 passed, 0 failed** across **185 top-level
  tests** and **152 suites**.
- TypeScript typecheck: passed.
- TypeScript build: passed.
- Scoped ESLint for the new parser, ingestion, CLI, and test surface: passed.
- Scoped Prettier for all new files and the clean modified contract,
  documentation, registry, and package files: passed.
- `git diff --check`: passed.
- Changed-file security scan: no credential values, absolute workstation
  paths, network-call primitives, database writes, production integration, or
  executable publication path. Matches for credentials, production,
  publication, scheduling, and downstream integration were negative governance
  statements, fixed `not_publishable` state, architecture assertions, or
  pre-existing roadmap/registry context.

## Pre-existing repository-wide debt

- Repository-wide ESLint reports **42 existing errors** in legacy scripts and
  crawler modules. The three reports in the touched legacy
  `arca-real-crawler.ts` are its pre-existing `any`/unused-variable findings;
  AI-126 only moved its parser function to the shared module and did not repair
  unrelated crawler debt.
- Repository-wide Prettier reports **194 existing files**. That set includes
  the already-unformatted legacy ARCA crawler and roadmap table. All new AI-126
  files and all otherwise clean modified files pass the scoped check.
- No unrelated lint or formatting debt was repaired.

## Human review gate

Review the closed contracts, provenance equality checks, path and symlink
controls, fixed parser binding, output hashing, atomic no-overwrite publication,
candidate-only states, test mutations, and architecture exclusions. This report
does not approve the candidate format or authorize any runtime action.

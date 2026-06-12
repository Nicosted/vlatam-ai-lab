# Graphify AI Lab Memory

## Snapshot Context

- generated_for: `graphify-ai-lab-memory`
- graph_scope: repository documentation and source navigation
- source_of_truth: reviewed, versioned AI Lab artifacts and schemas
- runtime_status: documentation-only; not a production dependency
- graphify_cli_status: not available on the local PATH during setup

## What Graphify Is Used For

Graphify is an optional repository knowledge-graph layer for `vlatam-ai-lab`.
Its job is to help Codex and future local operators answer architecture,
contract, schema, and artifact-flow questions before falling back to broad
`rg` searches or large file reads.

Good Graphify questions include:

- `graphify query "show the approved artifact export flow"`
- `graphify query "which schemas govern downstream eligibility"`
- `graphify query "summarize the Classifier Lab / Runtime boundary"`
- `graphify query "where are PCRAM source snapshot validation rules documented"`

Graphify may be used to find relevant files, summarize local relationships, and
prepare evidence-first reading paths. It should point Codex toward the reviewed
docs, schemas, reports, tests, fixtures, and agent contracts that already exist
in this repository.

## What Graphify Must Not Decide

Graphify is not a regulatory source of truth and is not an approval mechanism.
It must not:

- approve artifacts for downstream consumption;
- override schema validation, tests, or human review gates;
- decide tariff, customs, legal, or operational classifier outcomes;
- expose raw internal agent state to future API handoffs;
- create production runtime behavior or a vLatamGlobal bridge;
- connect to Supabase, Vercel, production databases, or external services;
- read `.env*`, credentials, private raw dumps, or local machine caches.

The authoritative contract remains the reviewed, versioned, schema-valid AI Lab
artifact set. vLatamGlobal may only consume approved/exported artifacts through
separately reviewed contracts.

## Indexed And Excluded Files

The intended indexable surface is local, reviewable project knowledge:

- source code under `src/`;
- schemas under `schemas/`;
- reviewed reports under `reports/`;
- project documentation under `docs/`;
- agent contracts under `agents/`;
- tests under `tests/`;
- safe fixtures under `snapshots/pcram/` and recorded demo fixtures under
  `snapshots/qwen/recorded-responses/`;
- repository configuration that explains local checks and boundaries.

The root `.graphifyignore` excludes secrets, `.env*` files, credentials, local
service state, dependency folders, build outputs, generated coverage, temporary
outputs, Graphify caches/cost logs, and private or unreviewed raw source dumps.

## Codex Workflow

When a local Graphify CLI and reviewed graph output are available, Codex should
query Graphify first for architecture, contract, schema, and artifact-flow
questions. Codex should then inspect the cited source files directly before
making claims or edits.

Recommended flow:

1. Run a targeted `graphify query` for the question.
2. Read the files Graphify cites.
3. Validate claims against schemas, fixtures, reports, and tests.
4. Use `rg` for focused follow-up searches.
5. State assumptions and limitations in any evidence report.

If Graphify is unavailable, Codex should continue with the repository's normal
local-first workflow and should not invent graph output.

## Refreshing The Graph

Refresh Graphify only after changes that affect architecture, contracts,
schemas, artifact flows, agent governance, validation rules, or documentation
navigation. Routine source edits that do not change those relationships may not
need a refresh.

When the CLI is available, a future operator may run:

```sh
graphify install --project --platform codex
graphify . --no-viz
graphify query "show the approved artifact export flow"
```

If the installed CLI uses different command names or flags, prefer `graphify
--help` and keep the workflow local-only.

## Safety Before Committing Generated Graph Files

Before committing any generated `graphify-out/` files:

1. Confirm `.graphifyignore` was applied.
2. Inspect `graphify-out/` for `.env`, credentials, tokens, private raw dumps,
   cost logs, machine-specific paths, or local cache files.
3. Run `rg -i "token|secret|password|credential|api[_-]?key|supabase|vercel" graphify-out`
   and investigate every hit.
4. Do not commit Graphify cost logs, caches, or machine-specific files.
5. Re-run the repository validation suite and `git diff --check`.

Generated graph files are supporting navigation artifacts only. They do not
change approved artifact contracts or authorize runtime/API work.

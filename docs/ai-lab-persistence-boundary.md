# AI Lab Persistence Boundary

## Purpose

Define when `vlatam-ai-lab` should stay repo-first, what Graphify may be used
for, and what must be true before any Supabase project is created or
reconnected.

This boundary exists before live persistence work. It does not authorize a
Supabase project, database schema, migration, runtime integration, provider
change, or vLatamGlobal bridge change.

## Current decision

Do not create a new Supabase project until AI Lab has a concrete runtime or
persistence need.

For now, keep AI Lab repo-first. The current source of truth is reviewed,
versioned, human-approved repository artifacts validated by local schemas,
fixtures, reports, and deterministic tests.

Graphify may help navigate the repository, but it must not store product data,
replace Supabase, become regulatory truth, or decide `downstream_allowed`.

## Repo-first approved catalog handoff

The current approved-artifact handoff path is:

`approved artifact -> review manifest -> export contract -> export catalog -> future vlatam-global consumer`

Run `pnpm ai:exports:verify` to locally validate the repo fixture export
catalog before proposing any handoff change. The command validates the catalog
and referenced export contracts, confirms reviewed/approved downstream
eligibility, checks deterministic repository-relative file refs, and rejects
runtime, Supabase, env, credential, provider, or live-coupling references.

This verifier is local validation only. It is not a runtime bridge, API route,
database sync, Supabase integration, Graphify output, provider change, or
vlatam-global behavior change.

This path is intentionally file-first and local:

- approved artifacts are versioned repository envelopes with content hashes,
  source references, limitations, and `review_manifest_ref`;
- review manifests record human approval, reviewer role, approval scope,
  downstream permission, and limitations;
- export contracts expose only reviewed artifact references, source
  traceability, local evidence refs, and explicit no-coupling declarations;
- the export catalog is a read-only discovery index of reviewed export
  contracts, not a runtime registry or API route.

This does not require Supabase yet because the handoff is currently static,
reviewable in Git, deterministic under local tests, and small enough to remain
auditable as versioned repository files. There is no live mutable review queue,
multi-user reviewer state, API-backed lookup, runtime audit trail, background
job state, or dynamic vlatam-global query requirement in the current phase.

Graphify is not part of this source-of-truth path. It may help Codex or future
local operators find related contracts and docs, but every handoff decision must
be verified against repository files, schemas, review manifests, fixtures,
reports, and tests. Graphify output cannot approve artifacts, mark entries
downstream eligible, replace hashes, or become a vlatam-global bridge.

A future Supabase-backed handoff would need a separate reviewed implementation
plan and PR before it is allowed. At minimum, that work would need schema
migrations, RLS and grants, service-role boundaries, no committed `.env*`
files, deterministic tests for allowed and forbidden access, documentation of
which repo artifacts remain authoritative, and an explicit explanation of why
live persistence is now required.

## Persistence layers

### A. Repository and versioned files

Repository files are the current authoritative persistence layer for AI Lab.
This layer includes:

- schemas under `schemas/`;
- fixtures and sample snapshots under `snapshots/`;
- source snapshots and deterministic local evidence inputs;
- review manifests and approval metadata;
- approved artifact examples and reviewed artifact envelopes;
- export contracts and export catalogs;
- evidence reports and readiness reports under `reports/`;
- architecture, boundary, and governance docs under `docs/` and `agents/`;
- deterministic tests that enforce allowed and forbidden states.

This layer is the current source of truth because every artifact can be reviewed
in Git, versioned, diffed, validated locally, and routed through human review.
AI Lab remains the authority for reviewed, versioned, human-approved
intelligence artifacts. vLatamGlobal should only consume approved/exported
artifacts through stable file or future API contracts.

The current repo-first model is consistent with:

- `docs/classifier-lab-runtime-boundary-p0.md`
- `docs/reviewed-artifact-api-handoff-p0.md`
- `docs/classifier-approved-artifact-export-catalog-p1.md`
- `docs/classifier-approved-artifact-demo-pack-p1.md`
- `docs/graphify-ai-lab-memory.md`
- `schemas/schema-registry.json`

### B. Graphify

Graphify is a repository navigation memory layer. It can help Codex and future
local operators understand code and documentation relationships before direct
file verification.

Graphify may provide:

- repository navigation memory;
- a code and documentation relationship graph;
- Codex assistance for architecture, contract, schema, and artifact-flow
  questions;
- optional generated `graphify-out/` files after a reviewed local run.

Graphify must not be treated as:

- a runtime database;
- a source of regulatory truth;
- a source of approved classifier intelligence;
- a replacement for review manifests, schemas, tests, or human review;
- a persistence layer for product data, reviewer decisions, or audit events;
- an approval mechanism for `downstream_allowed`;
- a vLatamGlobal runtime bridge.

Graphify output can point to files that require review. It cannot approve those
files, override schema validation, or change downstream eligibility. Any
generated `graphify-out/` baseline remains a navigation artifact requiring
separate human review for secret leakage and source-of-truth boundary issues
before commit.

### C. Future Supabase

Supabase is only needed when AI Lab requires live persistence that Git files
cannot safely or ergonomically provide.

Possible future use cases include:

- approved artifact catalog storage;
- live review queues;
- reviewer decisions and status transitions;
- extraction jobs and job state;
- audit events;
- API-backed handoff to vlatam-global;
- admin or internal review panels.

A missing or inaccessible old project is not a reason to improvise a new
Supabase project. A new or reconnected project must be justified by a concrete
runtime or persistence requirement and introduced through reviewed implementation
work.

Future Supabase work must include migrations, row-level security, grants,
service-role boundaries, tests, and docs explaining what moved from repo-first
files into DB-backed persistence.

## Decision rule

Use this rule before any Supabase creation or reconnection:

1. If the work can be represented as reviewed, versioned files with deterministic
   local validation, keep it repo-first.
2. If the work only needs repository navigation, use Graphify as an assistance
   layer and verify files directly.
3. If the work needs live mutable state, multi-user review coordination,
   queryable runtime access, background jobs, or dynamic API handoff, propose
   Supabase in a dedicated implementation plan and PR.

Until the third condition is true and reviewed, do not create Supabase.

## When to create Supabase checklist

Create or reconnect Supabase only if one or more of these are true:

- Need live review state?
- Need a multi-user reviewer workflow?
- Need API-backed catalog lookup?
- Need a runtime audit trail?
- Need vlatam-global to query AI Lab dynamically?
- Need background extraction jobs?

If none are true, do not create Supabase yet.

## Future Supabase PR requirements

Any future PR that introduces Supabase must include:

- migration files;
- local or remote project ref documented outside committed secrets;
- RLS and grants;
- service-role boundary;
- no `.env*` commits;
- tests for allowed and forbidden access;
- docs explaining what moved from repo-first to DB-backed persistence.

The PR must also state which repo-first artifacts remain authoritative, how
approved/exported artifacts are preserved, and how vlatam-global consumption
stays limited to reviewed handoff surfaces.

## Non-goals

- no Supabase project creation;
- no Supabase packages;
- no env vars;
- no migrations;
- no runtime code changes;
- no schema changes;
- no export contract changes;
- no `graphify-out/` generation;
- no provider behavior changes;
- no vlatamGlobal bridge behavior changes.

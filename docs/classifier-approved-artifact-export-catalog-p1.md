# Classifier Approved Artifact Export Catalog (P1)

## Purpose

This note explains how vLatamGlobal will _later_ consume the classifier approved
artifact export catalog without direct database coupling or runtime code sharing.

The catalog is a small, machine-readable discovery index. It sits one level above
the export contracts created in PR #28: instead of describing a single reviewed
artifact bundle, it lists the available export contracts so a future consumer can
discover eligible intelligence artifacts through a stable file/API boundary.

- Schema: `schemas/classifier-approved-artifact-export-catalog.schema.json`
- Catalog fixture: `snapshots/pcram/demo-classifier-approved-artifact-export-catalog.json`
- Indexed export contracts (from PR #28):
  - `snapshots/pcram/demo-classifier-approved-artifact-export-contract.json`
  - `snapshots/pcram/demo-classifier-decision-export-contract.json`

## Discovery Model

Each catalog entry carries only the metadata needed for discovery:

- catalog id / catalog version / catalog schema version and a static
  `generated_at` timestamp marker;
- artifact id and artifact version;
- contract schema name and version;
- country and jurisdiction scope;
- a short product summary;
- review status, approval state, and human-review requirement;
- downstream eligibility;
- the export contract path and approved artifact path;
- a `sha256` hash reference bound to the referenced export contract file.

The catalog does not embed artifact bodies, assessment text, or raw model output.
It points at reviewed, versioned files that already exist in this repository.

## How vLatamGlobal Will Consume It Later

A future vLatamGlobal-side integration will:

1. Read the catalog file (or a future read-only API rendering of it) to list
   discoverable export contracts.
2. Filter to entries where `downstream_eligible` is `true`, which the schema only
   permits when `review_status` and `approval_state` are `approved` and human
   review is required.
3. Resolve the `export_contract_ref` for a chosen entry and verify the
   `export_contract_hash` against the file it fetched (integrity check).
4. Read the export contract, then verify its review manifest and source
   traceability before using any referenced content.
5. Record its own runtime-side human review/override decision on its own side.

This keeps AI Lab as the intelligence source-of-truth. vLatamGlobal consumes only
reviewed, versioned, schema-valid, evidence-backed, downstream-eligible artifacts.

## No Database Coupling, No Code Sharing

- No shared database is introduced; the boundary is a file (and, later, a
  read-only API rendering of that file).
- No code is imported from `vlatam-global`, and no AI Lab runtime code is shared.
- No runtime write-back path is created from the consumer into this repository.
- No raw LLM output is exposed as a downstream classifier input.

The catalog records these constraints explicitly in its `integration_boundary`
block (`live_integration`, `shared_database_coupling`, `production_api_route`,
`runtime_writeback`, and `raw_llm_output_included` are all `false`).

## Deferred

A live API, authentication, pagination, change-feed semantics, and production
ingestion are all out of scope here and require separate schema review,
governance approval, and implementation. This PR adds only the local,
demo-focused discovery surface.

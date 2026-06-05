# Classifier Approved Artifact Export Catalog P1

## Snapshot Context

- generated_for: `classifier-approved-artifact-export-catalog`
- catalog_id: `classifier-approved-artifact-export-catalog-2026-06-04`
- catalog_schema_version: `1.0.0`
- catalog_version: `1.0.0`
- fixture_ref: `snapshots/pcram/demo-classifier-approved-artifact-export-catalog.json`
- schema_ref: `schemas/classifier-approved-artifact-export-catalog.schema.json`
- indexes: `snapshots/pcram/demo-classifier-approved-artifact-export-contract.json`, `snapshots/pcram/demo-classifier-decision-export-contract.json`

## What This Catalog Enables

The export catalog is the first read-only discovery index of approved artifact
export contracts for classifier intelligence. It lets a future consumer answer
"which reviewed artifacts exist and which are downstream-eligible?" from a single,
schema-valid file, without reading every export contract first.

Each entry exposes only discovery metadata: catalog id/version, a static
generated timestamp, artifact id/version, contract schema name and version,
country and jurisdiction scope, a short product summary, review status, approval
state, human-review requirement, downstream eligibility, the export contract and
approved artifact paths, and a `sha256` hash bound to the referenced export
contract file.

It builds directly on the PR #28 export contract layer and keeps AI Lab as the
trusted source of truth for reviewed, versioned, evidence-backed intelligence.

## What vLatamGlobal May Consume Later

vLatamGlobal may later consume the catalog. It is a:

> read-only discovery index of approved artifact export contracts

A future runtime-side integration may list discoverable entries, filter to
downstream-eligible ones, verify the `export_contract_hash` against the fetched
export contract file, then verify the export contract's review manifest and
source traceability before any use.

Eligible downstream consumption is limited to entries where:

- `review_status` is `approved`;
- `approval_state` is `approved`;
- `human_review_required` is explicit;
- `downstream_eligible` is true;
- the referenced export contract and approved artifact files exist;
- the export contract hash reference matches the target file.

## What Remains Deferred

- A live API or service endpoint rendering this catalog.
- Authentication, authorization, pagination, and change-feed/diff semantics.
- Production ingestion and any vLatamGlobal-side runtime workflow.
- Automated catalog generation from a build step (the fixture is hand-assembled
  and deterministic for the demo).

## Why This Is Not A Runtime Integration Yet

This is a local file boundary, not a runtime integration. There is no network
call, no service, and no consumer code in this repository. The catalog only
declares what a future consumer _would_ be allowed to read. Promoting it to a
runtime path requires separate schema review, governance approval, and
implementation outside this PR.

## Explicitly Out Of Scope

- No live vLatamGlobal integration.
- No production API route.
- No shared database access or database synchronization.
- No runtime write-back from vLatamGlobal into `vlatam-ai-lab`.
- No copied vLatamGlobal code, schemas, or internal runtime state.
- No production credentials or external service calls.
- No raw LLM output delivery as downstream classifier input.
- No final legal, tariff, customs, or operational classifier decision.

## Boundary Preservation

The catalog preserves the AI Lab / Runtime boundary by making discovery
read-only, reviewed, versioned, and hash-verifiable. `vlatam-ai-lab` owns artifact
review, traceability, schema validity, and publication readiness. vLatamGlobal
remains a future consumer that must perform runtime-side workflow, audit, human
override, and final broker/client presentation.

The fixture encodes no-coupling declarations: `live_integration`,
`shared_database_coupling`, `production_api_route`, `runtime_writeback`, and
`raw_llm_output_included` are all false.

## Assumptions And Limitations

- The catalog is demo-scoped to the two existing classifier export contracts
  (Argentina/MERCOSUR textiles and Brazil/MERCOSUR lithium-ion power bank).
- The generated timestamp is a deterministic fixture marker, not evidence of a
  live catalog build job.
- The catalog is local-first and does not authorize production ingestion.
- Future API work still requires separate schema review, governance approval, and
  implementation outside this PR.

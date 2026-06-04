# Classifier Approved Artifact Export Contract P1

## Snapshot Context

- generated_for: `classifier-approved-artifact-export-contract`
- contract_id: `classifier-approved-artifact-export-contract-ar-textiles-2026-05-21`
- contract_schema_version: `1.0.0`
- fixture_ref: `snapshots/pcram/demo-classifier-approved-artifact-export-contract.json`
- schema_ref: `schemas/classifier-approved-artifact-export-contract.schema.json`
- built_from: `snapshots/pcram/demo-classifier-support-approved-artifact.json`
- review_manifest_ref: `review-manifest-classifier-support-ar-textiles-2026-05-21`

## What This Represents

This is the first local export-ready contract layer for approved classifier intelligence artifacts. It is a schema-valid bundle/index fixture that states what a future read-only vLatamGlobal consumer may inspect: artifact id, artifact version, artifact type, country and jurisdiction scope, source traceability, review state, approval state, human review requirement, downstream eligibility, risk posture, export timestamp, export version, and contract schema version.

The contract deliberately references reviewed content and evidence instead of embedding raw assessment bodies as a product input. It builds on the existing approved-artifact demo bridge and keeps the AI Lab as the trusted source of truth for reviewed, versioned, evidence-backed intelligence.

## What vLatamGlobal May Consume Later

vLatamGlobal may later consume the export contract as a read-only index of approved artifact references. A future runtime-side integration may request an approved artifact by id/version, verify the review manifest and source traceability, display scoped evidence context, and record its own operational human review decision.

Eligible downstream consumption is limited to records where:

- `review_status` is `approved`;
- `approval_state` is `approved`;
- `human_review_required` is explicit;
- `downstream_eligible` is true;
- source traceability and jurisdiction/country scope are present;
- contract/schema version metadata is present.

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

The export contract preserves the AI Lab / Runtime boundary by making consumption read-only, reviewed, versioned, and evidence-backed. `vlatam-ai-lab` owns artifact review, traceability, schema validity, and publication readiness. vLatamGlobal remains a future consumer that must perform runtime-side workflow, audit, human override, and final broker/client presentation.

The fixture also encodes no-coupling declarations: `live_integration`, `shared_database_coupling`, `production_api_route`, `runtime_writeback`, and `raw_llm_output_included` are all false.

## Assumptions And Limitations

- The fixture is demo-scoped to Argentina/MERCOSUR textile and apparel classifier support.
- The export timestamp is a deterministic fixture marker, not evidence of a live export job.
- The contract is local-first and does not authorize production ingestion.
- Future API work still requires separate schema review, governance approval, and implementation outside this PR.

# Classifier Approved Artifact Demo Bridge P1

## Source Snapshot Context

- generated_for: `classifier-approved-artifact-demo-bridge`
- artifact_id: `approved-artifact-classifier-support-ar-textiles-2026-05-21`
- artifact_schema_version: `1.0.0`
- artifact_type: `relevance_assessment`
- artifact_content_ref: `snapshots/pcram/demo-classifier-support-relevance-assessment.json`
- review_manifest_ref: `review-manifest-classifier-support-ar-textiles-2026-05-21`
- country_pack_context: `Argentina / MERCOSUR`
- jurisdiction_scope: `AR`, `MERCOSUR`
- local_only_note: Generated from repository fixtures only; no production systems, external services, credentials, databases, or live network calls are required.

## Current Contract Status

`vlatam-ai-lab` has implemented local schema contracts for source versions, review manifests, approved artifacts, evidence metadata, broker profiles, relevance assessments, jurisdiction packs, and approved KB snapshots. The demo bridge uses those existing contracts without adding runtime code or dependency changes.

The bridge is demo-ready as a reviewed, versioned, schema-valid intelligence artifact. It is not a production API, shared database contract, classifier implementation, migration, or vLatamGlobal runtime patch.

## Derived Deltas

| Area                 | Current state                                                                                                                                                            | Demo bridge addition                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Approved artifact    | `approved-artifact.schema.json` envelopes reviewed content by id, version, source refs, review manifest, content ref, hash, jurisdiction, status, risk, and limitations. | Adds a classifier-support approved artifact envelope that points to a reviewed relevance assessment.  |
| Review status        | Approved artifacts require `review_status: approved`; review manifests carry approval scope and downstream permission semantics.                                         | Adds a review manifest approved for demo classifier decision workspace support only.                  |
| Classifier narrative | Existing docs define Lab/Runtime separation and future reviewed-artifact API handoff.                                                                                    | Adds a concise source-of-truth story for how vLatamGlobal should consume reviewed intelligence later. |
| Operational boundary | vLatamGlobal owns real classifier decisions, workflow, override, audit trail, and client presentation.                                                                   | Keeps classifier support as evidence context and human-review prompts, not autonomous classification. |

## Verified Evidence vs AI Inference

Verified evidence references:

- `snapshots/pcram/demo-classifier-support-approved-artifact.json`
- `snapshots/pcram/demo-classifier-support-review-manifest.json`
- `snapshots/pcram/demo-classifier-support-relevance-assessment.json`
- `snapshots/pcram/example-approved-artifact.json`
- `snapshots/pcram/example-review-manifest.json`
- `reports/example-pcram-delta-report.md`
- `docs/classifier-lab-runtime-boundary-p0.md`
- `docs/reviewed-artifact-api-handoff-p0.md`

AI or workflow inference:

- The classifier-support summary says the reviewed artifact can support affected-code awareness, evidence context, and broker-facing review prompts.
- The relevance and urgency posture are assessment metadata for human review.
- The bridge does not infer a final NCM classification, legal conclusion, customs clearance result, production rule, or automated runtime action.

## Classification-Support Summary

The approved artifact can support a future vLatamGlobal Classifier decision workspace by supplying reviewed and traceable context for Argentina/MERCOSUR textile and apparel cases. It can help a broker see affected codes, source provenance, review status, risk posture, limitations, and recommended human checks.

It must remain decision support. vLatamGlobal must still own runtime classification, user workflow, operational audit trail, human override, and final broker/client presentation.

## Confidence and Risk Posture

| Signal                          | Value                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Review status                   | `approved`                                                                                                 |
| Downstream artifact consumption | `allowed` for demo support scope                                                                           |
| Human review requirement        | Required before operational classifier use                                                                 |
| Risk level                      | `medium`                                                                                                   |
| Relevance level                 | `high`                                                                                                     |
| Urgency                         | `review_soon`                                                                                              |
| Confidence basis                | Schema-valid local fixtures, explicit review manifest, source refs, evidence refs, and local boundary docs |
| Limitation                      | Sample-scoped demo, not a complete country pack or production classifier feed                              |

## Ownership Boundary

`vlatam-ai-lab` owns:

- source monitoring strategy and local source/version traceability;
- regulatory intelligence deltas and evidence reports;
- reviewed relevance assessments and country-pack context;
- approved artifact envelopes, review manifests, limitations, hashes, and publication readiness;
- local evidence reports explaining assumptions and constraints.

vLatamGlobal should later consume:

- approved artifact envelopes by id/version;
- review manifests and approval scopes;
- content references or API responses for reviewed intelligence artifacts;
- evidence metadata and human-readable reports;
- jurisdiction/country scope, risk posture, limitations, and review requirements.

vLatamGlobal must not copy or directly couple:

- lab source-ingestion internals;
- schemas as an implicit shared database model;
- runtime code from this repository;
- raw LLM output, internal agent state, or unreviewed deltas;
- production database records or migrations;
- classifier write-back behavior from lab artifacts.

## Human Review Requirement

The demo artifact is approved as a local intelligence handoff example, but any vLatamGlobal classifier use remains subject to runtime-side human review. The approved artifact can be displayed or referenced as evidence context only after a future reviewed-artifact API/export contract exists.

## Downstream Consumption Boundaries

- No direct vLatamGlobal connection was created.
- No vLatamGlobal code was imported.
- No shared database assumption was introduced.
- No production migration, provider credential, or live API call is required.
- No raw LLM output is marked as an approved artifact.
- No unreviewed material is marked downstream-ready.

## Current Demo Readiness

Ready for local demo narrative and schema validation:

- approved artifact id/version are explicit;
- jurisdiction/country-pack context is explicit;
- source traceability and review manifest are explicit;
- reviewed/approved status is machine-checkable;
- confidence, risk, urgency, limitations, and human review gates are visible;
- verified evidence and inference are separated;
- downstream consumption remains contract/API-only and future-facing.

## Recommended Next Integration Step

Define a future read-only reviewed-artifact API/export contract that lets vLatamGlobal request an approved artifact by id, verify its review manifest and content hash, fetch the referenced relevance assessment/evidence metadata, and record a runtime-side human review decision without writing back into `vlatam-ai-lab`.

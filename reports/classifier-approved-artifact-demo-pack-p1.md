# Classifier Approved Artifact Demo Pack P1

## Pack Context

- generated_for: `classifier-approved-artifact-demo-pack`
- artifact_id: `approved-artifact-classifier-decision-br-liion-2026-06-04`
- artifact_schema_version: `1.0.0`
- artifact_type: `relevance_assessment`
- artifact_content_ref: `snapshots/pcram/demo-classifier-decision-relevance-assessment.json`
- review_manifest_ref: `review-manifest-classifier-decision-br-liion-2026-06-04`
- export_contract: `snapshots/pcram/demo-classifier-decision-export-contract.json`
- country_pack_context: `Brazil / MERCOSUR`
- jurisdiction_scope: `BR`, `MERCOSUR`
- product_description: Portable lithium-ion power bank (rechargeable battery pack with integrated DC output) imported into Brazil.
- classification_candidate: `8507.60.00` (primary) with `8504.40.90` recorded as the considered alternative.
- local_only_note: Generated from repository fixtures only; no production systems, external services, credentials, databases, or live network calls are required.

## What this pack adds

This pack is the first demo-ready approved intelligence artifact pack expressing a concrete **customs classification decision** for vLatamGlobal's Classifier Workbench. It reuses the existing local schema contracts (`relevance_assessment`, `review_manifest`, `approved_artifact`, and the `classifier_approved_artifact_export_contract`) without adding runtime code, new schemas, or dependency changes.

The pack is demo-ready as a reviewed, versioned, schema-valid intelligence artifact. It is not a production API, shared database contract, classifier implementation, migration, or vLatamGlobal runtime patch.

## Four-layer separation

The pack deliberately keeps four layers distinct so a reviewer can see exactly what is trustworthy and why.

### 1. Approved evidence

Verified, traceable references that back the artifact (raw bodies are not embedded):

- `snapshots/pcram/demo-classifier-decision-relevance-assessment.json` (reviewed content, hashed)
- `snapshots/pcram/demo-classifier-decision-review-manifest.json`
- `snapshots/pcram/example-approved-artifact.json`
- `snapshots/pcram/example-review-manifest.json`
- `reports/example-pcram-delta-report.md`
- `source-version-pcram-bulletin-2026-05-20t120000z` (source provenance ref)

The approved artifact envelope binds this evidence by `content_hash` (`sha256:5a7e1e87...`), `source_version_refs`, and `review_manifest_ref`.

### 2. AI inference

The classification candidate is an interpretation offered for human review, not a verified fact:

- Primary NCM candidate `8507.60.00` (lithium-ion accumulators) is preferred over the alternative `8504.40.90` (static converters) on an essential-character rationale.
- Relevance, risk, and urgency posture are assessment metadata.
- The pack does **not** infer a final NCM ruling, legal conclusion, customs clearance result, production rule, or automated runtime action.

### 3. Human review

- `requires_human_review: true` on the assessment and `human_review_required: true` on the export entry.
- `review_manifest` records the reviewer (`human-review-gate`), `review_status: approved`, `review_method: manual`, approval scope, and the explicit acceptance of `8507.60.00` as primary with `8504.40.90` as the considered alternative.
- Approval here is approval to use the artifact as **reviewed decision support**, not approval of a customs outcome. vLatamGlobal must still perform its own runtime-side human review.

### 4. Deferred runtime integration

- No live vLatamGlobal integration, shared database coupling, production API route, runtime write-back, or raw LLM output delivery is present or authorized.
- The export contract's `integration_boundary` pins every one of those flags to the safe value (`local_export_fixture`, `read_only: true`, all coupling flags `false`).
- Consumption is contract/API-only and future-facing.

## Confidence and Risk Posture

| Signal                          | Value                                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Review status                   | `approved`                                                                                                     |
| Downstream artifact consumption | `allowed` for demo support scope                                                                               |
| Human review requirement        | Required before operational classifier use                                                                     |
| Risk level                      | `high`                                                                                                         |
| Relevance level                 | `high`                                                                                                         |
| Urgency                         | `review_soon`                                                                                                  |
| Confidence basis                | Schema-valid local fixtures, explicit review manifest, source refs, evidence refs, content hash, boundary docs |
| Limitation                      | Sample-scoped demo, single reviewed candidate, not a complete country pack or production classifier feed       |

## Downstream Consumption Boundaries

- No direct vLatamGlobal connection was created.
- No vLatamGlobal code was imported.
- No shared database assumption was introduced.
- No production migration, provider credential, or live API call is required.
- No raw LLM output is marked as an approved artifact.
- No unreviewed material is marked downstream-ready (see `snapshots/pcram/invalid-classifier-decision-export-contract-unreviewed-eligible.json`, which the schema rejects).

## Recommended Next Integration Step

Define a future read-only reviewed-artifact API/export contract that lets vLatamGlobal request this approved artifact by id, verify its review manifest and content hash, fetch the referenced relevance assessment/evidence metadata, render the classification candidate as decision support, and record a runtime-side human review decision without writing back into `vlatam-ai-lab`.

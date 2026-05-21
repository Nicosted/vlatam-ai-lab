# Reviewed Artifact API Handoff P0

## Purpose

Define the future API boundary for reviewed intelligence artifacts.

## Product boundary

- `vlatam-ai-lab` is an independent intelligence product.
- vLatamGlobal is a future API consumer.
- No direct database/schema/runtime coupling.
- API handoff must happen only through approved, reviewed, versioned, schema-valid artifacts.

## Handoff principle

- vLatamGlobal must not consume raw unreviewed deltas by default.
- Only reviewed artifacts can be exposed by the future API.
- Internal agent state must not be exposed.
- Every artifact must preserve traceability and review status.

## Approved artifact types

Conceptual artifact types in P0:

- `source_snapshot`
- `regulatory_delta`
- `evidence_report`
- `broker_profile_context`
- `relevance_assessment`
- `review_manifest`
- `approved_kb_snapshot`
- `jurisdiction_pack`

## Review manifest

Conceptual fields for future reviewed artifact handoff metadata:

- `artifact_id`
- `artifact_type`
- `source_system`
- `source_refs`
- `generated_at`
- `schema_version`
- `review_status`
- `reviewed_by`
- `reviewed_at`
- `approval_scope`
- `country_scope`
- `jurisdiction_scope`
- `affected_codes`
- `risk_level`
- `evidence_paths`
- `profile_context_used`
- `limitations`
- `downstream_allowed`

## API consumer contract

A future consumer may request:

- list approved artifacts
- fetch reviewed artifact by id
- fetch evidence report markdown
- request personalization with provided profile context
- fetch review manifest
- fetch relevance assessment
- fetch approved KB snapshot

A consumer must not receive by default:

- raw unreviewed deltas
- internal agent chain state
- credentials/secrets
- unapproved source material
- production write permissions

## Future endpoint sketch

Conceptual-only endpoint examples (non-implementation in P0):

- `GET /v1/artifacts?status=approved`
- `GET /v1/artifacts/:id`
- `GET /v1/artifacts/:id/evidence`
- `GET /v1/artifacts/:id/review-manifest`
- `POST /v1/relevance/assess`
- `GET /v1/kb/snapshots/:version`

## Security and governance

- API auth required in future phase.
- read-only by default.
- audit logging required.
- human-review gate required.
- schema versioning required.
- country/jurisdiction scope preserved.
- no production writes from API consumer.

## Relationship with classifier boundary

Reference: `docs/classifier-lab-runtime-boundary-p0.md`

- API handoff must respect Lab/Runtime separation.
- vLatamGlobal consumes approved artifacts, not internal lab mechanics.
- No direct classifier write-back unless separately approved.

## vLatamGlobal future use cases

- classifier evidence context
- broker workspace alerts
- importer project/regulatory intelligence
- broker matching by specialization
- personalized regulatory alerts
- human-reviewed change history

## Non-goals

- no implementation
- no live API
- no DB schema
- no production integration
- no automatic classifier write-back
- no autonomous legal/customs determination

# P0-to-P1 Schema Hardening Plan

## Purpose

Define the schema/contract hardening plan required before P1 runtime/API readiness.

## Current P0 baseline

The current baseline is documentation-first and local-only:

- local PCRAM snapshot schema exists
- local PCRAM delta schema exists
- local validator exists
- local delta generator exists
- local evidence report generator exists
- agent contracts exist
- broker profile spec exists
- classifier lab/runtime boundary exists
- reviewed artifact API handoff spec exists
- Antigravity audit protocol exists

## Why schema hardening is needed

P0 documentation and sample artifacts establish governance direction, but they are not sufficient for runtime/API readiness.

P1 requires reviewed, versioned, schema-valid, and traceable artifacts that can be consumed consistently by downstream systems.

vLatamGlobal and future consumers must not depend on informal markdown structure, ad-hoc conventions, or internal agent state.

Human review outcomes and downstream permission semantics must become machine-checkable so access control and consumption logic are enforceable.

## Required P1 schemas

| Schema                                 | Purpose                                                                              | Producer                                       | Consumer                                                | Blocks what if missing                                                             | Priority |
| -------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------- |
| `review_manifest.schema.json`          | Standardize review decision metadata and downstream permission semantics.            | Human review gate workflow                     | Runtime/API handoff layer, compliance audit tooling     | No machine-checkable approval state; no trusted release gate for artifacts.        | P0       |
| `approved_artifact.schema.json`        | Wrap approved outputs in a consistent envelope with traceability and review linkage. | Artifact packaging step after review           | Runtime/API handoff layer, vLatamGlobal, future clients | No safe cross-system artifact contract; risk of exposing raw internal payloads.    | P0       |
| `relevance_assessment.schema.json`     | Capture profile-aware relevance and risk framing with explicit scope.                | Relevance assessment workflow (human-reviewed) | Personalization consumers, alerting/ranking logic       | No consistent relevance signal for downstream prioritization.                      | P1       |
| `broker_profile.schema.json`           | Formalize broker profile inputs used for relevance and presentation context.         | Profile curation/onboarding workflow           | Relevance assessment and personalization layers         | Personalization becomes ambiguous or invented; no contract for profile-safe usage. | P1       |
| `approved_kb_snapshot.schema.json`     | Define approved, versioned KB snapshot format for downstream consumption.            | Lab approval + packaging workflow              | Runtime classifier consumers, audit/replay tooling      | No controlled export boundary for approved intelligence/KB state.                  | P1       |
| `jurisdiction_pack.schema.json`        | Standardize jurisdiction-scoped regulatory intelligence packaging.                   | Jurisdiction packaging workflow                | Country/jurisdiction-aware consumers and importers      | No reliable jurisdiction partitioning or scope controls.                           | P1       |
| `evidence_report_metadata.schema.json` | Define structured metadata for markdown evidence artifacts.                          | Evidence report generator + review pipeline    | Runtime/API catalog/index layers                        | Evidence files remain opaque and difficult to index/filter programmatically.       | P1       |
| `source_version.schema.json`           | Capture source provenance and version identity for traceability.                     | Source monitor/snapshot pipeline               | All downstream schemas via references                   | Provenance chain is incomplete; cannot reliably audit origin/timing/hash lineage.  | P0       |

## Schema descriptions

### `review_manifest.schema.json`

Should define review status, reviewer metadata, approval scope, limitations, downstream permission, reviewed_at, and artifact refs.

### `approved_artifact.schema.json`

Should wrap approved outputs with artifact id, type, schema version, source refs, content refs, review manifest ref, and traceability metadata.

### `relevance_assessment.schema.json`

Should capture profile-aware relevance, affected specializations, jurisdiction scope, risk/urgency, and explanation.

### `broker_profile.schema.json`

Should formalize the Broker Intelligence Profile without inventing preferences.

### `approved_kb_snapshot.schema.json`

Should define versioned classifier/intelligence KB snapshots approved for downstream consumption.

### `jurisdiction_pack.schema.json`

Should define country/jurisdiction scope, regulatory source families, nomenclature scope, assumptions, and limitations.

### `evidence_report_metadata.schema.json`

Should define metadata for markdown evidence reports, not the full markdown body.

### `source_version.schema.json`

Should define source provenance, source URL/ref, captured_at, hash, parser/version metadata, and validity window if known.

## Acceptance criteria for each schema

Each required schema should meet all of the following:

- JSON Schema draft version selected
- required fields defined
- enums constrained where needed
- examples included
- tests validate valid/invalid fixtures
- no credentials/secrets fields
- traceability fields required
- human-review fields required where applicable
- versioning strategy included

## Dependency order

Status update: `source_version.schema.json` is now the first implemented foundation schema in this plan.
Status update: `review_manifest.schema.json` is now implemented as the next foundation schema after `source_version.schema.json`.
Status update: `approved_artifact.schema.json` is now implemented as the next foundation schema after `review_manifest.schema.json`.
Status update: `evidence_report_metadata.schema.json` is now implemented as the next foundation schema after `approved_artifact.schema.json`.
Status update: `broker-profile.schema.json` is now implemented as the next foundation schema after `evidence_report_metadata.schema.json`.
Status update: `relevance-assessment.schema.json` is now implemented as the next foundation schema after `broker-profile.schema.json`.
Status update: `jurisdiction-pack.schema.json` is now implemented as the next foundation schema after `relevance-assessment.schema.json`.
Status update: `approved-kb-snapshot.schema.json` is now implemented as the final P1 foundation schema after `jurisdiction-pack.schema.json`.
Status update: completed schema hardening contracts are indexed in `schemas/schema-registry.json`.

Recommended implementation order:

1. `source_version`
2. `review_manifest`
3. `approved_artifact`
4. `evidence_report_metadata`
5. `broker_profile`
6. `relevance_assessment`
7. `jurisdiction_pack`
8. `approved_kb_snapshot`

Rationale:

- `source_version` first establishes immutable provenance primitives used everywhere else.
- `review_manifest` next defines machine-checkable approval semantics.
- `approved_artifact` then binds payloads to review + provenance so handoff contracts are enforceable.
- `evidence_report_metadata` can then index/report evidence artifacts against approved envelopes.
- `broker_profile` and `relevance_assessment` follow once baseline artifact and review controls exist.
- `jurisdiction_pack` depends on stable provenance, approval, and relevance structures.
- `approved_kb_snapshot` should be last because it aggregates earlier contracts into export-ready knowledge state.

## Relationship to existing docs

This plan complements and should be implemented in alignment with:

- `docs/reviewed-artifact-api-handoff-p0.md`
- `docs/classifier-lab-runtime-boundary-p0.md`
- `docs/broker-intelligence-profile-p0.md`
- `agents/pcram-contract-conformance-checklist.md`
- `reports/antigravity-readonly-audit-p0.md`

## Blockers before P1

The following remain blocked until relevant schemas are defined and validated:

- no live API
- no vLatamGlobal integration
- no runtime agents
- no scheduled monitors
- no automatic classifier write-back
- no client-facing alerts
- no approved KB export

## Non-goals

- no schema implementation in this PR
- no API route
- no DB schema
- no migration
- no runtime agent
- no production integration
- no legal/customs final determination

# Classifier Lab / Runtime Boundary P0

## Purpose

Define the boundary between `vlatam-ai-lab` as Classifier Intelligence / KB Lab and `vlatam-global` as operational classifier runtime.

## Current classifier state in vLatamGlobal

vLatamGlobal already has substantial production-oriented Classifier KB work, including:

- schema/migrations
- parser/import contract/import plan/execute
- ingest/runs API routes
- staging/production read-only evidence
- readiness docs, BK blockers, remediation plans
- smoke/safe checks/denylist

The current challenge is production confidence and clear ownership boundaries, not inventing a second classifier.

## Boundary principle

- `vlatam-ai-lab` owns intelligence research, source ingestion, normalization, regulatory deltas, candidate generation, curation, evidence, and approved artifact publication.
- `vlatam-global` owns operational runtime: real products/cases, classifier usage, broker/client workflow, documents, costs/logistics, human override, audit trail, and client-facing experience.
- Integration must happen through stable artifacts/API, not copied code or direct DB coupling.

## Responsibility matrix

| Capability                                   | vlatam-ai-lab / Classifier Intelligence Lab                                               | vlatam-global / Runtime                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| source monitoring / PCRAM / ARCA / bulletins | Owns source monitoring strategy, collection scope, and evidence-linked intake artifacts.  | Consumes approved outputs; does not duplicate source crawling logic.                |
| source normalization                         | Owns normalized source transformations and traceability metadata for candidate knowledge. | Consumes approved normalized outcomes through boundary contract.                    |
| regulatory delta detection                   | Owns detection and interpretation candidates for regulatory changes.                      | Uses only approved deltas/snapshots for runtime behavior or human workflow support. |
| candidate KB entries                         | Owns generation of candidate entries and candidate rationale/evidence packaging.          | Does not generate competing candidate KB streams outside approved intake.           |
| human curation of knowledge                  | Owns curation workflow before publication, with reviewer notes and limitations.           | May perform runtime validation review, but not replace lab-side curation semantics. |
| approved/versioned KB snapshots              | Owns publication of reviewed, versioned, approved artifacts.                              | Consumes approved versions with explicit version tracking in runtime operations.    |
| classification for real operations           | Not an operational runtime responsibility in P0.                                          | Owns production classification for real products/cases.                             |
| client/broker evidence presentation          | Produces intelligence evidence bundles for approved handoff.                              | Owns client/broker-facing presentation and runtime evidence UX.                     |
| human override/audit trail                   | Captures lab review metadata for approved artifacts.                                      | Owns operational human override and runtime audit trail for decisions.              |
| cost/logistics/documents                     | Out of scope for lab intelligence analysis ownership.                                     | Owns operational cost/logistics/documents flows.                                    |
| broker workflow                              | Produces intelligence context that can later support broker decisions.                    | Owns broker/client workflow execution in runtime.                                   |
| API consumption                              | May publish approved artifacts for future API exposure.                                   | Owns runtime API consumption and integration into operational services.             |

## What must not be duplicated

- parsers
- KB canonical model
- source versioning model
- evidence system
- classification API
- confidence/risk logic
- human review semantics
- approved artifact format

## Approved knowledge/artifact contract

Conceptual exchange artifacts for the boundary:

- `approved_kb_snapshot.json`
- `classifier_source_version`
- `nomenclature_entries`
- `classification_rules`
- `rulings`
- `evidence_bundle`
- `jurisdiction_pack`
- `review_manifest`

These are conceptual P0 names, not implemented schemas yet.

## Proposed flow

PCRAM / ARCA / Mercosur / HS / NCM / regulations
→ `vlatam-ai-lab` Classifier Intelligence Lab
→ reviewed and approved artifacts
→ future API or artifact export
→ vLatamGlobal Classifier Runtime
→ operational classification, evidence, broker/client workflow

## Human review and approval

- Unreviewed deltas/candidates must not enter vLatamGlobal runtime by default.
- Human review must produce approval metadata.
- Approval scope must include jurisdiction/country, artifact version, effective date if known, limitations, and reviewer identity/role.
- Downstream use must preserve traceability.

## Relationship with Broker Intelligence Profile

- Broker/despachante specialization and style preferences belong to the personalization layer.
- `vlatam-ai-lab` can use profile context to produce relevance assessments.
- vLatamGlobal can consume approved/profile-aware outputs later via API.
- Agents must not invent profile assumptions.

## Blockers before integration

- automatic classifier write-back
- production ingestion from lab
- direct database sync
- runtime agent execution against production
- client-facing alerts from unreviewed sources
- using lab artifacts as final legal/customs determinations

## Future vLatamGlobal companion doc

A later companion PR should exist in `vlatam-global`:
`docs/classifier-kb-lab-runtime-boundary-p0.md`

Its role is to mirror the runtime-side contract and prevent duplication.

## Non-goals

- no implementation
- no API route
- no database schema
- no migration
- no production integration
- no second classifier runtime
- no autonomous legal/customs determination

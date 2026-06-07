# Classifier Intelligence Artifact (P1)

This document describes the **classifier intelligence artifact** contract for AI
Lab. It builds on the intelligence source foundation
(`docs/ai-lab-intelligence-foundation-p1.md`), the snapshot review and evidence
packet layer (`docs/snapshot-review-evidence-packet-p1.md`), the AI extraction
result contract, and the Qwen/LangGraph extraction spike
(`docs/qwen-langgraph-evidence-extraction-spike.md`). It is the first serious
artifact shape meant to represent **reviewed classifier intelligence** that a
future vLatamGlobal Classifier integration can consume.

## What a classifier intelligence artifact is

A classifier intelligence artifact is a **stable, reviewed, versioned, and
traceable** record of classification-relevant intelligence. It wraps, in one
typed envelope:

- **Identity** — `artifact_id`, `artifact_kind`, `schema_version`,
  `artifact_version`, `created_at`, and optional `updated_at` / `reviewed_at`.
- **Provenance** — `origin`, `source_authority`, a non-empty `source_set` of
  bounded source/snapshot/review/evidence references, and optional AI-assisted
  `generation` lineage (pipeline, version, provider, model, extraction result).
- **Jurisdiction & applicability** — jurisdiction/pack, nomenclature system,
  language, product scope, applicability notes, and optional effective date /
  validity window.
- **Evidence** — at least one bounded evidence item (reference/excerpt pointer,
  source authority classification, support status, confidence). Never large
  copied source text.
- **Extracted intelligence** — normalized claims (each traceable to evidence),
  classification implications, an optional candidate classification, constraints,
  assumptions, uncertainty notes, and risk flags.
- **Review & safety** — explicit `review_status`, optional reviewer metadata,
  `human_review_required`, `downstream_allowed`, an explicit
  `downstream_eligibility_reason`, limitations, audit notes, and a disclaimer.

The schema lives at `schemas/classifier-intelligence-artifact.schema.json` and is
registered in `schemas/schema-registry.json` as
`classifier_intelligence_artifact`.

## Why AI Lab owns this contract

vLatamGlobal must eventually consume **approved, versioned artifacts or API
responses** — never raw LLM output, never duplicated parsers, never AI Lab
database tables or runtime internals. This contract is the boundary object that
makes that possible. AI Lab owns the review, versioning, and traceability of
intelligence; the consumer only ever sees the reviewed artifact shape.

## How this differs from raw Qwen/LLM output

Raw provider output (e.g. a DashScope/Qwen `{ "choices": [ ... ] }` response) is
**not** a classifier intelligence artifact and is rejected by the schema. Raw AI
extraction results (`ai_extraction_result`) are draft-only, unreviewed, and never
downstream-safe. A classifier intelligence artifact is the **reviewed** layer
above that: it requires explicit review status and explicit downstream
eligibility, and it carries provenance back to a registered source rather than a
bare model completion.

## Safety flags and downstream eligibility rules

The schema enforces these invariants (see the `allOf` block):

1. **Synthetic/demo is never downstream-safe.** If `source_authority` or `origin`
   is `synthetic_demo`, then `downstream_allowed` must be `false` and
   `human_review_required` must be `true`.
2. **Downstream requires real, reviewed approval.** If `downstream_allowed` is
   `true`, then `review_status` must be `reviewed_approved`,
   `human_review_required` must be `false`, a `reviewer` must be present, a
   `classifier_approval_reference` must exist, and `source_authority` must be
   `official_regulation` or `internal_review`.
3. **Traceability is mandatory.** `source_set` and `evidence_items` are non-empty,
   and every normalized claim references at least one evidence item.
4. **Explicit, never inferred.** Review status and downstream eligibility are
   required fields with an explicit `downstream_eligibility_reason`.

## Current demo / synthetic limitations

The only committed fixture
(`snapshots/pcram/classifier-intelligence-artifact-demo-veldoria.json`) is built
on the existing **synthetic Veldoria demo** context used by the Qwen replay
spike. It is **demo-only**:

- `source_authority: synthetic_demo`, `review_status: draft`,
  `human_review_required: true`, `downstream_allowed: false`.
- All headings, notes, rates, and the "Veldoria Demo Tariff Nomenclature" are
  fictional and carry no legal/regulatory meaning. It is **not** WCO/HS/NCM/PCRAM
  approved.
- Identifiers and timestamps are deterministic so tests stay reproducible.
- No live Qwen/DashScope call and **no API key** are required.

There is intentionally **no committed downstream-approved fixture**: the
downstream-approval invariant is exercised in tests by constructing an
authoritative, reviewed variant in memory, so the repository never ships a
synthetic record that looks downstream-approved.

## Future integration boundary

When vLatamGlobal integration arrives, the boundary is an **artifact/API
contract**, not shared code or a shared database:

- vLatamGlobal reads approved, versioned classifier intelligence artifacts (or an
  API response shaped by this contract) — never raw LLM output, duplicated
  parsers, or AI Lab runtime/database internals.
- This repository adds **no** vLatamGlobal imports, **no** Supabase coupling, and
  **no** shared database dependency.
- The export/catalog contracts
  (`classifier_approved_artifact_export_contract`,
  `classifier_approved_artifact_export_catalog`) describe the read-only handoff
  surface; this artifact is the reviewed unit those would eventually index.

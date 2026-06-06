# Snapshot Review Manifest & Extractable Evidence Packet (P1)

This document describes the **snapshot review manifest** and **extractable
evidence packet** layer for AI Lab. It builds directly on the gated source
snapshot capture work (`docs/gated-source-snapshot-capture-p1.md`), the verified
official source onboarding work
(`docs/verified-official-source-onboarding-p1.md`), and the intelligence source
foundation (`docs/ai-lab-intelligence-foundation-p1.md`).

## What this PR does and does not do

This PR creates **schema, type, helper, fixture, test, and documentation
foundations only**. Explicitly:

- This PR **does not scrape**.
- This PR **does not call the network**.
- This PR **does not call AI providers** and adds no AI provider dependency.
- This PR **does not ingest full official source content**.
- This PR **does not create classifier conclusions**.
- This PR **does not approve downstream use**.
- This PR **does not integrate with vLatamGlobal**.
- This PR **adds no Supabase migration** and no shared database coupling.

## Why snapshot metadata is not enough

A verified source registry entry only proves that an official source **exists**.
A source snapshot only proves that a specific source/version/capture **attempt
is tracked**. Neither proves that anyone has actually **reviewed** the capture
enough to turn it into a controlled input for AI extraction.

Concretely:

- A verified official source does **not** make a snapshot reviewed.
- A captured snapshot does **not** make extraction permitted.
- An extractable evidence packet is **not** classifier-approved merely because
  it is extractable.
- **AI-ready is not the same as downstream-approved.**

The review manifest and evidence packet add the missing controlled layer between
"a snapshot exists" and "an AI extraction job may consume it".

## What a snapshot review manifest is

A **snapshot review manifest** (`schemas/snapshot-review-manifest.schema.json`)
represents the human/documentary gate between a source snapshot and future AI
extraction. It records:

- which snapshot/source it reviews (`snapshot_id`, `source_id`);
- who reviewed it (`review_origin`, optional non-PII `reviewer_role`) and when
  (`reviewed_at`);
- the review decision (`review_status`);
- the verification gates the reviewer checked: `source_identity_verified`,
  `locator_verified`, `capture_reference_verified`,
  `content_fingerprint_verified`, `version_scope_verified`;
- whether AI extraction is permitted as a result (`extraction_allowed`);
- conservative safety flags (`human_review_required`, `downstream_allowed`) and
  honest `warnings` / `limitations` / `notes`.

### Conservative gates and defaults

Encoded in the schema and in `src/intelligence/evidence-preparation.ts`:

- `human_review_required` defaults to **true**.
- `downstream_allowed` defaults to **false**.
- `extraction_allowed` is **false** unless the manifest explicitly passes the
  required gates: `review_status: approved`, `human_review_required: true`, and
  verified identity, locator, capture reference, and version scope.
- A missing content fingerprint verification **blocks** extraction unless it is
  **intentionally waived with an explicit warning**. No fabricated checksums are
  ever introduced to satisfy the gate.
- A reviewed manifest may allow AI extraction, but it **must not** approve
  downstream classifier use. `downstream_allowed: true` additionally requires a
  separate `classifier_approval_reference`, which this review layer never grants
  on its own.

## What an extractable evidence packet is

An **extractable evidence packet**
(`schemas/extractable-evidence-packet.schema.json`) represents a structured,
source-backed input for a future AI extraction job. It binds a reviewed snapshot
(via its `review_manifest_id`) to **bounded evidence references** — not copied
source text:

- `evidence_scope`, optional `jurisdiction_scope`, optional `language`;
- a `content_reference`, `excerpt_reference`, and/or `content_fingerprint`;
- the `extraction_input_type` (locator, excerpt, fingerprint, manual metadata,
  or other);
- extraction state (`extraction_allowed`, `extraction_status`);
- the same conservative safety flags and honest `warnings` / `limitations`.

### Evidence is referenced, not copied

This layer deliberately stores **references, fingerprints, excerpt references,
and bounded/manual evidence metadata** — never large copied source text. It
invents no regulatory claims, creates no classification conclusions, and marks
no evidence packet downstream-safe. An evidence packet may be **AI-ready**, but
it is never **classifier-approved**.

`extraction_allowed: true` is only valid when a bounded reference
(`content_reference`, `excerpt_reference`, or `content_fingerprint`) is present
and `human_review_required` is true. `downstream_allowed: true` again requires a
separate `classifier_approval_reference`.

## Helpers

Pure, deterministic, browser-safe, network-free helpers in
`src/intelligence/evidence-preparation.ts`:

- `deriveReviewManifestGate` — `extraction_allowed` / `extraction_blocked` /
  `rejected` / `review_required`.
- `isSnapshotExtractionAllowed` — true only for an explicitly approved, fully
  gated manifest (fingerprint verified or waived with a warning).
- `isEvidencePacketExtractionReady` — requires `extraction_allowed`, a mandatory
  human-review flag, a bounded evidence reference, and a non-failed extraction
  state.
- `isEvidencePacketDownstreamAllowed` — conservative; only true with an explicit
  downstream flag, a separate classifier approval reference, and human review.
- `evidencePacketReadinessLabel` — `downstream_approved` / `extraction_ready` /
  `extraction_failed` / `not_extraction_ready`.

## The lifecycle: six distinct states

These terms are **not** interchangeable. Each is a separate, explicit gate:

1. **Source verified** — the source registry entry is confirmed official
   (verified official source onboarding).
2. **Snapshot captured** — a capture event against that source is tracked
   (gated source snapshot capture).
3. **Evidence extractable** — a review manifest has approved the snapshot and an
   evidence packet provides a bounded, referenceable input (**this PR**).
4. **AI extracted** — a future AI extraction job consumes the evidence packet
   (future work; the `ai_extraction_job` contract already exists).
5. **Human reviewed** — extraction output is reviewed by a human.
6. **Downstream approved** — a separate classifier approval marks reviewed,
   versioned intelligence as safe for downstream consumption.

This PR delivers state 3 and prepares state 4. It never asserts states 5 or 6.

## How this prepares future AI extraction jobs

The evidence packet gives a future AI extraction job a stable, reviewed input
reference (`evidence_packet_id` + `review_manifest_id` + bounded references)
without coupling extraction to live network state. The existing AI extraction
job contract (`schemas/ai-extraction-job.schema.json`) already references an
optional `snapshot_id`; extraction readiness here is gated behind an approved
review manifest so no extraction is attempted against an unreviewed capture.

## How this prepares future approved classifier intelligence artifacts

A reviewed manifest and extractable packet become part of the **evidence chain**
for an approved classifier intelligence artifact: source registry entry →
reviewed snapshot → review manifest → extractable evidence packet → reviewed
extraction → reviewed/approved artifact. Each step is a separate, explicit gate.
No step is skipped, and no raw output is treated as approved.

## AI Lab / vLatamGlobal boundary

- **AI Lab owns**: source intelligence, source snapshots, freshness, review
  manifests, evidence preparation, AI extraction contracts, and approved
  intelligence artifacts.
- **vLatamGlobal owns**: operational runtime, broker workflow, client UX, audit
  trail, payments/credits, and downstream execution.
- vLatamGlobal will eventually consume **only approved/versioned artifacts or
  APIs** — never raw evidence packets, never raw snapshots, never raw AI output,
  and never AI Lab internal state. There is no shared database coupling and no
  copied runtime classifier logic.

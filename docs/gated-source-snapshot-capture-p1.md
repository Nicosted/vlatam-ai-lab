# Gated Source Snapshot Capture (P1)

This document describes the **gated source snapshot capture** layer for AI Lab.
It builds directly on the verified official source onboarding work
(`docs/verified-official-source-onboarding-p1.md`) and the intelligence source
foundation (`docs/ai-lab-intelligence-foundation-p1.md`).

## What this PR does and does not do

This PR creates **capture metadata, gates, fixtures, tests, and documentation
only**. Explicitly:

- This PR **does not scrape**.
- This PR **does not call the network**.
- This PR **does not ingest full source content**.
- This PR **does not call AI providers** and adds no AI provider dependency.
- This PR **does not approve classifier decisions**.
- This PR **does not integrate with vLatamGlobal**.
- This PR **adds no Supabase migration** and no shared database coupling.

## What a source snapshot is

A **source snapshot** is a recorded capture event for a registered intelligence
source: it states that, at a specific `captured_at` time, a specific source
state was observed and logged for review. It carries traceability metadata —
locator, optional official URL, optional version label, optional content
fingerprint, capture method/origin/actor — plus the **gates** that govern what
may happen next (freshness, review, extraction, downstream).

A snapshot is **not** the scraped content of the source. In this layer it
records only that an official source state was observed; no headings, codes,
rates, articles, or norms are ingested or interpreted.

## Why source metadata is not enough

A verified source registry entry only proves that a source **exists** and has
**official authority**. It does not prove that any specific source
content/version has been **captured**, **reviewed**, or **approved** for
extraction. Concretely:

- A verified official source does **not** make a snapshot approved.
- A captured snapshot does **not** make extracted intelligence approved.
- Official identity never, by itself, makes anything downstream-safe.

## What is verified in a snapshot

- That a capture event was recorded against a known `source_id`.
- The capture method (`manual`, `local_fixture`, `approved_fetch`,
  `api_import`, `other`) and, where relevant, the capture origin/actor.
- A locator/reference tying the snapshot to the source state (the schema
  requires at least one of `source_locator`, `official_url`, or
  `content_reference`).

## What is not verified yet

- The **content** behind the locator (not fetched, not ingested, not parsed).
- Any **regulatory or classification meaning** (none is asserted).
- A **content fingerprint**, unless a genuine `content_hash` is present. When
  no hash is genuinely tied to content, the snapshot carries an explicit
  warning and limitation instead of a fabricated checksum.
- **Freshness as "current"** — missing `captured_at`, missing cadence, or a
  pending review keep a snapshot at `unknown` or `requires_review`, never
  `current`.

## Conservative gates and defaults

Encoded in the schema and in `src/intelligence/snapshot-capture.ts`:

- `human_review_required` defaults to **true**.
- `downstream_allowed` defaults to **false**.
- Missing content hash/checksum produces a **warning** and never reads as
  verified.
- Missing `captured_at` is never **current**.
- Missing/`not_reviewed` review status requires **review**.
- `downstream_allowed: true` is only valid when `review_status` is `approved`,
  `human_review_required` is `true`, and `freshness_status` is `current` or
  `stale`.

### Helpers

Pure, deterministic, browser-safe, network-free helpers:

- `deriveSnapshotFreshness` — conservative freshness via the shared
  `classifyFreshness` rules (review gate takes precedence over recency).
- `deriveSnapshotReviewGate` — `approved` / `rejected` / `review_pending` /
  `review_required`.
- `isSnapshotExtractionReady` — requires capture, a locator/reference, review
  approval, and a non-failed extraction state.
- `isSnapshotDownstreamAllowed` — delegates to the shared downstream-safety
  guard; unreviewed snapshots are never downstream-safe.
- `snapshotCaptureLabel` — stable human-readable capture label.
- `hasVerifiableSnapshotFingerprint` — true only for a valid sha256 hash.
- `snapshotCaptureWarnings` — surfaces missing fingerprint / missing capture
  time.
- `withConservativeSnapshotDefaults` — resolves omitted safety fields to their
  safe values.

## How snapshots prepare future AI extraction

Snapshots give a future AI extraction job a stable, reviewable input reference
(`snapshot_id` + locator/reference) without coupling extraction to live
network state. The AI extraction job contract
(`schemas/ai-extraction-job.schema.json`) already references an optional
`snapshot_id`; extraction readiness here is intentionally gated behind review
approval so that no extraction is attempted against an unverified capture.

## How snapshots prepare human review

Each snapshot records exactly what a reviewer must check — which source, which
locator, when captured, by what method, with which limitations and warnings —
without asserting any conclusion. Review approval is the explicit act that
moves a snapshot from `requires_review` toward extraction and, eventually,
downstream use.

## How snapshots later become evidence for approved classifier intelligence

A reviewed, approved snapshot becomes part of the **evidence chain** for an
approved classifier intelligence artifact: source registry entry → reviewed
snapshot → reviewed extraction → reviewed/approved artifact. Each step is a
separate, explicit gate. No step is skipped, and no raw output is treated as
approved.

## AI Lab / vLatamGlobal boundary

- **AI Lab owns**: source registry, source snapshots, freshness, extraction
  contracts, evidence preparation, and approved intelligence artifacts.
- **vLatamGlobal owns**: operational runtime, broker workflow, client UX, audit
  trail, payments/credits, and downstream execution.
- vLatamGlobal will eventually consume **only reviewed/versioned artifacts or
  APIs** — never raw snapshots, never raw AI output, and never AI Lab internal
  state. There is no shared database coupling and no copied runtime classifier
  logic.

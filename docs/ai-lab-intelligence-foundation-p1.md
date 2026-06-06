# AI Lab Intelligence Foundation (P1)

Status: foundation only. Schemas, types, pure helpers, fixtures, tests, and docs.
No scraping, no network calls, no AI provider integration, no persistence, and no
vLatamGlobal coupling are introduced by this layer.

## What this is

The AI Lab intelligence foundation is the internal, source-of-truth layer that
will let vLatamGlobal Classifier evolve beyond demo/sample data into a trusted,
source-backed, freshness-aware, AI-assisted intelligence layer.

It introduces three contracts plus conservative helpers:

1. **Source registry** (`schemas/intelligence-source-registry.schema.json`) —
   the catalog of trade/classification intelligence sources (WCO/HS, NCM,
   MERCOSUR, sectoral regulators, …) with authority, reliability, jurisdiction,
   freshness, verification, human-review, and downstream-safety metadata.
2. **Source snapshot** (`schemas/intelligence-source-snapshot.schema.json`) —
   a recorded check/version of a source. It represents a capture event, not the
   full scraped content, and prepares future ingestion.
3. **AI extraction job** (`schemas/ai-extraction-job.schema.json`) — a
   schema/type contract for a future AI-assisted extraction job. It is a
   contract only: no provider is wired, and unreviewed output is never
   downstream-safe.

Pure, network-free helpers live under `src/intelligence/`:

- `freshness.ts` — `classifyFreshness`, `cadenceToDays`, `isDownstreamSafe`.
- `source-registry.ts` — `withConservativeDefaults`.
- `types.ts` — shared TypeScript types mirroring the schemas.

## Why AI Lab owns this

AI Lab owns source intelligence, freshness, extraction contracts, evidence
preparation, and approved intelligence artifacts. Concentrating these here keeps
the trust and review machinery in one auditable place, isolated from production.
vLatamGlobal should never have to reason about where intelligence came from or
whether it was reviewed — it should only ever receive reviewed, versioned,
source-backed artifacts through a stable contract/API.

## How this supports vLatamGlobal Classifier

This layer defines the upstream half of a clean boundary. Once a source is
verified, snapshotted, extracted, and human-reviewed, the resulting approved
artifact can be exposed to vLatamGlobal through the existing classifier export
contracts (`schemas/classifier-approved-artifact-export-*.schema.json`). The
classifier gets stable, reviewed inputs; AI Lab keeps the messy, evolving source
and extraction machinery.

## Why raw LLM output is not enough

Raw LLM output can be fluent and wrong. For trade classification and compliance,
fluency is not authority and confidence is not correctness. Therefore:

- No raw LLM output is treated as approved intelligence.
- An extraction job's `confidence` is never a substitute for human review.
- Unreviewed extraction output is never `downstream_allowed`.

## Human review and downstream-safety doctrine

- `human_review_required` defaults to **true** for any intelligence that may
  affect classification/compliance.
- `downstream_allowed` defaults to **false** and is only permitted once the item
  is verified and reviewed. The schemas enforce this:
  - a registry entry can be `downstream_allowed: true` only when
    `verification_status: "verified_official"` and `human_review_required: true`;
  - a snapshot can be `downstream_allowed: true` only when
    `review_status: "approved"`;
  - an extraction job can be `downstream_allowed: true` only when
    `status: "reviewed_approved"`.
- Missing freshness data is never treated as current. `classifyFreshness`
  returns `unknown` or `requires_review` when information is incomplete, never
  false confidence.
- `isDownstreamSafe` requires every gate to pass: explicit allow, approved
  review, satisfied review requirement, and a non-`requires_review` freshness
  status.

## What is intentionally NOT implemented yet

- No scraping, fetching, or any network calls.
- No AI/LLM provider integration or provider dependency.
- No persistence/migration (no Supabase or other database). This is a
  schema/type/fixtures/tests/docs foundation.
- No vLatamGlobal runtime code, no shared database, no copied classifier logic.
- Sample locators use `sample://…` placeholders and `verification_status:
"unverified_sample"`. They are non-authoritative and MUST be replaced by
  verified official sources before any downstream use. No regulatory claims are
  made by these fixtures.

## Doctrine: AI Lab vs vLatamGlobal boundary

- **AI Lab owns:** source intelligence, freshness, extraction contracts,
  evidence preparation, and approved/versioned intelligence artifacts.
- **vLatamGlobal owns:** operational runtime, real cases, broker workflow,
  client UX, audit trail, payments/credits, and downstream execution.
- No shared database coupling. No copied runtime classifier logic. No raw
  unreviewed AI output is downstream-safe. Approved artifacts must eventually be
  reviewed, versioned, source-backed, schema-valid, and auditable.

## Recommended next PRs (next stages)

1. **Verified official source onboarding** — replace sample locators with
   verified official sources; set `verification_status: "verified_official"`
   only after human verification.
2. **Snapshot ingestion/capture** — add an approved, gated capture path that
   produces snapshots (still no uncontrolled scraping).
3. **AI extraction pipeline** — wire a provider behind explicit approval gates;
   extraction output stays `review_pending` until reviewed.
4. **Human review console/workflow** — operationalize review status transitions
   and approvals.
5. **Approved classifier intelligence artifacts** — promote reviewed extraction
   output into versioned, source-backed approved artifacts.
6. **vLatamGlobal consumption through stable API/contracts** — expose only
   reviewed artifacts via the classifier export contracts; no shared DB.

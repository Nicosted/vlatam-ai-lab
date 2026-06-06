# Verified Official Source Onboarding (P1)

Status: source-metadata onboarding only. This layer onboards **verified official
source references** for trade/classification intelligence. It does **not** ingest
source content, extract classification rules, generate approved intelligence, or
integrate with vLatamGlobal. No scraping and no runtime network calls are
introduced.

This builds directly on the intelligence foundation
([ai-lab-intelligence-foundation-p1.md](ai-lab-intelligence-foundation-p1.md)):
the source registry, freshness helpers, and conservative downstream-safety
doctrine already exist. Here we move from `sample://…` placeholders toward
trusted, named official sources, so future ingestion and AI extraction can
operate from verified sources.

## Official sources onboarded

Each source is recorded as a registry entry validated against
`schemas/intelligence-source-registry.schema.json`. All are
`verification_status: "verified_official"` (except the sectoral placeholder),
`downstream_allowed: false`, and `human_review_required: true`.

| Source                                                                             | Scope               | Authority | Fixture                                                                          |
| ---------------------------------------------------------------------------------- | ------------------- | --------- | -------------------------------------------------------------------------------- |
| WCO HS 2022 Edition                                                                | global              | official  | `snapshots/pcram/intelligence-source-registry-wco-hs-2022-official.json`         |
| WCO HS 2028 transition/correlation (future-facing)                                 | global              | official  | `snapshots/pcram/intelligence-source-registry-wco-hs-2028-official.json`         |
| MERCOSUR NCM / AEC official reference                                              | regional (MERCOSUR) | official  | `snapshots/pcram/intelligence-source-registry-mercosur-ncm-aec-official.json`    |
| Argentina Decreto 557/2023 (NCM adjusted to HS VII Amendment; AEC; export refunds) | national (AR)       | official  | `snapshots/pcram/intelligence-source-registry-ar-decreto-557-2023-official.json` |
| ARCA (ex-AFIP) Arancel Integrado y Sufijos de Valor                                | national (AR)       | official  | `snapshots/pcram/intelligence-source-registry-ar-arca-arancel-official.json`     |
| Sectoral regulatory source (placeholder)                                           | national (AR)       | unknown   | `snapshots/pcram/intelligence-source-registry-sectoral-placeholder.json`         |

The earlier `sample://…` fixtures (`…-wco-hs.json`, `…-ar-ncm.json`,
`…-mercosur.json`, `…-sectoral.json`) are retained as non-authoritative samples
for schema/contrast testing and are not promoted.

## Why these sources matter for classification intelligence

- **WCO / Harmonized System** is the global backbone of tariff classification;
  the HS 2022 Edition is the current nomenclature, and HS 2028 materials are
  tracked as future-facing transition metadata.
- **MERCOSUR NCM/AEC** is the regional nomenclature and common external tariff
  layer that national tariffs derive from.
- **Argentina Decreto 557/2023 and the ARCA/AFIP Arancel Integrado** are the
  national normative and customs-authority references that operationalize the
  NCM/AEC for Argentine trade.

Together they form the global → regional → national chain that classification
intelligence must eventually be backed by.

## What is verified at this stage

- The **identity of the official source** (issuing authority) and a stable
  **official locator** for each onboarded source.
- That the registry entries are **schema-valid**, carry required authority and
  reliability metadata, and are mutually distinguishable by scope/authority.
- That conservative doctrine holds: verified official sources are still
  `downstream_allowed: false`, `human_review_required: true`, and carry
  non-`current` freshness.

## What is NOT verified at this stage

- No source **content** (HS headings/notes, NCM codes, AEC rates, arancel
  positions, legal text) has been ingested, captured, or extracted.
- No **regulatory or classification claim** is made. In particular, no claim is
  made about the current in-force status, scope, or applicability of any decree,
  resolution, or tariff.
- No **version-pinned document locator** or content hash is captured; the
  precise downloadable instruments behind landing pages still require human
  verification.
- The sectoral source remains an **unverified placeholder** (`requires_review`)
  until an official sectoral source is clearly identified and verified.

## Why source verification ≠ approved classifier intelligence

Verifying that a source is official tells us the source can be **trusted as a
source**. It does **not** make any intelligence derived from it correct,
current, or safe to act on. Source metadata may be `verified_official` while the
intelligence extracted from that source remains non-downstream-safe until it is
ingested, extracted, and **human-reviewed**. This separation is encoded in the
helpers: `isVerifiedOfficialSource` is independent of `isSourceDownstreamAllowed`,
and `deriveSourceFreshness` returns `requires_review` for a source that still
needs human review, regardless of how recently it was checked.

## Onboarding helpers

Pure, network-free helpers live in `src/intelligence/source-onboarding.ts`:

- `isSampleLocator` — detects non-authoritative `sample://…` placeholders.
- `isVerifiedOfficialSource` — requires both `verified_official` status **and** a
  non-sample locator (a sample locator can never be "official").
- `sourceVerificationLabel` — `verified-official` / `unverified-sample` /
  `deprecated` / `inconsistent` (the last flags a `verified_official` entry that
  still uses a sample locator — a state onboarding must never ship).
- `deriveSourceFreshness` — conservative freshness for a registry entry via the
  shared `classifyFreshness` rules; missing data never reads as `current`.
- `isSourceDownstreamAllowed` — a guard that is `false` unless an entry is
  explicitly allowed, verified official, and flags human review. Even a `true`
  here is not approval to publish unreviewed intelligence; review approval lives
  in review manifests/snapshots, not in the registry.

## How this prepares future work

- **Future snapshot ingestion** — verified locators give a gated capture path a
  trusted starting point; snapshots will still be produced under explicit
  approval, never via uncontrolled scraping.
- **Future AI extraction** — extraction jobs (the existing
  `ai-extraction-job` contract) can target verified sources; extraction output
  stays `review_pending` and is never downstream-safe until reviewed.
- **Future human review** — the `requires_review` freshness and
  `human_review_required: true` flags make the review obligation explicit before
  any promotion.
- **Future approved classifier intelligence artifacts** — only after ingestion,
  extraction, and review may reviewed output become versioned, source-backed
  approved artifacts, exposed to vLatamGlobal through the existing classifier
  export contracts (`schemas/classifier-approved-artifact-export-*.schema.json`).

## AI Lab vs vLatamGlobal boundary

- **AI Lab owns:** source registry, source freshness, source snapshots, AI
  extraction contracts, evidence preparation, and approved intelligence
  artifacts.
- **vLatamGlobal owns:** operational runtime, broker workflow, client UX, audit
  trail, payments/credits, and downstream execution.
- No shared database coupling. No copied runtime classifier logic. No raw
  unreviewed AI output is downstream-safe. No unverified source is treated as
  production-ready.

## Explicit scope statement

This PR:

- verifies **source metadata only**;
- does **not** ingest full source content;
- does **not** extract classification rules;
- does **not** generate approved intelligence;
- does **not** integrate with vLatamGlobal;
- does **not** perform scraping or network calls at runtime.

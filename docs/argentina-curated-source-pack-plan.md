# Argentina Curated Source Pack Plan

## Purpose

Define the first real Argentina curated source pack for AI Lab without adding
unverified regulatory content.

The pack is a repo-first, human-reviewed source curation path for a narrow
classifier-support demo or pilot. It is not broad Argentina legal coverage, not
production tariff advice, and not a runtime integration. Its job is to move from
the current source identity and placeholder snapshot layer toward a bounded,
reviewed, exportable Argentina artifact.

This plan does not authorize scraping, live fetching, Supabase, migrations,
provider calls, vLatamGlobal bridge changes, production readiness, or
downstream use of unreviewed content.

## First Intended Use Case

The first pack should support a narrow classifier-support workflow for one
demo/pilot product or product family. The pack should answer only the bounded
questions needed to demonstrate the evidence chain:

- Which reviewed official sources are relevant to the product scope?
- Which captured source snapshots and fingerprints support the evidence?
- Which bounded excerpts or local references are available for extraction?
- Which extraction draft claims are supported, limited, or rejected by review?
- Which final reviewed artifact, if any, is eligible for export?

The first use case must remain a classifier-support pack. It must not present
itself as complete Argentina customs coverage, complete NCM coverage, binding
classification, tax advice, legal advice, operational import/export clearance,
or production-ready vLatamGlobal intelligence.

## Candidate Source Categories

Candidate sources should be selected by category first, then narrowed to
version-pinned official locators during later PRs.

| Category | Intended role | Initial handling |
| --- | --- | --- |
| Argentina customs/tariff authority sources | National customs and tariff operational context for Argentina. Existing source candidates include ARCA/legacy AFIP authority references and national official publication references already represented as source metadata. | Registry candidates and snapshot placeholders first; no content ingestion until a reviewer identifies the exact official instrument or dataset and capture method. |
| MERCOSUR/NCM sources | Regional nomenclature and Common External Tariff context that national Argentina references may depend on. | Reuse the existing MERCOSUR/NCM source family as the regional layer; pin exact instruments only after human source review. |
| WCO/HS sources | Global Harmonized System context behind HS/NCM terminology and structure. | Reuse the existing WCO HS source family as global context; include only bounded references needed for the selected product scope. |
| Product-specific sectoral sources | Sectoral controls, permits, safety, sanitary, technical, or agency-specific context when needed for the selected demo product. | Add only when the product scope requires it; keep placeholders clearly unverified until an official source and authority are reviewed. |

Source category selection must not imply any regulatory conclusion. A source can
be official and still not be current, captured, reviewed, extraction-ready, or
downstream-safe.

## Required Source Metadata

Every real candidate and captured source record should make the following
metadata explicit, using the existing schemas where possible:

- `authority`: issuing authority or authority label, recorded in schema fields
  such as `authority_level`, `source_name`, and local `metadata.issuing_authority`.
- `jurisdiction`: global, regional, national, or sectoral scope, using fields
  such as `jurisdiction_scope`, `country_code`, and `regional_scope`.
- `source type`: one of the current registry categories such as
  `customs_authority`, `ncm_reference`, `mercosur_norm`, `wco_hs_reference`,
  `sectoral_regulator`, `manual_source`, or `other`.
- `locator`: stable `source_locator`, optional `official_url`, and later a
  version-pinned `content_reference` or `excerpt_reference` where reviewed.
- `captured_at`: UTC capture timestamp for every snapshot record.
- `last_checked_at`: UTC freshness check timestamp for source registry entries
  when available.
- `hash/fingerprint when available`: `content_hash` or `content_fingerprint`
  only when genuinely tied to captured content. Missing hashes must remain a
  warning or limitation, never a fabricated checksum.
- `freshness cadence`: `expected_update_cadence` plus conservative
  `freshness_status`; missing or pending review must not read as current.
- `review status`: registry verification status, snapshot `review_status`,
  extraction/review manifest status, and final artifact review status must stay
  separate.
- `explicit limitations`: limitations must state when content was not ingested,
  version scope is unverified, fingerprints are missing, coverage is product
  bounded, or no downstream use is allowed.

## File Path Plan

All first-pack artifacts should remain under `snapshots/pcram/` and use stable,
descriptive names. Prefer adding real Argentina pack files beside the existing
P1 fixtures instead of introducing a new persistence layer.

Planned file families:

- `snapshots/pcram/intelligence-source-registry-ar-<source>-official.json`
- `snapshots/pcram/intelligence-source-registry-mercosur-<source>-official.json`
- `snapshots/pcram/intelligence-source-registry-wco-<source>-official.json`
- `snapshots/pcram/intelligence-source-registry-sectoral-<product-or-authority>-placeholder.json`
- `snapshots/pcram/intelligence-source-snapshot-ar-<source>-<capture-date>.json`
- `snapshots/pcram/intelligence-source-snapshot-mercosur-<source>-<capture-date>.json`
- `snapshots/pcram/intelligence-source-snapshot-wco-<source>-<capture-date>.json`
- `snapshots/pcram/snapshot-review-manifest-ar-<source-or-product>-<review-date>.json`
- `snapshots/pcram/extractable-evidence-packet-ar-<product-or-use-case>-<date>.json`
- `snapshots/pcram/ai-extraction-job-ar-<product-or-use-case>-<date>.json`
- `snapshots/pcram/ai-extraction-result-ar-<product-or-use-case>-draft.json`
- `snapshots/pcram/classifier-intelligence-artifact-ar-<product-or-use-case>-draft.json`
- `snapshots/pcram/review-manifest-ar-<product-or-use-case>-<date>.json`
- `snapshots/pcram/approved-artifact-ar-<product-or-use-case>-<version>.json`
- `snapshots/pcram/classifier-approved-artifact-export-contract-ar-<product-or-use-case>-<version>.json`

Existing demo or placeholder fixtures should remain clearly marked as demo,
manual, local, or requires-verification until replaced by reviewed real
artifacts.

## Review Sequence

The first real Argentina pack should move through this sequence without
collapsing gates:

1. Source registry: add or update candidate official source metadata with
   conservative `freshness_status`, `human_review_required: true`, and
   `downstream_allowed: false`.
2. Source snapshot: record bounded capture metadata, `captured_at`, locator,
   content reference, optional genuine hash, warnings, and limitations.
3. Evidence packet: bind reviewed snapshot references to bounded evidence
   references for one demo product/use case.
4. Extraction draft: produce an extraction draft only from reviewed evidence
   packet inputs; keep it draft, traceable, and non-downstream-safe.
5. Human review manifest: record reviewer role, approval scope, source refs,
   evidence refs, limitations, risk, and downstream decision.
6. Approved artifact: create a reviewed, versioned artifact only after human
   review passes.
7. Export contract: expose only the reviewed artifact refs, hashes, evidence
   refs, limitations, and no-coupling declarations.
8. Export catalog: index the approved export contract only after local
   verification passes.
9. Bundle: run the approved export bundle flow so the repo-local bundle reflects
   the reviewed catalog.

Nothing in an earlier stage authorizes a later stage. Official source identity
does not approve snapshots. Snapshot capture does not permit extraction.
Extraction readiness does not approve downstream classifier use.

## Downstream Eligibility Rule

Nothing becomes `downstream_allowed: true` unless the relevant review and export
gates pass.

For the Argentina pack, downstream eligibility requires at minimum:

- a reviewed official source chain;
- a reviewed source snapshot with bounded locator/reference metadata;
- evidence refs tied to the reviewed snapshot;
- a reviewed extraction or reviewed manual artifact preparation record;
- a human review manifest with an explicit approval scope and limitations;
- an approved artifact envelope with a genuine content hash;
- an export contract that preserves the review, hash, source, evidence, and
  limitation boundaries;
- a catalog and bundle that pass `pnpm ai:exports:verify` and
  `pnpm ai:exports:bundle`.

If any gate is missing, stale, unsupported, or invalid, the pack must fail
closed and remain non-downstream-safe.

## Demo And Synthetic Rule

Demo and synthetic fixtures must remain clearly non-production unless explicitly
replaced by reviewed real artifacts.

Demo records should continue to use explicit labels, limitations, and
`downstream_allowed: false`. A real Argentina artifact must not inherit a demo
approval state, synthetic source authority, fictional nomenclature, or
placeholder evidence. When a real reviewed artifact replaces a demo fixture, the
replacement should be a separate reviewed file with new IDs, hashes, review
manifests, and export contracts.

## Supabase Rule

Do not add Supabase for this pack.

AI Lab should remain repo-first until the work requires live review state,
multi-user reviewer workflow, runtime audit events, API-backed catalog lookup,
background job state, or dynamic vLatamGlobal query behavior. Source curation,
snapshot metadata, evidence packets, review manifests, approved artifacts,
export contracts, export catalogs, and bundle validation are all currently
representable as reviewed repository files.

## Graphify Rule

Graphify can help navigate the repository and find related docs, schemas, or
fixtures. It is not source truth, regulatory authority, review approval,
freshness evidence, a content hash, an export gate, or a vLatamGlobal bridge.

Every source, snapshot, evidence packet, review decision, approved artifact, and
export decision must be verified against repository files, schemas, tests, and
human review. Do not generate or commit `graphify-out/` as part of this pack
plan.

## Human Review Requirement

Real regulatory content requires human review before export eligibility.

Human review must confirm, at the appropriate stage:

- source identity and authority;
- locator and version scope;
- capture method, capture time, and bounded content reference;
- hash/fingerprint when available, or an explicit waiver/limitation when absent;
- evidence scope and excerpt/reference boundaries;
- extraction draft support, unsupported claims, uncertainty, and limitations;
- approval scope, allowed consumer/use case, country scope, risk, and expiry;
- whether downstream use remains blocked or is explicitly allowed.

The reviewer decision must be represented in a manifest before any approved
artifact or export contract can be treated as eligible.

## First Implementation PR Sequence

### PR A: source registry candidates and snapshot placeholders

Add or adjust registry candidate records and snapshot placeholders for the
selected Argentina use case. Keep all real content absent, all unreviewed
records non-downstream-safe, and all placeholders explicitly labelled
`manual/local/requires-verification` or equivalent.

Status: PR A adds candidate registry fixtures and snapshot placeholders only
for Argentina customs/tariff authority, MERCOSUR/NCM, WCO/HS, and an optional
Argentina sectoral placeholder. These records are unreviewed, conservative,
non-downstream-safe, not extraction-ready, and not production-ready
intelligence. They do not contain raw source body content, hashes, approved
artifacts, export contracts, bundle updates, runtime code, Supabase work,
migrations, env vars, provider changes, Graphify output, or vLatamGlobal bridge
changes. PR B is still required before bounded source snapshots can carry
verified metadata, version-pinned capture references, and genuine hashes or
reviewed hash limitations.

### PR B: first bounded source snapshots with hashes/metadata

Add bounded snapshots for the selected source versions after human-approved
capture. Include genuine `content_hash` or `content_fingerprint` when available;
otherwise record warnings and limitations. Do not extract legal or tariff facts
in this PR.

Status: PR B adds bounded source snapshot fixtures for Argentina customs/tariff
authority, MERCOSUR/NCM, and WCO/HS. These fixtures carry conservative
metadata, deterministic local bounded-representation fingerprints, explicit
warnings that official source body content and official-content hashes remain
unverified, and review gates that block extraction, export, downstream use, and
classifier approval. PR A remains the candidate/source-placeholder layer, and
the optional Argentina sectoral source remains a conservative placeholder until
a safe official source pattern is reviewed. No approved artifact exists yet.
PR C must still create the first evidence packet for one narrow demo/pilot
product or use case before any extraction draft or review manifest work can
proceed.

### PR C: first evidence packet for one demo product/use case

Create the first extractable evidence packet for one narrow Argentina
classifier-support use case. The packet should include only bounded references
and reviewed scope metadata. It may be extraction-ready only if the governing
review manifest allows extraction; it must remain `downstream_allowed: false`.

Status: PR C adds the first bounded demo product evidence packet for `school
backpack made primarily of polyester` / `mochila escolar de poliéster`. It
references only repo-local Argentina customs/tariff authority, MERCOSUR/NCM,
and WCO/HS registry and bounded snapshot fixtures from PR A and PR B. The packet
is conservative, non-downstream-safe, not extraction-ready, and explicitly does
not claim any final NCM/HS classification, legal determination, tariff
treatment, approved artifact status, export eligibility, runtime integration, or
production readiness. PR D must still create the extraction draft and human
review manifest before any review or approval step can proceed. No approved
artifact exists yet.

### PR D: extraction draft and review manifest

Create the extraction draft and human review manifest for the selected use case.
Unsupported or uncertain claims must be explicit. Review scope and limitations
must be recorded before any approval step.

### PR E: approved artifact and export contract

Create the first approved Argentina artifact only if human review approves the
draft. Add the export contract with hashes, evidence refs, limitations, and
explicit no-coupling declarations.

### PR F: update approved export bundle and vlatam-global read-only fixture

Update the approved export catalog and deterministic bundle after verification.
Add or update only a read-only vlatam-global fixture if a later reviewed PR
explicitly needs it. This remains contract-based and must not change runtime
bridge behavior.

## Validation For Future PRs

Each implementation PR should run the narrowest relevant schema/test checks and,
once export surfaces are touched, the full local export validation:

```bash
pnpm ai:exports:verify
pnpm ai:exports:bundle
pnpm typecheck
pnpm lint
pnpm test
git diff --check
```

This plan PR adds no runtime code, Supabase, migrations, env vars, Graphify
output, provider behavior, or vlatamGlobal bridge behavior.

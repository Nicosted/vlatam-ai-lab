# Regulatory Research Workspace Evidence Note

## Local Source Snapshot Context

- Branch: `feat/regulatory-research-workspace`
- Baseline: `main` was clean and `git pull --ff-only` reported already up to date.
- Graphify: no `graphify-out/graph.json` baseline was present, so repository inspection used direct local source reads.
- Existing advisory context:
  - `src/advisory/regulatory-advisory-read-model.ts`
  - `data/fixtures/advisory/regulatory-advisory-readiness-ar-es-eu-ecological-biological-agrochemical.json`
  - `docs/advisory/regulatory-source-of-truth.md`

## Derived Delta

This PR adds a local regulatory research workspace for the Argentina to Spain ecological agrochemical export scenario. It models research questions, source requirement categories, missing evidence, readiness state, and human review requirements before any reviewed answer can be produced.

## Assumptions And Limitations

- The workspace is not final legal, customs, tariff, chemical, product-safety, organic/ecological, or EU regulatory advice.
- No HS/NCM classification is inferred.
- No official source citations are populated unless reviewed project evidence exists.
- No external scraping, live source ingestion, production database access, or external AI provider call is added.
- The visible page is a local research surface, not an approved export/API contract for downstream consumers.

## Human Review Route

Human review remains required before any client-facing conclusion. Missing evidence and missing official-source review can block reliable conclusions.

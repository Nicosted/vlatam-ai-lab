# AI-76 Local Implementation Report

## Source snapshot

- Repository: `vlatam-ai-lab`
- Base: `main` at `dff6ed72a6cb656c554c8c61f36a503de2929d70`
- Branch: `feat/ai-76-regulatory-gold-cases-v1`
- Graphify baseline: unavailable; focused local source and contract inspection used
- Source context: AI-75 evaluation contracts, regulatory advisory fixture, source-of-truth guidance, jurisdiction/evidence schemas, and audit conventions

## Delta

- Added regulatory gold-suite metadata as an extension of AI-75 contracts.
- Added a deterministic fail-closed loader, validator, and order-independent hash.
- Added suite `regulatory.gold.ar-es-eu.agricultural-inputs@1.0.0` with 6 synthetic, in-review cases.
- Covered AR export and ES/EU import scope, ambiguous agricultural-input classification, missing facts/documents, authority/evidence gaps, conditional paths, and temporal validity.
- Added a JSON Schema, schema-registry entry, offline validation command, tests, and author/reviewer documentation.

## Assumptions and limitations

- Repository evidence does not support definitive Spain/EU obligations or fertilizer, biostimulant, plant-protection, pesticide, or adjacent-category conclusions.
- Unresolved questions are encoded through required clarification, abstention, and regulatory-counsel review.
- Cases are `in_review`; none is represented as legally approved or downstream-safe.
- AI-77 campaign execution and AI-78 comparison/ranking remain unimplemented.
- Approved-artifact, export, pricing, budget, registry production-state, and routing semantics are unchanged.

## Local verification

- Focused AI-75/AI-76 tests: 18 passed, 0 failed.
- Full suite: 541 passed, 0 failed.
- Typecheck: passed.
- Build: passed.
- Targeted ESLint: passed.
- Corpus validation: passed; 6 cases; hash `baa70f3a4fa68afc4764cea5393f00e221891ba13d9286efd078f2e32dd45dc5`.
- Stable manifest-order hashing and deterministic AI-75 replay: passed.
- Provider and adapter calls: zero by construction and test assertion.
- Credential, personal-data, unrestricted-prompt, and audit-leakage scans: no matches.
- Protected-state mutation test: passed.
- `git diff --check`: passed.

This report is local implementation evidence and requires human review before merge or regulatory use.

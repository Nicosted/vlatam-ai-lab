# AI-139 — First ARCA read-only regulatory library

- Date: 2026-07-28
- Human reviewer: Nicolas Matias Stedile
- Decision identity source: explicit user declaration
- Publication mode: informational, immutable, read-only

## Local source snapshot

- Expected and resolved parent commit:
  `d8cbf23e500d9f553daa6336918853e14a68cc74`.
- Local `main` and the locally recorded `origin/main` matched that full SHA.
- The worktree and index were clean before branch creation.
- Implementation branch:
  `feat/ai-139-arca-read-only-library`.
- No Graphify baseline existed at `graphify-out/graph.json`; repository files
  were inspected directly under the documented fallback.

## Explicit human decision

The user declared that Nicolas Matias Stedile manually checked the three
regulations and confirmed their official texts, official source references,
and annex completeness. No professional licence, legal credential,
customs-broker qualification, or independent legal review is claimed.

The immutable decision scope is limited to:

1. official text;
2. official source references;
3. annex completeness.

The declared date is `2026-07-28`. Because no time-of-day was supplied, the
deterministic record timestamp is normalized to
`2026-07-28T00:00:00-03:00`, the start of the declared date in the repository
timezone. This normalization is not a claim about the precise time at which
the review occurred.

## Exact reviewed bindings

| Instrument   | Canonical artifact hash                                            | Review-package hash                                                |
| ------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| RG 5859/2026 | `02415dfe469aab285ec99e50abeb3a78cc611e1ce7b8448c4f76405345ab9207` | `847fbdebd4e2131b17719d62f16dc71123225dc8db94603e5787f9575e64c4a5` |
| RG 5845/2026 | `415ba2bf1c2071914c11d129fd7fb3d1393a18004aee11986225c6e6b4e058ba` | `7f2932977642d7e8025b4e0e972ddc2f0f90a8213bebacbf499865051ef25123` |
| RG 5838/2026 | `5ec079c8f36592c7b07adcd8ac050fc1c92fb75f8973c07bdfef7b6c20a7252b` | `6e68606abf011d71a06b33c1b55876b44a796f503ea035ab19340637304d59cd` |

The original artifacts, official text, source URLs, source hashes, annex
hashes, acquisition timestamps, canonical hashes, and original pending review
packages remain byte-for-byte unchanged.

## Decision and publication hashes

| Instrument   | Human-decision hash                                                | Publication-record hash                                            |
| ------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| RG 5859/2026 | `cc5fe0a4cbc8f0040faab77e7b3cd8d0d3bd0090b01b33b2958d9b46faee1be4` | `98aacb0ca9817a88d1210a861938fbb2e0a2a5642c82ddab60799b02dd520e65` |
| RG 5845/2026 | `f61d126cd5d62c7e7aeb918e969bea051a3d9cc87fc78624e83e837ca6006bb3` | `e6a8114f6689455b2e6109c2517a82f1b9d57df1bd969ac750a2e8bd9d27d6c0` |
| RG 5838/2026 | `8e933b9f31c540150cd9a3e1a7f1acd9b5c4f705377e8924ec27aa27d2f6f3d7` | `bf5f7bee951346ab8fb7e89afe4217a4bff912a4416500c57800c416704c8ce2` |

Hashes use sorted-key JSON canonicalization, a versioned domain separator,
and exclusion of the record's own hash field. Any mismatch fails closed.

## Publication scope and interface

The published set is exactly RG 5859/2026, RG 5845/2026, and RG 5838/2026.
The synthetic tariff fixture remains test-only and is excluded from all
library items and counts.

The primary route is `/operator/arca-library`, visible as `Biblioteca ARCA`
inside the existing Evidencia section. The sidebar still has six first-level
sections. Revisiones retains Pendientes, Revisión humana, Revisión ARCA,
Artefactos aprobados, and Gobernanza. The surfaces remain separate:

- Revisión ARCA reports zero pending real regulations and links to the
  completed publication.
- Artefactos aprobados reports the three approved regulatory artifacts.
- Biblioteca ARCA displays only the three approved, published-read-only
  instruments.

Search is local client-side filtering by number, title, or topic. Detail
disclosures include official dates and status, concise subject, annex count,
two official links, reviewer/date, relationships, canonical artifact hash,
human-decision hash, and publication-record hash.

The visible disclaimer is:

> Esta biblioteca presenta información normativa y evidencia oficial. No
> constituye asesoramiento legal o aduanero, interpretación vinculante ni
> autorización para ejecutar operaciones.

## Closed contracts and immutable packaging

The schema registry includes closed
`arca_human_review_decision` and
`arca_read_only_publication_record` contracts. Unknown properties or values,
missing/automated reviewer identity, changed bindings, rejected/expired/
invalid/superseded decisions, and revoked publication records fail closed.

The Vercel function manifest adds exact paths for three decisions, three
publication records, and the two registered schemas. It includes no glob, raw
body, PDF, temporary file, credential, fixture-as-production record, or
unneeded report.

## Validation evidence

- Focused ARCA, Operator, route, and packaging regression suite: 73/73 tests
  passed, including 15/15 AI-139 library tests.
- Full repository suite: 1,454/1,454 tests passed.
- Production TypeScript build: passed.
- Typecheck: passed.
- Scoped ESLint: passed.
- Scoped Prettier: passed.
- `git diff --check`: passed.
- Desktop review at 1440 × 1000: passed.
- Mobile review at 390 × 844: passed with a single-column card layout and no
  document-level horizontal overflow.
- Local search was exercised by number (`5845`), title/topic
  (`depósitos fiscales`), and topic (`importación`).
- Browser console errors and warnings: none.

## Governed limitations

Read-only publication does not make AI LAB operationally unblocked. After this
change:

- approved real ARCA regulations: 3;
- pending real ARCA regulations: 0;
- published read-only regulations: 3;
- model execution: not permitted;
- ARCA execution: unavailable;
- scheduler: inactive;
- AI-131, AI-132, and AI-133 kill switches: active;
- external side effects: none;
- database mutation: none;
- legal interpretation: none.

Future regulations require separate human decisions. This decision does not
authorize automated acquisition or publication, provider invocation, runtime
requests, operational decisions, migration, deployment, or any
`vlatam-global` mutation.

## Rollback

Rollback is a reviewed local revert of the AI-139 commit. It removes the six
derived records, two schemas, read-only projection, library route, navigation
link, packaging entries, and AI-139 tests while leaving the six original
AI-137 evidence files unchanged. No database, external service, DNS, runtime,
or production rollback action is required.

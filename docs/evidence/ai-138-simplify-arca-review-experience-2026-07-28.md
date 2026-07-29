# AI-138 — Simplified ARCA human review experience

Date: 2026-07-28

Branch: `fix/ai-138-simplify-arca-review-experience`

Parent commit: `3c741e64e225e5c9f146efaf96f864c086bc85db`

Scope: local presentation and presentation-test changes only

## Source snapshot and preconditions

Before the branch was created:

- `main` pointed to the exact PR #136 merge commit
  `3c741e64e225e5c9f146efaf96f864c086bc85db`.
- `origin/main` resolved locally to the same commit; the ahead/behind count was
  `0 0`.
- the index and worktree were clean;
- no Graphify baseline existed, so repository inspection used local source
  files directly;
- no network, external service, database, deployment, or production system was
  accessed.

The six first-batch artifact/review files were hashed before implementation and
again after validation. Their file SHA-256 values are unchanged:

| File                         | File SHA-256                                                       |
| ---------------------------- | ------------------------------------------------------------------ |
| `rg-5838-2026.artifact.json` | `80a333a3a561d4153bf65c4e14816fa8e1c8e2af27e521fa155590519260347e` |
| `rg-5838-2026.review.json`   | `cbd4fc57e1b34f6edec02e457c1abe8b104094bafd82fbd576764161e8f87e31` |
| `rg-5845-2026.artifact.json` | `893b277b8be4a5fee82914b65ca5fe4a96904fe7e07c55dca88f83feb7d96d4d` |
| `rg-5845-2026.review.json`   | `ab45a986c248a3adb1702fdb3c4af531a7542a94a17192383255e0d25eaba9a5` |
| `rg-5859-2026.artifact.json` | `8e3a060655cb420de1130b0d160ffbe32a3834784279eec03189d83de6bd260c` |
| `rg-5859-2026.review.json`   | `c3dc9297f9ce611bbb9dcd92fd8f6f233d2e179c7ff66162d81614f5e6da9c05` |

## Presentation delta

Before:

1. technical batch metadata led the page;
2. each card led with a long official title and a free-floating review badge;
3. hashes, canonical values, source hashes, and internal recommendations
   competed with human review facts;
4. official source links were mixed with hashes and technical URL context.

After:

1. four compact metrics lead the page: three real regulations, three pending,
   zero approved, and publication disabled;
2. every card begins with `RG <number>/2026`, a source-supported short title,
   and a status badge held in the upper-right cell of a stable header grid;
3. the primary summary shows what the regulation covers, affected-party
   availability, publication date, effective date or rule, current state,
   official sources, cross-source verification, annex count, and review state;
4. exact identifiers, hashes, source-body hashes, canonical values, schema
   versions, acquisition method, internal review codes, and packaging
   identifiers remain available under the closed
   `Datos técnicos y trazabilidad` disclosure;
5. source actions use `Ver en Biblioteca ARCA` and
   `Ver en Boletín Oficial` instead of displaying raw URLs as link text;
6. the layout is three columns on desktop, two columns on tablet, and one
   column on mobile. Mobile places the status badge consistently below the
   identity block and keeps source links full-width and tappable.

## Assumptions and limitations

- The short titles are presentation-only compressions of each artifact's
  existing `subject` and `topics`. They do not add a legal conclusion.
- The artifact contract contains no explicit affected-party field. Every card
  therefore states `No definido en el artefacto actual`; no affected party was
  inferred.
- Dates are rendered in Spanish without changing the underlying ISO values.
  Exact official titles and identifiers remain in technical traceability.
- Responsive behavior is covered by rendered-HTML and application-shell CSS
  browser tests. No external browser, live production page, or deployment was
  used.

## Security and authority boundaries

- all three artifacts and review packages remain
  `pending_human_review`;
- all three artifacts and review packages remain `not_published`;
- canonical artifact hashes, review-package hashes, source evidence, annex
  evidence, and schemas are unchanged;
- the scheduler remains inactive;
- AI-131, AI-132, and AI-133 kill switches remain active;
- ARCA runtime execution, database writes, publication, and legal
  interpretation remain unavailable;
- `/operator/arca-review` retains the exact
  `operator, reviewer, admin` route authorization;
- no approval, rejection, publication, mutation, scheduler, database, network,
  deployment, or external-service capability was added.

## Changed files

- `src/application/application-shell.ts`
- `src/operator/operator-console.ts`
- `tests/application/application-shell-browser.test.ts`
- `tests/operator/arca-review-console.test.ts`
- `tests/regulatory/arca-regulatory-batch.test.ts`
- `docs/evidence/ai-138-simplify-arca-review-experience-2026-07-28.md`

## Validation

| Check                                                                                | Result                                       |
| ------------------------------------------------------------------------------------ | -------------------------------------------- |
| ARCA regulatory, ARCA console, operator-console, and application-shell browser tests | 55 passed, 0 failed                          |
| Authorization, route-policy, application boundary, and packaging tests               | 72 passed, 0 failed                          |
| Full `pnpm test` suite                                                               | 1,439 passed, 0 failed; 372 top-level groups |
| `pnpm run build:production`                                                          | Passed                                       |
| `pnpm typecheck`                                                                     | Passed                                       |
| Scoped ESLint                                                                        | Passed                                       |
| Scoped Prettier                                                                      | Passed                                       |
| `git diff --check`                                                                   | Passed                                       |
| Regulatory/config/schema/runtime boundary diff                                       | No changes                                   |
| First-batch file SHA-256 comparison                                                  | All six unchanged                            |

The initial focused test run found two stale presentation assertions: one
expected the previous combined mobile selector and one expected the former
technical labels. The CSS retained the existing selector contract, the
regulatory assertion was updated to the new human-facing hierarchy, and the
focused and full suites then passed.

## Review verdict

The implementation is suitable for human review as a local presentation-only
change. It does not authorize or perform any regulatory decision or downstream
action.

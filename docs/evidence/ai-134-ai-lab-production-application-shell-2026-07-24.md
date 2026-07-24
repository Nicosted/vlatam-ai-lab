# AI-134 local implementation evidence

## Local source snapshot

- Repository: `vlatam-ai-lab`
- Baseline branch: `main`
- Baseline commit:
  `8593a03a737e91b8a9e7e2516f91988a4778f589`
- Baseline subject:
  `AI-133: add governed ARCA scheduler locking and recovery (#128)`
- Implementation branch: `feat/ai-134-ai-lab-production-shell`
- Remote state was not refreshed or queried.

## Derived delta

AI-134 adds:

- a graphite, responsive, persistent application shell;
- grouped navigation and mobile/sidebar behavior;
- environment, system status, role context, breadcrumbs, and provenance;
- explicit repository-current blocked-state panels;
- role visibility and a fail-closed protected application boundary;
- root routing, same-origin shell assets, secure headers, and safe liveness;
- preparation for an independent Vercel project and future custom domain;
- local UI, boundary, environment, health, and build tests; and
- architecture and deployment documentation.

The existing `/operator/review` and `/operator/arca-review` content paths remain
the original review renderers. No decision or authority logic was duplicated.

## Assumptions and limitations

- The existing `OperatorReadModel` is authoritative for its current fields.
- AI-131, AI-132, and AI-133 display state is the named fail-closed projection
  derived from checked-in configuration.
- Cost, recovery, and news remain unavailable where no reviewed source exists.
- The development role adapter is not production authentication.
- The Vercel production entrypoint remains anonymous/fail-closed until a
  reviewed trusted identity resolver is added.
- Vercel and DNS preparation is documentation/configuration only.

## Human review gate

Human review must confirm:

1. visual clarity and mobile behavior;
2. route and role visibility;
3. unchanged review governance;
4. blocked operational truth;
5. identity fail-closed behavior;
6. secure headers and liveness scope;
7. independent deployment/domain architecture; and
8. validation results recorded in the final AI-134 handoff.

This evidence does not authorize a deployment, domain change, live workflow,
ARCA request, scheduler start, export, import, publication, database write,
credential access, or `vlatam-global` access.

## Local validation

Final local results:

| Check                                                       | Result                               |
| ----------------------------------------------------------- | ------------------------------------ |
| Focused AI-134 UI, operator, server, and architecture tests | 65/65 passed                         |
| Full repository suite                                       | 1,320/1,320 passed across 155 suites |
| TypeScript typecheck                                        | passed                               |
| Local production build (`build:production`)                 | passed                               |
| Scoped ESLint                                               | passed                               |
| Scoped Prettier                                             | passed                               |
| `git diff --check`                                          | passed                               |

The first full-suite run surfaced one architecture allowlist expectation:
`src/application/` was a new read-only presentation layer that legitimately
names OpenRouter. The allowlist was narrowed to that application directory, its
boundary tests remained in place, and the full suite then passed.

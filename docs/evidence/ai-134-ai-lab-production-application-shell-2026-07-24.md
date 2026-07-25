# AI-134 local implementation evidence

## Local source snapshot

- Repository: `vlatam-ai-lab`
- Baseline branch: `main`
- Baseline commit:
  `8593a03a737e91b8a9e7e2516f91988a4778f589`
- Baseline subject:
  `AI-133: add governed ARCA scheduler locking and recovery (#128)`
- Implementation branch: `feat/ai-134-ai-lab-production-shell`
- Execution-isolation review baseline:
  `b8305f706a2bff8b17185fd2212c849eb048bad5`
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

The follow-up hardening delta adds explicit runtime modes and loopback-gated
local identity, Preview/Production fail-closed entrypoint behavior, a shared
nonce-based HTML response policy, production-HTTPS-only HSTS, an accessible
mobile drawer, visible mobile boundary context, and a typed status-tone map.

The execution-isolation delta replaces the production path
`api/index.ts → api-server.ts → operator-console-handler.ts →
repository-operator-read-model.ts → openrouter-glm-supervised-pilot.ts` with
`api/index.ts → application-server.ts → operator-console-handler.ts →
repository-operator-read-model.ts →
openrouter-supervised-pilot-projection.ts`. The projection is read-only and
cannot resolve secrets or construct provider transport. The classifier server,
OpenRouter adapter, environment-secret provider, and provider execution remain
on the separate execution-side composition.

The existing `/operator/review` and `/operator/arca-review` content paths remain
the original review renderers. No decision or authority logic was duplicated.

The product-simplification delta makes AI-134 explicitly an observation and
human-review shell. The repository operator projection no longer invokes
`projectOpenRouterSandboxPreflight` and cannot emit an affirmative
execution-ready state. It reports configuration evidence, review evidence,
known blockers, and `pending_operational_verification`; final execution
readiness belongs to a future operational PR.

OpenRouter now presents six separate facts:

- provider: `available_for_evaluation`;
- evidence: `available`;
- evaluation: `pending_human_review`;
- operational verification: `pending_operational_verification`;
- execution: `execution_blocked`; and
- authority: `authority_not_granted`.

Provider/model visibility and checked-in configuration do not imply authority
or execution eligibility.

## Assumptions and limitations

- The existing `OperatorReadModel` is authoritative for its current fields.
- The Operator Read Model is a read-only observation projection, not an
  execution-preflight or final-readiness authority.
- AI-131, AI-132, and AI-133 display state is the named fail-closed projection
  derived from checked-in configuration.
- Cost, recovery, and news remain unavailable where no reviewed source exists.
- The development role adapter is disabled unless the explicit local flag,
  development-local mode, loopback origin, loopback Host, and loopback socket
  address all agree.
- The Vercel production entrypoint remains anonymous/fail-closed until a
  reviewed trusted identity resolver is added.
- Preview and Production remain fail closed for execution regardless of
  provider/model visibility.
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

Focused command:

```text
pnpm exec tsx --test tests/application/application-entrypoint.test.ts tests/application/application-shell.test.ts tests/application/application-shell-browser.test.ts tests/architecture/application-shell-boundary.test.ts tests/operator/arca-review-console.test.ts tests/operator/operator-console.test.ts tests/server/api-server.test.ts
```

Final local results:

| Check                                                       | Result                               |
| ----------------------------------------------------------- | ------------------------------------ |
| Focused AI-134 UI, operator, server, and architecture tests | 86/86 passed across 8 suites         |
| Full repository suite                                       | 1,337/1,337 passed across 157 suites |
| TypeScript typecheck                                        | passed                               |
| Local production build (`build:production`)                 | passed                               |
| Scoped ESLint                                               | passed                               |
| Scoped Prettier                                             | passed                               |
| `git diff --check`                                          | passed                               |

The transitive architecture test starts at the actual `api/index.ts`, follows
static imports, export-from edges, dynamic imports, `require` calls, and
indirect re-exports, and ignores only erased TypeScript type-only edges. It
positively requires the read-only projection and denies scheduler, ARCA
execution/transport, database, credential/secret loader, provider adapter or
transport, deployment/DNS mutation, and `vlatam-global` runtime paths.

The entrypoint integration test imports the actual production entrypoint,
renders `/operator`, `/operator/review`, `/operator/arca-review`, and the
regulatory workspace with instrumented `fetch` and sensitive environment
reads, and observes zero calls to both. It also proves the classifier execution
route is absent from the production composition.

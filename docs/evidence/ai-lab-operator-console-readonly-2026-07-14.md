# AI LAB Operator Console read-only evidence — 2026-07-14

## Source snapshot and scope

- Base: refreshed `origin/main` at `4f4cb4c3c6b88b53145abfcbca19fa314e0e85af` (`feat: add operator read model (#106)`).
- Preconditions: clean `main`; Operator Read Model contract `1.0.0`, schema, pure builder, repository loader, and unchanged `operator:snapshot` command present.
- Implemented a local, server-rendered, GET-only operator console over the merged read-model loader.

## Architecture decision

Selected the existing Node HTTP server and server-rendered HTML convention. The presentation imports only the Operator Read Model contract; the handler is the sole console boundary allowed to invoke the repository loader. A SPA/framework, separate deployment, database, static snapshot, and JSON endpoint were rejected as unnecessary surface.

Routes: `/operator`, `/operator/providers`, `/operator/providers/openrouter`, `/operator/governance`, `/operator/blockers`, `/operator/actions`, `/operator/execution`, and `/operator/audit`.

## Repository OpenRouter view

Overall state is `blocked`. OpenRouter candidate `minimax/minimax-m2.7` is blocked; evidence and approval are pending; model, route, profile, adapter, and budget are disabled; the kill switch is active; the secret is not configured; no exact policy exists; consumption is not attempted; execution is false. The read model reports 23 blockers and 6 required actions.

## Accessibility and safety evidence

Automated rendering assertions cover semantic main/navigation landmarks and headings, skip navigation, visible focus CSS, explicit text status, responsive desktop/tablet/mobile rules, navigation, filter labels, no forms, and no actionable execution labels. Safety scans cover sensitive field names, environment access, provider imports, mutation routes, execution endpoints, and reverse domain dependencies.

## Validation record

- `node --import tsx --test tests/operator/operator-console.test.ts tests/operator/operator-read-model.test.ts tests/server/api-server.test.ts`: PASS, 38 tests / 3 suites.
- `npm run operator:snapshot`: PASS; unchanged command returned blocked contract `1.0.0`, 23 blockers, 6 actions, and zero execution authorizations.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- scoped ESLint and Prettier over new/modified formatted modules, tests, and documents: PASS. The legacy CLI entry point preserves its existing formatting style to keep the diff targeted.
- `npm test`: PASS, 938 tests / 140 suites.
- local server smoke test on port 4317: all 8 GET routes returned 200 and `no-store`; POST, PUT, PATCH, and DELETE returned 405.
- repository-wide `npm run lint`: unchanged baseline failure, 43 pre-existing errors in crawler and validation files; no task file errors.
- repository-wide `npm run format`: unchanged baseline failure, 194 pre-existing files; task-formatted files pass and the existing CLI style remains baseline debt.
- `git diff --check` and final safety/architecture scans: PASS.

## Limitations

- Local/internal only; authentication and public deployment are intentionally deferred.
- Filters are client-side display filters over preserved read-model order.
- No browser screenshot tooling is part of the repository, so rendering evidence is route-level HTTP and HTML assertions.
- Governance group explanations are concise views over normalized blocker metadata; no severity or priority is recalculated.

## Explicit non-actions

No provider call, inference, secret or environment read by console code, authorization issuance, authorization consumption, runtime mutation, enablement, persistence, migration, deployment, production modification, external-service configuration, branch deletion, merge, prompt upload, raw-document rendering, or model-output rendering occurred.

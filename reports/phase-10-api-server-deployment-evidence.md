# Phase 10 API Server Deployment Evidence

## Local source snapshot context

- Repository: `vlatam-ai-lab`
- Baseline commit: `821575d`
- Validation date: 2026-06-17
- Environment: local development workspace; no production services or credentials used
- Graphify: no `graphify-out/graph.json` baseline was present, so inspection used targeted local source reads

## Derived delta

- Added an unauthenticated, state-free `GET /health` response with an ISO timestamp and API version.
- Added `PORT` and `DATA_ROOT` environment configuration to the API CLI while preserving the existing CLI port override.
- Added a multi-stage Node 20 Alpine container build that includes only compiled runtime code, schemas, and approved exports.
- Added container context exclusions for credentials, internal artifacts, tests, documentation, and local build output.
- Added staging/internal platform guidance and a read-only deployment smoke test.
- Added a production TypeScript emit configuration so the container has `dist/cli/api-server.js` to execute.

## Validation evidence

| Check | Result |
| --- | --- |
| `pnpm test` | Passed: 167/167 |
| `pnpm typecheck` | Passed |
| `pnpm build` | Passed; emitted `dist/cli/api-server.js` |
| Health endpoint unit test | Passed |
| Shell syntax check | Passed |
| Local emitted-server smoke test | Passed: health, classifier artifact, 404, traversal rejection |
| `git diff --check` | Passed |
| Docker build | Not completed: local Docker daemon was unavailable |

## Assumptions and limitations

- Deployment remains staging/internal only.
- Approved exports are supplied from `data/exports/`; no database or external storage is used.
- Authentication and rate limiting remain explicitly out of scope.
- The container definition could not be executed end to end until a human starts the local Docker daemon. No attempt was made to start Docker Desktop automatically.
- No Railway, Fly.io, Vercel, Supabase, database, or AI-provider connection was made.

## Human review gate

Review the Dockerfile, artifact-copy boundary, environment configuration, and this evidence before any staging deployment. A separate explicit approval is required for external platform access or deployment.

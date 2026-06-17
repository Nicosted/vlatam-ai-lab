# Phase 12 Staging Validation Evidence

## Local source snapshot context

- Validation date: 2026-06-17
- Starting commit: `71cee5452bbafd87cf274e426550857083ea4cd4`
- Scope: local Docker validation and staging deployment documentation only
- Production or external deployment performed: no

## Derived changes

- Updated the deployment smoke test for public health access, fail-closed authentication, authenticated artifact access, valid missing-artifact handling, and encoded path-traversal rejection.
- Added a non-secret Fly.io reference configuration for the `gru` staging region.
- Expanded the API deployment guide with authentication, rate limiting, Fly.io staging reference steps, key rotation, read-only export-volume guidance, and the complete local Docker workflow.
- Updated `.dockerignore` to exclude local Fly configuration and all requested development, documentation, sensitive-data, and raw-source paths while retaining `fly.toml.example`.

The supplied bare `nonexistent` smoke-test artifact ID is invalid under the existing API contract and returned `400`. The final probe uses the valid-but-absent ID `artifact--infoleg--nonexistent` to test the intended `404` behavior without changing schemas. The traversal probe uses an encoded separator so the request reaches the API validator and tests its `400` response rather than being normalized by the HTTP path layer.

## Validation results

| Check | Result |
| --- | --- |
| `pnpm test` | Pass: 176 tests, 0 failures |
| `pnpm typecheck` | Pass |
| `pnpm build` | Pass |
| Docker image build | Pass: `vlatam-ai-lab-api:latest` |
| Local container smoke test | Pass: 5 checks |
| Container cleanup | Pass: stopped and removed |
| Secret safety review | Clean: no real keys, credentials, tokens, or production URLs added |

The repository-wide literal `sk-` scan found only pre-existing explanatory text and unrelated word fragments, not credential-shaped values. No long `key-` or `token-` values were found. A pre-existing untracked local `.env` file was listed by name only and was not read; the only tracked environment template is the pre-existing `.env.example`.

## Assumptions and limitations

- Validation used only the repository's local approved export artifacts and sample keys.
- Rate-limit state is process-local, resets on restart, and is not shared across replicas.
- Fly.io commands and volume configuration are documentation examples only and were not executed.
- No production credentials, databases, AI providers, Supabase project, Vercel project, or other external runtime service was accessed.
- Docker image construction refreshed public base-image metadata and reused cached build layers after explicit approval; it did not deploy or connect the API runtime to an external service.
- The first sandboxed test and localhost smoke-test attempts were blocked by local IPC/network permissions. The same commands passed after narrowly scoped local permission approval; these were sandbox constraints, not application failures.
- The requested five-file scope does not include `.gitignore`, and the Phase 11 baseline does not ignore `fly.toml` there. Operators must keep the local copy uncommitted; `.dockerignore` does exclude it from image builds. Adding a Git ignore rule should be handled in a separately approved scope change.

## Human review gate

Review the changed files and this evidence report before any commit or future staging action. Creating infrastructure, setting actual secrets, populating a remote volume, or deploying requires separate explicit human approval.

# AI LAB Operator Read Model evidence report — 2026-07-14

## Local source snapshot

- Refreshed `origin/main` and verified clean `main` at
  `6e2ddc25ada68a7d6c770c9bb379c379e209a206` before editing.
- Verified GitHub PR #105 was merged into `main` at that commit.
- Verified governed registry, dossier, evidence pack, proposal, runtime config,
  preflight, authorization/consumption, gateway/adapter, and harness artifacts.
- Verified repository OpenRouter remained blocked and no traffic, secret access,
  live execution, or production configuration was enabled.

## Scope and contract

Contract `1.0.0` adds a pure deterministic builder, closed repository loader,
JSON Schema, audit-safe snapshot command, architecture tests, documentation,
and this evidence report. The read model covers system/provider/component state,
readiness, evidence, proposal, preflight, authorization, consumption,
gateway/adapter, budget, kill switch, secret status, blockers, required actions,
validation metadata, and audit references.

The builder accepts evaluated inputs and never recreates readiness, proposal,
authorization, or preflight policy. It has no filesystem, environment, network,
transport, gateway, adapter, harness, secret resolver, current-time, random-ID,
or persistence dependency.

## Repository OpenRouter snapshot

- Overall status: `blocked`.
- Deterministic read-model hash:
  `668b76fa8e7136d124764fc2cfe61e88aa059437b19294edbbff18ca1176d2e7`.
- Candidate: `minimax/minimax-m2.7`.
- Readiness/evidence/proposal/preflight: `blocked` / human review `pending` /
  `blocked` / `blocked`.
- Model, route, profile, adapter, and budget: disabled.
- Kill switch: active. Secret: `not_configured`.
- Exact policy hash: absent. Authorization: no policy issued.
- Consumption: not attempted. Execution allowed: false.
- Normalized blockers: 23.
- Required human actions: 6.
- Pending approvals/reviews: 2.

Primary blocker groups are evidence and benchmark review, exact upstream routing
and pricing, privacy/ZDR/security, legal review, independent human approval, and
runtime configuration. Required actions are metadata only and execute no
workflow.

## Validation record

| Check                                         | Exact command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Result                                                                      |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Focused operator/schema/snapshot/architecture | `node --import tsx --test tests/operator/operator-read-model.test.ts tests/architecture/operator-read-model-boundary.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 11/11 tests, 2 suites passed                                                |
| Relevant governed dependencies                | `node --import tsx --test tests/operator/operator-read-model.test.ts tests/providers/openrouter-registry.test.ts tests/providers/openrouter-readiness-dossier.test.ts tests/providers/openrouter-external-evidence-pack.test.ts tests/providers/openrouter-sandbox-enablement-proposal.test.ts tests/providers/openrouter-sandbox-runtime.test.ts tests/providers/openrouter-resolution-authorization.test.ts tests/providers/openrouter-authorized-gateway.test.ts tests/handoff/authorization-store.test.ts tests/execution/multi-provider-gateway.test.ts tests/execution/gateway-governance.test.ts tests/architecture/openrouter-boundary.test.ts tests/architecture/operator-read-model-boundary.test.ts tests/handoff/handoff-schemas.test.ts` | 236/236 tests, 15 suites passed                                             |
| Typecheck                                     | `npm run typecheck`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | passed                                                                      |
| Build                                         | `npm run build`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | passed                                                                      |
| Scoped ESLint                                 | `npx eslint src/operator/operator-read-model.ts src/operator/repository-operator-read-model.ts scripts/operator-snapshot.ts tests/operator/operator-read-model.test.ts tests/architecture/operator-read-model-boundary.test.ts tests/architecture/openrouter-boundary.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | passed with zero findings                                                   |
| Scoped Prettier                               | `npx prettier --check` with all task files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | passed                                                                      |
| Full repository suite                         | `npm test`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 931/931 tests, 139 suites passed                                            |
| Repository ESLint baseline                    | `npm run lint`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 43 pre-existing errors; no task file reported                               |
| Repository Prettier baseline                  | `npm run format`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 195 pre-existing warnings; no task file reported                            |
| Diff integrity                                | `git diff --check`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | passed                                                                      |
| Repository snapshot                           | `npm run operator:snapshot`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | exited 0 with expected `blocked` status; 23 blockers and 6 required actions |

Final scans covered secret values, direct environment access, network calls,
gateway/adapter/harness or secret-resolver invocation, active component/budget
enablement, sensitive serialized fields, migrations/persistence, API/frontend
scope, and unrelated/generated files. No task regression was found.

## Assumptions and known limitations

- The repository snapshot represents one governed OpenRouter candidate; the
  contract supports lists but no additional provider is invented.
- Runtime configuration hash is a read-model audit hash; authoritative source
  bindings remain the hashes already held by the governed runtime contract.
- Authorization and consumption are repository metadata summaries. No token,
  prompt, payload, output, or source document is exposed.
- No API server, authentication design, frontend, workflow engine, write action,
  persistence, migration, or production runtime is part of this change.

## Explicit non-actions

No provider/model call, network request, secret or environment read, gateway,
adapter, transport or harness invocation, authorization issue/consume, budget
activation, kill-switch mutation, provider/model/route/profile enablement,
production or external-service change, migration, persistence change, API route,
frontend, merge, or branch deletion occurred.

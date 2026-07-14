# OpenRouter sandbox-enablement proposal evidence report — 2026-07-14

## Local source snapshot

- Verified `main`, clean worktree, and fetched `origin/main` at
  `594ca4922bec0e822976840f46880ddfae57f1dd` before editing.
- Verified GitHub PR #103 merged into `main` at that commit.
- Verified the readiness dossier and external evidence pack exist and the
  dossier's focused suite evaluates the repository candidate as `blocked`.
- Verified the OpenRouter model entry, route, and adapter are disabled, no
  OpenRouter profile was executable, fallback order was empty, and retries were
  zero before creating the feature branch.

## Exact candidate and bindings

- Model: `minimax/minimax-m2.7`.
- Intended upstream: `minimax`; exact endpoint/model revision unresolved.
- Model entry: `openrouter.minimax-m2.7.variable.v1@1.0.0`.
- Route: `openrouter.minimax-m2.7.variable` via record
  `openrouter.minimax-m2.7.variable-route.v1@1.0.0`.
- Profile: `openrouter.minimax-m2.7.normative-extraction.candidate@1.1.0`,
  proposal-only and disabled.
- Capability: `evidence.extraction.normative_claims`.
- Dossier: `openrouter.minimax-m2.7.normative-extraction.v1@1.0.0`, hash
  `dcf3431c303107908a033eef46fde189128ef0d047a43bb3c8e98d17227e7002`.
- Evidence pack:
  `openrouter.minimax-m2.7.normative-extraction.external-evidence.v1@1.0.0`,
  hash `5b5cc5337c3f8c0a47aef8f8ba8528dc245db7be3ae56ab3814a574a76cee906`.

## Implementation evidence

The change adds closed proposal and separate approval schemas, deterministic
hashing/evaluation, a blocked fixture, a pending approval fixture, and the exact
disabled profile candidate in the existing catalog. The evaluator checks
identity and hash bindings, evidence/readiness state, budget, routing, privacy,
benchmark, legal/security review, approval scope and expiry, self-approval,
disabled runtime state, manual invocation, fallback, and retries. It returns an
immutable non-authorizing result.

The metadata-only ceilings are 10 requests, 8,000 input tokens/request, 2,000
output tokens/request, USD 0.05 total, manual-only, MiniMax intended upstream,
no fallback, zero retries, explicit expiry, and required kill switch. They are
not installed in a live runtime.

## Assumptions and limitations

- `provider.order=["minimax"]` is a proposed constraint, not proof of immutable
  upstream routing.
- Public evidence collection is not human verification.
- No benchmark, provider account inspection, ZDR configuration, secret plan,
  legal conclusion, or configuration approval is fabricated.
- The proposal's `blocked` state is expected and required until the blocker
  list in the architecture document is resolved.

## Human review required

Named humans must verify evidence; accept routing; approve privacy, ZDR,
security, legal, commercial, terms, and export-control requirements; accept the
benchmark/gold cases and budget; approve secret management and first-run data;
and own the kill switch and incident response. A separate hash-bound approval
may authorize only a later sandbox configuration PR, never execution.

## Safety confirmation

No provider call, inference, authentication-material access or change,
environment read, model/route/profile/adapter enablement, gateway/adapter
execution, authorization issuance or consumption, production modification,
migration, persistence, external-service change, or approval fabrication is
part of this change.

## Validation record

| Check                                                                                          | Result                                                             |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Focused proposal suite                                                                         | 26/26 tests, 1 suite passed                                        |
| Readiness/evidence/registry/profile/resolver/authorization/gateway/adapter/schema/architecture | 248/248 tests, 12 suites passed                                    |
| Typecheck                                                                                      | passed                                                             |
| Build                                                                                          | passed                                                             |
| Scoped ESLint                                                                                  | passed with zero findings                                          |
| Scoped Prettier                                                                                | passed                                                             |
| Full repository suite                                                                          | 906/906 tests, 135 suites passed                                   |
| Repository ESLint baseline                                                                     | expected failure: 43 pre-existing errors; no task file reported    |
| Repository Prettier baseline                                                                   | expected failure: 195 pre-existing warnings; no task file reported |

The first sandboxed full-suite attempt was blocked when a nested `tsx` process
could not create its temporary IPC socket (`EPERM`). The same local suite was
rerun with the required filesystem permission and passed 906/906; no source
change was made to obtain that environment-only result. Repository-wide lint
and format are baseline-only; only regressions introduced by this branch were
corrected.

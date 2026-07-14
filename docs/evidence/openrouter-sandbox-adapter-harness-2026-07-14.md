# OpenRouter sandbox adapter harness evidence — 2026-07-14

Status: local implementation, repository-blocked, and awaiting human review.

## Source snapshot context

- repository: `vlatam-ai-lab`;
- base: freshly fetched `main` / `origin/main` at `7b3fe2440dd719721deeb77168fcb2a7fb37471c`;
- PR #104: merged at that exact commit on 2026-07-14;
- initial worktree: clean;
- implementation branch: `feat/ai-lab-openrouter-sandbox-adapter-harness`;
- Graphify baseline: absent, so documented direct local inspection was used.

## Derived delta

This branch separates final secret access from the transport adapter, adds a
closed runtime metadata schema and blocked fixture, implements deterministic
preflight outcomes and injected kill-switch/budget controls, extends conservative
OpenRouter status/usage/cost/identity handling, and adds a fixture-only operator
harness plus one original synthetic normative-claim case.

The governed flow remains:

`registry → resolution → authorization → exact policy → atomic consumption → gateway → sandbox transport adapter`

## Assumptions and limitations

- Exact upstream MiniMax routing remains unresolved and response metadata is
  required to detect substitution where observable.
- The repository has no exact-policy hash, execution approval, live budget,
  configured secret, inactive approved kill switch, or live executor wiring.
- The existing gateway owns reservation, timeout, consumption, and reconciliation;
  the harness delegates the full chain and cannot consume or call transport itself.
- Provider-reported cost is retained only when present and valid; billed cost is
  never estimated or fabricated.

## Repository outcome and non-occurrence

Repository preflight is `blocked`. Adapter, model, route, and profile are false;
budget is disabled; the kill switch is active with ownership pending; only the
secret reference name exists. No provider call, inference, secret/environment
read, enablement, production modification, migration, persistence change,
external-service or provider-account change, approval fabrication, live harness
execution, or merge occurred.

## Validation evidence

All commands ran locally. No provider or production connection was made.

| Command                                                                                                                              | Result                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Focused adapter/preflight/secret/kill-switch/harness/gateway/architecture tests                                                      | PASS — 91 tests, 7 suites                                                                                          |
| Broader OpenRouter/registry/readiness/evidence/proposal/resolver/authorization/consumption/gateway/budget/privacy/architecture tests | PASS — 339 tests, 26 suites                                                                                        |
| Preflight-only fixture command                                                                                                       | PASS — `blocked`; consumption `not_attempted`; no secret or network                                                |
| `npm run typecheck`                                                                                                                  | PASS                                                                                                               |
| `npm run build`                                                                                                                      | PASS                                                                                                               |
| Scoped ESLint                                                                                                                        | PASS — 0 errors                                                                                                    |
| Scoped Prettier                                                                                                                      | PASS                                                                                                               |
| `npm test`                                                                                                                           | PASS — 920 tests, 137 suites                                                                                       |
| `npm run lint`                                                                                                                       | BASELINE FAIL — 43 unrelated pre-existing errors                                                                   |
| `npm run format`                                                                                                                     | BASELINE FAIL — 195 unrelated pre-existing file warnings                                                           |
| `git diff --check`                                                                                                                   | PASS                                                                                                               |
| Secret/environment/network/enablement/retry/fallback/logging/migration/production scans                                              | PASS — only deliberate rejection fixtures, fixed endpoint factory, and final-boundary environment provider matched |

The focused tests use synthetic/mocked inputs only. They cover the repository
blocked outcome; approval absence/scope/hash/expiry/self-issuance; readiness,
proposal, routing, privacy/ZDR, benchmark, legal/security, identity and ceiling
failures; kill-switch and budget ordering; missing/blank secrets; one transport
call, timeout/abort, authentication/rate-limit/unavailable mappings, malformed
and schema-invalid output, missing usage, exact model/provider checks, audit
safety, immutable results, fixture-only/preflight-only behavior, and existing
atomic consumption/non-restoration semantics.

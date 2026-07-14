# AI-88 local implementation evidence — 2026-07-14

Status: local, metadata-only, non-executable, and subject to human review.

## Source snapshot context

- repository: `vlatam-ai-lab`;
- base branch: `main`;
- verified base commit: `5b212d9aa0bb92a3fd9199bac26cd75c65350db9`;
- base commit subject: `feat: add governed OpenRouter route resolution (#99)`;
- freshly fetched `origin/main`: exact match;
- PR #99: merged at the same commit on 2026-07-14;
- implementation branch: `feat/ai-lab-openrouter-resolution-authorization`;
- initial worktree: clean;
- Graphify baseline: absent, so repository inspection followed the documented
  local fallback instead of fabricating graph output.

## Scope

This change adds a narrow authorization coordinator that accepts a previously
produced OpenRouter route-resolution decision and existing governed metadata.
It independently validates the resolution, current registry bindings, grant
scope and validity, authorization-consumption inspection, execution profile,
privacy/ZDR decision, evidence readiness, budget policy/estimate, time windows,
and correlation identifiers.

Success returns one deeply immutable, metadata-only exact execution policy with
a deterministic SHA-256 policy hash. Every other outcome is `blocked` or
`invalid_request` with sorted audit-safe reasons.

The resolver now exposes its canonical hash function and includes its explicit
evaluation timestamp in the hashed result. This lets authorization verify both
integrity and staleness without rerunning resolution or relying on hidden time.

## Non-goals and preserved boundaries

This work does not:

- execute a model or call OpenRouter;
- construct HTTP or adapter requests;
- invoke the gateway or adapter;
- read environment variables, credentials, or secrets;
- enable a provider, model, route, or execution profile;
- discover providers dynamically;
- implement retry, failover, scheduling, queues, or health checks;
- reserve or reconcile budget;
- consume or persist an authorization;
- add a database, migration, production integration, or external service;
- claim provider availability, live authorization, production readiness, or
  successful model execution.

## Authorization rules

Authorization requires all of the following:

1. a structurally valid contract `1.0.0` request with explicit evaluation time,
   TTL, route intent, capability, and correlation IDs;
2. a `resolved` decision whose canonical hash, non-executable audit flags,
   contract version, and evaluation time are intact and current;
3. current route and entry records whose hashes and registry metadata exactly
   match the decision and remain enabled, approved, reviewed, and exact-route
   verified;
4. an approved, unexpired, in-scope grant bound to the exact resolution hash,
   route, model, execution profile, capability, budget scope, and correlations;
5. a successful read-only AI-80 inspection with no consumed or superseded
   record;
6. an enabled compatible live execution profile with exact provider/model and
   capability identity;
7. an existing allowed privacy decision with metadata-safe audit, verified ZDR,
   and exact profile/capability scope;
8. a valid existing budget policy with `hard_block` behavior, matching scope,
   and an estimate at or below its governed ceiling;
9. complete current evidence IDs and an unexpired readiness window.

Unknown, malformed, weakened, expired, stale, inconsistent, tampered, denied,
consumed, superseded, disabled, or out-of-scope input fails closed.

## Exact-policy contents

The successful contract contains only:

- exact route record, model registry entry, provider/model, and upstream
  provider identities;
- exact execution-profile identity and contract version;
- grant identity, mode, role, review reference, capability scope, and handoff
  policy binding;
- privacy policy/decision and ZDR evidence identifiers/hashes;
- budget policy/scope, currency, accounting scale, ceiling, and estimate;
- registry, resolution, and authorization contract versions and hashes;
- sorted evidence IDs and audit-safe reason codes;
- evaluated, issued, and bounded expiry timestamps;
- execution/audit correlations;
- deterministic policy hash.

The expiry is the earliest of the requested TTL, authorization expiry, route
expiry, model-entry expiry, and evidence validity.

## Consumption boundary

Authorization evaluation and exact-policy construction are pure. They inspect
the existing AI-80 consumption result but do not call `consume`, write a store,
or reserve budget. A later explicitly authorized handoff must perform atomic
authorization consumption immediately before gateway execution. Adapter
execution remains a still later transport-only step. Policy issuance alone
does not mark a grant consumed and does not execute anything.

## Validation evidence

All commands ran locally with no provider or production connection.

| Command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Result                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `npx tsx --test tests/providers/openrouter-resolution-authorization.test.ts tests/providers/openrouter-route-resolution.test.ts tests/architecture/openrouter-boundary.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                            | PASS — 55 tests, 3 suites                                                                        |
| `npx tsx --test tests/providers/openrouter-resolution-authorization.test.ts tests/providers/openrouter-route-resolution.test.ts tests/providers/openrouter-registry.test.ts tests/architecture/openrouter-boundary.test.ts tests/handoff/authorization-store.test.ts tests/handoff/reviewed-routing-handoff.test.ts tests/governance/catalogs.test.ts tests/governance/durable-budget-ledger.test.ts tests/privacy/privacy-enforcer.test.ts tests/privacy/zdr-evidence.test.ts tests/execution/execution-profiles.test.ts tests/providers/provider-evidence.test.ts tests/handoff/handoff-schemas.test.ts` | PASS — 216 tests, 20 suites                                                                      |
| `npm run typecheck`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | PASS                                                                                             |
| `npm run build`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | PASS                                                                                             |
| `npx eslint src/providers/openrouter-route-resolution.ts src/providers/openrouter-resolution-authorization.ts tests/providers/openrouter-resolution-authorization.test.ts tests/architecture/openrouter-boundary.test.ts`                                                                                                                                                                                                                                                                                                                                                                                  | PASS — 0 errors                                                                                  |
| `npx prettier --check src/providers/openrouter-route-resolution.ts src/providers/openrouter-resolution-authorization.ts tests/providers/openrouter-resolution-authorization.test.ts tests/architecture/openrouter-boundary.test.ts schemas/ai-openrouter-exact-execution-policy.schema.json docs/architecture/ai-openrouter-model-route-registry.md docs/architecture/ai-roadmap-dependency-map.md docs/evidence/ai-88-local-implementation-report.md`                                                                                                                                                     | PASS after final formatting                                                                      |
| `npm test`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | PASS — 806 tests, 131 suites                                                                     |
| `npm run lint`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | BASELINE FAIL — 43 errors in unrelated pre-existing crawler/validation files; no task-file error |
| `npm run format`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | BASELINE FAIL — 198 pre-existing file warnings before adding this report; task files clean       |
| `git diff --check`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | PASS                                                                                             |

The authorization suite contains 25 tests. It covers successful exact-policy
issuance; discriminated non-resolved decisions; deterministic replay; decision
hash tampering; registry hash/version inconsistency; route/model/profile and
capability scope mismatches; missing, denied, expired, consumed, and
out-of-scope grants; privacy/ZDR weakening; evidence failure; missing,
exceeded, and incompatible budget; stale resolution; bounded expiry; missing
correlations; malformed input; deep immutability; no resolver rerun; no adapter,
gateway, fetch, or provider invocation; and continued repository-backed block
while governed records remain disabled.

## Final scans

- secret/credential scan: no secret value or credential access added;
- network/provider scan: no endpoint, environment read, fetch, transport,
  gateway, or adapter invocation in the authorization module;
- enablement scan: no repository config or execution profile changed;
- generated-file scan: no generated artifact is tracked by this change; local
  ignored `dist/` is a build output;
- claim scan: no production-readiness, live-authorization, provider-availability,
  or model-execution claim added;
- scope scan: changed files are limited to the resolver timestamp/hash export,
  authorization module/schema/tests, architecture boundary, roadmap, and this
  report.

## Assumptions and limitations

- The successful path is proven only with synthetic in-memory governed records.
  Repository records remain disabled, evidence-incomplete, variably routed,
  unpriced, unbenchmarked, and without an OpenRouter execution profile.
- The coordinator accepts outputs from existing controls; it does not replace
  privacy enforcement, evidence review, budget reservation, durable consumption,
  gateway enforcement, or adapter route verification.
- A future runtime handoff would need a separately reviewed binding from this
  exact policy to AI-80 atomic consumption and the gateway. This change does not
  provide or authorize that binding.
- Capability-specific benchmark evidence, exact upstream proof, reviewed
  pricing, verified privacy/ZDR evidence, profile enablement, and explicit
  runtime approval remain unresolved prerequisites.
- Repository-wide lint and format debt is intentionally unchanged.

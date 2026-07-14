# Governed OpenRouter route resolution — evidence report (2026-07-14)

## Source snapshot context

- Repository: `Nicosted/vlatam-ai-lab` at
  `/Users/nicolasmatiasstedile/Developer/vlatam-ai-lab`; no other repository is
  in scope.
- Baseline branch: clean `main` at
  `0de66e8ea5f1598ae2912c01cdc2c4940eb2e439`, equal to fetched `origin/main`.
- PR #98: merged on 2026-07-14 at the same commit; it supplied the governed
  adapter and model/route registries consumed here.
- Feature branch: `feat/ai-lab-openrouter-governed-route-resolution`.
- Graphify: no `graphify-out/graph.json` baseline existed, so governance required
  normal local source verification; no graph was fabricated or refreshed.

## Implemented scope

- Typed request contract `1.0.0` with route ID, required capabilities,
  structured-output mode, current/reviewed evidence requirements, privacy/ZDR,
  benchmark, exact-route, exact pricing-contract identity, and explicit
  evaluation time.
- Closed result union: `resolved`, `blocked`, `no_eligible_model`, and
  `invalid_request`.
- Pure deterministic selection over active route records, explicit allowed
  model references, preferred order, and fallback only when a valid explicit
  opt-in and order exist.
- Candidate checks for enabled state, approved lifecycle, capability,
  structured output, evidence readiness, privacy/ZDR, pricing identity,
  benchmark evidence, and exact upstream-route verification.
- Deeply immutable audit-safe decisions with route/entry versions and hashes,
  stable reasons, matched requirements, selection position/source, a
  deterministic SHA-256 decision hash, `executable: false`, and
  `provider_call_performed: false`.
- Reuse of the registry loader, validator, canonicalization, and shared
  readiness blockers. Registry version/hash/reference validation remains in the
  existing loader rather than being duplicated.
- Provider-boundary enforcement and 19 focused resolver tests.

## Non-goals and unchanged controls

No model was executed. No OpenRouter adapter, HTTP request, provider transport,
retry, failover, health check, dynamic discovery, secret, environment variable,
execution profile, provider flag, production resource, persistence layer, or
migration was added or modified. The gateway and adapter do not import the
resolver. The resolver does not create the adapter-facing route-policy contract
or grant authorization.

The governed JSON seed remains `enabled: false`, `evidence_incomplete`,
privacy-unknown, unpriced, unbenchmarked, and variably routed. Its honest result
is `blocked: route_disabled`. Resolved-path tests use synthetic in-memory
registry views to prove deterministic behavior without changing or weakening
the governed registry validator.

## Decision behavior

The resolver validates the closed request shape, selects the active
unsuperseded route, rejects route-level blockers and policy weakening, then
iterates the exact preferred order. It selects the first eligible entry and
records its zero-based selection position. Ineligible entries are skipped with
stable machine-readable reasons. If all candidates fail, the outcome is
`no_eligible_model`. Fallback remains unused for the shipped contract; an
inconsistent fallback declaration blocks resolution.

The explicit `evaluated_at` clock is part of the request. Therefore identical
request bytes and registry/dependency versions produce the same output and
decision hash without mutable global state or implicit wall-clock access.

## Fail-closed scenarios covered

- malformed or version-incompatible request;
- unknown or disabled route;
- ineligible route or model lifecycle;
- unknown registry reference and invalid fallback configuration;
- policy weakening or conflict;
- no eligible candidate;
- capability or structured-output mismatch;
- missing, expired, unreviewed, unknown, or conflicting evidence;
- privacy/ZDR mismatch;
- missing or mismatched pricing contract;
- missing benchmark evidence;
- unverified exact upstream route;
- registry load/version/hash/reference integrity failure.

## Validation evidence

Results:

- targeted resolver, registry, adapter, gateway, and OpenRouter boundary: 118/118
  tests pass across 5 suites;
- relevant schema suites: 92/92 tests pass across 9 suites;
- relevant architecture suites: 39/39 tests pass across 5 suites;
- full repository: 781/781 tests pass across 130 suites;
- TypeScript typecheck: pass;
- TypeScript build: pass;
- scoped ESLint: pass;
- scoped Prettier: pass;
- `git diff --check`: pass;
- final secret/provider-enablement/external-call/generated/unrelated-change scans:
  pass.

Exact commands:

```text
./node_modules/.bin/tsx --test tests/providers/openrouter-route-resolution.test.ts tests/providers/openrouter-registry.test.ts tests/providers/openrouter-adapter.test.ts tests/providers/openrouter-gateway.test.ts tests/architecture/openrouter-boundary.test.ts
./node_modules/.bin/tsx --test tests/providers/openrouter-registry.test.ts tests/routing/routing-schemas.test.ts tests/evaluation/evaluation-schemas.test.ts tests/schemas/classifier-intelligence-artifact-schema.test.ts tests/schemas/delta-analyzer-evidence-packet-schema.test.ts tests/schemas/classifier-approved-artifact-export-schema.test.ts tests/handoff/handoff-schemas.test.ts tests/privacy/privacy-schemas.test.ts tests/capabilities/domain-binding-schemas.test.ts
./node_modules/.bin/tsx --test tests/architecture/openrouter-boundary.test.ts tests/architecture/execution-boundary.test.ts tests/architecture/ai-capabilities.test.ts tests/architecture/provider-evidence-boundary.test.ts tests/architecture/approved-artifact-boundary.test.ts
npm run typecheck
npm run build
./node_modules/.bin/eslint src/providers/openrouter-registry.ts src/providers/openrouter-route-resolution.ts src/providers/index.ts tests/providers/openrouter-route-resolution.test.ts tests/architecture/openrouter-boundary.test.ts
./node_modules/.bin/prettier --check src/providers/openrouter-registry.ts src/providers/openrouter-route-resolution.ts src/providers/index.ts tests/providers/openrouter-route-resolution.test.ts tests/architecture/openrouter-boundary.test.ts docs/architecture/ai-openrouter-model-route-registry.md docs/architecture/ai-multi-provider-gateway.md docs/architecture/ai-roadmap-dependency-map.md reports/ai-lab-openrouter-governed-route-resolution-2026-07-14.md
npm test
npm run lint
npm run format
git diff --check
```

Repository-wide baseline commands intentionally remain red on unrelated legacy
debt: `npm run lint` reports 43 errors in pre-existing validator/crawler files,
and `npm run format` reports 198 pre-existing unformatted files. No task file
appears in either baseline failure list, and no unrelated debt was repaired.

No validation command read `.env*`, contacted a provider, or used external
network transport. Remote Git/GitHub checks were separately human-approved only
for baseline verification and publication workflow.

## Assumptions and limitations

- `enabled` is honored as an eligibility gate. Because the governed v1 registry
  structurally forbids enabled records, repository-backed resolution cannot
  return `resolved` until a separately reviewed registry-contract change exists.
- The registries represent an exact pricing-contract identity but not a
  request-level token estimate or maximum-cost field. Resolution therefore
  checks pricing identity, not computed spend; existing budget enforcement stays
  in the gateway and is not duplicated.
- A metadata decision is neither authorization nor proof of live provider
  availability. No health or availability signal is consulted.
- Evidence can expire based on the explicit decision clock. There is no
  scheduler, persistence, or automatic state mutation.
- Capability-specific OpenRouter benchmark evidence, exact upstream proof,
  privacy/ZDR clearance, and rational pricing remain missing for the shipped
  route.

## Human-review routing

This report and the draft PR are review artifacts only. They make no claim of
live routing, provider availability, external execution, production readiness,
or approval to merge.

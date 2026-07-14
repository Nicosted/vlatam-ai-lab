# AI-89 local implementation evidence — 2026-07-14

Status: local, governed, execution-disabled, and subject to human review.

## Source snapshot context

- repository: `vlatam-ai-lab`;
- base branch: `main`;
- verified base commit: `100187017a7854ba943a555575eb1a6772e03393`;
- base subject: `feat: authorize OpenRouter route resolutions (#100)`;
- freshly fetched `origin/main`: exact match;
- PR #100: merged at the base commit;
- implementation branch: `feat/ai-lab-openrouter-authorized-gateway-binding`;
- initial worktree: clean;
- Graphify baseline: absent, so repository inspection used the documented local
  fallback and did not fabricate graph output.

## Scope and derived delta

This change adds the narrow binding from an immutable AI-88 exact execution
policy to the generic gateway's existing AI-80 consumption hook. It exports the
canonical exact-policy hash, adds a deterministic authorization-subdocument
hash, verifies provider/model identity inside the gateway, calls the existing
atomic store exactly once, and maps every outcome to audit-safe metadata.

The governed flow is:

`registry → resolution → authorization → exact policy → atomic consumption → gateway → disabled adapter`

No registry, resolver, authorization, consumption-store persistence, migration,
adapter transport, provider configuration, or production integration was added
or replaced.

## Failure and consumption semantics

- malformed outer contracts are `invalid_request`;
- tampered, stale, expired, weakened, unknown, or inconsistent exact policies
  are `blocked_before_consumption`;
- request/profile/privacy/budget gateway failures before the hook are also
  `blocked_before_consumption`;
- AI-80 duplicates, conflicts, invalid bindings, supersession, and store
  failures are `consumption_rejected`;
- after a successful consume, the repository adapter's disabled decision is
  `execution_not_enabled`;
- other post-consumption gateway failures are `blocked_after_consumption`;
- no executed/success result exists for this repository binding.

The successful compare-and-set is never rolled back. Restoring the grant after
an adapter block would allow replay after the execution boundary and violate the
single-use authorization contract.

## Security and architecture properties

The coordinator has no environment or secret access, endpoint, transport,
network call, retry, fallback, queue, scheduler, health check, random ID, or
mutable global routing state. It does not rerun resolution or authorization and
does not dynamically select a provider. Results exclude capability payloads,
prompts, excerpts, credentials, provider responses, and usage/billing data.

The adapter remains transport-only and depends on no registry, resolver,
authorization, or binding module. Resolution and authorization depend on no
adapter execution module. The binding points toward policy, AI-80 contracts,
and the generic gateway only; architecture tests enforce this acyclic direction.

## Validation evidence

All commands ran locally. No provider or production connection was made.

| Command                                                                                                      | Result                                                                                        |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| final focused binding, authorization-store, real gateway/disabled-adapter, and architecture command          | PASS — 104 tests, 6 suites                                                                    |
| relevant authorization, budget, privacy, evidence, audit, gateway, adapter, schema, and architecture command | PASS — 349 tests, 37 suites                                                                   |
| `npm run typecheck`                                                                                          | PASS                                                                                          |
| `npm run build`                                                                                              | PASS                                                                                          |
| scoped ESLint for task TypeScript files                                                                      | PASS — 0 errors                                                                               |
| scoped Prettier for all task files                                                                           | PASS                                                                                          |
| `npm test`                                                                                                   | PASS — 833 tests, 132 suites                                                                  |
| `npm run lint`                                                                                               | BASELINE FAIL — 43 pre-existing errors in unrelated crawler/validation files; task files pass |
| `npm run format`                                                                                             | BASELINE FAIL — 198 pre-existing file warnings; task files pass                               |
| `git diff --check`                                                                                           | PASS                                                                                          |

The binding suite contains 23 tests. It proves exact-policy integrity and
expiry checks; policy, authorization, identity, version, route, provider,
model, profile, privacy/ZDR, budget, evidence, and correlation consistency;
deterministic pre-consumption failures; zero consumption on pure validation or
gateway precheck failure; exactly one store call at the boundary; mapping of
all AI-80 rejection outcomes; at-most-one success under concurrent duplicates;
irreversible successful consumption after the disabled adapter block; immutable
audit-safe results; and no executed/success result. Gateway and adapter suites
independently prove exact provider/model mismatch blocks before consumption and
the shipped disabled adapter makes zero transport calls.

## Assumptions and limitations

- The exact-policy and successful-consumption path is exercised with synthetic
  local fixtures only.
- Repository OpenRouter records, route, candidates, and adapter remain disabled;
  no OpenRouter execution profile was added.
- The shipped route still lacks the evidence, exact upstream verification,
  benchmark, and pricing readiness required for authorization.
- The coordinator composes existing privacy and budget enforcement; it does not
  replace them or claim provider availability.
- Repository-wide lint and format debt, if present, will be recorded and not
  broaden the task scope.

## Explicit non-occurrence confirmation

No model execution, provider traffic, secret read or change, environment change,
production modification, migration, persistence addition, external-service
change, provider-account change, or merge occurred as part of the implementation
and local validation.

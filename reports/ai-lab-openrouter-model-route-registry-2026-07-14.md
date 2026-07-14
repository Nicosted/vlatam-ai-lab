# Governed OpenRouter model and route registry — evidence report (2026-07-14)

## Baseline

- Repository: `Nicosted/vlatam-ai-lab` at
  `/Users/nicolasmatiasstedile/Developer/vlatam-ai-lab`; no other repository is
  in scope.
- Remote: `https://github.com/Nicosted/vlatam-ai-lab.git`.
- Baseline: clean synchronized `main` at `6f7a0f8`
  (`feat: add governed OpenRouter adapter (#97)`), with local and `origin/main`
  ahead/behind counts `0/0`; `git merge --ff-only origin/main` reported already
  up to date before branching.
- Branch: `feat/ai-lab-openrouter-model-route-registry`.
- Scope: local contracts, registry data, validation/query/readiness code,
  schemas, fixtures, tests, architecture/roadmap documentation, and this report.
  No provider, model, route, profile, secret, flag, network request, benchmark,
  promotion, fallback, approved-artifact path, or external repository was
  enabled or modified.

## Contract versions

| Contract                              | Version                                      |
| ------------------------------------- | -------------------------------------------- |
| OpenRouter model registry             | `1.0.0`                                      |
| OpenRouter route registry             | `1.0.0`                                      |
| Registry profile compatibility        | `1.0.0`                                      |
| Registry canonicalization             | `registry-json-v1`                           |
| Authoritative OpenRouter route policy | `1.0.0` (reused, unchanged authority)        |
| OpenRouter usage mapping              | `1.0.0` (reused)                             |
| Rational pricing catalog              | `2.0.0` (reused; no OpenRouter price added)  |
| Rational price contract               | `1.0.0` (reused; no OpenRouter price added)  |
| Provider evidence catalog             | `2.0.0` (reused)                             |
| Execution profile                     | `1.1.0` compatibility only; no profile added |

## Identity model

The registry separates exact OpenRouter `model_id`, aggregator
`provider_id: openrouter`, `upstream_provider_id`, and versioned `route_id`.
An optional `model_revision` remains `null` unless externally identifiable.
`openrouter/auto` and all `openrouter/*` pseudo-models are rejected. MiniMax
Direct is not an OpenRouter registry route. The OpenRouter model
`minimax/minimax-m2.7` is represented only as an OpenRouter route with separate
upstream `minimax` identity and evidence requirements.

Route policy metadata separately references the allowed model-entry IDs,
preserves an explicit preferred order, and requires an empty fallback order.
Every reference must resolve to the exact model/route/version join. Closed
eligibility declarations require current reviewed evidence, a rational pricing
contract, privacy/ZDR clearance, exact upstream verification, benchmark
evidence, and structured output before any future approval proposal.

## Lifecycle and route verification

Allowed lifecycle: `discovered`, `evidence_incomplete`, `benchmark_pending`,
`candidate`, `approved`, `degraded`, `blocked`, `retired`. Transition rules are
closed; `retired` is terminal. `degraded`, `blocked`, and `retired` are never
selectable. Candidate and approval states require current, reviewed,
hash-matching exact evidence; approval also requires benchmark references.

Route verification is closed to `verified_exact`,
`documented_preference_only`, `response_verified_only`, `unverified`, and
`variable`. Only `verified_exact` can satisfy a future exact-pinned execution
policy. Reviewed evidence says the seeded route is `variable`; the registry does
not claim exact upstream pinning.

## Seeded entry and route

Only one exact OpenRouter model is supported by current repository evidence, so
one record is seeded rather than fabricating 2–4 popular models.

| Identity              | Value                                                          |
| --------------------- | -------------------------------------------------------------- |
| Entry                 | `openrouter.minimax-m2.7.variable.v1@1.0.0`                    |
| Model                 | `minimax/minimax-m2.7`; revision unknown                       |
| Provider              | `openrouter`                                                   |
| Upstream              | `minimax`                                                      |
| Route                 | `openrouter.minimax-m2.7.variable@1.0.0`                       |
| Route policy          | `openrouter.minimax-m2.7.variable-policy@1.0.0`                |
| Capability hypothesis | `evidence.extraction.normative_claims`                         |
| Modalities            | text input; text output; unknown multimodal capability omitted |
| Structured output     | `json_object`; schema-constrained output not claimed           |
| Context/output        | `204800` context; maximum output unknown (`null`)              |
| Lifecycle             | `evidence_incomplete`                                          |
| Route verification    | `variable`                                                     |
| Enabled/executable    | `false` / `false`                                              |

## Evidence blockers

- OpenRouter route pricing evidence `openrouter.pricing.v2` is conflicting.
- No exact rational OpenRouter pricing contract exists; pricing contract ID and
  version remain explicitly `null`.
- ZDR/privacy evidence `openrouter.zdr.v2` is reviewed but unknown.
- Operational evidence `openrouter.provider-routing.v2` proves variable default
  routing, not exact upstream pinning.
- Generic OpenRouter evidence cannot satisfy model- or upstream-specific proof.
- Maximum output, multimodal support, rate/concurrency, regions, retention,
  training use, security compliance, and exact upstream behavior remain unknown.
- Normative extraction is unevaluated and benchmark references are empty.
- Human review remains blocked; no `approved` record is shipped.

## Hashing and append-only versioning

Canonicalization sorts object keys and set-like arrays, preserves semantic
provider order, rejects unsupported JSON values, and excludes only the final hash
field. SHA-256 includes an explicit domain separator plus newline:

- entry domain: `vlatam-ai-lab:openrouter-model-route-entry:v1`;
- route domain: `vlatam-ai-lab:openrouter-route-record:v1`.

Shipped hashes:

- entry:
  `962d96be424974f40ba95ac3cb0fdc147cc59d90b687e4ee8ca05750cc0fa9cd`;
- route:
  `b70b10f24627e60ca6faf749637f01fba993ad75a404833392fb2ad3dbe7aba1`.

New versions use new immutable record IDs and explicit supersession pointers.
Historical versions remain inspectable. Missing parents, cycles,
self-supersession, version regression, duplicate versions, ambiguous active
records, and content mutation without hash change fail closed.

## Lookup and readiness behavior

The deterministic loader validates all data before returning a sorted read-only
view. The query API resolves exact entry ID/version, exact
model/route/version, exact route ID/version, and lists every historical version.
It never collapses identity or picks a “best” model. File order does not change
the loaded result.

Readiness accepts an explicit clock. Expiry produces `degraded` for a previously
benchmark/candidate/approved record and `evidence_incomplete` for an early-stage
record. It returns `executable: false` and never mutates files or schedules work.

## Invalid matrix

The fixture/test matrix rejects: enabled entry; approval without benchmark;
candidate with expired evidence; unknown lifecycle; unknown field; malformed
model ID; `openrouter/auto`; duplicate entry ID/version; ambiguous active
model/route; route/model mismatch; missing upstream identity; variable route
marked exact; generic evidence used as model evidence; missing evidence hash;
evidence hash mismatch; unsupported pricing version; pricing, privacy, and
operational evidence mismatch; unknown capability; future review date; expiry
before review; missing review;
supersession cycle; self-supersession; version regression; content mutation
without hash change; route fallback; non-denied data collection; executable
profile reference; credential-shaped field; runtime enablement flag; and raw
provider metadata.

The completion audit additionally rejects duplicate stable entry/route-record
IDs, unknown or orphaned model references, preferred models outside the allowed
set, incomplete preferred ordering, non-empty fallback ordering, and weakened
eligibility requirements. This closes the reverse-reference gap where an extra
route could previously exist without a matching model entry.

Additional structural validation rejects unsupported registry/canonicalization/
route-policy/usage versions, broken supersession chains, duplicate route
versions, unknown review/verification values, invalid timestamps, incomplete
pricing identity, and any attempt to enable execution while the adapter remains
disabled.

## Architecture boundaries

- Registry modules cannot import adapters, transport, gateway, `fetch`, or
  environment access.
- Adapter, gateway, and routing modules cannot import the registry to select a
  winner.
- Domain requests remain provider/model neutral.
- Registry data contains no endpoint, secret, credential-shaped field, runtime
  flag, or provider response metadata.
- The fixed provider endpoint remains in provider config only.
- Every route has `allow_fallbacks: false`, `data_collection: deny`, and an empty
  executable-profile list.
- OpenRouter remains absent from execution profiles and approved-artifact
  contracts.

## Validation

Validation results are recorded after the complete local check matrix:

- targeted OpenRouter registry and boundary suites: 67/67 pass across 2 suites;
- schema-focused suites: 92/92 pass across 9 suites;
- architecture suites: 39/39 pass across 5 suites;
- full repository suite: 762/762 pass across 129 suites;
- `npm run typecheck`: pass;
- `npm run build`: pass;
- targeted ESLint for every changed TypeScript file: pass;
- targeted Prettier for every changed file: pass;
- `git diff --check`: pass;
- credential-value, endpoint, provider-metadata, execution-profile, and
  approved-artifact leakage scans: pass. The sole fixed OpenRouter endpoint
  match is the existing constant in `src/providers/openrouter-config.ts`.

Exact validation commands:

```text
./node_modules/.bin/tsx --test tests/providers/openrouter-registry.test.ts tests/architecture/openrouter-boundary.test.ts
./node_modules/.bin/tsx --test tests/providers/openrouter-registry.test.ts tests/routing/routing-schemas.test.ts tests/evaluation/evaluation-schemas.test.ts tests/schemas/classifier-intelligence-artifact-schema.test.ts tests/schemas/delta-analyzer-evidence-packet-schema.test.ts tests/schemas/classifier-approved-artifact-export-schema.test.ts tests/handoff/handoff-schemas.test.ts tests/privacy/privacy-schemas.test.ts tests/capabilities/domain-binding-schemas.test.ts
./node_modules/.bin/tsx --test tests/architecture/openrouter-boundary.test.ts tests/architecture/execution-boundary.test.ts tests/architecture/ai-capabilities.test.ts
npm run typecheck
npm run build
npm test
npm run lint
npm run format
./node_modules/.bin/eslint src/providers/openrouter-registry.ts src/providers/openrouter-config.ts src/providers/index.ts tests/providers/openrouter-registry.test.ts tests/architecture/openrouter-boundary.test.ts
./node_modules/.bin/prettier --check <all task files>
git diff --check
```

Repository-wide `npm run lint` was run and records the unchanged baseline debt:
43 errors in legacy validator/crawler files outside this PR; no changed file
appears in that output. Repository-wide `npm run format` records 198 pre-existing
unformatted files outside this PR; every scoped file passes the targeted check.
Those unrelated files were not modified.

No validation command reads `.env*`, accesses a secret, calls a provider, or uses
network transport.

## Remaining risks

The registry records current evidence but does not close any evidence gap. The
route cannot be exact-pinned, priced, privacy-cleared, benchmarked, promoted, or
executed. Repository evidence can later expire, and readiness will fail closed;
there is intentionally no scheduler or automatic file mutation. A future exact
upstream claim requires reviewed route-specific evidence, not OpenRouter-wide
documentation or response-only metadata.

## Exact next PR

**Capability-specific OpenRouter benchmarking** using the existing benchmark and
gold-fixture contracts. That PR must remain separately reviewed and must not
enable live execution, provider lookup, secrets, fallback, promotion, or
approved-artifact influence.

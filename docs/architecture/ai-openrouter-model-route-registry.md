# Governed OpenRouter model and route registry

Status: local, versioned, read-only, disabled, and non-executable.

## Boundary and authority

The registry records reviewed candidate metadata; it does not discover models,
select winners, invoke adapters, call transport, read secrets, create execution
profiles, resolve budgets, decide authorization, run benchmarks, promote
lifecycle state, or influence approved artifacts. The existing
`OpenRouterRoutePolicy` contract `1.0.0` remains the only adapter-facing route
policy shape. A registry route is not an execution policy and cannot become one
without a later reviewed change.

Registry code remains in the provider layer because model, aggregator, and
upstream identities are provider concerns. Domain capability requests remain
provider-neutral. The gateway receives only explicit execution profiles and
never imports the registry. The adapter receives explicit route policies and
never selects a registry record.

## Identity model

Four identities remain distinct:

- model: exact OpenRouter `author/slug`, with an optional externally identifiable
  revision;
- provider: the aggregator identity `openrouter`;
- upstream provider: the separately evidenced inference provider identity;
- route: the versioned path joining the exact model to a route policy and its
  evidence.

`openrouter/auto` and every `openrouter/*` pseudo-model are rejected. MiniMax
Direct is not represented as an OpenRouter route. The seeded
`minimax/minimax-m2.7` record is an OpenRouter model identity with separate
upstream `minimax` metadata; it does not reuse or imply the MiniMax Direct route.

## Contracts and hashes

- model registry contract: `1.0.0`;
- route registry contract: `1.0.0`;
- profile compatibility contract: `1.0.0`;
- authoritative OpenRouter route-policy contract: `1.0.0`;
- OpenRouter usage mapping: `1.0.0`;
- canonicalization: `registry-json-v1`;
- entry hash domain: `vlatam-ai-lab:openrouter-model-route-entry:v1`;
- route hash domain: `vlatam-ai-lab:openrouter-route-record:v1`.

Canonical JSON sorts object keys and set-like arrays, preserves semantic provider
order, rejects unsupported JSON values, and hashes UTF-8 bytes with SHA-256 after
the domain separator and a newline. The hash field itself is excluded. Direct
content edits without a corresponding new version and recomputed hash fail
validation.

Every new version is a new immutable record whose explicit supersession pointer
references the prior record. Historical records remain queryable. Missing
parents, self-supersession, cycles, version regression, duplicate identity and
version, or two unsuperseded active records for one model/route fail closed.
Every route also names its allowed model-entry IDs and preserves a semantic
preferred order. Those references must resolve to the exact route/model/version
join. The fallback order is structurally empty; unknown, orphaned, duplicated,
out-of-allowlist, incomplete, or non-empty fallback references fail closed.

## Lifecycle and readiness

The closed lifecycle is `discovered`, `evidence_incomplete`,
`benchmark_pending`, `candidate`, `approved`, `degraded`, `blocked`, and
`retired`. Transition validation is explicit; `retired` is terminal.
`degraded`, `blocked`, and `retired` are never selectable. A candidate requires
current, reviewed, exact-scope, hash-matching evidence. Approval additionally
requires benchmark references and complete reviewed evidence.

Readiness is evaluated against an explicit clock and never mutates files. Expired
evidence produces `degraded` for a previously benchmark/candidate/approved record
or `evidence_incomplete` for an early record. No scheduler is implemented.
Every shipped entry and route has `enabled: false`, and readiness always returns
`executable: false`. The disabled adapter and empty OpenRouter execution-profile
set are independently revalidated.

## Route verification semantics

The closed states are:

- `verified_exact`: reviewed evidence proves the exact upstream route;
- `documented_preference_only`: documentation proves a preference control, not
  the serving endpoint;
- `response_verified_only`: exactness can only be checked after a response;
- `unverified`: no adequate route proof;
- `variable`: reviewed evidence shows variable routing.

Only `verified_exact` can satisfy a future exact-pinned policy. The seeded route
is `variable`; it has no upstream allowlist/order and cannot be executed. Request
fallback is always false and data collection is always denied.

Every route declares closed eligibility requirements for current and reviewed
evidence, a rational pricing contract, privacy/ZDR clearance, exact upstream
verification, benchmark evidence, and structured output. These requirements are
policy metadata only. The seeded route deliberately does not satisfy them and
therefore remains evidence-incomplete and disabled.

## Seed and evidence gaps

The only repository-evidenced exact OpenRouter model is
`minimax/minimax-m2.7`, so the registry contains one entry rather than inventing
additional models. Reviewed model evidence supports a 204,800-token context,
text input/output, `json_object`, and tool calling. Maximum output remains
unknown. The record remains `evidence_incomplete` because route pricing evidence
is conflicting, no rational OpenRouter pricing contract exists, ZDR/privacy is
unknown, the upstream route is variable, exact upstream proof is missing, and no
capability benchmark exists.

## Lookup behavior

The read-only query API resolves exact entry ID/version, exact
model/route/version, exact route ID/version, and lists every historical version
without collapsing identity. Loading sorts records deterministically and rejects
duplicates, ambiguity, or unresolved route-to-model references before returning
any result.

## Architecture enforcement

Repository tests prevent registry modules from importing adapters, transport,
gateway, `fetch`, or environment access; prevent adapters, the gateway, and the
policy router from importing the registry; keep endpoint literals in provider
config; keep secrets and provider response metadata out of registry data; keep
domain requests provider-neutral; keep fallbacks disabled; and prevent any
OpenRouter execution profile or approved-artifact dependency.

## Next PR

The exact next PR is **capability-specific OpenRouter benchmarking** using
reviewed local fixtures and the existing benchmark contracts. It must remain
separately approved and must not enable a provider, route, model, profile, or
live call.

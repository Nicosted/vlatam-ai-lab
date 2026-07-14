# AI-72 Multi-Provider Gateway

Status: local implementation. This layer is additive and production-isolated.

## Responsibilities and lifecycle

The caller submits a provider-neutral `CapabilityRequest` and an explicit `execution_profile_id`. The gateway validates both, checks that their capability IDs match, resolves one registered adapter, executes it once, parses its structured response, projects it into a provider-neutral draft result, validates the AI-71 `CapabilityResult`, and emits a metadata-only audit record.

```text
CapabilityRequest + explicit profile ID
  -> profile catalog
  -> multi-provider gateway
  -> exactly one adapter (replay | DeepSeek compatible | DashScope compatible)
  -> normalized structured output
  -> AI-71 CapabilityResult (pending review, downstream blocked)
```

The gateway does not infer a profile. It contains no ranking, fallback, cross-provider retry, shadow execution, profile promotion, evaluation, benchmark, or production persistence. Privacy enforcement and the durable AI-74 budget reservation are mandatory gates before adapter lookup or timeout creation.

## Execution profile catalog

`config/ai-execution-profiles.json` is validated by `schemas/ai-execution-profiles.schema.json`. It carries provider/model identifiers and normalized generation configuration, but never credentials. All profiles are honestly marked `candidate`; live profiles are disabled. Enabled `shadow` profiles are rejected.

- `normative-claims.replay.v1`: enabled deterministic local replay.
- `normative-claims.deepseek.v1`: disabled DeepSeek OpenAI-compatible candidate.
- `normative-claims.dashscope.v1`: disabled DashScope OpenAI-compatible candidate.

## Adapter boundary and execution modes

Only `src/providers/` knows provider IDs, models, request/response formats, endpoints, authentication variable names, or provider exception shapes. The registry is explicit and never dynamically loads modules. Unknown and duplicate IDs fail closed.

Replay loads repository-owned fixtures and supports success, malformed response, provider error, timeout, and blocked outcomes without network access. Live adapters set SDK retries to zero and require `AI_LAB_LIVE_PROVIDER_EXECUTION_ENABLED=true`, a provider flag (`AI_LAB_DEEPSEEK_ENABLED` or `AI_LAB_DASHSCOPE_ENABLED`), and the existing credential variable. Missing flags or credentials fail closed. No raw response escapes.

## Structured output and AI-71 compatibility

The legacy `ai-extraction-result` schema requires `provider_id` and `model_id`, while the AI-71 `CapabilityResult` validator forbids those keys anywhere in a domain result. AI-72 treats them as adapter-boundary metadata: the capability-specific parser validates strict normative-claim fields and evidence references, removes those two fields, rejects every other unexpected field, then builds the provider-neutral result. The legacy schema and workflows remain unchanged.

Outputs are always `human_review_required=true`, `approval_state=pending`, and `downstream_allowed=false`. Successful execution is a draft, not approved intelligence.

## Errors, cancellation, and audit safety

Stable AI-72 errors map to the closed AI-71 error vocabulary. Raw messages, status bodies, stack traces, credentials, and provider errors are never returned. Timeouts are bounded to 120 seconds and `AbortSignal` reaches adapters. There is no retry or fallback.

Audit records contain identifiers, lifecycle/mode, timestamps, duration, normalized usage, result/error status, and contract versions. They exclude prompts, messages, source payloads, excerpts, PII, credentials, raw responses, reviewer identity, and artifact content. Records remain in memory.

## Direct-provider migration inventory

| Current module                           | Provider              | Current status                            | AI-72 action                               | Future requirement                               |
| ---------------------------------------- | --------------------- | ----------------------------------------- | ------------------------------------------ | ------------------------------------------------ |
| `src/agents/normative-evidence-agent.ts` | DeepSeek/OpenAI SDK   | Real direct credential-dependent path     | Left unchanged; side-by-side adapter added | Migrate caller after workflow approval           |
| `scripts/run-extraction.ts`              | DeepSeek/OpenAI SDK   | Real manual CLI path                      | Left unchanged                             | Replace with explicit profile invocation         |
| `src/ai/ai-gateway.ts`                   | Cloudflare AI Gateway | Partial/gated; includes fallback          | Not reused                                 | Remove fallback before future adapter work       |
| Qwen docs and snapshots                  | DashScope/Qwen        | Fixture/spike only; runtime source absent | Replay plus disabled adapter               | Restore only through reviewed gateway invocation |
| embedding scripts and Worker binding     | Cloudflare Workers AI | Specialized embedding paths               | Out of scope; unchanged                    | Consider a separate embedding adapter            |

> **Resolution (2026-07-13, governed-execution-boundary PR):** every row in
> the inventory above was retired rather than migrated. The direct DeepSeek
> agents, the extraction CLI, the Cloudflare AI Gateway wrapper (and its
> fallback chain), the legacy Worker, and the Workers AI embedding paths were
> removed from the repository. The Qwen/DashScope spike remains
> documentation and sanitized fixtures only. Provider execution now exists
> exclusively through this gateway and its adapter layer, enforced by
> `tests/architecture/execution-boundary.test.ts`.

## Current governed boundary

AI-73 privacy/ZDR and AI-74 durable budget governance now run before the single adapter invocation. AI-75 through AI-80 supply reviewed evaluation, routing, handoff, and authorization layers without adding retry, fallback, or automatic provider substitution. Approved artifact/export semantics and `vlatam-global` are unchanged. All live profiles remain disabled.

## Governed OpenRouter transport adapter (disabled, non-executable)

`src/providers/openrouter-adapter.ts` adds a transport-only OpenRouter adapter behind the same boundary. It is disabled by default (`config/ai-openrouter-adapter.json`, contract `1.0.0`), has no execution profile, no default model, no route policy shipped, zero retries, and a fixed base URL (`https://openrouter.ai/api/v1`) defined only in the provider layer; configuration carries the identifier `openrouter-api-v1`, never a URL. The API key is referenced by environment variable name (`OPENROUTER_API_KEY`) and read only at execution time; it is never stored, logged, or validated by a live call.

Routing is exact and fail-closed: an exact pinned model per approved route policy, optional upstream allowlist and ordering sent through documented `provider` request controls (`only`, `order`, `allow_fallbacks: false`, `data_collection: "deny"`), `openrouter/auto` structurally forbidden, and mandatory post-response route verification. Reviewed evidence records OpenRouter's default routing as variable, so the adapter never claims a guaranteed upstream; unproven routes block deterministically (`ROUTE_VERIFICATION_UNAVAILABLE`, `UPSTREAM_PROVIDER_UNVERIFIED`, `PROVIDER_SUBSTITUTION_DETECTED`, `MODEL_SUBSTITUTION_DETECTED`). The transport is injected; production may use `fetch`, while every test uses a deterministic mock. The gateway now also passes the bound pricing contract identity into `ProviderExecutionContext.pricing_contract` (metadata only) so transport adapters can verify pricing compatibility without ever resolving pricing from a live response. Boundary rules are enforced by `tests/architecture/openrouter-boundary.test.ts`.

## Governed OpenRouter model/route registry (non-executable)

The versioned registry under `config/ai-openrouter-*-registry.json` is a
provider-layer, read-only candidate catalog. It does not feed the gateway or
adapter and cannot create an execution profile. The existing route-policy
contract remains authoritative. The single seeded OpenRouter route is
`evidence_incomplete`, `variable`, and disabled; it has no rational pricing
contract, no approved benchmark, and no exact upstream proof. Registry lookup is
exact-version only, append-only history is preserved, and conflicting active
versions fail closed. Route records carry explicit allowed/preferred model-entry
references, an empty fallback order, and mandatory eligibility requirements,
but remain metadata outside gateway execution. See
`docs/architecture/ai-openrouter-model-route-registry.md`.

## Governed OpenRouter route resolution (metadata only)

`src/providers/openrouter-route-resolution.ts` consumes the validated model and
route registry and deterministically evaluates the route's explicit preferred
order. It returns an immutable `resolved`, `blocked`, `no_eligible_model`, or
`invalid_request` decision containing audit-safe metadata and registry hashes.
It cannot construct an execution policy, import the adapter or gateway, read an
environment variable, or access transport. The shipped disabled route resolves
to `blocked`; resolved-path tests use synthetic in-memory views only. A resolved
metadata decision is not authorization and cannot be passed to the adapter as an
execution request.

## OpenRouter exact-policy gateway binding (execution disabled)

The OpenRouter-specific coordinator binds an AI-88 exact policy to the generic
gateway's existing `executeAuthorized` hook. The binding verifies exact policy,
authorization, route, provider, model, profile, privacy/ZDR, evidence, budget,
version, expiry, hash, and correlation metadata before calling the gateway. The
gateway additionally checks the resolved execution profile's exact provider and
model identity before privacy enforcement, reservation, or consumption.

AI-80 consumption occurs synchronously exactly once after gateway privacy and
budget checks and immediately before mapping and adapter lookup. Store rejection
stops the boundary. A successful consume is final even when the shipped adapter
then returns `LIVE_EXECUTION_DISABLED`; rollback would make a single-use grant
replayable after crossing the execution boundary. Repository configuration,
profiles, secrets, and provider connectivity remain unchanged, so this flow
cannot execute or send traffic.

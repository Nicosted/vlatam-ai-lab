# Governed OpenRouter transport adapter — evidence report (2026-07-13)

## Baseline

- Repository: `Nicosted/vlatam-ai-lab` (production-isolated sandbox; `vlatam-global` untouched).
- Branch: `feat/ai-lab-openrouter-governed-adapter` created from clean, synchronized `main` at `dd5f8e1` (`feat: add lossless rational pricing contracts (#96)`), identical to `origin/main` (fast-forward verified, worktree clean).
- Scope: one governed, transport-only, disabled-by-default OpenRouter adapter. No live execution profile, no production enablement, no model promotion, no provider call, no secret creation or retrieval.

## Adapter contract

- Module: `src/providers/openrouter-adapter.ts` (provider layer only; adapters remain injection-only — nothing registers this adapter in any runtime wiring).
- Implements the existing `ProviderAdapter` interface behind `MultiProviderGateway`; the adapter is transport-only and receives the already-approved exact execution profile from the gateway. It never derives, ranks, discovers, retries, falls back, or substitutes a model, provider, or route.
- Accepted inputs (never derived or changed): exact `profile_id`, exact profile `contract_version`, exact OpenRouter `model_id`, optional exact upstream provider allowlist, optional provider ordering, structured-output contract, timeout signal, normalized request payload, correlation metadata (`execution_id` + `request_id`), pricing contract identity (new metadata-only `ProviderExecutionContext.pricing_contract` passed by the gateway), and an expected exact route policy.
- Transport boundary is injected (`OpenRouterTransport`). `createOpenRouterFetchTransport()` is the production-facing factory (repository-approved `fetch`, `redirect: "error"`, no retry); every test in this PR uses a deterministic mock. The adapter is fully testable without network access or credentials.

## Configuration model

- Contract: `OpenRouterAdapterConfig`, version `1.0.0` (`OPENROUTER_ADAPTER_CONFIG_CONTRACT_VERSION`), closed (unknown fields rejected), non-secret only.
- Fields: contract version; provider ID `openrouter`; fixed base-URL identifier `openrouter-api-v1`; enabled flag; API-key environment variable name; transport capabilities (`chat_completions`); max request/response body bytes; connect/read/overall timeout bounds; exact retry policy (`max_retries` must be `0`); structured-output modes (`json_object`); supported usage fields; routing-policy mode (`exact_pinned` only).
- Default (`config/ai-openrouter-adapter.json`): `enabled: false`, `max_retries: 0`, no executable model, no default model, no default upstream provider, no permissive route policy, no URL anywhere (the fixed base URL `https://openrouter.ai/api/v1` exists only as a constant in `src/providers/openrouter-config.ts`).
- Route policy contract: `OpenRouterRoutePolicy`, version `1.0.0` — exact pinned model slug (`author/slug`; `openrouter/auto` and every `openrouter/*` alias structurally forbidden), optional upstream allowlist, optional ordering (must be inside the allowlist), `allow_fallbacks: false` (const), `data_collection: "deny"` (const), route-metadata requirement, structured-output mode, bound pricing contract identity. **This PR ships zero approved route policies**, so no profile is executable even if enabled flags were set.
- JSON Schemas: `schemas/ai-openrouter-adapter-config.schema.json`, `schemas/ai-openrouter-route-policy.schema.json`; both registered in `schemas/schema-registry.json` with valid and invalid fixtures.

## Secret boundary

- Referenced only by environment variable NAME (`api_key_env_var: "OPENROUTER_API_KEY"`); read only at execution time inside the provider layer, after the enabled and config gates pass.
- Never stored in config, fixtures, tests, logs, audit, errors, schemas, reports, or database records; never printed; never requested interactively; never validated through a real provider call. Config validation rejects credential-shaped keys and values (`secret_value_in_config`, `credential_shaped_field:*`); architecture tests scan for `OPENROUTER_API_KEY` reads outside `src/providers/` and credential-shaped content in config/fixtures/schemas.
- Enablement is triple-gated: config `enabled: true` AND `AI_LAB_LIVE_PROVIDER_EXECUTION_ENABLED=true` AND `AI_LAB_OPENROUTER_ENABLED=true`. The shipped default fails the first gate; the environment gates match the existing live-adapter pattern.

## Exact routing behavior

- Request body pins the exact profile model ID and sends only documented OpenRouter provider controls: `provider.allow_fallbacks: false`, `provider.data_collection: "deny"`, optional `provider.only` (exact allowlist), optional `provider.order` (exact ordering). No auto-routing, no `models` array, no transforms, no internal metadata, no correlation IDs in the payload, only `authorization` and `content-type` headers.

## Route verification limitations (honest representation)

- Reviewed evidence (`config/ai-provider-evidence.json`, AI-82) records OpenRouter default routing as **variable**. This adapter therefore does **not** claim OpenRouter can always guarantee an exact upstream provider. Upstream pinning is best-effort request control plus mandatory post-response verification.
- Deterministic blocked statuses when the route is not proven: `ROUTE_VERIFICATION_UNAVAILABLE` (metadata required but absent), `UPSTREAM_PROVIDER_UNVERIFIED` (allowlist demanded but response does not prove the upstream), `PROVIDER_SUBSTITUTION_DETECTED` (response provider outside the allowlist), `MODEL_SUBSTITUTION_DETECTED` (response model differs from the pinned model).
- Readiness policy was not weakened: OpenRouter remains `BLOCKED`/`variable_provider_routing` in `config/ai-candidate-profile-readiness.json`, untouched.

## Request validation (all failures occur before transport invocation)

Order: config valid → adapter enabled (config + both env flags) → secret present → exact profile identity supplied → exact model ID supplied → model is not `openrouter/auto` (or any `openrouter/*`) → explicit route policy exists and is valid for exactly this `profile_id` + `contract_version` → model matches the approved policy exactly → structured-output mode supported → timeout signal valid and within the configured overall bound → pricing contract identity compatible with the policy → no forbidden provider/model/route/fallback override key in the request payload → no credential-shaped field in the domain request → request body within `max_request_body_bytes`. Tests assert zero transport calls for every failure.

## Response normalization

- HTTP: `429` → `PROVIDER_RATE_LIMITED`; any other non-200 → sanitized `TRANSPORT_FAILURE` (`PROVIDER_UNAVAILABLE`), body discarded.
- Response byte limit enforced (`RESPONSE_TOO_LARGE`); malformed JSON rejected (`RESPONSE_MALFORMED`); missing `choices`/message/content rejected (`RESPONSE_SCHEMA_INVALID`); structured output must parse as a JSON object when the `json_object` contract applies (`RESPONSE_SCHEMA_INVALID`).
- Model and route verification run before content acceptance (see above).
- Domain result contains only `status`, `request_id`, `content`, `finish_reason`, `usage`, `duration_ms`: no raw headers, no provider response metadata (`id`, `system_fingerprint`, `provider`, response `model`), no payloads in errors or audits. Provider/model identifiers appear only in the gateway's controlled metadata-only audit fields.

## Usage mapping

- Versioned and deterministic: `OPENROUTER_USAGE_NORMALIZATION_VERSION = "1.0.0"` (`mapOpenRouterUsage`).
- Recognized fields only: `prompt_tokens` → input, `completion_tokens` → output, `total_tokens` → total, `prompt_tokens_details.cached_tokens` → cache-read, `completion_tokens_details.reasoning_tokens` → reasoning. Request count is normalized downstream by PR #96 (`request_count: 1`).
- Cache-write has no recognized OpenRouter usage field: declared unsupported in config and left `undefined` — never guessed, never zero-filled. Unknown fields (e.g. `speculative_tokens`) are ignored. Missing usage remains unavailable. Token counts are never derived from text length. Malformed recognized fields fail closed (`USAGE_MALFORMED` → `USAGE_INVALID`). PR #96 exact categories (input, output, cache-read, cache-write, reasoning, request) are preserved end to end.
- Pricing is **not** obtained from the live response: the gateway continues resolving reviewed rational pricing evidence before the durable budget reservation; response usage feeds only reconciliation under the already-bound pricing contract (verified against `ProviderExecutionContext.pricing_contract`).

## Timeout/abort semantics

- Caller abort before transport → `EXECUTION_ABORTED`, zero transport calls. Caller abort during transport → `EXECUTION_ABORTED`, cancellation propagated through the same `AbortSignal`. Gateway timeout → `PROVIDER_TIMEOUT` (gateway-owned cause attribution; the adapter adds no timers, so cleanup stays deterministic in the gateway's existing `finally` block). Connection/read/malformed-response failures → controlled sanitized provider errors. No timeout path retries or reroutes; transport is invoked at most once per execution, structurally (no loop exists).

## Error taxonomy

`OPENROUTER_ADAPTER_ERROR_CODES` (24 codes) mapped deterministically into existing gateway error contracts via `OpenRouterAdapterError` (no new gateway codes, no raw provider text): `ADAPTER_DISABLED`→`LIVE_EXECUTION_DISABLED`, `SECRET_MISSING`→`CREDENTIALS_UNAVAILABLE`, `ADAPTER_CONFIG_INVALID`/`AUTO_ROUTING_FORBIDDEN`/`ROUTE_POLICY_INVALID`→`LIVE_EXECUTION_DISABLED`, `MODEL_MISMATCH`/`STRUCTURED_OUTPUT_UNSUPPORTED`→`PROFILE_CAPABILITY_MISMATCH`, `PROVIDER_SUBSTITUTION_DETECTED`/`MODEL_SUBSTITUTION_DETECTED`/`ROUTE_VERIFICATION_UNAVAILABLE`/`UPSTREAM_PROVIDER_UNVERIFIED`/`RESPONSE_TOO_LARGE`/`RESPONSE_MALFORMED`/`RESPONSE_SCHEMA_INVALID`→`PROVIDER_RESPONSE_INVALID`, `REQUEST_OVERRIDE_FORBIDDEN`/`REQUEST_CREDENTIAL_SHAPED`/`REQUEST_TOO_LARGE`→`REQUEST_SCHEMA_INVALID`, `PRICING_CONTRACT_INCOMPATIBLE`→`PRICING_UNVERIFIED`, `TIMEOUT_SIGNAL_INVALID`→`INTERNAL_EXECUTION_ERROR`, `TRANSPORT_FAILURE`→`PROVIDER_UNAVAILABLE`, `TRANSPORT_TIMEOUT`→`PROVIDER_TIMEOUT`, `TRANSPORT_ABORTED`→`EXECUTION_ABORTED`, `USAGE_UNAVAILABLE`→`USAGE_UNAVAILABLE`, `USAGE_MALFORMED`→`USAGE_INVALID`.

## Gateway ordering (unchanged, re-proven with this adapter)

Request schema → capability → profile checks → **AI-73 privacy** → **AI-74 pricing resolution + durable reservation** → **AI-80 authorization consumption** → mapping → adapter lookup → single timeout + single adapter invocation. `tests/providers/openrouter-gateway.test.ts` proves with the OpenRouter adapter registered: privacy failure before adapter lookup (0 lookups, 0 transport calls); pricing failure before durable reservation (0 reserves); reservation failure before lookup; authorization failure before lookup; exactly one transport call on success; timeout vs caller abort distinct; audit metadata-only; domain output free of provider metadata; adapter output always `human_review_required: true`, `downstream_allowed: false`, `approval_state: "pending"` (no approved artifact possible).

## Test evidence

- `pnpm test`: **702/702 pass** (baseline before this PR: 656; +46 new tests across 4 new files).
- `pnpm typecheck`, `pnpm build`, `git diff --check`: clean.
- New suites: `tests/providers/openrouter-adapter.test.ts` (transport-level invariants, 24 tests), `tests/providers/openrouter-config.test.ts` (schema + contract fixtures), `tests/providers/openrouter-gateway.test.ts` (gateway ordering), `tests/architecture/openrouter-boundary.test.ts` (repository-level boundary). `tests/architecture/execution-boundary.test.ts` extended to cover the new adapter modules; all pre-existing execution-boundary, privacy, rational-pricing, durable-budget, authorization, and benchmark suites pass unchanged.
- Invalid fixtures (all fail closed): enabled-by-default, missing config version, unknown config field, mutable base URL, secret value in config, default model present, `openrouter/auto`, retry > 0, permissive fallback, missing/invalid route policy, malformed model ID, model mismatch, upstream substitution, unsupported structured output, oversized request, oversized response, malformed usage, unknown usage category, raw provider error leakage, raw headers leakage, credential-shaped payload field, provider metadata leakage, response schema mismatch.

## Security controls

- Endpoint literal `openrouter.ai` confined to `src/providers/` (existing execution-boundary scan + new boundary test; config/schemas carry only the `openrouter-api-v1` identifier and no URL).
- Secret env var read only in the provider layer; leak-marker fixtures prove provider error bodies, headers, and metadata never reach results, errors, or audits; request payload scanned for credential-shaped fields and forbidden routing overrides; no `console` logging of payloads anywhere in the adapter.
- No adapter value import outside the governed boundary; no automatic fallback identifier; retired paths remain retired.

## Readiness status and remaining blockers

- OpenRouter remains **runtime-blocked**: `candidate`, `enabled: false`, `runtime_eligibility: "blocked"` in `config/ai-candidate-profile-readiness.json` (untouched); no execution profile exists; no route policy is shipped; readiness policy unchanged.
- Remaining blockers (unchanged from AI-82/AI-83): variable provider routing (no pinned exact route), exact upstream retention/training/ZDR/processing-region evidence missing, endpoint pricing conflicts unresolved, no reviewed runtime pricing contract, normative extraction unevaluated, rate/concurrency and security-compliance evidence unknown, human evidence decision required.

## Exact next PR

**OpenRouter model and route registry**: reviewed, versioned registry of exact route policies (model, upstream allowlist/order, pricing identity, evidence references) that supplies the adapter's `route_policies` input under human review — still without enabling any profile or performing any live call.

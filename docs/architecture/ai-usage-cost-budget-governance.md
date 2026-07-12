# AI-74 — Usage, Cost, and Budget Governance

## Pre-change findings and scope

`ProviderUsage` exposed optional input, output, and total tokens. The OpenAI-compatible adapters mapped prompt/completion/total fields but exposed no cached or reasoning tokens; replay fixtures contained optional counts without an explicit usage origin. Missing values were unreliable and no repository pricing catalog, exact calculator, reservation ledger, or gateway budget gate existed.

AI-74 governs only `MultiProviderGateway`. Legacy `src/ai/ai-gateway.ts`, extraction scripts, embedding scripts, and worker rate limiting remain outside enforcement; the legacy gateway also retains its own floating-point cost/cache/fallback metadata. This is not repository-wide governance coverage.

## Contracts and arithmetic

Normalized usage records input, output, total, cached-input and reasoning tokens, request count, duration, source, status, and confidence. Unknown usage remains unavailable. Replay declares fixture origin as synthetic or sanitized-recorded. Pre-execution estimation is deterministic: UTF-8 serialized privacy-cleared request bytes are divided by four with ceiling, then the profile output bound (or the documented 2,048-token compatibility default) is added. Estimation inputs never enter audits.

`config/ai-pricing.json` is repository-owned. Monetary values are integer minor units with an integer token denominator. Calculations use `bigint` multiplication and deterministic ceiling division; estimated and actual costs remain separate. Missing, ambiguous, expired, incompatible, or insufficiently evidenced pricing fails closed. Live prices are explicitly unknown; test wildcard entries are fixtures, not provider claims.

## Policy, reservation, and concurrency

`config/ai-budget-policies.json` matches capability, explicit profile or profile class, mode, classification, and opaque environment/project/tenant/scope placeholders with deterministic priority. Missing and tied matches fail closed. Limits cover per-request and rolling requests, tokens, and cost.

The in-memory ledger atomically checks and reserves before mapping, timeout creation, or adapter invocation. It records opaque execution-correlated reservations, releases failures/aborts/timeouts, reconciles actual usage once, releases unused reservation, records overage, rejects cross-execution reconciliation, and makes duplicate reconciliation idempotent. JavaScript's synchronous reservation critical section prevents concurrent overspend; scopes use independent counters. It provides no production persistence.

## Gateway order and audits

The order is validation, pre-abort rejection, capability/profile validation, privacy enforcement, budget policy, usage estimate, pricing/cost, reservation, request mapping, timeout, exactly one adapter, actual usage/cost, reconciliation, output validation, and correlated audits. Budget blocks invoke no adapter and start no provider timeout. Privacy blocks create no reservation. No routing, ranking, retry, fallback, shadow execution, or alternate profile selection was added.

Usage and budget audits contain IDs, normalized counts, integer monetary strings, state, safe reason codes, and timestamps only. They exclude payloads, prompts, excerpts, PII, credentials, raw responses, reviewer identity, and legal text.

## Replay and live limitations

Replay is budget-governed and is not zero-cost by default; fixture usage/pricing must be labeled. Unknown fixture usage can be blocked by certainty-requiring policies. DeepSeek and DashScope remain disabled, their pricing evidence remains unknown, and AI-74 makes no live call or production activation.

AI-75 through AI-78, production billing/persistence, distributed quotas, legacy-provider migration, approved-artifact changes, and export-contract changes are deferred.

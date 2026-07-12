# AI-79 Reviewed Routing Decision Handoff

AI-79 is the human-authorized boundary from an immutable AI-78 decision to execution. It accepts only `selected` and `fallback_selected`, verifies the canonical decision hash, TTL, authorization bindings, and exact `profile_id@profile_version`, then resolves that identity through the existing catalog.

The authorization policy is `handoff.reviewed-routing@1.0.0`. It explicitly controls authorizer roles, routing-policy versions, lifecycle states, data and budget classes, maximum authorization age, decision TTL enforcement, and single-use versus reusable behavior. Authorization state is injected. The in-memory implementation performs a synchronous atomic consume before any awaited work, so exactly one competing request reaches the gateway in single-use mode.

Execution can call only `MultiProviderGateway.execute`. The handoff never calls a provider or adapter, recomputes ranking, substitutes a version, mutates the registry or routing policy, persists a default, or rewrites the AI-78 decision. Privacy enforcement and pricing, reservation, budget, usage, cost, reconciliation, and execution audit remain owned by the gateway. The preflight only verifies declared policy eligibility; the gateway remains authoritative and fails closed before adapter invocation.

Correlation IDs flow unchanged from AI-78 through authorization, request, handoff audit, gateway invocation, and result. Handoff audits contain identifiers, timestamps, status/reason metadata, and references only. Prompts, payloads, provider responses, credentials, personal data, raw benchmark results, and sensitive context are forbidden.

Failures are machine-readable rejections before execution or gateway-derived `blocked`/`failed` results after invocation. A consumed single-use authorization is not rolled back after a gateway failure.

Non-goals: benchmark execution, ranking recomputation, autonomous selection, registry promotion or mutation, production-default persistence, direct provider/adapter calls, new providers, shadow traffic, UI, scheduling, deployment/environment changes, and changes or duplication in approved-artifact, export, privacy, pricing, budget, usage, or audit semantics.

# AI-80 Durable Authorization Consumption Store

## Scope and lifecycle

AI-80 preserves the AI-79 validation and execution boundary. `ReviewedRoutingDecisionHandoff` validates the request, decision, authorization, policy binding, timestamps, and exact profile before consulting the authorization store. A valid `single_use` authorization is atomically consumed before the handoff invokes only `MultiProviderGateway.execute`. Consumption is never rolled back after gateway success, block, failure, timeout, or thrown error. Invalid or unauthorized handoffs never reach the store.

`reusable` handoffs do not apply a consumption lock and may execute repeatedly. The existing `InMemoryAuthorizationStateStore` remains process-local and non-durable. `SqliteAuthorizationStateStore` is durable across restarts and coordinates multiple local processes or connections sharing one database file.

## Durable binding and transaction

Schema version `1` uses `authorization_store_schema` as an explicit migration marker and `authorization_consumption` as a metadata-only record table. `authorization_id` is the primary key. Each transaction uses `BEGIN IMMEDIATE`, reads the existing record, compares the full binding, inserts once, and commits. SQLite uniqueness plus the write transaction prevents concurrent connections from consuming the same ID twice.

The immutable binding comprises authorization ID, handoff policy ID/version/hash, AI-78 decision hash, authorization mode, execution correlation ID, and audit correlation ID. A repeated exact binding returns `already_consumed`; the same ID with any different binding returns `binding_conflict`. Changing correlations or policy metadata cannot replay a consumed authorization.

## Failure semantics and audit

The store returns `consumed`, `already_consumed`, `binding_conflict`, `superseded`, `store_unavailable`, or `store_error`. Handoff maps these deterministically to `AUTHORIZATION_ALREADY_CONSUMED`, `AUTHORIZATION_BINDING_CONFLICT`, `AUTHORIZATION_SUPERSEDED`, `AUTHORIZATION_STORE_UNAVAILABLE`, or `AUTHORIZATION_STORE_ERROR`. Store exceptions are contained and fail closed before gateway invocation. There is no automatic fallback and no retry that could invoke the gateway twice. SQLite uses a bounded busy timeout (250 ms by default).

Metadata-only store audit events preserve the AI-79 audit correlation: `authorization_store_consume_started`, `authorization_store_consumed`, `authorization_store_duplicate`, `authorization_store_binding_conflict`, `authorization_store_unavailable`, and `authorization_store_failed`. They do not duplicate gateway execution audits.

The database never stores prompts, capability request payloads, provider output, credentials, benchmark results, personal data, or sensitive context.

## Local operations

All commands require an explicit local database path for auditable use:

```text
pnpm ai:authorization-store init <db>
pnpm ai:authorization-store validate <db>
pnpm ai:authorization-store inspect <db> <authorization-id>
pnpm ai:authorization-store list <db> [limit]
pnpm ai:authorization-store concurrency-fixture <fresh-db>
pnpm ai:authorization-store multi-instance-fixture <fresh-db>
pnpm ai:authorization-store restart-fixture <fresh-db>
pnpm ai:authorization-store binding-conflict-fixture <fresh-db>
pnpm ai:authorization-store unavailable-fixture <unavailable-db>
```

There is intentionally no reset or unconsume command. Future schema changes require an explicit versioned migration; a version mismatch or incompatible schema fails closed.

## Assumptions, limitations, and non-goals

SQLite provides local transactional durability for processes sharing a filesystem. Neither store provides global multi-region consensus. A future distributed production deployment may supply a managed transactional implementation of the same interface only after separate governance approval.

AI-80 adds no distributed consensus, Redis, Supabase, Postgres, DynamoDB, managed service, production deployment, background cleanup, authorization reset, UI, scheduler, autonomous routing, profile promotion, provider integration, adapter call, registry mutation, or approved-artifact/export change. Gateway privacy, pricing, budget, usage, and reconciliation behavior remain unchanged.

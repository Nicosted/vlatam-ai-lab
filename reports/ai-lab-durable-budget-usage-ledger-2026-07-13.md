# Durable Budget and Usage Ledger Evidence — 2026-07-13

## 1. Baseline

Work started from clean, synchronized `main` at `d10d35b` (`feat: bind review decisions to exact artifact content (#93)`). The repository was `Nicosted/vlatam-ai-lab`; no other repository was in scope. AI-74 already provided deterministic usage estimation, integer-minor-unit cost arithmetic, policy resolution, reservation/release/reconciliation semantics, and a fail-before-adapter gateway gate. AI-80 provided the compatible local SQLite durability pattern: `node:sqlite`, WAL, bounded lock waiting, explicit transactions, version and DDL markers, controlled failures, and cross-process barrier tests.

## 2. Pre-change risk

The default AI-74 ledger was a shared in-memory map. Reservations disappeared on restart, independent Node processes could reserve the same rolling budget, and an execution ID could be reused after restart. The code therefore could not prove duplicate-spend prevention outside one JavaScript process. Historical in-memory state had no durable identity or migration contract.

## 3. Data model

Store schema version `1` uses `budget_ledger_schema` and `budget_reservation`. The reservation row persists execution ID, reservation ID, request ID, capability ID, profile ID/version, budget-policy ID/version, pricing ID, pricing-evidence ID/hash, scope, currency, estimated input/output tokens, estimated and reserved cost, actual-usage state and optional actual counts/cost, reservation and reconciliation states, lifecycle timestamps, row schema version, and binding hash.

All token and monetary columns are constrained non-negative SQLite INTEGER values. TypeScript cost boundaries use `bigint`; controlled JSON inspection serializes minor-unit values as decimal strings. The store never persists prompts, responses, raw document content, credentials, keys, reviewer identity, provider error bodies, or unrestricted request payloads.

## 4. Binding hash

`SHA-256` is computed over a fixed-order JSON object with domain separator `vlatam-ai-lab:budget-reservation-binding:v1`. Bound fields are execution ID, request ID, capability ID, profile ID/version, budget-policy ID/version, pricing ID, pricing-evidence ID/hash, scope, currency, estimated input/output tokens, estimated cost, reserved cost, and schema version. Monetary values are canonical decimal strings before hashing. An existing execution with the exact hash is a duplicate; the same execution ID with any different hash is a binding conflict. Both fail closed.

## 5. State transitions

Reservation transitions are:

- `reserved -> consumed` when provider usage is reconciled or explicitly marked unavailable;
- `reserved -> released` when execution does not consume provider work;
- `reserved -> expired` when reservation TTL elapses before consumption;
- every terminal state is immutable; exact repeated reconciliation or release is idempotent.

Reconciliation transitions are:

- `pending -> reconciled` with known actual input/output tokens and actual minor-unit cost;
- `pending -> unavailable` when actual usage is unavailable, the reservation is released, or it expires;
- terminal reconciliation states do not transition.

The database enforces enums, state/timestamp correlations, immutable execution/binding identity, and allowed reservation transitions with constraints and triggers. Runtime predicates enforce exact idempotency and reject conflicting reconciliation.

## 6. Transaction model

SQLite runs in WAL mode with a 250 ms default busy timeout. Reservation uses `BEGIN IMMEDIATE`, expires stale reservations, checks execution uniqueness and binding, aggregates the exact scope/currency rolling window, enforces request/token/cost limits, inserts once, and commits. Reconciliation, release, and expiry are explicit write transactions. `execution_id` is the primary key; `reservation_id` is unique. Scope/window and expiry indexes support bounded checks.

At open, the store runs `PRAGMA integrity_check`, validates the complete expected SQLite object set and normalized DDL hash, verifies schema version/hash metadata, and checks the column contract. It never repairs or migrates an incompatible existing store.

## 7. Gateway ordering

The governed gateway order is request validation; capability/profile validation; privacy enforcement; budget-policy resolution; usage estimate; pricing resolution and exact cost; durable reservation; request mapping; adapter lookup; timeout creation; one adapter invocation; actual usage/cost checks; reconciliation or unused release; metadata-only audit. Reservation failure therefore occurs before mapping, adapter lookup/invocation, provider request construction, timeout creation, or network access.

AI-80 authorization remains a separately validated handoff boundary. When the real gateway is present, the handoff uses `executeAuthorized`: the gateway first creates the durable budget reservation, then invokes the single-use authorization consume gate, then maps or looks up the adapter. Authorization failure releases the unused reservation and invokes no adapter. Lightweight test doubles retain the prior compatibility path; no reviewed authorization or public handoff contract changes.

## 8. Failure behavior

Invalid input is rejected before opening or creating a database. Unavailable paths and lock exhaustion map to `BUDGET_STORE_UNAVAILABLE`; integrity, schema, DDL, corruption, or malformed-row failures map to `BUDGET_STORE_ERROR`; duplicate execution and binding conflict have distinct reason codes. Reconciliation mismatch maps to `BUDGET_RECONCILIATION_FAILED`. All are controlled governance errors with safe messages. There is no retry, fallback ledger, alternate provider, or provider substitution.

## 9. Persisted metadata

The persisted allowlist is exactly the data model in section 3. Pricing evidence is bound by repository evidence reference plus a SHA-256 hash of the resolved pricing entry. Scope and ISO-4217-style three-letter currency are explicit and isolated. Inspection returns metadata only and bigint-safe decimal strings.

## 10. Concurrency and restart evidence

Tests close and reopen the store after reconciliation and verify the same record. Two store instances sharing one file cannot exceed a one-request rolling limit. A separate fixture starts two independent Node processes, synchronizes them on a filesystem barrier, and proves one reservation succeeds while the other is blocked; one row exists afterward. Rolling-window, scope, currency, release, expiry, below-estimate, above-estimate, and unavailable-usage behavior are covered across durable reads.

## 11. Validation

Validation passed for the full suite (648 tests, 123 suites), typecheck, build, diff check, targeted ESLint and Prettier, AI-74 tests, AI-80 durability tests, gateway governance, cross-process SQLite tests, execution-boundary tests, SQLite integrity validation, credential and path scans, and metadata-leakage scans. Repository-wide lint was run once and recorded 43 unchanged errors in unrelated legacy crawler/validation files; targeted lint reports no errors in this change.

## 12. Limitations

This is repository-local SQLite coordination on one filesystem, not distributed consensus or a production billing system. Historical in-memory reservations are not migrated and are not assumed consumed. The database is lazily created only after a valid binding; operational deployments must protect and back up the local path separately. No cleanup scheduler is added; expiry is applied transactionally on the next reservation. Provider profiles remain disabled, and OpenRouter/MiniMax remain blocked by their existing evidence decisions.

## 13. Exact next PR

The exact next PR is **governed provider readiness and controlled execution**. It must not begin until this draft is reviewed, merged, and `main` is synchronized. It requires separate human approval and must preserve disabled-by-default profiles, exact route/evidence binding, privacy/ZDR gates, and no automatic execution.

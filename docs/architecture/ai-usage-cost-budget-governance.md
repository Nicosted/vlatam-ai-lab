# AI-74 — Usage, Cost, and Budget Governance

## Scope and execution boundary

AI-74 governs every remaining provider execution path through `MultiProviderGateway`. The pre-AI-72 direct paths were retired on 2026-07-13. Pricing, budget, and ledger changes remain internal governance contracts: they do not change reviewed/approved artifact exports, customer billing, balances, invoices, payments, or `vlatam-global`.

## Exact pricing contract

Pricing catalog `2.0.0` contains closed price contracts `1.0.0`. A monetary amount is the reduced unsigned rational `numerator / denominator`; both components are canonical base-10 strings and are parsed into `bigint`. Denominators are positive. Signs, whitespace, decimals, exponents, leading zeroes, unknown fields, and unreduced fractions fail closed. Canonical JSON and domain-separated SHA-256 bind object-order-independent evidence.

Each rate explicitly binds currency, billing unit, and one usage category. The closed categories are `input`, `output`, `cache_read`, `cache_write`, `reasoning`, and `request`; the closed units are `token`, `million_tokens`, and `request`. Only `USD` is currently accepted. Request prices require `request`; token categories require `token` or `million_tokens`. No unknown unit or currency is inferred or converted.

Category absence is different from zero. Absence means unsupported or not priced; an explicitly free category is `0/1`. Unknown provider-reported usage remains unknown, while synthetic and sanitized replay fixtures may explicitly declare zero. Input, output, cache read, cache write, reasoning, and request charges remain separate. Runtime validation recomputes the exact total from every present charge and rejects incompatible units, mixed currencies, stale evidence, noncanonical rationals, or an inconsistent total.

Current deterministic replay fixtures were migrated from unambiguous test-owned historical values. Existing provider entries without reviewed rational evidence remain under `legacy_prices` and return `pricing_contract_migration_required`; no decimal precision is inferred and there is no override bypass.

## Exact arithmetic and accounting conversion

All monetary parsing, reduction, addition, multiplication, comparison, aggregation, and usage multiplication use bounded `bigint` arithmetic. No JavaScript floating point participates in monetary calculations. Exact computed and reconciled costs remain rationals.

The ledger accounting scale is `1000000` units per USD (micro-USD). The current catalog's migrated rates are whole USD-per-million values and are exactly representable at this scale. More importantly, the reviewed MiniMax cache-write evidence of USD `3/8` per million tokens becomes exactly `375000` accounting units, and a representative OpenRouter rate of USD `3/20000000` per token conservatively becomes one accounting unit for one token. A smaller cent or milli-USD scale cannot conservatively reserve representative sub-cent per-token usage with useful granularity. Exact rational values are preserved separately even when the accounting conversion ceilings.

Reservation and actual reconciliation use `CEILING` at the same declared scale, so neither can round down. Display-only formatting may use `HALF_EVEN`; display values never affect reservation, enforcement, binding, or reconciliation. Scale and all rounding policies are versioned in the budget policy and bound into ledger operations.

## Durable reservation and reconciliation

`SqliteBudgetLedger` schema `2` retains repository-local persistence, WAL, bounded busy timeout, `BEGIN IMMEDIATE`, cross-process exclusion, integrity checks, exact column/schema validation, deterministic DDL hashing, restart behavior, rolling windows, and controlled errors. It persists metadata only.

Each reservation binds execution, request, capability, profile ID/version, policy ID/version, scope, currency, pricing ID, price-contract version and canonical hash, pricing evidence identity/hash/version/review and expiry dates, accounting scale, reservation and reconciliation rounding, estimated exact rational cost, and integer accounting units. Actual reconciliation binds the same price identity, evidence hash, scale, and rounding policy, records exact actual cost, and is idempotent. Any changed price, evidence, profile, policy, scope, currency, scale, or rounding policy fails closed.

Schema `1`, altered DDL, incompatible rows, and partial legacy stores are not migrated or repaired automatically. Validation occurs before database creation when possible, and incompatible stores fail closed without weakening PR #94 atomicity or duplicate prevention.

## Gateway order and audit safety

The order is validation, pre-abort rejection, capability/profile validation, privacy enforcement, policy resolution, usage estimation, exact pricing/cost, durable reservation, request mapping, timeout, exactly one adapter, actual usage/cost, reconciliation, output validation, and correlated audits. Store failure occurs before adapter lookup, timeout, transport, or provider work.

Audits contain identifiers, normalized usage, exact rational costs, accounting-unit strings, safe state/reason codes, and timestamps only. They exclude payloads, prompts, excerpts, personal data, credentials, raw responses, reviewer identity, and legal text. Provider-reported and estimated usage remain distinct, and actual-over-estimate is recorded exactly.

## Limitations

The ledger is local SQLite coordination, not distributed consensus. Currency conversion is unsupported. OpenRouter and MiniMax remain disabled and runtime-blocked; no adapter, execution profile, provider selection, live benchmark, or external request is introduced here.

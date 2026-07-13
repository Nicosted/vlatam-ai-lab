# Lossless Rational Pricing Contract — 2026-07-13

## Baseline and audit context

- Repository: `Nicosted/vlatam-ai-lab`
- Baseline branch: clean, synchronized `main`
- Baseline commit: `094384fd1167daafdd09a0eb7492ca8c11352fbe` (contains PR #95)
- Audited surfaces: AI-74 catalogs, schemas, usage normalization, cost calculation, policies, gateway enforcement and tests; PR #94 SQLite ledger schema, DDL/binding hashes, reservation/reconciliation, inspection and migration behavior; PR #95 MiniMax cache-write blocker; AI-77 aggregation/ranking; canonical hashing and bigint serialization; all current monetary field and rounding references.

The pre-change contract stored integer minor-unit prices over an integer token denominator. It could not encode USD 0.375 per million cache-write tokens as a price without changing or inferring decimal precision. Benchmark totals and durable ledger bindings were consequently coupled to integer minor units.

## Contract and canonical rules

Pricing catalog version is `2.0.0`; the closed price contract is `1.0.0`. An amount is:

```text
amount = numerator / denominator
```

Both fields are canonical unsigned base-10 strings parsed into `bigint`. The denominator is greater than zero, zero is only `0/1`, and every accepted fraction is reduced by GCD. Signs, decimal points, exponents, whitespace, leading `+`, unnecessary leading zeroes, malformed bigint strings, and unknown fields fail closed. Noncanonical input may be reduced only through an explicit construction helper; persisted and runtime-parsed contracts must already be canonical. Canonical key ordering and a domain-separated SHA-256 produce deterministic hashes independent of object and rate order.

Every rate explicitly binds currency, billing unit, usage category, evidence identity/hash/version, review date, and expiry. Unsupported versions fail closed. JSON Schemas are closed with `additionalProperties: false`; exact total equality and GCD reduction are enforced at runtime, not through weighted JSON Schema equality.

Supported categories are `input`, `output`, `cache_read`, `cache_write`, `reasoning`, and `request`. Supported billing units are `token`, `million_tokens`, and `request`. Only `USD` is currently supported. Unknown units and currencies are rejected, never inferred. A missing category means unsupported/not priced and is not normalized to zero; an explicitly free category is `0/1`.

## Exact arithmetic model

Parsing, GCD reduction, checked addition, multiplication, comparison, exact unit conversion, usage multiplication, aggregation, canonical serialization, hashing, and accounting conversion use bounded `bigint`. Intermediates are cross-reduced where possible and fail with a controlled governance error when the 4,096-digit resource bound would be exceeded. No `number`, `parseFloat`, decimal context, scientific notation, or lossy JSON monetary field participates in monetary arithmetic.

Each category charge stays distinct. The exact total is recomputed as the exact sum of all present category charges. Provider-reported usage and estimates remain separate; unknown usage remains unknown. Exact actual-versus-estimate delta is recorded without loss. Currency mismatch, stale/mismatched evidence, incompatible units, or inconsistent totals fail closed.

AI-77 replay results now store and aggregate exact rational costs. Ranking compares rationals deterministically and rejects missing or mixed currency data.

## Accounting-scale decision and rounding

The selected fixed ledger scale is `1000000` accounting units per USD (one micro-USD per unit).

Audit evidence:

- Current migrated test catalog rates of USD `10/1` and `20/1` per million tokens are exactly representable.
- MiniMax cache-write USD `3/8` per million tokens is exactly `375000` micro-USD.
- Representative OpenRouter sub-cent pricing USD `3/20000000` per token remains exact as a rational; one-token reservation ceilings conservatively to one micro-USD.
- Cent and milli-USD scales cannot provide useful conservative granularity for representative sub-cent per-token rates. A nano- or atto-scale is unnecessary because exact costs are retained separately and the micro-scale already guarantees conservative reservation for the audited catalog and examples.

Reservation conversion is always `CEILING`. Actual reconciliation uses the same `1000000` scale and `CEILING`, providing deterministic accounting and never rounding down. Display/report formatting may use `HALF_EVEN`, but that result cannot affect reservation, enforcement, binding, reconciliation, or benchmark ranking. Scale and rounding policies are versioned policy fields and ledger bindings.

## Durable ledger schema and migration

Ledger schema advances from `1` to `2`. PR #94 guarantees remain: SQLite persistence, WAL, bounded busy timeout, `BEGIN IMMEDIATE`, restart and rolling-window behavior, cross-process exclusion, integrity/schema/column checks, deterministic DDL hash validation, controlled failures, and metadata-only persistence.

The normalized schema-2 DDL hash is `fba938a442ed3161cd9b9288a5377aa5a3e694d52bab91f55b63a61b806350b2`.

Schema 2 adds price-contract version/hash; evidence ID/hash/version/review/expiry; accounting scale; reservation and reconciliation rounding; exact estimated and actual numerator/denominator; estimated, reserved, and actual accounting-unit strings. The binding retains execution/request/capability, profile, policy, scope, and currency. Duplicate reservation and reconciliation compare the complete binding, so changed price, evidence, profile, policy, scope, currency, scale, or rounding fails closed. Actual reconciliation validates that its declared accounting units equal the deterministic CEILING conversion and remains idempotent below or above estimate.

There is no automatic database migration. Schema 1, altered DDL, incompatible rows, or partial legacy state fail closed; validation failures do not create a new database. No outbox, two-phase commit, external database, distributed store, billing balance, invoice, or payment behavior is added.

## Legacy pricing behavior

Existing provider pricing entries without contract `1.0.0` are retained as explicit legacy evidence and return `pricing_contract_migration_required` before wildcard resolution. They cannot enable live execution. No decimal precision is inferred, and no human override bypass exists. Migration requires explicitly created, reviewed, versioned rational evidence. Only historical replay/test fixtures whose source values are unambiguous and test-owned were migrated deterministically.

## Validation evidence

Coverage includes canonical rational failures; missing evidence hash; expired/mixed evidence; unknown category/unit/currency/version/fields; absent versus free categories; lossy legacy decimal rejection; accounting-scale, rounding, and pricing-binding mismatches; resource exhaustion; exact MiniMax/OpenRouter examples; 10,000 deterministic operations without drift; canonical hashes; stable totals; conservative reservation; exact idempotent reconciliation above and below estimate; restart, rolling windows, WAL, DDL validation, cross-process duplicate prevention; gateway pre-adapter store failure; AI-77 deterministic ranking; and provider-candidate zero-call boundaries.

Validation completed locally with 656/656 full-suite tests and 87/87 focused pricing, budget, durable-ledger, gateway, AI-77, schema, execution-boundary, credential, and leakage tests. TypeScript typecheck, build, `git diff --check`, targeted ESLint, and targeted Prettier pass. Repository-wide lint was run once and retains the baseline 43 unrelated crawler/script errors; repository-wide Prettier reports 198 pre-existing unrelated files. Those debts were recorded and intentionally not modified. Credential-pattern and absolute-path scans found no result in the changed scope. No live provider, production service, credential, external approved artifact, adapter, execution profile, or provider promotion is part of this change.

## Limitations and next PR

- Currency conversion is intentionally unsupported.
- The local SQLite ledger is not distributed or multi-region consensus.
- MiniMax and OpenRouter remain disabled and runtime-blocked pending reviewed route-specific evidence and governance.
- Exact arithmetic is intentionally resource bounded.

The exact next PR is **OpenRouter governed adapter**: add one explicitly reviewed, fixed-route, disabled-by-default OpenRouter adapter and execution profile behind the existing privacy, authorization, exact-pricing, and durable-budget gates. It must not inherit or infer MiniMax Direct evidence and requires separate human approval.

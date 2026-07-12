# AI-77 benchmark runner and profile ranking

## Lifecycle and contracts

A campaign binds an immutable suite ID/version/hash, explicit profile IDs and contract versions, `evaluation.deterministic@1.0.0`, `benchmark.profile-ranking.default@1.0.0`, mode, bounded concurrency, retry policy, optional budget-policy reference, timestamp, and execution/audit correlations. Validation and hashing happen before profile work. Each profile/case/attempt receives separate IDs and audit correlations; the runner keeps no campaign state in constructor-level mutable storage.

Every selected profile runs every eligible case in stable ID/version order unless `case_subset` explicitly narrows coverage. Missing, blocked, rejected, and failed cases remain failures. Incomplete coverage fails closed. `allow_partial_reporting` permits a partial evidence artifact, but partial rankings disqualify every profile and cannot approve a winner.

## Live and replay

`live` calls only the existing `MultiProviderGateway`. That preserves AI-73 privacy enforcement before adapter lookup and AI-74 estimation, reservation, pricing, exact cost, reconciliation, usage, and budget audit contracts. Live execution requires an injected/configured gateway; absence fails safely. The benchmark layer does not access credentials or call adapters directly.

`replay` consumes stored normalized inputs and AI-75 normalized outputs. It makes zero gateway, provider, or adapter calls. Both modes pass normalized observations to the public `CapabilityEvaluator`, preserving AI-75 exact scoring, canonical hashing, aggregation, and replay behavior. AI-76 is loaded through `loadRegulatoryGoldSuite`; its cases are not copied.

## Concurrency, retries, and accounting

Concurrency is bounded by `concurrency_limit` for profile and case work. Retries are sequential per case and occur only when the final gateway error code is explicitly listed. Privacy, schema, validation, policy, profile, budget, token-limit, cost-limit, and unknown-contract failures are never retryable. Every attempt is retained, while exactly one deterministic final attempt is selected. Profile totals include only selected final attempts, preventing duplicate usage or cost accounting.

## Ranking

The initial policy requires complete coverage, no blocked/rejected schema or policy outcomes, and at least 3/4 exact aggregate quality. Eligible profiles are compared with integer cross multiplication—never floating point—in this fixed order: aggregate quality, correct abstention/escalation behavior, completion reliability, lower exact minor-unit cost, then lower total latency. Profile IDs stabilize serialization only after all configured comparisons are equal; equal profiles retain the same rank.

The ranking result records every disqualification. A winner is approved only for a complete campaign with one uniquely first-ranked eligible profile. AI-78 may consume a human-reviewed result as routing evidence, but AI-77 does not mutate the capability registry, select a production profile, change routing, or alter approved-artifact/export semantics.

## Audit, provenance, and commands

Campaign, profile, attempt, disqualification, completion/failure, and ranking lifecycle events contain identifiers, timestamps, status/reason codes, and correlations only. Prompts, messages, raw context/output, credentials, personal data, provider secrets, and unrelated execution data are forbidden. Results bind campaign, suite, and profile hashes plus evaluator/ranking versions.

Commands:

- `pnpm ai:benchmark:validate snapshots/benchmark/synthetic-campaign.json snapshots/evaluation/synthetic-suite.json`
- `pnpm ai:benchmark:synthetic snapshots/benchmark/synthetic-campaign.json snapshots/evaluation/synthetic-suite.json`
- `pnpm ai:benchmark:replay <campaign.json> <suite.json> <records.json>`
- `pnpm ai:benchmark -- render <result.json>`

Non-goals: production selection/routing, registry mutation, shadow traffic, scheduling, UI, provider integrations, rewritten AI-76 cases, and duplicated privacy, pricing, budget, evaluation, or audit systems.

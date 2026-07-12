# AI-75 Capability Evaluation Framework

AI-75 is a deterministic, provider-neutral evaluation layer over registered capability and execution-profile identities. It consumes stored normalized inputs and outcomes; it does not call the execution gateway, providers, adapters, registries, artifact stores, pricing catalogs, ledgers, or routing.

## Contracts and lifecycle

Suites, cases, evaluator/profile references, observations, dimension results, aggregate reports, and audit events use contract version `1.0.0`. A major-version mismatch is rejected. Suite and case identities are immutable versioned references; schema changes follow semantic versioning and invalid fixtures prove fail-closed behavior.

## Normalization and replay

Raw execution outcomes are transient inputs. `normalizeObservedOutcome` produces the separate persisted observation shape and imports usage only through AI-74's public `normalizeUsage`/`NormalizedUsage` contract. Canonical JSON recursively sorts object keys, rejects secret/prompt-shaped keys and non-finite numbers, and produces SHA-256 input/output hashes. `evaluateReplay` accepts only normalized stored inputs/outcomes and has no gateway or adapter dependency.

## Deterministic scoring and aggregation

Every dimension has a positive integer `weight_units`. Results persist integer `earned_units` and `possible_units`; reports persist the exact fraction `{ numerator, denominator }`. No division or floating-point score is persisted or used for policy. Cases and dimensions are sorted by versioned identity before aggregation, so input ordering cannot change a report's score or case results.

## Audit and isolation

Started, completed, failed, and rejected events contain allowlisted correlation metadata only. Reports bind suite/case versions, capability/profile versions, evaluator versions, execution IDs, audit correlation IDs, normalized hashes, and timestamps. Evaluator instances retain no mutable evaluation state; each invocation builds local maps and arrays, preserving concurrent isolation.

## Extension points and non-goals

AI-76 may add reviewed synthetic/gold-case catalogs, AI-77 may add campaign orchestration, and AI-78 may consume separately reviewed evaluation evidence for routing. None is implemented here. AI-75 performs no regulatory gold cases, live benchmarks, rankings, profile selection, routing, shadow traffic, UI, provider integration, artifact/export mutation, pricing, reservation, or budget-policy changes.

# ADR-006: Gold Decision Evaluation Set

- Status: accepted for contracts, evaluator and seed corpus; seed dataset pending human review
- Date: 2026-09-26

## Context

AI-140 defined a governed typed decision contract but no notion of a
correct answer. Future typed decision candidates (AI-142 onward) need a
benchmark whose truth they cannot influence. Without one, candidates
could be scored on their own examples, on favourable subsets, under
shifting scoring rules, or with self-reported confidence mistaken for
correctness.

## Decision

1. Introduce closed, versioned, provider-neutral contracts `1.0.0` for the
   Gold Decision Case, Gold Decision Set manifest, case evaluation and
   evaluation report in `src/decision-evaluation/`, composing the exact
   AI-140 request and reusing AI-140 `registry-json-v1` canonicalization
   with new hash domains (`vlatam-ai-lab:gold-decision-*:v1`).
2. Candidates may produce answers. Evaluators may measure them. Candidates
   may not define their own truth. A benchmark is invalid if the candidate
   can influence the answer key, case selection, scoring policy or
   evaluation split.
3. Every label cites a declared labeling rule applied to named bounded
   facts; no label is derived from candidate output.
4. Abstention is scored by an explicit per-case policy
   (`required | allowed | not_allowed`), never automatically as failure.
5. Scoring semantics are frozen under `gold-decision-scoring-v1`; any
   change requires a new policy identifier.
6. Splits (`development | validation | test`) are explicit, hash-bound and,
   once a set is approved, immutable for test cases; the test split may
   never be used for training.
7. Reports require every case in a split scope, use exact rationals, keep
   Brier evidence separate from correctness, claim no calibration, grant
   no authority and name no winner.
8. A set is evaluation authority only when `approved` with an explicit
   human approval reference; the seed set ships `in_review`.

## Consequences

AI-142 through AI-148 can register, sandbox and compare candidates against
reviewed truth without changing it. The AI-140 architecture boundary now
admits exactly one consumer, the pure and unwired evaluation layer. AI-120
contracts are unchanged; tournament integration is a documented additive
extension point (AI-147). ECE, rank-correlation metrics and partial
ranking are deferred.

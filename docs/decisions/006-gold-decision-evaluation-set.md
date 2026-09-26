# ADR-006: Gold Decision Evaluation Set

- Status: accepted for contracts, evaluator and seed corpus; seed dataset pending human review (revised after independent review: no self-approval, synthetic-conformance classification, public test visibility)
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
6. Splits (`development | validation | test`) are explicit and hash-bound;
   succession can freeze the previous test split, and the test split may
   never be used for training. Every case is public: the test split is a
   public reproducibility split, not a blind holdout, and its results are
   never proof of unseen generalization.
7. Reports require every case in a split scope, use exact rationals, keep
   Brier evidence separate from correctness, claim no calibration, grant
   no authority and name no winner.
8. A Gold Decision Set cannot approve itself. `1.0.0` admits only `draft`
   and `in_review`; `approved` and any approval field are rejected.
   Publication requires binding the exact dataset hash to the existing
   governed human-review authority in a later, separately reviewed change.
   The seed set ships `in_review` at `1.0.0`, which may evolve while
   unmerged and in review.
9. Evaluation hierarchy: level 0 synthetic conformance (AI-141), level 1
   reviewed domain benchmark (future), level 2 blind/sealed holdout
   (future). `1.0.0` admits only `evaluation_purpose:
"synthetic_conformance"` with `domain_representative: false` and
   `promotion_eligible: false`, propagated into every report. Passing
   AI-141 proves conformance to bounded synthetic decision workloads; it
   does not prove competence on real trade documents, regulations or
   customer operations.

## Consequences

AI-142 through AI-148 can register, sandbox and compare candidates against
evaluation truth they cannot change; that truth stays provisional until a
future governed publication binds the exact dataset hash. The AI-140 architecture boundary now
admits exactly one consumer, the pure and unwired evaluation layer. AI-120
contracts are unchanged; tournament integration is a documented additive
extension point (AI-147). ECE, rank-correlation metrics and partial
ranking are deferred, as are reviewed domain benchmarks, sealed holdouts
and the governed publication binding.

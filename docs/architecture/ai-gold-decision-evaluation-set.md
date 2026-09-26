# AI-141 Gold Decision Evaluation Set

Status: contracts, deterministic evaluator and seed corpus. Contract version
`1.0.0`, scoring policy `gold-decision-scoring-v1`, split policy
`gold-decision-split-v1`. Seed dataset `ai-lab-gold-decisions@1.0.0`
(68 cases), review state **`in_review`**, evaluation purpose
**`synthetic_conformance`**, public cases (**no blind holdout**). Branch
baseline: `main` at
`b871294` (AI-140, #139). No model, provider, runtime, candidate registry,
sandbox, benchmark runner, scheduler, promotion or traffic is added or
activated by AI-141.

> **Candidates may produce answers.
> Evaluators may measure them.
> Candidates may not define their own truth.**

> **A benchmark is invalid if the candidate can influence the answer key,
> case selection, scoring policy or evaluation split.**

> **Passing AI-141 proves conformance to bounded synthetic decision
> workloads. It does not prove competence on real trade documents,
> regulations or customer operations.**

> **Public test is not blind holdout.**

## 0. Evaluation hierarchy

| Level | Benchmark                       | Status                   | What a result can mean                                                      |
| ----- | ------------------------------- | ------------------------ | --------------------------------------------------------------------------- |
| 0     | Synthetic conformance benchmark | **AI-141 (this change)** | The candidate conforms to bounded synthetic typed-decision workloads.       |
| 1     | Reviewed domain benchmark       | Future, not scheduled    | Quality on reviewed, representative trade-domain decisions.                 |
| 2     | Blind / sealed holdout          | Future, not scheduled    | Generalization to cases the candidate and its builders could not have seen. |

AI-141 implements level 0 only. Every `1.0.0` manifest and every report
states this explicitly and hash-bound:

- `evaluation_purpose: "synthetic_conformance"` — the only admitted value;
- `domain_representative: false` — never evidence of real-world
  trade-domain quality;
- `promotion_eligible: false` — performance on this set can never, by
  itself, authorize candidate promotion;
- `split_policy.case_visibility: "public"` and
  `split_policy.blind_holdout: false` — see §4.

Levels 1 and 2 need their own reviewed contract versions (new purpose
values, sealed storage, access control); none is implemented or implied
here.

## 1. What a Gold Decision is

A Gold Decision is reviewed evaluation evidence for one bounded typed
decision (AI-140). It is not model output, and it is never produced,
edited or selected by the system it evaluates.

```text
Gold Decision Set (manifest, exact case hashes, split policy, review state)
        ↓
immutable Gold Decision Cases (AI-140 request + answer key + abstention policy)
        ↓
deterministic evaluator  ← existing TypedDecisionResult (synthetic fixture)
        ↓
case evaluation (outcome, error codes, score error, probability evidence)
        ↓
aggregate metrics (exact rationals, per slice)
        ↓
reviewable, hash-bound evaluation report (evidence only)
```

AI-141 defines what "correct" means for a bounded decision task. It does
not decide which model to use, and it executes nothing.

## 2. Contracts

Implemented in `src/decision-evaluation/` and the closed JSON Schemas
(registered in `schemas/schema-registry.json`):

| Contract                          | Schema                                                   | Hash domain                                        |
| --------------------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| `gold_decision_case`              | `schemas/ai-gold-decision-case.schema.json`              | `vlatam-ai-lab:gold-decision-case:v1`              |
| `gold_decision_set`               | `schemas/ai-gold-decision-set.schema.json`               | `vlatam-ai-lab:gold-decision-set:v1`               |
| `gold_decision_case_evaluation`   | `schemas/ai-gold-decision-case-evaluation.schema.json`   | `vlatam-ai-lab:gold-decision-evaluation:v1`        |
| `gold_decision_evaluation_report` | `schemas/ai-gold-decision-evaluation-report.schema.json` | `vlatam-ai-lab:gold-decision-evaluation-report:v1` |

### Gold Decision Case

```text
GoldDecisionCase
├── contract, schema_version (1.x), case_id
├── dataset_id, dataset_version, split
├── request              ← an exact AI-140 TypedDecisionRequest (composition, no copy)
├── expected             ← choice | boolean | score (exact | acceptable_range) | ranking | abstention
├── abstention_policy    ← required | allowed | not_allowed
├── permutation_group_id ← null or a group sharing semantic truth
├── provenance           ← synthetic_construction, repository_fixture,
│                          labeling_rule_id, evidence_basis[fact ids], candidate_generated: false
├── language             ← es-AR | en | pt-BR | mixed
├── jurisdiction         ← AR | BR | UY | PY | CL | NONE
├── tags                 ← strictly ascending
└── case_hash
```

The request is the AI-140 contract itself, validated by
`validateTypedDecisionRequest`; `decision_type` and `capability_id` are
read from it rather than duplicated. Capabilities stay in the AI-140
non-catalog namespace `synthetic.decision.*`.

Expected-answer semantics (no fuzzy scoring, no thresholds):

- **choice** — `expected_candidate_id`, a candidate declared in the
  request's output domain. Seed cases are unambiguous;
  `acceptable_candidate_ids` is deliberately not supported.
- **boolean** — `expected_value`. No probability threshold is encoded.
- **score** — `match: "exact"` with `expected_value`, or
  `match: "acceptable_range"` with `acceptable_minimum < acceptable_maximum`,
  both inside the declared scale and never spanning the whole scale. The
  band is declared by the labeling rule, never inferred.
- **ranking** — `expected_order`, an exact permutation of the declared
  candidates. Partial/top-k ranking is deferred.
- **abstention** — `{ "kind": "abstention" }`, admitted if and only if
  `abstention_policy` is `required`.

### Provenance

Every label is justified by a declared, reviewed labeling rule
(`provenance.labeling_rule_id`, defined once in the set manifest) applied
to named bounded facts (`provenance.evidence_basis`, each a `fact_id` of
the request). Every seed rule is also stated in the case's question text,
so a candidate is shown everything needed to answer. No reviewer
identity, chain-of-thought or "the model said so" is stored; reviewer
identity fields are rejected by the AI-71 forbidden-field guard.

The seed test suite re-derives **every** answer key from its facts with an
independent oracle per rule (`tests/decision-evaluation/gold-decision-seed-dataset.test.ts`).
The oracles are test code, never shipped in `src/`, and never a candidate.

### Gold Decision Set manifest

```text
GoldDecisionSet
├── dataset_id, dataset_version, schema_version
├── scoring_policy        ← gold-decision-scoring-v1
├── evaluation_purpose    ← synthetic_conformance (only value)
├── domain_representative ← false (constant)
├── promotion_eligible    ← false (constant)
├── split_policy          ← gold-decision-split-v1 (constant fields incl.
│                           case_visibility: public, blind_holdout: false; see §4)
├── review                ← state draft | in_review, human_review_required: true
│                           (no approval field; `approved` is rejected)
├── created_from          ← synthetic_construction, repository_fixture, no customer/production data,
│                           candidate_generated_labels: false
├── supersedes            ← null or { dataset_version, dataset_hash } of the previous version
├── labeling_rules[]      ← strictly ascending rule_id
├── cases[]               ← strictly ascending (case_id, case_hash, split)
├── split / decision_type / language / jurisdiction / capability distributions
└── dataset_hash
```

`validateGoldDecisionSet(manifest, cases)` requires exactly one supplied
case per entry with the same hash, split and dataset identity; no extra
cases; unique request IDs; known labeling rules matching each case's
capability; genuine permutation groups; and declared distributions equal
to recomputed counts. Nothing is ever re-sorted, de-duplicated or
repaired.

## 3. Why evaluation truth must be independent

A candidate that can write, edit, select or re-split its own cases, or
choose the scoring policy, can make any score it likes. AI-141 closes each
path:

| Influence path     | Control                                                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Answer key         | Case content is hash-bound (`case_hash`) and the manifest binds every hash (`dataset_hash`). Labels cite a declared rule, never a candidate output. |
| Case selection     | A report requires one evaluation for **every** case in its split scope; missing, duplicated or out-of-scope evaluations fail closed.                |
| Scoring policy     | The policy ID is part of the manifest hash and every evaluation record; the aggregator rejects records under another policy.                        |
| Evaluation split   | Split is part of the case hash and manifest hash; a frozen predecessor's cases may not change split (§4).                                           |
| Result-side truth  | The evaluator reads truth only from the validated case; a result carrying extra fields (e.g. its own `expected`) is an invalid result.              |
| Evaluator identity | The evaluator is repository code with no candidate hook, plug-in or callback.                                                                       |

## 4. Versioning, splits and leakage

- **Versioning.** Changing any case changes its `case_hash`, which changes
  the manifest and therefore the `dataset_hash`. There is no mutable
  "latest": a change is a new `dataset_version` whose `supersedes` binds
  the exact previous version and hash.
- **No self-approval.** `1.0.0` admits only the review states `draft` and
  `in_review`. `approved` is rejected, and the review block is closed with
  no approval field, so a JSON document cannot grant itself evaluation
  authority by inserting a syntactically valid reference. No Gold Decision
  Set is published evaluation authority in AI-141, and reports carry
  `dataset_review_state` so every metric is visibly provisional.
- **Future publication (extension point).** Publication/approval requires
  binding the exact `dataset_hash` to the existing governed human-review
  authority in a later, separately reviewed change — for example the
  domain-separated review binding already required for regulated
  artifacts. That change must add a new contract version and verify the
  binding against a repository-owned human-review record; it must not be a
  shape-only reference. AI-141 invents no new human-review system.
- **Version while in review.** The seed set is an unmerged, in-review
  artifact, so it keeps `dataset_version: 1.0.0` while it evolves during
  review; its `dataset_hash` changes with every change. A successor
  version (`supersedes`) is needed only once a version has been bound by
  the governed review authority.
- **Splits.** `development`, `validation` and `test`, assigned explicitly
  per case. The split policy fixes `test_split_training_use: "forbidden"`
  (future AI-146 training work may not read the test split),
  `candidate_case_selection: "forbidden"` and
  `permutation_groups_share_split: true` (a semantic twin in another split
  would leak the answer).
- **Public test is not blind holdout.** Every case, including the `test`
  split, is committed to the repository (`case_visibility: "public"`,
  `blind_holdout: false`). The test split is a public reproducibility
  split: immutable once frozen and forbidden for training, but not unseen.
  Its results must never be described as proof of unseen generalization.
  A sealed holdout is future work (level 2). A future split vocabulary may
  distinguish `development`, `validation`, `public_test` and
  `sealed_holdout`; the current splits are intentionally not renamed.
- **Succession and test immutability.**
  `validateGoldDecisionSetSuccession(previous, next, { test_split_frozen })`
  always requires the same dataset, a strictly increasing version and an
  exact `supersedes` binding. The caller must state `test_split_frozen`
  explicitly (no default). With `true`, every previous test case must stay
  in `next` with the identical hash and no previous case may change split.
  The option only adds restrictions and grants nothing; the future
  governed publication binding must set it for every successor of a
  published version. New cases may be added; nothing is rewritten in
  place.

## 5. Scoring (`gold-decision-scoring-v1`)

`evaluateGoldDecisionCase(case, result)` is pure: no model, provider,
network, filesystem, clock, environment or randomness; it never chooses
another case, mutates inputs or infers missing truth. An invalid Gold Case
is refused (`ok: false`); any defect in the result is recorded.

1. The result must pass AI-140 `validateTypedDecisionResultForRequest`
   against the case's exact request (hash binding, candidate membership,
   score bounds, ranking permutation, human-review binding, evidence
   lineage). Otherwise → `invalid_result` with
   `result_contract_invalid` or `result_request_binding_invalid` and the
   sorted AI-140 issue codes. A permuted twin's result does not validate
   against the other presentation.
2. `blocked` / `failed` → `no_decision` (`result_blocked` / `result_failed`).
3. `abstained` is scored only by case policy — this is how abstention is
   scored, never automatically as a failure:

   | Policy        | Abstained              | Succeeded                                                     |
   | ------------- | ---------------------- | ------------------------------------------------------------- |
   | `required`    | `correct_abstention`   | `incorrect_decision` (`decision_on_abstention_required_case`) |
   | `allowed`     | `permitted_abstention` | compared with the answer key                                  |
   | `not_allowed` | `incorrect_abstention` | compared with the answer key                                  |

4. Succeeded decisions compare exactly: candidate identity, boolean value,
   score within the exact value or declared band (`absolute_error` is the
   distance to the nearest acceptable value), exact ranking order.

Outcomes use stable machine codes: `correct_decision`,
`incorrect_decision`, `correct_abstention`, `permitted_abstention`,
`incorrect_abstention`, `no_decision`, `invalid_result`, with derived
`correctness` (`correct | incorrect | not_applicable`) and
`abstention_outcome` (`not_abstained | correct | permitted | incorrect`).
`validateGoldDecisionCaseEvaluation` rejects any inconsistent combination.

### Why confidence is not correctness

Confidence and probabilities never change an outcome. A result that is
wrong at confidence `1_000_000` is `incorrect_decision`; a result that is
right at confidence `0` is `correct_decision` (tested). Probabilities are
recorded separately as Brier evidence, never as a calibration claim; every
report has `calibration_claimed: false`.

## 6. Metrics

`aggregateGoldDecisionEvaluations(manifest, cases, evaluations, scope)`
validates the whole set, every evaluation record and its binding to the
exact case (hash, split, type, capability, language, jurisdiction,
abstention policy), then reports overall metrics and slices by
`capability_id`, `decision_type`, `jurisdiction`, `language` and `split`,
ordered by key and independent of input order. All ratios are exact,
lowest-terms rationals as unsigned decimal strings (the repository
`Rational` shape); a zero denominator is `null`, never `0` or `NaN`.

| Metric                    | Definition                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `accuracy`                | (correct decisions + correct abstentions) / total cases — invalid results count against it     |
| `coverage`                | decisions / total cases                                                                        |
| `accuracy_at_coverage`    | correct decisions / decisions (selective accuracy)                                             |
| `abstention_rate`         | abstentions / total cases                                                                      |
| `brier_choice_multiclass` | Σₖ(pₖ − yₖ)² over succeeded choice decisions with a complete distribution, / (eligible × 10¹²) |
| `brier_boolean_binary`    | (p − y)² over succeeded boolean decisions with `probability_true_micros`, / (eligible × 10¹²)  |
| `score_error_by_scale`    | exact/in-range count and mean absolute error per declared `scale_id` — scales are never mixed  |

Brier rules are explicit: abstentions, blocks, failures, invalid results
and decisions on abstention-required cases are excluded, and decisions
without probability evidence are counted in
`decisions_without_probability`. Squared errors are exact integers in
micros² (`probability_micros` is AI-140's integer scale).

An empty split scope fails closed (`empty_evaluation_scope`) rather than
reporting vacuous metrics. Reports are `authority: "evidence_only"`,
`universal_winner: false`; nothing ranks, promotes or routes.

### Deliberately deferred

- **ECE / reliability diagrams** — require an explicit, versioned binning
  policy and far more cases per bin than a seed set; deferred to
  AI-147/AI-148.
- **Kendall/Spearman/NDCG, partial or top-k ranking** — no reviewed
  deterministic implementation exists in the repository; exact ranking
  correctness only.
- **Normalized score error across scales** — only per-scale error.
- **`acceptable_candidate_ids` for choice** — no case needs it; seed
  cases are unambiguous.
- **Permutation-invariance measurement of real candidates** — AI-141 ships
  the paired gold cases (and AI-140's `compareChoicePermutationInvariance`
  exists); measuring a candidate needs AI-142/AI-143.

## 7. Seed dataset `ai-lab-gold-decisions@1.0.0`

`data/gold-decision/v1/manifest.json` + `data/gold-decision/v1/cases/*.json`.
Validate with `pnpm ai:gold-decision:validate`.

68 cases (a bounded, reviewable seed — not a bulk synthetic dump) across
nine synthetic capabilities and nine labeling rules:

| Capability (`synthetic.decision.*`) | Type    | Cases | Rule    |
| ----------------------------------- | ------- | ----- | ------- |
| `document_type_classify`            | choice  | 15    | R-DOC-1 |
| `evidence_sufficiency`              | choice  | 8     | R-EVD-1 |
| `workflow_next_step`                | choice  | 10    | R-WFL-1 |
| `regulatory_relevance_triage`       | choice  | 9     | R-REG-1 |
| `human_review_required`             | boolean | 6     | R-HRV-1 |
| `claim_citation_complete`           | boolean | 4     | R-CIT-1 |
| `document_completeness_score`       | score   | 8     | R-CMP-1 |
| `workflow_priority_rank`            | ranking | 5     | R-PRI-1 |
| `document_queue_rank`               | ranking | 3     | R-QUE-1 |

- Splits: development 20, validation 16, test 32.
- Languages: es-AR 24, en 23, pt-BR 18, mixed 3. No coverage beyond these
  cases is claimed; `mixed` means Spanish question text with English
  labels or titles, or a bilingual question.
- Jurisdictions: NONE 59; AR 3, BR 2, UY 2, PY 1, CL 1 — only the
  regulatory-relevance cases, each tagged `synthetic_regulatory_scenario`
  and explicitly "synthetic scenario, not legal advice". No real
  regulatory truth is encoded.
- Abstention policy: 6 `required` (ambiguous description ×2,
  contradictory facts, missing evidence ×2, unsupported output domain),
  the rest `allowed` or `not_allowed` (deterministic arithmetic cases).
- 4 permutation pairs (`permutation_pair` tag): identical semantic
  request hash and truth, different presented option order, same split,
  different exact request and case hashes.
- 2 score cases use a declared acceptable range (illegible fields).
- Human-review routing cases answer only the synthetic rule R-HRV-1; every
  such request still sets `policy.human_review_required: true`, so no case
  bypasses policy-required review.

A second, fixture-only set (`data/fixtures/gold-decision/`, review state
`draft`) wraps the existing AI-140 request fixtures verbatim so the
evaluator can be proven on already-existing `TypedDecisionResult`
fixtures.

## 8. How AI-141 prepares AI-142 – AI-148 without executing anything

- **AI-142 candidate registry** registers candidate implementations; a
  candidate is identified outside Gold truth, which never names one.
- **AI-143 sandbox** may admit a new AI-140 `result_origin`; results still
  pass through `evaluateGoldDecisionCase` unchanged.
- **AI-144/AI-145 candidates** are evaluated on complete split scopes;
  their outputs never enter a case. Level-0 results are conformance
  evidence only; any promotion case needs level-1/level-2 evidence that
  does not exist yet.
- **AI-146 research/training** must exclude the test split
  (`test_split_training_use: "forbidden"`) and permutation twins of test
  cases.
- **AI-147 tournament integration** may consume evaluation reports as
  evidence per capability. Extension point: an additive
  `gold_decision_report` evidence reference (dataset hash + report hash)
  on the AI-120 candidate result. AI-120 contracts are unchanged in
  AI-141. It must recompute evaluations from cases and results rather than
  trust third-party evaluation records.
- **AI-148 first governed tournament** — promotion remains an independent
  human decision; there is no universal winner, and a synthetic
  conformance report (`promotion_eligible: false`) can never be the basis
  for it on its own.

## 9. Explicit non-goals

AI-141 does not integrate, name, download, train, call or benchmark any
model, provider or runtime; add adapters, a candidate registry, sandbox
runtime or benchmark orchestration; promote a candidate; change
production traffic, routing, fallback, escalation or human review;
change `vlatam-global`; use customer, production or private supplier
data; or modify AI-120 contracts. The only change to an AI-140 artifact is
the architecture test that now permits exactly one consumer of
`src/decision/`: this pure evaluation layer, which is itself unwired
(`tests/architecture/gold-decision-evaluation-boundary.test.ts`).

## 10. Known limitations

- The seed cases were authored as repository fixtures and are pending
  independent human review. No set can be approved in AI-141, so every
  report is provisional (`dataset_review_state: "in_review"`).
- The set is a synthetic conformance benchmark (level 0): it is not
  domain-representative and not promotion-eligible.
- The test split is public; nothing here is a blind holdout.
- Labeling rules are stated in each question, so the seed measures rule
  application over bounded facts, not open-world document understanding.
- 68 cases are too few for calibration analysis or fine-grained slice
  statistics; per-slice counts are reported so readers can judge.
- Evaluation records are hash-bound, not signed; the hash detects
  accidental change, not a forger. Consumers must recompute from cases and
  results.
- Split assignment is explicit, not derived from a hash function; its
  integrity rests on the manifest hash and succession checks.

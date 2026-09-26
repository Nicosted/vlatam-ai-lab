# AI-140 Governed Typed Decision Plane

Status: contracts only. Contract version `1.0.0`. Branch baseline: `main` at
`57113e5` (#138), inspected 2026-09-25. No model, provider, runtime,
gateway, adapter, sandbox, scheduler, escalation path or traffic is added or
activated by AI-140.

> **LLMs may reason.
> Decision models may choose.
> Runtimes may execute.
> AI LAB grants authority.**

## 1. Why typed decision intelligence exists

Much AI LAB work does not need open-ended generation. It needs a bounded
choice: which declared intent fits a synthetic message, whether a packet's
claims all cite evidence, how complete a document is on a fixed scale, which
declared next step ranks first. A typed decision answers a bounded question
over bounded state with a value from an explicitly declared output domain, or
declines to answer.

Typed decision intelligence is a third execution paradigm alongside the two
AI LAB already governs:

| Paradigm             | What it is                                                                      | Output                                                   | Authority            |
| -------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------- |
| `deterministic`      | Repository-owned code applying reviewed rules.                                  | Exactly what the rule computes.                          | None by itself.      |
| `typed_decision`     | A bounded question over bounded state and an explicitly declared output domain. | `choice`, `boolean`, `score`, `ranking` or `abstention`. | None — evidence.     |
| `frontier_reasoning` | Open-ended generation behind the governed gateway chain (AI-72 → AI-89).        | Free-form structured candidate output.                   | None — review-gated. |

The paradigm is vocabulary, not routing. `EXECUTION_PARADIGM_ROUTING_ENABLED`
is `false`; no router, registry, capability or profile consumes the paradigm
in `1.0.0`.

## 2. Where it fits

```text
Capability Request
       |
       v
AI LAB Capability Contract (AI-71)
       |
       v
Execution Paradigm  (AI-140: vocabulary only)
       |
       +--> deterministic
       +--> typed_decision      <-- contract 1.0.0 defined here; no engine
       +--> frontier_reasoning
       |
       v
Governance → Evaluation → Human review → Approved Intelligence (unchanged)
```

The typed decision plane sits beside the Capability Contract Layer. It reuses
the AI-71 `ResultGovernance` shape and invariants, the AI-71 forbidden-field
guard, and the repository `registry-json-v1` canonical JSON form. It adds no
path into the Model Execution, Routing, Review, Export or Operator layers; an
architecture test proves no module outside `src/decision/` imports it.

## 3. Contract `1.0.0`

Implemented in `src/decision/` and the closed JSON Schemas
`schemas/ai-typed-decision-request.schema.json` and
`schemas/ai-typed-decision-result.schema.json` (registered in
`schemas/schema-registry.json`). Every object rejects unknown properties.

**Request** — `contract`, `schema_version`, `request_id`, `capability_id`,
`execution_paradigm: "typed_decision"`, `decision_type`, `bounded_state`
(≤ 64 typed facts: string ≤ 512 chars, safe integer, boolean), `question`
(id + text ≤ 1000 chars), `output_domain` (must match `decision_type`),
`policy`, `evidence_refs` (≤ 32, id + SHA-256).

- `choice` / `ranking` declare 2–32 candidates, each with a stable
  `candidate_id` and a display `label`. Meaning is never carried by array
  position.
- `score` declares `scale_id` and integer `minimum < maximum`.
- `policy.data_classification` admits only `public` or `internal`
  (synthetic data only until a reviewed privacy/ZDR decision exists).
  `abstention_permitted` is `true`, `escalation_policy_ref` is `null` and
  `downstream_use` is `none`.

**Result** — bound to its request by `request_id`, `capability_id`,
`request_hash` and `semantic_request_hash`; carries `status`
(`succeeded | abstained | blocked | failed`) with exactly one matching outcome
block (`decision | abstention | block | failure`), optional `confidence`,
`escalation`, `governance`, `evidence_refs` and a self-excluding
`result_hash`. `result_origin` admits only `synthetic_fixture`: there is no
runtime to originate anything else.

Validators are pure, never throw, never coerce and report a closed vocabulary
of stable issue codes (`TYPED_DECISION_ISSUE_CODES`). Binding checks
(`validateTypedDecisionResultForRequest`) enforce candidate membership,
distribution completeness, score bounds and scale, ranking permutation,
human-review binding and evidence lineage (a result may cite only evidence the
request declared, with the same hash).

## 4. Probabilities and confidence are evidence, not authority

> A confidence or probability value is evidence about a model output, not
> authority to act.

`confidence != probability of truth`. In `1.0.0` confidence is optional,
self-reported, and labelled `semantics: "uncalibrated_candidate_reported"`;
`calibration_ref` must be `null`. A calibration claim requires a future
reviewed calibration artifact bound to a specific workload. No threshold
anywhere grants downstream authority, and `deriveTypedDecisionDisposition`
does not read confidence or probability at all (a test proves the disposition
is identical at confidence 0 and 1 000 000).

Probabilities are exact integers in parts per million (`probability_micros`,
`0..1_000_000`). This keeps them representable in the repository's integer-only
canonical JSON and removes floating-point ambiguity. Rules:

- entries appear in strictly ascending `candidate_id` order; unsorted or
  duplicate entries fail — nothing is reordered or de-duplicated;
- `complete` distributions list every request candidate and sum to exactly
  `1_000_000`; `partial` distributions sum to at most `1_000_000`;
- non-integer, non-finite, negative or > `1_000_000` values fail;
- a request may require a complete distribution;
- the selected candidate must be a request candidate and, when a
  distribution is present, must appear in it;
- a boolean's `probability_true_micros`, when present, must be in range.

There is no normalization step. A malformed distribution is rejected, never
repaired.

> Probabilities describe candidate evidence. They do not define the decision
> policy and they never grant authority.

The contract validates the structure of probabilities, not the rule that maps
them to a decision. It therefore does **not** require the selected choice to
be the modal (highest-probability) candidate, and it does **not** apply an
implicit `0.5` threshold between a boolean `value` and
`probability_true_micros`. Asymmetric misclassification costs,
workload-specific or calibrated thresholds, abstention bands and other
post-probability rules are decision policy. For example, `P(true) = 0.70`
under a reviewed threshold of `0.80` yields `value: false`, and a
cost-sensitive policy may select a non-modal candidate; both are structurally
valid results. AI-140 defines no decision policy and no threshold
configuration; binding a result to a reviewed decision policy is future work
that requires its own reviewed PR.

## 5. Abstention is first-class

`status: "abstained"` with `reason_code` ∈ `insufficient_confidence`,
`insufficient_evidence`, `ambiguous`, `unsupported_input`, `policy_blocked`.
Abstention is not failure: the candidate intentionally declines the decision.
It also grants nothing: `downstream_allowed` stays `false`, no decision or
confidence may accompany it, and its disposition never invokes anything.

## 6. Escalation must be explicit

> Typed decision execution may recommend abstention or escalation, but
> escalation must be governed explicitly and must never behave as an implicit
> fallback.

A result may carry `escalation.recommendation` ∈ `none`, `human_review`,
`governed_escalation_candidate` (the last only when not `succeeded`).
`escalation.executed` is always `false` and `governed_policy_ref` is always
`null`. The disposition of an abstention recommending escalation is
`next_required_step: "explicit_governed_escalation_decision"` with
`automatic_escalation: false` and `provider_invocation_permitted: false`.

AI-140 contains no code path equivalent to
`if low confidence: call a frontier model`. Any future escalation from
`typed_decision` to `frontier_reasoning` requires a separately reviewed,
explicit escalation policy, its own authorization and budget, and the existing
governed gateway chain.

## 7. Governance is separate from output

A valid result is a candidate result. `succeeded` ≠ approved:

- `governance.downstream_allowed` is always `false` (schema `const`);
- `approval_state` is `pending` (human review required) or `not_required`,
  never `approved` or `rejected` — approval is applied by the existing review
  capability, never carried by a decision result;
- `governance.human_review_required` must equal the request's policy;
- the AI-71 `validateGovernance` invariants still apply.

`deriveTypedDecisionDisposition` returns a frozen record whose
`downstream_allowed`, `authority_granted`, `automatic_escalation` and
`provider_invocation_permitted` are the constant `false`.

## 8. Candidate identity and permutation invariance

Two identities are hashed with domain separation over `registry-json-v1`
canonical JSON (`SHA-256(domain || "\n" || canonical_json)`):

| Hash                    | Domain separator                                   | Ordering                                                                                             |
| ----------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `request_hash`          | `vlatam-ai-lab:typed-decision-request:v1`          | Exact presented order — display order is part of what a candidate was shown and must replay exactly. |
| `semantic_request_hash` | `vlatam-ai-lab:typed-decision-request-semantic:v1` | Candidates by `candidate_id`, facts by `fact_id`, evidence by `evidence_id`; `request_id` excluded.  |
| `result_hash`           | `vlatam-ai-lab:typed-decision-result:v1`           | Whole result excluding the self-hash field `result_hash`.                                            |

`[A, B, C]` and `[C, A, B]` therefore share a `semantic_request_hash` and have
different `request_hash` values. Because distributions are already in
canonical candidate order, `compareChoicePermutationInvariance` compares two
such results per stable candidate identity with an explicitly supplied
integer tolerance (no default). AI-141+ can use it to test permutation
invariance of real candidates; AI-140 only proves it on synthetic fixtures.

The canonicalizer in `src/decision/canonical.ts` is a local copy of the
provider registries' `registry-json-v1` implementation so that the decision
plane never imports the provider layer. Byte compatibility (outputs and
rejected inputs) is proven by the contract tests. Extracting a shared,
layer-neutral canonical JSON utility is recorded as possible future technical
debt and is intentionally not done in AI-140.

## 9. No self-promotion; future candidates only as governed candidates

The typed decision plane knows about typed decision intelligence, not about
any specific project or model. Future open-source or proprietary decision
engines enter only as candidates in a future typed decision candidate
registry (AI-142), inside a sandbox runtime (AI-143), evaluated against
reviewed gold decisions (AI-141) by AI LAB-owned evaluators, and compared in
the AI-120 tournament. A candidate never supplies its own cases, evaluator,
score, calibration, evidence approval or promotion (ADR-004). There is no
universal winner (`universal_winner: false`).

## 10. Relationship with AI-120

AI-120 contracts (`1.0.0`) are unchanged. `execution_paradigm` is **not**
added to tournament identity in AI-140 because doing so would change a stable
contract without a consumer. Documented extension point for AI-147: add
`execution_paradigm` as an additive (MINOR) field on the tournament execution
profile and candidate result, keeping the
`runtime × gateway × model × endpoint × profile × capability` separation and
ranking typed-decision profiles per capability only.

## 11. Explicit non-goals

AI-140 does not integrate or name any decision engine or model, train,
download, execute or benchmark a model, choose a winner, implement routing or
escalation, touch customer or production data, change `vlatam-global`, change
the approved export authority model, add a capability to
`config/ai-capabilities.json`, add Operator surface, or create any
credential, runtime configuration, scheduler or traffic. Fixture capability
IDs live in the non-catalog namespace `synthetic.decision.*`; a test proves
none is registered.

## 12. Known limitations

- JSON Schema cannot express uniqueness of candidate/fact/evidence IDs,
  canonical distribution order, exact sums or hash bindings; those are
  enforced only by `src/decision/validation.ts`.
- Confidence has no calibrated meaning in `1.0.0`.
- No capability is bound to the `typed_decision` paradigm; capability-level
  binding is future work (AI-142/AI-147).
- The Operator Read Model does not show the typed decision plane; exposing a
  factual "defined / unavailable for execution" status is deferred.

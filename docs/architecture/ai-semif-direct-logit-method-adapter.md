# AI-144 — SemIf Direct-Logit Method Adapter Baseline

Status: implemented in review (synthetic logits only). Contract `1.0.0`.

> AI-144 evaluates an AI-LAB-owned implementation of a pinned SemIf
> methodology using synthetic logits. It does not execute SemIf upstream
> code or any SemIf/Qwen model artifact.

> AI-144 executes candidate-specific methodology, not candidate-supplied
> code or model weights.

> A method-conformance success is not evidence of model quality.

> Upstream calibration claims remain upstream claims. AI-144 does not
> reproduce or verify them.

## 1. What AI-144 is

AI-140 defined typed decision contracts, AI-141 the Gold Decision
evaluation set, AI-142 the evidence-only candidate registry and AI-143 the
governed synthetic-fixture execution boundary. AI-144 adds the **first
candidate-specific typed decision method path**:

- a closed, versioned **candidate adapter specification** that binds the
  exact AI-142 candidate evidence revision of `tdc-theoleecj-semif`, the
  pinned upstream methodology evidence, and the exact AI-LAB-owned method
  artifact;
- an **AI-LAB implementation of the pinned SemIf direct option-logit
  methodology**, admitted as one additional AI-143
  `synthetic_fixture_adapter`
  (`src/decision-sandbox/fixture/direct-logit-method-adapter.mjs`);
- repository-owned **synthetic logit fixtures** that stand in for model
  logits so the readout can be exercised;
- a pure **actual-candidate execution readiness** evaluator, which answers
  "may AI LAB execute the actual upstream SemIf/model path?" with
  `not_eligible_for_candidate_execution` and explicit blockers;
- an immutable **evidence pack** binding all of the above.

Code: `src/decision-candidate-methods/` (pure, evidence only) and the
method artifact under `src/decision-sandbox/fixture/`. Data:
`data/decision-candidate-methods/v1/`. Schemas:
`schemas/ai-typed-decision-candidate-adapter-spec.schema.json`,
`schemas/ai-typed-decision-synthetic-logit-fixture.schema.json`,
`schemas/ai-typed-decision-candidate-adapter-evidence-pack.schema.json`.

## 2. Why SemIf is the first candidate-specific path — and why this is not a ranking

SemIf's direct mode is a _method_ (a readout over option logits), not a
trained typed-decision model. Its semantics are small, documented in the
pinned source, and reproducible without any model: given one logit per
declared option, apply a softmax and read the probabilities. That makes it
the smallest candidate-specific path that can be implemented and
conformance-tested entirely inside the existing AI-143 fixture boundary.

This choice is an **integration order, not a ranking**. AI LAB has not
benchmarked SemIf, has not compared it with any other AI-142 candidate,
and has not selected it as a winner. AI-148 remains the first governed
tournament target.

## 3. Candidate-specific is not candidate execution

| Subject                                      | Kind                            | Executable in AI-144?                       |
| -------------------------------------------- | ------------------------------- | ------------------------------------------- |
| AI-142 candidate `tdc-theoleecj-semif`       | `registered_decision_candidate` | **No.** Refused before process creation.    |
| `ai-lab-direct-logit-method-fixture-adapter` | `synthetic_fixture_adapter`     | Yes, under the fixed AI-143 fixture policy. |

The method fixture is repository-owned, reviewed code, bound by exact
SHA-256, driven only by repository-owned synthetic logits; its results keep
`result_origin: "synthetic_fixture"`. The AI-142 lifecycle of SemIf is
unchanged: `registry_state: "discovered"`, `authority: "evidence_only"`,
`ai_lab_executed: false`, `execution_enabled: false`.

The sandbox side stays candidate-neutral (an AI-143 invariant): the
allowlist entry, artifact and sandbox schemas never name a candidate. The
candidate binding lives only in the AI-144 specification.

## 4. Exact pinned binding

| Field                   | Value                                                                          |
| ----------------------- | ------------------------------------------------------------------------------ |
| `candidate_id`          | `tdc-theoleecj-semif`                                                          |
| `candidate_hash`        | `02c465ac9c13b88f0cda245eae350f45b0d91cd66b24e0ededf9d73df5228f29`             |
| `evidence_revision`     | `1`                                                                            |
| Upstream repository     | `TheoLeeCJ/SemIf-OpenJev`                                                      |
| Upstream commit         | `23cf1f39fc9534fe81437200959b6dfc7106e45a`                                     |
| Method adapter id       | `ai-lab-direct-logit-method-fixture-adapter` `1.0.0`                           |
| Method artifact SHA-256 | `5cc95a5209b2b8a60ef68735772fd9fc3fc93796173fcbedd67d8ecab38d509d`             |
| `adapter_spec_hash`     | `1bed58897043c66765b2c594056e5be2f2adb5a8d75e4a40463f21bc90b39574`             |
| `evidence_pack_hash`    | `c2b5bc46cc4ec554138195fd82d467b4917610b6d6cd257811c59cd31c333280`             |
| AI-143 policy hash      | `6bad0bd18d779acb838ecf37e561d1678b13f0b53649acf40810972b03bc8378` (unchanged) |

The binding is exact. `checkCandidateAdapterBinding` re-validates the
current AI-142 entry with the AI-142 validator (which recomputes its
`candidate_hash`) and requires id, hash, evidence revision, repository,
pinned commit and every shared evidence locator to match. If the AI-142
SemIf entry changes in any way, the specification becomes `stale` (and a
tampered entry `invalid`) until a separately reviewed rebinding. The
candidate id alone is never followed. The evidence pack cannot validate
against a drifted entry.

## 5. Upstream methodology evidence (read-only)

Files were read at the pinned commit only: never executed, installed,
cloned for execution or vendored. No weights or Hugging Face artifacts
were fetched. AI-142 evidence is not modified; the three files AI-142
already bound are byte-identical here.

| Evidence id           | Path                         | Git blob                                   | Content SHA-256                                                    |
| --------------------- | ---------------------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| `ev-calibration-doc`  | `docs/CALIBRATION.md`        | `3322779402bb8b64cf76bc732f0714948624316f` | `3682decd5773d1d995423fa37d87053138fcdbc720a4105b27b89a1881f491b1` |
| `ev-core-source`      | `src/semif_phase1/core.py`   | `b3a6968d5d7d509f44328d4e88a29d80d0609462` | `2ed5702373242f62928dbe5339fa8b3eebe716cea94816519b6c1baa27e56da5` |
| `ev-direct-source`    | `src/semif_phase1/direct.py` | `930eb49368f973212d4cce435ecac4810ab9a885` | `e42b91281b6fa16de3cabaf98b452dc026c0ee77869e5c1b10f44b962f3222cc` |
| `ev-evaluator-source` | `benchmarks/evaluate.py`     | `1913cf1476a19624a6285ea914bfe0dbc4825c71` | `2b8376577294d6836e2aff1bccf5d4d01aa1ec39e21f8f908281437b2bd4f2af` |
| `ev-license`          | `LICENSE`                    | `ca562883550941229de6555a8374fe2c83a18e08` | `f765f2140f8507a8f0d81ec0fd2c4bd72fe6a066841ef27883ff876a76bf61be` |
| `ev-method-doc`       | `docs/METHOD.md`             | `32114ecaaf8d1939fd357ebd736fcd4944161902` | `f328e1d8d11fd801132a409d5de8c73894ddaa4789a3601d072c756f9fb940c0` |
| `ev-model-manifest`   | `manifests/models.json`      | `04ef2347cdc510eed9a9f90cf6d2cde3ba44b0f6` | `b7286bd0a41c15e7c7d39475a33f268ec6edf11066026bb4017bb79c1ca3a8f2` |
| `ev-readme`           | `README.md`                  | `8f607dad48e9bff34b5bb5079e3d825715b01134` | `89f00284285ea0dac7b0e10ff04ebe643e37fb1a3165ab7dbd13686e97d65f62` |
| `ev-requirements`     | `requirements.txt`           | `a6efd38c18d1de68871759ac2d0f7eef8ff8c03e` | `bc215c87d5eed29b4c4db100d53c1d763f807fbb7164a1c47ad8d89166fff87f` |
| `ev-third-party`      | `THIRD_PARTY.md`             | `c11c1a471d6d9d35173dd244c2a4148dda098e90` | `cf1815041c71181c6601c8acde1dd0d93fc4c9528efcd4a0637922d7fa96286b` |

What the evidence establishes (each topic is recorded in the
specification with a pinned disposition; a specification cannot silently
upgrade one):

| Topic                      | Upstream (pinned)                                                            | AI-144                                                                                                                | Disposition             |
| -------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| option construction        | 2-16 options, unique string ids, descriptions (`validate_row`)               | AI-140 choice candidates (id, label); 2-16 enforced                                                                   | `adopted`               |
| prompt construction        | fixed system prompt + JSON payload with lettered options, chat template      | none: no prompt, tokenizer or model                                                                                   | `not_applicable`        |
| logit source               | native last-position logits restricted to single-token answer letters        | reviewed synthetic integer micro-logits bound by candidate id; none bound → typed `blocked` / `execution_unavailable` | `replaced_by_synthetic` |
| normalization              | softmax over option logits with max subtraction; ≥2 finite values            | same                                                                                                                  | `adopted`               |
| selection                  | scorer returns probabilities only; evaluator/calibration notes use argmax    | unique maximum logit (method-specific, not an AI-140 rule)                                                            | `adopted`               |
| top-logit tie              | evaluator takes the first maximum in option order (positional)               | no selection: typed AI-140 abstention (`abstained`, `ambiguous`)                                                      | `fail_closed`           |
| option ordering            | letters by display position; stability measured after aligning by option id  | logits bound by candidate id; computation in candidate-id order                                                       | `ai_lab_policy`         |
| probability representation | floating-point probabilities                                                 | AI-140 integer micros (section 8)                                                                                     | `ai_lab_policy`         |
| boolean decisions          | no boolean mode; binary criteria are ordinary options                        | not supported                                                                                                         | `not_supported`         |
| score and ranking          | no direct score mode; ranking only via a separate reranker system and model  | not supported                                                                                                         | `not_supported`         |
| calibration                | optional per-workload temperature `softmax(logits/T)` fitted on labeled rows | not applied, not fitted, not verified                                                                                 | `not_applied`           |

## 6. AI-LAB implementation versus upstream implementation

- **Upstream source evidence**: Python files at the pinned commit, read
  as documentation of method semantics.
- **AI-LAB-owned implementation**: `direct-logit-method-adapter.mjs`,
  written by AI LAB from that evidence. No upstream code was copied or
  vendored (`upstream_code_reused: false`); source-code identity is not
  claimed. Preferred terminology: "SemIf-method adapter" or "AI-LAB
  implementation of the pinned SemIf direct-logit methodology" — never
  "SemIf runtime", and never "we are running SemIf".

The artifact depends only on Node built-ins (`node:buffer`,
`node:crypto`, `node:process`, `node:url`, `node:util`). No torch,
transformers, MLX, llama.cpp, ONNX, CUDA/MPS/WebGPU, Hugging Face,
Python environment or provider SDK was added.

## 7. Synthetic logits

`data/decision-candidate-methods/v1/synthetic-logits/*.json` are closed,
hash-bound, repository-owned numbers (`provenance:
"repository_owned_synthetic"`, `model_output: false`). **They are not model
outputs and no natural-language inference is performed.** Each binds:

- the capability, the AI-140 semantic request hash, and the exact AI-140
  request hashes it answers (the sandboxed artifact can read only its own
  bytes, so it looks a fixture up by the exact request hash the runtime
  verified);
- one integer micro-logit (`1 logit = 1_000_000`, `|logit| ≤ 100`) per
  candidate id, strictly ascending, unique. Integers are required because
  the `registry-json-v1` canonical form admits only safe integers; NaN,
  Infinity and fractional values are therefore unrepresentable and
  rejected.

| Fixture                        | Purpose                                           | `fixture_hash`                                                     |
| ------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------ |
| `synthetic-logits-bucket-0001` | 16 options (upper bound), `±100` extreme logit    | `d719613a0496b861dc91111c9d2278722b7b3c0f34dc2d3d06931ce381808636` |
| `synthetic-logits-hold-0001`   | tie at the maximum logit → typed abstention       | `1bb649c6f16d58b84887b19276218c545627cd8fee4399c8c551721694dc7da9` |
| `synthetic-logits-intent-0001` | AI-140 choice request and its permutation         | `22320b8d899196ba781d54274e37981101abbd0974673bec1967f4a9bb7ab515` |
| `synthetic-logits-route-0001`  | equal remainders in rounding, and its permutation | `5c1b65bd9734563aa982a51b47027a8cf048d2b5165ffedfa1acbca0452f7355` |

The artifact embeds exact copies of these fixtures; tests prove equality
with the committed files, and the artifact hash pins them.

## 8. Method semantics (AI-LAB implementation)

1. **Binding.** One logit per declared candidate id. Missing, unknown or
   duplicate candidates, invalid ids, non-integer or out-of-bound logits,
   and fewer than 2 or more than 16 candidates are refused. Nothing is
   coerced or silently dropped.
2. **Order.** Candidates are processed in ascending `candidate_id`
   (UTF-16 code units). Array position never carries identity.
3. **Normalization.** `w_i = exp((l_i − max_l) / 1_000_000)`,
   `p_i = w_i / Σw` with the sum accumulated in candidate-id order.
4. **Probability micros.** `floor(p_i × 1_000_000)`; the remaining
   `1_000_000 − Σfloor` micros (always `0 ≤ r < n`, else refused) go one
   each to the largest fractional remainders; equal remainders are
   resolved by ascending `candidate_id`. A complete distribution always
   sums to exactly `1_000_000` and is serialized in canonical candidate-id
   order, as AI-140 requires.
5. **Selection.** The unique maximum logit (compared exactly as
   integers). This is SemIf-method behavior only; AI-140 validation is
   unchanged and still admits non-modal selections.
6. **Ties.** On a tie at the maximum logit no candidate is selected: the
   only upstream tie-break is positional (display order), so it is not
   adopted and no other tie-break (candidate id or otherwise) is invented.
   The outcome is an explicit AI-140 abstention (section 9). Ties below
   the maximum are fine.
7. **Confidence.** `confidence_micros` is the selected option's micros
   with `semantics: "uncalibrated_candidate_reported"` and
   `calibration_ref: null`: a conditional probability over the declared
   options, not a probability of truth.

**Permutation invariance.** Because identity is the candidate id and all
computation runs in candidate-id order, permuting the declared options (or
the logit list) cannot change the decision or the distribution. Tests run
every permutation of the 3- and 4-option fixtures, 64 deterministic
shuffles of the 16-option fixture, and the permuted AI-140 requests through
the sandbox. Permuted requests keep distinct request hashes (and result
hashes) and share the semantic request hash.

**Result hashing inside the sandbox.** The AI-143 permission model grants
the artifact read access to its own file only, so it cannot import the
repository canonicalizer. It builds its fixed result shape, and the fixed
AI-140 choice-request semantic payload, with every key already in
`registry-json-v1` order and hashes `JSON.stringify` of them under the
AI-140 domains. This is not a general canonicalizer: the runtime
recomputes the AI-140 result hash and semantic request hash with the
repository canonicalizer on every output and rejects any mismatch.

## 9. Typed outcomes versus technical failures

AI-140 states that abstention is always permitted and is never a failure.
The adapter therefore keeps method-level decision semantics separate from
runtime/process failure. Every case below exits 0, the AI-143 execution
record is `succeeded` (the process and protocol worked), and the nested
AI-140 result carries the decision-level outcome:

| Condition                                     | AI-143 record | AI-140 result `status` | Reason                         | `decision` / `confidence` |
| --------------------------------------------- | ------------- | ---------------------- | ------------------------------ | ------------------------- |
| unique maximum logit                          | `succeeded`   | `succeeded`            | —                              | selected choice / micros  |
| tie at the maximum logit                      | `succeeded`   | `abstained`            | `abstention: ambiguous`        | `null` / `null`           |
| no reviewed synthetic logits for this request | `succeeded`   | `blocked`              | `block: execution_unavailable` | `null` / `null`           |

All three keep `result_origin: "synthetic_fixture"`,
`downstream_allowed: false`, `escalation.executed: false`, the same request
binding, governance and hashing rules. A tie is not a model failure, and
missing synthetic evidence is not a runtime failure: it means the method
cannot run for this exact request (no reviewed synthetic evidence exists),
so execution is unavailable and the result fails closed as a typed block.

Non-zero exits remain reserved for technical defects that no admitted
AI-140 result can represent: malformed protocol input (2), an embedded
fixture set inconsistent with the request (3), a refused environment (4)
and a method contract violation such as a non-choice request or a bound
fixture that does not cover the candidates (5). AI-143 keeps recording
those, and timeouts, output limits, protocol violations and runtime
failures, as `process_failed`, `timed_out`, `output_limit_exceeded`,
`protocol_failed` or `runtime_failed`; a runtime failure discards any
typed result.

The adapter builds its result and the choice request's semantic payload
in fixed canonical key order; the runtime recomputes the AI-140 result
hash and semantic request hash for every outcome, including abstained
and blocked results.

## 10. Supported and unsupported decision types

- Supported: **`choice`** only.
- Unsupported: `boolean` (no described alternatives in AI-140 and no
  boolean mode upstream; AI-144 defines no invented boolean-to-option
  mapping), `score` and `ranking` (no direct mode upstream).

Unsupported types fail closed **before process creation**: the AI-143
allowlist entry now declares `supported_decision_types` and
`max_candidates`, and preflight blocks with
`adapter_decision_type_unsupported` or `adapter_candidate_limit_exceeded`.
The AI-143 replay fixture keeps its full four-type coverage.

## 11. Calibration

Upstream documents per-workload temperature calibration. AI-144 fits no
temperature, trains nothing, consumes no AI-141 labels and applies no
calibration (`calibration_state: "not_applied"`). The AI-142 calibration
claim stays `verification: "upstream_claim"`.

## 12. Actual-candidate execution readiness

`evaluateCandidateExecutionReadiness` is separate from the synthetic
method adapter. It grants no authority and has exactly one state:
`not_eligible_for_candidate_execution`. For SemIf:

| Blocker                                  | Source                                                                                                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archive_state_unresolved`               | AI-142 evidence gap                                                                                                                                                     |
| `base_model_license_unresolved`          | AI-142 gap: Qwen/Qwen3.5-4B @ `851bf6e8…` license unresolved; MIT code license is not a model license; `THIRD_PARTY.md` itself says to check the upstream model license |
| `candidate_execution_not_authorized`     | No execution authority exists (AI-142 lifecycle, AI-144 authority `none`)                                                                                               |
| `hostile_code_isolation_not_established` | AI-143 policy `hostile_code_containment: not_established`                                                                                                               |
| `model_artifact_not_bound`               | No model file digest is bound; upstream `manifests/models.json` pins revisions only                                                                                     |
| `runtime_dependency_set_not_bound`       | Upstream `requirements.txt` pins torch/transformers/… without hashes; nothing admitted                                                                                  |
| `upstream_code_not_admitted_to_sandbox`  | AI-143 admits only repository-owned fixtures; registered candidates are refused                                                                                         |

`candidate_binding_stale` and `candidate_entry_invalid` are added on
AI-142 drift or tampering. No evidence was fabricated to shorten the
list, and no model license was inferred from README text.

## 13. Relationships

- **AI-140**: results are ordinary `TypedDecisionResult`s; no competing
  result shape; `result_origin` is not extended and stays
  `synthetic_fixture`; no global modal-selection rule is added.
- **AI-141**: not wired. No `evaluateGoldDecisionCase`, no aggregation,
  no accuracy, Brier or calibration score, no leaderboard, no winner.
  AI-148 remains the first governed tournament target.
- **AI-142**: the candidate entry is read and re-validated, never
  modified. Lifecycle stays `discovered` / `evidence_only`;
  `ai_lab_executed` stays `false`.
- **AI-143**: same protocol, framing, bounded I/O, timeout, execution
  record and fixture policy (hash unchanged). The allowlist grew by
  exactly one repository-owned fixture; all seven AI-142 candidates are
  still refused as `registered_decision_candidate` subjects and as `tdc-*`
  adapter ids. `output_authority` is `none`, `downstream_allowed` is
  `false`.
- **AI-120**: no lifecycle transition. SemIf is not `benchmark_candidate`,
  `shadow`, `canary`, `approved` or `preferred`.

## 14. What success does and does not prove

A successful method-fixture execution proves that the adapter protocol
worked, that the pinned method implementation ran, and that synthetic
logits were normalized and read out as specified, including that ties and
missing synthetic evidence surface as typed abstention and block results.
It does **not** prove
SemIf upstream correctness, Qwen quality, trade-domain competence,
calibration, candidate benchmark quality or production readiness.

## 15. Future boundary for real model execution

Executing the actual SemIf path would require, each in its own reviewed
change: an isolation layer that establishes hostile-code containment and
OS-level network/filesystem isolation; a subject contract binding
`candidate_id`, `candidate_hash` and `evidence_revision` under explicit
execution authorization; an authoritative, immutable base-model license
record; a hash-bound model artifact and a hash-locked runtime dependency
set; an AI-140 `result_origin` extension; and only then AI-141 evaluation.

## 16. Explicit non-goals

AI-144 does not execute SemIf upstream code, install or clone it for
execution, download or run Qwen or any model, execute any other AI-142
candidate, install torch/transformers/MLX/llama.cpp, call Hugging Face or
a provider, benchmark or calibrate SemIf, run AI-141 Gold Decisions,
rank candidates, select a winner, change AI-120 lifecycle or production
routing, set `ai_lab_executed=true`, or claim model quality or real-world
trade competence. The evidence pack review state is `draft`; nothing is
self-approved.

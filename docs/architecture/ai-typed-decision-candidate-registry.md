# AI-142 Governed Typed Decision Candidate Registry

Status: contracts, fail-closed validators, deterministic hashing,
synthetic fixtures and the seed inventory
`ai-lab-typed-decision-candidates@1.0.0` (seven entries, review state
**`in_review`**). Contract version `1.0.0` (`src/decision-candidates/`,
`schemas/ai-typed-decision-candidate-{entry,registry}.schema.json`).
Branch baseline: `main` at `30e32df` (AI-141, #141). No candidate is
executed, installed, cloned for execution, downloaded, benchmarked,
ranked, promoted or routed by AI-142.

> **A candidate registry records what we know.
> It does not authorize what may run.**

> **A candidate can be known without being trusted.
> A candidate can be registered without being runnable.
> A candidate can be runnable without being authorized.
> Authority remains a separate governed decision.**

The registry answers: _what candidates exist, exactly which upstream
revision did we inspect, what role might they play, what evidence do we
have, and what is still unknown?_ It never answers which candidate is
best, which should be promoted or which should run production traffic.

## 1. Registration versus execution

```
public upstream source
        ↓
pinned upstream revision (exact 40-hex commit)
        ↓
evidence references (path + git blob SHA + content SHA-256 at that commit)
        ↓
candidate registry entry (candidate_hash)
        ↓
registry manifest (registry_hash)
        ↓
human-reviewable candidate inventory
```

AI-142 stops there. The chain `candidate → adapter → runtime → execution`
starts in AI-143 and later PRs, each separately reviewed.

Doctrine:

1. Registration is not execution, approval, benchmark eligibility or
   promotion eligibility.
2. Upstream claims are evidence, not verified AI LAB facts.
3. A repository name or license file does not grant execution authority.
4. Code license, weight license, base-model license and training-data
   provenance are separate concerns.
5. Unknown licensing or provenance is recorded as `unresolved` and fails
   closed for any future execution.
6. Candidate projects cannot define their own AI LAB governance state,
   cannot modify Gold Decision truth and cannot self-promote.
7. There is no universal winner and no implicit provider, model or runtime
   substitution.
8. Evidence binds to an immutable upstream revision.
9. AI LAB owns the registry contract and the authority boundary.

## 2. Contracts

### Candidate entry (`typed_decision_candidate_entry`)

| Field                                      | Meaning                                                                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `candidate_id`                             | AI LAB-owned stable identity (`tdc-…`), independent of display names and upstream renames.                                 |
| `evidence_revision`, `supersedes`          | Candidate evidence revision (starts at 1). A new commit or new evidence is a new revision bound to the previous hash.      |
| `display_name`                             | Human label only; carries no identity or authority.                                                                        |
| `roles[]`                                  | `{ role, evidence_refs }`, strictly ascending; every role must cite evidence.                                              |
| `upstream`                                 | Host, requested and resolved repository (redirects visible), URL, `pinned_commit_sha`, default branch name, archive state. |
| `evidence[]`                               | Immutable locators: repository, commit, path, git blob SHA, commit URL, content SHA-256, observation time.                 |
| `licensing`                                | Layered: `code`, `weights`, `base_model`, `training_data` (§5).                                                            |
| `upstream_claims[]`                        | Concise, evidence-bound claims relevant to future evaluation; `verification` is always `upstream_claim`.                   |
| `evidence_gaps[]`, `evidence_completeness` | Derived deterministically from the entry; the declared values must equal the derivation.                                   |
| `lifecycle`                                | Constant, fail-closed (§7).                                                                                                |
| `candidate_hash`                           | Self-excluding hash under `vlatam-ai-lab:typed-decision-candidate:v1`.                                                     |

### Registry manifest (`typed_decision_candidate_registry`)

Binds, strictly ordered by `candidate_id`, every entry's
`(candidate_id, evidence_revision, candidate_hash, repository,
pinned_commit_sha, roles, evidence_completeness)`, a recomputable
`role_distribution` and `evidence_completeness_distribution`, a
non-authoritative review state, `authority: "evidence_only"`,
`universal_winner: false` and a self-excluding `registry_hash` under
`vlatam-ai-lab:typed-decision-candidate-registry:v1`. Distributions are
counts of what is recorded, never a ranking.

Hashing reuses the AI-140 `registry-json-v1` canonicalizer exactly as
AI-141 does; no second canonical form exists.

## 3. Candidate roles

| Role                     | What it is                                                              | What it is not                        |
| ------------------------ | ----------------------------------------------------------------------- | ------------------------------------- |
| `typed_decision_model`   | Trained weights intended to emit typed decisions directly.              | A serving framework or a technique.   |
| `typed_decision_adapter` | A technique or library deriving typed decisions from an existing model. | A model; it owns no weights.          |
| `typed_decision_runtime` | Serving or orchestration infrastructure.                                | Model weights.                        |
| `research_methodology`   | A training, evaluation or data methodology.                             | Automatically an executable artifact. |

An entry may declare several roles only when each is supported by cited
evidence. Roles are a vocabulary of kinds, never tiers; the registry
creates no ranking from them. Multiple model sizes or variants of one
upstream project stay one entry in `1.0.0`; splitting into executable
variants is an AI-143+ concern.

## 4. Immutable revision pinning and evidence provenance

- `pinned_commit_sha` must be a full 40-hex lowercase commit. A branch,
  tag or `HEAD` is rejected as `upstream_revision_unpinned`; an
  abbreviated or upper-case SHA as `commit_sha_invalid`.
- Every evidence locator must name the same repository and commit, and
  its `source_url` must be exactly
  `https://github.com/<repo>/blob/<commit>/<path>` (files) or
  `https://github.com/<repo>/tree/<commit>` (repository metadata). A
  branch URL, raw `main` URL or bare repository URL is
  `mutable_evidence_reference`.
- File evidence carries the git blob SHA and the SHA-256 of the exact
  bytes read; repository metadata carries the SHA-256 of the observed
  snapshot. `default_branch_at_observation` is recorded as context only
  and is never execution identity.
- Evidence is referenced and hashed, never vendored: no upstream source,
  README or dataset is copied into this repository. Claims are concise
  factual extractions (≤ 280 characters).
- Refreshing upstream state never rewrites an entry: it produces a new
  `evidence_revision` whose `supersedes` binds the previous hash, and a
  new registry version whose `supersedes` binds the previous registry
  hash. `validateDecisionCandidateRegistrySuccession` rejects a changed
  candidate hash without a higher evidence revision
  (`candidate_rewritten_without_revision`) and silent removal
  (`candidate_removed`).

## 5. Layered licensing

Licensing is never one field. Each layer has its own status,
declared identifier (verbatim text, never a legal conclusion) and
evidence references:

| Layer           | Statuses                                                                 |
| --------------- | ------------------------------------------------------------------------ |
| `code`          | `evidenced` \| `not_applicable` \| `unresolved`                          |
| `weights`       | same, plus `involvement` and `location` (§6)                             |
| `base_model`    | same, plus `declared_name`                                               |
| `training_data` | `evidenced` \| `partially_evidenced` \| `not_applicable` \| `unresolved` |

Rules enforced by the validator:

- `evidenced` requires a declared identifier and at least one reference
  to a `license` or `model_card` document at the pinned revision. A
  README badge, repository description, package manifest or repository
  metadata alone never establishes a license
  (`license_evidence_insufficient`).
- `third_party_notice` evidence (NOTICE, THIRD_PARTY files) records what
  a candidate says about other projects' licenses. It is second-hand and
  never establishes any layer, so a candidate cannot vouch for its base
  model's license.
- `unresolved` and `not_applicable` carry no identifier;
  `not_applicable` must cite evidence for why.
- The weight and base-model layers are never inferred from the code
  layer: an evidenced weight or base-model license citing only the code
  layer's license evidence is `license_layer_inferred`. Another project's
  license and a base model's license are likewise never borrowed.
- Any text stating that something is commercially safe, commercially
  approved or legally cleared is rejected (`legal_conclusion_forbidden`).
  AI-142 records license evidence; it provides no legal advice or legal
  approval.

## 6. Model weights and training data

- `weights.involvement` is `involved`, `not_involved` or `unresolved`.
  `not_involved` forces `location` and `status` to `not_applicable`;
  `unresolved` forces both to `unresolved`.
- `weights.location` distinguishes weights inside the repository from an
  `external_reference`, whose declared locator is recorded as text only.
  AI LAB never downloads weights, never calculates model performance and
  never infers the weight license from the code license.
- Training-data provenance records only what upstream evidence
  establishes. Public availability is never read as unrestricted training
  use; datasets are neither downloaded nor copied.

## 7. Upstream claims versus AI LAB verification; lifecycle

Every claim (`execution_surface`, `language_support`, `performance`,
`calibration`, `invariance`, `weights_reference`,
`base_model_relationship`, `training_methodology`,
`evaluation_documentation`) must cite evidence and carries
`verification: "upstream_claim"`. `1.0.0` has no verified state: a README
stating multilingual support, CUDA/MPS/ONNX/llama.cpp/MCP support,
latency, accuracy, model size, calibration or option-order invariance
remains an upstream claim. AI LAB behavioral verification requires a
later contract that binds AI LAB evaluation evidence.

Every entry carries the constant lifecycle:

```json
{
  "registry_state": "discovered",
  "ai_lab_executed": false,
  "execution_enabled": false,
  "benchmark_execution_enabled": false,
  "promotion_eligible": false,
  "production_eligible": false,
  "routing_enabled": false,
  "authority": "evidence_only"
}
```

`discovered` is the first state of the AI-120 tournament lifecycle
vocabulary and the only one admitted. There is no `approved` state, no
activation control, no kill-switch toggle and no approval reference.
Fields such as `approval_ref`, `activation`, `traffic_stage`, `command`,
`install_command`, `score`, `tier`, `rank` or `winner` fail closed at any
depth (`authority_field_forbidden`), as do provider/model/credential
field names, credential-shaped values and private reasoning.

## 8. Unresolved evidence

A candidate may be registered with incomplete evidence: \_candidate exists

- revision pinned + code license unresolved\_ is a valid discovered entry.
  The validator derives `evidence_gaps` (archive state, code, weights and
  base-model license, weights involvement and location, training-data
  provenance) and requires the declared list and
  `evidence_completeness` to equal the derivation. AI-142 does not compute
  future execution eligibility; it records the fail-closed evidence state
  that any future eligibility check must respect: an unresolved required
  layer can never become eligible by default.

## 9. Why registration grants no authority

Registry review states are `draft` and `in_review` only; a registry can
never approve itself. Publication, sandbox admission, benchmark
execution, shadow/canary, approval or preference each require a future,
separately reviewed decision that binds the exact `registry_hash` or
`candidate_hash` through the existing governed human-review authority.
Nothing in a registry document can grant that.

## 10. Relationship with AI-141, AI-143 and AI-147

- **AI-141.** The registry never reaches the Gold Decision evaluator,
  cases or reports; candidates cannot modify Gold truth. No candidate
  result, accuracy, Brier score, leaderboard or winner exists.
- **AI-143 execution adapter boundary.** A future sandbox adapter may be
  bound to a candidate by `candidate_id` + `candidate_hash`. Execution
  would require evidence gaps relevant to that execution to be resolved
  and a separate governed admission; AI-142 provides no adapter, loader,
  runtime, subprocess, ONNX/llama.cpp wrapper, HTTP client or `execute()`.
- **AI-147 tournament integration.** An additive reference from an AI-120
  candidate record to `(candidate_id, evidence_revision, candidate_hash,
registry_hash)` is the intended extension point. AI-120 contracts and
  lifecycle state are unchanged here; no entry becomes
  `benchmark_candidate`, `shadow`, `canary`, `approved` or `preferred`,
  and `universal_winner` stays `false`.

## 11. Supply-chain and runtime boundary

`src/decision-candidates/` reaches only its own modules, the AI-140
canonical form/validation vocabulary and the pure AI-71 contract modules
(`tests/architecture/decision-candidate-registry-boundary.test.ts`). It
has no network, process, environment, filesystem, clock, dynamic import,
provider SDK, model loader or inference runtime access, is not consumed by
any production, API, server, tournament or evaluation module, and no
candidate source, weight file or runtime configuration is present in the
repository. Validation is offline and deterministic.

## 12. Initial upstream inventory

The initial inventory is requested for seven public GitHub repositories:
`NandhaKishorM/laya`, `bespokelabsai/nimble`, `jaredpalmer/kev`,
`theoleecj/semif`, `Rizzo-AI-Academy/rizzo-flow`, `wfzyx/von` and
`TianyuCodings/NanoJev`. Names, licenses and capabilities are not taken
from any prompt or prior assumption: each entry is added only after
independent, read-only evidence capture pinned to an exact commit.

Seed registry `ai-lab-typed-decision-candidates@1.0.0`
(`data/decision-candidates/v1/`), review state **`in_review`**, registry
hash `26c171586581d9ad3292181627c0638ec75af7f30d7dc495bbe5bc3df73ffd8e`.

**Capture method.** On 2026-09-26 (13:31–13:32 UTC), with human
authorization, each repository was fetched read-only as a shallow, bare,
blob-size-filtered clone with Git LFS smudging disabled, into a scratch
directory outside this repository: no working tree, no checkout, no
installation, no execution. The default-branch head at that moment is
the pinned commit. Each cited file was read from the pinned tree, its git
blob SHA recomputed from the exact bytes and its SHA-256 recorded. Only
short factual statements written for this registry are committed; no
upstream file is copied. The GitHub REST API and web UI were not
reachable from the capture environment, so repository metadata (the
archived flag) is `unresolved` for every entry; git-level HTTP responses
showed no redirect for any of the seven.

| Candidate                         | Pinned commit | Roles                                            | Code license           | Weights                                                  | Base model (license)                         | Training data         |
| --------------------------------- | ------------- | ------------------------------------------------ | ---------------------- | -------------------------------------------------------- | -------------------------------------------- | --------------------- |
| `tdc-nandhakishorm-laya`          | `4066d5d5…`   | `typed_decision_model`                           | evidenced `Apache-2.0` | involved, external; license `unresolved`                 | ModernBERT-large; mmBERT-base (`unresolved`) | `partially_evidenced` |
| `tdc-bespokelabsai-nimble`        | `62076b4f…`   | `research_methodology`, `typed_decision_model`   | **`unresolved`**       | involved, external; license `unresolved`                 | Qwen3.5-9B (`unresolved`)                    | `partially_evidenced` |
| `tdc-jaredpalmer-kev`             | `f1535963…`   | `research_methodology`, `typed_decision_model`   | evidenced `Apache-2.0` | involved, external; evidenced `apache-2.0` (model cards) | Qwen3.5 Base / Qwen3.8-27B (`unresolved`)    | `partially_evidenced` |
| `tdc-theoleecj-semif`             | `23cf1f39…`   | `research_methodology`, `typed_decision_adapter` | evidenced `MIT`        | not involved                                             | Qwen/Qwen3.5-4B (`unresolved`)               | `not_applicable`      |
| `tdc-rizzo-ai-academy-rizzo-flow` | `b9ba007e…`   | `typed_decision_model`, `typed_decision_runtime` | evidenced `Apache-2.0` | involved, external; license `unresolved`                 | Spark-X2.5-4B / 1.7B (`unresolved`)          | `partially_evidenced` |
| `tdc-wfzyx-von`                   | `fb6e7a93…`   | `typed_decision_model`                           | evidenced `Apache-2.0` | involved, external; evidenced `apache-2.0` (model card)  | ModernBERT-large (`unresolved`)              | `partially_evidenced` |
| `tdc-tianyucodings-nanojev`       | `76fdfc9e…`   | `research_methodology`, `typed_decision_model`   | evidenced `MIT`        | involved, external; license `unresolved`                 | Qwen3-0.6B (`unresolved`)                    | `partially_evidenced` |

Full commit SHAs, evidence locators, claims and gaps are in the entry
files. Notable recorded facts, none verified by AI LAB:

- **Nimble** has no project-level license file or license statement at
  the pinned revision; the only license file is scoped to a vendored agent
  skill directory. Its code license is therefore `unresolved`.
- **Kev** and **Von** declare their weight licenses in first-party model
  cards in the repository; that is the only reason their weight layer is
  `evidenced`. No other weight license is inferred from a code license
  or a README table.
- **Every base-model license is `unresolved`.** Candidates' statements
  about Qwen, ModernBERT or Spark-X2.5 licenses (README text, NOTICE,
  THIRD_PARTY files) are recorded as upstream claims or
  `third_party_notice` evidence, never as the base model's own license.
- **SemIf** is a direct-logit adapter over existing models and distributes
  no weights. **Rizzo Flow** is primarily a llama.cpp-based runtime that
  also ships its own fine-tuned weights since 2026-09-25. **Kev**'s four
  sizes stay one entry.
- **Von**'s option-order invariance is an upstream claim; its README gives
  two different calibration temperatures (1.0367 and 1.1692), recorded as
  an inconsistency.
- **NanoJev** reports results on gameplay tasks only.

Role assignment rule: a project that ships an SDK or server for its own
weights is a `typed_decision_model`; its serving surfaces are recorded as
`execution_surface` claims. `typed_decision_runtime` is reserved for
projects whose primary purpose is serving or orchestration
infrastructure.

## 13. Explicit non-goals

AI-142 does not run any candidate, clone candidate code for execution,
install candidate dependencies, download weights, call Hugging Face
inference or any LLM API, create adapters or a sandbox runner, benchmark
candidates, use AI-141 to score candidates, create a leaderboard, select a
winner, train or fine-tune anything, alter production traffic, alter
AI-120 lifecycle state, add credentials, create approval authority or
declare commercial/legal suitability.

## 14. Known limitations

- Entries and registries are hash-bound, not signed; the hash detects
  accidental change, not a forger. Consumers must re-validate.
- Repository metadata (archive state, default branch) is an observation at
  a point in time bound by a snapshot hash; it is not content-addressed
  by the upstream host.
- The seed capture could not observe the GitHub repository record, so
  every seed entry has `archive_state: "unresolved"`; redirects were
  checked only at the git HTTP layer.
- Only `github.com` is admitted as an upstream host in `1.0.0`.
- License identifiers are recorded as declared text; the validator checks
  shape and evidence kind, not legal meaning.

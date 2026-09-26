# ADR-009: SemIf Direct-Logit Method Adapter Baseline

- Status: proposed (specification, method fixture, synthetic logits, readiness evaluator, evidence pack, schemas and fixtures in review)
- Date: 2026-09-26

## Context

AI-140 through AI-143 defined typed decision contracts, the Gold Decision
evaluation set, an evidence-only candidate registry and a governed
synthetic-fixture execution boundary. No candidate-specific method path
existed. The AI-142 entry `tdc-theoleecj-semif` (evidence revision 1,
candidate hash `02c465ac9c13b88f0cda245eae350f45b0d91cd66b24e0ededf9d73df5228f29`)
describes a direct option-logit readout whose semantics are small and
documented at the pinned upstream commit, but whose actual execution
would need upstream Python code, a Qwen base model with an unresolved
license and unpinned runtime dependencies.

> AI-144 evaluates an AI-LAB-owned implementation of a pinned SemIf
> methodology using synthetic logits. It does not execute SemIf upstream
> code or any SemIf/Qwen model artifact.

> A method-conformance success is not evidence of model quality.

## Decision

1. Add a closed candidate adapter specification (contract `1.0.0`) that
   binds the exact AI-142 candidate id, hash and evidence revision, the
   pinned upstream commit `23cf1f39fc9534fe81437200959b6dfc7106e45a` with
   ten read-only evidence files (path, git blob SHA, content SHA-256),
   per-topic method interpretations with pinned dispositions, the exact
   AI-LAB-owned method artifact, fixed method parameters, choice-only
   scope, `calibration_state: "not_applied"`, `result_origin:
"synthetic_fixture"`, authority `none` and no eligibility. Drift in the
   AI-142 entry makes the specification stale; the candidate id alone is
   never followed.
2. Implement the method as AI-LAB-owned code (no upstream code copied) in
   one additional AI-143 `synthetic_fixture_adapter`,
   `ai-lab-direct-logit-method-fixture-adapter` `1.0.0`, allowlisted by
   exact SHA-256 under the unchanged fixture policy. The sandbox side stays
   candidate-neutral. Method: softmax with max subtraction over integer
   synthetic micro-logits bound by candidate id, computed in candidate-id
   order; integer micros by floor plus largest remainder (ties by
   candidate id); selection by unique maximum logit. A tie at the maximum
   selects nothing (the only upstream tie-break is positional and none is
   invented) and yields an explicit AI-140 abstention (`abstained`,
   `ambiguous`); a request with no reviewed synthetic logits yields an
   explicit AI-140 block (`blocked`, `execution_unavailable`). Both exit 0
   and are recorded by AI-143 as `succeeded` executions: decision-level
   outcomes are never encoded as process failures. Non-zero exits are
   reserved for technical defects.
3. Extend AI-143 preflight narrowly: allowlist entries declare
   `supported_decision_types` and `max_candidates`, and unsupported
   requests are blocked before process creation. Boolean, score and
   ranking are unsupported for this adapter.
4. Add repository-owned synthetic logit fixtures (never model outputs)
   bound to exact AI-140 request identities, and an evidence pack binding
   the candidate, upstream commit, methodology evidence, specification
   hash, artifact hash, fixture hashes, AI-143 policy hash and readiness
   blockers, with review state `draft | in_review` only.
5. Add a separate, pure actual-candidate execution readiness evaluator
   whose only state is `not_eligible_for_candidate_execution`. For SemIf
   the blockers are `archive_state_unresolved`,
   `base_model_license_unresolved`, `candidate_execution_not_authorized`,
   `hostile_code_isolation_not_established`, `model_artifact_not_bound`,
   `runtime_dependency_set_not_bound` and
   `upstream_code_not_admitted_to_sandbox`.
6. Hashes reuse the AI-140 `registry-json-v1` canonicalizer under new
   domains `vlatam-ai-lab:typed-decision-candidate-adapter-spec:v1`,
   `vlatam-ai-lab:typed-decision-synthetic-logit-fixture:v1` and
   `vlatam-ai-lab:typed-decision-candidate-adapter-evidence-pack:v1`.
   Inside the sandbox, the artifact emits its one fixed result shape in
   canonical key order; the runtime recomputes the AI-140 result hash on
   every output.

## Consequences

AI LAB has one candidate-specific, conformance-tested method path whose
provenance is explicit and whose numbers are synthetic. Nothing is
benchmarked, calibrated, ranked or promoted; AI-141 and AI-120 are not
wired; the registered SemIf candidate stays non-executable and
`ai_lab_executed` stays `false`. Executing the real path needs separately
reviewed isolation, execution authorization, base-model license evidence,
a bound model artifact and dependency set, and an AI-140 `result_origin`
extension. AI-145 is not started. See
`docs/architecture/ai-semif-direct-logit-method-adapter.md`.

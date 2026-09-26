/**
 * AI-144 — SemIf Direct-Logit Method Adapter Baseline: contract types and
 * fixed constants.
 *
 * AI-144 evaluates an AI-LAB-owned implementation of a pinned SemIf
 * methodology using synthetic logits. It does not execute SemIf upstream
 * code or any SemIf/Qwen model artifact.
 *
 * AI-144 executes candidate-specific methodology, not candidate-supplied
 * code or model weights. A method-conformance success is not evidence of
 * model quality.
 *
 * This layer records three persisted, hash-bound artifacts:
 *
 *  - a closed candidate adapter specification that binds one exact AI-142
 *    candidate evidence revision (`candidate_id`, `candidate_hash`,
 *    `evidence_revision`), the pinned upstream methodology evidence, and
 *    the exact AI-LAB-owned method artifact admitted by the AI-143 fixture
 *    sandbox;
 *  - repository-owned synthetic logit fixtures (numbers, never model
 *    outputs) keyed by exact AI-140 request identity and candidate ids;
 *  - an evidence pack that binds all of the above plus the actual-candidate
 *    execution readiness blockers.
 *
 * Invariants (full statement in
 * `docs/architecture/ai-semif-direct-logit-method-adapter.md`):
 *
 *  1. The AI-142 candidate is not executable. The method artifact is a
 *     separate, AI-LAB-owned `synthetic_fixture_adapter` subject; AI-142
 *     `ai_lab_executed` stays `false`.
 *  2. The candidate binding is exact. A different candidate hash or
 *     evidence revision makes the specification stale until a separately
 *     reviewed rebinding; the candidate id alone is never followed.
 *  3. Results keep `result_origin: "synthetic_fixture"`; nothing implies
 *     the result came from SemIf, Qwen or any model.
 *  4. No calibration is applied or claimed. Upstream calibration claims
 *     remain upstream claims.
 *  5. Actual-candidate execution readiness is always
 *     `not_eligible_for_candidate_execution` in contract `1.0.0`; there is
 *     no eligible or approved state.
 *  6. Authority is `none`: no benchmark, promotion, production or routing
 *     eligibility. Evidence packs are `draft` or `in_review` only.
 */

export const CANDIDATE_METHOD_CONTRACT_VERSION = "1.0.0" as const;
export const SUPPORTED_CANDIDATE_METHOD_CONTRACT_MAJORS = [1] as const;

// ---------------------------------------------------------------------
// Exact AI-142 candidate binding and pinned upstream methodology source
// ---------------------------------------------------------------------

export interface CandidateMethodCandidateBinding {
  readonly candidate_id: string;
  readonly candidate_hash: string;
  readonly evidence_revision: number;
}

/**
 * The one AI-142 candidate evidence revision this specification binds.
 * Changing the AI-142 entry changes its hash and makes every AI-144
 * artifact bound to this constant stale until a reviewed rebinding.
 */
export const SEMIF_CANDIDATE_BINDING: CandidateMethodCandidateBinding =
  Object.freeze({
    candidate_id: "tdc-theoleecj-semif",
    candidate_hash:
      "02c465ac9c13b88f0cda245eae350f45b0d91cd66b24e0ededf9d73df5228f29",
    evidence_revision: 1,
  });

/** The pinned upstream repository and immutable commit read for evidence. */
export const SEMIF_METHODOLOGY_UPSTREAM = Object.freeze({
  repository: "TheoLeeCJ/SemIf-OpenJev",
  commit_sha: "23cf1f39fc9534fe81437200959b6dfc7106e45a",
} as const);

// ---------------------------------------------------------------------
// Methodology evidence and interpretation
// ---------------------------------------------------------------------

/**
 * One upstream file read at the pinned commit (read-only evidence; never
 * executed, installed or vendored). Bound by path, git blob SHA and the
 * SHA-256 of the exact bytes.
 */
export interface CandidateMethodEvidence {
  readonly evidence_id: string;
  readonly path: string;
  readonly blob_sha: string;
  readonly content_sha256: string;
}

/**
 * Closed method-interpretation topics. Each records what the pinned
 * upstream evidence says and what the AI-LAB implementation does.
 */
export const CANDIDATE_METHOD_INTERPRETATION_TOPICS = [
  "boolean_decisions",
  "calibration",
  "logit_source",
  "normalization",
  "option_construction",
  "option_ordering",
  "probability_representation",
  "prompt_construction",
  "score_and_ranking_decisions",
  "selection",
  "top_logit_tie",
] as const;
export type CandidateMethodInterpretationTopic =
  (typeof CANDIDATE_METHOD_INTERPRETATION_TOPICS)[number];

/**
 *  - `adopted`: reproduced as documented upstream.
 *  - `ai_lab_policy`: not defined upstream; an explicit AI-LAB rule that
 *    does not change method semantics (for example integer micros).
 *  - `replaced_by_synthetic`: upstream obtains the value from a model;
 *    AI-144 substitutes repository-owned synthetic values.
 *  - `not_applicable`: requires a tokenizer or model; nothing is built.
 *  - `not_applied`: available upstream but deliberately not applied.
 *  - `not_supported`: not faithfully representable; fails closed.
 *  - `fail_closed`: upstream behavior is ambiguous or positional; the
 *    adapter refuses rather than inventing behavior.
 */
export const CANDIDATE_METHOD_INTERPRETATION_DISPOSITIONS = [
  "adopted",
  "ai_lab_policy",
  "fail_closed",
  "not_applicable",
  "not_applied",
  "not_supported",
  "replaced_by_synthetic",
] as const;
export type CandidateMethodInterpretationDisposition =
  (typeof CANDIDATE_METHOD_INTERPRETATION_DISPOSITIONS)[number];

export interface CandidateMethodInterpretation {
  readonly topic: CandidateMethodInterpretationTopic;
  readonly disposition: CandidateMethodInterpretationDisposition;
  readonly statement: string;
  /** Strictly ascending evidence ids of this specification. */
  readonly evidence_refs: readonly string[];
}

export interface CandidateMethodMethodology {
  readonly upstream_repository: string;
  readonly upstream_commit: string;
  /** Strictly ascending by `evidence_id`. */
  readonly evidence: readonly CandidateMethodEvidence[];
  /** Strictly ascending by `topic`; every topic exactly once. */
  readonly interpretations: readonly CandidateMethodInterpretation[];
}

// ---------------------------------------------------------------------
// Implementation provenance and method parameters
// ---------------------------------------------------------------------

/**
 * AI-LAB wrote the method; no upstream code was copied. The executable
 * artifact is the AI-143 allowlisted `synthetic_fixture_adapter` bound by
 * exact SHA-256, never a registered candidate.
 */
export interface CandidateMethodImplementation {
  readonly ownership: "ai_lab";
  readonly implementation_kind: "method_reimplementation";
  readonly upstream_code_reused: false;
  readonly sandbox_subject_kind: "synthetic_fixture_adapter";
  readonly adapter_id: string;
  readonly adapter_version: string;
  readonly artifact_path: string;
  readonly artifact_sha256: string;
}

/** Hard bounds of the method, from the pinned upstream evidence. */
export const DIRECT_LOGIT_METHOD_LIMITS = {
  /** Upstream `validate_row`: 2-16 options (answer letters A-P). */
  min_candidates: 2,
  max_candidates: 16,
  /** Synthetic logits are fixed-point integers: 1 logit = 1_000_000. */
  logit_micros_scale: 1_000_000,
  /** |logit| <= 100, so every softmax weight is a finite positive double. */
  max_abs_logit_micros: 100_000_000,
} as const;

export interface DirectLogitMethodParameters {
  readonly readout: "direct_option_logits";
  readonly logit_source: "repository_owned_synthetic_logits";
  readonly logit_unit: "micro_logit";
  readonly max_abs_logit_micros: number;
  readonly min_candidates: number;
  readonly max_candidates: number;
  /** Logits bind to stable candidate ids, never to array position. */
  readonly logit_binding: "candidate_id";
  readonly normalization: "softmax_max_shift_candidate_id_order";
  readonly probability_rounding: "floor_then_largest_remainder_candidate_id_ascending";
  readonly selection: "unique_maximum_logit";
  readonly top_logit_tie: "fail_closed";
  readonly distribution: "complete";
}

export const DIRECT_LOGIT_METHOD_PARAMETERS: DirectLogitMethodParameters =
  Object.freeze({
    readout: "direct_option_logits",
    logit_source: "repository_owned_synthetic_logits",
    logit_unit: "micro_logit",
    max_abs_logit_micros: DIRECT_LOGIT_METHOD_LIMITS.max_abs_logit_micros,
    min_candidates: DIRECT_LOGIT_METHOD_LIMITS.min_candidates,
    max_candidates: DIRECT_LOGIT_METHOD_LIMITS.max_candidates,
    logit_binding: "candidate_id",
    normalization: "softmax_max_shift_candidate_id_order",
    probability_rounding: "floor_then_largest_remainder_candidate_id_ascending",
    selection: "unique_maximum_logit",
    top_logit_tie: "fail_closed",
    distribution: "complete",
  });

/**
 * AI-140 decision types this first adapter faithfully represents. The
 * pinned direct mode reads 2-16 described options; AI-140 `boolean`
 * declares no described alternatives and `score`/`ranking` have no direct
 * mode upstream, so they fail closed before process creation.
 */
export const DIRECT_LOGIT_SUPPORTED_DECISION_TYPES = ["choice"] as const;
export const DIRECT_LOGIT_UNSUPPORTED_DECISION_TYPES = [
  "boolean",
  "ranking",
  "score",
] as const;

// ---------------------------------------------------------------------
// Candidate adapter specification
// ---------------------------------------------------------------------

export interface CandidateAdapterSpec {
  readonly contract: "typed_decision_candidate_adapter_spec";
  readonly schema_version: string;
  readonly adapter_spec_id: string;
  readonly adapter_spec_version: string;
  readonly candidate_binding: CandidateMethodCandidateBinding;
  readonly methodology: CandidateMethodMethodology;
  readonly implementation: CandidateMethodImplementation;
  readonly method: DirectLogitMethodParameters;
  readonly supported_decision_types: readonly (typeof DIRECT_LOGIT_SUPPORTED_DECISION_TYPES)[number][];
  readonly unsupported_decision_types: readonly (typeof DIRECT_LOGIT_UNSUPPORTED_DECISION_TYPES)[number][];
  /** Softmax over declared options is conditional, never calibrated. */
  readonly probability_semantics: "conditional_on_declared_options_uncalibrated";
  readonly calibration_state: "not_applied";
  readonly confidence_semantics: "uncalibrated_candidate_reported";
  readonly execution_mode: "synthetic_logits_only";
  readonly result_origin: "synthetic_fixture";
  readonly authority: "none";
  readonly benchmark_eligible: false;
  readonly promotion_eligible: false;
  readonly production_eligible: false;
  readonly adapter_spec_hash: string;
}

// ---------------------------------------------------------------------
// Synthetic logit fixture
// ---------------------------------------------------------------------

export interface SyntheticLogitRequestBinding {
  readonly capability_id: string;
  /** AI-140 semantic request hash (display-order independent). */
  readonly semantic_request_hash: string;
  /**
   * Exact AI-140 request hashes this fixture answers, strictly ascending.
   * The sandboxed artifact cannot canonicalize a request, so it looks a
   * fixture up by the exact request hash the runtime verified.
   */
  readonly request_hashes: readonly string[];
}

export interface SyntheticLogitEntry {
  readonly candidate_id: string;
  /** Fixed-point logit: integer micro-logits. */
  readonly logit_micros: number;
}

/**
 * Repository-owned deterministic synthetic logits. Not a model and not a
 * model output: numbers that stand in for model-like evidence so the
 * candidate-specific readout can be exercised. No natural-language
 * inference is performed.
 */
export interface SyntheticLogitFixture {
  readonly contract: "typed_decision_synthetic_logit_fixture";
  readonly schema_version: string;
  readonly fixture_id: string;
  readonly provenance: "repository_owned_synthetic";
  readonly model_output: false;
  readonly request_binding: SyntheticLogitRequestBinding;
  readonly logit_unit: "micro_logit";
  /** Strictly ascending by `candidate_id`; bound by id, never position. */
  readonly candidate_logits: readonly SyntheticLogitEntry[];
  readonly fixture_hash: string;
}

export const SYNTHETIC_LOGIT_FIXTURE_LIMITS = {
  max_request_hashes: 8,
} as const;

// ---------------------------------------------------------------------
// Actual-candidate execution readiness
// ---------------------------------------------------------------------

/**
 * The only readiness state in `1.0.0`. There is deliberately no eligible,
 * ready or approved state: AI-144 grants no authority to execute the
 * upstream candidate or any model.
 */
export const CANDIDATE_EXECUTION_READINESS_STATES = [
  "not_eligible_for_candidate_execution",
] as const;
export type CandidateExecutionReadinessState =
  (typeof CANDIDATE_EXECUTION_READINESS_STATES)[number];

/**
 * Blockers for executing the actual upstream candidate/model path. The
 * AI-142 evidence gap codes are carried through verbatim; the rest are
 * AI-144 codes. Evidence is never fabricated to reduce this list.
 */
export const CANDIDATE_EXECUTION_BLOCKERS = [
  "archive_state_unresolved",
  "base_model_license_unresolved",
  "candidate_binding_stale",
  "candidate_entry_invalid",
  "candidate_execution_not_authorized",
  "code_license_unresolved",
  "hostile_code_isolation_not_established",
  "model_artifact_not_bound",
  "runtime_dependency_set_not_bound",
  "training_data_provenance_incomplete",
  "upstream_code_not_admitted_to_sandbox",
  "weights_involvement_unresolved",
  "weights_license_unresolved",
  "weights_location_unresolved",
] as const;
export type CandidateExecutionBlocker =
  (typeof CANDIDATE_EXECUTION_BLOCKERS)[number];

/**
 * Blockers that hold for every candidate in AI-144, whatever its evidence:
 * no authority exists, the AI-143 sandbox admits only repository-owned
 * fixtures and establishes no hostile-code containment, and no model
 * artifact or runtime dependency set is bound.
 */
export const CANDIDATE_EXECUTION_STANDING_BLOCKERS = [
  "candidate_execution_not_authorized",
  "hostile_code_isolation_not_established",
  "model_artifact_not_bound",
  "runtime_dependency_set_not_bound",
  "upstream_code_not_admitted_to_sandbox",
] as const;

export interface CandidateExecutionReadiness {
  readonly state: CandidateExecutionReadinessState;
  /** Strictly ascending; never empty in `1.0.0`. */
  readonly blockers: readonly CandidateExecutionBlocker[];
}

// ---------------------------------------------------------------------
// Evidence pack
// ---------------------------------------------------------------------

/** No `approved`: a pack cannot approve itself. */
export const CANDIDATE_METHOD_REVIEW_STATES = ["draft", "in_review"] as const;
export type CandidateMethodReviewState =
  (typeof CANDIDATE_METHOD_REVIEW_STATES)[number];

export interface CandidateAdapterSpecBinding {
  readonly adapter_spec_id: string;
  readonly adapter_spec_version: string;
  readonly adapter_spec_hash: string;
}

export interface CandidateMethodArtifactBinding {
  readonly ownership: "ai_lab";
  readonly adapter_id: string;
  readonly adapter_version: string;
  readonly artifact_sha256: string;
}

export interface SyntheticLogitFixtureBinding {
  readonly fixture_id: string;
  readonly fixture_hash: string;
}

/** Facts this pack asserts about what did NOT happen. Constant `false`. */
export interface CandidateMethodExecutionFacts {
  readonly upstream_code_executed: false;
  readonly model_executed: false;
  readonly model_weights_downloaded: false;
  readonly candidate_dependencies_installed: false;
  /** The AI-142 lifecycle flag, unchanged. */
  readonly ai_lab_executed: false;
}

export interface CandidateAdapterEvidencePack {
  readonly contract: "typed_decision_candidate_adapter_evidence_pack";
  readonly schema_version: string;
  readonly pack_id: string;
  readonly candidate_binding: CandidateMethodCandidateBinding;
  readonly upstream_commit: string;
  readonly adapter_spec: CandidateAdapterSpecBinding;
  /** Exactly the specification's methodology evidence. */
  readonly methodology_evidence: readonly CandidateMethodEvidence[];
  readonly method_artifact: CandidateMethodArtifactBinding;
  /** Strictly ascending by `fixture_id`. */
  readonly synthetic_logit_fixtures: readonly SyntheticLogitFixtureBinding[];
  /** The unchanged AI-143 fixture sandbox policy hash. */
  readonly sandbox_policy_hash: string;
  readonly calibration_state: "not_applied";
  readonly result_origin: "synthetic_fixture";
  readonly execution_readiness: CandidateExecutionReadiness;
  readonly execution_facts: CandidateMethodExecutionFacts;
  readonly review: {
    readonly state: CandidateMethodReviewState;
    readonly human_review_required: true;
  };
  readonly authority: "none";
  readonly evidence_pack_hash: string;
}

// ---------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------

export const CANDIDATE_METHOD_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,127}$/;
export const CANDIDATE_METHOD_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
export const CANDIDATE_METHOD_SHA256_PATTERN = /^[a-f0-9]{64}$/;
export const CANDIDATE_METHOD_GIT_SHA_PATTERN = /^[a-f0-9]{40}$/;
/** Repository-relative upstream path; no traversal, no absolute path. */
export const CANDIDATE_METHOD_UPSTREAM_PATH_PATTERN =
  /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]{1,256}$/;
export const CANDIDATE_METHOD_MAX_STATEMENT_LENGTH = 320;
export const CANDIDATE_METHOD_MAX_EVIDENCE = 32;

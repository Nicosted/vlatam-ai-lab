/**
 * AI-142 — Governed Typed Decision Candidate Registry: contract types.
 *
 * A candidate registry records what we know.
 * It does not authorize what may run.
 *
 * A Typed Decision Candidate Entry is a reviewable, hash-bound inventory
 * record for one public upstream project that might, in a later and
 * separately reviewed PR, supply a typed decision model, adapter, runtime
 * or research methodology. It records exactly which upstream revision was
 * inspected, which evidence was read at that revision, the layered
 * licensing and provenance evidence, the upstream claims relevant to future
 * evaluation, and what is still unresolved. A registry manifest binds an
 * exact set of candidate entry hashes under one registry version.
 *
 * This layer inventories candidates. It never runs them: there is no
 * adapter, runtime, loader, sandbox, runner, transport, benchmark,
 * promotion or routing path behind this module.
 *
 * Invariants (full statement in
 * `docs/architecture/ai-typed-decision-candidate-registry.md`):
 *
 *  1. Registration is not execution, approval, benchmark eligibility or
 *     promotion eligibility.
 *  2. Upstream claims are evidence, not verified AI LAB facts. `1.0.0`
 *     admits only `verification: "upstream_claim"`.
 *  3. A repository name or license file does not grant execution
 *     authority.
 *  4. Code license, weight license, base-model license and training-data
 *     provenance are separate layers. None is inferred from another.
 *  5. Unknown licensing or provenance is recorded as `unresolved` and
 *     fails closed for any future execution.
 *  6. Candidates cannot define their own governance state, modify Gold
 *     Decision truth or self-promote. There is no universal winner.
 *  7. Evidence binds to an immutable upstream commit. Mutable branch
 *     references are rejected.
 *  8. Candidate identity (`candidate_id`) is distinct from candidate
 *     evidence revision (`evidence_revision`); a new upstream commit or
 *     new evidence is a new revision, never a silent rewrite.
 *  9. A registry cannot approve itself. `1.0.0` admits only the review
 *     states `draft` and `in_review`.
 * 10. AI LAB owns the registry contract and the authority boundary.
 */

export const DECISION_CANDIDATE_CONTRACT_VERSION = "1.0.0" as const;
export const SUPPORTED_DECISION_CANDIDATE_CONTRACT_MAJORS = [1] as const;

/**
 * Candidate roles. A role describes what kind of source an upstream
 * project is, not how good it is. Roles are never ranked.
 *
 *  - `typed_decision_model`: trained weights intended to emit typed
 *    decisions directly.
 *  - `typed_decision_adapter`: a technique or library that derives typed
 *    decisions from an existing model (for example direct-logit scoring);
 *    it is not itself a model.
 *  - `typed_decision_runtime`: serving or orchestration infrastructure;
 *    it is not model weights.
 *  - `research_methodology`: a training, evaluation or data methodology;
 *    it is not automatically an executable artifact.
 */
export const DECISION_CANDIDATE_ROLES = [
  "research_methodology",
  "typed_decision_adapter",
  "typed_decision_model",
  "typed_decision_runtime",
] as const;
export type DecisionCandidateRole = (typeof DECISION_CANDIDATE_ROLES)[number];

/** The only upstream host admitted in `1.0.0`. */
export const DECISION_CANDIDATE_UPSTREAM_HOSTS = ["github.com"] as const;
export type DecisionCandidateUpstreamHost =
  (typeof DECISION_CANDIDATE_UPSTREAM_HOSTS)[number];

/**
 * Archive state observed in repository metadata at capture time.
 * `unresolved` when the metadata could not be captured.
 */
export const DECISION_CANDIDATE_ARCHIVE_STATES = [
  "archived",
  "not_archived",
  "unresolved",
] as const;
export type DecisionCandidateArchiveState =
  (typeof DECISION_CANDIDATE_ARCHIVE_STATES)[number];

/**
 * Evidence kinds. `repository_metadata` is an observation snapshot of the
 * hosting platform's repository record, bound by a content hash of what
 * was observed; every other kind is a file at the pinned commit, bound by
 * path, git blob SHA and content SHA-256.
 *
 * `third_party_notice` (NOTICE, THIRD_PARTY files) records what the
 * candidate says about other projects' licenses. It is second-hand and
 * never establishes a licensing layer on its own.
 */
export const DECISION_CANDIDATE_EVIDENCE_KINDS = [
  "architecture_document",
  "dataset_document",
  "evaluation_document",
  "license",
  "model_card",
  "package_manifest",
  "readme",
  "repository_metadata",
  "third_party_notice",
] as const;
export type DecisionCandidateEvidenceKind =
  (typeof DECISION_CANDIDATE_EVIDENCE_KINDS)[number];

/**
 * Evidence kinds that may, on their own, establish a declared license
 * identifier for a licensing layer. A README badge, repository
 * description or package manifest alone never does.
 */
export const DECISION_CANDIDATE_LICENSE_EVIDENCE_KINDS = [
  "license",
  "model_card",
] as const;

/** Status of the code, weights and base-model licensing layers. */
export const DECISION_CANDIDATE_LICENSE_STATUSES = [
  "evidenced",
  "not_applicable",
  "unresolved",
] as const;
export type DecisionCandidateLicenseStatus =
  (typeof DECISION_CANDIDATE_LICENSE_STATUSES)[number];

/** Status of training-data provenance. */
export const DECISION_CANDIDATE_PROVENANCE_STATUSES = [
  "evidenced",
  "not_applicable",
  "partially_evidenced",
  "unresolved",
] as const;
export type DecisionCandidateProvenanceStatus =
  (typeof DECISION_CANDIDATE_PROVENANCE_STATUSES)[number];

/** Whether the upstream project involves trained weights at all. */
export const DECISION_CANDIDATE_WEIGHTS_INVOLVEMENT = [
  "involved",
  "not_involved",
  "unresolved",
] as const;
export type DecisionCandidateWeightsInvolvement =
  (typeof DECISION_CANDIDATE_WEIGHTS_INVOLVEMENT)[number];

/**
 * Where declared weights live. Weights are never downloaded by AI LAB;
 * an `external_reference` is recorded as declared text only.
 */
export const DECISION_CANDIDATE_WEIGHTS_LOCATIONS = [
  "external_reference",
  "in_repository",
  "not_applicable",
  "unresolved",
] as const;
export type DecisionCandidateWeightsLocation =
  (typeof DECISION_CANDIDATE_WEIGHTS_LOCATIONS)[number];

/**
 * Kinds of upstream claim relevant to future evaluation or integration.
 * Every claim is upstream evidence only.
 */
export const DECISION_CANDIDATE_CLAIM_KINDS = [
  "base_model_relationship",
  "calibration",
  "evaluation_documentation",
  "execution_surface",
  "invariance",
  "language_support",
  "performance",
  "training_methodology",
  "weights_reference",
] as const;
export type DecisionCandidateClaimKind =
  (typeof DECISION_CANDIDATE_CLAIM_KINDS)[number];

/**
 * Claim verification basis. `1.0.0` admits only `upstream_claim`: a
 * README or document saying something is never AI LAB verification.
 * Behavioral verification requires a future, separately reviewed
 * contract that binds AI LAB evaluation evidence.
 */
export const DECISION_CANDIDATE_CLAIM_VERIFICATIONS = [
  "upstream_claim",
] as const;
export type DecisionCandidateClaimVerification =
  (typeof DECISION_CANDIDATE_CLAIM_VERIFICATIONS)[number];

/**
 * Evidence gaps. Every code is derived deterministically from the entry
 * fields; the declared list must equal the derived list exactly.
 */
export const DECISION_CANDIDATE_EVIDENCE_GAPS = [
  "archive_state_unresolved",
  "base_model_license_unresolved",
  "code_license_unresolved",
  "training_data_provenance_incomplete",
  "weights_involvement_unresolved",
  "weights_license_unresolved",
  "weights_location_unresolved",
] as const;
export type DecisionCandidateEvidenceGap =
  (typeof DECISION_CANDIDATE_EVIDENCE_GAPS)[number];

export const DECISION_CANDIDATE_EVIDENCE_COMPLETENESS = [
  "complete",
  "incomplete",
] as const;
export type DecisionCandidateEvidenceCompleteness =
  (typeof DECISION_CANDIDATE_EVIDENCE_COMPLETENESS)[number];

/**
 * The only registry state admitted by `1.0.0`. It is the first state of
 * the AI-120 tournament lifecycle vocabulary and grants nothing: no
 * sandbox, benchmark, shadow, canary, approval or preference.
 */
export const DECISION_CANDIDATE_REGISTRY_STATES = ["discovered"] as const;
export type DecisionCandidateRegistryState =
  (typeof DECISION_CANDIDATE_REGISTRY_STATES)[number];

/**
 * Registry review states admitted by `1.0.0`: a strict subset of the
 * repository's gold review vocabulary. `approved` is deliberately NOT
 * admitted; publication requires binding the exact `registry_hash` to the
 * existing governed human-review authority in a later reviewed change.
 */
export const DECISION_CANDIDATE_REGISTRY_REVIEW_STATES = [
  "draft",
  "in_review",
] as const;
export type DecisionCandidateRegistryReviewState =
  (typeof DECISION_CANDIDATE_REGISTRY_REVIEW_STATES)[number];

export const DECISION_CANDIDATE_LIMITS = {
  max_candidates: 256,
  max_evidence: 32,
  max_claims: 48,
  max_refs: 16,
  max_display_name_length: 80,
  max_statement_length: 280,
  max_path_length: 512,
  max_declared_text_length: 128,
} as const;

/** AI LAB-owned stable candidate identity, independent of display names. */
export const DECISION_CANDIDATE_ID_PATTERN = /^tdc-[a-z0-9][a-z0-9-]{1,60}$/;
/** Evidence and claim identifiers, unique within one entry. */
export const DECISION_CANDIDATE_LOCAL_ID_PATTERN =
  /^[a-z0-9][a-z0-9._-]{1,63}$/;
export const DECISION_CANDIDATE_REGISTRY_ID_PATTERN =
  /^[a-z0-9][a-z0-9._-]{1,127}$/;
export const DECISION_CANDIDATE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
/** Full 40-hex git commit or blob identity. Abbreviations are rejected. */
export const DECISION_CANDIDATE_GIT_SHA_PATTERN = /^[a-f0-9]{40}$/;
export const DECISION_CANDIDATE_SHA256_PATTERN = /^[a-f0-9]{64}$/;
/** `owner/name` on the upstream host. */
export const DECISION_CANDIDATE_REPOSITORY_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
/** UTC second-precision timestamp. */
export const DECISION_CANDIDATE_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
/** Declared license identifier text (SPDX-like), recorded verbatim. */
export const DECISION_CANDIDATE_DECLARED_IDENTIFIER_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$/;

// ---------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------

export interface DecisionCandidateRoleClaim {
  readonly role: DecisionCandidateRole;
  /** Evidence ids in this entry supporting the role; strictly ascending. */
  readonly evidence_refs: readonly string[];
}

export interface DecisionCandidateUpstream {
  readonly host: DecisionCandidateUpstreamHost;
  /** The `owner/name` AI LAB was asked to inspect. */
  readonly requested_repository: string;
  /**
   * The `owner/name` the host resolved at observation. Differs from
   * `requested_repository` only when the repository moved or redirects.
   */
  readonly repository: string;
  /** Exactly `https://github.com/<repository>`. */
  readonly repository_url: string;
  /** The exact upstream commit inspected. Never a branch or tag name. */
  readonly pinned_commit_sha: string;
  /** Branch name only; never execution identity. */
  readonly default_branch_at_observation: string;
  readonly archive_state: DecisionCandidateArchiveState;
  readonly observed_at: string;
}

export interface DecisionCandidateEvidenceLocator {
  readonly repository: string;
  readonly commit_sha: string;
  /** File path at the commit; `null` only for `repository_metadata`. */
  readonly path: string | null;
  /** Git blob SHA of the file; `null` only for `repository_metadata`. */
  readonly blob_sha: string | null;
  /**
   * Immutable source locator: `https://github.com/<repo>/blob/<sha>/<path>`
   * for files, `https://github.com/<repo>/tree/<sha>` for metadata.
   */
  readonly source_url: string;
}

export interface DecisionCandidateEvidence {
  readonly evidence_id: string;
  readonly evidence_kind: DecisionCandidateEvidenceKind;
  readonly locator: DecisionCandidateEvidenceLocator;
  /** SHA-256 of the exact bytes observed. */
  readonly content_sha256: string;
  readonly observed_at: string;
}

export interface DecisionCandidateLicenseLayer {
  readonly status: DecisionCandidateLicenseStatus;
  /** Declared identifier text, verbatim; never a legal conclusion. */
  readonly declared_identifier: string | null;
  /** Strictly ascending evidence ids. */
  readonly evidence_refs: readonly string[];
}

export interface DecisionCandidateWeightsLayer {
  readonly involvement: DecisionCandidateWeightsInvolvement;
  readonly location: DecisionCandidateWeightsLocation;
  /** Declared external weight locator text; never fetched. */
  readonly declared_reference: string | null;
  readonly status: DecisionCandidateLicenseStatus;
  readonly declared_identifier: string | null;
  readonly evidence_refs: readonly string[];
}

export interface DecisionCandidateBaseModelLayer {
  readonly status: DecisionCandidateLicenseStatus;
  /** Declared base model name text, when upstream evidence names one. */
  readonly declared_name: string | null;
  readonly declared_identifier: string | null;
  readonly evidence_refs: readonly string[];
}

export interface DecisionCandidateTrainingDataLayer {
  readonly status: DecisionCandidateProvenanceStatus;
  readonly evidence_refs: readonly string[];
}

/**
 * Layered licensing. Each layer is recorded independently; none is
 * inferred from another. AI-142 records license evidence; it does not
 * provide legal advice, legal approval or commercial suitability.
 */
export interface DecisionCandidateLicensing {
  readonly code: DecisionCandidateLicenseLayer;
  readonly weights: DecisionCandidateWeightsLayer;
  readonly base_model: DecisionCandidateBaseModelLayer;
  readonly training_data: DecisionCandidateTrainingDataLayer;
}

export interface DecisionCandidateClaim {
  readonly claim_id: string;
  readonly claim_kind: DecisionCandidateClaimKind;
  /** Concise factual extraction, never a copied document. */
  readonly statement: string;
  /** At least one evidence id; strictly ascending. */
  readonly evidence_refs: readonly string[];
  /** Constant in `1.0.0`: upstream evidence, not AI LAB verification. */
  readonly verification: DecisionCandidateClaimVerification;
}

/**
 * Fail-closed lifecycle. Every flag is a constant `false`; there is no
 * activation control, approval reference or kill-switch toggle to set.
 */
export interface DecisionCandidateLifecycle {
  readonly registry_state: DecisionCandidateRegistryState;
  readonly ai_lab_executed: false;
  readonly execution_enabled: false;
  readonly benchmark_execution_enabled: false;
  readonly promotion_eligible: false;
  readonly production_eligible: false;
  readonly routing_enabled: false;
  readonly authority: "evidence_only";
}

export interface DecisionCandidateEntry {
  readonly contract: "typed_decision_candidate_entry";
  readonly schema_version: string;
  /** Stable AI LAB identity; unchanged across evidence revisions. */
  readonly candidate_id: string;
  /** Monotonic evidence revision of this candidate, starting at 1. */
  readonly evidence_revision: number;
  /** Previous revision this one supersedes, or `null` for revision 1. */
  readonly supersedes: {
    readonly evidence_revision: number;
    readonly candidate_hash: string;
  } | null;
  /** Human-readable label only; carries no identity or authority. */
  readonly display_name: string;
  /** Strictly ascending by role. */
  readonly roles: readonly DecisionCandidateRoleClaim[];
  readonly upstream: DecisionCandidateUpstream;
  /** Strictly ascending by `evidence_id`. */
  readonly evidence: readonly DecisionCandidateEvidence[];
  readonly licensing: DecisionCandidateLicensing;
  /** Strictly ascending by `claim_id`. */
  readonly upstream_claims: readonly DecisionCandidateClaim[];
  /** Derived, strictly ascending. */
  readonly evidence_gaps: readonly DecisionCandidateEvidenceGap[];
  /** Derived: `complete` iff `evidence_gaps` is empty. */
  readonly evidence_completeness: DecisionCandidateEvidenceCompleteness;
  readonly lifecycle: DecisionCandidateLifecycle;
  readonly candidate_hash: string;
}

// ---------------------------------------------------------------------
// Registry manifest
// ---------------------------------------------------------------------

export interface DecisionCandidateRegistryEntryBinding {
  readonly candidate_id: string;
  readonly evidence_revision: number;
  readonly candidate_hash: string;
  readonly repository: string;
  readonly pinned_commit_sha: string;
  /** The entry's roles, strictly ascending. */
  readonly roles: readonly DecisionCandidateRole[];
  readonly evidence_completeness: DecisionCandidateEvidenceCompleteness;
}

export interface DecisionCandidateRegistryReview {
  /** `draft` or `in_review`; never self-declared `approved`. */
  readonly state: DecisionCandidateRegistryReviewState;
  readonly human_review_required: true;
}

/** Map from key to count; must equal recomputed counts. */
export type DecisionCandidateDistribution = Readonly<Record<string, number>>;

export interface DecisionCandidateRegistry {
  readonly contract: "typed_decision_candidate_registry";
  readonly schema_version: string;
  readonly registry_id: string;
  readonly registry_version: string;
  readonly review: DecisionCandidateRegistryReview;
  readonly supersedes: {
    readonly registry_version: string;
    readonly registry_hash: string;
  } | null;
  /** Constant: the registry is inventory evidence, not authority. */
  readonly authority: "evidence_only";
  /** Constant: no candidate is ranked, preferred or declared a winner. */
  readonly universal_winner: false;
  /** Strictly ascending by `candidate_id`. */
  readonly candidates: readonly DecisionCandidateRegistryEntryBinding[];
  /** Candidates declaring each role (a candidate may count under several). */
  readonly role_distribution: DecisionCandidateDistribution;
  readonly evidence_completeness_distribution: DecisionCandidateDistribution;
  readonly registry_hash: string;
}

import type { NormalizedUsage } from '../governance/index.js';

export const EVALUATION_CONTRACT_VERSION = '1.0.0';
export const EVALUATION_DIMENSION_TYPES = ['schema_validity','required_field_completeness','exact_value','allowed_value','evidence_presence','correct_abstention','correct_policy_blocking','latency_metadata','usage_metadata'] as const;
export type EvaluationDimensionType = (typeof EVALUATION_DIMENSION_TYPES)[number];
export interface VersionedRef { readonly id: string; readonly version: string; }
export interface CapabilityProfileReference { readonly capability_id: string; readonly capability_version: string; readonly profile_id: string; readonly profile_version: string; }
export interface EvaluatorIdentity { readonly evaluator_id: string; readonly evaluator_version: string; }
export interface ExpectedOutcome { readonly status?: 'succeeded'|'failed'|'blocked'; readonly output?: unknown; readonly abstain?: boolean; readonly policy_blocked?: boolean; }
export interface NormalizedObservedOutcome { readonly schema_version: string; readonly status: 'succeeded'|'failed'|'blocked'; readonly output?: unknown; readonly error_code?: string; readonly evidence_count: number; readonly citation_count: number; readonly abstained: boolean; readonly policy_blocked: boolean; readonly latency_ms?: number; readonly usage?: NormalizedUsage; }
interface BaseDimension { readonly dimension_id: string; readonly type: EvaluationDimensionType; readonly weight_units: number; }
export type EvaluationDimension =
  | (BaseDimension & { readonly type: 'schema_validity'; readonly schema: Readonly<Record<string, unknown>> })
  | (BaseDimension & { readonly type: 'required_field_completeness'; readonly required_paths: readonly string[] })
  | (BaseDimension & { readonly type: 'exact_value'; readonly path: string; readonly expected: unknown })
  | (BaseDimension & { readonly type: 'allowed_value'; readonly path: string; readonly allowed: readonly unknown[] })
  | (BaseDimension & { readonly type: 'evidence_presence'; readonly minimum_evidence?: number; readonly minimum_citations?: number })
  | (BaseDimension & { readonly type: 'correct_abstention'; readonly expected: boolean })
  | (BaseDimension & { readonly type: 'correct_policy_blocking'; readonly expected: boolean })
  | (BaseDimension & { readonly type: 'latency_metadata'; readonly maximum_ms: number })
  | (BaseDimension & { readonly type: 'usage_metadata'; readonly required_status?: NormalizedUsage['status']; readonly maximum_total_tokens?: number });
export interface EvaluationCase { readonly case_id: string; readonly version: string; readonly input: unknown; readonly expected: ExpectedOutcome; readonly dimensions: readonly EvaluationDimension[]; }
export interface EvaluationSuite { readonly suite_id: string; readonly version: string; readonly contract_version: string; readonly evaluator: EvaluatorIdentity; readonly capability_profile: CapabilityProfileReference; readonly cases: readonly EvaluationCase[]; }
export const GOLD_REVIEW_STATUSES = ['draft','in_review','approved','rejected'] as const;
export type GoldReviewStatus = (typeof GOLD_REVIEW_STATUSES)[number];
export interface GoldProvenance { readonly provenance_id: string; readonly authority: string; readonly jurisdiction: string; readonly source_ref: string; readonly snapshot_version: string; readonly accessed_at: string; readonly effective_from?: string; readonly effective_to?: string; }
export interface GoldExpectedOutcome extends ExpectedOutcome { readonly required_facts: readonly string[]; readonly acceptable_alternatives: readonly string[]; readonly forbidden_assertions: readonly string[]; readonly mandatory_abstention_conditions: readonly string[]; readonly required_evidence: readonly string[]; readonly required_clarification_questions: readonly string[]; readonly human_review_triggers: readonly string[]; }
export interface RegulatoryGoldCase extends Omit<EvaluationCase,'expected'> { readonly suite_ref: VersionedRef; readonly jurisdiction_scope: readonly string[]; readonly regulatory_topic: string; readonly expected: GoldExpectedOutcome; readonly provenance_refs: readonly string[]; readonly evidence_ids: readonly string[]; readonly review_status: GoldReviewStatus; readonly reviewer_role: string; readonly reviewed_by?: string; readonly reviewed_at?: string; readonly temporal_validity: { readonly valid_from: string; readonly valid_to?: string; readonly as_of: string; readonly status: 'current'|'stale'|'requires_review' }; readonly supersedes?: VersionedRef; readonly superseded_by?: VersionedRef; }
export interface RegulatoryGoldSuite extends Omit<EvaluationSuite,'cases'> { readonly corpus_kind: 'regulatory_gold'; readonly cases: readonly RegulatoryGoldCase[]; readonly provenance: readonly GoldProvenance[]; }
export interface ReplayObservation { readonly case_id: string; readonly case_version: string; readonly execution_id: string; readonly audit_correlation_id: string; readonly normalized_input: unknown; readonly normalized_output: NormalizedObservedOutcome; }
export interface DimensionResult { readonly dimension_id: string; readonly dimension_type: EvaluationDimensionType; readonly passed: boolean; readonly earned_units: number; readonly possible_units: number; readonly reason_code: string; }
export interface CaseEvaluationResult { readonly case_id: string; readonly case_version: string; readonly execution_id: string; readonly audit_correlation_id: string; readonly normalized_input_hash: string; readonly normalized_output_hash: string; readonly dimension_results: readonly DimensionResult[]; readonly earned_units: number; readonly possible_units: number; }
export interface EvaluationAggregateReport { readonly schema_version: string; readonly report_id: string; readonly suite_id: string; readonly suite_version: string; readonly capability_profile: CapabilityProfileReference; readonly evaluator: EvaluatorIdentity; readonly created_at: string; readonly case_results: readonly CaseEvaluationResult[]; readonly earned_units: number; readonly possible_units: number; readonly score: { readonly numerator: number; readonly denominator: number }; }

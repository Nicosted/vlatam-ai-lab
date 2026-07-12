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
export interface ReplayObservation { readonly case_id: string; readonly case_version: string; readonly execution_id: string; readonly audit_correlation_id: string; readonly normalized_input: unknown; readonly normalized_output: NormalizedObservedOutcome; }
export interface DimensionResult { readonly dimension_id: string; readonly dimension_type: EvaluationDimensionType; readonly passed: boolean; readonly earned_units: number; readonly possible_units: number; readonly reason_code: string; }
export interface CaseEvaluationResult { readonly case_id: string; readonly case_version: string; readonly execution_id: string; readonly audit_correlation_id: string; readonly normalized_input_hash: string; readonly normalized_output_hash: string; readonly dimension_results: readonly DimensionResult[]; readonly earned_units: number; readonly possible_units: number; }
export interface EvaluationAggregateReport { readonly schema_version: string; readonly report_id: string; readonly suite_id: string; readonly suite_version: string; readonly capability_profile: CapabilityProfileReference; readonly evaluator: EvaluatorIdentity; readonly created_at: string; readonly case_results: readonly CaseEvaluationResult[]; readonly earned_units: number; readonly possible_units: number; readonly score: { readonly numerator: number; readonly denominator: number }; }

import type { CapabilityRequest } from '../capabilities/index.js';
import type { EvaluatorIdentity, NormalizedObservedOutcome, VersionedRef } from '../evaluation/index.js';

export const BENCHMARK_CONTRACT_VERSION = '1.0.0';
export const BENCHMARK_EXECUTION_MODES = ['live', 'replay'] as const;
export type BenchmarkExecutionMode = (typeof BENCHMARK_EXECUTION_MODES)[number];
export interface BenchmarkProfileRef { readonly profile_id: string; readonly profile_version: string; }
export const benchmarkProfileKey = (ref: BenchmarkProfileRef): string => `${ref.profile_id}@${ref.profile_version}`;
export interface BenchmarkRetryPolicy { readonly max_attempts: number; readonly retryable_error_codes: readonly string[]; }
export interface BenchmarkCampaignDefinition {
  readonly schema_version: '1.0.0'; readonly campaign_id: string; readonly campaign_version: string;
  readonly suite: VersionedRef & { readonly hash: string }; readonly profiles: readonly BenchmarkProfileRef[];
  readonly evaluator: EvaluatorIdentity; readonly ranking_policy: VersionedRef; readonly execution_mode: BenchmarkExecutionMode;
  readonly concurrency_limit: number; readonly retry_policy: BenchmarkRetryPolicy; readonly budget_policy_ref?: VersionedRef;
  readonly case_subset?: readonly VersionedRef[]; readonly allow_partial_reporting?: boolean; readonly created_at: string;
  readonly execution_correlation_id: string; readonly audit_correlation_id: string;
}
export interface BenchmarkReplayRecord { readonly profile: BenchmarkProfileRef; readonly case_ref: VersionedRef; readonly execution_id: string; readonly audit_correlation_id: string; readonly normalized_input: unknown; readonly normalized_output: NormalizedObservedOutcome; readonly usage?: { readonly input_tokens: number; readonly output_tokens: number; readonly total_tokens: number }; readonly cost_minor?: string; readonly currency?: string; readonly latency_ms?: number; }
export interface RetryMetadata { readonly attempt_number: number; readonly max_attempts: number; readonly retryable: boolean; readonly selected_final_attempt: boolean; }
export type CaseAttemptStatus = 'completed'|'failed'|'blocked'|'rejected';
export interface CaseAttempt { readonly case_ref: VersionedRef; readonly profile: BenchmarkProfileRef; readonly attempt_id: string; readonly execution_id: string; readonly audit_correlation_id: string; readonly status: CaseAttemptStatus; readonly retry: RetryMetadata; readonly error_code?: string; readonly observation?: BenchmarkReplayRecord; }
export interface ProfileRun { readonly profile: BenchmarkProfileRef; readonly profile_run_id: string; readonly audit_correlation_id: string; readonly attempts: readonly CaseAttempt[]; readonly status: 'completed'|'partial'|'failed'; }
export interface ExactRatio { readonly numerator: number; readonly denominator: number; }
export interface ProfileSummary { readonly profile: BenchmarkProfileRef; readonly eligible_case_count: number; readonly completed_count: number; readonly failed_count: number; readonly blocked_count: number; readonly rejected_count: number; readonly score: ExactRatio; readonly dimensions: readonly { dimension_id:string; earned_units:number; possible_units:number }[]; readonly abstention_passed:number; readonly human_review_required_count:number; readonly usage_totals:{input_tokens:number;output_tokens:number;total_tokens:number}; readonly exact_cost?:{amount_minor:string;currency:string}|undefined; readonly latency:{total_ms:number;maximum_ms:number}; readonly failure_reasons:readonly string[]; readonly suite_hash:string; readonly profile_hash:string; readonly coverage_complete:boolean; }
export interface RankingGate { readonly gate_id:string; readonly type:'coverage_complete'|'no_blocked_or_rejected'|'minimum_score'|'dimension_perfect'; readonly minimum_score?:ExactRatio; readonly dimension_type?:string; }
export type RankingTieBreaker = 'quality'|'abstention'|'reliability'|'cost'|'latency';
export interface RankingPolicy { readonly schema_version:'1.0.0'; readonly policy_id:string; readonly version:string; readonly mandatory_gates:readonly RankingGate[]; readonly tie_breakers:readonly RankingTieBreaker[]; }
export type DisqualificationReason = 'incomplete_coverage'|'partial_campaign'|'schema_or_policy_gate_failed'|'minimum_quality_not_met';
export interface RankingEntry { readonly profile:BenchmarkProfileRef; readonly rank?:number; readonly eligible:boolean; readonly disqualification_reasons:readonly DisqualificationReason[]; }
export interface RankingResult { readonly policy:VersionedRef; readonly approved_winner:boolean; readonly entries:readonly RankingEntry[]; }
export interface BenchmarkProvenance { readonly campaign_hash:string; readonly suite_hash:string; readonly profile_hashes:readonly {profile:BenchmarkProfileRef;hash:string}[]; readonly evaluator:EvaluatorIdentity; readonly ranking_policy:VersionedRef; }
export interface CampaignResult { readonly schema_version:'1.0.0'; readonly campaign:BenchmarkCampaignDefinition; readonly campaign_execution_id:string; readonly status:'completed'|'partial'|'failed'; readonly profile_runs:readonly ProfileRun[]; readonly profile_summaries:readonly ProfileSummary[]; readonly ranking:RankingResult; readonly provenance:BenchmarkProvenance; }
export interface BenchmarkLiveCaseInput { readonly request:CapabilityRequest; }

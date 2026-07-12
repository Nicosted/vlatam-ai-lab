/**
 * AI-71 capability contracts — policy declaration types.
 *
 * The types in this module are the *declaration* surface for
 * governance, evaluation, and execution requirements. AI-71 does not
 * enforce them. Enforcement belongs to:
 *
 *  - AI-73 (privacy and ZDR): the privacy requirement will be enforced
 *    at the adapter boundary and at the data-classification stage.
 *  - AI-74 (budget governor): the budget requirement will be enforced
 *    before any paid execution and on a per-window basis.
 *  - AI-75/77 (evaluation, benchmark): the evaluation requirement
 *    will be enforced before a profile is allowed to enter the
 *    production lifecycle.
 *  - AI-78 (best-profile router): the execution requirement will be
 *    enforced when the router picks a profile.
 *
 * The rule "absent requirement is a statement, not a default" is
 * implemented as follows: every block here is `Required` in the
 * `CapabilityDefinition`, even if all of its fields are empty arrays
 * or `false` flags. The contract is explicit; later layers add the
 * corresponding enforcement without changing the declaration surface.
 */

import type { ProviderExecution } from './contracts.js';

/**
 * `HumanReviewPolicy` declares whether the capability requires explicit
 * human judgment. It is the typed mirror of the catalog's
 * `human_review` field, plus a `review_state_required` hint used by
 * the contract validator to populate
 * `ResultGovernance.approval_state`.
 *
 * A capability whose `required: true` may NEVER declare
 * `auto_approval: true` (the runtime validator rejects the pair).
 */
export interface HumanReviewPolicy {
  readonly required: boolean;
  readonly reason: string;
  /**
   * Hint used by the runtime to populate `ResultGovernance.approval_state`
   * on `succeeded` results. The contract does not require a value;
   * absent means the runtime uses the catalog default
   * (`pending` when `required: true`, `not_required` otherwise).
   */
  readonly review_state_required?: 'reviewed_approved' | 'reviewed_rejected';
  /**
   * Hint for the routing layer (AI-78). The contract does not act on
   * this flag; it is a declaration that the capability should never be
   * routed past a human checkpoint. The runtime may surface it in
   * audit records.
   */
  readonly no_auto_approval?: boolean;
}

/**
 * Privacy tier required by the capability. The contract is
 * declaration only; AI-73 enforces the policy at the adapter
 * boundary.
 *
 * The taxonomy is intentionally coarse: `standard` means no PII;
 * `sensitive` means broker PII; `regulated` means customs/tariff/legal
 * content; `restricted` means an additional restriction (legal hold,
 * embargo) is in effect. These names mirror the data-classification
 * ladder in `CapabilityContext.data_classification` but live on the
 * capability, not the request.
 */
export const PRIVACY_TIERS = ['standard', 'sensitive', 'regulated', 'restricted'] as const;
export type PrivacyTier = (typeof PRIVACY_TIERS)[number];

/**
 * Retention class required by the capability. AI-73 will translate
 * this into a concrete retention rule. AI-71 only persists the class
 * as declared text.
 */
export const RETENTION_CLASSES = [
  'no_retention',
  'audit_only',
  'audit_with_payload',
  'reviewed_export',
] as const;
export type RetentionClass = (typeof RETENTION_CLASSES)[number];

/**
 * Privacy requirement declaration. Empty arrays are valid: they
 * express "this capability has no declared redaction list". A
 * `tier: standard` capability with `redact_fields: []` is a
 * mechanical capability that must never see PII; the absence of
 * `tier: regulated` is itself a statement.
 */
export interface PrivacyRequirement {
  readonly tier: PrivacyTier;
  readonly zdr_required: boolean;
  readonly redact_fields: readonly string[];
  readonly retention_class: RetentionClass;
  readonly notes?: string;
}

/**
 * Budget window. The contract declares the *kind* of cap; AI-74
 * translates the cap into per-window spend rules. The string is
 * stable and versioned; the runtime does not interpret other values.
 */
export const BUDGET_WINDOWS = ['per_request', 'per_session', 'per_day'] as const;
export type BudgetWindow = (typeof BUDGET_WINDOWS)[number];

/**
 * Budget requirement declaration. The fields are optional so that a
 * capability may declare "no cost cap is necessary" (e.g. mechanical
 * snapshot writing) by simply omitting the window. The validator
 * does not require any field to be set.
 */
export interface BudgetRequirement {
  readonly max_cost_usd?: number;
  readonly window?: BudgetWindow;
  readonly notes?: string;
}

/**
 * Evaluation requirement declaration. The `metric_set` is a list of
 * metric names that the evaluation layer (AI-75) is expected to
 * produce. The contract does not constrain the metric vocabulary;
 * `gold_case_required: true` says "no profile is eligible for
 * production without a reviewed gold case".
 */
export interface EvaluationRequirement {
  readonly metric_set?: readonly string[];
  readonly gold_case_required: boolean;
  readonly min_quality?: number;
  readonly notes?: string;
}

/**
 * Execution requirement declaration. The contract expresses
 * provider-execution policy without naming a provider. The values
 * mirror the catalog's `provider_execution` enum.
 */
export interface ExecutionRequirement {
  readonly provider_execution: ProviderExecution;
  /**
   * If `true`, the capability MUST produce a deterministic
   * (non-provider) result when a provider is unavailable or when a
   * caller explicitly requests the local path. Mechanical and
   * transport-layer capabilities set this to `true`; regulated
   * capabilities set it to `false` because there is no safe
   * deterministic substitute for human-reviewed interpretation.
   */
  readonly deterministic_fallback: boolean;
  readonly notes?: string;
}

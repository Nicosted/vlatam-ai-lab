import policiesJson from '../../config/ai-budget-policies.json' with { type: 'json' };
import type { CapabilityRequest } from '../capabilities/index.js';
import type { ExecutionProfile } from '../execution/execution-profile.js';
import { governanceError } from './errors.js';

export interface BudgetPolicy { readonly policy_id: string; readonly schema_version: string; readonly priority: number; readonly capability_id: string; readonly profile_id?: string; readonly profile_class?: string; readonly execution_mode: 'replay'|'live'; readonly request_classification: string|'*'; readonly environment_id: string; readonly project_id: string; readonly tenant_id: string; readonly scope_id: string; readonly currency: string; readonly require_usage: boolean; readonly require_verified_pricing: boolean; readonly behavior: 'hard_block'|'human_review_required'; readonly max_estimated_tokens_per_request: number; readonly max_actual_tokens_per_request: number; readonly max_estimated_cost_minor_per_request: number; readonly max_actual_cost_minor_per_request: number; readonly rolling_request_limit: number; readonly rolling_token_limit: number; readonly rolling_cost_minor_limit: number; }
export interface BudgetPolicyCatalogData { readonly schema_version: string; readonly policies: readonly BudgetPolicy[]; }
export class BudgetPolicyCatalog {
  constructor(readonly data: BudgetPolicyCatalogData = policiesJson as BudgetPolicyCatalogData) { if (new Set(data.policies.map(p => p.policy_id)).size !== data.policies.length) throw governanceError('GOVERNANCE_CONFIGURATION_INVALID'); }
  resolve(request: CapabilityRequest, profile: ExecutionProfile): BudgetPolicy {
    const classification = request.context?.data_classification;
    const matches = this.data.policies.filter(p => p.capability_id === request.capability_id && p.execution_mode === profile.mode && (p.profile_id === undefined || p.profile_id === profile.profile_id) && (p.profile_class === undefined || p.profile_class === profile.eligibility.budget_class) && (p.request_classification === '*' || p.request_classification === classification)).sort((a,b) => b.priority-a.priority);
    if (!matches.length) throw governanceError('BUDGET_POLICY_MISSING');
    if (matches.length > 1 && matches[0]!.priority === matches[1]!.priority) throw governanceError('BUDGET_POLICY_AMBIGUOUS');
    const policy = matches[0]!;
    if (![policy.environment_id,policy.project_id,policy.tenant_id,policy.scope_id].every(v => /^[a-z0-9][a-z0-9._-]+$/.test(v)) || !/^[A-Z]{3}$/.test(policy.currency)) throw governanceError('GOVERNANCE_CONFIGURATION_INVALID');
    return policy;
  }
}

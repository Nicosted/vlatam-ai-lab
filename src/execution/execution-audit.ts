import type { ProfileLifecycleStatus, ProviderExecutionMode } from './execution-profile.js';
import type { ExecutionErrorCode } from './errors.js';
import type { ProviderUsage } from '../providers/provider-adapter.js';
export interface ExecutionAuditRecord {
  readonly execution_id: string; readonly request_id: string; readonly capability_id: string;
  readonly profile_id?: string | undefined; readonly provider_id?: string | undefined; readonly model_id?: string | undefined;
  readonly lifecycle_status?: ProfileLifecycleStatus | undefined; readonly mode?: ProviderExecutionMode | undefined;
  readonly started_at: string; readonly finished_at: string; readonly duration_ms: number;
  readonly usage?: ProviderUsage | undefined; readonly result_status: 'succeeded' | 'failed' | 'blocked';
  readonly error_code?: ExecutionErrorCode | undefined; readonly capability_contract_version: string;
  readonly profile_contract_version?: string | undefined;
}

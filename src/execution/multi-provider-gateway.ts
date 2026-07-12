import { randomUUID } from 'node:crypto';
import type { CapabilityError, CapabilityRequest, CapabilityResult } from '../capabilities/index.js';
import { assertCapabilitySupported, validateCapabilityRequest, validateCapabilityResult } from '../capabilities/index.js';
import type { ProviderAdapterRegistry } from '../providers/adapter-registry.js';
import type { ProviderExecutionResult } from '../providers/provider-adapter.js';
import { capabilityResult, mapNormativeClaimsRequest, parseNormativeClaimsOutput } from './normative-claims-mapper.js';
import type { ExecutionAuditRecord } from './execution-audit.js';
import type { ExecutionProfile } from './execution-profile.js';
import { validateExecutionProfile } from './execution-profile.js';
import { ExecutionError, executionError, sanitizeProviderError, type ExecutionErrorCode } from './errors.js';
import { assertExecutionProfile } from './profile-catalog.js';

export interface GatewayInvocation { readonly capability_request: CapabilityRequest; readonly execution_profile_id: string; readonly signal?: AbortSignal; }
export interface GatewayOutcome { readonly result: CapabilityResult; readonly audit: ExecutionAuditRecord; }
export interface GatewayOptions { readonly registry: ProviderAdapterRegistry; readonly clock?: () => Date; readonly executionId?: () => string; readonly profileResolver?: (id: string) => ExecutionProfile; }

function capabilityError(error: ExecutionError): CapabilityError {
  const policy = ['PROFILE_DISABLED','PROFILE_RETIRED','LIVE_EXECUTION_DISABLED','CREDENTIALS_UNAVAILABLE'].includes(error.code);
  const contract = ['UNKNOWN_PROFILE','UNKNOWN_PROVIDER','PROFILE_CAPABILITY_MISMATCH','OUTPUT_SCHEMA_INVALID','PROVIDER_RESPONSE_INVALID'].includes(error.code);
  return { category: policy ? 'policy' : contract ? 'contract' : error.code === 'INTERNAL_EXECUTION_ERROR' ? 'internal' : 'execution', code: policy ? 'EXECUTION_UNAVAILABLE' : contract ? 'INVALID_RESULT' : error.code === 'PROVIDER_TIMEOUT' ? 'TIMEOUT' : error.code === 'INTERNAL_EXECUTION_ERROR' ? 'INTERNAL_ERROR' : 'PROVIDER_ERROR', message: error.message };
}
function failedResult(request: CapabilityRequest, error: ExecutionError): CapabilityResult {
  const err = capabilityError(error); const status = err.category === 'policy' || err.category === 'contract' ? 'blocked' : 'failed';
  return { request_id: request.request_id, capability_id: request.capability_id, schema_version: request.schema_version, status, error: err, governance: { human_review_required: true, downstream_allowed: false, approval_state: 'pending' } };
}

export class MultiProviderGateway {
  private readonly clock: () => Date; private readonly executionId: () => string; private readonly profileResolver: (id: string) => ExecutionProfile;
  constructor(private readonly options: GatewayOptions) { this.clock = options.clock ?? (() => new Date()); this.executionId = options.executionId ?? randomUUID; this.profileResolver = options.profileResolver ?? assertExecutionProfile; }
  async execute(invocation: GatewayInvocation): Promise<GatewayOutcome> {
    const started = this.clock(); const executionId = this.executionId(); let profile: ExecutionProfile | undefined; let providerResult: ProviderExecutionResult | undefined;
    let error: ExecutionError | undefined; let result: CapabilityResult;
    try {
      const validation = validateCapabilityRequest(invocation.capability_request);
      if (!validation.ok) throw executionError('OUTPUT_SCHEMA_INVALID');
      assertCapabilitySupported(invocation.capability_request.capability_id);
      profile = this.profileResolver(invocation.execution_profile_id);
      if (validateExecutionProfile(profile).length) throw executionError('INTERNAL_EXECUTION_ERROR');
      if (profile.capability_id !== invocation.capability_request.capability_id) throw executionError('PROFILE_CAPABILITY_MISMATCH');
      if (!profile.enabled) throw executionError('PROFILE_DISABLED');
      if (profile.lifecycle_status === 'retired') throw executionError('PROFILE_RETIRED');
      if (profile.lifecycle_status === 'shadow') throw executionError('PROFILE_DISABLED');
      const adapter = this.options.registry.assertProviderAdapterSupported(profile.provider_id);
      if (!adapter.supports(profile)) throw executionError('UNKNOWN_PROVIDER');
      const mapped = mapNormativeClaimsRequest(invocation.capability_request);
      const controller = new AbortController(); let timedOut = false; const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, profile.configuration.timeout_ms);
      const abort = () => controller.abort(); invocation.signal?.addEventListener('abort', abort, { once: true });
      try { providerResult = await adapter.execute(mapped, profile, { execution_id: executionId, signal: controller.signal, timeout_ms: profile.configuration.timeout_ms }); }
      finally { clearTimeout(timeout); invocation.signal?.removeEventListener('abort', abort); }
      if (timedOut) throw executionError('PROVIDER_TIMEOUT');
      if (providerResult.status !== 'succeeded' || !providerResult.content) throw providerResult.error ?? executionError('PROVIDER_RESPONSE_INVALID');
      const output = parseNormativeClaimsOutput(providerResult.content, invocation.capability_request);
      result = capabilityResult(invocation.capability_request, output);
      const resultValidation = validateCapabilityResult(result);
      if (!resultValidation.ok) throw executionError('OUTPUT_SCHEMA_INVALID');
    } catch (caught) {
      error = caught instanceof ExecutionError ? caught : sanitizeProviderError(caught);
      result = failedResult(invocation.capability_request, error);
    }
    const finished = this.clock();
    return { result, audit: { execution_id: executionId, request_id: invocation.capability_request.request_id, capability_id: invocation.capability_request.capability_id, profile_id: profile?.profile_id, provider_id: profile?.provider_id, model_id: profile?.model_id, lifecycle_status: profile?.lifecycle_status, mode: profile?.mode, started_at: started.toISOString(), finished_at: finished.toISOString(), duration_ms: Math.max(0, finished.getTime() - started.getTime()), usage: providerResult?.usage, result_status: result.status, error_code: error?.code as ExecutionErrorCode | undefined, capability_contract_version: invocation.capability_request.schema_version, profile_contract_version: profile?.contract_version } };
  }
}

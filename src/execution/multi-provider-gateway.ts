import { randomUUID } from 'node:crypto';
import type { CapabilityError, CapabilityRequest, CapabilityResult } from '../capabilities/index.js';
import { assertCapabilitySupported, validateCapabilityRequest, validateCapabilityResult } from '../capabilities/index.js';
import { PrivacyEnforcer } from '../privacy/privacy-enforcer.js';
import type { PrivacyAuditRecord } from '../privacy/privacy-audit.js';
import { mapPrivacyReasonToCapabilityError, privacyReasonMessage } from '../privacy/errors.js';
import type { PrivacyReasonCode } from '../privacy/errors.js';
import type { ProviderAdapterRegistry } from '../providers/adapter-registry.js';
import type { ProviderExecutionResult } from '../providers/provider-adapter.js';
import { capabilityResult, mapNormativeClaimsRequest, parseNormativeClaimsOutput } from './normative-claims-mapper.js';
import type { ExecutionAuditRecord } from './execution-audit.js';
import type { ExecutionProfile } from './execution-profile.js';
import { validateExecutionProfile } from './execution-profile.js';
import { ExecutionError, executionError, sanitizeProviderError, type ExecutionErrorCode } from './errors.js';
import { assertExecutionProfile } from './profile-catalog.js';

export interface GatewayInvocation { readonly capability_request: CapabilityRequest; readonly execution_profile_id: string; readonly signal?: AbortSignal; }
export interface GatewayOutcome { readonly result: CapabilityResult; readonly audit: ExecutionAuditRecord; readonly privacy_audit?: PrivacyAuditRecord | undefined; }
export interface GatewayOptions { readonly registry: ProviderAdapterRegistry; readonly clock?: () => Date; readonly executionId?: () => string; readonly profileResolver?: (id: string) => ExecutionProfile; readonly privacyEnforcer?: PrivacyEnforcer; }

/** Internal signal carrying a privacy block through the failure path
 * without fabricating a provider error. */
class PrivacyBlockedExecutionError extends ExecutionError {
  constructor(readonly reason_code: PrivacyReasonCode) { super('PRIVACY_BLOCKED', privacyReasonMessage(reason_code)); this.name = 'PrivacyBlockedExecutionError'; }
}

function capabilityError(error: ExecutionError): CapabilityError {
  if (error instanceof PrivacyBlockedExecutionError) { const mapped = mapPrivacyReasonToCapabilityError(error.reason_code); return { category: mapped.category, code: mapped.code, message: mapped.message }; }
  if (error.code === 'REQUEST_SCHEMA_INVALID') return { category: 'contract', code: 'INVALID_REQUEST', message: error.message };
  const policy = ['PROFILE_DISABLED','PROFILE_RETIRED','LIVE_EXECUTION_DISABLED','CREDENTIALS_UNAVAILABLE'].includes(error.code);
  const contract = ['UNKNOWN_PROFILE','UNKNOWN_PROVIDER','PROFILE_CAPABILITY_MISMATCH','OUTPUT_SCHEMA_INVALID','PROVIDER_RESPONSE_INVALID'].includes(error.code);
  return { category: policy ? 'policy' : contract ? 'contract' : error.code === 'INTERNAL_EXECUTION_ERROR' ? 'internal' : 'execution', code: policy ? 'EXECUTION_UNAVAILABLE' : contract ? 'INVALID_RESULT' : error.code === 'PROVIDER_TIMEOUT' ? 'TIMEOUT' : error.code === 'INTERNAL_EXECUTION_ERROR' ? 'INTERNAL_ERROR' : 'PROVIDER_ERROR', message: error.message };
}
interface SafeRequestFields { readonly request_id: string; readonly capability_id: CapabilityRequest['capability_id']; readonly schema_version: string; }
// The request may be arbitrary junk at runtime; identifying fields are only echoed back when they are plain non-empty strings.
function safeRequestFields(request: unknown): SafeRequestFields {
  const record = typeof request === 'object' && request !== null && !Array.isArray(request) ? (request as Record<string, unknown>) : {};
  const str = (value: unknown, fallback: string): string => (typeof value === 'string' && value.length > 0 ? value : fallback);
  return { request_id: str(record['request_id'], 'unknown'), capability_id: str(record['capability_id'], 'unknown') as CapabilityRequest['capability_id'], schema_version: str(record['schema_version'], '0.0.0') };
}
function failedResult(request: SafeRequestFields, error: ExecutionError): CapabilityResult {
  const err = capabilityError(error); const status = err.category === 'policy' || err.category === 'contract' ? 'blocked' : 'failed';
  return { request_id: request.request_id, capability_id: request.capability_id, schema_version: request.schema_version, status, error: err, governance: { human_review_required: true, downstream_allowed: false, approval_state: 'pending' } };
}

export class MultiProviderGateway {
  private readonly clock: () => Date; private readonly executionId: () => string; private readonly profileResolver: (id: string) => ExecutionProfile; private readonly privacyEnforcer: PrivacyEnforcer;
  constructor(private readonly options: GatewayOptions) { this.clock = options.clock ?? (() => new Date()); this.executionId = options.executionId ?? randomUUID; this.profileResolver = options.profileResolver ?? assertExecutionProfile; this.privacyEnforcer = options.privacyEnforcer ?? new PrivacyEnforcer({ clock: this.clock }); }
  async execute(invocation: GatewayInvocation): Promise<GatewayOutcome> {
    const started = this.clock(); const executionId = this.executionId(); const request = safeRequestFields(invocation.capability_request);
    let profile: ExecutionProfile | undefined; let providerResult: ProviderExecutionResult | undefined;
    let abortCause: 'caller' | 'timeout' | undefined;
    let privacyAudit: PrivacyAuditRecord | undefined;
    let error: ExecutionError | undefined; let result: CapabilityResult;
    try {
      const validation = validateCapabilityRequest(invocation.capability_request);
      if (!validation.ok) throw executionError('REQUEST_SCHEMA_INVALID');
      if (invocation.signal?.aborted) { abortCause = 'caller'; throw executionError('EXECUTION_ABORTED'); }
      const definition = assertCapabilitySupported(invocation.capability_request.capability_id);
      profile = this.profileResolver(invocation.execution_profile_id);
      if (validateExecutionProfile(profile).length) throw executionError('INTERNAL_EXECUTION_ERROR');
      if (profile.capability_id !== invocation.capability_request.capability_id) throw executionError('PROFILE_CAPABILITY_MISMATCH');
      if (!profile.enabled) throw executionError('PROFILE_DISABLED');
      if (profile.lifecycle_status === 'retired') throw executionError('PROFILE_RETIRED');
      if (profile.lifecycle_status === 'shadow') throw executionError('PROFILE_DISABLED');
      // AI-73: privacy is a hard eligibility gate BEFORE adapter lookup,
      // mapping, or timeouts. A blocked decision never reaches a
      // provider, never starts a timeout, never retries or falls back,
      // and never selects a different profile.
      const decision = this.privacyEnforcer.enforce({ capability_request: invocation.capability_request, capability_definition: definition, execution_profile: profile, execution_id: executionId });
      privacyAudit = decision.audit;
      if (decision.status !== 'allowed' || decision.cleared_request === undefined) throw new PrivacyBlockedExecutionError(decision.reason_code);
      const clearedRequest = decision.cleared_request;
      const mapped = mapNormativeClaimsRequest(clearedRequest);
      if (invocation.signal?.aborted) { abortCause = 'caller'; throw executionError('EXECUTION_ABORTED'); }
      const adapter = this.options.registry.assertProviderAdapterSupported(profile.provider_id);
      if (!adapter.supports(profile)) throw executionError('UNKNOWN_PROVIDER');
      const controller = new AbortController();
      const timeout = setTimeout(() => { abortCause = abortCause ?? 'timeout'; controller.abort(); }, profile.configuration.timeout_ms);
      const onCallerAbort = () => { abortCause = abortCause ?? 'caller'; controller.abort(); };
      invocation.signal?.addEventListener('abort', onCallerAbort, { once: true });
      try { providerResult = await adapter.execute(mapped, profile, { execution_id: executionId, signal: controller.signal, timeout_ms: profile.configuration.timeout_ms }); }
      finally { clearTimeout(timeout); invocation.signal?.removeEventListener('abort', onCallerAbort); }
      if (abortCause === 'timeout') throw executionError('PROVIDER_TIMEOUT');
      if (abortCause === 'caller') throw executionError('EXECUTION_ABORTED');
      if (providerResult.status !== 'succeeded' || !providerResult.content) throw providerResult.error ?? executionError('PROVIDER_RESPONSE_INVALID');
      const output = parseNormativeClaimsOutput(providerResult.content, clearedRequest);
      result = capabilityResult(clearedRequest, output);
      const resultValidation = validateCapabilityResult(result);
      if (!resultValidation.ok) throw executionError('OUTPUT_SCHEMA_INVALID');
    } catch (caught) {
      // The recorded abort cause wins over whatever the adapter threw: a timeout is never
      // mislabeled as a caller abort (or vice versa) based on a generic AbortError.
      error = abortCause === 'timeout' ? executionError('PROVIDER_TIMEOUT') : abortCause === 'caller' ? executionError('EXECUTION_ABORTED') : caught instanceof ExecutionError ? caught : sanitizeProviderError(caught);
      result = failedResult(request, error);
    }
    const finished = this.clock();
    return { result, audit: { execution_id: executionId, request_id: request.request_id, capability_id: request.capability_id, profile_id: profile?.profile_id, provider_id: profile?.provider_id, model_id: profile?.model_id, lifecycle_status: profile?.lifecycle_status, mode: profile?.mode, started_at: started.toISOString(), finished_at: finished.toISOString(), duration_ms: Math.max(0, finished.getTime() - started.getTime()), usage: providerResult?.usage, result_status: result.status, error_code: error?.code as ExecutionErrorCode | undefined, capability_contract_version: request.schema_version, profile_contract_version: profile?.contract_version }, privacy_audit: privacyAudit };
  }
}

import type { CapabilityId } from '../capabilities/index.js';
import { validatePrivacyProfileDeclaration } from '../privacy/privacy-policy.js';
import type { PrivacyProfileDeclaration } from '../privacy/privacy-policy.js';

export type ExecutionProfileId = string & { readonly __executionProfileId: unique symbol };
export type ProviderId = string & { readonly __providerId: unique symbol };
export type ModelId = string & { readonly __modelId: unique symbol };
export type ProfileLifecycleStatus = 'production' | 'candidate' | 'shadow' | 'retired';
export type ProviderExecutionMode = 'replay' | 'live';

export interface ProfileConfiguration {
  readonly temperature?: number;
  readonly max_output_tokens?: number;
  readonly timeout_ms: number;
  readonly response_format: 'json';
}

export interface ProfileEligibility {
  readonly privacy_compatibility: 'declared_not_enforced';
  readonly budget_class: 'development' | 'unclassified';
  readonly evaluation_status: 'not_evaluated' | 'fixture_verified';
}

export interface ExecutionProfile {
  readonly profile_id: ExecutionProfileId;
  readonly capability_id: CapabilityId;
  readonly provider_id: ProviderId;
  readonly model_id: ModelId;
  readonly mode: ProviderExecutionMode;
  readonly lifecycle_status: ProfileLifecycleStatus;
  readonly enabled: boolean;
  readonly contract_version: string;
  readonly configuration: ProfileConfiguration;
  readonly provider_configuration_ref?: string;
  /** AI-72 legacy eligibility block. Superseded for privacy purposes
   * by the AI-73 `privacy` declaration below; retained unchanged so
   * AI-72 consumers keep working. */
  readonly eligibility: ProfileEligibility;
  /** AI-73 privacy declaration. A declaration is never proof: the
   * privacy enforcer independently validates it and, for verified
   * ZDR, requires matching repository evidence. */
  readonly privacy: PrivacyProfileDeclaration;
  readonly fixture_id?: string;
}

export const EXECUTION_PROFILE_CONTRACT_VERSION = '1.1.0';
export const SUPPORTED_EXECUTION_PROFILE_MAJOR = 1;

export function validateExecutionProfile(profile: ExecutionProfile): readonly string[] {
  const errors: string[] = [];
  if (!/^[a-z0-9][a-z0-9._-]+$/.test(profile.profile_id)) errors.push('invalid profile_id');
  if (!/^[a-z0-9][a-z0-9._-]+$/.test(profile.provider_id)) errors.push('invalid provider_id');
  if (!profile.model_id) errors.push('model_id is required');
  if (!Number.isInteger(profile.configuration.timeout_ms) || profile.configuration.timeout_ms < 1 || profile.configuration.timeout_ms > 120_000) errors.push('timeout_ms must be between 1 and 120000');
  const major = Number(profile.contract_version.split('.')[0]);
  if (major !== SUPPORTED_EXECUTION_PROFILE_MAJOR) errors.push('unsupported profile contract version');
  if (profile.lifecycle_status === 'shadow' && profile.enabled) errors.push('shadow execution is not supported by AI-72');
  if (profile.privacy === undefined) {
    errors.push('privacy declaration is required');
  } else {
    errors.push(...validatePrivacyProfileDeclaration(profile.privacy, profile.mode));
  }
  return errors;
}

export interface ExecutionProfileCatalog { readonly schema_version: string; readonly profiles: readonly ExecutionProfile[]; }

/**
 * AI-73 privacy enforcement — stable reason codes and error model.
 *
 * Every privacy decision carries one of the reason codes below. The
 * codes are stable contract surface; messages are sanitized constants
 * that never embed request values, policy text, evidence excerpts, or
 * provider details.
 */

export const PRIVACY_REASON_CODES = [
  // allowed
  'PRIVACY_CLEARED',
  // classification
  'DATA_CLASSIFICATION_REQUIRED',
  'UNKNOWN_DATA_CLASSIFICATION',
  // policy resolution
  'PRIVACY_POLICY_MISSING',
  'PRIVACY_POLICY_AMBIGUOUS',
  // profile declaration
  'PROFILE_PRIVACY_DECLARATION_MISSING',
  'PROFILE_PRIVACY_INCOMPATIBLE',
  // ZDR
  'ZDR_REQUIRED',
  'ZDR_UNVERIFIED',
  'ZDR_EVIDENCE_MISSING',
  'ZDR_EVIDENCE_EXPIRED',
  'ZDR_EVIDENCE_SCOPE_MISMATCH',
  // redaction
  'REDACTION_REQUIRED',
  'REDACTION_FAILED',
  'REDACTION_PATH_UNKNOWN',
  // retention / processing boundary
  'RETENTION_POLICY_INCOMPATIBLE',
  'EXTERNAL_PROCESSING_FORBIDDEN',
  'REPLAY_FIXTURE_UNSAFE',
  // configuration
  'PRIVACY_CONFIGURATION_INVALID',
] as const;
export type PrivacyReasonCode = (typeof PRIVACY_REASON_CODES)[number];

export function isPrivacyReasonCode(value: unknown): value is PrivacyReasonCode {
  return typeof value === 'string' && (PRIVACY_REASON_CODES as readonly string[]).includes(value);
}

const SAFE_MESSAGES: Readonly<Record<PrivacyReasonCode, string>> = {
  PRIVACY_CLEARED: 'The request satisfied the applicable privacy policy.',
  DATA_CLASSIFICATION_REQUIRED: 'The request carries no explicit data classification.',
  UNKNOWN_DATA_CLASSIFICATION: 'The request carries an unknown data classification.',
  PRIVACY_POLICY_MISSING: 'No privacy policy applies to this capability and classification.',
  PRIVACY_POLICY_AMBIGUOUS: 'Multiple privacy policies match with no deterministic winner.',
  PROFILE_PRIVACY_DECLARATION_MISSING: 'The execution profile carries no privacy declaration.',
  PROFILE_PRIVACY_INCOMPATIBLE: 'The execution profile privacy declaration is incompatible with the request.',
  ZDR_REQUIRED: 'The request requires zero-data-retention support that the profile does not offer.',
  ZDR_UNVERIFIED: 'The profile ZDR posture is not backed by verified evidence.',
  ZDR_EVIDENCE_MISSING: 'No ZDR verification evidence is available for the profile.',
  ZDR_EVIDENCE_EXPIRED: 'The ZDR verification evidence is expired.',
  ZDR_EVIDENCE_SCOPE_MISMATCH: 'The ZDR verification evidence does not cover this execution.',
  REDACTION_REQUIRED: 'Mandatory redaction is required but not configured for this execution.',
  REDACTION_FAILED: 'Mandatory redaction could not be completed.',
  REDACTION_PATH_UNKNOWN: 'A mandatory redaction path cannot be interpreted against the request.',
  RETENTION_POLICY_INCOMPATIBLE: 'The profile retention behavior is incompatible with the request.',
  EXTERNAL_PROCESSING_FORBIDDEN: 'External processing is forbidden for this request content.',
  REPLAY_FIXTURE_UNSAFE: 'The replay fixture provenance is not safe for this request.',
  PRIVACY_CONFIGURATION_INVALID: 'The privacy configuration is incomplete or invalid.',
};

export function privacyReasonMessage(code: PrivacyReasonCode): string {
  return SAFE_MESSAGES[code];
}

/**
 * Typed error used inside the privacy layer and by the gateway to
 * carry a privacy block without leaking values. The message is always
 * the sanitized constant for the reason code.
 */
export class PrivacyError extends Error {
  constructor(readonly reason_code: PrivacyReasonCode) {
    super(SAFE_MESSAGES[reason_code]);
    this.name = 'PrivacyError';
  }
}

export function privacyError(code: PrivacyReasonCode): PrivacyError {
  return new PrivacyError(code);
}

/**
 * Mapping into the AI-71 error vocabulary. Request-side faults are
 * contract errors; everything else is a policy block. The mapped
 * message is the sanitized reason message.
 */
export interface MappedCapabilityError {
  readonly category: 'policy' | 'contract';
  readonly code: 'POLICY_BLOCKED' | 'PRIVACY_POLICY_REQUIRED' | 'INVALID_REQUEST';
  readonly message: string;
}

const CONTRACT_REASONS: ReadonlySet<PrivacyReasonCode> = new Set([
  'DATA_CLASSIFICATION_REQUIRED',
  'UNKNOWN_DATA_CLASSIFICATION',
]);
const POLICY_REQUIRED_REASONS: ReadonlySet<PrivacyReasonCode> = new Set([
  'PRIVACY_POLICY_MISSING',
  'PRIVACY_POLICY_AMBIGUOUS',
  'PROFILE_PRIVACY_DECLARATION_MISSING',
  'PRIVACY_CONFIGURATION_INVALID',
]);

export function mapPrivacyReasonToCapabilityError(code: PrivacyReasonCode): MappedCapabilityError {
  if (CONTRACT_REASONS.has(code)) {
    return { category: 'contract', code: 'INVALID_REQUEST', message: SAFE_MESSAGES[code] };
  }
  if (POLICY_REQUIRED_REASONS.has(code)) {
    return { category: 'policy', code: 'PRIVACY_POLICY_REQUIRED', message: SAFE_MESSAGES[code] };
  }
  return { category: 'policy', code: 'POLICY_BLOCKED', message: SAFE_MESSAGES[code] };
}

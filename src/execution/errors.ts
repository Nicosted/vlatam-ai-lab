export const EXECUTION_ERROR_CODES = [
  'UNKNOWN_PROVIDER', 'UNKNOWN_PROFILE', 'PROFILE_DISABLED', 'PROFILE_RETIRED', 'EXECUTION_PROFILE_VERSION_MISMATCH',
  'PROFILE_CAPABILITY_MISMATCH', 'LIVE_EXECUTION_DISABLED', 'CREDENTIALS_UNAVAILABLE',
  'PROVIDER_RATE_LIMITED', 'PROVIDER_TIMEOUT', 'PROVIDER_UNAVAILABLE',
  'PROVIDER_RESPONSE_INVALID', 'REQUEST_SCHEMA_INVALID', 'OUTPUT_SCHEMA_INVALID', 'EXECUTION_ABORTED',
  'PRIVACY_BLOCKED', 'INTERNAL_EXECUTION_ERROR',
  'USAGE_ESTIMATE_UNAVAILABLE','USAGE_UNAVAILABLE','USAGE_INVALID','PRICING_MISSING','PRICING_AMBIGUOUS','PRICING_EXPIRED','PRICING_UNVERIFIED','COST_CALCULATION_FAILED','BUDGET_POLICY_MISSING','BUDGET_POLICY_AMBIGUOUS','REQUEST_TOKEN_LIMIT_EXCEEDED','REQUEST_COST_LIMIT_EXCEEDED','ROLLING_REQUEST_LIMIT_EXCEEDED','ROLLING_TOKEN_LIMIT_EXCEEDED','ROLLING_COST_LIMIT_EXCEEDED','BUDGET_RESERVATION_FAILED','BUDGET_EXHAUSTED','BUDGET_RECONCILIATION_FAILED','GOVERNANCE_CONFIGURATION_INVALID',
] as const;
export type ExecutionErrorCode = (typeof EXECUTION_ERROR_CODES)[number];

export class ExecutionError extends Error {
  constructor(readonly code: ExecutionErrorCode, message: string) { super(message); this.name = 'ExecutionError'; }
}

const SAFE_MESSAGES: Record<ExecutionErrorCode, string> = {
  UNKNOWN_PROVIDER: 'The execution profile references an unknown provider adapter.',
  UNKNOWN_PROFILE: 'The requested execution profile is unknown.',
  PROFILE_DISABLED: 'The requested execution profile is disabled.',
  PROFILE_RETIRED: 'The requested execution profile is retired.',
  EXECUTION_PROFILE_VERSION_MISMATCH: 'The execution profile contract version does not match the required version.',
  PROFILE_CAPABILITY_MISMATCH: 'The execution profile does not match the requested capability.',
  LIVE_EXECUTION_DISABLED: 'Live provider execution is disabled.',
  CREDENTIALS_UNAVAILABLE: 'Provider credentials are unavailable.',
  PROVIDER_RATE_LIMITED: 'The provider rate limited the request.',
  PROVIDER_TIMEOUT: 'The provider execution timed out.',
  PROVIDER_UNAVAILABLE: 'The provider is unavailable.',
  PROVIDER_RESPONSE_INVALID: 'The provider returned an invalid response.',
  REQUEST_SCHEMA_INVALID: 'The capability request failed contract validation.',
  OUTPUT_SCHEMA_INVALID: 'The normalized output failed its contract.',
  EXECUTION_ABORTED: 'The execution was aborted.',
  PRIVACY_BLOCKED: 'The request was blocked by privacy enforcement.',
  INTERNAL_EXECUTION_ERROR: 'The execution failed safely.',
  USAGE_ESTIMATE_UNAVAILABLE: 'Execution was blocked by usage and budget governance.', USAGE_UNAVAILABLE: 'Execution was blocked by usage and budget governance.', USAGE_INVALID: 'Execution was blocked by usage and budget governance.', PRICING_MISSING: 'Execution was blocked by usage and budget governance.', PRICING_AMBIGUOUS: 'Execution was blocked by usage and budget governance.', PRICING_EXPIRED: 'Execution was blocked by usage and budget governance.', PRICING_UNVERIFIED: 'Execution was blocked by usage and budget governance.', COST_CALCULATION_FAILED: 'Execution was blocked by usage and budget governance.', BUDGET_POLICY_MISSING: 'Execution was blocked by usage and budget governance.', BUDGET_POLICY_AMBIGUOUS: 'Execution was blocked by usage and budget governance.', REQUEST_TOKEN_LIMIT_EXCEEDED: 'Execution was blocked by usage and budget governance.', REQUEST_COST_LIMIT_EXCEEDED: 'Execution was blocked by usage and budget governance.', ROLLING_REQUEST_LIMIT_EXCEEDED: 'Execution was blocked by usage and budget governance.', ROLLING_TOKEN_LIMIT_EXCEEDED: 'Execution was blocked by usage and budget governance.', ROLLING_COST_LIMIT_EXCEEDED: 'Execution was blocked by usage and budget governance.', BUDGET_RESERVATION_FAILED: 'Execution was blocked by usage and budget governance.', BUDGET_EXHAUSTED: 'Execution was blocked by usage and budget governance.', BUDGET_RECONCILIATION_FAILED: 'Execution was blocked by usage and budget governance.', GOVERNANCE_CONFIGURATION_INVALID: 'Execution was blocked by usage and budget governance.',
};
export function executionError(code: ExecutionErrorCode): ExecutionError { return new ExecutionError(code, SAFE_MESSAGES[code]); }
export function sanitizeProviderError(error: unknown): ExecutionError {
  if (error instanceof ExecutionError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') return executionError('EXECUTION_ABORTED');
  return executionError('PROVIDER_UNAVAILABLE');
}

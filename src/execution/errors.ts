export const EXECUTION_ERROR_CODES = [
  'UNKNOWN_PROVIDER', 'UNKNOWN_PROFILE', 'PROFILE_DISABLED', 'PROFILE_RETIRED',
  'PROFILE_CAPABILITY_MISMATCH', 'LIVE_EXECUTION_DISABLED', 'CREDENTIALS_UNAVAILABLE',
  'PROVIDER_RATE_LIMITED', 'PROVIDER_TIMEOUT', 'PROVIDER_UNAVAILABLE',
  'PROVIDER_RESPONSE_INVALID', 'REQUEST_SCHEMA_INVALID', 'OUTPUT_SCHEMA_INVALID', 'EXECUTION_ABORTED',
  'INTERNAL_EXECUTION_ERROR',
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
  INTERNAL_EXECUTION_ERROR: 'The execution failed safely.',
};
export function executionError(code: ExecutionErrorCode): ExecutionError { return new ExecutionError(code, SAFE_MESSAGES[code]); }
export function sanitizeProviderError(error: unknown): ExecutionError {
  if (error instanceof ExecutionError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') return executionError('EXECUTION_ABORTED');
  return executionError('PROVIDER_UNAVAILABLE');
}

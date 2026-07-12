/**
 * AI-71 capability contracts — error model.
 *
 * The error model is a small, closed-code enumeration. The codes below
 * are stable; new codes are introduced as additive (MINOR) changes to
 * the contract version. Renaming or removing a code is a MAJOR
 * change.
 *
 * Error categories group codes for the result envelope
 * (`CapabilityResult.error.category`):
 *
 *  - `contract`     — the request or result shape is wrong
 *                     (unknown capability, invalid envelope, wrong
 *                     schema version).
 *  - `policy`       — execution was correctly requested but a
 *                     declared policy forbids the call (privacy,
 *                     budget, lifecycle, evaluation gate).
 *  - `execution`    — execution was attempted and failed (provider
 *                     error, missing evidence, transient fault).
 *  - `internal`     — an internal invariant was violated; the
 *                     caller is asked to surface this to operators.
 *
 * Category affects only the routing and the audit record. Domain
 * workflows may treat any error as "the capability did not produce a
 * downstream-eligible result" and react accordingly.
 */

export const CAPABILITY_ERROR_CATEGORIES = ['contract', 'policy', 'execution', 'internal'] as const;
export type CapabilityErrorCategory = (typeof CAPABILITY_ERROR_CATEGORIES)[number];

/**
 * Stable capability error codes. Codes are namespaced with the
 * category they belong to so that the literal value is self-describing
 * when logged.
 */
export const CAPABILITY_ERROR_CODES = [
  // contract
  'UNKNOWN_CAPABILITY',
  'INVALID_REQUEST',
  'INVALID_RESULT',
  'UNSUPPORTED_SCHEMA_VERSION',
  // policy
  'POLICY_BLOCKED',
  'PRIVACY_POLICY_REQUIRED',
  'BUDGET_POLICY_REQUIRED',
  'EVALUATION_POLICY_REQUIRED',
  'HUMAN_REVIEW_REQUIRED',
  'EXECUTION_UNAVAILABLE',
  // execution
  'MISSING_EVIDENCE',
  'PROVIDER_ERROR',
  'TIMEOUT',
  // internal
  'INTERNAL_ERROR',
] as const;
export type CapabilityErrorCode = (typeof CAPABILITY_ERROR_CODES)[number];

export function isCapabilityErrorCode(value: unknown): value is CapabilityErrorCode {
  return (
    typeof value === 'string' && (CAPABILITY_ERROR_CODES as readonly string[]).includes(value)
  );
}

export function isCapabilityErrorCategory(value: unknown): value is CapabilityErrorCategory {
  return (
    typeof value === 'string' &&
    (CAPABILITY_ERROR_CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * `CapabilityError` is the structured error block of
 * `CapabilityResult`. It is intentionally narrow: the contract
 * surfaces a code, a category, a human-readable message, and a small
 * structured detail object. The contract does NOT surface raw
 * provider exception messages, stack traces, or vendor error codes;
 * those belong to the adapter layer (AI-72) and are normalized into
 * one of the codes above.
 */
export interface CapabilityError {
  readonly category: CapabilityErrorCategory;
  readonly code: CapabilityErrorCode;
  readonly message: string;
  /**
   * Optional structured detail. The keys are stable for each code
   * (e.g. `INVALID_REQUEST` carries `{ "errors": ["..."] }`). The
   * contract does not constrain the value type beyond "structured
   * JSON"; validators may treat unknown shapes as opaque.
   */
  readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * Field names whose presence anywhere in a request or result object
 * causes the validator to fail closed. The set is a static guard
 * against leaking provider, model, profile, or credential metadata
 * into the contract surface. The list is matched case-insensitively
 * against property names and against dotted nested paths.
 *
 * The list is intentionally narrow. The validator also runs a deeper
 * shape check (object/array nested walks) — see `validation.ts` —
 * but this list is the first-pass filter.
 */
export const FORBIDDEN_FIELD_NAMES = new Set<string>(
  [
    'provider',
    'provider_id',
    'provider_name',
    'provider_response',
    'model',
    'model_id',
    'model_name',
    'model_version',
    'api_key',
    'apikey',
    'api_token',
    'token',
    'bearer',
    'authorization',
    'secret',
    'client_secret',
    'access_key',
    'private_key',
    'password',
    'endpoint_url',
    'base_url',
    'profile',
    'profile_id',
    'execution_profile',
    'prompt_hash',
    'reviewer',
    'reviewer_id',
    'reviewer_name',
  ].map(name => name.toLowerCase())
);

export function isForbiddenFieldName(name: string): boolean {
  return FORBIDDEN_FIELD_NAMES.has(name.toLowerCase());
}

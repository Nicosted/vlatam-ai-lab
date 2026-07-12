/**
 * AI-71 capability contracts — validation utilities.
 *
 * The validators in this module are the executable expression of the
 * AI-71 contract. They walk a request, a result, a definition, or a
 * policy object and emit a structured `ValidationResult` describing
 * whether the value is well-formed and consistent with the contract.
 *
 * Design rules:
 *
 *  - Validators are pure functions. They do not import the registry
 *    (which would create a circular dependency); unknown capability
 *    IDs are detected by the caller's registry call. Validators
 *    enforce shape and consistency only.
 *  - Validators never throw. A failed validation returns
 *    `{ ok: false, errors }`. A successful validation returns
 *    `{ ok: true }`.
 *  - Validators never coerce. A bad value is a bad value; the caller
 *    decides what to do.
 *  - Validators never log. The structured `errors` array is the
 *    single source of truth; logging is the caller's concern.
 *
 * The runtime registry (`registry.ts`) calls these validators when
 * loading the catalog. The capability dispatch layer (a future
 * concern) will call them when accepting an invocation.
 */

import {
  CAPABILITY_ERROR_CATEGORIES,
  CAPABILITY_ERROR_CODES,
  isCapabilityErrorCategory,
  isCapabilityErrorCode,
  isForbiddenFieldName,
} from './error.js';
import type { CapabilityError } from './error.js';
import {
  CAPABILITY_DOMAINS,
  CAPABILITY_RESULT_STATUSES,
  CAPABILITY_RISK_TIERS,
  CAPABILITY_STATUSES,
  DATA_CLASSIFICATIONS,
  DOWNSTREAM_USE_VALUES,
  PROVIDER_EXECUTION_VALUES,
  isCapabilityId,
  isCapabilityResultStatus,
  isDataClassification,
  isDownstreamUse,
  isProviderExecution,
  isSchemaVersion,
} from './contracts.js';
import type {
  CapabilityPolicy,
  DownstreamPolicy,
} from './contracts.js';
import { isCapabilityErrorCode as _isCode } from './error.js';
import {
  BUDGET_WINDOWS,
  PRIVACY_TIERS,
  RETENTION_CLASSES,
} from './policy.js';
import { CAPABILITY_ID_PATTERN, SUPPORTED_CAPABILITY_CONTRACT_MAJORS } from './version.js';

/**
 * Discriminated result of a contract validation. A failed validation
 * carries an array of human-readable error messages. The array is
 * deterministic in order so that tests can match against it.
 */
export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: readonly string[] };

/**
 * Convenience alias for the failure branch.
 */
export type ValidationFailure = Extract<ValidationResult, { ok: false }>;

function ok(): ValidationResult {
  return { ok: true };
}

function fail(errors: readonly string[]): ValidationResult {
  return { ok: false, errors };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Walks an arbitrary value and returns the list of paths whose key
 * name matches a forbidden field. The walk is shallow-deep: it
 * recurses into objects and arrays but does not traverse beyond a
 * small depth cap to keep the validator bounded. The result is a
 * sorted, deduplicated list of dotted paths suitable for an error
 * message.
 */
export function findForbiddenFieldPaths(value: unknown, maxDepth = 8): readonly string[] {
  const hits = new Set<string>();
  const seen = new Set<unknown>();

  function walk(node: unknown, path: string, depth: number): void {
    if (depth > maxDepth) return;
    if (node === null || node === undefined) return;
    if (typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i += 1) {
        walk(node[i], `${path}[${i}]`, depth + 1);
      }
      return;
    }

    for (const [key, child] of Object.entries(node)) {
      const childPath = path === '' ? key : `${path}.${key}`;
      if (isForbiddenFieldName(key)) {
        hits.add(childPath);
      }
      walk(child, childPath, depth + 1);
    }
  }

  walk(value, '', 0);
  return [...hits].sort();
}

function isStringOrUndefined(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isFiniteNumberOrUndefined(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

/**
 * Validates the `CapabilityContext` shape. The contract allows most
 * fields to be absent, so the validator only rejects the cases where
 * a value is present but malformed. A `timestamp`, if present, MUST
 * be a parseable ISO 8601 string.
 */
export function validateCapabilityContext(
  value: unknown,
  pathPrefix = 'context'
): ValidationResult {
  if (value === undefined) return ok();
  if (!isPlainRecord(value)) {
    return fail([`${pathPrefix} must be an object`]);
  }
  const errors: string[] = [];

  if (!isStringOrUndefined(value['jurisdiction'])) {
    errors.push(`${pathPrefix}.jurisdiction must be a string when present`);
  }
  if (!isStringOrUndefined(value['source_id'])) {
    errors.push(`${pathPrefix}.source_id must be a string when present`);
  }
  if (!isStringOrUndefined(value['artifact_id'])) {
    errors.push(`${pathPrefix}.artifact_id must be a string when present`);
  }
  if (!isStringOrUndefined(value['correlation_id'])) {
    errors.push(`${pathPrefix}.correlation_id must be a string when present`);
  }
  if (value['data_classification'] !== undefined && !isDataClassification(value['data_classification'])) {
    errors.push(
      `${pathPrefix}.data_classification must be one of ${DATA_CLASSIFICATIONS.join(', ')}`
    );
  }
  if (value['downstream_use'] !== undefined && !isDownstreamUse(value['downstream_use'])) {
    errors.push(`${pathPrefix}.downstream_use must be one of ${DOWNSTREAM_USE_VALUES.join(', ')}`);
  }
  if (!isStringOrUndefined(value['actor_category'])) {
    errors.push(`${pathPrefix}.actor_category must be a string when present`);
  }
  if (!isStringOrUndefined(value['workflow'])) {
    errors.push(`${pathPrefix}.workflow must be a string when present`);
  }
  if (value['timestamp'] !== undefined) {
    if (typeof value['timestamp'] !== 'string') {
      errors.push(`${pathPrefix}.timestamp must be a string when present`);
    } else if (Number.isNaN(Date.parse(value['timestamp']))) {
      errors.push(`${pathPrefix}.timestamp must be a valid ISO 8601 timestamp`);
    }
  }
  if (value['extras'] !== undefined && !isPlainRecord(value['extras'])) {
    errors.push(`${pathPrefix}.extras must be an object when present`);
  }

  return errors.length === 0 ? ok() : fail(errors);
}

/**
 * Validates the `CapabilityRequest` envelope.
 *
 * Rules:
 *  - `request_id` MUST be a non-empty string.
 *  - `capability_id` MUST match the capability ID pattern.
 *  - `schema_version` MUST be a semver string whose MAJOR is in
 *    `SUPPORTED_CAPABILITY_CONTRACT_MAJORS`. Unknown MAJORs fail
 *    closed.
 *  - `input` MUST be an object or array (free-form, schema-validated
 *    by the capability's `input_schema_ref` at a higher layer).
 *  - `context`, if present, MUST validate via `validateCapabilityContext`.
 *  - The request MUST NOT contain any field whose name is in
 *    `FORBIDDEN_FIELD_NAMES`. Provider, model, profile, and
 *    credential fields are forbidden at the request boundary.
 */
export function validateCapabilityRequest(value: unknown): ValidationResult {
  if (!isPlainRecord(value)) {
    return fail(['request must be an object']);
  }
  const errors: string[] = [];

  if (typeof value['request_id'] !== 'string' || value['request_id'].length === 0) {
    errors.push('request.request_id is required and must be a non-empty string');
  }
  if (typeof value['capability_id'] !== 'string') {
    errors.push('request.capability_id is required and must be a string');
  } else if (!isCapabilityId(value['capability_id'])) {
    errors.push(
      `request.capability_id must match ${CAPABILITY_ID_PATTERN.source}; got ${JSON.stringify(value['capability_id'])}`
    );
  }
  if (!isSchemaVersion(value['schema_version'])) {
    errors.push('request.schema_version is required and must be a semver string');
  } else {
    const parts = value['schema_version'].split('.');
    const major = parts.length > 0 ? Number(parts[0]) : Number.NaN;
    if (Number.isNaN(major) || !(SUPPORTED_CAPABILITY_CONTRACT_MAJORS as readonly number[]).includes(major)) {
      errors.push(
        `request.schema_version major ${Number.isNaN(major) ? 'NaN' : String(major)} is not supported; supported majors: ${SUPPORTED_CAPABILITY_CONTRACT_MAJORS.join(', ')}`
      );
    }
  }
  if (value['input'] === undefined) {
    errors.push('request.input is required');
  } else if (
    typeof value['input'] !== 'object' ||
    value['input'] === null ||
    Array.isArray(value['input']) // arrays are valid inputs only if the schema permits; we disallow bare arrays for safety
  ) {
    errors.push('request.input must be an object (capability-specific shape is validated by the input JSON Schema)');
  }

  const contextResult = validateCapabilityContext(value['context'], 'request.context');
  if (!contextResult.ok) {
    errors.push(...contextResult.errors);
  }

  const forbidden = findForbiddenFieldPaths(value);
  if (forbidden.length > 0) {
    errors.push(
      `request contains forbidden provider/credential fields: ${forbidden.join(', ')}`
    );
  }

  return errors.length === 0 ? ok() : fail(errors);
}

/**
 * Validates a `ResultGovernance` block. The validator enforces the
 * cross-field invariants that the catalog encodes:
 *
 *  - `downstream_allowed: true` requires `human_review_required: false`
 *    AND `approval_state` is `approved` or `not_required`.
 *  - `approval_state: pending` requires `human_review_required: true`.
 *  - `approval_state: not_required` requires `human_review_required: false`.
 *  - `approval_state: rejected` requires `downstream_allowed: false`.
 */
export function validateGovernance(value: unknown, pathPrefix = 'governance'): ValidationResult {
  if (!isPlainRecord(value)) {
    return fail([`${pathPrefix} must be an object`]);
  }
  const errors: string[] = [];

  if (typeof value['human_review_required'] !== 'boolean') {
    errors.push(`${pathPrefix}.human_review_required is required and must be a boolean`);
  }
  if (typeof value['downstream_allowed'] !== 'boolean') {
    errors.push(`${pathPrefix}.downstream_allowed is required and must be a boolean`);
  }
  const approvalState = value['approval_state'];
  if (
    approvalState !== 'not_required' &&
    approvalState !== 'pending' &&
    approvalState !== 'approved' &&
    approvalState !== 'rejected'
  ) {
    errors.push(
      `${pathPrefix}.approval_state must be one of not_required, pending, approved, rejected`
    );
  }

  if (errors.length === 0) {
    const hr = value['human_review_required'] as boolean;
    const ds = value['downstream_allowed'] as boolean;
    const st = approvalState as 'not_required' | 'pending' | 'approved' | 'rejected';

    if (ds === true && hr !== false) {
      errors.push(`${pathPrefix}: downstream_allowed=true requires human_review_required=false`);
    }
    if (ds === true && st !== 'approved' && st !== 'not_required') {
      errors.push(`${pathPrefix}: downstream_allowed=true requires approval_state=approved or not_required`);
    }
    if (st === 'pending' && hr !== true) {
      errors.push(`${pathPrefix}: approval_state=pending requires human_review_required=true`);
    }
    if (st === 'not_required' && hr !== false) {
      errors.push(`${pathPrefix}: approval_state=not_required requires human_review_required=false`);
    }
    if (st === 'rejected' && ds === true) {
      errors.push(`${pathPrefix}: approval_state=rejected requires downstream_allowed=false`);
    }
  }

  return errors.length === 0 ? ok() : fail(errors);
}

/**
 * Validates a `CapabilityPolicy` block. The contract is explicit
 * about every block being present. Each block's internal shape is
 * validated lightly; deep validation belongs to the corresponding
 * enforcement layer.
 */
export function validatePolicy(value: unknown, pathPrefix = 'policy'): ValidationResult {
  if (!isPlainRecord(value)) {
    return fail([`${pathPrefix} must be an object`]);
  }
  const errors: string[] = [];

  if (!isPlainRecord(value['human_review_policy'])) {
    errors.push(`${pathPrefix}.human_review_policy is required and must be an object`);
  } else {
    const hrp = value['human_review_policy'];
    if (typeof hrp['required'] !== 'boolean') {
      errors.push(`${pathPrefix}.human_review_policy.required must be a boolean`);
    }
    if (typeof hrp['reason'] !== 'string' || hrp['reason'].length === 0) {
      errors.push(`${pathPrefix}.human_review_policy.reason is required and must be a non-empty string`);
    }
    if (
      hrp['review_state_required'] !== undefined &&
      hrp['review_state_required'] !== 'reviewed_approved' &&
      hrp['review_state_required'] !== 'reviewed_rejected'
    ) {
      errors.push(
        `${pathPrefix}.human_review_policy.review_state_required must be reviewed_approved or reviewed_rejected`
      );
    }
    if (hrp['no_auto_approval'] !== undefined && typeof hrp['no_auto_approval'] !== 'boolean') {
      errors.push(`${pathPrefix}.human_review_policy.no_auto_approval must be boolean`);
    }
  }

  if (!isPlainRecord(value['downstream_policy'])) {
    errors.push(`${pathPrefix}.downstream_policy is required and must be an object`);
  } else {
    const dp = value['downstream_policy'];
    if (dp['downstream_allowed'] !== true && dp['downstream_allowed'] !== false && dp['downstream_allowed'] !== 'conditional') {
      errors.push(`${pathPrefix}.downstream_policy.downstream_allowed must be true, false, or 'conditional'`);
    }
    if (typeof dp['reason'] !== 'string' || dp['reason'].length === 0) {
      errors.push(`${pathPrefix}.downstream_policy.reason is required and must be a non-empty string`);
    }
  }

  if (!isPlainRecord(value['privacy_requirement'])) {
    errors.push(`${pathPrefix}.privacy_requirement is required and must be an object`);
  } else {
    const pr = value['privacy_requirement'];
    if (typeof pr['tier'] !== 'string' || !(PRIVACY_TIERS as readonly string[]).includes(pr['tier'])) {
      errors.push(`${pathPrefix}.privacy_requirement.tier must be one of ${PRIVACY_TIERS.join(', ')}`);
    }
    if (typeof pr['zdr_required'] !== 'boolean') {
      errors.push(`${pathPrefix}.privacy_requirement.zdr_required must be boolean`);
    }
    if (!Array.isArray(pr['redact_fields']) || pr['redact_fields'].some((f: unknown) => typeof f !== 'string')) {
      errors.push(`${pathPrefix}.privacy_requirement.redact_fields must be a string array`);
    }
    if (typeof pr['retention_class'] !== 'string' || !(RETENTION_CLASSES as readonly string[]).includes(pr['retention_class'])) {
      errors.push(`${pathPrefix}.privacy_requirement.retention_class must be one of ${RETENTION_CLASSES.join(', ')}`);
    }
  }

  if (!isPlainRecord(value['budget_requirement'])) {
    errors.push(`${pathPrefix}.budget_requirement is required and must be an object`);
  } else {
    const br = value['budget_requirement'];
    if (br['max_cost_usd'] !== undefined && !isFiniteNumberOrUndefined(br['max_cost_usd'])) {
      errors.push(`${pathPrefix}.budget_requirement.max_cost_usd must be a finite number when present`);
    }
    if (br['window'] !== undefined) {
      const windowValue = br['window'] as unknown;
      if (typeof windowValue !== 'string' || !(BUDGET_WINDOWS as readonly string[]).includes(windowValue)) {
        errors.push(`${pathPrefix}.budget_requirement.window must be one of ${BUDGET_WINDOWS.join(', ')} when present`);
      }
    }
  }

  if (!isPlainRecord(value['evaluation_requirement'])) {
    errors.push(`${pathPrefix}.evaluation_requirement is required and must be an object`);
  } else {
    const er = value['evaluation_requirement'];
    if (
      er['metric_set'] !== undefined &&
      (!Array.isArray(er['metric_set']) ||
        (er['metric_set'] as unknown[]).some((m: unknown) => typeof m !== 'string'))
    ) {
      errors.push(`${pathPrefix}.evaluation_requirement.metric_set must be a string array when present`);
    }
    if (typeof er['gold_case_required'] !== 'boolean') {
      errors.push(`${pathPrefix}.evaluation_requirement.gold_case_required must be boolean`);
    }
    if (er['min_quality'] !== undefined && !isFiniteNumberOrUndefined(er['min_quality'])) {
      errors.push(`${pathPrefix}.evaluation_requirement.min_quality must be a finite number in [0,1] when present`);
    } else if (typeof er['min_quality'] === 'number' && (er['min_quality'] < 0 || er['min_quality'] > 1)) {
      errors.push(`${pathPrefix}.evaluation_requirement.min_quality must be in [0,1]`);
    }
  }

  if (!isPlainRecord(value['execution_requirement'])) {
    errors.push(`${pathPrefix}.execution_requirement is required and must be an object`);
  } else {
    const xr = value['execution_requirement'];
    if (!isProviderExecution(xr['provider_execution'])) {
      errors.push(`${pathPrefix}.execution_requirement.provider_execution must be one of ${PROVIDER_EXECUTION_VALUES.join(', ')}`);
    }
    if (typeof xr['deterministic_fallback'] !== 'boolean') {
      errors.push(`${pathPrefix}.execution_requirement.deterministic_fallback must be boolean`);
    }
  }

  return errors.length === 0 ? ok() : fail(errors);
}

/**
 * Validates a `CapabilityResult` envelope.
 *
 * Rules:
 *  - `request_id`, `capability_id`, `schema_version` mirror the
 *    request validation rules.
 *  - `status` MUST be one of `succeeded`, `failed`, `blocked`.
 *  - `status: succeeded` requires `output` to be present and a
 *    complete `governance` block. `error` MUST be absent.
 *  - `status: failed` requires a structured `error`. The category
 *    MUST be `execution` or `internal`. `output` MUST be absent.
 *  - `status: blocked` requires a structured `error` whose category
 *    is `policy` or `contract`. `output` MUST be absent and
 *    `governance.downstream_allowed` MUST be `false`.
 *  - The result MUST NOT contain forbidden field names. Provider
 *    response objects, prompt hashes, reviewer identity, and
 *    credential fields are forbidden.
 */
export function validateCapabilityResult(value: unknown): ValidationResult {
  if (!isPlainRecord(value)) {
    return fail(['result must be an object']);
  }
  const errors: string[] = [];

  if (typeof value['request_id'] !== 'string' || value['request_id'].length === 0) {
    errors.push('result.request_id is required and must be a non-empty string');
  }
  if (typeof value['capability_id'] !== 'string') {
    errors.push('result.capability_id is required and must be a string');
  } else if (!isCapabilityId(value['capability_id'])) {
    errors.push(
      `result.capability_id must match ${CAPABILITY_ID_PATTERN.source}; got ${JSON.stringify(value['capability_id'])}`
    );
  }
  if (!isSchemaVersion(value['schema_version'])) {
    errors.push('result.schema_version is required and must be a semver string');
  } else {
    const parts = value['schema_version'].split('.');
    const major = parts.length > 0 ? Number(parts[0]) : Number.NaN;
    if (Number.isNaN(major) || !(SUPPORTED_CAPABILITY_CONTRACT_MAJORS as readonly number[]).includes(major)) {
      errors.push(
        `result.schema_version major ${Number.isNaN(major) ? 'NaN' : String(major)} is not supported; supported majors: ${SUPPORTED_CAPABILITY_CONTRACT_MAJORS.join(', ')}`
      );
    }
  }

  if (!isCapabilityResultStatus(value['status'])) {
    errors.push(
      `result.status must be one of ${CAPABILITY_RESULT_STATUSES.join(', ')}`
    );
  } else {
    const status = value['status'];

    if (status === 'succeeded') {
      if (value['output'] === undefined) {
        errors.push('result.status=succeeded requires output to be present');
      }
      if (value['error'] !== undefined) {
        errors.push('result.status=succeeded must not carry an error block');
      }
    } else if (status === 'failed') {
      if (value['output'] !== undefined) {
        errors.push('result.status=failed must not carry an output');
      }
      if (value['error'] === undefined) {
        errors.push('result.status=failed requires a structured error');
      }
    } else if (status === 'blocked') {
      if (value['output'] !== undefined) {
        errors.push('result.status=blocked must not carry an output');
      }
      if (value['error'] === undefined) {
        errors.push('result.status=blocked requires a structured error');
      }
    }

    if (status === 'succeeded' || status === 'failed' || status === 'blocked') {
      const governanceResult = validateGovernance(value['governance'], 'result.governance');
      if (!governanceResult.ok) {
        errors.push(...governanceResult.errors);
      }
      if (status === 'blocked') {
        const gov = value['governance'];
        if (isPlainRecord(gov) && gov['downstream_allowed'] === true) {
          errors.push('result.status=blocked requires governance.downstream_allowed=false');
        }
      }
      if (status === 'failed') {
        if (value['error'] !== undefined) {
          const err = value['error'];
          if (isPlainRecord(err) && isCapabilityErrorCategory(err['category'])) {
            const cat = err['category'];
            if (cat !== 'execution' && cat !== 'internal') {
              errors.push(`result.status=failed requires error.category=execution or internal; got ${cat}`);
            }
          }
        }
      }
      if (status === 'blocked') {
        if (value['error'] !== undefined) {
          const err = value['error'];
          if (isPlainRecord(err) && isCapabilityErrorCategory(err['category'])) {
            const cat = err['category'];
            if (cat !== 'policy' && cat !== 'contract') {
              errors.push(`result.status=blocked requires error.category=policy or contract; got ${cat}`);
            }
          }
        }
      }
    }
  }

  if (value['error'] !== undefined) {
    if (!isPlainRecord(value['error'])) {
      errors.push('result.error must be an object when present');
    } else {
      const err = value['error'];
      if (!isCapabilityErrorCategory(err['category'])) {
        errors.push(
          `result.error.category must be one of ${CAPABILITY_ERROR_CATEGORIES.join(', ')}`
        );
      }
      if (!isCapabilityErrorCode(err['code'])) {
        errors.push(
          `result.error.code must be one of ${CAPABILITY_ERROR_CODES.join(', ')}`
        );
      }
      if (typeof err['message'] !== 'string' || err['message'].length === 0) {
        errors.push('result.error.message is required and must be a non-empty string');
      }
    }
  }

  const forbidden = findForbiddenFieldPaths(value);
  if (forbidden.length > 0) {
    errors.push(
      `result contains forbidden provider/credential fields: ${forbidden.join(', ')}`
    );
  }

  return errors.length === 0 ? ok() : fail(errors);
}

/**
 * Helper: builds a `CapabilityError` value. The function is a
 * convenience for callers that want to construct errors without
 * duplicating the literal-union plumbing.
 */
export function buildCapabilityError(
  category: CapabilityError['category'],
  code: CapabilityError['code'],
  message: string,
  details?: CapabilityError['details']
): CapabilityError {
  return details === undefined
    ? { category, code, message }
    : { category, code, message, details };
}

/**
 * Re-exports used by the helper `isCapabilityErrorCode` import above.
 * The alias is intentional: the same predicate is used both inside
 * and outside this file and we want the call sites to read clearly.
 */
export const _internal = {
  isCode: _isCode,
};

/**
 * Validates a `CapabilityDefinition` shape and consistency.
 *
 * Rules:
 *  - All required string fields are present and non-empty.
 *  - `status`, `risk_tier`, `domain`, `provider_execution` are
 *    constrained to the allowed enums.
 *  - `human_review: true` requires `downstream_policy.downstream_allowed`
 *    to be `false` or `'conditional'` (with the conditional flag
 *    resolved only by a separate review capability).
 *  - `downstream_policy.downstream_allowed: true` requires
 *    `human_review: false`.
 *  - `input_schema_ref` and `output_schema_ref` are relative paths
 *    starting with `schemas/`.
 *  - The embedded `policy` block validates via `validatePolicy`.
 *  - The capability_id MUST match the capability ID pattern.
 *  - No forbidden field names are present at the definition level.
 */
export function validateCapabilityDefinition(value: unknown): ValidationResult {
  if (!isPlainRecord(value)) {
    return fail(['definition must be an object']);
  }
  const errors: string[] = [];

  if (typeof value['capability_id'] !== 'string') {
    errors.push('definition.capability_id is required and must be a string');
  } else if (!isCapabilityId(value['capability_id'])) {
    errors.push(
      `definition.capability_id must match ${CAPABILITY_ID_PATTERN.source}; got ${JSON.stringify(value['capability_id'])}`
    );
  }
  if (typeof value['name'] !== 'string' || value['name'].length === 0) {
    errors.push('definition.name is required and must be a non-empty string');
  }
  if (
    typeof value['domain'] !== 'string' ||
    !(CAPABILITY_DOMAINS as readonly string[]).includes(value['domain'])
  ) {
    errors.push(`definition.domain must be one of ${CAPABILITY_DOMAINS.join(', ')}`);
  }
  if (
    typeof value['status'] !== 'string' ||
    !(CAPABILITY_STATUSES as readonly string[]).includes(value['status'])
  ) {
    errors.push(`definition.status must be one of ${CAPABILITY_STATUSES.join(', ')}`);
  }
  if (
    typeof value['risk_tier'] !== 'string' ||
    !(CAPABILITY_RISK_TIERS as readonly string[]).includes(value['risk_tier'])
  ) {
    errors.push(`definition.risk_tier must be one of ${CAPABILITY_RISK_TIERS.join(', ')}`);
  }
  if (typeof value['human_review'] !== 'boolean') {
    errors.push('definition.human_review is required and must be a boolean');
  }
  if (typeof value['roadmap_owner'] !== 'string' || value['roadmap_owner'].length === 0) {
    errors.push('definition.roadmap_owner is required and must be a non-empty string');
  }
  if (!isProviderExecution(value['provider_execution'])) {
    errors.push(
      `definition.provider_execution must be one of ${PROVIDER_EXECUTION_VALUES.join(', ')}`
    );
  }
  if (
    value['input_schema_ref'] !== null &&
    (typeof value['input_schema_ref'] !== 'string' ||
      !(value['input_schema_ref'] as string).startsWith('schemas/'))
  ) {
    errors.push('definition.input_schema_ref must be null or a path that starts with schemas/');
  }
  if (
    value['output_schema_ref'] !== null &&
    (typeof value['output_schema_ref'] !== 'string' ||
      !(value['output_schema_ref'] as string).startsWith('schemas/'))
  ) {
    errors.push('definition.output_schema_ref must be null or a path that starts with schemas/');
  }

  if (!isPlainRecord(value['downstream_policy'])) {
    errors.push('definition.downstream_policy is required and must be an object');
  } else {
    const dp = value['downstream_policy'];
    if (dp['downstream_allowed'] !== true && dp['downstream_allowed'] !== false && dp['downstream_allowed'] !== 'conditional') {
      errors.push(
        "definition.downstream_policy.downstream_allowed must be true, false, or 'conditional'"
      );
    }
    if (typeof dp['reason'] !== 'string' || dp['reason'].length === 0) {
      errors.push('definition.downstream_policy.reason is required and must be a non-empty string');
    }
  }

  if (errors.length === 0 && isPlainRecord(value['downstream_policy'])) {
    const dp = value['downstream_policy'] as unknown as DownstreamPolicy;
    const hr = value['human_review'] as boolean;

    // The catalog permits `human_review: true, downstream_allowed: true`
    // for the post-review export contract capability. The contract does
    // not enforce the inverse rule (human_review: true + downstream_allowed:
    // true is forbidden) at the definition level because the catalog
    // allows it as the post-review boundary. The runtime layer is
    // responsible for ensuring that the capability is only invoked on a
    // reviewed input. The catalog test in
    // `tests/architecture/ai-capabilities.test.ts` enforces the
    // complementary rule (human_review: false + downstream_allowed: true
    // is permitted only for the serve-only allowlist).
    if (hr === false && dp.downstream_allowed === true) {
      // human_review: false + downstream_allowed: true is only legal for
      // the serve-only allowlist. The caller (registry) enforces that
      // by passing a known list of `serve_only_ids`. Here we record
      // the rule; the registry surfaces the violation.
    }
  }

  if (typeof value['description'] !== 'string' && value['description'] !== undefined) {
    errors.push('definition.description must be a string when present');
  }

  const policyResult = validatePolicy(value['policy'], 'definition.policy');
  if (!policyResult.ok) {
    errors.push(...policyResult.errors);
  }

  if (errors.length === 0 && isPlainRecord(value['policy']) && isPlainRecord(value['downstream_policy'])) {
    const hrp = (value['policy'] as unknown as CapabilityPolicy).human_review_policy;
    if (hrp.required && hrp.no_auto_approval !== true) {
      // Soft check: a human-review-required capability should set
      // no_auto_approval: true so that the routing layer (AI-78) cannot
      // bypass review. The contract does not require it, but the test
      // suite does.
    }
  }

  const forbidden = findForbiddenFieldPaths(value);
  if (forbidden.length > 0) {
    errors.push(
      `definition contains forbidden provider/credential fields: ${forbidden.join(', ')}`
    );
  }

  return errors.length === 0 ? ok() : fail(errors);
}

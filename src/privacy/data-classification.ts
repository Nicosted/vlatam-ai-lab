/**
 * AI-73 privacy enforcement — canonical data-classification model.
 *
 * This module defines the versioned, deterministic classification
 * hierarchy that the privacy enforcer uses as a hard execution gate.
 * The model is declaration-independent: classifications are properties
 * of the *request payload*, declared explicitly by the caller in
 * `CapabilityContext.data_classification`. The enforcer never infers,
 * never downgrades, and fails closed on missing or unknown values.
 *
 * AI-71 compatibility: AI-71 shipped a four-value request vocabulary
 * (`public`, `internal`, `regulated`, `restricted`). AI-73 adds
 * `confidential` between `internal` and `regulated` as an additive
 * (MINOR) contract change; the four existing values keep their exact
 * semantics and relative order. The capability-side `PrivacyTier`
 * vocabulary (`standard`/`sensitive`/`regulated`/`restricted`) is a
 * *capability* declaration, not a request classification; its explicit
 * mapping lives in `AI71_PRIVACY_TIER_CLASSIFICATION_EQUIVALENT`.
 */

export const DATA_CLASSIFICATION_MODEL_VERSION = '1.0.0';

export const DATA_CLASSIFICATION_IDS = [
  'public',
  'internal',
  'confidential',
  'regulated',
  'restricted',
] as const;
export type DataClassificationId = (typeof DATA_CLASSIFICATION_IDS)[number];

/** Retention behaviors a profile (or fixture store) can declare. */
export const RETENTION_BEHAVIORS = [
  'none',
  'ephemeral_memory',
  'bounded_local_fixture',
  'provider_declared_bounded',
  'provider_unknown',
  'forbidden',
] as const;
export type RetentionBehavior = (typeof RETENTION_BEHAVIORS)[number];

/** Execution modes the privacy layer reasons about. Mirrors AI-72's
 * `ProviderExecutionMode` values without importing the execution layer
 * (the privacy layer must stay provider-neutral and cycle-free). */
export const ALLOWED_EXECUTION_MODES = ['replay', 'live'] as const;
export type AllowedExecutionMode = (typeof ALLOWED_EXECUTION_MODES)[number];

/**
 * Per-classification enforcement properties. Every field is explicit;
 * absence of a restriction is a statement, never a default.
 */
export interface DataClassificationDefinition {
  readonly classification_id: DataClassificationId;
  /** Deterministic sensitivity rank. Higher rank = more sensitive. */
  readonly rank: number;
  /** Whether external (provider-side) processing is *potentially*
   * allowed. `false` means no profile with external processing may
   * ever handle this classification. `true` is necessary, never
   * sufficient: policy, ZDR, and retention checks still apply. */
  readonly external_processing_potentially_allowed: boolean;
  /** Whether deterministic redaction is mandatory before execution. */
  readonly redaction_mandatory: boolean;
  /** Whether verified ZDR is mandatory whenever the selected profile
   * performs external processing. */
  readonly verified_zdr_mandatory_for_external: boolean;
  /** Profile retention behaviors this classification may tolerate. */
  readonly permitted_retention_behaviors: readonly RetentionBehavior[];
  /** Execution modes this classification may use at all. */
  readonly permitted_execution_modes: readonly AllowedExecutionMode[];
  /** Whether payload content may enter logs or audit records. AI-73
   * keeps this `false` for every classification: all audits are
   * metadata-only regardless of sensitivity (defense in depth). */
  readonly payload_may_enter_logs: false;
  /** Whether human review remains required before any downstream
   * export of results derived from this classification. */
  readonly human_review_required_before_export: boolean;
}

export const DATA_CLASSIFICATION_MODEL: Readonly<
  Record<DataClassificationId, DataClassificationDefinition>
> = Object.freeze({
  public: Object.freeze({
    classification_id: 'public',
    rank: 0,
    external_processing_potentially_allowed: true,
    redaction_mandatory: false,
    verified_zdr_mandatory_for_external: false,
    permitted_retention_behaviors: Object.freeze([
      'none',
      'ephemeral_memory',
      'bounded_local_fixture',
      'provider_declared_bounded',
      'provider_unknown',
    ]) as readonly RetentionBehavior[],
    permitted_execution_modes: Object.freeze(['replay', 'live']) as readonly AllowedExecutionMode[],
    payload_may_enter_logs: false,
    human_review_required_before_export: false,
  }),
  internal: Object.freeze({
    classification_id: 'internal',
    rank: 1,
    external_processing_potentially_allowed: true,
    redaction_mandatory: true,
    verified_zdr_mandatory_for_external: false,
    permitted_retention_behaviors: Object.freeze([
      'none',
      'ephemeral_memory',
      'bounded_local_fixture',
      'provider_declared_bounded',
      'provider_unknown',
    ]) as readonly RetentionBehavior[],
    permitted_execution_modes: Object.freeze(['replay', 'live']) as readonly AllowedExecutionMode[],
    payload_may_enter_logs: false,
    human_review_required_before_export: false,
  }),
  confidential: Object.freeze({
    classification_id: 'confidential',
    rank: 2,
    external_processing_potentially_allowed: true,
    redaction_mandatory: true,
    verified_zdr_mandatory_for_external: false,
    permitted_retention_behaviors: Object.freeze([
      'none',
      'ephemeral_memory',
      'bounded_local_fixture',
      'provider_declared_bounded',
    ]) as readonly RetentionBehavior[],
    permitted_execution_modes: Object.freeze(['replay', 'live']) as readonly AllowedExecutionMode[],
    payload_may_enter_logs: false,
    human_review_required_before_export: true,
  }),
  regulated: Object.freeze({
    classification_id: 'regulated',
    rank: 3,
    external_processing_potentially_allowed: true,
    redaction_mandatory: true,
    verified_zdr_mandatory_for_external: true,
    permitted_retention_behaviors: Object.freeze([
      'none',
      'ephemeral_memory',
      'bounded_local_fixture',
    ]) as readonly RetentionBehavior[],
    permitted_execution_modes: Object.freeze(['replay', 'live']) as readonly AllowedExecutionMode[],
    payload_may_enter_logs: false,
    human_review_required_before_export: true,
  }),
  restricted: Object.freeze({
    classification_id: 'restricted',
    rank: 4,
    external_processing_potentially_allowed: false,
    redaction_mandatory: true,
    verified_zdr_mandatory_for_external: true,
    permitted_retention_behaviors: Object.freeze([
      'none',
      'ephemeral_memory',
    ]) as readonly RetentionBehavior[],
    permitted_execution_modes: Object.freeze(['replay']) as readonly AllowedExecutionMode[],
    payload_may_enter_logs: false,
    human_review_required_before_export: true,
  }),
});

export function isDataClassificationId(value: unknown): value is DataClassificationId {
  return (
    typeof value === 'string' && (DATA_CLASSIFICATION_IDS as readonly string[]).includes(value)
  );
}

export function isRetentionBehavior(value: unknown): value is RetentionBehavior {
  return typeof value === 'string' && (RETENTION_BEHAVIORS as readonly string[]).includes(value);
}

export function classificationRank(id: DataClassificationId): number {
  return DATA_CLASSIFICATION_MODEL[id].rank;
}

/** Deterministic comparison: negative when `a` is less sensitive. */
export function compareClassifications(a: DataClassificationId, b: DataClassificationId): number {
  return classificationRank(a) - classificationRank(b);
}

/**
 * AI-71 request-context compatibility mapping. Every AI-71 value maps
 * onto the identical canonical value; `confidential` is new in AI-73
 * and has no AI-71 predecessor. This map exists so the migration is
 * explicit and testable rather than an implicit string coincidence.
 */
export const AI71_DATA_CLASSIFICATION_COMPAT: Readonly<Record<string, DataClassificationId>> =
  Object.freeze({
    public: 'public',
    internal: 'internal',
    regulated: 'regulated',
    restricted: 'restricted',
  });

/**
 * AI-71 capability `PrivacyTier` → canonical classification whose
 * protections the tier corresponds to. The tier is a declaration on
 * the *capability*; the request classification remains authoritative
 * for enforcement. The mapping is used for documentation, coverage
 * validation, and tests — never for automatic downgrade or upgrade.
 */
export const AI71_PRIVACY_TIER_CLASSIFICATION_EQUIVALENT: Readonly<
  Record<'standard' | 'sensitive' | 'regulated' | 'restricted', DataClassificationId>
> = Object.freeze({
  standard: 'internal',
  sensitive: 'confidential',
  regulated: 'regulated',
  restricted: 'restricted',
});

/**
 * AI-71 capability `RetentionClass` → profile retention behaviors the
 * class tolerates. This is the operational translation AI-71 deferred
 * to AI-73. `provider_unknown` and `forbidden` are never tolerated by
 * any retention class: unknown retention is only reachable when the
 * request classification independently tolerates it AND the policy
 * catalog entry allows it.
 */
export const AI71_RETENTION_CLASS_ALLOWED_BEHAVIORS: Readonly<
  Record<
    'no_retention' | 'audit_only' | 'audit_with_payload' | 'reviewed_export',
    readonly RetentionBehavior[]
  >
> = Object.freeze({
  no_retention: Object.freeze(['none', 'ephemeral_memory']) as readonly RetentionBehavior[],
  audit_only: Object.freeze([
    'none',
    'ephemeral_memory',
    'bounded_local_fixture',
  ]) as readonly RetentionBehavior[],
  audit_with_payload: Object.freeze([
    'none',
    'ephemeral_memory',
    'bounded_local_fixture',
    'provider_declared_bounded',
  ]) as readonly RetentionBehavior[],
  reviewed_export: Object.freeze([
    'none',
    'ephemeral_memory',
    'bounded_local_fixture',
    'provider_declared_bounded',
  ]) as readonly RetentionBehavior[],
});

export type ClassificationResolution =
  | { readonly ok: true; readonly classification: DataClassificationId }
  | {
      readonly ok: false;
      readonly reason: 'DATA_CLASSIFICATION_REQUIRED' | 'UNKNOWN_DATA_CLASSIFICATION';
    };

/**
 * Resolves the explicit request classification. Missing fails closed;
 * unknown fails closed; there is no default and no inference.
 */
export function resolveRequestClassification(request: unknown): ClassificationResolution {
  const record =
    typeof request === 'object' && request !== null && !Array.isArray(request)
      ? (request as Record<string, unknown>)
      : undefined;
  const context =
    record && typeof record['context'] === 'object' && record['context'] !== null && !Array.isArray(record['context'])
      ? (record['context'] as Record<string, unknown>)
      : undefined;
  const declared = context?.['data_classification'];
  if (declared === undefined || declared === null || declared === '') {
    return { ok: false, reason: 'DATA_CLASSIFICATION_REQUIRED' };
  }
  if (!isDataClassificationId(declared)) {
    return { ok: false, reason: 'UNKNOWN_DATA_CLASSIFICATION' };
  }
  return { ok: true, classification: declared };
}

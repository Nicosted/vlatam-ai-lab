/**
 * AI-73 privacy enforcement — provider-neutral privacy contracts and
 * the machine-readable policy catalog.
 *
 * Strict distinction maintained by these types:
 *
 *  1. capability requirement  — what the capability declares it needs
 *     (`PrivacyRequirement`, AI-71, `src/capabilities/policy.ts`);
 *  2. profile declaration     — what a profile *claims* about itself
 *     (`PrivacyProfileDeclaration`); a declaration is never proof;
 *  3. verification evidence   — repository-owned evidence records
 *     (`src/privacy/zdr-evidence.ts`) that *prove* a claim;
 *  4. enforcement decision    — the deterministic outcome computed by
 *     the enforcer (`PrivacyEnforcementDecision`).
 */

import { isForbiddenFieldName } from '../capabilities/error.js';
import {
  ALLOWED_EXECUTION_MODES,
  DATA_CLASSIFICATION_IDS,
  RETENTION_BEHAVIORS,
  isDataClassificationId,
  isRetentionBehavior,
} from './data-classification.js';
import type {
  AllowedExecutionMode,
  DataClassificationId,
  RetentionBehavior,
} from './data-classification.js';
import { isPrivacyReasonCode, privacyError } from './errors.js';
import type { PrivacyReasonCode } from './errors.js';

export const PRIVACY_POLICY_CATALOG_VERSION = '1.0.0';

/* ------------------------------------------------------------------ *
 * Profile privacy declaration (Deliverable C)
 * ------------------------------------------------------------------ */

export const ZDR_SUPPORT_STATUSES = [
  'verified',
  'declared_unverified',
  'unsupported',
  'unknown',
] as const;
export type ZdrSupportStatus = (typeof ZDR_SUPPORT_STATUSES)[number];

export const TRAINING_USE_POLICIES = [
  'contractually_prohibited_verified',
  'declared_not_used',
  'may_be_used',
  'unknown',
] as const;
export type TrainingUsePolicy = (typeof TRAINING_USE_POLICIES)[number];

export const REPLAY_FIXTURE_ORIGINS = [
  'synthetic',
  'sanitized_recorded',
  'unsanitized_recorded',
  'unknown',
] as const;
export type ReplayFixtureOrigin = (typeof REPLAY_FIXTURE_ORIGINS)[number];

export const FIXTURE_SANITIZATION_STATUSES = [
  'not_applicable',
  'sanitized',
  'unsanitized',
  'unknown',
] as const;
export type FixtureSanitizationStatus = (typeof FIXTURE_SANITIZATION_STATUSES)[number];

export type ExternalProcessing = 'allowed' | 'forbidden';

/**
 * The privacy declaration every execution profile must carry. A
 * declaration describes; it never verifies. `zdr_support: 'verified'`
 * is only honored when the referenced evidence record independently
 * validates (see `zdr-evidence.ts`).
 */
export interface PrivacyProfileDeclaration {
  readonly max_data_classification: DataClassificationId;
  readonly external_processing: ExternalProcessing;
  readonly zdr_support: ZdrSupportStatus;
  readonly zdr_evidence_ref?: string | undefined;
  readonly retention_behavior: RetentionBehavior;
  readonly training_use: TrainingUsePolicy;
  readonly processing_region: string;
  readonly pre_execution_redaction_required: boolean;
  readonly replay_fixture_origin?: ReplayFixtureOrigin | undefined;
  readonly replay_fixture_sanitization?: FixtureSanitizationStatus | undefined;
  readonly regulated_data_permitted: boolean;
  readonly restricted_data_permitted: boolean;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Structural validation of a profile privacy declaration. Returns a
 * deterministic list of errors; empty means valid. `mode` tightens the
 * replay-specific fields: a replay profile must declare its fixture
 * origin and sanitization status explicitly.
 */
export function validatePrivacyProfileDeclaration(
  value: unknown,
  mode?: AllowedExecutionMode
): readonly string[] {
  if (!isPlainRecord(value)) return ['privacy declaration must be an object'];
  const errors: string[] = [];
  if (!isDataClassificationId(value['max_data_classification'])) {
    errors.push(`privacy.max_data_classification must be one of ${DATA_CLASSIFICATION_IDS.join(', ')}`);
  }
  if (value['external_processing'] !== 'allowed' && value['external_processing'] !== 'forbidden') {
    errors.push('privacy.external_processing must be allowed or forbidden');
  }
  if (!(ZDR_SUPPORT_STATUSES as readonly string[]).includes(value['zdr_support'] as string)) {
    errors.push(`privacy.zdr_support must be one of ${ZDR_SUPPORT_STATUSES.join(', ')}`);
  }
  if (value['zdr_evidence_ref'] !== undefined && typeof value['zdr_evidence_ref'] !== 'string') {
    errors.push('privacy.zdr_evidence_ref must be a string when present');
  }
  if (value['zdr_support'] === 'verified' && typeof value['zdr_evidence_ref'] !== 'string') {
    errors.push('privacy.zdr_support=verified requires privacy.zdr_evidence_ref');
  }
  if (!isRetentionBehavior(value['retention_behavior'])) {
    errors.push(`privacy.retention_behavior must be one of ${RETENTION_BEHAVIORS.join(', ')}`);
  }
  if (!(TRAINING_USE_POLICIES as readonly string[]).includes(value['training_use'] as string)) {
    errors.push(`privacy.training_use must be one of ${TRAINING_USE_POLICIES.join(', ')}`);
  }
  if (typeof value['processing_region'] !== 'string' || value['processing_region'].length === 0) {
    errors.push('privacy.processing_region is required and must be a non-empty string');
  }
  if (typeof value['pre_execution_redaction_required'] !== 'boolean') {
    errors.push('privacy.pre_execution_redaction_required must be a boolean');
  }
  if (
    value['replay_fixture_origin'] !== undefined &&
    !(REPLAY_FIXTURE_ORIGINS as readonly string[]).includes(value['replay_fixture_origin'] as string)
  ) {
    errors.push(`privacy.replay_fixture_origin must be one of ${REPLAY_FIXTURE_ORIGINS.join(', ')}`);
  }
  if (
    value['replay_fixture_sanitization'] !== undefined &&
    !(FIXTURE_SANITIZATION_STATUSES as readonly string[]).includes(
      value['replay_fixture_sanitization'] as string
    )
  ) {
    errors.push(
      `privacy.replay_fixture_sanitization must be one of ${FIXTURE_SANITIZATION_STATUSES.join(', ')}`
    );
  }
  if (mode === 'replay') {
    if (value['replay_fixture_origin'] === undefined) {
      errors.push('replay profiles must declare privacy.replay_fixture_origin');
    }
    if (value['replay_fixture_sanitization'] === undefined) {
      errors.push('replay profiles must declare privacy.replay_fixture_sanitization');
    }
  }
  if (typeof value['regulated_data_permitted'] !== 'boolean') {
    errors.push('privacy.regulated_data_permitted must be a boolean');
  }
  if (typeof value['restricted_data_permitted'] !== 'boolean') {
    errors.push('privacy.restricted_data_permitted must be a boolean');
  }
  return errors;
}

/* ------------------------------------------------------------------ *
 * Policy catalog (Deliverable D)
 * ------------------------------------------------------------------ */

export const ZDR_REQUIREMENTS = ['not_required', 'required_for_external', 'required'] as const;
export type ZdrRequirement = (typeof ZDR_REQUIREMENTS)[number];

export const REDACTION_ACTIONS = [
  'remove',
  'replace_with_marker',
  'hash_identifier',
  'tokenize_reference',
  'preserve',
  'block_request',
] as const;
export type RedactionAction = (typeof REDACTION_ACTIONS)[number];

export interface RedactionRequirement {
  /** Dotted path into the request, rooted at `input`. `[]` after a
   * segment traverses every array element (e.g.
   * `input.evidence_refs[].reviewer_name`). */
  readonly path: string;
  readonly action: RedactionAction;
  /** `required` fails closed when the path is absent; `optional`
   * applies only when the path is present. */
  readonly presence: 'required' | 'optional';
  /** Capability `redact_fields` categories this rule covers. Used by
   * the enforcer to prove that the catalog operationalizes every
   * category the capability declares. */
  readonly covers?: readonly string[];
}

export interface RetentionRequirement {
  readonly allowed_retention_behaviors: readonly RetentionBehavior[];
}

export const PRIVACY_POLICY_DECISIONS = [
  'allow',
  'block',
  'require_redaction',
  'require_local_execution',
  'require_verified_zdr',
  'require_human_review',
] as const;
export type PrivacyPolicyDecision = (typeof PRIVACY_POLICY_DECISIONS)[number];

export interface PrivacyPolicyEntry {
  readonly policy_id: string;
  readonly schema_version: string;
  readonly capability_ids: readonly string[];
  readonly classifications: readonly DataClassificationId[];
  readonly allowed_execution_modes: readonly AllowedExecutionMode[];
  readonly zdr_requirement: ZdrRequirement;
  readonly retention_requirement: RetentionRequirement;
  readonly redaction_rules: readonly RedactionRequirement[];
  readonly decision: PrivacyPolicyDecision;
  /** Deterministic tie-breaker: when more than one entry matches a
   * (capability, classification) pair, the unique highest priority
   * wins; a tie fails closed as ambiguous. */
  readonly priority: number;
  readonly reason_code: PrivacyReasonCode;
  readonly human_review_required: boolean;
}

export interface PrivacyPolicyCatalogData {
  readonly schema_version: string;
  readonly policies: readonly PrivacyPolicyEntry[];
}

const POLICY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]+$/;
const PATH_SEGMENT_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*(\[\])?$/;

export function validateRedactionPath(path: string): readonly string[] {
  const segments = path.split('.');
  if (segments[0] !== 'input') return [`redaction path must be rooted at input: ${path}`];
  if (segments.length < 2) return [`redaction path must address a field below input: ${path}`];
  const errors: string[] = [];
  for (const segment of segments.slice(1)) {
    if (!PATH_SEGMENT_PATTERN.test(segment)) {
      errors.push(`redaction path segment ${JSON.stringify(segment)} is invalid in ${path}`);
    }
  }
  const terminal = segments[segments.length - 1];
  if (terminal !== undefined && terminal.endsWith('[]')) {
    errors.push(`redaction path must not end with an array traversal: ${path}`);
  }
  return errors;
}

/** Walks catalog data and reports credential-shaped keys. */
function findForbiddenKeys(value: unknown, path: string, hits: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenKeys(item, `${path}[${index}]`, hits));
    return;
  }
  if (!isPlainRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = path === '' ? key : `${path}.${key}`;
    if (isForbiddenFieldName(key)) hits.push(childPath);
    findForbiddenKeys(child, childPath, hits);
  }
}

/**
 * Structural, deterministic validation of raw catalog data. Returns a
 * list of errors; empty means valid. Duplicate policy IDs, unknown
 * enums, malformed redaction paths, and credential-shaped keys are all
 * rejected here — the catalog fails closed before any policy is used.
 */
export function validatePrivacyPolicyCatalogData(raw: unknown): readonly string[] {
  if (!isPlainRecord(raw)) return ['privacy policy catalog must be an object'];
  const errors: string[] = [];
  if (typeof raw['schema_version'] !== 'string') {
    errors.push('catalog.schema_version is required');
  }
  if (!Array.isArray(raw['policies']) || raw['policies'].length === 0) {
    errors.push('catalog.policies must be a non-empty array');
    return errors;
  }
  const forbidden: string[] = [];
  findForbiddenKeys(raw, '', forbidden);
  if (forbidden.length > 0) {
    errors.push(`catalog contains credential/provider-shaped keys: ${forbidden.sort().join(', ')}`);
  }
  const seen = new Set<string>();
  raw['policies'].forEach((entry: unknown, index: number) => {
    const prefix = `policies[${index}]`;
    if (!isPlainRecord(entry)) {
      errors.push(`${prefix} must be an object`);
      return;
    }
    const id = entry['policy_id'];
    if (typeof id !== 'string' || !POLICY_ID_PATTERN.test(id)) {
      errors.push(`${prefix}.policy_id is missing or malformed`);
    } else if (seen.has(id)) {
      errors.push(`${prefix}.policy_id duplicates ${id}`);
    } else {
      seen.add(id);
    }
    if (typeof entry['schema_version'] !== 'string') errors.push(`${prefix}.schema_version is required`);
    if (
      !Array.isArray(entry['capability_ids']) ||
      entry['capability_ids'].length === 0 ||
      entry['capability_ids'].some((c: unknown) => typeof c !== 'string' || c.length === 0)
    ) {
      errors.push(`${prefix}.capability_ids must be a non-empty string array`);
    }
    if (
      !Array.isArray(entry['classifications']) ||
      entry['classifications'].length === 0 ||
      entry['classifications'].some((c: unknown) => !isDataClassificationId(c))
    ) {
      errors.push(`${prefix}.classifications must be a non-empty array of known classifications`);
    }
    if (
      !Array.isArray(entry['allowed_execution_modes']) ||
      entry['allowed_execution_modes'].some(
        (m: unknown) => !(ALLOWED_EXECUTION_MODES as readonly string[]).includes(m as string)
      )
    ) {
      errors.push(`${prefix}.allowed_execution_modes must contain only replay/live`);
    }
    if (!(ZDR_REQUIREMENTS as readonly string[]).includes(entry['zdr_requirement'] as string)) {
      errors.push(`${prefix}.zdr_requirement must be one of ${ZDR_REQUIREMENTS.join(', ')}`);
    }
    const retention = entry['retention_requirement'];
    if (
      !isPlainRecord(retention) ||
      !Array.isArray(retention['allowed_retention_behaviors']) ||
      retention['allowed_retention_behaviors'].some((b: unknown) => !isRetentionBehavior(b))
    ) {
      errors.push(`${prefix}.retention_requirement.allowed_retention_behaviors must list known behaviors`);
    }
    if (!Array.isArray(entry['redaction_rules'])) {
      errors.push(`${prefix}.redaction_rules must be an array`);
    } else {
      entry['redaction_rules'].forEach((rule: unknown, ruleIndex: number) => {
        const rulePrefix = `${prefix}.redaction_rules[${ruleIndex}]`;
        if (!isPlainRecord(rule)) {
          errors.push(`${rulePrefix} must be an object`);
          return;
        }
        if (typeof rule['path'] !== 'string') {
          errors.push(`${rulePrefix}.path is required`);
        } else {
          errors.push(...validateRedactionPath(rule['path']).map(e => `${rulePrefix}: ${e}`));
        }
        if (!(REDACTION_ACTIONS as readonly string[]).includes(rule['action'] as string)) {
          errors.push(`${rulePrefix}.action must be one of ${REDACTION_ACTIONS.join(', ')}`);
        }
        if (rule['presence'] !== 'required' && rule['presence'] !== 'optional') {
          errors.push(`${rulePrefix}.presence must be required or optional`);
        }
        if (
          rule['covers'] !== undefined &&
          (!Array.isArray(rule['covers']) || rule['covers'].some((c: unknown) => typeof c !== 'string'))
        ) {
          errors.push(`${rulePrefix}.covers must be a string array when present`);
        }
      });
    }
    if (!(PRIVACY_POLICY_DECISIONS as readonly string[]).includes(entry['decision'] as string)) {
      errors.push(`${prefix}.decision must be one of ${PRIVACY_POLICY_DECISIONS.join(', ')}`);
    }
    if (typeof entry['priority'] !== 'number' || !Number.isInteger(entry['priority'])) {
      errors.push(`${prefix}.priority must be an integer`);
    }
    if (!isPrivacyReasonCode(entry['reason_code'])) {
      errors.push(`${prefix}.reason_code must be a known privacy reason code`);
    }
    if (typeof entry['human_review_required'] !== 'boolean') {
      errors.push(`${prefix}.human_review_required must be a boolean`);
    }
  });
  return errors;
}

export type PolicyResolution =
  | { readonly ok: true; readonly entry: PrivacyPolicyEntry }
  | {
      readonly ok: false;
      readonly reason: Extract<PrivacyReasonCode, 'PRIVACY_POLICY_MISSING' | 'PRIVACY_POLICY_AMBIGUOUS'>;
    };

/**
 * Loaded, validated privacy policy catalog with deterministic
 * resolution. Construction fails closed on any validation error.
 */
export class PrivacyPolicyCatalog {
  private readonly entries: readonly PrivacyPolicyEntry[];

  constructor(raw: unknown) {
    const errors = validatePrivacyPolicyCatalogData(raw);
    if (errors.length > 0) {
      // Details stay out of the thrown error (sanitized message only);
      // callers that need diagnostics run validatePrivacyPolicyCatalogData.
      throw privacyError('PRIVACY_CONFIGURATION_INVALID');
    }
    this.entries = (raw as PrivacyPolicyCatalogData).policies;
  }

  list(): readonly PrivacyPolicyEntry[] {
    return this.entries;
  }

  /**
   * Deterministic resolution: all entries matching the capability and
   * classification are candidates; the unique highest-priority
   * candidate wins. Zero candidates or a priority tie fails closed.
   */
  resolve(capabilityId: string, classification: DataClassificationId): PolicyResolution {
    const matches = this.entries.filter(
      entry =>
        entry.capability_ids.includes(capabilityId) &&
        entry.classifications.includes(classification)
    );
    if (matches.length === 0) return { ok: false, reason: 'PRIVACY_POLICY_MISSING' };
    if (matches.length === 1) {
      const only = matches[0];
      if (only === undefined) return { ok: false, reason: 'PRIVACY_POLICY_MISSING' };
      return { ok: true, entry: only };
    }
    const sorted = [...matches].sort((a, b) => b.priority - a.priority);
    const first = sorted[0];
    const second = sorted[1];
    if (first === undefined || (second !== undefined && second.priority === first.priority)) {
      return { ok: false, reason: 'PRIVACY_POLICY_AMBIGUOUS' };
    }
    return { ok: true, entry: first };
  }
}

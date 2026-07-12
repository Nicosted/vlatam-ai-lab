/**
 * AI-73 privacy enforcement — ZDR verification evidence model.
 *
 * A ZDR *declaration* on a profile is never proof. Verified ZDR is
 * only satisfied by a repository-owned evidence record that is
 * structurally valid, explicitly scoped to the profile, capability,
 * classification, and retention behavior in question, human-reviewed,
 * unexpired, and `verified`.
 *
 * The evidence store is deterministic and repository-owned. AI-73
 * never contacts provider or compliance APIs, and never infers ZDR
 * from provider branding, model identifiers, endpoint names,
 * environment flags, or replay mode.
 */

import { isDataClassificationId, isRetentionBehavior } from './data-classification.js';
import type { DataClassificationId, RetentionBehavior } from './data-classification.js';
import type { PrivacyReasonCode } from './errors.js';
import { privacyError } from './errors.js';
import type { TrainingUsePolicy, ZdrSupportStatus } from './privacy-policy.js';
import { TRAINING_USE_POLICIES, ZDR_SUPPORT_STATUSES } from './privacy-policy.js';

export const ZDR_EVIDENCE_SCHEMA_VERSION = '1.0.0';

export type ZdrVerificationStatus = ZdrSupportStatus;

export const ZDR_VERIFICATION_SOURCE_TYPES = [
  'provider_contract_review',
  'internal_security_review',
  'test_fixture',
] as const;
export type ZdrVerificationSourceType = (typeof ZDR_VERIFICATION_SOURCE_TYPES)[number];

export interface ZdrVerificationEvidence {
  readonly evidence_id: string;
  readonly schema_version: string;
  /** Profiles the evidence explicitly covers. No wildcarding. */
  readonly profile_ids: readonly string[];
  /** Capabilities the evidence explicitly covers. No wildcarding. */
  readonly capability_ids: readonly string[];
  /** Classifications the evidence explicitly covers. */
  readonly classifications: readonly DataClassificationId[];
  /** Processing regions the evidence covers (informational scope). */
  readonly regions: readonly string[];
  /** Retention behaviors the evidence attests for the covered scope. */
  readonly retention_behaviors: readonly RetentionBehavior[];
  readonly training_use: TrainingUsePolicy;
  readonly verification_source_type: ZdrVerificationSourceType;
  readonly status: ZdrVerificationStatus;
  readonly verified_at: string;
  readonly expires_at: string;
  /** Stable content hash of the underlying evidence document. The
   * document itself never enters the repository or any audit. */
  readonly evidence_hash: string;
  readonly human_review_status: 'reviewed_approved' | 'pending' | 'rejected';
}

export interface ZdrEvidenceCatalogData {
  readonly schema_version: string;
  readonly evidence: readonly ZdrVerificationEvidence[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0);
}

export function validateZdrEvidenceRecord(value: unknown): readonly string[] {
  if (!isPlainRecord(value)) return ['evidence record must be an object'];
  const errors: string[] = [];
  if (typeof value['evidence_id'] !== 'string' || value['evidence_id'].length === 0) {
    errors.push('evidence_id is required');
  }
  if (typeof value['schema_version'] !== 'string') errors.push('schema_version is required');
  for (const field of ['profile_ids', 'capability_ids', 'regions'] as const) {
    if (!isStringArray(value[field]) || (value[field] as string[]).length === 0) {
      errors.push(`${field} must be a non-empty string array`);
    }
  }
  if (
    !Array.isArray(value['classifications']) ||
    value['classifications'].length === 0 ||
    value['classifications'].some((c: unknown) => !isDataClassificationId(c))
  ) {
    errors.push('classifications must be a non-empty array of known classifications');
  }
  if (
    !Array.isArray(value['retention_behaviors']) ||
    value['retention_behaviors'].length === 0 ||
    value['retention_behaviors'].some((b: unknown) => !isRetentionBehavior(b))
  ) {
    errors.push('retention_behaviors must be a non-empty array of known behaviors');
  }
  if (!(TRAINING_USE_POLICIES as readonly string[]).includes(value['training_use'] as string)) {
    errors.push('training_use must be a known training-use policy');
  }
  if (
    !(ZDR_VERIFICATION_SOURCE_TYPES as readonly string[]).includes(
      value['verification_source_type'] as string
    )
  ) {
    errors.push('verification_source_type must be a known source type');
  }
  if (!(ZDR_SUPPORT_STATUSES as readonly string[]).includes(value['status'] as string)) {
    errors.push('status must be a known ZDR verification status');
  }
  for (const field of ['verified_at', 'expires_at'] as const) {
    if (typeof value[field] !== 'string' || Number.isNaN(Date.parse(value[field] as string))) {
      errors.push(`${field} must be a valid ISO 8601 timestamp`);
    }
  }
  if (typeof value['evidence_hash'] !== 'string' || !/^[a-f0-9]{16,128}$/.test(value['evidence_hash'] as string)) {
    errors.push('evidence_hash must be a lowercase hex digest');
  }
  if (
    value['human_review_status'] !== 'reviewed_approved' &&
    value['human_review_status'] !== 'pending' &&
    value['human_review_status'] !== 'rejected'
  ) {
    errors.push('human_review_status must be reviewed_approved, pending, or rejected');
  }
  return errors;
}

export function validateZdrEvidenceCatalogData(raw: unknown): readonly string[] {
  if (!isPlainRecord(raw)) return ['ZDR evidence catalog must be an object'];
  const errors: string[] = [];
  if (typeof raw['schema_version'] !== 'string') errors.push('catalog.schema_version is required');
  if (!Array.isArray(raw['evidence'])) {
    errors.push('catalog.evidence must be an array');
    return errors;
  }
  const seen = new Set<string>();
  raw['evidence'].forEach((record: unknown, index: number) => {
    const recordErrors = validateZdrEvidenceRecord(record);
    errors.push(...recordErrors.map(e => `evidence[${index}]: ${e}`));
    if (recordErrors.length === 0) {
      const id = (record as ZdrVerificationEvidence).evidence_id;
      if (seen.has(id)) errors.push(`evidence[${index}]: duplicate evidence_id ${id}`);
      seen.add(id);
    }
  });
  return errors;
}

/**
 * Deterministic, repository-owned evidence store. Construction fails
 * closed on any structural error or duplicate ID.
 */
export class ZdrEvidenceStore {
  private readonly byId = new Map<string, ZdrVerificationEvidence>();

  constructor(raw: unknown) {
    const errors = validateZdrEvidenceCatalogData(raw);
    if (errors.length > 0) throw privacyError('PRIVACY_CONFIGURATION_INVALID');
    for (const record of (raw as ZdrEvidenceCatalogData).evidence) {
      this.byId.set(record.evidence_id, record);
    }
  }

  get(evidenceId: string): ZdrVerificationEvidence | undefined {
    return this.byId.get(evidenceId);
  }

  list(): readonly ZdrVerificationEvidence[] {
    return [...this.byId.values()];
  }
}

export interface ZdrEvidenceEvaluationInput {
  readonly evidence: ZdrVerificationEvidence | undefined;
  readonly profile_id: string;
  readonly capability_id: string;
  readonly classification: DataClassificationId;
  readonly retention_behavior: RetentionBehavior;
  readonly processing_region: string;
  readonly training_use: TrainingUsePolicy;
  readonly now: Date;
}

export type ZdrEvidenceEvaluation =
  | { readonly ok: true; readonly evidence: ZdrVerificationEvidence }
  | {
      readonly ok: false;
      readonly reason: Extract<
        PrivacyReasonCode,
        'ZDR_EVIDENCE_MISSING' | 'ZDR_EVIDENCE_EXPIRED' | 'ZDR_EVIDENCE_SCOPE_MISMATCH' | 'ZDR_UNVERIFIED'
      >;
    };

/**
 * Deterministic evidence evaluation. Every check is explicit; every
 * failure names the narrowest applicable reason code.
 */
export function evaluateZdrEvidence(input: ZdrEvidenceEvaluationInput): ZdrEvidenceEvaluation {
  const { evidence } = input;
  if (evidence === undefined) return { ok: false, reason: 'ZDR_EVIDENCE_MISSING' };
  if (validateZdrEvidenceRecord(evidence).length > 0) {
    return { ok: false, reason: 'ZDR_UNVERIFIED' };
  }
  if (evidence.status !== 'verified') return { ok: false, reason: 'ZDR_UNVERIFIED' };
  if (evidence.human_review_status !== 'reviewed_approved') {
    return { ok: false, reason: 'ZDR_UNVERIFIED' };
  }
  if (Date.parse(evidence.expires_at) <= input.now.getTime()) {
    return { ok: false, reason: 'ZDR_EVIDENCE_EXPIRED' };
  }
  if (!evidence.profile_ids.includes(input.profile_id)) {
    return { ok: false, reason: 'ZDR_EVIDENCE_SCOPE_MISMATCH' };
  }
  if (!evidence.capability_ids.includes(input.capability_id)) {
    return { ok: false, reason: 'ZDR_EVIDENCE_SCOPE_MISMATCH' };
  }
  if (!evidence.classifications.includes(input.classification)) {
    return { ok: false, reason: 'ZDR_EVIDENCE_SCOPE_MISMATCH' };
  }
  if (!evidence.retention_behaviors.includes(input.retention_behavior)) {
    return { ok: false, reason: 'ZDR_EVIDENCE_SCOPE_MISMATCH' };
  }
  if (!evidence.regions.includes(input.processing_region)) {
    return { ok: false, reason: 'ZDR_EVIDENCE_SCOPE_MISMATCH' };
  }
  if (evidence.training_use !== input.training_use) {
    return { ok: false, reason: 'ZDR_EVIDENCE_SCOPE_MISMATCH' };
  }
  return { ok: true, evidence };
}

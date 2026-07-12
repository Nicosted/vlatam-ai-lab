/**
 * AI-73 privacy enforcement — metadata-only privacy audit record.
 *
 * The audit record is a closed shape: only the allowlisted keys below
 * may appear, and no field ever carries request input, original or
 * redacted values, prompts, document text, evidence excerpts, PII,
 * credentials, raw provider responses, or reviewer identity.
 * `assertPrivacyAuditMetadataOnly` is the structural scan that tests
 * and the enforcer use to prove it.
 */

import type { DataClassificationId, RetentionBehavior } from './data-classification.js';
import type { PrivacyReasonCode } from './errors.js';
import type { RedactionAuditEntry, RedactionCounts } from './redaction.js';
import type { ZdrRequirement, ZdrSupportStatus } from './privacy-policy.js';

export const PRIVACY_AUDIT_SCHEMA_VERSION = '1.0.0';

export const PRIVACY_ACTIONS = [
  'redaction_applied',
  'zdr_verified',
  'retention_validated',
  'local_execution_enforced',
  'human_review_required',
  'blocked',
] as const;
export type PrivacyAction = (typeof PRIVACY_ACTIONS)[number];

export type PrivacyDecisionStatus = 'allowed' | 'blocked';

export interface PrivacyAuditRecord {
  readonly privacy_decision_id: string;
  readonly schema_version: string;
  readonly request_id: string;
  readonly execution_id?: string | undefined;
  readonly capability_id: string;
  readonly profile_id?: string | undefined;
  readonly data_classification?: DataClassificationId | undefined;
  readonly privacy_policy_id?: string | undefined;
  readonly privacy_policy_version?: string | undefined;
  readonly decision: PrivacyDecisionStatus;
  readonly reason_code: PrivacyReasonCode;
  readonly required_actions: readonly PrivacyAction[];
  readonly redaction: readonly RedactionAuditEntry[];
  readonly redaction_counts: RedactionCounts;
  readonly zdr_requirement?: ZdrRequirement | undefined;
  readonly zdr_support?: ZdrSupportStatus | undefined;
  readonly zdr_evidence_id?: string | undefined;
  readonly zdr_evidence_hash?: string | undefined;
  readonly retention_requirement?: readonly RetentionBehavior[] | undefined;
  readonly retention_declaration?: RetentionBehavior | undefined;
  readonly execution_mode?: 'replay' | 'live' | undefined;
  readonly decided_at: string;
}

const ALLOWED_KEYS = new Set<string>([
  'privacy_decision_id',
  'schema_version',
  'request_id',
  'execution_id',
  'capability_id',
  'profile_id',
  'data_classification',
  'privacy_policy_id',
  'privacy_policy_version',
  'decision',
  'reason_code',
  'required_actions',
  'redaction',
  'redaction_counts',
  'zdr_requirement',
  'zdr_support',
  'zdr_evidence_id',
  'zdr_evidence_hash',
  'retention_requirement',
  'retention_declaration',
  'execution_mode',
  'decided_at',
]);

const ALLOWED_REDACTION_ENTRY_KEYS = new Set(['path', 'action', 'outcome', 'count']);
const ALLOWED_COUNT_KEYS = new Set(['removed', 'replaced', 'hashed', 'tokenized', 'preserved']);

/**
 * Structural scan proving the record is metadata-only. Returns a
 * deterministic list of violations; empty means safe. The scan is
 * shape-based (closed key sets, no nested free-form objects) so that
 * payload content cannot ride along in unexpected fields.
 */
export function assertPrivacyAuditMetadataOnly(record: unknown): readonly string[] {
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    return ['privacy audit record must be an object'];
  }
  const violations: string[] = [];
  const value = record as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    if (!ALLOWED_KEYS.has(key)) violations.push(`unexpected key: ${key}`);
  }
  for (const key of ['redaction'] as const) {
    const list = value[key];
    if (list === undefined) continue;
    if (!Array.isArray(list)) {
      violations.push(`${key} must be an array`);
      continue;
    }
    list.forEach((entry: unknown, index: number) => {
      if (typeof entry !== 'object' || entry === null) {
        violations.push(`${key}[${index}] must be an object`);
        return;
      }
      for (const entryKey of Object.keys(entry)) {
        if (!ALLOWED_REDACTION_ENTRY_KEYS.has(entryKey)) {
          violations.push(`${key}[${index}] has unexpected key: ${entryKey}`);
        }
      }
    });
  }
  const counts = value['redaction_counts'];
  if (counts !== undefined) {
    if (typeof counts !== 'object' || counts === null) {
      violations.push('redaction_counts must be an object');
    } else {
      for (const countKey of Object.keys(counts)) {
        if (!ALLOWED_COUNT_KEYS.has(countKey)) {
          violations.push(`redaction_counts has unexpected key: ${countKey}`);
        }
        const countValue = (counts as Record<string, unknown>)[countKey];
        if (typeof countValue !== 'number') {
          violations.push(`redaction_counts.${countKey} must be a number`);
        }
      }
    }
  }
  // Every scalar field must be a primitive; nested free-form objects
  // are how payloads leak.
  for (const [key, fieldValue] of Object.entries(value)) {
    if (key === 'redaction' || key === 'redaction_counts' || key === 'required_actions' || key === 'retention_requirement') {
      continue;
    }
    if (fieldValue !== undefined && typeof fieldValue === 'object') {
      violations.push(`field ${key} must be a primitive`);
    }
  }
  return violations;
}

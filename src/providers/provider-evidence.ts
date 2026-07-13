export type EvidenceClaimStatus = 'supported' | 'unsupported' | 'unknown';
export interface EvidenceClaim { readonly status: EvidenceClaimStatus; readonly value?: unknown; readonly source_ref?: string }
export interface ProviderEvidenceRecord {
  readonly evidence_id: string;
  readonly provider_identity: EvidenceClaim;
  readonly model_identity: EvidenceClaim;
  readonly claims: Readonly<Record<string, EvidenceClaim>>;
  readonly review: { readonly status: 'reviewed_approved' | 'pending' | 'rejected' };
  readonly expires_at: string;
}
export interface CandidateProfileReadiness {
  readonly profile_id: string;
  readonly provider_id: 'openrouter' | 'minimax-direct';
  readonly model_id: string | null;
  readonly lifecycle_status: 'candidate';
  readonly enabled: false;
  readonly evidence_refs: readonly string[];
  readonly runtime_eligibility: 'blocked' | 'reviewed_candidate';
  readonly blocking_reasons: readonly string[];
}

const CREDENTIAL_FIELD = /api[_-]?key|password|bearer|authorization|client[_-]?secret|private[_-]?key|access[_-]?key/i;

function credentialShapedPath(value: unknown, path = ''): string | undefined {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = credentialShapedPath(value[index], `${path}[${index}]`);
      if (found) return found;
    }
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (CREDENTIAL_FIELD.test(key)) return path ? `${path}.${key}` : key;
      const found = credentialShapedPath(child, path ? `${path}.${key}` : key);
      if (found) return found;
    }
  }
  return undefined;
}

export function evaluateCandidateProfileReadiness(
  profile: CandidateProfileReadiness,
  catalog: readonly ProviderEvidenceRecord[],
  now: Date,
): readonly string[] {
  const reasons = new Set<string>();
  if (credentialShapedPath(profile) || credentialShapedPath(catalog)) reasons.add('credential_shaped_field');
  const records = profile.evidence_refs.map(id => catalog.find(record => record.evidence_id === id));
  if (records.some(record => record === undefined)) reasons.add('missing_evidence');
  for (const record of records) {
    if (!record) continue;
    if (!Number.isFinite(Date.parse(record.expires_at))) reasons.add('missing_expiry');
    else if (Date.parse(record.expires_at) <= now.getTime()) reasons.add('expired_evidence');
    if (record.review.status !== 'reviewed_approved') reasons.add('unreviewed_evidence');
    if (record.provider_identity.status !== 'supported' || record.provider_identity.value !== profile.provider_id) {
      reasons.add('profile_evidence_mismatch');
    }
    if (record.model_identity.status !== 'supported' || typeof record.model_identity.value !== 'string') {
      reasons.add('ambiguous_model_identity');
    } else if (record.model_identity.value !== profile.model_id) reasons.add('profile_evidence_mismatch');
    if (record.claims['supported_capabilities']?.status !== 'supported') reasons.add('unsupported_capability');
    if (record.claims['zdr_status']?.status === 'supported' && record.review.status !== 'reviewed_approved') {
      reasons.add('false_zdr_declaration');
    }
  }
  return [...reasons].sort();
}

export function assertCandidateProfileReady(
  profile: CandidateProfileReadiness,
  catalog: readonly ProviderEvidenceRecord[],
  now: Date,
): void {
  const reasons = evaluateCandidateProfileReadiness(profile, catalog, now);
  if (reasons.length > 0 || profile.lifecycle_status !== 'candidate' || profile.enabled || profile.runtime_eligibility !== 'reviewed_candidate') {
    throw new Error(`PROVIDER_PROFILE_NOT_READY:${reasons.join(',') || 'profile_state'}`);
  }
}

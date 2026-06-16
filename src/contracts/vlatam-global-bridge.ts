export const ALLOWED_CLAIM_TYPES = [
  'tariff',
  'intervention',
  'norm',
  'legal',
  'classification',
] as const;

export type ClaimType = (typeof ALLOWED_CLAIM_TYPES)[number];

export interface EvidenceClaim {
  readonly claim_id: string;
  readonly claim_type: ClaimType;
  readonly text: string;
  readonly source_ref?: string;
  readonly confidence?: number;
  readonly affected_ncm?: string[];
  readonly requires_review: true;
}

export interface ClassificationCandidate {
  readonly ncm_code?: string;
  readonly description?: string;
  readonly confidence?: number;
  readonly status: 'candidate';
}

export interface ClassifierIntelligenceArtifact {
  readonly artifact_id: string;
  readonly extraction_result_id: string;
  readonly source_id: string;
  readonly generated_at: string;
  readonly classification_candidate?: ClassificationCandidate;
  readonly extracted_evidence: EvidenceClaim[];
  readonly governance: GovernanceFlags;
  readonly schema_version: string;
}

export type ContractValidationResult<T> =
  | { readonly ok: true; readonly artifact: T }
  | { readonly ok: false; readonly errors: string[] };

export const GOVERNANCE_FLAGS = {
  human_review_required: true,
  downstream_allowed: false,
  review_only: true,
  not_final_classification: true,
} as const;

export type GovernanceFlags = typeof GOVERNANCE_FLAGS;

export function isValidClaimType(type: string): type is ClaimType {
  return (ALLOWED_CLAIM_TYPES as readonly string[]).includes(type);
}

export function getGovernanceFlags(): GovernanceFlags {
  return { ...GOVERNANCE_FLAGS };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOptionalNumberInRange(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && value >= 0 && value <= 1);
}

function validateClassificationCandidate(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return ['classification_candidate must be an object'];
  }

  if (value.status !== 'candidate') errors.push('classification_candidate.status must be candidate');
  if (value.ncm_code !== undefined && typeof value.ncm_code !== 'string') {
    errors.push('classification_candidate.ncm_code must be string');
  }
  if (value.description !== undefined && typeof value.description !== 'string') {
    errors.push('classification_candidate.description must be string');
  }
  if (!hasOptionalNumberInRange(value.confidence)) {
    errors.push('classification_candidate.confidence must be between 0 and 1');
  }

  return errors;
}

function validateEvidenceClaim(value: unknown, index: number): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return [`extracted_evidence[${index}] must be an object`];
  }

  if (typeof value.claim_id !== 'string' || value.claim_id.length === 0) {
    errors.push(`extracted_evidence[${index}].claim_id must be string`);
  }
  if (typeof value.claim_type !== 'string' || !isValidClaimType(value.claim_type)) {
    errors.push(`extracted_evidence[${index}].claim_type must be allowlisted`);
  }
  if (typeof value.text !== 'string' || value.text.length === 0) {
    errors.push(`extracted_evidence[${index}].text must be string`);
  }
  if (value.source_ref !== undefined && typeof value.source_ref !== 'string') {
    errors.push(`extracted_evidence[${index}].source_ref must be string`);
  }
  if (!hasOptionalNumberInRange(value.confidence)) {
    errors.push(`extracted_evidence[${index}].confidence must be between 0 and 1`);
  }
  if (
    value.affected_ncm !== undefined &&
    (!Array.isArray(value.affected_ncm) || value.affected_ncm.some(item => typeof item !== 'string'))
  ) {
    errors.push(`extracted_evidence[${index}].affected_ncm must be string array`);
  }
  if (value.requires_review !== true) {
    errors.push(`extracted_evidence[${index}].requires_review must be true`);
  }

  return errors;
}

export function validateClassifierIntelligenceArtifact(
  artifact: unknown
): ContractValidationResult<ClassifierIntelligenceArtifact> {
  const errors: string[] = [];

  if (!isRecord(artifact)) {
    return { ok: false, errors: ['Artifact must be an object'] };
  }

  if (typeof artifact.artifact_id !== 'string' || artifact.artifact_id.length === 0) {
    errors.push('Missing artifact_id');
  }
  if (typeof artifact.extraction_result_id !== 'string' || artifact.extraction_result_id.length === 0) {
    errors.push('Missing extraction_result_id');
  }
  if (typeof artifact.source_id !== 'string' || artifact.source_id.length === 0) {
    errors.push('Missing source_id');
  }
  if (typeof artifact.generated_at !== 'string' || artifact.generated_at.length === 0) {
    errors.push('Missing generated_at');
  }
  if (typeof artifact.schema_version !== 'string' || artifact.schema_version.length === 0) {
    errors.push('Missing schema_version');
  }

  if (!isRecord(artifact.governance)) {
    errors.push('Missing governance');
  } else {
    if (artifact.governance.human_review_required !== true) errors.push('human_review_required must be true');
    if (artifact.governance.downstream_allowed !== false) errors.push('downstream_allowed must be false');
    if (artifact.governance.review_only !== true) errors.push('review_only must be true');
    if (artifact.governance.not_final_classification !== true) errors.push('not_final_classification must be true');
  }

  if (!Array.isArray(artifact.extracted_evidence)) {
    errors.push('extracted_evidence must be array');
  } else {
    artifact.extracted_evidence.forEach((claim, index) => {
      errors.push(...validateEvidenceClaim(claim, index));
    });
  }

  if (artifact.classification_candidate !== undefined) {
    errors.push(...validateClassificationCandidate(artifact.classification_candidate));
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, artifact: artifact as unknown as ClassifierIntelligenceArtifact };
}

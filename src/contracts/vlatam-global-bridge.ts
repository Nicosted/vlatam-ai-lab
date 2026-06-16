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

export const GOVERNANCE_FLAGS = {
  human_review_required: true,
  downstream_allowed: false,
  review_only: true,
  not_final_classification: true,
} as const;

export type GovernanceFlags = typeof GOVERNANCE_FLAGS;

export type ReviewStatus = 'draft' | 'reviewed_approved' | 'reviewed_rejected';

export interface GovernanceState {
  readonly human_review_required: boolean;
  readonly downstream_allowed: boolean;
  readonly review_only: boolean;
  readonly not_final_classification: boolean;
}

export interface ClassifierIntelligenceArtifact {
  readonly artifact_id: string;
  readonly extraction_result_id?: string;
  readonly source_id?: string;
  readonly generated_at?: string;
  readonly classification_candidate?: ClassificationCandidate;
  readonly extracted_evidence?: EvidenceClaim[];
  readonly governance: GovernanceState;
  readonly schema_version?: string;
  readonly source_authority?: string;
  readonly origin?: string;
  readonly review_status?: ReviewStatus;
  readonly reviewer?: string;
  readonly reviewed_at?: string;
  readonly classifier_approval_reference?: string;
  readonly downstream_eligibility_reason?: string;
  readonly [key: string]: unknown;
}

export interface ContractValidationResult<T> {
  readonly ok: boolean;
  readonly artifact?: T;
  readonly errors: readonly string[];
}

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

  if (value['status'] !== 'candidate') errors.push('classification_candidate.status must be candidate');
  if (value['ncm_code'] !== undefined && typeof value['ncm_code'] !== 'string') {
    errors.push('classification_candidate.ncm_code must be string');
  }
  if (value['description'] !== undefined && typeof value['description'] !== 'string') {
    errors.push('classification_candidate.description must be string');
  }
  if (!hasOptionalNumberInRange(value['confidence'])) {
    errors.push('classification_candidate.confidence must be between 0 and 1');
  }

  return errors;
}

function validateEvidenceClaim(value: unknown, index: number): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return [`extracted_evidence[${index}] must be an object`];
  }

  if (typeof value['claim_id'] !== 'string' || value['claim_id'].length === 0) {
    errors.push(`extracted_evidence[${index}].claim_id must be string`);
  }
  if (typeof value['claim_type'] !== 'string' || !isValidClaimType(value['claim_type'])) {
    errors.push(`extracted_evidence[${index}].claim_type must be allowlisted`);
  }
  if (typeof value['text'] !== 'string' || value['text'].length === 0) {
    errors.push(`extracted_evidence[${index}].text must be string`);
  }
  if (value['source_ref'] !== undefined && typeof value['source_ref'] !== 'string') {
    errors.push(`extracted_evidence[${index}].source_ref must be string`);
  }
  if (!hasOptionalNumberInRange(value['confidence'])) {
    errors.push(`extracted_evidence[${index}].confidence must be between 0 and 1`);
  }
  if (
    value['affected_ncm'] !== undefined &&
    (!Array.isArray(value['affected_ncm']) || value['affected_ncm'].some((item: unknown) => typeof item !== 'string'))
  ) {
    errors.push(`extracted_evidence[${index}].affected_ncm must be string array`);
  }
  if (value['requires_review'] !== true) {
    errors.push(`extracted_evidence[${index}].requires_review must be true`);
  }

  return errors;
}

function isReviewStatus(value: unknown): value is ReviewStatus {
  return value === 'draft' || value === 'reviewed_approved' || value === 'reviewed_rejected';
}

function validateOptionalString(
  artifact: Record<string, unknown>,
  key: string,
  errors: string[]
): void {
  if (key in artifact && typeof artifact[key] !== 'string') {
    errors.push(`${key} must be a string when present`);
  }
}

export function validateClassifierIntelligenceArtifact(
  artifact: unknown
): ContractValidationResult<ClassifierIntelligenceArtifact> {
  const errors: string[] = [];

  if (!isRecord(artifact)) {
    return { ok: false, errors: ['artifact must be an object'] };
  }

  if (typeof artifact['artifact_id'] !== 'string' || artifact['artifact_id'].length === 0) {
    errors.push('artifact_id is required');
  }

  if (!isRecord(artifact['governance'])) {
    errors.push('governance is required');
  } else {
    const governance = artifact['governance'];
    for (const field of [
      'human_review_required',
      'downstream_allowed',
      'review_only',
      'not_final_classification',
    ] as const) {
      if (typeof governance[field] !== 'boolean') {
        errors.push(`governance.${field} must be boolean`);
      }
    }

    if (governance['downstream_allowed'] === true) {
      if (artifact['review_status'] !== 'reviewed_approved') {
        errors.push('downstream_allowed=true requires review_status=reviewed_approved');
      }
      if (governance['human_review_required'] !== false) {
        errors.push('downstream_allowed=true requires human_review_required=false');
      }
      if (governance['review_only'] !== false) {
        errors.push('downstream_allowed=true requires review_only=false');
      }
      if (governance['not_final_classification'] !== false) {
        errors.push('downstream_allowed=true requires not_final_classification=false');
      }
      if (typeof artifact['reviewer'] !== 'string' || artifact['reviewer'].length === 0) {
        errors.push('downstream_allowed=true requires reviewer');
      }
      if (
        typeof artifact['classifier_approval_reference'] !== 'string' ||
        artifact['classifier_approval_reference'].length === 0
      ) {
        errors.push('downstream_allowed=true requires classifier_approval_reference');
      }
    }

    const sourceAuthority = artifact['source_authority'];
    const origin = artifact['origin'];
    if (sourceAuthority === 'synthetic_demo' || origin === 'synthetic_demo') {
      if (governance['downstream_allowed'] === true) {
        errors.push('synthetic_demo cannot be downstream_allowed');
      }
    }
  }

  if (artifact['extracted_evidence'] !== undefined) {
    if (!Array.isArray(artifact['extracted_evidence'])) {
      errors.push('extracted_evidence must be array');
    } else {
      artifact['extracted_evidence'].forEach((claim: unknown, index: number) => {
        errors.push(...validateEvidenceClaim(claim, index));
      });
    }
  }

  if (artifact['classification_candidate'] !== undefined) {
    errors.push(...validateClassificationCandidate(artifact['classification_candidate']));
  }

  if ('review_status' in artifact && !isReviewStatus(artifact['review_status'])) {
    errors.push('review_status must be draft, reviewed_approved, or reviewed_rejected');
  }

  validateOptionalString(artifact, 'source_id', errors);
  validateOptionalString(artifact, 'source_authority', errors);
  validateOptionalString(artifact, 'origin', errors);
  validateOptionalString(artifact, 'reviewer', errors);
  validateOptionalString(artifact, 'reviewed_at', errors);
  validateOptionalString(artifact, 'classifier_approval_reference', errors);
  validateOptionalString(artifact, 'downstream_eligibility_reason', errors);

  if (
    'reviewed_at' in artifact &&
    typeof artifact['reviewed_at'] === 'string' &&
    Number.isNaN(Date.parse(artifact['reviewed_at']))
  ) {
    errors.push('reviewed_at must be a valid ISO 8601 timestamp');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, artifact: artifact as unknown as ClassifierIntelligenceArtifact, errors: [] };
}

export const ALLOWED_CLAIM_TYPES = [
  'tariff',
  'intervention',
  'norm',
  'legal',
  'classification',
] as const;

export type ClaimType = (typeof ALLOWED_CLAIM_TYPES)[number];

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

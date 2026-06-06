// Shared types for the AI Lab intelligence source foundation.
// These mirror the JSON Schemas under schemas/intelligence-*.schema.json and
// schemas/ai-extraction-job.schema.json. They are intentionally conservative:
// nothing is fresh or downstream-safe unless explicitly proven so.

export type FreshnessStatus =
  | "current"
  | "stale"
  | "unknown"
  | "requires_review";

export type ReviewStatus =
  | "not_reviewed"
  | "in_review"
  | "approved"
  | "rejected"
  | "unknown";

export type AuthorityLevel =
  | "official"
  | "semi_official"
  | "secondary"
  | "community"
  | "unknown";

export type ReliabilityLevel = "high" | "medium" | "low" | "unknown";

export type VerificationStatus =
  | "unverified_sample"
  | "verified_official"
  | "deprecated";

export type CadenceLabel =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "annual"
  | "irregular"
  | "unknown";

export interface ExpectedUpdateCadence {
  label: CadenceLabel;
  interval_days?: number;
}

export interface SourceRegistryEntry {
  source_id: string;
  source_name: string;
  source_type: string;
  authority_level: AuthorityLevel;
  reliability_level: ReliabilityLevel;
  jurisdiction_scope: string;
  country_code?: string;
  regional_scope?: string;
  topic_scope: string[];
  language: string;
  source_locator: string;
  official_url?: string;
  verification_status: VerificationStatus;
  expected_update_cadence?: ExpectedUpdateCadence;
  last_checked_at?: string;
  freshness_status: FreshnessStatus;
  human_review_required: boolean;
  downstream_allowed: boolean;
  notes?: string[];
  limitations?: string[];
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  schema_version: string;
}

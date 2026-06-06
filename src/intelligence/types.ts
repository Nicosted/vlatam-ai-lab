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

export type SnapshotCaptureMethod =
  | "manual"
  | "local_fixture"
  | "approved_fetch"
  | "api_import"
  | "other";

export type SnapshotCaptureOrigin = "human" | "system" | "mixed" | "unknown";

export type ExtractionStatus =
  | "not_started"
  | "prepared"
  | "extracted"
  | "extraction_failed"
  | "unknown";

export interface SourceSnapshot {
  snapshot_id: string;
  source_id: string;
  captured_at: string;
  capture_method: SnapshotCaptureMethod;
  capture_origin?: SnapshotCaptureOrigin;
  capture_actor?: string;
  source_locator?: string;
  official_url?: string;
  content_reference?: string;
  content_hash?: string;
  source_version_label?: string;
  freshness_status: FreshnessStatus;
  review_status: ReviewStatus;
  extraction_status: ExtractionStatus;
  human_review_required: boolean;
  downstream_allowed: boolean;
  notes?: string[];
  warnings?: string[];
  limitations?: string[];
  errors?: string[];
  metadata?: Record<string, unknown>;
  created_at?: string;
  contract_version?: string;
  schema_version: string;
}

export type ReviewOrigin = "human" | "system" | "mixed" | "unknown";

export type ExtractionInputType =
  | "locator_reference"
  | "excerpt_reference"
  | "fingerprint_reference"
  | "manual_metadata"
  | "other";

export interface SnapshotReviewManifest {
  review_manifest_id: string;
  snapshot_id: string;
  source_id: string;
  review_origin?: ReviewOrigin;
  reviewer_role?: string;
  review_status: ReviewStatus;
  reviewed_at?: string;
  source_identity_verified: boolean;
  locator_verified: boolean;
  capture_reference_verified: boolean;
  content_fingerprint_verified: boolean;
  version_scope_verified: boolean;
  extraction_allowed: boolean;
  human_review_required: boolean;
  downstream_allowed: boolean;
  classifier_approval_reference?: string;
  warnings?: string[];
  limitations?: string[];
  notes?: string[];
  metadata?: Record<string, unknown>;
  created_at?: string;
  contract_version?: string;
  schema_version: string;
}

export interface ExtractableEvidencePacket {
  evidence_packet_id: string;
  review_manifest_id: string;
  snapshot_id: string;
  source_id: string;
  evidence_scope: string;
  jurisdiction_scope?: string;
  language?: string;
  content_reference?: string;
  excerpt_reference?: string;
  content_fingerprint?: string;
  extraction_input_type: ExtractionInputType;
  extraction_allowed: boolean;
  extraction_status: ExtractionStatus;
  human_review_required: boolean;
  downstream_allowed: boolean;
  classifier_approval_reference?: string;
  warnings?: string[];
  limitations?: string[];
  notes?: string[];
  metadata?: Record<string, unknown>;
  created_at?: string;
  contract_version?: string;
  schema_version: string;
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

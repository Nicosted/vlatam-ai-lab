import type { ExtractableEvidencePacket } from "./types.js";

export type AiExtractionClaimSupportStatus =
  | "supported_by_packet"
  | "unsupported"
  | "needs_human_review";

export interface AiExtractionDraftClaim {
  claim_id: string;
  claim_text: string;
  evidence_reference: string;
  support_status: AiExtractionClaimSupportStatus;
  confidence: number;
}

export interface AiUnsupportedClaim {
  claim_id?: string;
  claim_text: string;
  reason: string;
  evidence_reference?: string;
}

export interface AiExtractionDraft {
  extracted_claims: AiExtractionDraftClaim[];
  warnings?: string[];
  confidence?: number;
}

export interface AiExtractionCritique {
  critic_summary: string;
  unsupported_claims: AiUnsupportedClaim[];
  warnings?: string[];
}

export interface ExtractionDraftInput {
  evidence_packet: ExtractableEvidencePacket;
  extraction_job_id?: string;
}

export interface CritiqueInput extends ExtractionDraftInput {
  extraction_draft: AiExtractionDraft;
}

export interface AiExtractionProvider {
  provider_id: string;
  model_id: string;
  generateExtractionDraft(input: ExtractionDraftInput): Promise<unknown>;
  generateCritique(input: CritiqueInput): Promise<unknown>;
}

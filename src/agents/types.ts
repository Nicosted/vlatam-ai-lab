/**
 * Shared types for the specialized agents architecture
 */

export interface AgentContext {
  product_description: string;
  candidate_ncm8: string;
  origin_country: string;
  destination_country: string;
  query_id: string;
  timestamp: string;
}

export interface AgentResult {
  agent_name: string;
  status: 'success' | 'partial' | 'failed' | 'no_data';
  claims: Claim[];
  unsupported_claims: UnsupportedClaim[];
  warnings: string[];
  confidence: number;
  evidence_used: string[];
  raw_context?: string;
}

export interface Claim {
  claim_id: string;
  claim_type: 'tariff' | 'intervention' | 'legal' | 'classification';
  claim_text: string;
  evidence_reference: string;
  confidence: number;
  source: 'arca' | 'vuce' | 'infoleg';
}

export interface UnsupportedClaim {
  claim_text: string;
  reason: string;
  expected_source: 'arca' | 'vuce' | 'infoleg';
}

export interface Discrepancy {
  type: string;
  description: string;
  sources: string[];
  severity: 'low' | 'medium' | 'high';
}

export interface FinalResponse {
  extracted_claims: Claim[];
  unsupported_claims: UnsupportedClaim[];
  discrepancies: Discrepancy[];
  warnings: string[];
  confidence: number;
  human_review_required: true;
  downstream_allowed: false;
  query_metadata: {
    ncm: string;
    product_description: string;
    origin_country: string;
    destination_country: string;
    timestamp: string;
    model: string;
    agents_invoked: string[];
    architecture_version: string;
  };
}

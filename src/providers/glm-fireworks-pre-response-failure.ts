export const GLM_FIREWORKS_FAILURE_CONTRACT_VERSION = "1.0.0" as const;
export const GLM_FIREWORKS_ADAPTER_ID =
  "openrouter.transport.chat-completions" as const;
export const GLM_FIREWORKS_MODEL_ID = "z-ai/glm-5.2" as const;
export const GLM_FIREWORKS_ROUTE_ID =
  "openrouter.glm-5.2.fireworks-standard-candidate" as const;
export const GLM_FIREWORKS_PROFILE_ID =
  "openrouter.glm-5.2.commercial-document-extraction.candidate" as const;

export type GlmFireworksPreResponseFailureClassification =
  | "credential_unavailable"
  | "timeout"
  | "network_transport"
  | "http_response"
  | "unknown_pre_response_failure";

export interface GlmFireworksPreResponseFailureEvidence {
  readonly contract_version: typeof GLM_FIREWORKS_FAILURE_CONTRACT_VERSION;
  readonly classification: GlmFireworksPreResponseFailureClassification;
  readonly reason_code: string;
  readonly attempt: number;
  readonly adapter_id: typeof GLM_FIREWORKS_ADAPTER_ID;
  readonly model_id: typeof GLM_FIREWORKS_MODEL_ID;
  readonly route_id: typeof GLM_FIREWORKS_ROUTE_ID;
  readonly profile_id: typeof GLM_FIREWORKS_PROFILE_ID;
  readonly timestamp: string;
  readonly http_status_present: boolean;
  readonly http_status_code: number | null;
  readonly retryable: boolean;
  readonly terminal: boolean;
  readonly correlation_id: string;
  readonly execution_evidence_id: string;
}

export class GlmFireworksInvalidGovernanceMetadataError extends Error {
  constructor() {
    super("invalid_governance_metadata");
    this.name = "GlmFireworksInvalidGovernanceMetadataError";
  }
}

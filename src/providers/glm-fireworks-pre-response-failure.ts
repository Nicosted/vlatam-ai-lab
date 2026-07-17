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

export interface GlmFireworksPreResponseFailureInput {
  readonly attempt: number;
  readonly timestamp: string;
  readonly correlation_id: string;
  readonly execution_evidence_id: string;
  readonly credential_available?: boolean;
  readonly timed_out?: boolean;
  readonly response_present?: boolean;
  readonly response_status?: unknown;
  readonly usable_provider_payload?: boolean;
  readonly thrown?: unknown;
}

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

const NETWORK_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

const safeProperty = (value: unknown, property: string): unknown => {
  if (
    (typeof value !== "object" || value === null) &&
    typeof value !== "function"
  )
    return undefined;
  try {
    return Reflect.get(value, property);
  } catch {
    return undefined;
  }
};

const allowlistedNetworkCode = (value: unknown): string | null => {
  const direct = safeProperty(value, "code");
  if (typeof direct === "string" && NETWORK_ERROR_CODES.has(direct))
    return direct;
  const cause = safeProperty(value, "cause");
  const nested = safeProperty(cause, "code");
  return typeof nested === "string" && NETWORK_ERROR_CODES.has(nested)
    ? nested
    : null;
};

const safeHttpStatus = (value: unknown): number | null =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= 100 &&
  value <= 599
    ? value
    : null;

const httpRetryable = (status: number | null, usable: boolean | undefined) =>
  status === 408 ||
  status === 425 ||
  status === 429 ||
  (status !== null && status >= 500) ||
  (status === 200 && usable === false);

const freezeEvidence = (
  input: GlmFireworksPreResponseFailureInput,
  classification: GlmFireworksPreResponseFailureClassification,
  reasonCode: string,
  retryable: boolean,
  httpStatusPresent = false,
  httpStatusCode: number | null = null,
): GlmFireworksPreResponseFailureEvidence =>
  Object.freeze({
    contract_version: GLM_FIREWORKS_FAILURE_CONTRACT_VERSION,
    classification,
    reason_code: reasonCode,
    attempt: input.attempt,
    adapter_id: GLM_FIREWORKS_ADAPTER_ID,
    model_id: GLM_FIREWORKS_MODEL_ID,
    route_id: GLM_FIREWORKS_ROUTE_ID,
    profile_id: GLM_FIREWORKS_PROFILE_ID,
    timestamp: input.timestamp,
    http_status_present: httpStatusPresent,
    http_status_code: httpStatusCode,
    retryable,
    terminal: !retryable,
    correlation_id: input.correlation_id,
    execution_evidence_id: input.execution_evidence_id,
  });

/**
 * Produces allowlist-only governance metadata. It never reads exception messages,
 * request bodies, headers, response bodies, credential values, or stack traces.
 */
export function classifyGlmFireworksPreResponseFailure(
  input: GlmFireworksPreResponseFailureInput,
): GlmFireworksPreResponseFailureEvidence {
  if (input.timed_out === true)
    return freezeEvidence(input, "timeout", "pre_response_timeout", true);

  if (input.credential_available === false)
    return freezeEvidence(
      input,
      "credential_unavailable",
      "pre_response_credential_unavailable",
      false,
    );

  if (input.response_present === true) {
    const status = safeHttpStatus(input.response_status);
    const retryable = httpRetryable(status, input.usable_provider_payload);
    const reason =
      status === null
        ? "pre_response_http_status_unavailable"
        : status === 200 && input.usable_provider_payload === false
          ? "pre_response_http_200_unusable_payload"
          : `pre_response_http_${status}`;
    return freezeEvidence(
      input,
      "http_response",
      reason,
      retryable,
      true,
      status,
    );
  }

  if (allowlistedNetworkCode(input.thrown) !== null)
    return freezeEvidence(
      input,
      "network_transport",
      "pre_response_network_transport",
      true,
    );

  return freezeEvidence(
    input,
    "unknown_pre_response_failure",
    "pre_response_unknown_fail_closed",
    false,
  );
}

const credentialUnavailableErrors = new WeakSet<object>();

export class GlmFireworksCredentialUnavailableError extends Error {
  constructor() {
    super("credential_unavailable");
    this.name = "GlmFireworksCredentialUnavailableError";
    credentialUnavailableErrors.add(this);
  }
}

export const isGlmFireworksCredentialUnavailableError = (
  value: unknown,
): value is GlmFireworksCredentialUnavailableError =>
  typeof value === "object" &&
  value !== null &&
  credentialUnavailableErrors.has(value);

import { types as utilTypes } from "node:util";

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
const GOVERNANCE_ID = /^[a-z0-9][a-z0-9._-]{1,191}$/;
const INPUT_KEYS = new Set([
  "attempt",
  "timestamp",
  "correlation_id",
  "execution_evidence_id",
  "timed_out",
  "response_present",
  "response_status",
  "usable_provider_payload",
  "thrown",
]);

type ValidatedInput = Readonly<{
  attempt: number;
  timestamp: string;
  correlation_id: string;
  execution_evidence_id: string;
  timed_out?: boolean;
  response_present?: boolean;
  response_status?: unknown;
  usable_provider_payload?: boolean;
  thrown?: unknown;
}>;

export class GlmFireworksInvalidGovernanceMetadataError extends Error {
  constructor() {
    super("invalid_governance_metadata");
    this.name = "GlmFireworksInvalidGovernanceMetadataError";
  }
}

const ownDataValue = (
  descriptors: PropertyDescriptorMap,
  key: string,
): { readonly valid: boolean; readonly value?: unknown } => {
  const descriptor = descriptors[key];
  if (descriptor === undefined) return { valid: true };
  return "value" in descriptor
    ? { valid: true, value: descriptor.value }
    : { valid: false };
};

const validCanonicalTimestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

const validateInput = (input: unknown): ValidatedInput => {
  if (
    typeof input !== "object" ||
    input === null ||
    utilTypes.isProxy(input) ||
    (Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null)
  )
    throw new GlmFireworksInvalidGovernanceMetadataError();

  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (
    Object.keys(descriptors).some((key) => !INPUT_KEYS.has(key)) ||
    Object.values(descriptors).some((descriptor) => !("value" in descriptor))
  )
    throw new GlmFireworksInvalidGovernanceMetadataError();

  const attempt = ownDataValue(descriptors, "attempt").value;
  const timestamp = ownDataValue(descriptors, "timestamp").value;
  const correlationId = ownDataValue(descriptors, "correlation_id").value;
  const evidenceId = ownDataValue(descriptors, "execution_evidence_id").value;
  const timedOut = ownDataValue(descriptors, "timed_out").value;
  const responsePresent = ownDataValue(descriptors, "response_present").value;
  const responseStatus = ownDataValue(descriptors, "response_status").value;
  const usablePayload = ownDataValue(
    descriptors,
    "usable_provider_payload",
  ).value;
  const thrown = ownDataValue(descriptors, "thrown").value;

  if (
    typeof attempt !== "number" ||
    !Number.isSafeInteger(attempt) ||
    attempt < 1 ||
    attempt > 3 ||
    !validCanonicalTimestamp(timestamp) ||
    typeof correlationId !== "string" ||
    !GOVERNANCE_ID.test(correlationId) ||
    typeof evidenceId !== "string" ||
    !GOVERNANCE_ID.test(evidenceId) ||
    (timedOut !== undefined && typeof timedOut !== "boolean") ||
    (responsePresent !== undefined && typeof responsePresent !== "boolean") ||
    (usablePayload !== undefined && typeof usablePayload !== "boolean")
  )
    throw new GlmFireworksInvalidGovernanceMetadataError();

  return {
    attempt,
    timestamp,
    correlation_id: correlationId,
    execution_evidence_id: evidenceId,
    ...(timedOut === undefined ? {} : { timed_out: timedOut }),
    ...(responsePresent === undefined
      ? {}
      : { response_present: responsePresent }),
    ...(responseStatus === undefined
      ? {}
      : { response_status: responseStatus }),
    ...(usablePayload === undefined
      ? {}
      : { usable_provider_payload: usablePayload }),
    ...(thrown === undefined ? {} : { thrown }),
  };
};

const ownNativeErrorData = (value: unknown, key: "code" | "cause") => {
  if (
    typeof value !== "object" ||
    value === null ||
    utilTypes.isProxy(value) ||
    !utilTypes.isNativeError(value)
  )
    return { valid: false } as const;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) return { valid: true } as const;
  return "value" in descriptor
    ? ({ valid: true, value: descriptor.value } as const)
    : ({ valid: false } as const);
};

const allowlistedNativeNetworkCode = (value: unknown): string | null => {
  const direct = ownNativeErrorData(value, "code");
  if (!direct.valid) return null;
  if (typeof direct.value === "string" && NETWORK_ERROR_CODES.has(direct.value))
    return direct.value;

  const cause = ownNativeErrorData(value, "cause");
  if (!cause.valid || cause.value === value) return null;
  const nested = ownNativeErrorData(cause.value, "code");
  return nested.valid &&
    typeof nested.value === "string" &&
    NETWORK_ERROR_CODES.has(nested.value)
    ? nested.value
    : null;
};

const trustedNetworkTransportErrors = new WeakSet<object>();

class GlmFireworksNetworkTransportError extends Error {
  constructor() {
    super("network_transport");
    this.name = "GlmFireworksNetworkTransportError";
    trustedNetworkTransportErrors.add(this);
  }
}

/**
 * Sanitizes a native transport error at the adapter boundary. Proxies,
 * accessors, inherited properties, arbitrary objects, and causes deeper than
 * one level are rejected without invoking user-controlled property access.
 */
export const sanitizeGlmFireworksNativeTransportError = (
  value: unknown,
): Error | null =>
  allowlistedNativeNetworkCode(value) === null
    ? null
    : new GlmFireworksNetworkTransportError();

const isTrustedNetworkTransportError = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  trustedNetworkTransportErrors.has(value);

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
  input: ValidatedInput,
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
 * Produces allowlist-only governance metadata. It never reads exception
 * messages, request bodies, headers, response bodies, credential values, or
 * stack traces. Invalid governance metadata throws a fixed local error before
 * evidence is emitted.
 */
export function classifyGlmFireworksPreResponseFailure(
  unvalidatedInput: unknown,
): GlmFireworksPreResponseFailureEvidence {
  const input = validateInput(unvalidatedInput);
  if (input.timed_out === true)
    return freezeEvidence(input, "timeout", "pre_response_timeout", true);

  if (isGlmFireworksCredentialUnavailableError(input.thrown))
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

  if (isTrustedNetworkTransportError(input.thrown))
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

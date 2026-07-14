/**
 * Governed OpenRouter transport adapter (disabled by default).
 *
 * Transport-only: the adapter receives an already-approved exact
 * execution profile from the MultiProviderGateway and never derives,
 * ranks, discovers, falls back, retries, or substitutes a model,
 * provider, or route. Privacy, pricing, budget, authorization, audit,
 * and timeout ownership stay in the gateway; this module only turns an
 * approved request into at most one HTTP call and normalizes the
 * response deterministically.
 *
 * The API key is obtained from a narrow injected provider only after every
 * non-secret adapter check passes. It is never stored, logged, echoed, hashed,
 * snapshotted, or returned.
 */

import type {
  ExecutionProfile,
  ProviderId,
} from "../execution/execution-profile.js";
import {
  ExecutionError,
  executionError,
  type ExecutionErrorCode,
} from "../execution/errors.js";
import type {
  ProviderAdapter,
  ProviderExecutionContext,
  ProviderExecutionRequest,
  ProviderExecutionResult,
  ProviderUsage,
} from "./provider-adapter.js";
import {
  OPENROUTER_AUTO_MODEL_ID,
  OPENROUTER_BASE_URL,
  OPENROUTER_PROVIDER_ID,
  findCredentialShapedField,
  validateOpenRouterAdapterConfig,
  validateOpenRouterRoutePolicy,
  type OpenRouterAdapterConfig,
  type OpenRouterRoutePolicy,
} from "./openrouter-config.js";
import {
  resolveOpenRouterSecret,
  type OpenRouterSecretProvider,
} from "./openrouter-secret-provider.js";

export const OPENROUTER_ADAPTER_ERROR_CODES = [
  "ADAPTER_DISABLED",
  "SECRET_MISSING",
  "ADAPTER_CONFIG_INVALID",
  "MODEL_MISMATCH",
  "AUTO_ROUTING_FORBIDDEN",
  "ROUTE_POLICY_INVALID",
  "PROVIDER_SUBSTITUTION_DETECTED",
  "MODEL_SUBSTITUTION_DETECTED",
  "ROUTE_VERIFICATION_UNAVAILABLE",
  "UPSTREAM_PROVIDER_UNVERIFIED",
  "STRUCTURED_OUTPUT_UNSUPPORTED",
  "REQUEST_OVERRIDE_FORBIDDEN",
  "REQUEST_CREDENTIAL_SHAPED",
  "REQUEST_TOO_LARGE",
  "RESPONSE_TOO_LARGE",
  "PRICING_CONTRACT_INCOMPATIBLE",
  "TIMEOUT_SIGNAL_INVALID",
  "TRANSPORT_FAILURE",
  "TRANSPORT_TIMEOUT",
  "TRANSPORT_ABORTED",
  "RESPONSE_MALFORMED",
  "RESPONSE_SCHEMA_INVALID",
  "USAGE_UNAVAILABLE",
  "USAGE_MALFORMED",
  "AUTHENTICATION_FAILURE",
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "STRUCTURED_OUTPUT_VALIDATION_FAILED",
  "BUDGET_METADATA_INCOMPATIBLE",
] as const;
export type OpenRouterAdapterErrorCode =
  (typeof OPENROUTER_ADAPTER_ERROR_CODES)[number];

/** Deterministic mapping into the existing gateway error contract. No
 * new gateway codes; no raw provider text ever reaches a message. */
const GATEWAY_CODE: Record<OpenRouterAdapterErrorCode, ExecutionErrorCode> = {
  ADAPTER_DISABLED: "LIVE_EXECUTION_DISABLED",
  SECRET_MISSING: "CREDENTIALS_UNAVAILABLE",
  ADAPTER_CONFIG_INVALID: "LIVE_EXECUTION_DISABLED",
  MODEL_MISMATCH: "PROFILE_CAPABILITY_MISMATCH",
  AUTO_ROUTING_FORBIDDEN: "LIVE_EXECUTION_DISABLED",
  ROUTE_POLICY_INVALID: "LIVE_EXECUTION_DISABLED",
  PROVIDER_SUBSTITUTION_DETECTED: "PROVIDER_RESPONSE_INVALID",
  MODEL_SUBSTITUTION_DETECTED: "PROVIDER_RESPONSE_INVALID",
  ROUTE_VERIFICATION_UNAVAILABLE: "PROVIDER_RESPONSE_INVALID",
  UPSTREAM_PROVIDER_UNVERIFIED: "PROVIDER_RESPONSE_INVALID",
  STRUCTURED_OUTPUT_UNSUPPORTED: "PROFILE_CAPABILITY_MISMATCH",
  REQUEST_OVERRIDE_FORBIDDEN: "REQUEST_SCHEMA_INVALID",
  REQUEST_CREDENTIAL_SHAPED: "REQUEST_SCHEMA_INVALID",
  REQUEST_TOO_LARGE: "REQUEST_SCHEMA_INVALID",
  RESPONSE_TOO_LARGE: "PROVIDER_RESPONSE_INVALID",
  PRICING_CONTRACT_INCOMPATIBLE: "PRICING_UNVERIFIED",
  TIMEOUT_SIGNAL_INVALID: "INTERNAL_EXECUTION_ERROR",
  TRANSPORT_FAILURE: "PROVIDER_UNAVAILABLE",
  TRANSPORT_TIMEOUT: "PROVIDER_TIMEOUT",
  TRANSPORT_ABORTED: "EXECUTION_ABORTED",
  RESPONSE_MALFORMED: "PROVIDER_RESPONSE_INVALID",
  RESPONSE_SCHEMA_INVALID: "PROVIDER_RESPONSE_INVALID",
  USAGE_UNAVAILABLE: "USAGE_UNAVAILABLE",
  USAGE_MALFORMED: "USAGE_INVALID",
  AUTHENTICATION_FAILURE: "CREDENTIALS_UNAVAILABLE",
  RATE_LIMITED: "PROVIDER_RATE_LIMITED",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  STRUCTURED_OUTPUT_VALIDATION_FAILED: "PROVIDER_RESPONSE_INVALID",
  BUDGET_METADATA_INCOMPATIBLE: "PRICING_UNVERIFIED",
};

/** Adapter failures that block before or instead of provider work
 * (policy/contract), as opposed to transport-time failures. */
const BLOCKED_CODES: readonly OpenRouterAdapterErrorCode[] = [
  "ADAPTER_DISABLED",
  "SECRET_MISSING",
  "ADAPTER_CONFIG_INVALID",
  "MODEL_MISMATCH",
  "AUTO_ROUTING_FORBIDDEN",
  "ROUTE_POLICY_INVALID",
  "PROVIDER_SUBSTITUTION_DETECTED",
  "MODEL_SUBSTITUTION_DETECTED",
  "ROUTE_VERIFICATION_UNAVAILABLE",
  "UPSTREAM_PROVIDER_UNVERIFIED",
  "STRUCTURED_OUTPUT_UNSUPPORTED",
  "REQUEST_OVERRIDE_FORBIDDEN",
  "REQUEST_CREDENTIAL_SHAPED",
  "REQUEST_TOO_LARGE",
  "PRICING_CONTRACT_INCOMPATIBLE",
  "TIMEOUT_SIGNAL_INVALID",
];

export class OpenRouterAdapterError extends ExecutionError {
  constructor(readonly adapter_code: OpenRouterAdapterErrorCode) {
    const mapped = executionError(GATEWAY_CODE[adapter_code]);
    super(mapped.code, mapped.message);
    this.name = "OpenRouterAdapterError";
  }
}

/**
 * Injected transport boundary. Production code may construct
 * `createOpenRouterFetchTransport()`; every test in this PR injects a
 * deterministic mock, so the adapter is fully testable without network
 * access or credentials, and no live call ever occurs here.
 */
export interface OpenRouterTransportRequest {
  readonly url: string;
  readonly method: "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly signal: AbortSignal;
}
export interface OpenRouterTransportResponse {
  readonly status: number;
  readonly body: string;
}
export type OpenRouterTransport = (
  request: OpenRouterTransportRequest,
) => Promise<OpenRouterTransportResponse>;

/** Repository-approved HTTP mechanism for eventual production use.
 * Never invoked by this PR's tests; no retry, cancellation propagated. */
export function createOpenRouterFetchTransport(): OpenRouterTransport {
  return async (request) => {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: request.signal,
      redirect: "error",
    });
    return { status: response.status, body: await response.text() };
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function usageToken(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new OpenRouterAdapterError("USAGE_MALFORMED");
  return value;
}

function costMetadata(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const rendered = String(value);
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    !/^\d+(?:\.\d+)?$/.test(rendered) ||
    !Number.isFinite(Number(value)) ||
    Number(value) < 0
  )
    throw new OpenRouterAdapterError("BUDGET_METADATA_INCOMPATIBLE");
  return rendered;
}

/**
 * Versioned, deterministic OpenRouter usage normalization
 * (OPENROUTER_USAGE_NORMALIZATION_VERSION). Maps only explicitly
 * recognized fields; unknown fields are ignored, never guessed and
 * never converted to zero; missing usage remains unavailable; token
 * counts are never derived from text length. `cache_write` has no
 * recognized OpenRouter field and stays undefined (unsupported).
 */
export function mapOpenRouterUsage(raw: unknown): ProviderUsage | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!isRecord(raw)) throw new OpenRouterAdapterError("USAGE_MALFORMED");
  const promptDetails = isRecord(raw["prompt_tokens_details"])
    ? raw["prompt_tokens_details"]
    : undefined;
  const completionDetails = isRecord(raw["completion_tokens_details"])
    ? raw["completion_tokens_details"]
    : undefined;
  const usage: ProviderUsage = {
    input_tokens: usageToken(raw["prompt_tokens"]),
    output_tokens: usageToken(raw["completion_tokens"]),
    total_tokens: usageToken(raw["total_tokens"]),
    cached_input_tokens: usageToken(promptDetails?.["cached_tokens"]),
    reasoning_tokens: usageToken(completionDetails?.["reasoning_tokens"]),
    ...(costMetadata(raw["cost"]) === undefined
      ? {}
      : { reported_cost_usd: costMetadata(raw["cost"]) }),
    source: "provider_reported",
  };
  if (
    usage.input_tokens === undefined &&
    usage.output_tokens === undefined &&
    usage.total_tokens === undefined
  )
    return undefined;
  return usage;
}

/** Request-payload keys that would override routing, identity, or
 * transport policy from domain space. Their presence fails closed. */
const FORBIDDEN_OVERRIDE_KEYS = [
  "model",
  "models",
  "provider",
  "providers",
  "route",
  "routes",
  "transforms",
  "base_url",
  "baseURL",
  "endpoint",
  "headers",
] as const;
/** Any fallback-prefixed key is a routing override attempt. */
const FORBIDDEN_OVERRIDE_KEY_PATTERN = /^fallback/i;

function findForbiddenOverride(value: unknown, path = ""): string | undefined {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenOverride(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return undefined;
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (
        (FORBIDDEN_OVERRIDE_KEYS as readonly string[]).includes(key) ||
        FORBIDDEN_OVERRIDE_KEY_PATTERN.test(key)
      )
        return childPath;
      const found = findForbiddenOverride(child, childPath);
      if (found) return found;
    }
  }
  return undefined;
}

export interface OpenRouterAdapterOptions {
  readonly config: OpenRouterAdapterConfig;
  /** Exact approved route policies keyed by profile identity. This PR
   * supplies none anywhere: the reviewed route registry is a future PR. */
  readonly route_policies: readonly OpenRouterRoutePolicy[];
  readonly transport: OpenRouterTransport;
  readonly secret_provider: OpenRouterSecretProvider;
  readonly validate_structured_output?: (value: unknown) => boolean;
}

interface OpenRouterParsedResponse {
  readonly content: string;
  readonly finish_reason: "stop" | "length" | "unknown";
  readonly usage: ProviderUsage | undefined;
}

export class OpenRouterAdapter implements ProviderAdapter {
  readonly provider_id = OPENROUTER_PROVIDER_ID as ProviderId;
  constructor(private readonly options: OpenRouterAdapterOptions) {}

  supports(profile: ExecutionProfile): boolean {
    return profile.mode === "live" && profile.provider_id === this.provider_id;
  }

  async execute(
    request: ProviderExecutionRequest,
    profile: ExecutionProfile,
    context: ProviderExecutionContext,
  ): Promise<ProviderExecutionResult> {
    const started = Date.now();
    let transportInvoked = false;
    try {
      const policy = this.validateBeforeTransport(request, profile, context);
      const apiKey = await resolveOpenRouterSecret(
        this.options.secret_provider,
        this.options.config.api_key_env_var,
      );
      if (apiKey === undefined)
        throw new OpenRouterAdapterError("SECRET_MISSING");
      const body = this.buildRequestBody(request, profile, policy);
      if (context.signal.aborted)
        throw new OpenRouterAdapterError("TRANSPORT_ABORTED");
      // Exactly one transport invocation; no retry, no alternate route.
      transportInvoked = true;
      const response = await this.options.transport({
        url: `${OPENROUTER_BASE_URL}/chat/completions`,
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body,
        signal: context.signal,
      });
      const parsed = this.parseResponse(response, profile, policy);
      return {
        status: "succeeded",
        request_id: request.request_id,
        content: parsed.content,
        finish_reason: parsed.finish_reason,
        usage: parsed.usage,
        duration_ms: Date.now() - started,
      };
    } catch (caught) {
      const error = this.sanitize(caught, context, transportInvoked);
      const blocked =
        error instanceof OpenRouterAdapterError &&
        BLOCKED_CODES.includes(error.adapter_code);
      return {
        status: blocked ? "blocked" : "failed",
        request_id: request.request_id,
        duration_ms: transportInvoked ? Date.now() - started : 0,
        error,
      };
    }
  }

  /** Every check below fails closed before any transport invocation. */
  private validateBeforeTransport(
    request: ProviderExecutionRequest,
    profile: ExecutionProfile,
    context: ProviderExecutionContext,
  ): OpenRouterRoutePolicy {
    const { config } = this.options;
    if (validateOpenRouterAdapterConfig(config).length > 0)
      throw new OpenRouterAdapterError("ADAPTER_CONFIG_INVALID");
    if (config.enabled !== true)
      throw new OpenRouterAdapterError("ADAPTER_DISABLED");
    if (
      typeof profile.profile_id !== "string" ||
      profile.profile_id.length === 0 ||
      typeof profile.contract_version !== "string" ||
      profile.contract_version.length === 0
    )
      throw new OpenRouterAdapterError("ROUTE_POLICY_INVALID");
    if (typeof profile.model_id !== "string" || profile.model_id.length === 0)
      throw new OpenRouterAdapterError("MODEL_MISMATCH");
    if (
      profile.model_id === OPENROUTER_AUTO_MODEL_ID ||
      profile.model_id.startsWith("openrouter/")
    )
      throw new OpenRouterAdapterError("AUTO_ROUTING_FORBIDDEN");
    // Route policy must be explicit: an exact, valid, pre-approved
    // policy bound to this profile identity. Nothing is derived.
    const policy = this.options.route_policies.find(
      (candidate) =>
        candidate.profile_id === profile.profile_id &&
        candidate.profile_contract_version === profile.contract_version,
    );
    if (
      policy === undefined ||
      validateOpenRouterRoutePolicy(policy).length > 0
    )
      throw new OpenRouterAdapterError("ROUTE_POLICY_INVALID");
    if (policy.model_id === OPENROUTER_AUTO_MODEL_ID)
      throw new OpenRouterAdapterError("AUTO_ROUTING_FORBIDDEN");
    if (policy.model_id !== profile.model_id)
      throw new OpenRouterAdapterError("MODEL_MISMATCH");
    if (
      profile.configuration.response_format !== "json" ||
      !config.structured_output_modes.includes(policy.structured_output_mode)
    )
      throw new OpenRouterAdapterError("STRUCTURED_OUTPUT_UNSUPPORTED");
    if (
      !(context.signal instanceof AbortSignal) ||
      !Number.isSafeInteger(context.timeout_ms) ||
      context.timeout_ms < 1 ||
      context.timeout_ms > config.overall_timeout_ms
    )
      throw new OpenRouterAdapterError("TIMEOUT_SIGNAL_INVALID");
    if (
      context.pricing_contract === undefined ||
      context.pricing_contract.pricing_id !== policy.pricing_id ||
      context.pricing_contract.pricing_contract_version !==
        policy.pricing_contract_version
    )
      throw new OpenRouterAdapterError("PRICING_CONTRACT_INCOMPATIBLE");
    if (findForbiddenOverride(request) !== undefined)
      throw new OpenRouterAdapterError("REQUEST_OVERRIDE_FORBIDDEN");
    if (findCredentialShapedField(request) !== undefined)
      throw new OpenRouterAdapterError("REQUEST_CREDENTIAL_SHAPED");
    return policy;
  }

  private buildRequestBody(
    request: ProviderExecutionRequest,
    profile: ExecutionProfile,
    policy: OpenRouterRoutePolicy,
  ): string {
    // Exact pinned model; explicit documented provider controls only;
    // fallback disabled; data collection denied; no internal metadata.
    const body = JSON.stringify({
      model: profile.model_id,
      messages: request.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      ...(profile.configuration.temperature === undefined
        ? {}
        : { temperature: profile.configuration.temperature }),
      ...(profile.configuration.max_output_tokens === undefined
        ? {}
        : { max_tokens: profile.configuration.max_output_tokens }),
      ...(policy.structured_output_mode === "json_object"
        ? { response_format: { type: "json_object" } }
        : {}),
      provider: {
        allow_fallbacks: false,
        data_collection: policy.data_collection,
        require_parameters: true,
        zdr: true,
        ...(policy.allowed_upstream_providers === undefined
          ? {}
          : { only: [...policy.allowed_upstream_providers] }),
        ...(policy.provider_order === undefined
          ? {}
          : { order: [...policy.provider_order] }),
      },
    });
    if (
      Buffer.byteLength(body, "utf8") >
      this.options.config.max_request_body_bytes
    )
      throw new OpenRouterAdapterError("REQUEST_TOO_LARGE");
    return body;
  }

  private parseResponse(
    response: OpenRouterTransportResponse,
    profile: ExecutionProfile,
    policy: OpenRouterRoutePolicy,
  ): OpenRouterParsedResponse {
    if (response.status === 401 || response.status === 403)
      throw new OpenRouterAdapterError("AUTHENTICATION_FAILURE");
    if (response.status === 429)
      throw new OpenRouterAdapterError("RATE_LIMITED");
    if ([502, 503, 504].includes(response.status))
      throw new OpenRouterAdapterError("PROVIDER_UNAVAILABLE");
    if (response.status !== 200)
      throw new OpenRouterAdapterError("TRANSPORT_FAILURE");
    if (
      Buffer.byteLength(response.body, "utf8") >
      this.options.config.max_response_body_bytes
    )
      throw new OpenRouterAdapterError("RESPONSE_TOO_LARGE");
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.body);
    } catch {
      throw new OpenRouterAdapterError("RESPONSE_MALFORMED");
    }
    if (!isRecord(parsed))
      throw new OpenRouterAdapterError("RESPONSE_MALFORMED");
    // Post-response route verification. OpenRouter cannot be assumed to
    // guarantee an exact upstream; the response must prove the route or
    // the execution is blocked deterministically.
    if (
      typeof parsed["model"] === "string" &&
      parsed["model"] !== profile.model_id
    )
      throw new OpenRouterAdapterError("MODEL_SUBSTITUTION_DETECTED");
    const servedBy = parsed["provider"];
    if (policy.allowed_upstream_providers !== undefined) {
      if (typeof servedBy !== "string" || servedBy.length === 0) {
        // An exact upstream was demanded but the response does not
        // prove which upstream served it: fail closed, honestly.
        throw new OpenRouterAdapterError(
          policy.require_route_metadata
            ? "ROUTE_VERIFICATION_UNAVAILABLE"
            : "UPSTREAM_PROVIDER_UNVERIFIED",
        );
      } else if (
        !policy.allowed_upstream_providers.some(
          (allowed) => allowed.toLowerCase() === servedBy.toLowerCase(),
        )
      )
        throw new OpenRouterAdapterError("PROVIDER_SUBSTITUTION_DETECTED");
    } else if (
      policy.require_route_metadata &&
      (typeof servedBy !== "string" || servedBy.length === 0)
    )
      throw new OpenRouterAdapterError("ROUTE_VERIFICATION_UNAVAILABLE");
    if (typeof parsed["model"] !== "string" && policy.require_route_metadata)
      throw new OpenRouterAdapterError("ROUTE_VERIFICATION_UNAVAILABLE");
    const choices = parsed["choices"];
    if (!Array.isArray(choices) || choices.length === 0)
      throw new OpenRouterAdapterError("RESPONSE_SCHEMA_INVALID");
    const first = choices[0];
    const message = isRecord(first) ? first["message"] : undefined;
    const content = isRecord(message) ? message["content"] : undefined;
    if (typeof content !== "string" || content.length === 0)
      throw new OpenRouterAdapterError("RESPONSE_SCHEMA_INVALID");
    if (policy.structured_output_mode === "json_object") {
      try {
        const structured: unknown = JSON.parse(content);
        if (!isRecord(structured))
          throw new OpenRouterAdapterError("RESPONSE_SCHEMA_INVALID");
        if (
          this.options.validate_structured_output !== undefined &&
          !this.options.validate_structured_output(structured)
        )
          throw new OpenRouterAdapterError(
            "STRUCTURED_OUTPUT_VALIDATION_FAILED",
          );
      } catch (caught) {
        if (caught instanceof OpenRouterAdapterError) throw caught;
        throw new OpenRouterAdapterError("RESPONSE_SCHEMA_INVALID");
      }
    }
    const finishRaw = isRecord(first) ? first["finish_reason"] : undefined;
    const finish_reason =
      finishRaw === "stop"
        ? "stop"
        : finishRaw === "length"
          ? "length"
          : "unknown";
    const usage = mapOpenRouterUsage(parsed["usage"]);
    if (usage === undefined)
      throw new OpenRouterAdapterError("USAGE_UNAVAILABLE");
    return {
      content,
      finish_reason,
      usage,
    };
  }

  /** Nothing provider-authored ever reaches an error message. */
  private sanitize(
    caught: unknown,
    context: ProviderExecutionContext,
    transportInvoked: boolean,
  ): ExecutionError {
    if (caught instanceof OpenRouterAdapterError) return caught;
    if (caught instanceof ExecutionError) return caught;
    if (context.signal.aborted)
      return new OpenRouterAdapterError("TRANSPORT_ABORTED");
    if (caught instanceof DOMException && caught.name === "AbortError")
      return new OpenRouterAdapterError("TRANSPORT_ABORTED");
    if (caught instanceof DOMException && caught.name === "TimeoutError")
      return new OpenRouterAdapterError("TRANSPORT_TIMEOUT");
    return new OpenRouterAdapterError(
      transportInvoked ? "TRANSPORT_FAILURE" : "ROUTE_POLICY_INVALID",
    );
  }
}

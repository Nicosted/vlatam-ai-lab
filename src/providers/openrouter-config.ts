/**
 * Governed OpenRouter adapter configuration and route-policy contracts.
 *
 * This module is provider-layer only. It owns the single fixed
 * OpenRouter endpoint literal and the closed, versioned, non-secret
 * configuration contract for the transport adapter. No secret value is
 * ever stored here: the API key is referenced exclusively by
 * environment variable NAME and read only at execution time inside the
 * adapter. There is no default model, no default upstream provider, no
 * permissive route policy, and no retry.
 */

export const OPENROUTER_PROVIDER_ID = "openrouter" as const;
export const OPENROUTER_ADAPTER_CONFIG_CONTRACT_VERSION = "1.0.0" as const;
export const OPENROUTER_ROUTE_POLICY_CONTRACT_VERSION = "1.0.0" as const;

/** Stable identifier used in configuration instead of a mutable URL. */
export const OPENROUTER_BASE_URL_ID = "openrouter-api-v1" as const;
/** The only OpenRouter endpoint. Fixed; never configurable. */
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1" as const;

/** Provider-neutral auto-routing is forbidden in every code path. */
export const OPENROUTER_AUTO_MODEL_ID = "openrouter/auto" as const;

export const OPENROUTER_TRANSPORT_CAPABILITIES = ["chat_completions"] as const;
export type OpenRouterTransportCapability =
  (typeof OPENROUTER_TRANSPORT_CAPABILITIES)[number];

export const OPENROUTER_STRUCTURED_OUTPUT_MODES = ["json_object"] as const;
export type OpenRouterStructuredOutputMode =
  (typeof OPENROUTER_STRUCTURED_OUTPUT_MODES)[number];

/**
 * The only OpenRouter usage fields this adapter maps (usage
 * normalization version below). Anything else is ignored as
 * unsupported — never guessed, never converted to zero.
 * `cache_write` and per-request billing units have no recognized
 * OpenRouter usage field and therefore remain unavailable.
 */
export const OPENROUTER_SUPPORTED_USAGE_FIELDS = [
  "prompt_tokens",
  "completion_tokens",
  "total_tokens",
  "prompt_tokens_details.cached_tokens",
  "completion_tokens_details.reasoning_tokens",
] as const;
export type OpenRouterSupportedUsageField =
  (typeof OPENROUTER_SUPPORTED_USAGE_FIELDS)[number];

export const OPENROUTER_USAGE_NORMALIZATION_VERSION = "1.0.0" as const;

/** The only routing mode this adapter implements: exact pinned model,
 * explicit optional upstream allowlist/order, all fallbacks disabled. */
export const OPENROUTER_ROUTING_POLICY_MODE = "exact_pinned" as const;

export interface OpenRouterRetryPolicy {
  /** Must be 0: the adapter never retries, ever. */
  readonly max_retries: 0;
}

/** Closed, versioned, non-secret adapter configuration contract. */
export interface OpenRouterAdapterConfig {
  readonly config_contract_version: typeof OPENROUTER_ADAPTER_CONFIG_CONTRACT_VERSION;
  readonly provider_id: typeof OPENROUTER_PROVIDER_ID;
  readonly base_url_id: typeof OPENROUTER_BASE_URL_ID;
  readonly enabled: boolean;
  /** Environment variable NAME holding the API key. Never the key. */
  readonly api_key_env_var: string;
  readonly transport_capabilities: readonly OpenRouterTransportCapability[];
  readonly max_request_body_bytes: number;
  readonly max_response_body_bytes: number;
  readonly connect_timeout_ms: number;
  readonly read_timeout_ms: number;
  readonly overall_timeout_ms: number;
  readonly retry_policy: OpenRouterRetryPolicy;
  readonly structured_output_modes: readonly OpenRouterStructuredOutputMode[];
  readonly supported_usage_fields: readonly OpenRouterSupportedUsageField[];
  readonly routing_policy_mode: typeof OPENROUTER_ROUTING_POLICY_MODE;
}

/**
 * Exact route policy for one approved execution profile. The adapter
 * never derives any of these values. The repository registry may describe
 * reviewed candidate routes, but only a separately approved, complete route
 * can supply this execution contract. The shipped registry has no approved
 * route, so no profile is executable.
 *
 * Route verification honesty: OpenRouter documents per-request
 * provider controls (`provider.only`, `provider.order`,
 * `provider.allow_fallbacks: false`, `provider.data_collection:
 * "deny"`), and reviewed evidence records its default routing as
 * VARIABLE. This adapter therefore treats upstream pinning as
 * best-effort request control plus mandatory post-response
 * verification, and fails closed (`route_verification_unavailable`,
 * `upstream_provider_unverified`) whenever the response does not prove
 * the route. It never claims OpenRouter guarantees an exact upstream.
 */
export interface OpenRouterRoutePolicy {
  readonly route_policy_version: typeof OPENROUTER_ROUTE_POLICY_CONTRACT_VERSION;
  readonly profile_id: string;
  readonly profile_contract_version: string;
  /** Exact OpenRouter model slug (`author/slug`). Never `openrouter/auto`. */
  readonly model_id: string;
  /** Optional exact upstream provider allowlist (`provider.only`). */
  readonly allowed_upstream_providers?: readonly string[];
  /** Optional ordered preference; must be a subset of the allowlist. */
  readonly provider_order?: readonly string[];
  /** Exact OpenRouter endpoint tag selected by reviewed metadata. */
  readonly endpoint_tag?: string;
  /** Exact provider display identity required in the response metadata. */
  readonly expected_response_provider_identity?: string;
  /** Must be false: provider and model fallback are disabled. */
  readonly allow_fallbacks: false;
  /** Sent as `provider.data_collection`; always "deny". */
  readonly data_collection: "deny";
  readonly require_parameters: true;
  readonly zdr: true;
  /** Require response route metadata for post-response verification. */
  readonly require_route_metadata: boolean;
  readonly structured_output_mode: OpenRouterStructuredOutputMode;
  /** Reviewed pricing contract identity the execution must be bound to. */
  readonly pricing_id: string;
  readonly pricing_contract_version: string;
}

const ENV_VAR_NAME = /^[A-Z][A-Z0-9_]{2,63}$/;
/** `author/slug` OpenRouter model id; lowercase, no whitespace. */
const MODEL_ID = /^[a-z0-9][a-z0-9.-]*\/[a-z0-9][a-z0-9.:-]*$/;
const PROVIDER_SLUG = /^[a-z0-9][a-z0-9-]*$/;
const ENDPOINT_TAG = /^[a-z0-9][a-z0-9/-]*$/;
/** Keys that would smuggle a secret value into configuration. */
const CREDENTIAL_KEY =
  /api[_-]?key$|^key$|secret|password|bearer|authorization|token$|private[_-]?key|access[_-]?key/i;
/** Values that look like credentials (long opaque secrets). */
const CREDENTIAL_VALUE = /^(?:sk-|or-|sk-or-|Bearer\s)[A-Za-z0-9._-]{8,}/;

const CONFIG_KEYS: readonly (keyof OpenRouterAdapterConfig)[] = [
  "config_contract_version",
  "provider_id",
  "base_url_id",
  "enabled",
  "api_key_env_var",
  "transport_capabilities",
  "max_request_body_bytes",
  "max_response_body_bytes",
  "connect_timeout_ms",
  "read_timeout_ms",
  "overall_timeout_ms",
  "retry_policy",
  "structured_output_modes",
  "supported_usage_fields",
  "routing_policy_mode",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedInt(value: unknown, min: number, max: number): boolean {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= max
  );
}

/** Depth-first scan for credential-shaped keys or values anywhere in a
 * candidate configuration or payload object. */
export function findCredentialShapedField(
  value: unknown,
  allowKeys: readonly string[] = [],
  path = "",
): string | undefined {
  if (typeof value === "string" && CREDENTIAL_VALUE.test(value))
    return path || "(root)";
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findCredentialShapedField(
        value[index],
        allowKeys,
        `${path}[${index}]`,
      );
      if (found) return found;
    }
    return undefined;
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (!allowKeys.includes(key) && CREDENTIAL_KEY.test(key))
        return childPath;
      const found = findCredentialShapedField(child, allowKeys, childPath);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Closed validation of the adapter configuration contract. Unknown
 * fields are rejected (this is what makes a mutable `base_url`, a
 * `default_model`, or an embedded secret value structurally
 * impossible). Returns a sorted list of deterministic error strings;
 * empty means valid.
 */
export function validateOpenRouterAdapterConfig(
  value: unknown,
): readonly string[] {
  const errors = new Set<string>();
  if (!isRecord(value)) return ["config_not_an_object"];
  for (const key of Object.keys(value)) {
    if (!(CONFIG_KEYS as readonly string[]).includes(key))
      errors.add(`unknown_config_field:${key}`);
  }
  for (const key of CONFIG_KEYS) {
    if (!(key in value)) errors.add(`missing_config_field:${key}`);
  }
  if (
    value["config_contract_version"] !==
    OPENROUTER_ADAPTER_CONFIG_CONTRACT_VERSION
  )
    errors.add("unsupported_config_contract_version");
  if (value["provider_id"] !== OPENROUTER_PROVIDER_ID)
    errors.add("invalid_provider_id");
  if (value["base_url_id"] !== OPENROUTER_BASE_URL_ID)
    errors.add("invalid_base_url_id");
  if (typeof value["enabled"] !== "boolean") errors.add("invalid_enabled");
  if (
    typeof value["api_key_env_var"] !== "string" ||
    !ENV_VAR_NAME.test(value["api_key_env_var"])
  )
    errors.add("invalid_api_key_env_var");
  const caps = value["transport_capabilities"];
  if (
    !Array.isArray(caps) ||
    caps.length === 0 ||
    !caps.every((cap) =>
      (OPENROUTER_TRANSPORT_CAPABILITIES as readonly string[]).includes(
        cap as string,
      ),
    )
  )
    errors.add("invalid_transport_capabilities");
  if (!boundedInt(value["max_request_body_bytes"], 1, 10_000_000))
    errors.add("invalid_max_request_body_bytes");
  if (!boundedInt(value["max_response_body_bytes"], 1, 50_000_000))
    errors.add("invalid_max_response_body_bytes");
  if (!boundedInt(value["connect_timeout_ms"], 1, 120_000))
    errors.add("invalid_connect_timeout_ms");
  if (!boundedInt(value["read_timeout_ms"], 1, 120_000))
    errors.add("invalid_read_timeout_ms");
  if (!boundedInt(value["overall_timeout_ms"], 1, 120_000))
    errors.add("invalid_overall_timeout_ms");
  const retry = value["retry_policy"];
  if (
    !isRecord(retry) ||
    Object.keys(retry).length !== 1 ||
    retry["max_retries"] !== 0
  )
    errors.add("invalid_retry_policy");
  const modes = value["structured_output_modes"];
  if (
    !Array.isArray(modes) ||
    modes.length === 0 ||
    !modes.every((mode) =>
      (OPENROUTER_STRUCTURED_OUTPUT_MODES as readonly string[]).includes(
        mode as string,
      ),
    )
  )
    errors.add("invalid_structured_output_modes");
  const usageFields = value["supported_usage_fields"];
  if (
    !Array.isArray(usageFields) ||
    !usageFields.every((field) =>
      (OPENROUTER_SUPPORTED_USAGE_FIELDS as readonly string[]).includes(
        field as string,
      ),
    )
  )
    errors.add("invalid_supported_usage_fields");
  if (value["routing_policy_mode"] !== OPENROUTER_ROUTING_POLICY_MODE)
    errors.add("invalid_routing_policy_mode");
  const credential = findCredentialShapedField(value, ["api_key_env_var"]);
  if (credential) errors.add(`credential_shaped_field:${credential}`);
  if (
    typeof value["api_key_env_var"] === "string" &&
    CREDENTIAL_VALUE.test(value["api_key_env_var"])
  )
    errors.add("secret_value_in_config");
  return [...errors].sort();
}

/**
 * Validation for the SHIPPED default configuration: everything the
 * runtime contract requires, plus `enabled` must be false. Enabling
 * OpenRouter is a reviewed runtime act, never a repository default.
 */
export function validateOpenRouterDefaultConfig(
  value: unknown,
): readonly string[] {
  const errors = [...validateOpenRouterAdapterConfig(value)];
  if (isRecord(value) && value["enabled"] !== false)
    errors.push("enabled_by_default");
  return errors.sort();
}

/**
 * Closed validation of one exact route policy. A policy that names
 * `openrouter/auto`, allows fallback, omits the pinned model, or
 * carries an inconsistent provider order is rejected before any
 * transport work.
 */
export function validateOpenRouterRoutePolicy(
  value: unknown,
): readonly string[] {
  const errors = new Set<string>();
  if (!isRecord(value)) return ["route_policy_not_an_object"];
  const knownKeys = [
    "route_policy_version",
    "profile_id",
    "profile_contract_version",
    "model_id",
    "allowed_upstream_providers",
    "provider_order",
    "endpoint_tag",
    "expected_response_provider_identity",
    "allow_fallbacks",
    "data_collection",
    "require_parameters",
    "zdr",
    "require_route_metadata",
    "structured_output_mode",
    "pricing_id",
    "pricing_contract_version",
  ];
  for (const key of Object.keys(value)) {
    if (!knownKeys.includes(key))
      errors.add(`unknown_route_policy_field:${key}`);
  }
  if (
    value["route_policy_version"] !== OPENROUTER_ROUTE_POLICY_CONTRACT_VERSION
  )
    errors.add("unsupported_route_policy_version");
  if (
    typeof value["profile_id"] !== "string" ||
    !/^[a-z0-9][a-z0-9._-]+$/.test(value["profile_id"])
  )
    errors.add("invalid_profile_id");
  if (
    typeof value["profile_contract_version"] !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(value["profile_contract_version"])
  )
    errors.add("invalid_profile_contract_version");
  const model = value["model_id"];
  if (typeof model !== "string" || !MODEL_ID.test(model))
    errors.add("malformed_model_id");
  else if (
    model === OPENROUTER_AUTO_MODEL_ID ||
    model.startsWith("openrouter/")
  )
    errors.add("auto_routing_forbidden");
  const allowlist = value["allowed_upstream_providers"];
  if (allowlist !== undefined) {
    if (
      !Array.isArray(allowlist) ||
      allowlist.length === 0 ||
      !allowlist.every(
        (id) => typeof id === "string" && PROVIDER_SLUG.test(id),
      ) ||
      new Set(allowlist).size !== allowlist.length
    )
      errors.add("invalid_allowed_upstream_providers");
  }
  const order = value["provider_order"];
  if (order !== undefined) {
    const valid =
      Array.isArray(order) &&
      order.length > 0 &&
      order.every((id) => typeof id === "string" && PROVIDER_SLUG.test(id)) &&
      new Set(order).size === order.length;
    if (!valid) errors.add("invalid_provider_order");
    else if (
      Array.isArray(allowlist) &&
      !(order as string[]).every((id) => (allowlist as string[]).includes(id))
    )
      errors.add("provider_order_outside_allowlist");
    else if (allowlist === undefined)
      errors.add("provider_order_without_allowlist");
  }
  if (
    value["endpoint_tag"] !== undefined &&
    (typeof value["endpoint_tag"] !== "string" ||
      !ENDPOINT_TAG.test(value["endpoint_tag"]))
  )
    errors.add("invalid_endpoint_tag");
  if (
    value["expected_response_provider_identity"] !== undefined &&
    (typeof value["expected_response_provider_identity"] !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(
        value["expected_response_provider_identity"],
      ))
  )
    errors.add("invalid_expected_response_provider_identity");
  if (value["allow_fallbacks"] !== false) errors.add("permissive_fallback");
  if (value["data_collection"] !== "deny")
    errors.add("invalid_data_collection");
  if (value["require_parameters"] !== true)
    errors.add("parameters_not_required");
  if (value["zdr"] !== true) errors.add("zdr_not_required");
  if (typeof value["require_route_metadata"] !== "boolean")
    errors.add("invalid_require_route_metadata");
  if (
    !(OPENROUTER_STRUCTURED_OUTPUT_MODES as readonly string[]).includes(
      value["structured_output_mode"] as string,
    )
  )
    errors.add("unsupported_structured_output_mode");
  if (
    typeof value["pricing_id"] !== "string" ||
    !/^[a-z0-9][a-z0-9._:-]+$/.test(value["pricing_id"])
  )
    errors.add("invalid_pricing_id");
  if (
    typeof value["pricing_contract_version"] !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(value["pricing_contract_version"])
  )
    errors.add("invalid_pricing_contract_version");
  const credential = findCredentialShapedField(value);
  if (credential) errors.add(`credential_shaped_field:${credential}`);
  return [...errors].sort();
}

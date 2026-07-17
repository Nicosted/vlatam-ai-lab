import { createHash } from "node:crypto";

import type { CapabilityId } from "../capabilities/index.js";
import { validatePrivacyProfileDeclaration } from "../privacy/privacy-policy.js";
import type { PrivacyProfileDeclaration } from "../privacy/privacy-policy.js";

export type ExecutionProfileId = string & {
  readonly __executionProfileId: unique symbol;
};
export type ProviderId = string & { readonly __providerId: unique symbol };
export type ModelId = string & { readonly __modelId: unique symbol };
export type ProfileLifecycleStatus =
  | "production"
  | "candidate"
  | "shadow"
  | "retired";
export type ProviderExecutionMode = "replay" | "live";

export interface ProfileConfiguration {
  readonly temperature?: number;
  readonly max_output_tokens?: number;
  readonly timeout_ms: number;
  readonly response_format: "json";
}

export interface ProfileEligibility {
  readonly privacy_compatibility: "declared_not_enforced";
  readonly budget_class: "development" | "unclassified";
  readonly evaluation_status: "not_evaluated" | "fixture_verified";
}

export interface ExecutionProfile {
  readonly profile_id: ExecutionProfileId;
  readonly capability_id: CapabilityId;
  readonly provider_id: ProviderId;
  readonly model_id: ModelId;
  readonly mode: ProviderExecutionMode;
  readonly lifecycle_status: ProfileLifecycleStatus;
  readonly enabled: boolean;
  readonly contract_version: string;
  readonly configuration: ProfileConfiguration;
  readonly provider_configuration_ref?: string;
  /** AI-72 legacy eligibility block. Superseded for privacy purposes
   * by the AI-73 `privacy` declaration below; retained unchanged so
   * AI-72 consumers keep working. */
  readonly eligibility: ProfileEligibility;
  /** AI-73 privacy declaration. A declaration is never proof: the
   * privacy enforcer independently validates it and, for verified
   * ZDR, requires matching repository evidence. */
  readonly privacy: PrivacyProfileDeclaration;
  readonly fixture_id?: string;
  /** Proposal-only controls for a disabled external sandbox candidate. These
   * fields are metadata and are not consumed by the gateway or adapters. */
  readonly sandbox_controls?: {
    readonly configuration_status: "proposal_only";
    readonly adapter_config_id: string;
    readonly adapter_enabled: false;
    readonly authentication_material: "absent";
    readonly invocation_mode: "manual_only";
    readonly fallback_enabled: false;
    readonly automatic_retries: 0;
    readonly maximum_requests: number;
    readonly maximum_input_tokens_per_request: number;
    readonly maximum_output_tokens_per_request: number;
    readonly maximum_total_spend_usd: string;
    readonly exact_model_only: true;
    readonly intended_upstream_provider_id: string;
    readonly provider_order: readonly string[];
    readonly require_parameters: true;
    readonly data_collection: "deny";
    readonly zdr_required: true;
    readonly exact_upstream_routing_status: "unresolved" | "verified";
    readonly route_id: string;
    readonly required_dossier_hash: string;
    readonly required_evidence_pack_hash: string;
    readonly expires_at: string;
    readonly kill_switch_required: true;
  };
  readonly supervised_controls?: {
    readonly configuration_status: "blocked_candidate";
    readonly adapter_enabled: false;
    readonly budget_enabled: false;
    readonly invocation_mode: "manual_only";
    readonly human_review_required: true;
    readonly post_response_schema_validation_required: true;
    readonly structured_output_capability_status:
      | "controlled_execution_required"
      | "metadata_verified_runtime_conformance_pending";
    readonly fallback_enabled: false;
    readonly automatic_retries: 0;
    readonly maximum_requests: 1;
    readonly maximum_input_tokens_per_request: number;
    readonly maximum_output_tokens_per_request: number;
    readonly maximum_total_spend_usd: "0.05";
    readonly operational_cost_bands_usd: {
      readonly preferred_max: "0.05";
      readonly acceptable_max: "0.25";
      readonly review_required_max: "1.00";
    };
    readonly exact_model_only: true;
    readonly intended_upstream_provider_id: "z-ai" | "fireworks";
    readonly provider_catalog_slug?: string;
    readonly endpoint_tag?: string;
    readonly endpoint_display_identity?: string;
    readonly expected_response_provider_identity?: string;
    readonly exact_provider_endpoint_slug: string | null;
    readonly provider_order: readonly string[];
    readonly exact_upstream_routing_status:
      | "blocked_missing_official_slug"
      | "metadata_bound_response_verification_required"
      | "verified";
    readonly require_parameters: true;
    readonly data_collection: "deny";
    readonly zdr_required: true;
    readonly pre_execution_redaction_required: true;
    readonly external_processing_scope: "redacted_only";
    readonly regulated_data_permitted: false;
    readonly restricted_data_permitted: false;
    readonly route_id: string;
    readonly kill_switch_required: true;
    readonly kill_switch_active: true;
    readonly durable_one_use_grant_required: true;
    readonly owners: Readonly<Record<string, string>>;
    readonly pending_approvals: readonly string[];
  };
}

export const EXECUTION_PROFILE_CONTRACT_VERSION = "1.1.0";
export const SUPPORTED_EXECUTION_PROFILE_MAJOR = 1;
export const EXECUTION_PROFILE_HASH_DOMAIN =
  "vlatam-ai-lab:execution-profile:canonical-json:v1" as const;

function canonicalProfileJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("profile_hash_non_finite_number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value))
    return `[${value.map(canonicalProfileJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalProfileJson(record[key])}`,
      )
      .join(",")}}`;
  }
  throw new Error("profile_hash_unsupported_json_value");
}

/** Hashes the complete execution-profile record under an explicit v1 domain. */
export function computeExecutionProfileHash(profile: unknown): string {
  return createHash("sha256")
    .update(EXECUTION_PROFILE_HASH_DOMAIN)
    .update("\n")
    .update(canonicalProfileJson(profile))
    .digest("hex");
}

export function validateExecutionProfile(
  profile: ExecutionProfile,
): readonly string[] {
  const errors: string[] = [];
  if (!/^[a-z0-9][a-z0-9._-]+$/.test(profile.profile_id))
    errors.push("invalid profile_id");
  if (!/^[a-z0-9][a-z0-9._-]+$/.test(profile.provider_id))
    errors.push("invalid provider_id");
  if (!profile.model_id) errors.push("model_id is required");
  if (
    !Number.isInteger(profile.configuration.timeout_ms) ||
    profile.configuration.timeout_ms < 1 ||
    profile.configuration.timeout_ms > 120_000
  )
    errors.push("timeout_ms must be between 1 and 120000");
  const major = Number(profile.contract_version.split(".")[0]);
  if (major !== SUPPORTED_EXECUTION_PROFILE_MAJOR)
    errors.push("unsupported profile contract version");
  if (profile.lifecycle_status === "shadow" && profile.enabled)
    errors.push("shadow execution is not supported by AI-72");
  if (profile.sandbox_controls !== undefined) {
    if (profile.enabled)
      errors.push("sandbox proposal profile must remain disabled");
    if (profile.sandbox_controls.adapter_enabled)
      errors.push("sandbox proposal adapter must remain disabled");
    if (profile.sandbox_controls.invocation_mode !== "manual_only")
      errors.push("sandbox proposal invocation must be manual");
    if (profile.sandbox_controls.fallback_enabled)
      errors.push("sandbox proposal fallback must remain disabled");
    if (profile.sandbox_controls.automatic_retries !== 0)
      errors.push("sandbox proposal automatic retries must remain disabled");
    if (
      !profile.sandbox_controls.exact_model_only ||
      profile.sandbox_controls.provider_order.length !== 1 ||
      profile.sandbox_controls.provider_order[0] !==
        profile.sandbox_controls.intended_upstream_provider_id
    )
      errors.push("sandbox proposal provider routing must remain exact");
  }
  if (profile.supervised_controls !== undefined) {
    const controls = profile.supervised_controls;
    if (profile.enabled || controls.adapter_enabled || controls.budget_enabled)
      errors.push("supervised production candidate must remain disabled");
    if (
      controls.invocation_mode !== "manual_only" ||
      controls.maximum_requests !== 1 ||
      controls.automatic_retries !== 0 ||
      controls.fallback_enabled
    )
      errors.push("supervised production candidate must remain one-shot");
    if (
      controls.exact_upstream_routing_status === "verified" &&
      (controls.exact_provider_endpoint_slug === null ||
        controls.provider_order.length !== 1 ||
        controls.provider_order[0] !== controls.exact_provider_endpoint_slug)
    )
      errors.push("verified supervised route requires one exact provider slug");
    if (
      controls.exact_upstream_routing_status ===
        "blocked_missing_official_slug" &&
      (controls.exact_provider_endpoint_slug !== null ||
        controls.provider_order.length !== 0)
    )
      errors.push("unverified supervised route must not guess provider slug");
  }
  if (profile.privacy === undefined) {
    errors.push("privacy declaration is required");
  } else {
    errors.push(
      ...validatePrivacyProfileDeclaration(profile.privacy, profile.mode),
    );
  }
  return errors;
}

export interface ExecutionProfileCatalog {
  readonly schema_version: string;
  readonly profiles: readonly ExecutionProfile[];
}

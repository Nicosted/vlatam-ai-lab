import { createHash } from "node:crypto";

import accountEvidenceJson from "../../config/ai-openrouter-glm-account-evidence.json" with { type: "json" };
import activationReviewJson from "../../config/ai-openrouter-glm-activation-review.json" with { type: "json" };
import capabilityAcceptanceJson from "../../config/ai-openrouter-glm-capability-acceptance.json" with { type: "json" };
import evidencePackJson from "../../config/ai-openrouter-glm-external-evidence-pack.json" with { type: "json" };
import runtimeJson from "../../config/ai-openrouter-glm-first-run-runtime.json" with { type: "json" };
import pricingPolicyJson from "../../config/ai-openrouter-glm-pricing-policy-candidate.json" with { type: "json" };
import readinessDossierJson from "../../config/ai-openrouter-glm-readiness-dossier.json" with { type: "json" };
import proposalJson from "../../config/ai-openrouter-glm-supervised-enablement-proposal.json" with { type: "json" };
import zdrReviewJson from "../../config/ai-openrouter-glm-zdr-review-candidate.json" with { type: "json" };
import operationContractJson from "../../config/ai-commercial-document-pilot-operation.json" with { type: "json" };

export const GLM_MODEL_ID = "z-ai/glm-5.2" as const;
export const GLM_PROVIDER_SLUG = "fireworks" as const;
export const GLM_ENDPOINT_TAG = "fireworks" as const;
export const GLM_RESPONSE_PROVIDER_IDENTITY = "Fireworks" as const;
export const GLM_ENDPOINT_DISPLAY_IDENTITY =
  "Fireworks | z-ai/glm-5.2-20260616" as const;
export const GLM_PROFILE_ID =
  "openrouter.glm-5.2.commercial-document-extraction.candidate" as const;
export const GLM_ROUTE_ID =
  "openrouter.glm-5.2.fireworks-standard-candidate" as const;
export const GLM_OPERATION_ID = "VLATAM-PILOT-001" as const;
export const GLM_ACCOUNT_EVIDENCE_HASH_DOMAIN =
  "vlatam-ai-lab:openrouter-account-evidence:v1" as const;
export const GLM_OPERATION_HASH_DOMAIN =
  "vlatam-ai-lab:glm-operation-binding:v1" as const;

type JsonRecord = Record<string, unknown>;

const GLM_SHA256 = /^[a-f0-9]{64}$/;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const canonical = (value: unknown): string => {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value))
      throw new Error("non_integer_json_number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  throw new Error("unsupported_json_value");
};

const domainHash = (
  domain: string,
  value: unknown,
  hashField: string,
): string => {
  if (!isRecord(value)) throw new Error("hash_input_not_object");
  const payload = { ...value };
  delete payload[hashField];
  return createHash("sha256")
    .update(domain)
    .update("\n")
    .update(canonical(payload))
    .digest("hex");
};

export function computeGlmAccountEvidenceHash(value: unknown): string {
  return domainHash(GLM_ACCOUNT_EVIDENCE_HASH_DOMAIN, value, "evidence_hash");
}

export function computeGlmOperationContractHash(value: unknown): string {
  return domainHash(GLM_OPERATION_HASH_DOMAIN, value, "artifact_hash");
}

export function computeGlmGovernanceArtifactHash(value: unknown): string {
  if (!isRecord(value) || typeof value["hash_domain"] !== "string")
    throw new Error("glm_governance_hash_domain_missing");
  return domainHash(value["hash_domain"], value, "artifact_hash");
}

export interface GlmGovernanceEvaluation {
  readonly outcome: "blocked" | "eligible" | "invalid";
  readonly blockers: readonly string[];
  readonly artifact_hashes: Readonly<Record<string, string>>;
}

export function evaluateGlmGovernanceArtifacts(
  now = new Date(),
): GlmGovernanceEvaluation {
  const artifacts = [
    operationContractJson,
    evidencePackJson,
    pricingPolicyJson,
    zdrReviewJson,
    capabilityAcceptanceJson,
    readinessDossierJson,
    proposalJson,
    runtimeJson,
    activationReviewJson,
  ] as readonly JsonRecord[];
  const invalid = new Set<string>();
  const hashes: Record<string, string> = {};
  const blockers = new Set<string>();
  for (const artifact of artifacts) {
    const id = String(artifact["artifact_id"] ?? "unknown");
    const stored = String(artifact["artifact_hash"] ?? "");
    hashes[id] = stored;
    if (
      !GLM_SHA256.test(stored) ||
      stored !== computeGlmGovernanceArtifactHash(artifact)
    )
      invalid.add(`artifact_hash_mismatch:${id}`);
    if (artifact["execution_authority"] !== false)
      invalid.add(`artifact_authority_forbidden:${id}`);
    if (Array.isArray(artifact["blockers"]))
      for (const blocker of artifact["blockers"]) blockers.add(String(blocker));
  }
  const observedAt = Date.parse(evidencePackJson.observed_at);
  const maximumEvidenceAgeMs = 30 * 24 * 60 * 60 * 1000;
  if (
    !Number.isFinite(observedAt) ||
    now.getTime() - observedAt > maximumEvidenceAgeMs
  )
    blockers.add("metadata_evidence_expired");
  const expectedBindings: readonly [JsonRecord, string, string][] = [
    [
      readinessDossierJson,
      "model_hash",
      "c003f49b14893bc2e477ec3d01d191822f07aa7f65e8a78b3ce3ebdbfc45f8f1",
    ],
    [
      readinessDossierJson,
      "route_hash",
      "b1fb5f5591659ca9fb222f3115234df427718e3a65c1cfcdd127cbdac9a88151",
    ],
    [
      readinessDossierJson,
      "profile_hash",
      "5dc48fa5584e1326293af73f392256c4dff07b6bd649c47436088d17c7650291",
    ],
    [
      readinessDossierJson,
      "operation_binding_hash",
      operationContractJson.artifact_hash,
    ],
    [
      readinessDossierJson,
      "external_evidence_hash",
      evidencePackJson.artifact_hash,
    ],
    [
      readinessDossierJson,
      "pricing_policy_hash",
      pricingPolicyJson.artifact_hash,
    ],
    [readinessDossierJson, "zdr_review_hash", zdrReviewJson.artifact_hash],
    [
      readinessDossierJson,
      "capability_acceptance_hash",
      capabilityAcceptanceJson.artifact_hash,
    ],
    [
      proposalJson,
      "readiness_dossier_hash",
      readinessDossierJson.artifact_hash,
    ],
    [
      proposalJson,
      "operation_binding_hash",
      operationContractJson.artifact_hash,
    ],
    [runtimeJson, "proposal_hash", proposalJson.artifact_hash],
    [runtimeJson, "readiness_dossier_hash", readinessDossierJson.artifact_hash],
    [runtimeJson, "external_evidence_hash", evidencePackJson.artifact_hash],
    [runtimeJson, "pricing_policy_hash", pricingPolicyJson.artifact_hash],
    [runtimeJson, "zdr_review_hash", zdrReviewJson.artifact_hash],
    [
      runtimeJson,
      "capability_acceptance_hash",
      capabilityAcceptanceJson.artifact_hash,
    ],
    [
      runtimeJson,
      "operation_binding_hash",
      operationContractJson.artifact_hash,
    ],
    [
      runtimeJson,
      "profile_hash",
      "5dc48fa5584e1326293af73f392256c4dff07b6bd649c47436088d17c7650291",
    ],
    [
      runtimeJson,
      "route_hash",
      "b1fb5f5591659ca9fb222f3115234df427718e3a65c1cfcdd127cbdac9a88151",
    ],
    [
      runtimeJson,
      "model_hash",
      "c003f49b14893bc2e477ec3d01d191822f07aa7f65e8a78b3ce3ebdbfc45f8f1",
    ],
    [activationReviewJson, "runtime_hash", runtimeJson.artifact_hash],
    [activationReviewJson, "proposal_hash", proposalJson.artifact_hash],
    [
      activationReviewJson,
      "readiness_dossier_hash",
      readinessDossierJson.artifact_hash,
    ],
    [
      activationReviewJson,
      "external_evidence_hash",
      evidencePackJson.artifact_hash,
    ],
    [
      activationReviewJson,
      "pricing_policy_hash",
      pricingPolicyJson.artifact_hash,
    ],
    [activationReviewJson, "zdr_review_hash", zdrReviewJson.artifact_hash],
    [
      activationReviewJson,
      "capability_acceptance_hash",
      capabilityAcceptanceJson.artifact_hash,
    ],
    [
      activationReviewJson,
      "operation_binding_hash",
      operationContractJson.artifact_hash,
    ],
  ];
  for (const [artifact, key, expected] of expectedBindings) {
    const bindings = isRecord(artifact["bindings"]) ? artifact["bindings"] : {};
    if (bindings[key] !== expected)
      invalid.add(`artifact_binding_mismatch:${key}`);
  }
  if (runtimeJson.exact_model !== GLM_MODEL_ID)
    invalid.add("runtime_model_identity_mismatch");
  if (
    runtimeJson.provider_catalog_slug !== GLM_PROVIDER_SLUG ||
    runtimeJson.endpoint_tag !== GLM_ENDPOINT_TAG ||
    runtimeJson.endpoint_display_identity !== GLM_ENDPOINT_DISPLAY_IDENTITY ||
    runtimeJson.expected_response_provider_identity !==
      GLM_RESPONSE_PROVIDER_IDENTITY ||
    runtimeJson.provider.only.length !== 1 ||
    runtimeJson.provider.only[0] !== GLM_PROVIDER_SLUG ||
    runtimeJson.provider.order.length !== 1 ||
    runtimeJson.provider.order[0] !== GLM_PROVIDER_SLUG
  )
    invalid.add("runtime_fireworks_identity_binding_invalid");
  if (
    runtimeJson.adapter_enabled !== false ||
    runtimeJson.model_enabled !== false ||
    runtimeJson.route_enabled !== false ||
    runtimeJson.profile_enabled !== false ||
    runtimeJson.budget_enabled !== false ||
    runtimeJson.kill_switch_active !== true
  )
    invalid.add("runtime_fail_closed_controls_invalid");
  if (invalid.size > 0)
    return Object.freeze({
      outcome: "invalid",
      blockers: [...invalid].sort(),
      artifact_hashes: Object.freeze(hashes),
    });
  return Object.freeze({
    outcome: blockers.size > 0 ? "blocked" : "eligible",
    blockers: Object.freeze([...blockers].sort()),
    artifact_hashes: Object.freeze(hashes),
  });
}

export interface GlmFirstRunReadOnlyProjection {
  readonly outcome: "blocked";
  readonly reasons: readonly string[];
  readonly secret_requested: false;
  readonly secret_resolution_allowed: boolean;
}

export function projectGlmFirstRunReadiness(): GlmFirstRunReadOnlyProjection {
  const governance = evaluateGlmGovernanceArtifacts();
  if (governance.outcome !== "eligible")
    return Object.freeze({
      outcome: "blocked",
      reasons: governance.blockers,
      secret_requested: false,
      secret_resolution_allowed: false,
    });
  if (
    runtimeJson.provider_catalog_slug !== GLM_PROVIDER_SLUG ||
    runtimeJson.endpoint_tag !== GLM_ENDPOINT_TAG
  )
    return Object.freeze({
      outcome: "blocked",
      reasons: ["exact_provider_endpoint_slug_unproven"],
      secret_requested: false,
      secret_resolution_allowed: false,
    });
  return Object.freeze({
    outcome: "blocked",
    reasons: ["secret_resolver_missing"],
    secret_requested: false,
    secret_resolution_allowed: true,
  });
}

export interface OpenRouterSandboxReadOnlyPreflightProjection {
  readonly outcome:
    | "invalid_configuration"
    | "blocked"
    | "approval_required"
    | "kill_switch_active"
    | "budget_unavailable"
    | "ready_for_manual_sandbox_call";
  readonly reasons: readonly string[];
  readonly configuration_id?: string;
  readonly kill_switch_reference?: string;
}

const SANDBOX_SHA256 = /^[a-f0-9]{64}$/;
const ENVIRONMENT_REFERENCE = /^[A-Z][A-Z0-9_]{2,63}$/;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const timestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

const sandboxProjection = (
  outcome: OpenRouterSandboxReadOnlyPreflightProjection["outcome"],
  reasons: readonly string[],
  configurationId?: string,
  killSwitchReference?: string,
): OpenRouterSandboxReadOnlyPreflightProjection =>
  Object.freeze({
    outcome,
    reasons: Object.freeze([...reasons].sort()),
    ...(configurationId === undefined
      ? {}
      : { configuration_id: configurationId }),
    ...(killSwitchReference === undefined
      ? {}
      : { kill_switch_reference: killSwitchReference }),
  });

/**
 * Projects the repository-owned sandbox configuration without accepting a
 * secret provider, resolving credentials, or authorizing execution.
 */
export function projectOpenRouterSandboxPreflight(input: {
  readonly config: unknown;
  readonly expected_bindings: Readonly<Record<string, string | null>>;
  readonly now: Date;
}): OpenRouterSandboxReadOnlyPreflightProjection {
  if (!record(input.config))
    return sandboxProjection("invalid_configuration", [
      "configuration_not_object",
    ]);
  const config = input.config;
  const adapter = config["adapter"];
  const bindings = config["bindings"];
  const killSwitch = config["kill_switch"];
  const invalid: string[] = [];
  if (
    config["runtime_contract_version"] !== "1.0.0" ||
    typeof config["configuration_id"] !== "string"
  )
    invalid.push("unsupported_contract_version");
  if (
    !record(adapter) ||
    adapter["identity"] !== "openrouter.transport.chat-completions" ||
    adapter["version"] !== "1.0.0" ||
    !SANDBOX_SHA256.test(String(adapter["hash"] ?? ""))
  )
    invalid.push("adapter_identity_invalid");
  if (!record(bindings)) invalid.push("integrity_bindings_invalid");
  else if (
    !Object.values(bindings).every(
      (hash) => hash === null || SANDBOX_SHA256.test(String(hash)),
    )
  )
    invalid.push("integrity_bindings_invalid");
  if (!record(killSwitch) || typeof killSwitch["reference"] !== "string")
    invalid.push("kill_switch_reference_missing");
  if (
    !ENVIRONMENT_REFERENCE.test(String(config["secret_reference_name"] ?? ""))
  )
    invalid.push("secret_reference_missing");
  if (!timestamp(config["expires_at"]))
    invalid.push("configuration_expiry_invalid");
  if (invalid.length > 0)
    return sandboxProjection("invalid_configuration", invalid);

  const runtimeAdapter = adapter as Record<string, unknown>;
  const runtimeBindings = bindings as Record<string, unknown>;
  const runtimeKillSwitch = killSwitch as Record<string, unknown>;
  const configurationId = config["configuration_id"] as string;
  const killSwitchReference = runtimeKillSwitch["reference"] as string;
  for (const [key, expected] of Object.entries(input.expected_bindings))
    if (runtimeBindings[key] !== expected)
      return sandboxProjection(
        "blocked",
        ["integrity_hash_mismatch"],
        configurationId,
      );
  if (input.now.getTime() >= Date.parse(config["expires_at"] as string))
    return sandboxProjection(
      "blocked",
      ["configuration_expired"],
      configurationId,
    );
  if (
    config["readiness_outcome"] !== "eligible" ||
    config["proposal_outcome"] !== "eligible_for_configuration" ||
    config["exact_routing_status"] !== "verified"
  )
    return sandboxProjection(
      "blocked",
      ["readiness_or_routing_blocked"],
      configurationId,
    );
  const reviews = [
    "privacy_review",
    "retention_review",
    "training_use_review",
    "geography_review",
    "zdr_review",
    "structured_output_review",
    "legal_review",
    "security_review",
  ];
  if (
    reviews.some((review) => config[review] !== "approved") ||
    config["benchmark_acceptance"] !== "approved"
  )
    return sandboxProjection(
      "blocked",
      ["mandatory_review_or_benchmark_pending"],
      configurationId,
    );
  if (
    runtimeAdapter["enabled"] !== true ||
    config["model_enabled"] !== true ||
    config["route_enabled"] !== true ||
    config["profile_enabled"] !== true
  )
    return sandboxProjection(
      "blocked",
      ["governed_component_disabled"],
      configurationId,
    );
  if (runtimeBindings["exact_policy_hash"] === null)
    return sandboxProjection(
      "approval_required",
      ["exact_policy_hash_missing"],
      configurationId,
    );
  if (
    config["approval_state"] !== "approved" ||
    config["approval_scope"] !== "manual_sandbox_execution_exact_hashes" ||
    typeof config["approval_issuer"] !== "string" ||
    config["approval_issuer"] === "repository.operator-read-model" ||
    config["approval_issuer"] === "codex.repository.agent" ||
    !timestamp(config["approval_expires_at"]) ||
    input.now.getTime() >= Date.parse(String(config["approval_expires_at"]))
  )
    return sandboxProjection(
      "approval_required",
      ["approval_missing_expired_self_issued_or_out_of_scope"],
      configurationId,
    );
  if (runtimeKillSwitch["active"] === true)
    return sandboxProjection(
      "kill_switch_active",
      ["kill_switch_active"],
      configurationId,
      killSwitchReference,
    );
  if (config["budget_enabled"] !== true)
    return sandboxProjection(
      "budget_unavailable",
      ["budget_unavailable"],
      configurationId,
      killSwitchReference,
    );
  return sandboxProjection(
    "ready_for_manual_sandbox_call",
    [],
    configurationId,
    killSwitchReference,
  );
}

export const glmAccountEvidence = accountEvidenceJson;
export const glmOperationContract = operationContractJson;
export const glmGovernanceArtifacts = Object.freeze({
  readiness_dossier: readinessDossierJson,
  external_evidence_pack: evidencePackJson,
  supervised_enablement_proposal: proposalJson,
  first_run_runtime: runtimeJson,
  activation_review: activationReviewJson,
  capability_acceptance: capabilityAcceptanceJson,
  pricing_policy: pricingPolicyJson,
  zdr_review: zdrReviewJson,
  operation_binding: operationContractJson,
});

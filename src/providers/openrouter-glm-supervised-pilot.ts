import { createHash } from "node:crypto";

import { Ajv2020 as AjvClass } from "ajv/dist/2020.js";

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
import commercialDocumentSchema from "../../schemas/ai-commercial-document-extraction.schema.json" with { type: "json" };
import type {
  OpenRouterAdapterConfig,
  OpenRouterRoutePolicy,
} from "./openrouter-config.js";
import {
  OpenRouterAdapter,
  createOpenRouterFetchTransport,
} from "./openrouter-adapter.js";
import { createOpenRouterEnvironmentSecretProvider } from "./openrouter-secret-provider.js";

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

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonical(value: unknown): string {
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
}

function domainHash(domain: string, value: unknown, hashField: string): string {
  if (!isRecord(value)) throw new Error("hash_input_not_object");
  const payload = { ...value };
  delete payload[hashField];
  return createHash("sha256")
    .update(domain)
    .update("\n")
    .update(canonical(payload))
    .digest("hex");
}

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
      !SHA256.test(stored) ||
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

export async function evaluateGlmFirstRunPreflight(
  resolveSecret?: () => Promise<unknown>,
): Promise<
  Readonly<{
    outcome: "blocked" | "ready";
    reasons: readonly string[];
    secret_requested: boolean;
  }>
> {
  const governance = evaluateGlmGovernanceArtifacts();
  if (governance.outcome !== "eligible")
    return Object.freeze({
      outcome: "blocked",
      reasons: governance.blockers,
      secret_requested: false,
    });
  if (
    runtimeJson.provider_catalog_slug !== GLM_PROVIDER_SLUG ||
    runtimeJson.endpoint_tag !== GLM_ENDPOINT_TAG
  )
    return Object.freeze({
      outcome: "blocked",
      reasons: ["exact_provider_endpoint_slug_unproven"],
      secret_requested: false,
    });
  if (resolveSecret === undefined)
    return Object.freeze({
      outcome: "blocked",
      reasons: ["secret_resolver_missing"],
      secret_requested: false,
    });
  await resolveSecret();
  return Object.freeze({
    outcome: "ready",
    reasons: [],
    secret_requested: true,
  });
}

export type GlmExactPolicyIssuance =
  | Readonly<{ status: "blocked"; reasons: readonly string[] }>
  | Readonly<{
      status: "issued";
      policy: {
        operation_id: typeof GLM_OPERATION_ID;
        model_id: typeof GLM_MODEL_ID;
        route_id: typeof GLM_ROUTE_ID;
        profile_id: typeof GLM_PROFILE_ID;
        bindings: Readonly<Record<string, string>>;
        ceilings: typeof runtimeJson.ceilings;
        authorization_mode: "single_use";
        expires_at: string;
      };
    }>;

export function issueGlmExactPolicy(expiresAt: string): GlmExactPolicyIssuance {
  const governance = evaluateGlmGovernanceArtifacts();
  if (
    governance.outcome !== "eligible" ||
    activationReviewJson.status !== "eligible"
  )
    return Object.freeze({ status: "blocked", reasons: governance.blockers });
  return Object.freeze({
    status: "issued",
    policy: Object.freeze({
      operation_id: GLM_OPERATION_ID,
      model_id: GLM_MODEL_ID,
      route_id: GLM_ROUTE_ID,
      profile_id: GLM_PROFILE_ID,
      bindings: Object.freeze(
        Object.fromEntries(
          Object.entries({
            ...runtimeJson.bindings,
            activation_review_hash: activationReviewJson.artifact_hash,
          }).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        ),
      ),
      ceilings: runtimeJson.ceilings,
      authorization_mode: "single_use",
      expires_at: expiresAt,
    }),
  });
}

export function validateGlmAccountEvidence(value: unknown): readonly string[] {
  if (!isRecord(value)) return ["account_evidence_not_object"];
  const reasons = new Set<string>();
  if (value["source_type"] !== "operator_provided")
    reasons.add("account_evidence_source_invalid");
  if (value["review_status"] !== "pending")
    reasons.add("account_evidence_review_fabricated");
  if (value["execution_authority"] !== false)
    reasons.add("account_evidence_execution_authority_forbidden");
  if (value["observation_date"] !== "2026-07-16")
    reasons.add("account_evidence_observation_date_invalid");
  if (value["evidence_hash"] !== computeGlmAccountEvidenceHash(value))
    reasons.add("account_evidence_hash_mismatch");
  const serialized = canonical(value);
  if (/Bearer\s|sk-or-|\bor-[A-Za-z0-9_-]{8,}/i.test(serialized))
    reasons.add("credential_fragment_forbidden");
  return [...reasons].sort();
}

export interface GlmRedactedOperationInput {
  readonly operation_id: typeof GLM_OPERATION_ID;
  readonly source_kind: "redacted_text" | "redacted_derivative";
  readonly original_document_sha256: string;
  readonly redaction_attested: true;
  readonly text: string;
}

const SHA256 = /^[a-f0-9]{64}$/;
const SENSITIVE_FIELD =
  /bank[_ -]?account|account[_ -]?holder|phone|telephone|e-?mail|personal[_ -]?address|api[_ -]?key|credential|authorization|bearer|password/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const INTERNATIONAL_PHONE = /\+[0-9][0-9 .-]{7,18}[0-9]/;
const CREDIT_CARD = /\b(?:\d[ -]*?){13,19}\b/;

export function validateGlmRedactedOperationInput(
  value: unknown,
): readonly string[] {
  if (!isRecord(value)) return ["operation_input_not_object"];
  const reasons = new Set<string>();
  const keys = [
    "operation_id",
    "source_kind",
    "original_document_sha256",
    "redaction_attested",
    "text",
  ];
  if (
    Object.keys(value).length !== keys.length ||
    !keys.every((key) => key in value)
  )
    reasons.add("operation_input_shape_invalid");
  if (value["operation_id"] !== GLM_OPERATION_ID)
    reasons.add("operation_identity_mismatch");
  if (
    value["source_kind"] !== "redacted_text" &&
    value["source_kind"] !== "redacted_derivative"
  )
    reasons.add("original_document_input_forbidden");
  if (!SHA256.test(String(value["original_document_sha256"] ?? "")))
    reasons.add("original_document_hash_required");
  if (value["redaction_attested"] !== true)
    reasons.add("redaction_attestation_required");
  const text = value["text"];
  if (typeof text !== "string" || text.trim().length === 0)
    reasons.add("redacted_text_required");
  else {
    if (Buffer.byteLength(text, "utf8") > 131072)
      reasons.add("redacted_input_too_large");
    if (text.startsWith("%PDF-") || /application\/pdf/i.test(text))
      reasons.add("original_pdf_forbidden");
    if (
      SENSITIVE_FIELD.test(text) ||
      EMAIL.test(text) ||
      INTERNATIONAL_PHONE.test(text) ||
      CREDIT_CARD.test(text)
    )
      reasons.add("sensitive_field_detected");
  }
  return [...reasons].sort();
}

export function buildGlmRedactedProviderRequest(
  value: GlmRedactedOperationInput,
): Readonly<{
  request_id: string;
  structured_output: true;
  messages: readonly { role: "system" | "user"; content: string }[];
}> {
  const reasons = validateGlmRedactedOperationInput(value);
  if (reasons.length > 0)
    throw new Error(`GLM_OPERATION_INPUT_BLOCKED:${reasons.join(",")}`);
  return Object.freeze({
    request_id: "vlatam-pilot-001-redacted",
    structured_output: true,
    messages: Object.freeze([
      Object.freeze({
        role: "system" as const,
        content:
          "Return one JSON object containing supplier_identity, invoice_number, date, currency, incoterm, line_items, total, inconsistencies, missing_information, risk_flags, questions_for_supplier, and human_review_status=pending.",
      }),
      Object.freeze({ role: "user" as const, content: value.text }),
    ]),
  });
}

const validateCommercialDocumentSchema = new AjvClass({
  allErrors: true,
  strict: false,
}).compile(commercialDocumentSchema);

export function validateGlmCommercialDocumentResponse(value: unknown): boolean {
  return validateCommercialDocumentSchema(value);
}

export interface GlmLiveExecutorApprovalGate {
  readonly configuration_reviewed: boolean;
  readonly independent_approval: boolean;
  readonly legal_approval: boolean;
  readonly security_approval: boolean;
  readonly evidence_approval: boolean;
  readonly gold_case_accepted: boolean;
  readonly structured_output_verified: boolean;
  readonly exact_provider_endpoint_slug: string | null;
  readonly exact_endpoint_tag: string | null;
  readonly kill_switch_active: boolean;
}

/**
 * Final adapter wiring for registration inside MultiProviderGateway only.
 * The shipped candidate cannot pass this gate. Construction performs no secret
 * access; the adapter resolves the secret only after its own non-secret checks.
 */
export function createGlmAdapterForAuthorizedGateway(
  config: OpenRouterAdapterConfig,
  routePolicy: OpenRouterRoutePolicy,
  gate: GlmLiveExecutorApprovalGate,
): OpenRouterAdapter {
  const approvals = [
    gate.configuration_reviewed,
    gate.independent_approval,
    gate.legal_approval,
    gate.security_approval,
    gate.evidence_approval,
    gate.gold_case_accepted,
    gate.structured_output_verified,
  ];
  if (
    approvals.some((approved) => !approved) ||
    gate.kill_switch_active ||
    config.enabled !== true ||
    routePolicy.model_id !== GLM_MODEL_ID ||
    gate.exact_provider_endpoint_slug !== GLM_PROVIDER_SLUG ||
    gate.exact_endpoint_tag !== GLM_ENDPOINT_TAG ||
    routePolicy.endpoint_tag !== GLM_ENDPOINT_TAG ||
    routePolicy.expected_response_provider_identity !==
      GLM_RESPONSE_PROVIDER_IDENTITY ||
    routePolicy.allowed_upstream_providers?.length !== 1 ||
    routePolicy.allowed_upstream_providers[0] !==
      gate.exact_provider_endpoint_slug ||
    routePolicy.provider_order?.length !== 1 ||
    routePolicy.provider_order[0] !== gate.exact_provider_endpoint_slug ||
    routePolicy.allow_fallbacks !== false ||
    routePolicy.require_route_metadata !== true
  )
    throw new Error("GLM_LIVE_EXECUTOR_BLOCKED");
  return new OpenRouterAdapter({
    config,
    route_policies: [routePolicy],
    transport: createOpenRouterFetchTransport(),
    secret_provider: createOpenRouterEnvironmentSecretProvider(),
    validate_structured_output: validateGlmCommercialDocumentResponse,
  });
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

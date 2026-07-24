import { Ajv2020 as AjvClass } from "ajv/dist/2020.js";

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
import {
  computeGlmAccountEvidenceHash,
  evaluateGlmGovernanceArtifacts,
  GLM_ENDPOINT_TAG,
  GLM_MODEL_ID,
  GLM_OPERATION_ID,
  GLM_PROFILE_ID,
  GLM_PROVIDER_SLUG,
  GLM_RESPONSE_PROVIDER_IDENTITY,
  GLM_ROUTE_ID,
  glmGovernanceArtifacts,
  projectGlmFirstRunReadiness,
} from "./openrouter-supervised-pilot-projection.js";
export {
  computeGlmAccountEvidenceHash,
  computeGlmGovernanceArtifactHash,
  computeGlmOperationContractHash,
  evaluateGlmGovernanceArtifacts,
  GLM_ACCOUNT_EVIDENCE_HASH_DOMAIN,
  GLM_ENDPOINT_DISPLAY_IDENTITY,
  GLM_ENDPOINT_TAG,
  GLM_MODEL_ID,
  GLM_OPERATION_HASH_DOMAIN,
  GLM_OPERATION_ID,
  GLM_PROFILE_ID,
  GLM_PROVIDER_SLUG,
  GLM_RESPONSE_PROVIDER_IDENTITY,
  GLM_ROUTE_ID,
  glmAccountEvidence,
  glmGovernanceArtifacts,
  glmOperationContract,
  type GlmGovernanceEvaluation,
} from "./openrouter-supervised-pilot-projection.js";

const {
  activation_review: activationReviewJson,
  first_run_runtime: runtimeJson,
} = glmGovernanceArtifacts;

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

export async function evaluateGlmFirstRunPreflight(
  resolveSecret?: () => Promise<unknown>,
): Promise<
  Readonly<{
    outcome: "blocked" | "ready";
    reasons: readonly string[];
    secret_requested: boolean;
  }>
> {
  const projection = projectGlmFirstRunReadiness();
  if (!projection.secret_resolution_allowed)
    return Object.freeze({
      outcome: "blocked",
      reasons: projection.reasons,
      secret_requested: false,
    });
  if (resolveSecret === undefined)
    return Object.freeze({
      outcome: projection.outcome,
      reasons: projection.reasons,
      secret_requested: projection.secret_requested,
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

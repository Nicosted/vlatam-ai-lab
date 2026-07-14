import { createHash } from "node:crypto";

import adapterJson from "../../config/ai-openrouter-adapter.json" with { type: "json" };
import evidencePackJson from "../../config/ai-openrouter-external-evidence-pack.json" with { type: "json" };
import profilesJson from "../../config/ai-execution-profiles.json" with { type: "json" };
import dossierJson from "../../config/ai-openrouter-readiness-dossier.json" with { type: "json" };
import approvalJson from "../../config/ai-openrouter-sandbox-configuration-approval.json" with { type: "json" };
import modelRegistryJson from "../../config/ai-openrouter-model-registry.json" with { type: "json" };
import proposalJson from "../../config/ai-openrouter-sandbox-enablement-proposal.json" with { type: "json" };
import routeRegistryJson from "../../config/ai-openrouter-route-registry.json" with { type: "json" };
import {
  evaluateOpenRouterExternalEvidencePack,
  type OpenRouterExternalEvidencePack,
} from "./openrouter-external-evidence-pack.js";
import {
  evaluateOpenRouterReadinessDossier,
  type OpenRouterReadinessDossier,
} from "./openrouter-readiness-dossier.js";
import { canonicalizeOpenRouterRegistryJson } from "./openrouter-registry.js";

export const OPENROUTER_SANDBOX_PROPOSAL_CONTRACT_VERSION = "1.0.0" as const;
export const OPENROUTER_SANDBOX_APPROVAL_CONTRACT_VERSION = "1.0.0" as const;
export const OPENROUTER_SANDBOX_PROPOSAL_HASH_DOMAIN =
  "vlatam-ai-lab:openrouter-sandbox-enablement-proposal:v1" as const;

export const OPENROUTER_SANDBOX_PROPOSAL_LIFECYCLES = [
  "draft",
  "blocked",
  "pending_human_review",
  "approved_for_sandbox_configuration",
  "expired",
  "rejected",
] as const;
export type OpenRouterSandboxProposalLifecycle =
  (typeof OPENROUTER_SANDBOX_PROPOSAL_LIFECYCLES)[number];

export type OpenRouterSandboxProposalOutcome =
  | "invalid_proposal"
  | "blocked"
  | "pending_human_review"
  | "eligible_for_configuration";

export interface OpenRouterSandboxConfigurationApproval {
  readonly approval_contract_version: typeof OPENROUTER_SANDBOX_APPROVAL_CONTRACT_VERSION;
  readonly approval_id: string;
  readonly proposal_id: string;
  readonly proposal_version: string;
  readonly status: "pending" | "approved" | "rejected";
  readonly reviewer_id: string | null;
  readonly scope: "sandbox_configuration_proposal_only";
  readonly decision: "approve" | "reject" | null;
  readonly reason: string | null;
  readonly decided_at: string | null;
  readonly expires_at: string | null;
  readonly reviewed_hashes: {
    readonly proposal_hash: string | null;
    readonly dossier_hash: string | null;
    readonly evidence_pack_hash: string | null;
  };
  readonly execution_authorized: false;
  readonly secret_access_authorized: false;
  readonly runtime_configuration_authorized: false;
}

export interface OpenRouterSandboxEnablementProposal {
  readonly proposal_contract_version: typeof OPENROUTER_SANDBOX_PROPOSAL_CONTRACT_VERSION;
  readonly proposal_id: string;
  readonly proposal_version: string;
  readonly canonicalization_version: "registry-json-v1";
  readonly lifecycle: OpenRouterSandboxProposalLifecycle;
  readonly created_by: string;
  readonly created_at: string;
  readonly expires_at: string;
  readonly readiness_binding: {
    readonly dossier_id: string;
    readonly dossier_version: string;
    readonly dossier_hash: string;
    readonly required_outcome: "ready_for_sandbox_review";
    readonly observed_outcome: string;
  };
  readonly evidence_pack_binding: {
    readonly pack_id: string;
    readonly pack_version: string;
    readonly pack_hash: string;
  };
  readonly candidate: {
    readonly provider_id: "openrouter";
    readonly openrouter_model_id: string;
    readonly intended_upstream_provider_id: string;
    readonly upstream_model_id: string | null;
    readonly model_registry_entry_id: string;
    readonly route_id: string;
    readonly route_record_id: string;
    readonly capability_id: string;
    readonly execution_profile_id: string;
    readonly execution_profile_contract_version: string;
    readonly adapter_config_id: string;
  };
  readonly sandbox_controls: {
    readonly metadata_only: true;
    readonly maximum_requests: number;
    readonly maximum_input_tokens_per_request: number;
    readonly maximum_output_tokens_per_request: number;
    readonly maximum_total_spend_usd: string;
    readonly invocation_mode: "manual_only";
    readonly fallback_enabled: false;
    readonly automatic_retries: 0;
    readonly kill_switch_required: true;
    readonly exact_model_only: true;
  };
  readonly routing_constraints: {
    readonly provider_order: readonly string[];
    readonly allow_fallbacks: false;
    readonly require_parameters: true;
    readonly data_collection: "deny";
    readonly zdr: true;
    readonly exact_upstream_route_status: "unresolved" | "verified";
  };
  readonly privacy_requirements: {
    readonly zdr_required: true;
    readonly retention_review: "pending" | "approved";
    readonly training_use_review: "pending" | "approved";
    readonly geography_review: "pending" | "approved";
    readonly privacy_security_review: "pending" | "approved";
  };
  readonly review_requirements: {
    readonly evidence_verified: boolean;
    readonly pricing_bounded: boolean;
    readonly strict_structured_output_verified: boolean;
    readonly capability_benchmark_approved: boolean;
    readonly legal_review: "pending" | "approved";
    readonly security_review: "pending" | "approved";
  };
  readonly approval_binding: {
    readonly approval_id: string;
    readonly required_scope: "sandbox_configuration_proposal_only";
    readonly observed_state: "pending" | "approved" | "rejected";
  };
  readonly first_run_data_policy: {
    readonly allowed_data: readonly string[];
    readonly customer_data_allowed: false;
    readonly personal_data_allowed: false;
    readonly production_documents_allowed: false;
    readonly legal_reliance_allowed: false;
    readonly automatic_downstream_publication_allowed: false;
    readonly human_review_required: true;
    readonly outputs_classification: "experimental";
  };
  readonly execution_authorized: false;
  readonly secret_access_authorized: false;
  readonly runtime_configuration_authorized: false;
  readonly provider_call_performed: false;
  readonly proposal_hash: string;
}

export interface OpenRouterSandboxProposalDependencies {
  readonly dossier: OpenRouterReadinessDossier;
  readonly evidence_pack: OpenRouterExternalEvidencePack;
  readonly approval: OpenRouterSandboxConfigurationApproval;
  readonly model_entries: readonly {
    readonly entry_id: string;
    readonly model_id: string;
    readonly enabled: boolean;
  }[];
  readonly routes: readonly {
    readonly route_id: string;
    readonly route_record_id: string;
    readonly enabled: boolean;
    readonly allow_fallbacks: boolean;
    readonly fallback_model_entry_order: readonly string[];
  }[];
  readonly profiles: readonly {
    readonly profile_id: string;
    readonly provider_id: string;
    readonly model_id: string;
    readonly capability_id: string;
    readonly enabled: boolean;
    readonly configuration: {
      readonly max_output_tokens?: number;
      readonly timeout_ms: number;
    };
    readonly sandbox_controls?: {
      readonly adapter_enabled: boolean;
      readonly invocation_mode: string;
      readonly fallback_enabled: boolean;
      readonly automatic_retries: number;
      readonly maximum_requests: number;
      readonly maximum_input_tokens_per_request: number;
      readonly maximum_output_tokens_per_request: number;
      readonly maximum_total_spend_usd: string;
      readonly exact_model_only: boolean;
      readonly intended_upstream_provider_id: string;
      readonly provider_order: readonly string[];
      readonly require_parameters: boolean;
      readonly data_collection: string;
      readonly zdr_required: boolean;
      readonly exact_upstream_routing_status: string;
      readonly required_dossier_hash: string;
      readonly required_evidence_pack_hash: string;
    };
  }[];
  readonly adapter: {
    readonly enabled: boolean;
    readonly retry_policy: { readonly max_retries: number };
  };
}

export interface OpenRouterSandboxProposalEvaluation {
  readonly contract_version: typeof OPENROUTER_SANDBOX_PROPOSAL_CONTRACT_VERSION;
  readonly proposal_id: string | null;
  readonly evaluated_at: string;
  readonly outcome: OpenRouterSandboxProposalOutcome;
  readonly reason_codes: readonly string[];
  readonly configuration_authorized: boolean;
  readonly execution_authorized: false;
  readonly secret_access_authorized: false;
  readonly provider_call_performed: false;
}

const ID = /^[a-z0-9][a-z0-9._:-]+$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const HASH = /^[a-f0-9]{64}$/;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const validInstant = (value: unknown): value is string =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child);
  }
  return value;
};

export function computeOpenRouterSandboxProposalHash(value: unknown): string {
  const normalized = isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).filter(([key]) => key !== "proposal_hash"),
      )
    : value;
  return createHash("sha256")
    .update(OPENROUTER_SANDBOX_PROPOSAL_HASH_DOMAIN)
    .update("\n")
    .update(canonicalizeOpenRouterRegistryJson(normalized))
    .digest("hex");
}

export function defaultOpenRouterSandboxProposalDependencies(): OpenRouterSandboxProposalDependencies {
  return {
    dossier: structuredClone(dossierJson) as OpenRouterReadinessDossier,
    evidence_pack: structuredClone(
      evidencePackJson,
    ) as OpenRouterExternalEvidencePack,
    approval: structuredClone(
      approvalJson,
    ) as OpenRouterSandboxConfigurationApproval,
    model_entries: modelRegistryJson.entries,
    routes: routeRegistryJson.routes,
    profiles: profilesJson.profiles,
    adapter: adapterJson,
  } as OpenRouterSandboxProposalDependencies;
}

export function loadOpenRouterSandboxEnablementProposal(): OpenRouterSandboxEnablementProposal {
  return structuredClone(proposalJson) as OpenRouterSandboxEnablementProposal;
}

function approvalReasons(
  proposal: OpenRouterSandboxEnablementProposal,
  approval: OpenRouterSandboxConfigurationApproval,
  evaluatedAt: Date,
): readonly string[] {
  if (approval.status !== "approved") return ["human_approval_missing"];
  const reasons: string[] = [];
  if (!approval.reviewer_id) reasons.push("approval_reviewer_missing");
  if (approval.reviewer_id === proposal.created_by)
    reasons.push("self_approval_forbidden");
  if (approval.scope !== "sandbox_configuration_proposal_only")
    reasons.push("approval_scope_mismatch");
  if (
    approval.decision !== "approve" ||
    !approval.reason ||
    !validInstant(approval.decided_at)
  )
    reasons.push("approval_malformed");
  if (
    !validInstant(approval.expires_at) ||
    Date.parse(approval.expires_at) <= evaluatedAt.getTime()
  )
    reasons.push("approval_expired");
  if (
    approval.proposal_id !== proposal.proposal_id ||
    approval.proposal_version !== proposal.proposal_version ||
    approval.reviewed_hashes.proposal_hash !== proposal.proposal_hash ||
    approval.reviewed_hashes.dossier_hash !==
      proposal.readiness_binding.dossier_hash ||
    approval.reviewed_hashes.evidence_pack_hash !==
      proposal.evidence_pack_binding.pack_hash
  )
    reasons.push("approval_reviewed_hashes_mismatch");
  if (
    approval.execution_authorized !== false ||
    approval.secret_access_authorized !== false ||
    approval.runtime_configuration_authorized !== false
  )
    reasons.push("approval_scope_exceeded");
  return reasons;
}

export function evaluateOpenRouterSandboxEnablementProposal(
  value: unknown,
  evaluatedAt: Date,
  dependencies = defaultOpenRouterSandboxProposalDependencies(),
): OpenRouterSandboxProposalEvaluation {
  const invalid = new Set<string>();
  const blocked = new Set<string>();
  const safe = isRecord(value) ? value : {};
  const base = {
    contract_version: OPENROUTER_SANDBOX_PROPOSAL_CONTRACT_VERSION,
    proposal_id:
      typeof safe["proposal_id"] === "string" ? safe["proposal_id"] : null,
    evaluated_at: evaluatedAt.toISOString(),
    execution_authorized: false as const,
    secret_access_authorized: false as const,
    provider_call_performed: false as const,
  };
  if (!isRecord(value)) invalid.add("proposal_not_object");
  else {
    if (
      value["proposal_contract_version"] !==
      OPENROUTER_SANDBOX_PROPOSAL_CONTRACT_VERSION
    )
      invalid.add("unsupported_contract_version");
    if (!ID.test(String(value["proposal_id"] ?? "")))
      invalid.add("invalid_proposal_id");
    if (!SEMVER.test(String(value["proposal_version"] ?? "")))
      invalid.add("invalid_proposal_version");
    if (!validInstant(value["created_at"])) invalid.add("invalid_created_at");
    if (!validInstant(value["expires_at"])) invalid.add("invalid_expiry");
    else if (Date.parse(value["expires_at"] as string) <= evaluatedAt.getTime())
      blocked.add("proposal_expired");
    if (!HASH.test(String(value["proposal_hash"] ?? "")))
      invalid.add("invalid_proposal_hash_shape");
    else if (
      computeOpenRouterSandboxProposalHash(value) !== value["proposal_hash"]
    )
      invalid.add("proposal_hash_mismatch");
    for (const forbidden of [
      "execution_authorized",
      "secret_access_authorized",
      "runtime_configuration_authorized",
      "provider_call_performed",
    ])
      if (value[forbidden] !== false) invalid.add(`${forbidden}_forbidden`);
    if (
      !OPENROUTER_SANDBOX_PROPOSAL_LIFECYCLES.includes(
        value["lifecycle"] as OpenRouterSandboxProposalLifecycle,
      )
    )
      invalid.add("invalid_lifecycle");
    for (const key of [
      "readiness_binding",
      "evidence_pack_binding",
      "candidate",
      "sandbox_controls",
      "routing_constraints",
      "privacy_requirements",
      "review_requirements",
      "approval_binding",
      "first_run_data_policy",
    ])
      if (!isRecord(value[key])) invalid.add(`${key}_missing`);
    const routing = value["routing_constraints"];
    if (isRecord(routing) && !Array.isArray(routing["provider_order"]))
      invalid.add("provider_order_invalid");
  }
  if (invalid.size)
    return deepFreeze({
      ...base,
      outcome: "invalid_proposal",
      reason_codes: [...invalid].sort(),
      configuration_authorized: false,
    });

  const proposal = value as OpenRouterSandboxEnablementProposal;
  if (proposal.lifecycle === "expired") blocked.add("proposal_expired");
  if (proposal.lifecycle === "rejected") blocked.add("proposal_rejected");
  const dossierResult = evaluateOpenRouterReadinessDossier(
    dependencies.dossier,
    evaluatedAt,
  );
  const evidenceResult = evaluateOpenRouterExternalEvidencePack(
    dependencies.evidence_pack,
    evaluatedAt,
  );
  if (
    proposal.readiness_binding.dossier_id !== dependencies.dossier.dossier_id ||
    proposal.readiness_binding.dossier_version !==
      dependencies.dossier.dossier_version ||
    proposal.readiness_binding.dossier_hash !==
      dependencies.dossier.dossier_hash
  )
    invalid.add("dossier_binding_mismatch");
  if (
    proposal.evidence_pack_binding.pack_id !==
      dependencies.evidence_pack.pack_id ||
    proposal.evidence_pack_binding.pack_version !==
      dependencies.evidence_pack.pack_version ||
    proposal.evidence_pack_binding.pack_hash !==
      dependencies.evidence_pack.pack_hash
  )
    invalid.add("evidence_pack_binding_mismatch");
  if (proposal.readiness_binding.observed_outcome !== dossierResult.outcome)
    invalid.add("readiness_outcome_mismatch");
  if (
    proposal.approval_binding.approval_id !==
      dependencies.approval.approval_id ||
    proposal.approval_binding.observed_state !== dependencies.approval.status
  )
    invalid.add("approval_binding_mismatch");
  if (dossierResult.outcome === "blocked") blocked.add("readiness_blocked");
  else if (
    dossierResult.outcome !== proposal.readiness_binding.required_outcome
  )
    blocked.add("readiness_not_approved_for_review");
  if (evidenceResult.outcome !== "reviewable")
    blocked.add("mandatory_evidence_not_reviewable");
  if (
    dependencies.evidence_pack.records.some((record) =>
      ["missing", "unverified", "expired"].includes(record.state),
    )
  )
    blocked.add("evidence_unverified");
  if (
    dependencies.evidence_pack.records.some(
      (record) =>
        record.category === "pricing" && record.state === "conflicting",
    )
  )
    blocked.add("pricing_unbounded_or_conflicting");

  const path = dependencies.dossier.candidate_path;
  const candidateMatches =
    proposal.candidate.provider_id === path.provider_id &&
    proposal.candidate.openrouter_model_id === path.openrouter_model_id &&
    proposal.candidate.intended_upstream_provider_id ===
      path.upstream_provider_id &&
    proposal.candidate.upstream_model_id === path.upstream_model_id &&
    proposal.candidate.model_registry_entry_id ===
      path.model_registry_entry_id &&
    proposal.candidate.route_id === path.route_id &&
    proposal.candidate.route_record_id === path.route_record_id &&
    proposal.candidate.capability_id === path.capability_id &&
    proposal.candidate.execution_profile_id ===
      path.execution_profile_candidate_id &&
    proposal.candidate.execution_profile_contract_version ===
      path.execution_profile_contract_version;
  if (!candidateMatches) invalid.add("candidate_identity_mismatch");

  const profile = dependencies.profiles.find(
    (item) => item.profile_id === proposal.candidate.execution_profile_id,
  );
  if (!profile) blocked.add("proposed_profile_missing");
  else {
    if (
      profile.provider_id !== proposal.candidate.provider_id ||
      profile.model_id !== proposal.candidate.openrouter_model_id ||
      profile.capability_id !== proposal.candidate.capability_id
    )
      invalid.add("profile_identity_mismatch");
    if (profile.enabled) blocked.add("profile_enabled_unexpectedly");
    if (
      profile.configuration.max_output_tokens === undefined ||
      profile.configuration.max_output_tokens >
        proposal.sandbox_controls.maximum_output_tokens_per_request ||
      profile.configuration.timeout_ms > 10_000
    )
      blocked.add("profile_ceiling_weakened");
    const controls = profile.sandbox_controls;
    if (!controls) invalid.add("profile_sandbox_controls_missing");
    else {
      if (controls.adapter_enabled) blocked.add("adapter_enabled_unexpectedly");
      if (controls.invocation_mode !== "manual_only")
        blocked.add("manual_invocation_required");
      if (controls.fallback_enabled) blocked.add("fallback_enabled");
      if (controls.automatic_retries !== 0)
        blocked.add("automatic_retries_enabled");
      if (
        controls.required_dossier_hash !==
          proposal.readiness_binding.dossier_hash ||
        controls.required_evidence_pack_hash !==
          proposal.evidence_pack_binding.pack_hash
      )
        invalid.add("profile_evidence_binding_mismatch");
      if (
        controls.maximum_requests >
          proposal.sandbox_controls.maximum_requests ||
        controls.maximum_input_tokens_per_request >
          proposal.sandbox_controls.maximum_input_tokens_per_request ||
        controls.maximum_output_tokens_per_request >
          proposal.sandbox_controls.maximum_output_tokens_per_request ||
        Number(controls.maximum_total_spend_usd) >
          Number(proposal.sandbox_controls.maximum_total_spend_usd)
      )
        blocked.add("profile_budget_exceeds_proposal");
      if (
        !controls.exact_model_only ||
        controls.intended_upstream_provider_id !==
          proposal.candidate.intended_upstream_provider_id ||
        controls.provider_order.length !== 1 ||
        controls.provider_order[0] !==
          proposal.candidate.intended_upstream_provider_id ||
        !controls.require_parameters ||
        controls.data_collection !== "deny" ||
        !controls.zdr_required ||
        controls.exact_upstream_routing_status !==
          proposal.routing_constraints.exact_upstream_route_status
      )
        blocked.add("profile_routing_or_privacy_weakened");
    }
  }
  const model = dependencies.model_entries.find(
    (item) => item.entry_id === proposal.candidate.model_registry_entry_id,
  );
  const route = dependencies.routes.find(
    (item) => item.route_record_id === proposal.candidate.route_record_id,
  );
  if (!model || model.model_id !== proposal.candidate.openrouter_model_id)
    invalid.add("model_entry_identity_mismatch");
  else if (model.enabled) blocked.add("model_entry_enabled_unexpectedly");
  if (!route || route.route_id !== proposal.candidate.route_id)
    invalid.add("route_identity_mismatch");
  else {
    if (route.enabled) blocked.add("route_enabled_unexpectedly");
    if (route.allow_fallbacks || route.fallback_model_entry_order.length)
      blocked.add("route_fallback_enabled");
  }
  if (dependencies.adapter.enabled) blocked.add("adapter_enabled_unexpectedly");
  if (dependencies.adapter.retry_policy.max_retries !== 0)
    blocked.add("adapter_retries_enabled");

  const budget = proposal.sandbox_controls;
  const reviewed = dependencies.evidence_pack.sandbox_budget_proposal;
  if (
    !budget.metadata_only ||
    budget.maximum_requests < 1 ||
    budget.maximum_total_spend_usd === ""
  )
    invalid.add("unbounded_budget");
  if (
    budget.maximum_requests > reviewed.maximum_requests ||
    budget.maximum_input_tokens_per_request >
      reviewed.maximum_input_tokens_per_request ||
    budget.maximum_output_tokens_per_request >
      reviewed.maximum_output_tokens_per_request ||
    Number(budget.maximum_total_spend_usd) >
      Number(reviewed.maximum_total_sandbox_spend)
  )
    blocked.add("budget_exceeds_reviewed_ceiling");
  if (budget.invocation_mode !== "manual_only")
    blocked.add("manual_invocation_required");
  if (budget.fallback_enabled) blocked.add("fallback_enabled");
  if (budget.automatic_retries !== 0) blocked.add("automatic_retries_enabled");
  if (!budget.kill_switch_required) blocked.add("kill_switch_required");
  if (
    proposal.routing_constraints.provider_order.length !== 1 ||
    proposal.routing_constraints.provider_order[0] !==
      proposal.candidate.intended_upstream_provider_id ||
    proposal.routing_constraints.exact_upstream_route_status !== "verified"
  )
    blocked.add("exact_upstream_routing_unresolved");
  if (proposal.routing_constraints.allow_fallbacks)
    blocked.add("fallback_enabled");
  if (
    !proposal.privacy_requirements.zdr_required ||
    Object.values(proposal.privacy_requirements).some(
      (state) => state === "pending",
    )
  )
    blocked.add("privacy_zdr_unresolved");
  if (!proposal.review_requirements.evidence_verified)
    blocked.add("evidence_unverified");
  if (!proposal.review_requirements.pricing_bounded)
    blocked.add("pricing_unbounded_or_conflicting");
  if (!proposal.review_requirements.strict_structured_output_verified)
    blocked.add("structured_output_unverified");
  if (!proposal.review_requirements.capability_benchmark_approved)
    blocked.add("benchmark_or_gold_case_missing");
  if (proposal.review_requirements.legal_review !== "approved")
    blocked.add("legal_review_pending");
  if (proposal.review_requirements.security_review !== "approved")
    blocked.add("security_review_pending");

  const approval = approvalReasons(
    proposal,
    dependencies.approval,
    evaluatedAt,
  );
  if (dependencies.approval.status === "rejected")
    blocked.add("approval_rejected");
  if (
    proposal.lifecycle === "approved_for_sandbox_configuration" &&
    dependencies.approval.status !== "approved"
  )
    blocked.add("lifecycle_approval_mismatch");
  if (invalid.size)
    return deepFreeze({
      ...base,
      outcome: "invalid_proposal",
      reason_codes: [...invalid].sort(),
      configuration_authorized: false,
    });
  if (blocked.size)
    return deepFreeze({
      ...base,
      outcome: "blocked",
      reason_codes: [...new Set([...blocked, ...approval])].sort(),
      configuration_authorized: false,
    });
  return deepFreeze({
    ...base,
    outcome: approval.length
      ? "pending_human_review"
      : "eligible_for_configuration",
    reason_codes: approval.length ? [...approval].sort() : [],
    configuration_authorized: approval.length === 0,
  });
}

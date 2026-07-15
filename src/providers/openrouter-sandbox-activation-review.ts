import { createHash } from "node:crypto";

import pricingJson from "../../config/ai-pricing.json" with { type: "json" };
import proposalJson from "../../config/ai-openrouter-sandbox-enablement-proposal.json" with { type: "json" };
import reviewJson from "../../config/ai-openrouter-sandbox-activation-review.json" with { type: "json" };
import runtimeJson from "../../config/ai-openrouter-sandbox-runtime.json" with { type: "json" };
import zdrJson from "../../config/ai-zdr-evidence.json" with { type: "json" };
import { canonicalizeOpenRouterRegistryJson } from "./openrouter-registry.js";
import {
  computeOpenRouterFirstRunFixtureHash,
  computeOpenRouterSandboxGoldCaseHash,
  evaluateOpenRouterSandboxGoldCase,
  loadOpenRouterFirstRunFixture,
  loadOpenRouterSandboxGoldCase,
} from "./openrouter-sandbox-gold-case.js";
import {
  defaultOpenRouterSandboxProposalDependencies,
  evaluateOpenRouterSandboxEnablementProposal,
  type OpenRouterSandboxProposalDependencies,
} from "./openrouter-sandbox-enablement-proposal.js";

/**
 * Governed human-review contract for one OpenRouter sandbox activation.
 *
 * This module adds the review layer between the existing governed artifacts
 * (readiness dossier, external evidence pack, sandbox proposal, runtime
 * preflight metadata, synthetic gold case) and any future activation
 * configuration. It is pure and metadata-only: it never issues or consumes
 * authorization, never accesses a secret, never mutates a budget, never
 * touches the kill switch, and never invokes the gateway, adapter, harness,
 * or provider. Every outcome — including eligibility — reports execution,
 * secret access, and runtime enablement as false.
 *
 * Separation-of-duties rules (documented and enforced):
 *  1. The evidence reviewer and the sandbox activation approver must be
 *     different human identities (two independent judgments).
 *  2. Neither the evidence reviewer nor the activation approver may equal
 *     the artifact author (`created_by`): the system never self-reviews or
 *     self-approves.
 *  3. The kill-switch owner and the incident owner must each be different
 *     from the activation approver: the person able to stop or triage the
 *     run must be independent from the person who authorized it.
 *  4. The kill-switch owner and the incident owner MAY be the same person.
 *     Rationale: both are operational-response roles with aligned incentives
 *     (stop and investigate); requiring a fourth independent human adds no
 *     control value for a single bounded synthetic request, while the
 *     approver-independence rules above preserve two-person control.
 *  5. The gold-case acceptance reviewer may be the evidence reviewer but not
 *     the activation approver and not the artifact author.
 *  6. Every human role requires an explicit human-shaped identity; agent,
 *     bot, system, or pipeline identities are rejected.
 */

export const OPENROUTER_SANDBOX_ACTIVATION_REVIEW_CONTRACT_VERSION =
  "1.0.0" as const;
export const OPENROUTER_SANDBOX_ACTIVATION_REVIEW_HASH_DOMAIN =
  "vlatam-ai-lab:openrouter-sandbox-activation-review:v1" as const;
export const OPENROUTER_SANDBOX_RUNTIME_HASH_DOMAIN =
  "vlatam-ai-lab:openrouter-sandbox-runtime:v1" as const;
export const OPENROUTER_PRICING_POLICY_HASH_DOMAIN =
  "vlatam-ai-lab:openrouter-pricing-policy:v1" as const;
export const OPENROUTER_ZDR_EVIDENCE_HASH_DOMAIN =
  "vlatam-ai-lab:openrouter-zdr-evidence:v1" as const;

/** The only approval scope this contract can ever represent. */
export const OPENROUTER_SANDBOX_ACTIVATION_SCOPE =
  "one_synthetic_gold_case_sandbox_activation" as const;

export const OPENROUTER_SANDBOX_ACTIVATION_REVIEW_LIFECYCLES = [
  "pending",
  "approved",
  "rejected",
  "expired",
  "superseded",
] as const;
export type OpenRouterSandboxActivationReviewLifecycle =
  (typeof OPENROUTER_SANDBOX_ACTIVATION_REVIEW_LIFECYCLES)[number];

export type OpenRouterSandboxActivationReviewOutcome =
  | "invalid_review"
  | "blocked"
  | "pending_human_review"
  | "eligible_for_activation_configuration"
  | "expired"
  | "rejected";

export interface OpenRouterActivationArtifactBinding {
  readonly id: string;
  readonly version: string;
  readonly hash: string;
}

export interface OpenRouterActivationResolvableBinding {
  readonly status: "resolved" | "unresolved";
  readonly id: string | null;
  readonly hash: string | null;
}

export interface OpenRouterActivationHumanDecision {
  readonly status: "pending" | "approved" | "rejected";
  readonly reviewer_id: string | null;
  readonly reviewer_role: "evidence_reviewer" | "sandbox_activation_approver";
  readonly decision: "approve" | "reject" | null;
  readonly reason: string | null;
  readonly decided_at: string | null;
  readonly reviewed_hashes: {
    readonly dossier_hash: string | null;
    readonly evidence_pack_hash: string | null;
    readonly proposal_hash: string | null;
    readonly gold_case_hash: string | null;
    readonly runtime_configuration_hash: string | null;
  };
}

export interface OpenRouterActivationOwnership {
  readonly status: "unassigned" | "assigned";
  readonly identity: string | null;
  readonly role: "kill_switch_owner" | "incident_owner";
}

export interface OpenRouterSandboxActivationReview {
  readonly review_contract_version: typeof OPENROUTER_SANDBOX_ACTIVATION_REVIEW_CONTRACT_VERSION;
  readonly review_id: string;
  readonly review_version: string;
  readonly canonicalization_version: "registry-json-v1";
  readonly lifecycle: OpenRouterSandboxActivationReviewLifecycle;
  readonly scope: typeof OPENROUTER_SANDBOX_ACTIVATION_SCOPE;
  readonly created_by: string;
  readonly created_at: string;
  readonly expires_at: string;
  readonly superseded_by: string | null;
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
  readonly artifact_bindings: {
    readonly readiness_dossier: OpenRouterActivationArtifactBinding;
    readonly external_evidence_pack: OpenRouterActivationArtifactBinding;
    readonly sandbox_proposal: OpenRouterActivationArtifactBinding;
    readonly runtime_configuration: OpenRouterActivationArtifactBinding;
    readonly execution_profile: OpenRouterActivationArtifactBinding;
    readonly model_registry_entry: OpenRouterActivationArtifactBinding;
    readonly route_record: OpenRouterActivationArtifactBinding;
    readonly pricing_policy: OpenRouterActivationResolvableBinding;
    readonly privacy_zdr_evidence: OpenRouterActivationResolvableBinding;
    readonly gold_case: OpenRouterActivationArtifactBinding;
    readonly first_run_fixture: {
      readonly fixture_id: string;
      readonly fixture_hash: string;
      readonly classification: "synthetic";
    };
  };
  readonly ceilings: {
    readonly maximum_requests: 1;
    readonly maximum_input_tokens_per_request: number;
    readonly maximum_output_tokens_per_request: number;
    readonly timeout_ms: number;
    readonly automatic_retries: 0;
    readonly fallback_enabled: false;
    readonly maximum_total_spend_usd: string;
  };
  readonly routing_acknowledgment: {
    readonly exact_upstream_route_status: "unresolved" | "verified";
    readonly limitations_acknowledged: boolean;
  };
  readonly decisions: {
    readonly evidence_review: OpenRouterActivationHumanDecision;
    readonly activation_approval: OpenRouterActivationHumanDecision;
  };
  readonly operational_ownership: {
    readonly kill_switch_owner: OpenRouterActivationOwnership;
    readonly incident_owner: OpenRouterActivationOwnership;
  };
  readonly secret_management_plan: {
    readonly status: "defined";
    readonly reference: string;
    readonly storage: "local_environment_variable_at_final_boundary";
    readonly repository_storage_prohibited: true;
    readonly secret_reference_name: string;
  };
  readonly allowed_data: {
    readonly classification: "synthetic";
    readonly customer_data_allowed: false;
    readonly personal_data_allowed: false;
    readonly production_documents_allowed: false;
  };
  readonly downstream_restrictions: {
    readonly legal_reliance_allowed: false;
    readonly automatic_downstream_publication_allowed: false;
    readonly human_review_required: true;
    readonly outputs_classification: "experimental";
  };
  readonly execution_authorized: false;
  readonly secret_access_allowed: false;
  readonly runtime_enabled: false;
  readonly provider_call_performed: false;
  readonly review_hash: string;
}

export interface OpenRouterSandboxActivationReviewDependencies {
  readonly proposal: unknown;
  readonly proposal_dependencies: OpenRouterSandboxProposalDependencies;
  readonly runtime: unknown;
  readonly pricing: unknown;
  readonly zdr_evidence: unknown;
  readonly gold_case: unknown;
  readonly first_run_fixture: unknown;
}

export interface OpenRouterSandboxActivationReviewEvaluation {
  readonly contract_version: typeof OPENROUTER_SANDBOX_ACTIVATION_REVIEW_CONTRACT_VERSION;
  readonly review_id: string | null;
  readonly evaluated_at: string;
  readonly outcome: OpenRouterSandboxActivationReviewOutcome;
  readonly reason_codes: readonly string[];
  readonly pending_human_decisions: readonly string[];
  readonly activation_configuration_authorized: boolean;
  readonly execution_authorized: false;
  readonly provider_call_performed: false;
  readonly secret_access_allowed: false;
  readonly runtime_enabled: false;
}

const ID = /^[a-z0-9][a-z0-9._:-]+$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const HASH = /^[a-f0-9]{64}$/;
/** Human identities: lowercase person-shaped slugs, e.g. `maria.gomez`. */
const HUMAN_ID = /^[a-z][a-z0-9._-]{2,63}$/;
/** Identity segments that denote automation and can never hold a human role. */
const NON_HUMAN_SEGMENT =
  /(^|[._-])(agent|bot|system|automation|pipeline|repository|service|model|assistant|llm|codex|claude|ci|cron)([._-]|$)/;

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

function domainHash(domain: string, value: unknown): string {
  return createHash("sha256")
    .update(domain)
    .update("\n")
    .update(canonicalizeOpenRouterRegistryJson(value))
    .digest("hex");
}

export function computeOpenRouterSandboxActivationReviewHash(
  value: unknown,
): string {
  const normalized = isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).filter(([key]) => key !== "review_hash"),
      )
    : value;
  return domainHash(
    OPENROUTER_SANDBOX_ACTIVATION_REVIEW_HASH_DOMAIN,
    normalized,
  );
}

export function computeOpenRouterSandboxRuntimeHash(value: unknown): string {
  return domainHash(OPENROUTER_SANDBOX_RUNTIME_HASH_DOMAIN, value);
}

export function computeOpenRouterPricingPolicyHash(value: unknown): string {
  return domainHash(OPENROUTER_PRICING_POLICY_HASH_DOMAIN, value);
}

export function computeOpenRouterZdrEvidenceHash(value: unknown): string {
  return domainHash(OPENROUTER_ZDR_EVIDENCE_HASH_DOMAIN, value);
}

export function loadOpenRouterSandboxActivationReview(): OpenRouterSandboxActivationReview {
  return structuredClone(reviewJson) as OpenRouterSandboxActivationReview;
}

export function defaultOpenRouterSandboxActivationReviewDependencies(): OpenRouterSandboxActivationReviewDependencies {
  return {
    proposal: structuredClone(proposalJson),
    proposal_dependencies: defaultOpenRouterSandboxProposalDependencies(),
    runtime: structuredClone(runtimeJson),
    pricing: structuredClone(pricingJson),
    zdr_evidence: structuredClone(zdrJson),
    gold_case: loadOpenRouterSandboxGoldCase(),
    first_run_fixture: loadOpenRouterFirstRunFixture(),
  };
}

function humanIdentityReasons(
  identity: unknown,
  role: string,
): readonly string[] {
  if (typeof identity !== "string" || !HUMAN_ID.test(identity))
    return [`${role}_identity_malformed`];
  if (NON_HUMAN_SEGMENT.test(identity))
    return [`${role}_non_human_identity_forbidden`];
  return [];
}

function decisionReasons(
  name: string,
  decision: OpenRouterActivationHumanDecision,
  review: OpenRouterSandboxActivationReview,
  runtimeHash: string,
  goldCaseHash: string,
  evaluatedAt: Date,
): { invalid: readonly string[]; pending: readonly string[] } {
  const invalid: string[] = [];
  const pending: string[] = [];
  if (!["pending", "approved", "rejected"].includes(decision.status)) {
    invalid.push(`${name}_status_invalid`);
    return { invalid, pending };
  }
  if (decision.status === "pending") {
    if (
      decision.reviewer_id !== null ||
      decision.decision !== null ||
      decision.decided_at !== null
    )
      invalid.push(`${name}_pending_with_decision_data`);
    pending.push(`${name}_pending`);
    return { invalid, pending };
  }
  invalid.push(...humanIdentityReasons(decision.reviewer_id, name));
  if (
    (decision.status === "approved") !== (decision.decision === "approve") ||
    (decision.status === "rejected") !== (decision.decision === "reject")
  )
    invalid.push(`${name}_decision_status_mismatch`);
  if (typeof decision.reason !== "string" || decision.reason.trim().length < 8)
    invalid.push(`${name}_reason_missing`);
  if (
    !validInstant(decision.decided_at) ||
    Date.parse(decision.decided_at as string) > evaluatedAt.getTime()
  )
    invalid.push(`${name}_timestamp_invalid`);
  const reviewed = decision.reviewed_hashes;
  if (
    !isRecord(reviewed) ||
    reviewed.dossier_hash !== review.artifact_bindings.readiness_dossier.hash ||
    reviewed.evidence_pack_hash !==
      review.artifact_bindings.external_evidence_pack.hash ||
    reviewed.proposal_hash !== review.artifact_bindings.sandbox_proposal.hash ||
    reviewed.gold_case_hash !== goldCaseHash ||
    reviewed.runtime_configuration_hash !== runtimeHash
  )
    invalid.push(`${name}_reviewed_hashes_mismatch`);
  return { invalid, pending };
}

export function evaluateOpenRouterSandboxActivationReview(
  value: unknown,
  evaluatedAt: Date,
  dependencies = defaultOpenRouterSandboxActivationReviewDependencies(),
): OpenRouterSandboxActivationReviewEvaluation {
  const invalid = new Set<string>();
  const blocked = new Set<string>();
  const pendingHuman = new Set<string>();
  const safe = isRecord(value) ? value : {};
  const base = {
    contract_version: OPENROUTER_SANDBOX_ACTIVATION_REVIEW_CONTRACT_VERSION,
    review_id: typeof safe["review_id"] === "string" ? safe["review_id"] : null,
    evaluated_at: evaluatedAt.toISOString(),
    execution_authorized: false as const,
    provider_call_performed: false as const,
    secret_access_allowed: false as const,
    runtime_enabled: false as const,
  };
  const finish = (
    outcome: OpenRouterSandboxActivationReviewOutcome,
    reasons: ReadonlySet<string>,
  ): OpenRouterSandboxActivationReviewEvaluation =>
    deepFreeze({
      ...base,
      outcome,
      reason_codes: [...reasons].sort(),
      pending_human_decisions: [...pendingHuman].sort(),
      activation_configuration_authorized:
        outcome === "eligible_for_activation_configuration",
    });

  if (!isRecord(value)) {
    invalid.add("review_not_object");
    return finish("invalid_review", invalid);
  }
  if (
    value["review_contract_version"] !==
    OPENROUTER_SANDBOX_ACTIVATION_REVIEW_CONTRACT_VERSION
  )
    invalid.add("unsupported_contract_version");
  if (!ID.test(String(value["review_id"] ?? "")))
    invalid.add("invalid_review_id");
  if (!SEMVER.test(String(value["review_version"] ?? "")))
    invalid.add("invalid_review_version");
  if (value["canonicalization_version"] !== "registry-json-v1")
    invalid.add("unsupported_canonicalization");
  if (
    !OPENROUTER_SANDBOX_ACTIVATION_REVIEW_LIFECYCLES.includes(
      value["lifecycle"] as OpenRouterSandboxActivationReviewLifecycle,
    )
  )
    invalid.add("invalid_lifecycle");
  // The exact bounded scope is the only representable approval scope. Any
  // broader scope (provider-wide, production, recurring, autonomous,
  // customer-data, unrestricted) is rejected outright.
  if (value["scope"] !== OPENROUTER_SANDBOX_ACTIVATION_SCOPE)
    invalid.add("approval_scope_forbidden");
  if (!validInstant(value["created_at"])) invalid.add("invalid_created_at");
  if (!validInstant(value["expires_at"])) invalid.add("invalid_expiry");
  if (!HASH.test(String(value["review_hash"] ?? "")))
    invalid.add("invalid_review_hash_shape");
  else if (
    computeOpenRouterSandboxActivationReviewHash(value) !== value["review_hash"]
  )
    invalid.add("review_hash_mismatch");
  for (const forbidden of [
    "execution_authorized",
    "secret_access_allowed",
    "runtime_enabled",
    "provider_call_performed",
  ])
    if (value[forbidden] !== false) invalid.add(`${forbidden}_forbidden`);
  for (const key of [
    "candidate",
    "artifact_bindings",
    "ceilings",
    "routing_acknowledgment",
    "decisions",
    "operational_ownership",
    "secret_management_plan",
    "allowed_data",
    "downstream_restrictions",
  ])
    if (!isRecord(value[key])) invalid.add(`${key}_missing`);
  if (invalid.size) return finish("invalid_review", invalid);

  const review = value as unknown as OpenRouterSandboxActivationReview;
  const deps = dependencies;
  const proposalDeps = deps.proposal_dependencies;
  const proposal = isRecord(deps.proposal) ? deps.proposal : {};
  const runtime = isRecord(deps.runtime) ? deps.runtime : {};
  const runtimeHash = computeOpenRouterSandboxRuntimeHash(deps.runtime);

  // Candidate identity must match the dossier's exact candidate path; the
  // review never introduces provider or model identity of its own.
  const path = proposalDeps.dossier.candidate_path;
  if (
    review.candidate.provider_id !== path.provider_id ||
    review.candidate.openrouter_model_id !== path.openrouter_model_id ||
    review.candidate.intended_upstream_provider_id !==
      path.upstream_provider_id ||
    review.candidate.upstream_model_id !== path.upstream_model_id ||
    review.candidate.model_registry_entry_id !== path.model_registry_entry_id ||
    review.candidate.route_id !== path.route_id ||
    review.candidate.route_record_id !== path.route_record_id ||
    review.candidate.capability_id !== path.capability_id ||
    review.candidate.execution_profile_id !==
      path.execution_profile_candidate_id ||
    review.candidate.execution_profile_contract_version !==
      path.execution_profile_contract_version
  )
    invalid.add("candidate_identity_mismatch");

  const bindings = review.artifact_bindings;
  const bind = (
    name: string,
    binding: OpenRouterActivationArtifactBinding,
    expected: { id: string; version: string; hash: string },
  ): void => {
    if (
      !isRecord(binding) ||
      binding.id !== expected.id ||
      binding.version !== expected.version ||
      binding.hash !== expected.hash
    )
      invalid.add(`${name}_binding_mismatch`);
  };
  bind("readiness_dossier", bindings.readiness_dossier, {
    id: proposalDeps.dossier.dossier_id,
    version: proposalDeps.dossier.dossier_version,
    hash: proposalDeps.dossier.dossier_hash,
  });
  bind("external_evidence_pack", bindings.external_evidence_pack, {
    id: proposalDeps.evidence_pack.pack_id,
    version: proposalDeps.evidence_pack.pack_version,
    hash: proposalDeps.evidence_pack.pack_hash,
  });
  bind("sandbox_proposal", bindings.sandbox_proposal, {
    id: String(proposal["proposal_id"] ?? ""),
    version: String(proposal["proposal_version"] ?? ""),
    hash: String(proposal["proposal_hash"] ?? ""),
  });
  bind("runtime_configuration", bindings.runtime_configuration, {
    id: String(runtime["configuration_id"] ?? ""),
    version: String(runtime["runtime_contract_version"] ?? ""),
    hash: runtimeHash,
  });
  const runtimeBindings = isRecord(runtime["bindings"])
    ? runtime["bindings"]
    : {};
  const profile = proposalDeps.profiles.find(
    (entry) => entry.profile_id === review.candidate.execution_profile_id,
  ) as Record<string, unknown> | undefined;
  bind("execution_profile", bindings.execution_profile, {
    id: review.candidate.execution_profile_id,
    version: String(profile?.["contract_version"] ?? ""),
    hash: String(runtimeBindings["profile_hash"] ?? ""),
  });
  const model = proposalDeps.model_entries.find(
    (entry) => entry.entry_id === review.candidate.model_registry_entry_id,
  ) as Record<string, unknown> | undefined;
  bind("model_registry_entry", bindings.model_registry_entry, {
    id: String(model?.["entry_id"] ?? ""),
    version: String(model?.["entry_version"] ?? ""),
    hash: String(model?.["entry_hash"] ?? ""),
  });
  const route = proposalDeps.routes.find(
    (entry) => entry.route_record_id === review.candidate.route_record_id,
  ) as Record<string, unknown> | undefined;
  bind("route_record", bindings.route_record, {
    id: String(route?.["route_record_id"] ?? ""),
    version: String(route?.["route_version"] ?? ""),
    hash: String(route?.["route_hash"] ?? ""),
  });

  // Pricing must resolve to one exact governed policy for the candidate.
  const pricingBinding = bindings.pricing_policy;
  if (
    !isRecord(pricingBinding) ||
    !["resolved", "unresolved"].includes(String(pricingBinding.status))
  )
    invalid.add("pricing_policy_status_invalid");
  else if (pricingBinding.status === "unresolved")
    blocked.add("pricing_policy_unresolved");
  else {
    const prices =
      isRecord(deps.pricing) && Array.isArray(deps.pricing["prices"])
        ? deps.pricing["prices"].filter(isRecord)
        : [];
    const policy = prices.find(
      (entry) => entry["pricing_id"] === pricingBinding.id,
    );
    if (
      !policy ||
      policy["provider_id"] !== review.candidate.provider_id ||
      policy["model_id"] !== review.candidate.openrouter_model_id
    )
      blocked.add("pricing_policy_identity_mismatch");
    else if (computeOpenRouterPricingPolicyHash(policy) !== pricingBinding.hash)
      invalid.add("pricing_policy_hash_mismatch");
  }

  // Privacy/ZDR must resolve to reviewed evidence in the governed store.
  const zdrBinding = bindings.privacy_zdr_evidence;
  if (
    !isRecord(zdrBinding) ||
    !["resolved", "unresolved"].includes(String(zdrBinding.status))
  )
    invalid.add("privacy_zdr_evidence_status_invalid");
  else if (zdrBinding.status === "unresolved")
    blocked.add("privacy_zdr_evidence_unresolved");
  else {
    const records =
      isRecord(deps.zdr_evidence) &&
      Array.isArray(deps.zdr_evidence["evidence"])
        ? deps.zdr_evidence["evidence"].filter(isRecord)
        : [];
    const record = records.find(
      (entry) => entry["evidence_id"] === zdrBinding.id,
    );
    if (!record || record["provider_id"] !== review.candidate.provider_id)
      blocked.add("privacy_zdr_evidence_identity_mismatch");
    else if (computeOpenRouterZdrEvidenceHash(record) !== zdrBinding.hash)
      invalid.add("privacy_zdr_evidence_hash_mismatch");
  }

  // Gold case: contract validity, binding integrity, and human acceptance.
  const goldEvaluation = evaluateOpenRouterSandboxGoldCase(
    deps.gold_case,
    evaluatedAt,
    deps.first_run_fixture,
  );
  const goldCase = isRecord(deps.gold_case) ? deps.gold_case : {};
  const goldCaseHash = String(goldCase["gold_case_hash"] ?? "");
  if (goldEvaluation.outcome === "invalid_gold_case")
    blocked.add("gold_case_invalid");
  else if (goldEvaluation.outcome === "rejected")
    blocked.add("gold_case_rejected");
  else if (goldEvaluation.outcome === "prepared_pending_acceptance")
    pendingHuman.add("gold_case_acceptance_pending");
  bind("gold_case", bindings.gold_case, {
    id: String(goldCase["gold_case_id"] ?? ""),
    version: String(goldCase["gold_case_version"] ?? ""),
    hash:
      HASH.test(goldCaseHash) &&
      computeOpenRouterSandboxGoldCaseHash(goldCase) === goldCaseHash
        ? goldCaseHash
        : "",
  });

  const fixture = isRecord(deps.first_run_fixture)
    ? deps.first_run_fixture
    : {};
  const fixtureBinding = bindings.first_run_fixture;
  if (
    !isRecord(fixtureBinding) ||
    fixtureBinding.fixture_id !== fixture["fixture_id"] ||
    fixtureBinding.fixture_hash !==
      computeOpenRouterFirstRunFixtureHash(deps.first_run_fixture)
  )
    invalid.add("first_run_fixture_binding_mismatch");
  if (
    !isRecord(fixtureBinding) ||
    fixtureBinding.classification !== "synthetic" ||
    fixture["classification"] !== "synthetic"
  )
    blocked.add("first_run_data_not_synthetic");

  // Governed proposal outcome is reused, never recalculated differently.
  const proposalEvaluation = evaluateOpenRouterSandboxEnablementProposal(
    deps.proposal,
    evaluatedAt,
    proposalDeps,
  );
  if (proposalEvaluation.outcome === "invalid_proposal")
    blocked.add("sandbox_proposal_invalid");
  else if (proposalEvaluation.outcome === "blocked")
    blocked.add("sandbox_proposal_blocked");
  else if (proposalEvaluation.outcome === "pending_human_review")
    pendingHuman.add("sandbox_proposal_approval_pending");

  // Ceilings: exactly one manual request, never above proposal ceilings.
  const ceilings = review.ceilings;
  const controls = isRecord(proposal["sandbox_controls"])
    ? proposal["sandbox_controls"]
    : {};
  if (ceilings.maximum_requests !== 1)
    blocked.add("request_ceiling_not_single_call");
  if (
    !Number.isSafeInteger(ceilings.maximum_input_tokens_per_request) ||
    ceilings.maximum_input_tokens_per_request < 1 ||
    ceilings.maximum_input_tokens_per_request >
      Number(controls["maximum_input_tokens_per_request"] ?? 0) ||
    !Number.isSafeInteger(ceilings.maximum_output_tokens_per_request) ||
    ceilings.maximum_output_tokens_per_request < 1 ||
    ceilings.maximum_output_tokens_per_request >
      Number(controls["maximum_output_tokens_per_request"] ?? 0)
  )
    blocked.add("token_ceiling_exceeds_proposal");
  if (
    !Number.isSafeInteger(ceilings.timeout_ms) ||
    ceilings.timeout_ms < 1 ||
    ceilings.timeout_ms > 10_000
  )
    blocked.add("timeout_ceiling_invalid");
  if (ceilings.automatic_retries !== 0) blocked.add("retry_policy_weakened");
  if (ceilings.fallback_enabled !== false)
    blocked.add("fallback_policy_weakened");
  if (
    !/^\d+\.\d{2}$/.test(String(ceilings.maximum_total_spend_usd)) ||
    Number(ceilings.maximum_total_spend_usd) <= 0 ||
    Number(ceilings.maximum_total_spend_usd) >
      Number(controls["maximum_total_spend_usd"] ?? 0)
  )
    blocked.add("spend_ceiling_exceeds_proposal");

  // Exact-routing limitation must be acknowledged against the proposal's
  // declared status; acknowledgment is a human act and stays honest.
  const routing = review.routing_acknowledgment;
  const proposalRouting = isRecord(proposal["routing_constraints"])
    ? proposal["routing_constraints"]
    : {};
  if (
    routing.exact_upstream_route_status !==
    proposalRouting["exact_upstream_route_status"]
  )
    invalid.add("routing_acknowledgment_mismatch");
  if (routing.limitations_acknowledged !== true)
    pendingHuman.add("exact_routing_limitation_unacknowledged");

  // No execution component may already be enabled before eligibility.
  if (proposalDeps.adapter.enabled)
    blocked.add("adapter_enabled_before_eligibility");
  if (proposalDeps.adapter.retry_policy.max_retries !== 0)
    blocked.add("retry_policy_weakened");
  const modelEnabled = model?.["enabled"] === true;
  const routeEnabled = route?.["enabled"] === true;
  const profileEnabled = profile?.["enabled"] === true;
  if (modelEnabled) blocked.add("model_enabled_before_eligibility");
  if (routeEnabled) blocked.add("route_enabled_before_eligibility");
  if (profileEnabled) blocked.add("profile_enabled_before_eligibility");
  if (runtime["budget_enabled"] === true)
    blocked.add("live_budget_enabled_before_eligibility");
  if (isRecord(runtime["adapter"]) && runtime["adapter"]["enabled"] === true)
    blocked.add("adapter_enabled_before_eligibility");
  if (
    !isRecord(runtime["kill_switch"]) ||
    runtime["kill_switch"]["active"] !== true
  )
    blocked.add("kill_switch_not_active");

  // Secret handling must be defined and never repository-based.
  const secretPlan = review.secret_management_plan;
  if (
    !isRecord(secretPlan) ||
    secretPlan.status !== "defined" ||
    secretPlan.storage !== "local_environment_variable_at_final_boundary" ||
    secretPlan.repository_storage_prohibited !== true ||
    typeof secretPlan.reference !== "string" ||
    secretPlan.reference.trim().length === 0 ||
    secretPlan.secret_reference_name !== runtime["secret_reference_name"]
  )
    blocked.add("secret_plan_undefined_or_repository_based");

  // First-run data classification and downstream restrictions are fixed.
  const allowed = review.allowed_data;
  if (
    !isRecord(allowed) ||
    allowed.classification !== "synthetic" ||
    allowed.customer_data_allowed !== false ||
    allowed.personal_data_allowed !== false ||
    allowed.production_documents_allowed !== false
  )
    blocked.add("first_run_data_not_synthetic");
  const downstream = review.downstream_restrictions;
  if (
    !isRecord(downstream) ||
    downstream.legal_reliance_allowed !== false ||
    downstream.automatic_downstream_publication_allowed !== false ||
    downstream.human_review_required !== true ||
    downstream.outputs_classification !== "experimental"
  )
    blocked.add("downstream_restrictions_weakened");

  // Human decisions and separation of duties.
  if (
    !isRecord(review.decisions.evidence_review) ||
    !isRecord(review.decisions.activation_approval)
  ) {
    invalid.add("decisions_missing");
    return finish("invalid_review", invalid);
  }
  const evidenceDecision = review.decisions.evidence_review;
  const approvalDecision = review.decisions.activation_approval;
  if (evidenceDecision.reviewer_role !== "evidence_reviewer")
    invalid.add("evidence_review_role_mismatch");
  if (approvalDecision.reviewer_role !== "sandbox_activation_approver")
    invalid.add("activation_approval_role_mismatch");
  const evidenceResult = decisionReasons(
    "evidence_review",
    evidenceDecision,
    review,
    runtimeHash,
    goldCaseHash,
    evaluatedAt,
  );
  const approvalResult = decisionReasons(
    "activation_approval",
    approvalDecision,
    review,
    runtimeHash,
    goldCaseHash,
    evaluatedAt,
  );
  for (const reason of [...evidenceResult.invalid, ...approvalResult.invalid])
    invalid.add(reason);
  for (const reason of [...evidenceResult.pending, ...approvalResult.pending])
    pendingHuman.add(reason);
  if (
    approvalDecision.status === "approved" &&
    evidenceDecision.status !== "approved"
  )
    invalid.add("approval_before_evidence_review_forbidden");

  const reviewerId = evidenceDecision.reviewer_id;
  const approverId = approvalDecision.reviewer_id;
  if (reviewerId !== null && reviewerId === review.created_by)
    invalid.add("self_review_forbidden");
  if (approverId !== null && approverId === review.created_by)
    invalid.add("self_approval_forbidden");
  if (reviewerId !== null && approverId !== null && reviewerId === approverId)
    invalid.add("reviewer_independence_violation");

  const killSwitchOwner = review.operational_ownership.kill_switch_owner;
  const incidentOwner = review.operational_ownership.incident_owner;
  const ownership = (
    owner: OpenRouterActivationOwnership,
    role: "kill_switch_owner" | "incident_owner",
  ): void => {
    if (!isRecord(owner) || owner.role !== role) {
      invalid.add(`${role}_role_mismatch`);
      return;
    }
    if (owner.status !== "assigned" && owner.status !== "unassigned") {
      invalid.add(`${role}_status_invalid`);
      return;
    }
    if (owner.status === "unassigned") {
      if (owner.identity !== null)
        invalid.add(`${role}_unassigned_with_identity`);
      pendingHuman.add(`${role}_unassigned`);
      return;
    }
    for (const reason of humanIdentityReasons(owner.identity, role))
      invalid.add(reason);
    if (owner.identity === review.created_by)
      invalid.add(`${role}_system_ownership_forbidden`);
    if (approverId !== null && owner.identity === approverId)
      invalid.add(`${role}_approver_overlap_forbidden`);
  };
  ownership(killSwitchOwner, "kill_switch_owner");
  ownership(incidentOwner, "incident_owner");

  const goldAcceptance = isRecord(goldCase["human_acceptance"])
    ? goldCase["human_acceptance"]
    : {};
  if (
    typeof goldAcceptance["reviewer_id"] === "string" &&
    (goldAcceptance["reviewer_id"] === review.created_by ||
      (approverId !== null && goldAcceptance["reviewer_id"] === approverId))
  )
    invalid.add("gold_case_acceptance_overlap_forbidden");

  // Lifecycle consistency with the recorded decisions.
  if (review.lifecycle === "approved" && approvalDecision.status !== "approved")
    invalid.add("lifecycle_decision_mismatch");
  if (
    review.lifecycle === "pending" &&
    (approvalDecision.status === "approved" ||
      approvalDecision.status === "rejected")
  )
    invalid.add("lifecycle_decision_mismatch");
  if (review.lifecycle === "superseded" && review.superseded_by === null)
    invalid.add("superseded_without_successor");
  if (review.lifecycle !== "superseded" && review.superseded_by !== null)
    invalid.add("successor_without_superseded_lifecycle");

  if (invalid.size) return finish("invalid_review", invalid);
  if (
    review.lifecycle === "rejected" ||
    approvalDecision.status === "rejected" ||
    evidenceDecision.status === "rejected"
  )
    return finish("rejected", new Set(["review_rejected"]));
  if (
    review.lifecycle === "expired" ||
    Date.parse(review.expires_at) <= evaluatedAt.getTime()
  )
    return finish("expired", new Set(["review_expired"]));
  if (review.lifecycle === "superseded") {
    blocked.add("review_superseded");
    return finish("blocked", blocked);
  }
  if (blocked.size) return finish("blocked", blocked);
  if (pendingHuman.size) return finish("pending_human_review", pendingHuman);
  return finish("eligible_for_activation_configuration", new Set());
}

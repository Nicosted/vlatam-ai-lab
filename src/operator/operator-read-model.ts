import { createHash } from "node:crypto";

import { canonicalizeOpenRouterRegistryJson } from "../providers/openrouter-registry.js";
import type { TournamentOperatorReadModel } from "../tournament/index.js";

export const OPERATOR_READ_MODEL_CONTRACT_VERSION = "1.6.0" as const;
export const OPERATOR_READ_MODEL_HASH_DOMAIN =
  "vlatam-ai-lab:operator-read-model:v1" as const;

export type OperatorOverallStatus =
  | "healthy"
  | "attention_required"
  | "blocked"
  | "invalid_state";
export type OperatorSecretStatus =
  | "not_configured"
  | "configured_unknown"
  | "not_required";
export type OperatorKillSwitchStatus =
  | "active"
  | "inactive"
  | "missing"
  | "unknown";
export type OperatorResolutionKind =
  | "code_change"
  | "evidence_review"
  | "legal_review"
  | "security_review"
  | "human_approval"
  | "runtime_configuration"
  | "external_account_configuration";

export interface OperatorEvaluatorResult {
  readonly outcome: string;
  readonly reason_codes: readonly string[];
  readonly source_artifact_id: string | null;
  readonly source_artifact_hash: string | null;
}

export interface OperatorGovernedCandidate {
  readonly candidate_id: string;
  readonly model: { readonly id: string; readonly enabled: boolean };
  readonly route: { readonly id: string; readonly enabled: boolean };
  readonly profile: {
    readonly id: string;
    readonly enabled: boolean;
    readonly hash: string | null;
  };
  readonly readiness: string;
  readonly evidence: string;
  readonly proposal: string;
  readonly runtime_preflight: string;
  readonly activation_review: string;
  readonly authorization: string;
  readonly consumption: string;
  readonly adapter_gateway_transport_state: {
    readonly adapter: string;
    readonly gateway: string;
    readonly transport: string;
  };
  readonly blockers: readonly string[];
  readonly blocker_count: number;
  readonly next_governed_action: string;
  readonly conformance?: {
    readonly status: "prepared_not_executed" | "passed" | "failed" | "blocked";
    readonly cases_attempted: number;
    readonly cases_passed: number;
    readonly schema_pass_rate: string | null;
    readonly provider_routing_match:
      | "not_attempted"
      | "matched"
      | "mismatched"
      | "unavailable";
    readonly zdr_evidence_status:
      | "metadata_only_runtime_pending"
      | "runtime_complete"
      | "runtime_incomplete";
    readonly budget_reconciliation:
      | "not_attempted"
      | "reconciled"
      | "discrepant"
      | "incomplete";
    readonly retries: number;
    readonly duplicate_consumption_result: "not_attempted" | "safe" | "unsafe";
    readonly blockers: readonly string[];
    readonly independent_review_required: true;
    readonly activation_prohibited: true;
    readonly kill_switch_state: "active";
  };
}

export interface OperatorReadModelInput {
  readonly evaluated_at: string;
  readonly source_valid: boolean;
  readonly source_errors: readonly string[];
  readonly provider: {
    readonly provider_id: string;
    readonly display_name: string | null;
    readonly adapter_identity: string;
    readonly adapter_version: string;
    readonly adapter_hash: string;
    readonly adapter_enabled: boolean;
    readonly live_traffic_permitted: boolean;
    readonly secret_status: OperatorSecretStatus;
    readonly kill_switch_status: OperatorKillSwitchStatus;
    readonly evidence_paths: readonly string[];
  };
  readonly models: readonly {
    readonly entry_id: string;
    readonly version: string;
    readonly model_id: string;
    readonly hash: string;
    readonly enabled: boolean;
    readonly lifecycle: string;
  }[];
  readonly routes: readonly {
    readonly record_id: string;
    readonly route_id: string;
    readonly version: string;
    readonly model_id: string;
    readonly hash: string;
    readonly enabled: boolean;
    readonly executable_profile_ids: readonly string[];
    readonly lifecycle: string;
  }[];
  readonly execution_profiles: readonly {
    readonly profile_id: string;
    readonly version: string;
    readonly model_id: string;
    readonly enabled: boolean;
    readonly lifecycle: string;
    readonly hash: string | null;
  }[];
  readonly readiness: OperatorEvaluatorResult;
  readonly evidence: OperatorEvaluatorResult & {
    readonly review_status: "pending" | "approved" | "rejected";
  };
  readonly proposal: OperatorEvaluatorResult & {
    readonly version: string | null;
    readonly approval_status: "pending" | "approved" | "rejected";
  };
  readonly preflight: OperatorEvaluatorResult & {
    readonly runtime_config_id: string | null;
    readonly runtime_config_version: string | null;
    readonly runtime_config_hash: string | null;
  };
  readonly activation_review: OperatorEvaluatorResult & {
    readonly version: string | null;
    readonly lifecycle: string;
    readonly scope: string;
    readonly expires_at: string | null;
    readonly pending_human_decisions: readonly string[];
    readonly evidence_review_status: "pending" | "approved" | "rejected";
    readonly activation_approval_status: "pending" | "approved" | "rejected";
    readonly kill_switch_owner_status: "unassigned" | "assigned";
    readonly incident_owner_status: "unassigned" | "assigned";
    readonly allowed_data_classification: string | null;
    readonly ceilings: {
      readonly maximum_requests: number | null;
      readonly maximum_input_tokens_per_request: number | null;
      readonly maximum_output_tokens_per_request: number | null;
      readonly timeout_ms: number | null;
      readonly automatic_retries: number | null;
      readonly fallback_enabled: boolean | null;
      readonly maximum_total_spend_usd: string | null;
    };
    readonly bound_artifacts: readonly {
      readonly name: string;
      readonly id: string | null;
      readonly version: string | null;
      readonly hash: string | null;
      readonly status: string | null;
    }[];
  };
  readonly gold_case: OperatorEvaluatorResult & {
    readonly version: string | null;
    readonly capability_id: string | null;
    readonly campaign_status: string | null;
    readonly acceptance_status: string | null;
  };
  readonly authorization: {
    readonly status:
      | "no_policy_issued"
      | "policy_issued"
      | "authorization_pending"
      | "authorization_consumed"
      | "execution_blocked_after_consumption";
    readonly exact_policy_hash: string | null;
    readonly issued_count: number;
    readonly pending_count: number;
  };
  readonly consumption: {
    readonly status: "not_attempted" | "consumed" | "rejected";
    readonly attempted_count: number;
    readonly consumed_count: number;
  };
  readonly gateway: {
    readonly binding_status: "not_invoked" | "blocked" | "available";
    readonly adapter_status: "enabled" | "disabled";
    readonly transport_invoked: false;
    readonly gateway_invoked: false;
  };
  readonly budget: {
    readonly status: "enabled" | "disabled" | "unavailable";
    readonly maximum_requests: number | null;
    readonly maximum_total_spend_usd: string | null;
  };
  readonly validation_metadata: {
    readonly dossier_version: string | null;
    readonly evidence_pack_version: string | null;
    readonly profile_contract_version: string | null;
    readonly test_totals: {
      readonly tests: number;
      readonly suites: number;
    } | null;
  };
  readonly audit_references: readonly string[];
  readonly arca_candidate_review?: OperatorArcaCandidateReview;
  readonly arca_approved_artifact?: OperatorApprovedArcaArtifact;
  readonly additional_governed_candidates?: readonly OperatorGovernedCandidate[];
  readonly tournament?: TournamentOperatorReadModel;
}

export interface OperatorArcaCandidateReview {
  readonly candidate_artifact_id: string | null;
  readonly candidate_sha256: string | null;
  readonly review_lifecycle: string;
  readonly evaluation_outcome: string;
  readonly reviewer_present: boolean;
  readonly expires_at: string | null;
  readonly unresolved_findings_count: number;
  readonly eligible_for_approved_artifact_building: boolean;
  readonly export_authorized: false;
  readonly publication_authorized: false;
}

export interface OperatorApprovedArcaArtifact {
  readonly present: boolean;
  readonly approved_artifact_id: string | null;
  readonly approved_artifact_sha256: string | null;
  readonly candidate_artifact_id: string | null;
  readonly candidate_sha256: string | null;
  readonly review_id: string | null;
  readonly review_sha256: string | null;
  readonly evaluation_id: string | null;
  readonly evaluation_sha256: string | null;
  readonly builder_identity: string | null;
  readonly build_timestamp: string | null;
  readonly export_status: "not_exported";
  readonly publication_status: "not_published";
  readonly production_reliance: "not_authorized";
  readonly export_authorized: false;
  readonly publication_authorized: false;
  readonly production_reliance_authorized: false;
  readonly database_write_authorized: false;
  readonly network_call_authorized: false;
  readonly vlatam_global_access_authorized: false;
}

export interface OperatorBlocker {
  readonly blocker_code: string;
  readonly severity: "critical" | "high" | "medium" | "low";
  readonly category: string;
  readonly provider_id: string | null;
  readonly candidate_id: string | null;
  readonly summary: string;
  readonly source_evaluator: string;
  readonly source_artifact_id: string | null;
  readonly source_artifact_hash: string | null;
  readonly resolvable_by: readonly OperatorResolutionKind[];
  readonly blocking_execution: boolean;
}

export interface OperatorRequiredAction {
  readonly action_code: string;
  readonly title: string;
  readonly owner_role: string;
  readonly source_blocker_codes: readonly string[];
  readonly prerequisite_actions: readonly string[];
  readonly status: "not_started" | "pending" | "blocked" | "complete";
  readonly execution_impact: string;
  readonly required_artifact: string | null;
}

export interface OperatorReadModel {
  readonly contract_version: typeof OPERATOR_READ_MODEL_CONTRACT_VERSION;
  readonly system_summary: {
    readonly overall_status: OperatorOverallStatus;
    readonly total_providers: number;
    readonly enabled_providers: number;
    readonly blocked_providers: number;
    readonly disabled_adapters: number;
    readonly blocked_routes: number;
    readonly pending_approvals: number;
    readonly active_blockers: number;
    readonly execution_authorized_count: number;
    readonly last_evaluated_at: string;
    readonly read_model_contract_version: typeof OPERATOR_READ_MODEL_CONTRACT_VERSION;
    readonly read_model_hash: string;
  };
  readonly providers: readonly Record<string, unknown>[];
  readonly models: OperatorReadModelInput["models"];
  readonly routes: OperatorReadModelInput["routes"];
  readonly execution_profiles: OperatorReadModelInput["execution_profiles"];
  readonly governed_candidates: readonly OperatorGovernedCandidate[];
  readonly readiness: OperatorReadModelInput["readiness"];
  readonly evidence: OperatorReadModelInput["evidence"];
  readonly sandbox_proposals: readonly OperatorReadModelInput["proposal"][];
  readonly runtime_preflight: OperatorReadModelInput["preflight"];
  readonly activation_review: OperatorReadModelInput["activation_review"] & {
    readonly next_governed_action: string;
  };
  readonly gold_case_state: OperatorReadModelInput["gold_case"];
  readonly authorization: OperatorReadModelInput["authorization"];
  readonly consumption: OperatorReadModelInput["consumption"];
  readonly gateway_adapter_state: OperatorReadModelInput["gateway"];
  readonly budget_state: OperatorReadModelInput["budget"];
  readonly kill_switch_state: { readonly status: OperatorKillSwitchStatus };
  readonly secret_configuration_status: {
    readonly status: OperatorSecretStatus;
  };
  readonly blockers: readonly OperatorBlocker[];
  readonly required_human_actions: readonly OperatorRequiredAction[];
  readonly validation_evidence_metadata: OperatorReadModelInput["validation_metadata"] & {
    readonly dossier_id: string | null;
    readonly dossier_hash: string | null;
    readonly dossier_outcome: string;
    readonly evidence_pack_id: string | null;
    readonly evidence_pack_hash: string | null;
    readonly evidence_review_status: string;
    readonly proposal_id: string | null;
    readonly proposal_hash: string | null;
    readonly proposal_outcome: string;
    readonly runtime_config_id: string | null;
    readonly runtime_config_version: string | null;
    readonly runtime_config_hash: string | null;
    readonly preflight_outcome: string;
    readonly activation_review_id: string | null;
    readonly activation_review_hash: string | null;
    readonly activation_review_outcome: string;
    readonly gold_case_id: string | null;
    readonly gold_case_hash: string | null;
    readonly gold_case_outcome: string;
  };
  readonly audit_references: readonly string[];
  readonly arca_candidate_review: OperatorArcaCandidateReview;
  readonly arca_approved_artifact: OperatorApprovedArcaArtifact;
  readonly tournament: TournamentOperatorReadModel;
}

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const humanize = (code: string): string =>
  code.replaceAll(":", ": ").replaceAll("_", " ");

/**
 * Deterministic canonical next-step code per activation-review outcome. The
 * read model never invents reviewers or approvals; it only names the class of
 * governed action that a human must take next.
 */
const NEXT_GOVERNED_ACTIONS: Readonly<Record<string, string>> = {
  invalid_review: "repair_invalid_review_artifact",
  blocked: "resolve_governed_blockers",
  pending_human_review: "record_human_decisions",
  eligible_for_activation_configuration: "propose_activation_configuration_pr",
  expired: "renew_expired_review",
  rejected: "address_rejection_or_supersede",
};

function classify(code: string): {
  category: string;
  resolvable: readonly OperatorResolutionKind[];
  severity: OperatorBlocker["severity"];
} {
  if (/hash|invalid|malformed|mismatch|missing_artifact/.test(code))
    return {
      category: "integrity",
      resolvable: ["code_change"],
      severity: "critical",
    };
  if (/approval|reviewer/.test(code))
    return {
      category: "approval",
      resolvable: ["human_approval"],
      severity: "high",
    };
  if (/legal|terms/.test(code))
    return {
      category: "legal",
      resolvable: ["legal_review"],
      severity: "high",
    };
  if (/security|zdr|privacy|retention|training/.test(code))
    return {
      category: "security_privacy",
      resolvable: ["security_review", "external_account_configuration"],
      severity: "high",
    };
  if (/owner_unassigned|ownership/.test(code))
    return {
      category: "approval",
      resolvable: ["human_approval"],
      severity: "high",
    };
  if (/evidence|benchmark|gold|route|pricing|schema|risk/.test(code))
    return {
      category: "evidence",
      resolvable: ["evidence_review"],
      severity: "high",
    };
  return {
    category: "runtime",
    resolvable: ["runtime_configuration"],
    severity: "medium",
  };
}

function blockersFrom(input: OperatorReadModelInput): OperatorBlocker[] {
  const results: readonly [string, OperatorEvaluatorResult][] = [
    [
      "repository_loader",
      {
        outcome: input.source_valid ? "valid" : "invalid_state",
        reason_codes: input.source_errors,
        source_artifact_id: null,
        source_artifact_hash: null,
      },
    ],
    [
      "registry_validation",
      {
        outcome: input.source_valid ? "valid" : "invalid_state",
        reason_codes: input.source_errors.filter((code) =>
          code.startsWith("registry:"),
        ),
        source_artifact_id: "openrouter-registry",
        source_artifact_hash: null,
      },
    ],
    ["readiness_dossier", input.readiness],
    ["external_evidence_pack", input.evidence],
    ["sandbox_proposal", input.proposal],
    ["sandbox_preflight", input.preflight],
    ["sandbox_activation_review", input.activation_review],
    ["sandbox_gold_case", input.gold_case],
  ];
  const seen = new Set<string>();
  const blockers: OperatorBlocker[] = [];
  for (const [source, result] of results) {
    for (const reason of result.reason_codes) {
      const code = `${source}:${reason}`;
      if (seen.has(code)) continue;
      seen.add(code);
      const c = classify(reason);
      blockers.push({
        blocker_code: code,
        severity: c.severity,
        category: c.category,
        provider_id: input.provider.provider_id,
        candidate_id: input.models[0]?.model_id ?? null,
        summary: humanize(reason),
        source_evaluator: source,
        source_artifact_id: result.source_artifact_id,
        source_artifact_hash: result.source_artifact_hash,
        resolvable_by: c.resolvable,
        blocking_execution: true,
      });
    }
  }
  for (const candidate of input.additional_governed_candidates ?? []) {
    for (const reason of candidate.blockers) {
      const code = `glm_governance:${reason}`;
      if (seen.has(code)) continue;
      seen.add(code);
      const c = classify(reason);
      blockers.push({
        blocker_code: code,
        severity: c.severity,
        category: c.category,
        provider_id: input.provider.provider_id,
        candidate_id: candidate.candidate_id,
        summary: humanize(reason),
        source_evaluator: "glm_governance",
        source_artifact_id: candidate.candidate_id,
        source_artifact_hash: candidate.profile.hash,
        resolvable_by: c.resolvable,
        blocking_execution: true,
      });
    }
  }
  return blockers.sort((a, b) => a.blocker_code.localeCompare(b.blocker_code));
}

function actionsFrom(
  blockers: readonly OperatorBlocker[],
): OperatorRequiredAction[] {
  const groups = new Map<OperatorResolutionKind, string[]>();
  for (const blocker of blockers)
    for (const kind of blocker.resolvable_by)
      groups.set(kind, [...(groups.get(kind) ?? []), blocker.blocker_code]);
  const owner: Record<OperatorResolutionKind, string> = {
    code_change: "engineering",
    evidence_review: "evidence_reviewer",
    legal_review: "legal_reviewer",
    security_review: "security_reviewer",
    human_approval: "independent_human_approver",
    runtime_configuration: "runtime_operator",
    external_account_configuration: "provider_account_owner",
  };
  return [...groups.entries()]
    .map(([kind, codes]) => ({
      action_code: `resolve:${kind}`,
      title: `Resolve ${humanize(kind)} blockers`,
      owner_role: owner[kind],
      source_blocker_codes: [...new Set(codes)].sort(),
      prerequisite_actions: [],
      status: "pending" as const,
      execution_impact:
        "Execution remains blocked until reviewed evidence confirms resolution.",
      required_artifact: `${kind}_review_artifact`,
    }))
    .sort((a, b) => a.action_code.localeCompare(b.action_code));
}

export function computeOperatorReadModelHash(value: unknown): string {
  const clone = structuredClone(value) as Record<string, unknown>;
  const summary = clone["system_summary"] as
    | Record<string, unknown>
    | undefined;
  if (summary) summary["read_model_hash"] = "";
  return createHash("sha256")
    .update(OPERATOR_READ_MODEL_HASH_DOMAIN)
    .update("\n")
    .update(canonicalizeOpenRouterRegistryJson(clone))
    .digest("hex");
}

export function buildOperatorReadModel(
  input: OperatorReadModelInput,
): OperatorReadModel {
  if (!Number.isFinite(Date.parse(input.evaluated_at)))
    throw new Error("operator_read_model_invalid_evaluated_at");
  const blockers = blockersFrom(input);
  const actions = actionsFrom(blockers);
  const executionAllowed =
    input.source_valid &&
    blockers.length === 0 &&
    input.preflight.outcome === "ready_for_manual_sandbox_call";
  const invalid =
    !input.source_valid ||
    [
      input.readiness.outcome,
      input.evidence.outcome,
      input.proposal.outcome,
      input.preflight.outcome,
      input.activation_review.outcome,
      input.gold_case.outcome,
    ].some((outcome) => outcome.startsWith("invalid"));
  const overall: OperatorOverallStatus = invalid
    ? "invalid_state"
    : blockers.length > 0 || !executionAllowed
      ? "blocked"
      : actions.length > 0
        ? "attention_required"
        : "healthy";
  const providerReasons = blockers.map((blocker) => blocker.blocker_code);
  const minimaxCandidate: OperatorGovernedCandidate = {
    candidate_id: input.models[0]?.model_id ?? "minimax-candidate-missing",
    model: {
      id: input.models[0]?.model_id ?? "missing",
      enabled: input.models[0]?.enabled ?? false,
    },
    route: {
      id: input.routes[0]?.route_id ?? "missing",
      enabled: input.routes[0]?.enabled ?? false,
    },
    profile: {
      id: input.execution_profiles[0]?.profile_id ?? "missing",
      enabled: input.execution_profiles[0]?.enabled ?? false,
      hash: input.execution_profiles[0]?.hash ?? null,
    },
    readiness: input.readiness.outcome,
    evidence: input.evidence.outcome,
    proposal: input.proposal.outcome,
    runtime_preflight: input.preflight.outcome,
    activation_review: input.activation_review.outcome,
    authorization: input.authorization.status,
    consumption: input.consumption.status,
    adapter_gateway_transport_state: {
      adapter: input.gateway.adapter_status,
      gateway: input.gateway.gateway_invoked ? "invoked" : "not_invoked",
      transport: input.gateway.transport_invoked ? "invoked" : "not_invoked",
    },
    blockers: blockers
      .filter((blocker) => blocker.source_evaluator !== "glm_governance")
      .map((blocker) => blocker.blocker_code),
    blocker_count: blockers.filter(
      (blocker) => blocker.source_evaluator !== "glm_governance",
    ).length,
    next_governed_action: "resolve_governed_blockers",
  };
  const withoutHash: OperatorReadModel = {
    contract_version: OPERATOR_READ_MODEL_CONTRACT_VERSION,
    system_summary: {
      overall_status: overall,
      total_providers: 1,
      enabled_providers: executionAllowed ? 1 : 0,
      blocked_providers: executionAllowed ? 0 : 1,
      disabled_adapters: input.provider.adapter_enabled ? 0 : 1,
      blocked_routes: input.routes.filter((route) => !route.enabled).length,
      pending_approvals:
        Number(input.evidence.review_status === "pending") +
        Number(input.proposal.approval_status === "pending") +
        input.activation_review.pending_human_decisions.length,
      active_blockers: blockers.length,
      execution_authorized_count: executionAllowed ? 1 : 0,
      last_evaluated_at: input.evaluated_at,
      read_model_contract_version: OPERATOR_READ_MODEL_CONTRACT_VERSION,
      read_model_hash: "",
    },
    providers: [
      {
        provider_id: input.provider.provider_id,
        display_name: input.provider.display_name,
        adapter_identity: input.provider.adapter_identity,
        adapter_version: input.provider.adapter_version,
        adapter_hash: input.provider.adapter_hash,
        adapter_state: input.provider.adapter_enabled ? "enabled" : "disabled",
        live_traffic_permitted: input.provider.live_traffic_permitted,
        registered_models: input.models.map((model) => model.entry_id),
        registered_routes: input.routes.map((route) => route.record_id),
        execution_profiles: input.execution_profiles.map(
          (profile) => profile.profile_id,
        ),
        readiness_status: input.readiness.outcome,
        proposal_status: input.proposal.outcome,
        preflight_status: input.preflight.outcome,
        secret_status: input.provider.secret_status,
        kill_switch_status: input.provider.kill_switch_status,
        budget_status: input.budget.status,
        execution_allowed: executionAllowed,
        reason_codes: providerReasons,
        evidence_paths: [...input.provider.evidence_paths].sort(),
      },
    ],
    models: input.models,
    routes: input.routes,
    execution_profiles: input.execution_profiles,
    governed_candidates: [
      minimaxCandidate,
      ...(input.additional_governed_candidates ?? []),
    ],
    readiness: input.readiness,
    evidence: input.evidence,
    sandbox_proposals: [input.proposal],
    runtime_preflight: input.preflight,
    activation_review: {
      ...input.activation_review,
      next_governed_action:
        NEXT_GOVERNED_ACTIONS[input.activation_review.outcome] ??
        "resolve_governed_blockers",
    },
    gold_case_state: input.gold_case,
    authorization: input.authorization,
    consumption: input.consumption,
    gateway_adapter_state: input.gateway,
    budget_state: input.budget,
    kill_switch_state: { status: input.provider.kill_switch_status },
    secret_configuration_status: { status: input.provider.secret_status },
    blockers,
    required_human_actions: actions,
    validation_evidence_metadata: {
      ...input.validation_metadata,
      dossier_id: input.readiness.source_artifact_id,
      dossier_hash: input.readiness.source_artifact_hash,
      dossier_outcome: input.readiness.outcome,
      evidence_pack_id: input.evidence.source_artifact_id,
      evidence_pack_hash: input.evidence.source_artifact_hash,
      evidence_review_status: input.evidence.review_status,
      proposal_id: input.proposal.source_artifact_id,
      proposal_hash: input.proposal.source_artifact_hash,
      proposal_outcome: input.proposal.outcome,
      runtime_config_id: input.preflight.runtime_config_id,
      runtime_config_version: input.preflight.runtime_config_version,
      runtime_config_hash: input.preflight.runtime_config_hash,
      preflight_outcome: input.preflight.outcome,
      activation_review_id: input.activation_review.source_artifact_id,
      activation_review_hash: input.activation_review.source_artifact_hash,
      activation_review_outcome: input.activation_review.outcome,
      gold_case_id: input.gold_case.source_artifact_id,
      gold_case_hash: input.gold_case.source_artifact_hash,
      gold_case_outcome: input.gold_case.outcome,
    },
    audit_references: [...input.audit_references].sort(),
    arca_candidate_review: input.arca_candidate_review ?? {
      candidate_artifact_id: null,
      candidate_sha256: null,
      review_lifecycle: "unavailable",
      evaluation_outcome: "invalid_candidate",
      reviewer_present: false,
      expires_at: null,
      unresolved_findings_count: 0,
      eligible_for_approved_artifact_building: false,
      export_authorized: false,
      publication_authorized: false,
    },
    arca_approved_artifact: input.arca_approved_artifact ?? {
      present: false,
      approved_artifact_id: null,
      approved_artifact_sha256: null,
      candidate_artifact_id: null,
      candidate_sha256: null,
      review_id: null,
      review_sha256: null,
      evaluation_id: null,
      evaluation_sha256: null,
      builder_identity: null,
      build_timestamp: null,
      export_status: "not_exported",
      publication_status: "not_published",
      production_reliance: "not_authorized",
      export_authorized: false,
      publication_authorized: false,
      production_reliance_authorized: false,
      database_write_authorized: false,
      network_call_authorized: false,
      vlatam_global_access_authorized: false,
    },
    tournament: input.tournament ?? {
      registered_candidates: [],
      runtime_evidence: [],
      write_actions_available: false,
    },
  };
  const hash = computeOperatorReadModelHash(withoutHash);
  return deepFreeze({
    ...withoutHash,
    system_summary: { ...withoutHash.system_summary, read_model_hash: hash },
  });
}

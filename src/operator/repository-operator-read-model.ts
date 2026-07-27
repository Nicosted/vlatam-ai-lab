import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { computeExecutionProfileHash } from "../execution/execution-profile.js";
import {
  GLM_MODEL_ID,
  GLM_PROFILE_ID,
  GLM_ROUTE_ID,
  evaluateGlmGovernanceArtifacts,
  glmGovernanceArtifacts,
  projectGlmFirstRunReadiness,
} from "../providers/openrouter-supervised-pilot-projection.js";

import {
  evaluateOpenRouterExternalEvidencePack,
  type OpenRouterExternalEvidencePack,
} from "../providers/openrouter-external-evidence-pack.js";
import {
  defaultOpenRouterReadinessDependencies,
  evaluateOpenRouterReadinessDossier,
  type OpenRouterReadinessDossier,
} from "../providers/openrouter-readiness-dossier.js";
import {
  canonicalizeOpenRouterRegistryJson,
  defaultOpenRouterRegistryDependencies,
  validateOpenRouterRegistry,
  type OpenRouterModelRegistryData,
  type OpenRouterRouteRegistryData,
} from "../providers/openrouter-registry.js";
import {
  evaluateOpenRouterSandboxEnablementProposal,
  type OpenRouterSandboxConfigurationApproval,
} from "../providers/openrouter-sandbox-enablement-proposal.js";
import {
  evaluateOpenRouterSandboxActivationReview,
  type OpenRouterSandboxActivationReviewDependencies,
} from "../providers/openrouter-sandbox-activation-review.js";
import { evaluateOpenRouterSandboxGoldCase } from "../providers/openrouter-sandbox-gold-case.js";
import {
  buildOperatorReadModel,
  type OperatorReadModel,
  type OperatorReadModelInput,
} from "./operator-read-model.js";
import {
  OPERATOR_READ_MODEL_ARTIFACTS,
  type OperatorReadModelArtifactKey,
} from "./operator-read-model-assets.js";
import {
  buildTournamentOperatorReadModel,
  evaluateRuntimeEvidencePack,
  validateRuntimeCandidate,
  type RuntimeCandidate,
  type RuntimeEvidencePack,
} from "../tournament/index.js";
import { evaluateGovernedArcaCandidateReview } from "../review/governed-arca-candidate-review.js";

export const REPOSITORY_OPERATOR_EVALUATED_AT =
  "2026-07-15T12:00:00.000Z" as const;

export interface RepositoryOperatorReadModelOptions {
  readonly repository_root: string;
  readonly evaluated_at: string;
  readonly artifact_overrides?: Readonly<
    Partial<Record<OperatorReadModelArtifactKey, unknown>>
  >;
  readonly test_totals?: { readonly tests: number; readonly suites: number };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const nullableString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

function safeRead(
  root: string,
  key: OperatorReadModelArtifactKey,
  overrides: RepositoryOperatorReadModelOptions["artifact_overrides"],
): { value: unknown; error: string | null } {
  if (overrides && key in overrides)
    return { value: structuredClone(overrides[key]), error: null };
  try {
    return {
      value: JSON.parse(
        readFileSync(resolve(root, OPERATOR_READ_MODEL_ARTIFACTS[key]), "utf8"),
      ) as unknown,
      error: null,
    };
  } catch {
    return { value: null, error: `missing_or_malformed_artifact:${key}` };
  }
}

function artifactHash(domain: string, value: unknown): string {
  return createHash("sha256")
    .update(domain)
    .update("\n")
    .update(canonicalizeOpenRouterRegistryJson(value))
    .digest("hex");
}

export async function loadRepositoryOperatorReadModel(
  options: RepositoryOperatorReadModelOptions,
): Promise<OperatorReadModel> {
  const evaluatedAt = new Date(options.evaluated_at);
  if (!Number.isFinite(evaluatedAt.getTime()))
    throw new Error("repository_operator_invalid_evaluated_at");

  const loaded = Object.fromEntries(
    (
      Object.keys(
        OPERATOR_READ_MODEL_ARTIFACTS,
      ) as OperatorReadModelArtifactKey[]
    ).map((key) => [
      key,
      safeRead(options.repository_root, key, options.artifact_overrides),
    ]),
  ) as Record<
    OperatorReadModelArtifactKey,
    { value: unknown; error: string | null }
  >;
  const sourceErrors = Object.values(loaded).flatMap((entry) =>
    entry.error ? [entry.error] : [],
  );

  const models = loaded.models.value;
  const glmConformance = loaded.glm_conformance.value;
  const routes = loaded.routes.value;
  const adapter = loaded.adapter.value;
  const profiles = loaded.profiles.value;
  const dossier = loaded.dossier.value;
  const evidence = loaded.evidence.value;
  const proposal = loaded.proposal.value;
  const approval = loaded.approval.value;
  const runtime = loaded.runtime.value;
  const arcaReviewFixture = loaded.arca_review_fixture.value;
  const arcaCandidate = isRecord(arcaReviewFixture)
    ? arcaReviewFixture.candidate
    : null;
  const arcaReview = isRecord(arcaReviewFixture)
    ? arcaReviewFixture.review
    : null;
  const arcaReviewEvaluation = evaluateGovernedArcaCandidateReview(
    arcaCandidate,
    arcaReview,
    options.evaluated_at,
  );
  if (
    arcaReviewEvaluation.outcome === "invalid_candidate" ||
    arcaReviewEvaluation.outcome === "invalid_review" ||
    arcaReviewEvaluation.outcome === "candidate_binding_mismatch"
  )
    sourceErrors.push(
      ...arcaReviewEvaluation.reason_codes.map(
        (reason) => `arca_candidate_review:${reason}`,
      ),
    );
  const tournamentCandidateInputs: unknown[] = [
    loaded.tournament_native.value,
    loaded.tournament_eve.value,
    loaded.tournament_cloudflare.value,
  ];
  for (const candidate of tournamentCandidateInputs)
    sourceErrors.push(
      ...validateRuntimeCandidate(candidate).map(
        (error) =>
          `tournament:${isRecord(candidate) && typeof candidate.runtime_candidate_id === "string" ? candidate.runtime_candidate_id : "unknown"}:${error}`,
      ),
    );
  const tournamentCandidates = tournamentCandidateInputs.filter(
    (candidate): candidate is RuntimeCandidate =>
      validateRuntimeCandidate(candidate).length === 0,
  );
  const runtimeEvidencePacks = [
    loaded.runtime_evidence_eve.value,
    loaded.runtime_evidence_cloudflare.value,
  ].filter(isRecord) as unknown as RuntimeEvidencePack[];
  for (const pack of runtimeEvidencePacks) {
    const result = evaluateRuntimeEvidencePack(pack, evaluatedAt);
    if (result.outcome === "invalid")
      sourceErrors.push(
        ...result.reason_codes.map(
          (reason) => `runtime_evidence:${pack.pack_id}:${reason}`,
        ),
      );
  }

  const registryErrors = validateOpenRouterRegistry(
    models,
    routes,
    defaultOpenRouterRegistryDependencies(),
    evaluatedAt,
  );
  sourceErrors.push(...registryErrors.map((error) => `registry:${error}`));

  const readinessResult = evaluateOpenRouterReadinessDossier(
    dossier,
    evaluatedAt,
    defaultOpenRouterReadinessDependencies(evaluatedAt),
  );
  const evidenceResult = evaluateOpenRouterExternalEvidencePack(
    evidence,
    evaluatedAt,
  );
  let proposalResult;
  try {
    proposalResult = evaluateOpenRouterSandboxEnablementProposal(
      proposal,
      evaluatedAt,
      {
        dossier: dossier as OpenRouterReadinessDossier,
        evidence_pack: evidence as OpenRouterExternalEvidencePack,
        approval: approval as OpenRouterSandboxConfigurationApproval,
        model_entries:
          isRecord(models) && Array.isArray(models.entries)
            ? models.entries
            : [],
        routes:
          isRecord(routes) && Array.isArray(routes.routes) ? routes.routes : [],
        profiles:
          isRecord(profiles) && Array.isArray(profiles.profiles)
            ? profiles.profiles
            : [],
        adapter: adapter as {
          enabled: boolean;
          retry_policy: { max_retries: number };
        },
      },
    );
  } catch {
    sourceErrors.push("proposal:evaluator_dependency_invalid");
    proposalResult = {
      contract_version: "1.0.0" as const,
      proposal_id:
        isRecord(proposal) && typeof proposal.proposal_id === "string"
          ? proposal.proposal_id
          : null,
      evaluated_at: options.evaluated_at,
      outcome: "invalid_proposal" as const,
      reason_codes: ["evaluator_dependency_invalid"],
      configuration_authorized: false,
      execution_authorized: false as const,
      secret_access_authorized: false as const,
      provider_call_performed: false as const,
    };
  }

  const activationReview = loaded.activation_review.value;
  const goldCase = loaded.gold_case.value;
  const fixture = loaded.fixture.value;
  const pricing = loaded.pricing.value;
  const zdr = loaded.zdr.value;

  const goldCaseResult = evaluateOpenRouterSandboxGoldCase(
    goldCase,
    evaluatedAt,
    fixture,
  );
  let activationResult;
  try {
    activationResult = evaluateOpenRouterSandboxActivationReview(
      activationReview,
      evaluatedAt,
      {
        proposal,
        proposal_dependencies: {
          dossier,
          evidence_pack: evidence,
          approval,
          model_entries:
            isRecord(models) && Array.isArray(models.entries)
              ? models.entries
              : [],
          routes:
            isRecord(routes) && Array.isArray(routes.routes)
              ? routes.routes
              : [],
          profiles:
            isRecord(profiles) && Array.isArray(profiles.profiles)
              ? profiles.profiles
              : [],
          adapter,
        },
        runtime,
        pricing,
        zdr_evidence: zdr,
        gold_case: goldCase,
        first_run_fixture: fixture,
      } as OpenRouterSandboxActivationReviewDependencies,
    );
  } catch {
    sourceErrors.push("activation_review:evaluator_dependency_invalid");
    activationResult = {
      contract_version: "1.0.0" as const,
      review_id:
        isRecord(activationReview) &&
        typeof activationReview.review_id === "string"
          ? activationReview.review_id
          : null,
      evaluated_at: options.evaluated_at,
      outcome: "invalid_review" as const,
      reason_codes: ["evaluator_dependency_invalid"] as const,
      pending_human_decisions: [] as const,
      activation_configuration_authorized: false,
      execution_authorized: false as const,
      provider_call_performed: false as const,
      secret_access_allowed: false as const,
      runtime_enabled: false as const,
    };
  }

  const runtimeRecord = isRecord(runtime) ? runtime : {};
  const bindings = isRecord(runtimeRecord.bindings)
    ? runtimeRecord.bindings
    : {};
  const modelEntries =
    isRecord(models) && Array.isArray(models.entries) ? models.entries : [];
  const routeEntries =
    isRecord(routes) && Array.isArray(routes.routes) ? routes.routes : [];
  const profileEntries =
    isRecord(profiles) && Array.isArray(profiles.profiles)
      ? profiles.profiles
      : [];
  const expectedBindings = {
    proposal_hash:
      isRecord(proposal) && typeof proposal.proposal_hash === "string"
        ? proposal.proposal_hash
        : "",
    dossier_hash:
      isRecord(dossier) && typeof dossier.dossier_hash === "string"
        ? dossier.dossier_hash
        : "",
    evidence_pack_hash:
      isRecord(evidence) && typeof evidence.pack_hash === "string"
        ? evidence.pack_hash
        : "",
    profile_hash:
      typeof bindings.profile_hash === "string" ? bindings.profile_hash : "",
    route_hash:
      isRecord(routeEntries[0]) &&
      typeof routeEntries[0].route_hash === "string"
        ? routeEntries[0].route_hash
        : "",
    model_hash:
      isRecord(modelEntries[0]) &&
      typeof modelEntries[0].entry_hash === "string"
        ? modelEntries[0].entry_hash
        : "",
    exact_policy_hash: null,
  };
  for (const [key, expected] of Object.entries(expectedBindings))
    if (bindings[key] !== expected)
      sourceErrors.push(`runtime_binding_mismatch:${key}`);

  const operationalVerification = {
    outcome: "pending_operational_verification",
    reasons: ["operational_verification_pending"],
    configuration_id:
      typeof runtimeRecord.configuration_id === "string"
        ? runtimeRecord.configuration_id
        : null,
  } as const;

  const typedModels = models as OpenRouterModelRegistryData;
  const typedRoutes = routes as OpenRouterRouteRegistryData;
  const typedProfiles = profileEntries.filter(isRecord);
  const runtimeHash = isRecord(runtime)
    ? artifactHash("vlatam-ai-lab:openrouter-sandbox-runtime:v1", runtime)
    : null;
  const glmGovernance = evaluateGlmGovernanceArtifacts();
  const glmPreflight = projectGlmFirstRunReadiness();
  const glmProfile = typedProfiles.find(
    (profile) => profile.profile_id === GLM_PROFILE_ID,
  );
  const input: OperatorReadModelInput = {
    evaluated_at: options.evaluated_at,
    source_valid:
      sourceErrors.length === 0 &&
      readinessResult.outcome !== "invalid_dossier" &&
      evidenceResult.outcome !== "invalid_pack" &&
      proposalResult.outcome !== "invalid_proposal" &&
      activationResult.outcome !== "invalid_review" &&
      goldCaseResult.outcome !== "invalid_gold_case" &&
      glmGovernance.outcome !== "invalid",
    source_errors: [...new Set(sourceErrors)].sort(),
    tournament: buildTournamentOperatorReadModel(
      tournamentCandidates,
      runtimeEvidencePacks,
      evaluatedAt,
    ),
    provider: {
      provider_id: "openrouter",
      display_name: null,
      adapter_identity:
        isRecord(runtimeRecord.adapter) &&
        typeof runtimeRecord.adapter.identity === "string"
          ? runtimeRecord.adapter.identity
          : "unknown",
      adapter_version:
        isRecord(runtimeRecord.adapter) &&
        typeof runtimeRecord.adapter.version === "string"
          ? runtimeRecord.adapter.version
          : "unknown",
      adapter_hash:
        isRecord(runtimeRecord.adapter) &&
        typeof runtimeRecord.adapter.hash === "string"
          ? runtimeRecord.adapter.hash
          : "",
      adapter_enabled:
        isRecord(runtimeRecord.adapter) &&
        runtimeRecord.adapter.enabled === true,
      live_traffic_permitted: false,
      secret_status: "not_configured",
      kill_switch_status: isRecord(runtimeRecord.kill_switch)
        ? runtimeRecord.kill_switch.active === true
          ? "active"
          : "inactive"
        : "missing",
      evidence_paths: [
        "reports/ai-openrouter-readiness-dossier-2026-07-14.md",
        "reports/ai-lab-openrouter-reviewed-evidence-pack-2026-07-14.md",
        "reports/ai-lab-openrouter-sandbox-enablement-proposal-2026-07-14.md",
        "docs/evidence/openrouter-sandbox-adapter-harness-2026-07-14.md",
        "reports/ai-lab-openrouter-sandbox-human-review-2026-07-15.md",
        "reports/ai-lab-glm-fireworks-endpoint-evidence-2026-07-17.md",
      ],
    },
    models: Array.isArray(typedModels?.entries)
      ? typedModels.entries.map((entry) => ({
          entry_id: entry.entry_id,
          version: entry.entry_version,
          model_id: entry.model_id,
          hash: entry.entry_hash,
          enabled: entry.enabled,
          lifecycle: entry.lifecycle,
        }))
      : [],
    routes: Array.isArray(typedRoutes?.routes)
      ? typedRoutes.routes.map((route) => ({
          record_id: route.route_record_id,
          route_id: route.route_id,
          version: route.route_version,
          model_id: route.model_id,
          hash: route.route_hash,
          enabled: route.enabled,
          executable_profile_ids:
            route.profile_compatibility.executable_profile_ids,
          lifecycle: route.lifecycle,
        }))
      : [],
    execution_profiles: typedProfiles
      .filter((profile) => profile.provider_id === "openrouter")
      .map((profile) => ({
        profile_id: String(profile.profile_id ?? "unknown"),
        version: String(profile.contract_version ?? "unknown"),
        model_id: String(profile.model_id ?? "unknown"),
        enabled: profile.enabled === true,
        lifecycle: String(profile.lifecycle_status ?? "unknown"),
        hash: computeExecutionProfileHash(profile),
      })),
    readiness: {
      outcome: readinessResult.outcome,
      reason_codes: readinessResult.reason_codes,
      source_artifact_id: readinessResult.dossier_id,
      source_artifact_hash:
        isRecord(dossier) && typeof dossier.dossier_hash === "string"
          ? dossier.dossier_hash
          : null,
    },
    evidence: {
      outcome: evidenceResult.outcome,
      reason_codes: evidenceResult.reason_codes,
      source_artifact_id: evidenceResult.pack_id,
      source_artifact_hash:
        isRecord(evidence) && typeof evidence.pack_hash === "string"
          ? evidence.pack_hash
          : null,
      review_status:
        isRecord(evidence) &&
        isRecord(evidence.human_approval) &&
        ["approved", "rejected"].includes(
          String(evidence.human_approval.status),
        )
          ? (evidence.human_approval.status as "approved" | "rejected")
          : "pending",
    },
    proposal: {
      outcome: proposalResult.outcome,
      reason_codes: proposalResult.reason_codes,
      source_artifact_id: proposalResult.proposal_id,
      source_artifact_hash:
        isRecord(proposal) && typeof proposal.proposal_hash === "string"
          ? proposal.proposal_hash
          : null,
      version:
        isRecord(proposal) && typeof proposal.proposal_version === "string"
          ? proposal.proposal_version
          : null,
      approval_status:
        isRecord(approval) &&
        ["approved", "rejected"].includes(String(approval.status))
          ? (approval.status as "approved" | "rejected")
          : "pending",
    },
    preflight: {
      outcome: operationalVerification.outcome,
      reason_codes: operationalVerification.reasons,
      source_artifact_id: operationalVerification.configuration_id,
      source_artifact_hash: runtimeHash,
      runtime_config_id:
        operationalVerification.configuration_id ??
        (typeof runtimeRecord.configuration_id === "string"
          ? runtimeRecord.configuration_id
          : null),
      runtime_config_version:
        typeof runtimeRecord.runtime_contract_version === "string"
          ? runtimeRecord.runtime_contract_version
          : null,
      runtime_config_hash: runtimeHash,
    },
    activation_review: (() => {
      const review = isRecord(activationReview) ? activationReview : {};
      const decisions = isRecord(review.decisions) ? review.decisions : {};
      const evidenceDecision = isRecord(decisions.evidence_review)
        ? decisions.evidence_review
        : {};
      const approvalDecision = isRecord(decisions.activation_approval)
        ? decisions.activation_approval
        : {};
      const ownership = isRecord(review.operational_ownership)
        ? review.operational_ownership
        : {};
      const killSwitchOwner = isRecord(ownership.kill_switch_owner)
        ? ownership.kill_switch_owner
        : {};
      const incidentOwner = isRecord(ownership.incident_owner)
        ? ownership.incident_owner
        : {};
      const allowed = isRecord(review.allowed_data) ? review.allowed_data : {};
      const ceilings = isRecord(review.ceilings) ? review.ceilings : {};
      const bindings = isRecord(review.artifact_bindings)
        ? review.artifact_bindings
        : {};
      const decisionStatus = (
        value: unknown,
      ): "pending" | "approved" | "rejected" =>
        value === "approved" || value === "rejected" ? value : "pending";
      const ownerStatus = (value: unknown): "unassigned" | "assigned" =>
        value === "assigned" ? "assigned" : "unassigned";
      const integer = (value: unknown): number | null =>
        Number.isSafeInteger(value) ? (value as number) : null;
      const boundArtifact = (
        name: string,
        value: unknown,
      ): {
        name: string;
        id: string | null;
        version: string | null;
        hash: string | null;
        status: string | null;
      } => {
        const binding = isRecord(value) ? value : {};
        return {
          name,
          id:
            typeof binding.id === "string"
              ? binding.id
              : typeof binding.fixture_id === "string"
                ? binding.fixture_id
                : null,
          version: typeof binding.version === "string" ? binding.version : null,
          hash:
            typeof binding.hash === "string"
              ? binding.hash
              : typeof binding.fixture_hash === "string"
                ? binding.fixture_hash
                : null,
          status: typeof binding.status === "string" ? binding.status : null,
        };
      };
      return {
        outcome: activationResult.outcome,
        reason_codes: [
          ...new Set([
            ...activationResult.reason_codes,
            ...activationResult.pending_human_decisions,
          ]),
        ].sort(),
        source_artifact_id: activationResult.review_id,
        source_artifact_hash:
          typeof review.review_hash === "string" ? review.review_hash : null,
        version:
          typeof review.review_version === "string"
            ? review.review_version
            : null,
        lifecycle:
          typeof review.lifecycle === "string" ? review.lifecycle : "unknown",
        scope: typeof review.scope === "string" ? review.scope : "unknown",
        expires_at:
          typeof review.expires_at === "string" ? review.expires_at : null,
        pending_human_decisions: activationResult.pending_human_decisions,
        evidence_review_status: decisionStatus(evidenceDecision.status),
        activation_approval_status: decisionStatus(approvalDecision.status),
        kill_switch_owner_status: ownerStatus(killSwitchOwner.status),
        incident_owner_status: ownerStatus(incidentOwner.status),
        allowed_data_classification:
          typeof allowed.classification === "string"
            ? allowed.classification
            : null,
        ceilings: {
          maximum_requests: integer(ceilings.maximum_requests),
          maximum_input_tokens_per_request: integer(
            ceilings.maximum_input_tokens_per_request,
          ),
          maximum_output_tokens_per_request: integer(
            ceilings.maximum_output_tokens_per_request,
          ),
          timeout_ms: integer(ceilings.timeout_ms),
          automatic_retries: integer(ceilings.automatic_retries),
          fallback_enabled:
            typeof ceilings.fallback_enabled === "boolean"
              ? ceilings.fallback_enabled
              : null,
          maximum_total_spend_usd:
            typeof ceilings.maximum_total_spend_usd === "string"
              ? ceilings.maximum_total_spend_usd
              : null,
        },
        bound_artifacts: [
          boundArtifact("readiness_dossier", bindings.readiness_dossier),
          boundArtifact(
            "external_evidence_pack",
            bindings.external_evidence_pack,
          ),
          boundArtifact("sandbox_proposal", bindings.sandbox_proposal),
          boundArtifact(
            "runtime_configuration",
            bindings.runtime_configuration,
          ),
          boundArtifact("execution_profile", bindings.execution_profile),
          boundArtifact("model_registry_entry", bindings.model_registry_entry),
          boundArtifact("route_record", bindings.route_record),
          boundArtifact("pricing_policy", bindings.pricing_policy),
          boundArtifact("privacy_zdr_evidence", bindings.privacy_zdr_evidence),
          boundArtifact("gold_case", bindings.gold_case),
          boundArtifact("first_run_fixture", bindings.first_run_fixture),
        ],
      };
    })(),
    gold_case: {
      outcome: goldCaseResult.outcome,
      reason_codes: goldCaseResult.reason_codes,
      source_artifact_id: goldCaseResult.gold_case_id,
      source_artifact_hash:
        isRecord(goldCase) && typeof goldCase.gold_case_hash === "string"
          ? goldCase.gold_case_hash
          : null,
      version:
        isRecord(goldCase) && typeof goldCase.gold_case_version === "string"
          ? goldCase.gold_case_version
          : null,
      capability_id:
        isRecord(goldCase) && typeof goldCase.capability_id === "string"
          ? goldCase.capability_id
          : null,
      campaign_status: goldCaseResult.campaign_status,
      acceptance_status: goldCaseResult.acceptance_status,
    },
    authorization: {
      status: "no_policy_issued",
      exact_policy_hash: null,
      issued_count: 0,
      pending_count:
        isRecord(approval) && approval.status === "pending" ? 1 : 0,
    },
    consumption: {
      status: "not_attempted",
      attempted_count: 0,
      consumed_count: 0,
    },
    gateway: {
      binding_status: "not_invoked",
      adapter_status:
        isRecord(runtimeRecord.adapter) &&
        runtimeRecord.adapter.enabled === true
          ? "enabled"
          : "disabled",
      transport_invoked: false,
      gateway_invoked: false,
    },
    budget: {
      status: runtimeRecord.budget_enabled === true ? "enabled" : "disabled",
      maximum_requests: Number.isSafeInteger(runtimeRecord.maximum_requests)
        ? (runtimeRecord.maximum_requests as number)
        : null,
      maximum_total_spend_usd:
        typeof runtimeRecord.maximum_total_spend_usd === "string"
          ? runtimeRecord.maximum_total_spend_usd
          : null,
    },
    validation_metadata: {
      dossier_version: readinessResult.dossier_version,
      evidence_pack_version:
        isRecord(evidence) && typeof evidence.pack_version === "string"
          ? evidence.pack_version
          : null,
      profile_contract_version:
        typedProfiles.length > 0
          ? String(typedProfiles[0]?.contract_version ?? "unknown")
          : null,
      test_totals: options.test_totals ?? null,
    },
    audit_references: [
      ...Object.values(OPERATOR_READ_MODEL_ARTIFACTS),
      "config/ai-openrouter-glm-readiness-dossier.json",
      "config/ai-openrouter-glm-external-evidence-pack.json",
      "config/ai-openrouter-glm-supervised-enablement-proposal.json",
      "config/ai-openrouter-glm-first-run-runtime.json",
      "config/ai-openrouter-glm-activation-review.json",
      "config/ai-openrouter-glm-capability-acceptance.json",
      "config/ai-openrouter-glm-pricing-policy-candidate.json",
      "config/ai-openrouter-glm-zdr-review-candidate.json",
      "config/ai-commercial-document-pilot-operation.json",
      "reports/ai-lab-glm-fireworks-endpoint-evidence-2026-07-17.md",
    ],
    arca_candidate_review: {
      source_context: {
        projection_source: "repository-current",
        fixture_kind: isRecord(arcaReviewFixture)
          ? nullableString(arcaReviewFixture.fixture_kind)
          : null,
        synthetic_candidate:
          isRecord(arcaReviewFixture) &&
          arcaReviewFixture.synthetic_candidate === true,
        real_human_decision:
          isRecord(arcaReviewFixture) &&
          arcaReviewFixture.real_human_review_performed === true
            ? "present"
            : "absent",
      },
      candidate_artifact_id: arcaReviewEvaluation.candidate_artifact_id,
      candidate_sha256: arcaReviewEvaluation.candidate_sha256,
      acquisition_id:
        isRecord(arcaCandidate) && isRecord(arcaCandidate.acquisition_artifact)
          ? nullableString(arcaCandidate.acquisition_artifact.acquisition_id)
          : null,
      source:
        isRecord(arcaCandidate) &&
        isRecord(arcaCandidate.parsed_output) &&
        Array.isArray(arcaCandidate.parsed_output.tariff_lines) &&
        isRecord(arcaCandidate.parsed_output.tariff_lines[0])
          ? nullableString(arcaCandidate.parsed_output.tariff_lines[0].source)
          : null,
      captured_at:
        isRecord(arcaCandidate) && isRecord(arcaCandidate.acquisition_artifact)
          ? nullableString(arcaCandidate.acquisition_artifact.captured_at)
          : null,
      parser_id:
        isRecord(arcaCandidate) && isRecord(arcaCandidate.parser)
          ? nullableString(arcaCandidate.parser.parser_id)
          : null,
      parser_version:
        isRecord(arcaCandidate) && isRecord(arcaCandidate.parser)
          ? nullableString(arcaCandidate.parser.parser_version)
          : null,
      parsed_output_sha256: isRecord(arcaCandidate)
        ? nullableString(arcaCandidate.parsed_output_sha256)
        : null,
      tariff_line_count:
        isRecord(arcaCandidate) &&
        isRecord(arcaCandidate.parsed_output) &&
        Number.isSafeInteger(arcaCandidate.parsed_output.tariff_lines_count)
          ? (arcaCandidate.parsed_output.tariff_lines_count as number)
          : null,
      candidate_states: {
        validation_status: isRecord(arcaCandidate)
          ? nullableString(arcaCandidate.validation_status)
          : null,
        review_state: isRecord(arcaCandidate)
          ? nullableString(arcaCandidate.review_state)
          : null,
        approval_status: isRecord(arcaCandidate)
          ? nullableString(arcaCandidate.approval_status)
          : null,
        publication_status: isRecord(arcaCandidate)
          ? nullableString(arcaCandidate.publication_status)
          : null,
      },
      review_lifecycle:
        isRecord(arcaReview) && typeof arcaReview.lifecycle === "string"
          ? arcaReview.lifecycle
          : "invalid",
      review_id: isRecord(arcaReview)
        ? nullableString(arcaReview.review_id)
        : null,
      review_sha256: isRecord(arcaReview)
        ? nullableString(arcaReview.review_sha256)
        : null,
      evaluation_outcome: arcaReviewEvaluation.outcome,
      reviewer_present: isRecord(arcaReview) && arcaReview.reviewer !== null,
      reviewer_identity:
        isRecord(arcaReview) && isRecord(arcaReview.reviewer)
          ? nullableString(arcaReview.reviewer.identity)
          : null,
      decision_timestamp: isRecord(arcaReview)
        ? nullableString(arcaReview.decision_timestamp)
        : null,
      expires_at:
        isRecord(arcaReview) && typeof arcaReview.expires_at === "string"
          ? arcaReview.expires_at
          : null,
      review_statement: isRecord(arcaReview)
        ? nullableString(arcaReview.review_statement)
        : null,
      rejection_reason: isRecord(arcaReview)
        ? nullableString(arcaReview.rejection_reason)
        : null,
      unresolved_findings_count: arcaReviewEvaluation.unresolved_findings_count,
      findings:
        isRecord(arcaReview) && Array.isArray(arcaReview.findings)
          ? arcaReview.findings.filter(isRecord).map((finding) => ({
              severity: nullableString(finding.severity) ?? "unknown",
              category: nullableString(finding.category) ?? "unknown",
              finding_code: nullableString(finding.finding_code) ?? "unknown",
              description: nullableString(finding.description) ?? "",
              resolution_status:
                nullableString(finding.resolution_status) ?? "unknown",
            }))
          : [],
      separation_of_duties:
        isRecord(arcaReview) && isRecord(arcaReview.separation_of_duties)
          ? {
              acquisition_operator_identity: nullableString(
                arcaReview.separation_of_duties.acquisition_operator_identity,
              ),
              parser_runtime_identity: nullableString(
                arcaReview.separation_of_duties.parser_runtime_identity,
              ),
              candidate_producer_identity: nullableString(
                arcaReview.separation_of_duties.candidate_producer_identity,
              ),
              evidence_reviewer_identity: nullableString(
                arcaReview.separation_of_duties.evidence_reviewer_identity,
              ),
              reviewer_independence_asserted:
                arcaReview.separation_of_duties
                  .reviewer_independence_asserted === true,
            }
          : {
              acquisition_operator_identity: null,
              parser_runtime_identity: null,
              candidate_producer_identity: null,
              evidence_reviewer_identity: null,
              reviewer_independence_asserted: false,
            },
      evaluation_id: arcaReviewEvaluation.evaluation_id,
      evaluation_sha256: arcaReviewEvaluation.evaluation_sha256,
      evaluated_at: arcaReviewEvaluation.evaluated_at,
      evaluation_reason_codes: [...arcaReviewEvaluation.reason_codes],
      evaluation_bindings: {
        candidate_artifact_id: arcaReviewEvaluation.candidate_artifact_id,
        candidate_sha256: arcaReviewEvaluation.candidate_sha256,
        review_id: arcaReviewEvaluation.review_id,
        review_sha256: arcaReviewEvaluation.review_sha256,
      },
      eligible_for_approved_artifact_building:
        arcaReviewEvaluation.eligible_for_approved_artifact_building,
      approved_artifact_created: false,
      export_authorized: false,
      publication_authorized: false,
      production_reliance_authorized: false,
      database_write_authorized: false,
      network_call_authorized: false,
      scheduler_authorized: false,
      deployment_authorized: false,
      vlatam_global_access_authorized: false,
      execution_performed: false,
    },
    arca_approved_artifact: {
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
      vlatam_global_consumption: "not_authorized",
      export_authorized: false,
      publication_authorized: false,
      production_reliance_authorized: false,
      database_write_authorized: false,
      network_call_authorized: false,
      vlatam_global_access_authorized: false,
    },
    additional_governed_candidates: [
      {
        candidate_id: GLM_MODEL_ID,
        model: { id: GLM_MODEL_ID, enabled: false },
        route: { id: GLM_ROUTE_ID, enabled: false },
        profile: {
          id: GLM_PROFILE_ID,
          enabled: false,
          hash: glmProfile ? computeExecutionProfileHash(glmProfile) : null,
        },
        readiness: glmGovernance.outcome,
        evidence: glmGovernanceArtifacts.external_evidence_pack.review_status,
        proposal: glmGovernanceArtifacts.supervised_enablement_proposal.status,
        runtime_preflight: glmPreflight.outcome,
        activation_review: glmGovernanceArtifacts.activation_review.status,
        authorization: "no_policy_issued",
        consumption: "not_attempted",
        adapter_gateway_transport_state: {
          adapter: "disabled",
          gateway: "not_invoked",
          transport: "not_invoked",
        },
        blockers: glmGovernance.blockers,
        blocker_count: glmGovernance.blockers.length,
        next_governed_action: "review_endpoint_zdr_pricing_and_approvals",
        conformance: {
          status:
            isRecord(glmConformance) && glmConformance.status === "failed"
              ? "failed"
              : "blocked",
          cases_attempted:
            isRecord(glmConformance) &&
            Number.isSafeInteger(glmConformance.cases_attempted)
              ? (glmConformance.cases_attempted as number)
              : 0,
          cases_passed:
            isRecord(glmConformance) &&
            Number.isSafeInteger(glmConformance.cases_passed)
              ? (glmConformance.cases_passed as number)
              : 0,
          schema_pass_rate:
            isRecord(glmConformance) &&
            typeof glmConformance.schema_pass_rate === "string"
              ? glmConformance.schema_pass_rate
              : null,
          provider_routing_match:
            isRecord(glmConformance) &&
            glmConformance.served_provider === "Fireworks" &&
            glmConformance.served_model === GLM_MODEL_ID &&
            glmConformance.served_endpoint_tag === "fireworks"
              ? "matched"
              : isRecord(glmConformance) &&
                  (glmConformance.served_provider !== null ||
                    glmConformance.served_model !== null ||
                    glmConformance.served_endpoint_tag !== null)
                ? "mismatched"
                : "unavailable",
          zdr_evidence_status: "runtime_incomplete",
          budget_reconciliation:
            isRecord(glmConformance) &&
            glmConformance.budget_reconciliation === "incomplete"
              ? "incomplete"
              : "not_attempted",
          retries:
            isRecord(glmConformance) &&
            Number.isSafeInteger(glmConformance.retries)
              ? (glmConformance.retries as number)
              : 0,
          duplicate_consumption_result:
            isRecord(glmConformance) &&
            glmConformance.replay_result === "already_consumed"
              ? "safe"
              : "unsafe",
          blockers:
            isRecord(glmConformance) && Array.isArray(glmConformance.blockers)
              ? glmConformance.blockers.filter(
                  (blocker): blocker is string => typeof blocker === "string",
                )
              : ["conformance_evidence_missing"],
          independent_review_required: true,
          activation_prohibited: true,
          kill_switch_state: "active",
        },
      },
    ],
  };
  return buildOperatorReadModel(input);
}

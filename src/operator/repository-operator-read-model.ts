import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { computeExecutionProfileHash } from "../execution/execution-profile.js";
import {
  GLM_MODEL_ID,
  GLM_PROFILE_ID,
  GLM_ROUTE_ID,
  evaluateGlmFirstRunPreflight,
  evaluateGlmGovernanceArtifacts,
  glmGovernanceArtifacts,
} from "../providers/openrouter-glm-supervised-pilot.js";

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
  evaluateOpenRouterSandboxPreflight,
  type OpenRouterSandboxRuntimeConfig,
} from "../providers/openrouter-sandbox-preflight.js";
import {
  buildOperatorReadModel,
  type OperatorReadModel,
  type OperatorReadModelInput,
} from "./operator-read-model.js";

export const REPOSITORY_OPERATOR_EVALUATED_AT =
  "2026-07-15T12:00:00.000Z" as const;

const APPROVED_ARTIFACTS = {
  models: "config/ai-openrouter-model-registry.json",
  routes: "config/ai-openrouter-route-registry.json",
  adapter: "config/ai-openrouter-adapter.json",
  profiles: "config/ai-execution-profiles.json",
  dossier: "config/ai-openrouter-readiness-dossier.json",
  evidence: "config/ai-openrouter-external-evidence-pack.json",
  proposal: "config/ai-openrouter-sandbox-enablement-proposal.json",
  approval: "config/ai-openrouter-sandbox-configuration-approval.json",
  runtime: "config/ai-openrouter-sandbox-runtime.json",
  activation_review: "config/ai-openrouter-sandbox-activation-review.json",
  gold_case: "config/ai-openrouter-sandbox-gold-case.json",
  fixture:
    "data/fixtures/providers/openrouter-normative-claim-synthetic-v1.json",
  pricing: "config/ai-pricing.json",
  zdr: "config/ai-zdr-evidence.json",
} as const;

type ArtifactKey = keyof typeof APPROVED_ARTIFACTS;

export interface RepositoryOperatorReadModelOptions {
  readonly repository_root: string;
  readonly evaluated_at: string;
  readonly artifact_overrides?: Readonly<Partial<Record<ArtifactKey, unknown>>>;
  readonly test_totals?: { readonly tests: number; readonly suites: number };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function safeRead(
  root: string,
  key: ArtifactKey,
  overrides: RepositoryOperatorReadModelOptions["artifact_overrides"],
): { value: unknown; error: string | null } {
  if (overrides && key in overrides)
    return { value: structuredClone(overrides[key]), error: null };
  try {
    return {
      value: JSON.parse(
        readFileSync(resolve(root, APPROVED_ARTIFACTS[key]), "utf8"),
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
    (Object.keys(APPROVED_ARTIFACTS) as ArtifactKey[]).map((key) => [
      key,
      safeRead(options.repository_root, key, options.artifact_overrides),
    ]),
  ) as Record<ArtifactKey, { value: unknown; error: string | null }>;
  const sourceErrors = Object.values(loaded).flatMap((entry) =>
    entry.error ? [entry.error] : [],
  );

  const models = loaded.models.value;
  const routes = loaded.routes.value;
  const adapter = loaded.adapter.value;
  const profiles = loaded.profiles.value;
  const dossier = loaded.dossier.value;
  const evidence = loaded.evidence.value;
  const proposal = loaded.proposal.value;
  const approval = loaded.approval.value;
  const runtime = loaded.runtime.value;

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

  const preflightResult = await evaluateOpenRouterSandboxPreflight({
    config: runtime,
    expected_bindings: expectedBindings,
    kill_switch: {
      evaluate: (reference) => ({
        reference,
        active:
          isRecord(runtimeRecord.kill_switch) &&
          runtimeRecord.kill_switch.active === true,
      }),
    },
    budget: { available: () => false },
    resolve_secret: false,
    now: evaluatedAt,
    operator_id: "repository.operator-read-model",
    invocation: "manual",
    test_data_classification: "synthetic",
  });

  const typedRuntime = runtime as OpenRouterSandboxRuntimeConfig;
  const typedModels = models as OpenRouterModelRegistryData;
  const typedRoutes = routes as OpenRouterRouteRegistryData;
  const typedProfiles = profileEntries.filter(isRecord);
  const runtimeHash = isRecord(runtime)
    ? artifactHash("vlatam-ai-lab:openrouter-sandbox-runtime:v1", runtime)
    : null;
  const glmGovernance = evaluateGlmGovernanceArtifacts();
  const glmPreflight = await evaluateGlmFirstRunPreflight();
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
      preflightResult.outcome !== "invalid_configuration" &&
      activationResult.outcome !== "invalid_review" &&
      goldCaseResult.outcome !== "invalid_gold_case" &&
      glmGovernance.outcome !== "invalid",
    source_errors: [...new Set(sourceErrors)].sort(),
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
      outcome: preflightResult.outcome,
      reason_codes: preflightResult.reasons,
      source_artifact_id: preflightResult.configuration_id ?? null,
      source_artifact_hash: runtimeHash,
      runtime_config_id:
        preflightResult.configuration_id ??
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
      status: typedRuntime?.budget_enabled === true ? "enabled" : "disabled",
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
      ...Object.values(APPROVED_ARTIFACTS),
      "config/ai-openrouter-glm-readiness-dossier.json",
      "config/ai-openrouter-glm-external-evidence-pack.json",
      "config/ai-openrouter-glm-supervised-enablement-proposal.json",
      "config/ai-openrouter-glm-first-run-runtime.json",
      "config/ai-openrouter-glm-activation-review.json",
      "config/ai-openrouter-glm-capability-acceptance.json",
      "config/ai-openrouter-glm-pricing-policy-candidate.json",
      "config/ai-openrouter-glm-zdr-review-candidate.json",
      "config/ai-commercial-document-pilot-operation.json",
    ],
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
      },
    ],
  };
  return buildOperatorReadModel(input);
}

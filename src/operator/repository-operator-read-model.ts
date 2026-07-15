import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
  evaluateOpenRouterSandboxPreflight,
  type OpenRouterSandboxRuntimeConfig,
} from "../providers/openrouter-sandbox-preflight.js";
import {
  buildOperatorReadModel,
  type OperatorReadModel,
  type OperatorReadModelInput,
} from "./operator-read-model.js";

export const REPOSITORY_OPERATOR_EVALUATED_AT =
  "2026-07-14T23:30:00.000Z" as const;

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
  const input: OperatorReadModelInput = {
    evaluated_at: options.evaluated_at,
    source_valid:
      sourceErrors.length === 0 &&
      readinessResult.outcome !== "invalid_dossier" &&
      evidenceResult.outcome !== "invalid_pack" &&
      proposalResult.outcome !== "invalid_proposal" &&
      preflightResult.outcome !== "invalid_configuration",
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
        hash:
          typeof bindings.profile_hash === "string"
            ? bindings.profile_hash
            : null,
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
    audit_references: Object.values(APPROVED_ARTIFACTS),
  };
  return buildOperatorReadModel(input);
}

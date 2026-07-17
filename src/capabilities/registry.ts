/**
 * AI-71 capability contracts — typed definition registry.
 *
 * The registry is the read-only, in-memory view of the AI-70 catalog
 * (`config/ai-capabilities.json`) plus the per-capability policy
 * declarations. It is the single entry point that domain code uses
 * to look up a capability's contract.
 *
 * The registry is **definition-only**. It does not:
 *  - select a provider;
 *  - select a model;
 *  - execute a capability;
 *  - call a gateway;
 *  - rank profiles;
 *  - enforce privacy or budgets;
 *  - perform benchmarking.
 *
 * Its only job is to answer the questions:
 *
 *  - "Is this capability ID known to the catalog?" (yes / no)
 *  - "What does the contract for this capability look like?"
 *  - "What schema validates the input? the output?"
 *  - "What is the declared human-review and downstream policy?"
 *
 * Anything beyond that is AI-72 through AI-78.
 *
 * The registry is loaded lazily on the first call to
 * `getCapabilityDefinition`, `listCapabilityDefinitions`, or
 * `assertCapabilitySupported`. After load, the registry is cached in
 * module state. Tests can call `isLoaded` to assert loading
 * behavior, and may call `loadCapabilityRegistry` to force a reload
 * after editing the catalog on disk (in test setups).
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Ajv2020 as AjvClass } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

import catalogSchema from "../../schemas/ai-capabilities.schema.json" with { type: "json" };
import {
  CAPABILITY_DOMAINS,
  CAPABILITY_RISK_TIERS,
  CAPABILITY_STATUSES,
  PROVIDER_EXECUTION_VALUES,
  isCapabilityDomain,
  isCapabilityId,
  isCapabilityRiskTier,
  isCapabilityStatus,
  isProviderExecution,
} from "./contracts.js";
import type {
  CapabilityDefinition,
  CapabilityDomain,
  CapabilityId,
  CapabilityPolicy,
  CapabilityRiskTier,
  CapabilityStatus,
  DownstreamPolicy,
  ProviderExecution,
} from "./contracts.js";
import {
  CAPABILITY_ID_PATTERN,
  CAPABILITY_CONTRACT_VERSION,
} from "./version.js";
import { validateCapabilityDefinition, validatePolicy } from "./validation.js";
import type { ValidationResult } from "./validation.js";
import {
  DOMAIN_CAPABILITY_BINDINGS,
  getDomainCapabilityBinding,
} from "./bindings.js";

// ESM/CJS interop for ajv-formats
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const applyFormats = ((addFormatsModule as any).default ??
  addFormatsModule) as (ajv: AjvClass) => void;

interface CatalogRow {
  capability_id: string;
  name: string;
  domain: string;
  status: string;
  risk_tier: string;
  human_review: boolean;
  downstream_policy: DownstreamPolicy;
  provider_execution: string;
  roadmap_owner: string;
}

interface CatalogFile {
  schema_version: string;
  generated_by?: string;
  generated_at?: string;
  description?: string;
  allowed_status: string[];
  allowed_risk_tier: string[];
  allowed_provider_execution: string[];
  allowed_human_review: boolean[];
  capabilities: CatalogRow[];
}

/**
 * Path resolution: the catalog is loaded from a path relative to the
 * `src/capabilities/` directory. The default `repoRoot` is two
 * directories up. Tests and the CLI can override `repoRoot` via
 * `loadCapabilityRegistry({ repoRoot })`.
 */
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = resolve(MODULE_DIR, "..", "..");
const DEFAULT_CATALOG_PATH = resolve(
  DEFAULT_REPO_ROOT,
  "config",
  "ai-capabilities.json",
);

/**
 * Explicit policy overrides. The map is empty by default; rows here
 * replace the derived `CapabilityPolicy` for the listed capability.
 * Adding to the map is an explicit, auditable act.
 */
const POLICY_OVERRIDES: ReadonlyMap<string, CapabilityPolicy> = new Map();

/**
 * Default input/output schema references for catalog capabilities
 * that do not yet have a binding. The map is intentionally explicit:
 * every catalog row either has a binding or has an entry here, and
 * the test in `tests/capabilities/registry.test.ts` asserts that
 * fact. Capabilities that are `partial` / `planned` / `out_of_scope`
 * may use a `null` schema reference; the registry returns `null`
 * rather than fabricating a schema path.
 */
const DEFAULT_SCHEMA_REFS: ReadonlyMap<
  string,
  { input: string | null; output: string | null }
> = new Map([
  // Source layer
  [
    "source.acquisition.monitor",
    { input: null, output: "schemas/source-monitor-delta.schema.json" },
  ],
  [
    "source.snapshot.write",
    { input: null, output: "schemas/intelligence-source-snapshot.schema.json" },
  ],
  [
    "source.delta.detect",
    {
      input: "schemas/intelligence-source-snapshot.schema.json",
      output: "schemas/delta-analyzer-evidence-packet.schema.json",
    },
  ],
  [
    "source.snapshot.embedded_evidence_demo",
    { input: null, output: "schemas/extractable-evidence-packet.schema.json" },
  ],
  ["source.acquisition.cloudflare_pipeline_v1", { input: null, output: null }],
  ["source.acquisition.multi_country", { input: null, output: null }],
  // Evidence layer
  [
    "evidence.extraction.qwen_dashscope",
    {
      input: "schemas/extractable-evidence-packet.schema.json",
      output: "schemas/ai-extraction-result.schema.json",
    },
  ],
  [
    "evidence.extraction.langgraph_workflow",
    {
      input: "schemas/extractable-evidence-packet.schema.json",
      output: "schemas/ai-extraction-result.schema.json",
    },
  ],
  [
    "evidence.extraction.critic_review",
    {
      input: "schemas/ai-extraction-result.schema.json",
      output: "schemas/ai-extraction-result.schema.json",
    },
  ],
  [
    "commercial.document.extraction",
    {
      input: null,
      output: "schemas/ai-commercial-document-extraction.schema.json",
    },
  ],
  ["evidence.embedding.bge_m3", { input: null, output: null }],
  ["evidence.embedding.refresh", { input: null, output: null }],
  // Review and export layer
  [
    "artifact.export_catalog.generate",
    {
      input: "schemas/classifier-approved-artifact-export-contract.schema.json",
      output: "schemas/classifier-approved-artifact-export-catalog.schema.json",
    },
  ],
  ["artifact.export_bundle.consumer_contract", { input: null, output: null }],
  // Advisory layer
  [
    "source.regulatory_research.advisory_input",
    { input: null, output: "schemas/extractable-evidence-packet.schema.json" },
  ],
  [
    "evidence.regulatory_research.question_prep",
    {
      input: "schemas/extractable-evidence-packet.schema.json",
      output: "schemas/extractable-evidence-packet.schema.json",
    },
  ],
  [
    "review.human.gate.regulatory_research",
    {
      input: "schemas/extractable-evidence-packet.schema.json",
      output: "schemas/extractable-evidence-packet.schema.json",
    },
  ],
  // Provider execution layer
  ["provider.execution.cloudflare_ai_gateway", { input: null, output: null }],
  ["provider.execution.deepseek_direct", { input: null, output: null }],
  ["provider.execution.qwen_dashscope_runtime", { input: null, output: null }],
  ["provider.execution.local_runtime", { input: null, output: null }],
  // Governance layer
  ["governance.privacy.zdr", { input: null, output: null }],
  ["governance.data.classification", { input: null, output: null }],
  ["governance.budget.cost_governor", { input: null, output: null }],
  [
    "governance.allowlist.providers",
    { input: "schemas/ai-capabilities.schema.json", output: null },
  ],
  ["governance.audit.record", { input: null, output: null }],
  ["governance.fail_closed", { input: null, output: null }],
  // Evaluation layer
  ["evaluation.gold_cases", { input: null, output: null }],
  ["evaluation.evaluator", { input: null, output: null }],
  ["evaluation.benchmark.run", { input: null, output: null }],
  ["evaluation.profile.promote", { input: null, output: null }],
  // Routing layer
  ["routing.best_profile", { input: null, output: null }],
  ["routing.lifecycle.production", { input: null, output: null }],
  ["routing.lifecycle.shadow", { input: null, output: null }],
]);

/**
 * The internal store, keyed by capability_id. The store is built
 * once on first load and reused on subsequent lookups.
 */
interface RegistryState {
  byId: Map<string, CapabilityDefinition>;
  loadErrors: readonly string[];
  loadedAt?: string;
}

let state: RegistryState | null = null;

/**
 * The handle returned by `loadCapabilityRegistry`. The handle is
 * stable and safe to cache in callers. The handle exposes the same
 * functions as the module-level `getCapabilityDefinition`,
 * `listCapabilityDefinitions`, and `assertCapabilitySupported`.
 */
export interface CapabilityRegistry {
  get(capabilityId: CapabilityId): CapabilityDefinition | undefined;
  list(): readonly CapabilityDefinition[];
  has(capabilityId: CapabilityId): boolean;
  assertSupported(capabilityId: string): CapabilityDefinition;
  loadErrors(): readonly string[];
  loadedAt(): string | undefined;
}

function isCatalogRowShape(value: unknown): value is CatalogRow {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["capability_id"] === "string" &&
    typeof v["name"] === "string" &&
    typeof v["domain"] === "string" &&
    typeof v["status"] === "string" &&
    typeof v["risk_tier"] === "string" &&
    typeof v["human_review"] === "boolean" &&
    typeof v["roadmap_owner"] === "string" &&
    typeof v["provider_execution"] === "string" &&
    typeof v["downstream_policy"] === "object" &&
    v["downstream_policy"] !== null
  );
}

function asCapabilityId(value: string): CapabilityId {
  // The catalog is validated by the AI-70 schema; this assertion is a
  // belt-and-suspenders check on top of the structural validation.
  if (!CAPABILITY_ID_PATTERN.test(value)) {
    throw new Error(
      `Catalog row carries an invalid capability_id: ${JSON.stringify(value)}`,
    );
  }
  return value as CapabilityId;
}

function deriveDefaultPolicy(
  row: CatalogRow,
  hasBinding: boolean,
): CapabilityPolicy {
  const privacyTier: "standard" | "sensitive" | "regulated" | "restricted" =
    row.risk_tier === "high"
      ? "regulated"
      : row.risk_tier === "medium"
        ? "sensitive"
        : "standard";
  const redactFields: readonly string[] =
    row.risk_tier === "high"
      ? ["supplier_names", "prices", "bank_data", "broker_pii"]
      : row.risk_tier === "medium"
        ? ["broker_pii"]
        : [];

  const budget: CapabilityPolicy["budget_requirement"] =
    row.provider_execution === "required"
      ? { max_cost_usd: 1.0, window: "per_request" }
      : row.provider_execution === "optional"
        ? { max_cost_usd: 1.0, window: "per_request" }
        : { window: "per_request" };

  const evaluation: CapabilityPolicy["evaluation_requirement"] = {
    gold_case_required: row.human_review && row.risk_tier === "high",
    metric_set: row.human_review
      ? ["quality", "latency", "cost", "safety"]
      : ["quality"],
  };

  return {
    human_review_policy: row.human_review
      ? {
          required: true,
          reason: row.downstream_policy.reason,
          no_auto_approval: true,
          review_state_required: "reviewed_approved",
        }
      : {
          required: false,
          reason: row.downstream_policy.reason,
          no_auto_approval: false,
        },
    downstream_policy: {
      downstream_allowed: row.downstream_policy.downstream_allowed,
      reason: row.downstream_policy.reason,
    },
    privacy_requirement: {
      tier: privacyTier,
      zdr_required: row.risk_tier === "high",
      redact_fields: redactFields,
      retention_class:
        row.risk_tier === "high" ? "audit_with_payload" : "audit_only",
    },
    budget_requirement: budget,
    evaluation_requirement: evaluation,
    execution_requirement: {
      provider_execution: row.provider_execution as ProviderExecution,
      deterministic_fallback: row.provider_execution === "none" || hasBinding,
    },
  };
}

function buildDefinition(row: CatalogRow): {
  definition?: CapabilityDefinition;
  errors: string[];
} {
  const id = asCapabilityId(row.capability_id);
  const binding = getDomainCapabilityBinding(id);
  const override = POLICY_OVERRIDES.get(row.capability_id);
  const policy = override ?? deriveDefaultPolicy(row, Boolean(binding));

  const defaultSchemaRefs = DEFAULT_SCHEMA_REFS.get(row.capability_id);
  const inputSchemaRef =
    binding?.input_schema_ref ?? defaultSchemaRefs?.input ?? null;
  const outputSchemaRef =
    binding?.output_schema_ref ?? defaultSchemaRefs?.output ?? null;

  if (!binding && !defaultSchemaRefs) {
    return {
      errors: [
        `capability ${row.capability_id} has no binding and no default schema reference; add one of the two`,
      ],
    };
  }

  // Cross-validate: the catalog's downstream_policy must agree with
  // the binding's downstream flag. Mismatches are reported as
  // warnings but do not fail the load.
  const crossWarnings: string[] = [];
  if (binding) {
    if (binding.human_review_required !== row.human_review) {
      crossWarnings.push(
        `human_review mismatch between catalog (${row.human_review}) and binding (${binding.human_review_required}) for ${row.capability_id}`,
      );
    }
    if (
      binding.downstream_allowed !== row.downstream_policy.downstream_allowed
    ) {
      crossWarnings.push(
        `downstream_allowed mismatch between catalog (${String(row.downstream_policy.downstream_allowed)}) and binding (${String(binding.downstream_allowed)}) for ${row.capability_id}`,
      );
    }
  }

  const candidate: CapabilityDefinition = {
    capability_id: id,
    name: row.name,
    domain: row.domain as CapabilityDomain,
    status: row.status as CapabilityStatus,
    risk_tier: row.risk_tier as CapabilityRiskTier,
    human_review: row.human_review,
    downstream_policy: {
      downstream_allowed: row.downstream_policy.downstream_allowed,
      reason: row.downstream_policy.reason,
    },
    provider_execution: row.provider_execution as ProviderExecution,
    roadmap_owner: row.roadmap_owner,
    input_schema_ref: inputSchemaRef,
    output_schema_ref: outputSchemaRef,
    policy,
  };

  const definitionValidation = validateCapabilityDefinition(candidate);
  const policyValidation = validatePolicy(
    candidate.policy,
    "definition.policy",
  );
  if (!definitionValidation.ok || !policyValidation.ok) {
    const errors: string[] = [];
    if (!definitionValidation.ok) errors.push(...definitionValidation.errors);
    if (!policyValidation.ok) errors.push(...policyValidation.errors);
    return { errors };
  }

  return { definition: candidate, errors: crossWarnings };
}

function validateCatalogShape(catalog: unknown): ValidationResult {
  if (typeof catalog !== "object" || catalog === null) {
    return { ok: false, errors: ["catalog must be an object"] };
  }
  const errors: string[] = [];
  const c = catalog as Record<string, unknown>;
  if (!Array.isArray(c["capabilities"])) {
    errors.push("catalog.capabilities must be an array");
  } else {
    c["capabilities"].forEach((row: unknown, index: number) => {
      if (!isCatalogRowShape(row)) {
        errors.push(`catalog.capabilities[${index}] is not a valid row shape`);
      }
    });
  }
  if (!Array.isArray(c["allowed_status"]))
    errors.push("catalog.allowed_status must be an array");
  if (!Array.isArray(c["allowed_risk_tier"]))
    errors.push("catalog.allowed_risk_tier must be an array");
  if (!Array.isArray(c["allowed_provider_execution"])) {
    errors.push("catalog.allowed_provider_execution must be an array");
  }
  if (!Array.isArray(c["allowed_human_review"])) {
    errors.push("catalog.allowed_human_review must be an array");
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function loadInternal(repoRoot: string): RegistryState {
  const catalogPath = resolve(repoRoot, "config", "ai-capabilities.json");
  if (!existsSync(catalogPath)) {
    return {
      byId: new Map(),
      loadErrors: [`catalog file not found at ${catalogPath}`],
    };
  }

  const raw = readFileSync(catalogPath, "utf-8");
  let catalog: unknown;
  try {
    catalog = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      byId: new Map(),
      loadErrors: [`failed to parse catalog JSON: ${message}`],
    };
  }

  // Validate against the AI-70 schema.
  const ajv = new AjvClass({ allErrors: true, strict: false });
  applyFormats(ajv);
  const validate = ajv.compile(catalogSchema);
  if (!validate(catalog)) {
    const errors = (validate.errors ?? []).map(
      (err) => `${err.instancePath || "root"}: ${err.message}`,
    );
    return {
      byId: new Map(),
      loadErrors: [`catalog failed schema validation: ${errors.join("; ")}`],
    };
  }

  // Belt-and-suspenders shape check.
  const shape = validateCatalogShape(catalog);
  if (!shape.ok) {
    return { byId: new Map(), loadErrors: shape.errors };
  }

  const typedCatalog = catalog as unknown as CatalogFile;
  const byId = new Map<string, CapabilityDefinition>();
  const loadErrors: string[] = [];

  for (const row of typedCatalog.capabilities) {
    if (!isCapabilityId(row.capability_id)) {
      loadErrors.push(
        `catalog row has malformed capability_id: ${row.capability_id}`,
      );
      continue;
    }
    if (!isCapabilityStatus(row.status)) {
      loadErrors.push(
        `catalog row ${row.capability_id} has unknown status ${row.status}`,
      );
      continue;
    }
    if (!isCapabilityRiskTier(row.risk_tier)) {
      loadErrors.push(
        `catalog row ${row.capability_id} has unknown risk_tier ${row.risk_tier}`,
      );
      continue;
    }
    if (!isCapabilityDomain(row.domain)) {
      loadErrors.push(
        `catalog row ${row.capability_id} has unknown domain ${row.domain}`,
      );
      continue;
    }
    if (!isProviderExecution(row.provider_execution)) {
      loadErrors.push(
        `catalog row ${row.capability_id} has unknown provider_execution ${row.provider_execution}`,
      );
      continue;
    }
    if (byId.has(row.capability_id)) {
      loadErrors.push(`catalog row ${row.capability_id} is duplicated`);
      continue;
    }
    const { definition, errors } = buildDefinition(row);
    if (errors.length > 0 && !definition) {
      loadErrors.push(...errors);
      continue;
    }
    if (errors.length > 0 && definition) {
      loadErrors.push(...errors);
    }
    if (definition) byId.set(row.capability_id, definition);
  }

  return { byId, loadErrors, loadedAt: new Date().toISOString() };
}

function getState(): RegistryState {
  if (state) return state;
  state = loadInternal(DEFAULT_REPO_ROOT);
  return state;
}

/**
 * Loads the registry. The default call uses the repository's
 * `config/ai-capabilities.json` file. Tests can pass a custom
 * `repoRoot` to point at a fixture. Returns a stable
 * `CapabilityRegistry` handle.
 */
export function loadCapabilityRegistry(
  options: { repoRoot?: string } = {},
): CapabilityRegistry {
  const repoRoot = options.repoRoot ?? DEFAULT_REPO_ROOT;
  const newState = loadInternal(repoRoot);
  state = newState;
  return fromState(newState);
}

function fromState(s: RegistryState): CapabilityRegistry {
  return {
    get: (capabilityId: CapabilityId) => s.byId.get(capabilityId),
    list: () => [...s.byId.values()],
    has: (capabilityId: CapabilityId) => s.byId.has(capabilityId),
    assertSupported: (capabilityId: string) =>
      assertSupportedInternal(capabilityId, s),
    loadErrors: () => s.loadErrors,
    loadedAt: () => s.loadedAt,
  };
}

function assertSupportedInternal(
  capabilityId: string,
  s: RegistryState,
): CapabilityDefinition {
  if (typeof capabilityId !== "string" || capabilityId.length === 0) {
    throw new UnknownCapabilityError(capabilityId, s.byId);
  }
  const def = s.byId.get(capabilityId);
  if (!def) {
    throw new UnknownCapabilityError(capabilityId, s.byId);
  }
  return def;
}

/**
 * Typed error thrown by the registry when an unknown or malformed
 * capability ID is requested. The error carries a small structured
 * payload so that callers can route the failure without re-parsing
 * the message.
 */
export class UnknownCapabilityError extends Error {
  readonly capability_id: string;
  readonly known_capability_ids: readonly string[];

  constructor(capabilityId: string, known: ReadonlyMap<string, unknown>) {
    const knownIds = [...known.keys()].sort();
    super(
      `Unknown capability_id ${JSON.stringify(capabilityId)}; known capabilities: ${knownIds.length}`,
    );
    this.name = "UnknownCapabilityError";
    this.capability_id = capabilityId;
    this.known_capability_ids = knownIds;
  }
}

/**
 * Looks up a `CapabilityDefinition` by ID. Returns `undefined` if
 * the capability is not in the catalog. The function loads the
 * catalog on first call.
 */
export function getCapabilityDefinition(
  capabilityId: CapabilityId,
): CapabilityDefinition | undefined {
  return getState().byId.get(capabilityId);
}

/**
 * Returns every `CapabilityDefinition` currently in the registry.
 * The list is in the catalog order (which is meaningful for the
 * capability map documentation).
 */
export function listCapabilityDefinitions(): readonly CapabilityDefinition[] {
  return [...getState().byId.values()];
}

/**
 * Returns `true` when the registry has a definition for the given
 * capability ID.
 */
export function hasCapabilityDefinition(capabilityId: CapabilityId): boolean {
  return getState().byId.has(capabilityId);
}

/**
 * Throws `UnknownCapabilityError` when the capability ID is not in
 * the catalog. Returns the definition otherwise. The error is the
 * typed fail-closed behavior that ADR-003 requires.
 */
export function assertCapabilitySupported(
  capabilityId: string,
): CapabilityDefinition {
  return assertSupportedInternal(capabilityId, getState());
}

/**
 * Returns `true` if the registry has already loaded the catalog.
 * Used by tests to assert the lazy-load behavior.
 */
export function isLoaded(): boolean {
  return state !== null;
}

/**
 * Resets the in-memory registry state. Intended for tests; not part
 * of the public contract.
 *
 * @internal
 */
export function _resetForTests(): void {
  state = null;
}

// Re-export the schema module so the registry can be re-validated
// without re-importing ajv in tests.
export const _catalogSchema = catalogSchema;

/**
 * Constants exposed for tests and downstream tooling.
 */
export const _CONSTANTS = {
  CAPABILITY_DOMAINS,
  CAPABILITY_RISK_TIERS,
  CAPABILITY_STATUSES,
  PROVIDER_EXECUTION_VALUES,
  CAPABILITY_CONTRACT_VERSION,
  DOMAIN_CAPABILITY_BINDINGS,
  DEFAULT_REPO_ROOT,
  DEFAULT_CATALOG_PATH,
} as const;

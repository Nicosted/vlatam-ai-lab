/**
 * AI-71 capability contracts — core types.
 *
 * This module defines the provider-neutral, version-stable types that
 * domain workflows use to request AI capabilities and to consume their
 * results. The contracts in this file are the seam between the domain
 * layer and the future model-execution, governance, evaluation, and
 * routing layers (AI-72 through AI-78).
 *
 * Invariants enforced by these types (full statement in
 * `docs/architecture/ai-capability-contracts.md`):
 *
 *  1. A capability request NEVER carries provider, model, profile,
 *     credential, or routing metadata. Provider selection is a routing
 *     concern (AI-78) and is forbidden in the domain-facing request
 *     envelope.
 *  2. A capability result NEVER leaks provider or reviewer metadata.
 *     The governance block expresses downstream eligibility explicitly;
 *     raw provider responses are normalized upstream by adapters and
 *     are not part of this contract.
 *  3. A `succeeded` result does NOT imply downstream approval. Approval
 *     is the result of a separate review capability
 *     (`review.human.gate`).
 *  4. `failed` and `blocked` results fail closed. A blocked result can
 *     never be downstream-allowed.
 *  5. Missing evidence is explicit. The `MISSING_EVIDENCE` error code
 *     exists so that absent evidence is never represented as a silent
 *     assumption.
 *
 * The types in this file are intentionally narrow: they describe shape
 * and semantics, not behavior. Validation lives in `validation.ts`;
 * the catalog-backed registry lives in `registry.ts`; policy shapes
 * live in `policy.ts`; the error model lives in `error.ts`.
 */

import type {
  BudgetRequirement,
  EvaluationRequirement,
  ExecutionRequirement,
  HumanReviewPolicy,
  PrivacyRequirement,
} from "./policy.js";
import { CAPABILITY_ID_PATTERN, SEMVER_PATTERN } from "./version.js";

/**
 * Allowed values for the `status` field of a `CapabilityDefinition`.
 *
 * Mirrors the catalog's `allowed_status` enum
 * (`config/ai-capabilities.json`).
 */
export const CAPABILITY_STATUSES = [
  "existing",
  "partial",
  "planned",
  "out_of_scope",
  "retired",
] as const;
export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];

/**
 * Allowed values for the `risk_tier` field of a `CapabilityDefinition`.
 *
 * Mirrors the catalog's `allowed_risk_tier` enum.
 */
export const CAPABILITY_RISK_TIERS = ["low", "medium", "high"] as const;
export type CapabilityRiskTier = (typeof CAPABILITY_RISK_TIERS)[number];

/**
 * Allowed values for the `provider_execution` field of a
 * `CapabilityDefinition` and a `CapabilityPolicy.execution_requirement`.
 *
 * Mirrors the catalog's `allowed_provider_execution` enum.
 */
export const PROVIDER_EXECUTION_VALUES = [
  "required",
  "optional",
  "none",
] as const;
export type ProviderExecution = (typeof PROVIDER_EXECUTION_VALUES)[number];

/**
 * Allowed domain values for a `CapabilityDefinition`. Mirrors the
 * `domain` enum in the AI-70 catalog schema.
 */
export const CAPABILITY_DOMAINS = [
  "source",
  "evidence",
  "review",
  "export",
  "advisory",
  "provider",
  "governance",
  "evaluation",
  "routing",
] as const;
export type CapabilityDomain = (typeof CAPABILITY_DOMAINS)[number];

/**
 * A capability identifier is a stable, vendor-neutral dotted name.
 *
 * Examples:
 *   - `evidence.extraction.normative_claims`
 *   - `review.human.gate`
 *   - `artifact.approved.serve_http`
 *
 * Anti-examples (rejected by the contract):
 *   - `openai.gpt-5-classifier` (vendor + model)
 *   - `cloudflare.deepseek-production` (vendor + environment)
 *   - `qwen-plus.normative-extraction` (model + action)
 */
export type CapabilityId = string & {
  readonly __capabilityIdBrand: unique symbol;
};

/**
 * Outcome of a `CapabilityResult`. The contract deliberately uses a
 * closed set so that downstream consumers can branch safely.
 */
export const CAPABILITY_RESULT_STATUSES = [
  "succeeded",
  "failed",
  "blocked",
] as const;
export type CapabilityResultStatus =
  (typeof CAPABILITY_RESULT_STATUSES)[number];

/**
 * Allowed values for the `data_classification` field of
 * `CapabilityContext`. AI-71 shipped the four-value set
 * (`public`, `internal`, `regulated`, `restricted`); AI-73 added
 * `confidential` between `internal` and `regulated` as an additive
 * (MINOR) contract change — existing values keep their exact
 * semantics. Operational enforcement lives in `src/privacy/`
 * (AI-73): gateway-mediated execution now requires an explicit
 * classification and fails closed on missing or unknown values.
 */
export const DATA_CLASSIFICATIONS = [
  "public",
  "internal",
  "confidential",
  "regulated",
  "restricted",
] as const;
export type DataClassification = (typeof DATA_CLASSIFICATIONS)[number];

/**
 * Allowed values for the `downstream_use` field of `CapabilityContext`.
 * The values describe what the caller intends to do with the
 * capability output. They are declaration only; they do not authorize
 * the use, and they are not used to make routing decisions in AI-71.
 */
export const DOWNSTREAM_USE_VALUES = [
  "none",
  "evidence_packet",
  "classifier_candidate",
  "advisory_draft",
  "approved_export",
] as const;
export type DownstreamUse = (typeof DOWNSTREAM_USE_VALUES)[number];

/**
 * Type guard: returns `true` if the value is a structurally valid
 * capability identifier.
 */
export function isCapabilityId(value: unknown): value is CapabilityId {
  return typeof value === "string" && CAPABILITY_ID_PATTERN.test(value);
}

/**
 * Type guard: returns `true` if the value is a valid semver string.
 */
export function isSchemaVersion(value: unknown): value is string {
  return typeof value === "string" && SEMVER_PATTERN.test(value);
}

/**
 * Type guard: returns `true` if the value is a `CapabilityStatus`.
 */
export function isCapabilityStatus(value: unknown): value is CapabilityStatus {
  return (
    typeof value === "string" &&
    (CAPABILITY_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Type guard: returns `true` if the value is a `CapabilityRiskTier`.
 */
export function isCapabilityRiskTier(
  value: unknown,
): value is CapabilityRiskTier {
  return (
    typeof value === "string" &&
    (CAPABILITY_RISK_TIERS as readonly string[]).includes(value)
  );
}

/**
 * Type guard: returns `true` if the value is a `ProviderExecution`.
 */
export function isProviderExecution(
  value: unknown,
): value is ProviderExecution {
  return (
    typeof value === "string" &&
    (PROVIDER_EXECUTION_VALUES as readonly string[]).includes(value)
  );
}

/**
 * Type guard: returns `true` if the value is a `CapabilityDomain`.
 */
export function isCapabilityDomain(value: unknown): value is CapabilityDomain {
  return (
    typeof value === "string" &&
    (CAPABILITY_DOMAINS as readonly string[]).includes(value)
  );
}

/**
 * Type guard: returns `true` if the value is a `CapabilityResultStatus`.
 */
export function isCapabilityResultStatus(
  value: unknown,
): value is CapabilityResultStatus {
  return (
    typeof value === "string" &&
    (CAPABILITY_RESULT_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Type guard: returns `true` if the value is a `DataClassification`.
 */
export function isDataClassification(
  value: unknown,
): value is DataClassification {
  return (
    typeof value === "string" &&
    (DATA_CLASSIFICATIONS as readonly string[]).includes(value)
  );
}

/**
 * Type guard: returns `true` if the value is a `DownstreamUse`.
 */
export function isDownstreamUse(value: unknown): value is DownstreamUse {
  return (
    typeof value === "string" &&
    (DOWNSTREAM_USE_VALUES as readonly string[]).includes(value)
  );
}

/**
 * Sentinel type that forbids a property from being a non-empty value.
 * Used to express the contract rule "the request envelope MUST NOT
 * carry provider, model, profile, or credential fields". The runtime
 * validator (see `validation.ts`) walks the request and rejects
 * credential-shaped field names; this branded type is a static hint
 * for code review.
 *
 * @internal
 */
export type ForbiddenProviderField = never;

/**
 * A `CapabilityContext` is the per-invocation context that a domain
 * workflow attaches to a capability request.
 *
 * The context is declared, not authoritative. Every field is optional
 * because not every caller knows every fact; the contract does not
 * require callers to fabricate context that they do not have.
 * Operational enforcement of the context belongs to AI-73 / AI-74.
 */
export interface CapabilityContext {
  /** ISO 3166-1 alpha-2 country code, or a `country-list` slug. Optional. */
  readonly jurisdiction?: string;
  /** Identifier of the source (e.g. `infoleg`, `arca`, `vuce`). Optional. */
  readonly source_id?: string;
  /** Identifier of the artifact the request is operating on. Optional. */
  readonly artifact_id?: string;
  /** Cross-system correlation identifier (request trace). Optional. */
  readonly correlation_id?: string;
  /** Declared data classification of the request payload. Optional. */
  readonly data_classification?: DataClassification;
  /** Declared downstream use intent. Optional. */
  readonly downstream_use?: DownstreamUse;
  /** Caller-side actor or workflow category (e.g. `pcram.evidence_writer`). Optional. */
  readonly actor_category?: string;
  /** Caller-side workflow or stage identifier. Optional. */
  readonly workflow?: string;
  /** Caller-side timestamp. Optional; if absent, the runtime records its own. */
  readonly timestamp?: string;
  /** Additional, free-form context fields that the caller may attach. */
  readonly extras?: Readonly<Record<string, unknown>>;
}

/**
 * The `CapabilityRequest` envelope is what a domain workflow hands to
 * the capability layer. It is deliberately minimal:
 *
 *  - `request_id` is a stable per-invocation identifier chosen by the
 *    caller. It appears verbatim on the result and in audit records.
 *  - `capability_id` selects the catalog entry; unknown IDs fail closed.
 *  - `schema_version` pins the wire shape; unsupported MAJOR versions
 *    fail closed.
 *  - `input` is the typed input; the JSON Schema at
 *    `CapabilityDefinition.input_schema_ref` is the source of truth.
 *  - `context` is the per-invocation context.
 *
 * The request envelope does NOT carry provider, model, profile, or
 * credential fields. The contract shape (and the runtime validator in
 * `validation.ts`) rejects such fields when present.
 */
export interface CapabilityRequest<TInput = unknown> {
  readonly request_id: string;
  readonly capability_id: CapabilityId;
  readonly schema_version: string;
  readonly input: TInput;
  readonly context?: CapabilityContext;
}

/**
 * Governance block on a `CapabilityResult`. The contract treats the
 * governance fields as a single unit because the catalog invariant
 * "downstream_allowed: true requires human_review_required: false" is
 * expressed over the tuple.
 *
 * The contract deliberately uses an explicit `approval_state` string
 * rather than a free-form enum. AI-71 only defines the values that
 * matter for the contract surface; richer review semantics (reviewer
 * identity, timestamps) live upstream in the human-review capability
 * and are never present here.
 */
export interface ResultGovernance {
  /** Whether the capability itself requires explicit human judgment. */
  readonly human_review_required: boolean;
  /**
   * Whether the result is eligible to cross the approved export
   * boundary. The contract is explicit: `downstream_allowed: true`
   * requires `human_review_required: false` AND a `reviewed_approved`
   * upstream review (when applicable). See ADR-003 safety invariant
   * 9 and the `downstream_allowed=true` rule in `validation.ts`.
   */
  readonly downstream_allowed: boolean;
  /**
   * Approval state. The legal values are:
   *
   *   - `not_required` — the capability does not require human
   *     judgment and the result is not gated by a review.
   *   - `pending` — the capability requires human review and the
   *     review has not yet been applied.
   *   - `approved` — the capability requires human review and a
   *     `reviewed_approved` decision has been applied upstream. The
   *     result may be downstream-allowed only if the definition
   *     permits it.
   *   - `rejected` — the capability requires human review and a
   *     `reviewed_rejected` decision has been applied. The result is
   *     downstream-allowed: false.
   */
  readonly approval_state: "not_required" | "pending" | "approved" | "rejected";
}

/**
 * The `CapabilityResult` envelope is what the capability layer hands
 * back to a domain workflow. It mirrors `CapabilityRequest` on the
 * `request_id`, `capability_id`, and `schema_version` axes, and adds
 * the outcome, the typed output, the structured error, and the
 * governance block.
 *
 * Wire rules (enforced by `validation.ts`):
 *
 *  - `status: succeeded` requires `output` and a fully-populated
 *    `governance` block. `error` must be absent.
 *  - `status: failed` requires a structured `error` of category
 *    `execution` (or `internal`). `output` must be absent.
 *  - `status: blocked` requires a structured `error` of category
 *    `policy`. `output` must be absent, and `governance.downstream_allowed`
 *    must be `false`.
 *  - The contract forbids leaking provider response objects, prompt
 *    hashes, model names, or reviewer identity into `output`. The
 *    validator rejects credential-shaped field names in `output`.
 */
export interface CapabilityResult<TOutput = unknown> {
  readonly request_id: string;
  readonly capability_id: CapabilityId;
  readonly schema_version: string;
  readonly status: CapabilityResultStatus;
  readonly output?: TOutput;
  readonly error?: import("./error.js").CapabilityError;
  readonly governance: ResultGovernance;
}

/**
 * `DownstreamPolicy` mirrors the catalog's per-capability declaration.
 * The boolean values express the same rule the catalog enforces:
 *
 *  - `true` — the capability may produce a downstream-eligible result.
 *  - `false` — the capability NEVER produces a downstream-eligible
 *    result.
 *  - `'conditional'` — the capability may be downstream-eligible when
 *    an explicit upstream precondition is satisfied (typically
 *    `review.human.gate` returning `reviewed_approved`). The runtime
 *    check lives in `validation.ts`.
 */
export interface DownstreamPolicy {
  readonly downstream_allowed: boolean | "conditional";
  readonly reason: string;
}

/**
 * `CapabilityDefinition` is the typed view of a row in
 * `config/ai-capabilities.json`, augmented with the schema references
 * and the explicit `CapabilityPolicy` block that AI-71 introduces.
 *
 * The definition is a description, not a behavior. It does not select
 * a provider, pick a model, or carry credentials. The registry that
 * exposes `CapabilityDefinition` values (see `registry.ts`) is
 * definition-only and must not be used to execute a capability.
 */
export interface CapabilityDefinition {
  readonly capability_id: CapabilityId;
  readonly name: string;
  readonly domain: CapabilityDomain;
  readonly status: CapabilityStatus;
  readonly risk_tier: CapabilityRiskTier;
  readonly human_review: boolean;
  readonly downstream_policy: DownstreamPolicy;
  readonly provider_execution: ProviderExecution;
  readonly roadmap_owner: string;
  /**
   * Relative path to the JSON Schema that validates
   * `CapabilityRequest.input`. `null` means "the schema is not yet
   * declared; this capability has not been bound to a concrete input
   * shape in the binding layer". A `null` value is allowed for
   * `partial` / `planned` / `out_of_scope` / `retired` capabilities.
   */
  readonly input_schema_ref: string | null;
  /**
   * Relative path to the JSON Schema that validates
   * `CapabilityResult.output`. See `input_schema_ref` for semantics
   * of `null`.
   */
  readonly output_schema_ref: string | null;
  /** Declarative policy block. AI-71 only models; AI-72+ enforces. */
  readonly policy: CapabilityPolicy;
  /** Optional human-readable description. */
  readonly description?: string;
}

/**
 * `CapabilityPolicy` aggregates the four requirement blocks defined in
 * `policy.ts`. The contract is explicit: every block is required
 * (even if empty) so that the absence of a requirement is itself a
 * statement, not a silent default.
 */
export interface CapabilityPolicy {
  readonly human_review_policy: HumanReviewPolicy;
  readonly downstream_policy: DownstreamPolicy;
  readonly privacy_requirement: PrivacyRequirement;
  readonly budget_requirement: BudgetRequirement;
  readonly evaluation_requirement: EvaluationRequirement;
  readonly execution_requirement: ExecutionRequirement;
}

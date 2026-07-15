import { createHash } from "node:crypto";

import goldCaseJson from "../../config/ai-openrouter-sandbox-gold-case.json" with { type: "json" };
import fixtureJson from "../../data/fixtures/providers/openrouter-normative-claim-synthetic-v1.json" with { type: "json" };
import { canonicalizeOpenRouterRegistryJson } from "./openrouter-registry.js";

/**
 * Governed synthetic gold case and deterministic acceptance contract for the
 * single OpenRouter sandbox activation candidate. The gold case is entirely
 * synthetic, carries no customer, personal, production, privileged, or
 * regulated data, and prepares exactly one later live request. This module is
 * metadata-only: it never invokes an adapter, gateway, transport, secret, or
 * network resource, and it never fabricates an execution result.
 */

export const OPENROUTER_SANDBOX_GOLD_CASE_CONTRACT_VERSION = "1.0.0" as const;
export const OPENROUTER_SANDBOX_GOLD_CASE_HASH_DOMAIN =
  "vlatam-ai-lab:openrouter-sandbox-gold-case:v1" as const;
export const OPENROUTER_FIRST_RUN_FIXTURE_HASH_DOMAIN =
  "vlatam-ai-lab:openrouter-first-run-fixture:v1" as const;

export const OPENROUTER_SANDBOX_GOLD_CASE_CAMPAIGN_STATUSES = [
  "prepared_not_executed",
] as const;

export const OPENROUTER_SANDBOX_GOLD_CASE_ACCEPTANCE_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const;

export type OpenRouterSandboxGoldCaseOutcome =
  | "invalid_gold_case"
  | "prepared_pending_acceptance"
  | "accepted"
  | "rejected";

export interface OpenRouterSandboxGoldCaseAcceptanceCriteria {
  readonly acceptance_contract_version: typeof OPENROUTER_SANDBOX_GOLD_CASE_CONTRACT_VERSION;
  readonly scoring_method: "deterministic_rule_based_v1";
  readonly output_schema_validity_required: true;
  readonly minimum_required_claim_recall: "all";
  readonly maximum_unsupported_claims: 0;
  readonly evidence_reference_rule: "verbatim_source_substring";
  readonly required_uncertainty_substrings: readonly string[];
  readonly prohibited_conclusion_substrings: readonly string[];
  readonly expected_provider_id: "openrouter";
  readonly expected_model_id: "minimax/minimax-m2.7";
  readonly usage_metadata_required: true;
  readonly cost_metadata_compatibility: "usd_micro_integer_ceiling";
  readonly maximum_cost_usd_micro: string;
  readonly maximum_latency_ms: number;
  readonly timeout_behavior: "fail_closed_no_result";
  readonly maximum_automatic_retries: 0;
  readonly fallback_allowed: false;
}

export interface OpenRouterSandboxGoldCase {
  readonly gold_case_contract_version: typeof OPENROUTER_SANDBOX_GOLD_CASE_CONTRACT_VERSION;
  readonly gold_case_id: string;
  readonly gold_case_version: string;
  readonly canonicalization_version: "registry-json-v1";
  readonly capability_id: "evidence.extraction.normative_claims";
  readonly classification: "synthetic";
  readonly created_by: string;
  readonly created_at: string;
  readonly fixture_binding: {
    readonly fixture_id: string;
    readonly fixture_path: string;
    readonly fixture_hash: string;
    readonly classification: "synthetic";
  };
  readonly input: {
    readonly source_title: string;
    readonly source_text: string;
    readonly data_provenance: "entirely_synthetic";
    readonly contains_customer_data: false;
    readonly contains_personal_data: false;
    readonly contains_production_data: false;
    readonly contains_privileged_data: false;
    readonly contains_regulated_data: false;
  };
  readonly expected_output: {
    readonly required_top_level_fields: readonly ["claims", "uncertainty"];
    readonly minimum_claims: number;
    readonly claim_fields: readonly ["claim_id", "claim", "evidence"];
    readonly required_claims: readonly {
      readonly claim_id: string;
      readonly claim_contains: string;
      readonly evidence_exact: string;
    }[];
    readonly evidence_must_be_source_substring: true;
    readonly claim_ids_unique: true;
    readonly additional_properties_allowed: false;
  };
  readonly usage_restrictions: {
    readonly legal_advice_prohibited: true;
    readonly automatic_downstream_publication_prohibited: true;
    readonly human_review_required: true;
    readonly single_live_request_only: true;
  };
  readonly acceptance_contract: OpenRouterSandboxGoldCaseAcceptanceCriteria;
  readonly campaign_status: "prepared_not_executed";
  readonly execution_results: readonly never[];
  readonly human_acceptance: {
    readonly status: "pending" | "approved" | "rejected";
    readonly reviewer_id: string | null;
    readonly reviewer_role: "evidence_reviewer" | null;
    readonly decided_at: string | null;
    readonly reason: string | null;
    readonly accepted_gold_case_hash: string | null;
  };
  readonly gold_case_hash: string;
}

export interface OpenRouterSandboxGoldCaseEvaluation {
  readonly contract_version: typeof OPENROUTER_SANDBOX_GOLD_CASE_CONTRACT_VERSION;
  readonly gold_case_id: string | null;
  readonly evaluated_at: string;
  readonly outcome: OpenRouterSandboxGoldCaseOutcome;
  readonly reason_codes: readonly string[];
  readonly campaign_status: string | null;
  readonly acceptance_status: string | null;
  readonly execution_performed: false;
  readonly provider_call_performed: false;
}

/**
 * Synthetic observation shape for the deterministic scorer. Observations are
 * constructed only from synthetic test data today; a later, separately
 * approved PR may map one real sandbox response into this shape.
 */
export interface OpenRouterGoldCaseObservation {
  readonly observed_provider_id: string | null;
  readonly observed_model_id: string | null;
  readonly structured_output: unknown;
  readonly usage_metadata_present: boolean;
  readonly cost_metadata: { readonly total_usd_micro: string } | null;
  readonly latency_ms: number;
  readonly timed_out: boolean;
  readonly automatic_retries_used: number;
  readonly fallback_used: boolean;
}

export interface OpenRouterGoldCaseScore {
  readonly outcome: "candidate_result_for_human_review" | "rejected_result";
  readonly reason_codes: readonly string[];
  readonly checks: Readonly<Record<string, boolean>>;
  readonly required_claim_recall: {
    readonly matched: number;
    readonly required: number;
  };
  readonly unsupported_claim_count: number;
  readonly human_acceptance_granted: false;
}

const ID = /^[a-z0-9][a-z0-9._:-]+$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const HASH = /^[a-f0-9]{64}$/;
const USD_MICRO = /^(0|[1-9]\d*)$/;
const LEAK =
  /(api[_-]?key|password|bearer\s|sk-or-|authorization[_-]?token|customer[_-]?(name|email)|passport|tax[_-]?id)/i;

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

export function computeOpenRouterFirstRunFixtureHash(value: unknown): string {
  return domainHash(OPENROUTER_FIRST_RUN_FIXTURE_HASH_DOMAIN, value);
}

export function computeOpenRouterSandboxGoldCaseHash(value: unknown): string {
  const normalized = isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).filter(([key]) => key !== "gold_case_hash"),
      )
    : value;
  return domainHash(OPENROUTER_SANDBOX_GOLD_CASE_HASH_DOMAIN, normalized);
}

export function loadOpenRouterSandboxGoldCase(): OpenRouterSandboxGoldCase {
  return structuredClone(goldCaseJson) as unknown as OpenRouterSandboxGoldCase;
}

export function loadOpenRouterFirstRunFixture(): unknown {
  return structuredClone(fixtureJson);
}

export function evaluateOpenRouterSandboxGoldCase(
  value: unknown,
  evaluatedAt: Date,
  fixture: unknown = loadOpenRouterFirstRunFixture(),
): OpenRouterSandboxGoldCaseEvaluation {
  const invalid = new Set<string>();
  const safe = isRecord(value) ? value : {};
  const base = {
    contract_version: OPENROUTER_SANDBOX_GOLD_CASE_CONTRACT_VERSION,
    gold_case_id:
      typeof safe["gold_case_id"] === "string" ? safe["gold_case_id"] : null,
    evaluated_at: evaluatedAt.toISOString(),
    campaign_status:
      typeof safe["campaign_status"] === "string"
        ? safe["campaign_status"]
        : null,
    acceptance_status:
      isRecord(safe["human_acceptance"]) &&
      typeof safe["human_acceptance"]["status"] === "string"
        ? safe["human_acceptance"]["status"]
        : null,
    execution_performed: false as const,
    provider_call_performed: false as const,
  };
  const finish = (
    outcome: OpenRouterSandboxGoldCaseOutcome,
    reasons: ReadonlySet<string>,
  ): OpenRouterSandboxGoldCaseEvaluation =>
    deepFreeze({ ...base, outcome, reason_codes: [...reasons].sort() });

  if (!isRecord(value)) {
    invalid.add("gold_case_not_object");
    return finish("invalid_gold_case", invalid);
  }
  if (
    value["gold_case_contract_version"] !==
    OPENROUTER_SANDBOX_GOLD_CASE_CONTRACT_VERSION
  )
    invalid.add("unsupported_contract_version");
  if (!ID.test(String(value["gold_case_id"] ?? "")))
    invalid.add("invalid_gold_case_id");
  if (!SEMVER.test(String(value["gold_case_version"] ?? "")))
    invalid.add("invalid_gold_case_version");
  if (value["canonicalization_version"] !== "registry-json-v1")
    invalid.add("unsupported_canonicalization");
  if (value["capability_id"] !== "evidence.extraction.normative_claims")
    invalid.add("capability_mismatch");
  if (value["classification"] !== "synthetic")
    invalid.add("non_synthetic_classification");
  if (!validInstant(value["created_at"])) invalid.add("invalid_created_at");
  if (!HASH.test(String(value["gold_case_hash"] ?? "")))
    invalid.add("invalid_gold_case_hash_shape");
  else if (
    computeOpenRouterSandboxGoldCaseHash(value) !== value["gold_case_hash"]
  )
    invalid.add("gold_case_hash_mismatch");

  const input = value["input"];
  if (!isRecord(input)) invalid.add("input_missing");
  else {
    if (input["data_provenance"] !== "entirely_synthetic")
      invalid.add("non_synthetic_input");
    for (const flag of [
      "contains_customer_data",
      "contains_personal_data",
      "contains_production_data",
      "contains_privileged_data",
      "contains_regulated_data",
    ])
      if (input[flag] !== false) invalid.add(`${flag}_forbidden`);
    if (
      typeof input["source_text"] !== "string" ||
      input["source_text"].trim().length === 0
    )
      invalid.add("source_text_missing");
  }

  const fixtureBinding = value["fixture_binding"];
  if (!isRecord(fixtureBinding)) invalid.add("fixture_binding_missing");
  else {
    if (fixtureBinding["classification"] !== "synthetic")
      invalid.add("fixture_not_synthetic");
    if (
      computeOpenRouterFirstRunFixtureHash(fixture) !==
      fixtureBinding["fixture_hash"]
    )
      invalid.add("fixture_hash_mismatch");
    if (
      isRecord(fixture) &&
      fixture["fixture_id"] !== fixtureBinding["fixture_id"]
    )
      invalid.add("fixture_identity_mismatch");
  }

  const expected = value["expected_output"];
  if (!isRecord(expected)) invalid.add("expected_output_missing");
  else {
    const required = expected["required_claims"];
    if (!Array.isArray(required) || required.length === 0)
      invalid.add("required_claims_missing");
    if (expected["evidence_must_be_source_substring"] !== true)
      invalid.add("evidence_reference_rule_weakened");
    if (expected["additional_properties_allowed"] !== false)
      invalid.add("open_output_schema_forbidden");
  }

  const restrictions = value["usage_restrictions"];
  if (
    !isRecord(restrictions) ||
    restrictions["legal_advice_prohibited"] !== true ||
    restrictions["automatic_downstream_publication_prohibited"] !== true ||
    restrictions["human_review_required"] !== true ||
    restrictions["single_live_request_only"] !== true
  )
    invalid.add("usage_restrictions_weakened");

  const acceptance = value["acceptance_contract"];
  if (!isRecord(acceptance)) invalid.add("acceptance_contract_missing");
  else {
    if (acceptance["scoring_method"] !== "deterministic_rule_based_v1")
      invalid.add("non_deterministic_scoring_forbidden");
    if (
      acceptance["maximum_automatic_retries"] !== 0 ||
      acceptance["fallback_allowed"] !== false
    )
      invalid.add("retry_or_fallback_weakened");
    if (
      acceptance["expected_provider_id"] !== "openrouter" ||
      acceptance["expected_model_id"] !== "minimax/minimax-m2.7"
    )
      invalid.add("expected_identity_mismatch");
    if (!USD_MICRO.test(String(acceptance["maximum_cost_usd_micro"] ?? "")))
      invalid.add("invalid_cost_ceiling");
    if (
      !Number.isSafeInteger(acceptance["maximum_latency_ms"]) ||
      (acceptance["maximum_latency_ms"] as number) <= 0 ||
      (acceptance["maximum_latency_ms"] as number) > 10_000
    )
      invalid.add("invalid_latency_ceiling");
  }

  // No benchmark result may be fabricated: the prepared campaign must hold
  // zero execution results, and no provider call may be represented.
  if (value["campaign_status"] !== "prepared_not_executed")
    invalid.add("unsupported_campaign_status");
  if (
    !Array.isArray(value["execution_results"]) ||
    value["execution_results"].length !== 0
  )
    invalid.add("fabricated_execution_result_forbidden");

  const human = value["human_acceptance"];
  if (!isRecord(human)) invalid.add("human_acceptance_missing");
  else if (human["status"] === "approved" || human["status"] === "rejected") {
    if (
      typeof human["reviewer_id"] !== "string" ||
      human["reviewer_id"].trim().length === 0 ||
      !validInstant(human["decided_at"]) ||
      typeof human["reason"] !== "string" ||
      human["reason"].trim().length === 0
    )
      invalid.add("acceptance_decision_malformed");
    if (
      human["status"] === "approved" &&
      human["accepted_gold_case_hash"] !== value["gold_case_hash"]
    )
      invalid.add("acceptance_hash_mismatch");
  } else if (human["status"] !== "pending")
    invalid.add("invalid_acceptance_status");

  if (LEAK.test(JSON.stringify(value)))
    invalid.add("restricted_content_forbidden");

  if (invalid.size) return finish("invalid_gold_case", invalid);
  const status = (value["human_acceptance"] as Record<string, unknown>)[
    "status"
  ];
  return finish(
    status === "approved"
      ? "accepted"
      : status === "rejected"
        ? "rejected"
        : "prepared_pending_acceptance",
    new Set(status === "pending" ? ["gold_case_acceptance_pending"] : []),
  );
}

/**
 * Deterministic acceptance scoring for one observation. Pure and replayable:
 * identical inputs always produce the identical score. The scorer never
 * grants human acceptance and never represents a provider call; it only
 * classifies an observation as a candidate for human review or as rejected.
 */
export function scoreOpenRouterGoldCaseObservation(
  goldCase: OpenRouterSandboxGoldCase,
  observation: OpenRouterGoldCaseObservation,
): OpenRouterGoldCaseScore {
  const criteria = goldCase.acceptance_contract;
  const reasons = new Set<string>();
  const checks: Record<string, boolean> = {};

  const output = observation.structured_output;
  const claims: readonly Record<string, unknown>[] =
    isRecord(output) && Array.isArray(output["claims"])
      ? output["claims"].filter(isRecord)
      : [];
  const uncertainty =
    isRecord(output) && typeof output["uncertainty"] === "string"
      ? output["uncertainty"]
      : null;

  const schemaValid =
    isRecord(output) &&
    Object.keys(output).every(
      (key) => key === "claims" || key === "uncertainty",
    ) &&
    Array.isArray(output["claims"]) &&
    output["claims"].length >= goldCase.expected_output.minimum_claims &&
    output["claims"].every(
      (claim) =>
        isRecord(claim) &&
        Object.keys(claim).every((key) =>
          (goldCase.expected_output.claim_fields as readonly string[]).includes(
            key,
          ),
        ) &&
        typeof claim["claim_id"] === "string" &&
        typeof claim["claim"] === "string" &&
        typeof claim["evidence"] === "string",
    ) &&
    uncertainty !== null &&
    new Set(claims.map((claim) => claim["claim_id"])).size === claims.length;
  checks["output_schema_validity"] = schemaValid;
  if (!schemaValid) reasons.add("output_schema_invalid");

  const source = goldCase.input.source_text;
  const required = goldCase.expected_output.required_claims;
  const matched = required.filter((expectation) =>
    claims.some(
      (claim) =>
        String(claim["claim"]).includes(expectation.claim_contains) &&
        claim["evidence"] === expectation.evidence_exact,
    ),
  ).length;
  checks["required_claim_recall"] = matched === required.length;
  if (matched !== required.length) reasons.add("required_claim_missing");

  const unsupported = claims.filter(
    (claim) => !source.includes(String(claim["evidence"])),
  ).length;
  checks["unsupported_claim_count"] =
    unsupported <= criteria.maximum_unsupported_claims;
  if (unsupported > criteria.maximum_unsupported_claims)
    reasons.add("unsupported_claim_present");
  checks["evidence_reference_validity"] = unsupported === 0;

  const uncertaintyOk =
    uncertainty !== null &&
    criteria.required_uncertainty_substrings.every((marker) =>
      uncertainty.toLowerCase().includes(marker.toLowerCase()),
    );
  checks["uncertainty_disclosure"] = uncertaintyOk;
  if (!uncertaintyOk) reasons.add("uncertainty_disclosure_missing");

  const serialized = JSON.stringify(output ?? null).toLowerCase();
  const prohibited = criteria.prohibited_conclusion_substrings.some((marker) =>
    serialized.includes(marker.toLowerCase()),
  );
  checks["prohibited_conclusion_absence"] = !prohibited;
  if (prohibited) reasons.add("prohibited_conclusion_present");

  checks["provider_identity"] =
    observation.observed_provider_id === criteria.expected_provider_id;
  if (!checks["provider_identity"]) reasons.add("provider_identity_mismatch");
  checks["model_identity"] =
    observation.observed_model_id === criteria.expected_model_id;
  if (!checks["model_identity"]) reasons.add("model_identity_mismatch");

  checks["usage_metadata_availability"] = observation.usage_metadata_present;
  if (!observation.usage_metadata_present)
    reasons.add("usage_metadata_missing");

  const costOk =
    observation.cost_metadata !== null &&
    USD_MICRO.test(observation.cost_metadata.total_usd_micro) &&
    BigInt(observation.cost_metadata.total_usd_micro) <=
      BigInt(criteria.maximum_cost_usd_micro);
  checks["cost_metadata_compatibility"] = costOk;
  if (!costOk) reasons.add("cost_metadata_incompatible");

  checks["latency_ceiling"] =
    Number.isSafeInteger(observation.latency_ms) &&
    observation.latency_ms >= 0 &&
    observation.latency_ms <= criteria.maximum_latency_ms;
  if (!checks["latency_ceiling"]) reasons.add("latency_ceiling_exceeded");

  checks["timeout_behavior"] = observation.timed_out === false;
  if (observation.timed_out) reasons.add("timeout_observed");

  checks["no_retry"] = observation.automatic_retries_used === 0;
  if (!checks["no_retry"]) reasons.add("automatic_retry_forbidden");

  checks["no_fallback"] = observation.fallback_used === false;
  if (observation.fallback_used) reasons.add("fallback_forbidden");

  return deepFreeze({
    outcome:
      reasons.size === 0
        ? ("candidate_result_for_human_review" as const)
        : ("rejected_result" as const),
    reason_codes: [...reasons].sort(),
    checks,
    required_claim_recall: { matched, required: required.length },
    unsupported_claim_count: unsupported,
    human_acceptance_granted: false as const,
  });
}

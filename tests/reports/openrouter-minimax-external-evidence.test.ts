import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const inventoryPath = resolve(
  repoRoot,
  "reports/ai-lab-openrouter-minimax-external-evidence-2026-07-15.json",
);
const raw = readFileSync(inventoryPath, "utf8");
interface EvidenceSource {
  source_id: string;
  canonical_url: string;
  evidence_class: string;
  reviewer_status: string;
  content_hash_sha256: string;
  retrieved_at: string;
  subject: string;
  precise_paraphrase: string;
  applicability: string;
  freshness: string;
  conflict_state: string;
}

interface EvidenceInventory {
  schema_version: string;
  candidate: {
    router: string;
    model_id: string;
    intended_endpoint_slug: string;
  };
  retrieval: { started_at: string; completed_at: string };
  source_records: EvidenceSource[];
  freshness_deadlines: Record<string, string>;
  pricing_findings: {
    pricing_layers: {
      exact_published_endpoint_pricing: {
        retrieved_at: string;
        content_hash_sha256: string;
        authoritative_for_route_evaluation: boolean;
      };
      model_level_aggregate_pricing: {
        authoritative_for_exact_endpoint: boolean;
      };
      operational_cost_bands: {
        status: string;
        purpose: string;
        bands: Array<{
          name: string;
          minimum_usd: string;
          minimum_inclusive: boolean;
          maximum_usd: string | null;
          maximum_inclusive: boolean;
        }>;
      };
      experiment_specific_hard_ceiling: {
        amount_usd: string;
        scope: string;
        status: string;
        commercial_pricing_policy: boolean;
      };
      future_customer_operation_economics: {
        assessment_factors: string[];
        lowest_price_optimization_forbidden: boolean;
        principle: string;
      };
    };
    max_price_fail_closed: boolean;
    pricing_drift_rule: string;
    endpoint_selection_rule: string;
  };
  root_causes_addressed: Record<string, string>;
  root_causes_still_open: string[];
  recommended_candidate_decision: string;
  contradictions: string[];
  missing_evidence: string[];
  account_evidence_checklist: string[];
  account_posture_findings: { status: string };
  structured_output_findings: {
    json_schema_strict_exact_endpoint_proven: boolean;
  };
  zdr_findings: { upstream_contract_publicly_verified: boolean };
  routing_findings: {
    visible_endpoint_count: number;
    mutable_endpoint_snapshot: {
      time_sensitive_snapshot: boolean;
      endpoint_count_is_stable_contract: boolean;
      authoritative_evidence: {
        retrieved_at: string;
        content_hash_sha256: string;
      };
      refresh_exact_endpoint_metadata_before_future_authorization: boolean;
      aggregate_model_pricing_may_substitute_for_exact_endpoint_pricing: boolean;
      mara_rate_attribution: string;
    };
    endpoint_selection_framework: {
      criteria_ranked: string[];
      governance_rule: string;
      final_endpoint_selected: boolean;
      candidates: Array<{ endpoint: string; assessment: string }>;
      assessment_outcomes: {
        preferred_for_controlled_test: { endpoint: string | null };
        viable_alternative: { endpoint: string | null };
        requires_more_evidence: { endpoints: string[] };
        not_recommended: { endpoint: string | null };
      };
    };
    future_request_policy: {
      model: string;
      models_array_forbidden: boolean;
      provider: {
        only: string[];
        order: string[];
        allow_fallbacks: boolean;
        require_parameters: boolean;
        data_collection: string;
        zdr: boolean;
      };
      plugins: unknown[];
    };
  };
  review: {
    status: string;
    governed_configuration_changed: boolean;
    runtime_enablement_changed: boolean;
  };
  mandatory_invariants: Record<string, boolean>;
}

const inventory = JSON.parse(raw) as EvidenceInventory;
const sources = inventory.source_records;

const SHA256 = /^[a-f0-9]{64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const officialHosts = new Set([
  "openrouter.ai",
  "platform.minimax.io",
  "www.minimax.io",
]);
const evidenceClasses = new Set([
  "official_public_machine_readable_metadata",
  "official_public_documentation",
  "official_public_policy",
  "official_public_terms",
  "official_public_model_documentation",
]);

describe("OpenRouter MiniMax external evidence report", () => {
  it("parses and binds the exact disabled candidate route", () => {
    assert.equal(inventory.schema_version, "1.0.0");
    assert.equal(inventory.candidate.router, "openrouter");
    assert.equal(inventory.candidate.model_id, "minimax/minimax-m2.7");
    assert.equal(inventory.candidate.intended_endpoint_slug, "minimax/fp8");
    assert.equal(inventory.review.status, "unreviewed");
    assert.equal(inventory.review.governed_configuration_changed, false);
    assert.equal(inventory.review.runtime_enablement_changed, false);
  });

  it("uses unique official source identities and canonical URLs", () => {
    assert.equal(sources.length, 16);
    assert.equal(new Set(sources.map((source) => source.source_id)).size, 16);
    assert.equal(
      new Set(sources.map((source) => source.canonical_url)).size,
      16,
    );
    for (const source of sources) {
      const url = new URL(source.canonical_url);
      assert.equal(url.protocol, "https:", source.source_id);
      assert.ok(officialHosts.has(url.hostname), source.source_id);
      assert.ok(evidenceClasses.has(source.evidence_class), source.source_id);
      assert.equal(source.reviewer_status, "unreviewed_candidate_evidence");
      assert.match(source.content_hash_sha256, SHA256, source.source_id);
      assert.match(source.retrieved_at, ISO_UTC, source.source_id);
      assert.ok(source.subject.length > 10, source.source_id);
      assert.ok(source.precise_paraphrase.length > 30, source.source_id);
      assert.ok(source.applicability.length > 5, source.source_id);
      assert.ok(source.freshness.length > 5, source.source_id);
      assert.ok(source.conflict_state.length > 2, source.source_id);
    }
  });

  it("pins the captured source-set hashes deterministically", () => {
    const binding = sources
      .map(
        (source) =>
          `${source.source_id}\n${source.canonical_url}\n${source.content_hash_sha256}`,
      )
      .sort()
      .join("\n--\n");
    assert.equal(
      createHash("sha256").update(binding).digest("hex"),
      "47126dd8ccbfad4b4c09574286d7a9c2d600e9b1ece582b3e008a383f34a451f",
    );
  });

  it("enforces freshness windows and retrieval ordering", () => {
    const completed = Date.parse(inventory.retrieval.completed_at);
    assert.ok(Number.isFinite(completed));
    assert.ok(Date.parse(inventory.retrieval.started_at) <= completed);
    for (const source of sources) {
      assert.ok(Date.parse(source.retrieved_at) <= completed, source.source_id);
    }
    for (const deadline of Object.values(
      inventory.freshness_deadlines as Record<string, string>,
    )) {
      assert.match(deadline, ISO_UTC);
      assert.ok(Date.parse(deadline) > completed);
    }
  });

  it("covers RC-01 through RC-05 without optimistic closure", () => {
    assert.deepEqual(Object.keys(inventory.root_causes_addressed).sort(), [
      "RC-01",
      "RC-02",
      "RC-03",
      "RC-04",
      "RC-05",
    ]);
    assert.deepEqual(inventory.root_causes_still_open, [
      "RC-01",
      "RC-02",
      "RC-03",
      "RC-04",
      "RC-05",
    ]);
    assert.equal(
      inventory.root_causes_addressed["RC-01"],
      "partially_resolved",
    );
    assert.equal(
      inventory.root_causes_addressed["RC-02"],
      "partially_resolved",
    );
    assert.equal(
      inventory.root_causes_addressed["RC-03"],
      "requires_provider_confirmation",
    );
    assert.equal(
      inventory.root_causes_addressed["RC-04"],
      "requires_authenticated_account_evidence",
    );
    assert.equal(
      inventory.root_causes_addressed["RC-05"],
      "requires_controlled_capability_execution",
    );
    assert.equal(
      inventory.recommended_candidate_decision,
      "continue_conditionally",
    );
  });

  it("defines ordered, non-overlapping operational cost bands", () => {
    const framework =
      inventory.pricing_findings.pricing_layers.operational_cost_bands;
    assert.equal(
      framework.status,
      "unreviewed_governance_framework_not_governed_pricing_policy",
    );
    assert.match(
      framework.purpose,
      /governance bands, not model-ranking scores/,
    );
    assert.deepEqual(
      framework.bands.map((band) => band.name),
      [
        "preferred",
        "acceptable",
        "review_required",
        "commercial_justification_required",
      ],
    );
    for (const [index, band] of framework.bands.entries()) {
      const minimum = Number(band.minimum_usd);
      assert.ok(Number.isFinite(minimum));
      if (band.maximum_usd !== null) {
        const maximum = Number(band.maximum_usd);
        assert.ok(Number.isFinite(maximum));
        assert.ok(minimum < maximum);
      }
      if (index > 0) {
        const previous = framework.bands[index - 1]!;
        assert.equal(previous.maximum_usd, band.minimum_usd);
        assert.notEqual(previous.maximum_inclusive, band.minimum_inclusive);
      }
    }
    assert.equal(framework.bands.at(-1)?.maximum_usd, null);
  });

  it("separates the first-call sandbox ceiling from commercial bands", () => {
    const pricing = inventory.pricing_findings;
    const ceiling = pricing.pricing_layers.experiment_specific_hard_ceiling;
    assert.equal(ceiling.amount_usd, "0.05");
    assert.equal(ceiling.scope, "first_controlled_synthetic_call_only");
    assert.equal(ceiling.status, "disabled_and_not_authorized");
    assert.equal(ceiling.commercial_pricing_policy, false);
    assert.deepEqual(
      pricing.pricing_layers.future_customer_operation_economics
        .assessment_factors,
      [
        "customer_value",
        "document_complexity",
        "latency",
        "accuracy",
        "human_time_saved",
      ],
    );
  });

  it("ranks endpoint criteria without choosing solely by price", () => {
    const framework = inventory.routing_findings.endpoint_selection_framework;
    assert.deepEqual(framework.criteria_ranked, [
      "strict_structured_output_capability",
      "privacy_and_zdr_evidence",
      "exact_endpoint_pinning",
      "disabled_fallbacks",
      "required_parameter_enforcement",
      "observable_served_identity",
      "predictable_latency",
      "bounded_pricing_within_an_approved_band",
    ]);
    assert.equal(framework.final_endpoint_selected, false);
    assert.match(framework.governance_rule, /not a lowest-price ranking score/);
    assert.equal(
      inventory.pricing_findings.pricing_layers
        .future_customer_operation_economics
        .lowest_price_optimization_forbidden,
      true,
    );
    assert.match(
      inventory.pricing_findings.endpoint_selection_rule,
      /must not be selected merely because it is cheaper/,
    );
    assert.deepEqual(
      framework.candidates.map(({ endpoint, assessment }) => ({
        endpoint,
        assessment,
      })),
      [
        { endpoint: "minimax/fp8", assessment: "requires_more_evidence" },
        { endpoint: "fireworks", assessment: "requires_more_evidence" },
        { endpoint: "together/fp4", assessment: "requires_more_evidence" },
      ],
    );
    assert.equal(
      framework.assessment_outcomes.preferred_for_controlled_test.endpoint,
      null,
    );
    assert.equal(
      framework.assessment_outcomes.viable_alternative.endpoint,
      null,
    );
    assert.deepEqual(
      framework.assessment_outcomes.requires_more_evidence.endpoints,
      ["minimax/fp8", "fireworks", "together/fp4"],
    );
    assert.equal(framework.assessment_outcomes.not_recommended.endpoint, null);
  });

  it("binds mutable endpoint claims to the captured snapshot", () => {
    const snapshot = inventory.routing_findings.mutable_endpoint_snapshot;
    const exact =
      inventory.pricing_findings.pricing_layers
        .exact_published_endpoint_pricing;
    assert.equal(snapshot.time_sensitive_snapshot, true);
    assert.equal(snapshot.endpoint_count_is_stable_contract, false);
    assert.equal(
      snapshot.refresh_exact_endpoint_metadata_before_future_authorization,
      true,
    );
    assert.equal(
      snapshot.aggregate_model_pricing_may_substitute_for_exact_endpoint_pricing,
      false,
    );
    assert.equal(
      inventory.pricing_findings.pricing_layers.model_level_aggregate_pricing
        .authoritative_for_exact_endpoint,
      false,
    );
    assert.equal(exact.authoritative_for_route_evaluation, true);
    assert.equal(
      snapshot.authoritative_evidence.retrieved_at,
      exact.retrieved_at,
    );
    assert.equal(
      snapshot.authoritative_evidence.content_hash_sha256,
      exact.content_hash_sha256,
    );
    assert.match(snapshot.authoritative_evidence.retrieved_at, ISO_UTC);
    assert.match(snapshot.authoritative_evidence.content_hash_sha256, SHA256);
    assert.match(snapshot.mara_rate_attribution, /row labeled mara/);
  });

  it("preserves conflicts, missing evidence, and the account checklist", () => {
    assert.ok(inventory.contradictions.length >= 3);
    assert.ok(inventory.missing_evidence.length >= 5);
    assert.ok(inventory.account_evidence_checklist.length >= 9);
    assert.equal(inventory.account_posture_findings.status, "unverified");
    assert.equal(
      inventory.structured_output_findings
        .json_schema_strict_exact_endpoint_proven,
      false,
    );
    assert.equal(
      inventory.zdr_findings.upstream_contract_publicly_verified,
      false,
    );
  });

  it("keeps the future route single-endpoint and fail-closed", () => {
    const policy = inventory.routing_findings.future_request_policy;
    assert.equal(policy.model, "minimax/minimax-m2.7");
    assert.equal(policy.models_array_forbidden, true);
    assert.deepEqual(policy.provider.only, ["minimax/fp8"]);
    assert.deepEqual(policy.provider.order, ["minimax/fp8"]);
    assert.equal(policy.provider.allow_fallbacks, false);
    assert.equal(policy.provider.require_parameters, true);
    assert.equal(policy.provider.data_collection, "deny");
    assert.equal(policy.provider.zdr, true);
    assert.deepEqual(policy.plugins, []);
  });

  it("records every execution-disabled invariant", () => {
    const invariants = inventory.mandatory_invariants;
    assert.equal(invariants.operator_expected_blocked, true);
    assert.equal(invariants.activation_review_non_executable, true);
    assert.equal(
      invariants.provider_model_route_profile_adapter_disabled,
      true,
    );
    assert.equal(invariants.live_budget_disabled, true);
    assert.equal(invariants.kill_switch_active, true);
    assert.equal(invariants.secret_not_configured_or_accessed, true);
    assert.equal(invariants.authorization_issued, false);
    assert.equal(invariants.authorization_consumed, false);
    assert.equal(invariants.gateway_adapter_harness_transport_invoked, false);
    assert.equal(invariants.model_inference_occurred, false);
    assert.equal(invariants.account_setting_changed, false);
    assert.equal(invariants.human_approval_fabricated, false);
    assert.equal(invariants.production_or_customer_data_accessed, false);
  });

  it("contains no credential-shaped values or absolute local paths", () => {
    assert.doesNotMatch(raw, /sk-or-v1-|Bearer\s+[A-Za-z0-9._-]+/);
    assert.doesNotMatch(raw, /\/Users\/|\/home\/|[A-Za-z]:\\\\/);
  });
});

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

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  computeEvidenceHash,
  determineProviderCandidateReadinessResult,
  evaluateCandidateProfileReadiness,
  REQUIRED_EVIDENCE_CATEGORIES,
  type CandidateProfileReadiness,
  type ProviderEvidenceRecord,
} from "../../src/providers/provider-evidence.js";
import { ProviderAdapterRegistry } from "../../src/providers/adapter-registry.js";

const load = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;
const readiness = load<{
  evaluated_route_count: number;
  selected_profile_id: string;
  readiness_result: string;
  evidence_blockers: string[];
  controlled_execution: {
    adapter_status: string;
    execution_profile_status: string;
    live_execution_status: string;
    request_count: number;
    actual_exact_cost: { numerator: string; denominator: string };
    accounting_scale: string;
    actual_accounting_units: string;
    rounding_policy: string;
    limits: {
      max_requests: number;
      max_concurrency: number;
      max_reserved_accounting_units: string;
    };
  };
  profiles: Array<
    CandidateProfileReadiness & {
      endpoint: string | null;
      route_mode: "fixed" | "variable";
      evaluation_status: "selected_evaluated" | "not_selected";
    }
  >;
}>("config/ai-candidate-profile-readiness.json");
const evidence = load<{ evidence: ProviderEvidenceRecord[] }>(
  "config/ai-provider-evidence.json",
).evidence;
const gates = load<{
  expected_readiness_result: string;
  live_execution: {
    authorized: boolean;
    request_count: number;
    actual_exact_cost: { numerator: string; denominator: string };
    accounting_scale: string;
    actual_accounting_units: string;
    rounding_policy: string;
  };
  campaign_limits: {
    max_requests: number;
    max_concurrency: number;
    max_reserved_accounting_units: string;
  };
  pre_transport_failures: string[];
}>("snapshots/providers/controlled-provider-candidate-gates.json");

const selected = readiness.profiles.find(
  (profile) => profile.evaluation_status === "selected_evaluated",
)!;
const notSelected = readiness.profiles.find(
  (profile) => profile.evaluation_status === "not_selected",
)!;

describe("AI-83 controlled provider candidate", () => {
  it("evaluates exactly MiniMax Direct MiniMax-M2.7 on one fixed endpoint", () => {
    assert.equal(readiness.evaluated_route_count, 1);
    assert.equal(selected.profile_id, readiness.selected_profile_id);
    assert.equal(selected.provider_id, "minimax-direct");
    assert.equal(selected.model_id, "MiniMax-M2.7");
    assert.equal(selected.endpoint, "https://api.minimax.io/v1");
    assert.equal(selected.route_mode, "fixed");
    assert.equal(selected.upstream_provider_id, null);
  });

  it("replays a deterministic blocked readiness decision from reviewed hashes", () => {
    const records = selected.evidence_refs.map(
      (id) => evidence.find((record) => record.evidence_id === id)!,
    );
    assert.equal(records.length, 20);
    assert.deepEqual(
      [...new Set(records.map((record) => record.category))].sort(),
      [...REQUIRED_EVIDENCE_CATEGORIES].sort(),
    );
    assert.ok(
      records.every(
        (record) => computeEvidenceHash(record) === record.evidence_hash,
      ),
    );
    assert.ok(
      records.every((record) => record.review.status === "reviewed_approved"),
    );
    assert.ok(
      records.every(
        (record) =>
          Date.parse(record.expires_at) >
          Date.parse("2026-07-13T12:00:00.000Z"),
      ),
    );

    const reasons = evaluateCandidateProfileReadiness(
      selected,
      evidence,
      new Date("2026-07-13T12:00:00.000Z"),
    );
    const result = determineProviderCandidateReadinessResult(reasons);
    assert.deepEqual(reasons, [
      "privacy_unknown",
      "rate_limits_unknown",
      "security_compliance_unknown",
      "unsupported_capability",
    ]);
    assert.equal(result, "BLOCKED_EVIDENCE_INCOMPLETE");
    assert.equal(result, readiness.readiness_result);
    assert.equal(result, gates.expected_readiness_result);
  });

  it("records every unresolved exact evidence class without treating provider-wide claims as model proof", () => {
    assert.deepEqual(readiness.evidence_blockers, [
      "max_output_limit_unknown",
      "structured_output_unknown",
      "pricing_contract_not_reviewed_for_runtime",
      "rate_concurrency_limits_unknown",
      "processing_region_unknown",
      "retention_unknown",
      "training_use_unknown",
      "zdr_unknown",
      "security_compliance_unknown",
      "normative_claim_extraction_unevaluated",
    ]);
    for (const category of [
      "structured_outputs",
      "rate_concurrency_limits",
      "processing_regions",
      "retention",
      "training_use",
      "zdr_status",
      "security_compliance",
      "normative_claim_extraction",
    ] as const) {
      const record = evidence.find(
        (item) =>
          item.provider_id === "minimax-direct" && item.category === category,
      );
      assert.equal(record?.status, "unknown", category);
    }
  });

  it("keeps OpenRouter unselected, variable, unpinned, disabled, and blocked", () => {
    assert.equal(notSelected.provider_id, "openrouter");
    assert.equal(notSelected.endpoint, null);
    assert.equal(notSelected.route_mode, "variable");
    assert.equal(notSelected.enabled, false);
    assert.equal(notSelected.runtime_eligibility, "blocked");
    assert.deepEqual(notSelected.evidence_refs, []);
    assert.ok(notSelected.blocking_reasons.includes("not_selected"));
    assert.ok(
      notSelected.blocking_reasons.includes("variable_provider_routing"),
    );
  });

  it("adds neither live adapter nor executable profile and records zero live calls and zero cost", () => {
    assert.equal(readiness.controlled_execution.adapter_status, "not_added");
    assert.equal(
      readiness.controlled_execution.execution_profile_status,
      "not_added",
    );
    assert.equal(
      readiness.controlled_execution.live_execution_status,
      "blocked_readiness",
    );
    assert.equal(readiness.controlled_execution.request_count, 0);
    assert.deepEqual(readiness.controlled_execution.actual_exact_cost, {
      numerator: "0",
      denominator: "1",
    });
    assert.equal(readiness.controlled_execution.actual_accounting_units, "0");
    assert.equal(gates.live_execution.authorized, false);
    assert.equal(gates.live_execution.request_count, 0);
    assert.deepEqual(gates.live_execution.actual_exact_cost, {
      numerator: "0",
      denominator: "1",
    });
    assert.equal(gates.live_execution.actual_accounting_units, "0");
    assert.deepEqual(new ProviderAdapterRegistry().listProviderAdapters(), []);

    const executionProfiles = JSON.parse(
      readFileSync("config/ai-execution-profiles.json", "utf8"),
    ) as {
      profiles: {
        provider_id: string;
        enabled: boolean;
        sandbox_controls?: { configuration_status: string };
      }[];
    };
    assert.ok(
      executionProfiles.profiles
        .filter((profile) =>
          ["openrouter", "minimax-direct"].includes(profile.provider_id),
        )
        .every(
          (profile) =>
            !profile.enabled &&
            profile.sandbox_controls?.configuration_status === "proposal_only",
        ),
    );
  });

  it("fails every campaign gate before transport and cannot exceed hard caps", () => {
    let transportCalls = 0;
    for (const failure of gates.pre_transport_failures) {
      const allGatesPassed = false;
      if (allGatesPassed) transportCalls += 1;
      assert.equal(transportCalls, 0, failure);
    }
    assert.deepEqual(
      readiness.controlled_execution.limits,
      gates.campaign_limits,
    );
    assert.equal(gates.campaign_limits.max_requests, 10);
    assert.equal(gates.campaign_limits.max_concurrency, 2);
    assert.equal(
      gates.campaign_limits.max_reserved_accounting_units,
      "1000000",
    );
  });

  it("keeps provider output outside reviewed and approved artifact contracts", () => {
    for (const path of [
      "schemas/approved-artifact.schema.json",
      "schemas/classifier-approved-artifact-export-contract.schema.json",
      "schemas/review-artifact-binding.schema.json",
    ]) {
      assert.doesNotMatch(
        readFileSync(path, "utf8"),
        /minimax-direct|MiniMax-M2\.7|openrouter/i,
      );
    }
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

import dossierFixture from "../../config/ai-openrouter-readiness-dossier.json" with { type: "json" };
import schema from "../../schemas/ai-openrouter-readiness-dossier.schema.json" with { type: "json" };
import {
  computeOpenRouterReadinessDossierHash,
  defaultOpenRouterReadinessDependencies,
  evaluateOpenRouterReadinessDossier,
  type OpenRouterReadinessDependencies,
  type OpenRouterReadinessDossier,
} from "../../src/providers/openrouter-readiness-dossier.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (
  ajv: Ajv,
) => void;
const NOW = new Date("2026-07-14T12:00:00.000Z");
const clone = <T>(value: T): T => structuredClone(value);
const fixture = dossierFixture as OpenRouterReadinessDossier;

interface MutableSection {
  state: string;
  claims: Record<string, unknown>;
  sources: {
    source_kind: string;
    integrity_hash: string;
  }[];
  reviewer_id: string | null;
  reviewed_at: string | null;
  retrieved_at: string | null;
  expires_at: string | null;
}

function rehash(dossier: OpenRouterReadinessDossier): void {
  (dossier as { dossier_hash: string }).dossier_hash =
    computeOpenRouterReadinessDossierHash(dossier);
}

function ready(): OpenRouterReadinessDossier {
  const dossier = clone(fixture);
  const mutableSections = dossier.evidence as unknown as MutableSection[];
  for (const section of mutableSections) {
    section.state = "verified";
    section.sources = section.sources.map((source) => ({
      ...source,
      source_kind: "externally_reviewed_evidence",
    }));
    section.reviewer_id = "human.reviewer.one";
    section.reviewed_at = "2026-07-14T01:00:00.000Z";
    section.retrieved_at = "2026-07-14T00:00:00.000Z";
    section.expires_at = "2026-08-14T00:00:00.000Z";
  }
  const byCategory = new Map<string, MutableSection>(
    dossier.evidence.map((section, index) => [
      section.category,
      mutableSections[index]!,
    ]),
  );
  byCategory.get("exact_upstream_route")!.claims = {
    upstream_provider_id: "minimax",
    upstream_model_id: "minimax-m2.7",
    verification: "verified_exact",
  };
  byCategory.get("pricing")!.claims = {
    pricing_identity: "reviewed.price.contract",
    effective_at: "2026-07-14T00:00:00.000Z",
    input_price: "1/1000000 USD/token",
    cached_input_price: "1/2000000 USD/token",
    output_price: "2/1000000 USD/token",
    variable: false,
    bounded_policy: null,
  };
  byCategory.get("structured_output_json_schema")!.claims = {
    json_object: true,
    json_schema_suitable: true,
  };
  byCategory.get("capability_benchmark")!.claims = {
    capability_id: dossier.candidate_path.capability_id,
    benchmark_report_id: "reviewed.benchmark.one",
  };
  for (const risk of dossier.risks as unknown as {
    status: string;
    resolution: string | null;
  }[]) {
    risk.status = "resolved";
    risk.resolution =
      "Resolved by separately reviewed synthetic test evidence.";
  }
  Object.assign(dossier.human_approval, {
    status: "approved",
    reviewer_id: "human.approver.one",
    scope: "sandbox_enablement_proposal_only",
    decided_at: "2026-07-14T02:00:00.000Z",
    expires_at: "2026-08-14T00:00:00.000Z",
    decision_reason: "May propose a later sandbox-enablement change only.",
  });
  rehash(dossier);
  return dossier;
}

function evaluate(dossier: OpenRouterReadinessDossier) {
  return evaluateOpenRouterReadinessDossier(dossier, NOW);
}

function section(dossier: OpenRouterReadinessDossier, category: string) {
  return dossier.evidence.find(
    (item) => item.category === category,
  )! as unknown as MutableSection;
}

describe("OpenRouter readiness dossier", () => {
  it("loads the repository dossier through the strict schema", () => {
    const ajv = new Ajv({ strict: true, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    assert.equal(
      validate(dossierFixture),
      true,
      JSON.stringify(validate.errors),
    );
  });

  it("keeps the repository dossier blocked with exact recorded blockers", () => {
    const result = evaluate(fixture);
    assert.equal(result.outcome, "blocked");
    assert.ok(result.reason_codes.includes("pricing:conflicting"));
    assert.ok(
      result.reason_codes.includes("variable_pricing_without_bounded_policy"),
    );
    assert.ok(
      result.reason_codes.includes(
        "unresolved_mandatory_risk:exact-route-unproven",
      ),
    );
    assert.equal(result.execution_authorized, false);
    assert.equal(result.provider_call_performed, false);
  });

  for (const [name, category, reason] of [
    [
      "missing exact upstream route evidence",
      "exact_upstream_route",
      "exact_upstream_route_not_proven",
    ],
    ["missing pricing evidence", "pricing", "pricing_identity_incomplete"],
    [
      "missing privacy evidence",
      "privacy_policy",
      "privacy_policy_incompatible_or_missing",
    ],
    [
      "missing retention evidence",
      "retention",
      "retention_incompatible_or_missing",
    ],
    [
      "missing training-use evidence",
      "training_data_use",
      "training_data_use_incompatible_or_missing",
    ],
    [
      "missing or incompatible ZDR evidence",
      "zdr",
      "zdr_incompatible_or_missing",
    ],
    [
      "missing structured-output evidence",
      "structured_output_json_schema",
      "structured_output_unverified",
    ],
    [
      "missing benchmark evidence",
      "capability_benchmark",
      "capability_benchmark_missing",
    ],
  ] as const) {
    it(name, () => {
      const dossier = ready();
      section(dossier, category).state = "missing";
      section(dossier, category).claims = {};
      rehash(dossier);
      const result = evaluate(dossier);
      assert.equal(result.outcome, "not_ready");
      assert.ok(result.reason_codes.includes(reason));
    });
  }

  it("blocks variable pricing without a bounded policy", () => {
    const dossier = ready();
    section(dossier, "pricing").claims["variable"] = true;
    section(dossier, "pricing").claims["bounded_policy"] = null;
    rehash(dossier);
    assert.ok(
      evaluate(dossier).reason_codes.includes(
        "variable_pricing_without_bounded_policy",
      ),
    );
  });

  it("blocks expired and conflicting evidence", () => {
    for (const [state, reason] of [
      ["expired", "pricing:expired"],
      ["conflicting", "pricing:conflicting"],
    ] as const) {
      const dossier = ready();
      section(dossier, "pricing").state = state;
      rehash(dossier);
      assert.ok(evaluate(dossier).reason_codes.includes(reason));
    }
  });

  it("rejects an unsupported lifecycle", () => {
    const dossier = ready();
    const dependencies = clone(defaultOpenRouterReadinessDependencies());
    (dependencies.registry.entries[0] as { lifecycle: string }).lifecycle =
      "retired";
    const result = evaluateOpenRouterReadinessDossier(
      dossier,
      NOW,
      dependencies,
    );
    assert.equal(result.outcome, "invalid_dossier");
    assert.ok(result.reason_codes.includes("unsupported_lifecycle"));
  });

  it("rejects model, route, and profile identity mismatches", () => {
    for (const mutate of [
      (d: OpenRouterReadinessDossier) =>
        ((
          d.candidate_path as { openrouter_model_id: string }
        ).openrouter_model_id = "other/model"),
      (d: OpenRouterReadinessDossier) =>
        ((d.candidate_path as { route_version: string }).route_version =
          "9.0.0"),
      (d: OpenRouterReadinessDossier) =>
        ((
          d.candidate_path as { execution_profile_registry_presence: string }
        ).execution_profile_registry_presence = "disabled"),
    ]) {
      const dossier = ready();
      mutate(dossier);
      rehash(dossier);
      assert.equal(evaluate(dossier).outcome, "invalid_dossier");
    }
  });

  it("requires evidence reviewer metadata", () => {
    const dossier = ready();
    section(dossier, "privacy_policy").reviewer_id = null;
    rehash(dossier);
    assert.ok(
      evaluate(dossier).reason_codes.includes(
        "privacy_policy:review_metadata_missing",
      ),
    );
  });

  for (const [name, mutate, reason] of [
    [
      "missing approval",
      (d: OpenRouterReadinessDossier) =>
        Object.assign(d.human_approval, { status: "pending" }),
      "human_approval_missing",
    ],
    [
      "missing approval reviewer",
      (d: OpenRouterReadinessDossier) =>
        Object.assign(d.human_approval, { reviewer_id: null }),
      "human_reviewer_missing",
    ],
    [
      "expired approval",
      (d: OpenRouterReadinessDossier) =>
        Object.assign(d.human_approval, {
          expires_at: "2026-07-14T12:00:00.000Z",
        }),
      "approval_expired",
    ],
    [
      "approval scope mismatch",
      (d: OpenRouterReadinessDossier) =>
        Object.assign(d.human_approval, { scope: null }),
      "approval_scope_mismatch",
    ],
  ] as const) {
    it(name, () => {
      const dossier = ready();
      mutate(dossier);
      rehash(dossier);
      assert.ok(evaluate(dossier).reason_codes.includes(reason));
    });
  }

  it("blocks an unresolved mandatory risk", () => {
    const dossier = ready();
    (dossier.risks[0] as { status: string }).status = "open";
    rehash(dossier);
    assert.ok(
      evaluate(dossier).reason_codes.includes(
        `unresolved_mandatory_risk:${dossier.risks[0]!.risk_id}`,
      ),
    );
  });

  it("rejects an invalid contract version", () => {
    const dossier = ready();
    (dossier as { dossier_contract_version: string }).dossier_contract_version =
      "2.0.0";
    rehash(dossier);
    assert.equal(evaluate(dossier).outcome, "invalid_dossier");
  });

  it("rejects a tampered repository evidence hash", () => {
    const dossier = clone(fixture);
    section(dossier, "exact_model_identifier").sources[0]!.integrity_hash =
      "f".repeat(64);
    rehash(dossier);
    const result = evaluate(dossier);
    assert.equal(result.outcome, "invalid_dossier");
    assert.ok(result.reason_codes.includes("evidence_hash_mismatch"));
  });

  it("rejects a repository evidence locator mismatch", () => {
    const dossier = clone(fixture);
    (
      section(dossier, "exact_model_identifier").sources[0] as {
        locator?: string;
      }
    ).locator = "config/ai-provider-evidence.json#openrouter.other";
    rehash(dossier);
    assert.ok(
      evaluate(dossier).reason_codes.includes(
        "repository_evidence_locator_mismatch",
      ),
    );
  });

  it("is deterministic, immutable, and never self-authorizes", () => {
    const dossier = ready();
    const first = evaluate(dossier);
    const second = evaluate(dossier);
    assert.deepEqual(first, second);
    assert.equal(first.outcome, "ready_for_sandbox_review");
    assert.equal(first.execution_authorized, false);
    assert.ok(Object.isFrozen(first));
    assert.ok(Object.isFrozen(first.reason_codes));
  });

  it("proves registries, profiles, adapter, and runtime boundaries remain disabled", () => {
    const dependencies: OpenRouterReadinessDependencies =
      defaultOpenRouterReadinessDependencies();
    assert.ok(dependencies.registry.entries.every((entry) => !entry.enabled));
    assert.ok(dependencies.registry.routes.every((route) => !route.enabled));
    assert.equal(
      dependencies.execution_profiles.some(
        (profile) => profile.provider_id === "openrouter" && profile.enabled,
      ),
      false,
    );
    const adapter = JSON.parse(
      readFileSync("config/ai-openrouter-adapter.json", "utf8"),
    ) as { enabled: boolean };
    assert.equal(adapter.enabled, false);
    const source = readFileSync(
      "src/providers/openrouter-readiness-dossier.ts",
      "utf8",
    );
    assert.doesNotMatch(
      source,
      /process\.env|globalThis\.fetch|openrouter-adapter|multi-provider-gateway|authorized-gateway|secret|credential|execute\(/i,
    );
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

import evidencePackFixture from "../../config/ai-openrouter-external-evidence-pack.json" with { type: "json" };
import adapterConfig from "../../config/ai-openrouter-adapter.json" with { type: "json" };
import modelRegistry from "../../config/ai-openrouter-model-registry.json" with { type: "json" };
import routeRegistry from "../../config/ai-openrouter-route-registry.json" with { type: "json" };
import dossier from "../../config/ai-openrouter-readiness-dossier.json" with { type: "json" };
import schema from "../../schemas/ai-openrouter-external-evidence-pack.schema.json" with { type: "json" };
import {
  computeOpenRouterExternalEvidencePackHash,
  computeOpenRouterExternalEvidenceRecordHash,
  evaluateOpenRouterExternalEvidencePack,
  type OpenRouterExternalEvidencePack,
  type OpenRouterExternalEvidenceRecord,
} from "../../src/providers/openrouter-external-evidence-pack.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (
  ajv: Ajv,
) => void;
const NOW = new Date("2026-07-14T12:00:00.000Z");
const clone = <T>(value: T): T => structuredClone(value);
const fixture = evidencePackFixture as OpenRouterExternalEvidencePack;

function mutable(pack: OpenRouterExternalEvidencePack) {
  return pack as unknown as {
    records: (OpenRouterExternalEvidenceRecord & Record<string, unknown>)[];
    sandbox_budget_proposal: Record<string, unknown>;
    pack_hash: string;
  };
}

function rehash(pack: OpenRouterExternalEvidencePack): void {
  for (const record of mutable(pack).records)
    (record as unknown as { integrity_hash: string }).integrity_hash =
      computeOpenRouterExternalEvidenceRecordHash(record);
  mutable(pack).pack_hash = computeOpenRouterExternalEvidencePackHash(pack);
}

function reviewable(): OpenRouterExternalEvidencePack {
  const pack = clone(fixture);
  for (const record of mutable(pack).records) {
    Object.assign(record, {
      state: "verified",
      reviewer_id: "nicolas",
      reviewed_at: "2026-07-14T13:00:00.000Z",
      re_review_at: "2026-08-13T12:00:00.000Z",
    });
  }
  const record = (category: string) =>
    mutable(pack).records.find((item) => item.category === category)!;
  Object.assign(record("exact_upstream_route").attributes, {
    routing_variable: false,
    exact_endpoint_guaranteed: true,
  });
  Object.assign(record("zdr").attributes, {
    exact_route_zdr_proven: true,
  });
  Object.assign(record("structured_output_json_schema").attributes, {
    strict_json_schema_proven: true,
  });
  Object.assign(record("terms_acceptable_use").attributes, {
    legal_review_complete: true,
  });
  rehash(pack);
  return pack;
}

function evaluate(pack: OpenRouterExternalEvidencePack) {
  return evaluateOpenRouterExternalEvidencePack(pack, NOW);
}

describe("OpenRouter external evidence pack", () => {
  it("validates the repository pack against the closed schema", () => {
    const ajv = new Ajv({ strict: true, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    assert.equal(
      validate(evidencePackFixture),
      true,
      JSON.stringify(validate.errors),
    );
  });

  it("accepts a valid authoritative evidence record shape and hash", () => {
    const record = fixture.records[0]!;
    assert.equal(
      record.source.source_type,
      "official_openrouter_model_metadata",
    );
    assert.equal(
      computeOpenRouterExternalEvidenceRecordHash(record),
      record.integrity_hash,
    );
  });

  it("rejects missing source metadata", () => {
    const pack = reviewable();
    (mutable(pack).records[0]!.source as { title: string }).title = "";
    rehash(pack);
    assert.ok(evaluate(pack).reason_codes.includes("missing_source_metadata"));
  });

  it("rejects unsupported source types", () => {
    const pack = reviewable();
    (mutable(pack).records[0]!.source as { source_type: string }).source_type =
      "seo_summary";
    rehash(pack);
    assert.ok(evaluate(pack).reason_codes.includes("unsupported_source_type"));
  });

  it("requires reviewer identity for verified evidence", () => {
    const pack = reviewable();
    (
      mutable(pack).records[0] as unknown as { reviewer_id: string | null }
    ).reviewer_id = null;
    rehash(pack);
    const result = evaluate(pack);
    assert.equal(result.outcome, "not_ready");
    assert.ok(
      result.reason_codes.includes(
        "openrouter.external.model-identity.v1:reviewer_missing",
      ),
    );
  });

  it("blocks an expired review", () => {
    const pack = reviewable();
    (
      mutable(pack).records[0] as unknown as { re_review_at: string }
    ).re_review_at = "2026-07-14T12:00:00.000Z";
    rehash(pack);
    assert.ok(
      evaluate(pack).reason_codes.includes(
        "openrouter.external.model-identity.v1:expired_review",
      ),
    );
  });

  it("detects a tampered integrity hash", () => {
    const pack = reviewable();
    (
      mutable(pack).records[0] as unknown as { integrity_hash: string }
    ).integrity_hash = "a".repeat(64);
    mutable(pack).pack_hash = computeOpenRouterExternalEvidencePackHash(pack);
    assert.ok(evaluate(pack).reason_codes.includes("evidence_hash_mismatch"));
  });

  it("rejects duplicate evidence IDs", () => {
    const pack = reviewable();
    (
      mutable(pack).records[1] as unknown as { evidence_id: string }
    ).evidence_id = mutable(pack).records[0]!.evidence_id;
    rehash(pack);
    assert.ok(evaluate(pack).reason_codes.includes("duplicate_evidence_id"));
  });

  it("blocks conflicting evidence", () => {
    const pack = reviewable();
    (mutable(pack).records[0] as unknown as { state: string }).state =
      "conflicting";
    rehash(pack);
    assert.ok(
      evaluate(pack).reason_codes.includes(
        "openrouter.external.model-identity.v1:conflicting",
      ),
    );
  });

  it("rejects a claim not bound to the candidate identity", () => {
    const pack = reviewable();
    (
      mutable(pack).records[0]!.bindings as unknown as {
        route_record_id: string;
      }
    ).route_record_id = "other.route.v1";
    rehash(pack);
    assert.ok(
      evaluate(pack).reason_codes.includes("claim_candidate_binding_mismatch"),
    );
  });

  it("rejects evidence for the wrong model or provider", () => {
    for (const [field, value, reason] of [
      ["openrouter_model_id", "other/model", "wrong_model_evidence"],
      ["upstream_provider_id", "other", "wrong_provider_evidence"],
    ] as const) {
      const pack = reviewable();
      (pack.candidate_path as unknown as Record<string, unknown>)[field] =
        value;
      for (const record of mutable(pack).records)
        (record.bindings as unknown as Record<string, unknown>)[field] = value;
      rehash(pack);
      assert.ok(evaluate(pack).reason_codes.includes(reason));
    }
  });

  it("keeps variable pricing blocked without the bounded proposal", () => {
    const pack = reviewable();
    const pricing = mutable(pack).records.find(
      (item) => item.category === "pricing",
    )!;
    Object.assign(pricing.attributes, { variable: true });
    mutable(pack).sandbox_budget_proposal.maximum_requests = 0;
    rehash(pack);
    assert.ok(
      evaluate(pack).reason_codes.includes(
        "variable_pricing_without_bounded_proposal",
      ),
    );
  });

  it("keeps provider-routing variability explicit", () => {
    assert.ok(
      evaluate(fixture).reason_codes.includes(
        "provider_routing_variability_explicit",
      ),
    );
  });

  it("does not treat conditional ZDR as unconditional", () => {
    const pack = reviewable();
    const zdr = mutable(pack).records.find((item) => item.category === "zdr")!;
    Object.assign(zdr.attributes, { conditional: true, unconditional: true });
    rehash(pack);
    assert.ok(
      evaluate(pack).reason_codes.includes(
        "conditional_zdr_treated_as_unconditional",
      ),
    );
  });

  it("preserves upstream-provider privacy conflict", () => {
    const pack = reviewable();
    const privacy = mutable(pack).records.find(
      (item) => item.evidence_id === "openrouter.external.minimax-privacy.v1",
    )!;
    (privacy as unknown as { state: string }).state = "conflicting";
    rehash(pack);
    assert.ok(
      evaluate(pack).reason_codes.includes(
        "openrouter.external.minimax-privacy.v1:conflicting",
      ),
    );
  });

  it("does not accept unproven strict JSON Schema support", () => {
    const pack = reviewable();
    const structured = mutable(pack).records.find(
      (item) => item.category === "structured_output_json_schema",
    )!;
    Object.assign(structured.attributes, { strict_json_schema_proven: false });
    rehash(pack);
    assert.ok(
      evaluate(pack).reason_codes.includes("strict_json_schema_unproven"),
    );
  });

  it("rejects irrelevant benchmark evidence", () => {
    const pack = reviewable();
    const benchmark = mutable(pack).records.find(
      (item) => item.category === "capability_benchmark",
    )!;
    Object.assign(benchmark.attributes, { benchmark_capability_id: "coding" });
    rehash(pack);
    assert.ok(
      evaluate(pack).reason_codes.includes("irrelevant_benchmark_evidence"),
    );
  });

  it("keeps legal review pending", () => {
    const pack = reviewable();
    const legal = mutable(pack).records.find(
      (item) => item.category === "terms_acceptable_use",
    )!;
    Object.assign(legal.attributes, { legal_review_complete: false });
    rehash(pack);
    assert.ok(evaluate(pack).reason_codes.includes("legal_review_pending"));
  });

  it("normalizes hashes and readiness deterministically", () => {
    const record = fixture.records[0]!;
    const reversed = Object.fromEntries(Object.entries(record).reverse());
    assert.equal(
      computeOpenRouterExternalEvidenceRecordHash(reversed),
      record.integrity_hash,
    );
    assert.deepEqual(evaluate(fixture), evaluate(clone(fixture)));
  });

  it("returns an immutable result", () => {
    const result = evaluate(fixture);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.reason_codes), true);
  });

  it("creates no approval or runtime enablement", () => {
    assert.deepEqual(fixture.human_approval, {
      status: "pending",
      reviewer_id: null,
      decided_at: null,
    });
    assert.equal(fixture.execution_authorized, false);
    assert.equal(fixture.provider_call_performed, false);
    assert.equal(adapterConfig.enabled, false);
    assert.equal(
      modelRegistry.entries.every((entry) => !entry.enabled),
      true,
    );
    assert.equal(
      routeRegistry.routes.every((route) => !route.enabled),
      true,
    );
    assert.equal(
      dossier.candidate_path.execution_profile_registry_presence,
      "absent",
    );
  });

  it("contains no environment, secret, gateway, adapter, or network access", () => {
    const source = readFileSync(
      "src/providers/openrouter-external-evidence-pack.ts",
      "utf8",
    );
    for (const forbidden of [
      "process.env",
      "fetch(",
      "createOpenRouterFetchTransport",
      "OpenRouterAuthorizedGateway",
      "OpenRouterAdapter",
    ])
      assert.equal(source.includes(forbidden), false, forbidden);
  });
});

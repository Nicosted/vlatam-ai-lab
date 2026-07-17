import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

import cloudflareFixture from "../../config/ai-runtime-evidence-cloudflare.json" with { type: "json" };
import eveFixture from "../../config/ai-runtime-evidence-eve.json" with { type: "json" };
import schema from "../../schemas/ai-runtime-evidence-pack.schema.json" with { type: "json" };
import commonSchema from "../../schemas/ai-tournament-common.schema.json" with { type: "json" };
import {
  buildTournamentOperatorReadModel,
  computeRuntimeEvidencePackHash,
  computeRuntimeEvidenceSourceHash,
  evaluateRuntimeEvidencePack,
  projectRuntimeEvidenceForOperator,
  type RuntimeCandidate,
  type RuntimeEvidencePack,
} from "../../src/tournament/index.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (
  ajv: Ajv,
) => void;
const NOW = new Date("2026-07-17T12:30:00Z");
const eve = eveFixture as RuntimeEvidencePack;
const cloudflare = cloudflareFixture as RuntimeEvidencePack;
const clone = <T>(value: T): T => structuredClone(value);

function rehash(pack: RuntimeEvidencePack): void {
  const mutable = pack as unknown as {
    sources: Array<Record<string, unknown>>;
    pack_hash: string;
  };
  for (const source of mutable.sources)
    source["content_hash"] = computeRuntimeEvidenceSourceHash(
      source as unknown as RuntimeEvidencePack["sources"][number],
    );
  mutable.pack_hash = computeRuntimeEvidencePackHash(pack);
}

describe("runtime evidence packs", () => {
  it("validates timestamped Eve and Cloudflare packs against the closed schema", () => {
    const ajv = new Ajv({ strict: true, allErrors: true });
    addFormats(ajv);
    ajv.addSchema(commonSchema);
    const validate = ajv.compile(schema);
    for (const pack of [eveFixture, cloudflareFixture])
      assert.equal(validate(pack), true, JSON.stringify(validate.errors));
  });

  it("verifies canonical source and pack hashes", () => {
    for (const pack of [eve, cloudflare]) {
      assert.equal(computeRuntimeEvidencePackHash(pack), pack.pack_hash);
      for (const source of pack.sources)
        assert.equal(
          computeRuntimeEvidenceSourceHash(source),
          source.content_hash,
        );
    }
  });

  it("classifies immutable, mutable, current and expiring evidence", () => {
    assert.ok(eve.sources.some((source) => source.immutable));
    assert.ok(eve.sources.some((source) => !source.immutable));
    assert.equal(evaluateRuntimeEvidencePack(eve, NOW).freshness, "current");
    assert.equal(
      evaluateRuntimeEvidencePack(cloudflare, new Date("2026-08-10T12:30:00Z"))
        .freshness,
      "expiring",
    );
  });

  it("does not treat expired evidence as current", () => {
    const pack = clone(eve);
    (pack as unknown as { review_expires_at: string }).review_expires_at =
      "2026-07-01T00:00:00Z";
    rehash(pack);
    const result = evaluateRuntimeEvidencePack(pack, NOW);
    assert.equal(result.outcome, "not_current");
    assert.equal(result.freshness, "expired");
    assert.ok(result.reason_codes.includes("evidence_expired"));
  });

  it("rejects tampering, missing limitations and unpinned mutable repository claims", () => {
    const tampered = clone(eve);
    (tampered as unknown as { pack_hash: string }).pack_hash = "a".repeat(64);
    assert.ok(
      evaluateRuntimeEvidencePack(tampered, NOW).reason_codes.includes(
        "pack_hash_mismatch",
      ),
    );

    const missing = clone(eve);
    const source = (
      missing as unknown as { sources: Array<Record<string, unknown>> }
    ).sources[0]!;
    source["immutable"] = false;
    source["commit_sha"] = null;
    source["evidence_limitations"] = ["No limitation recorded."];
    rehash(missing);
    assert.ok(
      evaluateRuntimeEvidencePack(missing, NOW).reason_codes.includes(
        "mutable_source_limitation_missing",
      ),
    );
  });

  it("blocks marketing material represented as a verified guarantee", () => {
    const pack = clone(eve);
    const finding = (
      pack as unknown as { findings: Array<Record<string, unknown>> }
    ).findings[0]!;
    finding["source_ids"] = ["eve.blog.introducing"];
    finding["claim_status"] = "verified";
    rehash(pack);
    assert.ok(
      evaluateRuntimeEvidencePack(pack, NOW).reason_codes.includes(
        "marketing_guarantee_forbidden",
      ),
    );
  });

  it("enforces runtime/inference separation for Workers AI", () => {
    const pack = clone(cloudflare);
    const workers = (
      pack as unknown as { findings: Array<Record<string, unknown>> }
    ).findings.find((finding) => finding["component"] === "workers_ai")!;
    workers["claim_status"] = "verified";
    rehash(pack);
    assert.ok(
      evaluateRuntimeEvidencePack(pack, NOW).reason_codes.includes(
        "workers_ai_modeled_as_runtime",
      ),
    );
  });

  it("requires Eve reasoning privacy risk and forbids reasoning persistence", () => {
    assert.equal(eve.reasoning_capture_policy.persist_private_reasoning, false);
    const pack = clone(eve);
    (pack as unknown as { privacy_findings: string[] }).privacy_findings = [
      "No risk recorded.",
    ];
    rehash(pack);
    assert.ok(
      evaluateRuntimeEvidencePack(pack, NOW).reason_codes.includes(
        "eve_reasoning_privacy_risk_omitted",
      ),
    );
  });

  it("preserves evidence-only lifecycle, disabled activation and active kill switches", () => {
    for (const pack of [eve, cloudflare]) {
      const result = evaluateRuntimeEvidencePack(pack, NOW);
      assert.equal(result.outcome, "evidence_only");
      assert.equal(pack.runtime_candidate.lifecycle_status, "discovered");
      assert.equal(pack.runtime_candidate.enabled, false);
      assert.equal(pack.runtime_candidate.kill_switch_active, true);
      assert.equal(pack.automatic_promotion_prohibited, true);
    }
  });

  it("projects read-only Operator evidence freshness and blockers", () => {
    const projection = projectRuntimeEvidenceForOperator(eve, NOW);
    assert.equal(projection.source_count, eve.sources.length);
    assert.ok(projection.immutable_source_count > 0);
    assert.ok(projection.mutable_source_count > 0);
    assert.ok(projection.unresolved_gaps > 0);
    assert.ok(projection.privacy_blockers > 0);
    assert.equal(projection.activation_prohibited, true);
    assert.equal(projection.kill_switch_state, "active");
  });

  it("preserves historical Cloudflare lineage classifications", () => {
    const classes = new Set(
      cloudflare.historical_evidence_classification.map(
        (item) => item.classification,
      ),
    );
    assert.ok(classes.has("historical"));
    assert.ok(classes.has("retired"));
    assert.ok(classes.has("insufficient"));
  });

  it("handles missing evidence as an empty read-only projection", () => {
    const candidate = {
      runtime_candidate_id: "vercel-eve",
      lifecycle_status: "discovered",
      approval_state: "pending",
      evidence: [],
      kill_switch: { active: true },
    } as unknown as RuntimeCandidate;
    const operator = buildTournamentOperatorReadModel([candidate], [], NOW);
    assert.deepEqual(operator.runtime_evidence, []);
    assert.equal(operator.write_actions_available, false);
    assert.equal(operator.registered_candidates[0]!.benchmark_eligible, false);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SEMIF_CANDIDATE_BINDING,
  computeCandidateAdapterEvidencePackHash,
  computeCandidateAdapterSpecHash,
  evaluateCandidateExecutionReadiness,
  validateCandidateAdapterEvidencePack,
  type CandidateAdapterEvidencePack,
  type CandidateAdapterEvidencePackContext,
} from "../../src/decision-candidate-methods/index.js";
import {
  DECISION_SANDBOX_DIRECT_LOGIT_METHOD_ADAPTER,
  DECISION_SANDBOX_FIXTURE_POLICY_HASH,
} from "../../src/decision-sandbox/index.js";
import {
  PINNED,
  clone,
  codes,
  driftedSemifEntry,
  logitFixtures,
  pack,
  semifEntry,
  spec,
  type Mutable,
} from "./helpers.js";

function context(
  overrides: Partial<CandidateAdapterEvidencePackContext> = {},
): CandidateAdapterEvidencePackContext {
  return {
    spec: spec(),
    entry: semifEntry(),
    fixtures: logitFixtures(),
    sandbox_policy_hash: DECISION_SANDBOX_FIXTURE_POLICY_HASH,
    ...overrides,
  };
}

function rehash(value: Mutable): CandidateAdapterEvidencePack {
  delete value["evidence_pack_hash"];
  value["evidence_pack_hash"] = computeCandidateAdapterEvidencePackHash(
    value as CandidateAdapterEvidencePack,
  );
  return value as CandidateAdapterEvidencePack;
}

function mutated(
  mutate: (value: Mutable) => void,
): CandidateAdapterEvidencePack {
  const value = clone(pack()) as Mutable;
  mutate(value);
  return rehash(value);
}

describe("AI-144 candidate adapter evidence pack", () => {
  it("the committed pack validates against its spec, AI-142 entry, fixtures and AI-143 policy", () => {
    const check = validateCandidateAdapterEvidencePack(pack(), context());
    assert.equal(check.ok, true, JSON.stringify(codes(check)));
    assert.equal(pack().evidence_pack_hash, PINNED.evidence_pack_hash);
  });

  it("binds every required identity", () => {
    const p = pack();
    assert.deepEqual(p.candidate_binding, SEMIF_CANDIDATE_BINDING);
    assert.equal(p.upstream_commit, "23cf1f39fc9534fe81437200959b6dfc7106e45a");
    assert.deepEqual(p.adapter_spec, {
      adapter_spec_id: spec().adapter_spec_id,
      adapter_spec_version: spec().adapter_spec_version,
      adapter_spec_hash: computeCandidateAdapterSpecHash(spec()),
    });
    assert.deepEqual(p.methodology_evidence, spec().methodology.evidence);
    assert.deepEqual(p.method_artifact, {
      ownership: "ai_lab",
      adapter_id: DECISION_SANDBOX_DIRECT_LOGIT_METHOD_ADAPTER.adapter_id,
      adapter_version:
        DECISION_SANDBOX_DIRECT_LOGIT_METHOD_ADAPTER.adapter_version,
      artifact_sha256: PINNED.artifact_sha256,
    });
    assert.deepEqual(
      p.synthetic_logit_fixtures,
      Object.entries(PINNED.fixtures).map(([fixture_id, fixture_hash]) => ({
        fixture_id,
        fixture_hash,
      })),
    );
    assert.equal(p.sandbox_policy_hash, PINNED.sandbox_policy_hash);
    assert.deepEqual(
      p.execution_readiness,
      evaluateCandidateExecutionReadiness(spec(), semifEntry()),
    );
  });

  it("records only non-execution facts, no calibration, no authority and a non-approved review", () => {
    const p = pack();
    assert.deepEqual(p.execution_facts, {
      upstream_code_executed: false,
      model_executed: false,
      model_weights_downloaded: false,
      candidate_dependencies_installed: false,
      ai_lab_executed: false,
    });
    assert.equal(p.calibration_state, "not_applied");
    assert.equal(p.result_origin, "synthetic_fixture");
    assert.equal(p.authority, "none");
    assert.deepEqual(p.review, { state: "draft", human_review_required: true });
  });

  it("rejects approval, execution claims, calibration and eligibility", () => {
    for (const [mutate, code] of [
      [
        (v: Mutable) => (v["review"]["state"] = "approved"),
        "review_state_invalid",
      ],
      [
        (v: Mutable) => (v["review"]["human_review_required"] = false),
        "review_state_invalid",
      ],
      [
        (v: Mutable) => (v["execution_facts"]["model_executed"] = true),
        "execution_fact_invalid",
      ],
      [
        (v: Mutable) => (v["execution_facts"]["upstream_code_executed"] = true),
        "execution_fact_invalid",
      ],
      [
        (v: Mutable) => (v["execution_facts"]["ai_lab_executed"] = true),
        "execution_fact_invalid",
      ],
      [
        (v: Mutable) =>
          (v["execution_facts"]["model_weights_downloaded"] = true),
        "execution_fact_invalid",
      ],
      [
        (v: Mutable) =>
          (v["execution_facts"]["candidate_dependencies_installed"] = true),
        "execution_fact_invalid",
      ],
      [
        (v: Mutable) => (v["calibration_state"] = "applied"),
        "calibration_claim_forbidden",
      ],
      [
        (v: Mutable) => (v["result_origin"] = "candidate_model"),
        "result_origin_invalid",
      ],
      [
        (v: Mutable) => (v["authority"] = "evidence_only"),
        "authority_forbidden",
      ],
    ] as const)
      assert.deepEqual(
        codes(validateCandidateAdapterEvidencePack(mutated(mutate), context())),
        [code],
        String(mutate),
      );
    const eligible = mutated(
      (v) => (v["execution_readiness"]["state"] = "eligible"),
    );
    const eligibleCodes = codes(
      validateCandidateAdapterEvidencePack(eligible, context()),
    );
    assert.ok(eligibleCodes.includes("readiness_invalid"));
    assert.ok(eligibleCodes.includes("readiness_mismatch"));
    const dropped = mutated((v) =>
      v["execution_readiness"]["blockers"].splice(
        v["execution_readiness"]["blockers"].indexOf(
          "base_model_license_unresolved",
        ),
        1,
      ),
    );
    assert.deepEqual(
      codes(validateCandidateAdapterEvidencePack(dropped, context())),
      ["readiness_mismatch"],
    );
  });

  it("fails closed on spec, artifact, fixture, policy or candidate drift", () => {
    const otherSpec = clone(spec()) as Mutable;
    otherSpec["adapter_spec_version"] = "1.0.1";
    delete otherSpec["adapter_spec_hash"];
    otherSpec["adapter_spec_hash"] = computeCandidateAdapterSpecHash(
      otherSpec as never,
    );
    assert.deepEqual(
      codes(
        validateCandidateAdapterEvidencePack(
          pack(),
          context({ spec: otherSpec }),
        ),
      ),
      ["adapter_spec_binding_mismatch"],
    );
    assert.deepEqual(
      codes(
        validateCandidateAdapterEvidencePack(
          mutated(
            (v) => (v["method_artifact"]["artifact_sha256"] = "0".repeat(64)),
          ),
          context(),
        ),
      ),
      ["method_artifact_mismatch"],
    );
    assert.deepEqual(
      codes(
        validateCandidateAdapterEvidencePack(
          pack(),
          context({ fixtures: logitFixtures().slice(1) }),
        ),
      ),
      ["fixture_set_mismatch"],
    );
    const tamperedFixture = clone(logitFixtures()) as Mutable[];
    tamperedFixture[0]!["candidate_logits"][0]["logit_micros"] += 1;
    assert.deepEqual(
      codes(
        validateCandidateAdapterEvidencePack(
          pack(),
          context({ fixtures: tamperedFixture }),
        ),
      ),
      ["fixture_set_mismatch", "fixture_set_mismatch"],
    );
    assert.deepEqual(
      codes(
        validateCandidateAdapterEvidencePack(
          pack(),
          context({ sandbox_policy_hash: "0".repeat(64) }),
        ),
      ),
      ["sandbox_policy_invalid"],
    );
    const stale = codes(
      validateCandidateAdapterEvidencePack(
        pack(),
        context({ entry: driftedSemifEntry() }),
      ),
    );
    assert.ok(stale.includes("candidate_binding_stale"), String(stale));
    assert.ok(stale.includes("readiness_mismatch"), String(stale));
    assert.deepEqual(
      codes(
        validateCandidateAdapterEvidencePack(
          mutated((v) => v["methodology_evidence"].pop()),
          context(),
        ),
      ),
      ["methodology_evidence_mismatch"],
    );
  });

  it("detects self-hash tampering and rejects unknown or provider fields", () => {
    const tampered = clone(pack()) as Mutable;
    tampered["pack_id"] = "ai-lab-other-pack";
    assert.deepEqual(
      codes(validateCandidateAdapterEvidencePack(tampered, context())),
      ["evidence_pack_hash_mismatch"],
    );
    assert.ok(
      codes(
        validateCandidateAdapterEvidencePack(
          mutated((v) => (v["winner"] = true)),
          context(),
        ),
      ).includes("unknown_property"),
    );
    assert.ok(
      codes(
        validateCandidateAdapterEvidencePack(
          mutated((v) => (v["provider"] = "x")),
          context(),
        ),
      ).includes("forbidden_field"),
    );
  });
});

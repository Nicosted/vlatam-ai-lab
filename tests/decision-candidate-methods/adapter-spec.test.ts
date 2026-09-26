import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CANDIDATE_METHOD_INTERPRETATION_TOPICS,
  CANDIDATE_METHOD_REQUIRED_DISPOSITIONS,
  SEMIF_CANDIDATE_BINDING,
  SEMIF_METHODOLOGY_UPSTREAM,
  checkCandidateAdapterBinding,
  computeCandidateAdapterSpecHash,
  validateCandidateAdapterSpec,
  type CandidateAdapterSpec,
} from "../../src/decision-candidate-methods/index.js";
import {
  computeDecisionCandidateHash,
  validateDecisionCandidateEntry,
} from "../../src/decision-candidates/index.js";
import { DECISION_SANDBOX_DIRECT_LOGIT_METHOD_ADAPTER } from "../../src/decision-sandbox/index.js";
import {
  METHOD_ARTIFACT_PATH,
  PINNED,
  clone,
  codes,
  driftedSemifEntry,
  semifEntry,
  sha256File,
  spec,
  type Mutable,
} from "./helpers.js";

/** Re-hashes a mutated spec so only the targeted rule can fail. */
function rehash(value: Mutable): CandidateAdapterSpec {
  delete value["adapter_spec_hash"];
  value["adapter_spec_hash"] = computeCandidateAdapterSpecHash(
    value as CandidateAdapterSpec,
  );
  return value as CandidateAdapterSpec;
}

function mutated(mutate: (value: Mutable) => void): CandidateAdapterSpec {
  const value = clone(spec()) as Mutable;
  mutate(value);
  return rehash(value);
}

describe("AI-144 candidate adapter specification", () => {
  it("the committed specification validates and its hash is pinned", () => {
    const check = validateCandidateAdapterSpec(spec());
    assert.equal(check.ok, true, JSON.stringify(codes(check)));
    assert.equal(spec().adapter_spec_hash, PINNED.adapter_spec_hash);
    assert.equal(
      computeCandidateAdapterSpecHash(spec()),
      PINNED.adapter_spec_hash,
    );
  });

  it("binds exactly the AI-142 SemIf candidate id, hash and evidence revision", () => {
    const entry = semifEntry();
    assert.equal(validateDecisionCandidateEntry(entry).ok, true);
    assert.equal(computeDecisionCandidateHash(entry), entry.candidate_hash);
    assert.deepEqual(spec().candidate_binding, {
      candidate_id: "tdc-theoleecj-semif",
      candidate_hash:
        "02c465ac9c13b88f0cda245eae350f45b0d91cd66b24e0ededf9d73df5228f29",
      evidence_revision: 1,
    });
    assert.deepEqual(spec().candidate_binding, SEMIF_CANDIDATE_BINDING);
    assert.equal(entry.candidate_hash, SEMIF_CANDIDATE_BINDING.candidate_hash);
    assert.deepEqual(checkCandidateAdapterBinding(spec(), entry), {
      state: "current",
      issues: [],
    });
  });

  it("rejects a wrong candidate hash, a changed evidence revision and another candidate", () => {
    for (const [mutate, code] of [
      [
        (v: Mutable) =>
          (v["candidate_binding"]["candidate_hash"] = "f".repeat(64)),
        "candidate_binding_unsupported",
      ],
      [
        (v: Mutable) => (v["candidate_binding"]["evidence_revision"] = 2),
        "candidate_binding_unsupported",
      ],
      [
        (v: Mutable) =>
          (v["candidate_binding"]["candidate_id"] =
            "tdc-tianyucodings-nanojev"),
        "candidate_binding_unsupported",
      ],
      [
        (v: Mutable) => (v["candidate_binding"]["candidate_id"] = "semif"),
        "candidate_binding_invalid",
      ],
      [
        (v: Mutable) => (v["candidate_binding"]["evidence_revision"] = 0),
        "candidate_binding_invalid",
      ],
    ] as const)
      assert.deepEqual(codes(validateCandidateAdapterSpec(mutated(mutate))), [
        code,
      ]);
  });

  it("becomes stale when the AI-142 SemIf entry drifts, instead of following the candidate id", () => {
    const drifted = driftedSemifEntry();
    // The drifted entry is itself a valid AI-142 entry with a new hash.
    assert.equal(validateDecisionCandidateEntry(drifted).ok, true);
    assert.notEqual(
      drifted.candidate_hash,
      SEMIF_CANDIDATE_BINDING.candidate_hash,
    );
    assert.equal(drifted.candidate_id, SEMIF_CANDIDATE_BINDING.candidate_id);
    const check = checkCandidateAdapterBinding(spec(), drifted);
    assert.equal(check.state, "stale");
    assert.deepEqual(
      check.issues.map((i) => i.code),
      ["candidate_binding_stale"],
    );

    const revised = clone(semifEntry()) as Mutable;
    revised["evidence_revision"] = 2;
    revised["supersedes"] = {
      evidence_revision: 1,
      candidate_hash: SEMIF_CANDIDATE_BINDING.candidate_hash,
    };
    delete revised["candidate_hash"];
    revised["candidate_hash"] = computeDecisionCandidateHash(revised as never);
    assert.equal(validateDecisionCandidateEntry(revised).ok, true);
    assert.equal(checkCandidateAdapterBinding(spec(), revised).state, "stale");

    const movedCommit = clone(semifEntry()) as Mutable;
    movedCommit["upstream"]["pinned_commit_sha"] = "0".repeat(40);
    for (const item of movedCommit["evidence"])
      item["locator"]["commit_sha"] = "0".repeat(40);
    for (const item of movedCommit["evidence"])
      item["locator"]["source_url"] = String(
        item["locator"]["source_url"],
      ).replace(SEMIF_METHODOLOGY_UPSTREAM.commit_sha, "0".repeat(40));
    delete movedCommit["candidate_hash"];
    movedCommit["candidate_hash"] = computeDecisionCandidateHash(
      movedCommit as never,
    );
    assert.equal(validateDecisionCandidateEntry(movedCommit).ok, true);
    assert.equal(
      checkCandidateAdapterBinding(spec(), movedCommit).state,
      "stale",
    );
  });

  it("treats a tampered AI-142 entry (hash not recomputed) as invalid", () => {
    const tampered = clone(semifEntry()) as Mutable;
    tampered["lifecycle"]["ai_lab_executed"] = true;
    assert.deepEqual(checkCandidateAdapterBinding(spec(), tampered), {
      state: "invalid",
      issues: [{ code: "candidate_entry_invalid", path: "entry" }],
    });
  });

  it("pins every methodology evidence item to the exact upstream commit with blob and content hashes", () => {
    const s = spec();
    assert.equal(s.methodology.upstream_repository, "TheoLeeCJ/SemIf-OpenJev");
    assert.equal(
      s.methodology.upstream_commit,
      "23cf1f39fc9534fe81437200959b6dfc7106e45a",
    );
    assert.deepEqual(
      s.methodology.evidence.map((e) => e.path),
      [
        "docs/CALIBRATION.md",
        "src/semif_phase1/core.py",
        "src/semif_phase1/direct.py",
        "benchmarks/evaluate.py",
        "LICENSE",
        "docs/METHOD.md",
        "manifests/models.json",
        "README.md",
        "requirements.txt",
        "THIRD_PARTY.md",
      ],
    );
    for (const item of s.methodology.evidence) {
      assert.match(item.blob_sha, /^[a-f0-9]{40}$/);
      assert.match(item.content_sha256, /^[a-f0-9]{64}$/);
    }
    // The three files AI-142 already bound are byte-identical evidence.
    const entry = semifEntry();
    for (const bound of entry.evidence) {
      const item = s.methodology.evidence.find(
        (e) => e.path === bound.locator.path,
      );
      assert.ok(item, bound.locator.path ?? "");
      assert.equal(item.blob_sha, bound.locator.blob_sha);
      assert.equal(item.content_sha256, bound.content_sha256);
      assert.equal(bound.locator.commit_sha, s.methodology.upstream_commit);
    }
    // AI-142 evidence is not modified by AI-144.
    assert.equal(entry.evidence.length, 3);
  });

  it("rejects mutable references, duplicated, unordered or conflicting evidence", () => {
    assert.deepEqual(
      codes(
        validateCandidateAdapterSpec(
          mutated((v) => (v["methodology"]["upstream_commit"] = "master")),
        ),
      ),
      ["upstream_binding_invalid"],
    );
    assert.deepEqual(
      codes(
        validateCandidateAdapterSpec(
          mutated(
            (v) => (v["methodology"]["evidence"][0]["blob_sha"] = "abc123"),
          ),
        ),
      ),
      ["evidence_invalid"],
    );
    assert.deepEqual(
      codes(
        validateCandidateAdapterSpec(
          mutated(
            (v) => (v["methodology"]["evidence"][1]["path"] = "../outside.py"),
          ),
        ),
      ),
      ["evidence_invalid"],
    );
    assert.ok(
      codes(
        validateCandidateAdapterSpec(
          mutated((v) => v["methodology"]["evidence"].reverse()),
        ),
      ).includes("evidence_order_invalid"),
    );
    assert.ok(
      codes(
        validateCandidateAdapterSpec(
          mutated(
            (v) =>
              (v["methodology"]["evidence"][1]["path"] =
                v["methodology"]["evidence"][0]["path"]),
          ),
        ),
      ).includes("evidence_duplicate"),
    );
    const conflicting = mutated((v) => {
      const readme = v["methodology"]["evidence"].find(
        (e: Mutable) => e["path"] === "README.md",
      );
      readme["content_sha256"] = "0".repeat(64);
    });
    assert.equal(validateCandidateAdapterSpec(conflicting).ok, true);
    const check = checkCandidateAdapterBinding(conflicting, semifEntry());
    assert.equal(check.state, "stale");
    assert.deepEqual(
      check.issues.map((i) => i.code),
      ["evidence_conflicts_with_candidate_entry"],
    );
  });

  it("requires every interpretation topic exactly once with its pinned disposition", () => {
    const s = spec();
    assert.deepEqual(
      s.methodology.interpretations.map((i) => i.topic),
      [...CANDIDATE_METHOD_INTERPRETATION_TOPICS],
    );
    for (const item of s.methodology.interpretations)
      assert.equal(
        item.disposition,
        CANDIDATE_METHOD_REQUIRED_DISPOSITIONS[item.topic],
      );
    assert.deepEqual(
      codes(
        validateCandidateAdapterSpec(
          mutated((v) => v["methodology"]["interpretations"].pop()),
        ),
      ),
      ["interpretation_incomplete"],
    );
    for (const [topic, disposition] of [
      ["calibration", "adopted"],
      ["boolean_decisions", "adopted"],
      ["top_logit_tie", "adopted"],
      ["logit_source", "adopted"],
    ] as const)
      assert.deepEqual(
        codes(
          validateCandidateAdapterSpec(
            mutated((v) => {
              const item = v["methodology"]["interpretations"].find(
                (i: Mutable) => i["topic"] === topic,
              );
              item["disposition"] = disposition;
            }),
          ),
        ),
        ["interpretation_disposition_invalid"],
        topic,
      );
    assert.deepEqual(
      codes(
        validateCandidateAdapterSpec(
          mutated(
            (v) =>
              (v["methodology"]["interpretations"][0]["evidence_refs"] = [
                "ev-unknown",
              ]),
          ),
        ),
      ),
      ["evidence_ref_unknown"],
    );
  });

  it("records AI-LAB implementation provenance bound to the exact AI-143 method fixture artifact", () => {
    const impl = spec().implementation;
    assert.equal(impl.ownership, "ai_lab");
    assert.equal(impl.implementation_kind, "method_reimplementation");
    assert.equal(impl.upstream_code_reused, false);
    assert.equal(impl.sandbox_subject_kind, "synthetic_fixture_adapter");
    const adapter = DECISION_SANDBOX_DIRECT_LOGIT_METHOD_ADAPTER;
    assert.equal(impl.adapter_id, adapter.adapter_id);
    assert.equal(impl.adapter_version, adapter.adapter_version);
    assert.equal(impl.artifact_path, adapter.artifact_path);
    assert.equal(impl.artifact_path, METHOD_ARTIFACT_PATH);
    assert.equal(impl.artifact_sha256, adapter.artifact_sha256);
    assert.equal(impl.artifact_sha256, sha256File(METHOD_ARTIFACT_PATH));
    assert.equal(impl.artifact_sha256, PINNED.artifact_sha256);
    assert.doesNotMatch(impl.adapter_id, /^tdc-/);
    for (const [mutate, code] of [
      [
        (v: Mutable) => (v["implementation"]["upstream_code_reused"] = true),
        "implementation_invalid",
      ],
      [
        (v: Mutable) => (v["implementation"]["ownership"] = "upstream"),
        "implementation_invalid",
      ],
      [
        (v: Mutable) =>
          (v["implementation"]["adapter_id"] = "tdc-theoleecj-semif"),
        "implementation_invalid",
      ],
      [
        (v: Mutable) =>
          (v["implementation"]["sandbox_subject_kind"] =
            "registered_decision_candidate"),
        "implementation_invalid",
      ],
      [
        (v: Mutable) =>
          (v["implementation"]["artifact_path"] = "/usr/bin/python3"),
        "implementation_invalid",
      ],
    ] as const)
      assert.deepEqual(codes(validateCandidateAdapterSpec(mutated(mutate))), [
        code,
      ]);
  });

  it("claims choice only and no calibration, authority or eligibility", () => {
    const s = spec();
    assert.deepEqual(s.supported_decision_types, ["choice"]);
    assert.deepEqual(s.unsupported_decision_types, [
      "boolean",
      "ranking",
      "score",
    ]);
    assert.equal(s.calibration_state, "not_applied");
    assert.equal(s.confidence_semantics, "uncalibrated_candidate_reported");
    assert.equal(
      s.probability_semantics,
      "conditional_on_declared_options_uncalibrated",
    );
    assert.equal(s.execution_mode, "synthetic_logits_only");
    assert.equal(s.result_origin, "synthetic_fixture");
    assert.equal(s.authority, "none");
    assert.equal(s.method.top_logit_tie, "fail_closed");
    assert.equal(s.method.top_logit_tie_outcome, "typed_abstention_ambiguous");
    assert.equal(
      s.method.unbound_synthetic_logits_outcome,
      "typed_block_execution_unavailable",
    );
    assert.equal(s.benchmark_eligible, false);
    assert.equal(s.promotion_eligible, false);
    assert.equal(s.production_eligible, false);
    for (const [mutate, code] of [
      [
        (v: Mutable) => (v["supported_decision_types"] = ["boolean", "choice"]),
        "decision_types_invalid",
      ],
      [
        (v: Mutable) =>
          (v["supported_decision_types"] = ["choice", "ranking", "score"]),
        "decision_types_invalid",
      ],
      [
        (v: Mutable) => (v["calibration_state"] = "applied"),
        "calibration_claim_forbidden",
      ],
      [
        (v: Mutable) => (v["confidence_semantics"] = "calibrated"),
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
      [(v: Mutable) => (v["execution_mode"] = "model"), "authority_forbidden"],
      [(v: Mutable) => (v["benchmark_eligible"] = true), "authority_forbidden"],
      [(v: Mutable) => (v["promotion_eligible"] = true), "authority_forbidden"],
      [
        (v: Mutable) => (v["production_eligible"] = true),
        "authority_forbidden",
      ],
      [
        (v: Mutable) => (v["method"]["top_logit_tie"] = "first_position"),
        "method_parameters_invalid",
      ],
      [
        (v: Mutable) =>
          (v["method"]["top_logit_tie_outcome"] = "process_failure"),
        "method_parameters_invalid",
      ],
      [
        (v: Mutable) =>
          (v["method"]["unbound_synthetic_logits_outcome"] = "process_failure"),
        "method_parameters_invalid",
      ],
      [
        (v: Mutable) => (v["method"]["max_candidates"] = 32),
        "method_parameters_invalid",
      ],
      [(v: Mutable) => (v["method"]["temperature"] = 2), "unknown_property"],
    ] as const)
      assert.deepEqual(
        codes(validateCandidateAdapterSpec(mutated(mutate))),
        [code],
        String(mutate),
      );
  });

  it("rejects hash tampering, unknown fields, provider and private-reasoning fields", () => {
    const tampered = clone(spec()) as Mutable;
    tampered["adapter_spec_version"] = "1.0.1";
    assert.deepEqual(codes(validateCandidateAdapterSpec(tampered)), [
      "adapter_spec_hash_mismatch",
    ]);
    assert.ok(
      codes(
        validateCandidateAdapterSpec(mutated((v) => (v["model"] = "x"))),
      ).includes("forbidden_field"),
    );
    assert.ok(
      codes(
        validateCandidateAdapterSpec(mutated((v) => (v["reasoning"] = "x"))),
      ).includes("private_reasoning_forbidden"),
    );
    assert.deepEqual(
      codes(
        validateCandidateAdapterSpec(
          mutated((v) => (v["schema_version"] = "2.0.0")),
        ),
      ),
      ["schema_version_unsupported"],
    );
    assert.deepEqual(codes(validateCandidateAdapterSpec(null)), [
      "contract_invalid",
    ]);
  });
});

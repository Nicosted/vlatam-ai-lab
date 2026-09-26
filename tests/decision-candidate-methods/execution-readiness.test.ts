import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CANDIDATE_EXECUTION_BLOCKERS,
  CANDIDATE_EXECUTION_READINESS_STATES,
  CANDIDATE_EXECUTION_STANDING_BLOCKERS,
  evaluateCandidateExecutionReadiness,
} from "../../src/decision-candidate-methods/index.js";
import {
  DECISION_CANDIDATE_EVIDENCE_GAPS,
  deriveDecisionCandidateEvidenceGaps,
} from "../../src/decision-candidates/index.js";
import {
  DECISION_SANDBOX_FIXTURE_POLICY,
  evaluateDecisionSandboxPreflight,
  issueCodes,
} from "../../src/decision-sandbox/index.js";
import { executionRequest } from "../decision-sandbox/helpers.js";
import {
  clone,
  driftedSemifEntry,
  semifEntry,
  spec,
  type Mutable,
} from "./helpers.js";

describe("AI-144 actual-candidate execution readiness", () => {
  it("SemIf is not eligible for candidate execution, with the exact bound blockers", () => {
    assert.deepEqual(
      evaluateCandidateExecutionReadiness(spec(), semifEntry()),
      {
        state: "not_eligible_for_candidate_execution",
        blockers: [
          "archive_state_unresolved",
          "base_model_license_unresolved",
          "candidate_execution_not_authorized",
          "hostile_code_isolation_not_established",
          "model_artifact_not_bound",
          "runtime_dependency_set_not_bound",
          "upstream_code_not_admitted_to_sandbox",
        ],
      },
    );
  });

  it("has no eligible, ready or approved state", () => {
    assert.deepEqual(CANDIDATE_EXECUTION_READINESS_STATES, [
      "not_eligible_for_candidate_execution",
    ]);
    for (const word of ["approved", "eligible", "ready", "authorized"])
      assert.equal(
        (CANDIDATE_EXECUTION_READINESS_STATES as readonly string[]).includes(
          word,
        ),
        false,
      );
    assert.ok(
      CANDIDATE_EXECUTION_BLOCKERS.every(
        (code) => !/^(?:approved|eligible|ready)$/.test(code),
      ),
    );
  });

  it("carries every AI-142 evidence gap through verbatim", () => {
    const entry = semifEntry();
    assert.deepEqual(
      entry.evidence_gaps,
      deriveDecisionCandidateEvidenceGaps(entry),
    );
    const readiness = evaluateCandidateExecutionReadiness(spec(), entry);
    for (const gap of entry.evidence_gaps)
      assert.ok((readiness.blockers as readonly string[]).includes(gap), gap);
    for (const gap of DECISION_CANDIDATE_EVIDENCE_GAPS)
      assert.ok(
        (CANDIDATE_EXECUTION_BLOCKERS as readonly string[]).includes(gap),
        gap,
      );
  });

  it("keeps the Qwen base-model license unresolved: the MIT code license is not a model license", () => {
    const entry = semifEntry();
    assert.equal(entry.licensing.code.status, "evidenced");
    assert.equal(entry.licensing.code.declared_identifier, "MIT");
    assert.equal(entry.licensing.base_model.status, "unresolved");
    assert.equal(entry.licensing.base_model.declared_identifier, null);
    assert.equal(
      entry.licensing.base_model.declared_name,
      "Qwen/Qwen3.5-4B at revision 851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a",
    );
    assert.ok(
      evaluateCandidateExecutionReadiness(spec(), entry).blockers.includes(
        "base_model_license_unresolved",
      ),
    );
  });

  it("standing blockers mirror real AI-143 facts and hold whatever the entry says", () => {
    assert.equal(
      DECISION_SANDBOX_FIXTURE_POLICY.hostile_code_containment,
      "not_established",
    );
    assert.ok(
      DECISION_SANDBOX_FIXTURE_POLICY.unestablished_properties.includes(
        "model_supply_chain_safety",
      ),
    );
    const entry = semifEntry();
    const asCandidate = executionRequest("ai144-readiness-semif-0001");
    asCandidate["subject"] = {
      subject_kind: "registered_decision_candidate",
      candidate_id: entry.candidate_id,
      evidence_revision: entry.evidence_revision,
      candidate_hash: entry.candidate_hash,
    };
    assert.deepEqual(
      issueCodes(evaluateDecisionSandboxPreflight(asCandidate).issues),
      ["registered_candidate_execution_forbidden"],
    );
    for (const value of [semifEntry(), driftedSemifEntry(), null]) {
      const blockers = evaluateCandidateExecutionReadiness(
        spec(),
        value,
      ).blockers;
      for (const standing of CANDIDATE_EXECUTION_STANDING_BLOCKERS)
        assert.ok(blockers.includes(standing), standing);
    }
  });

  it("adds candidate_binding_stale on AI-142 hash drift and candidate_entry_invalid on a tampered entry", () => {
    assert.ok(
      evaluateCandidateExecutionReadiness(
        spec(),
        driftedSemifEntry(),
      ).blockers.includes("candidate_binding_stale"),
    );
    const tampered = clone(semifEntry()) as Mutable;
    tampered["licensing"]["base_model"]["status"] = "evidenced";
    const readiness = evaluateCandidateExecutionReadiness(spec(), tampered);
    assert.equal(readiness.state, "not_eligible_for_candidate_execution");
    assert.ok(readiness.blockers.includes("candidate_entry_invalid"));
  });

  it("is deterministic and never returns an empty blocker list", () => {
    const a = evaluateCandidateExecutionReadiness(spec(), semifEntry());
    const b = evaluateCandidateExecutionReadiness(spec(), semifEntry());
    assert.deepEqual(a, b);
    assert.ok(
      a.blockers.length >= CANDIDATE_EXECUTION_STANDING_BLOCKERS.length,
    );
    const sorted = [...a.blockers].sort();
    assert.deepEqual(a.blockers, sorted);
  });
});

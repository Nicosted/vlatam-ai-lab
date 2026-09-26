import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DECISION_CANDIDATE_LIFECYCLE,
  validateDecisionCandidateRegistry,
} from "../../src/decision-candidates/index.js";
import {
  evaluateDecisionSandboxPreflight,
  issueCodes,
  validateDecisionSandboxExecutionRecord,
} from "../../src/decision-sandbox/index.js";
import { executeDecisionSandboxFixture } from "../../src/decision-sandbox/executor.js";
import {
  executionRequest,
  FIXTURE_ROOT,
  load,
  SEED_REGISTRY_ROOT,
  seedCandidates,
  type Mutable,
} from "./helpers.js";

/** The seven AI-142 seed registry entries, by stable candidate id. */
const EXPECTED_CANDIDATES = [
  "tdc-bespokelabsai-nimble",
  "tdc-jaredpalmer-kev",
  "tdc-nandhakishorm-laya",
  "tdc-rizzo-ai-academy-rizzo-flow",
  "tdc-theoleecj-semif",
  "tdc-tianyucodings-nanojev",
  "tdc-wfzyx-von",
];

function candidateSubjectRequest(entry: {
  candidate_id: string;
  evidence_revision: number;
  candidate_hash: string;
}): Mutable {
  const value = executionRequest(`sandbox-candidate-${entry.candidate_id}`);
  value["subject"] = {
    subject_kind: "registered_decision_candidate",
    candidate_id: entry.candidate_id,
    evidence_revision: entry.evidence_revision,
    candidate_hash: entry.candidate_hash,
  };
  return value;
}

describe("AI-143 refuses to execute every AI-142 registered candidate", () => {
  const entries = seedCandidates();
  const registryBytes = readFileSync(`${SEED_REGISTRY_ROOT}/registry.json`);

  it("reads the exact seven-entry AI-142 seed registry", () => {
    assert.deepEqual(
      entries.map((entry) => entry.candidate_id),
      EXPECTED_CANDIDATES,
    );
    assert.equal(
      validateDecisionCandidateRegistry(
        load(`${SEED_REGISTRY_ROOT}/registry.json`),
        entries,
      ).ok,
      true,
    );
  });

  for (const id of EXPECTED_CANDIDATES) {
    it(`${id}: execution request is blocked before process creation`, async () => {
      const entry = entries.find((e) => e.candidate_id === id)!;
      const value = candidateSubjectRequest(entry);

      const preflight = evaluateDecisionSandboxPreflight(value);
      assert.equal(preflight.outcome, "blocked");
      assert.deepEqual(issueCodes(preflight.issues), [
        "registered_candidate_execution_forbidden",
      ]);
      assert.equal(preflight.adapter, null);

      let workspaces = 0;
      const execution = await executeDecisionSandboxFixture(value, {
        observe_workspace: () => (workspaces += 1),
      });
      assert.equal(workspaces, 0, "no workspace, so no process, was created");
      assert.equal(execution.result, null);
      assert.equal(execution.record.status, "blocked");
      assert.equal(execution.record.preflight_outcome, "blocked");
      assert.deepEqual(execution.record.process_outcome, {
        started: false,
        exit_code: null,
        signal: null,
        terminated_by_runtime: "none",
      });
      assert.deepEqual(execution.record.diagnostics, [
        "registered_candidate_execution_forbidden",
      ]);
      assert.equal(execution.record.adapter, null);
      assert.equal(execution.record.output_authority, "none");
      assert.equal(execution.record.downstream_allowed, false);
      assert.equal(
        validateDecisionSandboxExecutionRecord(execution.record).ok,
        true,
      );

      // A candidate id presented as a fixture adapter id is refused too.
      const disguised = executionRequest(`sandbox-disguised-${id}`);
      disguised["subject"]["adapter_id"] = id;
      assert.deepEqual(
        issueCodes(evaluateDecisionSandboxPreflight(disguised).issues),
        ["registered_candidate_execution_forbidden"],
      );
      // So is a fixture subject that smuggles a candidate binding.
      const smuggled = executionRequest(`sandbox-smuggled-${id}`);
      smuggled["subject"]["candidate_id"] = id;
      smuggled["subject"]["candidate_hash"] = entry.candidate_hash;
      assert.deepEqual(
        issueCodes(evaluateDecisionSandboxPreflight(smuggled).issues),
        ["registered_candidate_execution_forbidden"],
      );

      // The candidate's AI-142 lifecycle is untouched: nothing executed.
      assert.deepEqual(entry.lifecycle, DECISION_CANDIDATE_LIFECYCLE);
      assert.equal(entry.lifecycle.ai_lab_executed, false);
      assert.equal(entry.lifecycle.execution_enabled, false);
    });
  }

  it("leaves the AI-142 registry and entries byte-for-byte unchanged", () => {
    assert.deepEqual(
      readFileSync(`${SEED_REGISTRY_ROOT}/registry.json`),
      registryBytes,
    );
    assert.deepEqual(seedCandidates(), entries);
    for (const entry of seedCandidates())
      assert.deepEqual(entry.lifecycle, DECISION_CANDIDATE_LIFECYCLE);
  });

  it("the registered-candidate fixture and its blocked record are consistent", () => {
    const request = load(
      `${FIXTURE_ROOT}/invalid-execution-request-registered-candidate.json`,
    );
    assert.deepEqual(
      issueCodes(evaluateDecisionSandboxPreflight(request).issues),
      ["registered_candidate_execution_forbidden"],
    );
    const record = load<Mutable>(
      `${FIXTURE_ROOT}/valid-execution-record-registered-candidate-blocked.json`,
    );
    assert.equal(record["status"], "blocked");
    assert.equal(record["process_outcome"]["started"], false);
    assert.deepEqual(record["diagnostics"], [
      "registered_candidate_execution_forbidden",
    ]);
  });
});

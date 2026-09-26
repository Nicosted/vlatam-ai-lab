/**
 * AI-144 — the AI-LAB-owned direct option-logit method fixture adapter,
 * executed through the unchanged AI-143 fixture runner and policy.
 *
 * AI-144 executes candidate-specific methodology, not candidate-supplied
 * code or model weights. A method-conformance success is not evidence of
 * model quality.
 *
 * The method fixture (`synthetic_fixture_adapter`) and the AI-142 SemIf
 * candidate (`registered_decision_candidate`) are different subjects: the
 * first runs under the synthetic fixture policy, the second is refused
 * before process creation.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildDirectLogitChoiceResult,
  findSyntheticLogitFixture,
} from "../../src/decision-sandbox/fixture/direct-logit-method-adapter.mjs";
import {
  computeTypedDecisionRequestHash,
  computeTypedDecisionResultHash,
  computeTypedDecisionSemanticRequestHash,
} from "../../src/decision/canonical.js";
import type {
  TypedDecisionRequest,
  TypedDecisionResult,
} from "../../src/decision/contracts.js";
import { validateTypedDecisionResultForRequest } from "../../src/decision/validation.js";
import { validateDecisionCandidateEntry } from "../../src/decision-candidates/index.js";
import {
  DECISION_SANDBOX_DIRECT_LOGIT_METHOD_ADAPTER,
  DECISION_SANDBOX_FIXTURE_ADAPTER,
  DECISION_SANDBOX_FIXTURE_POLICY,
  computeDecisionSandboxExecutionRecordHash,
  computeDecisionSandboxSemanticExecutionHash,
  evaluateDecisionSandboxPreflight,
  issueCodes,
  validateDecisionSandboxExecutionRecord,
  validateDecisionSandboxPolicy,
} from "../../src/decision-sandbox/index.js";
import { executeDecisionSandboxFixture } from "../../src/decision-sandbox/executor.js";
import {
  SEED_REGISTRY_ROOT,
  clone,
  executionRequest,
  load,
  seedCandidates,
  type Mutable,
} from "./helpers.js";

const METHOD = DECISION_SANDBOX_DIRECT_LOGIT_METHOD_ADAPTER;
const REQUEST_ROOT = "data/fixtures/decision-candidate-methods/requests";
const SEMIF_ENTRY = `${SEED_REGISTRY_ROOT}/candidates/tdc-theoleecj-semif.json`;

const REQUESTS = {
  intent: "data/fixtures/typed-decision/valid-choice-request.json",
  intentPermuted:
    "data/fixtures/typed-decision/valid-choice-request-permuted.json",
  route: `${REQUEST_ROOT}/choice-request-remainder-tie.json`,
  routePermuted: `${REQUEST_ROOT}/choice-request-remainder-tie-permuted.json`,
  sixteen: `${REQUEST_ROOT}/choice-request-sixteen-options.json`,
  topTie: `${REQUEST_ROOT}/choice-request-top-tie.json`,
  seventeen: `${REQUEST_ROOT}/choice-request-seventeen-options.json`,
  unbound: `${REQUEST_ROOT}/choice-request-unbound.json`,
  boolean: "data/fixtures/typed-decision/valid-boolean-request.json",
  score: "data/fixtures/typed-decision/valid-score-request.json",
  ranking: "data/fixtures/typed-decision/valid-ranking-request.json",
} as const;

function request(key: keyof typeof REQUESTS): TypedDecisionRequest {
  return load<TypedDecisionRequest>(REQUESTS[key]);
}

/** An execution request that binds the AI-144 method fixture adapter. */
function methodExecution(
  key: keyof typeof REQUESTS,
  executionId = `ai144-method-${key.toLowerCase()}-0001`,
): Mutable {
  const value = executionRequest(executionId, request(key));
  value["subject"] = {
    subject_kind: "synthetic_fixture_adapter",
    adapter_id: METHOD.adapter_id,
    adapter_version: METHOD.adapter_version,
    artifact_sha256: METHOD.artifact_sha256,
    protocol_version: METHOD.protocol_version,
  };
  return value;
}

function assertRecordIntegrity(record: Mutable): void {
  assert.equal(validateDecisionSandboxExecutionRecord(record).ok, true);
  assert.equal(record["output_authority"], "none");
  assert.equal(record["downstream_allowed"], false);
  assert.equal(
    record["semantic_execution_hash"],
    computeDecisionSandboxSemanticExecutionHash(record as never),
  );
  assert.equal(
    record["execution_record_hash"],
    computeDecisionSandboxExecutionRecordHash(record as never),
  );
  assert.deepEqual(record["sandbox_policy"], {
    policy_id: DECISION_SANDBOX_FIXTURE_POLICY.policy_id,
    policy_version: DECISION_SANDBOX_FIXTURE_POLICY.policy_version,
    policy_hash: DECISION_SANDBOX_FIXTURE_POLICY.policy_hash,
  });
}

describe("AI-144 direct-logit method fixture under the AI-143 sandbox", () => {
  it("is admitted as one more repository-owned synthetic fixture under the unchanged policy", () => {
    assert.equal(METHOD.subject_kind, "synthetic_fixture_adapter");
    assert.equal(METHOD.result_origin, "synthetic_fixture");
    assert.deepEqual(METHOD.supported_decision_types, ["choice"]);
    assert.equal(METHOD.max_candidates, 16);
    assert.doesNotMatch(METHOD.adapter_id, /^tdc-/);
    // The AI-143 policy (limits, timeout, isolation claims) is unchanged.
    assert.equal(
      DECISION_SANDBOX_FIXTURE_POLICY.policy_hash,
      "6bad0bd18d779acb838ecf37e561d1678b13f0b53649acf40810972b03bc8378",
    );
    assert.equal(
      validateDecisionSandboxPolicy(DECISION_SANDBOX_FIXTURE_POLICY).ok,
      true,
    );
    assert.equal(DECISION_SANDBOX_FIXTURE_POLICY.timeout_ms, 3_000);
    assert.equal(DECISION_SANDBOX_FIXTURE_POLICY.max_processes, 1);
    // The AI-143 replay fixture keeps its full decision-type coverage.
    assert.deepEqual(
      DECISION_SANDBOX_FIXTURE_ADAPTER.supported_decision_types,
      ["choice", "boolean", "score", "ranking"],
    );
  });

  for (const key of [
    "intent",
    "intentPermuted",
    "route",
    "routePermuted",
    "sixteen",
  ] as const)
    it(`${key}: executes the pinned method and returns a synthetic_fixture AI-140 result`, async () => {
      const execution = await executeDecisionSandboxFixture(
        methodExecution(key),
      );
      const record = execution.record as unknown as Mutable;
      assert.equal(
        record["status"],
        "succeeded",
        JSON.stringify(record["diagnostics"]),
      );
      assert.equal(
        record["preflight_outcome"],
        "eligible_for_fixture_execution",
      );
      assert.deepEqual(record["adapter"], {
        adapter_id: METHOD.adapter_id,
        adapter_version: METHOD.adapter_version,
        artifact_sha256: METHOD.artifact_sha256,
      });
      assert.deepEqual(record["process_outcome"], {
        started: true,
        exit_code: 0,
        signal: null,
        terminated_by_runtime: "none",
      });
      assert.equal(record["telemetry"]["stderr_bytes"], 0);
      assertRecordIntegrity(record);

      const result = execution.result;
      assert.ok(result);
      assert.equal(result.result_origin, "synthetic_fixture");
      assert.equal(result.governance.downstream_allowed, false);
      assert.equal(record["typed_result_hash"], result.result_hash);
      const req = request(key);
      assert.equal(validateTypedDecisionResultForRequest(result, req).ok, true);
      // Identical to the in-process method over the same bytes.
      const hash = computeTypedDecisionRequestHash(req);
      const local = buildDirectLogitChoiceResult(
        req,
        hash,
        findSyntheticLogitFixture(hash),
      );
      assert.ok(local.ok);
      if (local.ok) assert.deepEqual(result, local.result);
    });

  it("permuted requests yield the same semantic decision through the sandbox", async () => {
    for (const [a, b] of [
      ["intent", "intentPermuted"],
      ["route", "routePermuted"],
    ] as const) {
      const x = await executeDecisionSandboxFixture(methodExecution(a));
      const y = await executeDecisionSandboxFixture(methodExecution(b));
      assert.ok(x.result && y.result);
      assert.deepEqual(x.result.decision, y.result.decision);
      assert.deepEqual(x.result.confidence, y.result.confidence);
      assert.equal(
        computeTypedDecisionSemanticRequestHash(request(a)),
        computeTypedDecisionSemanticRequestHash(request(b)),
      );
    }
  });

  it("is deterministic: repeated runs share the semantic execution hash", async () => {
    const first = await executeDecisionSandboxFixture(methodExecution("route"));
    const second = await executeDecisionSandboxFixture(
      methodExecution("route"),
    );
    assert.equal(
      first.record.semantic_execution_hash,
      second.record.semantic_execution_hash,
    );
    assert.deepEqual(first.result, second.result);
  });

  /**
   * Two layers: the AI-143 record says the process and protocol succeeded;
   * the nested AI-140 result carries the decision-level outcome.
   */
  async function assertTypedOutcome(
    value: Mutable,
    req: TypedDecisionRequest,
  ): Promise<TypedDecisionResult> {
    const execution = await executeDecisionSandboxFixture(value);
    const record = execution.record as unknown as Mutable;
    assert.equal(record["status"], "succeeded", JSON.stringify(record));
    assert.deepEqual(record["process_outcome"], {
      started: true,
      exit_code: 0,
      signal: null,
      terminated_by_runtime: "none",
    });
    assert.deepEqual(record["diagnostics"], []);
    assertRecordIntegrity(record);
    const result = execution.result;
    assert.ok(result, "a typed result exists");
    assert.equal(record["typed_result_hash"], result.result_hash);
    assert.equal(result.result_hash, computeTypedDecisionResultHash(result));
    assert.equal(validateTypedDecisionResultForRequest(result, req).ok, true);
    assert.equal(result.result_origin, "synthetic_fixture");
    assert.equal(result.execution_paradigm, "typed_decision");
    assert.equal(result.decision_type, "choice");
    assert.equal(result.governance.downstream_allowed, false);
    assert.equal(result.escalation.executed, false);
    assert.equal(result.decision, null);
    assert.equal(result.confidence, null);
    assert.equal(result.failure, null);
    return result;
  }

  it("a tie at the maximum synthetic logit is a succeeded execution carrying a typed abstention", async () => {
    const result = await assertTypedOutcome(
      methodExecution("topTie"),
      request("topTie"),
    );
    assert.equal(result.status, "abstained");
    assert.deepEqual(result.abstention, { reason_code: "ambiguous" });
    assert.equal(result.block, null);
  });

  it("no reviewed synthetic logits is a succeeded execution carrying a typed block", async () => {
    const unbound = await assertTypedOutcome(
      methodExecution("unbound"),
      request("unbound"),
    );
    assert.equal(unbound.status, "blocked");
    assert.deepEqual(unbound.block, { reason_code: "execution_unavailable" });
    assert.equal(unbound.abstention, null);

    // Same semantics as a reviewed request, but this exact request was
    // never bound to synthetic logits.
    const renamed = clone(request("intent")) as Mutable;
    renamed["request_id"] = "synthetic-intent-request-0099";
    const value = methodExecution("intent", "ai144-method-renamed-0001");
    value["request"] = renamed;
    value["request_hash"] = computeTypedDecisionRequestHash(
      renamed as TypedDecisionRequest,
    );
    const blocked = await assertTypedOutcome(
      value,
      renamed as TypedDecisionRequest,
    );
    assert.equal(blocked.status, "blocked");
    assert.deepEqual(blocked.block, { reason_code: "execution_unavailable" });
  });

  it("genuine technical conditions still produce AI-143 technical failures, never typed outcomes", async () => {
    // Malformed adapter output (AI-143 replay fixture behaviours).
    const malformed = await executeDecisionSandboxFixture(
      executionRequest("fixture-behavior-malformed-json-0001"),
    );
    assert.equal(malformed.record.status, "protocol_failed");
    assert.equal(malformed.result, null);
    const nonzero = await executeDecisionSandboxFixture(
      executionRequest("fixture-behavior-exit-nonzero-0001"),
    );
    assert.equal(nonzero.record.status, "process_failed");
    assert.equal(nonzero.result, null);
    // A runtime failure around the method fixture discards the typed
    // abstention rather than reporting it.
    const cleanup = await executeDecisionSandboxFixture(
      methodExecution("topTie", "ai144-method-cleanup-0001"),
      {
        workspace_removal: () => {
          throw new Error("synthetic cleanup failure");
        },
      },
    );
    assert.equal(cleanup.record.status, "runtime_failed");
    assert.ok(cleanup.record.diagnostics.includes("workspace_cleanup_failed"));
    assert.equal(cleanup.record.typed_result_hash, null);
    assert.equal(cleanup.result, null);
    assertRecordIntegrity(cleanup.record as unknown as Mutable);
  });

  for (const key of ["boolean", "score", "ranking"] as const)
    it(`${key}: unsupported decision type is blocked before process creation`, async () => {
      const preflight = evaluateDecisionSandboxPreflight(methodExecution(key));
      assert.equal(preflight.outcome, "blocked");
      assert.deepEqual(issueCodes(preflight.issues), [
        "adapter_decision_type_unsupported",
      ]);
      let workspaces = 0;
      const execution = await executeDecisionSandboxFixture(
        methodExecution(key),
        {
          observe_workspace: () => (workspaces += 1),
        },
      );
      assert.equal(workspaces, 0);
      assert.equal(execution.record.status, "blocked");
      assert.equal(execution.record.process_outcome.started, false);
      assert.equal(execution.record.adapter, null);
      assert.deepEqual(execution.record.diagnostics, [
        "adapter_decision_type_unsupported",
      ]);
      assert.equal(execution.result, null);
      assertRecordIntegrity(execution.record as unknown as Mutable);
    });

  it("more than 16 candidates is blocked before process creation", async () => {
    let workspaces = 0;
    const execution = await executeDecisionSandboxFixture(
      methodExecution("seventeen"),
      {
        observe_workspace: () => (workspaces += 1),
      },
    );
    assert.equal(workspaces, 0);
    assert.equal(execution.record.status, "blocked");
    assert.deepEqual(execution.record.diagnostics, [
      "adapter_candidate_limit_exceeded",
    ]);
    // The AI-143 replay fixture's own bound is unaffected.
    assert.deepEqual(
      issueCodes(
        evaluateDecisionSandboxPreflight(
          executionRequest("ai143-seventeen-0001", request("seventeen")),
        ).issues,
      ),
      [],
    );
  });

  it("a wrong artifact hash or version for the method fixture is blocked", () => {
    const wrongHash = methodExecution("intent");
    wrongHash["subject"]["artifact_sha256"] =
      DECISION_SANDBOX_FIXTURE_ADAPTER.artifact_sha256;
    assert.deepEqual(
      issueCodes(evaluateDecisionSandboxPreflight(wrongHash).issues),
      ["adapter_hash_mismatch"],
    );
    const wrongVersion = methodExecution("intent");
    wrongVersion["subject"]["adapter_version"] = "1.0.1";
    assert.deepEqual(
      issueCodes(evaluateDecisionSandboxPreflight(wrongVersion).issues),
      ["adapter_version_mismatch"],
    );
  });

  it("the registered AI-142 SemIf candidate stays blocked before process creation", async () => {
    const entry = load<Mutable>(SEMIF_ENTRY);
    const bytesBefore = readFileSync(SEMIF_ENTRY);
    const asCandidate = methodExecution("intent", "ai144-semif-candidate-0001");
    asCandidate["subject"] = {
      subject_kind: "registered_decision_candidate",
      candidate_id: entry["candidate_id"],
      evidence_revision: entry["evidence_revision"],
      candidate_hash: entry["candidate_hash"],
    };
    const asAdapterId = methodExecution(
      "intent",
      "ai144-semif-adapter-id-0001",
    );
    asAdapterId["subject"]["adapter_id"] = "tdc-theoleecj-semif";
    const withBinding = methodExecution("intent", "ai144-semif-binding-0001");
    withBinding["subject"]["candidate_id"] = "tdc-theoleecj-semif";
    for (const value of [asCandidate, asAdapterId, withBinding]) {
      let workspaces = 0;
      const execution = await executeDecisionSandboxFixture(value, {
        observe_workspace: () => (workspaces += 1),
      });
      assert.equal(workspaces, 0);
      assert.equal(execution.record.status, "blocked");
      assert.equal(execution.record.process_outcome.started, false);
      assert.deepEqual(execution.record.diagnostics, [
        "registered_candidate_execution_forbidden",
      ]);
      assert.equal(execution.result, null);
    }
    // Running the method fixture never touches the AI-142 entry.
    await executeDecisionSandboxFixture(methodExecution("intent"));
    assert.deepEqual(readFileSync(SEMIF_ENTRY), bytesBefore);
    assert.equal(validateDecisionCandidateEntry(entry).ok, true);
    assert.equal(entry["lifecycle"]["ai_lab_executed"], false);
    assert.equal(entry["lifecycle"]["execution_enabled"], false);
    assert.equal(entry["lifecycle"]["registry_state"], "discovered");
    assert.equal(entry["lifecycle"]["authority"], "evidence_only");
  });

  it("all seven registered candidates remain non-executable, as subjects and as adapter ids", () => {
    const entries = seedCandidates();
    assert.equal(entries.length, 7);
    for (const entry of entries) {
      const asCandidate = methodExecution(
        "intent",
        `ai144-${entry.candidate_id}`,
      );
      asCandidate["subject"] = {
        subject_kind: "registered_decision_candidate",
        candidate_id: entry.candidate_id,
        evidence_revision: entry.evidence_revision,
        candidate_hash: entry.candidate_hash,
      };
      const asAdapterId = methodExecution(
        "intent",
        `ai144-id-${entry.candidate_id}`,
      );
      asAdapterId["subject"]["adapter_id"] = entry.candidate_id;
      for (const value of [asCandidate, asAdapterId])
        assert.deepEqual(
          issueCodes(evaluateDecisionSandboxPreflight(value).issues),
          ["registered_candidate_execution_forbidden"],
        );
      assert.equal(entry.lifecycle.ai_lab_executed, false);
      assert.equal(entry.lifecycle.execution_enabled, false);
    }
  });

  it("inherits AI-143 framing, output-authority and protocol protections", () => {
    const withAuthority = methodExecution("intent");
    withAuthority["output_authority"] = "approved";
    assert.ok(
      issueCodes(
        evaluateDecisionSandboxPreflight(withAuthority).issues,
      ).includes("output_authority_invalid"),
    );
    const withCommand = methodExecution("intent");
    withCommand["subject"]["command"] = "python";
    assert.ok(
      issueCodes(evaluateDecisionSandboxPreflight(withCommand).issues).includes(
        "execution_control_forbidden",
      ),
    );
    const protocol = methodExecution("intent");
    protocol["subject"]["protocol_version"] = "2.0.0";
    assert.ok(
      issueCodes(evaluateDecisionSandboxPreflight(protocol).issues).includes(
        "protocol_version_unsupported",
      ),
    );
  });
});

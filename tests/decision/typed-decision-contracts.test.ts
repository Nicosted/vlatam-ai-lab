import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

import * as decisionPlane from "../../src/decision/index.js";
import {
  EXECUTION_PARADIGMS,
  EXECUTION_PARADIGM_ROUTING_ENABLED,
  TYPED_DECISION_CANONICALIZATION_VERSION,
  TYPED_DECISION_CONTRACT_VERSION,
  canonicalizeTypedDecisionJson,
  compareChoicePermutationInvariance,
  computeTypedDecisionRequestHash,
  computeTypedDecisionResultHash,
  computeTypedDecisionSemanticRequestHash,
  deriveTypedDecisionDisposition,
  validateTypedDecisionRequest,
  validateTypedDecisionResult,
  validateTypedDecisionResultForRequest,
  type TypedDecisionIssueCode,
  type TypedDecisionRequest,
  type TypedDecisionResult,
} from "../../src/decision/index.js";
import { canonicalizeOpenRouterRegistryJson } from "../../src/providers/openrouter-registry.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const applyFormats = ((addFormatsModule as any).default ??
  addFormatsModule) as (ajv: Ajv2020) => void;

const FIXTURES = "data/fixtures/typed-decision";
const load = <T = Record<string, unknown>>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;
const fixture = <T = Record<string, unknown>>(name: string): T =>
  load<T>(`${FIXTURES}/${name}`);
const clone = <T>(value: T): T => structuredClone(value);

function schemaValidator(file: string) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  applyFormats(ajv);
  return ajv.compile(load(file));
}
const requestSchema = schemaValidator(
  "schemas/ai-typed-decision-request.schema.json",
);
const resultSchema = schemaValidator(
  "schemas/ai-typed-decision-result.schema.json",
);

const choiceRequest = () =>
  fixture<TypedDecisionRequest>("valid-choice-request.json");
const choiceResult = () =>
  fixture<TypedDecisionResult>("valid-choice-result.json");
const abstentionResult = () =>
  fixture<TypedDecisionResult>("valid-abstention-result.json");

/** Recomputes the self-hash so a mutation is tested on its own merits. */
function rehash<T extends Record<string, unknown>>(value: T): T {
  const copy = { ...value } as Record<string, unknown>;
  try {
    copy["result_hash"] = computeTypedDecisionResultHash(
      copy as unknown as TypedDecisionResult,
    );
  } catch {
    // Non-canonicalizable values (fractional numbers) cannot be hashed;
    // the structural defect must be reported on its own.
  }
  return copy as T;
}

function codes(check: {
  ok: boolean;
  issues?: readonly { code: string }[];
}): string[] {
  return check.ok
    ? []
    : [...new Set((check.issues ?? []).map((issue) => issue.code))];
}

function assertRequestRejected(
  value: unknown,
  code: TypedDecisionIssueCode,
): void {
  const check = validateTypedDecisionRequest(value);
  assert.equal(check.ok, false, `expected rejection with ${code}`);
  assert.ok(
    codes(check).includes(code),
    `expected ${code}, got ${codes(check).join(",")}`,
  );
}

function assertResultRejected(
  result: unknown,
  code: TypedDecisionIssueCode,
  request: unknown = choiceRequest(),
): void {
  const check = validateTypedDecisionResultForRequest(result, request);
  assert.equal(check.ok, false, `expected rejection with ${code}`);
  assert.ok(
    codes(check).includes(code),
    `expected ${code}, got ${codes(check).join(",")}`,
  );
}

const VALID_PAIRS = [
  ["valid-choice-request.json", "valid-choice-result.json"],
  ["valid-choice-request-permuted.json", "valid-choice-result-permuted.json"],
  ["valid-choice-request.json", "valid-abstention-result.json"],
  ["valid-choice-request.json", "valid-blocked-result.json"],
  ["valid-boolean-request.json", "valid-boolean-result.json"],
  ["valid-score-request.json", "valid-score-result.json"],
  ["valid-ranking-request.json", "valid-ranking-result.json"],
] as const;

describe("AI-140 typed decision contract validity", () => {
  it("declares contract 1.0.0, three execution paradigms and no paradigm routing", () => {
    assert.equal(TYPED_DECISION_CONTRACT_VERSION, "1.0.0");
    assert.deepEqual(
      [...EXECUTION_PARADIGMS],
      ["deterministic", "typed_decision", "frontier_reasoning"],
    );
    assert.equal(EXECUTION_PARADIGM_ROUTING_ENABLED, false);
  });

  for (const [requestFile, resultFile] of VALID_PAIRS) {
    it(`accepts ${requestFile} + ${resultFile} at runtime and in JSON Schema`, () => {
      const request = fixture(requestFile);
      const result = fixture(resultFile);
      assert.equal(
        requestSchema(request),
        true,
        JSON.stringify(requestSchema.errors),
      );
      assert.equal(
        resultSchema(result),
        true,
        JSON.stringify(resultSchema.errors),
      );
      assert.deepEqual(codes(validateTypedDecisionRequest(request)), []);
      assert.deepEqual(codes(validateTypedDecisionResult(result)), []);
      assert.deepEqual(
        codes(validateTypedDecisionResultForRequest(result, request)),
        [],
      );
    });
  }

  it("covers choice, boolean, score and ranking requests and a first-class abstention", () => {
    const types = VALID_PAIRS.map(
      ([request]) => fixture(request)["decision_type"],
    );
    for (const type of ["choice", "boolean", "score", "ranking"])
      assert.ok(types.includes(type));
    const abstained = abstentionResult();
    assert.equal(abstained.status, "abstained");
    assert.equal(abstained.decision, null);
    assert.equal(abstained.abstention?.reason_code, "ambiguous");
    assert.equal(abstained.failure, null);
  });

  it("registers both schemas with fixtures that validate and fail as declared", () => {
    const registry = load<{
      contracts: Array<{
        contract_name: string;
        schema_file: string;
        valid_fixture: string;
        invalid_fixtures: string[];
      }>;
    }>("schemas/schema-registry.json");
    const entries = registry.contracts.filter((entry) =>
      ["ai_typed_decision_request", "ai_typed_decision_result"].includes(
        entry.contract_name,
      ),
    );
    assert.equal(entries.length, 2);
    for (const entry of entries) {
      const validate = schemaValidator(entry.schema_file);
      assert.equal(
        validate(load(entry.valid_fixture)),
        true,
        entry.valid_fixture,
      );
      assert.ok(entry.invalid_fixtures.length >= 3);
      for (const invalid of entry.invalid_fixtures)
        assert.equal(
          validate(load(invalid)),
          false,
          `${invalid} must be rejected`,
        );
    }
  });

  it("rejects every registered invalid fixture at runtime as well", () => {
    for (const name of [
      "invalid-request-unknown-decision-type.json",
      "invalid-request-provider-field.json",
      "invalid-request-regulated-data.json",
    ])
      assert.equal(validateTypedDecisionRequest(fixture(name)).ok, false, name);
    for (const name of [
      "invalid-result-downstream-authority.json",
      "invalid-result-probability-out-of-range.json",
      "invalid-result-calibration-claim.json",
      "invalid-result-escalation-executed.json",
      "invalid-result-private-reasoning.json",
    ])
      assert.equal(validateTypedDecisionResult(fixture(name)).ok, false, name);
  });
});

describe("AI-140 typed decision requests fail closed", () => {
  it("rejects an unknown decision type", () => {
    const request = { ...choiceRequest(), decision_type: "free_text" };
    assertRequestRejected(request, "decision_type_invalid");
    assert.equal(requestSchema(request), false);
  });

  it("rejects an unsupported schema major and a malformed version", () => {
    assertRequestRejected(
      { ...choiceRequest(), schema_version: "2.0.0" },
      "schema_version_unsupported",
    );
    assertRequestRejected(
      { ...choiceRequest(), schema_version: "1.0" },
      "schema_version_invalid",
    );
    assert.equal(
      requestSchema({ ...choiceRequest(), schema_version: "2.0.0" }),
      false,
    );
  });

  it("rejects duplicate, empty, oversized and malformed candidate sets", () => {
    const request = choiceRequest();
    const domain = request.output_domain as unknown as {
      candidates: { candidate_id: string; label: string }[];
    };
    const duplicate = clone(request) as unknown as {
      output_domain: typeof domain;
    };
    duplicate.output_domain.candidates[1] = { ...domain.candidates[0]! };
    assertRequestRejected(duplicate, "duplicate_candidate_id");

    const empty = clone(request) as unknown as { output_domain: typeof domain };
    empty.output_domain.candidates = [];
    assertRequestRejected(empty, "candidate_set_invalid");
    assert.equal(requestSchema(empty), false);

    const single = clone(request) as unknown as {
      output_domain: typeof domain;
    };
    single.output_domain.candidates = [domain.candidates[0]!];
    assertRequestRejected(single, "candidate_set_invalid");

    const oversized = clone(request) as unknown as {
      output_domain: typeof domain;
    };
    oversized.output_domain.candidates = Array.from({ length: 33 }, (_, i) => ({
      candidate_id: `intent.c${String(i).padStart(2, "0")}`,
      label: `Candidate ${i}`,
    }));
    assertRequestRejected(oversized, "candidate_set_invalid");

    for (const badId of ["Intent A", "", "-leading", "a", "x".repeat(129)]) {
      const malformed = clone(request) as unknown as {
        output_domain: typeof domain;
      };
      malformed.output_domain.candidates[0]!.candidate_id = badId;
      assertRequestRejected(malformed, "candidate_invalid");
      assert.equal(requestSchema(malformed), false, badId);
    }
  });

  it("rejects a mismatch between decision_type and output_domain", () => {
    const request = { ...choiceRequest(), decision_type: "boolean" };
    assertRequestRejected(request, "decision_type_domain_mismatch");
    assert.equal(requestSchema(request), false);
  });

  it("rejects invalid score domains", () => {
    const score = fixture<TypedDecisionRequest>("valid-score-request.json");
    for (const domain of [
      { kind: "score", scale_id: "synthetic.scale", minimum: 4, maximum: 4 },
      { kind: "score", scale_id: "synthetic.scale", minimum: 0, maximum: 0.5 },
      {
        kind: "score",
        scale_id: "synthetic.scale",
        minimum: 0,
        maximum: Number.POSITIVE_INFINITY,
      },
    ])
      assertRequestRejected(
        { ...score, output_domain: domain },
        "score_domain_invalid",
      );
  });

  it("rejects malformed, duplicate and type-mismatched facts", () => {
    const request = choiceRequest();
    const facts = request.bounded_state.facts;
    assertRequestRejected(
      { ...request, bounded_state: { facts: [facts[0], facts[0]] } },
      "duplicate_fact_id",
    );
    const mismatch = {
      ...request,
      bounded_state: {
        facts: [{ fact_id: "a.b", value_type: "integer", value: "3" }],
      },
    };
    assertRequestRejected(mismatch, "fact_invalid");
    assert.equal(requestSchema(mismatch), false);
    assertRequestRejected(
      {
        ...request,
        bounded_state: {
          facts: [{ fact_id: "a.b", value_type: "integer", value: 1.5 }],
        },
      },
      "fact_invalid",
    );
    assertRequestRejected(
      {
        ...request,
        bounded_state: {
          facts: Array.from({ length: 65 }, (_, i) => ({
            fact_id: `f.${i}0`,
            value_type: "boolean",
            value: true,
          })),
        },
      },
      "bounded_state_invalid",
    );
  });

  it("rejects non-synthetic data classes, downstream use and escalation policies", () => {
    const request = choiceRequest();
    for (const classification of ["confidential", "regulated", "restricted"])
      assertRequestRejected(
        {
          ...request,
          policy: { ...request.policy, data_classification: classification },
        },
        "data_classification_not_permitted",
      );
    assertRequestRejected(
      {
        ...request,
        policy: { ...request.policy, downstream_use: "approved_export" },
      },
      "downstream_authority_forbidden",
    );
    assertRequestRejected(
      {
        ...request,
        policy: {
          ...request.policy,
          escalation_policy_ref: "frontier-fallback",
        },
      },
      "escalation_policy_forbidden",
    );
    assertRequestRejected(
      {
        ...request,
        policy: { ...request.policy, abstention_permitted: false },
      },
      "policy_invalid",
    );
  });

  it("rejects provider, model, credential, transport and reviewer fields anywhere", () => {
    const request = choiceRequest();
    for (const mutation of [
      { ...request, provider_id: "vendor" },
      { ...request, model: "any-model" },
      { ...request, api_key: "redacted" },
      { ...request, base_url: "https://example.invalid" },
      { ...request, policy: { ...request.policy, reviewer_id: "person-1" } },
      {
        ...request,
        bounded_state: {
          facts: [
            { fact_id: "a.b", value_type: "boolean", value: true, token: "x" },
          ],
        },
      },
    ]) {
      assertRequestRejected(mutation, "forbidden_field");
      assert.equal(requestSchema(mutation), false);
    }
  });

  it("rejects unknown properties and wrong execution paradigms", () => {
    const request = choiceRequest();
    assertRequestRejected({ ...request, extra: true }, "unknown_property");
    assertRequestRejected(
      { ...request, question: { ...request.question, hint: "x" } },
      "unknown_property",
    );
    for (const paradigm of ["deterministic", "frontier_reasoning", "laya"])
      assertRequestRejected(
        { ...request, execution_paradigm: paradigm },
        "execution_paradigm_invalid",
      );
  });

  it("rejects duplicate or malformed evidence references", () => {
    const request = choiceRequest();
    const ref = request.evidence_refs[0]!;
    assertRequestRejected(
      { ...request, evidence_refs: [ref, ref] },
      "duplicate_evidence_id",
    );
    assertRequestRejected(
      { ...request, evidence_refs: [{ ...ref, content_hash: "not-a-hash" }] },
      "evidence_ref_invalid",
    );
  });

  it("never throws on hostile input", () => {
    const cyclic: Record<string, unknown> = {
      contract: "typed_decision_request",
    };
    cyclic["self"] = cyclic;
    for (const value of [
      null,
      undefined,
      1,
      "x",
      [],
      [1],
      {},
      cyclic,
      { contract: "typed_decision_result" },
    ]) {
      assert.equal(validateTypedDecisionRequest(value).ok, false);
      assert.equal(validateTypedDecisionResult(value).ok, false);
      assert.equal(
        validateTypedDecisionResultForRequest(value, value).ok,
        false,
      );
      assert.equal(
        deriveTypedDecisionDisposition(value, value).disposition,
        "invalid",
      );
    }
  });
});

describe("AI-140 typed decision results fail closed", () => {
  type Distribution = {
    completeness: string;
    entries: { candidate_id: string; probability_micros: number }[];
  };
  const withDistribution = (
    distribution: Distribution,
    selected = "intent.tariff_question",
  ) => {
    const result = choiceResult() as unknown as Record<string, unknown>;
    result["decision"] = {
      kind: "choice",
      selected_candidate_id: selected,
      distribution,
    };
    return rehash(result);
  };
  const entries = () =>
    clone(
      (choiceResult().decision as unknown as { distribution: Distribution })
        .distribution.entries,
    );

  it("rejects invalid, fractional, negative and above-one probabilities without repair", () => {
    for (const bad of [1.5, -1, 1_000_001, 0.8]) {
      const list = entries();
      list[0]!.probability_micros = bad;
      const result = withDistribution({
        completeness: "complete",
        entries: list,
      });
      assertResultRejected(result, "probability_invalid");
      assert.equal(resultSchema(result), false);
    }
  });

  it("rejects non-finite probabilities in the runtime representation", () => {
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      const list = entries();
      list[0]!.probability_micros = bad;
      const result = choiceResult() as unknown as Record<string, unknown>;
      result["decision"] = {
        kind: "choice",
        selected_candidate_id: "intent.tariff_question",
        distribution: { completeness: "complete", entries: list },
      };
      assertResultRejected(result, "probability_invalid");
    }
  });

  it("rejects a complete distribution that does not sum to exactly 1_000_000", () => {
    const list = entries();
    list[0]!.probability_micros += 1;
    assertResultRejected(
      withDistribution({ completeness: "complete", entries: list }),
      "distribution_sum_invalid",
    );
    const partial = entries();
    partial[2]!.probability_micros = 900_000;
    assertResultRejected(
      withDistribution({ completeness: "partial", entries: partial }),
      "distribution_sum_invalid",
    );
  });

  it("rejects an incomplete distribution declared complete", () => {
    const list = entries().filter(
      (entry) => entry.candidate_id !== "intent.other",
    );
    list[0]!.probability_micros += 50_000;
    assertResultRejected(
      withDistribution({ completeness: "complete", entries: list }),
      "distribution_incomplete",
    );
  });

  it("requires a complete distribution when the request demands it", () => {
    const partial = entries().filter(
      (entry) => entry.candidate_id !== "intent.other",
    );
    assertResultRejected(
      withDistribution({ completeness: "partial", entries: partial }),
      "distribution_required",
    );
    const result = choiceResult() as unknown as Record<string, unknown>;
    result["decision"] = {
      kind: "choice",
      selected_candidate_id: "intent.tariff_question",
      distribution: null,
    };
    assertResultRejected(rehash(result), "distribution_required");
  });

  it("rejects non-canonical order and duplicate candidates instead of normalizing", () => {
    const reversed = entries().reverse();
    assertResultRejected(
      withDistribution({ completeness: "complete", entries: reversed }),
      "distribution_order_invalid",
    );
    const list = entries();
    list[1] = { ...list[0]! };
    assertResultRejected(
      withDistribution({ completeness: "complete", entries: list }),
      "duplicate_candidate_id",
    );
  });

  it("rejects result candidates that are not present in the request", () => {
    const list = entries();
    list[1]!.candidate_id = "intent.p_unknown";
    assertResultRejected(
      withDistribution({ completeness: "complete", entries: list }),
      "distribution_candidate_unknown",
    );
    const selected = entries();
    selected[2]!.candidate_id = "intent.zz_unknown";
    assertResultRejected(
      withDistribution(
        { completeness: "complete", entries: selected },
        "intent.zz_unknown",
      ),
      "selected_candidate_unknown",
    );
  });

  it("rejects a selected candidate that is not modal in its own distribution", () => {
    assertResultRejected(
      withDistribution(
        { completeness: "complete", entries: entries() },
        "intent.other",
      ),
      "selected_candidate_not_modal",
    );
  });

  it("rejects malformed confidence and any calibration claim", () => {
    const base = choiceResult() as unknown as Record<string, unknown>;
    for (const [confidence, code] of [
      [
        {
          confidence_micros: 1_200_000,
          semantics: "uncalibrated_candidate_reported",
          calibration_ref: null,
        },
        "confidence_invalid",
      ],
      [
        {
          confidence_micros: 0.9,
          semantics: "uncalibrated_candidate_reported",
          calibration_ref: null,
        },
        "confidence_invalid",
      ],
      [
        {
          confidence_micros: 900_000,
          semantics: "probability_of_truth",
          calibration_ref: null,
        },
        "confidence_invalid",
      ],
      [
        {
          confidence_micros: 900_000,
          semantics: "uncalibrated_candidate_reported",
          calibration_ref: "cal-1",
        },
        "calibration_claim_forbidden",
      ],
      [{ confidence_micros: 900_000 }, "missing_property"],
    ] as const) {
      const result = rehash({ ...base, confidence });
      assertResultRejected(result, code);
      assert.equal(resultSchema(result), false);
    }
    assertResultRejected(
      rehash({
        ...(abstentionResult() as unknown as Record<string, unknown>),
        confidence: base["confidence"],
      }),
      "status_payload_mismatch",
    );
  });

  it("rejects a success result without a decision payload and inconsistent outcome blocks", () => {
    const base = choiceResult() as unknown as Record<string, unknown>;
    const missing = rehash({ ...base, decision: null });
    assertResultRejected(missing, "status_payload_mismatch");
    assert.equal(resultSchema(missing), false);
    assertResultRejected(
      rehash({ ...base, abstention: { reason_code: "ambiguous" } }),
      "status_payload_mismatch",
    );
    const abstained = abstentionResult() as unknown as Record<string, unknown>;
    assertResultRejected(
      rehash({ ...abstained, abstention: null }),
      "status_payload_mismatch",
    );
    assertResultRejected(
      rehash({ ...abstained, abstention: { reason_code: "low_vibes" } }),
      "abstention_invalid",
    );
    assertResultRejected(
      rehash({ ...abstained, decision: base["decision"] }),
      "status_payload_mismatch",
    );
  });

  it("rejects blocked and abstained results that grant downstream authority", () => {
    for (const file of [
      "valid-blocked-result.json",
      "valid-abstention-result.json",
      "valid-choice-result.json",
    ]) {
      const value = fixture(file);
      for (const governance of [
        {
          human_review_required: true,
          downstream_allowed: true,
          approval_state: "pending",
        },
        {
          human_review_required: false,
          downstream_allowed: true,
          approval_state: "not_required",
        },
      ]) {
        const result = rehash({ ...value, governance });
        const check = validateTypedDecisionResult(result);
        assert.equal(check.ok, false, file);
        assert.ok(
          codes(check).includes("downstream_authority_forbidden"),
          file,
        );
        assert.equal(resultSchema(result), false, file);
      }
    }
  });

  it("rejects carried approval: succeeded is never approved", () => {
    const base = choiceResult() as unknown as Record<string, unknown>;
    for (const approval_state of ["approved", "rejected"]) {
      const result = rehash({
        ...base,
        governance: {
          human_review_required: true,
          downstream_allowed: false,
          approval_state,
        },
      });
      assertResultRejected(result, "approval_state_forbidden");
      assert.equal(resultSchema(result), false);
    }
  });

  it("rejects bypassing the request's human review requirement", () => {
    const base = choiceResult() as unknown as Record<string, unknown>;
    const bypass = rehash({
      ...base,
      governance: {
        human_review_required: false,
        downstream_allowed: false,
        approval_state: "not_required",
      },
    });
    assert.equal(
      validateTypedDecisionResult(bypass).ok,
      true,
      "structurally valid on its own",
    );
    assertResultRejected(bypass, "human_review_binding_mismatch");
    const inconsistent = rehash({
      ...base,
      governance: {
        human_review_required: true,
        downstream_allowed: false,
        approval_state: "not_required",
      },
    });
    assertResultRejected(inconsistent, "governance_invalid");
    assert.equal(resultSchema(inconsistent), false);
  });

  it("rejects executed escalation, escalation policies and escalation recommendations on success", () => {
    const abstained = abstentionResult() as unknown as Record<string, unknown>;
    assertResultRejected(
      rehash({
        ...abstained,
        escalation: {
          recommendation: "governed_escalation_candidate",
          executed: true,
          governed_policy_ref: null,
        },
      }),
      "escalation_execution_forbidden",
    );
    assertResultRejected(
      rehash({
        ...abstained,
        escalation: {
          recommendation: "governed_escalation_candidate",
          executed: false,
          governed_policy_ref: "auto-frontier",
        },
      }),
      "escalation_policy_forbidden",
    );
    const success = choiceResult() as unknown as Record<string, unknown>;
    const escalatingSuccess = rehash({
      ...success,
      escalation: {
        recommendation: "governed_escalation_candidate",
        executed: false,
        governed_policy_ref: null,
      },
    });
    assertResultRejected(escalatingSuccess, "escalation_invalid");
    assert.equal(resultSchema(escalatingSuccess), false);
  });

  it("admits only synthetic fixture origin: no runtime result exists", () => {
    for (const origin of [
      "sandbox_runtime",
      "production",
      "candidate_engine",
    ]) {
      const result = rehash({
        ...(choiceResult() as unknown as Record<string, unknown>),
        result_origin: origin,
      });
      assertResultRejected(result, "result_origin_invalid");
      assert.equal(resultSchema(result), false);
    }
  });

  it("rejects provider, model, credential and reviewer fields and private reasoning", () => {
    const base = choiceResult() as unknown as Record<string, unknown>;
    for (const mutation of [
      { ...base, provider_id: "vendor" },
      { ...base, decision: { ...(base["decision"] as object), model: "m" } },
      {
        ...base,
        governance: {
          ...(base["governance"] as object),
          reviewer_id: "person-1",
        },
      },
      { ...base, secret: "x" },
    ]) {
      assertResultRejected(rehash(mutation), "forbidden_field");
      assert.equal(resultSchema(mutation), false);
    }
    for (const key of [
      "reasoning",
      "chain_of_thought",
      "rationale",
      "thinking",
    ]) {
      const result = rehash({ ...base, [key]: "private" });
      assertResultRejected(result, "private_reasoning_forbidden");
      assert.equal(resultSchema(result), false);
    }
  });

  it("rejects unknown properties at every level", () => {
    const base = choiceResult() as unknown as Record<string, unknown>;
    assertResultRejected(rehash({ ...base, extra: 1 }), "unknown_property");
    assertResultRejected(
      rehash({
        ...base,
        request_binding: { ...(base["request_binding"] as object), note: "x" },
      }),
      "unknown_property",
    );
    assertResultRejected(
      rehash({
        ...base,
        escalation: { ...(base["escalation"] as object), auto: true },
      }),
      "unknown_property",
    );
  });

  it("detects tampering through the self-hash and the request binding", () => {
    const tampered = {
      ...(choiceResult() as unknown as Record<string, unknown>),
      result_id: "synthetic-intent-result-9999",
    };
    assertResultRejected(tampered, "result_hash_mismatch");
    const other = fixture("valid-choice-request-permuted.json");
    assertResultRejected(choiceResult(), "request_hash_mismatch", {
      ...other,
      request_id: choiceRequest().request_id,
    });
    assertResultRejected(choiceResult(), "request_binding_mismatch", other);
  });

  it("rejects evidence that the request did not declare", () => {
    const base = choiceResult() as unknown as Record<string, unknown>;
    const result = rehash({
      ...base,
      evidence_refs: [
        {
          evidence_id: "synthetic-invented-evidence",
          content_hash: "c".repeat(64),
        },
      ],
    });
    assertResultRejected(result, "evidence_not_in_request");
    const alteredHash = rehash({
      ...base,
      evidence_refs: [
        {
          evidence_id: "synthetic-fixture-intent-0001",
          content_hash: "d".repeat(64),
        },
      ],
    });
    assertResultRejected(alteredHash, "evidence_not_in_request");
  });

  it("enforces score bounds, score scale, ranking permutation and boolean coherence", () => {
    const scoreRequest = fixture("valid-score-request.json");
    const score = fixture("valid-score-result.json");
    assertResultRejected(
      rehash({
        ...score,
        decision: {
          kind: "score",
          scale_id: "synthetic.completeness.0_4",
          value: 5,
        },
      }),
      "score_out_of_range",
      scoreRequest,
    );
    assertResultRejected(
      rehash({
        ...score,
        decision: {
          kind: "score",
          scale_id: "synthetic.other_scale",
          value: 2,
        },
      }),
      "score_scale_mismatch",
      scoreRequest,
    );

    const rankingRequest = fixture("valid-ranking-request.json");
    const ranking = fixture("valid-ranking-result.json");
    assertResultRejected(
      rehash({
        ...ranking,
        decision: {
          kind: "ranking",
          ordered_candidate_ids: ["step.hold", "step.route_to_reviewer"],
        },
      }),
      "ranking_not_permutation",
      rankingRequest,
    );
    assertResultRejected(
      rehash({
        ...ranking,
        decision: {
          kind: "ranking",
          ordered_candidate_ids: [
            "step.hold",
            "step.hold",
            "step.route_to_reviewer",
          ],
        },
      }),
      "duplicate_candidate_id",
      rankingRequest,
    );

    const booleanRequest = fixture("valid-boolean-request.json");
    const bool = fixture("valid-boolean-result.json");
    assertResultRejected(
      rehash({
        ...bool,
        decision: {
          kind: "boolean",
          value: true,
          probability_true_micros: 100_000,
        },
      }),
      "boolean_probability_incoherent",
      booleanRequest,
    );
    assertResultRejected(
      rehash({
        ...bool,
        decision: {
          kind: "boolean",
          value: "yes",
          probability_true_micros: null,
        },
      }),
      "decision_payload_invalid",
      booleanRequest,
    );
  });

  it("rejects a decision payload whose kind differs from the decision type", () => {
    const result = rehash({
      ...(choiceResult() as unknown as Record<string, unknown>),
      decision: { kind: "boolean", value: true, probability_true_micros: null },
    });
    assertResultRejected(result, "decision_payload_invalid");
    assert.equal(resultSchema(result), false);
  });
});

describe("AI-140 governance: results are evidence, never authority", () => {
  it("proves succeeded != approved", () => {
    const result = choiceResult();
    assert.equal(result.status, "succeeded");
    assert.equal(result.governance.approval_state, "pending");
    assert.equal(result.governance.downstream_allowed, false);
    const disposition = deriveTypedDecisionDisposition(result, choiceRequest());
    assert.equal(
      disposition.disposition,
      "candidate_result_pending_human_review",
    );
    assert.equal(disposition.next_required_step, "human_review");
    assert.equal(disposition.downstream_allowed, false);
    assert.equal(disposition.authority_granted, false);
  });

  it("proves confidence and probability cannot authorize downstream use", () => {
    const certain = rehash({
      ...(choiceResult() as unknown as Record<string, unknown>),
      decision: {
        kind: "choice",
        selected_candidate_id: "intent.tariff_question",
        distribution: {
          completeness: "complete",
          entries: [
            {
              candidate_id: "intent.document_submission",
              probability_micros: 0,
            },
            { candidate_id: "intent.other", probability_micros: 0 },
            {
              candidate_id: "intent.tariff_question",
              probability_micros: 1_000_000,
            },
          ],
        },
      },
      confidence: {
        confidence_micros: 1_000_000,
        semantics: "uncalibrated_candidate_reported",
        calibration_ref: null,
      },
    });
    const low = rehash({
      ...(certain as Record<string, unknown>),
      confidence: {
        confidence_micros: 0,
        semantics: "uncalibrated_candidate_reported",
        calibration_ref: null,
      },
    });
    const high = deriveTypedDecisionDisposition(certain, choiceRequest());
    const floor = deriveTypedDecisionDisposition(low, choiceRequest());
    assert.deepEqual(high, floor, "confidence is not an input to disposition");
    assert.equal(high.downstream_allowed, false);
    assert.equal(high.authority_granted, false);

    const scoreDisposition = deriveTypedDecisionDisposition(
      fixture("valid-score-result.json"),
      fixture("valid-score-request.json"),
    );
    assert.equal(
      scoreDisposition.disposition,
      "candidate_result_non_authoritative",
    );
    assert.equal(scoreDisposition.downstream_allowed, false);
    assert.equal(scoreDisposition.authority_granted, false);
  });

  it("proves abstention cannot trigger implicit provider or model execution", () => {
    const disposition = deriveTypedDecisionDisposition(
      abstentionResult(),
      choiceRequest(),
    );
    assert.equal(disposition.disposition, "abstained");
    assert.equal(
      disposition.next_required_step,
      "explicit_governed_escalation_decision",
    );
    assert.equal(disposition.automatic_escalation, false);
    assert.equal(disposition.provider_invocation_permitted, false);
    assert.equal(disposition.downstream_allowed, false);
    assert.ok(Object.isFrozen(disposition));
    const exported = Object.keys(decisionPlane);
    for (const name of exported)
      assert.doesNotMatch(
        name,
        /execute|invoke|escalate(?!ion)|fallback|dispatch|route|call|run[A-Z]/i,
        name,
      );
  });

  it("proves human review cannot be bypassed by any valid result", () => {
    for (const [requestFile, resultFile] of VALID_PAIRS) {
      const request = fixture<TypedDecisionRequest>(requestFile);
      const disposition = deriveTypedDecisionDisposition(
        fixture(resultFile),
        request,
      );
      assert.notEqual(disposition.disposition, "invalid", resultFile);
      assert.equal(disposition.downstream_allowed, false, resultFile);
      if (
        request.policy.human_review_required &&
        disposition.disposition.startsWith("candidate_result")
      )
        assert.equal(
          disposition.next_required_step,
          "human_review",
          resultFile,
        );
    }
  });

  it("binds no catalog capability to the typed decision paradigm", () => {
    const catalog = load<{ capabilities: Array<{ capability_id: string }> }>(
      "config/ai-capabilities.json",
    );
    const ids = new Set(
      catalog.capabilities.map((entry) => entry.capability_id),
    );
    for (const [requestFile] of VALID_PAIRS) {
      const capability = fixture(requestFile)["capability_id"] as string;
      assert.ok(capability.startsWith("synthetic.decision."), capability);
      assert.equal(ids.has(capability), false, capability);
    }
    assert.equal(
      readFileSync("config/ai-capabilities.json", "utf8").includes(
        "typed_decision",
      ),
      false,
    );
  });
});

describe("AI-140 determinism and candidate-order invariance", () => {
  it("uses the repository registry-json-v1 canonical form byte-for-byte", () => {
    assert.equal(TYPED_DECISION_CANONICALIZATION_VERSION, "registry-json-v1");
    for (const sample of [
      choiceRequest(),
      choiceResult(),
      { b: [1, { d: null, c: true }], a: "é " },
    ]) {
      assert.equal(
        canonicalizeTypedDecisionJson(sample),
        canonicalizeOpenRouterRegistryJson(sample),
      );
    }
    assert.throws(
      () => canonicalizeTypedDecisionJson({ p: 0.5 }),
      /typed_decision_non_integer_number/,
    );
    assert.throws(
      () => canonicalizeTypedDecisionJson({ p: Number.NaN }),
      /typed_decision_non_integer_number/,
    );
  });

  it("produces the same hash for the same semantic input regardless of key order", () => {
    const request = choiceRequest();
    const reordered = Object.fromEntries(
      Object.entries(request).reverse(),
    ) as unknown as TypedDecisionRequest;
    assert.equal(
      computeTypedDecisionRequestHash(request),
      computeTypedDecisionRequestHash(reordered),
    );
    assert.equal(
      computeTypedDecisionSemanticRequestHash(request),
      computeTypedDecisionSemanticRequestHash(reordered),
    );
    assert.match(computeTypedDecisionRequestHash(request), /^[a-f0-9]{64}$/);
    assert.equal(
      computeTypedDecisionResultHash(choiceResult()),
      choiceResult().result_hash,
    );
  });

  it("changes both hashes when a candidate identity changes", () => {
    const request = choiceRequest();
    const changed = clone(request) as unknown as {
      output_domain: { candidates: { candidate_id: string }[] };
    };
    changed.output_domain.candidates[0]!.candidate_id = "intent.tariff_inquiry";
    const typed = changed as unknown as TypedDecisionRequest;
    assert.notEqual(
      computeTypedDecisionRequestHash(typed),
      computeTypedDecisionRequestHash(request),
    );
    assert.notEqual(
      computeTypedDecisionSemanticRequestHash(typed),
      computeTypedDecisionSemanticRequestHash(request),
    );
  });

  it("separates presented candidate order (request_hash) from semantic identity", () => {
    const original = choiceRequest();
    const permuted = fixture<TypedDecisionRequest>(
      "valid-choice-request-permuted.json",
    );
    assert.notEqual(
      computeTypedDecisionRequestHash(original),
      computeTypedDecisionRequestHash(permuted),
    );
    assert.equal(
      computeTypedDecisionSemanticRequestHash(original),
      computeTypedDecisionSemanticRequestHash(permuted),
    );
    const factsShuffled = {
      ...original,
      bounded_state: { facts: [...original.bounded_state.facts].reverse() },
    };
    assert.equal(
      computeTypedDecisionSemanticRequestHash(original),
      computeTypedDecisionSemanticRequestHash(factsShuffled),
    );
    const otherQuestion = {
      ...original,
      question: { ...original.question, text: "A different question?" },
    };
    assert.notEqual(
      computeTypedDecisionSemanticRequestHash(original),
      computeTypedDecisionSemanticRequestHash(otherQuestion),
    );
  });

  it("compares permuted choice results by stable candidate identity with an explicit tolerance", () => {
    const left = { request: choiceRequest(), result: choiceResult() };
    const right = {
      request: fixture<TypedDecisionRequest>(
        "valid-choice-request-permuted.json",
      ),
      result: fixture<TypedDecisionResult>("valid-choice-result-permuted.json"),
    };
    const within = compareChoicePermutationInvariance(left, right, 10_000);
    assert.equal(within.comparable, true);
    assert.equal(within.max_abs_delta_micros, 10_000);
    assert.equal(within.equivalent, true);
    assert.equal(
      compareChoicePermutationInvariance(left, right, 9_999).equivalent,
      false,
    );
    for (const tolerance of [-1, 0.5, Number.NaN, 1_000_001])
      assert.deepEqual(
        compareChoicePermutationInvariance(left, right, tolerance).reason_codes,
        ["tolerance_invalid"],
      );
    const unrelated = {
      request: fixture<TypedDecisionRequest>("valid-boolean-request.json"),
      result: fixture<TypedDecisionResult>("valid-boolean-result.json"),
    };
    assert.deepEqual(
      compareChoicePermutationInvariance(left, unrelated, 0).reason_codes,
      ["semantic_request_mismatch"],
    );
    const abstained = { request: choiceRequest(), result: abstentionResult() };
    assert.deepEqual(
      compareChoicePermutationInvariance(left, abstained, 0).reason_codes,
      ["not_succeeded_choice"],
    );
  });
});

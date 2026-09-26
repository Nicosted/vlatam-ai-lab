import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeGoldDecisionEvaluationHash,
  evaluateGoldDecisionCase,
  validateGoldDecisionCaseEvaluation,
  type GoldDecisionCase,
  type GoldDecisionCaseEvaluation,
} from "../../src/decision-evaluation/index.js";
import type { TypedDecisionPayload } from "../../src/decision/index.js";
import {
  FIXTURE_ROOT,
  TYPED_FIXTURES,
  clone,
  codes,
  correctDecision,
  deepFreeze,
  load,
  rehashResult,
  seedCase,
  syntheticResult,
} from "./helpers.js";

function evaluate(
  goldCase: unknown,
  result: unknown,
): GoldDecisionCaseEvaluation {
  const check = evaluateGoldDecisionCase(goldCase, result);
  assert.equal(check.ok, true, JSON.stringify(check));
  if (!check.ok) throw new Error("unreachable");
  assert.equal(
    validateGoldDecisionCaseEvaluation(check.value).ok,
    true,
    "every produced evaluation must validate",
  );
  return check.value;
}

const succeed = (
  goldCase: GoldDecisionCase,
  decision: TypedDecisionPayload,
  confidence?: number,
) =>
  syntheticResult(goldCase, {
    status: "succeeded",
    decision,
    ...(confidence === undefined ? {} : { confidence_micros: confidence }),
  });

describe("AI-141 evaluator — AI-140 fixture results against Gold Cases", () => {
  const fxCase = (name: string) =>
    load<GoldDecisionCase>(`${FIXTURE_ROOT}/cases/${name}.json`);
  const typed = (name: string) => load(`${TYPED_FIXTURES}/${name}.json`);

  it("scores the existing AI-140 choice, permuted, boolean and score results", () => {
    assert.equal(
      evaluate(fxCase("fx-ai140-choice"), typed("valid-choice-result")).outcome,
      "correct_decision",
    );
    assert.equal(
      evaluate(
        fxCase("fx-ai140-choice-permuted"),
        typed("valid-choice-result-permuted"),
      ).outcome,
      "correct_decision",
    );
    assert.equal(
      evaluate(fxCase("fx-ai140-boolean"), typed("valid-boolean-result"))
        .outcome,
      "correct_decision",
    );
    assert.equal(
      evaluate(fxCase("fx-ai140-score"), typed("valid-score-result")).outcome,
      "correct_decision",
    );
  });

  it("scores the existing AI-140 abstention and blocked results by case policy", () => {
    const abstained = evaluate(
      fxCase("fx-ai140-choice"),
      typed("valid-abstention-result"),
    );
    assert.equal(abstained.outcome, "permitted_abstention");
    assert.equal(abstained.correctness, "not_applicable");
    assert.equal(abstained.abstention_reason_code, "ambiguous");
    const blocked = evaluate(
      fxCase("fx-ai140-choice"),
      typed("valid-blocked-result"),
    );
    assert.equal(blocked.outcome, "no_decision");
    assert.deepEqual(blocked.error_codes, ["result_blocked"]);
  });

  it("reproduces the committed evaluation fixture byte-for-byte", () => {
    const produced = evaluate(
      fxCase("fx-ai140-choice"),
      typed("valid-choice-result"),
    );
    assert.deepEqual(
      produced,
      load(`${FIXTURE_ROOT}/valid-case-evaluation.json`),
    );
  });

  it("rejects a result bound to another case's request", () => {
    const evaluation = evaluate(
      fxCase("fx-ai140-choice"),
      typed("valid-choice-result-permuted"),
    );
    assert.equal(evaluation.outcome, "invalid_result");
    assert.deepEqual(evaluation.error_codes, [
      "result_request_binding_invalid",
    ]);
    assert.ok(
      evaluation.result_issue_codes.includes("request_binding_mismatch"),
    );
    assert.ok(evaluation.result_issue_codes.includes("request_hash_mismatch"));
    assert.notEqual(evaluation.candidate_result_hash, null);
  });
});

describe("AI-141 evaluator — decision outcomes", () => {
  it("correct and incorrect choice", () => {
    const c = seedCase("gd-doctype-001");
    assert.equal(
      evaluate(c, succeed(c, correctDecision(c))).outcome,
      "correct_decision",
    );
    const wrong = evaluate(
      c,
      succeed(c, {
        kind: "choice",
        selected_candidate_id: "doc.packing_list",
        distribution: null,
      }),
    );
    assert.equal(wrong.outcome, "incorrect_decision");
    assert.equal(wrong.correctness, "incorrect");
    assert.deepEqual(wrong.error_codes, ["expected_candidate_mismatch"]);
  });

  it("choice correctness is by stable candidate identity, not option position", () => {
    for (const id of ["gd-doctype-010", "gd-doctype-011"]) {
      const c = seedCase(id);
      assert.equal(
        evaluate(c, succeed(c, correctDecision(c))).outcome,
        "correct_decision",
      );
    }
  });

  it("correct and incorrect boolean", () => {
    const c = seedCase("gd-review-002");
    assert.equal(
      evaluate(c, succeed(c, correctDecision(c))).outcome,
      "correct_decision",
    );
    const wrong = evaluate(
      c,
      succeed(c, {
        kind: "boolean",
        value: true,
        probability_true_micros: null,
      }),
    );
    assert.equal(wrong.outcome, "incorrect_decision");
    assert.deepEqual(wrong.error_codes, ["expected_value_mismatch"]);
  });

  it("exact score, in-range score and out-of-range score with absolute error", () => {
    const exact = seedCase("gd-completeness-001"); // expected 3 on 0..4
    const hit = evaluate(
      exact,
      succeed(exact, {
        kind: "score",
        scale_id: "synthetic.completeness.0_4",
        value: 3,
      }),
    );
    assert.equal(hit.outcome, "correct_decision");
    assert.deepEqual(hit.score_error, {
      scale_id: "synthetic.completeness.0_4",
      absolute_error: 0,
    });
    const miss = evaluate(
      exact,
      succeed(exact, {
        kind: "score",
        scale_id: "synthetic.completeness.0_4",
        value: 1,
      }),
    );
    assert.equal(miss.outcome, "incorrect_decision");
    assert.deepEqual(miss.error_codes, ["score_outside_expected"]);
    assert.equal(miss.score_error?.absolute_error, 2);

    const range = seedCase("gd-completeness-004"); // acceptable 2..3
    for (const value of [2, 3])
      assert.equal(
        evaluate(
          range,
          succeed(range, {
            kind: "score",
            scale_id: "synthetic.completeness.0_4",
            value,
          }),
        ).outcome,
        "correct_decision",
      );
    const below = evaluate(
      range,
      succeed(range, {
        kind: "score",
        scale_id: "synthetic.completeness.0_4",
        value: 0,
      }),
    );
    assert.equal(below.outcome, "incorrect_decision");
    assert.equal(below.score_error?.absolute_error, 2);
    const above = evaluate(
      range,
      succeed(range, {
        kind: "score",
        scale_id: "synthetic.completeness.0_4",
        value: 4,
      }),
    );
    assert.equal(above.score_error?.absolute_error, 1);
  });

  it("a score outside the declared scale is an invalid result, not an error distance", () => {
    const c = seedCase("gd-completeness-001");
    const evaluation = evaluate(
      c,
      succeed(c, {
        kind: "score",
        scale_id: "synthetic.completeness.0_4",
        value: 9,
      }),
    );
    assert.equal(evaluation.outcome, "invalid_result");
    assert.ok(evaluation.result_issue_codes.includes("score_out_of_range"));
    assert.equal(evaluation.score_error, null);
  });

  it("exact ranking success and failure", () => {
    const c = seedCase("gd-priority-005");
    assert.equal(
      evaluate(c, succeed(c, correctDecision(c))).outcome,
      "correct_decision",
    );
    const swapped = [
      ...(c.expected as unknown as { expected_order: string[] }).expected_order,
    ];
    [swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!];
    const wrong = evaluate(
      c,
      succeed(c, { kind: "ranking", ordered_candidate_ids: swapped }),
    );
    assert.equal(wrong.outcome, "incorrect_decision");
    assert.deepEqual(wrong.error_codes, ["ranking_order_mismatch"]);
  });

  it("a ranking that is not a permutation is an invalid result", () => {
    const c = seedCase("gd-priority-001");
    const evaluation = evaluate(
      c,
      succeed(c, {
        kind: "ranking",
        ordered_candidate_ids: ["task.customs_filing", "task.freight_booking"],
      }),
    );
    assert.equal(evaluation.outcome, "invalid_result");
    assert.ok(
      evaluation.result_issue_codes.includes("ranking_not_permutation"),
    );
  });
});

describe("AI-141 evaluator — abstention semantics", () => {
  it("abstaining on an abstention-required case is a correct abstention", () => {
    const c = seedCase("gd-doctype-014");
    const evaluation = evaluate(
      c,
      syntheticResult(c, { status: "abstained", reason_code: "ambiguous" }),
    );
    assert.equal(evaluation.outcome, "correct_abstention");
    assert.equal(evaluation.correctness, "correct");
    assert.equal(evaluation.abstention_outcome, "correct");
  });

  it("deciding on an abstention-required case is an incorrect decision, whatever the answer", () => {
    const c = seedCase("gd-doctype-014");
    for (const selected of ["doc.invoice", "doc.packing_list", "doc.unknown"]) {
      const evaluation = evaluate(
        c,
        succeed(
          c,
          {
            kind: "choice",
            selected_candidate_id: selected,
            distribution: null,
          },
          1_000_000,
        ),
      );
      assert.equal(evaluation.outcome, "incorrect_decision");
      assert.deepEqual(evaluation.error_codes, [
        "decision_on_abstention_required_case",
      ]);
      assert.equal(evaluation.probability_evidence, null);
    }
  });

  it("abstaining where abstention is allowed is permitted, not an error", () => {
    const c = seedCase("gd-doctype-001");
    const evaluation = evaluate(c, syntheticResult(c, { status: "abstained" }));
    assert.equal(evaluation.outcome, "permitted_abstention");
    assert.deepEqual(evaluation.error_codes, []);
  });

  it("abstaining where abstention is not allowed is an incorrect abstention", () => {
    const c = seedCase("gd-citation-001");
    const evaluation = evaluate(c, syntheticResult(c, { status: "abstained" }));
    assert.equal(evaluation.outcome, "incorrect_abstention");
    assert.equal(evaluation.correctness, "incorrect");
    assert.deepEqual(evaluation.error_codes, ["abstention_not_allowed"]);
  });

  it("blocked and failed results are no decision", () => {
    const c = seedCase("gd-doctype-014");
    assert.deepEqual(
      evaluate(c, syntheticResult(c, { status: "blocked" })).error_codes,
      ["result_blocked"],
    );
    assert.deepEqual(
      evaluate(c, syntheticResult(c, { status: "failed" })).error_codes,
      ["result_failed"],
    );
  });
});

describe("AI-141 evaluator — confidence is not correctness", () => {
  it("a maximally confident wrong answer is incorrect and a zero-confidence right answer is correct", () => {
    const c = seedCase("gd-doctype-001");
    const wrong = evaluate(
      c,
      succeed(
        c,
        {
          kind: "choice",
          selected_candidate_id: "doc.msds",
          distribution: null,
        },
        1_000_000,
      ),
    );
    assert.equal(wrong.outcome, "incorrect_decision");
    const right = evaluate(c, succeed(c, correctDecision(c), 0));
    assert.equal(right.outcome, "correct_decision");
  });

  it("probability evidence never changes the outcome", () => {
    const c = seedCase("gd-review-001"); // expected true
    for (const p of [0, 500_000, 1_000_000]) {
      const evaluation = evaluate(
        c,
        succeed(c, {
          kind: "boolean",
          value: true,
          probability_true_micros: p,
        }),
      );
      assert.equal(evaluation.outcome, "correct_decision");
      assert.equal(
        evaluation.probability_evidence?.squared_error_micros2,
        (p - 1_000_000) ** 2,
      );
    }
  });
});

describe("AI-141 evaluator — malformed results and integrity", () => {
  it("records malformed candidate results as invalid_result", () => {
    const c = seedCase("gd-doctype-001");
    const good = succeed(c, correctDecision(c));
    const variants: [unknown, string][] = [
      [null, "result_contract_invalid"],
      ["not a result", "result_contract_invalid"],
      [{ ...good, result_hash: "0".repeat(64) }, "result_contract_invalid"],
      [
        rehashResult({ ...good, result_origin: "live_runtime" }),
        "result_contract_invalid",
      ],
      [
        rehashResult({ ...good, model: "synthetic" }),
        "result_contract_invalid",
      ],
      [
        rehashResult({ ...good, reasoning: "private" }),
        "result_contract_invalid",
      ],
      [
        rehashResult({
          ...good,
          governance: { ...good.governance, downstream_allowed: true },
        }),
        "result_contract_invalid",
      ],
      [
        rehashResult({
          ...good,
          decision: {
            kind: "choice",
            selected_candidate_id: "doc.proforma",
            distribution: null,
          },
        }),
        "result_request_binding_invalid",
      ],
    ];
    for (const [result, code] of variants) {
      const evaluation = evaluate(c, result);
      assert.equal(
        evaluation.outcome,
        "invalid_result",
        JSON.stringify(result).slice(0, 80),
      );
      assert.deepEqual(evaluation.error_codes, [code]);
      assert.ok(evaluation.result_issue_codes.length > 0);
    }
  });

  it("a result bound to a different Gold Case request is invalid", () => {
    const a = seedCase("gd-doctype-001");
    const b = seedCase("gd-doctype-002");
    const evaluation = evaluate(a, succeed(b, correctDecision(b)));
    assert.equal(evaluation.outcome, "invalid_result");
    assert.deepEqual(evaluation.error_codes, [
      "result_request_binding_invalid",
    ]);
  });

  it("a permuted twin's result does not validate against the other presentation", () => {
    const a = seedCase("gd-doctype-010");
    const b = seedCase("gd-doctype-011");
    const evaluation = evaluate(a, succeed(b, correctDecision(b)));
    assert.equal(evaluation.outcome, "invalid_result");
    assert.ok(evaluation.result_issue_codes.includes("request_hash_mismatch"));
  });

  it("refuses to score against an invalid Gold Case instead of inferring truth", () => {
    const c = clone(seedCase("gd-doctype-001")) as unknown as Record<
      string,
      unknown
    >;
    delete c["expected"];
    const check = evaluateGoldDecisionCase(c, null);
    assert.equal(check.ok, false);
    assert.ok(codes(check).includes("missing_property"));
  });

  it("never mutates the Gold Case or the result, and results cannot change truth", () => {
    const c = deepFreeze(seedCase("gd-doctype-001"));
    const before = JSON.stringify(c);
    const result = deepFreeze(
      rehashResult({
        ...succeed(c, {
          kind: "choice",
          selected_candidate_id: "doc.msds",
          distribution: null,
        }),
      }),
    );
    const resultBefore = JSON.stringify(result);
    const evaluation = evaluate(c, result);
    assert.equal(evaluation.outcome, "incorrect_decision");
    assert.equal(JSON.stringify(c), before);
    assert.equal(JSON.stringify(result), resultBefore);
    // A result carrying its own "expected" answer is rejected, not obeyed.
    const smuggled = rehashResult({
      ...result,
      expected: { kind: "choice", expected_candidate_id: "doc.msds" },
    });
    assert.equal(evaluate(c, smuggled).outcome, "invalid_result");
  });

  it("is deterministic and binds the evaluation hash to case, result and scoring policy", () => {
    const c = seedCase("gd-doctype-001");
    const result = succeed(c, correctDecision(c));
    const a = evaluate(c, result);
    const b = evaluate(clone(c), clone(result));
    assert.deepEqual(a, b);
    assert.equal(a.evaluation_hash, computeGoldDecisionEvaluationHash(a));
    assert.equal(a.case_hash, c.case_hash);
    assert.equal(a.candidate_result_hash, result.result_hash);
    assert.equal(a.scoring_policy, "gold-decision-scoring-v1");
    assert.ok(Object.isFrozen(a));
  });

  it("evaluation records are fail-closed on tampering", () => {
    const c = seedCase("gd-doctype-001");
    const record = clone(
      evaluate(c, succeed(c, correctDecision(c))),
    ) as unknown as Record<string, unknown>;
    record["outcome"] = "incorrect_decision";
    assert.ok(
      codes(validateGoldDecisionCaseEvaluation(record)).includes(
        "evaluation_consistency_invalid",
      ),
    );
    const forged: Record<string, unknown> = {
      ...record,
      outcome: "correct_decision",
      correctness: "correct",
      error_codes: ["expected_candidate_mismatch"],
    };
    assert.equal(validateGoldDecisionCaseEvaluation(forged).ok, false);
    const unsigned = clone(
      evaluate(c, succeed(c, correctDecision(c))),
    ) as unknown as Record<string, unknown>;
    unsigned["language"] = "en";
    assert.ok(
      codes(validateGoldDecisionCaseEvaluation(unsigned)).includes(
        "evaluation_hash_mismatch",
      ),
    );
  });
});

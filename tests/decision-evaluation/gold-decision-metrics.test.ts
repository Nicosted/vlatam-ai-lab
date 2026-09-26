import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  aggregateGoldDecisionEvaluations,
  evaluateGoldDecisionCase,
  goldDecisionRatio,
  verifyGoldDecisionReportHash,
  type GoldDecisionCase,
  type GoldDecisionCaseEvaluation,
  type GoldDecisionEvaluationReport,
  type GoldDecisionSplitScope,
} from "../../src/decision-evaluation/index.js";
import type { TypedDecisionPayload } from "../../src/decision/index.js";
import {
  FIXTURE_ROOT,
  TYPED_FIXTURES,
  clone,
  correctDecision,
  fixtureSet,
  load,
  rehashSet,
  seed,
  syntheticResult,
} from "./helpers.js";

type Behaviour = (goldCase: GoldDecisionCase) => unknown;

function evaluateAll(
  cases: readonly GoldDecisionCase[],
  behaviour: Behaviour,
): GoldDecisionCaseEvaluation[] {
  return cases.map((goldCase) => {
    const check = evaluateGoldDecisionCase(goldCase, behaviour(goldCase));
    if (!check.ok) throw new Error(JSON.stringify(check.issues));
    return check.value;
  });
}

function report(
  evaluations: readonly unknown[],
  scope: GoldDecisionSplitScope = "all",
): GoldDecisionEvaluationReport {
  const { manifest, cases } = seed();
  const check = aggregateGoldDecisionEvaluations(
    manifest,
    cases,
    evaluations,
    scope,
  );
  assert.equal(check.ok, true, JSON.stringify(check).slice(0, 1500));
  if (!check.ok) throw new Error("unreachable");
  return check.value;
}

const ratio = (n: number, d: number) => goldDecisionRatio(n, d);

/** A synthetic "oracle" fixture: the answer key's own answer, or abstention. */
const perfect: Behaviour = (c) =>
  c.abstention_policy === "required"
    ? syntheticResult(c, { status: "abstained" })
    : syntheticResult(c, { status: "succeeded", decision: correctDecision(c) });

describe("AI-141 aggregation — exact metrics", () => {
  it("ratios are exact, in lowest terms and null for a zero denominator", () => {
    assert.deepEqual(ratio(6, 8), { numerator: "3", denominator: "4" });
    assert.deepEqual(ratio(0, 5), { numerator: "0", denominator: "1" });
    assert.equal(ratio(3, 0), null);
    assert.deepEqual(goldDecisionRatio(10n ** 30n, 10n ** 31n), {
      numerator: "1",
      denominator: "10",
    });
  });

  it("a perfect synthetic fixture yields accuracy 1 and coverage below 1 because of required abstentions", () => {
    const { cases } = seed();
    const r = report(evaluateAll(cases, perfect));
    const required = cases.filter(
      (c) => c.abstention_policy === "required",
    ).length;
    assert.equal(r.overall.total_cases, cases.length);
    assert.equal(r.overall.correct_decisions, cases.length - required);
    assert.equal(r.overall.correct_abstentions, required);
    assert.deepEqual(r.overall.accuracy, ratio(1, 1));
    assert.deepEqual(
      r.overall.coverage,
      ratio(cases.length - required, cases.length),
    );
    assert.deepEqual(r.overall.accuracy_at_coverage, ratio(1, 1));
    assert.deepEqual(r.overall.abstention_rate, ratio(required, cases.length));
    assert.equal(r.overall.abstention_required_cases, required);
  });

  it("an always-abstain fixture has zero coverage, null selective accuracy and penalized not-allowed cases", () => {
    const { cases } = seed();
    const r = report(
      evaluateAll(cases, (c) => syntheticResult(c, { status: "abstained" })),
    );
    const byPolicy = (p: string) =>
      cases.filter((c) => c.abstention_policy === p).length;
    assert.equal(r.overall.decisions, 0);
    assert.deepEqual(r.overall.coverage, ratio(0, 1));
    assert.equal(r.overall.accuracy_at_coverage, null);
    assert.equal(r.overall.correct_abstentions, byPolicy("required"));
    assert.equal(r.overall.permitted_abstentions, byPolicy("allowed"));
    assert.equal(r.overall.incorrect_abstentions, byPolicy("not_allowed"));
    assert.deepEqual(
      r.overall.accuracy,
      ratio(byPolicy("required"), cases.length),
    );
    assert.deepEqual(r.overall.abstention_rate, ratio(1, 1));
  });

  it("an always-blocked fixture counts only as no decision", () => {
    const { cases } = seed();
    const r = report(
      evaluateAll(cases, (c) => syntheticResult(c, { status: "blocked" })),
    );
    assert.equal(r.overall.no_decisions, cases.length);
    assert.equal(r.overall.valid_results, cases.length);
    assert.deepEqual(r.overall.accuracy, ratio(0, 1));
  });

  it("invalid results count against accuracy and are reported separately", () => {
    const { cases } = seed();
    const r = report(evaluateAll(cases, () => null));
    assert.equal(r.overall.invalid_results, cases.length);
    assert.equal(r.overall.valid_results, 0);
    assert.deepEqual(r.overall.accuracy, ratio(0, 1));
  });

  it("mixed behaviour yields hand-computed metrics on the validation split", () => {
    const { cases } = seed();
    const validation = cases.filter((c) => c.split === "validation");
    // Wrong on every choice, right elsewhere, abstain on required cases.
    const behaviour: Behaviour = (c) => {
      if (c.abstention_policy === "required")
        return syntheticResult(c, { status: "abstained" });
      const decision = correctDecision(c);
      if (decision.kind === "choice") {
        const domain = c.request.output_domain as {
          readonly candidates: readonly { candidate_id: string }[];
        };
        const other = domain.candidates.find(
          (x) => x.candidate_id !== decision.selected_candidate_id,
        )!;
        return syntheticResult(c, {
          status: "succeeded",
          decision: { ...decision, selected_candidate_id: other.candidate_id },
        });
      }
      return syntheticResult(c, { status: "succeeded", decision });
    };
    const r = report(evaluateAll(validation, behaviour), "validation");
    const required = validation.filter(
      (c) => c.abstention_policy === "required",
    ).length;
    const choices = validation.filter(
      (c) =>
        c.request.decision_type === "choice" &&
        c.abstention_policy !== "required",
    ).length;
    const decisions = validation.length - required;
    assert.equal(r.overall.total_cases, validation.length);
    assert.equal(r.overall.incorrect_decisions, choices);
    assert.deepEqual(
      r.overall.accuracy,
      ratio(decisions - choices + required, validation.length),
    );
    assert.deepEqual(
      r.overall.accuracy_at_coverage,
      ratio(decisions - choices, decisions),
    );
    const choiceSlice = r.slices.decision_type.find((s) => s.key === "choice")!;
    assert.equal(choiceSlice.metrics.correct_decisions, 0);
  });
});

describe("AI-141 aggregation — slices", () => {
  const { cases } = seed();
  const r = report(evaluateAll(cases, perfect));

  for (const dimension of [
    "language",
    "decision_type",
    "jurisdiction",
    "split",
    "capability_id",
  ] as const) {
    it(`per-${dimension} slices partition every case in ascending key order`, () => {
      const slices = r.slices[dimension];
      const keys = slices.map((s) => s.key);
      assert.deepEqual(keys, [...keys].sort());
      assert.equal(
        slices.reduce((sum, s) => sum + s.metrics.total_cases, 0),
        cases.length,
      );
      for (const slice of slices) {
        const expected = cases.filter((c) =>
          dimension === "decision_type"
            ? c.request.decision_type === slice.key
            : dimension === "capability_id"
              ? c.request.capability_id === slice.key
              : c[dimension] === slice.key,
        ).length;
        assert.equal(
          slice.metrics.total_cases,
          expected,
          `${dimension}=${slice.key}`,
        );
      }
    });
  }

  it("reports es-AR, en and pt-BR language slices separately", () => {
    const keys = r.slices.language.map((s) => s.key);
    for (const key of ["es-AR", "en", "pt-BR"])
      assert.ok(keys.includes(key), key);
  });

  it("never mixes score scales", () => {
    assert.deepEqual(
      r.overall.score_error_by_scale.map((s) => s.scale_id),
      ["synthetic.completeness.0_4"],
    );
  });
});

describe("AI-141 aggregation — probability evidence (Brier, uncalibrated)", () => {
  const { cases } = seed();
  const boolCases = cases.filter((c) => c.request.decision_type === "boolean");

  function withProbability(p: (c: GoldDecisionCase) => number): Behaviour {
    return (c) => {
      if (c.abstention_policy === "required")
        return syntheticResult(c, { status: "abstained" });
      const decision = correctDecision(c);
      if (decision.kind !== "boolean")
        return syntheticResult(c, { status: "succeeded", decision });
      return syntheticResult(c, {
        status: "succeeded",
        decision: { ...decision, probability_true_micros: p(c) },
      });
    };
  }
  const truth = (c: GoldDecisionCase) =>
    (c.expected as { expected_value: boolean }).expected_value;

  it("perfect probabilities give Brier 0", () => {
    const r = report(
      evaluateAll(
        cases,
        withProbability((c) => (truth(c) ? 1_000_000 : 0)),
      ),
    );
    assert.equal(
      r.overall.brier_boolean_binary.eligible_decisions,
      boolCases.length,
    );
    assert.deepEqual(r.overall.brier_boolean_binary.brier_score, ratio(0, 1));
  });

  it("completely wrong probabilities give Brier 1 even though the decisions are correct", () => {
    const r = report(
      evaluateAll(
        cases,
        withProbability((c) => (truth(c) ? 0 : 1_000_000)),
      ),
    );
    assert.deepEqual(r.overall.brier_boolean_binary.brier_score, ratio(1, 1));
    const slice = r.slices.decision_type.find((s) => s.key === "boolean")!;
    assert.equal(slice.metrics.correct_decisions, boolCases.length);
  });

  it("multiclass Brier matches a hand-computed example", () => {
    const c = cases.find((x) => x.case_id === "gd-evidence-001")!; // expected evidence.sufficient
    const decision: TypedDecisionPayload = {
      kind: "choice",
      selected_candidate_id: "evidence.sufficient",
      distribution: {
        completeness: "complete",
        entries: [
          {
            candidate_id: "evidence.insufficient",
            probability_micros: 200_000,
          },
          { candidate_id: "evidence.sufficient", probability_micros: 700_000 },
          { candidate_id: "evidence.uncertain", probability_micros: 100_000 },
        ],
      },
    };
    const check = evaluateGoldDecisionCase(
      c,
      syntheticResult(c, { status: "succeeded", decision }),
    );
    assert.ok(check.ok);
    if (!check.ok) return;
    // (0.2)² + (0.7 − 1)² + (0.1)² = 0.04 + 0.09 + 0.01 = 0.14
    assert.deepEqual(check.value.probability_evidence, {
      kind: "choice_multiclass",
      squared_error_micros2: 140_000_000_000,
    });
    const r = report(
      evaluateAll(cases, (x) =>
        x.case_id === c.case_id
          ? syntheticResult(x, { status: "succeeded", decision })
          : perfect(x),
      ),
    );
    assert.equal(r.overall.brier_choice_multiclass.eligible_decisions, 1);
    assert.deepEqual(
      r.overall.brier_choice_multiclass.brier_score,
      ratio(14, 100),
    );
    assert.ok(
      r.overall.brier_choice_multiclass.decisions_without_probability > 0,
    );
  });

  it("excludes abstentions and decisions without probability, and says so", () => {
    const r = report(
      evaluateAll(cases, (c) => syntheticResult(c, { status: "abstained" })),
    );
    assert.equal(r.overall.brier_boolean_binary.eligible_decisions, 0);
    assert.equal(r.overall.brier_boolean_binary.brier_score, null);
    const p = report(evaluateAll(cases, perfect));
    assert.equal(p.overall.brier_boolean_binary.eligible_decisions, 0);
    assert.equal(
      p.overall.brier_boolean_binary.decisions_without_probability,
      boolCases.length,
    );
  });

  it("never claims calibration, authority or a winner", () => {
    const r = report(evaluateAll(cases, perfect));
    assert.equal(r.calibration_claimed, false);
    assert.equal(r.authority, "evidence_only");
    assert.equal(r.universal_winner, false);
  });
});

describe("AI-141 aggregation — fail-closed and anti-selection", () => {
  const { manifest, cases } = seed();
  const evaluations = evaluateAll(cases, perfect);

  function rejected(
    evals: readonly unknown[],
    code: string,
    scope: GoldDecisionSplitScope = "all",
  ) {
    const check = aggregateGoldDecisionEvaluations(
      manifest,
      cases,
      evals,
      scope,
    );
    assert.equal(check.ok, false);
    if (check.ok) return;
    assert.ok(
      check.issues.some((issue) => issue.code === code),
      `expected ${code}, got ${check.issues.map((i) => i.code).join(",")}`,
    );
  }

  it("rejects a report that omits unfavourable cases", () => {
    const favourable = evaluations.filter((_, index) => index % 2 === 0);
    rejected(favourable, "evaluation_missing");
  });

  it("rejects duplicated evaluations", () => {
    rejected([...evaluations, evaluations[0]], "duplicate_evaluation");
  });

  it("rejects evaluations outside the declared split scope", () => {
    rejected(evaluations, "evaluation_out_of_scope", "test");
  });

  it("rejects an empty evaluation list explicitly", () => {
    rejected([], "evaluation_missing");
  });

  it("rejects an invalid split scope", () => {
    rejected(
      evaluations,
      "split_scope_invalid",
      "train" as GoldDecisionSplitScope,
    );
  });

  it("rejects an empty split scope explicitly instead of reporting vacuous metrics", () => {
    const fx = fixtureSet();
    const kept = fx.cases.filter((c) => c.split === "development");
    const manifestOnlyDev = rehashSet({
      ...fx.manifest,
      cases: fx.manifest.cases.filter((entry) => entry.split === "development"),
      split_distribution: { development: kept.length },
      decision_type_distribution: { choice: kept.length },
      language_distribution: { en: kept.length },
      jurisdiction_distribution: { NONE: kept.length },
      capability_distribution: {
        "synthetic.decision.intent_classify": kept.length,
      },
    });
    const check = aggregateGoldDecisionEvaluations(
      manifestOnlyDev,
      kept,
      [],
      "test",
    );
    assert.equal(check.ok, false);
    if (!check.ok)
      assert.deepEqual(
        check.issues.map((issue) => issue.code),
        ["empty_evaluation_scope"],
      );
  });

  it("rejects tampered, foreign or mismatched evaluation records", () => {
    const tampered = clone(evaluations) as unknown as Record<string, unknown>[];
    tampered[0]!["outcome"] = "incorrect_decision";
    rejected(tampered, "evaluation_invalid");
    const other = evaluateAll(fixtureSet().cases, (c) =>
      syntheticResult(c, { status: "abstained" }),
    );
    rejected([...evaluations, other[0]], "evaluation_dataset_mismatch");
  });

  it("rejects an invalid Gold Decision Set", () => {
    const broken = clone(manifest) as unknown as Record<string, unknown>;
    broken["dataset_hash"] = "0".repeat(64);
    const check = aggregateGoldDecisionEvaluations(
      broken,
      cases,
      evaluations,
      "all",
    );
    assert.equal(check.ok, false);
    if (!check.ok) assert.equal(check.issues[0]!.code, "set_invalid");
  });

  it("is deterministic and independent of evaluation input order", () => {
    const a = report(evaluations);
    const b = report([...evaluations].reverse());
    assert.deepEqual(a, b);
    assert.equal(verifyGoldDecisionReportHash(a), true);
    assert.equal(
      verifyGoldDecisionReportHash({ ...a, universal_winner: true } as never),
      false,
    );
    assert.deepEqual(
      a.evaluation_hashes,
      [...evaluations]
        .sort((x, y) => (x.case_id < y.case_id ? -1 : 1))
        .map((e) => e.evaluation_hash),
    );
  });

  it("reproduces the committed AI-140 fixture report", () => {
    const fx = fixtureSet();
    const typed = (name: string) => load(`${TYPED_FIXTURES}/${name}.json`);
    const results: Record<string, unknown> = {
      "fx-ai140-boolean": typed("valid-boolean-result"),
      "fx-ai140-choice": typed("valid-choice-result"),
      "fx-ai140-choice-permuted": typed("valid-choice-result-permuted"),
      "fx-ai140-score": typed("valid-score-result"),
    };
    const evals = evaluateAll(fx.cases, (c) => results[c.case_id]);
    const check = aggregateGoldDecisionEvaluations(
      fx.manifest,
      fx.cases,
      evals,
      "all",
    );
    assert.ok(check.ok);
    if (!check.ok) return;
    assert.deepEqual(
      check.value,
      load(`${FIXTURE_ROOT}/valid-evaluation-report.json`),
    );
    // (0.065 + 0.0632) / 2 = 0.0641 ; (0.91 − 1)² = 0.0081
    assert.deepEqual(
      check.value.overall.brier_choice_multiclass.brier_score,
      ratio(641, 10_000),
    );
    assert.deepEqual(
      check.value.overall.brier_boolean_binary.brier_score,
      ratio(81, 10_000),
    );
    assert.equal(check.value.dataset_review_state, "draft");
  });
});

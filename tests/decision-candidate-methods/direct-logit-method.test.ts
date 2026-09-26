/**
 * AI-144 — the AI-LAB-owned direct option-logit method, exercised
 * in-process over repository-owned synthetic logits. The same bytes run
 * as the AI-143 fixture subject in
 * `tests/decision-sandbox/direct-logit-method-fixture.test.ts`.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DIRECT_LOGIT_METHOD,
  SYNTHETIC_LOGIT_FIXTURES,
  buildDirectLogitChoiceResult,
  findSyntheticLogitFixture,
  readoutDirectOptionLogits,
} from "../../src/decision-sandbox/fixture/direct-logit-method-adapter.mjs";
import {
  computeTypedDecisionRequestHash,
  computeTypedDecisionResultHash,
} from "../../src/decision/canonical.js";
import type { TypedDecisionRequest } from "../../src/decision/contracts.js";
import {
  validateTypedDecisionResult,
  validateTypedDecisionResultForRequest,
} from "../../src/decision/validation.js";
import { DIRECT_LOGIT_METHOD_LIMITS } from "../../src/decision-candidate-methods/index.js";
import {
  clone,
  logitFixture,
  logitFixtures,
  request,
  type Mutable,
} from "./helpers.js";

type Logit = { candidate_id: string; logit_micros: number };

function ids(fixtureId: string): string[] {
  return logitFixture(fixtureId).candidate_logits.map((l) => l.candidate_id);
}

function logits(fixtureId: string): Logit[] {
  return clone(logitFixture(fixtureId).candidate_logits) as Logit[];
}

/** Deterministic Fisher-Yates shuffle (no Math.random). */
function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let state = seed;
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(
      (rest) => [item, ...rest],
    ),
  );
}

function micros(
  readout: ReturnType<typeof readoutDirectOptionLogits>,
): number[] {
  assert.equal(readout.ok, true);
  return readout.ok ? readout.entries.map((e) => e.probability_micros) : [];
}

describe("AI-144 direct option-logit method (AI-LAB implementation)", () => {
  it("embeds exact copies of the committed synthetic logit fixtures", () => {
    assert.deepEqual(clone(SYNTHETIC_LOGIT_FIXTURES), logitFixtures());
    assert.equal(Object.isFrozen(SYNTHETIC_LOGIT_FIXTURES), true);
    assert.equal(
      Object.isFrozen(SYNTHETIC_LOGIT_FIXTURES[0]!.candidate_logits),
      true,
    );
    assert.deepEqual(
      { ...DIRECT_LOGIT_METHOD },
      {
        min_candidates: DIRECT_LOGIT_METHOD_LIMITS.min_candidates,
        max_candidates: DIRECT_LOGIT_METHOD_LIMITS.max_candidates,
        logit_micros_scale: DIRECT_LOGIT_METHOD_LIMITS.logit_micros_scale,
        max_abs_logit_micros: DIRECT_LOGIT_METHOD_LIMITS.max_abs_logit_micros,
        probability_micros_scale: 1_000_000,
      },
    );
  });

  it("normalizes deterministically with softmax and exact integer micros", () => {
    const first = readoutDirectOptionLogits(
      ids("synthetic-logits-intent-0001"),
      logits("synthetic-logits-intent-0001"),
    );
    assert.deepEqual(first, {
      ok: true,
      selected_candidate_id: "intent.tariff_question",
      selected_probability_micros: 857761,
      entries: [
        {
          candidate_id: "intent.document_submission",
          probability_micros: 95042,
        },
        { candidate_id: "intent.other", probability_micros: 47197 },
        { candidate_id: "intent.tariff_question", probability_micros: 857761 },
      ],
    });
    for (let i = 0; i < 5; i += 1)
      assert.deepEqual(
        readoutDirectOptionLogits(
          ids("synthetic-logits-intent-0001"),
          logits("synthetic-logits-intent-0001"),
        ),
        first,
      );
    // Independent float reference for the same softmax.
    const values = [-0.4, -1.1, 1.8];
    const weights = values.map((v) => Math.exp(v - 1.8));
    const total = weights.reduce((a, b) => a + b, 0);
    const reference = weights.map((w) => (w / total) * 1_000_000);
    micros(first).forEach((m, i) =>
      assert.ok(Math.abs(m - reference[i]!) < 1, `${m} vs ${reference[i]}`),
    );
  });

  it("every distribution sums to exactly 1,000,000 micros", () => {
    for (const fixture of logitFixtures()) {
      const readout = readoutDirectOptionLogits(
        fixture.candidate_logits.map((l) => l.candidate_id),
        clone(fixture.candidate_logits),
      );
      if (!readout.ok) {
        assert.equal(readout.code, "top_logit_tie");
        continue;
      }
      assert.equal(
        readout.entries.reduce((sum, e) => sum + e.probability_micros, 0),
        1_000_000,
        fixture.fixture_id,
      );
      for (const e of readout.entries) {
        assert.ok(Number.isSafeInteger(e.probability_micros));
        assert.ok(
          e.probability_micros >= 0 && e.probability_micros <= 1_000_000,
        );
      }
    }
  });

  it("allocates remaining micros to the largest remainders, equal remainders by ascending candidate id", () => {
    // route.beta and route.gamma share a logit, so their raw probabilities
    // and remainders are identical; one leftover micro goes to route.beta.
    const readout = readoutDirectOptionLogits(
      ids("synthetic-logits-route-0001"),
      logits("synthetic-logits-route-0001"),
    );
    assert.deepEqual(readout, {
      ok: true,
      selected_candidate_id: "route.alpha",
      selected_probability_micros: 679086,
      entries: [
        { candidate_id: "route.alpha", probability_micros: 679086 },
        { candidate_id: "route.beta", probability_micros: 91905 },
        { candidate_id: "route.delta", probability_micros: 137105 },
        { candidate_id: "route.gamma", probability_micros: 91904 },
      ],
    });
  });

  it("is invariant to every permutation of candidate and logit order", () => {
    for (const id of [
      "synthetic-logits-intent-0001",
      "synthetic-logits-route-0001",
    ]) {
      const baseline = readoutDirectOptionLogits(ids(id), logits(id));
      for (const order of permutations(ids(id)))
        for (const logitOrder of permutations(logits(id)))
          assert.deepEqual(
            readoutDirectOptionLogits(order, logitOrder),
            baseline,
          );
    }
    const baseline = readoutDirectOptionLogits(
      ids("synthetic-logits-bucket-0001"),
      logits("synthetic-logits-bucket-0001"),
    );
    for (let seed = 1; seed <= 64; seed += 1)
      assert.deepEqual(
        readoutDirectOptionLogits(
          shuffled(ids("synthetic-logits-bucket-0001"), seed),
          shuffled(logits("synthetic-logits-bucket-0001"), seed * 7 + 3),
        ),
        baseline,
      );
  });

  it("refuses a tie at the maximum logit in every order instead of breaking it by position", () => {
    for (const order of permutations(ids("synthetic-logits-hold-0001")))
      for (const logitOrder of permutations(
        logits("synthetic-logits-hold-0001"),
      ))
        assert.deepEqual(readoutDirectOptionLogits(order, logitOrder), {
          ok: false,
          code: "top_logit_tie",
        });
    // Ties below the maximum are fine.
    assert.equal(
      readoutDirectOptionLogits(
        ["a.x", "a.y", "a.z"],
        [
          { candidate_id: "a.x", logit_micros: 1 },
          { candidate_id: "a.y", logit_micros: 0 },
          { candidate_id: "a.z", logit_micros: 0 },
        ],
      ).ok,
      true,
    );
  });

  it("handles the bounded extremes: 16 options and |logit| = 100", () => {
    const readout = readoutDirectOptionLogits(
      ids("synthetic-logits-bucket-0001"),
      logits("synthetic-logits-bucket-0001"),
    );
    assert.equal(readout.ok, true);
    if (readout.ok) {
      assert.equal(readout.entries.length, 16);
      assert.equal(readout.selected_candidate_id, "bucket.07");
      assert.equal(readout.entries[0]!.probability_micros, 0);
    }
    const extreme = readoutDirectOptionLogits(
      ["e.hi", "e.lo"],
      [
        { candidate_id: "e.hi", logit_micros: 100_000_000 },
        { candidate_id: "e.lo", logit_micros: -100_000_000 },
      ],
    );
    assert.deepEqual(micros(extreme), [1_000_000, 0]);
    const equalish = readoutDirectOptionLogits(
      ["e.a", "e.b"],
      [
        { candidate_id: "e.a", logit_micros: 1 },
        { candidate_id: "e.b", logit_micros: 0 },
      ],
    );
    assert.deepEqual(micros(equalish), [500000, 500000]);
  });

  it("fails closed on every numeric and identity defect, without coercion or dropping", () => {
    const base = (): Logit[] => [
      { candidate_id: "c.one", logit_micros: 1_000_000 },
      { candidate_id: "c.two", logit_micros: 0 },
    ];
    const two = ["c.one", "c.two"];
    const cases: [unknown, unknown, string][] = [
      [
        two,
        [{ ...base()[0]!, logit_micros: Number.NaN }, base()[1]],
        "logit_invalid",
      ],
      [
        two,
        [{ ...base()[0]!, logit_micros: Number.POSITIVE_INFINITY }, base()[1]],
        "logit_invalid",
      ],
      [
        two,
        [{ ...base()[0]!, logit_micros: Number.NEGATIVE_INFINITY }, base()[1]],
        "logit_invalid",
      ],
      [two, [{ ...base()[0]!, logit_micros: 0.5 }, base()[1]], "logit_invalid"],
      [two, [{ ...base()[0]!, logit_micros: "1" }, base()[1]], "logit_invalid"],
      [
        two,
        [{ ...base()[0]!, logit_micros: 100_000_001 }, base()[1]],
        "logit_invalid",
      ],
      [two, [{ ...base()[0]!, extra: 1 }, base()[1]], "logit_invalid"],
      [two, [base()[0]], "logit_missing"],
      [
        two,
        [...base(), { candidate_id: "c.three", logit_micros: 0 }],
        "logit_unknown_candidate",
      ],
      [two, [...base(), base()[0]], "logit_duplicate"],
      [["c.one", "c.one"], base(), "candidate_duplicate"],
      [["c.one"], [base()[0]], "candidate_count_unsupported"],
      [
        Array.from({ length: 17 }, (_, i) => `c.${i}`),
        base(),
        "candidate_count_unsupported",
      ],
      [["C.ONE", "c.two"], base(), "candidate_id_invalid"],
      [two, "not-an-array", "logit_invalid"],
      ["c.one", base(), "candidate_count_unsupported"],
    ];
    for (const [candidateIds, values, code] of cases)
      assert.deepEqual(
        readoutDirectOptionLogits(candidateIds, values),
        { ok: false, code },
        `${JSON.stringify(values)} -> ${code}`,
      );
  });

  it("does not mutate its inputs or the AI-140 request", () => {
    const candidateIds = Object.freeze(ids("synthetic-logits-intent-0001"));
    const values = Object.freeze(
      logits("synthetic-logits-intent-0001").map((l) => Object.freeze(l)),
    );
    readoutDirectOptionLogits(candidateIds, values);
    const req = request("intent");
    const before = JSON.stringify(req);
    const frozen = structuredClone(req) as TypedDecisionRequest;
    const deepFreeze = (v: unknown): void => {
      if (v !== null && typeof v === "object") {
        Object.values(v).forEach(deepFreeze);
        Object.freeze(v);
      }
    };
    deepFreeze(frozen);
    const hash = computeTypedDecisionRequestHash(frozen);
    const built = buildDirectLogitChoiceResult(
      frozen,
      hash,
      findSyntheticLogitFixture(hash),
    );
    assert.equal(built.ok, true);
    assert.equal(JSON.stringify(frozen), before);
  });

  it("expresses the readout through the existing AI-140 TypedDecisionResult contract", () => {
    for (const key of [
      "intent",
      "intentPermuted",
      "route",
      "routePermuted",
      "sixteen",
    ] as const) {
      const req = request(key);
      const hash = computeTypedDecisionRequestHash(req);
      const built = buildDirectLogitChoiceResult(
        req,
        hash,
        findSyntheticLogitFixture(hash),
      );
      assert.equal(built.ok, true, key);
      if (!built.ok) continue;
      const result = built.result;
      assert.equal(validateTypedDecisionResult(result).ok, true, key);
      const check = validateTypedDecisionResultForRequest(result, req);
      assert.equal(check.ok, true, JSON.stringify(check));
      // The artifact's result hash agrees with the AI-140 canonicalizer.
      assert.equal(result.result_hash, computeTypedDecisionResultHash(result));
      assert.equal(result.result_origin, "synthetic_fixture");
      assert.equal(result.status, "succeeded");
      assert.equal(result.governance.downstream_allowed, false);
      assert.equal(result.governance.approval_state, "pending");
      assert.equal(result.escalation.executed, false);
      assert.deepEqual(result.evidence_refs, []);
      assert.equal(
        result.confidence?.semantics,
        "uncalibrated_candidate_reported",
      );
      assert.equal(result.confidence?.calibration_ref, null);
    }
  });

  it("confidence is the selected option's uncalibrated conditional probability", () => {
    const req = request("intent");
    const hash = computeTypedDecisionRequestHash(req);
    const built = buildDirectLogitChoiceResult(
      req,
      hash,
      findSyntheticLogitFixture(hash),
    );
    assert.equal(built.ok, true);
    if (!built.ok || built.result.decision?.kind !== "choice") return;
    const selected = built.result.decision.selected_candidate_id;
    const entry = built.result.decision.distribution!.entries.find(
      (e) => e.candidate_id === selected,
    );
    assert.equal(
      built.result.confidence!.confidence_micros,
      entry!.probability_micros,
    );
    assert.equal(built.result.confidence!.calibration_ref, null);
  });

  it("permuted requests produce the same decision and distribution", () => {
    for (const [a, b] of [
      ["intent", "intentPermuted"],
      ["route", "routePermuted"],
    ] as const) {
      const ra = request(a);
      const rb = request(b);
      const ha = computeTypedDecisionRequestHash(ra);
      const hb = computeTypedDecisionRequestHash(rb);
      const x = buildDirectLogitChoiceResult(
        ra,
        ha,
        findSyntheticLogitFixture(ha),
      );
      const y = buildDirectLogitChoiceResult(
        rb,
        hb,
        findSyntheticLogitFixture(hb),
      );
      assert.ok(x.ok && y.ok);
      if (!x.ok || !y.ok) continue;
      assert.deepEqual(x.result.decision, y.result.decision);
      assert.deepEqual(x.result.confidence, y.result.confidence);
      assert.equal(
        x.result.request_binding.semantic_request_hash,
        y.result.request_binding.semantic_request_hash,
      );
      assert.notEqual(x.result.result_hash, y.result.result_hash);
    }
  });

  it("refuses unsupported decision types, unbound fixtures and ties", () => {
    const intent = logitFixture("synthetic-logits-intent-0001");
    for (const key of ["boolean", "score", "ranking"] as const) {
      const req = request(key);
      assert.deepEqual(
        buildDirectLogitChoiceResult(
          req,
          computeTypedDecisionRequestHash(req),
          intent,
        ),
        { ok: false, code: "decision_type_unsupported" },
      );
    }
    const route = request("route");
    assert.deepEqual(
      buildDirectLogitChoiceResult(
        route,
        computeTypedDecisionRequestHash(route),
        intent,
      ),
      { ok: false, code: "fixture_unbound" },
    );
    const renamed = clone(request("intent")) as Mutable;
    renamed["request_id"] = "synthetic-intent-request-0099";
    const renamedHash = computeTypedDecisionRequestHash(
      renamed as TypedDecisionRequest,
    );
    assert.equal(findSyntheticLogitFixture(renamedHash), null);
    assert.deepEqual(
      buildDirectLogitChoiceResult(
        renamed as TypedDecisionRequest,
        renamedHash,
        null,
      ),
      { ok: false, code: "fixture_unbound" },
    );
    const tie = request("topTie");
    const tieHash = computeTypedDecisionRequestHash(tie);
    assert.deepEqual(
      buildDirectLogitChoiceResult(
        tie,
        tieHash,
        findSyntheticLogitFixture(tieHash),
      ),
      { ok: false, code: "top_logit_tie" },
    );
  });

  it("selection is method-specific: AI-140 validation still admits a non-modal selection", () => {
    const req = request("intent");
    const hash = computeTypedDecisionRequestHash(req);
    const built = buildDirectLogitChoiceResult(
      req,
      hash,
      findSyntheticLogitFixture(hash),
    );
    assert.ok(built.ok);
    if (!built.ok) return;
    const nonModal = clone(built.result) as Mutable;
    nonModal["decision"]["selected_candidate_id"] = "intent.other";
    delete nonModal["result_hash"];
    nonModal["result_hash"] = computeTypedDecisionResultHash(nonModal as never);
    assert.equal(validateTypedDecisionResultForRequest(nonModal, req).ok, true);
  });
});

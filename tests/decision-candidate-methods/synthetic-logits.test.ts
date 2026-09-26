import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeSyntheticLogitFixtureHash,
  validateSyntheticLogitFixture,
  validateSyntheticLogitFixtureForRequest,
  type SyntheticLogitFixture,
} from "../../src/decision-candidate-methods/index.js";
import {
  computeTypedDecisionRequestHash,
  computeTypedDecisionSemanticRequestHash,
} from "../../src/decision/canonical.js";
import {
  FIXTURE_REQUESTS,
  PINNED,
  clone,
  codes,
  logitFixture,
  logitFixtures,
  request,
  type Mutable,
} from "./helpers.js";

function rehash(value: Mutable): SyntheticLogitFixture {
  delete value["fixture_hash"];
  value["fixture_hash"] = computeSyntheticLogitFixtureHash(
    value as SyntheticLogitFixture,
  );
  return value as SyntheticLogitFixture;
}

function mutated(
  id: string,
  mutate: (value: Mutable) => void,
): SyntheticLogitFixture {
  const value = clone(logitFixture(id)) as Mutable;
  mutate(value);
  return rehash(value);
}

describe("AI-144 synthetic logit fixtures", () => {
  it("every committed fixture is closed, repository-owned synthetic and hash-pinned", () => {
    const fixtures = logitFixtures();
    assert.deepEqual(
      Object.fromEntries(fixtures.map((f) => [f.fixture_id, f.fixture_hash])),
      PINNED.fixtures,
    );
    for (const fixture of fixtures) {
      const check = validateSyntheticLogitFixture(fixture);
      assert.equal(check.ok, true, JSON.stringify(codes(check)));
      assert.equal(fixture.provenance, "repository_owned_synthetic");
      assert.equal(fixture.model_output, false);
      assert.equal(fixture.logit_unit, "micro_logit");
    }
  });

  it("binds each fixture to exact requests by request hash, semantic hash and candidate ids", () => {
    const seen = new Map<string, string>();
    for (const [id, keys] of Object.entries(FIXTURE_REQUESTS)) {
      const fixture = logitFixture(id);
      const hashes = keys.map((key) =>
        computeTypedDecisionRequestHash(request(key)),
      );
      assert.deepEqual(
        fixture.request_binding.request_hashes,
        [...hashes].sort(),
      );
      for (const key of keys) {
        const check = validateSyntheticLogitFixtureForRequest(
          fixture,
          request(key),
        );
        assert.equal(check.ok, true, `${id}/${key}: ${codes(check)}`);
        assert.equal(
          fixture.request_binding.semantic_request_hash,
          computeTypedDecisionSemanticRequestHash(request(key)),
        );
      }
      for (const hash of hashes) {
        assert.equal(seen.has(hash), false, "one fixture per request hash");
        seen.set(hash, id);
      }
    }
    // Permuted requests differ in request hash but share the fixture.
    assert.notEqual(
      computeTypedDecisionRequestHash(request("intent")),
      computeTypedDecisionRequestHash(request("intentPermuted")),
    );
  });

  it("rejects duplicate, unordered, missing and unknown candidates", () => {
    const duplicate = mutated("synthetic-logits-intent-0001", (v) => {
      v["candidate_logits"][1]["candidate_id"] =
        v["candidate_logits"][0]["candidate_id"];
    });
    assert.ok(
      codes(validateSyntheticLogitFixture(duplicate)).includes(
        "logit_duplicate",
      ),
    );
    const unordered = mutated("synthetic-logits-intent-0001", (v) =>
      v["candidate_logits"].reverse(),
    );
    assert.deepEqual(codes(validateSyntheticLogitFixture(unordered)), [
      "logit_order_invalid",
    ]);
    const missing = mutated("synthetic-logits-route-0001", (v) =>
      v["candidate_logits"].pop(),
    );
    assert.equal(validateSyntheticLogitFixture(missing).ok, true);
    assert.deepEqual(
      codes(validateSyntheticLogitFixtureForRequest(missing, request("route"))),
      ["logit_missing"],
    );
    const unknown = mutated("synthetic-logits-route-0001", (v) => {
      v["candidate_logits"].push({
        candidate_id: "route.zeta",
        logit_micros: 0,
      });
    });
    assert.deepEqual(
      codes(validateSyntheticLogitFixtureForRequest(unknown, request("route"))),
      ["logit_unknown_candidate"],
    );
  });

  it("rejects NaN, Infinity, fractional and out-of-bound logits without coercion", () => {
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      1.5,
      "1000000",
      null,
      100_000_001,
      -100_000_001,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      const value = clone(
        logitFixture("synthetic-logits-intent-0001"),
      ) as Mutable;
      value["candidate_logits"][0]["logit_micros"] = bad;
      assert.ok(
        codes(validateSyntheticLogitFixture(value)).includes("logit_invalid"),
        String(bad),
      );
    }
  });

  it("rejects model provenance, too few or too many candidates and request binding defects", () => {
    for (const [mutate, code] of [
      [
        (v: Mutable) => (v["model_output"] = true),
        "fixture_provenance_invalid",
      ],
      [
        (v: Mutable) => (v["provenance"] = "candidate_model"),
        "fixture_provenance_invalid",
      ],
      [(v: Mutable) => (v["logit_unit"] = "logit"), "logit_invalid"],
      [
        (v: Mutable) =>
          (v["candidate_logits"] = v["candidate_logits"].slice(0, 1)),
        "logit_count_invalid",
      ],
      [
        (v: Mutable) => (v["request_binding"]["request_hashes"] = []),
        "request_binding_invalid",
      ],
      [
        (v: Mutable) => v["request_binding"]["request_hashes"].reverse(),
        "request_binding_invalid",
      ],
      [
        (v: Mutable) =>
          (v["request_binding"]["capability_id"] = "Not A Capability"),
        "request_binding_invalid",
      ],
    ] as const)
      assert.deepEqual(
        codes(
          validateSyntheticLogitFixture(
            mutated("synthetic-logits-intent-0001", mutate),
          ),
        ),
        [code],
        String(mutate),
      );
    const seventeen = clone(
      logitFixture("synthetic-logits-bucket-0001"),
    ) as Mutable;
    seventeen["candidate_logits"].push({
      candidate_id: "bucket.17",
      logit_micros: 0,
    });
    assert.deepEqual(codes(validateSyntheticLogitFixture(rehash(seventeen))), [
      "logit_count_invalid",
    ]);
  });

  it("detects hash tampering and binding to the wrong request", () => {
    const tampered = clone(
      logitFixture("synthetic-logits-intent-0001"),
    ) as Mutable;
    tampered["candidate_logits"][0]["logit_micros"] += 1;
    assert.deepEqual(codes(validateSyntheticLogitFixture(tampered)), [
      "fixture_hash_mismatch",
    ]);
    assert.deepEqual(
      codes(
        validateSyntheticLogitFixtureForRequest(
          logitFixture("synthetic-logits-intent-0001"),
          request("route"),
        ),
      ).sort(),
      [
        "capability_mismatch",
        "logit_missing",
        "logit_missing",
        "logit_missing",
        "logit_missing",
        "logit_unknown_candidate",
        "logit_unknown_candidate",
        "logit_unknown_candidate",
        "request_not_bound",
        "semantic_request_hash_mismatch",
      ],
    );
    const renamed = clone(request("intent")) as Mutable;
    renamed["request_id"] = "synthetic-intent-request-0099";
    // Same semantics, but this exact request was never reviewed or bound.
    assert.deepEqual(
      codes(
        validateSyntheticLogitFixtureForRequest(
          logitFixture("synthetic-logits-intent-0001"),
          renamed,
        ),
      ),
      ["request_not_bound"],
    );
  });

  it("does not bind boolean, score or ranking requests", () => {
    for (const key of ["boolean", "score", "ranking"] as const)
      assert.ok(
        codes(
          validateSyntheticLogitFixtureForRequest(
            logitFixture("synthetic-logits-intent-0001"),
            request(key),
          ),
        ).includes("decision_type_unsupported"),
        key,
      );
  });
});

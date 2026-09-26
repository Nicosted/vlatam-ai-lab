import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GOLD_DECISION_CONTRACT_VERSION,
  GOLD_DECISION_SCORING_POLICY_ID,
  computeGoldDecisionCaseHash,
  validateGoldDecisionCase,
  type GoldDecisionCase,
  type GoldDecisionIssueCode,
} from "../../src/decision-evaluation/index.js";
import { clone, codes, rehashCase, seedCase } from "./helpers.js";

function assertRejected(value: unknown, code: GoldDecisionIssueCode): void {
  const check = validateGoldDecisionCase(value);
  assert.equal(check.ok, false, `expected rejection with ${code}`);
  assert.ok(
    codes(check).includes(code),
    `expected ${code}, got ${codes(check).join(",")}`,
  );
}

/** Mutates a clone, re-signs the case hash and asserts the rejection. */
function assertMutationRejected(
  caseId: string,
  mutate: (value: Record<string, any>) => void, // eslint-disable-line @typescript-eslint/no-explicit-any
  code: GoldDecisionIssueCode,
): void {
  const value = clone(seedCase(caseId)) as unknown as Record<string, unknown>;
  mutate(value);
  assertRejected(rehashCase(value), code);
}

describe("AI-141 Gold Decision Case validity", () => {
  it("declares contract 1.0.0 and scoring policy gold-decision-scoring-v1", () => {
    assert.equal(GOLD_DECISION_CONTRACT_VERSION, "1.0.0");
    assert.equal(GOLD_DECISION_SCORING_POLICY_ID, "gold-decision-scoring-v1");
  });

  for (const [label, caseId] of [
    ["choice", "gd-doctype-001"],
    ["boolean", "gd-review-001"],
    ["score (exact)", "gd-completeness-001"],
    ["score (acceptable range)", "gd-completeness-004"],
    ["ranking", "gd-priority-001"],
    ["required abstention", "gd-doctype-014"],
    ["allowed abstention", "gd-evidence-001"],
    ["abstention not allowed", "gd-citation-001"],
    ["synthetic regulatory scenario", "gd-regulatory-003"],
    ["mixed language", "gd-doctype-007"],
  ] as const) {
    it(`accepts a valid ${label} case`, () => {
      const check = validateGoldDecisionCase(seedCase(caseId));
      assert.equal(check.ok, true, JSON.stringify(check));
    });
  }

  it("case hash is deterministic, self-excluding and changes with any truth field", () => {
    const value = seedCase("gd-doctype-001");
    assert.equal(computeGoldDecisionCaseHash(value), value.case_hash);
    assert.equal(computeGoldDecisionCaseHash(clone(value)), value.case_hash);
    const { case_hash: _omit, ...unhashed } = value;
    void _omit;
    assert.equal(computeGoldDecisionCaseHash(unhashed), value.case_hash);
    const changed = clone(value) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    changed["expected"]["expected_candidate_id"] = "doc.unknown";
    assert.notEqual(
      computeGoldDecisionCaseHash(changed as GoldDecisionCase),
      value.case_hash,
    );
  });

  it("rejects a tampered answer key whose hash was not re-signed", () => {
    const value = clone(seedCase("gd-doctype-001")) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    value["expected"]["expected_candidate_id"] = "doc.certificate";
    assertRejected(value, "case_hash_mismatch");
  });
});

describe("AI-141 Gold Decision Case fail-closed rules", () => {
  it("rejects a non-object or wrong contract", () => {
    for (const value of [null, [], "case", 1, { contract: "gold_case" }])
      assertRejected(value, "contract_invalid");
  });

  it("rejects unknown and missing properties", () => {
    assertMutationRejected(
      "gd-doctype-001",
      (v) => (v["notes"] = "extra"),
      "unknown_property",
    );
    assertMutationRejected(
      "gd-doctype-001",
      (v) => delete v["abstention_policy"],
      "missing_property",
    );
    assertMutationRejected(
      "gd-doctype-001",
      (v) => (v["expected"]["confidence"] = 1),
      "unknown_property",
    );
  });

  it("rejects unsupported or malformed schema versions", () => {
    assertMutationRejected(
      "gd-doctype-001",
      (v) => (v["schema_version"] = "2.0.0"),
      "schema_version_unsupported",
    );
    assertMutationRejected(
      "gd-doctype-001",
      (v) => (v["schema_version"] = "1.0"),
      "schema_version_invalid",
    );
  });

  it("rejects provider, model and credential fields at any depth", () => {
    for (const key of ["provider", "model", "model_id", "api_key", "token"]) {
      assertMutationRejected(
        "gd-doctype-001",
        (v) => (v[key] = "synthetic"),
        "forbidden_field",
      );
      assertMutationRejected(
        "gd-doctype-001",
        (v) => (v["provenance"][key] = "synthetic"),
        "forbidden_field",
      );
    }
  });

  it("rejects reviewer identity fields", () => {
    assertMutationRejected(
      "gd-doctype-001",
      (v) => (v["provenance"]["reviewer_name"] = "someone"),
      "forbidden_field",
    );
  });

  it("rejects private reasoning fields at any depth", () => {
    for (const key of [
      "reasoning",
      "chain_of_thought",
      "rationale",
      "thinking",
    ])
      assertMutationRejected(
        "gd-doctype-001",
        (v) => (v["provenance"][key] = "private"),
        "private_reasoning_forbidden",
      );
  });

  it("rejects an embedded request that fails the AI-140 contract", () => {
    assertMutationRejected(
      "gd-doctype-001",
      (v) => (v["request"]["policy"]["data_classification"] = "confidential"),
      "request_invalid",
    );
    assertMutationRejected(
      "gd-doctype-001",
      (v) => (v["request"]["provider"] = "synthetic"),
      "request_invalid",
    );
  });

  it("rejects a capability outside the synthetic.decision namespace", () => {
    assertMutationRejected(
      "gd-doctype-001",
      (v) => (v["request"]["capability_id"] = "commercial.document_classify"),
      "capability_not_synthetic",
    );
  });

  it("rejects an expected choice that is not a declared candidate", () => {
    assertMutationRejected(
      "gd-doctype-001",
      (v) => (v["expected"]["expected_candidate_id"] = "doc.proforma"),
      "expected_candidate_unknown",
    );
  });

  it("rejects an expectation whose kind differs from the decision type", () => {
    assertMutationRejected(
      "gd-doctype-001",
      (v) => (v["expected"] = { kind: "boolean", expected_value: true }),
      "expected_decision_type_mismatch",
    );
  });

  it("rejects a boolean expectation carrying a probability threshold", () => {
    assertMutationRejected(
      "gd-review-001",
      (v) => (v["expected"]["threshold_micros"] = 500000),
      "unknown_property",
    );
  });

  it("rejects score expectations outside the scale or on another scale", () => {
    assertMutationRejected(
      "gd-completeness-001",
      (v) => (v["expected"]["expected_value"] = 5),
      "score_expectation_out_of_scale",
    );
    assertMutationRejected(
      "gd-completeness-001",
      (v) => (v["expected"]["expected_value"] = -1),
      "score_expectation_out_of_scale",
    );
    assertMutationRejected(
      "gd-completeness-001",
      (v) => (v["expected"]["scale_id"] = "synthetic.completeness.0_10"),
      "score_scale_mismatch",
    );
    assertMutationRejected(
      "gd-completeness-001",
      (v) => (v["expected"]["expected_value"] = 2.5),
      "expected_invalid",
    );
  });

  it("rejects malformed or vacuous acceptable ranges", () => {
    assertMutationRejected(
      "gd-completeness-004",
      (v) => (v["expected"]["acceptable_maximum"] = 2),
      "expected_invalid",
    );
    assertMutationRejected(
      "gd-completeness-004",
      (v) => (v["expected"]["acceptable_maximum"] = 7),
      "score_expectation_out_of_scale",
    );
    assertMutationRejected(
      "gd-completeness-004",
      (v) => {
        v["expected"]["acceptable_minimum"] = 0;
        v["expected"]["acceptable_maximum"] = 4;
      },
      "expected_invalid",
    );
    assertMutationRejected(
      "gd-completeness-004",
      (v) => (v["expected"]["match"] = "fuzzy"),
      "expected_invalid",
    );
  });

  it("rejects a ranking expectation that is not a permutation", () => {
    assertMutationRejected(
      "gd-priority-001",
      (v) => v["expected"]["expected_order"].pop(),
      "ranking_expectation_not_permutation",
    );
    assertMutationRejected(
      "gd-priority-001",
      (v) => (v["expected"]["expected_order"][0] = "task.freight_booking"),
      "ranking_expectation_not_permutation",
    );
    assertMutationRejected(
      "gd-priority-001",
      (v) => (v["expected"]["expected_order"][0] = "task.unknown_task"),
      "ranking_expectation_not_permutation",
    );
  });

  it("requires abstention truth exactly when abstention is required", () => {
    assertMutationRejected(
      "gd-doctype-014",
      (v) => (v["abstention_policy"] = "allowed"),
      "abstention_expectation_mismatch",
    );
    assertMutationRejected(
      "gd-doctype-001",
      (v) => (v["abstention_policy"] = "required"),
      "abstention_expectation_mismatch",
    );
    assertMutationRejected(
      "gd-doctype-001",
      (v) => (v["abstention_policy"] = "optional"),
      "abstention_policy_invalid",
    );
    assertMutationRejected(
      "gd-doctype-014",
      (v) => (v["expected"]["reason_code"] = "ambiguous"),
      "unknown_property",
    );
  });

  it("rejects malformed provenance", () => {
    assertMutationRejected(
      "gd-doctype-001",
      (v) => (v["provenance"] = "synthetic"),
      "provenance_invalid",
    );
    assertMutationRejected(
      "gd-doctype-001",
      (v) => (v["provenance"]["candidate_generated"] = true),
      "provenance_invalid",
    );
    assertMutationRejected(
      "gd-doctype-001",
      (v) => (v["provenance"]["source_kind"] = "customer_upload"),
      "provenance_invalid",
    );
    assertMutationRejected(
      "gd-doctype-001",
      (v) => (v["provenance"]["authoring_method"] = "model_generated"),
      "provenance_invalid",
    );
    assertMutationRejected(
      "gd-doctype-001",
      (v) => (v["provenance"]["labeling_rule_id"] = ""),
      "provenance_invalid",
    );
  });

  it("rejects missing, unordered or undeclared evidence basis", () => {
    assertMutationRejected(
      "gd-doctype-001",
      (v) => (v["provenance"]["evidence_basis"] = []),
      "evidence_basis_invalid",
    );
    assertMutationRejected(
      "gd-doctype-001",
      (v) => v["provenance"]["evidence_basis"].reverse(),
      "evidence_basis_invalid",
    );
    assertMutationRejected(
      "gd-doctype-001",
      (v) => (v["provenance"]["evidence_basis"] = ["document.not_a_fact"]),
      "evidence_basis_invalid",
    );
  });

  it("rejects invalid language, jurisdiction and split codes", () => {
    for (const language of ["es", "pt", "EN", "fr"])
      assertMutationRejected(
        "gd-doctype-001",
        (v) => (v["language"] = language),
        "language_invalid",
      );
    for (const jurisdiction of ["ar", "ES", "", null])
      assertMutationRejected(
        "gd-doctype-001",
        (v) => (v["jurisdiction"] = jurisdiction),
        "jurisdiction_invalid",
      );
    assertMutationRejected(
      "gd-doctype-001",
      (v) => (v["split"] = "train"),
      "split_invalid",
    );
  });

  it("requires regulatory jurisdictions to be marked as synthetic scenarios", () => {
    assertMutationRejected(
      "gd-regulatory-001",
      (v) => (v["tags"] = ["regulatory_relevance"]),
      "regulatory_scenario_tag_missing",
    );
    assertMutationRejected(
      "gd-doctype-001",
      (v) => (v["jurisdiction"] = "BR"),
      "regulatory_scenario_tag_missing",
    );
  });

  it("rejects unsorted, duplicated or malformed tags and group ids", () => {
    assertMutationRejected(
      "gd-doctype-010",
      (v) => v["tags"].reverse(),
      "tags_invalid",
    );
    assertMutationRejected(
      "gd-doctype-001",
      (v) => (v["tags"] = ["a_tag", "a_tag"]),
      "tags_invalid",
    );
    assertMutationRejected(
      "gd-doctype-001",
      (v) => (v["permutation_group_id"] = "Not Valid"),
      "permutation_group_invalid",
    );
  });

  it("never repairs or reorders a case in place", () => {
    const value = clone(seedCase("gd-doctype-010")) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    value["tags"].reverse();
    const snapshot = JSON.stringify(value);
    validateGoldDecisionCase(value);
    assert.equal(JSON.stringify(value), snapshot);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeGoldDecisionSetHash,
  validateGoldDecisionSet,
  validateGoldDecisionSetManifest,
  validateGoldDecisionSetSuccession,
  type GoldDecisionIssueCode,
  type GoldDecisionSet,
} from "../../src/decision-evaluation/index.js";
import {
  clone,
  codes,
  fixtureSet,
  rehashCase,
  rehashSet,
  seed,
} from "./helpers.js";

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function assertSetRejected(
  manifest: unknown,
  cases: readonly unknown[],
  code: GoldDecisionIssueCode,
): void {
  const check = validateGoldDecisionSet(manifest, cases);
  assert.equal(check.ok, false, `expected rejection with ${code}`);
  assert.ok(
    codes(check).includes(code),
    `expected ${code}, got ${codes(check).join(",")}`,
  );
}

/** Rebinds the manifest to (possibly mutated) cases and re-signs it. */
function rebind(manifest: Loose, cases: readonly Loose[]): Loose {
  const byId = new Map(cases.map((c) => [c["case_id"], c]));
  return rehashSet({
    ...manifest,
    cases: manifest["cases"].map((entry: Loose) => ({
      ...entry,
      case_hash:
        byId.get(entry["case_id"])?.["case_hash"] ?? entry["case_hash"],
    })),
  });
}

describe("AI-141 Gold Decision Set manifest", () => {
  it("accepts the seed dataset and binds every case exactly once", () => {
    const { manifest, cases } = seed();
    const check = validateGoldDecisionSet(manifest, cases);
    assert.equal(check.ok, true, JSON.stringify(check).slice(0, 2000));
    if (!check.ok) return;
    assert.equal(check.value.cases.length, manifest.cases.length);
    assert.deepEqual(
      check.value.cases.map((c) => c.case_id),
      manifest.cases.map((entry) => entry.case_id),
    );
  });

  it("accepts the AI-140 fixture set", () => {
    const { manifest, cases } = fixtureSet();
    assert.equal(validateGoldDecisionSet(manifest, cases).ok, true);
  });

  it("dataset hash is deterministic and binds version, split, order, hashes and scoring policy", () => {
    const { manifest } = seed();
    assert.equal(computeGoldDecisionSetHash(manifest), manifest.dataset_hash);
    assert.equal(
      computeGoldDecisionSetHash(clone(manifest)),
      manifest.dataset_hash,
    );
    const variants: ((m: Loose) => void)[] = [
      (m) => (m["dataset_version"] = "1.0.1"),
      (m) => (m["cases"][0]["split"] = "test"),
      (m) => (m["cases"][0]["case_hash"] = "0".repeat(64)),
      (m) => m["cases"].reverse(),
      (m) => (m["scoring_policy"] = "gold-decision-scoring-v2"),
      (m) => (m["review"]["state"] = "draft"),
      (m) => (m["labeling_rules"][0]["statement"] = "changed"),
    ];
    for (const mutate of variants) {
      const changed = clone(manifest) as Loose;
      mutate(changed);
      assert.notEqual(
        computeGoldDecisionSetHash(changed as GoldDecisionSet),
        manifest.dataset_hash,
      );
    }
  });

  it("changing any case changes the dataset identity", () => {
    const { manifest, cases } = seed();
    const mutated = clone(cases) as Loose[];
    mutated[0]!["tags"] = [...mutated[0]!["tags"], "zz_extra"];
    mutated[0] = rehashCase(mutated[0]!);
    const rebound = rebind(manifest, mutated);
    assert.notEqual(rebound["dataset_hash"], manifest.dataset_hash);
    assert.equal(validateGoldDecisionSet(rebound, mutated).ok, true);
    // Without rebinding, the old manifest no longer matches the case.
    assertSetRejected(manifest, mutated, "case_hash_binding_mismatch");
  });

  it("preserves split metadata exactly", () => {
    const { manifest, cases } = seed();
    const check = validateGoldDecisionSet(manifest, cases);
    assert.ok(check.ok);
    if (!check.ok) return;
    check.value.cases.forEach((c, index) =>
      assert.equal(c.split, manifest.cases[index]!.split),
    );
  });

  it("rejects a tampered dataset hash", () => {
    const { manifest, cases } = seed();
    const tampered = clone(manifest) as Loose;
    tampered["dataset_hash"] = "f".repeat(64);
    assertSetRejected(tampered, cases, "dataset_hash_mismatch");
    const unsigned = clone(manifest) as Loose;
    unsigned["labeling_rules"][0]["statement"] = "silently rewritten rule";
    assertSetRejected(unsigned, cases, "dataset_hash_mismatch");
  });

  it("rejects duplicate case entries, duplicate hashes and unordered entries", () => {
    const { manifest, cases } = seed();
    const dup = clone(manifest) as Loose;
    dup["cases"][1] = { ...dup["cases"][0] };
    const dupCheck = validateGoldDecisionSetManifest(rehashSet(dup));
    assert.ok(codes(dupCheck).includes("duplicate_case_id"));
    assert.ok(codes(dupCheck).includes("duplicate_case_hash"));
    const reordered = clone(manifest) as Loose;
    reordered["cases"].reverse();
    assertSetRejected(rehashSet(reordered), cases, "case_entry_order_invalid");
  });

  it("rejects duplicate supplied cases", () => {
    const { manifest, cases } = seed();
    assertSetRejected(manifest, [...cases, cases[0]], "duplicate_case_id");
  });

  it("rejects a manifest entry without its case", () => {
    const { manifest, cases } = seed();
    assertSetRejected(manifest, cases.slice(1), "case_missing");
  });

  it("rejects a case that is not in the manifest", () => {
    const { manifest, cases } = seed();
    const extra = clone(cases[0]!) as Loose;
    extra["case_id"] = "gd-zz-extra-001";
    extra["request"]["request_id"] = "gd-zz-extra-001";
    assertSetRejected(
      manifest,
      [...cases, rehashCase(extra)],
      "case_not_in_manifest",
    );
  });

  it("rejects cases from another dataset or version", () => {
    const { manifest, cases } = seed();
    const mutated = clone(cases) as Loose[];
    mutated[0]!["dataset_version"] = "0.9.0";
    mutated[0] = rehashCase(mutated[0]!);
    assertSetRejected(
      rebind(manifest, mutated),
      mutated,
      "case_dataset_mismatch",
    );
  });

  it("rejects a case whose split differs from its manifest entry", () => {
    const { manifest, cases } = seed();
    const mutated = clone(cases) as Loose[];
    const index = mutated.findIndex((c) => c["case_id"] === "gd-doctype-001");
    mutated[index]!["split"] = "test";
    mutated[index] = rehashCase(mutated[index]!);
    assertSetRejected(
      rebind(manifest, mutated),
      mutated,
      "case_split_mismatch",
    );
  });

  it("rejects duplicate request identities across cases", () => {
    const { manifest, cases } = seed();
    const mutated = clone(cases) as Loose[];
    mutated[1]!["request"]["request_id"] = mutated[0]!["request"]["request_id"];
    mutated[1] = rehashCase(mutated[1]!);
    assertSetRejected(
      rebind(manifest, mutated),
      mutated,
      "duplicate_request_id",
    );
  });

  it("rejects unknown labeling rules and capability mismatches", () => {
    const { manifest, cases } = seed();
    const unknown = clone(cases) as Loose[];
    unknown[0]!["provenance"]["labeling_rule_id"] = "rule.not_declared.v1";
    unknown[0] = rehashCase(unknown[0]!);
    assertSetRejected(
      rebind(manifest, unknown),
      unknown,
      "labeling_rule_unknown",
    );
    const mismatch = clone(cases) as Loose[];
    const index = mismatch.findIndex((c) => c["case_id"] === "gd-doctype-001");
    mismatch[index]!["provenance"]["labeling_rule_id"] =
      "rule.workflow_next_step.v1";
    mismatch[index] = rehashCase(mismatch[index]!);
    assertSetRejected(
      rebind(manifest, mismatch),
      mismatch,
      "labeling_rule_capability_mismatch",
    );
  });

  it("rejects declared distributions that differ from recomputed counts", () => {
    const { manifest, cases } = seed();
    for (const key of [
      "language_distribution",
      "decision_type_distribution",
      "jurisdiction_distribution",
      "capability_distribution",
      "split_distribution",
    ]) {
      const mutated = clone(manifest) as Loose;
      const first = Object.keys(mutated[key])[0]!;
      mutated[key][first] += 1;
      assertSetRejected(rehashSet(mutated), cases, "distribution_mismatch");
    }
  });

  it("rejects split policy, provenance and scoring policy changes", () => {
    const { manifest, cases } = seed();
    const cases_: [(m: Loose) => void, GoldDecisionIssueCode][] = [
      [
        (m) => (m["split_policy"]["test_split_training_use"] = "allowed"),
        "split_policy_invalid",
      ],
      [
        (m) => (m["split_policy"]["candidate_case_selection"] = "allowed"),
        "split_policy_invalid",
      ],
      [
        (m) => (m["split_policy"]["permutation_groups_share_split"] = false),
        "split_policy_invalid",
      ],
      [
        (m) => (m["split_policy"]["splits"] = ["train", "test"]),
        "split_policy_invalid",
      ],
      [
        (m) => (m["created_from"]["candidate_generated_labels"] = true),
        "created_from_invalid",
      ],
      [
        (m) => (m["created_from"]["customer_data"] = true),
        "created_from_invalid",
      ],
      [
        (m) => (m["created_from"]["production_data"] = true),
        "created_from_invalid",
      ],
      [(m) => (m["scoring_policy"] = "latest"), "scoring_policy_invalid"],
      [(m) => (m["provider"] = "synthetic"), "forbidden_field"],
    ];
    for (const [mutate, code] of cases_) {
      const mutated = clone(manifest) as Loose;
      mutate(mutated);
      assertSetRejected(rehashSet(mutated), cases, code);
    }
  });

  it("draft and in_review both validate", () => {
    const { manifest, cases } = seed();
    assert.equal(manifest.review.state, "in_review");
    assert.equal(validateGoldDecisionSet(manifest, cases).ok, true);
    const draft = clone(manifest) as Loose;
    draft["review"]["state"] = "draft";
    assert.equal(validateGoldDecisionSet(rehashSet(draft), cases).ok, true);
  });

  it("rejects a self-declared approved state, with or without an approval reference", () => {
    const { manifest, cases } = seed();
    const approved = clone(manifest) as Loose;
    approved["review"]["state"] = "approved";
    assertSetRejected(rehashSet(approved), cases, "review_invalid");
    const withRef = clone(manifest) as Loose;
    withRef["review"] = {
      state: "approved",
      human_review_required: true,
      approval_ref: {
        approval_id: "approval-0001",
        content_hash: "a".repeat(64),
      },
    };
    assertSetRejected(rehashSet(withRef), cases, "review_invalid");
    for (const state of ["published", "rejected", "APPROVED", null])
      assertSetRejected(
        rehashSet({
          ...clone(manifest),
          review: { state, human_review_required: true },
        }),
        cases,
        "review_invalid",
      );
  });

  it("an arbitrary approval reference cannot grant authority on any state", () => {
    const { manifest, cases } = seed();
    for (const state of ["draft", "in_review"]) {
      for (const ref of [
        { approval_id: "approval-0001", content_hash: "a".repeat(64) },
        { approval_id: "approval-0001", content_hash: manifest.dataset_hash },
        null,
      ]) {
        const mutated = clone(manifest) as Loose;
        mutated["review"] = {
          state,
          human_review_required: true,
          approval_ref: ref,
        };
        assertSetRejected(rehashSet(mutated), cases, "unknown_property");
      }
    }
    for (const key of ["approval", "approved_by", "approved_at", "published"]) {
      const mutated = clone(manifest) as Loose;
      mutated[key] = true;
      assertSetRejected(rehashSet(mutated), cases, "unknown_property");
    }
    const noHuman = clone(manifest) as Loose;
    noHuman["review"]["human_review_required"] = false;
    assertSetRejected(rehashSet(noHuman), cases, "review_invalid");
  });

  it("admits only the synthetic_conformance purpose, never domain-representative or promotion-eligible", () => {
    const { manifest, cases } = seed();
    assert.equal(manifest.evaluation_purpose, "synthetic_conformance");
    assert.equal(manifest.domain_representative, false);
    assert.equal(manifest.promotion_eligible, false);
    const variants: ((m: Loose) => void)[] = [
      (m) => (m["evaluation_purpose"] = "domain_benchmark"),
      (m) => (m["evaluation_purpose"] = "sealed_holdout"),
      (m) => delete m["evaluation_purpose"],
      (m) => (m["domain_representative"] = true),
      (m) => (m["domain_representative"] = "false"),
      (m) => (m["promotion_eligible"] = true),
      (m) => delete m["promotion_eligible"],
    ];
    for (const mutate of variants) {
      const mutated = clone(manifest) as Loose;
      mutate(mutated);
      const check = validateGoldDecisionSet(rehashSet(mutated), cases);
      assert.equal(check.ok, false);
      assert.ok(
        codes(check).some((code) =>
          ["evaluation_purpose_invalid", "missing_property"].includes(code),
        ),
        codes(check).join(","),
      );
    }
  });

  it("declares public case visibility and no blind holdout; changing either changes the hash and is rejected", () => {
    const { manifest, cases } = seed();
    assert.equal(manifest.split_policy.case_visibility, "public");
    assert.equal(manifest.split_policy.blind_holdout, false);
    for (const [key, value] of [
      ["case_visibility", "sealed"],
      ["case_visibility", "private"],
      ["blind_holdout", true],
    ] as const) {
      const mutated = clone(manifest) as Loose;
      mutated["split_policy"][key] = value;
      assert.notEqual(
        computeGoldDecisionSetHash(mutated as GoldDecisionSet),
        manifest.dataset_hash,
      );
      assertSetRejected(rehashSet(mutated), cases, "split_policy_invalid");
    }
  });

  it("purpose, promotion and domain flags are hash-bound", () => {
    const { manifest } = seed();
    for (const [key, value] of [
      ["evaluation_purpose", "domain_benchmark"],
      ["domain_representative", true],
      ["promotion_eligible", true],
    ] as const) {
      const mutated = clone(manifest) as Loose;
      mutated[key] = value;
      assert.notEqual(
        computeGoldDecisionSetHash(mutated as GoldDecisionSet),
        manifest.dataset_hash,
      );
    }
  });

  it("rejects an empty set and unordered labeling rules", () => {
    const { manifest } = seed();
    const empty = clone(manifest) as Loose;
    empty["cases"] = [];
    assert.ok(
      codes(validateGoldDecisionSetManifest(rehashSet(empty))).includes(
        "set_empty",
      ),
    );
    const rules = clone(manifest) as Loose;
    rules["labeling_rules"].reverse();
    assert.ok(
      codes(validateGoldDecisionSetManifest(rehashSet(rules))).includes(
        "labeling_rule_order_invalid",
      ),
    );
  });
});

describe("AI-141 permutation groups", () => {
  it("rejects a singleton group", () => {
    const { manifest, cases } = seed();
    const mutated = clone(cases) as Loose[];
    const index = mutated.findIndex((c) => c["case_id"] === "gd-doctype-001");
    mutated[index]!["permutation_group_id"] = "perm-lonely";
    mutated[index] = rehashCase(mutated[index]!);
    assertSetRejected(
      rebind(manifest, mutated),
      mutated,
      "permutation_group_singleton",
    );
  });

  it("rejects members in different splits", () => {
    const { manifest, cases } = seed();
    const mutated = clone(cases) as Loose[];
    const index = mutated.findIndex((c) => c["case_id"] === "gd-doctype-011");
    mutated[index]!["split"] = "development";
    mutated[index] = rehashCase(mutated[index]!);
    const rebound = clone(rebind(manifest, mutated));
    const entry = rebound["cases"].find(
      (e: Loose) => e["case_id"] === "gd-doctype-011",
    );
    entry["split"] = "development";
    rebound["split_distribution"]["development"] += 1;
    rebound["split_distribution"]["test"] -= 1;
    assertSetRejected(
      rehashSet(rebound),
      mutated,
      "permutation_group_split_mismatch",
    );
  });

  it("rejects members with different truth", () => {
    const { manifest, cases } = seed();
    const mutated = clone(cases) as Loose[];
    const index = mutated.findIndex((c) => c["case_id"] === "gd-doctype-011");
    mutated[index]!["expected"]["expected_candidate_id"] = "doc.unknown";
    mutated[index] = rehashCase(mutated[index]!);
    assertSetRejected(
      rebind(manifest, mutated),
      mutated,
      "permutation_group_truth_mismatch",
    );
  });

  it("rejects members that are not the same semantic question", () => {
    const { manifest, cases } = seed();
    const mutated = clone(cases) as Loose[];
    const index = mutated.findIndex((c) => c["case_id"] === "gd-doctype-011");
    mutated[index]!["request"]["bounded_state"]["facts"][0]["value"] =
      "Invoice INV-9999";
    mutated[index] = rehashCase(mutated[index]!);
    assertSetRejected(
      rebind(manifest, mutated),
      mutated,
      "permutation_group_semantic_mismatch",
    );
  });

  it("rejects members presented in the identical option order", () => {
    const { manifest, cases } = seed();
    const mutated = clone(cases) as Loose[];
    const a = mutated.findIndex((c) => c["case_id"] === "gd-doctype-010");
    const b = mutated.findIndex((c) => c["case_id"] === "gd-doctype-011");
    mutated[b]!["request"]["output_domain"] = clone(
      mutated[a]!["request"]["output_domain"],
    );
    mutated[b] = rehashCase(mutated[b]!);
    assertSetRejected(
      rebind(manifest, mutated),
      mutated,
      "permutation_group_not_permuted",
    );
  });
});

describe("AI-141 dataset succession and test-split immutability", () => {
  // No set can be published in AI-141; the frozen-test-split rule is
  // exercised explicitly, as a future governed publication binding will.
  const FROZEN = { test_split_frozen: true } as const;
  const UNFROZEN = { test_split_frozen: false } as const;
  function previousVersion(): Loose {
    return clone(seed().manifest) as unknown as Loose;
  }
  function successor(
    previous: Loose,
    mutate: (m: Loose) => void = () => {},
  ): Loose {
    const next = clone(previous);
    next["dataset_version"] = "1.1.0";
    next["review"] = { state: "draft", human_review_required: true };
    next["supersedes"] = {
      dataset_version: previous["dataset_version"],
      dataset_hash: previous["dataset_hash"],
    };
    mutate(next);
    return rehashSet(next);
  }
  function assertSuccessionRejected(
    previous: Loose,
    next: Loose,
    code: GoldDecisionIssueCode,
  ): void {
    const check = validateGoldDecisionSetSuccession(previous, next, FROZEN);
    assert.equal(check.ok, false);
    assert.ok(
      codes(check).includes(code),
      `expected ${code}, got ${codes(check).join(",")}`,
    );
  }

  it("accepts a successor that keeps every frozen test case intact", () => {
    const previous = previousVersion();
    assert.equal(
      validateGoldDecisionSetSuccession(previous, successor(previous), FROZEN)
        .ok,
      true,
    );
  });

  it("rejects a mutated or removed frozen test case", () => {
    const previous = previousVersion();
    const testIndex = previous["cases"].findIndex(
      (e: Loose) => e["split"] === "test",
    );
    assertSuccessionRejected(
      previous,
      successor(
        previous,
        (m) => (m["cases"][testIndex]["case_hash"] = "b".repeat(64)),
      ),
      "test_case_mutated",
    );
    assertSuccessionRejected(
      previous,
      successor(previous, (m) => {
        m["cases"].splice(testIndex, 1);
        m["split_distribution"]["test"] -= 1;
      }),
      "test_case_removed",
    );
  });

  it("rejects moving a frozen case between splits", () => {
    const previous = previousVersion();
    const testIndex = previous["cases"].findIndex(
      (e: Loose) => e["split"] === "test",
    );
    assertSuccessionRejected(
      previous,
      successor(previous, (m) => {
        m["cases"][testIndex]["split"] = "development";
        m["split_distribution"]["test"] -= 1;
        m["split_distribution"]["development"] += 1;
      }),
      "case_split_changed",
    );
  });

  it("rejects a successor that does not bind or advance the previous version", () => {
    const previous = previousVersion();
    assertSuccessionRejected(
      previous,
      successor(previous, (m) => (m["supersedes"] = null)),
      "succession_supersedes_mismatch",
    );
    assertSuccessionRejected(
      previous,
      successor(
        previous,
        (m) => (m["supersedes"]["dataset_hash"] = "c".repeat(64)),
      ),
      "succession_supersedes_mismatch",
    );
    assertSuccessionRejected(
      previous,
      successor(previous, (m) => (m["dataset_version"] = "0.9.0")),
      "succession_version_not_increased",
    );
    assertSuccessionRejected(
      previous,
      successor(previous, (m) => (m["dataset_id"] = "another-dataset")),
      "succession_dataset_mismatch",
    );
  });

  it("allows an unfrozen (unpublished) predecessor's test cases to change, but still binds lineage", () => {
    const { manifest } = seed();
    const testIndex = manifest.cases.findIndex((e) => e.split === "test");
    const next = successor(manifest as unknown as Loose, (m) => {
      m["cases"][testIndex]["case_hash"] = "d".repeat(64);
    });
    assert.equal(
      validateGoldDecisionSetSuccession(manifest, next, UNFROZEN).ok,
      true,
    );
    assert.equal(
      validateGoldDecisionSetSuccession(manifest, next, FROZEN).ok,
      false,
    );
    const unbound = successor(manifest as unknown as Loose, (m) => {
      m["supersedes"] = null;
    });
    assert.equal(
      validateGoldDecisionSetSuccession(manifest, unbound, UNFROZEN).ok,
      false,
    );
  });

  it("a successor can never become approved", () => {
    const previous = previousVersion();
    const next = successor(previous, (m) => {
      m["review"] = { state: "approved", human_review_required: true };
    });
    const check = validateGoldDecisionSetSuccession(previous, next, UNFROZEN);
    assert.equal(check.ok, false);
    assert.ok(codes(check).includes("review_invalid"));
  });
});

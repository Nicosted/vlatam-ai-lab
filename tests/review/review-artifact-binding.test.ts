import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  artifactContentHash,
  assertValidReviewBinding,
  canonicalizeReviewJson,
  createReviewBinding,
  ReviewBindingError,
  toReviewableArtifact,
  validateReviewBindingIntegrity,
  type ReviewBindingReasonCode,
} from "../../src/review/review-artifact-binding.js";

const REVIEWED_AT = "2026-07-13T12:00:00.000Z";
type MutableReviewedArtifact = Record<string, unknown> & {
  artifact_id: string;
  schema_version: string;
  review_status: string;
  reviewed_at: string;
  classification_candidate: Record<string, unknown>;
  review_binding: Record<string, unknown>;
};

function draft(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    artifact_id: "artifact--infoleg--review-001",
    extraction_result_id: "review-001",
    source_id: "infoleg",
    generated_at: "2026-07-13T10:00:00.000Z",
    classification_candidate: {
      ncm_code: "42029200110V",
      description: "Reviewed classification candidate",
      confidence: 0.82,
      status: "candidate",
    },
    extracted_evidence: [
      {
        claim_id: "claim-001",
        claim_type: "classification",
        text: "Evidence A",
        source_ref: "data/evidence/infoleg/example.json#/claims/0",
        confidence: 0.82,
        affected_ncm: ["42029200110V", "42029200900X"],
        requires_review: true,
      },
    ],
    governance: {
      human_review_required: true,
      downstream_allowed: false,
      review_only: true,
      not_final_classification: true,
    },
    source_authority: "official_regulation",
    origin: "ai_assisted_extraction",
    schema_version: "1.0.0",
    ...overrides,
  };
}

function reviewed(
  decision: "approved" | "rejected" = "approved",
  overrides: Record<string, unknown> = {},
): MutableReviewedArtifact {
  const original = draft(overrides);
  const artifact = {
    ...original,
    review_status:
      decision === "approved" ? "reviewed_approved" : "reviewed_rejected",
    reviewer: "internal-reviewer",
    reviewed_at: REVIEWED_AT,
    ...(decision === "approved"
      ? { classifier_approval_reference: "approval-ref--001" }
      : {}),
    downstream_eligibility_reason:
      decision === "approved" ? "Verified" : "Rejected",
    governance:
      decision === "approved"
        ? {
            human_review_required: false,
            downstream_allowed: true,
            review_only: false,
            not_final_classification: false,
          }
        : {
            human_review_required: true,
            downstream_allowed: false,
            review_only: true,
            not_final_classification: true,
          },
  };
  return {
    ...artifact,
    review_binding: structuredClone(
      createReviewBinding(original, {
        review_decision: decision,
        reviewed_at: REVIEWED_AT,
        review_policy_id: "classifier-human-review",
        review_policy_version: "1.0.0",
      }),
    ) as unknown as Record<string, unknown>,
  } as unknown as MutableReviewedArtifact;
}

function expectReason(
  fn: () => unknown,
  reason: ReviewBindingReasonCode,
): void {
  assert.throws(
    fn,
    (error: unknown) =>
      error instanceof ReviewBindingError && error.reason_code === reason,
  );
}

describe("review artifact canonicalization and hashing", () => {
  it("produces identical hashes for identical artifacts and ignores object key insertion order", () => {
    const first = draft();
    const second = Object.fromEntries(Object.entries(first).reverse());
    assert.equal(artifactContentHash(first), artifactContentHash(first));
    assert.equal(artifactContentHash(first), artifactContentHash(second));
  });

  it("preserves array order and binds every reviewed business-content mutation", () => {
    const first = draft();
    const reordered = structuredClone(first) as Record<string, unknown>;
    const evidence = (
      reordered["extracted_evidence"] as Array<Record<string, unknown>>
    )[0]!;
    evidence["affected_ncm"] = [
      ...(evidence["affected_ncm"] as string[]),
    ].reverse();
    assert.notEqual(artifactContentHash(first), artifactContentHash(reordered));

    const mutated = structuredClone(first) as Record<string, unknown>;
    (mutated["classification_candidate"] as Record<string, unknown>)[
      "description"
    ] = "Substituted content";
    assert.notEqual(artifactContentHash(first), artifactContentHash(mutated));
  });

  it("excludes only review-generated metadata and downstream governance flags", () => {
    const original = draft();
    const withReviewMetadata = reviewed();
    assert.equal(
      artifactContentHash(original),
      artifactContentHash(withReviewMetadata),
    );
    assert.deepEqual(
      Object.keys(toReviewableArtifact(withReviewMetadata)).sort(),
      Object.keys(toReviewableArtifact(original)).sort(),
    );
  });

  it("rejects unsupported JSON values, cycles, exotic objects, and unsupported canonicalization versions", () => {
    for (const value of [
      undefined,
      1n,
      Symbol("x"),
      () => undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      new Date(),
      new Map(),
      new Set(),
    ]) {
      assert.throws(() => canonicalizeReviewJson(value));
    }
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;
    assert.throws(() => canonicalizeReviewJson(cyclic));
    expectReason(
      () => canonicalizeReviewJson({}, "future-v2"),
      "review_canonicalization_unsupported",
    );
  });
});

describe("review binding enforcement", () => {
  it("accepts a valid approved binding and blocks a valid rejected decision", () => {
    assert.equal(
      assertValidReviewBinding(reviewed()).review_decision,
      "approved",
    );
    assert.equal(
      validateReviewBindingIntegrity(reviewed("rejected")).review_decision,
      "rejected",
    );
    expectReason(
      () => assertValidReviewBinding(reviewed("rejected")),
      "review_rejected",
    );
  });

  it("rejects identity, schema, policy, decision, timestamp, and binding substitutions", () => {
    const scenarios: Array<
      [ReviewBindingReasonCode, (artifact: ReturnType<typeof reviewed>) => void]
    > = [
      [
        "artifact_id_mismatch",
        (artifact) => {
          artifact.artifact_id = "artifact--infoleg--review-002";
        },
      ],
      [
        "artifact_schema_version_mismatch",
        (artifact) => {
          artifact.schema_version = "2.0.0";
        },
      ],
      [
        "review_policy_mismatch",
        (artifact) => {
          artifact.review_binding["review_policy_version"] = "2.0.0";
        },
      ],
      [
        "review_decision_mismatch",
        (artifact) => {
          artifact.review_status = "reviewed_rejected";
        },
      ],
      [
        "review_timestamp_mismatch",
        (artifact) => {
          artifact.reviewed_at = "2026-07-13T12:01:00.000Z";
        },
      ],
      [
        "review_binding_hash_mismatch",
        (artifact) => {
          artifact.review_binding["review_binding_hash"] =
            `sha256:${"f".repeat(64)}`;
        },
      ],
    ];
    for (const [reason, mutate] of scenarios) {
      const artifact = structuredClone(reviewed());
      mutate(artifact);
      expectReason(() => validateReviewBindingIntegrity(artifact), reason);
    }
  });

  it("rejects copied approval metadata and post-review artifact mutation", () => {
    const approved = reviewed();
    const copied = reviewed("approved", {
      artifact_id: "artifact--infoleg--review-002",
    });
    copied.review_binding = approved.review_binding;
    expectReason(
      () => assertValidReviewBinding(copied),
      "artifact_id_mismatch",
    );

    const mutated = structuredClone(approved);
    (mutated.classification_candidate as Record<string, unknown>)[
      "confidence"
    ] = 0.81;
    expectReason(
      () => assertValidReviewBinding(mutated),
      "artifact_content_hash_mismatch",
    );
  });

  it("fails closed for missing, malformed, unsupported, unknown-field, and historical bindings", () => {
    const missing = draft({ review_status: "draft" });
    expectReason(
      () => assertValidReviewBinding(missing),
      "review_binding_missing",
    );

    const historical = reviewed();
    delete (historical as Record<string, unknown>)["review_binding"];
    expectReason(
      () => assertValidReviewBinding(historical),
      "review_revalidation_required",
    );

    const malformed = reviewed();
    delete malformed.review_binding["artifact_content_hash"];
    expectReason(
      () => assertValidReviewBinding(malformed),
      "review_binding_malformed",
    );

    const unknown = reviewed();
    (unknown.review_binding as unknown as Record<string, unknown>)["provider"] =
      "forbidden";
    expectReason(
      () => assertValidReviewBinding(unknown),
      "review_binding_malformed",
    );

    const unsupportedCanonicalization = reviewed();
    unsupportedCanonicalization.review_binding["canonicalization_version"] =
      "future-v2";
    expectReason(
      () => assertValidReviewBinding(unsupportedCanonicalization),
      "review_canonicalization_unsupported",
    );

    const unsupportedBinding = reviewed();
    unsupportedBinding.review_binding["binding_schema_version"] = "2.0.0";
    expectReason(
      () => assertValidReviewBinding(unsupportedBinding),
      "review_binding_version_unsupported",
    );
  });

  it("enforces policy freshness when the policy defines it", () => {
    expectReason(
      () =>
        assertValidReviewBinding(
          reviewed(),
          {
            policy_id: "classifier-human-review",
            policy_version: "1.0.0",
            maximum_review_age_seconds: 60,
          },
          new Date("2026-07-13T12:02:00.000Z"),
        ),
      "review_stale",
    );
  });
});

describe("review binding schema fixtures", () => {
  it("accepts the registered valid fixture and rejects all closed-schema leakage fixtures", () => {
    const schema = JSON.parse(
      readFileSync("schemas/review-artifact-binding.schema.json", "utf8"),
    ) as object;
    const ajv = new Ajv({ allErrors: true, strict: true });
    const applyFormats = ((
      addFormats as unknown as { default?: (instance: Ajv) => void }
    ).default ?? addFormats) as unknown as (instance: Ajv) => void;
    applyFormats(ajv);
    const validate = ajv.compile(schema);
    assert.equal(
      validate(
        JSON.parse(
          readFileSync("snapshots/review/valid-review-binding.json", "utf8"),
        ),
      ),
      true,
      JSON.stringify(validate.errors),
    );
    const reviewedFixture = JSON.parse(
      readFileSync(
        "snapshots/review/valid-reviewed-artifact-bound.json",
        "utf8",
      ),
    ) as Record<string, unknown>;
    assert.equal(
      assertValidReviewBinding(reviewedFixture).review_decision,
      "approved",
    );
    for (const name of [
      "missing-content-hash",
      "malformed-hash",
      "unknown-field",
      "reviewer-leakage",
      "provider-leakage",
      "prompt-leakage",
    ]) {
      const fixture = JSON.parse(
        readFileSync(
          `snapshots/review/invalid-review-binding-${name}.json`,
          "utf8",
        ),
      ) as unknown;
      assert.equal(validate(fixture), false, name);
    }
  });

  it("records the deterministic runtime-invalid readiness matrix", () => {
    const matrix = JSON.parse(
      readFileSync(
        "snapshots/review/review-binding-runtime-invalid-scenarios.json",
        "utf8",
      ),
    ) as {
      schema_version: string;
      scenarios: Array<{ scenario_id: string; expected_reason_code: string }>;
    };
    assert.equal(matrix.schema_version, "1.0.0");
    assert.deepEqual(
      matrix.scenarios.map((scenario) => scenario.scenario_id),
      [
        "unsupported_canonicalization_version",
        "artifact_id_substitution",
        "artifact_schema_substitution",
        "review_policy_substitution",
        "decision_substitution",
        "binding_hash_substitution",
        "copied_approval",
        "post_review_artifact_mutation",
        "historical_unbound_review",
      ],
    );
  });
});

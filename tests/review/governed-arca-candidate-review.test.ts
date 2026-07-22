import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { Ajv2020 as Ajv } from "ajv/dist/2020.js";

import type { GovernedArcaCandidateArtifact } from "../../src/ingestion/governed-arca-acquired-source.js";
import {
  ARCA_CANDIDATE_REVIEW_CONTRACT_VERSION,
  GOVERNED_ARCA_CANDIDATE_REVIEW_EVALUATION_SCHEMA,
  GOVERNED_ARCA_CANDIDATE_REVIEW_SCHEMA,
  computeGovernedArcaReviewSha256,
  createArcaCandidateBinding,
  evaluateGovernedArcaCandidateReview,
  sealGovernedArcaCandidateReview,
  type ArcaReviewReasonCode,
  type GovernedArcaCandidateReview,
} from "../../src/review/governed-arca-candidate-review.js";
import { REVIEW_CANONICALIZATION_VERSION } from "../../src/review/review-artifact-binding.js";
import { ARCA_NOMENCLADOR_PARSER_CONFIGURATION_HASH } from "../../src/parsers/arca-nomenclador.js";

const AT = "2026-07-22T15:00:00.000Z";
const FUTURE = "2026-07-29T15:00:00.000Z";
const DECIDED = "2026-07-22T14:00:00.000Z";

function plainSha(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function candidate(): GovernedArcaCandidateArtifact {
  const parsedOutput = {
    tariff_lines_count: 1,
    tariff_lines: [
      {
        ncm_code: "4202.92.00",
        ncm_code_clean: "42029200",
        hs6_code: "4202.92",
        description: "BOLSOS DE VIAJE",
        aec_rate: 10,
        derecho_extra_zona: 20,
        tasa_estadistica: 3,
        iva_rate: 21,
        iva_is_inferred: true,
        unidad_estadistica: "UN",
        source: "ARCA Arancel Integrado" as const,
        source_url:
          "https://www.arca.gob.ar/aduana/arancelintegrado/nomenclador.txt",
        snapshot_date: "2026-07-22",
      },
    ],
  };
  return {
    schema_version: "1.0.0",
    artifact_type: "arca_acquired_source_parse_candidate",
    acquisition_artifact: {
      acquisition_id: "ar-arca-arancel-integrado--2026-07-22--aaaaaaaaaaaaaaaa",
      acquisition_record_sha256: "b".repeat(64),
      source_id: "ar-arca-arancel-integrado",
      requested_url:
        "https://www.arca.gob.ar/aduana/arancelintegrado/nomenclador.txt",
      effective_url:
        "https://www.arca.gob.ar/aduana/arancelintegrado/nomenclador.txt",
      captured_at: "2026-07-22T12:00:00.000Z",
      media_type: "text/plain",
      raw_sha256: "a".repeat(64),
    },
    parser: {
      parser_id: "arca-nomenclador-txt",
      parser_version: "1.0.0",
      configuration_sha256: ARCA_NOMENCLADOR_PARSER_CONFIGURATION_HASH,
    },
    parsing_timestamp: "2026-07-22T12:05:00.000Z",
    parsed_output_sha256: plainSha(parsedOutput),
    validation_status: "valid",
    review_state: "human_review_required",
    approval_status: "not_approved",
    publication_status: "not_publishable",
    parsed_output: parsedOutput,
  };
}

function review(
  lifecycle: GovernedArcaCandidateReview["lifecycle"] = "pending",
  overrides: Partial<
    Omit<GovernedArcaCandidateReview, "review_id" | "review_sha256">
  > = {},
): GovernedArcaCandidateReview {
  const decided = lifecycle !== "pending";
  const reviewer = decided
    ? {
        identity: "human:synthetic-evidence-reviewer",
        identity_type: "human" as const,
        role: "evidence_reviewer" as const,
      }
    : null;
  return sealGovernedArcaCandidateReview({
    schema_version: ARCA_CANDIDATE_REVIEW_CONTRACT_VERSION,
    artifact_type: "governed_arca_candidate_human_review",
    canonicalization_version: REVIEW_CANONICALIZATION_VERSION,
    candidate_binding: createArcaCandidateBinding(candidate()),
    lifecycle,
    lifecycle_transition: {
      from:
        lifecycle === "pending"
          ? null
          : lifecycle === "superseded"
            ? "approved"
            : "pending",
      to: lifecycle,
    },
    scope: "approved_artifact_building_only",
    reviewer,
    decision_timestamp: decided ? DECIDED : null,
    expires_at:
      lifecycle === "pending" || lifecycle === "approved" ? FUTURE : null,
    review_statement:
      lifecycle === "approved"
        ? "Synthetic evidence confirms candidate integrity and reviewed scope."
        : null,
    rejection_reason:
      lifecycle === "rejected"
        ? "Synthetic evidence found a blocking provenance issue."
        : null,
    reason_codes: [],
    findings: [],
    separation_of_duties: {
      acquisition_operator_identity: "human:synthetic-acquisition-operator",
      parser_runtime_identity: "runtime:arca-nomenclador-txt@1.0.0",
      candidate_producer_identity: "human:synthetic-candidate-producer",
      evidence_reviewer_identity: reviewer?.identity ?? null,
      future_artifact_builder_identity: null,
      future_publisher_export_approver_identity: null,
      reviewer_independence_asserted: decided,
    },
    superseded_by:
      lifecycle === "superseded"
        ? {
            review_id: `arca-review--${"c".repeat(64)}`,
            review_sha256: "c".repeat(64),
          }
        : null,
    ...overrides,
  });
}

function outcome(
  reviewValue: unknown,
  candidateValue: unknown = candidate(),
  evaluatedAt = AT,
) {
  return evaluateGovernedArcaCandidateReview(
    candidateValue,
    reviewValue,
    evaluatedAt,
  );
}

function reseal(
  value: GovernedArcaCandidateReview,
): GovernedArcaCandidateReview {
  const clone = structuredClone(value) as unknown as Record<string, unknown>;
  delete clone["review_id"];
  delete clone["review_sha256"];
  return sealGovernedArcaCandidateReview(
    clone as unknown as Omit<
      GovernedArcaCandidateReview,
      "review_id" | "review_sha256"
    >,
  );
}

function assertReason(
  result: ReturnType<typeof outcome>,
  expectedOutcome: ReturnType<typeof outcome>["outcome"],
  reason: ArcaReviewReasonCode,
): void {
  assert.equal(result.outcome, expectedOutcome);
  assert.ok(
    result.reason_codes.includes(reason),
    result.reason_codes.join(","),
  );
  assert.equal(result.export_authorized, false);
  assert.equal(result.publication_authorized, false);
  assert.equal(result.approved_artifact_created, false);
  assert.equal(result.execution_performed, false);
}

test("valid pending review fails closed without a fabricated reviewer", () => {
  const result = outcome(review());
  assertReason(result, "pending_human_review", "review_pending");
  assert.equal(result.eligible_for_approved_artifact_building, false);
});

test("repository fixture is a synthetic pending state without fabricated approval", async () => {
  const fixture = JSON.parse(
    await readFile("data/fixtures/arca/ai-127-pending-review.json", "utf8"),
  ) as Record<string, unknown>;
  assert.equal(fixture["synthetic_candidate"], true);
  assert.equal(fixture["real_human_review_performed"], false);
  const storedReview = fixture["review"] as GovernedArcaCandidateReview;
  assert.equal(storedReview.lifecycle, "pending");
  assert.equal(storedReview.reviewer, null);
  assert.equal(storedReview.decision_timestamp, null);
  const result = outcome(storedReview, fixture["candidate"]);
  assertReason(result, "pending_human_review", "review_pending");
});

test("synthetic valid approval grants only later-builder eligibility", () => {
  const result = outcome(review("approved"));
  assertReason(
    result,
    "eligible_for_approved_artifact_building",
    "review_approved_for_later_builder_only",
  );
  assert.equal(result.eligible_for_approved_artifact_building, true);
  assert.equal(result.network_call_authorized, false);
  assert.equal(result.database_write_authorized, false);
  assert.equal(result.scheduler_authorized, false);
  assert.equal(result.vlatam_global_access_authorized, false);
});

test("rejection, expiry, and supersession fail closed in precedence order", () => {
  assertReason(outcome(review("rejected")), "rejected", "review_rejected");
  assertReason(outcome(review("expired")), "expired", "review_expired");
  assertReason(
    outcome(review("approved"), candidate(), FUTURE),
    "expired",
    "review_expired",
  );
  assertReason(
    outcome(review("superseded")),
    "superseded",
    "review_superseded",
  );
});

test("unknown lifecycle and unknown fields are rejected", () => {
  const unknownLifecycle = structuredClone(review()) as unknown as Record<
    string,
    unknown
  >;
  unknownLifecycle["lifecycle"] = "skipped";
  assertReason(
    outcome(unknownLifecycle),
    "invalid_review",
    "review_schema_invalid",
  );
  const unknownField = structuredClone(review()) as unknown as Record<
    string,
    unknown
  >;
  unknownField["approval_button"] = true;
  assertReason(
    outcome(unknownField),
    "invalid_review",
    "review_schema_invalid",
  );
});

test("skipped or inconsistent lifecycle transitions are invalid", () => {
  const skipped = structuredClone(review("approved"));
  (skipped.lifecycle_transition as unknown as Record<string, unknown>)["from"] =
    null;
  assertReason(
    outcome(reseal(skipped)),
    "invalid_review",
    "lifecycle_transition_invalid",
  );
});

test("malformed and automated reviewer identities are invalid", () => {
  for (const identity of ["", "   "]) {
    const malformed = structuredClone(review("approved")) as unknown as Record<
      string,
      unknown
    >;
    (malformed["reviewer"] as Record<string, unknown>)["identity"] = identity;
    assertReason(outcome(malformed), "invalid_review", "review_schema_invalid");
  }
  const automated = structuredClone(review("approved")) as unknown as Record<
    string,
    unknown
  >;
  (automated["reviewer"] as Record<string, unknown>)["identity_type"] =
    "automated";
  assertReason(outcome(automated), "invalid_review", "review_schema_invalid");

  const disguisedAutomation = structuredClone(review("approved"));
  (disguisedAutomation.reviewer as unknown as Record<string, unknown>)[
    "identity"
  ] = "runtime:auto-reviewer";
  (
    disguisedAutomation.separation_of_duties as unknown as Record<
      string,
      unknown
    >
  )["evidence_reviewer_identity"] = "runtime:auto-reviewer";
  assertReason(
    outcome(reseal(disguisedAutomation)),
    "invalid_review",
    "reviewer_not_human",
  );
});

test("reviewer cannot be candidate producer or parser runtime", () => {
  for (const field of [
    "acquisition_operator_identity",
    "candidate_producer_identity",
    "parser_runtime_identity",
  ] as const) {
    const conflicted = structuredClone(review("approved"));
    (conflicted.separation_of_duties as unknown as Record<string, unknown>)[
      field
    ] = conflicted.reviewer!.identity;
    const result = outcome(reseal(conflicted));
    assert.equal(result.outcome, "invalid_review");
    assert.ok(
      result.reason_codes.includes(
        field === "acquisition_operator_identity"
          ? "reviewer_acquisition_operator_conflict"
          : field === "candidate_producer_identity"
            ? "reviewer_candidate_producer_conflict"
            : "reviewer_parser_runtime_conflict",
      ),
    );
  }
});

test("decided reviews require explicit acquisition operator and candidate producer", () => {
  for (const [field, reason] of [
    ["acquisition_operator_identity", "acquisition_operator_identity_missing"],
    ["candidate_producer_identity", "candidate_producer_identity_missing"],
  ] as const) {
    const incomplete = structuredClone(review("approved"));
    (incomplete.separation_of_duties as unknown as Record<string, unknown>)[
      field
    ] = null;
    assertReason(outcome(reseal(incomplete)), "invalid_review", reason);
  }
});

test("parser runtime role identity is bound to the reviewed parser", () => {
  const mismatched = structuredClone(review("approved"));
  (mismatched.separation_of_duties as unknown as Record<string, unknown>)[
    "parser_runtime_identity"
  ] = "runtime:different-parser@1.0.0";
  assertReason(
    outcome(reseal(mismatched)),
    "candidate_binding_mismatch",
    "parser_runtime_identity_mismatch",
  );
});

test("candidate path provenance must remain repository-relative metadata", () => {
  const absolutePath = structuredClone(review("approved"));
  (absolutePath.candidate_binding as unknown as Record<string, unknown>)[
    "repository_relative_candidate_path"
  ] = "/tmp/candidate.json";
  assertReason(
    outcome(reseal(absolutePath)),
    "candidate_binding_mismatch",
    "candidate_provenance_path_invalid",
  );
});

test("approval statement, rejection reason, and required expiry fail closed", () => {
  const cases: Array<[GovernedArcaCandidateReview, ArcaReviewReasonCode]> = [
    [
      review("approved", { review_statement: null }),
      "approval_statement_missing",
    ],
    [
      review("rejected", { rejection_reason: null }),
      "rejection_reason_missing",
    ],
    [review("approved", { expires_at: null }), "review_expiry_missing"],
    [review("pending", { expires_at: null }), "review_expiry_missing"],
  ];
  for (const [value, reason] of cases)
    assertReason(outcome(value), "invalid_review", reason);
});

test("every load-bearing candidate binding mutation is detected", () => {
  const mutations: Array<
    [
      keyof GovernedArcaCandidateReview["candidate_binding"],
      unknown,
      ArcaReviewReasonCode,
    ]
  > = [
    ["candidate_schema_version", "2.0.0", "candidate_schema_version_mismatch"],
    [
      "candidate_artifact_type",
      "other_candidate",
      "candidate_artifact_type_mismatch",
    ],
    [
      "candidate_artifact_id",
      `arca-candidate--${"d".repeat(64)}`,
      "candidate_artifact_id_mismatch",
    ],
    ["candidate_sha256", "d".repeat(64), "candidate_sha256_mismatch"],
    ["acquisition_id", "different-acquisition", "acquisition_id_mismatch"],
    [
      "acquisition_record_sha256",
      "d".repeat(64),
      "acquisition_record_sha256_mismatch",
    ],
    ["raw_byte_sha256", "d".repeat(64), "raw_byte_sha256_mismatch"],
    ["parser_id", "different-parser", "parser_id_mismatch"],
    ["parser_version", "2.0.0", "parser_version_mismatch"],
    [
      "parser_configuration_sha256",
      "d".repeat(64),
      "parser_configuration_sha256_mismatch",
    ],
    [
      "parsing_timestamp",
      "2026-07-22T12:06:00.000Z",
      "parsing_timestamp_mismatch",
    ],
    ["parsed_output_sha256", "d".repeat(64), "parsed_output_sha256_mismatch"],
    ["tariff_line_count", 2, "tariff_line_count_mismatch"],
  ];
  for (const [field, value, reason] of mutations) {
    const mutated = structuredClone(review("approved"));
    (mutated.candidate_binding as unknown as Record<string, unknown>)[field] =
      value;
    assertReason(
      outcome(reseal(mutated)),
      "candidate_binding_mismatch",
      reason,
    );
  }
});

test("candidate fixed-state mutation and candidate schema failure are invalid candidates", () => {
  const fixedState = structuredClone(candidate()) as unknown as Record<
    string,
    unknown
  >;
  fixedState["publication_status"] = "publishable";
  assertReason(
    outcome(review(), fixedState),
    "invalid_candidate",
    "candidate_schema_invalid",
  );
  assertReason(
    outcome(review(), {}),
    "invalid_candidate",
    "candidate_schema_invalid",
  );
});

test("unresolved blocker and high findings prohibit approval", () => {
  for (const severity of ["blocker", "high"] as const) {
    const result = outcome(
      review("approved", {
        findings: [
          {
            severity,
            category: "parser_output",
            finding_code: `${severity}.synthetic`,
            description: "Synthetic unresolved finding.",
            resolution_status: "open",
          },
        ],
      }),
    );
    assertReason(result, "invalid_review", "unresolved_blocking_finding");
    assert.equal(result.unresolved_findings_count, 1);
  }
});

test("canonical review hash binds every review field and ignores key order", () => {
  const approved = review("approved");
  assert.equal(
    computeGovernedArcaReviewSha256(approved),
    approved.review_sha256,
  );
  const reordered = Object.fromEntries(
    Object.entries(approved).reverse(),
  ) as unknown as GovernedArcaCandidateReview;
  assert.equal(
    computeGovernedArcaReviewSha256(reordered),
    approved.review_sha256,
  );
  const mutated = structuredClone(approved);
  (mutated as unknown as Record<string, unknown>)["review_statement"] =
    "Mutated after the review binding was sealed.";
  assertReason(outcome(mutated), "invalid_review", "review_hash_invalid");
});

test("published closed schemas compile, match source constants, and validate results", async () => {
  const reviewSchema = JSON.parse(
    await readFile(
      "schemas/governed-arca-candidate-review.schema.json",
      "utf8",
    ),
  ) as object;
  const evaluationSchema = JSON.parse(
    await readFile(
      "schemas/governed-arca-candidate-review-evaluation.schema.json",
      "utf8",
    ),
  ) as object;
  assert.deepEqual(reviewSchema, GOVERNED_ARCA_CANDIDATE_REVIEW_SCHEMA);
  assert.deepEqual(
    evaluationSchema,
    GOVERNED_ARCA_CANDIDATE_REVIEW_EVALUATION_SCHEMA,
  );
  const ajv = new Ajv({ allErrors: true, strict: true });
  assert.equal(ajv.compile(reviewSchema)(review()), true);
  assert.equal(ajv.compile(evaluationSchema)(outcome(review())), true);
});

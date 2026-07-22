import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Ajv2020 as Ajv } from "ajv/dist/2020.js";

import {
  APPROVED_ARCA_ARTIFACT_SCHEMA,
  APPROVED_ARCA_BUILD_RESULT_SCHEMA,
  APPROVED_ARCA_BUILDER_CONFIGURATION_SHA256,
  APPROVED_ARCA_SERVICE_BUILDER_IDENTITY,
  buildApprovedArcaArtifact,
  computeApprovedArcaArtifactSha256,
  prepareApprovedArcaArtifact,
  validateApprovedArcaArtifact,
  type ApprovedArcaArtifact,
  type ApprovedArcaBuilderInput,
} from "../../src/artifacts/approved-arca-artifact-builder.js";
import type { GovernedArcaCandidateArtifact } from "../../src/ingestion/governed-arca-acquired-source.js";
import { ARCA_NOMENCLADOR_PARSER_CONFIGURATION_HASH } from "../../src/parsers/arca-nomenclador.js";
import { parseArguments } from "../../src/cli/approved-arca-artifact-builder.js";
import {
  ARCA_CANDIDATE_REVIEW_CONTRACT_VERSION,
  createArcaCandidateBinding,
  evaluateGovernedArcaCandidateReview,
  sealGovernedArcaCandidateReview,
  sealGovernedArcaCandidateReviewEvaluation,
  type GovernedArcaCandidateReview,
  type GovernedArcaCandidateReviewEvaluation,
} from "../../src/review/governed-arca-candidate-review.js";
import { REVIEW_CANONICALIZATION_VERSION } from "../../src/review/review-artifact-binding.js";

const PARSED = "2026-07-22T12:05:00.000Z";
const DECIDED = "2026-07-22T13:00:00.000Z";
const EVALUATED = "2026-07-22T14:00:00.000Z";
const BUILT = "2026-07-22T15:00:00.000Z";
const EXPIRES = "2026-07-22T18:00:00.000Z";
const BUILDER = "human:synthetic-independent-builder";
type MutableBuilderInput = {
  -readonly [Key in keyof ApprovedArcaBuilderInput]: ApprovedArcaBuilderInput[Key];
};

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
        description: "SYNTHETIC TRAVEL BAGS",
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
    parsing_timestamp: PARSED,
    parsed_output_sha256: plainSha(parsedOutput),
    validation_status: "valid",
    review_state: "human_review_required",
    approval_status: "not_approved",
    publication_status: "not_publishable",
    parsed_output: parsedOutput,
  };
}

function review(
  lifecycle: GovernedArcaCandidateReview["lifecycle"] = "approved",
  candidateValue = candidate(),
): GovernedArcaCandidateReview {
  const decided = lifecycle !== "pending";
  const reviewer = decided
    ? {
        identity: "human:synthetic-independent-reviewer",
        identity_type: "human" as const,
        role: "evidence_reviewer" as const,
      }
    : null;
  return sealGovernedArcaCandidateReview({
    schema_version: ARCA_CANDIDATE_REVIEW_CONTRACT_VERSION,
    artifact_type: "governed_arca_candidate_human_review",
    canonicalization_version: REVIEW_CANONICALIZATION_VERSION,
    candidate_binding: createArcaCandidateBinding(candidateValue),
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
      lifecycle === "approved" || lifecycle === "pending" ? EXPIRES : null,
    review_statement: lifecycle === "approved" ? "Synthetic approval." : null,
    rejection_reason: lifecycle === "rejected" ? "Synthetic rejection." : null,
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
  });
}

function resealReview(
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

function evaluation(
  candidateValue: unknown,
  reviewValue: unknown,
  evaluatedAt = EVALUATED,
): GovernedArcaCandidateReviewEvaluation {
  return evaluateGovernedArcaCandidateReview(
    candidateValue,
    reviewValue,
    evaluatedAt,
  );
}

function validInput(): MutableBuilderInput {
  const candidateValue = candidate();
  const reviewValue = review("approved", candidateValue);
  return {
    candidate: candidateValue,
    review: reviewValue,
    evaluation: evaluation(candidateValue, reviewValue),
    builderIdentity: BUILDER,
    buildTimestamp: BUILT,
  };
}

async function freshRoot(label: string): Promise<string> {
  const parent = await mkdtemp(
    join(await realpath(tmpdir()), `ai-128-${label}-`),
  );
  return join(parent, "approved");
}

async function build(
  input: ApprovedArcaBuilderInput = validInput(),
  root?: string,
) {
  return buildApprovedArcaArtifact(input, {
    approvedArtifactRoot: root ?? (await freshRoot("build")),
  });
}

test("synthetic valid set creates one immutable local Approved ARCA Artifact", async () => {
  const root = await freshRoot("positive");
  const prepared = prepareApprovedArcaArtifact(validInput());
  assert.ok("artifact" in prepared, JSON.stringify(prepared));
  assert.deepEqual(validateApprovedArcaArtifact(prepared.artifact), {
    valid: true,
    errors: [],
  });
  const buildResult = await build(validInput(), root);
  assert.equal(buildResult.outcome, "approved_artifact_built");
  assert.equal(buildResult.approved_artifact_created, true);
  for (const field of [
    "export_authorized",
    "publication_authorized",
    "production_reliance_authorized",
    "database_write_authorized",
    "network_call_authorized",
    "scheduler_authorized",
    "deployment_authorized",
    "vlatam_global_access_authorized",
  ] as const)
    assert.equal(buildResult[field], false);

  const files = await readdir(root);
  assert.equal(files.length, 1);
  const artifact = JSON.parse(
    await readFile(join(root, files[0]!), "utf8"),
  ) as ApprovedArcaArtifact;
  assert.equal(validateApprovedArcaArtifact(artifact).valid, true);
  assert.deepEqual(
    artifact.approved_payload,
    (validInput().candidate as GovernedArcaCandidateArtifact).parsed_output,
  );
  assert.equal(
    artifact.builder_configuration_sha256,
    APPROVED_ARCA_BUILDER_CONFIGURATION_SHA256,
  );
  assert.equal(artifact.export_status, "not_exported");
  assert.equal(artifact.publication_status, "not_published");
  assert.equal(artifact.production_reliance, "not_authorized");
  assert.equal(artifact.vlatam_global_consumption, "not_authorized");
});

test("closed schemas compile and reject unknown fields", async () => {
  const ajv = new Ajv({ allErrors: true, strict: true });
  assert.deepEqual(
    JSON.parse(
      await readFile("schemas/approved-arca-artifact.schema.json", "utf8"),
    ),
    APPROVED_ARCA_ARTIFACT_SCHEMA,
  );
  assert.deepEqual(
    JSON.parse(
      await readFile(
        "schemas/approved-arca-artifact-build-result.schema.json",
        "utf8",
      ),
    ),
    APPROVED_ARCA_BUILD_RESULT_SCHEMA,
  );
  const validateArtifact = ajv.compile(APPROVED_ARCA_ARTIFACT_SCHEMA);
  const validateResult = ajv.compile(APPROVED_ARCA_BUILD_RESULT_SCHEMA);
  const root = await freshRoot("schemas");
  const buildResult = await build(validInput(), root);
  assert.equal(
    validateResult(buildResult),
    true,
    JSON.stringify(validateResult.errors),
  );
  const file = (await readdir(root))[0]!;
  const artifact = JSON.parse(
    await readFile(join(root, file), "utf8"),
  ) as Record<string, unknown>;
  assert.equal(
    validateArtifact(artifact),
    true,
    JSON.stringify(validateArtifact.errors),
  );
  artifact["unknown_authority"] = true;
  assert.equal(validateArtifact(artifact), false);
});

test("pending, rejected, expired, and superseded reviews fail closed", async () => {
  for (const [lifecycle, expected] of [
    ["pending", "not_eligible"],
    ["rejected", "not_eligible"],
    ["expired", "review_expired"],
    ["superseded", "not_eligible"],
  ] as const) {
    const candidateValue = candidate();
    const reviewValue = review(lifecycle, candidateValue);
    const buildResult = await build({
      candidate: candidateValue,
      review: reviewValue,
      evaluation: evaluation(candidateValue, reviewValue),
      builderIdentity: BUILDER,
      buildTimestamp: BUILT,
    });
    assert.equal(buildResult.outcome, expected, lifecycle);
    assert.equal(buildResult.approved_artifact_created, false);
  }
});

test("invalid candidate, review, and evaluation use distinct outcomes", async () => {
  const invalidCandidate = { ...validInput(), candidate: {} };
  assert.equal((await build(invalidCandidate)).outcome, "invalid_candidate");

  const invalidReview = validInput();
  (invalidReview.review as unknown as Record<string, unknown>)["unknown"] =
    true;
  assert.equal((await build(invalidReview)).outcome, "invalid_review");

  const invalidEvaluation = validInput();
  (invalidEvaluation.evaluation as unknown as Record<string, unknown>)[
    "evaluation_sha256"
  ] = "0".repeat(64);
  assert.equal((await build(invalidEvaluation)).outcome, "invalid_evaluation");

  const unknownCandidate = validInput();
  (unknownCandidate.candidate as Record<string, unknown>)["unknown"] = true;
  assert.equal((await build(unknownCandidate)).outcome, "invalid_candidate");

  const unknownEvaluation = validInput();
  (unknownEvaluation.evaluation as Record<string, unknown>)["unknown"] = true;
  assert.equal((await build(unknownEvaluation)).outcome, "invalid_evaluation");
});

test("self-consistent but non-equivalent supplied evaluation is rejected", async () => {
  const input = validInput();
  const supplied = structuredClone(
    input.evaluation,
  ) as GovernedArcaCandidateReviewEvaluation;
  const unsealed = structuredClone(supplied) as unknown as Record<
    string,
    unknown
  >;
  delete unsealed["evaluation_id"];
  delete unsealed["evaluation_sha256"];
  unsealed["reason_codes"] = ["review_pending"];
  input.evaluation = sealGovernedArcaCandidateReviewEvaluation(
    unsealed as unknown as Omit<
      GovernedArcaCandidateReviewEvaluation,
      "evaluation_id" | "evaluation_sha256"
    >,
  );
  assert.equal((await build(input)).outcome, "evaluation_mismatch");
});

test("candidate, review, and evaluation hash mutations fail closed", async () => {
  const candidateMutation = validInput();
  const mutatedCandidate = structuredClone(
    candidateMutation.candidate,
  ) as GovernedArcaCandidateArtifact;
  mutatedCandidate.parsed_output.tariff_lines[0]!.description = "MUTATED";
  (mutatedCandidate as unknown as Record<string, unknown>)[
    "parsed_output_sha256"
  ] = plainSha(mutatedCandidate.parsed_output);
  candidateMutation.candidate = mutatedCandidate;
  assert.equal((await build(candidateMutation)).outcome, "evaluation_mismatch");

  const reviewMutation = validInput();
  (reviewMutation.review as unknown as Record<string, unknown>)[
    "review_sha256"
  ] = "0".repeat(64);
  assert.equal((await build(reviewMutation)).outcome, "invalid_review");

  const evaluationMutation = validInput();
  (evaluationMutation.evaluation as unknown as Record<string, unknown>)[
    "evaluation_id"
  ] = `arca-review-evaluation--${"0".repeat(64)}`;
  assert.equal((await build(evaluationMutation)).outcome, "invalid_evaluation");
});

test("review expiry is rechecked at build time", async () => {
  const input = validInput();
  input.buildTimestamp = EXPIRES;
  assert.equal((await build(input)).outcome, "review_expired");
});

test("build timestamp cannot precede parsing, decision, or evaluation", async () => {
  for (const timestamp of [
    "2026-07-22T12:04:59.999Z",
    "2026-07-22T12:59:59.999Z",
    "2026-07-22T13:59:59.999Z",
  ]) {
    const input = validInput();
    input.buildTimestamp = timestamp;
    assert.equal((await build(input)).outcome, "invalid_build_timestamp");
  }
  const malformed = validInput();
  malformed.buildTimestamp = "2026-07-22T15:00:00Z";
  assert.equal((await build(malformed)).outcome, "invalid_build_timestamp");
});

test("builder identity is closed and service version is exact", async () => {
  for (const identity of [
    "",
    "builder",
    "service:approved-arca-builder@2.0.0",
    "runtime:arca-nomenclador-txt@1.0.0",
  ]) {
    const input = validInput();
    input.builderIdentity = identity;
    assert.equal((await build(input)).outcome, "invalid_builder_identity");
  }
  const service = validInput();
  service.builderIdentity = APPROVED_ARCA_SERVICE_BUILDER_IDENTITY;
  assert.equal((await build(service)).outcome, "approved_artifact_built");
});

test("every prohibited prior or future role conflicts with the builder", async () => {
  for (const field of [
    "acquisition_operator_identity",
    "parser_runtime_identity",
    "candidate_producer_identity",
    "evidence_reviewer_identity",
    "future_artifact_builder_identity",
    "future_publisher_export_approver_identity",
  ] as const) {
    const input = validInput();
    const mutated = structuredClone(
      input.review,
    ) as GovernedArcaCandidateReview;
    (mutated.separation_of_duties as unknown as Record<string, unknown>)[
      field
    ] = BUILDER;
    if (field === "evidence_reviewer_identity") {
      (mutated.reviewer as unknown as Record<string, unknown>)["identity"] =
        BUILDER;
    }
    input.review = resealReview(mutated);
    assert.equal(
      (await build(input)).outcome,
      "separation_of_duties_violation",
      field,
    );
  }

  const inconsistentFutureAssignment = validInput();
  const mutated = structuredClone(
    inconsistentFutureAssignment.review,
  ) as GovernedArcaCandidateReview;
  (mutated.separation_of_duties as unknown as Record<string, unknown>)[
    "future_artifact_builder_identity"
  ] = "human:different-future-builder";
  inconsistentFutureAssignment.review = resealReview(mutated);
  assert.equal(
    (await build(inconsistentFutureAssignment)).outcome,
    "invalid_review",
  );
});

test("every load-bearing artifact value participates in its canonical hash", async () => {
  const root = await freshRoot("mutation");
  await build(validInput(), root);
  const file = (await readdir(root))[0]!;
  const artifact = JSON.parse(
    await readFile(join(root, file), "utf8"),
  ) as ApprovedArcaArtifact;
  const baseline = artifact.approved_artifact_sha256;
  const payload = structuredClone(artifact) as unknown as Record<
    string,
    unknown
  >;
  delete payload["approved_artifact_id"];
  delete payload["approved_artifact_sha256"];

  function walk(
    value: unknown,
    path: (string | number)[] = [],
  ): (string | number)[][] {
    if (Array.isArray(value))
      return value.flatMap((child, index) => walk(child, [...path, index]));
    if (value !== null && typeof value === "object")
      return Object.entries(value).flatMap(([key, child]) =>
        walk(child, [...path, key]),
      );
    return [path];
  }

  for (const path of walk(payload)) {
    const mutated = structuredClone(artifact) as unknown as Record<
      string,
      unknown
    >;
    let cursor: unknown = mutated;
    for (const part of path.slice(0, -1))
      cursor = (cursor as Record<string | number, unknown>)[part];
    const final = path.at(-1)!;
    const record = cursor as Record<string | number, unknown>;
    const original = record[final];
    record[final] =
      typeof original === "string"
        ? `${original}x`
        : typeof original === "number"
          ? original + 1
          : typeof original === "boolean"
            ? !original
            : "non-null-mutation";
    assert.notEqual(
      computeApprovedArcaArtifactSha256(
        mutated as unknown as ApprovedArcaArtifact,
      ),
      baseline,
      path.join("."),
    );
  }

  const payloadMutation = structuredClone(artifact) as ApprovedArcaArtifact;
  payloadMutation.approved_payload.tariff_lines[0]!.description = "DIFFERENT";
  assert.equal(validateApprovedArcaArtifact(payloadMutation).valid, false);
});

test("symbolic-link roots and non-directory roots fail without artifacts", async () => {
  const parent = await mkdtemp(join(await realpath(tmpdir()), "ai-128-roots-"));
  const real = join(parent, "real");
  await mkdir(real);
  const ancestorLink = join(parent, "ancestor-link");
  await symlink(real, ancestorLink);
  assert.equal(
    (await build(validInput(), join(ancestorLink, "approved"))).outcome,
    "approved_artifact_build_failed",
  );
  const finalLink = join(parent, "final-link");
  await symlink(real, finalLink);
  assert.equal(
    (await build(validInput(), finalLink)).outcome,
    "approved_artifact_build_failed",
  );
  const fileRoot = join(parent, "file-root");
  await writeFile(fileRoot, "not a directory");
  assert.equal(
    (await build(validInput(), fileRoot)).outcome,
    "approved_artifact_build_failed",
  );
  assert.deepEqual(await readdir(real), []);
});

test("collision never overwrites and staging files are cleaned", async () => {
  const root = await freshRoot("collision");
  const first = await build(validInput(), root);
  const file = (await readdir(root))[0]!;
  const before = await readFile(join(root, file), "utf8");
  const second = await build(validInput(), root);
  assert.equal(first.outcome, "approved_artifact_built");
  assert.equal(second.outcome, "approved_artifact_exists");
  assert.equal(await readFile(join(root, file), "utf8"), before);
  assert.equal(
    (await readdir(root)).some((name) => name.startsWith(".staging-")),
    false,
  );
});

test("pre-publication failures perform no filesystem write", async () => {
  const root = await freshRoot("no-write");
  const invalid = validInput();
  invalid.builderIdentity = "malformed";
  const buildResult = await build(invalid, root);
  assert.equal(buildResult.approved_artifact_created, false);
  await assert.rejects(lstat(root), { code: "ENOENT" });
});

test("CLI rejects URLs and every ungoverned flag", () => {
  const base = [
    "--candidate",
    "candidate.json",
    "--review",
    "review.json",
    "--evaluation",
    "evaluation.json",
    "--approved-artifact-root",
    "approved",
    "--builder-identity",
    BUILDER,
    "--build-timestamp",
    BUILT,
  ];
  assert.equal(parseArguments(base).builderIdentity, BUILDER);
  const withUrl = [...base];
  withUrl[1] = "https://example.invalid/candidate.json";
  assert.throws(() => parseArguments(withUrl), /URLs are not accepted/);
  for (const flag of [
    "--prompt",
    "--raw-file",
    "--credential",
    "--network",
    "--publish",
    "--export",
    "--production",
  ])
    assert.throws(() => parseArguments([...base, flag, "value"]));
});

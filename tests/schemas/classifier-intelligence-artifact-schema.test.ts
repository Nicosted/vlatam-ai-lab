import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { Ajv2020 as AjvClass } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { createReviewBinding } from "../../src/review/review-artifact-binding.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");
const schemaPath = resolve(
  repoRoot,
  "schemas",
  "classifier-intelligence-artifact.schema.json",
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const applyFormats = ((addFormatsModule as any).default ??
  addFormatsModule) as (ajv: AjvClass) => void;

function buildValidator() {
  const schema = JSON.parse(readFileSync(schemaPath, "utf-8")) as Record<
    string,
    unknown
  >;
  const ajv = new AjvClass({ allErrors: true, strict: true });
  applyFormats(ajv);
  return ajv.compile(schema);
}

function validArtifact() {
  return {
    artifact_id: "artifact--infoleg--extraction-001",
    extraction_result_id: "extraction-001",
    source_id: "infoleg",
    generated_at: "2026-06-16T00:00:00Z",
    classification_candidate: {
      ncm_code: "42029200110V",
      description: "NCM 4202.92.00.110V appears as a candidate.",
      confidence: 0.82,
      status: "candidate",
    },
    extracted_evidence: [
      {
        claim_id: "claim-001",
        claim_type: "classification",
        text: "NCM 4202.92.00.110V appears as a candidate.",
        source_ref: "data/evidence/infoleg/example.json#/claims/0",
        confidence: 0.82,
        affected_ncm: ["42029200110V"],
        requires_review: true,
      },
    ],
    governance: {
      human_review_required: true,
      downstream_allowed: false,
      review_only: true,
      not_final_classification: true,
    },
    schema_version: "1.0.0",
  };
}

describe("classifier-intelligence-artifact schema", () => {
  it("validates a representative artifact", () => {
    const validate = buildValidator();
    assert.equal(
      validate(validArtifact()),
      true,
      JSON.stringify(validate.errors, null, 2),
    );
  });

  it("fails when required fields are missing", () => {
    const validate = buildValidator();
    const artifact = validArtifact();
    delete (artifact as Partial<typeof artifact>).artifact_id;

    assert.equal(validate(artifact), false);
  });

  it("fails when governance flags are invalid", () => {
    const validate = buildValidator();
    const artifact = validArtifact();
    artifact.governance.downstream_allowed = true;

    assert.equal(validate(artifact), false);
  });

  it("fails when additional properties are present", () => {
    const validate = buildValidator();
    const artifact = {
      ...validArtifact(),
      classification: { status: "final" },
    };

    assert.equal(validate(artifact), false);
  });

  it("fails when claim_type is invalid", () => {
    const validate = buildValidator();
    const artifact = validArtifact();
    artifact.extracted_evidence[0]!.claim_type = "pricing";

    assert.equal(validate(artifact), false);
  });

  it("fails when requires_review is false", () => {
    const validate = buildValidator();
    const artifact = validArtifact();
    artifact.extracted_evidence[0]!.requires_review = false;

    assert.equal(validate(artifact), false);
  });

  it("rejects downstream_allowed=true without review fields", () => {
    const validate = buildValidator();
    const artifact = {
      artifact_id: "artifact--infoleg--extraction-001",
      extraction_result_id: "extraction-001",
      source_id: "infoleg",
      generated_at: "2026-06-16T00:00:00Z",
      extracted_evidence: [],
      governance: {
        human_review_required: false,
        downstream_allowed: true,
        review_only: false,
        not_final_classification: false,
      },
      schema_version: "1.0.0",
    };

    assert.equal(
      validate(artifact),
      false,
      "Should reject downstream without review fields",
    );
  });

  it("rejects synthetic_demo with downstream_allowed=true", () => {
    const validate = buildValidator();
    const artifact = {
      artifact_id: "artifact--veldoria--demo-001",
      extraction_result_id: "demo-001",
      source_id: "veldoria",
      generated_at: "2026-06-16T00:00:00Z",
      extracted_evidence: [],
      source_authority: "synthetic_demo",
      governance: {
        human_review_required: true,
        downstream_allowed: true,
        review_only: true,
        not_final_classification: true,
      },
      schema_version: "1.0.0",
    };

    assert.equal(
      validate(artifact),
      false,
      "Should reject synthetic_demo downstream",
    );
  });

  it("accepts reviewed_approved with all P1 fields", () => {
    const validate = buildValidator();
    const artifactWithoutBinding = {
      artifact_id: "artifact--infoleg--extraction-001",
      extraction_result_id: "extraction-001",
      source_id: "infoleg",
      generated_at: "2026-06-16T00:00:00Z",
      extracted_evidence: [
        {
          claim_id: "claim-001",
          claim_type: "classification",
          text: "NCM 42029200110V",
          requires_review: true,
        },
      ],
      review_status: "reviewed_approved",
      reviewer: "nicolas",
      reviewed_at: "2026-06-16T20:00:00Z",
      classifier_approval_reference: "approval-ref--001",
      downstream_eligibility_reason: "Verified against official regulation",
      source_authority: "official_regulation",
      governance: {
        human_review_required: false,
        downstream_allowed: true,
        review_only: false,
        not_final_classification: false,
      },
      schema_version: "1.0.0",
    };
    const artifact = {
      ...artifactWithoutBinding,
      review_binding: createReviewBinding(artifactWithoutBinding, {
        review_decision: "approved",
        reviewed_at: artifactWithoutBinding.reviewed_at,
        review_policy_id: "classifier-human-review",
        review_policy_version: "1.0.0",
      }),
    };

    assert.equal(
      validate(artifact),
      true,
      JSON.stringify(validate.errors, null, 2),
    );
  });

  it("accepts draft artifact without review fields", () => {
    const validate = buildValidator();
    const artifact = {
      artifact_id: "artifact--infoleg--extraction-001",
      extraction_result_id: "extraction-001",
      source_id: "infoleg",
      generated_at: "2026-06-16T00:00:00Z",
      extracted_evidence: [],
      governance: {
        human_review_required: true,
        downstream_allowed: false,
        review_only: true,
        not_final_classification: true,
      },
      schema_version: "1.0.0",
    };

    assert.equal(
      validate(artifact),
      true,
      JSON.stringify(validate.errors, null, 2),
    );
  });
});

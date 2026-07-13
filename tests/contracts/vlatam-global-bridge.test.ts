import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ALLOWED_CLAIM_TYPES,
  GOVERNANCE_FLAGS,
  getGovernanceFlags,
  isValidClaimType,
  validateExportArtifact,
} from "../../src/contracts/vlatam-global-bridge.js";

describe("vlatam-global bridge — claim type allowlist", () => {
  it("recognizes all allowlisted claim types", () => {
    assert.deepEqual(ALLOWED_CLAIM_TYPES, [
      "tariff",
      "intervention",
      "norm",
      "legal",
      "classification",
    ]);

    for (const claimType of ALLOWED_CLAIM_TYPES) {
      assert.equal(isValidClaimType(claimType), true);
    }
  });

  it("rejects unknown claim types", () => {
    assert.equal(isValidClaimType("pricing"), false);
    assert.equal(isValidClaimType("customs_hold"), false);
    assert.equal(isValidClaimType(""), false);
  });

  it("returns a boolean for valid and invalid inputs", () => {
    assert.equal(typeof isValidClaimType("tariff"), "boolean");
    assert.equal(typeof isValidClaimType("not-allowed"), "boolean");
  });
});

describe("vlatam-global bridge — governance flags", () => {
  it("exports the mandatory governance flag values", () => {
    assert.deepEqual(GOVERNANCE_FLAGS, {
      human_review_required: true,
      downstream_allowed: false,
      review_only: true,
      not_final_classification: true,
    });
  });

  it("returns the mandatory governance flags from getGovernanceFlags", () => {
    assert.deepEqual(getGovernanceFlags(), {
      human_review_required: true,
      downstream_allowed: false,
      review_only: true,
      not_final_classification: true,
    });
  });

  it("returns a defensive copy of the governance flags", () => {
    const flags = getGovernanceFlags() as Record<string, boolean>;
    flags.human_review_required = false;

    assert.equal(getGovernanceFlags().human_review_required, true);
  });
});

describe("vlatam-global bridge — export artifact unknown-field rejection", () => {
  function validExportArtifact(): Record<string, unknown> {
    return {
      export_id: "artifact--infoleg--extraction-001--export",
      artifact_id: "artifact--infoleg--extraction-001",
      source_id: "infoleg",
      exported_at: "2026-06-16T20:00:00Z",
      classification_candidate: { ncm_code: "42029200110V", confidence: 0.82 },
      extracted_evidence: [
        {
          claim_id: "claim-001",
          claim_type: "classification",
          text: "Classification evidence",
          confidence: 0.82,
          affected_ncm: ["42029200110V"],
        },
      ],
      schema_version: "1.0.0",
    };
  }

  it("accepts a fully allowlisted export artifact", () => {
    const result = validateExportArtifact(validExportArtifact());

    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });

  it("rejects reviewer metadata at the top level", () => {
    const result = validateExportArtifact({
      ...validExportArtifact(),
      reviewer: "internal-reviewer-1",
    });

    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((error) => error.includes("unknown field: reviewer")),
    );
  });

  it("rejects internal governance and provider metadata at the top level", () => {
    for (const forbidden of [
      "governance",
      "provider_id",
      "approved_at",
      "review_status",
    ]) {
      const result = validateExportArtifact({
        ...validExportArtifact(),
        [forbidden]: "leaked",
      });

      assert.equal(result.ok, false, `expected rejection for ${forbidden}`);
      assert.ok(
        result.errors.some((error) =>
          error.includes(`unknown field: ${forbidden}`),
        ),
      );
    }
  });

  it("rejects unknown fields inside classification_candidate", () => {
    const result = validateExportArtifact({
      ...validExportArtifact(),
      classification_candidate: {
        ncm_code: "42029200110V",
        status: "candidate",
      },
    });

    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((error) =>
        error.includes("classification_candidate has unknown field: status"),
      ),
    );
  });

  it("rejects unknown fields inside exported evidence claims", () => {
    const artifact = validExportArtifact();
    const claims = artifact["extracted_evidence"] as Record<string, unknown>[];
    claims[0]!["source_ref"] = "internal-snapshot-ref";

    const result = validateExportArtifact(artifact);

    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((error) =>
        error.includes("extracted_evidence[0] has unknown field: source_ref"),
      ),
    );
  });
});

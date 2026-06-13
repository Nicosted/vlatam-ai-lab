import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  evaluateArgentinaBackpackApprovalReadiness,
  type ArgentinaBackpackReadinessInputs,
  type JsonObject,
} from "../src/intelligence/argentina-backpack-approval-readiness.js";
import { readUtf8File } from "../src/lib/fs.js";

const fixturePaths = {
  evidencePacket:
    "snapshots/pcram/extractable-evidence-packet-ar-demo-polyester-school-backpack.json",
  extractionDraft:
    "snapshots/pcram/ai-extraction-result-ar-demo-polyester-school-backpack-draft.json",
  reviewManifest:
    "snapshots/pcram/review-manifest-ar-demo-polyester-school-backpack.json",
  classifierDraft:
    "snapshots/pcram/classifier-intelligence-artifact-ar-demo-polyester-school-backpack-draft.json",
  sourceSnapshots: [
    "snapshots/pcram/intelligence-source-snapshot-ar-customs-tariff-bounded-2026-06-13.json",
    "snapshots/pcram/intelligence-source-snapshot-mercosur-ncm-bounded-2026-06-13.json",
    "snapshots/pcram/intelligence-source-snapshot-wco-hs-bounded-2026-06-13.json",
  ],
};

async function readJsonFixture(relativePath: string): Promise<JsonObject> {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const content = await readUtf8File(absolutePath);

  return JSON.parse(content) as JsonObject;
}

async function readCurrentInputs(): Promise<ArgentinaBackpackReadinessInputs> {
  return {
    evidencePacket: await readJsonFixture(fixturePaths.evidencePacket),
    extractionDraft: await readJsonFixture(fixturePaths.extractionDraft),
    reviewManifest: await readJsonFixture(fixturePaths.reviewManifest),
    classifierDraft: await readJsonFixture(fixturePaths.classifierDraft),
    sourceSnapshots: await Promise.all(
      fixturePaths.sourceSnapshots.map((sourceSnapshotPath) =>
        readJsonFixture(sourceSnapshotPath),
      ),
    ),
  };
}

function reviewManifestMetadata(
  inputs: ArgentinaBackpackReadinessInputs,
): JsonObject {
  return inputs.reviewManifest["metadata"] as JsonObject;
}

function approvalReadinessReview(
  inputs: ArgentinaBackpackReadinessInputs,
): JsonObject {
  return reviewManifestMetadata(inputs)[
    "approval_readiness_review"
  ] as JsonObject;
}

function readinessFindings(
  inputs: ArgentinaBackpackReadinessInputs,
): JsonObject {
  return approvalReadinessReview(inputs)["findings"] as JsonObject;
}

function reviewedReadyInputs(
  currentInputs: ArgentinaBackpackReadinessInputs,
): ArgentinaBackpackReadinessInputs {
  const inputs = structuredClone(currentInputs);
  const evidenceRefs = inputs.reviewManifest["evidence_refs"] as string[];

  inputs.reviewManifest["review_status"] = "approved";
  reviewManifestMetadata(inputs)["missing_product_facts_to_confirm"] = [];
  reviewManifestMetadata(inputs)["approval_readiness_review"] = {
    status: "reviewed_approved",
    approved_for_approved_artifact: true,
    reviewer_role: "argentina-classifier-support-reviewer",
    reviewed_at: "2026-06-13T01:00:00.000Z",
    evidence_refs: evidenceRefs,
    findings: Object.fromEntries(
      [
        "exact_material_composition_percentages",
        "polyester_construction_status",
        "intended_school_backpack_use",
        "dimensions_and_capacity",
        "accessories_components_and_relevance",
        "country_of_origin_import_context",
        "invoice_catalog_spec_sheet_consistency",
        "adequate_source_references_for_narrow_support",
        "no_final_customs_or_legal_determination_language",
        "no_downstream_scope_beyond_reviewed_evidence",
      ].map((key) => [
        key,
        {
          status: "verified",
          evidence_refs: [evidenceRefs[0]],
          reviewer_note: `Reviewed evidence supports ${key}.`,
        },
      ]),
    ),
    source_reference_review: {
      argentina_customs_tariff_authority: {
        status: "reviewed_current",
        evidence_refs: [evidenceRefs[2]],
      },
      mercosur_ncm: {
        status: "reviewed_current",
        evidence_refs: [evidenceRefs[3]],
      },
      wco_hs: {
        status: "reviewed_current",
        evidence_refs: [evidenceRefs[4]],
      },
    },
  };

  for (const snapshot of inputs.sourceSnapshots) {
    snapshot["review_status"] = "approved";
    snapshot["freshness_status"] = "current";
    snapshot["human_review_required"] = false;
  }

  return inputs;
}

test("current Argentina backpack case is not approval-ready", async () => {
  const result = evaluateArgentinaBackpackApprovalReadiness(
    await readCurrentInputs(),
  );

  assert.equal(result.approvalReady, false);
  assert.ok(
    result.blockers.some((blocker) =>
      /approval_readiness_review is required/i.test(blocker),
    ),
  );
  assert.ok(
    result.blockers.some((blocker) =>
      /Exact material composition percentages remain missing/i.test(blocker),
    ),
  );
});

test("complete reviewed evidence can satisfy the readiness contract in memory", async () => {
  const inputs = reviewedReadyInputs(await readCurrentInputs());
  const result = evaluateArgentinaBackpackApprovalReadiness(inputs);

  assert.deepEqual(result, { approvalReady: true, blockers: [] });
});

test("missing composition blocks approval readiness", async () => {
  const inputs = reviewedReadyInputs(await readCurrentInputs());
  const findings = readinessFindings(inputs);
  const composition = findings[
    "exact_material_composition_percentages"
  ] as JsonObject;
  composition["status"] = "unknown";

  const result = evaluateArgentinaBackpackApprovalReadiness(inputs);

  assert.equal(result.approvalReady, false);
  assert.ok(
    result.blockers.some((blocker) =>
      /exact_material_composition_percentages must be verified/i.test(blocker),
    ),
  );
});

test("unknown coated or plastic layer status blocks approval readiness", async () => {
  const inputs = reviewedReadyInputs(await readCurrentInputs());
  const findings = readinessFindings(inputs);
  const construction = findings["polyester_construction_status"] as JsonObject;
  construction["status"] = "unknown";

  const result = evaluateArgentinaBackpackApprovalReadiness(inputs);

  assert.equal(result.approvalReady, false);
  assert.ok(
    result.blockers.some((blocker) =>
      /polyester_construction_status must be verified/i.test(blocker),
    ),
  );
});

test("stale or unreviewed source references block approval readiness", async () => {
  const inputs = reviewedReadyInputs(await readCurrentInputs());
  const [snapshot] = inputs.sourceSnapshots;
  assert.ok(snapshot);
  snapshot["freshness_status"] = "stale";
  snapshot["review_status"] = "not_reviewed";

  const result = evaluateArgentinaBackpackApprovalReadiness(inputs);

  assert.equal(result.approvalReady, false);
  assert.ok(
    result.blockers.some((blocker) =>
      /sourceSnapshots\[0\]\.review_status must be approved/i.test(blocker),
    ),
  );
  assert.ok(
    result.blockers.some((blocker) =>
      /sourceSnapshots\[0\]\.freshness_status must be current/i.test(blocker),
    ),
  );
});

test("final customs or legal determination language blocks approval readiness", async () => {
  const inputs = reviewedReadyInputs(await readCurrentInputs());
  inputs.classifierDraft["approval_claim"] =
    "The item is classified as an approved final NCM code.";

  const result = evaluateArgentinaBackpackApprovalReadiness(inputs);

  assert.equal(result.approvalReady, false);
  assert.ok(
    result.blockers.some((blocker) =>
      /final classification assertion/i.test(blocker),
    ),
  );
});

test("downstream_allowed true without approved review blocks readiness", async () => {
  const inputs = reviewedReadyInputs(await readCurrentInputs());
  inputs.reviewManifest["review_status"] = "pending";
  inputs.evidencePacket["downstream_allowed"] = true;

  const result = evaluateArgentinaBackpackApprovalReadiness(inputs);

  assert.equal(result.approvalReady, false);
  assert.ok(
    result.blockers.some((blocker) =>
      /downstream_allowed cannot be true without approved review evidence/i.test(
        blocker,
      ),
    ),
  );
});

test("fixtures with secrets, live coupling, raw output, provider metadata, or local paths cannot pass", async () => {
  const forbiddenFields: Array<[string, string]> = [
    ["env_ref", "process.env.ARGENTINA_BACKPACK_KEY"],
    ["secret_ref", "SERVICE_ROLE_KEY"],
    ["supabase_ref", "supabase project_ref"],
    ["provider_metadata", "provider_metadata"],
    ["raw_output", "raw LLM output"],
    ["local_path", "/Users/example/private-fixture.json"],
    ["runtime_coupling", "live_integration"],
  ];

  for (const [field, value] of forbiddenFields) {
    const inputs = reviewedReadyInputs(await readCurrentInputs());
    approvalReadinessReview(inputs)[field] = value;

    const result = evaluateArgentinaBackpackApprovalReadiness(inputs);

    assert.equal(result.approvalReady, false, field);
    assert.equal(result.blockers.length > 0, true, field);
  }
});

import path from "node:path";

import {
  evaluateArgentinaBackpackApprovalReadiness,
  type JsonObject,
} from "../intelligence/argentina-backpack-approval-readiness.js";
import { readUtf8File } from "../lib/fs.js";

const defaultInputPaths = {
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

async function readJson(
  repoRoot: string,
  relativePath: string,
): Promise<JsonObject> {
  const content = await readUtf8File(path.resolve(repoRoot, relativePath));

  return JSON.parse(content) as JsonObject;
}

export async function checkArgentinaBackpackApprovalReadiness(
  repoRoot = process.cwd(),
): Promise<void> {
  const inputs = {
    evidencePacket: await readJson(repoRoot, defaultInputPaths.evidencePacket),
    extractionDraft: await readJson(
      repoRoot,
      defaultInputPaths.extractionDraft,
    ),
    reviewManifest: await readJson(repoRoot, defaultInputPaths.reviewManifest),
    classifierDraft: await readJson(
      repoRoot,
      defaultInputPaths.classifierDraft,
    ),
    sourceSnapshots: await Promise.all(
      defaultInputPaths.sourceSnapshots.map((sourceSnapshotPath) =>
        readJson(repoRoot, sourceSnapshotPath),
      ),
    ),
  };

  const result = evaluateArgentinaBackpackApprovalReadiness(inputs);

  if (!result.approvalReady) {
    console.error("Argentina backpack approval readiness check failed closed.");
    for (const blocker of result.blockers) {
      console.error(`- ${blocker}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Argentina backpack approval readiness check passed.");
}

if (
  process.argv[1]?.endsWith("check-argentina-backpack-approval-readiness.ts")
) {
  await checkArgentinaBackpackApprovalReadiness();
}

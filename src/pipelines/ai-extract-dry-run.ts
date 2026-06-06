import path from "node:path";

import { readUtf8File } from "../lib/fs.js";
import { runAiExtractionWorkflow } from "../intelligence/ai-extraction-workflow.js";
import {
  QwenDashScopeProvider,
  validateQwenDashScopeConfig,
} from "../intelligence/qwen-dashscope-provider.js";
import type { ExtractableEvidencePacket } from "../intelligence/types.js";

async function main(): Promise<void> {
  const config = validateQwenDashScopeConfig(process.env);
  if (!config.ok) {
    console.error("Qwen extraction dry-run did not start.");
    for (const error of config.errors) {
      console.error(`- ${error}`);
    }
    console.error(
      "This script only uses local fixture/demo evidence and never writes approved artifacts.",
    );
    process.exitCode = 1;
    return;
  }

  const fixturePath = path.resolve(
    process.cwd(),
    "snapshots/pcram/extractable-evidence-packet-wco-hs-2022.json",
  );
  const evidencePacket = JSON.parse(
    await readUtf8File(fixturePath),
  ) as ExtractableEvidencePacket;
  const provider = new QwenDashScopeProvider(config.config);
  const result = await runAiExtractionWorkflow({
    evidence_packet: evidencePacket,
    provider,
    extraction_job_id: "manual-dry-run-qwen-langgraph-spike",
  });

  console.log("DRAFT / UNREVIEWED AI EXTRACTION RESULT");
  console.log("human_review_required=true");
  console.log("downstream_allowed=false");
  console.log(
    "Fixture input only; do not send customer data through this script.",
  );
  console.log(JSON.stringify(result, null, 2));
}

await main();

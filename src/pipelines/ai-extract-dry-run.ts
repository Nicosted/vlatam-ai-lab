import path from "node:path";

import { readUtf8File } from "../lib/fs.js";
import { runAiExtractionWorkflow } from "../intelligence/ai-extraction-workflow.js";
import type { AiExtractionProvider } from "../intelligence/ai-extraction-provider.js";
import { EmbeddedEvidenceDemoProvider } from "../intelligence/embedded-evidence-demo-provider.js";
import {
  QwenDashScopeProvider,
  validateQwenDashScopeConfig,
} from "../intelligence/qwen-dashscope-provider.js";
import type { ExtractableEvidencePacket } from "../intelligence/types.js";

// Default fixtures for each dry-run mode. Both are local, demo/non-authoritative
// inputs. The demo fixture embeds synthetic evidence so the workflow can produce
// a schema-valid draft claim without a live provider call.
const QWEN_FIXTURE =
  "snapshots/pcram/extractable-evidence-packet-wco-hs-2022.json";
const DEMO_FIXTURE =
  "snapshots/pcram/extractable-evidence-packet-demo-embedded-evidence.json";

function isDemoMode(): boolean {
  const mode = process.env.AI_EXTRACT_MODE?.trim().toLowerCase();
  return mode === "demo" || process.argv.includes("--demo");
}

async function loadEvidencePacket(
  relativePath: string,
): Promise<ExtractableEvidencePacket> {
  const fixturePath = path.resolve(process.cwd(), relativePath);
  return JSON.parse(
    await readUtf8File(fixturePath),
  ) as ExtractableEvidencePacket;
}

async function resolveRun(): Promise<
  | {
      ok: true;
      provider: AiExtractionProvider;
      fixturePath: string;
      jobId: string;
    }
  | { ok: false; errors: string[] }
> {
  if (isDemoMode()) {
    // Deterministic, network-free demo path. Requires no credentials.
    return {
      ok: true,
      provider: new EmbeddedEvidenceDemoProvider(),
      fixturePath: DEMO_FIXTURE,
      jobId: "manual-dry-run-embedded-evidence-demo",
    };
  }

  const config = validateQwenDashScopeConfig(process.env);
  if (!config.ok) {
    return { ok: false, errors: config.errors };
  }

  return {
    ok: true,
    provider: new QwenDashScopeProvider(config.config),
    fixturePath: QWEN_FIXTURE,
    jobId: "manual-dry-run-qwen-langgraph-spike",
  };
}

async function main(): Promise<void> {
  const run = await resolveRun();
  if (!run.ok) {
    console.error("Qwen extraction dry-run did not start.");
    for (const error of run.errors) {
      console.error(`- ${error}`);
    }
    console.error(
      "Tip: run a credential-free demo with AI_EXTRACT_MODE=demo (or pass --demo).",
    );
    console.error(
      "This script only uses local fixture/demo evidence and never writes approved artifacts.",
    );
    process.exitCode = 1;
    return;
  }

  const evidencePacket = await loadEvidencePacket(run.fixturePath);
  const result = await runAiExtractionWorkflow({
    evidence_packet: evidencePacket,
    provider: run.provider,
    extraction_job_id: run.jobId,
  });

  console.log("DRAFT / UNREVIEWED AI EXTRACTION RESULT");
  console.log(`provider_id=${result.provider_id}`);
  console.log(`model_id=${result.model_id}`);
  console.log(`extraction_status=${result.extraction_status}`);
  console.log("human_review_required=true");
  console.log("downstream_allowed=false");
  console.log(
    "Fixture input only; do not send customer data through this script.",
  );
  console.log(JSON.stringify(result, null, 2));
}

await main();

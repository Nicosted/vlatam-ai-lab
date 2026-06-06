// Offline replay of the checked-in sanitized Qwen recorded-response fixture.
//
// Reads the recorded fixture and drives the AI extraction workflow with the
// RecordedQwenResponseProvider. Performs NO network calls and needs NO
// credentials. Output is always draft/unreviewed.

import { runAiExtractionWorkflow } from "../intelligence/ai-extraction-workflow.js";
import { RecordedQwenResponseProvider } from "../intelligence/recorded-qwen-response-provider.js";
import {
  DEMO_EVIDENCE_PACKET_PATH,
  loadEvidencePacket,
  loadRecordedQwenFixture,
} from "../intelligence/qwen-recorded-fixture-io.js";

const REPLAY_JOB_ID = "replay-qwen-demo-embedded-evidence";

async function main(): Promise<void> {
  const fixture = await loadRecordedQwenFixture();
  const evidencePacket = await loadEvidencePacket(DEMO_EVIDENCE_PACKET_PATH);

  const result = await runAiExtractionWorkflow({
    evidence_packet: evidencePacket,
    provider: new RecordedQwenResponseProvider(fixture),
    extraction_job_id: REPLAY_JOB_ID,
  });

  console.log("OFFLINE REPLAY / DRAFT / UNREVIEWED QWEN EXTRACTION RESULT");
  console.log(`fixture_origin=${fixture.origin}`);
  console.log(`provider_id=${result.provider_id}`);
  console.log(`model_id=${result.model_id}`);
  console.log(`extraction_status=${result.extraction_status}`);
  console.log(`extracted_claims=${result.extracted_claims.length}`);
  console.log("human_review_required=true");
  console.log("downstream_allowed=false");
  console.log(
    "Recorded fixture is demo/synthetic only; no network access was used.",
  );
  console.log(JSON.stringify(result, null, 2));
}

await main();

// Optional recorder for the offline Qwen replay fixture.
//
// When DASHSCOPE_API_KEY is present, this records a SANITIZED Qwen response for
// the synthetic embedded-evidence demo packet and writes it to the checked-in
// recorded-response fixture (origin=live_recorded). It refuses to run against any
// non-demo input, never prints secrets, and only persists the minimal sanitized
// response shape.
//
// When DASHSCOPE_API_KEY is absent it fails gracefully with a clear message and
// does NOT touch the checked-in fixture, so normal tests never depend on a key.

import {
  DEFAULT_QWEN_MODEL,
  QwenDashScopeProvider,
  validateQwenDashScopeConfig,
} from "../intelligence/qwen-dashscope-provider.js";
import type { AiExtractionDraft } from "../intelligence/ai-extraction-provider.js";
import { extractQwenJsonContent } from "../intelligence/qwen-dashscope-provider.js";
import type { RecordedQwenFixture } from "../intelligence/recorded-qwen-response-provider.js";
import {
  assertDemoPacket,
  DEMO_EVIDENCE_PACKET_PATH,
  loadEvidencePacket,
  NORMALIZED_RECORDED_AT,
  RECORDED_FIXTURE_DISCLAIMER,
  writeRecordedQwenFixture,
} from "../intelligence/qwen-recorded-fixture-io.js";

const RECORD_JOB_ID = "record-qwen-demo-embedded-evidence";

async function main(): Promise<void> {
  // Default QWEN_MODEL to the safe shared default if unset.
  const env = {
    ...process.env,
    QWEN_MODEL: process.env.QWEN_MODEL?.trim() || DEFAULT_QWEN_MODEL,
  };
  const config = validateQwenDashScopeConfig(env);
  if (!config.ok) {
    console.error("Qwen demo recorder did not run.");
    for (const error of config.errors) {
      console.error(`- ${error}`);
    }
    console.error(
      "Set DASHSCOPE_API_KEY (and optionally QWEN_MODEL) to record a sanitized fixture.",
    );
    console.error(
      "The checked-in replay fixture is unchanged; offline replay/tests do not need a key.",
    );
    process.exitCode = 1;
    return;
  }

  const evidencePacket = await loadEvidencePacket(DEMO_EVIDENCE_PACKET_PATH);
  // Hard refusal against anything but the synthetic demo packet.
  assertDemoPacket(evidencePacket);

  const provider = new QwenDashScopeProvider(config.config);

  // Capture sanitized extractor + critic responses (sanitization happens inside
  // the provider boundary; raw account/header/billing data never reaches here).
  const extractionDraftResponse = await provider.rawExtractionDraft({
    evidence_packet: evidencePacket,
    extraction_job_id: RECORD_JOB_ID,
  });
  const parsedDraft = extractQwenJsonContent(
    extractionDraftResponse,
  ) as AiExtractionDraft;
  const critiqueResponse = await provider.rawCritique({
    evidence_packet: evidencePacket,
    extraction_draft: parsedDraft,
    extraction_job_id: RECORD_JOB_ID,
  });

  const fixture: RecordedQwenFixture = {
    fixture_kind: "qwen_recorded_response",
    origin: "live_recorded",
    provider_id: provider.provider_id,
    model_id: provider.model_id,
    source_packet: DEMO_EVIDENCE_PACKET_PATH,
    recorded_at: NORMALIZED_RECORDED_AT,
    disclaimer: RECORDED_FIXTURE_DISCLAIMER,
    human_review_required: true,
    downstream_allowed: false,
    responses: {
      extraction_draft: extractionDraftResponse,
      critique: critiqueResponse,
    },
  };

  const writtenPath = await writeRecordedQwenFixture(fixture, {
    apiKey: config.config.apiKey,
  });

  // Never print the key or raw payloads — only safe provenance metadata.
  console.log("Recorded sanitized Qwen demo fixture (live_recorded).");
  console.log(`provider_id=${fixture.provider_id}`);
  console.log(`model_id=${fixture.model_id}`);
  console.log(`source_packet=${fixture.source_packet}`);
  console.log(
    `extractor_choices=${fixture.responses.extraction_draft.choices.length}`,
  );
  console.log(`critique_choices=${fixture.responses.critique.choices.length}`);
  console.log(`written=${writtenPath}`);
  console.log("Fixture is demo/synthetic only and remains draft/unreviewed.");
}

await main();

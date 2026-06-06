import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import type {
  AiExtractionProvider,
  CritiqueInput,
  ExtractionDraftInput,
} from "../src/intelligence/ai-extraction-provider.js";
import { runAiExtractionWorkflow } from "../src/intelligence/ai-extraction-workflow.js";
import type { ExtractableEvidencePacket } from "../src/intelligence/types.js";
import { readUtf8File } from "../src/lib/fs.js";

async function readJsonFixture<T>(relativePath: string): Promise<T> {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const content = await readUtf8File(absolutePath);
  return JSON.parse(content) as T;
}

class FakeProvider implements AiExtractionProvider {
  readonly provider_id = "fake_provider";
  readonly model_id = "fake-model-for-tests";
  extractionCalls = 0;
  critiqueCalls = 0;

  constructor(
    private readonly draftResponse: unknown,
    private readonly critiqueResponse: unknown,
  ) {}

  async generateExtractionDraft(input: ExtractionDraftInput): Promise<unknown> {
    void input;
    this.extractionCalls += 1;
    return this.draftResponse;
  }

  async generateCritique(input: CritiqueInput): Promise<unknown> {
    void input;
    this.critiqueCalls += 1;
    return this.critiqueResponse;
  }
}

async function readEvidencePacket(): Promise<ExtractableEvidencePacket> {
  return readJsonFixture<ExtractableEvidencePacket>(
    "snapshots/pcram/extractable-evidence-packet-wco-hs-2022.json",
  );
}

test("provider interface works with a fake provider", async () => {
  const draft = await readJsonFixture(
    "snapshots/pcram/model-output-extraction-draft-success.json",
  );
  const critique = await readJsonFixture(
    "snapshots/pcram/model-output-critique-success.json",
  );
  const provider = new FakeProvider(draft, critique);

  await provider.generateExtractionDraft({
    evidence_packet: await readEvidencePacket(),
  });
  await provider.generateCritique({
    evidence_packet: await readEvidencePacket(),
    extraction_draft: { extracted_claims: [] },
  });

  assert.equal(provider.extractionCalls, 1);
  assert.equal(provider.critiqueCalls, 1);
});

test("LangGraph workflow produces a draft extraction with fake responses", async () => {
  const provider = new FakeProvider(
    await readJsonFixture(
      "snapshots/pcram/model-output-extraction-draft-success.json",
    ),
    await readJsonFixture("snapshots/pcram/model-output-critique-success.json"),
  );

  const result = await runAiExtractionWorkflow({
    evidence_packet: await readEvidencePacket(),
    provider,
    extraction_job_id: "extraction-job-qwen-langgraph-spike-fixture",
    created_at: "2026-06-06T00:30:00.000Z",
  });

  assert.equal(result.extraction_status, "draft_unreviewed");
  assert.equal(result.extracted_claims.length, 1);
  assert.equal(result.unsupported_claims.length, 0);
  assert.equal(result.human_review_required, true);
  assert.equal(result.downstream_allowed, false);
});

test("critic flags unsupported claims without approving downstream output", async () => {
  const unsupportedDraft = {
    extracted_claims: [
      {
        claim_id: "claim-unsupported-001",
        claim_text: "The packet proves a tariff classification outcome.",
        evidence_reference:
          "HS 2022 Edition nomenclature landing page (section/anchor reference only).",
        support_status: "needs_human_review",
        confidence: 0.4,
      },
    ],
    confidence: 0.4,
  };
  const provider = new FakeProvider(
    unsupportedDraft,
    await readJsonFixture(
      "snapshots/pcram/model-output-critique-unsupported-claim.json",
    ),
  );

  const result = await runAiExtractionWorkflow({
    evidence_packet: await readEvidencePacket(),
    provider,
    created_at: "2026-06-06T00:31:00.000Z",
  });

  assert.equal(result.extraction_status, "critique_flagged");
  assert.equal(result.unsupported_claims.length, 1);
  assert.equal(result.human_review_required, true);
  assert.equal(result.downstream_allowed, false);
});

test("invalid model output fails validation and returns conservative fallback", async () => {
  const provider = new FakeProvider(
    await readJsonFixture(
      "snapshots/pcram/model-output-extraction-draft-invalid.json",
    ),
    await readJsonFixture("snapshots/pcram/model-output-critique-success.json"),
  );

  const result = await runAiExtractionWorkflow({
    evidence_packet: await readEvidencePacket(),
    provider,
  });

  assert.equal(result.extraction_status, "validation_failed");
  assert.equal(result.extracted_claims.length, 0);
  assert.equal(
    result.warnings.some((warning) =>
      warning.includes("Extractor output failed validation"),
    ),
    true,
  );
});

test("incomplete model output uses conservative fallback", async () => {
  const provider = new FakeProvider(
    await readJsonFixture(
      "snapshots/pcram/model-output-extraction-draft-incomplete.json",
    ),
    await readJsonFixture("snapshots/pcram/model-output-critique-success.json"),
  );

  const result = await runAiExtractionWorkflow({
    evidence_packet: await readEvidencePacket(),
    provider,
  });

  assert.equal(result.extraction_status, "validation_failed");
  assert.deepEqual(result.extracted_claims, []);
  assert.equal(result.confidence, 0);
  assert.equal(result.human_review_required, true);
  assert.equal(result.downstream_allowed, false);
});

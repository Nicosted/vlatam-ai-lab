import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

import type { ValidateFunction } from "ajv";

import type {
  AiExtractionProvider,
  CritiqueInput,
  ExtractionDraftInput,
} from "../src/intelligence/ai-extraction-provider.js";
import { EmbeddedEvidenceDemoProvider } from "../src/intelligence/embedded-evidence-demo-provider.js";
import { runAiExtractionWorkflow } from "../src/intelligence/ai-extraction-workflow.js";
import type { ExtractableEvidencePacket } from "../src/intelligence/types.js";
import { readUtf8File } from "../src/lib/fs.js";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020") as new (options?: {
  allErrors?: boolean;
  strict?: boolean;
  validateFormats?: boolean;
}) => {
  compile: (schema: unknown) => ValidateFunction;
};

async function readJsonFixture<T>(relativePath: string): Promise<T> {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  return JSON.parse(await readUtf8File(absolutePath)) as T;
}

async function buildResultValidator(): Promise<ValidateFunction> {
  const schema = await readJsonFixture(
    "schemas/ai-extraction-result.schema.json",
  );
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });
  return ajv.compile(schema);
}

function readEmbeddedPacket(): Promise<ExtractableEvidencePacket> {
  return readJsonFixture<ExtractableEvidencePacket>(
    "snapshots/pcram/extractable-evidence-packet-demo-embedded-evidence.json",
  );
}

function readLocatorOnlyPacket(): Promise<ExtractableEvidencePacket> {
  return readJsonFixture<ExtractableEvidencePacket>(
    "snapshots/pcram/extractable-evidence-packet-wco-hs-2022.json",
  );
}

/** Fixed-response fake provider used to exercise invalid model output. */
class FakeProvider implements AiExtractionProvider {
  readonly provider_id = "fake_provider";
  readonly model_id = "fake-model-for-tests";

  constructor(
    private readonly draftResponse: unknown,
    private readonly critiqueResponse: unknown,
  ) {}

  async generateExtractionDraft(input: ExtractionDraftInput): Promise<unknown> {
    void input;
    return this.draftResponse;
  }

  async generateCritique(input: CritiqueInput): Promise<unknown> {
    void input;
    return this.critiqueResponse;
  }
}

test("embedded-evidence demo fixture yields at least one schema-valid claim", async () => {
  const result = await runAiExtractionWorkflow({
    evidence_packet: await readEmbeddedPacket(),
    provider: new EmbeddedEvidenceDemoProvider(),
    extraction_job_id: "test-embedded-evidence-demo",
    created_at: "2026-06-06T01:05:00.000Z",
  });

  assert.equal(result.provider_id, "demo_embedded_evidence");
  assert.equal(result.extraction_status, "draft_unreviewed");
  assert.ok(
    result.extracted_claims.length >= 1,
    "expected at least one extracted claim",
  );
  assert.equal(result.human_review_required, true);
  assert.equal(result.downstream_allowed, false);

  // The full result (including its claims) must be schema-valid.
  const validate = await buildResultValidator();
  assert.equal(
    validate(result),
    true,
    JSON.stringify(validate.errors, null, 2),
  );
});

test("locator-only fixture stays conservative with the demo provider", async () => {
  const result = await runAiExtractionWorkflow({
    evidence_packet: await readLocatorOnlyPacket(),
    provider: new EmbeddedEvidenceDemoProvider(),
    extraction_job_id: "test-locator-only-demo",
    created_at: "2026-06-06T01:06:00.000Z",
  });

  assert.deepEqual(result.extracted_claims, []);
  assert.equal(result.downstream_allowed, false);
  assert.equal(result.human_review_required, true);

  const validate = await buildResultValidator();
  assert.equal(validate(result), true);
});

test("string entries in extracted_claims are rejected with a clear warning", async () => {
  const provider = new FakeProvider(
    {
      extracted_claims: [
        "heading D1.10 is dutiable at 7.5%",
        {
          claim_id: "demo-claim-ok",
          claim_text: "A valid object claim that should not rescue the array.",
          evidence_reference: "excerpt-demo-001",
          support_status: "needs_human_review",
          confidence: 0.4,
        },
      ],
      confidence: 0.4,
    },
    {
      critic_summary: "Critic placeholder for invalid extractor output.",
      unsupported_claims: [],
      warnings: [],
    },
  );

  const result = await runAiExtractionWorkflow({
    evidence_packet: await readEmbeddedPacket(),
    provider,
    created_at: "2026-06-06T01:07:00.000Z",
  });

  assert.equal(result.extraction_status, "validation_failed");
  assert.deepEqual(result.extracted_claims, []);
  assert.equal(
    result.warnings.some(
      (warning) =>
        warning.includes("extracted_claims[0]") &&
        warning.includes("must be a JSON object"),
    ),
    true,
    "expected a path-specific warning naming the string element",
  );
  assert.equal(result.human_review_required, true);
  assert.equal(result.downstream_allowed, false);
});

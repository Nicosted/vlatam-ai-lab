import assert from "node:assert/strict";
import test from "node:test";

import {
  QwenDashScopeProvider,
  validateQwenDashScopeConfig,
} from "../src/intelligence/qwen-dashscope-provider.js";

test("Qwen adapter config validation does not require real API calls", () => {
  const missing = validateQwenDashScopeConfig({});

  assert.equal(missing.ok, false);
  assert.equal(
    missing.errors.includes(
      "DASHSCOPE_API_KEY is required for manual Qwen dry-runs.",
    ),
    true,
  );

  const valid = validateQwenDashScopeConfig({
    DASHSCOPE_API_KEY: "test-key-not-real",
    QWEN_MODEL: "qwen-test-model",
  });

  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.config.model, "qwen-test-model");
  }
});

test("Qwen adapter can parse OpenAI-compatible fake responses", async () => {
  const fetchCalls: string[] = [];
  const fakeFetch = (async (url: string) => {
    fetchCalls.push(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                extracted_claims: [],
                warnings: ["fake response only"],
                confidence: 0,
              }),
            },
          },
        ],
      }),
    };
  }) as typeof fetch;
  const provider = new QwenDashScopeProvider(
    {
      apiKey: "test-key-not-real",
      model: "qwen-test-model",
      baseUrl: "https://example.invalid/compatible-mode/v1",
    },
    fakeFetch,
  );

  const result = await provider.generateExtractionDraft({
    evidence_packet: {
      evidence_packet_id: "packet",
      review_manifest_id: "manifest",
      snapshot_id: "snapshot",
      source_id: "source",
      evidence_scope: "demo",
      extraction_input_type: "manual_metadata",
      extraction_allowed: true,
      extraction_status: "prepared",
      human_review_required: true,
      downstream_allowed: false,
      content_reference: "manual/local/demo",
      schema_version: "1.0.0",
    },
  });

  assert.deepEqual(result, {
    extracted_claims: [],
    warnings: ["fake response only"],
    confidence: 0,
  });
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0] ?? "", /example\.invalid/);
});

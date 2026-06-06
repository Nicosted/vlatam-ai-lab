import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

import type { ValidateFunction } from "ajv";

import { runAiExtractionWorkflow } from "../src/intelligence/ai-extraction-workflow.js";
import {
  parseRecordedQwenFixture,
  RecordedQwenResponseProvider,
} from "../src/intelligence/recorded-qwen-response-provider.js";
import {
  assertDemoPacket,
  assertNoSecretsInSerializedFixture,
  DEMO_EVIDENCE_PACKET_PATH,
  loadEvidencePacket,
  loadRecordedQwenFixture,
  RECORDED_QWEN_FIXTURE_PATH,
} from "../src/intelligence/qwen-recorded-fixture-io.js";
import { validateQwenDashScopeConfig } from "../src/intelligence/qwen-dashscope-provider.js";
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

/** Run a function with global fetch replaced by a throwing stub. */
async function withNetworkDisabled<T>(fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("network access is not allowed in offline replay tests");
  }) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("recorded Qwen fixture loads and replays without network access", async () => {
  const result = await withNetworkDisabled(async () => {
    const fixture = await loadRecordedQwenFixture();
    const packet = await loadEvidencePacket(DEMO_EVIDENCE_PACKET_PATH);
    return runAiExtractionWorkflow({
      evidence_packet: packet,
      provider: new RecordedQwenResponseProvider(fixture),
      extraction_job_id: "test-replay-qwen-demo",
      created_at: "2026-06-06T02:00:00.000Z",
    });
  });

  assert.equal(result.provider_id, "dashscope_qwen");
  assert.equal(result.extraction_status, "draft_unreviewed");
  assert.ok(
    result.extracted_claims.length >= 1,
    "expected at least one replayed claim",
  );

  const validate = await buildResultValidator();
  assert.equal(
    validate(result),
    true,
    JSON.stringify(validate.errors, null, 2),
  );
});

test("replayed result keeps draft-only safety flags", async () => {
  const fixture = await loadRecordedQwenFixture();
  const packet = await loadEvidencePacket(DEMO_EVIDENCE_PACKET_PATH);
  const result = await runAiExtractionWorkflow({
    evidence_packet: packet,
    provider: new RecordedQwenResponseProvider(fixture),
    extraction_job_id: "test-replay-safety-flags",
    created_at: "2026-06-06T02:01:00.000Z",
  });

  assert.equal(result.human_review_required, true);
  assert.equal(result.downstream_allowed, false);
  assert.equal(fixture.human_review_required, true);
  assert.equal(fixture.downstream_allowed, false);
});

test("checked-in fixture is sanitized and free of credential markers", async () => {
  const absolutePath = path.resolve(process.cwd(), RECORDED_QWEN_FIXTURE_PATH);
  const serialized = await readUtf8File(absolutePath);

  // Must not trip any credential marker, and the marker scanner itself must work.
  assert.doesNotThrow(() => assertNoSecretsInSerializedFixture(serialized));

  const raw = JSON.parse(serialized) as Record<string, unknown>;
  const responses = raw["responses"] as Record<string, unknown>;
  for (const key of ["extraction_draft", "critique"]) {
    const completion = responses[key] as {
      choices: Array<Record<string, unknown>>;
    };
    for (const choice of completion.choices) {
      assert.deepEqual(
        Object.keys(choice).sort(),
        ["finish_reason", "index", "message"],
        "choice must only carry sanitized keys",
      );
      const message = choice["message"] as Record<string, unknown>;
      assert.deepEqual(Object.keys(message).sort(), ["content", "role"]);
    }
  }
});

test("fixture parser rejects raw provider metadata", () => {
  const tainted = {
    fixture_kind: "qwen_recorded_response",
    origin: "live_recorded",
    provider_id: "dashscope_qwen",
    model_id: "qwen-plus",
    source_packet: DEMO_EVIDENCE_PACKET_PATH,
    recorded_at: "1970-01-01T00:00:00.000Z",
    disclaimer: "demo",
    human_review_required: true,
    downstream_allowed: false,
    responses: {
      extraction_draft: {
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            // Smuggled-in raw metadata key must be rejected.
            id: "chatcmpl-leak",
            message: { role: "assistant", content: '{"extracted_claims":[]}' },
          },
        ],
      },
      critique: {
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: '{"critic_summary":"x","unsupported_claims":[]}',
            },
          },
        ],
      },
    },
  };

  const parsed = parseRecordedQwenFixture(tainted);
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.equal(
      parsed.errors.some((error) => error.includes("disallowed key")),
      true,
      "expected a disallowed-key error",
    );
  }
});

test("fixture parser enforces draft-only safety flags", () => {
  const base = {
    fixture_kind: "qwen_recorded_response",
    origin: "replay_demo_derived",
    provider_id: "dashscope_qwen",
    model_id: "qwen-plus",
    source_packet: DEMO_EVIDENCE_PACKET_PATH,
    recorded_at: "1970-01-01T00:00:00.000Z",
    disclaimer: "demo",
    human_review_required: true,
    downstream_allowed: true, // invalid
    responses: {
      extraction_draft: {
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: { role: "assistant", content: "{}" },
          },
        ],
      },
      critique: {
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: { role: "assistant", content: "{}" },
          },
        ],
      },
    },
  };

  const parsed = parseRecordedQwenFixture(base);
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.equal(
      parsed.errors.some((error) => error.includes("downstream_allowed")),
      true,
    );
  }
});

test("secret scanner refuses output containing an API key or bearer token", () => {
  assert.throws(
    () =>
      assertNoSecretsInSerializedFixture('{"x":"my-secret-key"}', {
        apiKey: "my-secret-key",
      }),
    /contains the API key/,
  );
  assert.throws(
    () => assertNoSecretsInSerializedFixture('{"h":"Bearer sk-abcdefghijkl"}'),
    /credential marker/,
  );
});

test("recorder refuses to run without DASHSCOPE_API_KEY", () => {
  // The recorder relies on this config gate; with no key it fails (ok=false)
  // rather than performing any network call.
  const result = validateQwenDashScopeConfig({ QWEN_MODEL: "qwen-plus" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(
      result.errors.includes(
        "DASHSCOPE_API_KEY is required for manual Qwen dry-runs.",
      ),
      true,
    );
  }
});

test("recorder refuses non-demo evidence packets", () => {
  const nonDemo = {
    evidence_packet_id: "packet",
    review_manifest_id: "manifest",
    snapshot_id: "snapshot",
    source_id: "source",
    evidence_scope: "real",
    jurisdiction_scope: "ar",
    extraction_input_type: "manual_metadata",
    extraction_allowed: true,
    extraction_status: "prepared",
    human_review_required: true,
    downstream_allowed: false,
    content_reference: "x",
    schema_version: "1.0.0",
    metadata: { demo_only: false },
  } as unknown as ExtractableEvidencePacket;

  assert.throws(
    () => assertDemoPacket(nonDemo),
    /not the synthetic demo packet/,
  );
});

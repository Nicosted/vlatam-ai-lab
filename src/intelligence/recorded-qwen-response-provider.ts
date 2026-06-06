// Offline recorded-response path for Qwen extraction.
//
// Scope: this module lets the AI extraction workflow be driven by a checked-in,
// sanitized Qwen response fixture WITHOUT any network access or credentials. It
// exists to prove that real Qwen-shaped output can be captured, sanitized,
// normalized, and re-validated against the extraction schema in automated tests.
//
// Doctrine preserved here:
//  - Replay output is draft-only. The workflow still sets human_review_required
//    =true and downstream_allowed=false; this provider never approves anything.
//  - Fixtures are demo/synthetic only and are not classifier-approved
//    intelligence.
//  - Fixtures carry only the minimal sanitized response shape — never API keys,
//    provider request ids, account ids, headers, usage/billing, or raw HTTP
//    metadata.

import type {
  AiExtractionProvider,
  CritiqueInput,
  ExtractionDraftInput,
} from "./ai-extraction-provider.js";
import {
  extractQwenJsonContent,
  type SanitizedQwenChatCompletion,
  type SanitizedQwenChoice,
} from "./qwen-dashscope-provider.js";

/** Provenance of a recorded fixture. */
export type RecordedQwenFixtureOrigin =
  /** Captured from a live Qwen/DashScope call against the demo packet. */
  | "live_recorded"
  /** Derived offline from the deterministic demo provider (no live call). */
  | "replay_demo_derived";

export interface RecordedQwenFixture {
  fixture_kind: "qwen_recorded_response";
  origin: RecordedQwenFixtureOrigin;
  provider_id: string;
  model_id: string;
  /** Repo-relative path of the synthetic demo packet the fixture was built for. */
  source_packet: string;
  /** Normalized capture timestamp (no real wall-clock leakage). */
  recorded_at: string;
  disclaimer: string;
  human_review_required: true;
  downstream_allowed: false;
  responses: {
    extraction_draft: SanitizedQwenChatCompletion;
    critique: SanitizedQwenChatCompletion;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSanitizedCompletion(
  value: unknown,
  label: string,
):
  | { ok: true; value: SanitizedQwenChatCompletion }
  | { ok: false; error: string } {
  if (!isRecord(value) || !Array.isArray(value["choices"])) {
    return { ok: false, error: `${label} must have a choices array.` };
  }
  const choices: SanitizedQwenChoice[] = [];
  for (const [index, rawChoice] of value["choices"].entries()) {
    if (!isRecord(rawChoice)) {
      return {
        ok: false,
        error: `${label}.choices[${index}] must be an object.`,
      };
    }
    const message = rawChoice["message"];
    if (!isRecord(message) || typeof message["content"] !== "string") {
      return {
        ok: false,
        error: `${label}.choices[${index}].message.content must be a string.`,
      };
    }
    // Reject any raw provider metadata that a hand-edited fixture might smuggle
    // back in. Only the minimal sanitized keys are permitted.
    const allowedChoiceKeys = new Set(["index", "finish_reason", "message"]);
    for (const key of Object.keys(rawChoice)) {
      if (!allowedChoiceKeys.has(key)) {
        return {
          ok: false,
          error: `${label}.choices[${index}] contains disallowed key "${key}"; recorded fixtures must not carry raw provider metadata.`,
        };
      }
    }
    const allowedMessageKeys = new Set(["role", "content"]);
    for (const key of Object.keys(message)) {
      if (!allowedMessageKeys.has(key)) {
        return {
          ok: false,
          error: `${label}.choices[${index}].message contains disallowed key "${key}".`,
        };
      }
    }
    choices.push({
      index:
        typeof rawChoice["index"] === "number" ? rawChoice["index"] : index,
      finish_reason:
        typeof rawChoice["finish_reason"] === "string"
          ? rawChoice["finish_reason"]
          : null,
      message: {
        role:
          typeof message["role"] === "string" ? message["role"] : "assistant",
        content: message["content"],
      },
    });
  }
  return { ok: true, value: { choices } };
}

/**
 * Validate and normalize a raw parsed fixture object into a RecordedQwenFixture.
 * Enforces the draft-only safety flags and rejects fixtures that carry raw
 * provider metadata.
 */
export function parseRecordedQwenFixture(
  value: unknown,
): { ok: true; value: RecordedQwenFixture } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, errors: ["Recorded fixture must be a JSON object."] };
  }

  if (value["fixture_kind"] !== "qwen_recorded_response") {
    errors.push('fixture_kind must be "qwen_recorded_response".');
  }
  if (
    value["origin"] !== "live_recorded" &&
    value["origin"] !== "replay_demo_derived"
  ) {
    errors.push('origin must be "live_recorded" or "replay_demo_derived".');
  }
  if (
    typeof value["provider_id"] !== "string" ||
    value["provider_id"].trim().length === 0
  ) {
    errors.push("provider_id must be a non-empty string.");
  }
  if (
    typeof value["model_id"] !== "string" ||
    value["model_id"].trim().length === 0
  ) {
    errors.push("model_id must be a non-empty string.");
  }
  if (value["human_review_required"] !== true) {
    errors.push("human_review_required must be true.");
  }
  if (value["downstream_allowed"] !== false) {
    errors.push("downstream_allowed must be false.");
  }

  const responses = value["responses"];
  let extraction:
    | { ok: true; value: SanitizedQwenChatCompletion }
    | { ok: false; error: string } = {
    ok: false,
    error: "responses.extraction_draft is missing.",
  };
  let critique:
    | { ok: true; value: SanitizedQwenChatCompletion }
    | { ok: false; error: string } = {
    ok: false,
    error: "responses.critique is missing.",
  };
  if (isRecord(responses)) {
    extraction = parseSanitizedCompletion(
      responses["extraction_draft"],
      "responses.extraction_draft",
    );
    critique = parseSanitizedCompletion(
      responses["critique"],
      "responses.critique",
    );
  } else {
    errors.push("responses must be an object.");
  }
  if (!extraction.ok) {
    errors.push(extraction.error);
  }
  if (!critique.ok) {
    errors.push(critique.error);
  }

  if (errors.length > 0 || !extraction.ok || !critique.ok) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      fixture_kind: "qwen_recorded_response",
      origin: value["origin"] as RecordedQwenFixtureOrigin,
      provider_id: value["provider_id"] as string,
      model_id: value["model_id"] as string,
      source_packet:
        typeof value["source_packet"] === "string"
          ? value["source_packet"]
          : "",
      recorded_at:
        typeof value["recorded_at"] === "string" ? value["recorded_at"] : "",
      disclaimer:
        typeof value["disclaimer"] === "string" ? value["disclaimer"] : "",
      human_review_required: true,
      downstream_allowed: false,
      responses: {
        extraction_draft: extraction.value,
        critique: critique.value,
      },
    },
  };
}

/**
 * Provider that replays a sanitized recorded Qwen fixture through the same
 * parsing path as the live provider. Performs no network calls and needs no
 * credentials.
 */
export class RecordedQwenResponseProvider implements AiExtractionProvider {
  readonly provider_id: string;
  readonly model_id: string;

  constructor(private readonly fixture: RecordedQwenFixture) {
    this.provider_id = fixture.provider_id;
    this.model_id = fixture.model_id;
  }

  async generateExtractionDraft(input: ExtractionDraftInput): Promise<unknown> {
    void input;
    return extractQwenJsonContent(this.fixture.responses.extraction_draft);
  }

  async generateCritique(input: CritiqueInput): Promise<unknown> {
    void input;
    return extractQwenJsonContent(this.fixture.responses.critique);
  }
}

import type {
  AiExtractionProvider,
  CritiqueInput,
  ExtractionDraftInput,
} from "./ai-extraction-provider.js";

export interface QwenDashScopeConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface QwenDashScopeEnv {
  DASHSCOPE_API_KEY?: string;
  QWEN_MODEL?: string;
  QWEN_BASE_URL?: string;
}

type FetchLike = typeof fetch;

const defaultBaseUrl = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

/**
 * Default Qwen model used by manual dry-runs and the demo recorder when
 * `QWEN_MODEL` is not set. Kept here so the live provider, dry-run, and recorder
 * share one safe default.
 */
export const DEFAULT_QWEN_MODEL = "qwen-plus";

/**
 * Minimal, sanitized shape of an OpenAI-compatible chat completion response.
 * Only the fields required to re-parse and validate model output are retained;
 * provider/account metadata (ids, usage, system_fingerprint, headers, billing)
 * is intentionally dropped so it can never be persisted to a recorded fixture.
 */
export interface SanitizedQwenMessage {
  role: string;
  content: string;
}

export interface SanitizedQwenChoice {
  index: number;
  finish_reason: string | null;
  message: SanitizedQwenMessage;
}

export interface SanitizedQwenChatCompletion {
  choices: SanitizedQwenChoice[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Extract and JSON-parse the assistant message content from an OpenAI-compatible
 * chat completion payload. Shared by the live provider and the offline recorded
 * replay provider so both exercise identical parsing.
 */
export function extractQwenJsonContent(payload: unknown): unknown {
  const choices = isRecord(payload) ? payload["choices"] : undefined;
  const firstChoice = Array.isArray(choices) ? choices[0] : undefined;
  const message = isRecord(firstChoice) ? firstChoice["message"] : undefined;
  const content = isRecord(message) ? message["content"] : undefined;
  if (typeof content !== "string" || content.length === 0) {
    throw new Error("Qwen/DashScope response did not include message content.");
  }
  return JSON.parse(content);
}

/**
 * Reduce a raw chat completion payload to the minimal sanitized shape that is
 * safe to record. Drops everything except `choices[].{index,finish_reason}` and
 * `choices[].message.{role,content}`, and verifies each content string is valid
 * JSON so only parseable provider output is persisted. Never copies provider
 * request ids, usage/billing, headers, or account metadata.
 */
export function sanitizeQwenChatCompletion(
  payload: unknown,
): SanitizedQwenChatCompletion {
  const rawChoices = isRecord(payload) ? payload["choices"] : undefined;
  if (!Array.isArray(rawChoices) || rawChoices.length === 0) {
    throw new Error(
      "Qwen response is missing a non-empty choices array; nothing safe to record.",
    );
  }

  const choices = rawChoices.map((rawChoice, index): SanitizedQwenChoice => {
    const choice = isRecord(rawChoice) ? rawChoice : {};
    const message = isRecord(choice["message"]) ? choice["message"] : {};
    const content = message["content"];
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new Error(
        "Qwen choice is missing string message content; nothing safe to record.",
      );
    }
    // Validate parseability so only well-formed model output is persisted.
    JSON.parse(content);

    return {
      index: typeof choice["index"] === "number" ? choice["index"] : index,
      finish_reason:
        typeof choice["finish_reason"] === "string"
          ? choice["finish_reason"]
          : null,
      message: {
        role:
          typeof message["role"] === "string" ? message["role"] : "assistant",
        content,
      },
    };
  });

  return { choices };
}

const EXTRACTION_SYSTEM_PROMPT = [
  "You are a draft-only evidence extraction assistant for an independent intelligence lab.",
  "Return ONLY a single JSON object with exactly these keys: extracted_claims (array), warnings (array of strings), confidence (number 0-1).",
  "extracted_claims MUST be an array of claim OBJECTS. Each object MUST have: claim_id (string), claim_text (string), evidence_reference (string), support_status (one of supported_by_packet|unsupported|needs_human_review), confidence (number 0-1).",
  "NEVER output a plain string, number, or array as an element of extracted_claims. A bare string is invalid.",
  "If you cannot support a claim with the provided evidence, return an empty extracted_claims array ([]) rather than an unsupported or invented claim.",
  "Preserve uncertainty and evidence limitations: prefer needs_human_review and add warnings instead of overstating support.",
  "Do not invent regulatory, tariff, or classification conclusions.",
].join(" ");

export function validateQwenDashScopeConfig(
  env: QwenDashScopeEnv,
): { ok: true; config: QwenDashScopeConfig } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const apiKey = env.DASHSCOPE_API_KEY?.trim();
  const model = env.QWEN_MODEL?.trim();
  const baseUrl = (env.QWEN_BASE_URL ?? defaultBaseUrl).trim();

  if (!apiKey) {
    errors.push("DASHSCOPE_API_KEY is required for manual Qwen dry-runs.");
  }
  if (!model) {
    errors.push("QWEN_MODEL is required for manual Qwen dry-runs.");
  }
  if (!baseUrl) {
    errors.push(
      "QWEN_BASE_URL must be a non-empty OpenAI-compatible base URL.",
    );
  }

  if (errors.length > 0 || !apiKey || !model || !baseUrl) {
    return { ok: false, errors };
  }

  return { ok: true, config: { apiKey, model, baseUrl } };
}

export class QwenDashScopeProvider implements AiExtractionProvider {
  readonly provider_id = "dashscope_qwen";
  readonly model_id: string;
  private readonly config: QwenDashScopeConfig;
  private readonly fetchFn: FetchLike;

  constructor(config: QwenDashScopeConfig, fetchFn: FetchLike = fetch) {
    this.config = config;
    this.fetchFn = fetchFn;
    this.model_id = config.model;
  }

  async generateExtractionDraft(input: ExtractionDraftInput): Promise<unknown> {
    return extractQwenJsonContent(await this.rawExtractionDraft(input));
  }

  async generateCritique(input: CritiqueInput): Promise<unknown> {
    return extractQwenJsonContent(await this.rawCritique(input));
  }

  /**
   * Perform the extractor request and return the SANITIZED chat completion
   * payload. Used by the offline demo recorder so it can persist a minimal,
   * metadata-free response shape (never raw account/billing/header data).
   */
  async rawExtractionDraft(
    input: ExtractionDraftInput,
  ): Promise<SanitizedQwenChatCompletion> {
    return this.rawCompletion([
      {
        role: "system",
        content: EXTRACTION_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "extract bounded draft claims from this evidence packet",
          claim_object_shape: {
            claim_id: "string, stable and unique within this draft",
            claim_text: "string, one bounded factual statement",
            evidence_reference:
              "string, point to the packet excerpt/anchor/locator that supports the claim",
            support_status:
              "supported_by_packet | unsupported | needs_human_review",
            confidence: "number between 0 and 1 (triage only, not approval)",
          },
          rules: [
            "Every item in extracted_claims MUST be a JSON object with the exact claim_object_shape fields.",
            "Never put a plain string, number, or array inside extracted_claims.",
            "If the packet does not support a claim, do not invent one — return an empty extracted_claims array.",
            "Only extract claims grounded in the embedded evidence excerpts or bounded references; preserve uncertainty using needs_human_review and warnings.",
            "Do not state regulatory or classification conclusions; describe only what the evidence says.",
          ],
          evidence_packet: input.evidence_packet,
          extraction_job_id: input.extraction_job_id,
        }),
      },
    ]);
  }

  /**
   * Perform the critic request and return the SANITIZED chat completion payload.
   * Used by the offline demo recorder (see {@link rawExtractionDraft}).
   */
  async rawCritique(
    input: CritiqueInput,
  ): Promise<SanitizedQwenChatCompletion> {
    return this.rawCompletion([
      {
        role: "system",
        content:
          "You are a conservative evidence reviewer. Return only JSON with critic_summary, unsupported_claims, and warnings. Flag claims not supported by the packet.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "review draft extraction against bounded evidence packet",
          evidence_packet: input.evidence_packet,
          extraction_draft: input.extraction_draft,
          extraction_job_id: input.extraction_job_id,
        }),
      },
    ]);
  }

  private async rawCompletion(
    messages: unknown[],
  ): Promise<SanitizedQwenChatCompletion> {
    const response = await this.fetchFn(
      `${this.config.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          response_format: { type: "json_object" },
          temperature: 0,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Qwen/DashScope request failed with ${response.status}.`);
    }

    // Sanitize at the boundary so callers (and any recorder) only ever see the
    // minimal, metadata-free response shape.
    return sanitizeQwenChatCompletion(await response.json());
  }
}

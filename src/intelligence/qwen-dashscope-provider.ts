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
    return this.generateJson([
      {
        role: "system",
        content:
          "You are a draft-only evidence extraction assistant. Return only JSON with extracted_claims, warnings, and confidence. Do not invent regulatory conclusions.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "extract bounded draft claims from this evidence packet",
          evidence_packet: input.evidence_packet,
          extraction_job_id: input.extraction_job_id,
        }),
      },
    ]);
  }

  async generateCritique(input: CritiqueInput): Promise<unknown> {
    return this.generateJson([
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

  private async generateJson(messages: unknown[]): Promise<unknown> {
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

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(
        "Qwen/DashScope response did not include message content.",
      );
    }

    return JSON.parse(content);
  }
}

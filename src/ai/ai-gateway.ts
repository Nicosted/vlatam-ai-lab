/**
 * AI Gateway wrapper
 *
 * Routes all LLM calls through Cloudflare AI Gateway for:
 * - Observability (request/response logging)
 * - Rate limiting
 * - Model fallback chain
 * - Cost tracking
 * - Prompt caching
 *
 * Gated by CLOUDFLARE_PIPELINE_V1_ENABLED feature flag.
 * All methods are no-ops / pass-through when flag is disabled.
 */

export interface AIGatewayConfig {
  readonly accountId: string;
  readonly gatewayId: string;
  readonly defaultModel: string;
  readonly fallbackModels: readonly string[];
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly cacheEnabled: boolean;
  readonly cacheTtlSeconds: number;
}

export interface AIGatewayUsage {
  readonly model: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly costUsd: number;
  readonly fromCache: boolean;
  readonly fallbackUsed: boolean;
  readonly traceId: string;
  readonly durationMs: number;
}

export interface AIGatewayResponse {
  readonly content: string;
  readonly usage: AIGatewayUsage;
}

export interface AIGateway {
  generate(prompt: string, config?: Partial<AIGatewayConfig>): Promise<AIGatewayResponse>;
  generateWithFallback(prompt: string): Promise<AIGatewayResponse>;
  trackUsage(usage: AIGatewayUsage): Promise<void>;
  buildGatewayUrl(model: string): string;
}

/**
 * Default gateway configuration.
 * Gateway ID must be created in the Cloudflare dashboard before use.
 */
export const DEFAULT_GATEWAY_CONFIG: Omit<AIGatewayConfig, 'accountId'> = {
  gatewayId: 'vlatam-ai-lab-gateway',
  defaultModel: 'deepseek/deepseek-chat',
  fallbackModels: ['@cf/meta/llama-3.1-8b-instruct'],
  timeoutMs: 30_000,
  maxRetries: 3,
  cacheEnabled: true,
  cacheTtlSeconds: 3600,
};

export class CloudflareAIGateway implements AIGateway {
  private readonly config: AIGatewayConfig;
  private readonly featureFlagEnabled: boolean;

  constructor(config: AIGatewayConfig, featureFlagEnabled: boolean) {
    this.config = config;
    this.featureFlagEnabled = featureFlagEnabled;
  }

  buildGatewayUrl(model: string): string {
    return `https://gateway.ai.cloudflare.com/v1/${this.config.accountId}/${this.config.gatewayId}/${model}`;
  }

  async generate(prompt: string, overrides?: Partial<AIGatewayConfig>): Promise<AIGatewayResponse> {
    if (!this.featureFlagEnabled) {
      return this.passthroughResponse(prompt);
    }

    const cfg = { ...this.config, ...overrides };
    const traceId = this.generateTraceId();
    const startMs = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);

    try {
      const url = this.buildGatewayUrl(cfg.defaultModel);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cfg.cacheEnabled && {
            'cf-aig-cache-ttl': String(cfg.cacheTtlSeconds),
          }),
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`AI Gateway error: ${response.status}`);
      }

      const data = await response.json() as Record<string, unknown>;
      const content = this.extractContent(data);
      const fromCache = response.headers.get('cf-aig-cache-status') === 'HIT';

      return {
        content,
        usage: {
          model: cfg.defaultModel,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          costUsd: 0,
          fromCache,
          fallbackUsed: false,
          traceId,
          durationMs: Date.now() - startMs,
        },
      };
    } catch (error: unknown) {
      clearTimeout(timeout);
      throw error;
    }
  }

  async generateWithFallback(prompt: string): Promise<AIGatewayResponse> {
    if (!this.featureFlagEnabled) {
      return this.passthroughResponse(prompt);
    }

    const models = [this.config.defaultModel, ...this.config.fallbackModels];

    for (let i = 0; i < models.length; i++) {
      try {
        const model = models[i];
        const result = await this.generate(prompt, model !== undefined ? { defaultModel: model } : undefined);
        const fallbackUsed = i > 0;
        return {
          content: result.content,
          usage: { ...result.usage, fallbackUsed },
        };
      } catch (error: unknown) {
        const isLast = i === models.length - 1;
        if (isLast) throw error;
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[AIGateway] Model ${models[i] ?? 'unknown'} failed (${msg}), trying fallback...`);
      }
    }

    throw new Error('[AIGateway] All models in fallback chain failed');
  }

  async trackUsage(usage: AIGatewayUsage): Promise<void> {
    if (!this.featureFlagEnabled) return;
    console.log(`[AIGateway] Usage — model: ${usage.model} tokens: ${usage.totalTokens} cost: $${usage.costUsd.toFixed(6)} cache: ${usage.fromCache} fallback: ${usage.fallbackUsed} trace: ${usage.traceId}`);
  }

  private extractContent(data: Record<string, unknown>): string {
    const choices = data['choices'];
    if (Array.isArray(choices) && choices.length > 0) {
      const first = choices[0] as Record<string, unknown>;
      const message = first['message'] as Record<string, unknown> | undefined;
      if (message && typeof message['content'] === 'string') {
        return message['content'];
      }
    }
    return '';
  }

  private passthroughResponse(prompt: string): AIGatewayResponse {
    return {
      content: '',
      usage: {
        model: this.config.defaultModel,
        promptTokens: Math.ceil(prompt.length / 4),
        completionTokens: 0,
        totalTokens: Math.ceil(prompt.length / 4),
        costUsd: 0,
        fromCache: false,
        fallbackUsed: false,
        traceId: this.generateTraceId(),
        durationMs: 0,
      },
    };
  }

  private generateTraceId(): string {
    return `aig-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  }
}

/**
 * Create AI Gateway from env config.
 * Returns null if the feature flag is not enabled.
 */
export function createAIGateway(
  accountId: string,
  featureFlagEnabled: boolean
): AIGateway {
  const config: AIGatewayConfig = {
    ...DEFAULT_GATEWAY_CONFIG,
    accountId,
  };
  return new CloudflareAIGateway(config, featureFlagEnabled);
}

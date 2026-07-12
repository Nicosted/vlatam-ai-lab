import OpenAI from 'openai';
import type { ExecutionProfile, ProviderId } from '../execution/execution-profile.js';
import { executionError, sanitizeProviderError } from '../execution/errors.js';
import type { ProviderAdapter, ProviderExecutionContext, ProviderExecutionRequest, ProviderExecutionResult } from './provider-adapter.js';

export interface OpenAICompatibleAdapterOptions { readonly provider_id: ProviderId; readonly base_url: string; readonly enabled_flag: string; readonly credential_env: string; readonly env?: NodeJS.ProcessEnv | undefined; }
export class OpenAICompatibleAdapter implements ProviderAdapter {
  readonly provider_id: ProviderId;
  constructor(private readonly options: OpenAICompatibleAdapterOptions) { this.provider_id = options.provider_id; }
  supports(profile: ExecutionProfile): boolean { return profile.mode === 'live' && profile.provider_id === this.provider_id; }
  async execute(request: ProviderExecutionRequest, profile: ExecutionProfile, context: ProviderExecutionContext): Promise<ProviderExecutionResult> {
    const started = Date.now(); const env = this.options.env ?? process.env;
    if (env['AI_LAB_LIVE_PROVIDER_EXECUTION_ENABLED'] !== 'true' || env[this.options.enabled_flag] !== 'true') return { status: 'blocked', request_id: request.request_id, duration_ms: 0, error: executionError('LIVE_EXECUTION_DISABLED') };
    const apiKey = env[this.options.credential_env];
    if (!apiKey) return { status: 'blocked', request_id: request.request_id, duration_ms: 0, error: executionError('CREDENTIALS_UNAVAILABLE') };
    try {
      const client = new OpenAI({ apiKey, baseURL: this.options.base_url, maxRetries: 0, timeout: context.timeout_ms });
      const response = await client.chat.completions.create({ model: profile.model_id, messages: request.messages.map((m) => ({ role: m.role, content: m.content })), ...(profile.configuration.temperature === undefined ? {} : { temperature: profile.configuration.temperature }), ...(profile.configuration.max_output_tokens === undefined ? {} : { max_tokens: profile.configuration.max_output_tokens }), response_format: { type: 'json_object' } }, { signal: context.signal });
      const choice = response.choices[0]; const content = choice?.message.content;
      if (!content) throw executionError('PROVIDER_RESPONSE_INVALID');
      return { status: 'succeeded', request_id: request.request_id, content, finish_reason: choice.finish_reason === 'stop' ? 'stop' : choice.finish_reason === 'length' ? 'length' : 'unknown', usage: { input_tokens: response.usage?.prompt_tokens, output_tokens: response.usage?.completion_tokens, total_tokens: response.usage?.total_tokens }, duration_ms: Date.now() - started };
    } catch (error) { return { status: 'failed', request_id: request.request_id, duration_ms: Date.now() - started, error: sanitizeProviderError(error) }; }
  }
}
export function createDeepSeekAdapter(env?: NodeJS.ProcessEnv): OpenAICompatibleAdapter { return new OpenAICompatibleAdapter({ provider_id: 'deepseek-openai-compatible' as ProviderId, base_url: 'https://api.deepseek.com', enabled_flag: 'AI_LAB_DEEPSEEK_ENABLED', credential_env: 'DEEPSEEK_API_KEY', env }); }
export function createDashScopeAdapter(env?: NodeJS.ProcessEnv): OpenAICompatibleAdapter { return new OpenAICompatibleAdapter({ provider_id: 'dashscope-openai-compatible' as ProviderId, base_url: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', enabled_flag: 'AI_LAB_DASHSCOPE_ENABLED', credential_env: 'DASHSCOPE_API_KEY', env }); }

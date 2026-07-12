import type { ProviderUsage } from '../providers/provider-adapter.js';
import { governanceError } from './errors.js';

export type UsageSource = 'provider_reported' | 'estimated' | 'fixture' | 'unavailable';
export type UsageStatus = 'complete' | 'partial' | 'unavailable';
export interface NormalizedUsage {
  readonly input_tokens?: number | undefined; readonly output_tokens?: number | undefined; readonly total_tokens?: number | undefined;
  readonly cached_input_tokens?: number | undefined; readonly reasoning_tokens?: number | undefined;
  readonly request_count: 1; readonly duration_ms?: number | undefined;
  readonly source: UsageSource; readonly status: UsageStatus; readonly confidence: 'high' | 'medium' | 'none';
  readonly fixture_origin?: 'synthetic' | 'sanitized_recorded' | undefined;
}
const MAX = Number.MAX_SAFE_INTEGER;
function token(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > MAX) throw governanceError('USAGE_INVALID');
  return value as number;
}
export function normalizeUsage(usage: ProviderUsage | undefined, duration_ms?: number): NormalizedUsage {
  if (usage === undefined) return { request_count: 1, duration_ms, source: 'unavailable', status: 'unavailable', confidence: 'none' };
  const input = token(usage.input_tokens); const output = token(usage.output_tokens); const total = token(usage.total_tokens);
  const cached = token(usage.cached_input_tokens); const reasoning = token(usage.reasoning_tokens);
  if (total !== undefined && input !== undefined && output !== undefined && total !== input + output) throw governanceError('USAGE_INVALID');
  if (cached !== undefined && input !== undefined && cached > input) throw governanceError('USAGE_INVALID');
  const source = usage.source ?? 'provider_reported';
  if (source === 'unavailable') return { request_count: 1, duration_ms, source, status: 'unavailable', confidence: 'none' };
  const status = input !== undefined && output !== undefined && total !== undefined ? 'complete' : 'partial';
  return { input_tokens: input, output_tokens: output, total_tokens: total, cached_input_tokens: cached, reasoning_tokens: reasoning, request_count: 1, duration_ms, source, status, confidence: status === 'complete' ? 'high' : 'medium', fixture_origin: usage.fixture_origin };
}
export function estimateUsage(request: unknown, expectedOutputTokens: number | undefined): NormalizedUsage {
  if (!Number.isSafeInteger(expectedOutputTokens) || expectedOutputTokens! < 0) throw governanceError('USAGE_ESTIMATE_UNAVAILABLE');
  const bytes = Buffer.byteLength(JSON.stringify(request), 'utf8');
  const input = Math.ceil(bytes / 4); const output = expectedOutputTokens!; const total = input + output;
  if (!Number.isSafeInteger(total)) throw governanceError('USAGE_INVALID');
  return { input_tokens: input, output_tokens: output, total_tokens: total, request_count: 1, source: 'estimated', status: 'complete', confidence: 'medium' };
}

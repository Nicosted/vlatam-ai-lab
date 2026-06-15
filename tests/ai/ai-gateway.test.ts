/**
 * Unit tests for AI Gateway
 * All HTTP fetch calls are mocked — no live Cloudflare API calls.
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  CloudflareAIGateway,
  createAIGateway,
  DEFAULT_GATEWAY_CONFIG,
  type AIGatewayConfig,
} from '../../src/ai/ai-gateway.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<AIGatewayConfig>): AIGatewayConfig {
  return {
    ...DEFAULT_GATEWAY_CONFIG,
    accountId: 'test-account-123',
    ...overrides,
  };
}

function makeOkResponse(content: string, fromCache = false): Response {
  const headers = new Headers();
  if (fromCache) headers.set('cf-aig-cache-status', 'HIT');
  return new Response(
    JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }),
    { status: 200, headers }
  );
}

function makeErrorResponse(status: number): Response {
  return new Response('Bad Gateway', { status });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CloudflareAIGateway.buildGatewayUrl', () => {
  it('builds correct gateway URL', () => {
    const gw = new CloudflareAIGateway(makeConfig(), true);
    const url = gw.buildGatewayUrl('deepseek/deepseek-chat');
    assert.equal(
      url,
      'https://gateway.ai.cloudflare.com/v1/test-account-123/vlatam-ai-lab-gateway/deepseek/deepseek-chat'
    );
  });
});

describe('CloudflareAIGateway.generate — feature flag disabled', () => {
  it('returns passthrough response without calling fetch', async () => {
    const gw = new CloudflareAIGateway(makeConfig(), false);
    const result = await gw.generate('test prompt');
    assert.equal(result.content, '');
    assert.equal(result.usage.fallbackUsed, false);
    assert.equal(result.usage.fromCache, false);
    assert.ok(result.usage.traceId.startsWith('aig-'));
  });
});

describe('CloudflareAIGateway.generate — feature flag enabled', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns content from successful response', async () => {
    globalThis.fetch = mock.fn(async () => makeOkResponse('Test answer'));
    const gw = new CloudflareAIGateway(makeConfig(), true);
    const result = await gw.generate('test prompt');
    assert.equal(result.content, 'Test answer');
    assert.equal(result.usage.fallbackUsed, false);
    assert.equal(result.usage.fromCache, false);
  });

  it('marks fromCache true when CF-AIG-Cache-Status is HIT', async () => {
    globalThis.fetch = mock.fn(async () => makeOkResponse('Cached answer', true));
    const gw = new CloudflareAIGateway(makeConfig(), true);
    const result = await gw.generate('cached prompt');
    assert.equal(result.usage.fromCache, true);
  });

  it('throws on non-OK non-429 HTTP error', async () => {
    globalThis.fetch = mock.fn(async () => makeErrorResponse(500));
    const gw = new CloudflareAIGateway(makeConfig(), true);
    await assert.rejects(
      () => gw.generate('fail prompt'),
      (err: unknown) => err instanceof Error && err.message.includes('500')
    );
  });
});

describe('CloudflareAIGateway.generateWithFallback', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns from default model on first try', async () => {
    globalThis.fetch = mock.fn(async () => makeOkResponse('Primary answer'));
    const gw = new CloudflareAIGateway(makeConfig(), true);
    const result = await gw.generateWithFallback('prompt');
    assert.equal(result.content, 'Primary answer');
    assert.equal(result.usage.fallbackUsed, false);
  });

  it('falls back to second model on primary failure', async () => {
    let callCount = 0;
    globalThis.fetch = mock.fn(async () => {
      callCount++;
      if (callCount === 1) return makeErrorResponse(500);
      return makeOkResponse('Fallback answer');
    });

    const gw = new CloudflareAIGateway(makeConfig(), true);
    const result = await gw.generateWithFallback('prompt');
    assert.equal(result.content, 'Fallback answer');
    assert.equal(result.usage.fallbackUsed, true);
  });

  it('returns passthrough when feature flag is disabled', async () => {
    const gw = new CloudflareAIGateway(makeConfig(), false);
    const result = await gw.generateWithFallback('prompt');
    assert.equal(result.content, '');
    assert.equal(result.usage.fallbackUsed, false);
  });
});

describe('CloudflareAIGateway.trackUsage', () => {
  it('is a no-op when feature flag is disabled', async () => {
    const gw = new CloudflareAIGateway(makeConfig(), false);
    await assert.doesNotReject(() =>
      gw.trackUsage({
        model: 'test',
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        costUsd: 0.0001,
        fromCache: false,
        fallbackUsed: false,
        traceId: 'aig-test',
        durationMs: 100,
      })
    );
  });
});

describe('createAIGateway', () => {
  it('creates a CloudflareAIGateway instance', () => {
    const gw = createAIGateway('my-account', false);
    assert.ok(gw instanceof CloudflareAIGateway);
  });

  it('returns passthrough when flag disabled', async () => {
    const gw = createAIGateway('my-account', false);
    const result = await gw.generate('prompt');
    assert.equal(result.content, '');
  });
});

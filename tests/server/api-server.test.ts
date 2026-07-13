import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  cleanupExpiredEntries,
  getRateLimitStoreSize,
  handleClassifierRequest
} from '../../src/server/api-server.js';

const SOURCE_ID = 'infoleg';
const ARTIFACT_ID = 'artifact--infoleg--extraction-001';

interface HttpResult {
  readonly statusCode: number;
  readonly contentType: string | null;
  readonly body: unknown;
  readonly rawBody: string;
  readonly headers: Record<string, string>;
}

interface RequestOptions {
  readonly apiKey?: string | null;
  readonly ip?: string;
}

let testRoot = '';
let requestSequence = 0;

function exportPath(): string {
  return path.join(testRoot, 'data', 'exports', SOURCE_ID, `${ARTIFACT_ID}--export.json`);
}

function validExport(): Record<string, unknown> {
  return {
    export_id: `${ARTIFACT_ID}--export`,
    artifact_id: ARTIFACT_ID,
    source_id: SOURCE_ID,
    exported_at: '2026-06-16T20:00:00Z',
    classification_candidate: { ncm_code: '42029200110V', confidence: 0.82 },
    extracted_evidence: [
      {
        claim_id: 'claim-001',
        claim_type: 'classification',
        text: 'Classification evidence',
        confidence: 0.82
      }
    ],
    schema_version: '1.0.0'
  };
}

function writeExport(content: string): void {
  mkdirSync(path.dirname(exportPath()), { recursive: true });
  writeFileSync(exportPath(), content, 'utf-8');
}

async function request(requestPath: string, options: RequestOptions = {}): Promise<HttpResult> {
  let statusCode = 0;
  let contentType: string | null = null;
  let rawBody = '';
  let responseHeaders: Record<string, string> = {};
  const responseState = { headersSent: false, writableEnded: false };
  const response = {
    get headersSent() {
      return responseState.headersSent;
    },
    get writableEnded() {
      return responseState.writableEnded;
    },
    writeHead(code: number, headers: Record<string, string>) {
      statusCode = code;
      contentType = headers['Content-Type'] ?? null;
      responseHeaders = headers;
      responseState.headersSent = true;
      return this;
    },
    end(body?: string) {
      rawBody = body ?? '';
      responseState.writableEnded = true;
      return this;
    }
  } as unknown as ServerResponse;
  const incomingRequest = {
    method: 'GET',
    url: requestPath,
    headers: options.apiKey === null ? {} : { 'x-vlatam-ai-lab-key': options.apiKey ?? 'test-api-key' },
    socket: { remoteAddress: options.ip ?? `test-ip-${requestSequence++}` }
  } as unknown as IncomingMessage;

  await handleClassifierRequest(incomingRequest, response, {
    data_root: testRoot
  });

  return {
    statusCode,
    contentType,
    body: contentType === 'application/json' ? (JSON.parse(rawBody) as unknown) : rawBody,
    rawBody,
    headers: responseHeaders
  };
}

beforeEach(() => {
  testRoot = mkdtempSync(path.join(tmpdir(), 'api-server-'));
  process.env['AI_LAB_API_KEY'] = 'test-api-key';
  delete process.env['AI_LAB_API_KEYS'];
  delete process.env['RATE_LIMIT_WINDOW_MS'];
  delete process.env['RATE_LIMIT_MAX'];
});

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true });
  delete process.env['AI_LAB_API_KEY'];
  delete process.env['AI_LAB_API_KEYS'];
  delete process.env['RATE_LIMIT_WINDOW_MS'];
  delete process.env['RATE_LIMIT_MAX'];
});

describe('handleClassifierRequest', () => {
  it('returns a healthy response without exposing internal state', async () => {
    const beforeRequest = Date.now();
    const response = await request('/health');
    const afterRequest = Date.now();

    assert.equal(response.statusCode, 200);
    assert.equal(response.contentType, 'application/json');
    assert.equal(typeof response.body, 'object');
    assert.notEqual(response.body, null);

    const health = response.body as Record<string, unknown>;
    assert.equal(health['status'], 'healthy');
    assert.equal(health['version'], '1.0.0');
    assert.equal(typeof health['timestamp'], 'string');
    const timestamp = Date.parse(health['timestamp'] as string);
    assert.equal(Number.isNaN(timestamp), false);
    assert.ok(timestamp >= beforeRequest && timestamp <= afterRequest);
    assert.deepEqual(Object.keys(health).sort(), ['status', 'timestamp', 'version']);
  });

  it('keeps the health endpoint public without an API key', async () => {
    const response = await request('/health', { apiKey: null });

    assert.equal(response.statusCode, 200);
  });

  it('renders the regulatory research workspace page without requiring an API key', async () => {
    const response = await request(
      '/research/regulatory/ar-es-ecological-agrochemicals',
      {
        apiKey: null,
      },
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.contentType, 'text/html; charset=utf-8');
    assert.match(response.rawBody, /Regulatory Research Workspace/);
    assert.match(
      response.rawBody,
      /Export of ecological agrochemicals from Argentina to Spain/,
    );
    assert.match(response.rawBody, /This is a regulatory research workspace/);
    assert.match(response.rawBody, /It is not final legal\/customs advice/);
    assert.match(response.rawBody, /Missing Evidence/);
    assert.match(response.rawBody, /professional review/);
    assert.match(response.rawBody, /Dossier identity/);
    assert.match(response.rawBody, /Evidence Inventory/);
    assert.match(response.rawBody, /Jurisdiction Coverage/);
    assert.match(response.rawBody, /intake incomplete/);
  });

  it('returns 401 when the classifier API key is missing', async () => {
    const response = await request(`/api/classifier/${SOURCE_ID}/${ARTIFACT_ID}`, {
      apiKey: null
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, {
      error: 'Unauthorized',
      message: 'Invalid or missing API key'
    });
  });

  it('returns 401 when the classifier API key is invalid', async () => {
    const response = await request(`/api/classifier/${SOURCE_ID}/${ARTIFACT_ID}`, {
      apiKey: 'invalid-key'
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, {
      error: 'Unauthorized',
      message: 'Invalid or missing API key'
    });
  });

  it('returns a validated export with a JSON content type', async () => {
    const artifact = validExport();
    writeExport(JSON.stringify(artifact));

    const response = await request(`/api/classifier/${SOURCE_ID}/${ARTIFACT_ID}`);

    assert.equal(response.statusCode, 200);
    assert.equal(response.contentType, 'application/json');
    assert.deepEqual(response.body, artifact);
  });

  it('accepts every configured comma-separated API key', async () => {
    const artifact = validExport();
    writeExport(JSON.stringify(artifact));
    process.env['AI_LAB_API_KEYS'] = 'first-key, second-key';

    const firstResponse = await request(`/api/classifier/${SOURCE_ID}/${ARTIFACT_ID}`, {
      apiKey: 'first-key'
    });
    const secondResponse = await request(`/api/classifier/${SOURCE_ID}/${ARTIFACT_ID}`, {
      apiKey: 'second-key'
    });

    assert.equal(firstResponse.statusCode, 200);
    assert.equal(secondResponse.statusCode, 200);
  });

  it('allows requests within the per-IP rate limit', async () => {
    process.env['RATE_LIMIT_MAX'] = '2';

    const firstResponse = await request('/health', {
      ip: 'rate-limit-allowed'
    });
    const secondResponse = await request('/health', {
      ip: 'rate-limit-allowed'
    });

    assert.equal(firstResponse.statusCode, 200);
    assert.equal(secondResponse.statusCode, 200);
  });

  it('returns 429 with Retry-After after the per-IP limit is exceeded', async () => {
    process.env['RATE_LIMIT_MAX'] = '1';

    await request('/health', { ip: 'rate-limit-exceeded' });
    const response = await request('/health', { ip: 'rate-limit-exceeded' });

    assert.equal(response.statusCode, 429);
    assert.deepEqual(response.body, {
      error: 'Too Many Requests',
      message: 'Rate limit exceeded'
    });
    assert.equal(response.headers['Retry-After'], '60');
  });

  it('resets the per-IP rate limit after the window expires', async () => {
    process.env['RATE_LIMIT_MAX'] = '1';
    process.env['RATE_LIMIT_WINDOW_MS'] = '10';

    await request('/health', { ip: 'rate-limit-reset' });
    const limitedResponse = await request('/health', {
      ip: 'rate-limit-reset'
    });
    await new Promise((resolve) => setTimeout(resolve, 15));
    const resetResponse = await request('/health', { ip: 'rate-limit-reset' });

    assert.equal(limitedResponse.statusCode, 429);
    assert.equal(resetResponse.statusCode, 200);
  });

  it('tracks rate limits separately for different IP addresses', async () => {
    process.env['RATE_LIMIT_MAX'] = '1';

    await request('/health', { ip: 'rate-limit-ip-one' });
    const limitedResponse = await request('/health', {
      ip: 'rate-limit-ip-one'
    });
    const separateIpResponse = await request('/health', {
      ip: 'rate-limit-ip-two'
    });

    assert.equal(limitedResponse.statusCode, 429);
    assert.equal(separateIpResponse.statusCode, 200);
  });

  it('cleans up expired entries from the rate limit store', async () => {
    const originalDateNow = Date.now;
    let mockTime = originalDateNow() + 61_000;

    Date.now = () => mockTime;
    try {
      cleanupExpiredEntries();
      assert.equal(getRateLimitStoreSize(), 0);

      for (let index = 0; index < 10; index += 1) {
        await request('/health', { ip: `192.168.1.${index}` });
      }

      assert.equal(getRateLimitStoreSize(), 10);

      mockTime += 70_000;
      cleanupExpiredEntries();

      assert.equal(getRateLimitStoreSize(), 0);
    } finally {
      Date.now = originalDateNow;
    }
  });

  it('returns 404 for an unknown endpoint', async () => {
    const response = await request('/api/unknown');

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, {
      error: 'Not Found',
      message: 'Endpoint not found'
    });
  });

  it('returns 400 for an invalid source_id', async () => {
    const response = await request(`/api/classifier/INFOLEG/${ARTIFACT_ID}`);

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, {
      error: 'Bad Request',
      message: 'Invalid source_id format'
    });
  });

  it('returns 400 for an invalid artifact_id', async () => {
    const response = await request(`/api/classifier/${SOURCE_ID}/random-id`);

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, {
      error: 'Bad Request',
      message: 'Invalid artifact_id format'
    });
  });

  it('returns 404 when the export does not exist', async () => {
    const response = await request(`/api/classifier/${SOURCE_ID}/${ARTIFACT_ID}`);

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, {
      error: 'Not Found',
      message: 'Export artifact not found'
    });
  });

  it('returns 500 for corrupted JSON without exposing an absolute path', async () => {
    writeExport('{not-json');

    const response = await request(`/api/classifier/${SOURCE_ID}/${ARTIFACT_ID}`);

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, {
      error: 'Internal Server Error',
      message: 'Artifact could not be read'
    });
    assert.equal(response.rawBody.includes(testRoot), false);
  });

  it('returns 500 and does not serve an artifact that fails schema validation', async () => {
    writeExport(JSON.stringify({ ...validExport(), schema_version: '' }));

    const response = await request(`/api/classifier/${SOURCE_ID}/${ARTIFACT_ID}`);

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, {
      error: 'Internal Server Error',
      message: 'Artifact validation failed'
    });
    assert.equal(response.rawBody.includes(testRoot), false);
  });

  it('blocks encoded path traversal without exposing filesystem paths', async () => {
    const response = await request(`/api/classifier/%2E%2E%2Fetc/${ARTIFACT_ID}`);

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, {
      error: 'Bad Request',
      message: 'Invalid source_id format'
    });
    assert.equal(response.rawBody.includes(testRoot), false);
    assert.equal(response.rawBody.includes(tmpdir()), false);
  });

  it('never serves an export file carrying reviewer or governance metadata', async () => {
    writeExport(
      JSON.stringify({
        ...validExport(),
        reviewer: 'internal-reviewer-1',
        governance: { downstream_allowed: true }
      })
    );

    const response = await request(`/api/classifier/${SOURCE_ID}/${ARTIFACT_ID}`);

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, {
      error: 'Internal Server Error',
      message: 'Artifact validation failed'
    });
    assert.equal(response.rawBody.includes('internal-reviewer-1'), false);
    assert.equal(response.rawBody.includes('downstream_allowed'), false);
  });

  it('sets hardening headers on JSON responses', async () => {
    writeExport(JSON.stringify(validExport()));

    const success = await request(`/api/classifier/${SOURCE_ID}/${ARTIFACT_ID}`);
    assert.equal(success.statusCode, 200);
    assert.equal(success.headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(success.headers['Cache-Control'], 'no-store');

    const unauthorized = await request(`/api/classifier/${SOURCE_ID}/${ARTIFACT_ID}`, {
      apiKey: null
    });
    assert.equal(unauthorized.statusCode, 401);
    assert.equal(unauthorized.headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(unauthorized.headers['Cache-Control'], 'no-store');
  });
});

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { handleClassifierRequest } from '../../src/server/api-server.js';

const SOURCE_ID = 'infoleg';
const ARTIFACT_ID = 'artifact--infoleg--extraction-001';

interface HttpResult {
  readonly statusCode: number;
  readonly contentType: string | null;
  readonly body: unknown;
  readonly rawBody: string;
}

let testRoot = '';

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

async function request(requestPath: string): Promise<HttpResult> {
  let statusCode = 0;
  let contentType: string | null = null;
  let rawBody = '';
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
    url: requestPath
  } as IncomingMessage;

  await handleClassifierRequest(incomingRequest, response, {
    data_root: testRoot
  });

  return {
    statusCode,
    contentType,
    body: JSON.parse(rawBody) as unknown,
    rawBody
  };
}

beforeEach(() => {
  testRoot = mkdtempSync(path.join(tmpdir(), 'api-server-'));
});

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true });
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

  it('returns a validated export with a JSON content type', async () => {
    const artifact = validExport();
    writeExport(JSON.stringify(artifact));

    const response = await request(`/api/classifier/${SOURCE_ID}/${ARTIFACT_ID}`);

    assert.equal(response.statusCode, 200);
    assert.equal(response.contentType, 'application/json');
    assert.deepEqual(response.body, artifact);
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
});

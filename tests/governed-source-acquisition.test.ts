import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  acquireSource,
  SourceAcquisitionError,
} from '../src/acquisition/governed-source-acquisition.js';

async function withTemporaryDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'vlatam-ai-lab-acquisition-'));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function mockFetch(run: typeof fetch): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = run;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

test('rejects non-HTTPS and non-allowlisted source URLs before any network request', async () => {
  await assert.rejects(
    acquireSource({
      sourceId: 'arca',
      sourceUrl: 'http://www.arca.gob.ar/aduana/arancelintegrado/',
      outputDirectory: '/tmp/unused',
      mode: 'live',
    }),
    (error: unknown) =>
      error instanceof SourceAcquisitionError && error.code === 'INVALID_URL',
  );

  await assert.rejects(
    acquireSource({
      sourceId: 'arca',
      sourceUrl: 'https://example.com/nomenclador.txt',
      outputDirectory: '/tmp/unused',
      mode: 'live',
    }),
    (error: unknown) =>
      error instanceof SourceAcquisitionError && error.code === 'HOST_NOT_ALLOWED',
  );
});

test('rejects path traversal and malformed source IDs', async () => {
  for (const sourceId of ['../../escape', '../escape', 'ARCA', 'arca_source', 'arca/other']) {
    await assert.rejects(
      acquireSource({
        sourceId,
        sourceUrl: 'https://www.arca.gob.ar/aduana/arancelintegrado/',
        outputDirectory: '/tmp/unused',
        mode: 'replay',
        replayPath: '/tmp/unused',
        capturedAt: new Date('2026-07-21T12:00:00.000Z'),
      }),
      (error: unknown) =>
        error instanceof SourceAcquisitionError && error.code === 'INVALID_SOURCE_ID',
    );
  }
});

test('writes an immutable replay pair with deterministic provenance', async () => {
  await withTemporaryDirectory(async (directory) => {
    const fixturePath = join(directory, 'nomenclador.txt');
    await writeFile(fixturePath, '2@4202.92.00@10.00@20.00@3.00@@@@@BOLSOS\n');
    const request = {
      sourceId: 'ar-arca-arancel-integrado',
      sourceUrl: 'https://www.arca.gob.ar/aduana/arancelintegrado/',
      outputDirectory: join(directory, 'output'),
      mode: 'replay' as const,
      replayPath: fixturePath,
      capturedAt: new Date('2026-07-21T12:00:00.000Z'),
    };

    const record = await acquireSource(request);
    assert.equal(record.schema_version, '1.0.0');
    assert.equal(record.mode, 'replay');
    assert.equal(record.captured_at, '2026-07-21T12:00:00.000Z');
    assert.equal(record.source_host, 'www.arca.gob.ar');
    assert.match(record.acquisition_id, /^ar-arca-arancel-integrado--2026-07-21--[a-f0-9]{16}$/);
    assert.equal(await readFile(record.raw_path, 'utf8'), await readFile(fixturePath, 'utf8'));

    const metadataText = await readFile(record.metadata_path, 'utf8');
    const metadata = JSON.parse(metadataText) as Record<string, unknown>;
    assert.equal(metadata['sha256'], record.sha256);
    assert.equal(metadata['raw_path'], record.raw_path);
    assert.equal(metadata['effective_url'], 'https://www.arca.gob.ar/aduana/arancelintegrado/');

    await assert.rejects(
      acquireSource(request),
      (error: unknown) =>
        error instanceof SourceAcquisitionError && error.code === 'ACQUISITION_EXISTS',
    );
    assert.equal(await readFile(record.metadata_path, 'utf8'), metadataText);
  });
});

test('requires explicit deterministic replay provenance', async () => {
  await assert.rejects(
    acquireSource({
      sourceId: 'arca',
      sourceUrl: 'https://www.arca.gob.ar/aduana/arancelintegrado/',
      outputDirectory: '/tmp/unused',
      mode: 'replay',
      replayPath: '/tmp/fixture',
    }),
    (error: unknown) =>
      error instanceof SourceAcquisitionError &&
      error.code === 'REPLAY_CAPTURE_TIME_REQUIRED',
  );
});

test('fails closed when replay mode has no fixture', async () => {
  await assert.rejects(
    acquireSource({
      sourceId: 'arca',
      sourceUrl: 'https://www.arca.gob.ar/aduana/arancelintegrado/',
      outputDirectory: '/tmp/unused',
      mode: 'replay',
      capturedAt: new Date('2026-07-21T12:00:00.000Z'),
    }),
    (error: unknown) =>
      error instanceof SourceAcquisitionError && error.code === 'REPLAY_PATH_REQUIRED',
  );
});

test('rejects a redirect to a non-allowlisted host before following it', async () => {
  let calls = 0;
  const restore = mockFetch(async () => {
    calls += 1;
    return new Response(null, {
      status: 302,
      headers: { location: 'https://evil.example/file.txt' },
    });
  });
  try {
    await assert.rejects(
      acquireSource({
        sourceId: 'arca',
        sourceUrl: 'https://www.arca.gob.ar/aduana/arancelintegrado/',
        outputDirectory: '/tmp/unused',
        mode: 'live',
      }),
      (error: unknown) =>
        error instanceof SourceAcquisitionError &&
        error.code === 'REDIRECT_HOST_NOT_ALLOWED',
    );
    assert.equal(calls, 1);
  } finally {
    restore();
  }
});

test('allows an HTTPS redirect between compiled official hosts', async () => {
  await withTemporaryDirectory(async (directory) => {
    let calls = 0;
    const restore = mockFetch(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://www.afip.gob.ar/final.txt' },
        });
      }
      return new Response('official-data', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
    });
    try {
      const record = await acquireSource({
        sourceId: 'arca',
        sourceUrl: 'https://www.arca.gob.ar/start',
        outputDirectory: directory,
        mode: 'live',
        capturedAt: new Date('2026-07-21T12:00:00.000Z'),
      });
      assert.equal(calls, 2);
      assert.equal(record.effective_url, 'https://www.afip.gob.ar/final.txt');
    } finally {
      restore();
    }
  });
});

test('rejects HTTPS downgrade redirects', async () => {
  const restore = mockFetch(async () =>
    new Response(null, {
      status: 302,
      headers: { location: 'http://www.arca.gob.ar/file.txt' },
    }),
  );
  try {
    await assert.rejects(
      acquireSource({
        sourceId: 'arca',
        sourceUrl: 'https://www.arca.gob.ar/start',
        outputDirectory: '/tmp/unused',
        mode: 'live',
      }),
      (error: unknown) =>
        error instanceof SourceAcquisitionError &&
        error.code === 'REDIRECT_HOST_NOT_ALLOWED',
    );
  } finally {
    restore();
  }
});

test('cancels streamed bodies immediately when the maximum is exceeded', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(4));
      controller.enqueue(new Uint8Array(4));
    },
    cancel() {
      cancelled = true;
    },
  });
  const restore = mockFetch(async () =>
    new Response(stream, {
      status: 200,
      headers: { 'content-type': 'application/octet-stream' },
    }),
  );
  try {
    await assert.rejects(
      acquireSource({
        sourceId: 'arca',
        sourceUrl: 'https://www.arca.gob.ar/file.bin',
        outputDirectory: '/tmp/unused',
        mode: 'live',
        maxBytes: 6,
      }),
      (error: unknown) =>
        error instanceof SourceAcquisitionError && error.code === 'CONTENT_TOO_LARGE',
    );
    assert.equal(cancelled, true);
  } finally {
    restore();
  }
});

test('fails closed when Content-Type is missing or unsupported', async () => {
  for (const headers of [{}, { 'content-type': 'application/json' }]) {
    const restore = mockFetch(async () => new Response('unexpected', { status: 200, headers }));
    try {
      await assert.rejects(
        acquireSource({
          sourceId: 'arca',
          sourceUrl: 'https://www.arca.gob.ar/file',
          outputDirectory: '/tmp/unused',
          mode: 'live',
        }),
        (error: unknown) =>
          error instanceof SourceAcquisitionError &&
          error.code === 'CONTENT_TYPE_NOT_ALLOWED',
      );
    } finally {
      restore();
    }
  }
});

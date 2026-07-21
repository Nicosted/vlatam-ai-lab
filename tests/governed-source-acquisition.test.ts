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

test('writes immutable replay bytes and provenance metadata with a deterministic hash', async () => {
  await withTemporaryDirectory(async (directory) => {
    const fixturePath = join(directory, 'nomenclador.txt');
    await writeFile(fixturePath, '2@4202.92.00@10.00@20.00@3.00@@@@@BOLSOS\n');

    const record = await acquireSource({
      sourceId: 'ar-arca-arancel-integrado',
      sourceUrl: 'https://www.arca.gob.ar/aduana/arancelintegrado/',
      outputDirectory: join(directory, 'output'),
      mode: 'replay',
      replayPath: fixturePath,
      capturedAt: new Date('2026-07-21T12:00:00.000Z'),
    });

    assert.equal(record.schema_version, '1.0.0');
    assert.equal(record.mode, 'replay');
    assert.equal(record.captured_at, '2026-07-21T12:00:00.000Z');
    assert.equal(record.source_host, 'www.arca.gob.ar');
    assert.match(record.acquisition_id, /^ar-arca-arancel-integrado--2026-07-21--[a-f0-9]{16}$/);
    assert.equal(await readFile(record.raw_path, 'utf8'), await readFile(fixturePath, 'utf8'));

    const metadata = JSON.parse(await readFile(record.metadata_path, 'utf8')) as Record<
      string,
      unknown
    >;
    assert.equal(metadata['sha256'], record.sha256);
    assert.equal(metadata['raw_path'], record.raw_path);
    assert.equal(metadata['effective_url'], 'https://www.arca.gob.ar/aduana/arancelintegrado/');
  });
});

test('fails closed when replay mode has no fixture', async () => {
  await assert.rejects(
    acquireSource({
      sourceId: 'arca',
      sourceUrl: 'https://www.arca.gob.ar/aduana/arancelintegrado/',
      outputDirectory: '/tmp/unused',
      mode: 'replay',
    }),
    (error: unknown) =>
      error instanceof SourceAcquisitionError && error.code === 'REPLAY_PATH_REQUIRED',
  );
});

test('rejects a redirect to a non-allowlisted host before following it', async () => {
  await withTemporaryDirectory(async (directory) => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(null, {
        status: 302,
        headers: { location: 'https://evil.example/file.txt' },
      });
    };

    try {
      await assert.rejects(
        acquireSource({
          sourceId: 'arca',
          sourceUrl: 'https://www.arca.gob.ar/aduana/arancelintegrado/',
          outputDirectory: directory,
          mode: 'live',
        }),
        (error: unknown) =>
          error instanceof SourceAcquisitionError &&
          error.code === 'REDIRECT_HOST_NOT_ALLOWED',
      );
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('rejects unsupported live content types before writing files', async () => {
  await withTemporaryDirectory(async (directory) => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response('{"unexpected":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    try {
      await assert.rejects(
        acquireSource({
          sourceId: 'arca',
          sourceUrl: 'https://www.arca.gob.ar/aduana/arancelintegrado/data.json',
          outputDirectory: directory,
          mode: 'live',
        }),
        (error: unknown) =>
          error instanceof SourceAcquisitionError &&
          error.code === 'CONTENT_TYPE_NOT_ALLOWED',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

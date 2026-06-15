/**
 * Unit tests for R2RegulatoryStorage
 * All R2 calls are mocked — no live Cloudflare API calls.
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  R2RegulatoryStorage,
  R2Keys,
  createRegulatoryStorage,
  type DocumentMetadata,
} from '../../src/storage/r2-storage.js';

// ---------------------------------------------------------------------------
// Minimal R2Bucket mock
// ---------------------------------------------------------------------------

function makeR2ObjectMock(key: string, content: ArrayBuffer, customMetadata: Record<string, string> = {}): R2ObjectBody {
  return {
    key,
    size: content.byteLength,
    uploaded: new Date('2026-01-01T00:00:00Z'),
    customMetadata,
    httpMetadata: {},
    arrayBuffer: async () => content,
    text: async () => '',
    json: async () => ({}),
    blob: async () => new Blob(),
    body: null as unknown as ReadableStream,
    bodyUsed: false,
    checksums: {},
    etag: '',
    httpEtag: '',
    storageClass: 'Standard',
    version: '',
    writeHttpMetadata: () => {},
  } as unknown as R2ObjectBody;
}

function makeBucketMock(): {
  bucket: R2Bucket;
  store: Map<string, { content: ArrayBuffer; meta: Record<string, string> }>;
} {
  const store = new Map<string, { content: ArrayBuffer; meta: Record<string, string> }>();

  const bucket: R2Bucket = {
    put: mock.fn(async (key: string, value: ArrayBuffer | ArrayBufferView | string | ReadableStream | Blob, options?: R2PutOptions) => {
      const content = value instanceof ArrayBuffer ? value : new ArrayBuffer(0);
      const meta = (options?.customMetadata ?? {}) as Record<string, string>;
      store.set(key, { content, meta });
      return null as unknown as R2Object;
    }),
    get: mock.fn(async (key: string) => {
      const entry = store.get(key);
      if (!entry) return null;
      return makeR2ObjectMock(key, entry.content, entry.meta);
    }),
    delete: mock.fn(async (key: string) => {
      store.delete(key);
    }),
    head: mock.fn(async (key: string) => {
      const entry = store.get(key);
      if (!entry) return null;
      return makeR2ObjectMock(key, entry.content, entry.meta) as unknown as R2Object;
    }),
    list: mock.fn(async (options?: R2ListOptions) => {
      const prefix = options?.prefix;
      const keys = [...store.keys()].filter(k => prefix === undefined || k.startsWith(prefix));
      return {
        objects: keys.map(k => ({
          key: k,
          size: store.get(k)!.content.byteLength,
          uploaded: new Date(),
          etag: '',
          httpEtag: '',
          checksums: { toJSON: () => ({}) },
          storageClass: 'Standard',
          version: '',
          customMetadata: store.get(k)!.meta,
          httpMetadata: {},
          writeHttpMetadata: () => {},
          arrayBuffer: async () => store.get(k)!.content,
          text: async () => '',
          json: async () => ({}),
          blob: async () => new Blob(),
          body: null as unknown as ReadableStream,
          bodyUsed: false,
        })),
        truncated: false,
        delimitedPrefixes: [],
      } as unknown as R2Objects;
    }),
    createMultipartUpload: mock.fn(async () => ({ uploadId: '', key: '' }) as unknown as R2MultipartUpload),
    resumeMultipartUpload: mock.fn(() => ({ uploadId: '', key: '' }) as unknown as R2MultipartUpload),
  };

  return { bucket, store };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('R2Keys', () => {
  it('builds originalDocument key', () => {
    assert.equal(R2Keys.originalDocument('arca', 'arancel.xlsx'), 'sources/arca/original/arancel.xlsx');
  });

  it('builds snapshot key', () => {
    assert.equal(R2Keys.snapshot('arca', 'snap-001'), 'snapshots/arca/snap-001.json');
  });

  it('builds delta key', () => {
    assert.equal(R2Keys.delta('arca', 'snap-001'), 'snapshots/arca/delta-snap-001.json');
  });

  it('builds evidencePacket key', () => {
    assert.equal(R2Keys.evidencePacket('evp-001'), 'evidence/evp-001.json');
  });

  it('builds reviewManifest key', () => {
    assert.equal(R2Keys.reviewManifest('rm-001'), 'manifests/rm-001.json');
  });
});

describe('R2RegulatoryStorage.put + get', () => {
  it('stores and retrieves a document', async () => {
    const { bucket } = makeBucketMock();
    const storage = new R2RegulatoryStorage(bucket);
    const content = new TextEncoder().encode('{"test":true}').buffer as ArrayBuffer;
    const meta: DocumentMetadata = {
      sourceId: 'arca',
      contentType: 'application/json',
      capturedAt: '2026-01-01T00:00:00Z',
      schemaVersion: '1.0.0',
      humanReviewRequired: true,
      downstreamAllowed: false,
    };

    await storage.put('snapshots/arca/snap-001.json', content, meta);
    const result = await storage.get('snapshots/arca/snap-001.json');

    assert.ok(result !== null);
    assert.equal(result.key, 'snapshots/arca/snap-001.json');
    assert.equal(result.metadata.sourceId, 'arca');
    assert.equal(result.metadata.humanReviewRequired, true);
    assert.equal(result.metadata.downstreamAllowed, false);
  });

  it('returns null for missing key', async () => {
    const { bucket } = makeBucketMock();
    const storage = new R2RegulatoryStorage(bucket);
    const result = await storage.get('nonexistent/key');
    assert.equal(result, null);
  });

  it('stores document with snapshotId in metadata', async () => {
    const { bucket } = makeBucketMock();
    const storage = new R2RegulatoryStorage(bucket);
    const content = new ArrayBuffer(8);
    const meta: DocumentMetadata = {
      sourceId: 'arca',
      snapshotId: 'snap-001',
      contentType: 'application/json',
      capturedAt: '2026-01-01T00:00:00Z',
      schemaVersion: '1.0.0',
      humanReviewRequired: true,
      downstreamAllowed: false,
    };

    await storage.put('test/key', content, meta);
    const result = await storage.get('test/key');

    assert.ok(result !== null);
    assert.equal(result.metadata.snapshotId, 'snap-001');
  });
});

describe('R2RegulatoryStorage.delete', () => {
  it('removes stored document', async () => {
    const { bucket } = makeBucketMock();
    const storage = new R2RegulatoryStorage(bucket);
    const content = new ArrayBuffer(4);
    await storage.put('test/delete-me', content);
    await storage.delete('test/delete-me');
    const result = await storage.get('test/delete-me');
    assert.equal(result, null);
  });
});

describe('R2RegulatoryStorage.list', () => {
  it('lists all keys without prefix', async () => {
    const { bucket } = makeBucketMock();
    const storage = new R2RegulatoryStorage(bucket);
    await storage.put('snapshots/arca/a.json', new ArrayBuffer(1));
    await storage.put('snapshots/infoleg/b.json', new ArrayBuffer(1));
    const keys = await storage.list();
    assert.equal(keys.length, 2);
  });

  it('filters keys by prefix', async () => {
    const { bucket } = makeBucketMock();
    const storage = new R2RegulatoryStorage(bucket);
    await storage.put('snapshots/arca/a.json', new ArrayBuffer(1));
    await storage.put('evidence/evp-001.json', new ArrayBuffer(1));
    const keys = await storage.list('snapshots/');
    assert.equal(keys.length, 1);
    assert.ok(keys[0]!.startsWith('snapshots/'));
  });
});

describe('R2RegulatoryStorage.exists', () => {
  it('returns true for existing key', async () => {
    const { bucket } = makeBucketMock();
    const storage = new R2RegulatoryStorage(bucket);
    await storage.put('exists/key', new ArrayBuffer(1));
    assert.equal(await storage.exists('exists/key'), true);
  });

  it('returns false for missing key', async () => {
    const { bucket } = makeBucketMock();
    const storage = new R2RegulatoryStorage(bucket);
    assert.equal(await storage.exists('missing/key'), false);
  });
});

describe('createRegulatoryStorage', () => {
  it('returns null when feature flag is disabled', () => {
    const { bucket } = makeBucketMock();
    const storage = createRegulatoryStorage(bucket, false);
    assert.equal(storage, null);
  });

  it('returns R2RegulatoryStorage when feature flag is enabled', () => {
    const { bucket } = makeBucketMock();
    const storage = createRegulatoryStorage(bucket, true);
    assert.ok(storage !== null);
    assert.ok(storage instanceof R2RegulatoryStorage);
  });
});

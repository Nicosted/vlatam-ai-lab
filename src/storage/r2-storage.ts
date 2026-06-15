/**
 * R2 Regulatory Document Storage
 *
 * Typed interface and implementation for storing regulatory documents,
 * snapshots, evidence packets, and review manifests in Cloudflare R2.
 *
 * Gated by CLOUDFLARE_PIPELINE_V1_ENABLED feature flag.
 * No live R2 calls are made unless the flag is active.
 */

export interface DocumentMetadata {
  readonly sourceId: string;
  readonly snapshotId?: string | undefined;
  readonly contentType: string;
  readonly capturedAt: string;
  readonly schemaVersion: string;
  readonly humanReviewRequired: boolean;
  readonly downstreamAllowed: boolean;
}

export interface StoredDocument {
  readonly key: string;
  readonly content: ArrayBuffer;
  readonly metadata: DocumentMetadata;
  readonly size: number;
  readonly uploadedAt: string;
}

export interface RegulatoryDocumentStorage {
  put(key: string, content: ArrayBuffer, metadata?: DocumentMetadata): Promise<void>;
  get(key: string): Promise<StoredDocument | null>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  exists(key: string): Promise<boolean>;
}

/**
 * R2 key path builders — canonical key structure for regulatory documents.
 */
export const R2Keys = {
  originalDocument: (sourceId: string, filename: string): string =>
    `sources/${sourceId}/original/${filename}`,

  snapshot: (sourceId: string, snapshotId: string): string =>
    `snapshots/${sourceId}/${snapshotId}.json`,

  delta: (sourceId: string, snapshotId: string): string =>
    `snapshots/${sourceId}/delta-${snapshotId}.json`,

  evidencePacket: (evidencePacketId: string): string =>
    `evidence/${evidencePacketId}.json`,

  reviewManifest: (reviewManifestId: string): string =>
    `manifests/${reviewManifestId}.json`,
} as const;

/**
 * Cloudflare R2 implementation of RegulatoryDocumentStorage.
 * Only instantiated when CLOUDFLARE_PIPELINE_V1_ENABLED is active.
 */
export class R2RegulatoryStorage implements RegulatoryDocumentStorage {
  private readonly bucket: R2Bucket;

  constructor(bucket: R2Bucket) {
    this.bucket = bucket;
  }

  async put(key: string, content: ArrayBuffer, metadata?: DocumentMetadata): Promise<void> {
    const r2Metadata: Record<string, string> = metadata
      ? {
          sourceId: metadata.sourceId,
          contentType: metadata.contentType,
          capturedAt: metadata.capturedAt,
          schemaVersion: metadata.schemaVersion,
          humanReviewRequired: String(metadata.humanReviewRequired),
          downstreamAllowed: String(metadata.downstreamAllowed),
          ...(metadata.snapshotId !== undefined && { snapshotId: metadata.snapshotId }),
        }
      : {};

    await this.bucket.put(key, content, {
      httpMetadata: { contentType: metadata?.contentType ?? 'application/octet-stream' },
      customMetadata: r2Metadata,
    });
  }

  async get(key: string): Promise<StoredDocument | null> {
    const object = await this.bucket.get(key);
    if (object === null) return null;

    const content = await object.arrayBuffer();
    const customMeta = object.customMetadata ?? {};

    const rawSnapshotId = customMeta['snapshotId'];
    const metadata: DocumentMetadata = {
      sourceId: customMeta['sourceId'] ?? '',
      ...(rawSnapshotId !== undefined && { snapshotId: rawSnapshotId }),
      contentType: customMeta['contentType'] ?? 'application/octet-stream',
      capturedAt: customMeta['capturedAt'] ?? '',
      schemaVersion: customMeta['schemaVersion'] ?? '1.0.0',
      humanReviewRequired: customMeta['humanReviewRequired'] !== 'false',
      downstreamAllowed: customMeta['downstreamAllowed'] === 'true',
    };

    return {
      key,
      content,
      metadata,
      size: object.size,
      uploadedAt: object.uploaded.toISOString(),
    };
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  async list(prefix?: string | undefined): Promise<string[]> {
    const options: R2ListOptions = {};
    if (prefix !== undefined) options.prefix = prefix;
    const listed = await this.bucket.list(options);
    return listed.objects.map(obj => obj.key);
  }

  async exists(key: string): Promise<boolean> {
    const head = await this.bucket.head(key);
    return head !== null;
  }
}

/**
 * Create storage from R2Bucket binding.
 * Returns null if the feature flag is not enabled.
 */
export function createRegulatoryStorage(
  bucket: R2Bucket,
  featureFlagEnabled: boolean
): RegulatoryDocumentStorage | null {
  if (!featureFlagEnabled) return null;
  return new R2RegulatoryStorage(bucket);
}

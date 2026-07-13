/// <reference types="@cloudflare/workers-types" />
/**
 * R2 Storage usage examples
 *
 * Illustrates how to use R2RegulatoryStorage in a Worker context.
 * This file contains NO live calls — all examples are illustrative.
 *
 * Actual usage requires an R2 bucket binding supplied by a separately approved
 * deployment and CLOUDFLARE_PIPELINE_V1_ENABLED set by that environment.
 */

import {
  R2Keys,
  createRegulatoryStorage,
  type DocumentMetadata,
} from "../src/storage/r2-storage.js";

/**
 * Example: Store a snapshot record in R2
 */
export async function exampleStoreSnapshot(
  bucket: R2Bucket,
  featureFlagEnabled: boolean,
): Promise<void> {
  const storage = createRegulatoryStorage(bucket, featureFlagEnabled);
  if (!storage) {
    console.log("[R2 example] Pipeline flag disabled — storage not created");
    return;
  }

  const snapshotId = `snap-arca-${Date.now()}`;
  const key = R2Keys.snapshot("arca", snapshotId);

  const snapshotRecord = {
    snapshot_id: snapshotId,
    source_id: "arca-ar-official",
    captured_at: new Date().toISOString(),
    capture_method: "approved_fetch",
    freshness_status: "current",
    review_status: "not_reviewed",
    extraction_status: "not_started",
    human_review_required: true,
    downstream_allowed: false,
    schema_version: "1.0.0",
    source_locator: "https://www.afip.gob.ar/aduanas/aranceles/",
  };

  const content = new TextEncoder().encode(JSON.stringify(snapshotRecord))
    .buffer as ArrayBuffer;
  const metadata: DocumentMetadata = {
    sourceId: "arca",
    snapshotId,
    contentType: "application/json",
    capturedAt: snapshotRecord.captured_at,
    schemaVersion: "1.0.0",
    humanReviewRequired: true,
    downstreamAllowed: false,
  };

  await storage.put(key, content, metadata);
  console.log(`[R2 example] Stored snapshot at: ${key}`);
}

/**
 * Example: List all snapshots for a source
 */
export async function exampleListSnapshots(
  bucket: R2Bucket,
  featureFlagEnabled: boolean,
  sourceId: string,
): Promise<string[]> {
  const storage = createRegulatoryStorage(bucket, featureFlagEnabled);
  if (!storage) return [];

  const prefix = `snapshots/${sourceId}/`;
  const keys = await storage.list(prefix);
  console.log(
    `[R2 example] Found ${keys.length} snapshots for source ${sourceId}`,
  );
  return keys;
}

/**
 * Example: Retrieve an evidence packet from R2
 */
export async function exampleGetEvidencePacket(
  bucket: R2Bucket,
  featureFlagEnabled: boolean,
  evidencePacketId: string,
): Promise<Record<string, unknown> | null> {
  const storage = createRegulatoryStorage(bucket, featureFlagEnabled);
  if (!storage) return null;

  const key = R2Keys.evidencePacket(evidencePacketId);
  const result = await storage.get(key);
  if (!result) {
    console.log(`[R2 example] Evidence packet not found: ${evidencePacketId}`);
    return null;
  }

  const text = new TextDecoder().decode(result.content);
  return JSON.parse(text) as Record<string, unknown>;
}

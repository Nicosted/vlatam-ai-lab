// Shared constants and safety helpers for the offline Qwen recorded-response
// fixture (recorder + replay). Keeps demo-only guards, secret scanning, and load
// paths in one place so the record and replay entry points stay consistent.

import path from "node:path";

import { readUtf8File, writeUtf8File } from "../lib/fs.js";
import type { ExtractableEvidencePacket } from "./types.js";
import {
  parseRecordedQwenFixture,
  type RecordedQwenFixture,
} from "./recorded-qwen-response-provider.js";

/** Synthetic, demo-only embedded-evidence packet (the only allowed input). */
export const DEMO_EVIDENCE_PACKET_PATH =
  "snapshots/pcram/extractable-evidence-packet-demo-embedded-evidence.json";

/** Checked-in sanitized recorded-response fixture location. */
export const RECORDED_QWEN_FIXTURE_PATH =
  "snapshots/qwen/recorded-responses/qwen-demo-embedded-evidence.recorded.json";

/** Normalized timestamp used so fixtures never leak real capture wall-clock. */
export const NORMALIZED_RECORDED_AT = "1970-01-01T00:00:00.000Z";

export const RECORDED_FIXTURE_DISCLAIMER =
  "Synthetic demo-only recorded Qwen response shape. Not approved intelligence, " +
  "not classifier-approved, and not downstream-safe. Replay output remains " +
  "draft/unreviewed (human_review_required=true, downstream_allowed=false).";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function loadEvidencePacket(
  relativePath: string,
): Promise<ExtractableEvidencePacket> {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  return JSON.parse(
    await readUtf8File(absolutePath),
  ) as ExtractableEvidencePacket;
}

/**
 * Refuse to record against anything other than the synthetic demo packet. Guards
 * the doctrine that the recorder must never touch customer / authoritative data.
 */
export function assertDemoPacket(packet: ExtractableEvidencePacket): void {
  const metadata = isRecord(packet.metadata) ? packet.metadata : {};
  const isDemo =
    metadata["demo_only"] === true &&
    metadata["non_authoritative"] === true &&
    metadata["classifier_approved"] === false &&
    packet.jurisdiction_scope === "demo";
  if (!isDemo) {
    throw new Error(
      "Recorder refuses to run: input is not the synthetic demo packet " +
        "(requires metadata.demo_only=true, metadata.non_authoritative=true, " +
        "metadata.classifier_approved=false, jurisdiction_scope=demo).",
    );
  }
  if (packet.downstream_allowed !== false) {
    throw new Error(
      "Recorder refuses to run: packet.downstream_allowed must be false.",
    );
  }
}

/**
 * Last-line defense before writing a fixture: ensure no secret-derived value is
 * present in the serialized output. Scans for the live API key (when provided)
 * and for common credential markers.
 */
export function assertNoSecretsInSerializedFixture(
  serialized: string,
  options: { apiKey?: string | undefined } = {},
): void {
  const apiKey = options.apiKey?.trim();
  if (apiKey && apiKey.length > 0 && serialized.includes(apiKey)) {
    throw new Error(
      "Refusing to write fixture: serialized output contains the API key.",
    );
  }
  // Generic markers for bearer tokens / OpenAI-style keys / auth headers.
  const markers = [
    /Bearer\s+[A-Za-z0-9._-]+/i,
    /\bsk-[A-Za-z0-9]{8,}/,
    /authorization/i,
  ];
  for (const marker of markers) {
    if (marker.test(serialized)) {
      throw new Error(
        `Refusing to write fixture: serialized output matched a credential marker (${marker}).`,
      );
    }
  }
}

export async function writeRecordedQwenFixture(
  fixture: RecordedQwenFixture,
  options: { apiKey?: string | undefined; relativePath?: string } = {},
): Promise<string> {
  const relativePath = options.relativePath ?? RECORDED_QWEN_FIXTURE_PATH;
  const serialized = `${JSON.stringify(fixture, null, 2)}\n`;
  assertNoSecretsInSerializedFixture(serialized, { apiKey: options.apiKey });
  const absolutePath = path.resolve(process.cwd(), relativePath);
  await writeUtf8File(absolutePath, serialized);
  return relativePath;
}

export async function loadRecordedQwenFixture(
  relativePath: string = RECORDED_QWEN_FIXTURE_PATH,
): Promise<RecordedQwenFixture> {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const raw = JSON.parse(await readUtf8File(absolutePath)) as unknown;
  const parsed = parseRecordedQwenFixture(raw);
  if (!parsed.ok) {
    throw new Error(
      `Recorded Qwen fixture at ${relativePath} is invalid:\n- ${parsed.errors.join("\n- ")}`,
    );
  }
  return parsed.value;
}

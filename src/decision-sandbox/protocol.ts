/**
 * AI-143 — common adapter protocol construction and framing (pure).
 *
 * Framing `json-line-v1`:
 *  - UTF-8 only; malformed UTF-8 fails.
 *  - Exactly one JSON object per direction, on one line, terminated by
 *    exactly one LF. No BOM, no carriage return, no surrounding
 *    whitespace.
 *  - The line must be compact: re-serialising the parsed object with
 *    `JSON.stringify` must reproduce it byte for byte, so duplicate keys,
 *    insignificant whitespace and alternative number spellings fail
 *    closed instead of being silently resolved.
 *  - Nothing may follow the terminator: a second JSON response is
 *    `response_multiple`, any other trailing stdout is
 *    `response_trailing_output`. An empty stdout is `response_missing`.
 *  - Size is bounded by the caller before decoding.
 *
 * The input line is the AI-140 `registry-json-v1` canonical form of the
 * input envelope, which also satisfies the compactness rule.
 */

import {
  canonicalizeTypedDecisionJson,
  computeTypedDecisionRequestHash,
} from "../decision/canonical.js";
import type { TypedDecisionRequest } from "../decision/contracts.js";
import {
  DECISION_ADAPTER_PROTOCOL,
  DECISION_ADAPTER_PROTOCOL_VERSION,
  type DecisionAdapterInput,
} from "./contracts.js";
import type { DecisionSandboxIssueCode } from "./validation.js";

/** Builds the input envelope for one execution of one typed request. */
export function buildDecisionAdapterInput(
  executionId: string,
  request: TypedDecisionRequest,
): DecisionAdapterInput {
  return {
    contract: "decision_adapter_input",
    protocol: DECISION_ADAPTER_PROTOCOL,
    protocol_version: DECISION_ADAPTER_PROTOCOL_VERSION,
    execution_id: executionId,
    request,
    request_hash: computeTypedDecisionRequestHash(request),
  };
}

/** The exact bytes written to the adapter's stdin: one canonical line. */
export function encodeDecisionAdapterFrame(value: object): Uint8Array {
  return new TextEncoder().encode(`${canonicalizeTypedDecisionJson(value)}\n`);
}

export type DecisionAdapterFrameDecoding =
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | { readonly ok: false; readonly code: DecisionSandboxIssueCode };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseObjectLine(line: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(line);
    return isPlainObject(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Decodes exactly one `json-line-v1` frame. Never throws; never repairs.
 */
export function decodeDecisionAdapterFrame(
  bytes: Uint8Array,
  maxBytes: number,
): DecisionAdapterFrameDecoding {
  if (bytes.byteLength === 0) return { ok: false, code: "response_missing" };
  if (bytes.byteLength > maxBytes)
    return { ok: false, code: "stdout_limit_exceeded" };
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    return { ok: false, code: "response_not_utf8" };
  }
  const terminator = text.indexOf("\n");
  if (terminator === -1) return { ok: false, code: "response_framing_invalid" };
  const line = text.slice(0, terminator);
  const rest = text.slice(terminator + 1);
  if (rest.length > 0) {
    const extra = rest.endsWith("\n") ? rest.slice(0, -1) : rest;
    const extraLines = extra.split("\n");
    return {
      ok: false,
      code:
        parseObjectLine(line) !== null &&
        extraLines.every((candidate) => parseObjectLine(candidate) !== null)
          ? "response_multiple"
          : "response_trailing_output",
    };
  }
  if (line.length === 0) return { ok: false, code: "response_missing" };
  if (line !== line.trim() || line.includes("\r") || line.startsWith("﻿"))
    return { ok: false, code: "response_framing_invalid" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return { ok: false, code: "response_json_invalid" };
  }
  if (!isPlainObject(parsed)) return { ok: false, code: "response_not_object" };
  if (JSON.stringify(parsed) !== line)
    return { ok: false, code: "response_framing_invalid" };
  return { ok: true, value: parsed };
}

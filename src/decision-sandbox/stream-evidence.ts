/**
 * AI-143 — bounded streaming evidence for one child output stream.
 *
 * Pure bookkeeping over byte chunks (no process, filesystem, network or
 * clock access). One instance tracks one stream (stdout or stderr):
 *
 *  - Every observed chunk increments `bytes` by exactly its length and
 *    updates a streaming SHA-256 with exactly those bytes, so `sha256`
 *    always hashes exactly the `bytes` observed.
 *  - Content is retained only when `retain` is set (stdout, for protocol
 *    decoding) and only while the total stays within `limit`. Once the
 *    limit is exceeded, retained content is released; memory held is
 *    therefore bounded by `limit` plus the in-flight chunk.
 *  - `stop()` ends observation (the runtime calls it when it terminates
 *    the child). Chunks after `stop()` are ignored by both the counter and
 *    the hash, so the two never describe different byte sets.
 */

import { createHash, type Hash } from "node:crypto";

export interface DecisionSandboxStreamObservation {
  /** Bytes observed before observation stopped. */
  readonly bytes: number;
  /** SHA-256 of exactly those `bytes`. */
  readonly sha256: string;
  /** True when `bytes` exceeded the limit. */
  readonly exceeded: boolean;
  /** Retained content: all observed bytes if retained and within limit, else empty. */
  readonly retained: Buffer;
}

export class DecisionSandboxStreamEvidence {
  readonly #limit: number;
  readonly #retain: boolean;
  readonly #hash: Hash = createHash("sha256");
  #chunks: Buffer[] = [];
  #bytes = 0;
  #exceeded = false;
  #stopped = false;
  #sealed: DecisionSandboxStreamObservation | null = null;

  constructor(limit: number, retain: boolean) {
    this.#limit = limit;
    this.#retain = retain;
  }

  /**
   * Observes one chunk. Returns `true` exactly when this chunk made the
   * stream exceed its limit. Ignored after `stop()` or sealing.
   */
  observe(chunk: Uint8Array): boolean {
    if (this.#stopped || this.#sealed !== null) return false;
    this.#bytes += chunk.byteLength;
    this.#hash.update(chunk);
    if (this.#exceeded) return false;
    if (this.#bytes > this.#limit) {
      this.#exceeded = true;
      this.#chunks = [];
      return true;
    }
    if (this.#retain) this.#chunks.push(Buffer.from(chunk));
    return false;
  }

  /** Stops observation; later chunks are counted and hashed by nobody. */
  stop(): void {
    this.#stopped = true;
  }

  /** Final observation. Idempotent. */
  seal(): DecisionSandboxStreamObservation {
    if (this.#sealed === null) {
      this.#stopped = true;
      this.#sealed = Object.freeze({
        bytes: this.#bytes,
        sha256: this.#hash.digest("hex"),
        exceeded: this.#exceeded,
        retained:
          this.#retain && !this.#exceeded
            ? Buffer.concat(this.#chunks)
            : Buffer.alloc(0),
      });
      this.#chunks = [];
    }
    return this.#sealed;
  }
}

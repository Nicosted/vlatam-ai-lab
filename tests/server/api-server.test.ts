import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  cleanupExpiredEntries,
  getRateLimitStoreSize,
  handleClassifierRequest,
} from "../../src/server/api-server.js";
import { createReviewBinding } from "../../src/review/review-artifact-binding.js";

const SOURCE_ID = "infoleg";
const ARTIFACT_ID = "artifact--infoleg--extraction-001";

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
  readonly maximumReviewAgeSeconds?: number;
  readonly now?: string;
  readonly deploymentEnvironment?: "development" | "preview" | "production";
  readonly httpsContext?: boolean;
}

let testRoot = "";
let requestSequence = 0;

function exportPath(): string {
  return path.join(
    testRoot,
    "data",
    "exports",
    SOURCE_ID,
    `${ARTIFACT_ID}--export.json`,
  );
}

function validExport(): Record<string, unknown> {
  return {
    export_id: `${ARTIFACT_ID}--export`,
    artifact_id: ARTIFACT_ID,
    source_id: SOURCE_ID,
    exported_at: "2026-06-16T20:00:00Z",
    classification_candidate: { ncm_code: "42029200110V", confidence: 0.82 },
    extracted_evidence: [
      {
        claim_id: "claim-001",
        claim_type: "classification",
        text: "Classification evidence",
        confidence: 0.82,
      },
    ],
    schema_version: "1.0.0",
  };
}

function writeExport(content: string): void {
  mkdirSync(path.dirname(exportPath()), { recursive: true });
  writeFileSync(exportPath(), content, "utf-8");
  const reviewed = reviewedArtifact();
  const intelligencePath = path.join(
    testRoot,
    "data",
    "intelligence",
    SOURCE_ID,
    `${ARTIFACT_ID}.json`,
  );
  mkdirSync(path.dirname(intelligencePath), { recursive: true });
  writeFileSync(
    intelligencePath,
    JSON.stringify(reviewed, null, 2) + "\n",
    "utf-8",
  );
}

function reviewedArtifact(): Record<string, unknown> {
  const artifact = {
    artifact_id: ARTIFACT_ID,
    extraction_result_id: "extraction-001",
    source_id: SOURCE_ID,
    generated_at: "2026-06-16T00:00:00Z",
    classification_candidate: {
      ncm_code: "42029200110V",
      confidence: 0.82,
      status: "candidate",
    },
    extracted_evidence: [
      {
        claim_id: "claim-001",
        claim_type: "classification",
        text: "Classification evidence",
        confidence: 0.82,
        requires_review: true,
      },
    ],
    governance: {
      human_review_required: false,
      downstream_allowed: true,
      review_only: false,
      not_final_classification: false,
    },
    review_status: "reviewed_approved",
    reviewer: "internal-reviewer",
    reviewed_at: "2026-06-16T20:00:00Z",
    classifier_approval_reference: "approval-ref--001",
    downstream_eligibility_reason: "Verified",
    source_authority: "official_regulation",
    origin: "ai_assisted_extraction",
    schema_version: "1.0.0",
  };
  return {
    ...artifact,
    review_binding: createReviewBinding(artifact, {
      review_decision: "approved",
      reviewed_at: artifact.reviewed_at,
      review_policy_id: "classifier-human-review",
      review_policy_version: "1.0.0",
    }),
  };
}

async function request(
  requestPath: string,
  options: RequestOptions = {},
): Promise<HttpResult> {
  let statusCode = 0;
  let contentType: string | null = null;
  let rawBody = "";
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
      contentType = headers["Content-Type"] ?? null;
      responseHeaders = headers;
      responseState.headersSent = true;
      return this;
    },
    end(body?: string) {
      rawBody = body ?? "";
      responseState.writableEnded = true;
      return this;
    },
  } as unknown as ServerResponse;
  const incomingRequest = {
    method: "GET",
    url: requestPath,
    headers:
      options.apiKey === null
        ? {}
        : { "x-vlatam-ai-lab-key": options.apiKey ?? "test-api-key" },
    socket: { remoteAddress: options.ip ?? `test-ip-${requestSequence++}` },
  } as unknown as IncomingMessage;

  await handleClassifierRequest(incomingRequest, response, {
    data_root: testRoot,
    ...(options.deploymentEnvironment !== undefined && {
      deployment_environment: options.deploymentEnvironment,
    }),
    ...(options.httpsContext !== undefined && {
      https_context: options.httpsContext,
    }),
    ...(options.maximumReviewAgeSeconds !== undefined && {
      review_policy: {
        policy_id: "classifier-human-review",
        policy_version: "1.0.0",
        maximum_review_age_seconds: options.maximumReviewAgeSeconds,
      },
    }),
    ...(options.now !== undefined && { clock: () => new Date(options.now!) }),
  });

  return {
    statusCode,
    contentType,
    body:
      contentType === "application/json"
        ? (JSON.parse(rawBody) as unknown)
        : rawBody,
    rawBody,
    headers: responseHeaders,
  };
}

beforeEach(() => {
  testRoot = mkdtempSync(path.join(tmpdir(), "api-server-"));
  process.env["AI_LAB_API_KEY"] = "test-api-key";
  delete process.env["AI_LAB_API_KEYS"];
  delete process.env["RATE_LIMIT_WINDOW_MS"];
  delete process.env["RATE_LIMIT_MAX"];
});

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true });
  delete process.env["AI_LAB_API_KEY"];
  delete process.env["AI_LAB_API_KEYS"];
  delete process.env["RATE_LIMIT_WINDOW_MS"];
  delete process.env["RATE_LIMIT_MAX"];
});

describe("handleClassifierRequest", () => {
  it("returns a healthy response without exposing internal state", async () => {
    const beforeRequest = Date.now();
    const response = await request("/health");
    const afterRequest = Date.now();

    assert.equal(response.statusCode, 200);
    assert.equal(response.contentType, "application/json");
    assert.equal(typeof response.body, "object");
    assert.notEqual(response.body, null);

    const health = response.body as Record<string, unknown>;
    assert.equal(health["status"], "healthy");
    assert.equal(health["version"], "1.0.0");
    assert.equal(typeof health["timestamp"], "string");
    const timestamp = Date.parse(health["timestamp"] as string);
    assert.equal(Number.isNaN(timestamp), false);
    assert.ok(timestamp >= beforeRequest && timestamp <= afterRequest);
    assert.deepEqual(Object.keys(health).sort(), [
      "status",
      "timestamp",
      "version",
    ]);
  });

  it("keeps the health endpoint public without an API key", async () => {
    const response = await request("/health", { apiKey: null });

    assert.equal(response.statusCode, 200);
  });

  it("exposes a safe liveness endpoint without operational state", async () => {
    const response = await request("/healthz", { apiKey: null });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
      status: "ok",
      service: "vlatam-ai-lab",
      operational_state_exposed: false,
    });
    assert.match(
      response.headers["Content-Security-Policy"] ?? "",
      /connect-src 'none'/,
    );
  });

  it("renders the regulatory research workspace page without requiring an API key", async () => {
    const response = await request(
      "/research/regulatory/ar-es-ecological-agrochemicals",
      {
        apiKey: null,
      },
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.contentType, "text/html; charset=utf-8");
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
    const csp = response.headers["Content-Security-Policy"] ?? "";
    const nonce = csp.match(/style-src 'self' 'nonce-([^']+)'/)?.[1];
    assert.ok(nonce);
    assert.match(csp, /script-src 'self' 'nonce-[^']+'/);
    assert.match(csp, /connect-src 'none'/);
    assert.match(response.rawBody, new RegExp(`<style nonce="${nonce}">`));
    assert.equal(response.headers["Strict-Transport-Security"], undefined);
  });

  it("adds HSTS to regulatory HTML only in Production HTTPS context", async () => {
    const production = await request(
      "/research/regulatory/ar-es-ecological-agrochemicals",
      {
        apiKey: null,
        deploymentEnvironment: "production",
        httpsContext: true,
      },
    );
    const productionHttp = await request(
      "/research/regulatory/ar-es-ecological-agrochemicals",
      {
        apiKey: null,
        deploymentEnvironment: "production",
        httpsContext: false,
      },
    );
    assert.match(
      production.headers["Strict-Transport-Security"] ?? "",
      /max-age=63072000/,
    );
    assert.equal(
      productionHttp.headers["Strict-Transport-Security"],
      undefined,
    );
  });

  it("returns 401 when the classifier API key is missing", async () => {
    const response = await request(
      `/api/classifier/${SOURCE_ID}/${ARTIFACT_ID}`,
      {
        apiKey: null,
      },
    );

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, {
      error: "Unauthorized",
      message: "Invalid or missing API key",
    });
  });

  it("returns 401 when the classifier API key is invalid", async () => {
    const response = await request(
      `/api/classifier/${SOURCE_ID}/${ARTIFACT_ID}`,
      {
        apiKey: "invalid-key",
      },
    );

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, {
      error: "Unauthorized",
      message: "Invalid or missing API key",
    });
  });

  it("returns a validated export with a JSON content type", async () => {
    const artifact = validExport();
    writeExport(JSON.stringify(artifact));

    const response = await request(
      `/api/classifier/${SOURCE_ID}/${ARTIFACT_ID}`,
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.contentType, "application/json");
    assert.deepEqual(response.body, artifact);
  });

  it("refuses to serve when the reviewed artifact changed after approval", async () => {
    writeExport(JSON.stringify(validExport()));
    const intelligencePath = path.join(
      testRoot,
      "data",
      "intelligence",
      SOURCE_ID,
      `${ARTIFACT_ID}.json`,
    );
    const mutated = JSON.parse(
      readFileSync(intelligencePath, "utf-8"),
    ) as Record<string, unknown>;
    (mutated["classification_candidate"] as Record<string, unknown>)[
      "confidence"
    ] = 0.5;
    writeFileSync(intelligencePath, JSON.stringify(mutated), "utf-8");

    const response = await request(
      `/api/classifier/${SOURCE_ID}/${ARTIFACT_ID}`,
    );
    assert.equal(response.statusCode, 409);
    assert.deepEqual(response.body, {
      error: "Conflict",
      message: "Approved artifact is not eligible for serving",
    });
    assert.doesNotMatch(
      response.rawBody,
      /hash|reviewer|payload|classification/i,
    );
  });

  it("refuses to serve a binding stale under the configured review policy", async () => {
    writeExport(JSON.stringify(validExport()));
    const response = await request(
      `/api/classifier/${SOURCE_ID}/${ARTIFACT_ID}`,
      {
        maximumReviewAgeSeconds: 60,
        now: "2026-06-16T20:02:00Z",
      },
    );
    assert.equal(response.statusCode, 409);
    assert.doesNotMatch(response.rawBody, /hash|reviewer|payload/i);
  });

  it("accepts every configured comma-separated API key", async () => {
    const artifact = validExport();
    writeExport(JSON.stringify(artifact));
    process.env["AI_LAB_API_KEYS"] = "first-key, second-key";

    const firstResponse = await request(
      `/api/classifier/${SOURCE_ID}/${ARTIFACT_ID}`,
      {
        apiKey: "first-key",
      },
    );
    const secondResponse = await request(
      `/api/classifier/${SOURCE_ID}/${ARTIFACT_ID}`,
      {
        apiKey: "second-key",
      },
    );

    assert.equal(firstResponse.statusCode, 200);
    assert.equal(secondResponse.statusCode, 200);
  });

  it("allows requests within the per-IP rate limit", async () => {
    process.env["RATE_LIMIT_MAX"] = "2";

    const firstResponse = await request("/health", {
      ip: "rate-limit-allowed",
    });
    const secondResponse = await request("/health", {
      ip: "rate-limit-allowed",
    });

    assert.equal(firstResponse.statusCode, 200);
    assert.equal(secondResponse.statusCode, 200);
  });

  it("returns 429 with Retry-After after the per-IP limit is exceeded", async () => {
    process.env["RATE_LIMIT_MAX"] = "1";

    await request("/health", { ip: "rate-limit-exceeded" });
    const response = await request("/health", { ip: "rate-limit-exceeded" });

    assert.equal(response.statusCode, 429);
    assert.deepEqual(response.body, {
      error: "Too Many Requests",
      message: "Rate limit exceeded",
    });
    assert.equal(response.headers["Retry-After"], "60");
  });

  it("resets the per-IP rate limit after the window expires", async () => {
    process.env["RATE_LIMIT_MAX"] = "1";
    process.env["RATE_LIMIT_WINDOW_MS"] = "10";

    await request("/health", { ip: "rate-limit-reset" });
    const limitedResponse = await request("/health", {
      ip: "rate-limit-reset",
    });
    await new Promise((resolve) => setTimeout(resolve, 15));
    const resetResponse = await request("/health", { ip: "rate-limit-reset" });

    assert.equal(limitedResponse.statusCode, 429);
    assert.equal(resetResponse.statusCode, 200);
  });

  it("tracks rate limits separately for different IP addresses", async () => {
    process.env["RATE_LIMIT_MAX"] = "1";

    await request("/health", { ip: "rate-limit-ip-one" });
    const limitedResponse = await request("/health", {
      ip: "rate-limit-ip-one",
    });
    const separateIpResponse = await request("/health", {
      ip: "rate-limit-ip-two",
    });

    assert.equal(limitedResponse.statusCode, 429);
    assert.equal(separateIpResponse.statusCode, 200);
  });

  it("cleans up expired entries from the rate limit store", async () => {
    const originalDateNow = Date.now;
    let mockTime = originalDateNow() + 61_000;

    Date.now = () => mockTime;
    try {
      cleanupExpiredEntries();
      assert.equal(getRateLimitStoreSize(), 0);

      for (let index = 0; index < 10; index += 1) {
        await request("/health", { ip: `192.168.1.${index}` });
      }

      assert.equal(getRateLimitStoreSize(), 10);

      mockTime += 70_000;
      cleanupExpiredEntries();

      assert.equal(getRateLimitStoreSize(), 0);
    } finally {
      Date.now = originalDateNow;
    }
  });

  it("returns 404 for an unknown endpoint", async () => {
    const response = await request("/api/unknown");

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, {
      error: "Not Found",
      message: "Endpoint not found",
    });
  });

  it("returns 400 for an invalid source_id", async () => {
    const response = await request(`/api/classifier/INFOLEG/${ARTIFACT_ID}`);

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, {
      error: "Bad Request",
      message: "Invalid source_id format",
    });
  });

  it("returns 400 for an invalid artifact_id", async () => {
    const response = await request(`/api/classifier/${SOURCE_ID}/random-id`);

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, {
      error: "Bad Request",
      message: "Invalid artifact_id format",
    });
  });

  it("returns 404 when the export does not exist", async () => {
    const response = await request(
      `/api/classifier/${SOURCE_ID}/${ARTIFACT_ID}`,
    );

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, {
      error: "Not Found",
      message: "Export artifact not found",
    });
  });

  it("returns 500 for corrupted JSON without exposing an absolute path", async () => {
    writeExport("{not-json");

    const response = await request(
      `/api/classifier/${SOURCE_ID}/${ARTIFACT_ID}`,
    );

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, {
      error: "Internal Server Error",
      message: "Artifact could not be read",
    });
    assert.equal(response.rawBody.includes(testRoot), false);
  });

  it("returns 500 and does not serve an artifact that fails schema validation", async () => {
    writeExport(JSON.stringify({ ...validExport(), schema_version: "" }));

    const response = await request(
      `/api/classifier/${SOURCE_ID}/${ARTIFACT_ID}`,
    );

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, {
      error: "Internal Server Error",
      message: "Artifact validation failed",
    });
    assert.equal(response.rawBody.includes(testRoot), false);
  });

  it("blocks encoded path traversal without exposing filesystem paths", async () => {
    const response = await request(
      `/api/classifier/%2E%2E%2Fetc/${ARTIFACT_ID}`,
    );

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, {
      error: "Bad Request",
      message: "Invalid source_id format",
    });
    assert.equal(response.rawBody.includes(testRoot), false);
    assert.equal(response.rawBody.includes(tmpdir()), false);
  });

  it("never serves an export file carrying reviewer or governance metadata", async () => {
    writeExport(
      JSON.stringify({
        ...validExport(),
        reviewer: "internal-reviewer-1",
        governance: { downstream_allowed: true },
      }),
    );

    const response = await request(
      `/api/classifier/${SOURCE_ID}/${ARTIFACT_ID}`,
    );

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, {
      error: "Internal Server Error",
      message: "Artifact validation failed",
    });
    assert.equal(response.rawBody.includes("internal-reviewer-1"), false);
    assert.equal(response.rawBody.includes("downstream_allowed"), false);
  });

  it("sets hardening headers on JSON responses", async () => {
    writeExport(JSON.stringify(validExport()));

    const success = await request(
      `/api/classifier/${SOURCE_ID}/${ARTIFACT_ID}`,
    );
    assert.equal(success.statusCode, 200);
    assert.equal(success.headers["X-Content-Type-Options"], "nosniff");
    assert.equal(success.headers["Cache-Control"], "no-store");

    const unauthorized = await request(
      `/api/classifier/${SOURCE_ID}/${ARTIFACT_ID}`,
      {
        apiKey: null,
      },
    );
    assert.equal(unauthorized.statusCode, 401);
    assert.equal(unauthorized.headers["X-Content-Type-Options"], "nosniff");
    assert.equal(unauthorized.headers["Cache-Control"], "no-store");
  });
});

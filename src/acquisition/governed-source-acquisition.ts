import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

const COMPILED_ALLOWED_ARCA_HOSTS = [
  "arca.gob.ar",
  "www.arca.gob.ar",
  "afip.gob.ar",
  "www.afip.gob.ar",
  "serviciosweb.afip.gob.ar",
] as const;

const ENFORCED_ALLOWED_ARCA_HOSTS = new Set<string>(
  COMPILED_ALLOWED_ARCA_HOSTS,
);

export const DEFAULT_ALLOWED_ARCA_HOSTS: readonly string[] = Object.freeze([
  ...COMPILED_ALLOWED_ARCA_HOSTS,
]);

export const GOVERNED_ARCA_SOURCE_IDENTITY =
  "ar-arca-arancel-integrado" as const;
export const GOVERNED_ARCA_EXACT_SOURCE_URLS: readonly string[] = Object.freeze(
  [
    "https://www.arca.gob.ar/aduana/arancelintegrado/nomenclador.txt",
    "https://www.afip.gob.ar/aduana/arancelintegrado/nomenclador.txt",
  ],
);

export const GOVERNED_ARCA_ACQUISITION_POLICY = Object.freeze({
  policy_version: "1.0.0",
  source_identity: GOVERNED_ARCA_SOURCE_IDENTITY,
  exact_source_urls: GOVERNED_ARCA_EXACT_SOURCE_URLS,
  allowed_hosts: DEFAULT_ALLOWED_ARCA_HOSTS,
  protocols: ["https:"],
  redirect_mode: "manual-allowlisted-hosts",
  maximum_redirects: 5,
  allowed_media_types: [
    "application/octet-stream",
    "application/zip",
    "text/plain",
    "text/html",
  ],
  credentials: "unsupported",
  cookies: "disabled",
  retries: 0,
});

export const GOVERNED_ARCA_ACQUISITION_POLICY_SHA256 = createHash("sha256")
  .update("vlatam-ai-lab/governed-arca-acquisition-policy/v1\n")
  .update(JSON.stringify(GOVERNED_ARCA_ACQUISITION_POLICY))
  .digest("hex");

export type AcquisitionMode = "live" | "replay";

export interface SourceAcquisitionRequest {
  sourceId: string;
  sourceUrl: string;
  outputDirectory: string;
  mode: AcquisitionMode;
  replayPath?: string;
  capturedAt?: Date;
  timeoutMs?: number;
  maxBytes?: number;
}

export interface SourceAcquisitionRecord {
  schema_version: "1.0.0";
  acquisition_id: string;
  source_id: string;
  requested_url: string;
  effective_url: string;
  source_host: string;
  mode: AcquisitionMode;
  captured_at: string;
  content_type: string;
  content_length: number;
  sha256: string;
  raw_path: string;
  metadata_path: string;
}

export class SourceAcquisitionError extends Error {
  constructor(
    readonly code:
      | "INVALID_SOURCE_ID"
      | "INVALID_URL"
      | "INVALID_CAPTURE_TIMESTAMP"
      | "INVALID_LIMIT"
      | "HOST_NOT_ALLOWED"
      | "REDIRECT_HOST_NOT_ALLOWED"
      | "TOO_MANY_REDIRECTS"
      | "HTTP_ERROR"
      | "TIMEOUT"
      | "CONTENT_TYPE_NOT_ALLOWED"
      | "CONTENT_TOO_LARGE"
      | "REPLAY_PATH_REQUIRED"
      | "REPLAY_CAPTURE_TIME_REQUIRED"
      | "EMPTY_CONTENT"
      | "ACQUISITION_EXISTS"
      | "PUBLISH_FAILED"
      | "NETWORK_CALL_LIMIT",
    message: string,
  ) {
    super(message);
    this.name = "SourceAcquisitionError";
  }
}

export interface SourceAcquisitionExecutionOptions {
  /** Test seam and controlled-boundary injection; the request URL remains governed. */
  readonly fetchImplementation?: typeof fetch;
  readonly maximumNetworkCalls?: number;
  readonly onNetworkCall?: (url: string) => void;
}

export function resolveGovernedArcaSourceIdentity(rawUrl: string): {
  sourceIdentity: typeof GOVERNED_ARCA_SOURCE_IDENTITY;
  requestedUrl: string;
  host: string;
} {
  const parsed = parseAllowedUrl(rawUrl);
  if (!GOVERNED_ARCA_EXACT_SOURCE_URLS.includes(parsed.href)) {
    throw new SourceAcquisitionError(
      "HOST_NOT_ALLOWED",
      "Requested URL is not an exact governed ARCA source URL.",
    );
  }
  return {
    sourceIdentity: GOVERNED_ARCA_SOURCE_IDENTITY,
    requestedUrl: parsed.href,
    host: parsed.hostname.toLowerCase(),
  };
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const SOURCE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_CONTENT_TYPES = new Set([
  "application/octet-stream",
  "application/zip",
  "text/plain",
  "text/html",
]);

function validateSourceId(sourceId: string): void {
  if (!SOURCE_ID_PATTERN.test(sourceId)) {
    throw new SourceAcquisitionError(
      "INVALID_SOURCE_ID",
      "sourceId must use lowercase alphanumeric segments separated by single hyphens.",
    );
  }
}

function validateLimit(name: "timeoutMs" | "maxBytes", value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new SourceAcquisitionError(
      "INVALID_LIMIT",
      `${name} must be a positive safe integer.`,
    );
  }
}

function parseAllowedUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SourceAcquisitionError(
      "INVALID_URL",
      `Invalid source URL: ${rawUrl}`,
    );
  }

  if (url.protocol !== "https:") {
    throw new SourceAcquisitionError(
      "INVALID_URL",
      "Source acquisition requires HTTPS.",
    );
  }
  if (!ENFORCED_ALLOWED_ARCA_HOSTS.has(url.hostname.toLowerCase())) {
    throw new SourceAcquisitionError(
      "HOST_NOT_ALLOWED",
      `Source host is not allowlisted: ${url.hostname}`,
    );
  }
  return url;
}

function parseRedirectUrl(location: string, currentUrl: URL): URL {
  let redirectUrl: URL;
  try {
    redirectUrl = new URL(location, currentUrl);
  } catch {
    throw new SourceAcquisitionError(
      "INVALID_URL",
      `Invalid redirect URL: ${location}`,
    );
  }
  if (redirectUrl.protocol !== "https:") {
    throw new SourceAcquisitionError(
      "REDIRECT_HOST_NOT_ALLOWED",
      `Redirect must remain on HTTPS: ${redirectUrl.href}`,
    );
  }
  if (!ENFORCED_ALLOWED_ARCA_HOSTS.has(redirectUrl.hostname.toLowerCase())) {
    throw new SourceAcquisitionError(
      "REDIRECT_HOST_NOT_ALLOWED",
      `Redirected host is not allowlisted: ${redirectUrl.hostname}`,
    );
  }
  return redirectUrl;
}

function requireContentType(value: string | null): string {
  const normalized = value?.split(";", 1)[0]?.trim().toLowerCase();
  if (!normalized || !DEFAULT_CONTENT_TYPES.has(normalized)) {
    throw new SourceAcquisitionError(
      "CONTENT_TYPE_NOT_ALLOWED",
      `Content type is missing or not allowed: ${normalized || "<missing>"}`,
    );
  }
  return normalized;
}

async function disposeResponseBody(
  response: Response,
  reason: string,
): Promise<void> {
  try {
    await response.body?.cancel(reason);
  } catch {
    // Disposal is best-effort and must not replace the acquisition error.
  }
}

async function cancelReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  reason: string,
): Promise<void> {
  try {
    await reader.cancel(reason);
  } catch {
    // Disposal is best-effort and must not replace the acquisition error.
  }
}

function extensionFor(contentType: string, effectiveUrl: URL): string {
  const urlName = basename(effectiveUrl.pathname);
  const dot = urlName.lastIndexOf(".");
  if (dot > 0 && dot < urlName.length - 1)
    return urlName.slice(dot).toLowerCase();
  if (contentType === "application/zip") return ".zip";
  if (contentType === "text/plain") return ".txt";
  if (contentType === "text/html") return ".html";
  return ".bin";
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!response.body) {
    throw new SourceAcquisitionError(
      "EMPTY_CONTENT",
      "Source returned no response body.",
    );
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maxBytes) {
        await cancelReader(reader, "maximum response size exceeded");
        throw new SourceAcquisitionError(
          "CONTENT_TOO_LARGE",
          `Downloaded content exceeds ${maxBytes} bytes.`,
        );
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  if (total === 0) {
    throw new SourceAcquisitionError(
      "EMPTY_CONTENT",
      "Source returned an empty body.",
    );
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function readLive(
  initialUrl: URL,
  timeoutMs: number,
  maxBytes: number,
  options: SourceAcquisitionExecutionOptions,
): Promise<{ body: Uint8Array; contentType: string; effectiveUrl: URL }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let currentUrl = initialUrl;
  let networkCalls = 0;
  const transport = options.fetchImplementation ?? globalThis.fetch;

  try {
    for (
      let redirectCount = 0;
      redirectCount <= MAX_REDIRECTS;
      redirectCount += 1
    ) {
      if (
        options.maximumNetworkCalls !== undefined &&
        networkCalls >= options.maximumNetworkCalls
      ) {
        throw new SourceAcquisitionError(
          "NETWORK_CALL_LIMIT",
          "Governed acquisition network-call limit reached.",
        );
      }
      networkCalls += 1;
      options.onNetworkCall?.(currentUrl.href);
      const response = await transport(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept:
            "application/octet-stream, application/zip, text/plain, text/html;q=0.8",
          "user-agent": "vlatam-ai-lab-source-acquisition/1.0",
        },
      });

      if (response.status >= 300 && response.status < 400) {
        await disposeResponseBody(response, "redirect response discarded");
        const location = response.headers.get("location");
        if (!location) {
          throw new SourceAcquisitionError(
            "HTTP_ERROR",
            `Source returned redirect HTTP ${response.status} without Location.`,
          );
        }
        if (redirectCount === MAX_REDIRECTS) {
          throw new SourceAcquisitionError(
            "TOO_MANY_REDIRECTS",
            `Source exceeded ${MAX_REDIRECTS} redirects.`,
          );
        }
        currentUrl = parseRedirectUrl(location, currentUrl);
        continue;
      }

      if (!response.ok) {
        await disposeResponseBody(response, "error response discarded");
        throw new SourceAcquisitionError(
          "HTTP_ERROR",
          `Source returned HTTP ${response.status} ${response.statusText}`,
        );
      }

      const declaredHeader = response.headers.get("content-length");
      if (declaredHeader !== null) {
        const declaredLength = Number(declaredHeader);
        if (!Number.isSafeInteger(declaredLength) || declaredLength < 0) {
          await disposeResponseBody(
            response,
            "invalid content length response discarded",
          );
          throw new SourceAcquisitionError(
            "HTTP_ERROR",
            "Invalid Content-Length header.",
          );
        }
        if (declaredLength > maxBytes) {
          await disposeResponseBody(
            response,
            "declared response size exceeded",
          );
          throw new SourceAcquisitionError(
            "CONTENT_TOO_LARGE",
            `Declared content length ${declaredLength} exceeds ${maxBytes} bytes.`,
          );
        }
      }

      let contentType: string;
      try {
        contentType = requireContentType(response.headers.get("content-type"));
      } catch (error: unknown) {
        await disposeResponseBody(response, "unsupported response discarded");
        throw error;
      }

      const body = await readBoundedBody(response, maxBytes);
      return { body, contentType, effectiveUrl: currentUrl };
    }

    throw new SourceAcquisitionError(
      "TOO_MANY_REDIRECTS",
      `Source exceeded ${MAX_REDIRECTS} redirects.`,
    );
  } catch (error: unknown) {
    if (error instanceof SourceAcquisitionError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new SourceAcquisitionError(
        "TIMEOUT",
        `Source request exceeded ${timeoutMs} ms.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function assertContainedPath(root: string, candidate: string): void {
  const relativePath = relative(root, candidate);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`)
  ) {
    throw new SourceAcquisitionError(
      "INVALID_SOURCE_ID",
      "Resolved output path escapes its root.",
    );
  }
}

async function publishAcquisition(
  finalDirectory: string,
  rawFilename: string,
  metadataFilename: string,
  body: Uint8Array,
  record: SourceAcquisitionRecord,
): Promise<void> {
  const parentDirectory = dirname(finalDirectory);
  await mkdir(parentDirectory, { recursive: true });
  const stagingDirectory = `${finalDirectory}.staging-${randomUUID()}`;
  try {
    await mkdir(stagingDirectory, { recursive: false });
    await writeFile(join(stagingDirectory, rawFilename), body, { flag: "wx" });
    await writeFile(
      join(stagingDirectory, metadataFilename),
      `${JSON.stringify(record, null, 2)}\n`,
      { flag: "wx" },
    );
    await rename(stagingDirectory, finalDirectory);
  } catch (error: unknown) {
    await rm(stagingDirectory, { recursive: true, force: true });
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "EEXIST" || error.code === "ENOTEMPTY")
    ) {
      throw new SourceAcquisitionError(
        "ACQUISITION_EXISTS",
        `Immutable acquisition already exists: ${finalDirectory}`,
      );
    }
    if (error instanceof SourceAcquisitionError) throw error;
    throw new SourceAcquisitionError(
      "PUBLISH_FAILED",
      `Failed to publish acquisition atomically: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function acquireSource(
  request: SourceAcquisitionRequest,
  executionOptions: SourceAcquisitionExecutionOptions = {},
): Promise<SourceAcquisitionRecord> {
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = request.maxBytes ?? DEFAULT_MAX_BYTES;
  validateLimit("timeoutMs", timeoutMs);
  validateLimit("maxBytes", maxBytes);

  validateSourceId(request.sourceId);
  const requestedUrl = parseAllowedUrl(request.sourceUrl);
  if (request.mode === "replay" && request.capturedAt === undefined) {
    throw new SourceAcquisitionError(
      "REPLAY_CAPTURE_TIME_REQUIRED",
      "Replay mode requires an explicit capturedAt timestamp.",
    );
  }

  const capturedAt = request.capturedAt ?? new Date();
  if (Number.isNaN(capturedAt.getTime())) {
    throw new SourceAcquisitionError(
      "INVALID_CAPTURE_TIMESTAMP",
      "capturedAt must be a valid timestamp.",
    );
  }
  let body: Uint8Array;
  let contentType: string;
  let effectiveUrl = requestedUrl;

  if (request.mode === "replay") {
    if (!request.replayPath) {
      throw new SourceAcquisitionError(
        "REPLAY_PATH_REQUIRED",
        "Replay mode requires replayPath.",
      );
    }
    body = new Uint8Array(await readFile(request.replayPath));
    if (body.byteLength === 0) {
      throw new SourceAcquisitionError(
        "EMPTY_CONTENT",
        "Replay fixture is empty.",
      );
    }
    if (body.byteLength > maxBytes) {
      throw new SourceAcquisitionError(
        "CONTENT_TOO_LARGE",
        `Replay content ${body.byteLength} exceeds ${maxBytes} bytes.`,
      );
    }
    contentType = "application/octet-stream";
  } else {
    const live = await readLive(
      requestedUrl,
      timeoutMs,
      maxBytes,
      executionOptions,
    );
    body = live.body;
    contentType = live.contentType;
    effectiveUrl = live.effectiveUrl;
  }

  const sha256 = createHash("sha256").update(body).digest("hex");
  const datePart = capturedAt.toISOString().slice(0, 10);
  const acquisitionId = `${request.sourceId}--${datePart}--${sha256.slice(0, 16)}`;
  const outputRoot = resolve(request.outputDirectory);
  const finalDirectory = resolve(
    outputRoot,
    request.sourceId,
    datePart,
    acquisitionId,
  );
  assertContainedPath(outputRoot, finalDirectory);

  const rawFilename = `raw${extensionFor(contentType, effectiveUrl)}`;
  const metadataFilename = "metadata.json";
  const rawPath = join(finalDirectory, rawFilename);
  const metadataPath = join(finalDirectory, metadataFilename);

  const record: SourceAcquisitionRecord = {
    schema_version: "1.0.0",
    acquisition_id: acquisitionId,
    source_id: request.sourceId,
    requested_url: requestedUrl.href,
    effective_url: effectiveUrl.href,
    source_host: effectiveUrl.hostname.toLowerCase(),
    mode: request.mode,
    captured_at: capturedAt.toISOString(),
    content_type: contentType,
    content_length: body.byteLength,
    sha256,
    raw_path: rawPath,
    metadata_path: metadataPath,
  };

  await publishAcquisition(
    finalDirectory,
    rawFilename,
    metadataFilename,
    body,
    record,
  );
  return record;
}

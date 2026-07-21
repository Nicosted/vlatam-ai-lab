import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export const DEFAULT_ALLOWED_ARCA_HOSTS = new Set([
  'arca.gob.ar',
  'www.arca.gob.ar',
  'afip.gob.ar',
  'www.afip.gob.ar',
  'serviciosweb.afip.gob.ar',
]);

export type AcquisitionMode = 'live' | 'replay';

export interface SourceAcquisitionRequest {
  sourceId: string;
  sourceUrl: string;
  outputDirectory: string;
  mode: AcquisitionMode;
  replayPath?: string;
  capturedAt?: Date;
  timeoutMs?: number;
  maxBytes?: number;
  allowedHosts?: ReadonlySet<string>;
  allowedContentTypes?: readonly string[];
}

export interface SourceAcquisitionRecord {
  schema_version: '1.0.0';
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
      | 'INVALID_URL'
      | 'HOST_NOT_ALLOWED'
      | 'REDIRECT_HOST_NOT_ALLOWED'
      | 'TOO_MANY_REDIRECTS'
      | 'HTTP_ERROR'
      | 'TIMEOUT'
      | 'CONTENT_TYPE_NOT_ALLOWED'
      | 'CONTENT_TOO_LARGE'
      | 'REPLAY_PATH_REQUIRED'
      | 'EMPTY_CONTENT',
    message: string,
  ) {
    super(message);
    this.name = 'SourceAcquisitionError';
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const DEFAULT_CONTENT_TYPES = [
  'application/octet-stream',
  'application/zip',
  'text/plain',
  'text/html',
];

function parseAllowedUrl(rawUrl: string, allowedHosts: ReadonlySet<string>): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SourceAcquisitionError('INVALID_URL', `Invalid source URL: ${rawUrl}`);
  }

  if (url.protocol !== 'https:') {
    throw new SourceAcquisitionError('INVALID_URL', 'Source acquisition requires HTTPS.');
  }
  if (!allowedHosts.has(url.hostname.toLowerCase())) {
    throw new SourceAcquisitionError(
      'HOST_NOT_ALLOWED',
      `Source host is not allowlisted: ${url.hostname}`,
    );
  }
  return url;
}

function parseRedirectUrl(
  location: string,
  currentUrl: URL,
  allowedHosts: ReadonlySet<string>,
): URL {
  let redirectUrl: URL;
  try {
    redirectUrl = new URL(location, currentUrl);
  } catch {
    throw new SourceAcquisitionError('INVALID_URL', `Invalid redirect URL: ${location}`);
  }
  if (redirectUrl.protocol !== 'https:') {
    throw new SourceAcquisitionError(
      'REDIRECT_HOST_NOT_ALLOWED',
      `Redirect must remain on HTTPS: ${redirectUrl.href}`,
    );
  }
  if (!allowedHosts.has(redirectUrl.hostname.toLowerCase())) {
    throw new SourceAcquisitionError(
      'REDIRECT_HOST_NOT_ALLOWED',
      `Redirected host is not allowlisted: ${redirectUrl.hostname}`,
    );
  }
  return redirectUrl;
}

function normalizeContentType(value: string | null): string {
  return value?.split(';', 1)[0]?.trim().toLowerCase() || 'application/octet-stream';
}

function extensionFor(contentType: string, effectiveUrl: URL): string {
  const urlName = basename(effectiveUrl.pathname);
  const dot = urlName.lastIndexOf('.');
  if (dot > 0 && dot < urlName.length - 1) return urlName.slice(dot).toLowerCase();
  if (contentType === 'application/zip') return '.zip';
  if (contentType === 'text/plain') return '.txt';
  if (contentType === 'text/html') return '.html';
  return '.bin';
}

async function readLive(
  initialUrl: URL,
  timeoutMs: number,
  maxBytes: number,
  allowedHosts: ReadonlySet<string>,
): Promise<{ body: Uint8Array; contentType: string; effectiveUrl: URL }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let currentUrl = initialUrl;

  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          accept: 'application/octet-stream, application/zip, text/plain, text/html;q=0.8',
          'user-agent': 'vlatam-ai-lab-source-acquisition/1.0',
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new SourceAcquisitionError(
            'HTTP_ERROR',
            `Source returned redirect HTTP ${response.status} without Location.`,
          );
        }
        if (redirectCount === MAX_REDIRECTS) {
          throw new SourceAcquisitionError(
            'TOO_MANY_REDIRECTS',
            `Source exceeded ${MAX_REDIRECTS} redirects.`,
          );
        }
        currentUrl = parseRedirectUrl(location, currentUrl, allowedHosts);
        continue;
      }

      if (!response.ok) {
        throw new SourceAcquisitionError(
          'HTTP_ERROR',
          `Source returned HTTP ${response.status} ${response.statusText}`,
        );
      }

      const declaredLength = Number(response.headers.get('content-length') ?? '0');
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        throw new SourceAcquisitionError(
          'CONTENT_TOO_LARGE',
          `Declared content length ${declaredLength} exceeds ${maxBytes} bytes.`,
        );
      }

      const body = new Uint8Array(await response.arrayBuffer());
      if (body.byteLength === 0) {
        throw new SourceAcquisitionError('EMPTY_CONTENT', 'Source returned an empty body.');
      }
      if (body.byteLength > maxBytes) {
        throw new SourceAcquisitionError(
          'CONTENT_TOO_LARGE',
          `Downloaded content ${body.byteLength} exceeds ${maxBytes} bytes.`,
        );
      }
      return {
        body,
        contentType: normalizeContentType(response.headers.get('content-type')),
        effectiveUrl: currentUrl,
      };
    }

    throw new SourceAcquisitionError(
      'TOO_MANY_REDIRECTS',
      `Source exceeded ${MAX_REDIRECTS} redirects.`,
    );
  } catch (error: unknown) {
    if (error instanceof SourceAcquisitionError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new SourceAcquisitionError('TIMEOUT', `Source request exceeded ${timeoutMs} ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function acquireSource(
  request: SourceAcquisitionRequest,
): Promise<SourceAcquisitionRecord> {
  const allowedHosts = request.allowedHosts ?? DEFAULT_ALLOWED_ARCA_HOSTS;
  const requestedUrl = parseAllowedUrl(request.sourceUrl, allowedHosts);
  const capturedAt = request.capturedAt ?? new Date();
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = request.maxBytes ?? DEFAULT_MAX_BYTES;
  const allowedContentTypes = request.allowedContentTypes ?? DEFAULT_CONTENT_TYPES;

  let body: Uint8Array;
  let contentType: string;
  let effectiveUrl = requestedUrl;

  if (request.mode === 'replay') {
    if (!request.replayPath) {
      throw new SourceAcquisitionError(
        'REPLAY_PATH_REQUIRED',
        'Replay mode requires replayPath.',
      );
    }
    body = new Uint8Array(await readFile(request.replayPath));
    if (body.byteLength === 0) {
      throw new SourceAcquisitionError('EMPTY_CONTENT', 'Replay fixture is empty.');
    }
    if (body.byteLength > maxBytes) {
      throw new SourceAcquisitionError(
        'CONTENT_TOO_LARGE',
        `Replay content ${body.byteLength} exceeds ${maxBytes} bytes.`,
      );
    }
    contentType = 'application/octet-stream';
  } else {
    const live = await readLive(requestedUrl, timeoutMs, maxBytes, allowedHosts);
    body = live.body;
    contentType = live.contentType;
    effectiveUrl = live.effectiveUrl;
  }

  if (!allowedContentTypes.includes(contentType)) {
    throw new SourceAcquisitionError(
      'CONTENT_TYPE_NOT_ALLOWED',
      `Content type is not allowed: ${contentType}`,
    );
  }

  const sha256 = createHash('sha256').update(body).digest('hex');
  const datePart = capturedAt.toISOString().slice(0, 10);
  const acquisitionId = `${request.sourceId}--${datePart}--${sha256.slice(0, 16)}`;
  const rawPath = join(
    request.outputDirectory,
    request.sourceId,
    datePart,
    `${acquisitionId}${extensionFor(contentType, effectiveUrl)}`,
  );
  const metadataPath = `${rawPath}.metadata.json`;

  const record: SourceAcquisitionRecord = {
    schema_version: '1.0.0',
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

  await mkdir(dirname(rawPath), { recursive: true });
  await writeFile(rawPath, body, { flag: 'wx' });
  await writeFile(metadataPath, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  return record;
}

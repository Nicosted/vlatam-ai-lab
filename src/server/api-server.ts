import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

import { renderRegulatoryResearchWorkspaceHtml } from '../advisory/regulatory-research-workspace.js';
import { type ClassifierApprovedArtifactExport, validateExportArtifact } from '../contracts/vlatam-global-bridge.js';

export interface ApiRequest {
  method: string;
  url: string;
  params: {
    source_id: string;
    artifact_id: string;
  };
}

export interface ApiResponse<T = unknown> {
  statusCode: number;
  body: T | { error: string; message: string };
}

export type RequestHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

export interface ApiServerOptions {
  data_root?: string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

const SOURCE_ID_REGEX = /^[a-z0-9_-]+$/;
const ARTIFACT_ID_REGEX = /^artifact--[a-z0-9_-]+--[a-z0-9_-]+$/;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_MAX = 100;
const CLEANUP_INTERVAL_MS = 60_000;
const rateLimitStore = new Map<string, RateLimitEntry>();

function sendJson(res: ServerResponse, statusCode: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(JSON.stringify(body));
}

function sendHtml(res: ServerResponse, statusCode: number, body: string): void {
  res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}

function sendInternalError(res: ServerResponse, message: string): void {
  sendJson(res, 500, { error: 'Internal Server Error', message });
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Constant-time comparison over fixed-length digests so the comparison
// leaks neither key length nor a matching prefix.
function keysMatch(candidate: string, configured: string): boolean {
  const candidateDigest = createHash('sha256').update(candidate).digest();
  const configuredDigest = createHash('sha256').update(configured).digest();
  return timingSafeEqual(candidateDigest, configuredDigest);
}

function validateApiKey(req: IncomingMessage): boolean {
  const apiKey = req.headers['x-vlatam-ai-lab-key'];
  if (typeof apiKey !== 'string') {
    return false;
  }

  const configuredKeys = process.env['AI_LAB_API_KEYS'];
  const validKeys = configuredKeys
    ?.split(',')
    .map((key) => key.trim())
    .filter((key) => key.length > 0);

  if (validKeys !== undefined && validKeys.length > 0) {
    return validKeys.some((key) => keysMatch(apiKey, key));
  }

  const singleKey = process.env['AI_LAB_API_KEY'];
  return singleKey !== undefined && singleKey.length > 0 && keysMatch(apiKey, singleKey);
}

export function cleanupExpiredEntries(): void {
  const now = Date.now();

  for (const [ip, entry] of rateLimitStore.entries()) {
    if (now >= entry.resetAt) {
      rateLimitStore.delete(ip);
    }
  }
}

export function getRateLimitStoreSize(): number {
  return rateLimitStore.size;
}

const cleanupTimer = setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();

function checkRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  const windowMs = positiveInteger(process.env['RATE_LIMIT_WINDOW_MS'], DEFAULT_RATE_LIMIT_WINDOW_MS);
  const maxRequests = positiveInteger(process.env['RATE_LIMIT_MAX'], DEFAULT_RATE_LIMIT_MAX);
  const entry = rateLimitStore.get(ip);

  // Remove an expired entry immediately instead of waiting for the periodic sweep.
  if (entry !== undefined && now >= entry.resetAt) {
    rateLimitStore.delete(ip);
  }

  const currentEntry = rateLimitStore.get(ip);

  if (currentEntry === undefined) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (currentEntry.count >= maxRequests) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((currentEntry.resetAt - now) / 1000))
    };
  }

  currentEntry.count += 1;
  return { allowed: true };
}

export async function handleClassifierRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options?: ApiServerOptions
): Promise<void> {
  const rateLimit = checkRateLimit(req.socket.remoteAddress ?? 'unknown');
  if (!rateLimit.allowed) {
    sendJson(
      res,
      429,
      { error: 'Too Many Requests', message: 'Rate limit exceeded' },
      { 'Retry-After': String(rateLimit.retryAfter) }
    );
    return;
  }

  // Health check endpoint. Keep the response intentionally free of internal state.
  if (req.url === '/health' && req.method === 'GET') {
    sendJson(res, 200, {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
    return;
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, {
      error: 'Method Not Allowed',
      message: 'Only GET is supported'
    });
    return;
  }

  const pathname = req.url?.split('?', 1)[0] ?? '';

  if (pathname === '/research/regulatory/ar-es-ecological-agrochemicals') {
    sendHtml(res, 200, renderRegulatoryResearchWorkspaceHtml());
    return;
  }

  const urlParts = pathname.split('/').filter(Boolean);

  if (urlParts[0] !== 'api' || urlParts[1] !== 'classifier') {
    sendJson(res, 404, { error: 'Not Found', message: 'Endpoint not found' });
    return;
  }

  if (!validateApiKey(req)) {
    sendJson(res, 401, {
      error: 'Unauthorized',
      message: 'Invalid or missing API key'
    });
    return;
  }

  if (urlParts.length !== 4) {
    sendJson(res, 400, { error: 'Bad Request', message: 'Invalid URL format' });
    return;
  }

  const sourceId = urlParts[2];
  const artifactId = urlParts[3];

  if (sourceId === undefined || !SOURCE_ID_REGEX.test(sourceId)) {
    sendJson(res, 400, {
      error: 'Bad Request',
      message: 'Invalid source_id format'
    });
    return;
  }
  if (artifactId === undefined || !ARTIFACT_ID_REGEX.test(artifactId)) {
    sendJson(res, 400, {
      error: 'Bad Request',
      message: 'Invalid artifact_id format'
    });
    return;
  }

  const dataRoot = path.resolve(options?.data_root ?? process.cwd(), 'data');
  const exportsRoot = path.resolve(dataRoot, 'exports');
  const filePath = path.resolve(exportsRoot, sourceId, `${artifactId}--export.json`);
  const relativePath = path.relative(exportsRoot, filePath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    sendJson(res, 400, { error: 'Bad Request', message: 'Invalid path' });
    return;
  }

  if (!existsSync(filePath)) {
    sendJson(res, 404, {
      error: 'Not Found',
      message: 'Export artifact not found'
    });
    return;
  }

  let artifact: unknown;
  try {
    artifact = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
  } catch {
    console.error(`Artifact read failed for ${sourceId}/${artifactId}`);
    sendInternalError(res, 'Artifact could not be read');
    return;
  }

  const validationResult = validateExportArtifact(artifact);
  if (!validationResult.ok || validationResult.artifact === undefined) {
    console.error(`Schema validation failed for ${sourceId}/${artifactId}`);
    sendInternalError(res, 'Artifact validation failed');
    return;
  }

  const validatedArtifact: ClassifierApprovedArtifactExport = validationResult.artifact;
  sendJson(res, 200, validatedArtifact);
}

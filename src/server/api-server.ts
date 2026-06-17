import { existsSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

import {
  type ClassifierApprovedArtifactExport,
  validateExportArtifact,
} from '../contracts/vlatam-global-bridge.js';

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

const SOURCE_ID_REGEX = /^[a-z0-9_-]+$/;
const ARTIFACT_ID_REGEX = /^artifact--[a-z0-9_-]+--[a-z0-9_-]+$/;

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendInternalError(res: ServerResponse, message: string): void {
  sendJson(res, 500, { error: 'Internal Server Error', message });
}

export async function handleClassifierRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options?: ApiServerOptions
): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method Not Allowed', message: 'Only GET is supported' });
    return;
  }

  const pathname = req.url?.split('?', 1)[0] ?? '';
  const urlParts = pathname.split('/').filter(Boolean);

  if (urlParts[0] !== 'api' || urlParts[1] !== 'classifier') {
    sendJson(res, 404, { error: 'Not Found', message: 'Endpoint not found' });
    return;
  }

  if (urlParts.length !== 4) {
    sendJson(res, 400, { error: 'Bad Request', message: 'Invalid URL format' });
    return;
  }

  const sourceId = urlParts[2];
  const artifactId = urlParts[3];

  if (sourceId === undefined || !SOURCE_ID_REGEX.test(sourceId)) {
    sendJson(res, 400, { error: 'Bad Request', message: 'Invalid source_id format' });
    return;
  }
  if (artifactId === undefined || !ARTIFACT_ID_REGEX.test(artifactId)) {
    sendJson(res, 400, { error: 'Bad Request', message: 'Invalid artifact_id format' });
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
    sendJson(res, 404, { error: 'Not Found', message: 'Export artifact not found' });
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

import { randomBytes } from "node:crypto";
import type { ServerResponse } from "node:http";

import type { DeploymentEnvironment } from "../application/deployment-environment.js";

export const APPLICATION_SECURITY_HEADERS: Readonly<Record<string, string>> =
  Object.freeze({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
  });

export interface SecureHtmlResponseContext {
  readonly deployment_environment: DeploymentEnvironment;
  readonly https_context: boolean;
  readonly cache_control?: string;
}

export type SecureHtmlRenderer = (nonce: string) => string;

export function secureHtmlHeaders(
  nonce: string,
  context: SecureHtmlResponseContext,
): Readonly<Record<string, string>> {
  const contentSecurityPolicy = [
    "default-src 'none'",
    `style-src 'self' 'nonce-${nonce}'`,
    `script-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "connect-src 'none'",
    "font-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; ");

  return Object.freeze({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": context.cache_control ?? "no-store",
    ...APPLICATION_SECURITY_HEADERS,
    "Content-Security-Policy": contentSecurityPolicy,
    ...(context.deployment_environment === "production" && context.https_context
      ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains" }
      : {}),
  });
}

export function sendSecureHtmlResponse(
  response: ServerResponse,
  status: number,
  render: SecureHtmlRenderer,
  context: SecureHtmlResponseContext,
): void {
  const nonce = randomBytes(18).toString("base64url");
  response.writeHead(status, secureHtmlHeaders(nonce, context));
  response.end(render(nonce));
}

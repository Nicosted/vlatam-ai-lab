import type { IncomingMessage, ServerResponse } from "node:http";

import { renderRegulatoryResearchWorkspaceHtml } from "../advisory/regulatory-research-workspace.js";
import type { ApplicationIdentityResolver } from "../application/application-access.js";
import type { DeploymentEnvironment } from "../application/deployment-environment.js";
import { handleOperatorConsoleRequest } from "../operator/operator-console-handler.js";
import {
  APPLICATION_SECURITY_HEADERS,
  sendSecureHtmlResponse,
} from "./secure-html-response.js";

export interface ApplicationServerOptions {
  readonly operator_repository_root?: string;
  readonly clock?: () => Date;
  readonly deployment_environment?: DeploymentEnvironment;
  readonly https_context?: boolean;
  readonly resolve_application_identity?: ApplicationIdentityResolver;
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...APPLICATION_SECURITY_HEADERS,
    "Content-Security-Policy":
      "default-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
  });
  response.end(JSON.stringify(body));
}

/**
 * Read-only application surface used by the deployable api/index.ts
 * composition. Provider execution and classifier export APIs remain on the
 * separately composed local classifier server.
 */
export async function handleApplicationRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: ApplicationServerOptions = {},
): Promise<void> {
  if (
    await handleOperatorConsoleRequest(request, response, {
      repository_root: options.operator_repository_root ?? process.cwd(),
      deployment_environment: options.deployment_environment ?? "development",
      https_context: options.https_context ?? false,
      ...(options.resolve_application_identity
        ? { resolve_identity: options.resolve_application_identity }
        : {}),
    })
  )
    return;

  if (request.url === "/healthz" && request.method === "GET") {
    sendJson(response, 200, {
      status: "ok",
      service: "vlatam-ai-lab",
      operational_state_exposed: false,
    });
    return;
  }

  if (request.url === "/health" && request.method === "GET") {
    sendJson(response, 200, {
      status: "healthy",
      timestamp: (options.clock ?? (() => new Date()))().toISOString(),
      version: "1.0.0",
    });
    return;
  }

  if (request.method !== "GET") {
    sendJson(response, 405, {
      error: "Method Not Allowed",
      message: "Only GET is supported",
    });
    return;
  }

  const pathname = request.url?.split("?", 1)[0] ?? "";
  if (pathname === "/research/regulatory/ar-es-ecological-agrochemicals") {
    sendSecureHtmlResponse(
      response,
      200,
      (nonce) => renderRegulatoryResearchWorkspaceHtml(undefined, nonce),
      {
        deployment_environment: options.deployment_environment ?? "development",
        https_context: options.https_context ?? false,
      },
    );
    return;
  }

  sendJson(response, 404, {
    error: "Not Found",
    message: "Endpoint not found",
  });
}

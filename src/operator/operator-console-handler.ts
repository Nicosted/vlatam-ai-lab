import type { IncomingMessage, ServerResponse } from "node:http";

import {
  ANONYMOUS_IDENTITY,
  roleCanView,
  type ApplicationIdentityResolver,
} from "../application/application-access.js";
import {
  APPLICATION_SHELL_ASSET_PATHS,
  APPLICATION_SHELL_CSS,
  APPLICATION_SHELL_JS,
  applicationRouteForPath,
} from "../application/application-shell.js";
import type { DeploymentEnvironment } from "../application/deployment-environment.js";
import {
  APPLICATION_SECURITY_HEADERS,
  sendSecureHtmlResponse,
} from "../server/secure-html-response.js";
import {
  loadRepositoryOperatorReadModel,
  REPOSITORY_OPERATOR_EVALUATED_AT,
} from "./repository-operator-read-model.js";
import {
  OPERATOR_CONSOLE_PATHS,
  renderOperatorConsole,
  renderOperatorInvalidState,
} from "./operator-console.js";

export interface OperatorConsoleOptions {
  readonly repository_root: string;
  readonly load_read_model?: typeof loadRepositoryOperatorReadModel;
  readonly resolve_identity?: ApplicationIdentityResolver;
  readonly deployment_environment?: DeploymentEnvironment;
  readonly https_context?: boolean;
}

export { APPLICATION_SECURITY_HEADERS };

const assetSecurityHeaders = (
  environment: DeploymentEnvironment,
  httpsContext: boolean,
): Record<string, string> => ({
  ...APPLICATION_SECURITY_HEADERS,
  ...(environment === "production" && httpsContext
    ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains" }
    : {}),
});

const sendAsset = (
  res: ServerResponse,
  contentType: string,
  body: string,
  environment: DeploymentEnvironment,
  httpsContext: boolean,
): void => {
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=300",
    ...assetSecurityHeaders(environment, httpsContext),
  });
  res.end(body);
};

const statusPage = (status: 401 | 403 | 404): string => {
  const heading =
    status === 401
      ? "Identidad requerida"
      : status === 403
        ? "Vista no disponible para este rol"
        : "Vista no encontrada";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>AI LAB — ${heading}</title></head><body><main><h1>${heading}</h1><p>La frontera de aplicación falló cerrada. El rol de interfaz no concede autoridad operativa.</p></main></body></html>`;
};

export async function handleOperatorConsoleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: OperatorConsoleOptions,
): Promise<boolean> {
  const requestedPathname = req.url?.split("?", 1)[0] ?? "";
  const pathname = requestedPathname === "/" ? "/operator" : requestedPathname;
  const deploymentEnvironment = options.deployment_environment ?? "development";
  const httpsContext = options.https_context ?? false;
  if (pathname === APPLICATION_SHELL_ASSET_PATHS.css && req.method === "GET") {
    sendAsset(
      res,
      "text/css; charset=utf-8",
      APPLICATION_SHELL_CSS,
      deploymentEnvironment,
      httpsContext,
    );
    return true;
  }
  if (pathname === APPLICATION_SHELL_ASSET_PATHS.js && req.method === "GET") {
    sendAsset(
      res,
      "text/javascript; charset=utf-8",
      APPLICATION_SHELL_JS,
      deploymentEnvironment,
      httpsContext,
    );
    return true;
  }
  if (!pathname.startsWith("/operator")) return false;
  if (req.method !== "GET") {
    res.writeHead(405, {
      Allow: "GET",
      "Cache-Control": "no-store",
      ...assetSecurityHeaders(deploymentEnvironment, httpsContext),
    });
    res.end("Method Not Allowed");
    return true;
  }
  if (!OPERATOR_CONSOLE_PATHS.has(pathname)) {
    sendSecureHtmlResponse(res, 404, () => statusPage(404), {
      deployment_environment: deploymentEnvironment,
      https_context: httpsContext,
    });
    return true;
  }
  const identity = (options.resolve_identity ?? (() => ANONYMOUS_IDENTITY))(
    req,
  );
  if (!identity.authenticated) {
    sendSecureHtmlResponse(res, 401, () => statusPage(401), {
      deployment_environment: deploymentEnvironment,
      https_context: httpsContext,
    });
    return true;
  }
  const route = applicationRouteForPath(pathname);
  if (route !== null && !roleCanView(identity.role, route.allowed_roles)) {
    sendSecureHtmlResponse(res, 403, () => statusPage(403), {
      deployment_environment: deploymentEnvironment,
      https_context: httpsContext,
    });
    return true;
  }
  try {
    const model = await (
      options.load_read_model ?? loadRepositoryOperatorReadModel
    )({
      repository_root: options.repository_root,
      evaluated_at: REPOSITORY_OPERATOR_EVALUATED_AT,
    });
    if (model.system_summary.overall_status === "invalid_state") {
      sendSecureHtmlResponse(res, 500, () => renderOperatorInvalidState(), {
        deployment_environment: deploymentEnvironment,
        https_context: httpsContext,
      });
      return true;
    }
    const html = renderOperatorConsole(model, pathname, {
      identity,
      deployment_environment: deploymentEnvironment,
    });
    sendSecureHtmlResponse(res, 200, () => html, {
      deployment_environment: deploymentEnvironment,
      https_context: httpsContext,
    });
  } catch {
    sendSecureHtmlResponse(res, 500, () => renderOperatorInvalidState(), {
      deployment_environment: deploymentEnvironment,
      https_context: httpsContext,
    });
  }
  return true;
}

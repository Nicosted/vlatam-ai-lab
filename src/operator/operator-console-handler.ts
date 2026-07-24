import type { IncomingMessage, ServerResponse } from "node:http";

import {
  resolveLocalApplicationIdentity,
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
}

export const APPLICATION_SECURITY_HEADERS: Readonly<Record<string, string>> =
  Object.freeze({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'none'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
  });

const securityHeaders = (
  environment: DeploymentEnvironment,
): Record<string, string> => ({
  ...APPLICATION_SECURITY_HEADERS,
  ...(environment === "production"
    ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains" }
    : {}),
});

const sendHtml = (
  res: ServerResponse,
  status: number,
  html: string,
  environment: DeploymentEnvironment,
): void => {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    ...securityHeaders(environment),
  });
  res.end(html);
};

const sendAsset = (
  res: ServerResponse,
  contentType: string,
  body: string,
  environment: DeploymentEnvironment,
): void => {
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=300",
    ...securityHeaders(environment),
  });
  res.end(body);
};

const accessPage = (status: 401 | 403): string =>
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>AI LAB — Acceso protegido</title></head><body><main><h1>${status === 401 ? "Identidad requerida" : "Vista no disponible para este rol"}</h1><p>La frontera de aplicación falló cerrada. El rol de interfaz no concede autoridad operativa.</p></main></body></html>`;

export async function handleOperatorConsoleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: OperatorConsoleOptions,
): Promise<boolean> {
  const requestedPathname = req.url?.split("?", 1)[0] ?? "";
  const pathname = requestedPathname === "/" ? "/operator" : requestedPathname;
  const deploymentEnvironment = options.deployment_environment ?? "development";
  if (pathname === APPLICATION_SHELL_ASSET_PATHS.css && req.method === "GET") {
    sendAsset(
      res,
      "text/css; charset=utf-8",
      APPLICATION_SHELL_CSS,
      deploymentEnvironment,
    );
    return true;
  }
  if (pathname === APPLICATION_SHELL_ASSET_PATHS.js && req.method === "GET") {
    sendAsset(
      res,
      "text/javascript; charset=utf-8",
      APPLICATION_SHELL_JS,
      deploymentEnvironment,
    );
    return true;
  }
  if (!pathname.startsWith("/operator")) return false;
  if (req.method !== "GET") {
    res.writeHead(405, {
      Allow: "GET",
      "Cache-Control": "no-store",
      ...securityHeaders(deploymentEnvironment),
    });
    res.end("Method Not Allowed");
    return true;
  }
  if (!OPERATOR_CONSOLE_PATHS.has(pathname)) {
    res.writeHead(404, {
      "Cache-Control": "no-store",
      ...securityHeaders(deploymentEnvironment),
    });
    res.end("Not Found");
    return true;
  }
  const identity = (
    options.resolve_identity ?? resolveLocalApplicationIdentity
  )(req);
  if (!identity.authenticated) {
    res.writeHead(401, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      ...securityHeaders(deploymentEnvironment),
    });
    res.end(accessPage(401));
    return true;
  }
  const route = applicationRouteForPath(pathname);
  if (route !== null && !roleCanView(identity.role, route.allowed_roles)) {
    res.writeHead(403, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      ...securityHeaders(deploymentEnvironment),
    });
    res.end(accessPage(403));
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
      sendHtml(res, 500, renderOperatorInvalidState(), deploymentEnvironment);
      return true;
    }
    const html = renderOperatorConsole(model, pathname, {
      identity,
      deployment_environment: deploymentEnvironment,
    });
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      ...securityHeaders(deploymentEnvironment),
    });
    res.end(html);
  } catch {
    sendHtml(res, 500, renderOperatorInvalidState(), deploymentEnvironment);
  }
  return true;
}

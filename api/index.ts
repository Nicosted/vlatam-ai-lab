import type { IncomingMessage, ServerResponse } from "node:http";

import { ANONYMOUS_IDENTITY } from "../src/application/application-access.js";
import { validateApplicationEnvironment } from "../src/application/deployment-environment.js";
import { handleClassifierRequest } from "../src/server/api-server.js";

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const validation = validateApplicationEnvironment({
    AI_LAB_DEPLOYMENT_ENV: process.env["AI_LAB_DEPLOYMENT_ENV"],
    AI_LAB_PUBLIC_ORIGIN: process.env["AI_LAB_PUBLIC_ORIGIN"],
  });
  if (!validation.valid || validation.environment === null) {
    response.writeHead(503, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(
      JSON.stringify({
        error: "Service Unavailable",
        message: "AI LAB environment validation failed closed",
      }),
    );
    return;
  }

  await handleClassifierRequest(request, response, {
    operator_repository_root: process.cwd(),
    deployment_environment: validation.environment.deployment_environment,
    ...(validation.environment.deployment_environment === "production"
      ? { resolve_application_identity: () => ANONYMOUS_IDENTITY }
      : {}),
  });
}

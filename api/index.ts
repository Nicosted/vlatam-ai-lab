import type { IncomingMessage, ServerResponse } from "node:http";

import {
  ANONYMOUS_IDENTITY,
  createLocalDevelopmentIdentityResolver,
  type ApplicationIdentityResolver,
} from "../src/application/application-access.js";
import {
  createCloudflareAccessIdentityResolver,
  type CloudflareAccessIdentityResolverOptions,
} from "../src/application/cloudflare-access-identity.js";
import { validateApplicationEnvironment } from "../src/application/deployment-environment.js";
import { handleApplicationRequest } from "../src/server/application-server.js";

type EnvironmentSource = () => Readonly<Record<string, string | undefined>>;

export interface ApplicationEntrypointOptions {
  readonly environment?: EnvironmentSource;
  readonly repository_root?: string;
  readonly test_identity_resolver?: ApplicationIdentityResolver;
  readonly cloudflare_access_jwks?: CloudflareAccessIdentityResolverOptions["jwks"];
  readonly cloudflare_access_clock?: CloudflareAccessIdentityResolverOptions["clock"];
}

const processEnvironment: EnvironmentSource = () => ({
  AI_LAB_DEPLOYMENT_ENV: process.env["AI_LAB_DEPLOYMENT_ENV"],
  AI_LAB_RUNTIME_MODE: process.env["AI_LAB_RUNTIME_MODE"],
  AI_LAB_PUBLIC_ORIGIN: process.env["AI_LAB_PUBLIC_ORIGIN"],
  AI_LAB_LOCAL_AUTH_ENABLED: process.env["AI_LAB_LOCAL_AUTH_ENABLED"],
  AI_LAB_IDENTITY_PROVIDER: process.env["AI_LAB_IDENTITY_PROVIDER"],
  AI_LAB_CLOUDFLARE_ACCESS_ISSUER:
    process.env["AI_LAB_CLOUDFLARE_ACCESS_ISSUER"],
  AI_LAB_CLOUDFLARE_ACCESS_AUDIENCE:
    process.env["AI_LAB_CLOUDFLARE_ACCESS_AUDIENCE"],
  AI_LAB_IDENTITY_ROLE_BINDINGS: process.env["AI_LAB_IDENTITY_ROLE_BINDINGS"],
});

const failClosed = (response: ServerResponse): void => {
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
};

export function createApplicationEntrypoint(
  options: ApplicationEntrypointOptions = {},
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request, response) => {
    const validation = validateApplicationEnvironment(
      (options.environment ?? processEnvironment)(),
    );
    if (!validation.valid || validation.environment === null) {
      failClosed(response);
      return;
    }

    const environment = validation.environment;
    if (
      options.test_identity_resolver !== undefined &&
      environment.runtime_mode !== "test"
    ) {
      failClosed(response);
      return;
    }

    let resolveIdentity: ApplicationIdentityResolver;
    if (environment.runtime_mode === "development_local")
      resolveIdentity = createLocalDevelopmentIdentityResolver({
        runtime_mode: environment.runtime_mode,
        enabled: environment.local_auth_enabled,
      });
    else if (
      environment.runtime_mode === "test" &&
      options.test_identity_resolver !== undefined
    )
      resolveIdentity = options.test_identity_resolver;
    else if (
      (environment.runtime_mode === "preview" ||
        environment.runtime_mode === "production") &&
      environment.identity_provider === "cloudflare_access" &&
      environment.cloudflare_access !== null
    )
      resolveIdentity = createCloudflareAccessIdentityResolver({
        configuration: environment.cloudflare_access,
        ...(options.cloudflare_access_jwks
          ? { jwks: options.cloudflare_access_jwks }
          : {}),
        ...(options.cloudflare_access_clock
          ? { clock: options.cloudflare_access_clock }
          : {}),
      });
    else resolveIdentity = async () => ANONYMOUS_IDENTITY;

    await handleApplicationRequest(request, response, {
      operator_repository_root: options.repository_root ?? process.cwd(),
      deployment_environment: environment.deployment_environment,
      https_context: new URL(environment.public_origin).protocol === "https:",
      resolve_application_identity: resolveIdentity,
    });
  };
}

const handler = createApplicationEntrypoint();

export default handler;

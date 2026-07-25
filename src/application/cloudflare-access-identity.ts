import type { IncomingMessage } from "node:http";

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

import {
  ANONYMOUS_IDENTITY,
  type ApplicationIdentity,
  type ApplicationIdentityResolver,
  type ApplicationRole,
} from "./application-access.js";
import {
  normalizeIdentityEmail,
  type CloudflareAccessIdentityConfiguration,
} from "./deployment-environment.js";

const CLOUDFLARE_ACCESS_JWT_HEADER = "cf-access-jwt-assertion";
const CLOUDFLARE_ACCESS_ALGORITHMS = ["RS256"] as const;
const JWKS_TIMEOUT_MS = 5_000;
const REMOTE_JWK_SETS = new Map<string, JWTVerifyGetKey>();

export interface CloudflareAccessIdentityResolverOptions {
  readonly configuration: CloudflareAccessIdentityConfiguration;
  readonly jwks?: JWTVerifyGetKey;
  readonly clock?: () => Date;
}

export function deriveCloudflareAccessJwksUrl(issuer: string): URL {
  return new URL("/cdn-cgi/access/certs", issuer);
}

const remoteJwksForIssuer = (issuer: string): JWTVerifyGetKey => {
  const cached = REMOTE_JWK_SETS.get(issuer);
  if (cached !== undefined) return cached;
  const jwks = createRemoteJWKSet(deriveCloudflareAccessJwksUrl(issuer), {
    timeoutDuration: JWKS_TIMEOUT_MS,
  });
  REMOTE_JWK_SETS.set(issuer, jwks);
  return jwks;
};

const assertionFromRequest = (request: IncomingMessage): string | null => {
  const rawHeaderCount = (request.rawHeaders ?? []).reduce(
    (count, value, index) =>
      index % 2 === 0 && value.toLowerCase() === CLOUDFLARE_ACCESS_JWT_HEADER
        ? count + 1
        : count,
    0,
  );
  if (rawHeaderCount > 1) return null;
  const assertion = request.headers[CLOUDFLARE_ACCESS_JWT_HEADER];
  if (typeof assertion !== "string") return null;
  const trimmed = assertion.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const roleForEmail = (
  configuration: CloudflareAccessIdentityConfiguration,
  email: string,
): ApplicationRole | null => {
  for (const role of ["viewer", "operator", "reviewer", "admin"] as const)
    if (configuration.role_bindings[role].includes(email)) return role;
  return null;
};

export function createCloudflareAccessIdentityResolver(
  options: CloudflareAccessIdentityResolverOptions,
): ApplicationIdentityResolver {
  const { configuration } = options;
  const jwks = options.jwks ?? remoteJwksForIssuer(configuration.issuer);

  return async (request) => {
    const assertion = assertionFromRequest(request);
    if (assertion === null) return ANONYMOUS_IDENTITY;

    try {
      const { payload } = await jwtVerify(assertion, jwks, {
        algorithms: [...CLOUDFLARE_ACCESS_ALGORITHMS],
        issuer: configuration.issuer,
        audience: configuration.audience,
        requiredClaims: ["exp", "email"],
        ...(options.clock ? { currentDate: options.clock() } : {}),
      });
      if (typeof payload.email !== "string") return ANONYMOUS_IDENTITY;
      const email = normalizeIdentityEmail(payload.email);
      if (email === null) return ANONYMOUS_IDENTITY;
      const role = roleForEmail(configuration, email);
      if (role === null) return ANONYMOUS_IDENTITY;

      const identity: ApplicationIdentity = Object.freeze({
        authenticated: true,
        display_name: email,
        subject: `cloudflare-access:${email}`,
        role,
        source: "trusted-upstream",
      });
      return identity;
    } catch {
      return ANONYMOUS_IDENTITY;
    }
  };
}

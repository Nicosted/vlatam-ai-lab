import type { IncomingMessage } from "node:http";

import type { ApplicationRuntimeMode } from "./deployment-environment.js";
import { isLoopbackHostname } from "./deployment-environment.js";

export const APPLICATION_ROLES = [
  "viewer",
  "operator",
  "reviewer",
  "admin",
] as const;

export type ApplicationRole = (typeof APPLICATION_ROLES)[number];

export interface ApplicationIdentity {
  readonly authenticated: boolean;
  readonly display_name: string;
  readonly subject: string;
  readonly role: ApplicationRole;
  readonly source: "local-development" | "trusted-upstream";
}

export type ApplicationIdentityResolver = (
  request: IncomingMessage,
) => Promise<ApplicationIdentity>;

export const LOCAL_DEVELOPMENT_IDENTITY: ApplicationIdentity = Object.freeze({
  authenticated: true,
  display_name: "Operador local",
  subject: "local:operator",
  role: "operator",
  source: "local-development",
});

export const ANONYMOUS_IDENTITY: ApplicationIdentity = Object.freeze({
  authenticated: false,
  display_name: "Sin identidad",
  subject: "anonymous",
  role: "viewer",
  source: "local-development",
});

const isRole = (value: string): value is ApplicationRole =>
  (APPLICATION_ROLES as readonly string[]).includes(value);

const isLoopbackAddress = (address: string | undefined): boolean =>
  address === "127.0.0.1" ||
  address === "::1" ||
  address === "::ffff:127.0.0.1" ||
  (address?.startsWith("127.") ?? false);

const requestHostIsLoopback = (request: IncomingMessage): boolean => {
  const host = request.headers.host;
  if (typeof host !== "string" || host.length === 0) return false;
  try {
    return isLoopbackHostname(new URL(`http://${host}`).hostname);
  } catch {
    return false;
  }
};

export interface LocalDevelopmentIdentityOptions {
  readonly runtime_mode: ApplicationRuntimeMode;
  readonly enabled: boolean;
}

/**
 * Explicit developer-only adapter. Callers cannot construct an authenticated
 * identity unless mode, feature flag, remote address, and Host are all local.
 */
export function createLocalDevelopmentIdentityResolver(
  options: LocalDevelopmentIdentityOptions,
): ApplicationIdentityResolver {
  return async (request) => {
    if (
      options.runtime_mode !== "development_local" ||
      !options.enabled ||
      !isLoopbackAddress(request.socket.remoteAddress) ||
      !requestHostIsLoopback(request)
    )
      return ANONYMOUS_IDENTITY;

    const requestedRole = request.headers["x-ai-lab-local-role"];
    const role =
      typeof requestedRole === "string" && isRole(requestedRole)
        ? requestedRole
        : LOCAL_DEVELOPMENT_IDENTITY.role;
    return Object.freeze({
      ...LOCAL_DEVELOPMENT_IDENTITY,
      display_name: `Operador local · ${role}`,
      role,
    });
  };
}

const ROLE_RANK: Readonly<Record<ApplicationRole, number>> = {
  viewer: 0,
  operator: 1,
  reviewer: 2,
  admin: 3,
};

export function roleCanView(
  role: ApplicationRole,
  allowedRoles: readonly ApplicationRole[],
): boolean {
  return allowedRoles.includes(role);
}

export function roleAtLeast(
  role: ApplicationRole,
  minimum: ApplicationRole,
): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

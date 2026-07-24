import type { IncomingMessage } from "node:http";

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
) => ApplicationIdentity;

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

/**
 * Development-safe adapter. Production must replace this resolver with a
 * separately reviewed trusted-upstream identity boundary. A header value is
 * display context only and never creates operational authority.
 */
export const resolveLocalApplicationIdentity: ApplicationIdentityResolver = (
  request,
) => {
  const requestedRole = request.headers?.["x-ai-lab-local-role"];
  if (typeof requestedRole === "string" && isRole(requestedRole)) {
    return Object.freeze({
      ...LOCAL_DEVELOPMENT_IDENTITY,
      display_name: `Operador local · ${requestedRole}`,
      role: requestedRole,
    });
  }
  return LOCAL_DEVELOPMENT_IDENTITY;
};

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

export const DEPLOYMENT_ENVIRONMENTS = [
  "development",
  "preview",
  "production",
] as const;

export type DeploymentEnvironment = (typeof DEPLOYMENT_ENVIRONMENTS)[number];

export const APPLICATION_RUNTIME_MODES = [
  "development_local",
  "preview",
  "production",
  "test",
] as const;

export type ApplicationRuntimeMode = (typeof APPLICATION_RUNTIME_MODES)[number];

export const APPLICATION_IDENTITY_PROVIDERS = ["cloudflare_access"] as const;

export type ApplicationIdentityProvider =
  (typeof APPLICATION_IDENTITY_PROVIDERS)[number];

export const APPLICATION_IDENTITY_ROLES = [
  "viewer",
  "operator",
  "reviewer",
  "admin",
] as const;

export type ApplicationIdentityRole =
  (typeof APPLICATION_IDENTITY_ROLES)[number];

export interface CloudflareAccessIdentityConfiguration {
  readonly issuer: string;
  readonly audience: string;
  readonly role_bindings: Readonly<
    Record<ApplicationIdentityRole, readonly string[]>
  >;
}

export interface ApplicationEnvironment {
  readonly deployment_environment: DeploymentEnvironment;
  readonly runtime_mode: ApplicationRuntimeMode;
  readonly public_origin: string;
  readonly local_auth_enabled: boolean;
  readonly identity_provider: ApplicationIdentityProvider | null;
  readonly cloudflare_access: CloudflareAccessIdentityConfiguration | null;
}

export interface EnvironmentValidation {
  readonly valid: boolean;
  readonly environment: ApplicationEnvironment | null;
  readonly errors: readonly string[];
}

const isDeploymentEnvironment = (
  value: string,
): value is DeploymentEnvironment =>
  (DEPLOYMENT_ENVIRONMENTS as readonly string[]).includes(value);

const isRuntimeMode = (value: string): value is ApplicationRuntimeMode =>
  (APPLICATION_RUNTIME_MODES as readonly string[]).includes(value);

const isIdentityRole = (value: string): value is ApplicationIdentityRole =>
  (APPLICATION_IDENTITY_ROLES as readonly string[]).includes(value);

const expectedDeploymentEnvironment = (
  runtimeMode: ApplicationRuntimeMode,
): DeploymentEnvironment =>
  runtimeMode === "production"
    ? "production"
    : runtimeMode === "preview"
      ? "preview"
      : "development";

export const isLoopbackHostname = (hostname: string): boolean =>
  hostname === "localhost" ||
  hostname === "::1" ||
  hostname === "[::1]" ||
  /^127(?:\.\d{1,3}){3}$/.test(hostname);

const EMAIL_LOCAL_PART = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i;
const EMAIL_DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export function normalizeIdentityEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length === 0 ||
    normalized.length > 254 ||
    normalized.includes("..")
  )
    return null;
  const separator = normalized.indexOf("@");
  if (
    separator <= 0 ||
    separator !== normalized.lastIndexOf("@") ||
    separator > 64
  )
    return null;
  const localPart = normalized.slice(0, separator);
  const domain = normalized.slice(separator + 1);
  if (
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    !EMAIL_LOCAL_PART.test(localPart)
  )
    return null;
  const labels = domain.split(".");
  if (
    domain.length > 253 ||
    labels.length < 2 ||
    labels.some((label) => !EMAIL_DOMAIN_LABEL.test(label))
  )
    return null;
  return normalized;
}

const parseCloudflareIssuer = (value: string | undefined): string | null => {
  if (value === undefined || value !== value.trim()) return null;
  try {
    const issuer = new URL(value);
    if (
      issuer.protocol !== "https:" ||
      issuer.username !== "" ||
      issuer.password !== "" ||
      issuer.pathname !== "/" ||
      issuer.search !== "" ||
      issuer.hash !== ""
    )
      return null;
    return issuer.origin;
  } catch {
    return null;
  }
};

const parseRoleBindings = (
  value: string | undefined,
): Readonly<Record<ApplicationIdentityRole, readonly string[]>> | null => {
  if (value === undefined) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    return null;
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    Object.getPrototypeOf(parsed) !== Object.prototype
  )
    return null;

  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== APPLICATION_IDENTITY_ROLES.length ||
    keys.some((key) => !isIdentityRole(key)) ||
    APPLICATION_IDENTITY_ROLES.some((role) => !(role in record))
  )
    return null;

  const seen = new Set<string>();
  const normalized = {} as Record<ApplicationIdentityRole, readonly string[]>;
  for (const role of APPLICATION_IDENTITY_ROLES) {
    const values = record[role];
    if (
      !Array.isArray(values) ||
      values.some((email) => typeof email !== "string")
    )
      return null;
    const emails: string[] = [];
    for (const value of values as string[]) {
      const email = normalizeIdentityEmail(value);
      if (email === null || seen.has(email)) return null;
      seen.add(email);
      emails.push(email);
    }
    normalized[role] = Object.freeze(emails);
  }
  return Object.freeze(normalized);
};

export function validateApplicationEnvironment(
  input: Readonly<Record<string, string | undefined>>,
): EnvironmentValidation {
  const rawEnvironment = input["AI_LAB_DEPLOYMENT_ENV"];
  const rawRuntimeMode = input["AI_LAB_RUNTIME_MODE"];
  const rawOrigin = input["AI_LAB_PUBLIC_ORIGIN"];
  const localAuthEnabled = input["AI_LAB_LOCAL_AUTH_ENABLED"] === "true";
  const rawIdentityProvider = input["AI_LAB_IDENTITY_PROVIDER"];
  const protectedRuntime =
    rawRuntimeMode === "preview" || rawRuntimeMode === "production";
  const errors: string[] = [];

  if (rawEnvironment === undefined || !isDeploymentEnvironment(rawEnvironment))
    errors.push(
      "AI_LAB_DEPLOYMENT_ENV must be development, preview, or production",
    );
  if (rawRuntimeMode === undefined || !isRuntimeMode(rawRuntimeMode))
    errors.push(
      "AI_LAB_RUNTIME_MODE must be development_local, preview, production, or test",
    );
  if (
    rawEnvironment !== undefined &&
    isDeploymentEnvironment(rawEnvironment) &&
    rawRuntimeMode !== undefined &&
    isRuntimeMode(rawRuntimeMode) &&
    rawEnvironment !== expectedDeploymentEnvironment(rawRuntimeMode)
  )
    errors.push("AI_LAB_RUNTIME_MODE does not match AI_LAB_DEPLOYMENT_ENV");
  if (localAuthEnabled && rawRuntimeMode !== "development_local")
    errors.push(
      "AI_LAB_LOCAL_AUTH_ENABLED is permitted only in development_local mode",
    );

  let origin: URL | null = null;
  try {
    origin = rawOrigin === undefined ? null : new URL(rawOrigin);
  } catch {
    origin = null;
  }
  if (
    origin === null ||
    origin.pathname !== "/" ||
    origin.search !== "" ||
    origin.hash !== ""
  )
    errors.push("AI_LAB_PUBLIC_ORIGIN must be an absolute origin");
  if (rawEnvironment === "production" && origin?.protocol !== "https:")
    errors.push("production AI_LAB_PUBLIC_ORIGIN must use https");
  if (
    rawRuntimeMode === "development_local" &&
    origin !== null &&
    !isLoopbackHostname(origin.hostname)
  )
    errors.push("development_local AI_LAB_PUBLIC_ORIGIN must be loopback");

  let identityProvider: ApplicationIdentityProvider | null = null;
  let cloudflareAccess: CloudflareAccessIdentityConfiguration | null = null;
  if (protectedRuntime) {
    if (rawIdentityProvider !== "cloudflare_access")
      errors.push(
        "AI_LAB_IDENTITY_PROVIDER must be cloudflare_access in preview or production",
      );
    else {
      identityProvider = rawIdentityProvider;
      const issuer = parseCloudflareIssuer(
        input["AI_LAB_CLOUDFLARE_ACCESS_ISSUER"],
      );
      const audience = input["AI_LAB_CLOUDFLARE_ACCESS_AUDIENCE"]?.trim() ?? "";
      const roleBindings = parseRoleBindings(
        input["AI_LAB_IDENTITY_ROLE_BINDINGS"],
      );
      if (issuer === null)
        errors.push(
          "AI_LAB_CLOUDFLARE_ACCESS_ISSUER must be an absolute HTTPS origin",
        );
      if (audience.length === 0)
        errors.push("AI_LAB_CLOUDFLARE_ACCESS_AUDIENCE must be non-empty");
      if (roleBindings === null)
        errors.push(
          "AI_LAB_IDENTITY_ROLE_BINDINGS must be a strict role-to-email JSON mapping",
        );
      if (issuer !== null && audience.length > 0 && roleBindings !== null)
        cloudflareAccess = Object.freeze({
          issuer,
          audience,
          role_bindings: roleBindings,
        });
    }
  } else if (rawIdentityProvider !== undefined) {
    errors.push(
      "AI_LAB_IDENTITY_PROVIDER is permitted only in preview or production",
    );
  }

  return Object.freeze({
    valid: errors.length === 0,
    environment:
      errors.length === 0 &&
      rawEnvironment &&
      rawRuntimeMode &&
      isRuntimeMode(rawRuntimeMode) &&
      origin
        ? Object.freeze({
            deployment_environment: rawEnvironment as DeploymentEnvironment,
            runtime_mode: rawRuntimeMode,
            public_origin: origin.origin,
            local_auth_enabled: localAuthEnabled,
            identity_provider: identityProvider,
            cloudflare_access: cloudflareAccess,
          })
        : null,
    errors: Object.freeze(errors),
  });
}

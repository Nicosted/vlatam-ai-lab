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

export interface ApplicationEnvironment {
  readonly deployment_environment: DeploymentEnvironment;
  readonly runtime_mode: ApplicationRuntimeMode;
  readonly public_origin: string;
  readonly local_auth_enabled: boolean;
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

export function validateApplicationEnvironment(
  input: Readonly<Record<string, string | undefined>>,
): EnvironmentValidation {
  const rawEnvironment = input["AI_LAB_DEPLOYMENT_ENV"];
  const rawRuntimeMode = input["AI_LAB_RUNTIME_MODE"];
  const rawOrigin = input["AI_LAB_PUBLIC_ORIGIN"];
  const localAuthEnabled = input["AI_LAB_LOCAL_AUTH_ENABLED"] === "true";
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
          })
        : null,
    errors: Object.freeze(errors),
  });
}

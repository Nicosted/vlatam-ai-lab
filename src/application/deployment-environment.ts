export const DEPLOYMENT_ENVIRONMENTS = [
  "development",
  "preview",
  "production",
] as const;

export type DeploymentEnvironment = (typeof DEPLOYMENT_ENVIRONMENTS)[number];

export interface ApplicationEnvironment {
  readonly deployment_environment: DeploymentEnvironment;
  readonly public_origin: string;
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

export function validateApplicationEnvironment(
  input: Readonly<Record<string, string | undefined>>,
): EnvironmentValidation {
  const rawEnvironment = input["AI_LAB_DEPLOYMENT_ENV"];
  const rawOrigin = input["AI_LAB_PUBLIC_ORIGIN"];
  const errors: string[] = [];

  if (rawEnvironment === undefined || !isDeploymentEnvironment(rawEnvironment))
    errors.push(
      "AI_LAB_DEPLOYMENT_ENV must be development, preview, or production",
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

  return Object.freeze({
    valid: errors.length === 0,
    environment:
      errors.length === 0 && rawEnvironment && origin
        ? Object.freeze({
            deployment_environment: rawEnvironment as DeploymentEnvironment,
            public_origin: origin.origin,
          })
        : null,
    errors: Object.freeze(errors),
  });
}

/** Narrow final-boundary secret access for the governed OpenRouter sandbox. */
export interface OpenRouterSecretProvider {
  resolve(referenceName: string): Promise<string | undefined>;
}

/**
 * The only runtime helper that may read an environment value. Construction is
 * side-effect free; the named value is read only when `resolve` is called after
 * every non-secret preflight gate has passed.
 */
export function createOpenRouterEnvironmentSecretProvider(): OpenRouterSecretProvider {
  return {
    resolve: async (referenceName) => process.env[referenceName],
  };
}

export async function resolveOpenRouterSecret(
  provider: OpenRouterSecretProvider,
  referenceName: string,
): Promise<string | undefined> {
  const value = await provider.resolve(referenceName);
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

/**
 * Governed OpenRouter boundary test.
 *
 * Pins the AI-85 invariants at the repository level:
 *
 *  1. the OpenRouter endpoint literal exists only inside the provider
 *     layer (`src/providers/`) — nowhere else in runtime source, and
 *     never in configuration or schemas (config carries only the
 *     `openrouter-api-v1` identifier);
 *  2. the API-key environment variable is read only inside the
 *     provider layer, and no secret value is stored anywhere;
 *  3. no domain capability, gateway, or script references OpenRouter
 *     or an OpenRouter model directly — provider knowledge outside
 *     `src/providers/` is limited to the injected registry boundary;
 *  4. `openrouter/auto` appears in no runtime source or configuration
 *     (invalid fixtures and tests may name it only to reject it);
 *  5. no automatic fallback identifier is introduced;
 *  6. no OpenRouter execution profile exists and the readiness catalog
 *     keeps every candidate disabled and runtime-blocked.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");

function walk(dir: string, extensions: readonly string[]): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      out.push(...walk(full, extensions));
    } else if (extensions.some((extension) => entry.endsWith(extension))) {
      out.push(relative(repoRoot, full));
    }
  }
  return out;
}

const runtimeSources = [
  ...walk(resolve(repoRoot, "src"), [".ts"]),
  ...walk(resolve(repoRoot, "scripts"), [".ts"]),
].sort();
const read = (relPath: string): string =>
  readFileSync(resolve(repoRoot, relPath), "utf-8");
const isProviderLayer = (relPath: string): boolean =>
  relPath.startsWith("src/providers/");

describe("governed OpenRouter provider boundary", () => {
  it("keeps the OpenRouter endpoint literal inside the provider layer only", () => {
    const violations = runtimeSources.filter(
      (relPath) =>
        !isProviderLayer(relPath) && /openrouter\.ai/.test(read(relPath)),
    );
    assert.deepEqual(violations, []);
    // Configuration and schemas carry only the base-url identifier.
    for (const file of [
      "config/ai-openrouter-adapter.json",
      "schemas/ai-openrouter-adapter-config.schema.json",
      "schemas/ai-openrouter-route-policy.schema.json",
    ]) {
      assert.doesNotMatch(read(file), /openrouter\.ai/, file);
    }
    // The adapter configuration holds no URL at all.
    assert.doesNotMatch(
      read("config/ai-openrouter-adapter.json"),
      /https?:\/\//,
    );
  });

  it("reads the API-key environment variable only inside the provider layer", () => {
    const violations = runtimeSources.filter(
      (relPath) =>
        !isProviderLayer(relPath) &&
        /OPENROUTER_API_KEY|AI_LAB_OPENROUTER_ENABLED/.test(read(relPath)),
    );
    assert.deepEqual(violations, []);
  });

  it("stores no credential value in the adapter config, fixtures, or schemas", () => {
    for (const file of [
      "config/ai-openrouter-adapter.json",
      "data/fixtures/providers/openrouter-route-policy-valid.json",
      "schemas/ai-openrouter-adapter-config.schema.json",
      "schemas/ai-openrouter-route-policy.schema.json",
    ]) {
      assert.doesNotMatch(read(file), /sk-or-|Bearer\s/, file);
    }
  });

  it("keeps domain capabilities and the gateway free of OpenRouter references", () => {
    const violations = runtimeSources.filter(
      (relPath) =>
        !isProviderLayer(relPath) && /openrouter/i.test(read(relPath)),
    );
    assert.deepEqual(violations, []);
  });

  it("forbids openrouter/auto in runtime source and live configuration", () => {
    const sources = [
      ...runtimeSources,
      "config/ai-openrouter-adapter.json",
      "config/ai-execution-profiles.json",
      "data/fixtures/providers/openrouter-route-policy-valid.json",
    ];
    const violations = sources.filter((relPath) => {
      const content = read(relPath);
      if (!content.includes("openrouter/auto")) return false;
      // The contract module may name the forbidden id solely to reject it.
      return relPath !== "src/providers/openrouter-config.ts";
    });
    assert.deepEqual(violations, []);
  });

  it("introduces no automatic fallback identifier in the adapter modules", () => {
    for (const relPath of runtimeSources.filter(isProviderLayer)) {
      const content = read(relPath);
      assert.doesNotMatch(
        content,
        /\bfallbackModels\b|\bfallback_models\b|\bgenerateWithFallback\b/,
        relPath,
      );
    }
    // The only allow_fallbacks value the adapter can send is `false`.
    const adapterSource = read("src/providers/openrouter-adapter.ts");
    assert.doesNotMatch(
      adapterSource,
      /allow_fallbacks:(?!\s*false)/,
      "allow_fallbacks must be hardcoded false",
    );
  });

  it("adds no OpenRouter execution profile and keeps candidates blocked", () => {
    const profiles = (
      JSON.parse(read("config/ai-execution-profiles.json")) as {
        profiles: { provider_id: string }[];
      }
    ).profiles;
    assert.ok(profiles.every((entry) => entry.provider_id !== "openrouter"));
    const readiness = (
      JSON.parse(read("config/ai-candidate-profile-readiness.json")) as {
        profiles: {
          enabled: boolean;
          runtime_eligibility: string;
          lifecycle_status: string;
        }[];
      }
    ).profiles;
    assert.ok(
      readiness.every(
        (entry) =>
          entry.enabled === false &&
          entry.runtime_eligibility === "blocked" &&
          entry.lifecycle_status === "candidate",
      ),
    );
  });
});

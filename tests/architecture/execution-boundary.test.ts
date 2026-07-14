/**
 * Governed AI execution boundary test.
 *
 * Enforces ADR-003 at the repository level: every provider call must pass
 * through the MultiProviderGateway and its adapter layer. The test scans
 * runtime source (`src/**` and `scripts/**`) and fails when a change
 * introduces:
 *
 *  1. a direct provider SDK import outside the adapter layer
 *     (`src/providers/`);
 *  2. a model/provider API endpoint literal outside the adapter layer
 *     (this also catches raw `fetch` calls to provider execution
 *     endpoints, regardless of how the request is issued);
 *  3. a value (non-type) import of the adapter layer from domain code —
 *     adapters may only be invoked by the gateway, which receives its
 *     registry by injection;
 *  4. automatic provider fallback identifiers (silent model or provider
 *     substitution is forbidden; routing must fail closed instead).
 *
 * It also pins the retirement of the pre-AI-72 direct execution paths:
 * the retired entry points must not reappear, and the retired package
 * scripts must not be reintroduced.
 *
 * The allowlists below are intentionally explicit. Extending them is an
 * auditable act that requires justification in review.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");

/** Directories whose TypeScript files count as runtime source. */
const RUNTIME_DIRS = ["src", "scripts"] as const;

/**
 * The only directory where provider knowledge (SDK imports, endpoint
 * literals, transport code) may live. Everything under it is the
 * AI-72 adapter layer behind the MultiProviderGateway.
 */
const ADAPTER_DIR = `src${sep}providers${sep}`;

/**
 * Known provider SDK module specifiers (exact name or prefix match on
 * the package root). Importing any of these outside the adapter layer
 * is a boundary violation.
 */
const FORBIDDEN_SDK_SPECIFIERS: readonly string[] = [
  "openai",
  "@anthropic-ai/sdk",
  "@anthropic-ai/bedrock-sdk",
  "@anthropic-ai/vertex-sdk",
  "@langchain/langgraph",
  "@langchain/core",
  "@langchain/openai",
  "@langchain/anthropic",
  "@google/generative-ai",
  "@google-cloud/vertexai",
  "@mistralai/mistralai",
  "cohere-ai",
  "groq-sdk",
  "together-ai",
  "dashscope",
];

/**
 * Provider/model execution endpoint hosts and path fragments. A
 * literal match outside the adapter layer is a boundary violation,
 * whether it appears in a `fetch` call, an SDK `baseURL`, or a
 * constant.
 */
const FORBIDDEN_ENDPOINT_PATTERNS: readonly RegExp[] = [
  /api\.deepseek\.com/,
  /dashscope(?:-intl)?\.aliyuncs\.com/,
  /api\.openai\.com/,
  /api\.anthropic\.com/,
  /openrouter\.ai/,
  /api\.minimax/,
  /api\.mistral\.ai/,
  /generativelanguage\.googleapis\.com/,
  /api\.groq\.com/,
  /api\.together\.xyz/,
  /api\.cohere\.(?:com|ai)/,
  /gateway\.ai\.cloudflare\.com/,
  // Cloudflare Workers AI REST invocation (accounts/<id>/ai/run/<model>)
  /api\.cloudflare\.com\/client\/v4\/accounts/,
  /\/ai\/run\/@cf\//,
];

/**
 * Identifiers that implement automatic provider/model fallback. The
 * governed boundary forbids silent substitution: a missing or failing
 * profile must fail closed, never fall through to another model.
 */
const FORBIDDEN_FALLBACK_IDENTIFIERS: readonly RegExp[] = [
  /\bfallbackModels\b/,
  /\bfallback_models\b/,
  /\bgenerateWithFallback\b/,
];

/**
 * Pre-AI-72 direct execution entry points retired by
 * refactor/ai-lab-governed-execution-boundary. None of these may
 * reappear.
 */
const RETIRED_PATHS: readonly string[] = [
  "src/worker/index.ts",
  "src/ai/ai-gateway.ts",
  "src/agents/router-agent.ts",
  "src/agents/arca-agent.ts",
  "src/agents/vuce-agent.ts",
  "src/agents/infoleg-agent.ts",
  "src/agents/critic-agent.ts",
  "src/agents/normative-evidence-agent.ts",
  "src/utils/embedding-service.ts",
  "src/workers/embedding-consumer.ts",
  "scripts/run-extraction.ts",
  "scripts/sync-kv.ts",
  "scripts/generate-arca-embeddings.ts",
  "scripts/generate-infoleg-embeddings.ts",
  "scripts/generate-vuce-embeddings.ts",
  "wrangler.toml",
];

/** Package scripts retired with the entry points above. */
const RETIRED_PACKAGE_SCRIPTS: readonly string[] = [
  "ai:extract",
  "sync:kv",
  "dev:worker",
  "deploy:worker",
  "embed:arca",
  "embed:infoleg",
  "embed:vuce",
  "embed:all",
];

function listRuntimeSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (entry === "node_modules" || entry === "dist") continue;
        walk(full);
      } else if (entry.endsWith(".ts")) {
        out.push(relative(repoRoot, full));
      }
    }
  };
  for (const dir of RUNTIME_DIRS) {
    const full = resolve(repoRoot, dir);
    if (existsSync(full)) walk(full);
  }
  return out.sort();
}

function isAdapterLayer(relPath: string): boolean {
  return (
    relPath.startsWith(ADAPTER_DIR) || relPath.startsWith("src/providers/")
  );
}

interface ImportRef {
  readonly specifier: string;
  readonly typeOnly: boolean;
  readonly statement: string;
}

/**
 * Extracts import/export-from/require specifiers. `import type` and
 * `export type ... from` statements are marked type-only; a type-only
 * import produces no runtime dependency and therefore cannot invoke an
 * adapter.
 */
function extractImports(source: string): ImportRef[] {
  const refs: ImportRef[] = [];
  const patterns: Array<{ re: RegExp; typeOnly: (m: string) => boolean }> = [
    {
      re: /(?:import|export)\s+[^;'"]*?from\s+['"]([^'"]+)['"]/g,
      typeOnly: (m) => /^(?:import|export)\s+type\s/.test(m),
    },
    { re: /import\s+['"]([^'"]+)['"]/g, typeOnly: () => false },
    { re: /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g, typeOnly: () => false },
    { re: /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g, typeOnly: () => false },
  ];
  for (const { re, typeOnly } of patterns) {
    for (const match of source.matchAll(re)) {
      const statement = match[0];
      const specifier = match[1];
      if (specifier === undefined) continue;
      refs.push({ specifier, typeOnly: typeOnly(statement), statement });
    }
  }
  return refs;
}

function isForbiddenSdkSpecifier(specifier: string): string | null {
  for (const sdk of FORBIDDEN_SDK_SPECIFIERS) {
    if (specifier === sdk || specifier.startsWith(`${sdk}/`)) return sdk;
  }
  return null;
}

function referencesAdapterLayer(specifier: string): boolean {
  // Relative or absolute references into src/providers/.
  return (
    /(?:^|\/)providers\/(?:index|adapter-registry|provider-adapter|openai-compatible-adapter|replay-adapter|provider-evidence|openrouter-adapter|openrouter-config)(?:\.js|\.ts)?$/.test(
      specifier,
    ) || /(?:^|\/)providers\/?$/.test(specifier)
  );
}

const sources = listRuntimeSources();
const fileContents = new Map<string, string>(
  sources.map((relPath) => [
    relPath,
    readFileSync(resolve(repoRoot, relPath), "utf-8"),
  ]),
);

describe("governed AI execution boundary", () => {
  it("scans a non-empty runtime source set", () => {
    assert.ok(
      sources.length > 0,
      "no runtime sources found — scan roots are wrong",
    );
    assert.ok(
      sources.some((s) => s.startsWith("src/execution/")),
      "gateway sources missing from scan set",
    );
  });

  it("forbids direct provider SDK imports outside the adapter layer", () => {
    const violations: string[] = [];
    for (const [relPath, source] of fileContents) {
      if (isAdapterLayer(relPath)) continue;
      for (const ref of extractImports(source)) {
        const sdk = isForbiddenSdkSpecifier(ref.specifier);
        if (sdk !== null) {
          violations.push(
            `${relPath}: imports provider SDK "${ref.specifier}" (${sdk})`,
          );
        }
      }
    }
    assert.deepEqual(
      violations,
      [],
      `provider SDK imports outside src/providers/:\n${violations.join("\n")}`,
    );
  });

  it("forbids provider/model endpoint literals outside the adapter layer", () => {
    const violations: string[] = [];
    for (const [relPath, source] of fileContents) {
      if (isAdapterLayer(relPath)) continue;
      for (const pattern of FORBIDDEN_ENDPOINT_PATTERNS) {
        if (pattern.test(source)) {
          violations.push(
            `${relPath}: contains provider endpoint literal ${String(pattern)}`,
          );
        }
      }
    }
    assert.deepEqual(
      violations,
      [],
      `provider endpoint literals outside src/providers/:\n${violations.join("\n")}`,
    );
  });

  it("forbids value imports of the adapter layer outside the gateway boundary", () => {
    // Only the adapter layer itself may hold a runtime reference to an
    // adapter. Every other module (including the gateway) is limited to
    // type-only imports; the gateway receives its ProviderAdapterRegistry
    // by injection, and domain code never touches adapters at all.
    const violations: string[] = [];
    for (const [relPath, source] of fileContents) {
      if (isAdapterLayer(relPath)) continue;
      for (const ref of extractImports(source)) {
        if (referencesAdapterLayer(ref.specifier) && !ref.typeOnly) {
          violations.push(
            `${relPath}: value import of adapter layer "${ref.specifier}" — use type-only imports and injection`,
          );
        }
      }
    }
    assert.deepEqual(
      violations,
      [],
      `adapter-layer value imports outside src/providers/:\n${violations.join("\n")}`,
    );
  });

  it("forbids automatic provider fallback identifiers in runtime source", () => {
    const violations: string[] = [];
    for (const [relPath, source] of fileContents) {
      for (const pattern of FORBIDDEN_FALLBACK_IDENTIFIERS) {
        if (pattern.test(source)) {
          violations.push(
            `${relPath}: contains fallback identifier ${String(pattern)}`,
          );
        }
      }
    }
    assert.deepEqual(
      violations,
      [],
      `automatic-fallback identifiers found:\n${violations.join("\n")}`,
    );
  });

  it("keeps the retired direct execution entry points retired", () => {
    const resurrected = RETIRED_PATHS.filter((p) =>
      existsSync(resolve(repoRoot, p)),
    );
    assert.deepEqual(
      resurrected,
      [],
      `retired direct-execution paths reappeared:\n${resurrected.join("\n")}`,
    );
  });

  it("keeps the retired package scripts retired", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(repoRoot, "package.json"), "utf-8"),
    ) as {
      scripts?: Record<string, string>;
    };
    const scripts = Object.keys(pkg.scripts ?? {});
    const resurrected = RETIRED_PACKAGE_SCRIPTS.filter((s) =>
      scripts.includes(s),
    );
    assert.deepEqual(
      resurrected,
      [],
      `retired package scripts reappeared:\n${resurrected.join("\n")}`,
    );
  });
});

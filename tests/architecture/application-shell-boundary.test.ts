import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, normalize, resolve } from "node:path";
import { describe, it } from "node:test";

const read = (path: string): string => readFileSync(path, "utf8");
const UI_FILES = [
  "src/application/application-access.ts",
  "src/application/application-shell.ts",
  "src/application/repository-current-status.ts",
  "src/operator/operator-console.ts",
] as const;

const LOCAL_DEPENDENCY_PATTERNS = [
  {
    pattern:
      /(?:^|\n)\s*import\s+(type\s+)?(?:[^"'`;]+?\s+from\s+)?["']([^"']+)["']/g,
    specifier_group: 2,
    type_group: 1,
  },
  {
    pattern:
      /(?:^|\n)\s*export\s+(type\s+)?(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g,
    specifier_group: 2,
    type_group: 1,
  },
  {
    pattern: /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    specifier_group: 1,
  },
  {
    pattern: /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    specifier_group: 1,
  },
] as const;

function localDependencyGraph(
  entrypoints: readonly string[],
): readonly string[] {
  const visited = new Set<string>();
  const visit = (file: string): void => {
    const normalized = normalize(file);
    if (visited.has(normalized)) return;
    visited.add(normalized);
    const source = read(normalized);
    for (const dependencyPattern of LOCAL_DEPENDENCY_PATTERNS) {
      for (const match of source.matchAll(dependencyPattern.pattern)) {
        if (
          "type_group" in dependencyPattern &&
          match[dependencyPattern.type_group] !== undefined
        )
          continue;
        const specifier = match[dependencyPattern.specifier_group]!;
        if (!specifier.startsWith(".")) continue;
        const unresolved = resolve(dirname(normalized), specifier);
        const candidates = specifier.endsWith(".js")
          ? [unresolved.slice(0, -3) + ".ts", unresolved]
          : [unresolved, `${unresolved}.ts`, resolve(unresolved, "index.ts")];
        const dependency = candidates.find((candidate) =>
          existsSync(candidate),
        );
        assert.ok(
          dependency,
          `unresolved local dependency ${specifier} from ${file}`,
        );
        visit(dependency);
      }
    }
  };
  entrypoints.forEach(visit);
  return [...visited].sort();
}

describe("AI-134 application architecture boundary", () => {
  it("cannot import authority-consuming scheduler or operational execution paths", () => {
    const imports = UI_FILES.map(read)
      .join("\n")
      .split("\n")
      .filter((line) => line.startsWith("import "))
      .join("\n");
    assert.doesNotMatch(
      imports,
      /scheduler\/|controlled-live-arca-run|governed-arca-export|governed-source-acquisition|authorization-store|multi-provider-gateway|openrouter-adapter|approved-arca-artifact-builder/,
    );
  });

  it("has no external network, database, deployment mutation, credential, or filesystem-write client", () => {
    const source = UI_FILES.map(read).join("\n");
    assert.doesNotMatch(
      source,
      /\bfetch\s*\(|XMLHttpRequest|WebSocket|createConnection|createClient|supabase|postgres|prisma|dns\.|vercel\.com\/api|process\.env|writeFile|appendFile|mkdir|rmSync/,
    );
    assert.doesNotMatch(
      source,
      /from\s+["'][^"']*(?:node:fs|node:net|node:dns|database-client|deployment-client|vercel-client|vlatam-global)[^"']*["']/i,
    );
  });

  it("keeps static assets free of runtime imports and external URLs", () => {
    const source = read("src/application/application-shell.ts");
    assert.doesNotMatch(source, /https?:\/\//);
    assert.doesNotMatch(source, /@import|url\(["']?https?:/);
  });

  it("keeps Vercel preparation fail-closed and independent", () => {
    const entry = read("api/index.ts");
    const config = read("vercel.json");
    assert.match(entry, /validateApplicationEnvironment/);
    assert.match(entry, /environment validation failed closed/);
    assert.doesNotMatch(entry, /scheduler|governed-arca-export|vlatam-global/);
    assert.match(config, /"api\/index\.ts"/);
    assert.doesNotMatch(config, /domains|alias|dns|deployHook/);
  });

  it("checks the actual production entrypoint graph for forbidden runtime dependencies", () => {
    const files = localDependencyGraph(["api/index.ts"]);
    const paths = files.filter((file) => file.endsWith(".ts")).join("\n");
    assert.ok(files.some((file) => file.endsWith(normalize("api/index.ts"))));
    assert.ok(
      files.some((file) =>
        file.endsWith(
          normalize("src/providers/openrouter-supervised-pilot-projection.ts"),
        ),
      ),
      "production entrypoint must consume the read-only provider projection",
    );
    assert.doesNotMatch(
      paths,
      /(?:ai-131|ai-132|ai-133|scheduler|controlled-live-arca-run|governed-arca-export|governed-source-acquisition|approved-arca-artifact-builder|arca-transport|openrouter-glm-supervised-pilot|openrouter-adapter|provider-adapter|fetch-transport|secret-provider|credential-loader|database-client|supabase|postgres|prisma|multi-provider-gateway|vlatam-global-runtime|deployment-client|dns-client)/i,
    );
    for (const file of files) {
      const source = read(file);
      assert.doesNotMatch(
        source,
        /\b(?:fetch|createOpenRouterFetchTransport|createOpenRouterEnvironmentSecretProvider|createClient|deploy|mutateDns|runScheduler|executeArcaTransport)\s*\(/,
        `forbidden authority or external-client invocation in ${file}`,
      );
    }
  });
});

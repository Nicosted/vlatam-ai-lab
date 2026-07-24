import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string): string => readFileSync(path, "utf8");
const UI_FILES = [
  "src/application/application-access.ts",
  "src/application/application-shell.ts",
  "src/application/repository-current-status.ts",
  "src/operator/operator-console.ts",
] as const;

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
});

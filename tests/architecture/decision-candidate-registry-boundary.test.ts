import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { describe, it } from "node:test";

import * as candidateRegistry from "../../src/decision-candidates/index.js";

const REGISTRY_DIR = "src/decision-candidates";

/**
 * The only modules the AI-142 candidate registry may reach: its own
 * files, the AI-140 canonicalizer/validation vocabulary it reuses and the
 * pure AI-71 contract modules those already depend on. It never reaches
 * the AI-141 evaluator, the tournament, providers, adapters, execution,
 * routing, stores, schedulers or the server.
 */
const ALLOWED_CLOSURE = new Set([
  "src/decision-candidates/index.ts",
  "src/decision-candidates/contracts.ts",
  "src/decision-candidates/canonical.ts",
  "src/decision-candidates/validation.ts",
  "src/decision/contracts.ts",
  "src/decision/canonical.ts",
  "src/decision/validation.ts",
  "src/capabilities/contracts.ts",
  "src/capabilities/validation.ts",
  "src/capabilities/error.ts",
  "src/capabilities/policy.ts",
  "src/capabilities/version.ts",
]);
const ALLOWED_BUILTINS = new Set(["node:crypto"]);

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const pattern =
    /(?:import|export)\s+(?:type\s+)?(?:[^"'`;]*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of source.matchAll(pattern))
    specifiers.push((match[1] ?? match[2] ?? match[3])!);
  return specifiers;
}

function resolveLocal(from: string, specifier: string): string {
  const target = normalize(join(dirname(from), specifier)).replace(
    /\.js$/,
    ".ts",
  );
  return relative(process.cwd(), target).split("\\").join("/");
}

function importClosure(entry: string): {
  files: Set<string>;
  external: Set<string>;
} {
  const files = new Set<string>();
  const external = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
      if (specifier.startsWith(".")) queue.push(resolveLocal(file, specifier));
      else external.add(specifier);
    }
  }
  return { files, external };
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? walk(path)
      : [path.split("\\").join("/")];
  });
}

const registryFiles = readdirSync(REGISTRY_DIR).map(
  (name) => `${REGISTRY_DIR}/${name}`,
);

function walkRepository(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (dir === "." && ["node_modules", ".git", "dist"].includes(name))
      return [];
    const path = dir === "." ? name : `${dir}/${name}`;
    return statSync(path).isDirectory() ? walkRepository(path) : [path];
  });
}

const REPOSITORY_FILES = walkRepository(".");

describe("AI-142 typed decision candidate registry architecture boundary", () => {
  it("reaches only its own modules, the AI-140 canonical form and the pure AI-71 contracts", () => {
    const { files, external } = importClosure(`${REGISTRY_DIR}/index.ts`);
    for (const file of files)
      assert.ok(
        ALLOWED_CLOSURE.has(file),
        `unexpected module in closure: ${file}`,
      );
    for (const specifier of external)
      assert.ok(
        ALLOWED_BUILTINS.has(specifier),
        `unexpected external import: ${specifier}`,
      );
    for (const file of registryFiles)
      assert.ok(files.has(file), `${file} must be reachable from index.ts`);
  });

  it("has no network, process, environment, filesystem, clock, loader or provider access", () => {
    for (const file of registryFiles) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(
        source,
        /\bfetch\s*\(|XMLHttpRequest|WebSocket|process\.|child_process|worker_threads|\bspawn\s*\(|\bexecSync\b|\bexecFile\b|\beval\s*\(|new Function\s*\(|\bimport\s*\(|\brequire\s*\(|node:(?:http|https|net|tls|dgram|dns|fs|child_process|worker_threads|vm|module)|from ["'](?:http|https|net|fs|pg|undici|axios|openai|@anthropic-ai\/[a-z-]+|@huggingface\/[a-z-]+|onnxruntime[a-z-]*|node-llama-cpp)["']|secret-provider|secret-resolver|authorization-store|multi-provider-gateway|provider-adapter|supabase|setInterval|setTimeout|new Date\(|Date\.now|Math\.random/i,
        file,
      );
    }
  });

  it("imports no provider SDK, model loader or inference runtime", () => {
    const { external } = importClosure(`${REGISTRY_DIR}/index.ts`);
    for (const specifier of external)
      assert.doesNotMatch(
        specifier,
        /openai|anthropic|huggingface|transformers|onnx|llama|torch|tensorflow|vllm|ollama|safetensors|gguf/i,
      );
  });

  it("names no candidate, model, runtime or provider project in code or schemas", () => {
    const forbidden =
      /\b(?:laya|kev|von|semif|rizzo|nanojev|nimble|qwen|openai|anthropic|claude|gemini|deepseek|openrouter|minimax|glm|mistral|llama|gpt)\b/i;
    for (const file of [
      ...registryFiles,
      "schemas/ai-typed-decision-candidate-entry.schema.json",
      "schemas/ai-typed-decision-candidate-registry.schema.json",
    ])
      assert.doesNotMatch(readFileSync(file, "utf8"), forbidden, file);
  });

  it("exposes inventory only: no execution, adapter, loader, benchmark, promotion or routing surface", () => {
    const exported = Object.keys(candidateRegistry);
    for (const name of exported)
      assert.doesNotMatch(
        name,
        /run|execute|invoke|dispatch|load|spawn|install|download|adapter|sandbox|promote|route|schedule|train|benchmark|leaderboard|winner|rank|activate|approve/i,
        name,
      );
    for (const required of [
      "validateDecisionCandidateEntry",
      "validateDecisionCandidateRegistryManifest",
      "validateDecisionCandidateRegistry",
      "validateDecisionCandidateSuccession",
      "validateDecisionCandidateRegistrySuccession",
      "computeDecisionCandidateHash",
      "computeDecisionCandidateRegistryHash",
      "deriveDecisionCandidateEvidenceGaps",
    ])
      assert.ok(exported.includes(required), required);
    for (const value of Object.values(candidateRegistry))
      if (typeof value === "function")
        assert.doesNotMatch(
          value.name,
          /run|execute|invoke|load|spawn|install|download/i,
        );
  });

  it("is not wired into any production module, API, server, tournament or evaluation path", () => {
    const consumers = walk("src")
      .filter(
        (file) => file.endsWith(".ts") && !file.startsWith(`${REGISTRY_DIR}/`),
      )
      .filter((file) =>
        importSpecifiers(readFileSync(file, "utf8")).some(
          (specifier) =>
            specifier.startsWith(".") &&
            resolveLocal(file, specifier).startsWith(`${REGISTRY_DIR}/`),
        ),
      );
    assert.deepEqual(
      consumers,
      [],
      "no production module may consume the AI-142 candidate registry",
    );
    for (const file of ["api"].filter(existsSync).flatMap(walk))
      assert.doesNotMatch(
        readFileSync(file, "utf8"),
        /decision-candidates/,
        file,
      );
    for (const file of walk("src/tournament"))
      assert.doesNotMatch(
        readFileSync(file, "utf8"),
        /decision-candidates|typed[-_]decision[-_]candidate/i,
        file,
      );
    for (const file of walk("src/decision-evaluation"))
      assert.doesNotMatch(
        readFileSync(file, "utf8"),
        /decision-candidates/,
        file,
      );
  });

  it("vendors no candidate source and ships no weights, runtime config or candidate results", () => {
    for (const file of REPOSITORY_FILES)
      assert.doesNotMatch(
        file,
        /\.(?:gguf|safetensors|onnx|pt|pth|bin|ckpt|h5|tflite|mlmodel)$/i,
        file,
      );
    for (const file of walk("src"))
      assert.doesNotMatch(
        file,
        /(?:^|\/)(?:laya|kev|von|semif|rizzo[-_]?flow|nanojev|nimble)(?:\/|\.|$)/i,
        file,
      );
    for (const path of [
      "config/ai-typed-decision-runtime.json",
      "config/ai-typed-decision-candidates.json",
      "config/ai-decision-candidate-registry.json",
      "src/decision-candidates/runtime.ts",
      "src/decision-candidates/adapter.ts",
      "src/decision-candidates/runner.ts",
      "src/decision-candidates/sandbox.ts",
      "src/decision-candidates/loader.ts",
    ])
      assert.equal(existsSync(path), false, path);
    // No candidate evaluation results, leaderboards or rankings exist.
    for (const file of REPOSITORY_FILES.filter((f) =>
      /decision-candidate/i.test(f),
    ))
      assert.doesNotMatch(
        file,
        /result|leaderboard|ranking|score|benchmark|tournament/i,
        file,
      );
  });
});

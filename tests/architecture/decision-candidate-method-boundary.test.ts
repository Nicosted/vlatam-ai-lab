/**
 * AI-144 candidate method evidence layer architecture boundary.
 *
 * AI-144 executes candidate-specific methodology, not candidate-supplied
 * code or model weights. These tests pin that:
 *
 *  1. `src/decision-candidate-methods/` is pure: it reaches only the
 *     AI-140 canonical form/contracts/validators, the AI-142 contract
 *     vocabulary and entry validator, and the pure AI-71 contracts. It
 *     never reaches the AI-143 sandbox runtime, the AI-141 evaluator, the
 *     AI-120 tournament, providers, stores, schedulers or the server.
 *  2. Nothing consumes it: no production module, API route or script.
 *  3. No SemIf package, upstream source, Python runtime, model weight,
 *     model/inference library or provider SDK entered the repository.
 *  4. AI-141 is not wired and AI-120 lifecycle is unchanged: the SemIf
 *     AI-142 entry is still `discovered` / `evidence_only` and
 *     `ai_lab_executed` is still `false`.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { describe, it } from "node:test";

import * as methods from "../../src/decision-candidate-methods/index.js";

const METHOD_DIR = "src/decision-candidate-methods";
const METHOD_ARTIFACT =
  "src/decision-sandbox/fixture/direct-logit-method-adapter.mjs";

const ALLOWED_CLOSURE = new Set([
  "src/decision-candidate-methods/index.ts",
  "src/decision-candidate-methods/contracts.ts",
  "src/decision-candidate-methods/canonical.ts",
  "src/decision-candidate-methods/validation.ts",
  "src/decision-candidate-methods/readiness.ts",
  "src/decision/contracts.ts",
  "src/decision/canonical.ts",
  "src/decision/validation.ts",
  "src/decision-candidates/contracts.ts",
  "src/decision-candidates/canonical.ts",
  "src/decision-candidates/validation.ts",
  "src/capabilities/contracts.ts",
  "src/capabilities/validation.ts",
  "src/capabilities/error.ts",
  "src/capabilities/policy.ts",
  "src/capabilities/version.ts",
]);

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
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    if (["node_modules", ".git", "dist"].includes(name)) return [];
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? walk(path)
      : [path.split("\\").join("/")];
  });
}

const read = (file: string): string => readFileSync(file, "utf8");
const methodFiles = walk(METHOD_DIR);

describe("AI-144 candidate method architecture boundary", () => {
  it("reaches only pure AI-140/AI-142/AI-71 modules and node:crypto", () => {
    const { files, external } = importClosure(`${METHOD_DIR}/index.ts`);
    for (const file of files)
      assert.ok(ALLOWED_CLOSURE.has(file), `unexpected module: ${file}`);
    for (const file of methodFiles)
      assert.ok(files.has(file), `${file} must be reachable from index.ts`);
    assert.deepEqual([...external], ["node:crypto"]);
  });

  it("has no process, filesystem, network, clock, environment or code-generation access", () => {
    for (const file of methodFiles)
      assert.doesNotMatch(
        read(file),
        /\bfetch\s*\(|XMLHttpRequest|WebSocket|process\.|child_process|worker_threads|\bspawn\s*\(|\bexecSync\b|\bexecFile\b|\beval\s*\(|new Function\s*\(|\bimport\s*\(|\brequire\s*\(|node:(?:http|https|net|tls|dgram|dns|fs|child_process|worker_threads|vm|module|os)|setInterval|setTimeout|new Date\(|Date\.now|Math\.random/,
        file,
      );
  });

  it("never reaches the sandbox runtime, AI-141 evaluator, AI-120 tournament or providers", () => {
    for (const file of methodFiles) {
      const source = read(file);
      assert.doesNotMatch(
        source,
        /decision-sandbox|executeDecisionSandbox|decision-evaluation|evaluateGoldDecisionCase|aggregateGoldDecisionEvaluations|gold-decision|tournament|openrouter|multi-provider-gateway|provider-adapter|secret-provider|supabase/i,
        file,
      );
    }
  });

  it("exports no execution, loader, benchmark, promotion or routing surface", () => {
    for (const [name, value] of Object.entries(methods)) {
      assert.doesNotMatch(
        name,
        /^(?:run|execute|invoke|dispatch|load|spawn|install|download|promote|route|schedule|train|benchmark|leaderboard|rank|activate|approve)/i,
        name,
      );
      if (typeof value === "function")
        assert.doesNotMatch(
          value.name,
          /spawn|execute\b|executeDecision|invoke|install|download|promote|benchmark|rank|approve|calibrate|fit/i,
          value.name,
        );
    }
  });

  it("is not consumed by any production module, API route or script", () => {
    const consumers = walk("src")
      .filter(
        (f) =>
          /\.(?:ts|mts|mjs|js)$/.test(f) && !f.startsWith(`${METHOD_DIR}/`),
      )
      .filter((file) =>
        importSpecifiers(read(file)).some(
          (specifier) =>
            specifier.startsWith(".") &&
            resolveLocal(file, specifier).startsWith(`${METHOD_DIR}/`),
        ),
      );
    assert.deepEqual(consumers, []);
    for (const file of [...walk("api"), ...walk("scripts")])
      assert.doesNotMatch(read(file), /decision-candidate-methods/, file);
    const pkg = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    for (const [name, command] of Object.entries(pkg.scripts))
      assert.doesNotMatch(
        `${name} ${command}`,
        /semif|candidate-method|direct-logit/i,
      );
    assert.doesNotMatch(
      read("vercel.json"),
      /semif|decision-candidate-methods/i,
    );
  });

  it("vendors no SemIf source, Python runtime, model weights or inference/provider dependency", () => {
    const repoFiles = walk(".");
    for (const file of repoFiles) {
      assert.doesNotMatch(
        file,
        /\.(?:py|pyc|ipynb|gguf|safetensors|onnx|pt|pth|bin|ckpt|h5|tflite|mlmodel|wasm)$/i,
        file,
      );
      assert.doesNotMatch(
        file,
        /(?:^|\/)(?:requirements[^/]*\.txt|pyproject\.toml|Pipfile|poetry\.lock|uv\.lock|setup\.py)$/,
        file,
      );
      assert.doesNotMatch(
        file,
        /(?:^|\/)(?:semif_phase1|semif-openjev|semif)(?:\/|$)/i,
        file,
      );
    }
    const pkg = JSON.parse(read("package.json")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const dep of deps)
      assert.doesNotMatch(
        dep,
        /torch|transformers|huggingface|safetensors|gguf|llama|mlx|onnx|tensorflow|vllm|ollama|anthropic|semif|tokenizers|webgpu|cuda/i,
        dep,
      );
    assert.doesNotMatch(
      read("pnpm-lock.yaml"),
      /\n {2}'?(?:@huggingface\/[a-z-]+|@xenova\/transformers|onnxruntime[a-z-]*|node-llama-cpp|@mlc-ai\/[a-z-]+|llama[a-z-]*)@/,
    );
  });

  it("the method artifact names no candidate, model, device or inference library", () => {
    const source = read(METHOD_ARTIFACT);
    assert.doesNotMatch(
      source,
      /\b(?:semif|openjev|qwen|minicpm|reranker)\b|torch|transformers|safetensors|huggingface|\bmlx\b|llama|gguf|onnx|cuda|\bmps\b|webgpu|python/i,
    );
    assert.doesNotMatch(source, /candidate_model/);
  });

  it("does not wire AI-141 evaluation or change the AI-120 lifecycle", () => {
    for (const file of [
      ...methodFiles,
      METHOD_ARTIFACT,
      ...walk("tests/decision-candidate-methods"),
      "tests/decision-sandbox/direct-logit-method-fixture.test.ts",
    ])
      assert.doesNotMatch(
        read(file),
        /decision-evaluation\/|evaluateGoldDecisionCase|aggregateGoldDecisionEvaluations|data\/gold-decision/,
        file,
      );
    for (const file of [
      ...walk("src/tournament"),
      ...walk("src/decision-evaluation"),
    ])
      assert.doesNotMatch(
        read(file),
        /decision-candidate-methods|semif|direct-logit/i,
        file,
      );
    const entry = JSON.parse(
      read("data/decision-candidates/v1/candidates/tdc-theoleecj-semif.json"),
    ) as { lifecycle: Record<string, unknown> };
    assert.deepEqual(entry.lifecycle, {
      registry_state: "discovered",
      ai_lab_executed: false,
      execution_enabled: false,
      benchmark_execution_enabled: false,
      promotion_eligible: false,
      production_eligible: false,
      routing_enabled: false,
      authority: "evidence_only",
    });
  });

  it("documents the non-execution boundary prominently", () => {
    const doc = read(
      "docs/architecture/ai-semif-direct-logit-method-adapter.md",
    );
    for (const statement of [
      "AI-144 evaluates an AI-LAB-owned implementation of a pinned SemIf\n> methodology using synthetic logits. It does not execute SemIf upstream\n> code or any SemIf/Qwen model artifact.",
      "AI-144 executes candidate-specific methodology, not candidate-supplied\n> code or model weights.",
      "A method-conformance success is not evidence of model quality.",
      "Upstream calibration claims remain upstream claims. AI-144 does not\n> reproduce or verify them.",
    ])
      assert.ok(doc.includes(statement), statement);
    assert.ok(
      existsSync("docs/decisions/009-semif-direct-logit-method-adapter.md"),
    );
  });
});

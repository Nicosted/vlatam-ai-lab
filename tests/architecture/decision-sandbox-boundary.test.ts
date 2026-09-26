/**
 * AI-143 decision sandbox architecture boundary.
 *
 * Technical ability to spawn a process is not execution authority. These
 * tests pin where that ability lives and who can reach it:
 *
 *  1. The pure surface (`index.ts`) reaches no process, filesystem,
 *     network, clock or provider module.
 *  2. `node:child_process` is imported by exactly one module in `src/`:
 *     `src/decision-sandbox/executor.ts`, which spawns only
 *     `process.execPath` with `shell: false` and an empty environment and
 *     exposes no generic subprocess utility.
 *  3. Only tests reach the executor: no production module, API route,
 *     script, package script, scheduler, provider gateway, operator
 *     surface, tournament or evaluator imports the sandbox.
 *  4. The repository-owned fixture adapter has no network, filesystem,
 *     process, worker or code-generation access.
 *  5. No candidate source, weights or runtime configuration is vendored.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { describe, it } from "node:test";

import * as executorModule from "../../src/decision-sandbox/executor.js";
import * as sandbox from "../../src/decision-sandbox/index.js";

const SANDBOX_DIR = "src/decision-sandbox";
const EXECUTOR = `${SANDBOX_DIR}/executor.ts`;
const FIXTURE_ADAPTER = `${SANDBOX_DIR}/fixture/synthetic-decision-adapter.mjs`;

/** Modules the pure sandbox surface may reach. */
const PURE_CLOSURE = new Set([
  "src/decision-sandbox/index.ts",
  "src/decision-sandbox/contracts.ts",
  "src/decision-sandbox/canonical.ts",
  "src/decision-sandbox/validation.ts",
  "src/decision-sandbox/protocol.ts",
  "src/decision-sandbox/preflight.ts",
  "src/decision-sandbox/record.ts",
  "src/decision/contracts.ts",
  "src/decision/canonical.ts",
  "src/decision/validation.ts",
  "src/decision-candidates/contracts.ts",
  "src/capabilities/contracts.ts",
  "src/capabilities/validation.ts",
  "src/capabilities/error.ts",
  "src/capabilities/policy.ts",
  "src/capabilities/version.ts",
]);
const PURE_BUILTINS = new Set(["node:crypto"]);
const EXECUTOR_BUILTINS = new Set([
  "node:child_process",
  "node:crypto",
  "node:fs",
  "node:os",
  "node:path",
  "node:perf_hooks",
  "node:url",
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

const sandboxFiles = walk(SANDBOX_DIR);
const sandboxTs = sandboxFiles.filter((file) => file.endsWith(".ts"));
const read = (file: string): string => readFileSync(file, "utf8");

const NETWORK_OR_PROVIDER =
  /\bfetch\s*\(|XMLHttpRequest|WebSocket|node:(?:http|https|http2|net|tls|dgram|dns)\b|from ["'](?:http|https|net|tls|dns|undici|axios|ws|openai|@anthropic-ai\/[a-z-]+|@huggingface\/[a-z-]+|@google\/[a-z-]+|@mistralai\/[a-z-]+|onnxruntime[a-z-]*|node-llama-cpp|ollama)["']|openrouter|multi-provider-gateway|provider-adapter|secret-provider|secret-resolver|authorization-store|supabase/i;

describe("AI-143 decision sandbox architecture boundary", () => {
  it("the pure surface reaches only pure modules and never the executor", () => {
    const { files, external } = importClosure(`${SANDBOX_DIR}/index.ts`);
    for (const file of files)
      assert.ok(
        PURE_CLOSURE.has(file),
        `unexpected module in closure: ${file}`,
      );
    assert.equal(files.has(EXECUTOR), false);
    for (const specifier of external)
      assert.ok(
        PURE_BUILTINS.has(specifier),
        `unexpected import: ${specifier}`,
      );
    for (const value of Object.values(sandbox))
      if (typeof value === "function")
        assert.doesNotMatch(
          value.name,
          /spawn|execute\b|executeDecision|invoke|shell|command|subprocess|runFixture|download|install|promote|route|schedule|benchmark|rank/i,
          value.name,
        );
  });

  it("the executor reaches only the pure surface plus a fixed set of Node builtins", () => {
    const { files, external } = importClosure(EXECUTOR);
    for (const file of files)
      assert.ok(
        file === EXECUTOR || PURE_CLOSURE.has(file),
        `unexpected module in executor closure: ${file}`,
      );
    for (const specifier of external)
      assert.ok(
        EXECUTOR_BUILTINS.has(specifier),
        `unexpected executor import: ${specifier}`,
      );
  });

  it("imports node:child_process in exactly one src module: the sandbox executor", () => {
    const importers = walk("src").filter(
      (file) =>
        /\.(?:ts|mts|js|mjs|cjs)$/.test(file) &&
        importSpecifiers(read(file)).some((specifier) =>
          /^(?:node:)?child_process$/.test(specifier),
        ),
    );
    assert.deepEqual(importers, [EXECUTOR]);
  });

  it("exposes no generic subprocess utility", () => {
    assert.deepEqual(Object.keys(executorModule).sort(), [
      "executeDecisionSandboxFixture",
    ]);
    const source = read(EXECUTOR);
    assert.doesNotMatch(
      source,
      /\bexec\s*\(|\bexecSync\b|\bexecFile\b|\bexecFileSync\b|\bspawnSync\b|\bfork\s*\(|shell:\s*true|process\.env|NODE_OPTIONS\s*[:=]|detached:\s*true|stdio:\s*["']inherit["']|\binherit\b/,
    );
    const spawns = [...source.matchAll(/\bspawn\s*\(/g)];
    assert.equal(spawns.length, 1, "exactly one spawn call site");
    assert.match(
      source,
      /spawn\(process\.execPath, fixtureArguments\(artifactPath\), \{/,
    );
    assert.match(source, /shell: false,/);
    assert.match(source, /env: \{\},/);
    assert.match(source, /stdio: \["pipe", "pipe", "pipe"\],/);
    assert.match(source, /child\.kill\("SIGKILL"\)/);
    // The executed path is the workspace copy of an allowlisted constant.
    assert.match(
      source,
      /readFileSync\(join\(REPOSITORY_ROOT, adapter\.artifact_path\)\)/,
    );
    assert.equal(
      Object.isFrozen(sandbox.DECISION_SANDBOX_FIXTURE_ADAPTERS),
      true,
    );
    assert.equal(
      Object.isFrozen(sandbox.DECISION_SANDBOX_FIXTURE_ADAPTER),
      true,
    );
    assert.equal(sandbox.DECISION_SANDBOX_FIXTURE_ADAPTERS.length, 1);
  });

  it("the sandbox runtime has no network, provider, credential or environment access", () => {
    for (const file of sandboxTs) {
      const source = read(file);
      assert.doesNotMatch(source, NETWORK_OR_PROVIDER, file);
      assert.doesNotMatch(
        source,
        /process\.env|process\.argv|worker_threads|node:vm|\beval\s*\(|new Function\s*\(|\bimport\s*\(|\brequire\s*\(|setInterval|Math\.random|new Date\(|Date\.now/,
        file,
      );
    }
  });

  it("the fixture adapter has no network, filesystem, process, worker or code-generation access", () => {
    const source = read(FIXTURE_ADAPTER);
    const imports = importSpecifiers(source).sort();
    assert.deepEqual(imports, [
      "node:buffer",
      "node:process",
      "node:timers",
      "node:util",
    ]);
    assert.doesNotMatch(source, NETWORK_OR_PROVIDER);
    assert.doesNotMatch(
      source,
      /node:fs|child_process|worker_threads|node:vm|node:os|\beval\s*\(|new Function\s*\(|\bimport\s*\(|\brequire\s*\(|readFile|writeFile|\bspawn\b|\bexec\b|process\.chdir|process\.kill|process\.binding|dlopen/,
    );
    assert.doesNotMatch(
      source,
      /"?(?:reasoning|chain_of_thought|thinking)"?\s*:/,
    );
    assert.doesNotMatch(source, /api[_-]?key|secret|password|bearer|token/i);
  });

  it("is not wired into any production module, API route, script, scheduler, provider, operator, tournament or evaluator", () => {
    const consumers = walk("src")
      .filter(
        (file) => file.endsWith(".ts") && !file.startsWith(`${SANDBOX_DIR}/`),
      )
      .filter((file) =>
        importSpecifiers(read(file)).some(
          (specifier) =>
            specifier.startsWith(".") &&
            resolveLocal(file, specifier).startsWith(`${SANDBOX_DIR}/`),
        ),
      );
    assert.deepEqual(consumers, [], "no src module may consume the sandbox");
    for (const file of [
      ...walk("api"),
      ...walk("scripts"),
      ...walk("src"),
    ].filter((f) => !f.startsWith(`${SANDBOX_DIR}/`)))
      assert.doesNotMatch(
        read(file),
        /decision-sandbox|executeDecisionSandbox/,
        file,
      );
    const pkg = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    for (const [name, command] of Object.entries(pkg.scripts))
      assert.doesNotMatch(
        `${name} ${command}`,
        /decision-sandbox|sandbox:decision/i,
      );
    for (const file of walk("tests").filter((f) => f.endsWith(".ts")))
      if (read(file).includes("decision-sandbox/executor"))
        assert.match(
          file,
          /^tests\/(?:decision-sandbox|architecture)\//,
          `${file} may not reach the executor`,
        );
    assert.equal(
      existsSync("vercel.json") && /decision-sandbox/.test(read("vercel.json")),
      false,
    );
  });

  it("does not wire AI-141 evaluation, AI-120 lifecycle or the candidate registry loader", () => {
    for (const file of sandboxTs) {
      const source = read(file);
      assert.doesNotMatch(
        source,
        /decision-evaluation|evaluateGoldDecisionCase|aggregateGoldDecisionEvaluations|validateDecisionCandidateRegistry|data\/decision-candidates/,
        file,
      );
      for (const specifier of importSpecifiers(source))
        assert.doesNotMatch(
          resolveLocal(file, specifier),
          /^src\/(?:tournament|decision-evaluation|operator|scheduler|server|providers|routing|execution)\//,
          `${file} imports ${specifier}`,
        );
      for (const specifier of importSpecifiers(source))
        if (
          resolveLocal(file, specifier).startsWith("src/decision-candidates/")
        )
          assert.equal(
            resolveLocal(file, specifier),
            "src/decision-candidates/contracts.ts",
            `${file} may only reuse the AI-142 candidate id vocabulary`,
          );
    }
  });

  it("names no candidate, model, runtime or provider project in sandbox code or schemas", () => {
    const forbidden =
      /\b(?:laya|kev|von|semif|rizzo|nanojev|nimble|qwen|openai|anthropic|claude|gemini|deepseek|openrouter|minimax|glm|mistral|llama|gpt)\b/i;
    for (const file of [
      ...sandboxFiles,
      ...walk("schemas").filter((f) =>
        /ai-decision-(?:adapter|sandbox)/.test(f),
      ),
    ])
      assert.doesNotMatch(read(file), forbidden, file);
  });

  it("vendors no candidate source and ships no weights or typed decision runtime configuration", () => {
    for (const file of walk("."))
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
    assert.deepEqual(sandboxFiles.sort(), [
      "src/decision-sandbox/canonical.ts",
      "src/decision-sandbox/contracts.ts",
      "src/decision-sandbox/executor.ts",
      "src/decision-sandbox/fixture/synthetic-decision-adapter.mjs",
      "src/decision-sandbox/index.ts",
      "src/decision-sandbox/preflight.ts",
      "src/decision-sandbox/protocol.ts",
      "src/decision-sandbox/record.ts",
      "src/decision-sandbox/validation.ts",
    ]);
    for (const path of [
      "config/ai-typed-decision-runtime.json",
      "config/ai-decision-sandbox.json",
      "config/ai-decision-sandbox-policy.json",
      "api/decision-sandbox.ts",
      "scripts/decision-sandbox.ts",
    ])
      assert.equal(existsSync(path), false, path);
  });
});

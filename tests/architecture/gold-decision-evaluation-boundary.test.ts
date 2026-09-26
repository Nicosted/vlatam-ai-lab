import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { describe, it } from "node:test";

import * as goldDecision from "../../src/decision-evaluation/index.js";

const EVALUATION_DIR = "src/decision-evaluation";

/**
 * The only modules the AI-141 evaluation layer may reach: its own files,
 * the AI-140 typed decision plane and the pure AI-71 contract modules
 * that plane already depends on.
 */
const ALLOWED_CLOSURE = new Set([
  "src/decision-evaluation/index.ts",
  "src/decision-evaluation/contracts.ts",
  "src/decision-evaluation/canonical.ts",
  "src/decision-evaluation/validation.ts",
  "src/decision-evaluation/evaluator.ts",
  "src/decision-evaluation/metrics.ts",
  "src/decision/index.ts",
  "src/decision/contracts.ts",
  "src/decision/canonical.ts",
  "src/decision/validation.ts",
  "src/decision/disposition.ts",
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

const evaluationFiles = readdirSync(EVALUATION_DIR).map(
  (name) => `${EVALUATION_DIR}/${name}`,
);

describe("AI-141 Gold Decision evaluation layer architecture boundary", () => {
  it("reaches only its own modules, the AI-140 decision plane and the pure AI-71 contracts", () => {
    const { files, external } = importClosure(`${EVALUATION_DIR}/index.ts`);
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
    for (const file of evaluationFiles)
      assert.ok(files.has(file), `${file} must be reachable from index.ts`);
  });

  it("contains no transport, secret, environment, filesystem, clock, process or provider access", () => {
    for (const file of evaluationFiles) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(
        source,
        /\bfetch\s*\(|XMLHttpRequest|WebSocket|process\.env|process\.argv|child_process|worker_threads|node:(?:http|https|net|tls|dgram|dns|fs|child_process|worker_threads)|from ["'](?:http|https|net|fs|pg|undici|axios)["']|secret-provider|secret-resolver|authorization-store|multi-provider-gateway|provider-adapter|supabase|onnx|huggingface|transformers|setInterval|setTimeout|new Date\(|Date\.now|Math\.random/i,
        file,
      );
    }
  });

  it("names no candidate, model, runtime or provider project", () => {
    const forbidden =
      /\b(?:laya|kev|von|semif|rizzo|nanojev|nimble|qwen|openai|anthropic|claude|gemini|deepseek|openrouter|minimax|glm|mistral|llama|gpt)\b/i;
    for (const file of evaluationFiles)
      assert.doesNotMatch(readFileSync(file, "utf8"), forbidden, file);
    for (const schema of [
      "schemas/ai-gold-decision-case.schema.json",
      "schemas/ai-gold-decision-set.schema.json",
      "schemas/ai-gold-decision-case-evaluation.schema.json",
      "schemas/ai-gold-decision-evaluation-report.schema.json",
    ])
      assert.doesNotMatch(readFileSync(schema, "utf8"), forbidden, schema);
  });

  it("exposes evaluation only: no runner, executor, registry, promotion or routing surface", () => {
    const exported = Object.keys(goldDecision);
    for (const name of exported)
      assert.doesNotMatch(
        name,
        /run|execute|invoke|dispatch|register|registry|promote|route|schedule|train|benchmark|candidateRegistry|winner/i,
        name,
      );
    for (const required of [
      "validateGoldDecisionCase",
      "validateGoldDecisionSet",
      "evaluateGoldDecisionCase",
      "aggregateGoldDecisionEvaluations",
    ])
      assert.ok(exported.includes(required), required);
  });

  it("is not wired into any production module, API or server path", () => {
    const consumers = walk("src")
      .filter(
        (file) =>
          file.endsWith(".ts") && !file.startsWith(`${EVALUATION_DIR}/`),
      )
      .filter((file) =>
        importSpecifiers(readFileSync(file, "utf8")).some(
          (specifier) =>
            specifier.startsWith(".") &&
            resolveLocal(file, specifier).startsWith(`${EVALUATION_DIR}/`),
        ),
      );
    assert.deepEqual(
      consumers,
      [],
      "no production module may consume the AI-141 evaluation layer",
    );
    for (const file of ["api"].filter(existsSync).flatMap(walk))
      assert.doesNotMatch(
        readFileSync(file, "utf8"),
        /decision-evaluation/,
        file,
      );
    const scriptConsumers = walk("scripts").filter((file) =>
      readFileSync(file, "utf8").includes("src/decision-evaluation/"),
    );
    assert.deepEqual(scriptConsumers, [
      "scripts/validate-gold-decision-set.ts",
    ]);
  });

  it("the validation script is offline and read-only", () => {
    const source = readFileSync(
      "scripts/validate-gold-decision-set.ts",
      "utf8",
    );
    assert.doesNotMatch(
      source,
      /\bfetch\s*\(|node:(?:http|https|net|tls|child_process)|process\.env|writeFile|appendFile|rm(?:Sync)?\(|unlink|mkdir/,
    );
  });

  it("ships no candidate registry, sandbox runtime or tournament binding", () => {
    for (const path of [
      "config/ai-typed-decision-runtime.json",
      "config/ai-typed-decision-candidates.json",
      "config/ai-decision-candidate-registry.json",
      "src/decision-evaluation/runner.ts",
      "src/decision-evaluation/registry.ts",
    ])
      assert.equal(existsSync(path), false, path);
    for (const file of walk("src/tournament"))
      assert.doesNotMatch(
        readFileSync(file, "utf8"),
        /decision-evaluation|gold[-_]decision/i,
        file,
      );
  });
});

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { describe, it } from "node:test";

const DECISION_DIR = "src/decision";
const EVALUATION_DIR = "src/decision-evaluation/";
const CANDIDATE_REGISTRY_DIR = "src/decision-candidates/";
const SANDBOX_DIR = "src/decision-sandbox/";

/**
 * The only modules the typed decision plane may reach, directly or
 * transitively: its own files and the pure AI-71 contract/validation
 * modules. Anything else (providers, adapters, gateway, execution,
 * routing, stores, schedulers, server, transport) is a boundary breach.
 */
const ALLOWED_CLOSURE = new Set([
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

const decisionFiles = readdirSync(DECISION_DIR).map(
  (name) => `${DECISION_DIR}/${name}`,
);

describe("AI-140 typed decision plane architecture boundary", () => {
  it("reaches only its own modules and the pure AI-71 contract layer", () => {
    const { files, external } = importClosure(`${DECISION_DIR}/index.ts`);
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
    for (const file of decisionFiles)
      assert.ok(files.has(file), `${file} must be reachable from index.ts`);
  });

  it("contains no transport, secret, environment, process, database, scheduler or provider access", () => {
    for (const file of [...importClosure(`${DECISION_DIR}/index.ts`).files]) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(
        source,
        /\bfetch\s*\(|XMLHttpRequest|WebSocket|process\.env|process\.argv|child_process|worker_threads|node:(?:http|https|net|tls|dgram|dns|fs|child_process|worker_threads)|from ["'](?:http|https|net|fs|pg|undici|axios)["']|secret-provider|secret-resolver|authorization-store|openrouter|multi-provider-gateway|provider-adapter|supabase|onnx|llama|huggingface|transformers|setInterval|setTimeout|new Date\(|Date\.now/i,
        file,
      );
    }
  });

  it("names no specific model, runtime, provider or open-source project as a domain concept", () => {
    const forbidden =
      /\b(?:laya|kev|von|semif|rizzo|nanojev|nimble|qwen|openai|anthropic|claude|gemini|deepseek|openrouter|minimax|glm|mistral|llama|gpt)\b/i;
    for (const file of decisionFiles)
      assert.doesNotMatch(readFileSync(file, "utf8"), forbidden, file);
    for (const schema of [
      "schemas/ai-typed-decision-request.schema.json",
      "schemas/ai-typed-decision-result.schema.json",
    ])
      assert.doesNotMatch(readFileSync(schema, "utf8"), forbidden, schema);
  });

  it("is not wired into any execution, routing, gateway, server, scheduler or operator path", () => {
    const consumers = walk("src")
      .filter(
        (file) => file.endsWith(".ts") && !file.startsWith(`${DECISION_DIR}/`),
      )
      .filter((file) =>
        importSpecifiers(readFileSync(file, "utf8")).some(
          (specifier) =>
            specifier.startsWith(".") &&
            resolveLocal(file, specifier).startsWith(`${DECISION_DIR}/`),
        ),
      );
    // AI-141: the pure Gold Decision evaluation layer, which measures typed
    // decision results and is itself unwired
    // (tests/architecture/gold-decision-evaluation-boundary.test.ts).
    // AI-142: the pure candidate registry, which reuses only the canonical
    // form and validation vocabulary and is itself unwired
    // (tests/architecture/decision-candidate-registry-boundary.test.ts).
    // AI-143: the decision sandbox, which reuses the canonical form, the
    // request/result contracts and validators and is itself unwired
    // (tests/architecture/decision-sandbox-boundary.test.ts).
    assert.deepEqual(
      consumers.filter(
        (file) =>
          !file.startsWith(EVALUATION_DIR) &&
          !file.startsWith(CANDIDATE_REGISTRY_DIR) &&
          !file.startsWith(SANDBOX_DIR),
      ),
      [],
      "no production module outside the AI-141 evaluation layer, the AI-142 candidate registry and the AI-143 decision sandbox may consume the typed decision plane",
    );
    for (const file of consumers.filter(
      (f) => f.startsWith(CANDIDATE_REGISTRY_DIR) || f.startsWith(SANDBOX_DIR),
    ))
      for (const specifier of importSpecifiers(readFileSync(file, "utf8")))
        if (resolveLocal(file, specifier).startsWith(`${DECISION_DIR}/`))
          assert.match(
            resolveLocal(file, specifier),
            /^src\/decision\/(?:canonical|validation|contracts)\.ts$/,
            `${file} may only reuse the AI-140 canonical form and vocabulary`,
          );
    for (const file of ["api", "scripts"].filter(existsSync).flatMap(walk))
      assert.doesNotMatch(readFileSync(file, "utf8"), /src\/decision\//, file);
  });

  it("ships no model weights, runtime configuration or activation for typed decisions", () => {
    const files = walk(".").filter(
      (file) =>
        !file.includes("node_modules/") &&
        !file.startsWith(".git/") &&
        !file.startsWith("dist/"),
    );
    for (const file of files)
      assert.doesNotMatch(
        file,
        /\.(?:gguf|safetensors|onnx|pt|bin|ckpt)$/i,
        file,
      );
    assert.equal(existsSync("config/ai-typed-decision-runtime.json"), false);
    for (const file of walk("data/fixtures/typed-decision")) {
      const value = JSON.parse(readFileSync(file, "utf8")) as Record<
        string,
        unknown
      >;
      if (
        value["contract"] === "typed_decision_result" &&
        typeof value["result_origin"] === "string"
      )
        assert.equal(value["result_origin"], "synthetic_fixture", file);
    }
  });
});

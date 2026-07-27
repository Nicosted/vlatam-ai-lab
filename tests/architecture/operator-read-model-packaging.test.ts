import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createApplicationEntrypoint } from "../../api/index.js";
import type { ApplicationIdentity } from "../../src/application/application-access.js";
import {
  OPERATOR_READ_MODEL_ARTIFACTS,
  OPERATOR_READ_MODEL_ASSET_PATHS,
  type OperatorReadModelArtifactKey,
  resolvePackagedOperatorAssetRoot,
} from "../../src/operator/operator-read-model-assets.js";
import {
  loadRepositoryOperatorReadModel,
  REPOSITORY_OPERATOR_EVALUATED_AT,
} from "../../src/operator/repository-operator-read-model.js";

interface VercelConfiguration {
  readonly builds?: readonly {
    readonly src: string;
    readonly use: string;
    readonly config?: {
      readonly includeFiles?: string | readonly string[];
    };
  }[];
  readonly functions?: unknown;
  readonly buildCommand?: string;
  readonly outputDirectory?: string;
}

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const vercel = JSON.parse(
  readFileSync(resolve(repositoryRoot, "vercel.json"), "utf8"),
) as VercelConfiguration;

const dynamicOnlyKeys = [
  "tournament_native",
  "tournament_eve",
  "tournament_cloudflare",
  "runtime_evidence_eve",
  "runtime_evidence_cloudflare",
  "glm_conformance",
  "arca_review_fixture",
] as const satisfies readonly OperatorReadModelArtifactKey[];

const TEST_ADMIN: ApplicationIdentity = {
  authenticated: true,
  display_name: "Packaging test admin",
  subject: "test:packaging-admin",
  role: "admin",
  source: "trusted-upstream",
};

function createPackagedLayout(
  omitted: ReadonlySet<OperatorReadModelArtifactKey> = new Set(),
): string {
  const packagedRoot = mkdtempSync(
    resolve(tmpdir(), "operator-read-model-package-"),
  );
  for (const [key, relativePath] of Object.entries(
    OPERATOR_READ_MODEL_ARTIFACTS,
  ) as [OperatorReadModelArtifactKey, string][]) {
    if (omitted.has(key)) continue;
    const target = resolve(packagedRoot, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(resolve(repositoryRoot, relativePath), target);
  }
  return packagedRoot;
}

const loadFromPackagedRoot = (packagedRoot: string) =>
  loadRepositoryOperatorReadModel({
    repository_root: resolvePackagedOperatorAssetRoot(
      pathToFileURL(resolve(packagedRoot, "api/index.js")).href,
    ),
    evaluated_at: REPOSITORY_OPERATOR_EVALUATED_AT,
  });

async function requestEntrypointFromCwd(
  cwd: string,
  repositoryRootOverride?: string,
) {
  let status = 0;
  let body = "";
  const response = {
    writeHead(nextStatus: number) {
      status = nextStatus;
      return this;
    },
    end(chunk?: string) {
      body += chunk ?? "";
      return this;
    },
  } as unknown as ServerResponse;
  const handler = createApplicationEntrypoint({
    environment: () => ({
      AI_LAB_DEPLOYMENT_ENV: "development",
      AI_LAB_RUNTIME_MODE: "test",
      AI_LAB_PUBLIC_ORIGIN: "https://test.example",
      AI_LAB_LOCAL_AUTH_ENABLED: "false",
    }),
    test_identity_resolver: async () => TEST_ADMIN,
    ...(repositoryRootOverride === undefined
      ? {}
      : { repository_root: repositoryRootOverride }),
  });
  const previousCwd = process.cwd();
  try {
    process.chdir(cwd);
    await handler(
      {
        method: "GET",
        url: "/operator",
        headers: {},
      } as IncomingMessage,
      response,
    );
  } finally {
    process.chdir(previousCwd);
  }
  return { status, body };
}

describe("AI-136 Operator Read Model function packaging", () => {
  it("defines one exact immutable 21-file manifest", () => {
    assert.equal(Object.keys(OPERATOR_READ_MODEL_ARTIFACTS).length, 21);
    assert.equal(OPERATOR_READ_MODEL_ASSET_PATHS.length, 21);
    assert.equal(new Set(OPERATOR_READ_MODEL_ASSET_PATHS).size, 21);
    for (const relativePath of OPERATOR_READ_MODEL_ASSET_PATHS) {
      assert.equal(relativePath.endsWith(".json"), true);
      assert.equal(relativePath.startsWith("/"), false);
      assert.equal(relativePath.includes(".."), false);
      assert.equal(
        readFileSync(resolve(repositoryRoot, relativePath), "utf8").length > 0,
        true,
      );
    }
  });

  it("includes exactly the canonical manifest in the legacy Node build", () => {
    const build = vercel.builds?.[0];
    assert.equal(build?.src, "api/index.ts");
    assert.equal(build?.use, "@vercel/node");
    assert.ok(Array.isArray(build?.config?.includeFiles));
    assert.deepEqual(
      [...(build?.config?.includeFiles ?? [])].sort(),
      [...OPERATOR_READ_MODEL_ASSET_PATHS].sort(),
    );
    assert.equal(vercel.functions, undefined);
    assert.equal(vercel.buildCommand, undefined);
    assert.equal(vercel.outputDirectory, undefined);
    for (const included of build?.config?.includeFiles ?? []) {
      assert.doesNotMatch(
        included,
        /(?:^|\/)\.git(?:\/|$)|\.env|credential|secret|reports?\/|docs?\/|tests?\/|\*|(?:^|\/)\.\.(?:\/|$)/i,
      );
    }
  });

  it("resolves a fixed packaged root without cwd or repository discovery", () => {
    const entrypoint = pathToFileURL(
      resolve("/function-layout", "api/index.js"),
    ).href;
    assert.equal(
      resolvePackagedOperatorAssetRoot(entrypoint),
      resolve("/function-layout"),
    );
    const source = readFileSync(
      resolve(repositoryRoot, "src/operator/operator-read-model-assets.ts"),
      "utf8",
    );
    assert.doesNotMatch(
      source,
      /process\.cwd|process\.env|readdir|existsSync|\.git/,
    );
  });

  it("loads the complete packaged snapshot from an unrelated cwd", async () => {
    const packagedRoot = createPackagedLayout();
    const unrelatedCwd = mkdtempSync(resolve(tmpdir(), "operator-unrelated-"));
    const previousCwd = process.cwd();
    try {
      process.chdir(unrelatedCwd);
      const model = await loadFromPackagedRoot(packagedRoot);
      assert.equal(model.system_summary.overall_status, "blocked");
    } finally {
      process.chdir(previousCwd);
    }
    const handlerResult = await requestEntrypointFromCwd(
      unrelatedCwd,
      packagedRoot,
    );
    assert.equal(handlerResult.status, 200);
    assert.doesNotMatch(handlerResult.body, /Estado del repositorio inválido/);
  });

  it("keeps the default application entrypoint independent of cwd", async () => {
    const unrelatedCwd = mkdtempSync(
      resolve(tmpdir(), "entrypoint-unrelated-"),
    );
    const result = await requestEntrypointFromCwd(unrelatedCwd);
    assert.equal(result.status, 200);
    assert.doesNotMatch(result.body, /Estado del repositorio inválido/);
  });

  it("fails closed when any dynamic-only packaged input is omitted", async () => {
    for (const key of dynamicOnlyKeys) {
      const model = await loadFromPackagedRoot(
        createPackagedLayout(new Set([key])),
      );
      assert.equal(model.system_summary.overall_status, "invalid_state", key);
      assert.ok(
        model.blockers.some(
          ({ blocker_code }) =>
            blocker_code ===
            `repository_loader:missing_or_malformed_artifact:${key}`,
        ),
        key,
      );
    }
  });

  it("fails closed when a statically imported packaged input is omitted", async () => {
    const model = await loadFromPackagedRoot(
      createPackagedLayout(new Set(["models"])),
    );
    assert.equal(model.system_summary.overall_status, "invalid_state");
    assert.ok(
      model.blockers.some(
        ({ blocker_code }) =>
          blocker_code ===
          "repository_loader:missing_or_malformed_artifact:models",
      ),
    );
  });

  it("keeps packaged-input failures path-safe in the browser", async () => {
    const packagedRoot = createPackagedLayout(new Set(["models"]));
    const unrelatedCwd = mkdtempSync(resolve(tmpdir(), "error-unrelated-"));
    const result = await requestEntrypointFromCwd(unrelatedCwd, packagedRoot);
    assert.equal(result.status, 500);
    assert.match(result.body, /Estado del repositorio inválido/);
    assert.match(result.body, /no se intentó ninguna ejecución/);
    assert.doesNotMatch(result.body, new RegExp(packagedRoot));
    assert.doesNotMatch(result.body, /missing_or_malformed_artifact|Error:/);
  });

  it("preserves explicit local repository_root behavior", async () => {
    const model = await loadRepositoryOperatorReadModel({
      repository_root: repositoryRoot,
      evaluated_at: REPOSITORY_OPERATOR_EVALUATED_AT,
    });
    assert.equal(model.system_summary.overall_status, "blocked");
  });
});

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { OPERATOR_READ_MODEL_ASSET_PATHS } from "../../src/operator/operator-read-model-assets.js";
import { ARCA_REGULATORY_BATCH_ASSET_PATHS } from "../../src/regulatory/arca-regulatory-batch.js";

interface VercelConfiguration {
  readonly buildCommand?: string;
  readonly framework?: string | null;
  readonly outputDirectory?: string;
  readonly builds?: readonly {
    readonly src: string;
    readonly use: string;
    readonly config?: {
      readonly includeFiles?: string | readonly string[];
    };
  }[];
  readonly routes?: readonly {
    readonly src: string;
    readonly dest: string;
    readonly headers?: Readonly<Record<string, string>>;
  }[];
  readonly functions?: Readonly<Record<string, unknown>>;
  readonly rewrites?: unknown;
  readonly headers?: unknown;
}

interface PackageConfiguration {
  readonly scripts?: Readonly<Record<string, string>>;
}

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;

const vercel = readJson<VercelConfiguration>("vercel.json");
const packageConfiguration = readJson<PackageConfiguration>("package.json");

describe("Vercel Function deployment configuration", () => {
  it("uses the Other framework preset without a static output directory", () => {
    assert.equal(vercel.framework, null);
    assert.equal(vercel.buildCommand, undefined);
    assert.equal(vercel.outputDirectory, undefined);
    assert.equal(existsSync("public"), false);
  });

  it("builds only api/index.ts as a Node Vercel Function", () => {
    assert.equal(vercel.builds?.length, 1);
    assert.equal(vercel.builds?.[0]?.src, "api/index.ts");
    assert.equal(vercel.builds?.[0]?.use, "@vercel/node");
    assert.deepEqual(
      [...(vercel.builds?.[0]?.config?.includeFiles ?? [])].sort(),
      [
        ...OPERATOR_READ_MODEL_ASSET_PATHS,
        ...ARCA_REGULATORY_BATCH_ASSET_PATHS,
      ].sort(),
    );
    assert.equal(existsSync("api/index.ts"), true);
    assert.doesNotMatch(JSON.stringify(vercel.builds), /static/i);
  });

  it("preserves the local and CI production build command", () => {
    assert.equal(
      packageConfiguration.scripts?.["build:production"],
      "pnpm run build && tsc -p tsconfig.vercel.json",
    );
  });

  it("routes every required application path to api/index.ts", () => {
    const applicationRoute = vercel.routes?.find(
      ({ dest }) => dest === "/api/index.ts",
    );
    assert.ok(applicationRoute);
    const routePattern = new RegExp(`^${applicationRoute.src}$`);
    for (const path of [
      "/",
      "/healthz",
      "/operator/review",
      "/operator/arca-review",
      "/arbitrary-application-path",
    ]) {
      assert.equal(
        routePattern.test(path),
        true,
        `${path} must reach function`,
      );
    }
  });

  it("preserves the required security headers on the application route", () => {
    const configuredHeaders = vercel.routes?.find(
      ({ dest }) => dest === "/api/index.ts",
    )?.headers;
    assert.deepEqual(configuredHeaders, {
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy":
        "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    });
  });

  it("does not expose source directories or mix Vercel configuration styles", () => {
    assert.equal(vercel.functions, undefined);
    assert.equal(vercel.rewrites, undefined);
    assert.equal(vercel.headers, undefined);
    assert.equal(vercel.builds?.length, 1);
    assert.equal(vercel.routes?.length, 1);
    assert.deepEqual(
      vercel.builds?.map(({ src }) => src),
      ["api/index.ts"],
    );
    assert.doesNotMatch(
      JSON.stringify(vercel),
      /@vercel\/static|static-build|"dest":"\/(?:public|dist|src)(?:\/|")/,
    );
  });
});

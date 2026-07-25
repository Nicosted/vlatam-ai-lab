import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

interface VercelConfiguration {
  readonly buildCommand?: string;
  readonly framework?: string | null;
  readonly outputDirectory?: string;
  readonly functions?: Readonly<Record<string, unknown>>;
  readonly rewrites?: readonly {
    readonly source: string;
    readonly destination: string;
  }[];
  readonly headers?: readonly {
    readonly source: string;
    readonly headers: readonly {
      readonly key: string;
      readonly value: string;
    }[];
  }[];
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
    assert.equal(vercel.outputDirectory, undefined);
    assert.equal(existsSync("public"), false);
  });

  it("keeps api/index.ts as the configured function entrypoint", () => {
    assert.deepEqual(vercel.functions?.["api/index.ts"], {
      maxDuration: 10,
      memory: 512,
    });
    assert.equal(existsSync("api/index.ts"), true);
  });

  it("leaves Vercel build automation enabled while preserving local validation", () => {
    assert.equal(vercel.buildCommand, undefined);
    assert.equal(
      packageConfiguration.scripts?.["build:production"],
      "pnpm run build && tsc -p tsconfig.vercel.json",
    );
  });

  it("preserves the catch-all route and required security headers", () => {
    assert.deepEqual(vercel.rewrites, [
      {
        source: "/(.*)",
        destination: "/api",
      },
    ]);

    const configuredHeaders = Object.fromEntries(
      vercel.headers
        ?.find(({ source }) => source === "/(.*)")
        ?.headers.map(({ key, value }) => [key, value]) ?? [],
    );
    assert.deepEqual(configuredHeaders, {
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy":
        "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    });
  });
});

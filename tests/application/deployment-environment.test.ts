import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateApplicationEnvironment } from "../../src/application/deployment-environment.js";

const roleBindings = (
  overrides: Readonly<Record<string, unknown>> = {},
): string =>
  JSON.stringify({
    admin: ["Admin@Example.com"],
    reviewer: [],
    operator: [],
    viewer: [],
    ...overrides,
  });

const productionEnvironment = (
  overrides: Readonly<Record<string, string | undefined>> = {},
): Readonly<Record<string, string | undefined>> => ({
  AI_LAB_DEPLOYMENT_ENV: "production",
  AI_LAB_RUNTIME_MODE: "production",
  AI_LAB_PUBLIC_ORIGIN: "https://lab.vlatamglobal.com",
  AI_LAB_IDENTITY_PROVIDER: "cloudflare_access",
  AI_LAB_CLOUDFLARE_ACCESS_ISSUER: "https://team.cloudflareaccess.com",
  AI_LAB_CLOUDFLARE_ACCESS_AUDIENCE: "application-audience",
  AI_LAB_IDENTITY_ROLE_BINDINGS: roleBindings(),
  ...overrides,
});

describe("AI-135 governed Cloudflare Access environment", () => {
  it("accepts valid production configuration and normalizes emails", () => {
    const result = validateApplicationEnvironment(productionEnvironment());
    assert.equal(result.valid, true);
    assert.equal(result.environment?.identity_provider, "cloudflare_access");
    assert.equal(
      result.environment?.cloudflare_access?.issuer,
      "https://team.cloudflareaccess.com",
    );
    assert.equal(
      result.environment?.cloudflare_access?.audience,
      "application-audience",
    );
    assert.deepEqual(
      result.environment?.cloudflare_access?.role_bindings.admin,
      ["admin@example.com"],
    );
  });

  it("rejects a missing or unsupported provider", () => {
    for (const provider of [undefined, "local", "oidc"]) {
      const result = validateApplicationEnvironment(
        productionEnvironment({ AI_LAB_IDENTITY_PROVIDER: provider }),
      );
      assert.equal(result.valid, false, String(provider));
      assert.equal(result.environment, null);
    }
  });

  it("rejects malformed, non-HTTPS, and non-origin issuers", () => {
    for (const issuer of [
      "not-a-url",
      "http://team.cloudflareaccess.com",
      "https://team.cloudflareaccess.com/path",
      "https://team.cloudflareaccess.com?query=true",
      "https://team.cloudflareaccess.com#fragment",
      "https://user:password@team.cloudflareaccess.com",
    ]) {
      const result = validateApplicationEnvironment(
        productionEnvironment({
          AI_LAB_CLOUDFLARE_ACCESS_ISSUER: issuer,
        }),
      );
      assert.equal(result.valid, false, issuer);
    }
  });

  it("rejects a missing or whitespace-only audience", () => {
    for (const audience of [undefined, "", "   "]) {
      const result = validateApplicationEnvironment(
        productionEnvironment({
          AI_LAB_CLOUDFLARE_ACCESS_AUDIENCE: audience,
        }),
      );
      assert.equal(result.valid, false, String(audience));
    }
  });

  it("rejects invalid role-binding JSON and non-object JSON", () => {
    for (const bindings of [
      undefined,
      "{",
      "null",
      "[]",
      '"admin@example.com"',
    ]) {
      const result = validateApplicationEnvironment(
        productionEnvironment({
          AI_LAB_IDENTITY_ROLE_BINDINGS: bindings,
        }),
      );
      assert.equal(result.valid, false, String(bindings));
    }
  });

  it("rejects unknown and missing role keys", () => {
    const unknown = validateApplicationEnvironment(
      productionEnvironment({
        AI_LAB_IDENTITY_ROLE_BINDINGS: roleBindings({ owner: [] }),
      }),
    );
    const missing = validateApplicationEnvironment(
      productionEnvironment({
        AI_LAB_IDENTITY_ROLE_BINDINGS: JSON.stringify({
          admin: [],
          reviewer: [],
          viewer: [],
        }),
      }),
    );
    assert.equal(unknown.valid, false);
    assert.equal(missing.valid, false);
  });

  it("rejects non-array role values and non-string array values", () => {
    for (const bindings of [
      roleBindings({ viewer: "viewer@example.com" }),
      roleBindings({ viewer: [42] }),
    ]) {
      const result = validateApplicationEnvironment(
        productionEnvironment({
          AI_LAB_IDENTITY_ROLE_BINDINGS: bindings,
        }),
      );
      assert.equal(result.valid, false);
    }
  });

  it("rejects invalid email strings", () => {
    for (const email of [
      "",
      "not-an-email",
      "@example.com",
      "user@",
      ".user@example.com",
      "user..name@example.com",
      "user@example",
    ]) {
      const result = validateApplicationEnvironment(
        productionEnvironment({
          AI_LAB_IDENTITY_ROLE_BINDINGS: roleBindings({ viewer: [email] }),
        }),
      );
      assert.equal(result.valid, false, email);
    }
  });

  it("rejects duplicate normalized emails within or across roles", () => {
    for (const bindings of [
      roleBindings({
        admin: ["user@example.com", " USER@example.com "],
      }),
      roleBindings({
        admin: ["user@example.com"],
        viewer: ["User@Example.com"],
      }),
    ]) {
      const result = validateApplicationEnvironment(
        productionEnvironment({
          AI_LAB_IDENTITY_ROLE_BINDINGS: bindings,
        }),
      );
      assert.equal(result.valid, false);
    }
  });

  it("accepts an explicit empty allowlist and remains identity-provider configured", () => {
    const result = validateApplicationEnvironment(
      productionEnvironment({
        AI_LAB_IDENTITY_ROLE_BINDINGS:
          '{"admin":[],"reviewer":[],"operator":[],"viewer":[]}',
      }),
    );
    assert.equal(result.valid, true);
    assert.deepEqual(result.environment?.cloudflare_access?.role_bindings, {
      admin: [],
      reviewer: [],
      operator: [],
      viewer: [],
    });
  });

  it("requires valid Cloudflare configuration in Preview as well as Production", () => {
    const valid = validateApplicationEnvironment({
      ...productionEnvironment(),
      AI_LAB_DEPLOYMENT_ENV: "preview",
      AI_LAB_RUNTIME_MODE: "preview",
      AI_LAB_PUBLIC_ORIGIN: "https://preview.example.com",
    });
    const missing = validateApplicationEnvironment({
      AI_LAB_DEPLOYMENT_ENV: "preview",
      AI_LAB_RUNTIME_MODE: "preview",
      AI_LAB_PUBLIC_ORIGIN: "https://preview.example.com",
    });
    assert.equal(valid.valid, true);
    assert.equal(missing.valid, false);
  });

  it("keeps Cloudflare identity configuration out of local and test modes", () => {
    for (const runtimeMode of ["development_local", "test"] as const) {
      const result = validateApplicationEnvironment({
        AI_LAB_DEPLOYMENT_ENV: "development",
        AI_LAB_RUNTIME_MODE: runtimeMode,
        AI_LAB_PUBLIC_ORIGIN:
          runtimeMode === "development_local"
            ? "http://127.0.0.1:3000"
            : "https://test.example.com",
        AI_LAB_IDENTITY_PROVIDER: "cloudflare_access",
      });
      assert.equal(result.valid, false, runtimeMode);
    }
  });
});

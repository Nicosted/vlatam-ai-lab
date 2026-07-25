import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string): string => readFileSync(path, "utf8");
const identitySource = read("src/application/cloudflare-access-identity.ts");
const environmentSource = read("src/application/deployment-environment.ts");
const entrypointSource = read("api/index.ts");

describe("AI-135 Cloudflare Access architecture boundary", () => {
  it("keeps identity verification independent of operational modules", () => {
    const runtimeImports = identitySource
      .split("\n")
      .filter((line) => line.startsWith("import "))
      .join("\n");
    assert.doesNotMatch(
      runtimeImports,
      /providers|scheduler|controlled-live-arca|governed-arca|arca-|credential|secret|database|supabase|vlatam-global|authorization-store|approved-arca/,
    );
  });

  it("derives JWKS only from the validated issuer", () => {
    assert.match(
      identitySource,
      /new URL\("\/cdn-cgi\/access\/certs", issuer\)/,
    );
    assert.doesNotMatch(
      `${environmentSource}\n${entrypointSource}`,
      /AI_LAB_(?:CLOUDFLARE_)?(?:JWKS|JWK_SET|CERTS)_URL/,
    );
    assert.doesNotMatch(identitySource, /process\.env|jwks_uri/i);
  });

  it("trusts only the signed Cloudflare Access assertion", () => {
    assert.match(identitySource, /cf-access-jwt-assertion/);
    assert.doesNotMatch(
      identitySource,
      /cf-access-authenticated-user-email|x-forwarded-email|x-user|x-role/i,
    );
    assert.match(identitySource, /jwtVerify/);
    assert.match(identitySource, /algorithms:/);
    assert.match(identitySource, /issuer:/);
    assert.match(identitySource, /audience:/);
    assert.match(identitySource, /requiredClaims:/);
  });

  it("keeps production local authentication forbidden", () => {
    assert.match(
      environmentSource,
      /AI_LAB_LOCAL_AUTH_ENABLED is permitted only in development_local mode/,
    );
    assert.match(
      entrypointSource,
      /environment\.runtime_mode === "development_local"/,
    );
    assert.doesNotMatch(
      entrypointSource,
      /runtime_mode === "production"[\s\S]{0,250}createLocalDevelopmentIdentityResolver/,
    );
  });

  it("preserves the exact route authorization policy", () => {
    const shell = read("src/application/application-shell.ts");
    assert.match(shell, /allowed_roles: \["admin"\]/);
    assert.match(
      shell,
      /const ALL_ROLES:[\s\S]*"viewer",[\s\S]*"operator",[\s\S]*"reviewer",[\s\S]*"admin"/,
    );
    assert.match(
      shell,
      /const OPERATIONS_ROLES:[\s\S]*"operator",[\s\S]*"reviewer",[\s\S]*"admin"/,
    );
    assert.match(
      shell,
      /const REVIEW_ROLES:[\s\S]*"operator",[\s\S]*"reviewer",[\s\S]*"admin"/,
    );
  });
});

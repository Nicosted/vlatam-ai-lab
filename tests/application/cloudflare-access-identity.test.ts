import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { before, describe, it } from "node:test";

import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTVerifyGetKey,
} from "jose";

import { createApplicationEntrypoint } from "../../api/index.js";
import {
  ANONYMOUS_IDENTITY,
  type ApplicationIdentity,
} from "../../src/application/application-access.js";
import {
  createCloudflareAccessIdentityResolver,
  deriveCloudflareAccessJwksUrl,
} from "../../src/application/cloudflare-access-identity.js";
import type { CloudflareAccessIdentityConfiguration } from "../../src/application/deployment-environment.js";

const ISSUER = "https://team.cloudflareaccess.com";
const AUDIENCE = "application-audience";
const KEY_ID = "offline-test-key";
const FIXED_DATE = new Date("2026-07-25T12:00:00.000Z");
const FIXED_SECONDS = Math.floor(FIXED_DATE.getTime() / 1_000);

const configuration: CloudflareAccessIdentityConfiguration = Object.freeze({
  issuer: ISSUER,
  audience: AUDIENCE,
  role_bindings: Object.freeze({
    admin: Object.freeze(["admin@example.com"]),
    reviewer: Object.freeze(["reviewer@example.com"]),
    operator: Object.freeze(["operator@example.com"]),
    viewer: Object.freeze(["viewer@example.com"]),
  }),
});

let signingKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
let invalidSigningKey: Awaited<
  ReturnType<typeof generateKeyPair>
>["privateKey"];
let staticJwks: JWTVerifyGetKey;

before(async () => {
  const trusted = await generateKeyPair("RS256");
  const invalid = await generateKeyPair("RS256");
  signingKey = trusted.privateKey;
  invalidSigningKey = invalid.privateKey;
  const publicJwk = await exportJWK(trusted.publicKey);
  staticJwks = createLocalJWKSet({
    keys: [{ ...publicJwk, alg: "RS256", kid: KEY_ID, use: "sig" }],
  });
});

interface TokenOptions {
  readonly email?: string | null;
  readonly issuer?: string;
  readonly audience?: string;
  readonly expiration?: number | null;
  readonly notBefore?: number;
  readonly role?: string;
  readonly key?: typeof signingKey;
  readonly algorithm?: "RS256";
}

async function token(options: TokenOptions = {}): Promise<string> {
  const payload: Record<string, unknown> = {
    ...(options.email === null
      ? {}
      : { email: options.email ?? "admin@example.com" }),
    ...(options.role ? { role: options.role } : {}),
    iat: FIXED_SECONDS,
    ...(options.expiration === null
      ? {}
      : { exp: options.expiration ?? FIXED_SECONDS + 300 }),
    ...(options.notBefore === undefined ? {} : { nbf: options.notBefore }),
  };
  return new SignJWT(payload)
    .setProtectedHeader({
      alg: options.algorithm ?? "RS256",
      kid: KEY_ID,
    })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .sign(options.key ?? signingKey);
}

const request = (
  assertion?: string | string[],
  extraHeaders: Readonly<Record<string, string>> = {},
  rawHeaders: readonly string[] = [],
): IncomingMessage =>
  ({
    headers: {
      ...(assertion === undefined
        ? {}
        : { "cf-access-jwt-assertion": assertion }),
      ...extraHeaders,
    },
    rawHeaders: [...rawHeaders],
  }) as unknown as IncomingMessage;

const resolver = (): ReturnType<
  typeof createCloudflareAccessIdentityResolver
> =>
  createCloudflareAccessIdentityResolver({
    configuration,
    jwks: staticJwks,
    clock: () => FIXED_DATE,
  });

const resolve = async (
  assertion?: string | string[],
  extraHeaders: Readonly<Record<string, string>> = {},
  rawHeaders: readonly string[] = [],
): Promise<ApplicationIdentity> =>
  resolver()(request(assertion, extraHeaders, rawHeaders));

describe("AI-135 Cloudflare Access identity resolver", () => {
  it("derives the only JWKS endpoint from the validated issuer", () => {
    assert.equal(
      deriveCloudflareAccessJwksUrl(ISSUER).href,
      "https://team.cloudflareaccess.com/cdn-cgi/access/certs",
    );
  });

  for (const role of ["admin", "reviewer", "operator", "viewer"] as const) {
    it(`resolves a valid allowlisted ${role} token`, async () => {
      const identity = await resolve(
        await token({ email: `${role}@example.com` }),
      );
      assert.equal(identity.authenticated, true);
      assert.equal(identity.role, role);
      assert.equal(identity.display_name, `${role}@example.com`);
      assert.equal(identity.source, "trusted-upstream");
    });
  }

  it("normalizes a verified email before allowlist lookup", async () => {
    const identity = await resolve(
      await token({ email: "  ADMIN@EXAMPLE.COM  " }),
    );
    assert.equal(identity.authenticated, true);
    assert.equal(identity.role, "admin");
    assert.equal(identity.display_name, "admin@example.com");
  });

  it("rejects missing, empty, and array-valued assertions", async () => {
    for (const assertion of [undefined, "", "   ", ["token", "token"]]) {
      assert.equal(await resolve(assertion), ANONYMOUS_IDENTITY);
    }
  });

  it("rejects duplicated assertion headers", async () => {
    const assertion = await token();
    const identity = await resolve(assertion, {}, [
      "Cf-Access-Jwt-Assertion",
      assertion,
      "cf-access-jwt-assertion",
      assertion,
    ]);
    assert.equal(identity, ANONYMOUS_IDENTITY);
  });

  it("rejects invalid signatures", async () => {
    assert.equal(
      await resolve(await token({ key: invalidSigningKey })),
      ANONYMOUS_IDENTITY,
    );
  });

  it("rejects a token signed with an unapproved algorithm", async () => {
    const assertion = await new SignJWT({
      email: "admin@example.com",
      exp: FIXED_SECONDS + 300,
    })
      .setProtectedHeader({ alg: "HS256", kid: KEY_ID })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .sign(new TextEncoder().encode("offline-untrusted-symmetric-key"));
    assert.equal(await resolve(assertion), ANONYMOUS_IDENTITY);
  });

  it("rejects the wrong issuer and audience", async () => {
    assert.equal(
      await resolve(
        await token({ issuer: "https://other.cloudflareaccess.com" }),
      ),
      ANONYMOUS_IDENTITY,
    );
    assert.equal(
      await resolve(await token({ audience: "other-audience" })),
      ANONYMOUS_IDENTITY,
    );
  });

  it("rejects expired tokens, missing expiration, and future not-before", async () => {
    for (const assertion of [
      await token({ expiration: FIXED_SECONDS - 1 }),
      await token({ expiration: null }),
      await token({ notBefore: FIXED_SECONDS + 60 }),
    ])
      assert.equal(await resolve(assertion), ANONYMOUS_IDENTITY);
  });

  it("rejects missing, invalid, and unknown emails", async () => {
    for (const assertion of [
      await token({ email: null }),
      await token({ email: "not-an-email" }),
      await token({ email: "unknown@example.com" }),
    ])
      assert.equal(await resolve(assertion), ANONYMOUS_IDENTITY);
  });

  it("never uses a JWT role claim to elevate privileges", async () => {
    const identity = await resolve(
      await token({ email: "viewer@example.com", role: "admin" }),
    );
    assert.equal(identity.authenticated, true);
    assert.equal(identity.role, "viewer");
  });

  it("ignores unsigned identity and role headers without a signed assertion", async () => {
    const identity = await resolve(undefined, {
      "cf-access-authenticated-user-email": "admin@example.com",
      "x-forwarded-email": "admin@example.com",
      "x-user": "admin@example.com",
      "x-role": "admin",
    });
    assert.equal(identity, ANONYMOUS_IDENTITY);
  });

  it("returns anonymous when JWKS resolution fails or verification throws", async () => {
    const failingResolver = createCloudflareAccessIdentityResolver({
      configuration,
      jwks: async () => {
        throw new Error("offline JWKS failure");
      },
      clock: () => FIXED_DATE,
    });
    assert.equal(
      await failingResolver(request(await token())),
      ANONYMOUS_IDENTITY,
    );
  });

  it("keeps an explicit empty allowlist fail closed", async () => {
    const emptyResolver = createCloudflareAccessIdentityResolver({
      configuration: {
        ...configuration,
        role_bindings: {
          admin: [],
          reviewer: [],
          operator: [],
          viewer: [],
        },
      },
      jwks: staticJwks,
      clock: () => FIXED_DATE,
    });
    assert.equal(
      await emptyResolver(request(await token())),
      ANONYMOUS_IDENTITY,
    );
  });
});

type Environment = Readonly<Record<string, string | undefined>>;

const productionEnvironment = (): Environment => ({
  AI_LAB_DEPLOYMENT_ENV: "production",
  AI_LAB_RUNTIME_MODE: "production",
  AI_LAB_PUBLIC_ORIGIN: "https://lab.vlatamglobal.com",
  AI_LAB_IDENTITY_PROVIDER: "cloudflare_access",
  AI_LAB_CLOUDFLARE_ACCESS_ISSUER: ISSUER,
  AI_LAB_CLOUDFLARE_ACCESS_AUDIENCE: AUDIENCE,
  AI_LAB_IDENTITY_ROLE_BINDINGS: JSON.stringify(configuration.role_bindings),
});

async function entrypointRequest(
  path: string,
  assertion?: string,
  environment: Environment = productionEnvironment(),
): Promise<{
  readonly status: number;
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
}> {
  let status = 0;
  let body = "";
  let headers: Record<string, string> = {};
  const response = {
    writeHead(nextStatus: number, nextHeaders?: Record<string, string>) {
      status = nextStatus;
      headers = nextHeaders ?? {};
      return this;
    },
    end(chunk?: string) {
      body += chunk ?? "";
      return this;
    },
  } as unknown as ServerResponse;
  const handler = createApplicationEntrypoint({
    environment: () => environment,
    repository_root: process.cwd(),
    cloudflare_access_jwks: staticJwks,
    cloudflare_access_clock: () => FIXED_DATE,
  });
  await handler(
    {
      method: "GET",
      url: path,
      headers: {
        host: "lab.vlatamglobal.com",
        ...(assertion ? { "cf-access-jwt-assertion": assertion } : {}),
      },
      rawHeaders: assertion ? ["Cf-Access-Jwt-Assertion", assertion] : [],
      socket: { remoteAddress: "203.0.113.10" },
    } as unknown as IncomingMessage,
    response,
  );
  return { status, body, headers };
}

describe("AI-135 production entrypoint integration", () => {
  it("lets a valid allowlisted admin view the existing shell", async () => {
    const result = await entrypointRequest("/operator/settings", await token());
    assert.equal(result.status, 200);
    assert.match(result.body, /Preparación de despliegue/);
    assert.match(result.body, /admin@example\.com/);
  });

  it("renders the minimal Spanish identity failure for missing or unknown identity", async () => {
    for (const assertion of [
      undefined,
      await token({ email: "unknown@example.com" }),
    ]) {
      const result = await entrypointRequest("/operator", assertion);
      assert.equal(result.status, 401);
      assert.match(result.body, /Identidad requerida/);
      assert.match(
        result.body,
        /No fue posible verificar una identidad autorizada para AI LAB\./,
      );
      assert.doesNotMatch(
        result.body,
        /cloudflareaccess|application-audience|unknown@example\.com|stack|JWT/i,
      );
    }
  });

  it("returns 403 when a valid non-admin requests the admin-only route", async () => {
    const result = await entrypointRequest(
      "/operator/settings",
      await token({ email: "viewer@example.com", role: "admin" }),
    );
    assert.equal(result.status, 403);
    assert.match(result.body, /Vista no disponible para este rol/);
  });

  it("fails environment configuration closed before identity resolution", async () => {
    const result = await entrypointRequest("/operator", await token(), {
      ...productionEnvironment(),
      AI_LAB_IDENTITY_PROVIDER: "unsupported",
    });
    assert.equal(result.status, 503);
    assert.doesNotMatch(result.body, /issuer|audience|role|email|cloudflare/i);
  });

  it("preserves security headers for authenticated and rejected requests", async () => {
    const results = [
      await entrypointRequest("/operator", await token()),
      await entrypointRequest("/operator"),
    ];
    for (const result of results) {
      assert.equal(result.headers["X-Frame-Options"], "DENY");
      assert.equal(result.headers["X-Content-Type-Options"], "nosniff");
      assert.match(
        result.headers["Content-Security-Policy"] ?? "",
        /connect-src 'none'/,
      );
      assert.match(
        result.headers["Strict-Transport-Security"] ?? "",
        /max-age=63072000/,
      );
    }
  });

  it("does not render or log a rejected JWT or verification details", async () => {
    const sensitiveJwt = `${await token({ key: invalidSigningKey })}.sentinel`;
    const messages: string[] = [];
    const originalError = console.error;
    const originalLog = console.log;
    console.error = (...values: unknown[]) => {
      messages.push(values.join(" "));
    };
    console.log = (...values: unknown[]) => {
      messages.push(values.join(" "));
    };
    try {
      const result = await entrypointRequest("/operator", sensitiveJwt);
      assert.equal(result.status, 401);
      assert.equal(result.body.includes(sensitiveJwt), false);
      assert.equal(messages.join("\n").includes(sensitiveJwt), false);
      assert.doesNotMatch(
        `${result.body}\n${messages.join("\n")}`,
        /signature|issuer|audience|JWKS|verification error/i,
      );
    } finally {
      console.error = originalError;
      console.log = originalLog;
    }
  });

  it("keeps the verified UI identity isolated from operational authority", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      throw new Error("external request forbidden");
    }) as typeof fetch;
    try {
      const result = await entrypointRequest("/operator", await token());
      assert.equal(result.status, 200);
      assert.match(result.body, /Sin autoridad operativa/);
      assert.match(result.body, /Sistema bloqueado/);
      assert.equal(fetchCalls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

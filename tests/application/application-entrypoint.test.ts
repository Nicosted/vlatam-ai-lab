import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, it } from "node:test";

import productionEntrypoint, {
  createApplicationEntrypoint,
} from "../../api/index.js";
import type { ApplicationIdentity } from "../../src/application/application-access.js";

const TEST_ADMIN: ApplicationIdentity = {
  authenticated: true,
  display_name: "Test admin",
  subject: "test:admin",
  role: "admin",
  source: "trusted-upstream",
};

type Environment = Readonly<Record<string, string | undefined>>;

const environment = (
  runtimeMode: "development_local" | "preview" | "production" | "test",
  localAuthEnabled = false,
): Environment => ({
  AI_LAB_DEPLOYMENT_ENV:
    runtimeMode === "production"
      ? "production"
      : runtimeMode === "preview"
        ? "preview"
        : "development",
  AI_LAB_RUNTIME_MODE: runtimeMode,
  AI_LAB_PUBLIC_ORIGIN:
    runtimeMode === "development_local"
      ? "http://127.0.0.1:3000"
      : `https://${runtimeMode}.example.test`,
  AI_LAB_LOCAL_AUTH_ENABLED: localAuthEnabled ? "true" : "false",
});

async function request(
  input: Environment,
  path = "/operator",
  requestOptions: {
    readonly host?: string;
    readonly remoteAddress?: string;
    readonly role?: string;
    readonly testIdentity?: ApplicationIdentity;
  } = {},
) {
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
    environment: () => input,
    repository_root: process.cwd(),
    ...(requestOptions.testIdentity
      ? { test_identity_resolver: () => requestOptions.testIdentity! }
      : {}),
  });
  await handler(
    {
      method: "GET",
      url: path,
      headers: {
        host: requestOptions.host ?? "example.test",
        ...(requestOptions.role
          ? { "x-ai-lab-local-role": requestOptions.role }
          : {}),
      },
      socket: { remoteAddress: requestOptions.remoteAddress ?? "203.0.113.9" },
    } as unknown as IncomingMessage,
    response,
  );
  return { status, body, headers };
}

describe("AI-134 application entrypoint identity boundary", () => {
  it("fails closed when the runtime environment is absent or inconsistent", async () => {
    assert.equal((await request({})).status, 503);
    assert.equal(
      (
        await request({
          ...environment("preview"),
          AI_LAB_RUNTIME_MODE: "production",
        })
      ).status,
      503,
    );
  });

  it("never accepts the developer role header in Preview or Production", async () => {
    for (const mode of ["preview", "production"] as const) {
      const result = await request(environment(mode), "/operator/settings", {
        role: "admin",
      });
      assert.equal(result.status, 401, mode);
      assert.match(result.body, /Identidad requerida/);
    }
  });

  it("requires the explicit flag plus loopback host and remote address locally", async () => {
    const disabled = await request(
      environment("development_local"),
      "/operator/settings",
      {
        host: "127.0.0.1:3000",
        remoteAddress: "127.0.0.1",
        role: "admin",
      },
    );
    const remoteHost = await request(
      environment("development_local", true),
      "/operator/settings",
      {
        host: "preview.example.test",
        remoteAddress: "127.0.0.1",
        role: "admin",
      },
    );
    const remoteAddress = await request(
      environment("development_local", true),
      "/operator/settings",
      {
        host: "127.0.0.1:3000",
        remoteAddress: "203.0.113.9",
        role: "admin",
      },
    );
    const enabled = await request(
      environment("development_local", true),
      "/operator/settings",
      {
        host: "localhost:3000",
        remoteAddress: "::1",
        role: "admin",
      },
    );
    assert.equal(disabled.status, 401);
    assert.equal(remoteHost.status, 401);
    assert.equal(remoteAddress.status, 401);
    assert.equal(enabled.status, 200);
    assert.match(enabled.body, /Deployment preparation/);
  });

  it("isolates injected identities to explicit test mode", async () => {
    const testResult = await request(
      environment("test"),
      "/operator/settings",
      { testIdentity: TEST_ADMIN },
    );
    const previewResult = await request(
      environment("preview"),
      "/operator/settings",
      { testIdentity: TEST_ADMIN },
    );
    assert.equal(testResult.status, 200);
    assert.equal(previewResult.status, 503);
  });

  it("emits HSTS only for Production over the configured HTTPS origin", async () => {
    const production = await request(environment("production"));
    const preview = await request(environment("preview"));
    assert.match(
      production.headers["Strict-Transport-Security"] ?? "",
      /max-age=63072000/,
    );
    assert.equal(preview.headers["Strict-Transport-Security"], undefined);
  });

  it("renders read-only routes through the actual entrypoint composition without external or secret boundaries", async () => {
    assert.equal(typeof productionEntrypoint, "function");
    const originalEnvironment = process.env;
    const originalFetch = globalThis.fetch;
    let sensitiveEnvironmentReads = 0;
    let fetchCalls = 0;
    process.env = new Proxy(originalEnvironment, {
      get(target, property, receiver) {
        if (
          typeof property === "string" &&
          /(?:openrouter|secret|token|password|credential|api[_-]?keys?|database_url|supabase)/i.test(
            property,
          )
        )
          sensitiveEnvironmentReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      throw new Error("production entrypoint attempted an external request");
    }) as typeof fetch;

    try {
      for (const path of [
        "/operator",
        "/operator/review",
        "/operator/arca-review",
        "/research/regulatory/ar-es-ecological-agrochemicals",
      ]) {
        const result = await request(environment("test"), path, {
          testIdentity: TEST_ADMIN,
        });
        assert.equal(result.status, 200, path);
      }
      const classifier = await request(
        environment("test"),
        "/api/classifier/source/artifact--source--candidate",
        { testIdentity: TEST_ADMIN },
      );
      assert.equal(classifier.status, 404);
      assert.equal(fetchCalls, 0);
      assert.equal(sensitiveEnvironmentReads, 0);
    } finally {
      globalThis.fetch = originalFetch;
      process.env = originalEnvironment;
    }
  });
});

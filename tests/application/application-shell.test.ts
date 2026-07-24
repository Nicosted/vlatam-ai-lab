import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, it } from "node:test";

import {
  ANONYMOUS_IDENTITY,
  type ApplicationIdentity,
} from "../../src/application/application-access.js";
import {
  APPLICATION_ROUTES,
  APPLICATION_SHELL_ASSET_PATHS,
  APPLICATION_SHELL_CSS,
  APPLICATION_SHELL_JS,
} from "../../src/application/application-shell.js";
import { validateApplicationEnvironment } from "../../src/application/deployment-environment.js";
import { REPOSITORY_CURRENT_BLOCKED_STATUS } from "../../src/application/repository-current-status.js";
import {
  APPLICATION_SECURITY_HEADERS,
  handleOperatorConsoleRequest,
  type OperatorConsoleOptions,
} from "../../src/operator/operator-console-handler.js";

const identity = (role: ApplicationIdentity["role"]): ApplicationIdentity => ({
  authenticated: true,
  display_name: `Local ${role}`,
  subject: `local:${role}`,
  role,
  source: "local-development",
});

function captureResponse(): {
  readonly response: ServerResponse;
  readonly result: () => {
    readonly status: number;
    readonly body: string;
    readonly headers: Record<string, string>;
  };
} {
  let status = 0;
  let body = "";
  let headers: Record<string, string> = {};
  return {
    response: {
      writeHead(nextStatus: number, nextHeaders?: Record<string, string>) {
        status = nextStatus;
        headers = nextHeaders ?? {};
        return this;
      },
      end(chunk?: string) {
        body += chunk ?? "";
        return this;
      },
    } as unknown as ServerResponse,
    result: () => ({ status, body, headers }),
  };
}

async function request(
  path: string,
  options: Partial<OperatorConsoleOptions> = {},
) {
  const capture = captureResponse();
  const handled = await handleOperatorConsoleRequest(
    {
      method: "GET",
      url: path,
      headers: {},
    } as IncomingMessage,
    capture.response,
    {
      repository_root: process.cwd(),
      ...options,
    },
  );
  return { handled, ...capture.result() };
}

describe("AI-134 production application shell", () => {
  it("defines the complete grouped route map", () => {
    assert.deepEqual(
      [...new Set(APPLICATION_ROUTES.map((route) => route.group))],
      [null, "Operations", "Reviews", "Models", "Runtimes", "Knowledge"],
    );
    for (const expected of [
      "Overview",
      "ARCA",
      "Acquisitions",
      "Exports",
      "Recovery",
      "Human Review",
      "Approved Artifacts",
      "Providers",
      "Registry",
      "Tournaments",
      "AI LAB",
      "OpenRouter",
      "Vercel Eve",
      "Cloudflare",
      "Regulations",
      "Sources",
      "News",
      "Evidence",
      "Settings",
    ])
      assert.ok(
        APPLICATION_ROUTES.some((route) => route.label === expected),
        expected,
      );
  });

  it("renders shell, navigation, provenance, identity, and truthful blocked state", async () => {
    let networkCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      networkCalls += 1;
      throw new Error("network forbidden");
    }) as typeof fetch;
    try {
      const result = await request("/operator", {
        resolve_identity: () => identity("admin"),
      });
      assert.equal(result.status, 200);
      assert.match(result.body, /class="sidebar"/);
      assert.match(result.body, /data-command-search/);
      assert.match(result.body, /environment-badge">LOCAL/);
      assert.match(result.body, /Sistema bloqueado/);
      assert.match(result.body, /Admin|Local admin/i);
      assert.match(result.body, /class="breadcrumbs"/);
      assert.match(result.body, /PROVENANCE/);
      assert.match(result.body, /AI-131 kill switch/);
      assert.match(result.body, /AI-132 kill switch/);
      assert.match(result.body, /AI-133 kill switch/);
      assert.match(result.body, /Run de producción/);
      assert.match(result.body, /Acceso vlatam-global/);
      assert.match(result.body, /Cost visibility/);
      assert.equal(networkCalls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("maps the application root to the read-only overview", async () => {
    const result = await request("/", {
      resolve_identity: () => identity("viewer"),
    });
    assert.equal(result.handled, true);
    assert.equal(result.status, 200);
    assert.match(result.body, /<h2>Resumen<\/h2>/);
    assert.match(result.body, /href="\/operator" aria-current="page"/);
  });

  it("serves responsive shell assets without external dependencies", async () => {
    const css = await request(APPLICATION_SHELL_ASSET_PATHS.css);
    const js = await request(APPLICATION_SHELL_ASSET_PATHS.js);
    assert.equal(css.status, 200);
    assert.equal(js.status, 200);
    assert.equal(css.body, APPLICATION_SHELL_CSS);
    assert.equal(js.body, APPLICATION_SHELL_JS);
    assert.match(css.body, /@media\(max-width:820px\)/);
    assert.match(css.body, /prefers-reduced-motion/);
    assert.match(js.body, /dataMobileOpen|mobileOpen|mobile-open/i);
    assert.doesNotMatch(js.body, /\bfetch\s*\(|XMLHttpRequest|WebSocket/);
  });

  it("fails closed for anonymous identities and protects admin-only settings", async () => {
    const anonymous = await request("/operator", {
      resolve_identity: () => ANONYMOUS_IDENTITY,
    });
    const viewer = await request("/operator/settings", {
      resolve_identity: () => identity("viewer"),
    });
    const admin = await request("/operator/settings", {
      resolve_identity: () => identity("admin"),
    });
    assert.equal(anonymous.status, 401);
    assert.equal(viewer.status, 403);
    assert.equal(admin.status, 200);
    assert.match(anonymous.body, /Identidad requerida/);
    assert.match(viewer.body, /rol/);
    assert.match(admin.body, /Deployment preparation/);
  });

  it("limits role visibility without treating UI roles as authority", async () => {
    const viewer = await request("/operator", {
      resolve_identity: () => identity("viewer"),
    });
    const reviewer = await request("/operator", {
      resolve_identity: () => identity("reviewer"),
    });
    assert.doesNotMatch(viewer.body, /href="\/operator\/settings"/);
    assert.doesNotMatch(viewer.body, /href="\/operator\/operations\/arca"/);
    assert.match(reviewer.body, /href="\/operator\/review"/);
    assert.match(reviewer.body, /Sin autoridad operativa/);
  });

  it("keeps repository-current operational state fail-closed", () => {
    assert.deepEqual(REPOSITORY_CURRENT_BLOCKED_STATUS, {
      projection_id: "ai-134.repository-current-blocked-state.v1",
      scheduler: "inactive",
      ai_131_kill_switch: "active",
      ai_132_kill_switch: "active",
      ai_133_kill_switch: "active",
      activation: "none",
      production_run: "none",
      publication_authority: false,
      import_authority: false,
      deployment_authority: false,
      external_database_write_authority: false,
      vlatam_global_access: false,
      cost_visibility: "unavailable",
      recovery_required: "unavailable",
      evidence_paths: [
        "config/ai-131-controlled-live-arca-kill-switch.json",
        "config/ai-132-governed-arca-export-kill-switch.json",
        "config/ai-133-governed-arca-scheduler.json",
        "config/ai-133-governed-arca-scheduler-kill-switch.json",
      ],
    });
  });

  it("validates preview and production environment identity fail-closed", () => {
    const preview = validateApplicationEnvironment({
      AI_LAB_DEPLOYMENT_ENV: "preview",
      AI_LAB_PUBLIC_ORIGIN: "https://preview.example.test",
    });
    const production = validateApplicationEnvironment({
      AI_LAB_DEPLOYMENT_ENV: "production",
      AI_LAB_PUBLIC_ORIGIN: "http://lab.vlatamglobal.com",
    });
    assert.equal(preview.valid, true);
    assert.equal(preview.environment?.deployment_environment, "preview");
    assert.equal(production.valid, false);
    assert.ok(
      production.errors.includes(
        "production AI_LAB_PUBLIC_ORIGIN must use https",
      ),
    );
  });

  it("applies secure response headers", async () => {
    const result = await request("/operator", {
      resolve_identity: () => identity("viewer"),
      deployment_environment: "production",
    });
    for (const [name, value] of Object.entries(APPLICATION_SECURITY_HEADERS))
      assert.equal(result.headers[name], value, name);
    assert.match(
      result.headers["Content-Security-Policy"] ?? "",
      /connect-src 'none'/,
    );
    assert.match(
      result.headers["Strict-Transport-Security"] ?? "",
      /max-age=63072000/,
    );
  });
});

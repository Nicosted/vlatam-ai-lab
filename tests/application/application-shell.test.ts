import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, it } from "node:test";

import {
  ANONYMOUS_IDENTITY,
  type ApplicationIdentity,
} from "../../src/application/application-access.js";
import {
  APPLICATION_ROUTES,
  APPLICATION_SECTIONS,
  APPLICATION_SHELL_ASSET_PATHS,
  APPLICATION_SHELL_CSS,
  APPLICATION_SHELL_JS,
  statusToneFor,
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
  it("exposes six primary sections and keeps every route reachable", () => {
    assert.deepEqual(
      APPLICATION_SECTIONS.map((section) => section.label),
      [
        "Inicio",
        "Centro de misiones",
        "Revisiones",
        "Evidencia",
        "Modelos e integraciones",
        "Configuración",
      ],
    );
    for (const path of [
      "/operator",
      "/operator/estado",
      "/operator/blockers",
      "/operator/actions",
      "/operator/misiones",
      "/operator/operations/arca",
      "/operator/operations/acquisitions",
      "/operator/operations/exports",
      "/operator/operations/recovery",
      "/operator/revisiones",
      "/operator/review",
      "/operator/arca-review",
      "/operator/approved-artifacts",
      "/operator/governance",
      "/operator/evidence",
      "/operator/audit",
      "/operator/execution",
      "/operator/knowledge/regulations",
      "/operator/knowledge/sources",
      "/operator/knowledge/news",
      "/operator/modelos",
      "/operator/providers",
      "/operator/models/registry",
      "/operator/models/tournaments",
      "/operator/runtimes/ai-lab",
      "/operator/providers/openrouter",
      "/operator/runtimes/vercel-eve",
      "/operator/runtimes/cloudflare",
      "/operator/settings",
    ])
      assert.ok(
        APPLICATION_ROUTES.some((route) => route.path === path),
        path,
      );
    for (const route of APPLICATION_ROUTES)
      assert.ok(
        APPLICATION_SECTIONS.some((section) => section.id === route.section),
        route.path,
      );
  });

  it("keeps every registered route reachable from the rendered shell", async () => {
    const rendered = await Promise.all(
      APPLICATION_ROUTES.map(async (route) =>
        request(route.path, {
          resolve_identity: async () => identity("admin"),
        }),
      ),
    );
    const all = rendered.map((result) => result.body).join("\n");
    for (const result of rendered) assert.equal(result.status, 200);
    for (const route of APPLICATION_ROUTES)
      assert.ok(
        all.includes(`href="${route.path}"`),
        `${route.path} is not linked from any page`,
      );
  });

  it("keeps the sidebar short and moves detail routes into the section tab row", async () => {
    const home = await request("/operator", {
      resolve_identity: async () => identity("admin"),
    });
    const reviews = await request("/operator/revisiones", {
      resolve_identity: async () => identity("admin"),
    });
    const navItems = [...home.body.matchAll(/class="nav-item"/g)];
    assert.equal(navItems.length, APPLICATION_SECTIONS.length);
    assert.doesNotMatch(
      home.body,
      /class="workspace-tab"[^>]*"\/operator\/rev/,
    );
    assert.match(
      home.body,
      /class="workspace-tab"[^>]*href="\/operator\/estado"/,
    );
    assert.match(reviews.body, /class="workspace-tabs"/);
    assert.match(reviews.body, /href="\/operator\/review"/);
    assert.match(reviews.body, /href="\/operator\/arca-review"/);
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
        resolve_identity: async () => identity("admin"),
      });
      const state = await request("/operator/estado", {
        resolve_identity: async () => identity("admin"),
      });
      assert.equal(result.status, 200);
      assert.match(result.body, /class="sidebar"/);
      assert.match(result.body, /data-command-search/);
      assert.match(result.body, /environment-badge">LOCAL/);
      assert.match(result.body, /Sistema bloqueado/);
      assert.match(result.body, /Admin|Local admin/i);
      assert.match(result.body, /class="breadcrumbs"/);
      assert.match(result.body, /Procedencia de los datos/);
      assert.match(result.body, /<details class="provenance">/);
      assert.match(
        result.body,
        /Kill switches: <strong>AI-131\/132\/133 activos/,
      );
      assert.match(result.body, /Ejecución de modelos: <strong>No permitida/);
      assert.match(state.body, /AI-131 kill switch/);
      assert.match(state.body, /AI-132 kill switch/);
      assert.match(state.body, /AI-133 kill switch/);
      assert.match(state.body, /Ejecución en producción/);
      assert.match(state.body, /Acceso vlatam-global/);
      assert.match(state.body, /Visibilidad de costos/);
      assert.equal(networkCalls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("states the read-only authority boundary calmly on every section root", async () => {
    for (const path of [
      "/operator",
      "/operator/misiones",
      "/operator/revisiones",
      "/operator/evidence",
      "/operator/modelos",
      "/operator/settings",
    ]) {
      const result = await request(path, {
        resolve_identity: async () => identity("admin"),
      });
      assert.match(result.body, /Sin autoridad operativa/, path);
      assert.match(result.body, /Interfaz de lectura/, path);
      assert.match(result.body, /UI ≠ autoridad/, path);
      assert.match(result.body, /Sistema bloqueado/, path);
    }
    // The blocked boundary reads as status, not as an application failure.
    assert.doesNotMatch(APPLICATION_SHELL_CSS, /\.notice\{[^}]*var\(--red\)/);
    assert.doesNotMatch(APPLICATION_SHELL_CSS, /\.system-status\{[^}]*#efc9cc/);
  });

  it("maps the application root to the read-only mission center", async () => {
    const result = await request("/", {
      resolve_identity: async () => identity("viewer"),
    });
    assert.equal(result.handled, true);
    assert.equal(result.status, 200);
    assert.match(result.body, /<h2>Panel operativo<\/h2>/);
    assert.match(result.body, /href="\/operator" aria-current="page"/);
    for (const column of ["En curso", "Necesita atención", "Listo"])
      assert.match(result.body, new RegExp(column));
    assert.match(result.body, /class="board-layout"/);
    assert.match(result.body, /class="context-panel"/);
    assert.doesNotMatch(result.body, /<form\b/i);
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
      resolve_identity: async () => ANONYMOUS_IDENTITY,
    });
    const viewer = await request("/operator/settings", {
      resolve_identity: async () => identity("viewer"),
    });
    const admin = await request("/operator/settings", {
      resolve_identity: async () => identity("admin"),
    });
    assert.equal(anonymous.status, 401);
    assert.equal(viewer.status, 403);
    assert.equal(admin.status, 200);
    assert.match(anonymous.body, /Identidad requerida/);
    assert.match(viewer.body, /rol/);
    assert.match(admin.body, /Preparación de despliegue/);
  });

  it("limits role visibility without treating UI roles as authority", async () => {
    const viewer = await request("/operator", {
      resolve_identity: async () => identity("viewer"),
    });
    const reviewer = await request("/operator", {
      resolve_identity: async () => identity("reviewer"),
    });
    const viewerOperations = await request("/operator/operations/arca", {
      resolve_identity: async () => identity("viewer"),
    });
    const viewerReviews = await request("/operator/revisiones", {
      resolve_identity: async () => identity("viewer"),
    });
    assert.doesNotMatch(viewer.body, /href="\/operator\/settings"/);
    assert.doesNotMatch(viewer.body, /href="\/operator\/misiones"/);
    assert.doesNotMatch(viewer.body, /href="\/operator\/operations\/arca"/);
    assert.equal(viewerOperations.status, 403);
    assert.equal(viewerReviews.status, 403);
    assert.match(reviewer.body, /href="\/operator\/revisiones"/);
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
      AI_LAB_RUNTIME_MODE: "preview",
      AI_LAB_PUBLIC_ORIGIN: "https://preview.example.test",
      AI_LAB_IDENTITY_PROVIDER: "cloudflare_access",
      AI_LAB_CLOUDFLARE_ACCESS_ISSUER: "https://team.cloudflareaccess.com",
      AI_LAB_CLOUDFLARE_ACCESS_AUDIENCE: "test-audience",
      AI_LAB_IDENTITY_ROLE_BINDINGS:
        '{"admin":[],"reviewer":[],"operator":[],"viewer":[]}',
    });
    const production = validateApplicationEnvironment({
      AI_LAB_DEPLOYMENT_ENV: "production",
      AI_LAB_RUNTIME_MODE: "production",
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
      resolve_identity: async () => identity("viewer"),
      deployment_environment: "production",
      https_context: true,
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

  it("uses the shared secure HTML policy for success and error surfaces", async () => {
    const surfaces = [
      await request("/", { resolve_identity: async () => identity("viewer") }),
      await request("/operator/review", {
        resolve_identity: async () => identity("reviewer"),
      }),
      await request("/operator/arca-review", {
        resolve_identity: async () => identity("reviewer"),
      }),
      await request("/operator", {
        resolve_identity: async () => ANONYMOUS_IDENTITY,
      }),
      await request("/operator/settings", {
        resolve_identity: async () => identity("viewer"),
      }),
      await request("/operator/not-found", {
        resolve_identity: async () => identity("admin"),
      }),
    ];
    assert.deepEqual(
      surfaces.map((surface) => surface.status),
      [200, 200, 200, 401, 403, 404],
    );
    for (const surface of surfaces) {
      assert.equal(surface.headers["Content-Type"], "text/html; charset=utf-8");
      for (const [name, value] of Object.entries(APPLICATION_SECURITY_HEADERS))
        assert.equal(surface.headers[name], value, name);
      assert.match(
        surface.headers["Content-Security-Policy"] ?? "",
        /default-src 'none'.*style-src 'self' 'nonce-[^']+'.*script-src 'self' 'nonce-[^']+'.*connect-src 'none'/,
      );
    }
    assert.match(surfaces[5]!.body, /Vista no encontrada/);
  });

  it("omits HSTS outside Production HTTPS context", async () => {
    const productionHttp = await request("/operator", {
      resolve_identity: async () => identity("viewer"),
      deployment_environment: "production",
      https_context: false,
    });
    const previewHttps = await request("/operator", {
      resolve_identity: async () => identity("viewer"),
      deployment_environment: "preview",
      https_context: true,
    });
    assert.equal(
      productionHttp.headers["Strict-Transport-Security"],
      undefined,
    );
    assert.equal(previewHttps.headers["Strict-Transport-Security"], undefined);
  });

  it("uses the explicit semantic status-tone map", () => {
    for (const value of ["approved", "verified"])
      assert.equal(statusToneFor(value), "verified", value);
    for (const value of ["pending", "needs_review", "human_review"])
      assert.equal(statusToneFor(value), "pending", value);
    for (const value of ["blocked", "active", "critical", "rejected"])
      assert.equal(statusToneFor(value), "blocked", value);
    for (const value of ["healthy", "enabled", "available", "complete", "true"])
      assert.equal(statusToneFor(value), "neutral", value);
    assert.equal(statusToneFor("read_only"), "informational");
    assert.equal(statusToneFor("unreviewed-new-value"), "neutral");
  });
});

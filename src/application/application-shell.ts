import type {
  ApplicationIdentity,
  ApplicationRole,
} from "./application-access.js";
import { roleCanView } from "./application-access.js";
import type { DeploymentEnvironment } from "./deployment-environment.js";

export const APPLICATION_SECTION_IDS = [
  "inicio",
  "misiones",
  "revisiones",
  "evidencia",
  "modelos",
  "configuracion",
] as const;

export type ApplicationSectionId = (typeof APPLICATION_SECTION_IDS)[number];

/**
 * Primary navigation unit. The sidebar shows only these six sections; every
 * concrete route is reached from the section tab row inside the workspace.
 */
export interface ApplicationSection {
  readonly id: ApplicationSectionId;
  readonly label: string;
  readonly path: string;
  readonly short_label: string;
  readonly allowed_roles: readonly ApplicationRole[];
}

export interface ApplicationRoute {
  readonly label: string;
  readonly path: string;
  readonly section: ApplicationSectionId;
  /** Shown in the section tab row; false keeps a deep route out of the tabs. */
  readonly in_tabs: boolean;
  readonly allowed_roles: readonly ApplicationRole[];
}

const ALL_ROLES: readonly ApplicationRole[] = [
  "viewer",
  "operator",
  "reviewer",
  "admin",
];
const OPERATIONS_ROLES: readonly ApplicationRole[] = [
  "operator",
  "reviewer",
  "admin",
];
const REVIEW_ROLES: readonly ApplicationRole[] = [
  "operator",
  "reviewer",
  "admin",
];

export const STATUS_TONES = [
  "verified",
  "pending",
  "blocked",
  "neutral",
  "informational",
] as const;

export type StatusTone = (typeof STATUS_TONES)[number];

const STATUS_TONE_VALUES: Readonly<Record<StatusTone, readonly string[]>> = {
  verified: ["approved", "verified"],
  pending: [
    "pending",
    "pending_human_review",
    "needs_review",
    "human_review",
    "authorization_pending",
    "evidence_incomplete",
  ],
  blocked: [
    "blocked",
    "recovery_required",
    "active",
    "critical",
    "invalid_state",
    "rejected",
  ],
  neutral: [
    "unavailable",
    "absent",
    "unknown",
    "not_configured",
    "missing",
    "disabled",
    "healthy",
    "enabled",
    "available",
    "complete",
    "true",
    "false",
    "valid",
    "inactive",
    "none",
    "not_attempted",
    "not_invoked",
    "not_started",
    "no_policy_issued",
  ],
  informational: ["read_only", "selected", "informational"],
};

export function statusToneFor(value: unknown): StatusTone {
  const canonical = String(value ?? "")
    .trim()
    .toLowerCase();
  for (const tone of STATUS_TONES)
    if (STATUS_TONE_VALUES[tone].includes(canonical)) return tone;
  return "neutral";
}

export const APPLICATION_SECTIONS: readonly ApplicationSection[] =
  Object.freeze([
    {
      id: "inicio",
      label: "Inicio",
      path: "/operator",
      short_label: "IN",
      allowed_roles: ALL_ROLES,
    },
    {
      id: "misiones",
      label: "Centro de misiones",
      path: "/operator/misiones",
      short_label: "CM",
      allowed_roles: OPERATIONS_ROLES,
    },
    {
      id: "revisiones",
      label: "Revisiones",
      path: "/operator/revisiones",
      short_label: "RV",
      allowed_roles: REVIEW_ROLES,
    },
    {
      id: "evidencia",
      label: "Evidencia",
      path: "/operator/evidence",
      short_label: "EV",
      allowed_roles: ALL_ROLES,
    },
    {
      id: "modelos",
      label: "Modelos e integraciones",
      path: "/operator/modelos",
      short_label: "MI",
      allowed_roles: ALL_ROLES,
    },
    {
      id: "configuracion",
      label: "Configuración",
      path: "/operator/settings",
      short_label: "CF",
      allowed_roles: ["admin"],
    },
  ]);

export const APPLICATION_ROUTES: readonly ApplicationRoute[] = Object.freeze([
  {
    label: "Panel",
    path: "/operator",
    section: "inicio",
    in_tabs: true,
    allowed_roles: ALL_ROLES,
  },
  {
    label: "Estado del sistema",
    path: "/operator/estado",
    section: "inicio",
    in_tabs: true,
    allowed_roles: ALL_ROLES,
  },
  {
    label: "Bloqueos",
    path: "/operator/blockers",
    section: "inicio",
    in_tabs: true,
    allowed_roles: ALL_ROLES,
  },
  {
    label: "Acciones requeridas",
    path: "/operator/actions",
    section: "inicio",
    in_tabs: true,
    allowed_roles: ALL_ROLES,
  },
  {
    label: "Áreas operativas",
    path: "/operator/misiones",
    section: "misiones",
    in_tabs: true,
    allowed_roles: OPERATIONS_ROLES,
  },
  {
    label: "ARCA",
    path: "/operator/operations/arca",
    section: "misiones",
    in_tabs: true,
    allowed_roles: OPERATIONS_ROLES,
  },
  {
    label: "Adquisiciones",
    path: "/operator/operations/acquisitions",
    section: "misiones",
    in_tabs: true,
    allowed_roles: OPERATIONS_ROLES,
  },
  {
    label: "Exportaciones",
    path: "/operator/operations/exports",
    section: "misiones",
    in_tabs: true,
    allowed_roles: OPERATIONS_ROLES,
  },
  {
    label: "Recuperación",
    path: "/operator/operations/recovery",
    section: "misiones",
    in_tabs: true,
    allowed_roles: OPERATIONS_ROLES,
  },
  {
    label: "Pendientes",
    path: "/operator/revisiones",
    section: "revisiones",
    in_tabs: true,
    allowed_roles: REVIEW_ROLES,
  },
  {
    label: "Revisión humana",
    path: "/operator/review",
    section: "revisiones",
    in_tabs: true,
    allowed_roles: REVIEW_ROLES,
  },
  {
    label: "Revisión ARCA",
    path: "/operator/arca-review",
    section: "revisiones",
    in_tabs: true,
    allowed_roles: REVIEW_ROLES,
  },
  {
    label: "Artefactos aprobados",
    path: "/operator/approved-artifacts",
    section: "revisiones",
    in_tabs: true,
    allowed_roles: REVIEW_ROLES,
  },
  {
    label: "Gobernanza",
    path: "/operator/governance",
    section: "revisiones",
    in_tabs: true,
    allowed_roles: REVIEW_ROLES,
  },
  {
    label: "Referencias",
    path: "/operator/evidence",
    section: "evidencia",
    in_tabs: true,
    allowed_roles: ALL_ROLES,
  },
  {
    label: "Auditoría",
    path: "/operator/audit",
    section: "evidencia",
    in_tabs: true,
    allowed_roles: ALL_ROLES,
  },
  {
    label: "Ejecución",
    path: "/operator/execution",
    section: "evidencia",
    in_tabs: true,
    allowed_roles: ALL_ROLES,
  },
  {
    label: "Biblioteca ARCA",
    path: "/operator/arca-library",
    section: "evidencia",
    in_tabs: true,
    allowed_roles: ALL_ROLES,
  },
  {
    label: "Regulaciones",
    path: "/operator/knowledge/regulations",
    section: "evidencia",
    in_tabs: false,
    allowed_roles: ALL_ROLES,
  },
  {
    label: "Fuentes",
    path: "/operator/knowledge/sources",
    section: "evidencia",
    in_tabs: true,
    allowed_roles: ALL_ROLES,
  },
  {
    label: "Noticias",
    path: "/operator/knowledge/news",
    section: "evidencia",
    in_tabs: true,
    allowed_roles: ALL_ROLES,
  },
  {
    label: "Resumen",
    path: "/operator/modelos",
    section: "modelos",
    in_tabs: true,
    allowed_roles: ALL_ROLES,
  },
  {
    label: "Proveedores",
    path: "/operator/providers",
    section: "modelos",
    in_tabs: true,
    allowed_roles: ALL_ROLES,
  },
  {
    label: "Registro",
    path: "/operator/models/registry",
    section: "modelos",
    in_tabs: true,
    allowed_roles: ALL_ROLES,
  },
  {
    label: "Torneos",
    path: "/operator/models/tournaments",
    section: "modelos",
    in_tabs: true,
    allowed_roles: ALL_ROLES,
  },
  {
    label: "Entornos",
    path: "/operator/runtimes/ai-lab",
    section: "modelos",
    in_tabs: true,
    allowed_roles: ALL_ROLES,
  },
  {
    label: "OpenRouter",
    path: "/operator/providers/openrouter",
    section: "modelos",
    in_tabs: false,
    allowed_roles: ALL_ROLES,
  },
  {
    label: "Vercel Eve",
    path: "/operator/runtimes/vercel-eve",
    section: "modelos",
    in_tabs: false,
    allowed_roles: ALL_ROLES,
  },
  {
    label: "Cloudflare",
    path: "/operator/runtimes/cloudflare",
    section: "modelos",
    in_tabs: false,
    allowed_roles: ALL_ROLES,
  },
  {
    label: "General",
    path: "/operator/settings",
    section: "configuracion",
    in_tabs: true,
    allowed_roles: ["admin"],
  },
]);

const sectionById = (id: ApplicationSectionId): ApplicationSection =>
  APPLICATION_SECTIONS.find((section) => section.id === id)!;

export const APPLICATION_SHELL_ASSET_PATHS = Object.freeze({
  css: "/assets/ai-lab-shell.css",
  js: "/assets/ai-lab-shell.js",
});

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export function applicationRouteForPath(
  pathname: string,
): ApplicationRoute | null {
  return APPLICATION_ROUTES.find((route) => route.path === pathname) ?? null;
}

export function applicationSectionForPath(
  pathname: string,
): ApplicationSection | null {
  const route = applicationRouteForPath(pathname);
  return route === null ? null : sectionById(route.section);
}

const navigation = (
  identity: ApplicationIdentity,
  pathname: string,
): string => {
  const active = applicationSectionForPath(pathname);
  return `<div class="nav-group">${APPLICATION_SECTIONS.filter((section) =>
    roleCanView(identity.role, section.allowed_roles),
  )
    .map(
      (section) =>
        `<a class="nav-item" data-shell-route href="${section.path}"${active?.id === section.id ? ' aria-current="page"' : ""}><span class="nav-code" aria-hidden="true">${section.short_label}</span><span class="nav-label">${escapeHtml(section.label)}</span></a>`,
    )
    .join("")}</div>`;
};

/**
 * Secondary navigation for the active section. Progressive disclosure: only
 * the current section's routes are exposed, filtered by the same role rules
 * that authorize the request.
 */
const sectionTabs = (
  identity: ApplicationIdentity,
  pathname: string,
): string => {
  const section = applicationSectionForPath(pathname);
  if (section === null) return "";
  const tabs = APPLICATION_ROUTES.filter(
    (route) =>
      route.section === section.id &&
      route.in_tabs &&
      roleCanView(identity.role, route.allowed_roles),
  );
  if (tabs.length < 2) return "";
  return `<nav class="workspace-tabs" aria-label="${escapeHtml(section.label)}">${tabs
    .map(
      (route) =>
        `<a class="workspace-tab" data-shell-route href="${route.path}"${pathname === route.path ? ' aria-current="page"' : ""}>${escapeHtml(route.label)}</a>`,
    )
    .join("")}</nav>`;
};

function breadcrumb(pathname: string): string {
  const route = applicationRouteForPath(pathname);
  const section = applicationSectionForPath(pathname);
  const trail =
    section === null
      ? `<span aria-current="page">Vista</span>`
      : route !== null && route.path === section.path
        ? `<span aria-current="page">${escapeHtml(section.label)}</span>`
        : `<span>${escapeHtml(section.label)}</span><span aria-hidden="true">/</span><span aria-current="page">${escapeHtml(route?.label ?? "Vista")}</span>`;
  return `<nav class="breadcrumbs" aria-label="Migas de pan"><a href="/operator">AI LAB</a><span aria-hidden="true">/</span>${trail}</nav>`;
}

const environmentLabel = (environment: DeploymentEnvironment): string =>
  environment === "production"
    ? "PRODUCCIÓN"
    : environment === "preview"
      ? "VISTA PREVIA"
      : "LOCAL";

const roleLabel = (role: ApplicationRole): string =>
  (
    ({
      viewer: "LECTOR",
      operator: "OPERADOR",
      reviewer: "REVISOR",
      admin: "ADMIN",
    }) as const
  )[role];

const governedStatusLabel = (status: string): string =>
  (
    ({
      blocked: "Bloqueado",
      healthy: "Operativo",
      invalid_state: "Estado inválido",
    }) as const
  )[status as "blocked" | "healthy" | "invalid_state"] ?? "Estado desconocido";

export interface ApplicationShellOptions {
  readonly pathname: string;
  readonly identity: ApplicationIdentity;
  readonly deployment_environment: DeploymentEnvironment;
  readonly evaluated_at: string;
  readonly read_model_hash: string;
  readonly overall_status: string;
  readonly content: string;
  readonly title?: string;
}

export function renderApplicationShell(
  options: ApplicationShellOptions,
): string {
  const title =
    options.title ??
    `${applicationRouteForPath(options.pathname)?.label ?? "AI LAB"} — AI LAB`;
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="theme-color" content="#080b10">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${APPLICATION_SHELL_ASSET_PATHS.css}">
  <script src="${APPLICATION_SHELL_ASSET_PATHS.js}" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">Saltar al contenido principal</a>
  <div class="app-shell" data-shell>
    <aside class="sidebar" id="primary-navigation" data-mobile-drawer aria-hidden="true" inert aria-label="Navegación principal">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">VL</span>
        <div class="brand-copy"><strong>AI LAB</strong><span>OPERACIONES</span></div>
        <button class="icon-button sidebar-collapse" type="button" data-sidebar-toggle aria-controls="primary-navigation" aria-expanded="true" aria-label="Contraer navegación">‹</button>
        <button class="icon-button mobile-drawer-close" type="button" data-mobile-close aria-controls="primary-navigation" aria-label="Cerrar navegación">×</button>
      </div>
      <nav class="side-nav" aria-label="AI LAB">${navigation(options.identity, options.pathname)}</nav>
      <div class="boundary-note">
        <span class="signal signal-red" aria-hidden="true"></span>
        <div><strong>Sin autoridad operativa</strong><span>Interfaz de lectura · Ejecución no permitida</span></div>
      </div>
    </aside>
    <div class="shell-main">
      <header class="topbar">
        <button class="icon-button mobile-menu" type="button" data-mobile-toggle aria-controls="primary-navigation" aria-expanded="false" aria-label="Abrir navegación">☰</button>
        <div class="command" role="search">
          <span aria-hidden="true">⌕</span>
          <label class="sr-only" for="command-search">Buscar navegación</label>
          <input id="command-search" data-command-search type="search" autocomplete="off" placeholder="Buscar una sección o una misión…" aria-describedby="command-help">
          <kbd>⌘ K</kbd>
          <span class="sr-only" id="command-help">Filtra las secciones y las misiones visibles; no realiza solicitudes externas.</span>
        </div>
        <div class="top-status">
          <span class="environment-badge">${environmentLabel(options.deployment_environment)}</span>
          <span class="system-status"><span class="signal signal-red" aria-hidden="true"></span>Sistema bloqueado</span>
          <div class="identity">
            <span class="avatar" aria-hidden="true">${escapeHtml(options.identity.display_name.slice(0, 2).toUpperCase())}</span>
            <span><strong>${escapeHtml(options.identity.display_name)}</strong><small>${roleLabel(options.identity.role)} · CONTEXTO DE INTERFAZ</small></span>
          </div>
        </div>
      </header>
      <div class="context-bar">
        ${breadcrumb(options.pathname)}
        <details class="provenance"><summary>Procedencia de los datos</summary><dl><dt>Evaluado</dt><dd>${escapeHtml(options.evaluated_at)}</dd><dt>Hash del modelo de lectura</dt><dd><code>${escapeHtml(options.read_model_hash)}</code></dd><dt>Estado canónico</dt><dd><code>${escapeHtml(options.overall_status)}</code></dd></dl></details>
        <div class="mobile-context" aria-label="Contexto operativo">
          <span class="environment-badge">${environmentLabel(options.deployment_environment)}</span>
          <span class="system-status"><span class="signal signal-red" aria-hidden="true"></span>Sistema bloqueado</span>
          <span class="mobile-identity">${escapeHtml(options.identity.display_name)} · ${roleLabel(options.identity.role)}</span>
          <span class="mobile-boundary">Interruptores de seguridad AI-131/132/133 activos · solo lectura</span>
        </div>
      </div>
      ${sectionTabs(options.identity, options.pathname)}
      <main id="main" tabindex="-1">${options.content}</main>
      <footer class="shell-footer"><span>AI LAB · estado actual del repositorio</span><span>Estado gobernado: ${governedStatusLabel(options.overall_status)}</span><span>INTERFAZ ≠ AUTORIDAD</span></footer>
    </div>
    <button class="mobile-scrim" type="button" data-mobile-scrim aria-label="Cerrar navegación"></button>
  </div>
</body>
</html>`;
}

export const APPLICATION_SHELL_CSS = String.raw`
:root{color-scheme:dark;--bg:#080b10;--panel:#0f141c;--panel-2:#141a23;--panel-3:#19212c;--line:#26303d;--line-soft:#1d2631;--text:#eef4fb;--muted:#8d9bad;--muted-2:#667487;--cyan:#21c7e8;--blue:#478cff;--green:#38c884;--amber:#e4aa45;--red:#f05d68;--focus:#7ddfff;--sidebar:248px;--radius:8px;--shadow:0 18px 50px rgba(0,0,0,.25)}
*{box-sizing:border-box}html{background:var(--bg)}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button,input,select{font:inherit}a{color:inherit}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.skip-link{position:fixed;left:16px;top:-80px;background:var(--cyan);color:#021014;padding:10px 14px;border-radius:6px;font-weight:800;z-index:100}.skip-link:focus{top:12px}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.app-shell{min-height:100vh;display:grid;grid-template-columns:var(--sidebar) minmax(0,1fr)}.sidebar{position:sticky;inset-block-start:0;height:100vh;background:#0a0e14;border-right:1px solid var(--line-soft);display:flex;flex-direction:column;z-index:30;transition:width .18s ease}.brand{height:66px;border-bottom:1px solid var(--line-soft);display:flex;align-items:center;gap:10px;padding:0 12px}.brand-mark{width:32px;height:32px;display:grid;place-items:center;border:1px solid #315b68;background:#0c2229;color:var(--cyan);border-radius:6px;font:800 11px/1 ui-monospace,monospace;letter-spacing:.08em}.brand-copy{display:flex;flex-direction:column;min-width:0}.brand-copy strong{font-size:13px;letter-spacing:.16em}.brand-copy span{font:9px/1.4 ui-monospace,monospace;letter-spacing:.18em;color:var(--muted)}.icon-button{border:1px solid var(--line);background:var(--panel-2);color:var(--muted);border-radius:6px;width:34px;height:34px;cursor:pointer}.sidebar-collapse{margin-left:auto}.mobile-drawer-close{display:none;margin-left:auto}.side-nav{overflow:auto;padding:12px 9px;flex:1}.nav-group+.nav-group{margin-top:15px}.nav-group-label{margin:0 10px 5px;color:var(--muted-2);font:700 9px/1.4 ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase}.nav-item{min-height:36px;display:flex;align-items:center;gap:10px;padding:6px 9px;border-radius:6px;text-decoration:none;color:#aab6c6;border:1px solid transparent}.nav-item:hover{background:var(--panel-2);color:var(--text)}.nav-item[aria-current=page]{background:#10242d;color:#dffaff;border-color:#1e5260;box-shadow:inset 2px 0 var(--cyan)}.nav-code{width:25px;color:var(--muted-2);font:700 9px/1 ui-monospace,monospace;letter-spacing:.05em}.nav-item[aria-current=page] .nav-code{color:var(--cyan)}.nav-label{white-space:nowrap}.boundary-note{margin:10px;padding:11px;border:1px solid var(--line-soft);background:var(--panel);border-radius:7px;display:flex;gap:9px;align-items:flex-start}.boundary-note div{display:flex;flex-direction:column}.boundary-note strong{font-size:11px;color:var(--text)}.boundary-note span:last-child{font-size:10px;color:var(--muted)}.signal{width:7px;height:7px;border-radius:50%;display:inline-block;flex:0 0 auto;margin-top:6px}.signal-red{background:var(--red);box-shadow:0 0 0 3px rgba(240,93,104,.12)}
.shell-main{min-width:0;display:flex;flex-direction:column;min-height:100vh}.topbar{height:66px;display:flex;align-items:center;gap:14px;padding:0 20px;border-bottom:1px solid var(--line-soft);background:rgba(8,11,16,.94);position:sticky;top:0;z-index:20;backdrop-filter:blur(12px)}.mobile-menu{display:none}.command{height:38px;max-width:520px;min-width:240px;flex:1;display:flex;align-items:center;gap:9px;padding:0 11px;background:var(--panel);border:1px solid var(--line);border-radius:7px;color:var(--muted)}.command:focus-within{border-color:#376b78;box-shadow:0 0 0 3px rgba(33,199,232,.08)}.command input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:var(--text)}.command input::placeholder{color:var(--muted-2)}kbd{border:1px solid var(--line);background:var(--panel-2);border-radius:4px;padding:2px 6px;color:var(--muted);font:10px/1.4 ui-monospace,monospace}.top-status{margin-left:auto;display:flex;align-items:center;gap:14px}.environment-badge{border:1px solid #2f6170;background:#0d252d;color:var(--cyan);border-radius:999px;padding:3px 8px;font:700 9px/1.4 ui-monospace,monospace;letter-spacing:.12em}.system-status{display:flex;align-items:center;gap:7px;color:var(--muted);font-size:11px}.identity{display:flex;align-items:center;gap:8px;padding-left:14px;border-left:1px solid var(--line)}.avatar{width:30px;height:30px;display:grid;place-items:center;background:#17283a;border:1px solid #29445f;border-radius:50%;color:#badeff;font:700 10px/1 ui-monospace,monospace}.identity>span:last-child{display:flex;flex-direction:column}.identity strong{font-size:11px}.identity small{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}.context-bar{min-height:42px;padding:0 22px;border-bottom:1px solid var(--line-soft);display:flex;align-items:center;justify-content:space-between;gap:18px;background:#0b0f15}.breadcrumbs{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:11px}.breadcrumbs a{color:var(--cyan);text-decoration:none}.provenance{position:relative;color:var(--muted-2);font-size:11px}.provenance summary{cursor:pointer;list-style:none;padding:3px 0}.provenance summary::-webkit-details-marker{display:none}.provenance summary::before{content:"›";display:inline-block;margin-right:6px;transition:transform .15s ease}.provenance[open] summary::before{transform:rotate(90deg)}.provenance summary:hover{color:var(--muted)}.provenance dl{position:absolute;right:0;top:100%;z-index:15;min-width:min(360px,80vw);margin-top:6px;padding:11px 13px;grid-template-columns:1fr;gap:3px;background:var(--panel);border:1px solid var(--line-soft);border-radius:var(--radius);box-shadow:var(--shadow)}.provenance dd{margin-bottom:6px}.provenance dd:last-child{margin-bottom:0}
main{width:100%;max-width:1500px;margin:0 auto;padding:24px 26px 36px}h2{margin:0;color:var(--text);font-size:22px;line-height:1.2;letter-spacing:-.02em}h3{margin:0 0 10px;font-size:13px;letter-spacing:.01em}h4{margin:0 0 8px;color:#c4cfdd;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.lead{margin:6px 0 20px;color:var(--muted);max-width:850px}.page-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:20px}.eyebrow{display:block;margin-bottom:6px;color:var(--cyan);font:700 9px/1.4 ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase}.page-meta{font:10px/1.5 ui-monospace,monospace;color:var(--muted)}
.notice{border:1px solid var(--line-soft);border-left:3px solid var(--muted-2);background:var(--panel);padding:13px 14px;margin:0 0 16px;border-radius:var(--radius);color:var(--muted)}.notice strong{color:var(--text)}.grid-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px}.grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.card,.metric{background:var(--panel);border:1px solid var(--line-soft);border-radius:var(--radius);box-shadow:0 1px 0 rgba(255,255,255,.02)}.card{padding:15px;margin-bottom:12px;min-width:0}.grid2>.card,.grid3>.card{margin-bottom:0}.metric{padding:13px;min-height:84px;display:flex;flex-direction:column;justify-content:space-between}.metric>span:first-child{color:var(--muted);font:700 9px/1.4 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em}.metric strong{font-size:17px;line-height:1.25;overflow-wrap:break-word}.metric small{color:var(--muted);font-size:10px}.badge{display:inline-flex;align-items:center;border:1px solid currentColor;border-radius:999px;padding:2px 7px;font-size:10px;font-weight:700;line-height:1.4}.tone-blocked{color:#ff8c95;background:#211217}.tone-pending{color:#f0c36d;background:#211c12}.tone-verified{color:#73dfa9;background:#102019}.tone-neutral{color:#aab6c6;background:#161c24}.tone-informational{color:#8ecbff;background:#102033}.severity-critical,.severity-high{color:#ff8c95;background:#211217}.severity-medium{color:#f0c36d;background:#211c12}.severity-low{color:#aab6c6;background:#161c24}.untranslated,.quiet{color:var(--muted);font-size:11px}dl{display:grid;grid-template-columns:minmax(140px,.8fr) minmax(0,1.3fr);gap:7px 18px;margin:0}dt{color:var(--muted);font-size:11px}dd{margin:0;min-width:0;overflow-wrap:break-word}code{font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#b8d6ee;overflow-wrap:break-word}.code-block{display:block;margin:7px 0 0;padding:9px 11px;background:#090d12;border:1px solid var(--line-soft);border-radius:5px;overflow-x:auto;white-space:pre;user-select:text}.code-block code{overflow-wrap:normal;white-space:pre}details.tech{margin-top:8px}details.tech summary{cursor:pointer;color:var(--muted);font-size:11px}.filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.filters label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}select{display:block;margin-top:4px;padding:6px 9px;background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:5px}.library-search{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:12px;margin-bottom:16px}.library-search label{color:var(--muted);font-size:11px}.library-search input{display:block;width:100%;margin-top:5px;padding:9px 11px;background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:5px}.library-search output{color:var(--muted);font-size:11px}.library-empty{margin-bottom:16px}.library-detail{margin-top:14px;border-top:1px solid var(--line-soft);padding-top:12px}.library-detail summary{cursor:pointer;color:var(--cyan);font-weight:700}.library-detail>div{margin-top:12px}ol.records{list-style:none;margin:0;padding:0;counter-reset:record}ol.records>li{counter-increment:record}ol.records h3::before{content:counter(record) ". ";color:var(--muted)}.chain{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:7px;margin-bottom:14px}.stage{background:var(--panel);border:1px solid var(--line-soft);padding:11px;text-align:center;min-width:0;border-radius:6px}.stage p{font-size:10px;color:var(--muted);margin:7px 0 0}.stage:not(:last-child)::after{content:"→";float:right;margin-right:-17px;color:var(--muted-2)}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--line-soft);padding:8px}th{color:var(--muted);font-size:11px}ul{padding-left:18px}.status-list{list-style:none;padding:0;margin:0}.status-list li{display:flex;justify-content:space-between;gap:14px;padding:9px 0;border-bottom:1px solid var(--line-soft)}.status-list li:last-child{border-bottom:0}.status-list span:first-child{color:var(--muted)}.panel-kicker{color:var(--muted-2);font:700 9px/1.4 ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase}.arca-summary-metrics .metric{min-height:68px}.arca-governance-note{margin-bottom:16px}.arca-governance-note p{margin:5px 0 0}.arca-regulation-grid{align-items:stretch}.arca-regulation-card{display:flex;flex-direction:column;min-width:0}.arca-regulation-card__header{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:12px;min-height:126px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--line-soft)}.arca-field-label{display:block;margin-bottom:3px;color:var(--muted);font-size:10px}.arca-regulation-card__identifier{margin:0 0 11px;color:var(--text);font-size:20px;line-height:1.15;letter-spacing:-.01em}.arca-regulation-card__title{margin:0;color:#cbd6e3;font-size:14px;font-weight:650;line-height:1.4}.arca-regulation-card__status{justify-self:end;white-space:nowrap}.arca-regulation-card dl{grid-template-columns:minmax(122px,.75fr) minmax(0,1.25fr);align-content:start}.arca-regulation-card details.tech{margin-top:16px;padding-top:12px;border-top:1px solid var(--line-soft)}.arca-regulation-card__disclaimer{margin:auto 0 0;padding-top:14px}.official-source-links{display:flex;flex-wrap:wrap;gap:7px}.official-source-link{display:inline-flex;align-items:center;min-height:34px;padding:5px 9px;border:1px solid var(--line);border-radius:5px;color:var(--cyan);text-decoration:none}.official-source-link:hover{border-color:var(--cyan)}.shell-footer{margin-top:auto;min-height:42px;border-top:1px solid var(--line-soft);display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 24px;color:var(--muted-2);font:9px/1.4 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em}.mobile-scrim{display:none}.mobile-context{display:none}
.workspace-tabs{display:flex;gap:4px;align-items:center;overflow-x:auto;padding:8px 22px 0;border-bottom:1px solid var(--line-soft);background:#0b0f15;scrollbar-width:thin}.workspace-tab{white-space:nowrap;padding:8px 12px;border-radius:6px 6px 0 0;border:1px solid transparent;border-bottom:0;text-decoration:none;color:var(--muted);font-size:12px;position:relative;top:1px}.workspace-tab:hover{color:var(--text);background:var(--panel-2)}.workspace-tab[aria-current=page]{color:#dffaff;background:var(--panel);border-color:var(--line-soft);box-shadow:inset 0 2px var(--cyan)}
.state-strip{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}.state-chip{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line-soft);background:var(--panel);border-radius:999px;padding:5px 12px;color:var(--muted);font-size:11px}.state-chip strong{color:var(--text);font-weight:600}
.board-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,320px);gap:16px;align-items:start}.board{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.board-column{background:var(--panel);border:1px solid var(--line-soft);border-radius:var(--radius);padding:12px;min-width:0}.board-column-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}.board-column-head h3{margin:0;font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:#c4cfdd}.column-count{border:1px solid var(--line);border-radius:999px;padding:1px 8px;color:var(--muted);font:700 10px/1.6 ui-monospace,monospace}.board-column[data-column=necesita_atencion] .board-column-head h3{color:#ffbfc4}.board-column[data-column=listo] .board-column-head h3{color:#a6e6c6}
.mission-card{display:block;width:100%;text-align:left;background:var(--panel-2);border:1px solid var(--line-soft);border-left:3px solid var(--line);border-radius:7px;padding:11px;color:inherit;cursor:pointer}.mission-card+.mission-card{margin-top:8px}.mission-card:hover{border-color:var(--line);background:var(--panel-3)}.mission-card[aria-pressed=true]{background:#10242d;border-color:#1e5260;border-left-color:var(--cyan)}.mission-card-title{display:block;margin-bottom:5px;font-size:13px;font-weight:700;line-height:1.35}.mission-card-summary{display:block;margin-bottom:8px;color:var(--muted);font-size:11px;line-height:1.5}.mission-card-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.board-empty{margin:0;padding:16px 13px;border:1px dashed var(--line-soft);border-radius:7px;color:var(--muted);font-size:11px;line-height:1.6}.board-empty strong{display:block;margin-bottom:4px;color:#c4cfdd;font-size:12px}
.context-panel{position:sticky;top:88px;background:var(--panel);border:1px solid var(--line-soft);border-radius:var(--radius);padding:15px}.context-panel h3{margin:0 0 4px;font-size:14px}.context-panel .panel-kicker{display:block;margin-bottom:8px}.context-panel dl{grid-template-columns:minmax(96px,.7fr) minmax(0,1fr)}.context-panel .panel-actions{margin:12px 0 0}.context-panel .panel-actions a{color:var(--cyan);font-size:12px}
.app-shell[data-collapsed=true]{--sidebar:70px}.app-shell[data-collapsed=true] .brand-copy,.app-shell[data-collapsed=true] .nav-label,.app-shell[data-collapsed=true] .nav-group-label,.app-shell[data-collapsed=true] .boundary-note div{display:none}.app-shell[data-collapsed=true] .brand{justify-content:center;padding:0 8px;flex-wrap:wrap}.app-shell[data-collapsed=true] .sidebar-collapse{position:absolute;right:-14px;top:16px}.app-shell[data-collapsed=true] .nav-item{justify-content:center}.app-shell[data-collapsed=true] .nav-code{width:auto}.app-shell[data-collapsed=true] .boundary-note{justify-content:center}
@media(max-width:1180px){.board-layout{grid-template-columns:minmax(0,1fr)}.context-panel{position:static}}
@media(max-width:1120px){.grid-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.arca-regulation-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.board{grid-template-columns:1fr}.top-status .system-status{display:none}.chain{grid-template-columns:1fr}.stage:not(:last-child)::after{content:"↓";float:none;display:block;margin:8px 0 -13px}}
@media(max-width:820px){body.mobile-drawer-open{overflow:hidden}.app-shell{display:block}.sidebar{position:fixed;left:0;top:0;width:min(86vw,300px);transform:translateX(-102%);box-shadow:var(--shadow);transition:transform .18s ease}.app-shell[data-mobile-open=true] .sidebar{transform:translateX(0)}.sidebar-collapse{display:none}.mobile-drawer-close{display:inline-grid;place-items:center}.mobile-menu{display:inline-grid;place-items:center;flex:0 0 auto}.topbar{padding:0 12px}.command{min-width:0}.command kbd{display:none}.top-status{display:none}.context-bar{padding:8px 14px;align-items:flex-start;flex-wrap:wrap}.provenance dl{right:auto;left:0}.mobile-context{width:100%;display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:var(--muted);font-size:10px}.mobile-identity{color:#cbd6e3}.mobile-boundary{width:100%;color:var(--muted)}.workspace-tabs{padding:8px 12px 0}.mobile-scrim{position:fixed;inset:0;border:0;background:rgba(0,0,0,.58);z-index:25}.app-shell[data-mobile-open=true] .mobile-scrim{display:block}main{padding:20px 14px 30px}.grid2,.grid3{grid-template-columns:1fr}.arca-regulation-grid{grid-template-columns:1fr}.arca-regulation-card__header{grid-template-columns:1fr;min-height:0}.arca-regulation-card__status{justify-self:start}.shell-footer{padding:10px 14px;flex-wrap:wrap}}
@media(max-width:540px){.command{font-size:12px}.grid-metrics{grid-template-columns:1fr}.context-bar{flex-direction:column;gap:5px}.breadcrumbs{flex-wrap:wrap}.page-heading{display:block}.page-meta{margin-top:8px}.shell-footer span:nth-child(2){display:none}dl,.arca-regulation-card dl{grid-template-columns:1fr}dd{margin-bottom:5px}.status-list li{align-items:flex-start;flex-direction:column;gap:4px}.official-source-link{width:100%}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition-duration:.01ms!important;animation-duration:.01ms!important;animation-iteration-count:1!important}}
`;

export const APPLICATION_SHELL_JS = String.raw`
(function(){
  var shell=document.querySelector("[data-shell]");
  if(!shell)return;
  var drawer=document.querySelector("[data-mobile-drawer]");
  var sidebarToggle=document.querySelector("[data-sidebar-toggle]");
  var mobileToggle=document.querySelector("[data-mobile-toggle]");
  var mobileClose=document.querySelector("[data-mobile-close]");
  var scrim=document.querySelector("[data-mobile-scrim]");
  var search=document.querySelector("[data-command-search]");
  var mobileMedia=window.matchMedia("(max-width:820px)");
  var mobileOpen=false;
  var returnFocus=null;
  function drawerFocusables(){
    return drawer?Array.prototype.slice.call(drawer.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(function(item){return !item.hidden}):[];
  }
  function syncDrawerState(open,restoreFocus){
    mobileOpen=mobileMedia.matches&&open;
    shell.dataset.mobileOpen=String(mobileOpen);
    if(mobileToggle)mobileToggle.setAttribute("aria-expanded",String(mobileOpen));
    if(drawer){
      drawer.setAttribute("aria-hidden",String(mobileMedia.matches&&!mobileOpen));
      drawer.inert=mobileMedia.matches&&!mobileOpen;
    }
    document.body.classList.toggle("mobile-drawer-open",mobileOpen);
    if(mobileOpen){
      returnFocus=document.activeElement||mobileToggle;
      var focusables=drawerFocusables();
      if(focusables.length)focusables[0].focus();
    }else{
      if(restoreFocus&&returnFocus&&typeof returnFocus.focus==="function")returnFocus.focus();
      returnFocus=null;
    }
  }
  function setMobile(open,restoreFocus){
    syncDrawerState(open,restoreFocus!==false);
  }
  if(sidebarToggle)sidebarToggle.addEventListener("click",function(){
    var collapsed=shell.dataset.collapsed!=="true";
    shell.dataset.collapsed=String(collapsed);
    sidebarToggle.setAttribute("aria-expanded",String(!collapsed));
    sidebarToggle.setAttribute("aria-label",collapsed?"Expandir navegación":"Contraer navegación");
    sidebarToggle.textContent=collapsed?"›":"‹";
  });
  if(mobileToggle)mobileToggle.addEventListener("click",function(){setMobile(!mobileOpen)});
  if(mobileClose)mobileClose.addEventListener("click",function(){setMobile(false)});
  if(scrim)scrim.addEventListener("click",function(){setMobile(false)});
  var shellRoutes=Array.prototype.slice.call(document.querySelectorAll("[data-shell-route]"));
  shellRoutes.forEach(function(route){route.addEventListener("click",function(){if(mobileOpen)setMobile(false)})});
  document.addEventListener("keydown",function(event){
    if(event.key==="Escape"&&mobileOpen){event.preventDefault();setMobile(false);return}
    if(event.key==="Tab"&&mobileOpen){
      var focusables=drawerFocusables();
      if(!focusables.length){event.preventDefault();return}
      var first=focusables[0],last=focusables[focusables.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    }
  });
  function syncResponsiveMode(){syncDrawerState(false,false)}
  if(typeof mobileMedia.addEventListener==="function")mobileMedia.addEventListener("change",syncResponsiveMode);
  syncResponsiveMode();
  var missionCards=Array.prototype.slice.call(document.querySelectorAll("[data-mission-card]"));
  var missionPanels=Array.prototype.slice.call(document.querySelectorAll("[data-mission-panel]"));
  var columnCounts=Array.prototype.slice.call(document.querySelectorAll("[data-column-count]"));
  var columnEmpties=Array.prototype.slice.call(document.querySelectorAll("[data-column-empty]"));
  function selectMission(id){
    missionCards.forEach(function(card){card.setAttribute("aria-pressed",String(!!id&&card.dataset.mission===id))});
    missionPanels.forEach(function(panel){panel.hidden=(panel.dataset.missionPanel||"")!==(id||"")});
  }
  missionCards.forEach(function(card){
    card.addEventListener("click",function(){selectMission(card.dataset.mission)});
  });
  function syncColumnCounts(){
    columnCounts.forEach(function(counter){
      var column=counter.dataset.columnCount;
      var visible=missionCards.filter(function(card){return card.dataset.column===column&&!card.hidden});
      counter.textContent=String(visible.length);
      columnEmpties.forEach(function(empty){
        if(empty.dataset.columnEmpty===column&&missionCards.some(function(card){return card.dataset.column===column}))empty.hidden=visible.length>0;
      });
    });
    var selected=missionCards.filter(function(card){return card.getAttribute("aria-pressed")==="true"})[0];
    if(selected&&selected.hidden)selectMission("");
  }
  if(search){
    search.addEventListener("input",function(){
      var term=String(search.value||"").trim().toLowerCase();
      var matches=function(node){return term.length===0||String(node.textContent||"").toLowerCase().includes(term)};
      if(missionCards.length){
        missionCards.forEach(function(card){card.hidden=!matches(card)});
        syncColumnCounts();
      }else{
        shellRoutes.forEach(function(route){route.hidden=!matches(route)});
      }
    });
    search.addEventListener("keydown",function(event){
      if(event.key==="Escape"){search.value="";search.dispatchEvent(new Event("input"));search.blur()}
      if(event.key==="Enter"){var pool=missionCards.length?missionCards:shellRoutes;var target=pool.find(function(node){return !node.hidden});if(target)target.click()}
    });
    document.addEventListener("keydown",function(event){
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){event.preventDefault();search.focus()}
    });
  }
  var filterSelects=Array.prototype.slice.call(document.querySelectorAll("[data-filter]"));
  if(filterSelects.length){
    var filterItems=Array.prototype.slice.call(document.querySelectorAll("[data-blocker]"));
    var filterCount=document.getElementById("blocker-count");
    function applyFilters(){
      var active={};
      filterSelects.forEach(function(select){if(select.value)active[select.dataset.filter]=select.value});
      var visible=0;
      filterItems.forEach(function(item){
        var hide=Object.keys(active).some(function(key){return String(item.dataset[key]||"").split(" ").indexOf(active[key])===-1});
        item.hidden=hide;
        if(!hide)visible+=1;
      });
      if(filterCount)filterCount.textContent="Mostrando "+visible+" de "+filterItems.length+" bloqueos";
    }
    filterSelects.forEach(function(select){select.addEventListener("change",applyFilters)});
  }
  var librarySearch=document.querySelector("[data-arca-library-search]");
  if(librarySearch){
    var libraryItems=Array.prototype.slice.call(document.querySelectorAll("[data-arca-library-item]"));
    var libraryCount=document.getElementById("arca-library-count");
    var libraryEmpty=document.querySelector("[data-arca-library-empty]");
    function applyLibrarySearch(){
      var term=String(librarySearch.value||"").trim().toLowerCase();
      var visible=0;
      libraryItems.forEach(function(item){
        var searchable=String(item.dataset.search||"").toLowerCase();
        item.hidden=term.length>0&&!searchable.includes(term);
        if(!item.hidden)visible+=1;
      });
      if(libraryCount)libraryCount.textContent=visible+" de "+libraryItems.length+" normas";
      if(libraryEmpty)libraryEmpty.hidden=visible>0;
    }
    librarySearch.addEventListener("input",applyLibrarySearch);
    applyLibrarySearch();
  }
})();
`;

import type {
  ApplicationIdentity,
  ApplicationRole,
} from "./application-access.js";
import { roleCanView } from "./application-access.js";
import type { DeploymentEnvironment } from "./deployment-environment.js";

export interface ApplicationRoute {
  readonly label: string;
  readonly path: string;
  readonly group: string | null;
  readonly short_label: string;
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

export const APPLICATION_ROUTES: readonly ApplicationRoute[] = Object.freeze([
  {
    label: "Overview",
    path: "/operator",
    group: null,
    short_label: "OV",
    allowed_roles: ALL_ROLES,
  },
  {
    label: "ARCA",
    path: "/operator/operations/arca",
    group: "Operations",
    short_label: "AR",
    allowed_roles: OPERATIONS_ROLES,
  },
  {
    label: "Acquisitions",
    path: "/operator/operations/acquisitions",
    group: "Operations",
    short_label: "AC",
    allowed_roles: OPERATIONS_ROLES,
  },
  {
    label: "Exports",
    path: "/operator/operations/exports",
    group: "Operations",
    short_label: "EX",
    allowed_roles: OPERATIONS_ROLES,
  },
  {
    label: "Recovery",
    path: "/operator/operations/recovery",
    group: "Operations",
    short_label: "RC",
    allowed_roles: OPERATIONS_ROLES,
  },
  {
    label: "Human Review",
    path: "/operator/review",
    group: "Reviews",
    short_label: "HR",
    allowed_roles: REVIEW_ROLES,
  },
  {
    label: "Approved Artifacts",
    path: "/operator/approved-artifacts",
    group: "Reviews",
    short_label: "AA",
    allowed_roles: REVIEW_ROLES,
  },
  {
    label: "Providers",
    path: "/operator/providers",
    group: "Models",
    short_label: "PV",
    allowed_roles: ALL_ROLES,
  },
  {
    label: "Registry",
    path: "/operator/models/registry",
    group: "Models",
    short_label: "RG",
    allowed_roles: ALL_ROLES,
  },
  {
    label: "Tournaments",
    path: "/operator/models/tournaments",
    group: "Models",
    short_label: "TN",
    allowed_roles: ALL_ROLES,
  },
  {
    label: "AI LAB",
    path: "/operator/runtimes/ai-lab",
    group: "Runtimes",
    short_label: "AI",
    allowed_roles: ALL_ROLES,
  },
  {
    label: "OpenRouter",
    path: "/operator/providers/openrouter",
    group: "Runtimes",
    short_label: "OR",
    allowed_roles: ALL_ROLES,
  },
  {
    label: "Vercel Eve",
    path: "/operator/runtimes/vercel-eve",
    group: "Runtimes",
    short_label: "VE",
    allowed_roles: ALL_ROLES,
  },
  {
    label: "Cloudflare",
    path: "/operator/runtimes/cloudflare",
    group: "Runtimes",
    short_label: "CF",
    allowed_roles: ALL_ROLES,
  },
  {
    label: "Regulations",
    path: "/operator/knowledge/regulations",
    group: "Knowledge",
    short_label: "RL",
    allowed_roles: ALL_ROLES,
  },
  {
    label: "Sources",
    path: "/operator/knowledge/sources",
    group: "Knowledge",
    short_label: "SR",
    allowed_roles: ALL_ROLES,
  },
  {
    label: "News",
    path: "/operator/knowledge/news",
    group: "Knowledge",
    short_label: "NW",
    allowed_roles: ALL_ROLES,
  },
  {
    label: "Evidence",
    path: "/operator/evidence",
    group: null,
    short_label: "EV",
    allowed_roles: ALL_ROLES,
  },
  {
    label: "Settings",
    path: "/operator/settings",
    group: null,
    short_label: "ST",
    allowed_roles: ["admin"],
  },
]);

const LEGACY_ROUTE_LABELS: Readonly<Record<string, string>> = {
  "/operator/arca-review": "Revisión ARCA",
  "/operator/governance": "Gobernanza",
  "/operator/blockers": "Bloqueos",
  "/operator/actions": "Acciones requeridas",
  "/operator/execution": "Ejecución",
  "/operator/audit": "Auditoría",
};

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
  return (
    APPLICATION_ROUTES.find((route) => route.path === pathname) ??
    (pathname === "/operator/arca-review"
      ? {
          label: "Revisión ARCA",
          path: pathname,
          group: "Reviews",
          short_label: "RA",
          allowed_roles: REVIEW_ROLES,
        }
      : null)
  );
}

const navigation = (
  identity: ApplicationIdentity,
  pathname: string,
): string => {
  const visible = APPLICATION_ROUTES.filter((route) =>
    roleCanView(identity.role, route.allowed_roles),
  );
  const groups = [...new Set(visible.map((route) => route.group))];
  return groups
    .map((group) => {
      const routes = visible.filter((route) => route.group === group);
      return `<div class="nav-group">${group ? `<p class="nav-group-label">${escapeHtml(group)}</p>` : ""}${routes
        .map(
          (route) =>
            `<a class="nav-item" data-shell-route href="${route.path}"${pathname === route.path ? ' aria-current="page"' : ""}><span class="nav-code" aria-hidden="true">${route.short_label}</span><span class="nav-label">${route.label}</span></a>`,
        )
        .join("")}</div>`;
    })
    .join("");
};

function breadcrumb(pathname: string): string {
  const route = applicationRouteForPath(pathname);
  const label = route?.label ?? LEGACY_ROUTE_LABELS[pathname] ?? "Vista";
  const group = route?.group;
  return `<nav class="breadcrumbs" aria-label="Migas de pan"><a href="/operator">AI LAB</a><span aria-hidden="true">/</span>${group ? `<span>${escapeHtml(group)}</span><span aria-hidden="true">/</span>` : ""}<span aria-current="page">${escapeHtml(label)}</span></nav>`;
}

const environmentLabel = (environment: DeploymentEnvironment): string =>
  environment === "production"
    ? "PRODUCTION"
    : environment === "preview"
      ? "PREVIEW"
      : "LOCAL";

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
    `${applicationRouteForPath(options.pathname)?.label ?? LEGACY_ROUTE_LABELS[options.pathname] ?? "AI LAB"} — AI LAB`;
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
        <div class="brand-copy"><strong>AI LAB</strong><span>CONTROL PLANE</span></div>
        <button class="icon-button sidebar-collapse" type="button" data-sidebar-toggle aria-controls="primary-navigation" aria-expanded="true" aria-label="Contraer navegación">‹</button>
        <button class="icon-button mobile-drawer-close" type="button" data-mobile-close aria-controls="primary-navigation" aria-label="Cerrar navegación">×</button>
      </div>
      <nav class="side-nav" aria-label="AI LAB">${navigation(options.identity, options.pathname)}</nav>
      <div class="boundary-note">
        <span class="signal signal-red" aria-hidden="true"></span>
        <div><strong>Sin autoridad operativa</strong><span>Interfaz de lectura</span></div>
      </div>
    </aside>
    <div class="shell-main">
      <header class="topbar">
        <button class="icon-button mobile-menu" type="button" data-mobile-toggle aria-controls="primary-navigation" aria-expanded="false" aria-label="Abrir navegación">☰</button>
        <div class="command" role="search">
          <span aria-hidden="true">⌕</span>
          <label class="sr-only" for="command-search">Buscar navegación</label>
          <input id="command-search" data-command-search type="search" autocomplete="off" placeholder="Buscar una vista o comando…" aria-describedby="command-help">
          <kbd>⌘ K</kbd>
          <span class="sr-only" id="command-help">Filtra las vistas disponibles; no realiza solicitudes externas.</span>
        </div>
        <div class="top-status">
          <span class="environment-badge">${environmentLabel(options.deployment_environment)}</span>
          <span class="system-status"><span class="signal signal-red" aria-hidden="true"></span>Sistema bloqueado</span>
          <div class="identity">
            <span class="avatar" aria-hidden="true">${escapeHtml(options.identity.display_name.slice(0, 2).toUpperCase())}</span>
            <span><strong>${escapeHtml(options.identity.display_name)}</strong><small>${escapeHtml(options.identity.role)} · contexto UI</small></span>
          </div>
        </div>
      </header>
      <div class="context-bar">
        ${breadcrumb(options.pathname)}
        <div class="provenance"><span>PROVENANCE</span><code>${escapeHtml(options.read_model_hash.slice(0, 12))}…</code><span>${escapeHtml(options.evaluated_at)}</span></div>
        <div class="mobile-context" aria-label="Contexto operativo">
          <span class="environment-badge">${environmentLabel(options.deployment_environment)}</span>
          <span class="system-status"><span class="signal signal-red" aria-hidden="true"></span>Sistema bloqueado</span>
          <span class="mobile-identity">${escapeHtml(options.identity.display_name)} · ${escapeHtml(options.identity.role)}</span>
          <span class="mobile-boundary">AI-131/132/133 kill switches activos · solo lectura</span>
        </div>
      </div>
      <main id="main" tabindex="-1">${options.content}</main>
      <footer class="shell-footer"><span>AI LAB · repository-current</span><span>Estado: ${escapeHtml(options.overall_status)}</span><span>UI ≠ autoridad</span></footer>
    </div>
    <button class="mobile-scrim" type="button" data-mobile-scrim aria-label="Cerrar navegación"></button>
  </div>
</body>
</html>`;
}

export const APPLICATION_SHELL_CSS = String.raw`
:root{color-scheme:dark;--bg:#080b10;--panel:#0f141c;--panel-2:#141a23;--panel-3:#19212c;--line:#26303d;--line-soft:#1d2631;--text:#eef4fb;--muted:#8d9bad;--muted-2:#667487;--cyan:#21c7e8;--blue:#478cff;--green:#38c884;--amber:#e4aa45;--red:#f05d68;--focus:#7ddfff;--sidebar:248px;--radius:8px;--shadow:0 18px 50px rgba(0,0,0,.25)}
*{box-sizing:border-box}html{background:var(--bg)}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button,input,select{font:inherit}a{color:inherit}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.skip-link{position:fixed;left:16px;top:-80px;background:var(--cyan);color:#021014;padding:10px 14px;border-radius:6px;font-weight:800;z-index:100}.skip-link:focus{top:12px}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.app-shell{min-height:100vh;display:grid;grid-template-columns:var(--sidebar) minmax(0,1fr)}.sidebar{position:sticky;inset-block-start:0;height:100vh;background:#0a0e14;border-right:1px solid var(--line-soft);display:flex;flex-direction:column;z-index:30;transition:width .18s ease}.brand{height:66px;border-bottom:1px solid var(--line-soft);display:flex;align-items:center;gap:10px;padding:0 12px}.brand-mark{width:32px;height:32px;display:grid;place-items:center;border:1px solid #315b68;background:#0c2229;color:var(--cyan);border-radius:6px;font:800 11px/1 ui-monospace,monospace;letter-spacing:.08em}.brand-copy{display:flex;flex-direction:column;min-width:0}.brand-copy strong{font-size:13px;letter-spacing:.16em}.brand-copy span{font:9px/1.4 ui-monospace,monospace;letter-spacing:.18em;color:var(--muted)}.icon-button{border:1px solid var(--line);background:var(--panel-2);color:var(--muted);border-radius:6px;width:34px;height:34px;cursor:pointer}.sidebar-collapse{margin-left:auto}.mobile-drawer-close{display:none;margin-left:auto}.side-nav{overflow:auto;padding:12px 9px;flex:1}.nav-group+.nav-group{margin-top:15px}.nav-group-label{margin:0 10px 5px;color:var(--muted-2);font:700 9px/1.4 ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase}.nav-item{min-height:36px;display:flex;align-items:center;gap:10px;padding:6px 9px;border-radius:6px;text-decoration:none;color:#aab6c6;border:1px solid transparent}.nav-item:hover{background:var(--panel-2);color:var(--text)}.nav-item[aria-current=page]{background:#10242d;color:#dffaff;border-color:#1e5260;box-shadow:inset 2px 0 var(--cyan)}.nav-code{width:25px;color:var(--muted-2);font:700 9px/1 ui-monospace,monospace;letter-spacing:.05em}.nav-item[aria-current=page] .nav-code{color:var(--cyan)}.nav-label{white-space:nowrap}.boundary-note{margin:10px;padding:11px;border:1px solid #482830;background:#1a1116;border-radius:7px;display:flex;gap:9px;align-items:flex-start}.boundary-note div{display:flex;flex-direction:column}.boundary-note strong{font-size:11px;color:#ffd9dc}.boundary-note span:last-child{font-size:10px;color:#a7868c}.signal{width:7px;height:7px;border-radius:50%;display:inline-block;flex:0 0 auto;margin-top:6px}.signal-red{background:var(--red);box-shadow:0 0 0 3px rgba(240,93,104,.12)}
.shell-main{min-width:0;display:flex;flex-direction:column;min-height:100vh}.topbar{height:66px;display:flex;align-items:center;gap:14px;padding:0 20px;border-bottom:1px solid var(--line-soft);background:rgba(8,11,16,.94);position:sticky;top:0;z-index:20;backdrop-filter:blur(12px)}.mobile-menu{display:none}.command{height:38px;max-width:520px;min-width:240px;flex:1;display:flex;align-items:center;gap:9px;padding:0 11px;background:var(--panel);border:1px solid var(--line);border-radius:7px;color:var(--muted)}.command:focus-within{border-color:#376b78;box-shadow:0 0 0 3px rgba(33,199,232,.08)}.command input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:var(--text)}.command input::placeholder{color:var(--muted-2)}kbd{border:1px solid var(--line);background:var(--panel-2);border-radius:4px;padding:2px 6px;color:var(--muted);font:10px/1.4 ui-monospace,monospace}.top-status{margin-left:auto;display:flex;align-items:center;gap:14px}.environment-badge{border:1px solid #2f6170;background:#0d252d;color:var(--cyan);border-radius:999px;padding:3px 8px;font:700 9px/1.4 ui-monospace,monospace;letter-spacing:.12em}.system-status{display:flex;align-items:center;gap:7px;color:#efc9cc;font-size:11px}.identity{display:flex;align-items:center;gap:8px;padding-left:14px;border-left:1px solid var(--line)}.avatar{width:30px;height:30px;display:grid;place-items:center;background:#17283a;border:1px solid #29445f;border-radius:50%;color:#badeff;font:700 10px/1 ui-monospace,monospace}.identity>span:last-child{display:flex;flex-direction:column}.identity strong{font-size:11px}.identity small{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}.context-bar{min-height:42px;padding:0 22px;border-bottom:1px solid var(--line-soft);display:flex;align-items:center;justify-content:space-between;gap:18px;background:#0b0f15}.breadcrumbs{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:11px}.breadcrumbs a{color:var(--cyan);text-decoration:none}.provenance{display:flex;align-items:center;gap:10px;color:var(--muted-2);font:9px/1.4 ui-monospace,monospace;letter-spacing:.04em}.provenance>span:first-child{color:var(--blue);font-weight:800}.provenance code{color:#a9b7c7}
main{width:100%;max-width:1500px;margin:0 auto;padding:24px 26px 36px}h2{margin:0;color:var(--text);font-size:22px;line-height:1.2;letter-spacing:-.02em}h3{margin:0 0 10px;font-size:13px;letter-spacing:.01em}h4{margin:0 0 8px;color:#c4cfdd;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.lead{margin:6px 0 20px;color:var(--muted);max-width:850px}.page-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:20px}.eyebrow{display:block;margin-bottom:6px;color:var(--cyan);font:700 9px/1.4 ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase}.page-meta{font:10px/1.5 ui-monospace,monospace;color:var(--muted)}
.notice{border:1px solid #543039;border-left:3px solid var(--red);background:#1a1116;padding:13px 14px;margin:0 0 16px;border-radius:var(--radius);color:#d9b9bd}.notice strong{color:#ffdce0}.grid-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px}.grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.card,.metric{background:var(--panel);border:1px solid var(--line-soft);border-radius:var(--radius);box-shadow:0 1px 0 rgba(255,255,255,.02)}.card{padding:15px;margin-bottom:12px;min-width:0}.grid2>.card,.grid3>.card{margin-bottom:0}.metric{padding:13px;min-height:84px;display:flex;flex-direction:column;justify-content:space-between}.metric>span:first-child{color:var(--muted);font:700 9px/1.4 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em}.metric strong{font-size:17px;line-height:1.25;overflow-wrap:break-word}.metric small{color:var(--muted);font-size:10px}.badge{display:inline-flex;align-items:center;border:1px solid currentColor;border-radius:999px;padding:2px 7px;font-size:10px;font-weight:700;line-height:1.4}.tone-blocked{color:#ff8c95;background:#211217}.tone-pending{color:#f0c36d;background:#211c12}.tone-verified{color:#73dfa9;background:#102019}.tone-neutral{color:#aab6c6;background:#161c24}.tone-informational{color:#8ecbff;background:#102033}.severity-critical,.severity-high{color:#ff8c95;background:#211217}.severity-medium{color:#f0c36d;background:#211c12}.severity-low{color:#aab6c6;background:#161c24}.untranslated,.quiet{color:var(--muted);font-size:11px}dl{display:grid;grid-template-columns:minmax(140px,.8fr) minmax(0,1.3fr);gap:7px 18px;margin:0}dt{color:var(--muted);font-size:11px}dd{margin:0;min-width:0;overflow-wrap:break-word}code{font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#b8d6ee;overflow-wrap:break-word}.code-block{display:block;margin:7px 0 0;padding:9px 11px;background:#090d12;border:1px solid var(--line-soft);border-radius:5px;overflow-x:auto;white-space:pre;user-select:text}.code-block code{overflow-wrap:normal;white-space:pre}details.tech{margin-top:8px}details.tech summary{cursor:pointer;color:var(--muted);font-size:11px}.filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.filters label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}select{display:block;margin-top:4px;padding:6px 9px;background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:5px}ol.records{list-style:none;margin:0;padding:0;counter-reset:record}ol.records>li{counter-increment:record}ol.records h3::before{content:counter(record) ". ";color:var(--muted)}.chain{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:7px;margin-bottom:14px}.stage{background:var(--panel);border:1px solid var(--line-soft);padding:11px;text-align:center;min-width:0;border-radius:6px}.stage p{font-size:10px;color:var(--muted);margin:7px 0 0}.stage:not(:last-child)::after{content:"→";float:right;margin-right:-17px;color:var(--muted-2)}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--line-soft);padding:8px}th{color:var(--muted);font-size:11px}ul{padding-left:18px}.status-list{list-style:none;padding:0;margin:0}.status-list li{display:flex;justify-content:space-between;gap:14px;padding:9px 0;border-bottom:1px solid var(--line-soft)}.status-list li:last-child{border-bottom:0}.status-list span:first-child{color:var(--muted)}.panel-kicker{color:var(--muted-2);font:700 9px/1.4 ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase}.shell-footer{margin-top:auto;min-height:42px;border-top:1px solid var(--line-soft);display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 24px;color:var(--muted-2);font:9px/1.4 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em}.mobile-scrim{display:none}.mobile-context{display:none}
.app-shell[data-collapsed=true]{--sidebar:70px}.app-shell[data-collapsed=true] .brand-copy,.app-shell[data-collapsed=true] .nav-label,.app-shell[data-collapsed=true] .nav-group-label,.app-shell[data-collapsed=true] .boundary-note div{display:none}.app-shell[data-collapsed=true] .brand{justify-content:center;padding:0 8px;flex-wrap:wrap}.app-shell[data-collapsed=true] .sidebar-collapse{position:absolute;right:-14px;top:16px}.app-shell[data-collapsed=true] .nav-item{justify-content:center}.app-shell[data-collapsed=true] .nav-code{width:auto}.app-shell[data-collapsed=true] .boundary-note{justify-content:center}
@media(max-width:1120px){.grid-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.top-status .system-status{display:none}.chain{grid-template-columns:1fr}.stage:not(:last-child)::after{content:"↓";float:none;display:block;margin:8px 0 -13px}}
@media(max-width:820px){body.mobile-drawer-open{overflow:hidden}.app-shell{display:block}.sidebar{position:fixed;left:0;top:0;width:min(86vw,300px);transform:translateX(-102%);box-shadow:var(--shadow);transition:transform .18s ease}.app-shell[data-mobile-open=true] .sidebar{transform:translateX(0)}.sidebar-collapse{display:none}.mobile-drawer-close{display:inline-grid;place-items:center}.mobile-menu{display:inline-grid;place-items:center;flex:0 0 auto}.topbar{padding:0 12px}.command{min-width:0}.command kbd{display:none}.top-status{display:none}.context-bar{padding:8px 14px;align-items:flex-start;flex-wrap:wrap}.provenance span:last-child{display:none}.mobile-context{width:100%;display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:var(--muted);font-size:10px}.mobile-identity{color:#cbd6e3}.mobile-boundary{width:100%;color:#efc9cc}.mobile-scrim{position:fixed;inset:0;border:0;background:rgba(0,0,0,.58);z-index:25}.app-shell[data-mobile-open=true] .mobile-scrim{display:block}main{padding:20px 14px 30px}.grid2,.grid3{grid-template-columns:1fr}.shell-footer{padding:10px 14px;flex-wrap:wrap}}
@media(max-width:540px){.command{font-size:12px}.grid-metrics{grid-template-columns:1fr}.context-bar{flex-direction:column;gap:5px}.breadcrumbs{flex-wrap:wrap}.page-heading{display:block}.page-meta{margin-top:8px}.shell-footer span:nth-child(2){display:none}dl{grid-template-columns:1fr}dd{margin-bottom:5px}.status-list li{align-items:flex-start;flex-direction:column;gap:4px}}
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
  if(search){
    search.addEventListener("input",function(){
      var term=String(search.value||"").trim().toLowerCase();
      shellRoutes.forEach(function(route){route.hidden=term.length>0&&!String(route.textContent||"").toLowerCase().includes(term)});
    });
    search.addEventListener("keydown",function(event){
      if(event.key==="Escape"){search.value="";search.dispatchEvent(new Event("input"));search.blur()}
      if(event.key==="Enter"){var target=shellRoutes.find(function(route){return !route.hidden});if(target)target.click()}
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
})();
`;

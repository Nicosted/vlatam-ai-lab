import {
  BLOCKER_CATEGORY_LABELS,
  EXECUTION_STAGE_LABELS,
  FIELD_LABELS,
  GOVERNANCE_GROUPS,
  RESOLUTION_LABELS,
  SEVERITY_LABELS,
  UNTRANSLATED_MARKER,
  groupBlockersForGovernance,
  presentBlockerSummary,
  presentEvaluator,
  presentExecutionImpact,
  presentOwnerRole,
  presentResolution,
  presentRequiredActionTitle,
  presentSeverity,
  presentStatus,
  shortHash,
  topBlockersBySeverity,
} from "./operator-presentation.js";
import type {
  OperatorBlocker,
  OperatorReadModel,
  OperatorRequiredAction,
} from "./operator-read-model.js";

const ROUTES = [
  ["Resumen", "/operator"],
  ["Proveedores", "/operator/providers"],
  ["Gobernanza", "/operator/governance"],
  ["Bloqueos", "/operator/blockers"],
  ["Acciones requeridas", "/operator/actions"],
  ["Revisión humana", "/operator/review"],
  ["Ejecución", "/operator/execution"],
  ["Auditoría", "/operator/audit"],
] as const;

const NEXT_GOVERNED_MILESTONE =
  "Activación controlada de sandbox (una sola llamada sintética), solo tras resolver los bloqueos gobernados y registrar las decisiones humanas de la revisión de activación." as const;

const NEXT_ACTION_LABELS: Readonly<Record<string, string>> = {
  repair_invalid_review_artifact:
    "Reparar el artefacto de revisión inválido mediante un cambio de código revisado.",
  resolve_governed_blockers:
    "Resolver los bloqueos gobernados listados antes de registrar decisiones humanas.",
  record_human_decisions:
    "Registrar las decisiones humanas pendientes (revisión de evidencia, aprobación, titularidades y aceptación del caso de referencia).",
  propose_activation_configuration_pr:
    "Proponer un PR separado de configuración de activación (una sola llamada); la ejecución seguirá sin autorizarse en esta revisión.",
  renew_expired_review:
    "Renovar la revisión vencida con una nueva versión gobernada.",
  address_rejection_or_supersede:
    "Atender el rechazo registrado o sustituir la revisión por una nueva versión.",
};

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const untranslated = (): string =>
  ` <span class="untranslated">(${UNTRANSLATED_MARKER})</span>`;

const badge = (value: unknown): string => {
  const presented = presentStatus(value);
  const body = `<span class="badge status-${escapeHtml(presented.canonical)}">${escapeHtml(presented.label)}</span>`;
  return presented.known
    ? body
    : `<span class="badge status-unknown"><code>${escapeHtml(presented.canonical)}</code></span>${untranslated()}`;
};

const severityBadge = (value: OperatorBlocker["severity"]): string => {
  const presented = presentSeverity(value);
  return `<span class="badge severity-${escapeHtml(presented.canonical)}">Severidad: ${escapeHtml(presented.label)}</span>`;
};

const yesNo = (value: unknown): string => badge(String(value === true));
const code = (value: unknown): string => `<code>${escapeHtml(value)}</code>`;
const text = (value: unknown): string => escapeHtml(value);

/** dd values are pre-rendered safe HTML built with the helpers above. */
const dl = (items: readonly (readonly [string, string])[]): string =>
  `<dl>${items.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${value}</dd>`).join("")}</dl>`;

const metric = (name: string, valueHtml: string): string =>
  `<div class="metric"><span>${escapeHtml(name)}</span><strong>${valueHtml}</strong></div>`;

/** Full canonical value behind an accessible disclosure; no clipboard JS. */
const disclosure = (summaryLabel: string, value: unknown): string =>
  `<details class="tech"><summary>${escapeHtml(summaryLabel)}</summary><pre class="code-block" aria-label="${escapeHtml(summaryLabel)}"><code>${escapeHtml(value ?? "ausente")}</code></pre></details>`;

const codeList = (summaryLabel: string, values: readonly string[]): string =>
  `<details class="tech"><summary>${escapeHtml(summaryLabel)}</summary><pre class="code-block" aria-label="${escapeHtml(summaryLabel)}"><code>${values.map((value) => escapeHtml(value)).join("\n") || "ninguno"}</code></pre></details>`;

const hashSummary = (value: string | null | undefined): string =>
  value ? code(shortHash(value)) : badge("absent");

function shell(
  model: OperatorReadModel,
  pathname: string,
  content: string,
): string {
  const summary = model.system_summary;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI LAB — Consola del operador</title><style>
  :root{color-scheme:light;--ink:#18201f;--muted:#5d6a67;--line:#d8dfdc;--panel:#fff;--bg:#f4f6f5;--blocked:#9a2f2f;--pending:#765b00;--ok:#176b45;--focus:#005fcc}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,sans-serif}a{color:inherit}.skip{position:absolute;left:-999px}.skip:focus{left:1rem;top:1rem;background:#fff;padding:.7rem;z-index:2}header{background:#172321;color:#fff;padding:1rem 1.5rem}.top{display:flex;gap:1rem;align-items:center;justify-content:space-between;flex-wrap:wrap}.top h1{font-size:1.15rem;margin:0}.meta{display:flex;gap:.75rem;flex-wrap:wrap;color:#d7e0dd;font-size:.84rem;align-items:center}.meta code{color:#d7e0dd}nav{background:#fff;border-bottom:1px solid var(--line);padding:.55rem 1.5rem;display:flex;gap:.25rem;overflow:auto}nav a{padding:.45rem .65rem;text-decoration:none;border-radius:.25rem;white-space:nowrap}nav a[aria-current=page]{background:#e5ece9;font-weight:700}a:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid var(--focus);outline-offset:2px}main{max-width:1080px;margin:auto;padding:1.25rem}h2{font-size:1.4rem;margin:.2rem 0 .4rem}.lead{margin:0 0 1rem;color:var(--muted)}h3{font-size:1.05rem;margin:0 0 .7rem}h4{font-size:.9rem;margin:0 0 .45rem;color:var(--muted)}.notice{border-left:5px solid var(--blocked);background:#fff;padding:1rem;margin-bottom:1rem}.grid-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.8rem;margin-bottom:1rem}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:.9rem}.card{background:var(--panel);border:1px solid var(--line);border-radius:.35rem;padding:1rem;margin-bottom:1rem;min-width:0}.grid2>.card{margin-bottom:0}.metric{background:var(--panel);border:1px solid var(--line);border-radius:.35rem;padding:.8rem;min-width:0}.metric span{display:block;color:var(--muted);font-size:.8rem}.metric strong{font-size:1.15rem;overflow-wrap:break-word}.badge{display:inline-block;border:1px solid currentColor;border-radius:999px;padding:.12rem .55rem;font-size:.78rem;font-weight:700}.status-blocked,.status-invalid_state,.status-disabled,.status-rejected,.status-absent,.status-missing,.status-unavailable{color:var(--blocked);background:#fff0f0}.status-pending,.status-not_configured,.status-not_attempted,.status-no_policy_issued,.status-not_invoked,.status-authorization_pending,.status-not_started,.status-unknown,.status-evidence_incomplete,.status-none{color:var(--pending);background:#fff9dc}.status-healthy,.status-enabled,.status-valid,.status-approved,.status-available,.status-complete,.status-active,.status-true{color:var(--ok);background:#edf9f2}.status-false{color:var(--blocked);background:#fff0f0}.severity-critical,.severity-high{color:var(--blocked);background:#fff0f0}.severity-medium{color:var(--pending);background:#fff9dc}.severity-low{color:var(--muted);background:#f0f3f2}.untranslated{color:var(--muted);font-size:.78rem}dl{display:grid;grid-template-columns:minmax(150px,1fr) 2fr;gap:.4rem 1rem;margin:0}dt{color:var(--muted)}dd{margin:0;min-width:0;overflow-wrap:break-word}code{font:12px/1.5 ui-monospace,SFMono-Regular,monospace;overflow-wrap:break-word}.code-block{display:block;margin:.4rem 0 0;padding:.55rem .75rem;background:#f0f3f2;border:1px solid var(--line);border-radius:.25rem;overflow-x:auto;white-space:pre;user-select:text}.code-block code{overflow-wrap:normal;white-space:pre}details.tech{margin-top:.5rem}details.tech summary{cursor:pointer;color:var(--muted);font-size:.84rem}.filters{display:flex;gap:.7rem;flex-wrap:wrap;margin-bottom:.6rem}.filters label{font-size:.8rem;color:var(--muted)}select{display:block;padding:.35rem;background:#fff;border:1px solid #87928f}ol.records{list-style:none;margin:0;padding:0;counter-reset:record}ol.records>li{counter-increment:record}ol.records h3::before{content:counter(record) ". ";color:var(--muted)}.chain{display:grid;grid-template-columns:repeat(7,1fr);gap:.5rem;margin-bottom:1rem}.stage{background:#fff;border:1px solid var(--line);padding:.75rem;text-align:center;min-width:0}.stage p{font-size:.8rem;color:var(--muted);margin:.4rem 0 0}.stage:not(:last-child)::after{content:"→";float:right;margin-right:-1.15rem}.quiet{color:var(--muted)}ul{padding-left:1.2rem}@media(max-width:920px){.grid2{grid-template-columns:1fr}.chain{grid-template-columns:1fr}.stage:not(:last-child)::after{content:"↓";float:none;display:block;margin:.6rem 0 -1rem}}@media(max-width:800px){main{padding:.8rem}header,nav{padding-left:.8rem;padding-right:.8rem}}@media(max-width:480px){dl{grid-template-columns:1fr}dd{margin-bottom:.4rem}.meta{display:block}}
  </style></head><body><a class="skip" href="#main">Saltar al contenido principal</a><header><div class="top"><h1>AI LAB — Consola del operador</h1><div class="meta"><span>Estado global ${badge(summary.overall_status)}</span><span>Evaluado ${escapeHtml(summary.last_evaluated_at)}</span><span>Contrato ${escapeHtml(summary.read_model_contract_version)}</span><span>Hash ${code(shortHash(summary.read_model_hash))}</span></div></div></header><nav aria-label="Consola del operador">${ROUTES.map(([name, href]) => `<a href="${href}"${pathname === href || (href === "/operator/providers" && pathname.startsWith("/operator/providers/")) ? ' aria-current="page"' : ""}>${name}</a>`).join("")}</nav><main id="main">${content}</main></body></html>`;
}

const blockedNotice = (model: OperatorReadModel): string =>
  model.system_summary.overall_status === "healthy"
    ? ""
    : `<div class="notice"><strong>Bloqueado es un estado gobernado y seguro, no una falla de la aplicación.</strong><br>La consola muestra la decisión del repositorio tal como fue evaluada y no ofrece controles de ejecución ni de aprobación.</div>`;

function overview(model: OperatorReadModel): string {
  const s = model.system_summary;
  const provider = model.providers[0] ?? {};
  const candidate = model.models[0];
  const executionAllowed = provider["execution_allowed"] === true;
  const situacion: string[] = [];
  if (typeof provider["provider_id"] === "string")
    situacion.push(
      `El proveedor evaluado actualmente es ${code(provider["provider_id"])}.`,
    );
  if (candidate)
    situacion.push(`El candidato actual es ${code(candidate.model_id)}.`);
  situacion.push(
    executionAllowed
      ? "La ejecución de modelos está permitida por el estado gobernado."
      : "La ejecución de modelos no está permitida.",
  );
  if (model.gateway_adapter_state.gateway_invoked === false)
    situacion.push("No se ha realizado ninguna llamada al proveedor.");
  if (model.consumption.status === "not_attempted")
    situacion.push("No se ha consumido ninguna autorización de ejecución.");
  if (model.kill_switch_state.status === "active")
    situacion.push(
      "El kill switch permanece activo: cualquier intento de ejecución falla cerrado.",
    );
  const top = topBlockersBySeverity(model.blockers, 5);
  return `<h2>Resumen</h2><p class="lead">Estado gobernado actual del laboratorio y del proveedor evaluado.</p>${blockedNotice(model)}<div class="grid-metrics">${metric("Estado gobernado", badge(s.overall_status))}${metric("Ejecución de modelos", executionAllowed ? badge("enabled") : `<span class="badge status-blocked">No permitida</span>`)}${metric("Proveedor evaluado", code(provider["provider_id"] ?? "ausente"))}${metric("Candidato actual", code(candidate?.model_id ?? "ausente"))}${metric("Bloqueos activos", text(s.active_blockers))}${metric("Acciones requeridas", text(model.required_human_actions.length))}${metric("Revisiones pendientes", text(s.pending_approvals))}${metric("Evaluación", text(s.last_evaluated_at))}${metric("Versión del modelo de lectura", text(s.read_model_contract_version))}${metric("Hash (abreviado)", code(shortHash(s.read_model_hash)))}</div><section class="card"><h3>Situación actual</h3><ul>${situacion.map((item) => `<li>${item}</li>`).join("")}</ul></section><section class="card"><h3>Bloqueos principales</h3><p class="quiet">Los cinco bloqueos de mayor prioridad (orden estable por severidad; el listado canónico completo está en Bloqueos).</p><ul>${top
    .map((blocker) => {
      const summary = presentBlockerSummary(blocker);
      return `<li>${escapeHtml(summary.label)}${summary.known ? "" : untranslated()} ${severityBadge(blocker.severity)} ${code(blocker.blocker_code)}</li>`;
    })
    .join(
      "",
    )}</ul></section><section class="card"><h3>Próximos pasos</h3><p class="quiet">Generados únicamente desde las acciones requeridas existentes, en su orden determinista.</p><ol>${model.required_human_actions
    .map((action) => {
      const title = presentRequiredActionTitle(action);
      return `<li>${escapeHtml(title.label)}${title.known ? "" : untranslated()} — ${escapeHtml(presentOwnerRole(action.owner_role).label)} ${badge(action.status)}</li>`;
    })
    .join(
      "",
    )}</ol><p><strong>Próximo hito gobernado:</strong> ${escapeHtml(NEXT_GOVERNED_MILESTONE)}</p></section><section class="card"><h3>Instantánea determinista</h3>${dl(
    [
      [FIELD_LABELS["evaluated_at"]!, text(s.last_evaluated_at)],
      [FIELD_LABELS["contract_version"]!, text(s.read_model_contract_version)],
      [FIELD_LABELS["read_model_hash"]!, hashSummary(s.read_model_hash)],
    ],
  )}${disclosure("Hash completo del modelo de lectura", s.read_model_hash)}</section>`;
}

function providers(model: OperatorReadModel): string {
  return `<h2>Proveedores</h2><p class="lead">Cada tarjeta se genera desde el Operator Read Model; la consola no interpreta artefactos del proveedor.</p>${model.providers
    .map((p) => {
      const registeredModels =
        (p["registered_models"] as readonly string[] | undefined) ?? [];
      const registeredRoutes =
        (p["registered_routes"] as readonly string[] | undefined) ?? [];
      const registeredProfiles =
        (p["execution_profiles"] as readonly string[] | undefined) ?? [];
      const candidate = model.models.find((m) =>
        registeredModels.includes(m.entry_id),
      );
      const route = model.routes.find((r) =>
        registeredRoutes.includes(r.record_id),
      );
      const profile = model.execution_profiles.find((item) =>
        registeredProfiles.includes(item.profile_id),
      );
      const providerId = String(p["provider_id"] ?? "unknown");
      const executionAllowed = p["execution_allowed"] === true;
      const blockerCount =
        (p["reason_codes"] as readonly unknown[] | undefined)?.length ?? 0;
      const explanation = executionAllowed
        ? `${providerId} tiene la ejecución permitida por el estado gobernado del repositorio.`
        : `${providerId} es el proveedor evaluado actualmente. La ejecución permanece deshabilitada mientras existan ${blockerCount} bloqueos gobernados sin resolver.`;
      const detailLink =
        providerId === "openrouter"
          ? `<p><a href="/operator/providers/openrouter">Ver detalle gobernado</a></p>`
          : "";
      return `<article class="card"><h3>${escapeHtml(p["display_name"] || providerId)} ${badge(executionAllowed ? "healthy" : "blocked")}</h3>${dl(
        [
          [FIELD_LABELS["provider_id"]!, code(providerId)],
          [
            FIELD_LABELS["candidate_model"]!,
            candidate ? code(candidate.model_id) : badge("absent"),
          ],
          [
            "Estado del proveedor",
            badge(executionAllowed ? "healthy" : "blocked"),
          ],
          [FIELD_LABELS["execution_allowed"]!, yesNo(executionAllowed)],
          [FIELD_LABELS["blocker_count"]!, text(blockerCount)],
        ],
      )}<p>${escapeHtml(explanation)}</p><div class="grid2"><section class="card"><h4>Evidencia y preparación</h4>${dl(
        [
          [FIELD_LABELS["readiness_status"]!, badge(p["readiness_status"])],
          [
            FIELD_LABELS["evidence_review"]!,
            badge(model.evidence.review_status),
          ],
        ],
      )}</section><section class="card"><h4>Configuración de sandbox</h4>${dl([
        [FIELD_LABELS["proposal_status"]!, badge(p["proposal_status"])],
        [FIELD_LABELS["preflight_status"]!, badge(p["preflight_status"])],
        [FIELD_LABELS["budget_status"]!, badge(p["budget_status"])],
      ])}</section><section class="card"><h4>Seguridad</h4>${dl([
        [FIELD_LABELS["secret_status"]!, badge(p["secret_status"])],
        [FIELD_LABELS["kill_switch_status"]!, badge(p["kill_switch_status"])],
        [
          FIELD_LABELS["live_traffic_permitted"]!,
          yesNo(p["live_traffic_permitted"]),
        ],
      ])}</section><section class="card"><h4>Ejecución</h4>${dl([
        [FIELD_LABELS["adapter_state"]!, badge(p["adapter_state"])],
        [
          FIELD_LABELS["model_state"]!,
          badge(candidate?.enabled ? "enabled" : "disabled"),
        ],
        [
          FIELD_LABELS["route_state"]!,
          badge(route?.enabled ? "enabled" : "disabled"),
        ],
        [
          FIELD_LABELS["profile_state"]!,
          badge(profile?.enabled ? "enabled" : "disabled"),
        ],
      ])}</section></div>${detailLink}</article>`;
    })
    .join("")}`;
}

function openrouter(model: OperatorReadModel): string {
  const p =
    model.providers.find((item) => item["provider_id"] === "openrouter") ?? {};
  const m = model.models[0];
  const r = model.routes[0];
  const profile = model.execution_profiles[0];
  const v = model.validation_evidence_metadata;
  const proposal = model.sandbox_proposals[0];
  const blockerCount =
    (p["reason_codes"] as readonly unknown[] | undefined)?.length ?? 0;
  const reasons: string[] = [];
  if (p["execution_allowed"] !== true)
    reasons.push(
      `El estado gobernado del proveedor es Bloqueado, con ${blockerCount} bloqueos activos.`,
    );
  if (model.evidence.review_status === "pending")
    reasons.push("La evidencia externa está pendiente de revisión humana.");
  if (proposal?.approval_status === "pending")
    reasons.push(
      "La aprobación humana de la propuesta de sandbox está pendiente.",
    );
  if (model.authorization.exact_policy_hash === null)
    reasons.push("No existe una política exacta de ejecución.");
  if (model.gateway_adapter_state.adapter_status === "disabled")
    reasons.push("El adaptador de transporte está deshabilitado.");
  if (model.kill_switch_state.status === "active")
    reasons.push("El kill switch permanece activo.");
  return `<h2>OpenRouter — detalle gobernado</h2>${blockedNotice(model)}<section class="card"><h3>Estado actual</h3><p><strong>Ejecución permitida:</strong> ${yesNo(p["execution_allowed"])}. No existe ninguna llamada al proveedor, salida de modelo ni uso facturado.</p><ul>${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>${dl(
    [
      [FIELD_LABELS["readiness_status"]!, badge(p["readiness_status"])],
      [FIELD_LABELS["evidence_review"]!, badge(model.evidence.review_status)],
      [FIELD_LABELS["proposal_status"]!, badge(p["proposal_status"])],
      [FIELD_LABELS["preflight_status"]!, badge(p["preflight_status"])],
      [FIELD_LABELS["approval_status"]!, badge(proposal?.approval_status)],
    ],
  )}</section><section class="card"><h3>Identidad del candidato</h3>${dl([
    [FIELD_LABELS["provider_id"]!, code(p["provider_id"] ?? "ausente")],
    [FIELD_LABELS["candidate_model"]!, m ? code(m.model_id) : badge("absent")],
    ["Ruta gobernada", r ? code(r.route_id) : badge("absent")],
    [
      "Perfil de ejecución",
      profile ? code(profile.profile_id) : badge("absent"),
    ],
    [
      "Cadena del candidato",
      code(
        `${String(p["provider_id"] ?? "?")} → ${r?.route_id ?? "?"} → ${m?.model_id ?? "?"} → ${profile?.profile_id ?? "?"}`,
      ),
    ],
    ["Versión del modelo (registro)", text(m?.version ?? "ausente")],
    ["Versión de la ruta (registro)", text(r?.version ?? "ausente")],
    ["Versión del perfil", text(profile?.version ?? "ausente")],
  ])}</section><div class="grid2"><section class="card"><h3>Evidencia y preparación</h3>${dl(
    [
      ["Dossier de preparación", badge(v.dossier_outcome)],
      ["Versión del dossier", text(v.dossier_version ?? "ausente")],
      ["Paquete de evidencia externa", badge(model.evidence.outcome)],
      [FIELD_LABELS["evidence_review"]!, badge(v.evidence_review_status)],
      [
        "Versión del paquete de evidencia",
        text(v.evidence_pack_version ?? "ausente"),
      ],
    ],
  )}${codeList(
    "Informes de evidencia (rutas del repositorio)",
    (p["evidence_paths"] as readonly string[] | undefined) ?? [],
  )}</section><section class="card"><h3>Seguridad y privacidad</h3>${dl([
    [
      FIELD_LABELS["secret_status"]!,
      badge(model.secret_configuration_status.status),
    ],
    [
      FIELD_LABELS["kill_switch_status"]!,
      badge(model.kill_switch_state.status),
    ],
    [
      FIELD_LABELS["live_traffic_permitted"]!,
      yesNo(p["live_traffic_permitted"]),
    ],
  ])}<p class="quiet">Los bloqueos de privacidad, retención, entrenamiento y ZDR se listan en Gobernanza.</p></section><section class="card"><h3>Configuración de ejecución</h3>${dl(
    [
      [FIELD_LABELS["adapter_identity"]!, code(p["adapter_identity"])],
      [FIELD_LABELS["adapter_version"]!, text(p["adapter_version"])],
      [FIELD_LABELS["adapter_state"]!, badge(p["adapter_state"])],
      [
        FIELD_LABELS["model_state"]!,
        badge(m?.enabled ? "enabled" : "disabled"),
      ],
      [
        FIELD_LABELS["route_state"]!,
        badge(r?.enabled ? "enabled" : "disabled"),
      ],
      [
        FIELD_LABELS["route_executable"]!,
        yesNo((r?.executable_profile_ids.length ?? 0) > 0),
      ],
      [
        FIELD_LABELS["profile_state"]!,
        badge(profile?.enabled ? "enabled" : "disabled"),
      ],
      [
        FIELD_LABELS["authorization_status"]!,
        badge(model.authorization.status),
      ],
      [
        FIELD_LABELS["exact_policy"]!,
        model.authorization.exact_policy_hash
          ? hashSummary(model.authorization.exact_policy_hash)
          : badge("absent"),
      ],
      [FIELD_LABELS["consumption_status"]!, badge(model.consumption.status)],
    ],
  )}</section><section class="card"><h3>Presupuesto sandbox</h3>${dl([
    [FIELD_LABELS["budget_status"]!, badge(model.budget_state.status)],
    [
      FIELD_LABELS["maximum_requests"]!,
      text(model.budget_state.maximum_requests ?? "ausente"),
    ],
    [
      FIELD_LABELS["maximum_total_spend_usd"]!,
      text(model.budget_state.maximum_total_spend_usd ?? "ausente"),
    ],
    [
      "Fixture sintético (solo metadatos)",
      code("openrouter.manual-sandbox.synthetic.v1"),
    ],
  ])}</section></div><section class="card"><h3>Artefactos y hashes</h3><p class="quiet">Hashes abreviados; el valor completo está disponible en cada detalle técnico.</p>${dl(
    [
      ["Dossier de preparación", hashSummary(v.dossier_hash)],
      ["Paquete de evidencia externa", hashSummary(v.evidence_pack_hash)],
      ["Propuesta de sandbox", hashSummary(v.proposal_hash)],
      ["Configuración de runtime", hashSummary(v.runtime_config_hash)],
      ["Registro del modelo", hashSummary(m?.hash ?? null)],
      ["Registro de ruta", hashSummary(r?.hash ?? null)],
      ["Perfil de ejecución", hashSummary(profile?.hash ?? null)],
      [
        "Adaptador",
        hashSummary(
          typeof p["adapter_hash"] === "string" ? p["adapter_hash"] : null,
        ),
      ],
    ],
  )}${codeList("Identidades y hashes completos", [
    `dossier_id: ${v.dossier_id ?? "ausente"}`,
    `dossier_hash: ${v.dossier_hash ?? "ausente"}`,
    `evidence_pack_id: ${v.evidence_pack_id ?? "ausente"}`,
    `evidence_pack_hash: ${v.evidence_pack_hash ?? "ausente"}`,
    `proposal_id: ${v.proposal_id ?? "ausente"}`,
    `proposal_hash: ${v.proposal_hash ?? "ausente"}`,
    `runtime_config_id: ${v.runtime_config_id ?? "ausente"}`,
    `runtime_config_hash: ${v.runtime_config_hash ?? "ausente"}`,
    `model_record: ${m?.entry_id ?? "ausente"}`,
    `model_hash: ${m?.hash ?? "ausente"}`,
    `route_record: ${r?.record_id ?? "ausente"}`,
    `route_hash: ${r?.hash ?? "ausente"}`,
    `profile_id: ${profile?.profile_id ?? "ausente"}`,
    `profile_hash: ${profile?.hash ?? "ausente"}`,
    `adapter_hash: ${typeof p["adapter_hash"] === "string" ? p["adapter_hash"] : "ausente"}`,
  ])}</section><section class="card"><h3>Próximas acciones</h3><ol>${model.required_human_actions
    .map((action) => {
      const title = presentRequiredActionTitle(action);
      return `<li>${escapeHtml(title.label)}${title.known ? "" : untranslated()} — ${escapeHtml(presentOwnerRole(action.owner_role).label)} ${badge(action.status)}</li>`;
    })
    .join(
      "",
    )}</ol><p class="quiet">El plan completo está en Acciones requeridas.</p></section>`;
}

function review(model: OperatorReadModel): string {
  const r = model.activation_review;
  const g = model.gold_case_state;
  const m = model.models[0];
  const p = model.providers[0] ?? {};
  const reviewBlockers = model.blockers.filter(
    (blocker) =>
      blocker.source_evaluator === "sandbox_activation_review" ||
      blocker.source_evaluator === "sandbox_gold_case",
  );
  const nextAction = NEXT_ACTION_LABELS[r.next_governed_action];
  const decisionRow = (
    label: string,
    status: string,
  ): readonly [string, string] => [label, badge(status)];
  return `<h2>Revisión humana</h2><p class="lead">Estado de la revisión humana de activación del sandbox. La consola solo muestra decisiones registradas en artefactos gobernados; no ofrece controles de aprobación, mutación ni ejecución.</p>${blockedNotice(model)}<section class="card"><h3>Estado de la revisión de activación</h3>${dl(
    [
      [FIELD_LABELS["review_status"]!, badge(r.outcome)],
      ["Ciclo de vida", badge(r.lifecycle)],
      [FIELD_LABELS["review_scope"]!, code(r.scope)],
      [FIELD_LABELS["review_expiry"]!, text(r.expires_at ?? "ausente")],
      ["Decisiones humanas pendientes", text(r.pending_human_decisions.length)],
      [FIELD_LABELS["version"]!, text(r.version ?? "ausente")],
      ["Hash de la revisión (abreviado)", hashSummary(r.source_artifact_hash)],
    ],
  )}<p><strong>Alcance:</strong> la única aprobación representable es exactamente una activación de sandbox con un caso de referencia sintético (${code("one_synthetic_gold_case_sandbox_activation")}). Ninguna aprobación de proveedor, producción, recurrencia, autonomía ni datos de clientes es posible en este contrato.</p>${disclosure("Hash completo de la revisión", r.source_artifact_hash)}</section><section class="card"><h3>Identidad del candidato</h3>${dl(
    [
      [FIELD_LABELS["provider_id"]!, code(p["provider_id"] ?? "ausente")],
      [
        FIELD_LABELS["candidate_model"]!,
        m ? code(m.model_id) : badge("absent"),
      ],
      ["Capacidad", code(g.capability_id ?? "ausente")],
    ],
  )}</section><div class="grid2"><section class="card"><h3>Decisiones humanas</h3>${dl(
    [
      decisionRow(
        FIELD_LABELS["evidence_reviewer_state"]!,
        r.evidence_review_status,
      ),
      decisionRow(
        FIELD_LABELS["activation_approver_state"]!,
        r.activation_approval_status,
      ),
      decisionRow(
        FIELD_LABELS["kill_switch_owner_state"]!,
        r.kill_switch_owner_status,
      ),
      decisionRow(
        FIELD_LABELS["incident_owner_state"]!,
        r.incident_owner_status,
      ),
    ],
  )}<p class="quiet">Independencia exigida: la revisión de evidencia y la aprobación de activación deben provenir de personas distintas; ninguna puede ser el sistema; las titularidades de kill switch e incidentes no pueden recaer en la persona aprobadora (pueden coincidir entre sí).</p>${codeList(
    "Decisiones pendientes (códigos canónicos)",
    [...r.pending_human_decisions],
  )}</section><section class="card"><h3>Límites de la primera ejecución</h3>${dl(
    [
      [
        FIELD_LABELS["allowed_first_run_data"]!,
        badge(r.allowed_data_classification ?? "unknown"),
      ],
      [
        FIELD_LABELS["maximum_requests"]!,
        text(r.ceilings.maximum_requests ?? "ausente"),
      ],
      [
        FIELD_LABELS["maximum_input_tokens"]!,
        text(r.ceilings.maximum_input_tokens_per_request ?? "ausente"),
      ],
      [
        FIELD_LABELS["maximum_output_tokens"]!,
        text(r.ceilings.maximum_output_tokens_per_request ?? "ausente"),
      ],
      [FIELD_LABELS["timeout_ms"]!, text(r.ceilings.timeout_ms ?? "ausente")],
      [
        FIELD_LABELS["automatic_retries"]!,
        text(r.ceilings.automatic_retries ?? "ausente"),
      ],
      [
        FIELD_LABELS["fallback_enabled"]!,
        yesNo(r.ceilings.fallback_enabled === true),
      ],
      [
        FIELD_LABELS["maximum_total_spend_usd"]!,
        text(r.ceilings.maximum_total_spend_usd ?? "ausente"),
      ],
    ],
  )}</section></div><section class="card"><h3>Caso de referencia sintético</h3>${dl(
    [
      [FIELD_LABELS["gold_case_readiness"]!, badge(g.outcome)],
      ["Campaña", badge(g.campaign_status ?? "unknown")],
      [
        FIELD_LABELS["gold_case_acceptance"]!,
        badge(g.acceptance_status ?? "unknown"),
      ],
      ["Identidad", code(g.source_artifact_id ?? "ausente")],
      [FIELD_LABELS["version"]!, text(g.version ?? "ausente")],
      ["Hash (abreviado)", hashSummary(g.source_artifact_hash)],
    ],
  )}<p class="quiet">El caso es completamente sintético: sin datos de clientes, personales, productivos ni regulados. No se ha ejecutado ninguna campaña ni existe resultado alguno; el estado preparado nunca representa una llamada al proveedor.</p>${disclosure(
    "Hash completo del caso de referencia",
    g.source_artifact_hash,
  )}</section><section class="card"><h3>Artefactos vinculados</h3><p class="quiet">Hashes abreviados; cada binding exacto queda verificado por el evaluador determinista y falla cerrado ante cualquier desvío.</p>${dl(
    r.bound_artifacts.map(
      (artifact) =>
        [
          artifact.name,
          artifact.hash
            ? `${hashSummary(artifact.hash)} <span class="quiet">(v${escapeHtml(artifact.version ?? "—")})</span>`
            : badge(artifact.status ?? "absent"),
        ] as const,
    ),
  )}${codeList(
    "Identidades y hashes completos",
    r.bound_artifacts.map(
      (artifact) =>
        `${artifact.name}: ${artifact.id ?? "sin resolver"} @ ${artifact.version ?? "—"} — ${artifact.hash ?? artifact.status ?? "ausente"}`,
    ),
  )}</section><section class="card"><h3>Bloqueos de la revisión</h3><p class="quiet">Bloqueos generados por los evaluadores de la revisión de activación y del caso de referencia; el listado canónico completo está en Bloqueos.</p><ul>${reviewBlockers
    .map((blocker) => {
      const summary = presentBlockerSummary(blocker);
      return `<li>${escapeHtml(summary.label)}${summary.known ? "" : untranslated()} ${code(blocker.blocker_code)}</li>`;
    })
    .join(
      "",
    )}</ul></section><section class="card"><h3>Próxima acción gobernada</h3><p>${nextAction ? escapeHtml(nextAction) : `${code(r.next_governed_action)}${untranslated()}`}</p><p class="quiet">Incluso una revisión elegible nunca autoriza ejecución, acceso a secretos ni habilitación de runtime: solo permite proponer un PR separado y revisado de configuración.</p></section>`;
}

function governance(model: OperatorReadModel): string {
  const grouped = groupBlockersForGovernance(model.blockers);
  return `<h2>Gobernanza</h2><p class="lead">Agrupación de presentación sobre los bloqueos existentes del modelo de lectura; ningún resultado de gobernanza se recalcula.</p>${blockedNotice(model)}<div class="grid2">${GOVERNANCE_GROUPS.map(
    (group) => {
      const matching = grouped.get(group.title) ?? [];
      const statusBadge = matching.length
        ? badge("blocked")
        : `<span class="badge status-none">Sin bloqueos registrados</span>`;
      const resolutions = [
        ...new Set(matching.flatMap((b) => b.resolvable_by)),
      ].map((kind) => presentResolution(kind).label);
      const evaluators = [
        ...new Set(matching.map((b) => b.source_evaluator)),
      ].map((evaluator) => presentEvaluator(evaluator).label);
      return `<section class="card"><h3>${escapeHtml(group.title)} ${statusBadge}</h3><p>${escapeHtml(group.description)}</p>${dl(
        [
          ["Por qué importa", text(group.why_it_matters)],
          [
            FIELD_LABELS["execution_impact"]!,
            matching.some((b) => b.blocking_execution)
              ? "La ejecución permanece bloqueada."
              : "Sin impacto bloqueante registrado.",
          ],
          [
            "Revisión o resolución responsable",
            resolutions.length ? text(resolutions.join(", ")) : "—",
          ],
          [FIELD_LABELS["blocker_count"]!, text(matching.length)],
          [
            FIELD_LABELS["source_evaluator"]!,
            evaluators.length ? text(evaluators.join(", ")) : "—",
          ],
        ],
      )}${codeList(
        "Códigos canónicos de bloqueo",
        matching.map((b) => b.blocker_code),
      )}</section>`;
    },
  ).join("")}</div>`;
}

const filterOptions = (
  values: readonly string[],
  labels: Readonly<Record<string, string>>,
): string =>
  [...new Set(values)]
    .map(
      (value) =>
        `<option value="${escapeHtml(value)}">${escapeHtml(labels[value] ?? value)}</option>`,
    )
    .join("");

function blockers(model: OperatorReadModel): string {
  const total = model.blockers.length;
  const record = (blocker: OperatorBlocker): string => {
    const summary = presentBlockerSummary(blocker);
    const roles = [
      ...new Set(
        model.required_human_actions
          .filter((action) =>
            action.source_blocker_codes.includes(blocker.blocker_code),
          )
          .map((action) => presentOwnerRole(action.owner_role).label),
      ),
    ];
    return `<li data-blocker data-severity="${escapeHtml(blocker.severity)}" data-category="${escapeHtml(blocker.category)}" data-provider="${escapeHtml(blocker.provider_id ?? "none")}" data-resolution="${escapeHtml(blocker.resolvable_by.join(" "))}" data-blocking="${blocker.blocking_execution}"><article class="card"><h3>${escapeHtml(summary.label)}${summary.known ? "" : untranslated()} ${severityBadge(blocker.severity)}</h3>${dl(
      [
        [
          FIELD_LABELS["category"]!,
          text(BLOCKER_CATEGORY_LABELS[blocker.category] ?? blocker.category) +
            (BLOCKER_CATEGORY_LABELS[blocker.category] ? "" : untranslated()),
        ],
        [
          FIELD_LABELS["scope"]!,
          `${code(blocker.provider_id ?? "ninguno")} / ${code(blocker.candidate_id ?? "ninguno")}`,
        ],
        [
          FIELD_LABELS["execution_impact"]!,
          blocker.blocking_execution
            ? "Bloquea la ejecución."
            : "No bloquea la ejecución.",
        ],
        [
          FIELD_LABELS["resolution"]!,
          text(
            blocker.resolvable_by
              .map((kind) => presentResolution(kind).label)
              .join(", "),
          ),
        ],
        [
          FIELD_LABELS["owner_role"]!,
          roles.length ? text(roles.join(", ")) : "—",
        ],
        [
          FIELD_LABELS["source_evaluator"]!,
          `${text(presentEvaluator(blocker.source_evaluator).label)} (${code(blocker.source_evaluator)})`,
        ],
      ],
    )}${codeList("Detalle técnico canónico", [
      `blocker_code: ${blocker.blocker_code}`,
      `source_artifact_id: ${blocker.source_artifact_id ?? "ausente"}`,
      `source_artifact_hash: ${blocker.source_artifact_hash ?? "ausente"}`,
    ])}</article></li>`;
  };
  return `<h2>Bloqueos</h2><p class="lead">Registros de bloqueo del modelo de lectura, en su orden determinista original. Los filtros son de solo lectura y no alteran el orden.</p><div class="filters" aria-label="Filtros de bloqueos (solo lectura)"><label>Severidad<select data-filter="severity"><option value="">Todas</option>${filterOptions(
    model.blockers.map((b) => b.severity),
    SEVERITY_LABELS,
  )}</select></label><label>Categoría<select data-filter="category"><option value="">Todas</option>${filterOptions(
    model.blockers.map((b) => b.category),
    BLOCKER_CATEGORY_LABELS,
  )}</select></label><label>Proveedor<select data-filter="provider"><option value="">Todos</option>${filterOptions(
    model.blockers.map((b) => b.provider_id ?? "none"),
    {},
  )}</select></label><label>Clase de resolución<select data-filter="resolution"><option value="">Todas</option>${filterOptions(
    model.blockers.flatMap((b) => b.resolvable_by),
    RESOLUTION_LABELS,
  )}</select></label><label>Bloquea la ejecución<select data-filter="blocking"><option value="">Todos</option><option value="true">Sí</option><option value="false">No</option></select></label></div><p class="quiet" id="blocker-count" aria-live="polite">Mostrando ${total} de ${total} bloqueos</p><ol class="records">${model.blockers
    .map(record)
    .join(
      "",
    )}</ol><script>(function(){var selects=document.querySelectorAll('[data-filter]');var items=document.querySelectorAll('[data-blocker]');var count=document.getElementById('blocker-count');function apply(){var active={};selects.forEach(function(s){if(s.value)active[s.dataset.filter]=s.value});var visible=0;items.forEach(function(item){var hide=Object.keys(active).some(function(key){return (item.dataset[key]||'').split(' ').indexOf(active[key])===-1});item.hidden=hide;if(!hide)visible+=1});if(count)count.textContent='Mostrando '+visible+' de '+items.length+' bloqueos'}selects.forEach(function(s){s.addEventListener('change',apply)})})()</script>`;
}

function actions(model: OperatorReadModel): string {
  const record = (action: OperatorRequiredAction): string => {
    const title = presentRequiredActionTitle(action);
    const impact = presentExecutionImpact(action.execution_impact);
    const resolutionKind = action.action_code.startsWith("resolve:")
      ? RESOLUTION_LABELS[action.action_code.slice("resolve:".length)]
      : undefined;
    const why = resolutionKind
      ? `Existen ${action.source_blocker_codes.length} bloqueos gobernados que requieren ${resolutionKind.toLowerCase()}.`
      : `Existen ${action.source_blocker_codes.length} bloqueos gobernados asociados a esta acción.`;
    return `<li><article class="card"><h3>${escapeHtml(title.label)}${title.known ? "" : untranslated()} ${badge(action.status)}</h3>${dl(
      [
        [
          FIELD_LABELS["owner_role"]!,
          `${text(presentOwnerRole(action.owner_role).label)} (${code(action.owner_role)})`,
        ],
        ["Por qué es requerida", text(why)],
        [
          FIELD_LABELS["related_blockers"]!,
          text(action.source_blocker_codes.length),
        ],
        [
          FIELD_LABELS["prerequisites"]!,
          action.prerequisite_actions.length
            ? text(action.prerequisite_actions.join(", "))
            : "Ninguno",
        ],
        [
          FIELD_LABELS["required_artifact"]!,
          action.required_artifact ? code(action.required_artifact) : "—",
        ],
        [
          FIELD_LABELS["execution_impact"]!,
          `${text(impact.label)}${impact.known ? "" : untranslated()}`,
        ],
      ],
    )}${codeList("Detalle técnico canónico", [
      `action_code: ${action.action_code}`,
      ...action.source_blocker_codes.map((code_) => `blocker: ${code_}`),
    ])}</article></li>`;
  };
  return `<h2>Acciones requeridas</h2><p class="lead">Plan operativo informativo, en el orden determinista del modelo de lectura. No hay asignaciones, transiciones, aprobaciones, comentarios ni persistencia.</p><ol class="records">${model.required_human_actions.map(record).join("")}</ol>`;
}

function execution(model: OperatorReadModel): string {
  const m = model.models[0];
  const r = model.routes[0];
  const stages: readonly {
    canonical: keyof typeof EXECUTION_STAGE_LABELS;
    status: string;
    explanation: string;
  }[] = [
    {
      canonical: "registry",
      status: m ? (m.enabled ? "enabled" : "disabled") : "absent",
      explanation: m
        ? m.enabled
          ? "El registro del modelo está habilitado."
          : "El registro del modelo existe pero está deshabilitado."
        : "No hay modelos registrados.",
    },
    {
      canonical: "resolution",
      status: r ? (r.enabled ? "available" : "blocked") : "absent",
      explanation: r
        ? r.enabled
          ? "La ruta gobernada está habilitada."
          : "La ruta gobernada está deshabilitada; no existe una resolución ejecutable."
        : "No hay rutas registradas.",
    },
    {
      canonical: "authorization",
      status:
        model.authorization.status === "no_policy_issued"
          ? "absent"
          : model.authorization.status,
      explanation:
        model.authorization.status === "no_policy_issued"
          ? "No se ha emitido ninguna autorización de ejecución."
          : "Estado canónico de autorización según el modelo de lectura.",
    },
    {
      canonical: "exact_policy",
      status: model.authorization.exact_policy_hash ? "available" : "absent",
      explanation: model.authorization.exact_policy_hash
        ? "Existe una política exacta emitida."
        : "No existe una política exacta.",
    },
    {
      canonical: "atomic_consumption",
      status: model.consumption.status,
      explanation:
        model.consumption.status === "not_attempted"
          ? "No se ha intentado ningún consumo de autorización."
          : model.consumption.status === "consumed"
            ? "Se registró un consumo atómico."
            : "Un intento de consumo fue rechazado.",
    },
    {
      canonical: "gateway",
      status: model.gateway_adapter_state.gateway_invoked
        ? "complete"
        : "not_invoked",
      explanation: model.gateway_adapter_state.gateway_invoked
        ? "El gateway registró una invocación."
        : "El gateway no ha sido invocado.",
    },
    {
      canonical: "adapter",
      status: model.gateway_adapter_state.adapter_status,
      explanation:
        model.gateway_adapter_state.adapter_status === "enabled"
          ? "El adaptador de transporte está habilitado."
          : "El adaptador de transporte está deshabilitado.",
    },
  ];
  const facts: string[] = [];
  if (model.authorization.exact_policy_hash === null)
    facts.push("No existe una política exacta.");
  if (
    model.authorization.status === "no_policy_issued" &&
    model.authorization.issued_count === 0
  )
    facts.push("No se ha emitido ninguna autorización de ejecución.");
  if (
    model.consumption.status === "not_attempted" &&
    model.consumption.attempted_count === 0
  )
    facts.push("No se ha intentado ningún consumo de autorización.");
  if (
    model.gateway_adapter_state.gateway_invoked === false &&
    model.gateway_adapter_state.transport_invoked === false
  ) {
    facts.push("No se ha realizado ninguna llamada al proveedor.");
    facts.push("No existe ninguna salida de modelo.");
  }
  if (
    model.consumption.consumed_count === 0 &&
    model.gateway_adapter_state.transport_invoked === false
  )
    facts.push("No existe uso facturado.");
  return `<h2>Ejecución</h2><p class="lead">Frontera de ejecución gobernada. Cadena canónica: ${code("Registro → Resolución → Autorización → Política exacta → Consumo atómico → Gateway → Adaptador")}.</p><div class="chain" aria-label="Cadena de ejecución gobernada">${stages
    .map(
      (stage) =>
        `<div class="stage"><strong>${escapeHtml(EXECUTION_STAGE_LABELS[stage.canonical])}</strong><br><code>${escapeHtml(stage.canonical).replaceAll("_", "_<wbr>")}</code><br>${badge(stage.status)}<p>${escapeHtml(stage.explanation)}</p></div>`,
    )
    .join(
      "",
    )}</div><section class="card"><h3>Hechos actuales de OpenRouter</h3><ul>${facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join("")}</ul><p class="quiet">Distinción de estados: <strong>Ausente</strong> significa que el artefacto no existe; <strong>Bloqueado</strong>, que la gobernanza lo impide; <strong>Deshabilitado</strong>, que está apagado por configuración gobernada; <strong>No intentado</strong>, que nunca se intentó.</p></section>`;
}

function audit(model: OperatorReadModel): string {
  const v = model.validation_evidence_metadata;
  const m = model.models[0];
  const r = model.routes[0];
  const profile = model.execution_profiles[0];
  const evidencePaths = model.providers.flatMap(
    (provider) =>
      (provider["evidence_paths"] as readonly string[] | undefined) ?? [],
  );
  const pathFor = (fragment: string): string | null =>
    model.audit_references.find((path) => path.includes(fragment)) ?? null;
  const artifact = (entry: {
    name: string;
    purpose: string;
    id: string | null;
    version: string | null;
    status: string | null;
    hash: string | null;
    path: string | null;
  }): string =>
    `<section class="card"><h4>${escapeHtml(entry.name)}</h4>${dl([
      ["Propósito", text(entry.purpose)],
      [FIELD_LABELS["version"]!, text(entry.version ?? "ausente")],
      ["Estado", entry.status === null ? badge("absent") : badge(entry.status)],
      ["Hash (abreviado)", hashSummary(entry.hash)],
    ])}${codeList("Identidad completa", [
      `id: ${entry.id ?? "ausente"}`,
      `hash: ${entry.hash ?? "ausente"}`,
      `ruta: ${entry.path ?? "ausente"}`,
    ])}</section>`;
  return `<h2>Auditoría</h2><p class="lead">Identidades, artefactos gobernados y metadatos aprobados para auditoría. No se exponen documentos fuente completos.</p><section class="card"><h3>Identidad de la evaluación</h3>${dl(
    [
      [FIELD_LABELS["contract_version"]!, text(model.contract_version)],
      [
        FIELD_LABELS["read_model_hash"]!,
        hashSummary(model.system_summary.read_model_hash),
      ],
      [
        FIELD_LABELS["evaluated_at"]!,
        text(model.system_summary.last_evaluated_at),
      ],
      [
        FIELD_LABELS["test_totals"]!,
        v.test_totals
          ? text(
              `${v.test_totals.tests} pruebas / ${v.test_totals.suites} suites`,
            )
          : "No inyectados",
      ],
    ],
  )}${disclosure(
    "Hash completo del modelo de lectura",
    model.system_summary.read_model_hash,
  )}</section><h3>Artefactos gobernados</h3><div class="grid2">${[
    artifact({
      name: "Dossier de preparación",
      purpose: "Evidencia gobernada de preparación del candidato.",
      id: v.dossier_id,
      version: v.dossier_version,
      status: v.dossier_outcome,
      hash: v.dossier_hash,
      path: pathFor("readiness-dossier"),
    }),
    artifact({
      name: "Paquete de evidencia externa",
      purpose: "Colección revisable de fuentes externas del candidato.",
      id: v.evidence_pack_id,
      version: v.evidence_pack_version,
      status: v.evidence_review_status,
      hash: v.evidence_pack_hash,
      path: pathFor("external-evidence-pack"),
    }),
    artifact({
      name: "Propuesta de sandbox",
      purpose: "Propuesta gobernada de habilitación de sandbox.",
      id: v.proposal_id,
      version: model.sandbox_proposals[0]?.version ?? null,
      status: v.proposal_outcome,
      hash: v.proposal_hash,
      path: pathFor("sandbox-enablement-proposal"),
    }),
    artifact({
      name: "Configuración de runtime",
      purpose: "Configuración exacta del runtime sandbox (metadatos).",
      id: v.runtime_config_id,
      version: v.runtime_config_version,
      status: v.preflight_outcome,
      hash: v.runtime_config_hash,
      path: pathFor("sandbox-runtime"),
    }),
    artifact({
      name: "Registro del modelo",
      purpose: "Entrada gobernada del registro de modelos.",
      id: m?.entry_id ?? null,
      version: m?.version ?? null,
      status: m?.lifecycle ?? null,
      hash: m?.hash ?? null,
      path: pathFor("model-registry"),
    }),
    artifact({
      name: "Registro de ruta",
      purpose: "Entrada gobernada del registro de rutas.",
      id: r?.record_id ?? null,
      version: r?.version ?? null,
      status: r?.lifecycle ?? null,
      hash: r?.hash ?? null,
      path: pathFor("route-registry"),
    }),
    artifact({
      name: "Perfil de ejecución",
      purpose: "Perfil de ejecución candidato (deshabilitado).",
      id: profile?.profile_id ?? null,
      version: profile?.version ?? null,
      status: profile?.lifecycle ?? null,
      hash: profile?.hash ?? null,
      path: pathFor("execution-profiles"),
    }),
    artifact({
      name: "Revisión humana de activación",
      purpose: "Contrato gobernado de revisión humana del sandbox.",
      id: v.activation_review_id,
      version: model.activation_review.version,
      status: v.activation_review_outcome,
      hash: v.activation_review_hash,
      path: pathFor("activation-review"),
    }),
    artifact({
      name: "Caso de referencia sintético",
      purpose: "Caso de referencia sintético y contrato de aceptación.",
      id: v.gold_case_id,
      version: model.gold_case_state.version,
      status: v.gold_case_outcome,
      hash: v.gold_case_hash,
      path: pathFor("gold-case"),
    }),
  ].join(
    "",
  )}</div><section class="card"><h3>Evidencia y documentación</h3>${codeList(
    "Informes y documentación (rutas del repositorio)",
    [
      ...evidencePaths,
      "docs/architecture/ai-lab-operator-console.md",
      "docs/architecture/ai-roadmap-dependency-map.md",
    ],
  )}</section><section class="card"><h3>Metadatos técnicos</h3>${codeList(
    "Artefactos gobernados aprobados (rutas del repositorio)",
    [...model.audit_references],
  )}</section>`;
}

export const OPERATOR_CONSOLE_PATHS = new Set([
  ...ROUTES.map(([, path]) => path),
  "/operator/providers/openrouter",
]);

export function renderOperatorConsole(
  model: OperatorReadModel,
  pathname: string,
): string {
  const content =
    pathname === "/operator"
      ? overview(model)
      : pathname === "/operator/providers"
        ? providers(model)
        : pathname === "/operator/providers/openrouter"
          ? openrouter(model)
          : pathname === "/operator/review"
            ? review(model)
            : pathname === "/operator/governance"
              ? governance(model)
              : pathname === "/operator/blockers"
                ? blockers(model)
                : pathname === "/operator/actions"
                  ? actions(model)
                  : pathname === "/operator/execution"
                    ? execution(model)
                    : audit(model);
  return shell(model, pathname, content);
}

export function renderOperatorInvalidState(): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Consola del operador — Estado inválido</title></head><body><main><h1>Estado del repositorio inválido</h1><p>El Operator Read Model falló cerrado (fail-closed). Revise la validación del repositorio localmente; no se intentó ninguna ejecución.</p></main></body></html>`;
}

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
  presentReasonCode,
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
import { buildArcaReviewConsoleViewModel } from "./arca-review-console-view-model.js";
import {
  buildMissionBoard,
  missionStateChips,
  MISSION_COLUMNS,
  MISSION_COLUMN_EMPTY_TITLES,
  MISSION_COLUMN_HINTS,
  MISSION_COLUMN_LABELS,
  type MissionItem,
} from "./mission-center.js";
import {
  LOCAL_DEVELOPMENT_IDENTITY,
  type ApplicationIdentity,
} from "../application/application-access.js";
import {
  APPLICATION_ROUTES,
  renderApplicationShell,
  statusToneFor,
} from "../application/application-shell.js";
import { REPOSITORY_CURRENT_BLOCKED_STATUS } from "../application/repository-current-status.js";

type ShellEnvironment = "development" | "preview" | "production";

const NEXT_GOVERNED_MILESTONE =
  "Activación controlada del entorno aislado (una sola llamada sintética), solo tras resolver los bloqueos gobernados y registrar las decisiones humanas de la revisión de activación." as const;

const NEXT_ACTION_LABELS: Readonly<Record<string, string>> = {
  repair_invalid_review_artifact:
    "Reparar el artefacto de revisión inválido mediante un cambio de código revisado.",
  resolve_governed_blockers:
    "Resolver los bloqueos gobernados listados antes de registrar decisiones humanas.",
  record_human_decisions:
    "Registrar las decisiones humanas pendientes (revisión de evidencia, aprobación, titularidades y aceptación del caso de referencia).",
  propose_activation_configuration_pr:
    "Proponer una solicitud de cambios separada para configurar la activación (una sola llamada); la ejecución seguirá sin autorizarse en esta revisión.",
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
  const body = `<span class="badge tone-${statusToneFor(presented.canonical)}" data-status="${escapeHtml(presented.canonical)}">${escapeHtml(presented.label)}</span>`;
  return presented.known
    ? body
    : `${body}${untranslated()}${disclosure("Valor técnico canónico", presented.canonical)}`;
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

const modelDisplayName = (modelId: string): string =>
  modelId.includes("minimax-m2.7")
    ? "MiniMax M2.7"
    : modelId.includes("glm-5.2")
      ? "GLM-5.2"
      : "Modelo registrado";

function shell(
  model: OperatorReadModel,
  pathname: string,
  content: string,
  identity: ApplicationIdentity,
  deploymentEnvironment: ShellEnvironment,
): string {
  return renderApplicationShell({
    pathname,
    identity,
    deployment_environment: deploymentEnvironment,
    evaluated_at: model.system_summary.last_evaluated_at,
    read_model_hash: model.system_summary.read_model_hash,
    overall_status: model.system_summary.overall_status,
    content,
    ...(pathname === "/operator/arca-review"
      ? { title: "Revisión ARCA — Consola del operador" }
      : {}),
  });
}

const blockedNotice = (model: OperatorReadModel): string =>
  model.system_summary.overall_status === "healthy"
    ? ""
    : `<div class="notice"><strong>Bloqueado es un estado gobernado y seguro, no una falla de la aplicación.</strong><br>La consola muestra la decisión del repositorio tal como fue evaluada y no ofrece controles de ejecución ni de aprobación.</div>`;

const missionCard = (item: MissionItem, selected: boolean): string =>
  `<button class="mission-card" type="button" data-mission-card data-mission="${escapeHtml(item.id)}" data-column="${escapeHtml(item.column)}" aria-pressed="${selected ? "true" : "false"}" aria-controls="mission-panel-${escapeHtml(item.id)}"><span class="mission-card-title">${escapeHtml(item.title)}</span><span class="mission-card-summary">${escapeHtml(item.summary)}</span><span class="mission-card-meta"><span class="badge tone-${item.status_tone}">${escapeHtml(item.status_label)}</span>${item.owner_label ? `<span class="quiet">${escapeHtml(item.owner_label)}</span>` : ""}</span></button>`;

const missionPanel = (item: MissionItem, selected: boolean): string =>
  `<section class="mission-panel" id="mission-panel-${escapeHtml(item.id)}" data-mission-panel="${escapeHtml(item.id)}"${selected ? "" : " hidden"}><h3>${escapeHtml(item.title)}</h3><p class="quiet">${escapeHtml(item.summary)}</p><p><span class="badge tone-${item.status_tone}">${escapeHtml(item.status_label)}</span></p>${dl(
    item.facts.map(([key, value]) => [key, text(value)] as const),
  )}${item.technical.length > 0 ? codeList("Valores técnicos", item.technical) : ""}${
    item.detail_path
      ? `<p class="panel-actions"><a href="${item.detail_path}">${escapeHtml(item.detail_label)} →</a></p>`
      : ""
  }<p class="quiet">Esta interfaz solo describe el estado gobernado; no ejecuta ni aprueba nada.</p></section>`;

/**
 * Three-column read-only board plus the contextual panel. The column meaning
 * is shown only when a column is empty, so a populated board stays quiet.
 */
function missionBoard(model: OperatorReadModel): string {
  const board = buildMissionBoard(model);
  const columns = MISSION_COLUMNS.map((column) => {
    const items = board.items.filter((item) => item.column === column);
    const body =
      items.length === 0
        ? `<p class="board-empty" data-column-empty="${column}"><strong>${escapeHtml(MISSION_COLUMN_EMPTY_TITLES[column])}</strong>${escapeHtml(MISSION_COLUMN_HINTS[column])}</p>`
        : `${items
            .map((item) => missionCard(item, item.id === board.selected_id))
            .join(
              "",
            )}<p class="board-empty" data-column-empty="${column}" hidden><strong>Sin coincidencias</strong>Ningún elemento de esta columna coincide con la búsqueda.</p>`;
    return `<section class="board-column" data-column="${column}" aria-label="${escapeHtml(MISSION_COLUMN_LABELS[column])}"><div class="board-column-head"><h3>${escapeHtml(MISSION_COLUMN_LABELS[column])}</h3><span class="column-count" data-column-count="${column}">${items.length}</span></div>${body}</section>`;
  }).join("");
  return `<div class="board-layout"><div class="board">${columns}</div><aside class="context-panel" aria-label="Detalle del elemento seleccionado"><p class="panel-kicker">Detalle</p><section class="mission-panel" data-mission-panel="" ${board.selected_id === null ? "" : "hidden"}><h3>Ningún elemento seleccionado</h3><p class="quiet">Seleccione una tarjeta del tablero para ver aquí su detalle, su responsable y su vista gobernada.</p><p class="quiet">Esta interfaz solo describe el estado gobernado; no ejecuta ni aprueba nada.</p></section>${board.items
    .map((item) => missionPanel(item, item.id === board.selected_id))
    .join("")}</aside></div>`;
}

function missionCenter(model: OperatorReadModel): string {
  return `<h2>Panel operativo</h2><p class="lead">Qué está en curso, qué necesita una decisión humana y qué ya quedó resuelto. Seleccione un elemento para ver su detalle.</p><div class="state-strip">${missionStateChips(
    model,
  )
    .map(
      (chip) =>
        `<span class="state-chip">${escapeHtml(chip.label)}: <strong>${escapeHtml(chip.value)}</strong></span>`,
    )
    .join(
      "",
    )}</div>${missionBoard(model)}<section class="card"><h3>Próximo hito gobernado</h3><p>${escapeHtml(NEXT_GOVERNED_MILESTONE)}</p><p class="quiet">Para el detalle técnico completo, abra <a href="/operator/estado">Estado del sistema</a>.</p></section>`;
}

function missionsLanding(model: OperatorReadModel): string {
  const attention = buildMissionBoard(model).items.filter(
    (item) => item.column === "necesita_atencion",
  );
  const area = (
    title: string,
    path: string,
    stateLabel: string,
    description: string,
  ): string =>
    `<section class="card"><h3>${escapeHtml(title)}</h3><p><span class="badge tone-blocked">${escapeHtml(stateLabel)}</span></p><p class="quiet">${escapeHtml(description)}</p><p><a href="${path}">Abrir ${escapeHtml(title)} →</a></p></section>`;
  return `<h2>Centro de misiones</h2><p class="lead">Áreas operativas avanzadas y los elementos que hoy requieren una decisión humana.</p><div class="grid2">${area(
    "ARCA",
    "/operator/operations/arca",
    "Ejecución bloqueada",
    "Flujo ARCA gobernado en modo observación.",
  )}${area(
    "Adquisiciones",
    "/operator/operations/acquisitions",
    "Interruptor de seguridad activo",
    "AI-131 permanece bloqueado; no hay adquisición desde esta interfaz.",
  )}${area(
    "Exportaciones",
    "/operator/operations/exports",
    "Interruptor de seguridad activo",
    "AI-132 permanece bloqueado; no existe autoridad de exportación.",
  )}${area(
    "Recuperación",
    "/operator/operations/recovery",
    "Sin fuente disponible",
    "No hay un modelo de lectura de recuperación utilizable.",
  )}</div><section class="card"><h3>Necesita atención</h3>${
    attention.length === 0
      ? `<p class="quiet">No hay elementos detenidos en la proyección actual.</p>`
      : `<ul class="status-list">${attention
          .map(
            (item) =>
              `<li><span>${escapeHtml(item.title)}</span><span class="badge tone-${item.status_tone}">${escapeHtml(item.status_label)}</span></li>`,
          )
          .join("")}</ul>`
  }<p class="quiet">El tablero completo está en <a href="/operator">Inicio</a>.</p></section>`;
}

function reviewsLanding(model: OperatorReadModel): string {
  const review = model.activation_review;
  return `<h2>Revisiones</h2><p class="lead">Decisiones humanas pendientes y artefactos ya aprobados. Ninguna decisión se toma desde esta interfaz.</p><div class="grid-metrics">${metric(
    "Revisiones pendientes",
    text(model.system_summary.pending_approvals),
  )}${metric(
    "Revisión de evidencia",
    badge(review.evidence_review_status),
  )}${metric(
    "Aprobación de activación",
    badge(review.activation_approval_status),
  )}${metric(
    "Artefacto aprobado ARCA",
    model.arca_approved_artifact.present ? badge("approved") : badge("absent"),
  )}</div><section class="card"><h3>Decisiones humanas pendientes</h3>${
    review.pending_human_decisions.length === 0
      ? `<p class="quiet">Ninguna decisión pendiente registrada.</p>`
      : `<ul>${review.pending_human_decisions
          .map((decision) => {
            const presented = presentReasonCode(decision);
            return `<li>${escapeHtml(presented.label)}${presented.known ? "" : untranslated()}</li>`;
          })
          .join("")}</ul>${codeList("Códigos canónicos", [
          ...review.pending_human_decisions,
        ])}`
  }</section><div class="grid2"><section class="card"><h3>Revisión humana</h3><p class="quiet">Estado gobernado de la revisión de activación.</p><p><a href="/operator/review">Abrir revisión humana →</a></p></section><section class="card"><h3>Revisión ARCA</h3><p class="quiet">Trazabilidad del candidato ARCA y su decisión registrada.</p><p><a href="/operator/arca-review">Abrir revisión ARCA →</a></p></section></div>`;
}

function modelsLanding(model: OperatorReadModel): string {
  const provider = model.providers[0] ?? {};
  const candidate = model.models[0];
  return `<h2>Modelos e integraciones</h2><p class="lead">Qué modelos, rutas y entornos están registrados, y si su ejecución está permitida.</p><div class="grid-metrics">${metric(
    "Proveedor evaluado",
    code(provider["provider_id"] ?? "ausente"),
  )}${metric(
    "Ejecución de modelos",
    provider["execution_allowed"] === true
      ? badge("enabled")
      : `<span class="badge tone-blocked">No permitida</span>`,
  )}${metric("Modelos registrados", text(model.models.length))}${metric(
    "Rutas registradas",
    text(model.routes.length),
  )}${metric(
    "Modelo candidato",
    candidate
      ? `${text(modelDisplayName(candidate.model_id))}${disclosure("Identificador canónico del modelo", candidate.model_id)}`
      : badge("absent"),
  )}</div><div class="grid2"><section class="card"><h3>Proveedores</h3><p class="quiet">Estado gobernado del proveedor evaluado y su evidencia.</p><p><a href="/operator/providers">Abrir proveedores →</a></p></section><section class="card"><h3>Registro</h3><p class="quiet">Identidades de modelos y rutas del modelo de lectura.</p><p><a href="/operator/models/registry">Abrir registro →</a></p></section><section class="card"><h3>Torneos</h3><p class="quiet">Candidatos registrados; sin acciones de escritura.</p><p><a href="/operator/models/tournaments">Abrir torneos →</a></p></section><section class="card"><h3>Entornos</h3><p class="quiet">AI LAB, Vercel Eve y Cloudflare: evidencia, no activación.</p><p><a href="/operator/runtimes/ai-lab">Abrir entornos →</a></p></section></div>`;
}

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
      "El interruptor de seguridad permanece activo: cualquier intento de ejecución falla de forma segura.",
    );
  const top = topBlockersBySeverity(model.blockers, 5);
  return `<h2>Estado del sistema</h2><p class="lead">Detalle técnico del estado gobernado del laboratorio y del proveedor evaluado.</p>${blockedNotice(model)}<div class="grid-metrics">${metric("Estado gobernado", badge(s.overall_status))}${metric("Ejecución de modelos", executionAllowed ? badge("enabled") : `<span class="badge tone-blocked">No permitida</span>`)}${metric("Proveedor evaluado", code(provider["provider_id"] ?? "ausente"))}${metric("Candidato actual", code(candidate?.model_id ?? "ausente"))}${metric("Bloqueos activos", text(s.active_blockers))}${metric("Acciones requeridas", text(model.required_human_actions.length))}${metric("Revisiones pendientes", text(s.pending_approvals))}${metric("Evaluación", text(s.last_evaluated_at))}${metric("Versión del modelo de lectura", text(s.read_model_contract_version))}${metric("Hash (abreviado)", code(shortHash(s.read_model_hash)))}</div><section class="card"><h3>Situación actual</h3><ul>${situacion.map((item) => `<li>${item}</li>`).join("")}</ul></section><section class="card"><h3>Bloqueos principales</h3><p class="quiet">Los cinco bloqueos de mayor prioridad (orden estable por severidad; el listado canónico completo está en Bloqueos).</p><ul>${top
    .map((blocker) => {
      const summary = presentBlockerSummary(blocker);
      return `<li>${escapeHtml(summary.label)}${summary.known ? "" : untranslated()} ${severityBadge(blocker.severity)}${disclosure("Código canónico", blocker.blocker_code)}</li>`;
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
    )}</ol><p><strong>Próximo hito gobernado:</strong> ${escapeHtml(NEXT_GOVERNED_MILESTONE)}</p></section>${repositoryCurrentOverviewPanels(model)}<section class="card"><h3>Instantánea determinista</h3>${dl(
    [
      [FIELD_LABELS["evaluated_at"]!, text(s.last_evaluated_at)],
      [FIELD_LABELS["contract_version"]!, text(s.read_model_contract_version)],
      [FIELD_LABELS["read_model_hash"]!, hashSummary(s.read_model_hash)],
    ],
  )}${disclosure("Hash completo del modelo de lectura", s.read_model_hash)}</section>`;
}

function repositoryCurrentOverviewPanels(model: OperatorReadModel): string {
  const state = REPOSITORY_CURRENT_BLOCKED_STATUS;
  const approvedArtifact = model.arca_approved_artifact.present;
  const recentEvidence = model.audit_references.slice(0, 4);
  return `<div class="grid2"><section class="card"><span class="panel-kicker">Salud del sistema</span><h3>Fronteras operativas</h3><ul class="status-list"><li><span>Planificador</span>${badge(state.scheduler)}</li><li><span>Interruptor de seguridad AI-131</span>${badge(state.ai_131_kill_switch)}</li><li><span>Interruptor de seguridad AI-132</span>${badge(state.ai_132_kill_switch)}</li><li><span>Interruptor de seguridad AI-133</span>${badge(state.ai_133_kill_switch)}</li><li><span>Activación</span><span class="badge tone-blocked">Ninguna</span></li><li><span>Ejecución en producción</span><span class="badge tone-blocked">Ninguno</span></li></ul></section><section class="card"><span class="panel-kicker">Cola de revisión</span><h3>Revisión y artefactos</h3><ul class="status-list"><li><span>Revisiones pendientes</span><strong>${text(model.system_summary.pending_approvals)}</strong></li><li><span>Artefacto aprobado ARCA</span>${approvedArtifact ? badge("approved") : badge("absent")}</li><li><span>Recuperación requerida</span>${badge(state.recovery_required)}</li><li><span>Visibilidad de costos</span>${badge(state.cost_visibility)}</li></ul><p class="quiet">Los valores no disponibles permanecen explícitos; la interfaz no infiere costos ni estados de recuperación.</p></section><section class="card"><span class="panel-kicker">Evidencia</span><h3>Actividad reciente disponible</h3>${codeList("Referencias del estado actual del repositorio", recentEvidence)}<p class="quiet">Orden de referencias del modelo de lectura; no representa actividad productiva.</p></section><section class="card"><span class="panel-kicker">Entornos</span><h3>Proveedores y entornos</h3><ul class="status-list"><li><span>OpenRouter</span>${badge(model.providers[0]?.["execution_allowed"] === true ? "enabled" : "blocked")}</li><li><span>Planificador AI LAB</span>${badge(state.scheduler)}</li><li><span>Vercel Eve</span>${badge("evidence_incomplete")}</li><li><span>Cloudflare</span>${badge("evidence_incomplete")}</li></ul></section></div><section class="card"><span class="panel-kicker">Frontera de autoridad</span><h3>Autoridades ausentes</h3>${dl(
    [
      ["Publicación", yesNo(state.publication_authority)],
      ["Importación", yesNo(state.import_authority)],
      ["Despliegue", yesNo(state.deployment_authority)],
      [
        "Escritura en base externa",
        yesNo(state.external_database_write_authority),
      ],
      ["Acceso vlatam-global", yesNo(state.vlatam_global_access)],
    ],
  )}${codeList("Fuentes de la proyección bloqueada", state.evidence_paths)}</section>`;
}

function providers(model: OperatorReadModel): string {
  return `<h2>Proveedores</h2><p class="lead">Cada tarjeta se genera desde el modelo de lectura del operador; la consola no interpreta artefactos del proveedor.</p>${model.providers
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
      const providerName =
        providerId === "openrouter" ? "OpenRouter" : providerId;
      const executionAllowed = p["execution_allowed"] === true;
      const blockerCount =
        (p["reason_codes"] as readonly unknown[] | undefined)?.length ?? 0;
      const explanation = `${providerName} está disponible para evaluación. Su visibilidad y la evidencia del repositorio no conceden autoridad ni habilitan la ejecución.`;
      const detailLink =
        providerId === "openrouter"
          ? `<p><a href="/operator/providers/openrouter">Ver detalle gobernado</a></p>`
          : "";
      return `<article class="card"><h3>${escapeHtml(p["display_name"] || providerName)} ${badge(executionAllowed ? "healthy" : "blocked")}</h3>${dl(
        [
          [FIELD_LABELS["provider_id"]!, code(providerId)],
          [
            FIELD_LABELS["candidate_model"]!,
            candidate ? code(candidate.model_id) : badge("absent"),
          ],
          ["Estado del proveedor", badge(p["provider_visibility"])],
          [FIELD_LABELS["execution_status"]!, badge(p["execution_status"])],
          [FIELD_LABELS["authority_status"]!, badge(p["authority_status"])],
          [FIELD_LABELS["blocker_count"]!, text(blockerCount)],
        ],
      )}<p>${escapeHtml(explanation)}</p><div class="grid2"><section class="card"><h4>Evidencia y evaluación</h4>${dl(
        [
          [
            FIELD_LABELS["evidence_availability"]!,
            badge(p["evidence_availability"]),
          ],
          [FIELD_LABELS["evaluation_status"]!, badge(p["evaluation_status"])],
        ],
      )}</section><section class="card"><h4>Verificación operativa</h4>${dl([
        [FIELD_LABELS["proposal_status"]!, badge(p["proposal_status"])],
        [
          FIELD_LABELS["operational_verification_status"]!,
          badge(p["operational_verification_status"]),
        ],
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
      "La aprobación humana de la propuesta de entorno aislado está pendiente.",
    );
  if (model.authorization.exact_policy_hash === null)
    reasons.push("No existe una política exacta de ejecución.");
  if (model.gateway_adapter_state.adapter_status === "disabled")
    reasons.push("El adaptador de transporte está deshabilitado.");
  if (model.kill_switch_state.status === "active")
    reasons.push("El interruptor de seguridad permanece activo.");
  return `<h2>OpenRouter — detalle gobernado</h2>${blockedNotice(model)}<section class="card"><h3>Estado actual</h3><p>La visibilidad del proveedor y la evidencia disponible permiten evaluación humana, pero no determinan preparación operativa ni conceden autoridad de ejecución. No existe ninguna llamada al proveedor, salida de modelo ni uso facturado.</p>${dl(
    [
      [FIELD_LABELS["provider_visibility"]!, badge(p["provider_visibility"])],
      [
        FIELD_LABELS["evidence_availability"]!,
        badge(p["evidence_availability"]),
      ],
      [FIELD_LABELS["evaluation_status"]!, badge(p["evaluation_status"])],
      [
        FIELD_LABELS["operational_verification_status"]!,
        badge(p["operational_verification_status"]),
      ],
      [FIELD_LABELS["execution_status"]!, badge(p["execution_status"])],
      [FIELD_LABELS["authority_status"]!, badge(p["authority_status"])],
    ],
  )}<ul>${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul></section><section class="card"><h3>Identidad del candidato</h3>${dl(
    [
      [FIELD_LABELS["provider_id"]!, code(p["provider_id"] ?? "ausente")],
      [
        FIELD_LABELS["candidate_model"]!,
        m ? code(m.model_id) : badge("absent"),
      ],
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
    ],
  )}</section><div class="grid2"><section class="card"><h3>Evidencia y preparación</h3>${dl(
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
  )}</section><section class="card"><h3>Presupuesto del entorno aislado</h3>${dl(
    [
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
        "Caso sintético (solo metadatos)",
        `Registrado${disclosure("Identificador canónico del caso", "openrouter.manual-sandbox.synthetic.v1")}`,
      ],
    ],
  )}</section></div><section class="card"><h3>Artefactos y hashes</h3><p class="quiet">Hashes abreviados; el valor completo está disponible en cada detalle técnico.</p>${dl(
    [
      ["Dossier de preparación", hashSummary(v.dossier_hash)],
      ["Paquete de evidencia externa", hashSummary(v.evidence_pack_hash)],
      ["Propuesta de entorno aislado", hashSummary(v.proposal_hash)],
      [
        "Configuración del entorno de ejecución",
        hashSummary(v.runtime_config_hash),
      ],
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
  const boundArtifactLabels: Readonly<Record<string, string>> = {
    readiness_dossier: "Dossier de preparación",
    external_evidence_pack: "Paquete de evidencia externa",
    sandbox_proposal: "Propuesta de entorno aislado",
    runtime_configuration: "Configuración del entorno de ejecución",
    execution_profile: "Perfil de ejecución",
    model_registry_entry: "Registro del modelo",
    route_record: "Registro de ruta",
    pricing_policy: "Política de precios",
    privacy_zdr_evidence: "Evidencia de privacidad y ZDR",
    gold_case: "Caso de referencia",
    first_run_fixture: "Caso de primera ejecución",
  };
  return `<h2>Revisión humana</h2><p class="lead">Estado de la revisión humana de activación del entorno aislado. La consola solo muestra decisiones registradas en artefactos gobernados; no ofrece controles de aprobación, mutación ni ejecución.</p>${blockedNotice(model)}<section class="card"><h3>Estado de la revisión de activación</h3>${dl(
    [
      [FIELD_LABELS["review_status"]!, badge(r.outcome)],
      ["Ciclo de vida", badge(r.lifecycle)],
      [
        FIELD_LABELS["review_scope"]!,
        text("Una activación de entorno aislado con un caso sintético"),
      ],
      [FIELD_LABELS["review_expiry"]!, text(r.expires_at ?? "ausente")],
      ["Decisiones humanas pendientes", text(r.pending_human_decisions.length)],
      [FIELD_LABELS["version"]!, text(r.version ?? "ausente")],
      ["Hash de la revisión (abreviado)", hashSummary(r.source_artifact_hash)],
    ],
  )}<p><strong>Alcance:</strong> la única aprobación representable es exactamente una activación de entorno aislado con un caso de referencia sintético. Ninguna aprobación de proveedor, producción, recurrencia, autonomía ni datos de clientes es posible en este contrato.</p>${disclosure("Código canónico del alcance", "one_synthetic_gold_case_sandbox_activation")}${disclosure("Hash completo de la revisión", r.source_artifact_hash)}</section><section class="card"><h3>Identidad del candidato</h3>${dl(
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
  )}<p class="quiet">Independencia exigida: la revisión de evidencia y la aprobación de activación deben provenir de personas distintas; ninguna puede ser el sistema; las titularidades del interruptor de seguridad y de incidentes no pueden recaer en la persona aprobadora (pueden coincidir entre sí).</p>${codeList(
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
  )}</section><section class="card"><h3>Artefactos vinculados</h3><p class="quiet">Hashes abreviados; cada vinculación exacta queda verificada por el evaluador determinista y falla de forma segura ante cualquier desvío.</p>${dl(
    r.bound_artifacts.map(
      (artifact) =>
        [
          boundArtifactLabels[artifact.name] ?? "Artefacto gobernado",
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
      return `<li>${escapeHtml(summary.label)}${summary.known ? "" : untranslated()}${disclosure("Código canónico", blocker.blocker_code)}</li>`;
    })
    .join(
      "",
    )}</ul></section><section class="card"><h3>Próxima acción gobernada</h3><p>${nextAction ? escapeHtml(nextAction) : `Acción sin traducción disponible${untranslated()}${disclosure("Código canónico de la acción", r.next_governed_action)}`}</p><p class="quiet">Incluso una revisión elegible nunca autoriza ejecución, acceso a secretos ni habilitación del entorno de ejecución: solo permite proponer una solicitud de cambios separada y revisada de configuración.</p></section>`;
}

function arcaReview(model: OperatorReadModel): string {
  const view = buildArcaReviewConsoleViewModel(model);
  const batch = view.regulatory_batch;
  const c = view.candidate;
  const r = view.review;
  const e = view.evaluation;
  const a = view.approved_artifact;
  const hashField = (
    label: string,
    value: { readonly short: string; readonly full: string | null },
  ): readonly [string, string] => [
    label,
    `${code(value.short)}${value.full ? disclosure(`Hash completo: ${label}`, value.full) : ""}`,
  ];
  const bindingRows = [
    [
      "Candidato",
      e.bindings.candidate_artifact_id,
      e.bindings.candidate_sha256,
    ],
    ["Revisión", e.bindings.review_id, e.bindings.review_sha256],
  ] as const;
  const findings = r.findings.length
    ? `<div class="table-wrap"><table><thead><tr><th scope="col">Código</th><th scope="col">Severidad</th><th scope="col">Categoría</th><th scope="col">Descripción</th><th scope="col">Resolución</th></tr></thead><tbody>${r.findings
        .map(
          (finding) =>
            `<tr><td>${code(finding.finding_code)}</td><td>${escapeHtml(finding.severity)}</td><td>${escapeHtml(finding.category)}</td><td>${escapeHtml(finding.description)}</td><td>${escapeHtml(finding.resolution_status)}</td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : `<p class="quiet">No hay hallazgos controlados registrados.</p>`;
  const regulatoryBatch =
    batch === null
      ? `<section class="notice"><strong>Lote regulatorio no disponible</strong><p>La carga falló de forma cerrada; ningún elemento es elegible para revisión.</p></section>`
      : `<section class="card"><span class="panel-kicker">Primer lote regulatorio real</span><h3>Tres resoluciones pendientes de revisión humana</h3>${dl(
          [
            ["ID del lote", code(batch.batch_id)],
            ["Pendientes", text(batch.pending_count)],
            ["Aprobadas", text(batch.approved_count)],
            ["Planificador activo", yesNo(batch.scheduler_active)],
            [
              "Ejecución ARCA disponible",
              yesNo(batch.runtime_arca_execution_available),
            ],
            [
              "Interpretación legal realizada",
              yesNo(batch.legal_interpretation_performed),
            ],
          ],
        )}<div class="grid3">${batch.artifacts
          .map((artifact, index) => {
            const reviewPackage = batch.review_packages[index];
            const sourceLinks = artifact.official_source_urls
              .map(
                (source) =>
                  `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.source_id === "arca_biblioteca" ? "Biblioteca ARCA" : "Boletín Oficial")}</a> — ${code(shortHash(source.sha256))}${disclosure(`Hash completo de ${source.source_id}`, source.sha256)}</li>`,
              )
              .join("");
            const annexes = artifact.annexes.length
              ? `<ul>${artifact.annexes
                  .map(
                    (annex) =>
                      `<li><strong>${escapeHtml(annex.label)}</strong> — ${code(annex.document_number)} — ${code(shortHash(annex.sha256))}${disclosure(`Hash completo de ${annex.label}`, annex.sha256)} — <a href="${escapeHtml(annex.arca_url)}" target="_blank" rel="noreferrer">ARCA</a> · <a href="${escapeHtml(annex.boletin_url)}" target="_blank" rel="noreferrer">BORA</a></li>`,
                  )
                  .join("")}</ul>`
              : `<p class="quiet">La norma no publica anexos propios.</p>`;
            return `<article class="card"><span class="badge tone-pending" data-status="pending_human_review">Pendiente de revisión humana</span><h4>${escapeHtml(artifact.title)}</h4><p>${escapeHtml(artifact.subject)}</p>${dl(
              [
                ["Autoridad", text(artifact.authority)],
                ["Jurisdicción", text(artifact.jurisdiction)],
                ["Fecha de emisión", text(artifact.issue_date)],
                ["Fecha de publicación", text(artifact.publication_date)],
                ["Estado actual", badge(artifact.current_status)],
                [
                  "Fecha o regla de vigencia",
                  text(artifact.effective_date ?? artifact.effective_date_rule),
                ],
                [
                  "Verificación de fuentes",
                  badge(artifact.source_verification.status),
                ],
                [
                  "Anexos completos",
                  yesNo(artifact.source_verification.annexes_complete),
                ],
                ["Estado de revisión", badge(artifact.review_status)],
                [
                  "Hash canónico",
                  `${code(shortHash(artifact.canonical_hash))}${disclosure("Hash canónico completo", artifact.canonical_hash)}`,
                ],
                [
                  "Recomendación humana",
                  text(reviewPackage?.recommendation ?? "aún no registrada"),
                ],
                ["Publicación", badge("not_published")],
                ["Interpretación", text("No realizada")],
              ],
            )}<h5>Temas</h5><ul>${artifact.topics.map((topic) => `<li>${escapeHtml(topic)}</li>`).join("")}</ul><h5>Fuentes oficiales</h5><ul>${sourceLinks}</ul><h5>Anexos oficiales</h5>${annexes}<h5>Relaciones normativas registradas</h5><ul>${artifact.supersedes_or_modifies.map((relationship) => `<li>${code(relationship.relationship)} — ${escapeHtml(relationship.instrument)}</li>`).join("")}</ul><p class="quiet">${escapeHtml(artifact.disclaimer_es)}</p></article>`;
          })
          .join("")}</div></section>`;

  return `<h2>Revisión ARCA</h2><p class="lead">Consola interna de solo lectura para revisar el primer lote regulatorio real y conservar la trazabilidad del fixture arancelario de pruebas. No ejecuta ni modifica ninguna etapa.</p>${regulatoryBatch}<section class="notice" aria-label="Origen y autoridad"><strong>Fixture arancelario test-only</strong><ul>${view.source_labels.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>${codeList("Valores técnicos de origen", view.source_technical)}</section><section class="card"><span class="panel-kicker">Fixture sintético test-only</span><h3>Resumen del candidato</h3>${dl(
    [
      ["ID del artefacto candidato", code(c.artifact_id ?? "ausente")],
      hashField("Hash del candidato", c.hash),
      ["ID de adquisición", code(c.acquisition_id ?? "ausente")],
      ["Fuente", text(c.source ?? "ausente")],
      ["Capturado", text(c.captured_at ?? "ausente")],
      ["Analizador", code(c.parser_identity ?? "ausente")],
      hashField("Hash de salida parseada", c.parsed_output_hash),
      ["Líneas arancelarias", text(c.tariff_line_count ?? "ausente")],
      ["Validación fija", badge(c.states.validation_status ?? "absent")],
      ["Revisión fija", badge(c.states.review_state ?? "absent")],
      ["Aprobación fija", badge(c.states.approval_status ?? "absent")],
      ["Publicación fija", badge(c.states.publication_status ?? "absent")],
    ],
  )}${codeList("Estados canónicos del candidato", [
    `validation_status: ${c.states.validation_status ?? "ausente"}`,
    `review_state: ${c.states.review_state ?? "ausente"}`,
    `approval_status: ${c.states.approval_status ?? "ausente"}`,
    `publication_status: ${c.states.publication_status ?? "ausente"}`,
  ])}</section><section class="card"><h3>Revisión humana</h3>${dl([
    [
      "Ciclo de vida",
      `<span class="badge tone-${statusToneFor(r.lifecycle)}" data-status="${escapeHtml(r.lifecycle)}">${escapeHtml(r.lifecycle_label)}</span>`,
    ],
    [
      "Revisor",
      r.reviewer_present
        ? code(r.reviewer_identity ?? "identidad ausente")
        : "Ausente — no existe una decisión humana real",
    ],
    ["Fecha de decisión", text(r.decision_timestamp ?? "ausente")],
    ["Vencimiento", text(r.expires_at ?? "ausente")],
    ["Declaración de revisión", text(r.review_statement ?? "ausente")],
    ["Motivo de rechazo", text(r.rejection_reason ?? "ausente")],
    ["Hallazgos sin resolver", text(r.unresolved_findings_count)],
    ["ID de revisión", code(r.review_id ?? "ausente")],
    hashField("Hash de revisión", r.review_hash),
    [
      "Independencia declarada",
      yesNo(r.separation_of_duties.reviewer_independence_asserted),
    ],
  ])}<h4>Separación de funciones</h4>${dl([
    [
      "Operador de adquisición",
      code(r.separation_of_duties.acquisition_operator_identity ?? "ausente"),
    ],
    [
      "Entorno de ejecución del analizador",
      code(r.separation_of_duties.parser_runtime_identity ?? "ausente"),
    ],
    [
      "Productor del candidato",
      code(r.separation_of_duties.candidate_producer_identity ?? "ausente"),
    ],
    [
      "Revisor de evidencia",
      code(r.separation_of_duties.evidence_reviewer_identity ?? "ausente"),
    ],
  ])}<h4>Hallazgos controlados</h4>${findings}</section><section class="card"><h3>Evaluación</h3>${dl(
    [
      [
        "Resultado exacto",
        `<span class="badge tone-${statusToneFor(e.outcome)}" data-status="${escapeHtml(e.outcome)}">${escapeHtml(e.outcome_label)}</span>`,
      ],
      ["Evaluado", text(e.evaluated_at)],
      ["ID de evaluación", code(e.evaluation_id)],
      hashField("Hash de evaluación", e.evaluation_hash),
      [
        "Elegibilidad del constructor",
        e.eligible_for_approved_artifact_building
          ? "Elegible únicamente para construir el artefacto aprobado"
          : "No elegible para construir el artefacto aprobado",
      ],
    ],
  )}${codeList("Códigos de razón canónicos", e.reason_codes)}<h4>Vinculaciones exactas</h4><div class="table-wrap"><table><thead><tr><th scope="col">Tipo</th><th scope="col">ID</th><th scope="col">Hash</th></tr></thead><tbody>${bindingRows
    .map(
      ([kind, id, hashValue]) =>
        `<tr><th scope="row">${kind}</th><td>${code(id ?? "ausente")}</td><td>${hashValue ? `${code(shortHash(hashValue))}${disclosure(`Hash completo de ${kind.toLowerCase()}`, hashValue)}` : "ausente"}</td></tr>`,
    )
    .join("")}</tbody></table></div>${codeList(
    "Estados canónicos de revisión y evaluación",
    [`review_lifecycle: ${r.lifecycle}`, `evaluation_outcome: ${e.outcome}`],
  )}<h4>No autoridades explícitas</h4><ul>${e.non_authorities.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul></section><section class="card"><h3>Artefacto aprobado</h3>${dl(
    [
      [
        "Presencia",
        a.present
          ? "Artefacto aprobado local — Presente"
          : "Ausente — no existe un artefacto aprobado",
      ],
      ["ID", code(a.approved_artifact_id ?? "ausente")],
      hashField("Hash del artefacto aprobado", a.artifact_hash),
      ["Constructor", code(a.builder_identity ?? "ausente")],
      ["Construido", text(a.build_timestamp ?? "ausente")],
      ["Exportación", badge(a.export_status)],
      ["Publicación", badge(a.publication_status)],
      ["Uso en producción", badge(a.production_reliance)],
      ["Consumo por vlatam-global", badge(a.vlatam_global_consumption)],
    ],
  )}${codeList("Estados canónicos del artefacto aprobado", [
    `export_status: ${a.export_status}`,
    `publication_status: ${a.publication_status}`,
    `production_reliance: ${a.production_reliance}`,
    `vlatam_global_consumption: ${a.vlatam_global_consumption}`,
  ])}</section><section class="card"><h3>Qué significa este estado</h3><ul><li><strong>“Aprobado” no significa exportado.</strong></li><li><strong>“Artefacto aprobado” no significa autorizado para producción.</strong></li><li>La exportación y el uso en producción requieren compuertas posteriores e independientes.</li><li>El estado actual del repositorio puede ser sintético y estar pendiente; las etiquetas de origen anteriores indican exactamente cuál es el caso.</li></ul></section>`;
}

function governance(model: OperatorReadModel): string {
  const grouped = groupBlockersForGovernance(model.blockers);
  return `<h2>Gobernanza</h2><p class="lead">Agrupación de presentación sobre los bloqueos existentes del modelo de lectura; ningún resultado de gobernanza se recalcula.</p>${blockedNotice(model)}<div class="grid2">${GOVERNANCE_GROUPS.map(
    (group) => {
      const matching = grouped.get(group.title) ?? [];
      const statusBadge = matching.length
        ? badge("blocked")
        : `<span class="badge tone-neutral">Sin bloqueos registrados</span>`;
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
          `${text(presentEvaluator(blocker.source_evaluator).label)}${disclosure("Evaluador canónico", blocker.source_evaluator)}`,
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
    { openrouter: "OpenRouter", none: "Ninguno" },
  )}</select></label><label>Clase de resolución<select data-filter="resolution"><option value="">Todas</option>${filterOptions(
    model.blockers.flatMap((b) => b.resolvable_by),
    RESOLUTION_LABELS,
  )}</select></label><label>Bloquea la ejecución<select data-filter="blocking"><option value="">Todos</option><option value="true">Sí</option><option value="false">No</option></select></label></div><p class="quiet" id="blocker-count" aria-live="polite">Mostrando ${total} de ${total} bloqueos</p><ol class="records">${model.blockers
    .map(record)
    .join("")}</ol>`;
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
          `${text(presentOwnerRole(action.owner_role).label)}${disclosure("Rol canónico", action.owner_role)}`,
        ],
        ["Por qué es requerida", text(why)],
        [
          FIELD_LABELS["related_blockers"]!,
          text(action.source_blocker_codes.length),
        ],
        [
          FIELD_LABELS["prerequisites"]!,
          action.prerequisite_actions.length
            ? `${text(`${action.prerequisite_actions.length} registradas`)}${codeList("Requisitos previos canónicos", action.prerequisite_actions)}`
            : "Ninguno",
        ],
        [
          FIELD_LABELS["required_artifact"]!,
          action.required_artifact
            ? `Registrado${disclosure("Artefacto canónico requerido", action.required_artifact)}`
            : "—",
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
        ? "La puerta de enlace registró una invocación."
        : "La puerta de enlace no ha sido invocada.",
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
  return `<h2>Ejecución</h2><p class="lead">Frontera de ejecución gobernada. Cadena gobernada: Registro → Resolución → Autorización → Política exacta → Consumo atómico → Puerta de enlace → Adaptador.</p><div class="chain" aria-label="Cadena de ejecución gobernada">${stages
    .map(
      (stage) =>
        `<div class="stage"><strong>${escapeHtml(EXECUTION_STAGE_LABELS[stage.canonical])}</strong><br>${badge(stage.status)}<p>${escapeHtml(stage.explanation)}</p>${disclosure("Valor técnico", stage.canonical)}</div>`,
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
      name: "Propuesta de entorno aislado",
      purpose: "Propuesta gobernada de habilitación del entorno aislado.",
      id: v.proposal_id,
      version: model.sandbox_proposals[0]?.version ?? null,
      status: v.proposal_outcome,
      hash: v.proposal_hash,
      path: pathFor("sandbox-enablement-proposal"),
    }),
    artifact({
      name: "Configuración del entorno de ejecución",
      purpose:
        "Configuración exacta del entorno de ejecución aislado (metadatos).",
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
      purpose: "Contrato gobernado de revisión humana del entorno aislado.",
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

function applicationPage(model: OperatorReadModel, pathname: string): string {
  const state = REPOSITORY_CURRENT_BLOCKED_STATUS;
  if (pathname === "/operator/operations/arca")
    return `<h2>ARCA</h2><p class="lead">Superficie operativa de solo lectura para el flujo ARCA gobernado.</p>${blockedNotice(model)}<div class="grid3"><section class="card"><span class="panel-kicker">AI-131</span><h3>Frontera de adquisición</h3><p><span class="badge tone-blocked">Interruptor de seguridad activo</span></p><p class="quiet">Ejecución real bloqueada por la configuración del estado actual del repositorio.</p></section><section class="card"><span class="panel-kicker">AI-132</span><h3>Frontera de exportación</h3><p><span class="badge tone-blocked">Interruptor de seguridad activo</span></p><p class="quiet">Exportación no autorizada.</p></section><section class="card"><span class="panel-kicker">AI-133</span><h3>Frontera del planificador</h3><p><span class="badge tone-blocked">Inactivo</span></p><p class="quiet">Cero ejecuciones permitidas; ejecución bloqueada.</p></section></div><section class="card"><h3>Revisión disponible</h3><p><a href="/operator/arca-review">Abrir la revisión ARCA existente</a>. Esta vista conserva su proyección y lógica de gobernanza actuales.</p></section>`;
  if (pathname === "/operator/operations/acquisitions")
    return readOnlyUnavailablePage(
      "Adquisiciones",
      "AI-131 permanece bloqueado. No existe control de adquisición en esta aplicación.",
      state.evidence_paths[0]!,
    );
  if (pathname === "/operator/operations/exports")
    return readOnlyUnavailablePage(
      "Exportaciones",
      "AI-132 permanece bloqueado. No existe autoridad de exportación.",
      state.evidence_paths[1]!,
    );
  if (pathname === "/operator/operations/recovery")
    return readOnlyUnavailablePage(
      "Recuperación",
      "El estado de recuperación requerida no está disponible en un modelo de lectura apto para esta vista.",
      state.evidence_paths[3]!,
    );
  if (pathname === "/operator/approved-artifacts") {
    const artifact = model.arca_approved_artifact;
    return `<h2>Artefactos aprobados</h2><p class="lead">Artefactos aprobados locales; aprobación no implica exportación, publicación ni uso productivo.</p><section class="card"><h3>Artefacto aprobado ARCA</h3>${dl(
      [
        ["Presencia", artifact.present ? badge("approved") : badge("absent")],
        ["ID", code(artifact.approved_artifact_id ?? "ausente")],
        ["Exportación", badge(artifact.export_status)],
        ["Publicación", badge(artifact.publication_status)],
        ["Uso productivo", badge(artifact.production_reliance)],
        ["vlatam-global", badge(artifact.vlatam_global_consumption)],
      ],
    )}${codeList("Estados canónicos del artefacto", [
      `export_status: ${artifact.export_status}`,
      `publication_status: ${artifact.publication_status}`,
      `production_reliance: ${artifact.production_reliance}`,
      `vlatam_global_consumption: ${artifact.vlatam_global_consumption}`,
    ])}<p><a href="/operator/arca-review">Ver trazabilidad en Revisión ARCA</a></p></section>`;
  }
  if (pathname === "/operator/models/registry")
    return `<h2>Registro</h2><p class="lead">Identidades registradas según el modelo de lectura del operador.</p><div class="grid2"><section class="card"><h3>Modelos</h3><ul class="status-list">${model.models
      .map(
        (entry) =>
          `<li><span>${code(entry.model_id)}</span>${badge(entry.enabled ? "enabled" : "disabled")}</li>`,
      )
      .join(
        "",
      )}</ul></section><section class="card"><h3>Rutas</h3><ul class="status-list">${model.routes
      .map(
        (entry) =>
          `<li><span>${code(entry.route_id)}</span>${badge(entry.enabled ? "enabled" : "disabled")}</li>`,
      )
      .join("")}</ul></section></div>`;
  if (pathname === "/operator/models/tournaments")
    return `<h2>Torneos</h2><p class="lead">Plano de control neutral y sin acciones de escritura.</p><section class="card"><h3>Candidatos registrados</h3>${
      model.tournament.registered_candidates.length === 0
        ? `<p>${badge("unavailable")} No hay candidatos disponibles en la proyección.</p>`
        : `<ul class="status-list">${model.tournament.registered_candidates
            .map(
              (candidate) =>
                `<li><span>${code(candidate.candidate_id)}</span><span>${badge(candidate.lifecycle_status)} ${candidate.human_decision_required ? badge("pending") : ""}</span></li>`,
            )
            .join("")}</ul>`
    }<p class="quiet">Acciones de escritura disponibles: ${model.tournament.write_actions_available ? "Sí" : "No"}</p>${disclosure("Valor técnico de acciones de escritura", model.tournament.write_actions_available)}</section>`;
  if (pathname === "/operator/runtimes/ai-lab")
    return `<h2>Entornos</h2><p class="lead">Estado local del laboratorio y evidencia de los entornos evaluados.</p><section class="card"><h3>AI LAB</h3><ul class="status-list"><li><span>Planificador</span><span class="badge tone-blocked">Inactivo</span></li><li><span>Activación</span><span class="badge tone-blocked">Ninguna</span></li><li><span>Ejecución en producción</span><span class="badge tone-blocked">Ninguna</span></li><li><span>Autoridad de despliegue</span>${yesNo(state.deployment_authority)}</li></ul></section><div class="grid3"><section class="card"><h3>OpenRouter</h3><p class="quiet">Estado gobernado del proveedor evaluado.</p><p><a href="/operator/providers/openrouter">Ver detalle →</a></p></section><section class="card"><h3>Vercel Eve</h3><p class="quiet">Evidencia del entorno de ejecución, no activación.</p><p><a href="/operator/runtimes/vercel-eve">Ver detalle →</a></p></section><section class="card"><h3>Cloudflare</h3><p class="quiet">Evidencia del entorno de ejecución, no activación.</p><p><a href="/operator/runtimes/cloudflare">Ver detalle →</a></p></section></div>`;
  if (
    pathname === "/operator/runtimes/vercel-eve" ||
    pathname === "/operator/runtimes/cloudflare"
  ) {
    const candidateName = pathname.endsWith("vercel-eve")
      ? "Vercel Eve"
      : "Cloudflare";
    const runtime = model.tournament.runtime_evidence.find((entry) =>
      entry.candidate_id
        .toLowerCase()
        .includes(candidateName === "Vercel Eve" ? "eve" : "cloudflare"),
    );
    return `<h2>${candidateName}</h2><p class="lead">Evidencia del entorno de ejecución, no activación.</p><section class="card"><h3>Estado de evidencia</h3>${
      runtime
        ? dl([
            ["Candidato", code(runtime.candidate_id)],
            ["Vigencia", badge(runtime.evidence_freshness)],
            ["Fuentes", text(runtime.source_count)],
            ["Brechas sin resolver", text(runtime.unresolved_gaps)],
            ["Activación prohibida", yesNo(runtime.activation_prohibited)],
            ["Interruptor de seguridad", badge(runtime.kill_switch_state)],
          ])
        : `<p>${badge("unavailable")} No existe una proyección de evidencia utilizable para esta vista.</p>`
    }<p class="quiet">Esta página no configura, invoca ni promueve el entorno de ejecución.</p></section>`;
  }
  if (pathname === "/operator/knowledge/regulations")
    return readOnlyUnavailablePage(
      "Regulaciones",
      "La navegación está preparada; no se proyecta un catálogo regulatorio agregado en esta interfaz.",
      "docs/advisory/regulatory-source-of-truth.md",
    );
  if (pathname === "/operator/knowledge/sources")
    return readOnlyUnavailablePage(
      "Fuentes",
      "Las fuentes permanecen gobernadas por sus artefactos; no hay adquisición desde la interfaz.",
      "docs/agents/arca-source-acquisition.md",
    );
  if (pathname === "/operator/knowledge/news")
    return readOnlyUnavailablePage(
      "Noticias",
      "No existe una fuente del estado actual del repositorio para noticias. Estado explícitamente no disponible.",
      "unavailable:no-reviewed-news-source",
    );
  if (pathname === "/operator/evidence")
    return `<h2>Evidencia</h2><p class="lead">Referencias auditables del modelo de lectura del operador.</p><section class="card"><h3>Referencias del repositorio</h3>${codeList("Rutas disponibles", model.audit_references)}</section><section class="card"><h3>Proyección AI-134</h3>${codeList("Fuentes de estado bloqueado", state.evidence_paths)}<p class="quiet">La presencia de evidencia no concede autoridad operativa.</p></section>`;
  if (pathname === "/operator/settings")
    return `<h2>Configuración</h2><p class="lead">Configuración visible para administradores; sin mutaciones en esta iteración.</p><section class="card"><h3>Preparación de despliegue</h3>${dl(
      [
        ["Proyecto futuro", code("vlatam-ai-lab")],
        ["Dominio futuro", code("lab.vlatamglobal.com")],
        ["Estado", badge("not_configured")],
        ["Autoridad de despliegue", yesNo(state.deployment_authority)],
      ],
    )}<p class="quiet">Los cambios se realizan fuera de esta interfaz mediante un proceso humano revisado.</p></section>`;
  return `<h2>Vista no disponible</h2><p class="lead">No existe una proyección registrada para esta ruta.</p>`;
}

function readOnlyUnavailablePage(
  title: string,
  explanation: string,
  provenance: string,
): string {
  return `<h2>${escapeHtml(title)}</h2><p class="lead">${escapeHtml(explanation)}</p><section class="card"><h3>Estado actual del repositorio</h3><p>${badge("unavailable")} Solo lectura; ninguna acción disponible.</p>${codeList("Procedencia", [provenance])}</section>`;
}

export const OPERATOR_CONSOLE_PATHS = new Set(
  APPLICATION_ROUTES.map((route) => route.path),
);

/** Section landing pages and the existing governed views, by exact path. */
const CONSOLE_PAGES: Readonly<
  Record<string, (model: OperatorReadModel) => string>
> = {
  "/operator": missionCenter,
  "/operator/estado": overview,
  "/operator/misiones": missionsLanding,
  "/operator/revisiones": reviewsLanding,
  "/operator/modelos": modelsLanding,
  "/operator/providers": providers,
  "/operator/providers/openrouter": openrouter,
  "/operator/review": review,
  "/operator/arca-review": arcaReview,
  "/operator/governance": governance,
  "/operator/blockers": blockers,
  "/operator/actions": actions,
  "/operator/execution": execution,
  "/operator/audit": audit,
};

export interface OperatorConsoleRenderOptions {
  readonly identity?: ApplicationIdentity;
  readonly deployment_environment?: ShellEnvironment;
}

export function renderOperatorConsole(
  model: OperatorReadModel,
  pathname: string,
  options: OperatorConsoleRenderOptions = {},
): string {
  const content = (
    CONSOLE_PAGES[pathname] ??
    ((current: OperatorReadModel) => applicationPage(current, pathname))
  )(model);
  return shell(
    model,
    pathname,
    content,
    options.identity ?? LOCAL_DEVELOPMENT_IDENTITY,
    options.deployment_environment ?? "development",
  );
}

export function renderOperatorInvalidState(): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Consola del operador — Estado inválido</title></head><body><main><h1>Estado del repositorio inválido</h1><p>El modelo de lectura del operador falló de forma segura. Revise la validación del repositorio localmente; no se intentó ninguna ejecución.</p></main></body></html>`;
}

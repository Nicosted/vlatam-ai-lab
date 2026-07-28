import {
  statusToneFor,
  type StatusTone,
} from "../application/application-shell.js";
import { REPOSITORY_CURRENT_BLOCKED_STATUS } from "../application/repository-current-status.js";
import {
  presentOwnerRole,
  presentRequiredActionTitle,
  presentSeverity,
  presentStatus,
  topBlockersBySeverity,
} from "./operator-presentation.js";
import type { OperatorReadModel } from "./operator-read-model.js";

/**
 * Mission center projection. It reorganizes the existing Operator Read Model
 * into operational work units for presentation only. It never recomputes a
 * governance decision, never derives a new status, and never introduces an
 * action control: every card is a read-only pointer to an existing view.
 */
export const MISSION_COLUMNS = [
  "en_curso",
  "necesita_atencion",
  "listo",
] as const;

export type MissionColumn = (typeof MISSION_COLUMNS)[number];

export const MISSION_COLUMN_LABELS: Readonly<Record<MissionColumn, string>> = {
  en_curso: "En curso",
  necesita_atencion: "Necesita atención",
  listo: "Listo",
};

/** Shown only when a column is empty, to explain what would appear there. */
export const MISSION_COLUMN_HINTS: Readonly<Record<MissionColumn, string>> = {
  en_curso:
    "Aquí aparece el trabajo gobernado en marcha, a la espera de un paso humano.",
  necesita_atencion:
    "Aquí aparecen los elementos detenidos que requieren una decisión humana.",
  listo:
    "Aquí aparecerán los elementos una vez que una persona registre su decisión y queden completados o aprobados.",
};

export const MISSION_COLUMN_EMPTY_TITLES: Readonly<
  Record<MissionColumn, string>
> = {
  en_curso: "Nada en curso",
  necesita_atencion: "Nada requiere atención",
  listo: "Todavía nada completado",
};

export interface MissionItem {
  readonly id: string;
  readonly column: MissionColumn;
  readonly title: string;
  readonly summary: string;
  readonly status_label: string;
  readonly status_tone: StatusTone;
  readonly owner_label: string | null;
  readonly detail_path: string | null;
  readonly detail_label: string;
  /** Plain, human-readable rows for the contextual panel. */
  readonly facts: readonly (readonly [string, string])[];
  /** Canonical machine values, kept behind progressive disclosure. */
  readonly technical: readonly string[];
}

export interface MissionBoard {
  readonly items: readonly MissionItem[];
  readonly selected_id: string | null;
}

const ACTION_COLUMNS: Readonly<
  Record<"not_started" | "pending" | "blocked" | "complete", MissionColumn>
> = {
  blocked: "necesita_atencion",
  pending: "en_curso",
  not_started: "en_curso",
  complete: "listo",
};

const slug = (value: string, index: number): string =>
  `${
    value
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "item"
  }-${index}`;

function actionMissions(model: OperatorReadModel): readonly MissionItem[] {
  return model.required_human_actions.map((action, index) => {
    const title = presentRequiredActionTitle(action);
    const status = presentStatus(action.status);
    const owner = presentOwnerRole(action.owner_role);
    const linked = action.source_blocker_codes.length;
    return {
      id: slug(action.action_code, index),
      column: ACTION_COLUMNS[action.status],
      title: title.label,
      summary:
        linked === 0
          ? "Paso humano registrado por el modelo de lectura."
          : `${linked} ${linked === 1 ? "bloqueo vinculado" : "bloqueos vinculados"} a este paso.`,
      status_label: status.label,
      status_tone: statusToneFor(status.canonical),
      owner_label: owner.label,
      detail_path: "/operator/actions",
      detail_label: "Ver la acción requerida completa",
      facts: [
        ["Responsable", owner.label],
        ["Estado", status.label],
        [
          "Artefacto requerido",
          action.required_artifact ? "Registrado" : "Ninguno registrado",
        ],
        ["Bloqueos vinculados", String(linked)],
        ["Requisitos previos", String(action.prerequisite_actions.length)],
      ],
      technical: [
        action.action_code,
        ...(action.required_artifact ? [action.required_artifact] : []),
        ...action.source_blocker_codes,
        ...action.prerequisite_actions,
      ],
    };
  });
}

function blockerMission(model: OperatorReadModel): MissionItem | null {
  const active = model.system_summary.active_blockers;
  if (active === 0) return null;
  const top = topBlockersBySeverity(model.blockers, 5);
  return {
    id: "bloqueos-gobernados",
    column: "necesita_atencion",
    title: "Bloqueos gobernados activos",
    summary: `${active} ${active === 1 ? "bloqueo impide" : "bloqueos impiden"} avanzar hasta que evidencia revisada confirme su resolución.`,
    status_label: "Bloqueado",
    status_tone: "blocked",
    owner_label: null,
    detail_path: "/operator/blockers",
    detail_label: "Ver el listado canónico de bloqueos",
    facts: [
      ["Bloqueos activos", String(active)],
      ["Mayor prioridad", presentSeverity(top[0]?.severity).label],
      [
        "Proveedores bloqueados",
        String(model.system_summary.blocked_providers),
      ],
      ["Rutas bloqueadas", String(model.system_summary.blocked_routes)],
    ],
    technical: top.map((blocker) => blocker.blocker_code),
  };
}

function reviewMission(model: OperatorReadModel): MissionItem {
  const pending = model.system_summary.pending_approvals;
  return {
    id: "cola-de-revision",
    column: pending === 0 ? "listo" : "en_curso",
    title: "Cola de revisión humana",
    summary:
      pending === 0
        ? "No hay revisiones pendientes en la proyección actual."
        : `${pending} ${pending === 1 ? "revisión pendiente" : "revisiones pendientes"} de decisión humana registrada.`,
    status_label: pending === 0 ? "Sin pendientes" : "Pendiente",
    status_tone: pending === 0 ? "neutral" : "pending",
    owner_label: "Revisión humana",
    detail_path: "/operator/revisiones",
    detail_label: "Abrir revisiones",
    facts: [
      ["Revisiones pendientes", String(pending)],
      [
        "Revisión de evidencia",
        presentStatus(model.activation_review.evidence_review_status).label,
      ],
      [
        "Aprobación de activación",
        presentStatus(model.activation_review.activation_approval_status).label,
      ],
      [
        "Decisiones humanas pendientes",
        String(model.activation_review.pending_human_decisions.length),
      ],
    ],
    technical: [...model.activation_review.pending_human_decisions],
  };
}

function artifactMission(model: OperatorReadModel): MissionItem {
  const artifact = model.arca_approved_artifact;
  return {
    id: "artefacto-aprobado-arca",
    column: artifact.present ? "listo" : "en_curso",
    title: "Artefacto aprobado ARCA",
    summary: artifact.present
      ? "Existe un artefacto aprobado local. Aprobado no significa exportado, publicado ni en uso productivo."
      : "Todavía no existe un artefacto aprobado en la proyección actual.",
    status_label: artifact.present ? "Aprobado" : "Ausente",
    status_tone: artifact.present ? "verified" : "neutral",
    owner_label: "Revisión humana",
    detail_path: "/operator/approved-artifacts",
    detail_label: "Ver artefactos aprobados",
    facts: [
      ["Presencia", artifact.present ? "Disponible" : "Ausente"],
      ["Exportación", presentStatus(artifact.export_status).label],
      ["Publicación", presentStatus(artifact.publication_status).label],
      ["Uso productivo", presentStatus(artifact.production_reliance).label],
      [
        "Consumo vlatam-global",
        presentStatus(artifact.vlatam_global_consumption).label,
      ],
    ],
    technical: artifact.approved_artifact_id
      ? [artifact.approved_artifact_id]
      : [],
  };
}

/**
 * Deterministic board order: required human actions first (read-model order),
 * then the aggregated blocker, review, and artifact missions.
 */
export function buildMissionBoard(model: OperatorReadModel): MissionBoard {
  const blockers = blockerMission(model);
  const items: readonly MissionItem[] = [
    ...actionMissions(model),
    ...(blockers === null ? [] : [blockers]),
    reviewMission(model),
    artifactMission(model),
  ];
  const selected =
    items.find((item) => item.column === "necesita_atencion") ??
    items.find((item) => item.column === "en_curso") ??
    items[0] ??
    null;
  return { items, selected_id: selected?.id ?? null };
}

export interface MissionStateChip {
  readonly label: string;
  readonly value: string;
}

/**
 * Governed boundary facts. These are deliberately not board cards: a blocked
 * boundary is a safe governed state, not a task waiting for someone.
 */
export function missionStateChips(
  model: OperatorReadModel,
): readonly MissionStateChip[] {
  const state = REPOSITORY_CURRENT_BLOCKED_STATUS;
  return [
    {
      label: "Estado general",
      value: presentStatus(model.system_summary.overall_status).label,
    },
    {
      label: "Ejecución de modelos",
      value:
        model.providers[0]?.["execution_allowed"] === true
          ? "Permitida"
          : "No permitida",
    },
    {
      label: "Interruptores de seguridad",
      value:
        state.ai_131_kill_switch === "active" &&
        state.ai_132_kill_switch === "active" &&
        state.ai_133_kill_switch === "active"
          ? "AI-131/132/133 activos"
          : "Revisar configuración",
    },
    { label: "Planificador", value: presentStatus(state.scheduler).label },
    { label: "Actividad en producción", value: "Ninguna" },
  ];
}

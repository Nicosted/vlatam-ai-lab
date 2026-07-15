import type {
  OperatorBlocker,
  OperatorRequiredAction,
} from "./operator-read-model.js";

/**
 * Presentation-only Spanish dictionary and formatter layer for the read-only
 * AI LAB Operator Console. It maps canonical Operator Read Model values to
 * operator-facing Spanish labels without recalculating any governance
 * decision. Unknown machine values keep their canonical form and are marked
 * as untranslated so they are never interpreted optimistically.
 */

export interface PresentedValue {
  readonly canonical: string;
  readonly label: string;
  readonly known: boolean;
}

export const UNTRANSLATED_MARKER = "valor técnico sin traducción" as const;

export const STATUS_LABELS: Readonly<Record<string, string>> = {
  healthy: "Operativo",
  attention_required: "Requiere atención",
  blocked: "Bloqueado",
  invalid_state: "Estado inválido",
  valid: "Válido",
  enabled: "Habilitado",
  disabled: "Deshabilitado",
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
  active: "Activo",
  inactive: "Inactivo",
  missing: "Ausente",
  absent: "Ausente",
  unknown: "Desconocido",
  unavailable: "No disponible",
  available: "Disponible",
  not_configured: "No configurado",
  configured_unknown: "Configurado (estado sin verificar)",
  not_required: "No requerido",
  not_attempted: "No intentado",
  consumed: "Consumido",
  not_invoked: "No invocado",
  no_policy_issued: "Sin política emitida",
  policy_issued: "Política emitida",
  authorization_pending: "Autorización pendiente",
  authorization_consumed: "Autorización consumida",
  execution_blocked_after_consumption: "Ejecución bloqueada tras el consumo",
  not_started: "No iniciada",
  complete: "Completada",
  candidate: "Candidato",
  evidence_incomplete: "Evidencia incompleta",
  true: "Sí",
  false: "No",
};

export const SEVERITY_LABELS: Readonly<Record<string, string>> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

export const BLOCKER_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  integrity: "Integridad",
  approval: "Aprobación",
  legal: "Legal",
  security_privacy: "Seguridad y privacidad",
  evidence: "Evidencia",
  runtime: "Configuración de ejecución",
};

export const RESOLUTION_LABELS: Readonly<Record<string, string>> = {
  code_change: "Cambio de código",
  evidence_review: "Revisión de evidencia",
  legal_review: "Revisión legal",
  security_review: "Revisión de seguridad",
  human_approval: "Aprobación humana",
  runtime_configuration: "Configuración de runtime",
  external_account_configuration: "Configuración de cuenta externa",
};

export const OWNER_ROLE_LABELS: Readonly<Record<string, string>> = {
  engineering: "Ingeniería",
  evidence_reviewer: "Revisión de evidencia (rol revisor)",
  legal_reviewer: "Revisión legal (rol revisor)",
  security_reviewer: "Revisión de seguridad (rol revisor)",
  independent_human_approver: "Aprobación humana independiente",
  runtime_operator: "Operación de runtime",
  provider_account_owner: "Titularidad de la cuenta del proveedor",
};

export const EVALUATOR_LABELS: Readonly<Record<string, string>> = {
  repository_loader: "Cargador del repositorio",
  registry_validation: "Validación de registros",
  readiness_dossier: "Dossier de preparación",
  external_evidence_pack: "Paquete de evidencia externa",
  sandbox_proposal: "Propuesta de sandbox",
  sandbox_preflight: "Preflight de sandbox",
};

export const EXECUTION_STAGE_LABELS: Readonly<Record<string, string>> = {
  registry: "Registro",
  resolution: "Resolución",
  authorization: "Autorización",
  exact_policy: "Política exacta",
  atomic_consumption: "Consumo atómico",
  gateway: "Gateway",
  adapter: "Adaptador",
};

export const FIELD_LABELS: Readonly<Record<string, string>> = {
  provider_id: "Proveedor",
  display_name: "Nombre visible",
  candidate_model: "Modelo candidato",
  adapter_identity: "Identidad del adaptador",
  adapter_version: "Versión del adaptador",
  adapter_hash: "Hash del adaptador",
  adapter_state: "Estado del adaptador",
  live_traffic_permitted: "Tráfico real permitido",
  readiness_status: "Preparación (readiness)",
  evidence_review: "Revisión de evidencia",
  proposal_status: "Propuesta de sandbox",
  preflight_status: "Preflight de runtime",
  secret_status: "Secreto del proveedor",
  kill_switch_status: "Kill switch",
  budget_status: "Presupuesto",
  execution_allowed: "Ejecución permitida",
  blocker_count: "Bloqueos",
  model_state: "Registro del modelo",
  route_state: "Registro de ruta",
  profile_state: "Perfil de ejecución",
  route_executable: "Ruta ejecutable",
  approval_status: "Aprobación",
  exact_policy: "Política exacta",
  consumption_status: "Consumo de autorización",
  authorization_status: "Autorización de ejecución",
  maximum_requests: "Máximo de solicitudes",
  maximum_total_spend_usd: "Gasto máximo (USD)",
  evaluated_at: "Evaluado",
  contract_version: "Versión del contrato",
  read_model_hash: "Hash del modelo de lectura",
  lifecycle: "Ciclo de vida",
  version: "Versión",
  severity: "Severidad",
  category: "Categoría",
  scope: "Alcance (proveedor / candidato)",
  execution_impact: "Impacto en la ejecución",
  resolution: "Clase de resolución",
  owner_role: "Rol responsable",
  source_evaluator: "Evaluador de origen",
  prerequisites: "Prerequisitos",
  required_artifact: "Artefacto o decisión requerida",
  related_blockers: "Bloqueos relacionados",
  test_totals: "Totales de pruebas",
};

export const REASON_CODE_SUMMARIES: Readonly<Record<string, string>> = {
  "pricing:conflicting":
    "Las fuentes de precios del proveedor son contradictorias.",
  "openrouter.external.pricing.v1:conflicting":
    "La evidencia externa de precios es contradictoria.",
  provider_routing_variability_explicit:
    "El proveedor declara variabilidad explícita del enrutamiento upstream.",
  "unresolved_mandatory_risk:benchmark-missing":
    "Falta el benchmark obligatorio del candidato.",
  "unresolved_mandatory_risk:exact-route-unproven":
    "La ruta upstream exacta no está probada.",
  "unresolved_mandatory_risk:json-schema-unverified":
    "La salida estructurada (JSON Schema) no está verificada.",
  "unresolved_mandatory_risk:pricing-conflicting":
    "El riesgo obligatorio de precios contradictorios sigue abierto.",
  "unresolved_mandatory_risk:privacy-retention-training-unknown":
    "Privacidad, retención y uso para entrenamiento sin confirmar.",
  "unresolved_mandatory_risk:profile-and-approval-absent":
    "Faltan el perfil aprobado y la aprobación humana.",
  "unresolved_mandatory_risk:zdr-unverified":
    "ZDR (Zero Data Retention) sin verificar.",
  variable_pricing_without_bounded_policy:
    "Existen precios variables sin una política de límites aprobada.",
  readiness_or_routing_blocked:
    "La preparación o el enrutamiento permanecen bloqueados.",
  benchmark_or_gold_case_missing:
    "Faltan benchmarks o casos de referencia (gold cases).",
  evidence_unverified: "La evidencia externa no está verificada.",
  exact_upstream_routing_unresolved:
    "El enrutamiento upstream exacto no está resuelto.",
  human_approval_missing: "Falta la aprobación humana independiente.",
  legal_review_pending: "La revisión legal está pendiente.",
  mandatory_evidence_not_reviewable:
    "La evidencia obligatoria no es revisable.",
  pricing_unbounded_or_conflicting:
    "Los precios no están acotados o son contradictorios.",
  privacy_zdr_unresolved: "Privacidad y ZDR sin resolver.",
  readiness_blocked: "El dossier de preparación permanece bloqueado.",
  security_review_pending: "La revisión de seguridad está pendiente.",
  structured_output_unverified: "La salida estructurada no está verificada.",
  evaluator_dependency_invalid:
    "Una dependencia del evaluador es inválida; el estado falla cerrado.",
};

export const KNOWN_EXECUTION_IMPACTS: Readonly<Record<string, string>> = {
  "Execution remains blocked until reviewed evidence confirms resolution.":
    "La ejecución permanece bloqueada hasta que evidencia revisada confirme la resolución.",
};

const present = (
  table: Readonly<Record<string, string>>,
  value: unknown,
): PresentedValue => {
  const canonical = String(value ?? "unknown");
  const label = table[canonical];
  return label !== undefined
    ? { canonical, label, known: true }
    : { canonical, label: canonical, known: false };
};

export const presentStatus = (value: unknown): PresentedValue =>
  present(STATUS_LABELS, value);
export const presentSeverity = (value: unknown): PresentedValue =>
  present(SEVERITY_LABELS, value);
export const presentBlockerCategory = (value: unknown): PresentedValue =>
  present(BLOCKER_CATEGORY_LABELS, value);
export const presentResolution = (value: unknown): PresentedValue =>
  present(RESOLUTION_LABELS, value);
export const presentOwnerRole = (value: unknown): PresentedValue =>
  present(OWNER_ROLE_LABELS, value);
export const presentEvaluator = (value: unknown): PresentedValue =>
  present(EVALUATOR_LABELS, value);
export const presentExecutionImpact = (value: unknown): PresentedValue =>
  present(KNOWN_EXECUTION_IMPACTS, value);

/** Reason portion of a namespaced blocker code (`evaluator:reason`). */
export const blockerReason = (blockerCode: string): string => {
  const separator = blockerCode.indexOf(":");
  return separator === -1 ? blockerCode : blockerCode.slice(separator + 1);
};

/**
 * Spanish operator summary for a canonical reason code. Unknown codes remain
 * canonical and are marked untranslated; they are never paraphrased.
 */
export function presentReasonCode(reasonCode: string): PresentedValue {
  const direct = REASON_CODE_SUMMARIES[reasonCode];
  if (direct !== undefined)
    return { canonical: reasonCode, label: direct, known: true };
  if (reasonCode.startsWith("missing_or_malformed_artifact:"))
    return {
      canonical: reasonCode,
      label:
        "Un artefacto gobernado del repositorio está ausente o malformado.",
      known: true,
    };
  if (reasonCode.startsWith("runtime_binding_mismatch:"))
    return {
      canonical: reasonCode,
      label:
        "Un enlace (binding) de la configuración de runtime no coincide con el artefacto gobernado.",
      known: true,
    };
  if (reasonCode.startsWith("registry:"))
    return {
      canonical: reasonCode,
      label: "La validación del registro gobernado reportó un error.",
      known: true,
    };
  return { canonical: reasonCode, label: reasonCode, known: false };
}

export const presentBlockerSummary = (
  blocker: OperatorBlocker,
): PresentedValue => presentReasonCode(blockerReason(blocker.blocker_code));

/**
 * Spanish title for a deterministic required action. Derived only from the
 * canonical `resolve:<resolution_kind>` action code; unknown codes keep the
 * read-model title unchanged and are marked untranslated.
 */
export function presentRequiredActionTitle(
  action: OperatorRequiredAction,
): PresentedValue {
  if (action.action_code.startsWith("resolve:")) {
    const kind = action.action_code.slice("resolve:".length);
    const resolution = RESOLUTION_LABELS[kind];
    if (resolution !== undefined)
      return {
        canonical: action.title,
        label: `Resolver bloqueos de ${resolution.toLowerCase()}`,
        known: true,
      };
  }
  return { canonical: action.title, label: action.title, known: false };
}

const SHORT_HASH_LENGTH = 12;

/** Abbreviated identifier for the primary visual hierarchy (`abc123def456…`). */
export function shortHash(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "ausente";
  return value.length <= SHORT_HASH_LENGTH
    ? value
    : `${value.slice(0, SHORT_HASH_LENGTH)}…`;
}

const SEVERITY_ORDER: Readonly<Record<OperatorBlocker["severity"], number>> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Highest-priority blockers for the Overview. Stable severity ordering only:
 * within the same severity the deterministic read-model order is preserved,
 * and no governance field is recalculated.
 */
export function topBlockersBySeverity(
  blockers: readonly OperatorBlocker[],
  limit: number,
): readonly OperatorBlocker[] {
  return blockers
    .map((blocker, index) => ({ blocker, index }))
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.blocker.severity] -
          SEVERITY_ORDER[b.blocker.severity] || a.index - b.index,
    )
    .slice(0, limit)
    .map((entry) => entry.blocker);
}

export interface GovernanceGroupDefinition {
  readonly title: string;
  readonly description: string;
  readonly why_it_matters: string;
  /** Presentation-only match order; the first matching group owns a blocker. */
  readonly match: RegExp | null;
}

/**
 * Presentation-only governance grouping. Groups classify existing blocker
 * codes for display; they never change severity, ordering, outcomes, or
 * required actions. `match` rules are evaluated in MATCH_ORDER and the final
 * group is the fallback so every blocker is displayed exactly once.
 */
export const GOVERNANCE_GROUPS: readonly GovernanceGroupDefinition[] = [
  {
    title: "Evidencia y preparación",
    description:
      "Estado del dossier de preparación y de la evidencia externa que respaldan al candidato.",
    why_it_matters:
      "Sin evidencia revisada, el estado gobernado no puede avanzar hacia una habilitación.",
    match: /evidence|readiness|dossier/,
  },
  {
    title: "Precios y presupuesto",
    description:
      "Consistencia de las fuentes de precios y existencia de una política de gasto acotada.",
    why_it_matters:
      "Precios contradictorios o sin límites impiden un presupuesto sandbox verificable.",
    match: /pricing/,
  },
  {
    title: "Enrutamiento del proveedor",
    description:
      "Determinismo de la ruta upstream exacta declarada por el proveedor.",
    why_it_matters:
      "Una ruta variable impide fijar la política exacta que la ejecución gobernada exige.",
    match: /rout/,
  },
  {
    title: "Privacidad, retención, entrenamiento, geografía y ZDR",
    description:
      "Confirmación de retención de datos, uso para entrenamiento, geografía y ZDR del proveedor.",
    why_it_matters:
      "Los compromisos de privacidad deben verificarse antes de enviar cualquier dato real.",
    match: /privacy|zdr|retention|training/,
  },
  {
    title: "Salida estructurada",
    description:
      "Verificación de que el candidato produce salida estructurada (JSON Schema) confiable.",
    why_it_matters:
      "Los flujos de extracción normativa dependen de salida estructurada verificada.",
    match: /json-schema|structured_output|structured-output/,
  },
  {
    title: "Benchmarks y casos de referencia",
    description:
      "Existencia de benchmarks reproducibles y casos de referencia (gold cases) revisados.",
    why_it_matters:
      "Sin métricas de calidad revisadas no hay base objetiva para habilitar al candidato.",
    match: /benchmark|gold/,
  },
  {
    title: "Revisión legal y de seguridad",
    description:
      "Estado de las revisiones legal y de seguridad requeridas por la propuesta de sandbox.",
    why_it_matters:
      "Ambas revisiones son obligatorias y no se infieren: deben registrarse explícitamente.",
    match: /legal|security/,
  },
  {
    title: "Aprobación humana",
    description:
      "Estado de la aprobación humana independiente exigida por la gobernanza.",
    why_it_matters:
      "Ninguna evaluación automática sustituye la decisión humana registrada.",
    match: /approval/,
  },
  {
    title: "Configuración de ejecución",
    description:
      "Configuración de runtime, bindings exactos y preflight del sandbox gobernado.",
    why_it_matters:
      "La ejecución exige una configuración exacta verificada; cualquier desvío falla cerrado.",
    match: null,
  },
];

/**
 * Evaluation order for the presentation-only partition: specific technical
 * topics win before the broader evidence bucket, and the runtime group is the
 * fallback. Indices refer to GOVERNANCE_GROUPS.
 */
const MATCH_ORDER: readonly number[] = [1, 3, 4, 5, 6, 7, 2, 0, 8];

export function groupBlockersForGovernance(
  blockers: readonly OperatorBlocker[],
): ReadonlyMap<string, readonly OperatorBlocker[]> {
  const grouped = new Map<string, OperatorBlocker[]>(
    GOVERNANCE_GROUPS.map((group) => [group.title, []]),
  );
  for (const blocker of blockers) {
    const reason = blockerReason(blocker.blocker_code);
    const owner =
      MATCH_ORDER.map((index) => GOVERNANCE_GROUPS[index]!).find(
        (group) => group.match !== null && group.match.test(reason),
      ) ?? GOVERNANCE_GROUPS[GOVERNANCE_GROUPS.length - 1]!;
    grouped.get(owner.title)!.push(blocker);
  }
  return grouped;
}

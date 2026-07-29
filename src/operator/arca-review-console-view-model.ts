import type { OperatorReadModel } from "./operator-read-model.js";

const MAX_STATEMENT_LENGTH = 2_000;
const MAX_FINDING_DESCRIPTION_LENGTH = 1_000;
const SHORT_HASH_LENGTH = 12;

export const ARCA_STATUS_LABELS: Readonly<Record<string, string>> = {
  pending: "Pendiente de revisión humana",
  approved: "Aprobado",
  rejected: "Rechazado",
  expired: "Vencido",
  superseded: "Sustituido",
  invalid_review: "Revisión inválida",
  invalid_candidate: "Candidato inválido",
  candidate_binding_mismatch: "Vinculación del candidato no coincide",
  pending_human_review: "Pendiente de revisión humana",
  eligible_for_approved_artifact_building:
    "Elegible únicamente para construir el artefacto aprobado",
  not_exported: "No exportado",
  not_published: "No publicado",
  not_authorized: "Uso en producción no autorizado",
  present: "Presente",
  absent: "Ausente",
  true: "Sí",
  false: "No",
};

export interface ArcaConsoleHash {
  readonly full: string | null;
  readonly short: string;
}

export interface ArcaReviewConsoleViewModel {
  readonly regulatory_batch: OperatorReadModel["arca_regulatory_batch"];
  readonly source_labels: readonly string[];
  readonly source_technical: readonly string[];
  readonly candidate: {
    readonly artifact_id: string | null;
    readonly hash: ArcaConsoleHash;
    readonly acquisition_id: string | null;
    readonly source: string | null;
    readonly captured_at: string | null;
    readonly parser_identity: string | null;
    readonly parsed_output_hash: ArcaConsoleHash;
    readonly tariff_line_count: number | null;
    readonly states: OperatorReadModel["arca_candidate_review"]["candidate_states"];
  };
  readonly review: {
    readonly lifecycle: string;
    readonly lifecycle_label: string;
    readonly reviewer_present: boolean;
    readonly reviewer_identity: string | null;
    readonly decision_timestamp: string | null;
    readonly expires_at: string | null;
    readonly review_statement: string | null;
    readonly rejection_reason: string | null;
    readonly unresolved_findings_count: number;
    readonly findings: OperatorReadModel["arca_candidate_review"]["findings"];
    readonly separation_of_duties: OperatorReadModel["arca_candidate_review"]["separation_of_duties"];
    readonly review_id: string | null;
    readonly review_hash: ArcaConsoleHash;
  };
  readonly evaluation: {
    readonly outcome: string;
    readonly outcome_label: string;
    readonly reason_codes: readonly string[];
    readonly evaluated_at: string;
    readonly evaluation_id: string;
    readonly evaluation_hash: ArcaConsoleHash;
    readonly bindings: OperatorReadModel["arca_candidate_review"]["evaluation_bindings"];
    readonly eligible_for_approved_artifact_building: boolean;
    readonly non_authorities: readonly string[];
  };
  readonly approved_artifact: OperatorReadModel["arca_approved_artifact"] & {
    readonly presence_label: string;
    readonly artifact_hash: ArcaConsoleHash;
  };
}

const bounded = (value: string | null, maximum: number): string | null => {
  if (value === null) return null;
  return value.length <= maximum ? value : `${value.slice(0, maximum)}…`;
};

const hash = (value: string | null): ArcaConsoleHash => ({
  full: value,
  short:
    value === null
      ? "ausente"
      : value.length <= SHORT_HASH_LENGTH
        ? value
        : `${value.slice(0, SHORT_HASH_LENGTH)}…`,
});

const label = (canonical: string): string =>
  ARCA_STATUS_LABELS[canonical] ?? canonical;

/**
 * Pure presentation projection. It translates canonical values but does not
 * validate, evaluate, discover, mutate, build, export, publish, or authorize.
 */
export function buildArcaReviewConsoleViewModel(
  model: OperatorReadModel,
): ArcaReviewConsoleViewModel {
  const review = model.arca_candidate_review;
  const artifact = model.arca_approved_artifact;
  const sourceLabels: string[] = [review.source_context.projection_source];
  sourceLabels.splice(
    0,
    sourceLabels.length,
    `Origen de la proyección: ${review.source_context.projection_source === "repository-current" ? "estado actual del repositorio" : "artefacto gobernado"}`,
    `Caso sintético: ${review.source_context.synthetic_candidate ? "Sí" : "No"}`,
    "Clasificación del fixture arancelario: solo pruebas; no representa un artefacto regulatorio real",
    `Decisión humana real: ${label(review.source_context.real_human_decision)}`,
    `Artefacto aprobado: ${artifact.present ? "Presente" : "Ausente"}`,
  );

  return {
    regulatory_batch:
      model.arca_regulatory_batch === null
        ? null
        : structuredClone(model.arca_regulatory_batch),
    source_labels: sourceLabels,
    source_technical: [
      `projection_source: ${review.source_context.projection_source}`,
      `fixture_kind: ${review.source_context.fixture_kind}`,
      `synthetic_candidate: ${review.source_context.synthetic_candidate}`,
      `real_human_decision: ${review.source_context.real_human_decision}`,
      `approved_artifact_present: ${artifact.present}`,
    ],
    candidate: {
      artifact_id: review.candidate_artifact_id,
      hash: hash(review.candidate_sha256),
      acquisition_id: review.acquisition_id,
      source: review.source,
      captured_at: review.captured_at,
      parser_identity:
        review.parser_id && review.parser_version
          ? `${review.parser_id}@${review.parser_version}`
          : null,
      parsed_output_hash: hash(review.parsed_output_sha256),
      tariff_line_count: review.tariff_line_count,
      states: structuredClone(review.candidate_states),
    },
    review: {
      lifecycle: review.review_lifecycle,
      lifecycle_label: label(review.review_lifecycle),
      reviewer_present: review.reviewer_present,
      reviewer_identity: review.reviewer_identity,
      decision_timestamp: review.decision_timestamp,
      expires_at: review.expires_at,
      review_statement: bounded(review.review_statement, MAX_STATEMENT_LENGTH),
      rejection_reason: bounded(review.rejection_reason, MAX_STATEMENT_LENGTH),
      unresolved_findings_count: review.unresolved_findings_count,
      findings: review.findings.map((finding) => ({
        ...finding,
        description:
          bounded(finding.description, MAX_FINDING_DESCRIPTION_LENGTH) ?? "",
      })),
      separation_of_duties: structuredClone(review.separation_of_duties),
      review_id: review.review_id,
      review_hash: hash(review.review_sha256),
    },
    evaluation: {
      outcome: review.evaluation_outcome,
      outcome_label: label(review.evaluation_outcome),
      reason_codes: [...review.evaluation_reason_codes],
      evaluated_at: review.evaluated_at,
      evaluation_id: review.evaluation_id,
      evaluation_hash: hash(review.evaluation_sha256),
      bindings: structuredClone(review.evaluation_bindings),
      eligible_for_approved_artifact_building:
        review.eligible_for_approved_artifact_building,
      non_authorities: [
        "No crea un artefacto aprobado",
        "No autoriza exportación ni publicación",
        "No autoriza uso en producción",
        "No autoriza escrituras de base de datos, red, planificador o despliegue",
        "No autoriza consumo por vlatam-global ni ejecución",
      ],
    },
    approved_artifact: {
      ...structuredClone(artifact),
      presence_label: label(artifact.present ? "present" : "absent"),
      artifact_hash: hash(artifact.approved_artifact_sha256),
    },
  };
}

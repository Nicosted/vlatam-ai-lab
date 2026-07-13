export const REGULATORY_DOSSIER_SCHEMA_VERSION = "1.0.0";

export const EVIDENCE_STATES = [
  "provided_unreviewed",
  "reviewed_supported",
  "reviewed_unsupported",
  "missing",
  "conflicting",
  "not_applicable",
] as const;

export type EvidenceState = (typeof EVIDENCE_STATES)[number];

export const DOSSIER_READINESS_STATES = [
  "intake_incomplete",
  "ready_for_research",
  "research_in_progress",
  "ready_for_professional_review",
  "blocked",
  "reviewed_advisory_ready",
] as const;

export type DossierReadinessState = (typeof DOSSIER_READINESS_STATES)[number];

export const DOSSIER_REASON_CODES = [
  "MISSING_INTENDED_USE",
  "MISSING_ACTIVE_INGREDIENTS",
  "MISSING_CONCENTRATION",
  "MISSING_SDS_MSDS",
  "UNSUPPORTED_ENVIRONMENTAL_CLAIM",
  "CONFLICTING_COMPOSITION",
  "JURISDICTION_SCOPE_MISMATCH",
  "UNREVIEWED_EVIDENCE_MARKED_REVIEWED",
  "MISSING_IMPORTER",
  "UNSAFE_DOWNSTREAM_APPROVAL",
  "FINAL_LEGAL_CONCLUSION_FORBIDDEN",
  "PROVIDER_MODEL_METADATA_FORBIDDEN",
  "CREDENTIAL_SHAPED_FIELD_FORBIDDEN",
  "MALFORMED_EVIDENCE_REFERENCE",
  "PATH_TRAVERSAL_FORBIDDEN",
  "DUPLICATE_DOSSIER_ID",
  "DUPLICATE_EVIDENCE_ID",
  "PROFESSIONAL_REVIEW_REQUIRED",
] as const;

export type DossierReasonCode = (typeof DOSSIER_REASON_CODES)[number];
export type JurisdictionCode = "AR" | "ES" | "EU";

export interface EvidenceProvenance {
  readonly source_type:
    | "client_supplied"
    | "repository_fixture"
    | "reviewed_repository_artifact";
  readonly supplied_by_role: "client" | "operator" | "professional_reviewer";
  readonly collected_at: string;
  readonly jurisdiction_codes: readonly JurisdictionCode[];
  readonly reviewed_artifact_ref?: string;
}

export interface EvidenceReference {
  readonly evidence_id: string;
  readonly evidence_type:
    | "product_label"
    | "technical_data_sheet"
    | "sds_msds"
    | "invoice_or_proforma"
    | "catalog"
    | "photo"
    | "origin_detail"
    | "certificate"
    | "composition_declaration"
    | "importer_detail";
  readonly repository_ref: string | null;
  readonly state: EvidenceState;
  readonly provenance: EvidenceProvenance;
  readonly notes: string;
}

export interface RegulatoryDossier {
  readonly dossier_id: string;
  readonly schema_version: string;
  readonly case: {
    readonly case_id: string;
    readonly case_version: string;
  };
  readonly trade_lane: {
    readonly exporter_country: {
      readonly code: "AR";
      readonly name: "Argentina";
    };
    readonly destination_country: {
      readonly code: "ES";
      readonly name: "Spain";
    };
    readonly applicable_regional_jurisdictions: readonly [
      { readonly code: "EU"; readonly name: "European Union" },
    ];
  };
  readonly product: {
    readonly category: string;
    readonly commercial_name: string;
    readonly manufacturer: string;
    readonly exporter: string;
    readonly importer: string | null;
    readonly intended_use: string | null;
    readonly target_market: string;
    readonly formulation: string | null;
    readonly active_ingredients: readonly {
      readonly ingredient_name: string;
      readonly concentration: string | null;
      readonly identifier: {
        readonly scheme: "CAS" | "EC" | "other";
        readonly value: string;
      } | null;
    }[];
    readonly packaging_and_presentation: string;
    readonly origin_details: string;
  };
  readonly claims: readonly {
    readonly claim_id: string;
    readonly claim_type:
      | "ecological"
      | "organic"
      | "biological"
      | "sustainable"
      | "environmental";
    readonly claim_text: string;
    readonly evidence_state: EvidenceState;
    readonly evidence_ref_ids: readonly string[];
  }[];
  readonly requested_operation: "export_from_argentina_and_place_on_spain_eu_market";
  readonly requested_regulatory_questions: readonly string[];
  readonly evidence: readonly EvidenceReference[];
  readonly jurisdiction_requirements: readonly {
    readonly requirement_id: string;
    readonly jurisdiction_code: JurisdictionCode;
    readonly category:
      | "export_customs"
      | "product_sector_authority"
      | "hs_ncm_classification"
      | "import_customs"
      | "chemical_product_regulation"
      | "labeling_safety"
      | "environmental_claims"
      | "importer_market_placement"
      | "logistics_documentation";
    readonly state: EvidenceState;
    readonly evidence_ref_ids: readonly string[];
    readonly required: boolean;
  }[];
  readonly professional_review_requirements: readonly {
    readonly review_id: string;
    readonly review_area: string;
    readonly jurisdiction_codes: readonly JurisdictionCode[];
    readonly status:
      | "required"
      | "completed_supported"
      | "completed_unsupported";
    readonly reviewed_artifact_ref: string | null;
  }[];
  readonly missing_evidence: readonly DossierReasonCode[];
  readonly conflicting_evidence: readonly {
    readonly conflict_id: string;
    readonly evidence_ref_ids: readonly string[];
    readonly description: string;
  }[];
  readonly readiness: DossierReadinessState;
  readonly human_review_required: true;
  readonly downstream_eligibility: {
    readonly downstream_allowed: false;
    readonly reason: "regulated_conclusions_require_reviewed_advisory_artifact";
  };
  readonly limitations: readonly string[];
}

export interface DossierEvaluation {
  readonly readiness: DossierReadinessState;
  readonly blocker_reason_codes: readonly DossierReasonCode[];
  readonly missing_evidence_reason_codes: readonly DossierReasonCode[];
  readonly human_review_required: true;
  readonly downstream_allowed: false;
}

const ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const SAFE_REPOSITORY_REF =
  /^(?:data|snapshots|reports|docs)\/[a-zA-Z0-9._/-]+$/;
const FORBIDDEN_KEYS = new Set([
  "provider",
  "provider_id",
  "model",
  "model_id",
  "profile_id",
  "endpoint_url",
]);
const CREDENTIAL_KEYS =
  /(?:api[_-]?key|access[_-]?token|secret|password|credential)/i;
const CREDENTIAL_VALUES = /(?:sk-[a-z0-9_-]{12,}|bearer\s+[a-z0-9._-]{12,})/i;
const LEGAL_CONCLUSION_KEYS = new Set([
  "final_legal_conclusion",
  "legal_approval",
  "customs_clearance",
]);

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function scanUnsafeFields(value: unknown): DossierReasonCode[] {
  const reasons: DossierReasonCode[] = [];
  const seen = new Set<unknown>();
  function walk(node: unknown): void {
    if (node === null || node === undefined) return;
    if (typeof node === "string") {
      if (CREDENTIAL_VALUES.test(node))
        reasons.push("CREDENTIAL_SHAPED_FIELD_FORBIDDEN");
      return;
    }
    if (typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (FORBIDDEN_KEYS.has(key))
        reasons.push("PROVIDER_MODEL_METADATA_FORBIDDEN");
      if (CREDENTIAL_KEYS.test(key))
        reasons.push("CREDENTIAL_SHAPED_FIELD_FORBIDDEN");
      if (LEGAL_CONCLUSION_KEYS.has(key))
        reasons.push("FINAL_LEGAL_CONCLUSION_FORBIDDEN");
      walk(child);
    }
  }
  walk(value);
  return unique(reasons);
}

export function evaluateRegulatoryDossier(
  dossier: RegulatoryDossier,
  collection: readonly RegulatoryDossier[] = [dossier],
): DossierEvaluation {
  const missing: DossierReasonCode[] = [];
  const blockers: DossierReasonCode[] = [...scanUnsafeFields(dossier)];
  const evidenceIds = dossier.evidence.map((item) => item.evidence_id);
  const evidenceById = new Map(
    dossier.evidence.map((item) => [item.evidence_id, item]),
  );

  if (
    collection.filter((item) => item.dossier_id === dossier.dossier_id).length >
    1
  ) {
    blockers.push("DUPLICATE_DOSSIER_ID");
  }
  if (new Set(evidenceIds).size !== evidenceIds.length)
    blockers.push("DUPLICATE_EVIDENCE_ID");
  if (
    dossier.product.intended_use === null ||
    dossier.product.intended_use.trim() === ""
  ) {
    missing.push("MISSING_INTENDED_USE");
  }
  if (dossier.product.active_ingredients.length === 0)
    missing.push("MISSING_ACTIVE_INGREDIENTS");
  if (
    dossier.product.active_ingredients.some(
      (item) => item.concentration === null || item.concentration.trim() === "",
    )
  ) {
    missing.push("MISSING_CONCENTRATION");
  }
  if (
    dossier.product.importer === null ||
    dossier.product.importer.trim() === ""
  )
    missing.push("MISSING_IMPORTER");

  const sds = dossier.evidence.find(
    (item) => item.evidence_type === "sds_msds",
  );
  if (sds === undefined || sds.state === "missing")
    missing.push("MISSING_SDS_MSDS");

  if (
    dossier.claims.some(
      (claim) => claim.evidence_state === "reviewed_unsupported",
    )
  ) {
    blockers.push("UNSUPPORTED_ENVIRONMENTAL_CLAIM");
  }
  if (
    dossier.conflicting_evidence.length > 0 ||
    dossier.evidence.some((item) => item.state === "conflicting")
  ) {
    blockers.push("CONFLICTING_COMPOSITION");
  }
  if (dossier.downstream_eligibility.downstream_allowed !== false)
    blockers.push("UNSAFE_DOWNSTREAM_APPROVAL");

  for (const evidence of dossier.evidence) {
    if (!ID.test(evidence.evidence_id))
      blockers.push("MALFORMED_EVIDENCE_REFERENCE");
    if (evidence.repository_ref !== null) {
      if (evidence.repository_ref.includes(".."))
        blockers.push("PATH_TRAVERSAL_FORBIDDEN");
      else if (
        !SAFE_REPOSITORY_REF.test(evidence.repository_ref) ||
        evidence.repository_ref.startsWith("/")
      ) {
        blockers.push("MALFORMED_EVIDENCE_REFERENCE");
      }
    }
    if (
      (evidence.state === "reviewed_supported" ||
        evidence.state === "reviewed_unsupported") &&
      evidence.provenance.reviewed_artifact_ref === undefined
    ) {
      blockers.push("UNREVIEWED_EVIDENCE_MARKED_REVIEWED");
    }
  }

  for (const requirement of dossier.jurisdiction_requirements) {
    for (const evidenceId of requirement.evidence_ref_ids) {
      const evidence = evidenceById.get(evidenceId);
      if (
        evidence === undefined ||
        !evidence.provenance.jurisdiction_codes.includes(
          requirement.jurisdiction_code,
        )
      ) {
        blockers.push("JURISDICTION_SCOPE_MISMATCH");
      }
    }
  }

  if (
    dossier.professional_review_requirements.some(
      (item) => item.status === "required",
    )
  ) {
    blockers.push("PROFESSIONAL_REVIEW_REQUIRED");
  }

  const blockerReasonCodes = unique(blockers).sort();
  const missingReasonCodes = unique([
    ...missing,
    ...dossier.missing_evidence,
  ]).sort();
  const readiness: DossierReadinessState = blockerReasonCodes.some(
    (code) => code !== "PROFESSIONAL_REVIEW_REQUIRED",
  )
    ? "blocked"
    : missingReasonCodes.length > 0
      ? "intake_incomplete"
      : "ready_for_research";

  return {
    readiness,
    blocker_reason_codes: blockerReasonCodes,
    missing_evidence_reason_codes: missingReasonCodes,
    human_review_required: true,
    downstream_allowed: false,
  };
}

export const ARGENTINA_SPAIN_ECOLOGICAL_AGROCHEMICAL_DOSSIER: RegulatoryDossier =
  {
    dossier_id: "dossier.ar-es-ecological-agrochemicals.v1",
    schema_version: REGULATORY_DOSSIER_SCHEMA_VERSION,
    case: {
      case_id: "case.ar-es-ecological-agrochemicals",
      case_version: "1.0.0",
    },
    trade_lane: {
      exporter_country: { code: "AR", name: "Argentina" },
      destination_country: { code: "ES", name: "Spain" },
      applicable_regional_jurisdictions: [
        { code: "EU", name: "European Union" },
      ],
    },
    product: {
      category:
        "ecological agrochemical product (client description; unverified)",
      commercial_name: "Client product name pending",
      manufacturer: "Manufacturer details pending",
      exporter: "Exporter details pending",
      importer: null,
      intended_use: null,
      target_market: "Spain / European Union",
      formulation: null,
      active_ingredients: [],
      packaging_and_presentation: "Packaging and presentation pending",
      origin_details: "Argentina origin details pending",
    },
    claims: [
      {
        claim_id: "claim.ecological.client-description",
        claim_type: "ecological",
        claim_text:
          "Ecological product claim supplied as an unverified client description.",
        evidence_state: "provided_unreviewed",
        evidence_ref_ids: ["evidence.catalog.placeholder"],
      },
    ],
    requested_operation: "export_from_argentina_and_place_on_spain_eu_market",
    requested_regulatory_questions: [
      "Which Argentina export and sector-authority evidence is required?",
      "Which Spain and EU import, product, chemical, labeling, and market-placement requirements require research?",
      "What evidence is required before an HS/NCM classification hypothesis can be professionally reviewed?",
      "What reviewed evidence would be required to support ecological, biological, organic, or environmental claims?",
    ],
    evidence: [
      {
        evidence_id: "evidence.catalog.placeholder",
        evidence_type: "catalog",
        repository_ref: "data/fixtures/advisory/client-catalog-placeholder.pdf",
        state: "provided_unreviewed",
        provenance: {
          source_type: "repository_fixture",
          supplied_by_role: "operator",
          collected_at: "2026-07-13T00:00:00.000Z",
          jurisdiction_codes: ["AR", "ES", "EU"],
        },
        notes:
          "Placeholder reference only; no private or raw document content is stored.",
      },
      {
        evidence_id: "evidence.sds.missing",
        evidence_type: "sds_msds",
        repository_ref: null,
        state: "missing",
        provenance: {
          source_type: "repository_fixture",
          supplied_by_role: "operator",
          collected_at: "2026-07-13T00:00:00.000Z",
          jurisdiction_codes: ["AR", "ES", "EU"],
        },
        notes: "SDS/MSDS has not been supplied.",
      },
    ],
    jurisdiction_requirements: [
      {
        requirement_id: "ar.export-customs",
        jurisdiction_code: "AR",
        category: "export_customs",
        state: "missing",
        evidence_ref_ids: [],
        required: true,
      },
      {
        requirement_id: "ar.product-sector-authority",
        jurisdiction_code: "AR",
        category: "product_sector_authority",
        state: "missing",
        evidence_ref_ids: [],
        required: true,
      },
      {
        requirement_id: "ar.hs-ncm",
        jurisdiction_code: "AR",
        category: "hs_ncm_classification",
        state: "missing",
        evidence_ref_ids: [],
        required: true,
      },
      {
        requirement_id: "es.import-customs",
        jurisdiction_code: "ES",
        category: "import_customs",
        state: "missing",
        evidence_ref_ids: [],
        required: true,
      },
      {
        requirement_id: "eu.chemical-product",
        jurisdiction_code: "EU",
        category: "chemical_product_regulation",
        state: "missing",
        evidence_ref_ids: [],
        required: true,
      },
      {
        requirement_id: "eu.labeling-safety",
        jurisdiction_code: "EU",
        category: "labeling_safety",
        state: "missing",
        evidence_ref_ids: [],
        required: true,
      },
      {
        requirement_id: "eu.environmental-claims",
        jurisdiction_code: "EU",
        category: "environmental_claims",
        state: "provided_unreviewed",
        evidence_ref_ids: ["evidence.catalog.placeholder"],
        required: true,
      },
      {
        requirement_id: "es.importer-market-placement",
        jurisdiction_code: "ES",
        category: "importer_market_placement",
        state: "missing",
        evidence_ref_ids: [],
        required: true,
      },
      {
        requirement_id: "ar-es.logistics",
        jurisdiction_code: "AR",
        category: "logistics_documentation",
        state: "missing",
        evidence_ref_ids: [],
        required: true,
      },
    ],
    professional_review_requirements: [
      {
        review_id: "review.trade-customs",
        review_area: "Argentina export and Spain import/customs",
        jurisdiction_codes: ["AR", "ES"],
        status: "required",
        reviewed_artifact_ref: null,
      },
      {
        review_id: "review.eu-product",
        review_area:
          "EU product, chemical, labeling, safety, and environmental claims",
        jurisdiction_codes: ["EU"],
        status: "required",
        reviewed_artifact_ref: null,
      },
    ],
    missing_evidence: [
      "MISSING_INTENDED_USE",
      "MISSING_ACTIVE_INGREDIENTS",
      "MISSING_SDS_MSDS",
      "MISSING_IMPORTER",
    ],
    conflicting_evidence: [],
    readiness: "intake_incomplete",
    human_review_required: true,
    downstream_eligibility: {
      downstream_allowed: false,
      reason: "regulated_conclusions_require_reviewed_advisory_artifact",
    },
    limitations: [
      "This intake is not legal advice, customs clearance, product registration, market authorization, ecological certification, or a final HS/NCM classification.",
      "Provided documents remain unreviewed until a separately reviewed repository artifact supports them.",
    ],
  };

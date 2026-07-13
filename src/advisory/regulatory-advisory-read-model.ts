import {
  evaluateRegulatoryDossier,
  type DossierReasonCode,
  type DossierReadinessState,
  type RegulatoryDossier,
} from './regulatory-dossier-intake.js';

const SCHEMA_VERSION = '1.0.0';
const DEFAULT_GENERATED_AT = '1970-01-01T00:00:00.000Z';

export type RequestedLanguage = 'en' | 'es';

export type SourceCoverageClassification =
  | 'reviewed_official'
  | 'reviewed_internal'
  | 'sample_only'
  | 'missing'
  | 'stale'
  | 'unverified'
  | 'requires_human_review';

export type AdvisoryChecklistStatus =
  | 'covered_by_reviewed_evidence'
  | 'missing_source'
  | 'needs_reviewed_evidence';

export const DEFAULT_REGULATORY_REVIEW_AREAS = [
  {
    area_id: 'hs_ncm_classification_dependency',
    label: {
      en: 'HS/NCM classification dependency',
      es: 'Dependencia de clasificacion HS/NCM',
    },
  },
  {
    area_id: 'argentina_export_requirements',
    label: {
      en: 'Argentina export requirements',
      es: 'Requisitos de exportacion de Argentina',
    },
  },
  {
    area_id: 'argentina_customs_export_documentation',
    label: {
      en: 'Argentina customs/export documentation',
      es: 'Documentacion aduanera/exportadora de Argentina',
    },
  },
  {
    area_id: 'senasa_or_relevant_argentine_authority_review',
    label: {
      en: 'SENASA or relevant Argentine authority review if applicable',
      es: 'Revision de SENASA u otra autoridad argentina relevante si aplica',
    },
  },
  {
    area_id: 'spain_import_customs_requirements',
    label: {
      en: 'Spain import/customs requirements',
      es: 'Requisitos de importacion/aduana en Espana',
    },
  },
  {
    area_id: 'eu_market_access_requirements',
    label: {
      en: 'EU market access requirements',
      es: 'Requisitos de acceso al mercado de la UE',
    },
  },
  {
    area_id: 'eu_product_classification_uncertainty',
    label: {
      en: 'EU plant protection product / fertilizer / biostimulant / chemical classification uncertainty',
      es: 'Incertidumbre de clasificacion UE: fitosanitario / fertilizante / bioestimulante / quimico',
    },
  },
  {
    area_id: 'reach_clp_or_chemical_compliance_screening',
    label: {
      en: 'REACH/CLP or chemical compliance screening if applicable',
      es: 'Revision REACH/CLP o cumplimiento quimico si aplica',
    },
  },
  {
    area_id: 'organic_ecological_biological_claim_validation',
    label: {
      en: 'Organic/ecological/biological claim validation',
      es: 'Validacion de claims organico/ecologico/biologico',
    },
  },
  {
    area_id: 'labeling_and_safety_documentation',
    label: {
      en: 'Labeling and safety documentation',
      es: 'Etiquetado y documentacion de seguridad',
    },
  },
  {
    area_id: 'certificates_registrations_licenses_permits',
    label: {
      en: 'Certificates, registrations, licenses, permits',
      es: 'Certificados, registros, licencias y permisos',
    },
  },
  {
    area_id: 'restricted_substances_active_ingredients_review',
    label: {
      en: 'Restricted substances / active ingredients review',
      es: 'Revision de sustancias restringidas / ingredientes activos',
    },
  },
  {
    area_id: 'sds_technical_sheet_composition_documentation',
    label: {
      en: 'SDS / technical sheet / composition documentation',
      es: 'SDS / ficha tecnica / documentacion de composicion',
    },
  },
  {
    area_id: 'incoterms_and_logistics_assumptions',
    label: {
      en: 'Incoterms and logistics assumptions',
      es: 'Supuestos de Incoterms y logistica',
    },
  },
  {
    area_id: 'human_expert_review_before_client_recommendation',
    label: {
      en: 'Human expert review before client-facing recommendation',
      es: 'Revision experta humana antes de una recomendacion al cliente',
    },
  },
] as const;

export type RegulatoryReviewAreaId =
  (typeof DEFAULT_REGULATORY_REVIEW_AREAS)[number]['area_id'];

export const DEFAULT_REGULATORY_REVIEW_AREA_IDS: readonly RegulatoryReviewAreaId[] =
  DEFAULT_REGULATORY_REVIEW_AREAS.map((area) => area.area_id);

export interface JurisdictionReference {
  readonly code: string;
  readonly name: string;
  readonly kind: 'country' | 'bloc' | 'region' | 'global';
}

export interface RegulatoryAdvisoryUseCaseInput {
  readonly origin_country: JurisdictionReference;
  readonly destination: {
    readonly countries?: readonly JurisdictionReference[];
    readonly blocs?: readonly JurisdictionReference[];
  };
  readonly product_family: string;
  readonly hs_ncm_code?: string | null;
  readonly requested_language: RequestedLanguage;
}

export interface AdvisorySourceRegistryRecord {
  readonly source_id: string;
  readonly source_name?: string;
  readonly source_type?: string;
  readonly authority_level?: string;
  readonly reliability_level?: string;
  readonly jurisdiction_scope?: string;
  readonly country_code?: string;
  readonly regional_scope?: string;
  readonly topic_scope?: readonly string[];
  readonly source_locator?: string;
  readonly verification_status?: string;
  readonly freshness_status?: string;
  readonly human_review_required?: boolean;
  readonly downstream_allowed?: boolean;
}

export interface AdvisorySourceSnapshotRecord {
  readonly snapshot_id: string;
  readonly source_id: string;
  readonly capture_method?: string;
  readonly source_locator?: string;
  readonly content_reference?: string;
  readonly freshness_status?: string;
  readonly review_status?: string;
  readonly extraction_status?: string;
  readonly human_review_required?: boolean;
  readonly downstream_allowed?: boolean;
}

// Read-model callers may embed source records for tests or small fixtures, but
// these inputs are not canonical storage and must not become a parallel source
// registry. Future advisory inputs should be resolved from PCRAM source
// registry, snapshots, evidence, review manifests, jurisdiction packs, and
// approved KB snapshots before this pure assembler is called.
export interface AdvisorySourceRecord {
  readonly source_ref: string;
  readonly source_id: string;
  readonly jurisdiction_codes: readonly string[];
  readonly review_area_ids: readonly RegulatoryReviewAreaId[];
  readonly registry?: AdvisorySourceRegistryRecord;
  readonly snapshot?: AdvisorySourceSnapshotRecord;
  readonly evidence_refs?: readonly string[];
  readonly internal_review_status?: 'draft' | 'pending_review' | 'approved' | 'rejected';
}

export interface RegulatoryAdvisoryReadinessBuildInput {
  readonly use_case: RegulatoryAdvisoryUseCaseInput;
  readonly dossier?: RegulatoryDossier;
  readonly source_records?: readonly AdvisorySourceRecord[];
  readonly required_review_area_ids?: readonly RegulatoryReviewAreaId[];
  readonly fixture_status?: 'draft' | 'pending_review' | 'approved' | 'rejected';
  readonly generated_at?: string;
}

export interface SourceCoverageSummary {
  readonly source_count: number;
  readonly classifications: Record<SourceCoverageClassification, number>;
  readonly official_reviewed_source_count: number;
  readonly reviewed_internal_source_count: number;
  readonly sample_only_source_count: number;
  readonly has_reviewed_official_source: boolean;
  readonly missing_required_area_count: number;
  readonly areas_with_reviewed_evidence: readonly RegulatoryReviewAreaId[];
  readonly areas_without_reviewed_evidence: readonly RegulatoryReviewAreaId[];
  readonly missing_jurisdiction_codes: readonly string[];
}

export interface ConfirmedReviewedInput {
  readonly source_ref: string;
  readonly source_id: string;
  readonly coverage: 'reviewed_official' | 'reviewed_internal';
  readonly review_area_ids: readonly RegulatoryReviewAreaId[];
  readonly evidence_refs: readonly string[];
}

export interface MissingOrUnreviewedInput {
  readonly review_area_id: RegulatoryReviewAreaId;
  readonly review_area: string;
  readonly coverage: SourceCoverageClassification;
  readonly source_refs: readonly string[];
  readonly evidence_refs: readonly string[];
  readonly reason: string;
}

export interface RequiredReviewArea {
  readonly area_id: RegulatoryReviewAreaId;
  readonly label: string;
  readonly required: true;
}

export interface AdvisoryChecklistItem {
  readonly item_id: RegulatoryReviewAreaId;
  readonly label: string;
  readonly status: AdvisoryChecklistStatus;
  readonly coverage: SourceCoverageClassification;
  readonly source_refs: readonly string[];
  readonly evidence_refs: readonly string[];
  readonly notes: readonly string[];
}

export interface RegulatoryAdvisoryReadinessView {
  readonly advisory_id: string;
  readonly use_case: {
    readonly status: 'draft' | 'pending_review' | 'approved' | 'rejected';
    readonly summary: string;
    readonly requested_language: RequestedLanguage;
  };
  readonly jurisdictions: {
    readonly origin: JurisdictionReference;
    readonly destination_countries: readonly JurisdictionReference[];
    readonly destination_blocs: readonly JurisdictionReference[];
  };
  readonly product_scope: {
    readonly product_family: string;
    readonly hs_ncm_code: string | null;
    readonly classification_status: 'provided_unreviewed' | 'missing_or_uncertain';
  };
  readonly dossier_intake: {
    readonly dossier_id: string;
    readonly case_id: string;
    readonly case_version: string;
    readonly readiness: DossierReadinessState;
    readonly blocker_reason_codes: readonly DossierReasonCode[];
    readonly missing_evidence_reason_codes: readonly DossierReasonCode[];
    readonly human_review_required: true;
    readonly downstream_allowed: false;
  } | null;
  readonly source_coverage_summary: SourceCoverageSummary;
  readonly confirmed_reviewed_inputs: readonly ConfirmedReviewedInput[];
  readonly missing_or_unreviewed_inputs: readonly MissingOrUnreviewedInput[];
  readonly required_review_areas: readonly RequiredReviewArea[];
  readonly advisory_checklist: readonly AdvisoryChecklistItem[];
  readonly source_refs: readonly string[];
  readonly evidence_refs: readonly string[];
  readonly human_review_required: true;
  readonly downstream_allowed: boolean;
  readonly uncertainty_notes: readonly string[];
  readonly generated_at: string;
  readonly schema_version: string;
}

const REVIEW_AREA_BY_ID = new Map<RegulatoryReviewAreaId, (typeof DEFAULT_REGULATORY_REVIEW_AREAS)[number]>(
  DEFAULT_REGULATORY_REVIEW_AREAS.map((area) => [area.area_id, area])
);

const COVERAGE_RANK: Record<SourceCoverageClassification, number> = {
  reviewed_official: 7,
  reviewed_internal: 6,
  requires_human_review: 5,
  stale: 4,
  unverified: 3,
  sample_only: 2,
  missing: 1,
};

function label(areaId: RegulatoryReviewAreaId, language: RequestedLanguage): string {
  const area = REVIEW_AREA_BY_ID.get(areaId);
  if (area === undefined) {
    throw new Error(`Unknown review area: ${areaId}`);
  }
  return area.label[language];
}

function messages(language: RequestedLanguage) {
  if (language === 'es') {
    return {
      noFinalAnswer:
        'Este read-model no emite una recomendacion legal, aduanera, arancelaria, sanitaria, quimica ni de cumplimiento final.',
      humanReview:
        'La revision humana experta es obligatoria antes de cualquier recomendacion al cliente.',
      missingHs:
        'El codigo HS/NCM falta o es incierto; el read-model no infiere ni adivina una clasificacion.',
      noReviewedOfficialSource:
        'No hay una fuente oficial revisada que cubra este advisory de punta a punta.',
      incompleteJurisdiction:
        'La cobertura jurisdiccional esta incompleta para los codigos requeridos.',
      sampleOnly:
        'Hay fuentes sample-only o placeholder; no son seguras para uso con clientes.',
      noReviewedEvidence:
        'El area no tiene evidencia revisada que la respalde.',
      stale:
        'La cobertura de fuente esta vencida o requiere verificacion de vigencia.',
      unverified:
        'La fuente no esta verificada como oficial o aprobada internamente.',
      missingSource:
        'No hay fuente local registrada para esta area.',
      requiresReview:
        'La fuente o snapshot requiere revision humana antes de uso downstream.',
    };
  }

  return {
    noFinalAnswer:
      'This read-model does not emit a final legal, customs, tariff, sanitary, chemical, or compliance recommendation.',
    humanReview:
      'Human expert review is mandatory before any client-facing recommendation.',
    missingHs:
      'HS/NCM code is missing or uncertain; the read-model did not infer or guess a classification.',
    noReviewedOfficialSource:
      'No reviewed official source covers this advisory end to end.',
    incompleteJurisdiction:
      'Jurisdiction coverage is incomplete for the required jurisdiction codes.',
    sampleOnly:
      'Sample-only or placeholder sources are present; they are not client-safe.',
    noReviewedEvidence:
      'This area has no reviewed evidence backing it.',
    stale:
      'Source coverage is stale or requires freshness verification.',
    unverified:
      'The source is not verified official or approved internal intelligence.',
    missingSource:
      'No local source is registered for this area.',
    requiresReview:
      'The source or snapshot requires human review before downstream use.',
  };
}

function normalizeCode(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed;
}

function unique<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

function slug(value: string): string {
  const asciiValue = Array.from(value.normalize('NFKD'))
    .filter((character) => character.charCodeAt(0) <= 0x7f)
    .join('');

  return asciiValue
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function hasSampleLocator(record: AdvisorySourceRecord): boolean {
  const locators = [
    record.source_ref,
    record.registry?.source_locator,
    record.snapshot?.source_locator,
    record.snapshot?.content_reference,
  ].filter((value): value is string => typeof value === 'string');

  return locators.some((locator) => locator.startsWith('sample://') || locator.includes('sample://'));
}

function freshnessValues(record: AdvisorySourceRecord): string[] {
  return [record.registry?.freshness_status, record.snapshot?.freshness_status].filter(
    (value): value is string => typeof value === 'string'
  );
}

function hasReviewedEvidence(record: AdvisorySourceRecord): boolean {
  return (record.evidence_refs?.length ?? 0) > 0;
}

function hasApprovedSnapshot(record: AdvisorySourceRecord): boolean {
  return record.snapshot?.review_status === 'approved' && record.snapshot.downstream_allowed === true;
}

function isVerifiedOfficialRegistry(record: AdvisorySourceRecord): boolean {
  return record.registry?.verification_status === 'verified_official' && record.registry.authority_level === 'official';
}

export function classifySourceCoverage(record?: AdvisorySourceRecord): SourceCoverageClassification {
  if (record === undefined || (record.registry === undefined && record.snapshot === undefined)) {
    return 'missing';
  }

  if (record.registry?.verification_status === 'unverified_sample' || hasSampleLocator(record)) {
    return 'sample_only';
  }

  const freshness = freshnessValues(record);
  if (record.registry?.verification_status === 'deprecated' || freshness.includes('stale')) {
    return 'stale';
  }

  const verifiedOfficial = isVerifiedOfficialRegistry(record);
  if (
    record.registry?.verification_status !== undefined &&
    record.registry.verification_status !== 'verified_official'
  ) {
    return 'unverified';
  }

  if (
    freshness.length === 0 ||
    freshness.some((value) => value === 'unknown' || value === 'requires_review') ||
    record.snapshot?.review_status === 'not_reviewed' ||
    record.snapshot?.review_status === 'in_review' ||
    record.snapshot?.review_status === 'unknown'
  ) {
    return 'requires_human_review';
  }

  const approvedForEvidence =
    hasReviewedEvidence(record) && (hasApprovedSnapshot(record) || record.internal_review_status === 'approved');

  if (verifiedOfficial && approvedForEvidence) {
    return 'reviewed_official';
  }

  if (approvedForEvidence) {
    return 'reviewed_internal';
  }

  return 'requires_human_review';
}

function isReviewedCoverage(
  coverage: SourceCoverageClassification
): coverage is 'reviewed_official' | 'reviewed_internal' {
  return coverage === 'reviewed_official' || coverage === 'reviewed_internal';
}

function bestCoverage(records: readonly AdvisorySourceRecord[]): SourceCoverageClassification {
  if (records.length === 0) {
    return 'missing';
  }

  return records
    .map((record) => classifySourceCoverage(record))
    .sort((left, right) => COVERAGE_RANK[right] - COVERAGE_RANK[left])[0] ?? 'missing';
}

function emptyCoverageCounts(): Record<SourceCoverageClassification, number> {
  return {
    reviewed_official: 0,
    reviewed_internal: 0,
    sample_only: 0,
    missing: 0,
    stale: 0,
    unverified: 0,
    requires_human_review: 0,
  };
}

function requestedJurisdictionCodes(useCase: RegulatoryAdvisoryUseCaseInput): string[] {
  return unique([
    useCase.origin_country.code,
    ...(useCase.destination.countries ?? []).map((country) => country.code),
    ...(useCase.destination.blocs ?? []).map((bloc) => bloc.code),
  ]);
}

function buildAdvisoryId(useCase: RegulatoryAdvisoryUseCaseInput): string {
  const destinationCodes = [
    ...(useCase.destination.countries ?? []).map((country) => country.code),
    ...(useCase.destination.blocs ?? []).map((bloc) => bloc.code),
  ];
  const hsCode = normalizeCode(useCase.hs_ncm_code) ?? 'hs-ncm-unclassified';

  return [
    'advisory',
    slug(useCase.origin_country.code),
    slug(destinationCodes.join('-') || 'destination-unknown'),
    slug(useCase.product_family),
    slug(hsCode),
  ].join('--');
}

function checklistStatus(
  records: readonly AdvisorySourceRecord[],
  reviewedEvidenceRefs: readonly string[]
): AdvisoryChecklistStatus {
  if (reviewedEvidenceRefs.length > 0) {
    return 'covered_by_reviewed_evidence';
  }
  return records.length === 0 ? 'missing_source' : 'needs_reviewed_evidence';
}

function reasonForMissingInput(
  item: AdvisoryChecklistItem,
  language: RequestedLanguage
): string {
  const text = messages(language);
  if (item.status === 'missing_source') {
    return text.missingSource;
  }
  if (item.coverage === 'sample_only') {
    return text.sampleOnly;
  }
  if (item.coverage === 'stale') {
    return text.stale;
  }
  if (item.coverage === 'unverified') {
    return text.unverified;
  }
  if (item.coverage === 'requires_human_review') {
    return text.requiresReview;
  }
  return text.noReviewedEvidence;
}

function buildChecklistNotes(
  areaId: RegulatoryReviewAreaId,
  language: RequestedLanguage,
  hsNcmCode: string | null,
  reviewedEvidenceRefs: readonly string[]
): string[] {
  const text = messages(language);
  const notes: string[] = [];

  if (areaId === 'hs_ncm_classification_dependency' && hsNcmCode === null) {
    notes.push(text.missingHs);
  }
  if (reviewedEvidenceRefs.length === 0) {
    notes.push(text.noReviewedEvidence);
  }

  return notes;
}

export function buildRegulatoryAdvisoryReadinessView(
  input: RegulatoryAdvisoryReadinessBuildInput
): RegulatoryAdvisoryReadinessView {
  const useCase = input.use_case;
  const language = useCase.requested_language;
  const text = messages(language);
  const sourceRecords = input.source_records ?? [];
  const requiredAreaIds = input.required_review_area_ids ?? DEFAULT_REGULATORY_REVIEW_AREA_IDS;
  const hsNcmCode = normalizeCode(useCase.hs_ncm_code);
  const dossierEvaluation = input.dossier === undefined
    ? null
    : evaluateRegulatoryDossier(input.dossier);

  const requiredReviewAreas: RequiredReviewArea[] = requiredAreaIds.map((areaId) => ({
    area_id: areaId,
    label: label(areaId, language),
    required: true,
  }));

  const advisoryChecklist: AdvisoryChecklistItem[] = requiredAreaIds.map((areaId) => {
    const records = sourceRecords.filter((record) => record.review_area_ids.includes(areaId));
    const reviewedRecords = records.filter((record) => isReviewedCoverage(classifySourceCoverage(record)));
    const reviewedEvidenceRefs = unique(reviewedRecords.flatMap((record) => record.evidence_refs ?? []));
    const sourceRefs = unique(records.map((record) => record.source_ref));

    return {
      item_id: areaId,
      label: label(areaId, language),
      status: checklistStatus(records, reviewedEvidenceRefs),
      coverage: bestCoverage(records),
      source_refs: sourceRefs,
      evidence_refs: reviewedEvidenceRefs,
      notes: buildChecklistNotes(areaId, language, hsNcmCode, reviewedEvidenceRefs),
    };
  });

  const confirmedReviewedInputs: ConfirmedReviewedInput[] = sourceRecords.flatMap((record) => {
    const coverage = classifySourceCoverage(record);
    if (!isReviewedCoverage(coverage)) {
      return [];
    }

    return [
      {
        source_ref: record.source_ref,
        source_id: record.source_id,
        coverage,
        review_area_ids: record.review_area_ids,
        evidence_refs: record.evidence_refs ?? [],
      },
    ];
  });

  const missingOrUnreviewedInputs: MissingOrUnreviewedInput[] = advisoryChecklist
    .filter((item) => item.status !== 'covered_by_reviewed_evidence')
    .map((item) => ({
      review_area_id: item.item_id,
      review_area: item.label,
      coverage: item.coverage,
      source_refs: item.source_refs,
      evidence_refs: item.evidence_refs,
      reason: reasonForMissingInput(item, language),
    }));

  const classifications = emptyCoverageCounts();
  for (const sourceRecord of sourceRecords) {
    classifications[classifySourceCoverage(sourceRecord)] += 1;
  }

  const reviewedJurisdictionCodes = new Set(
    sourceRecords
      .filter((record) => isReviewedCoverage(classifySourceCoverage(record)))
      .flatMap((record) => record.jurisdiction_codes)
  );
  const missingJurisdictionCodes = requestedJurisdictionCodes(useCase).filter(
    (code) => !reviewedJurisdictionCodes.has(code)
  );

  const areasWithReviewedEvidence = advisoryChecklist
    .filter((item) => item.status === 'covered_by_reviewed_evidence')
    .map((item) => item.item_id);
  const areasWithoutReviewedEvidence = advisoryChecklist
    .filter((item) => item.status !== 'covered_by_reviewed_evidence')
    .map((item) => item.item_id);

  const sourceCoverageSummary: SourceCoverageSummary = {
    source_count: sourceRecords.length,
    classifications,
    official_reviewed_source_count: classifications.reviewed_official,
    reviewed_internal_source_count: classifications.reviewed_internal,
    sample_only_source_count: classifications.sample_only,
    has_reviewed_official_source: classifications.reviewed_official > 0,
    missing_required_area_count: areasWithoutReviewedEvidence.length,
    areas_with_reviewed_evidence: areasWithReviewedEvidence,
    areas_without_reviewed_evidence: areasWithoutReviewedEvidence,
    missing_jurisdiction_codes: missingJurisdictionCodes,
  };

  const productClassificationReady =
    hsNcmCode !== null &&
    advisoryChecklist.some(
      (item) =>
        item.item_id === 'hs_ncm_classification_dependency' &&
        item.status === 'covered_by_reviewed_evidence'
    );
  const allRequiredAreasBacked = areasWithoutReviewedEvidence.length === 0;
  const noUnsafeSourceCoverage = sourceRecords.every((record) =>
    isReviewedCoverage(classifySourceCoverage(record))
  );
  const fixtureStatusAllowsDownstream =
    input.fixture_status === undefined || input.fixture_status === 'approved';
  const downstreamAllowed =
    dossierEvaluation === null &&
    fixtureStatusAllowsDownstream &&
    sourceCoverageSummary.has_reviewed_official_source &&
    missingJurisdictionCodes.length === 0 &&
    productClassificationReady &&
    allRequiredAreasBacked &&
    noUnsafeSourceCoverage;

  const uncertaintyNotes = [
    text.noFinalAnswer,
    text.humanReview,
    ...(hsNcmCode === null ? [text.missingHs] : []),
    ...(!sourceCoverageSummary.has_reviewed_official_source ? [text.noReviewedOfficialSource] : []),
    ...(missingJurisdictionCodes.length > 0
      ? [`${text.incompleteJurisdiction} Missing: ${missingJurisdictionCodes.join(', ')}.`]
      : []),
    ...(sourceCoverageSummary.sample_only_source_count > 0 ? [text.sampleOnly] : []),
    ...(areasWithoutReviewedEvidence.length > 0
      ? [`${text.noReviewedEvidence} Missing areas: ${areasWithoutReviewedEvidence.join(', ')}.`]
      : []),
  ];

  return {
    advisory_id: buildAdvisoryId(useCase),
    use_case: {
      status: input.fixture_status ?? 'draft',
      summary: `${useCase.origin_country.name} -> ${[
        ...(useCase.destination.countries ?? []).map((country) => country.name),
        ...(useCase.destination.blocs ?? []).map((bloc) => bloc.name),
      ].join(' / ')}: ${useCase.product_family}`,
      requested_language: language,
    },
    jurisdictions: {
      origin: useCase.origin_country,
      destination_countries: useCase.destination.countries ?? [],
      destination_blocs: useCase.destination.blocs ?? [],
    },
    product_scope: {
      product_family: useCase.product_family,
      hs_ncm_code: hsNcmCode,
      classification_status: productClassificationReady ? 'provided_unreviewed' : 'missing_or_uncertain',
    },
    dossier_intake: input.dossier === undefined || dossierEvaluation === null
      ? null
      : {
          dossier_id: input.dossier.dossier_id,
          case_id: input.dossier.case.case_id,
          case_version: input.dossier.case.case_version,
          readiness: dossierEvaluation.readiness,
          blocker_reason_codes: dossierEvaluation.blocker_reason_codes,
          missing_evidence_reason_codes: dossierEvaluation.missing_evidence_reason_codes,
          human_review_required: true,
          downstream_allowed: false,
        },
    source_coverage_summary: sourceCoverageSummary,
    confirmed_reviewed_inputs: confirmedReviewedInputs,
    missing_or_unreviewed_inputs: missingOrUnreviewedInputs,
    required_review_areas: requiredReviewAreas,
    advisory_checklist: advisoryChecklist,
    source_refs: unique(sourceRecords.map((record) => record.source_ref)),
    evidence_refs: unique(confirmedReviewedInputs.flatMap((record) => record.evidence_refs)),
    human_review_required: true,
    downstream_allowed: downstreamAllowed,
    uncertainty_notes: uncertaintyNotes,
    generated_at: input.generated_at ?? DEFAULT_GENERATED_AT,
    schema_version: SCHEMA_VERSION,
  };
}

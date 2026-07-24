import {
  ARGENTINA_SPAIN_ECOLOGICAL_AGROCHEMICAL_DOSSIER,
  evaluateRegulatoryDossier,
  type DossierEvaluation,
  type RegulatoryDossier,
} from './regulatory-dossier-intake.js';

const WORKSPACE_SCHEMA_VERSION = '1.0.0';
const DEMO_WORKSPACE_TIMESTAMP = '2026-07-02T00:00:00.000Z';

export const REGULATORY_RESEARCH_CASE_STATUSES = [
  'draft',
  'needs_evidence',
  'research_ready',
  'in_review',
  'blocked',
  'completed',
] as const;

export type RegulatoryResearchCaseStatus =
  (typeof REGULATORY_RESEARCH_CASE_STATUSES)[number];

export type RegulatoryResearchCaseType = 'export_regulatory_review';

export const RESEARCH_QUESTION_STATUSES = [
  'source_required',
  'not_yet_verified',
  'blocked_by_missing_evidence',
  'ready_for_review',
  'reviewed',
] as const;

export type ResearchQuestionStatus =
  (typeof RESEARCH_QUESTION_STATUSES)[number];

export const SOURCE_REQUIREMENT_CATEGORIES = [
  {
    category_id: 'argentina_export_authority_source',
    label: 'Argentina export authority/source',
  },
  {
    category_id: 'spain_import_authority_source',
    label: 'Spain import authority/source',
  },
  {
    category_id: 'european_union_regulatory_source',
    label: 'European Union regulatory source',
  },
  {
    category_id: 'customs_tariff_classification_source',
    label: 'customs/tariff classification source',
  },
  {
    category_id: 'product_safety_chemical_regulation_source',
    label: 'product safety / chemical regulation source',
  },
  {
    category_id: 'organic_ecological_certification_source',
    label: 'organic/ecological certification source',
  },
  {
    category_id: 'logistics_documentation_source',
    label: 'logistics/documentation source',
  },
  {
    category_id: 'professional_human_review',
    label: 'professional human review',
  },
] as const;

export type SourceRequirementCategoryId =
  (typeof SOURCE_REQUIREMENT_CATEGORIES)[number]['category_id'];

export type SourceRequirementStatus =
  | 'source_required'
  | 'not_yet_verified'
  | 'reviewed'
  | 'not_applicable';

export interface SourceRequirement {
  readonly category_id: SourceRequirementCategoryId;
  readonly label: string;
  readonly status: SourceRequirementStatus;
  readonly required_before_final_answer: true;
}

export const READINESS_EVIDENCE_STATUSES = [
  'present',
  'missing',
  'needs_review',
  'not_applicable',
] as const;

export type ReadinessEvidenceStatus =
  (typeof READINESS_EVIDENCE_STATUSES)[number];

export const REQUIRED_EVIDENCE_ITEMS = [
  {
    evidence_id: 'technical_sheet',
    label: 'technical sheet',
    status: 'missing',
  },
  {
    evidence_id: 'product_composition_active_ingredients',
    label: 'product composition / active ingredients',
    status: 'missing',
  },
  {
    evidence_id: 'safety_data_sheet',
    label: 'MSDS / Safety Data Sheet',
    status: 'missing',
  },
  {
    evidence_id: 'catalog',
    label: 'catalog',
    status: 'missing',
  },
  {
    evidence_id: 'invoice_or_proforma',
    label: 'invoice or proforma',
    status: 'missing',
  },
  {
    evidence_id: 'product_photos_or_labels',
    label: 'product photos or labels',
    status: 'missing',
  },
  {
    evidence_id: 'ecological_organic_claim_certificates',
    label: 'certificates supporting ecological/organic claims',
    status: 'needs_review',
  },
  {
    evidence_id: 'intended_use',
    label: 'intended use',
    status: 'missing',
  },
  {
    evidence_id: 'origin_exporter_importer_details',
    label: 'origin/exporter/importer details',
    status: 'missing',
  },
] as const satisfies readonly {
  readonly evidence_id: string;
  readonly label: string;
  readonly status: ReadinessEvidenceStatus;
}[];

export type ReadinessEvidenceId =
  (typeof REQUIRED_EVIDENCE_ITEMS)[number]['evidence_id'];

export interface ReadinessEvidenceItem {
  readonly evidence_id: ReadinessEvidenceId;
  readonly label: string;
  readonly status: ReadinessEvidenceStatus;
  readonly required_before_final_answer: boolean;
}

export interface JurisdictionSummary {
  readonly code: string;
  readonly name: string;
}

export interface ResearchQuestion {
  readonly question_id: string;
  readonly prompt: string;
  readonly status: ResearchQuestionStatus;
  readonly source_requirement_category_ids: readonly SourceRequirementCategoryId[];
  readonly evidence_requirement_ids: readonly ReadinessEvidenceId[];
  readonly final_answer: null;
}

export interface ReadinessSummary {
  readonly present_count: number;
  readonly missing_count: number;
  readonly needs_review_count: number;
  readonly not_applicable_count: number;
  readonly blocked_by_missing_evidence: boolean;
  readonly summary: string;
}

export interface HumanReviewRequirement {
  readonly required: true;
  readonly reason: string;
  readonly reviewer_profile: string;
}

export interface RegulatoryResearchWorkspace {
  readonly dossier: RegulatoryDossier;
  readonly dossier_evaluation: DossierEvaluation;
  readonly workspace_id: string;
  readonly case_title: string;
  readonly origin_country: JurisdictionSummary;
  readonly destination_country: JurisdictionSummary;
  readonly destination_blocs: readonly JurisdictionSummary[];
  readonly product_category: string;
  readonly case_type: RegulatoryResearchCaseType;
  readonly status: RegulatoryResearchCaseStatus;
  readonly product_context_summary: string;
  readonly research_questions: readonly ResearchQuestion[];
  readonly source_requirements: readonly SourceRequirement[];
  readonly evidence_requirements: readonly ReadinessEvidenceItem[];
  readonly readiness_summary: ReadinessSummary;
  readonly human_review_requirement: HumanReviewRequirement;
  readonly final_answer: null;
  readonly downstream_allowed: false;
  readonly created_at: string;
  readonly updated_at: string;
  readonly schema_version: string;
}

const DEFAULT_RESEARCH_QUESTIONS = [
  {
    question_id: 'hs_ncm_classification_hypothesis',
    prompt:
      'What HS/NCM classification hypothesis should be investigated, and what evidence is needed to validate it?',
    status: 'blocked_by_missing_evidence',
    source_requirement_category_ids: [
      'customs_tariff_classification_source',
      'argentina_export_authority_source',
      'professional_human_review',
    ],
    evidence_requirement_ids: [
      'technical_sheet',
      'product_composition_active_ingredients',
      'intended_use',
    ],
  },
  {
    question_id: 'argentina_export_documentation',
    prompt: 'What export documentation from Argentina must be verified?',
    status: 'source_required',
    source_requirement_category_ids: [
      'argentina_export_authority_source',
      'logistics_documentation_source',
      'professional_human_review',
    ],
    evidence_requirement_ids: [
      'invoice_or_proforma',
      'origin_exporter_importer_details',
    ],
  },
  {
    question_id: 'spain_eu_import_requirements',
    prompt: 'What Spanish/EU import requirements must be verified?',
    status: 'source_required',
    source_requirement_category_ids: [
      'spain_import_authority_source',
      'european_union_regulatory_source',
      'professional_human_review',
    ],
    evidence_requirement_ids: [
      'technical_sheet',
      'intended_use',
      'origin_exporter_importer_details',
    ],
  },
  {
    question_id:
      'chemical_environmental_plant_health_product_safety_registration',
    prompt:
      'Are there chemical, environmental, plant-health, product-safety, or registration requirements that may apply?',
    status: 'source_required',
    source_requirement_category_ids: [
      'european_union_regulatory_source',
      'product_safety_chemical_regulation_source',
      'spain_import_authority_source',
      'professional_human_review',
    ],
    evidence_requirement_ids: [
      'product_composition_active_ingredients',
      'safety_data_sheet',
      'intended_use',
    ],
  },
  {
    question_id: 'sds_msds_required',
    prompt: 'Is a Safety Data Sheet / MSDS required?',
    status: 'blocked_by_missing_evidence',
    source_requirement_category_ids: [
      'product_safety_chemical_regulation_source',
      'european_union_regulatory_source',
      'professional_human_review',
    ],
    evidence_requirement_ids: [
      'safety_data_sheet',
      'product_composition_active_ingredients',
    ],
  },
  {
    question_id: 'ecological_organic_bio_environmental_claims',
    prompt:
      'Are ecological, organic, bio, or environmental claims supported by certificates?',
    status: 'blocked_by_missing_evidence',
    source_requirement_category_ids: [
      'organic_ecological_certification_source',
      'european_union_regulatory_source',
      'professional_human_review',
    ],
    evidence_requirement_ids: [
      'ecological_organic_claim_certificates',
      'product_photos_or_labels',
      'catalog',
    ],
  },
  {
    question_id: 'composition_labels_intended_use_documented',
    prompt:
      'Are product composition, active ingredients, labels, and intended use documented?',
    status: 'blocked_by_missing_evidence',
    source_requirement_category_ids: [
      'product_safety_chemical_regulation_source',
      'logistics_documentation_source',
      'professional_human_review',
    ],
    evidence_requirement_ids: [
      'product_composition_active_ingredients',
      'product_photos_or_labels',
      'intended_use',
    ],
  },
  {
    question_id: 'missing_evidence_before_reviewed_answer',
    prompt:
      'What evidence is still missing before AI LAB can produce a reviewed answer?',
    status: 'not_yet_verified',
    source_requirement_category_ids: ['professional_human_review'],
    evidence_requirement_ids: [
      'technical_sheet',
      'product_composition_active_ingredients',
      'safety_data_sheet',
      'catalog',
      'invoice_or_proforma',
      'product_photos_or_labels',
      'ecological_organic_claim_certificates',
      'intended_use',
      'origin_exporter_importer_details',
    ],
  },
  {
    question_id: 'official_sources_before_final_recommendation',
    prompt:
      'Which official sources must be consulted before any final recommendation?',
    status: 'source_required',
    source_requirement_category_ids: [
      'argentina_export_authority_source',
      'spain_import_authority_source',
      'european_union_regulatory_source',
      'customs_tariff_classification_source',
      'product_safety_chemical_regulation_source',
      'organic_ecological_certification_source',
      'logistics_documentation_source',
      'professional_human_review',
    ],
    evidence_requirement_ids: [
      'technical_sheet',
      'product_composition_active_ingredients',
      'safety_data_sheet',
    ],
  },
  {
    question_id: 'professional_review_required',
    prompt:
      'Which professional review is required before client-facing advice?',
    status: 'source_required',
    source_requirement_category_ids: ['professional_human_review'],
    evidence_requirement_ids: [
      'technical_sheet',
      'product_composition_active_ingredients',
      'safety_data_sheet',
      'ecological_organic_claim_certificates',
    ],
  },
] as const satisfies readonly Omit<ResearchQuestion, 'final_answer'>[];

function sourceRequirementFor(
  category: (typeof SOURCE_REQUIREMENT_CATEGORIES)[number],
): SourceRequirement {
  return {
    category_id: category.category_id,
    label: category.label,
    status: 'source_required',
    required_before_final_answer: true,
  };
}

function evidenceRequirementFor(
  item: (typeof REQUIRED_EVIDENCE_ITEMS)[number],
): ReadinessEvidenceItem {
  return {
    evidence_id: item.evidence_id,
    label: item.label,
    status: item.status,
    required_before_final_answer: true,
  };
}

export function summarizeReadiness(
  evidenceRequirements: readonly ReadinessEvidenceItem[],
): ReadinessSummary {
  const presentCount = evidenceRequirements.filter(
    (item) => item.status === 'present',
  ).length;
  const missingCount = evidenceRequirements.filter(
    (item) => item.status === 'missing',
  ).length;
  const needsReviewCount = evidenceRequirements.filter(
    (item) => item.status === 'needs_review',
  ).length;
  const notApplicableCount = evidenceRequirements.filter(
    (item) => item.status === 'not_applicable',
  ).length;
  const blockedByMissingEvidence = missingCount > 0 || needsReviewCount > 0;
  const missingLabel = `${missingCount} evidence ${missingCount === 1 ? 'item is' : 'items are'} missing`;
  const needsReviewLabel = `${needsReviewCount} ${needsReviewCount === 1 ? 'item needs' : 'items need'} review`;

  return {
    present_count: presentCount,
    missing_count: missingCount,
    needs_review_count: needsReviewCount,
    not_applicable_count: notApplicableCount,
    blocked_by_missing_evidence: blockedByMissingEvidence,
    summary: blockedByMissingEvidence
      ? `Research is not ready for a reviewed answer: ${missingLabel} and ${needsReviewLabel}.`
      : 'Research evidence is present for review, but professional approval is still required before any client-facing answer.',
  };
}

export function buildArgentinaSpainEcologicalAgrochemicalWorkspace(): RegulatoryResearchWorkspace {
  const evidenceRequirements = REQUIRED_EVIDENCE_ITEMS.map(
    evidenceRequirementFor,
  );

  return {
    dossier: ARGENTINA_SPAIN_ECOLOGICAL_AGROCHEMICAL_DOSSIER,
    dossier_evaluation: evaluateRegulatoryDossier(
      ARGENTINA_SPAIN_ECOLOGICAL_AGROCHEMICAL_DOSSIER,
    ),
    workspace_id: 'research-workspace--ar--es--ecological-agrochemicals',
    case_title: 'Export of ecological agrochemicals from Argentina to Spain',
    origin_country: {
      code: 'AR',
      name: 'Argentina',
    },
    destination_country: {
      code: 'ES',
      name: 'Spain',
    },
    destination_blocs: [
      {
        code: 'EU',
        name: 'European Union',
      },
    ],
    product_category: 'ecological agrochemicals',
    case_type: 'export_regulatory_review',
    status: 'needs_evidence',
    product_context_summary:
      'Potential client case for exporting ecological agrochemical products from Argentina to Spain. Product composition, classification, claims, labels, and official-source coverage remain unverified.',
    research_questions: DEFAULT_RESEARCH_QUESTIONS.map((question) => ({
      ...question,
      final_answer: null,
    })),
    source_requirements:
      SOURCE_REQUIREMENT_CATEGORIES.map(sourceRequirementFor),
    evidence_requirements: evidenceRequirements,
    readiness_summary: summarizeReadiness(evidenceRequirements),
    human_review_requirement: {
      required: true,
      reason:
        'Official source evidence and professional review are required before AI LAB can produce any client-facing legal, customs, chemical, product-safety, or regulatory recommendation.',
      reviewer_profile:
        'International trade/customs professional with Spain/EU regulatory and product-safety review support as applicable.',
    },
    final_answer: null,
    downstream_allowed: false,
    created_at: DEMO_WORKSPACE_TIMESTAMP,
    updated_at: DEMO_WORKSPACE_TIMESTAMP,
    schema_version: WORKSPACE_SCHEMA_VERSION,
  };
}

export const ARGENTINA_SPAIN_ECOLOGICAL_AGROCHEMICAL_WORKSPACE =
  buildArgentinaSpainEcologicalAgrochemicalWorkspace();

export function missingEvidenceItems(
  workspace: RegulatoryResearchWorkspace,
): readonly ReadinessEvidenceItem[] {
  return workspace.evidence_requirements.filter(
    (item) => item.status === 'missing' || item.status === 'needs_review',
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sentenceCaseStatus(value: string): string {
  return value.replace(/_/g, ' ');
}

function listItems(values: readonly string[]): string {
  return values.map((value) => `<li>${escapeHtml(value)}</li>`).join('');
}

function renderSourceRequirementLabels(
  workspace: RegulatoryResearchWorkspace,
  categoryIds: readonly SourceRequirementCategoryId[],
): string {
  const labels = categoryIds.map((categoryId) => {
    const requirement = workspace.source_requirements.find(
      (source) => source.category_id === categoryId,
    );
    return requirement?.label ?? categoryId;
  });

  return labels
    .map((label) => `<span class="chip">${escapeHtml(label)}</span>`)
    .join('');
}

export function renderRegulatoryResearchWorkspaceHtml(
  workspace: RegulatoryResearchWorkspace = ARGENTINA_SPAIN_ECOLOGICAL_AGROCHEMICAL_WORKSPACE,
  styleNonce?: string,
): string {
  const routeLane = `${workspace.origin_country.name} -> ${workspace.destination_country.name}`;
  const missingItems = missingEvidenceItems(workspace);
  const blocLabels = workspace.destination_blocs
    .map((bloc) => bloc.name)
    .join(', ');
  const dossier = workspace.dossier;
  const evidenceInventory = dossier.evidence.map(
    (item) => `${item.evidence_type}: ${sentenceCaseStatus(item.state)}`,
  );
  const jurisdictionCoverage = dossier.jurisdiction_requirements.map(
    (item) => `${item.jurisdiction_code} / ${item.category}: ${sentenceCaseStatus(item.state)}`,
  );
  const blockerCodes = workspace.dossier_evaluation.blocker_reason_codes;
  const missingCodes = workspace.dossier_evaluation.missing_evidence_reason_codes;
  const requiredReviews = dossier.professional_review_requirements.map(
    (item) => `${item.review_area}: ${item.status}`,
  );

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(workspace.case_title)} | AI LAB</title>
  <style${styleNonce ? ` nonce="${escapeHtml(styleNonce)}"` : ''}>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --surface: #ffffff;
      --text: #17202a;
      --muted: #5c6670;
      --border: #d9e0e7;
      --accent: #0f766e;
      --warning: #9a3412;
      --danger: #991b1b;
    }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Arial, Helvetica, sans-serif;
      line-height: 1.5;
    }
    main {
      max-width: 1120px;
      margin: 0 auto;
      padding: 32px 20px 48px;
    }
    header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    h1 {
      font-size: 30px;
      line-height: 1.2;
      margin: 8px 0 12px;
    }
    h2 {
      font-size: 18px;
      margin: 0 0 12px;
    }
    p {
      margin: 0 0 12px;
    }
    .eyebrow {
      color: var(--accent);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    .warning {
      background: #fff7ed;
      border: 1px solid #fed7aa;
      border-radius: 6px;
      color: var(--warning);
      padding: 12px 14px;
    }
    .grid {
      display: grid;
      gap: 16px;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      margin: 20px 0;
    }
    .panel, .question {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 16px;
    }
    .label {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0;
      margin-bottom: 4px;
      text-transform: uppercase;
    }
    .value {
      font-weight: 700;
    }
    .status {
      color: var(--danger);
      font-weight: 700;
    }
    .questions {
      display: grid;
      gap: 12px;
    }
    .question p {
      margin-bottom: 10px;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .chip {
      background: #eef6f5;
      border: 1px solid #b9d8d4;
      border-radius: 999px;
      color: #134e4a;
      display: inline-block;
      font-size: 12px;
      font-weight: 700;
      padding: 4px 8px;
    }
    ul {
      margin: 0;
      padding-left: 20px;
    }
    @media (max-width: 640px) {
      main {
        padding: 24px 14px 36px;
      }
      h1 {
        font-size: 24px;
      }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="eyebrow">Regulatory Research Workspace</div>
      <h1>${escapeHtml(workspace.case_title)}</h1>
      <p>${escapeHtml(workspace.product_context_summary)}</p>
      <p class="warning">This is a regulatory research workspace. It is not final legal/customs advice. Answers require official sources and professional review. Missing evidence can block reliable conclusions.</p>
    </header>

    <section class="grid" aria-label="Case summary">
      <div class="panel">
        <div class="label">Dossier identity</div>
        <div class="value">${escapeHtml(dossier.dossier_id)} / ${escapeHtml(dossier.case.case_id)} @ ${escapeHtml(dossier.case.case_version)}</div>
      </div>
      <div class="panel">
        <div class="label">Route / lane</div>
        <div class="value">${escapeHtml(routeLane)}${blocLabels.length > 0 ? ` (${escapeHtml(blocLabels)})` : ''}</div>
      </div>
      <div class="panel">
        <div class="label">Product / category</div>
        <div class="value">${escapeHtml(workspace.product_category)}</div>
      </div>
      <div class="panel">
        <div class="label">Case type</div>
        <div class="value">${escapeHtml(workspace.case_type)}</div>
      </div>
      <div class="panel">
        <div class="label">Status</div>
        <div class="value status">${escapeHtml(sentenceCaseStatus(workspace.dossier_evaluation.readiness))} (workspace: ${escapeHtml(sentenceCaseStatus(workspace.status))})</div>
      </div>
    </section>

    <section class="grid" aria-label="Readiness summary">
      <div class="panel">
        <h2>Readiness Summary</h2>
        <p>${escapeHtml(workspace.readiness_summary.summary)}</p>
        <p><strong>Dossier readiness:</strong> ${escapeHtml(sentenceCaseStatus(workspace.dossier_evaluation.readiness))}</p>
        <p><strong>Final answer:</strong> not generated</p>
        <p><strong>Downstream allowed:</strong> no</p>
      </div>
      <div class="panel">
        <h2>Missing Evidence</h2>
        <ul>${listItems(missingItems.map((item) => `${item.label}: ${sentenceCaseStatus(item.status)}`))}</ul>
      </div>
      <div class="panel">
        <h2>Human Review</h2>
        <p>${escapeHtml(workspace.human_review_requirement.reason)}</p>
        <p><strong>Required professional review:</strong> yes</p>
      </div>
    </section>

    <section class="grid" aria-label="Dossier evidence and jurisdiction coverage">
      <div class="panel">
        <h2>Product Context</h2>
        <p><strong>Commercial name:</strong> ${escapeHtml(dossier.product.commercial_name)}</p>
        <p><strong>Manufacturer:</strong> ${escapeHtml(dossier.product.manufacturer)}</p>
        <p><strong>Intended use:</strong> ${escapeHtml(dossier.product.intended_use ?? 'missing')}</p>
        <p><strong>Formulation:</strong> ${escapeHtml(dossier.product.formulation ?? 'missing')}</p>
      </div>
      <div class="panel">
        <h2>Evidence Inventory</h2>
        <ul>${listItems(evidenceInventory)}</ul>
      </div>
      <div class="panel">
        <h2>Jurisdiction Coverage</h2>
        <ul>${listItems(jurisdictionCoverage)}</ul>
      </div>
      <div class="panel">
        <h2>Blockers</h2>
        <ul>${listItems(blockerCodes.length > 0 ? blockerCodes : ['none'])}</ul>
      </div>
      <div class="panel">
        <h2>Missing Evidence Codes</h2>
        <ul>${listItems(missingCodes.length > 0 ? missingCodes : ['none'])}</ul>
      </div>
      <div class="panel">
        <h2>Required Professional Reviews</h2>
        <ul>${listItems(requiredReviews)}</ul>
      </div>
    </section>

    <section aria-label="Research questions">
      <h2>Research Questions</h2>
      <div class="questions">
        ${workspace.research_questions
          .map(
            (question) => `<article class="question">
          <p><strong>${escapeHtml(question.prompt)}</strong></p>
          <p><span class="label">Question status</span> ${escapeHtml(sentenceCaseStatus(question.status))}</p>
          <div class="chips" aria-label="Required source categories">${renderSourceRequirementLabels(workspace, question.source_requirement_category_ids)}</div>
        </article>`,
          )
          .join('')}
      </div>
    </section>
  </main>
</body>
</html>`;
}

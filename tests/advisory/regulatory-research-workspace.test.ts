import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ARGENTINA_SPAIN_ECOLOGICAL_AGROCHEMICAL_WORKSPACE,
  READINESS_EVIDENCE_STATUSES,
  REGULATORY_RESEARCH_CASE_STATUSES,
  SOURCE_REQUIREMENT_CATEGORIES,
  missingEvidenceItems,
  renderRegulatoryResearchWorkspaceHtml,
} from '../../src/advisory/regulatory-research-workspace.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const workspaceSourcePath = resolve(
  repoRoot,
  'src',
  'advisory',
  'regulatory-research-workspace.ts',
);

const expectedQuestionPrompts = [
  'What HS/NCM classification hypothesis should be investigated, and what evidence is needed to validate it?',
  'What export documentation from Argentina must be verified?',
  'What Spanish/EU import requirements must be verified?',
  'Are there chemical, environmental, plant-health, product-safety, or registration requirements that may apply?',
  'Is a Safety Data Sheet / MSDS required?',
  'Are ecological, organic, bio, or environmental claims supported by certificates?',
  'Are product composition, active ingredients, labels, and intended use documented?',
  'What evidence is still missing before AI LAB can produce a reviewed answer?',
  'Which official sources must be consulted before any final recommendation?',
  'Which professional review is required before client-facing advice?',
];

describe('regulatory research workspace', () => {
  it('defines the requested workspace and evidence status values', () => {
    assert.deepEqual(
      [...REGULATORY_RESEARCH_CASE_STATUSES],
      [
        'draft',
        'needs_evidence',
        'research_ready',
        'in_review',
        'blocked',
        'completed',
      ],
    );
    assert.deepEqual(
      [...READINESS_EVIDENCE_STATUSES],
      ['present', 'missing', 'needs_review', 'not_applicable'],
    );
  });

  it('builds the Argentina to Spain ecological agrochemical research case', () => {
    const workspace = ARGENTINA_SPAIN_ECOLOGICAL_AGROCHEMICAL_WORKSPACE;

    assert.equal(
      workspace.case_title,
      'Export of ecological agrochemicals from Argentina to Spain',
    );
    assert.equal(workspace.origin_country.name, 'Argentina');
    assert.equal(workspace.destination_country.name, 'Spain');
    assert.equal(workspace.product_category, 'ecological agrochemicals');
    assert.equal(workspace.case_type, 'export_regulatory_review');
    assert.equal(workspace.status, 'needs_evidence');
    assert.equal(workspace.downstream_allowed, false);
  });

  it('includes the default research questions as placeholders, not answers', () => {
    const workspace = ARGENTINA_SPAIN_ECOLOGICAL_AGROCHEMICAL_WORKSPACE;

    assert.deepEqual(
      workspace.research_questions.map((question) => question.prompt),
      expectedQuestionPrompts,
    );
    assert.ok(
      workspace.research_questions.every(
        (question) => question.final_answer === null,
      ),
    );
    assert.ok(
      workspace.research_questions.every(
        (question) => question.source_requirement_category_ids.length > 0,
      ),
    );
  });

  it('requires source categories before any final answer can be produced', () => {
    const workspace = ARGENTINA_SPAIN_ECOLOGICAL_AGROCHEMICAL_WORKSPACE;

    assert.deepEqual(
      SOURCE_REQUIREMENT_CATEGORIES.map((category) => category.label),
      [
        'Argentina export authority/source',
        'Spain import authority/source',
        'European Union regulatory source',
        'customs/tariff classification source',
        'product safety / chemical regulation source',
        'organic/ecological certification source',
        'logistics/documentation source',
        'professional human review',
      ],
    );
    assert.ok(
      workspace.source_requirements.every(
        (source) => source.status === 'source_required',
      ),
    );
    assert.ok(
      workspace.source_requirements.every(
        (source) => source.required_before_final_answer,
      ),
    );
    assert.equal(workspace.final_answer, null);
  });

  it('tracks the required evidence groups and missing readiness state', () => {
    const workspace = ARGENTINA_SPAIN_ECOLOGICAL_AGROCHEMICAL_WORKSPACE;

    assert.deepEqual(
      workspace.evidence_requirements.map((item) => item.evidence_id),
      [
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
    );
    assert.equal(workspace.readiness_summary.missing_count, 8);
    assert.equal(workspace.readiness_summary.needs_review_count, 1);
    assert.equal(workspace.readiness_summary.blocked_by_missing_evidence, true);
    assert.equal(missingEvidenceItems(workspace).length, 9);
  });

  it('renders the visible workspace with missing evidence and human review warnings', () => {
    const html = renderRegulatoryResearchWorkspaceHtml();

    assert.match(html, /Regulatory Research Workspace/);
    assert.match(html, /Argentina -&gt; Spain/);
    assert.match(html, /ecological agrochemicals/);
    assert.match(html, /needs evidence/);
    assert.match(html, /technical sheet: missing/);
    assert.match(html, /This is a regulatory research workspace/);
    assert.match(html, /It is not final legal\/customs advice/);
    assert.match(
      html,
      /Answers require official sources and professional review/,
    );
    assert.match(html, /Missing evidence can block reliable conclusions/);
    assert.match(html, /Dossier identity/);
    assert.match(html, /Evidence Inventory/);
    assert.match(html, /Jurisdiction Coverage/);
    assert.match(html, /Required Professional Reviews/);
    assert.match(html, /MISSING_ACTIVE_INGREDIENTS/);
    assert.match(html, /Downstream allowed:<\/strong> no/);
  });

  it('does not add external AI provider or web scraping behavior', () => {
    const source = readFileSync(workspaceSourcePath, 'utf-8');

    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /\bOpenAI\b/);
    assert.doesNotMatch(source, /chat\/completions/);
    assert.doesNotMatch(source, /process\.env/);
    assert.doesNotMatch(
      source,
      /\b(scrape|crawler|puppeteer|playwright|cheerio)\b/i,
    );
  });
});

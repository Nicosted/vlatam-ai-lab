import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_REGULATORY_REVIEW_AREA_IDS,
  buildRegulatoryAdvisoryReadinessView,
  classifySourceCoverage,
  type AdvisorySourceRecord,
  type RegulatoryAdvisoryReadinessBuildInput,
  type RegulatoryReviewAreaId,
} from '../../src/advisory/regulatory-advisory-read-model.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const fixturePath = resolve(
  repoRoot,
  'data',
  'fixtures',
  'advisory',
  'regulatory-advisory-readiness-ar-es-eu-ecological-biological-agrochemical.json'
);

function loadFixture(): RegulatoryAdvisoryReadinessBuildInput {
  return JSON.parse(readFileSync(fixturePath, 'utf-8')) as RegulatoryAdvisoryReadinessBuildInput;
}

function approvedSourceForReviewArea(
  areaId: RegulatoryReviewAreaId,
  index: number,
  reviewAreaWithoutEvidence?: RegulatoryReviewAreaId
): AdvisorySourceRecord {
  const sourceId = `positive-control-source-${index}`;
  const isOfficialSource = index === 0;
  const evidenceRefs =
    areaId === reviewAreaWithoutEvidence ? [] : [`reports/reviewed-evidence/${areaId}.md`];

  return {
    source_ref: `snapshots/pcram/positive-control-${areaId}.json`,
    source_id: sourceId,
    jurisdiction_codes: ['AR', 'ES', 'EU', 'GLOBAL'],
    review_area_ids: [areaId],
    ...(evidenceRefs.length > 0 && { evidence_refs: evidenceRefs }),
    internal_review_status: 'approved',
    registry: {
      source_id: sourceId,
      source_name: `Positive control source for ${areaId}`,
      ...(isOfficialSource && {
        authority_level: 'official',
        verification_status: 'verified_official',
        source_locator: 'manual/local/reviewed-official-positive-control',
      }),
      freshness_status: 'current',
      human_review_required: true,
      downstream_allowed: true,
    },
    snapshot: {
      snapshot_id: `positive-control-snapshot-${index}`,
      source_id: sourceId,
      capture_method: 'manual',
      source_locator: 'manual/local/reviewed-positive-control',
      freshness_status: 'current',
      review_status: 'approved',
      extraction_status: 'extracted',
      human_review_required: true,
      downstream_allowed: true,
    },
  };
}

function approvedPositiveControlInput(
  reviewAreaWithoutEvidence?: RegulatoryReviewAreaId
): RegulatoryAdvisoryReadinessBuildInput {
  return {
    fixture_status: 'approved',
    generated_at: '2026-07-01T00:00:00.000Z',
    use_case: {
      origin_country: {
        code: 'AR',
        name: 'Argentina',
        kind: 'country',
      },
      destination: {
        countries: [
          {
            code: 'ES',
            name: 'Spain',
            kind: 'country',
          },
        ],
        blocs: [
          {
            code: 'EU',
            name: 'European Union',
            kind: 'bloc',
          },
        ],
      },
      product_family: 'positive-control reviewed advisory product',
      hs_ncm_code: '3808.99.99',
      requested_language: 'en',
    },
    required_review_area_ids: DEFAULT_REGULATORY_REVIEW_AREA_IDS,
    source_records: DEFAULT_REGULATORY_REVIEW_AREA_IDS.map((areaId, index) =>
      approvedSourceForReviewArea(areaId, index, reviewAreaWithoutEvidence)
    ),
  };
}

describe('regulatory advisory read-model — Argentina to Spain/EU agrochemical readiness', () => {
  it('keeps the agrochemical fixture blocked from downstream use', () => {
    const view = buildRegulatoryAdvisoryReadinessView(loadFixture());

    assert.equal(view.advisory_id, 'advisory--ar--es-eu--ecological-biological-agrochemical-products--hs-ncm-unclassified');
    assert.equal(view.use_case.status, 'pending_review');
    assert.equal(view.human_review_required, true);
    assert.equal(view.downstream_allowed, false);
    assert.deepEqual(view.confirmed_reviewed_inputs, []);
    assert.deepEqual(view.evidence_refs, []);
  });

  it('includes every required regulatory review area', () => {
    const view = buildRegulatoryAdvisoryReadinessView(loadFixture());

    assert.deepEqual(
      view.required_review_areas.map((area) => area.area_id),
      DEFAULT_REGULATORY_REVIEW_AREA_IDS
    );
    assert.deepEqual(
      view.advisory_checklist.map((item) => item.item_id),
      DEFAULT_REGULATORY_REVIEW_AREA_IDS
    );
  });

  it('treats missing HS/NCM classification as uncertainty instead of guessing', () => {
    const view = buildRegulatoryAdvisoryReadinessView(loadFixture());
    const serialized = JSON.stringify(view).toLowerCase();

    assert.equal(view.product_scope.hs_ncm_code, null);
    assert.equal(view.product_scope.classification_status, 'missing_or_uncertain');
    assert.ok(
      view.uncertainty_notes.some((note) => note.includes('did not infer or guess a classification'))
    );
    assert.doesNotMatch(serialized, /3808|3101|3105/);
  });

  it('does not make sample-only or unreviewed source records client-safe', () => {
    const fixture = loadFixture();
    const sampleRecord = fixture.source_records?.find(
      (record) => record.source_id === 'ar-sectoral-source-placeholder-candidate'
    );

    assert.equal(classifySourceCoverage(sampleRecord), 'sample_only');

    const view = buildRegulatoryAdvisoryReadinessView(fixture);

    assert.equal(view.source_coverage_summary.sample_only_source_count, 1);
    assert.equal(view.source_coverage_summary.has_reviewed_official_source, false);
    assert.equal(view.source_coverage_summary.classifications.requires_human_review, 4);
    assert.equal(view.downstream_allowed, false);
    assert.equal(view.missing_or_unreviewed_inputs.length, DEFAULT_REGULATORY_REVIEW_AREA_IDS.length);
  });

  it('preserves human review and uncertainty warnings in Spanish output mode', () => {
    const fixture = loadFixture();
    const view = buildRegulatoryAdvisoryReadinessView({
      ...fixture,
      use_case: {
        ...fixture.use_case,
        requested_language: 'es',
      },
    });

    assert.equal(view.downstream_allowed, false);
    assert.ok(view.uncertainty_notes.some((note) => note.includes('revision humana experta')));
    assert.ok(view.uncertainty_notes.some((note) => note.includes('no infiere ni adivina')));
    assert.ok(view.required_review_areas.some((area) => area.label.includes('Requisitos de acceso')));
  });

  it('never emits a final legal or customs recommendation without reviewed evidence', () => {
    const view = buildRegulatoryAdvisoryReadinessView(loadFixture());
    const serialized = JSON.stringify(view).toLowerCase();

    assert.equal(view.confirmed_reviewed_inputs.length, 0);
    assert.equal(view.evidence_refs.length, 0);
    assert.equal(view.downstream_allowed, false);
    assert.ok(view.uncertainty_notes.some((note) => note.includes('does not emit a final legal')));
    assert.doesNotMatch(serialized, /\b(client may export|client can export|export is allowed|customs clearance is allowed)\b/);
  });

  it('allows downstream only when all required areas are approved and evidence-backed', () => {
    const view = buildRegulatoryAdvisoryReadinessView(approvedPositiveControlInput());

    assert.equal(view.downstream_allowed, true);
    assert.equal(view.source_coverage_summary.classifications.reviewed_official, 1);
    assert.equal(
      view.source_coverage_summary.classifications.reviewed_internal,
      DEFAULT_REGULATORY_REVIEW_AREA_IDS.length - 1
    );
    assert.equal(view.source_coverage_summary.classifications.sample_only, 0);
    assert.equal(view.source_coverage_summary.classifications.stale, 0);
    assert.equal(view.source_coverage_summary.classifications.unverified, 0);
    assert.equal(view.source_coverage_summary.classifications.missing, 0);
    assert.equal(view.source_coverage_summary.classifications.requires_human_review, 0);
    assert.deepEqual(view.source_coverage_summary.missing_jurisdiction_codes, []);
    assert.deepEqual(view.missing_or_unreviewed_inputs, []);
    assert.equal(view.confirmed_reviewed_inputs.length, DEFAULT_REGULATORY_REVIEW_AREA_IDS.length);
    assert.equal(view.evidence_refs.length, DEFAULT_REGULATORY_REVIEW_AREA_IDS.length);
    assert.ok(
      view.advisory_checklist.every(
        (item) =>
          item.status === 'covered_by_reviewed_evidence' &&
          (item.coverage === 'reviewed_official' || item.coverage === 'reviewed_internal') &&
          item.evidence_refs.length > 0
      )
    );
  });

  it('blocks downstream when one required area loses reviewed evidence', () => {
    const reviewAreaWithoutEvidence =
      DEFAULT_REGULATORY_REVIEW_AREA_IDS[DEFAULT_REGULATORY_REVIEW_AREA_IDS.length - 1];
    if (reviewAreaWithoutEvidence === undefined) {
      throw new Error('Expected at least one default regulatory review area');
    }

    const view = buildRegulatoryAdvisoryReadinessView(
      approvedPositiveControlInput(reviewAreaWithoutEvidence)
    );

    assert.equal(view.downstream_allowed, false);
    assert.equal(view.missing_or_unreviewed_inputs.length, 1);
    assert.equal(view.source_coverage_summary.classifications.requires_human_review, 1);
    assert.equal(view.source_coverage_summary.classifications.sample_only, 0);
    assert.equal(view.source_coverage_summary.classifications.stale, 0);
    assert.equal(view.source_coverage_summary.classifications.unverified, 0);

    const missingInput = view.missing_or_unreviewed_inputs[0];
    assert.ok(missingInput);
    assert.equal(missingInput.review_area_id, reviewAreaWithoutEvidence);
    assert.equal(missingInput.coverage, 'requires_human_review');
  });
});

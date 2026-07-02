import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_REGULATORY_REVIEW_AREA_IDS,
  buildRegulatoryAdvisoryReadinessView,
  classifySourceCoverage,
  type RegulatoryAdvisoryReadinessBuildInput,
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
});

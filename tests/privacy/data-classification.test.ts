import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AI71_DATA_CLASSIFICATION_COMPAT,
  AI71_PRIVACY_TIER_CLASSIFICATION_EQUIVALENT,
  AI71_RETENTION_CLASS_ALLOWED_BEHAVIORS,
  DATA_CLASSIFICATION_IDS,
  DATA_CLASSIFICATION_MODEL,
  classificationRank,
  compareClassifications,
  isDataClassificationId,
  resolveRequestClassification,
} from '../../src/privacy/data-classification.js';

describe('AI-73 data classification model', () => {
  it('exposes the five canonical classifications with a deterministic hierarchy', () => {
    assert.deepEqual([...DATA_CLASSIFICATION_IDS], ['public', 'internal', 'confidential', 'regulated', 'restricted']);
    const ranks = DATA_CLASSIFICATION_IDS.map(id => classificationRank(id));
    assert.deepEqual(ranks, [0, 1, 2, 3, 4]);
    assert.ok(compareClassifications('public', 'restricted') < 0);
    assert.ok(compareClassifications('restricted', 'regulated') > 0);
    assert.equal(compareClassifications('internal', 'internal'), 0);
  });

  it('fails closed on a missing classification', () => {
    for (const request of [
      { request_id: 'r', input: {} },
      { request_id: 'r', input: {}, context: {} },
      { request_id: 'r', input: {}, context: { data_classification: '' } },
      null,
      undefined,
      'not-an-object',
    ]) {
      const resolution = resolveRequestClassification(request);
      assert.equal(resolution.ok, false);
      if (!resolution.ok) assert.equal(resolution.reason, 'DATA_CLASSIFICATION_REQUIRED');
    }
  });

  it('fails closed on an unknown classification with no automatic downgrade', () => {
    for (const value of ['top_secret', 'PUBLIC', 'Internal', 'secret', 42, {}]) {
      const resolution = resolveRequestClassification({ context: { data_classification: value } });
      assert.equal(resolution.ok, false);
      if (!resolution.ok) assert.equal(resolution.reason, 'UNKNOWN_DATA_CLASSIFICATION');
    }
    assert.equal(isDataClassificationId('confidential'), true);
    assert.equal(isDataClassificationId('unknown'), false);
  });

  it('resolves every canonical classification explicitly', () => {
    for (const id of DATA_CLASSIFICATION_IDS) {
      const resolution = resolveRequestClassification({ context: { data_classification: id } });
      assert.deepEqual(resolution, { ok: true, classification: id });
    }
  });

  it('forbids external processing and live execution for restricted data', () => {
    const restricted = DATA_CLASSIFICATION_MODEL.restricted;
    assert.equal(restricted.external_processing_potentially_allowed, false);
    assert.deepEqual([...restricted.permitted_execution_modes], ['replay']);
    assert.deepEqual([...restricted.permitted_retention_behaviors], ['none', 'ephemeral_memory']);
  });

  it('requires verified ZDR for external regulated processing and never lets payloads into logs', () => {
    assert.equal(DATA_CLASSIFICATION_MODEL.regulated.verified_zdr_mandatory_for_external, true);
    for (const id of DATA_CLASSIFICATION_IDS) {
      assert.equal(DATA_CLASSIFICATION_MODEL[id].payload_may_enter_logs, false);
    }
  });

  it('never tolerates provider_unknown retention for confidential or higher', () => {
    for (const id of ['confidential', 'regulated', 'restricted'] as const) {
      assert.equal(DATA_CLASSIFICATION_MODEL[id].permitted_retention_behaviors.includes('provider_unknown'), false);
    }
  });

  it('maps the AI-71 vocabularies explicitly (compatibility, not coincidence)', () => {
    assert.deepEqual(AI71_DATA_CLASSIFICATION_COMPAT, {
      public: 'public',
      internal: 'internal',
      regulated: 'regulated',
      restricted: 'restricted',
    });
    assert.deepEqual(AI71_PRIVACY_TIER_CLASSIFICATION_EQUIVALENT, {
      standard: 'internal',
      sensitive: 'confidential',
      regulated: 'regulated',
      restricted: 'restricted',
    });
    // No AI-71 retention class ever tolerates unknown or forbidden retention.
    for (const behaviors of Object.values(AI71_RETENTION_CLASS_ALLOWED_BEHAVIORS)) {
      assert.equal(behaviors.includes('provider_unknown'), false);
      assert.equal(behaviors.includes('forbidden'), false);
    }
  });
});

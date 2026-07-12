import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  PrivacyPolicyCatalog,
  validatePrivacyPolicyCatalogData,
  validatePrivacyProfileDeclaration,
} from '../../src/privacy/privacy-policy.js';
import { PrivacyError } from '../../src/privacy/errors.js';

const root = process.cwd();
function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(join(root, path), 'utf8'));
}
const repoCatalog = loadJson('config/ai-privacy-policies.json');

describe('AI-73 privacy policy catalog', () => {
  it('loads the repository catalog and resolves deterministically', () => {
    const catalog = new PrivacyPolicyCatalog(repoCatalog);
    const first = catalog.resolve('evidence.extraction.normative_claims', 'internal');
    const second = catalog.resolve('evidence.extraction.normative_claims', 'internal');
    assert.deepEqual(first, second);
    assert.equal(first.ok, true);
    if (first.ok) assert.equal(first.entry.policy_id, 'privacy.evidence-extraction.internal.v1');
  });

  it('covers every canonical classification for the gateway capability', () => {
    const catalog = new PrivacyPolicyCatalog(repoCatalog);
    for (const classification of ['public', 'internal', 'confidential', 'regulated', 'restricted'] as const) {
      assert.equal(catalog.resolve('evidence.extraction.normative_claims', classification).ok, true);
    }
  });

  it('fails closed when no policy applies', () => {
    const catalog = new PrivacyPolicyCatalog(repoCatalog);
    const resolution = catalog.resolve('review.human.gate', 'public');
    assert.deepEqual(resolution, { ok: false, reason: 'PRIVACY_POLICY_MISSING' });
  });

  it('fails closed on duplicate policy IDs', () => {
    const raw = loadJson('snapshots/privacy/invalid-privacy-policies-duplicate-id.json');
    assert.ok(validatePrivacyPolicyCatalogData(raw).some(e => e.includes('duplicates')));
    assert.throws(() => new PrivacyPolicyCatalog(raw), PrivacyError);
  });

  it('fails closed on ambiguous matches (same priority, same scope)', () => {
    const raw = loadJson('snapshots/privacy/invalid-privacy-policies-ambiguous-match.json');
    // The fixture is structurally valid; ambiguity is a resolution-time failure.
    const catalog = new PrivacyPolicyCatalog(raw);
    const resolution = catalog.resolve('evidence.extraction.normative_claims', 'public');
    assert.deepEqual(resolution, { ok: false, reason: 'PRIVACY_POLICY_AMBIGUOUS' });
  });

  it('resolves overlapping entries by unique highest priority', () => {
    const raw = loadJson('snapshots/privacy/invalid-privacy-policies-ambiguous-match.json') as {
      policies: Array<Record<string, unknown>>;
    };
    const adjusted = {
      schema_version: '1.0.0',
      policies: [raw.policies[0], { ...raw.policies[1], priority: 200 }],
    };
    const catalog = new PrivacyPolicyCatalog(adjusted);
    const resolution = catalog.resolve('evidence.extraction.normative_claims', 'public');
    assert.equal(resolution.ok, true);
    if (resolution.ok) assert.equal(resolution.entry.policy_id, 'privacy.test.ambiguous-b.v1');
  });

  it('fails closed on unknown redaction actions', () => {
    const raw = loadJson('snapshots/privacy/invalid-privacy-policies-unknown-action.json');
    assert.ok(validatePrivacyPolicyCatalogData(raw).some(e => e.includes('action')));
    assert.throws(() => new PrivacyPolicyCatalog(raw), PrivacyError);
  });

  it('fails closed on credential-shaped fields in the catalog', () => {
    const raw = loadJson('snapshots/privacy/invalid-privacy-policies-credential-field.json');
    assert.ok(validatePrivacyPolicyCatalogData(raw).some(e => e.includes('credential')));
    assert.throws(() => new PrivacyPolicyCatalog(raw), PrivacyError);
  });

  it('rejects malformed catalogs and empty policy lists', () => {
    for (const raw of [null, [], {}, { schema_version: '1.0.0', policies: [] }]) {
      assert.ok(validatePrivacyPolicyCatalogData(raw).length > 0);
      assert.throws(() => new PrivacyPolicyCatalog(raw), PrivacyError);
    }
  });

  it('validates profile privacy declarations and requires replay provenance', () => {
    const declaration = {
      max_data_classification: 'internal',
      external_processing: 'forbidden',
      zdr_support: 'unsupported',
      retention_behavior: 'bounded_local_fixture',
      training_use: 'declared_not_used',
      processing_region: 'local',
      pre_execution_redaction_required: true,
      replay_fixture_origin: 'synthetic',
      replay_fixture_sanitization: 'not_applicable',
      regulated_data_permitted: false,
      restricted_data_permitted: false,
    };
    assert.deepEqual(validatePrivacyProfileDeclaration(declaration, 'replay'), []);
    const withoutOrigin = { ...declaration, replay_fixture_origin: undefined };
    assert.ok(validatePrivacyProfileDeclaration(withoutOrigin, 'replay').length > 0);
    assert.ok(validatePrivacyProfileDeclaration(undefined, 'replay').length > 0);
    // verified ZDR requires an evidence reference on the declaration.
    assert.ok(
      validatePrivacyProfileDeclaration({ ...declaration, zdr_support: 'verified' }, 'replay').some(e =>
        e.includes('zdr_evidence_ref')
      )
    );
  });
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { PrivacyError } from '../../src/privacy/errors.js';
import {
  ZdrEvidenceStore,
  evaluateZdrEvidence,
  validateZdrEvidenceCatalogData,
} from '../../src/privacy/zdr-evidence.js';
import type { ZdrVerificationEvidence } from '../../src/privacy/zdr-evidence.js';

const root = process.cwd();
const fixtureStore = new ZdrEvidenceStore(
  JSON.parse(readFileSync(join(root, 'snapshots/privacy/example-zdr-evidence.json'), 'utf8'))
);
const NOW = new Date('2026-06-01T00:00:00.000Z');

function evaluate(evidence: ZdrVerificationEvidence | undefined, overrides: Partial<Parameters<typeof evaluateZdrEvidence>[0]> = {}) {
  return evaluateZdrEvidence({
    evidence,
    profile_id: 'test.regulated.local.v1',
    capability_id: 'evidence.extraction.normative_claims',
    classification: 'regulated',
    retention_behavior: 'ephemeral_memory',
    processing_region: 'local',
    training_use: 'contractually_prohibited_verified',
    now: NOW,
    ...overrides,
  });
}

describe('AI-73 ZDR evidence model', () => {
  it('accepts verified, applicable, reviewed, unexpired evidence', () => {
    const result = evaluate(fixtureStore.get('zdr-evidence.test-local-regulated.v1'));
    assert.equal(result.ok, true);
  });

  it('blocks missing evidence', () => {
    assert.deepEqual(evaluate(undefined), { ok: false, reason: 'ZDR_EVIDENCE_MISSING' });
    assert.equal(fixtureStore.get('zdr-evidence.does-not-exist'), undefined);
  });

  it('blocks declared_unverified evidence', () => {
    const result = evaluate(fixtureStore.get('zdr-evidence.test-declared-unverified.v1'));
    assert.deepEqual(result, { ok: false, reason: 'ZDR_UNVERIFIED' });
  });

  it('blocks expired evidence', () => {
    const result = evaluate(fixtureStore.get('zdr-evidence.test-expired.v1'));
    assert.deepEqual(result, { ok: false, reason: 'ZDR_EVIDENCE_EXPIRED' });
  });

  it('blocks evidence at its exact expiry instant (no grace period)', () => {
    const result = evaluate(fixtureStore.get('zdr-evidence.test-local-regulated.v1'), {
      now: new Date('2027-01-01T00:00:00.000Z'),
    });
    assert.deepEqual(result, { ok: false, reason: 'ZDR_EVIDENCE_EXPIRED' });
  });

  it('blocks profile, capability, classification, retention, region, and training scope mismatches', () => {
    const evidence = fixtureStore.get('zdr-evidence.test-local-regulated.v1');
    assert.deepEqual(evaluate(fixtureStore.get('zdr-evidence.test-other-profile.v1')), {
      ok: false,
      reason: 'ZDR_EVIDENCE_SCOPE_MISMATCH',
    });
    assert.deepEqual(evaluate(evidence, { capability_id: 'review.human.gate' }), {
      ok: false,
      reason: 'ZDR_EVIDENCE_SCOPE_MISMATCH',
    });
    assert.deepEqual(evaluate(evidence, { classification: 'restricted' }), {
      ok: false,
      reason: 'ZDR_EVIDENCE_SCOPE_MISMATCH',
    });
    assert.deepEqual(evaluate(evidence, { retention_behavior: 'provider_declared_bounded' }), {
      ok: false,
      reason: 'ZDR_EVIDENCE_SCOPE_MISMATCH',
    });
    assert.deepEqual(evaluate(evidence, { processing_region: 'us-east' }), {
      ok: false,
      reason: 'ZDR_EVIDENCE_SCOPE_MISMATCH',
    });
    assert.deepEqual(evaluate(evidence, { training_use: 'declared_not_used' }), {
      ok: false,
      reason: 'ZDR_EVIDENCE_SCOPE_MISMATCH',
    });
  });

  it('blocks unreviewed evidence', () => {
    const result = evaluate(fixtureStore.get('zdr-evidence.test-unreviewed.v1'));
    assert.deepEqual(result, { ok: false, reason: 'ZDR_UNVERIFIED' });
  });

  it('rejects structurally invalid evidence catalogs (missing expiry, unknown status, duplicates)', () => {
    for (const path of [
      'snapshots/privacy/invalid-zdr-evidence-missing-expiry.json',
      'snapshots/privacy/invalid-zdr-evidence-unknown-status.json',
    ]) {
      const raw = JSON.parse(readFileSync(join(root, path), 'utf8'));
      assert.ok(validateZdrEvidenceCatalogData(raw).length > 0, path);
      assert.throws(() => new ZdrEvidenceStore(raw), PrivacyError);
    }
    const record = JSON.parse(
      readFileSync(join(root, 'snapshots/privacy/example-zdr-evidence.json'), 'utf8')
    ) as { schema_version: string; evidence: unknown[] };
    const duplicated = { ...record, evidence: [record.evidence[0], record.evidence[0]] };
    assert.throws(() => new ZdrEvidenceStore(duplicated), PrivacyError);
  });

  it('loads the honest (empty) repository evidence store', () => {
    const raw = JSON.parse(readFileSync(join(root, 'config/ai-zdr-evidence.json'), 'utf8'));
    const store = new ZdrEvidenceStore(raw);
    assert.deepEqual(store.list(), []);
  });
});

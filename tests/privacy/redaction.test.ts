import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  REDACTION_HASH_DOMAIN_SEPARATOR,
  REDACTION_MARKER,
  applyRedactionRules,
  redactionHash,
} from '../../src/privacy/redaction.js';
import type { RedactionRequirement } from '../../src/privacy/privacy-policy.js';

const SENTINEL_EMAIL = 'sentinel.broker@example.com';
const SENTINEL_NAME = 'Sentinel Reviewer Name';

function rules(...items: RedactionRequirement[]): readonly RedactionRequirement[] {
  return items;
}

describe('AI-73 deterministic redaction engine', () => {
  it('applies every action deterministically over nested objects and arrays', () => {
    const input = {
      packet_id: 'packet-1',
      contact_email: SENTINEL_EMAIL,
      personal_name: SENTINEL_NAME,
      broker_pii: { name: SENTINEL_NAME },
      source_reference: 'internal-system-record-42',
      evidence_refs: [
        { source_id: 's1', reviewer_contact: SENTINEL_EMAIL },
        { source_id: 's2', reviewer_contact: SENTINEL_EMAIL },
      ],
    };
    const ruleSet = rules(
      { path: 'input.packet_id', action: 'preserve', presence: 'required' },
      { path: 'input.contact_email', action: 'hash_identifier', presence: 'required' },
      { path: 'input.personal_name', action: 'replace_with_marker', presence: 'required' },
      { path: 'input.broker_pii', action: 'remove', presence: 'required' },
      { path: 'input.source_reference', action: 'tokenize_reference', presence: 'required' },
      { path: 'input.evidence_refs[].reviewer_contact', action: 'remove', presence: 'required' }
    );
    const first = applyRedactionRules(input, ruleSet);
    const second = applyRedactionRules(input, ruleSet);
    assert.deepEqual(first, second); // deterministic
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const cleared = first.cleared_input as Record<string, unknown>;
    assert.equal(cleared['packet_id'], 'packet-1');
    assert.equal('broker_pii' in cleared, false);
    assert.equal(cleared['personal_name'], REDACTION_MARKER);
    assert.match(String(cleared['contact_email']), /^redacted:sha256:[a-f0-9]{64}$/);
    assert.match(String(cleared['source_reference']), /^redacted:ref:[a-f0-9]{24}$/);
    for (const ref of cleared['evidence_refs'] as Array<Record<string, unknown>>) {
      assert.equal('reviewer_contact' in ref, false);
    }
    assert.doesNotMatch(JSON.stringify(cleared), new RegExp(SENTINEL_EMAIL));
    assert.doesNotMatch(JSON.stringify(cleared), new RegExp(SENTINEL_NAME));
    assert.deepEqual(first.counts, { removed: 3, replaced: 1, hashed: 1, tokenized: 1, preserved: 1 });
    // The original input is never mutated.
    assert.equal(input.contact_email, SENTINEL_EMAIL);
    assert.equal(input.evidence_refs[0]?.reviewer_contact, SENTINEL_EMAIL);
  });

  it('hashes with the documented stable domain separator', () => {
    assert.equal(REDACTION_HASH_DOMAIN_SEPARATOR, 'vlatam-ai-lab/ai-73/redaction/v1');
    const expected = createHash('sha256')
      .update(`${REDACTION_HASH_DOMAIN_SEPARATOR}:input.contact_email:${SENTINEL_EMAIL}`)
      .digest('hex');
    assert.equal(redactionHash('input.contact_email', SENTINEL_EMAIL), expected);
    // Domain separation: the same value on another path hashes differently.
    assert.notEqual(
      redactionHash('input.contact_email', SENTINEL_EMAIL),
      redactionHash('input.tax_identifier', SENTINEL_EMAIL)
    );
  });

  it('fails closed when a mandatory path is missing', () => {
    const result = applyRedactionRules({ packet_id: 'p' }, rules({ path: 'input.contact_email', action: 'hash_identifier', presence: 'required' }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'REDACTION_FAILED');
  });

  it('fails closed when a mandatory path cannot be interpreted (unknown path)', () => {
    // evidence_refs is a scalar, so the array traversal is structurally impossible.
    const result = applyRedactionRules(
      { evidence_refs: 'not-an-array' },
      rules({ path: 'input.evidence_refs[].reviewer_contact', action: 'remove', presence: 'required' })
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'REDACTION_PATH_UNKNOWN');
  });

  it('skips absent optional paths without partial-success ambiguity', () => {
    const result = applyRedactionRules({ packet_id: 'p' }, rules({ path: 'input.contact_email', action: 'remove', presence: 'optional' }));
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.entries, [
        { path: 'input.contact_email', action: 'remove', outcome: 'skipped_absent', count: 0 },
      ]);
    }
  });

  it('blocks the request when a block_request field is present (raw document text)', () => {
    const result = applyRedactionRules(
      { raw_document_text: 'FULL CONFIDENTIAL DOCUMENT BODY' },
      rules({ path: 'input.raw_document_text', action: 'block_request', presence: 'optional' })
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'EXTERNAL_PROCESSING_FORBIDDEN');
      assert.doesNotMatch(JSON.stringify(result), /CONFIDENTIAL DOCUMENT BODY/);
    }
  });

  it('fails closed on unknown actions injected past the catalog validator', () => {
    const result = applyRedactionRules(
      { contact_email: SENTINEL_EMAIL },
      rules({ path: 'input.contact_email', action: 'fuzzy_scrub' as never, presence: 'required' })
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'REDACTION_FAILED');
  });

  it('does not preserve secret-looking values just because they look hashed', () => {
    const hashedLooking = 'a'.repeat(64);
    const result = applyRedactionRules(
      { tax_identifier: hashedLooking },
      rules({ path: 'input.tax_identifier', action: 'hash_identifier', presence: 'required' })
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.notEqual((result.cleared_input as Record<string, unknown>)['tax_identifier'], hashedLooking);
    }
  });

  it('records only path, action, outcome, and counts in audit entries', () => {
    const result = applyRedactionRules(
      { contact_email: SENTINEL_EMAIL },
      rules({ path: 'input.contact_email', action: 'hash_identifier', presence: 'required' })
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      for (const entry of result.entries) {
        assert.deepEqual(Object.keys(entry).sort(), ['action', 'count', 'outcome', 'path']);
      }
      assert.doesNotMatch(JSON.stringify(result.entries), new RegExp(SENTINEL_EMAIL));
    }
  });
});

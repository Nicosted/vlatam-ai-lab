import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALLOWED_CLAIM_TYPES,
  GOVERNANCE_FLAGS,
  getGovernanceFlags,
  isValidClaimType,
} from '../../src/contracts/vlatam-global-bridge.js';

describe('vlatam-global bridge — claim type allowlist', () => {
  it('recognizes all allowlisted claim types', () => {
    assert.deepEqual(ALLOWED_CLAIM_TYPES, [
      'tariff',
      'intervention',
      'norm',
      'legal',
      'classification',
    ]);

    for (const claimType of ALLOWED_CLAIM_TYPES) {
      assert.equal(isValidClaimType(claimType), true);
    }
  });

  it('rejects unknown claim types', () => {
    assert.equal(isValidClaimType('pricing'), false);
    assert.equal(isValidClaimType('customs_hold'), false);
    assert.equal(isValidClaimType(''), false);
  });

  it('returns a boolean for valid and invalid inputs', () => {
    assert.equal(typeof isValidClaimType('tariff'), 'boolean');
    assert.equal(typeof isValidClaimType('not-allowed'), 'boolean');
  });
});

describe('vlatam-global bridge — governance flags', () => {
  it('exports the mandatory governance flag values', () => {
    assert.deepEqual(GOVERNANCE_FLAGS, {
      human_review_required: true,
      downstream_allowed: false,
      review_only: true,
      not_final_classification: true,
    });
  });

  it('returns the mandatory governance flags from getGovernanceFlags', () => {
    assert.deepEqual(getGovernanceFlags(), {
      human_review_required: true,
      downstream_allowed: false,
      review_only: true,
      not_final_classification: true,
    });
  });

  it('returns a defensive copy of the governance flags', () => {
    const flags = getGovernanceFlags() as Record<string, boolean>;
    flags.human_review_required = false;

    assert.equal(getGovernanceFlags().human_review_required, true);
  });
});

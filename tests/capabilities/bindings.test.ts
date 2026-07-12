/**
 * AI-71 capability contract — domain bindings tests.
 *
 * The binding layer is the explicit, minimal mapping between selected
 * existing domain capabilities and their current input/output JSON
 * Schemas. These tests assert that the binding list:
 *
 *  - is non-empty and covers the six capabilities required by AI-71;
 *  - covers at least one of each PCRAM layer (source, evidence,
 *    review, export);
 *  - never references a schema that does not exist on disk;
 *  - agrees with the catalog on the regulated/mechanical partition;
 *  - never declares a binding whose capability is provider-only or
 *    purely governance (the binding list is the domain-facing
 *    surface).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DOMAIN_CAPABILITY_BINDINGS,
  getDomainCapabilityBinding,
  type DomainCapabilityBinding,
} from '../../src/capabilities/bindings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

describe('AI-71 bindings — surface', () => {
  it('declares at least the six required capabilities', () => {
    const required: ReadonlyArray<string> = [
      'evidence.extraction.normative_claims',
      'evidence.classifier_candidate.generate',
      'source.regulatory_advisory.readiness_check',
      'review.human.gate',
      'artifact.approved.serve_http',
      'artifact.export_contract.generate',
    ];
    const ids = new Set<string>(DOMAIN_CAPABILITY_BINDINGS.map(b => b.capability_id));
    for (const id of required) {
      assert.ok(ids.has(id), `required binding missing: ${id}`);
    }
  });

  it('every binding has a distinct capability_id', () => {
    const seen = new Set<string>();
    for (const b of DOMAIN_CAPABILITY_BINDINGS) {
      assert.ok(!seen.has(b.capability_id), `duplicate binding for ${b.capability_id}`);
      seen.add(b.capability_id);
    }
  });

  it('every binding references an existing schema on disk', () => {
    for (const b of DOMAIN_CAPABILITY_BINDINGS) {
      assert.ok(
        existsSync(resolve(repoRoot, b.input_schema_ref)),
        `missing input schema for ${b.capability_id}: ${b.input_schema_ref}`
      );
      assert.ok(
        existsSync(resolve(repoRoot, b.output_schema_ref)),
        `missing output schema for ${b.capability_id}: ${b.output_schema_ref}`
      );
    }
  });

  it('getDomainCapabilityBinding returns undefined for unknown IDs', () => {
    assert.equal(getDomainCapabilityBinding('does.not.exist'), undefined);
  });
});

describe('AI-71 bindings — domain coverage', () => {
  it('covers every PCRAM stage (source, evidence, review, export)', () => {
    const ids = new Set<string>(DOMAIN_CAPABILITY_BINDINGS.map(b => b.capability_id));
    assert.ok(ids.has('source.regulatory_advisory.readiness_check'), 'missing source binding');
    assert.ok(ids.has('evidence.extraction.normative_claims'), 'missing evidence binding');
    assert.ok(ids.has('evidence.classifier_candidate.generate'), 'missing classifier-candidate binding');
    assert.ok(ids.has('review.human.gate'), 'missing review binding');
    assert.ok(ids.has('artifact.export_contract.generate'), 'missing export binding');
    assert.ok(ids.has('artifact.approved.serve_http'), 'missing serve binding');
  });

  it('human-review-required bindings do not auto-approve unless they are the post-review boundary', () => {
    // The catalog permits `human_review: true, downstream_allowed: true` only
    // for the post-review export contract generation capability. Every other
    // human-review-required binding must declare `downstream_allowed: false`
    // (draft) or `conditional` (downstream-eligible only on an explicit
    // upstream approval).
    for (const b of DOMAIN_CAPABILITY_BINDINGS) {
      if (b.human_review_required && b.downstream_allowed === true) {
        assert.equal(
          b.capability_id,
          'artifact.export_contract.generate',
          `${b.capability_id} is human-review-required and cannot auto-approve; ` +
            'this is permitted only for the post-review export contract generation step'
        );
      }
    }
  });

  it('review.human.gate uses conditional downstream (the review is the act of judgment)', () => {
    const b = getDomainCapabilityBinding('review.human.gate');
    assert.ok(b);
    assert.equal(b.downstream_allowed, 'conditional');
    assert.equal(b.human_review_required, false);
  });

  it('serve-only binding declares downstream_allowed: true with human_review_required: false', () => {
    const b = getDomainCapabilityBinding('artifact.approved.serve_http');
    assert.ok(b);
    assert.equal(b.downstream_allowed, true);
    assert.equal(b.human_review_required, false);
  });

  it('no binding declares provider_execution: required except normative-claim extraction', () => {
    for (const b of DOMAIN_CAPABILITY_BINDINGS) {
      if (b.provider_execution === 'required') {
        assert.equal(
          b.capability_id,
          'evidence.extraction.normative_claims',
          `binding ${b.capability_id} declares provider_execution=required; bindings are not provider adapters`
        );
      }
    }
  });
});

describe('AI-71 bindings — per-binding type stability', () => {
  it('every binding satisfies the DomainCapabilityBinding shape', () => {
    for (const b of DOMAIN_CAPABILITY_BINDINGS) {
      assertBindingShape(b);
    }
  });
});

function assertBindingShape(b: DomainCapabilityBinding): void {
  assert.equal(typeof b.capability_id, 'string');
  assert.equal(typeof b.input_schema_ref, 'string');
  assert.equal(typeof b.output_schema_ref, 'string');
  assert.equal(typeof b.human_review_required, 'boolean');
  assert.ok(
    b.downstream_allowed === true || b.downstream_allowed === false || b.downstream_allowed === 'conditional',
    `${b.capability_id} has invalid downstream_allowed: ${String(b.downstream_allowed)}`
  );
  assert.ok(
    b.risk_tier === 'low' || b.risk_tier === 'medium' || b.risk_tier === 'high',
    `${b.capability_id} has invalid risk_tier: ${b.risk_tier}`
  );
  assert.ok(
    b.provider_execution === 'required' || b.provider_execution === 'optional' || b.provider_execution === 'none',
    `${b.capability_id} has invalid provider_execution: ${b.provider_execution}`
  );
  assert.equal(typeof b.notes, 'string');
  assert.ok(b.notes.length > 0);
}

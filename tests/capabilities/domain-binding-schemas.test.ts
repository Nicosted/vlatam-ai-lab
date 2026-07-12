import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ajv2020 as AjvClass } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

import {
  buildRegulatoryAdvisoryReadinessView,
  type RegulatoryAdvisoryReadinessBuildInput,
} from '../../src/advisory/regulatory-advisory-read-model.js';
import { getDomainCapabilityBinding } from '../../src/capabilities/bindings.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const applyFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (ajv: AjvClass) => void;

function loadJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(repoRoot, path), 'utf8')) as Record<string, unknown>;
}

function validator(schemaPath: string) {
  const ajv = new AjvClass({ allErrors: true, strict: true });
  applyFormats(ajv);
  return ajv.compile(loadJson(schemaPath));
}

describe('AI-71 corrected domain binding schemas', () => {
  it('binds advisory readiness and approved reads to their real domain schemas', () => {
    const readiness = getDomainCapabilityBinding('source.regulatory_advisory.readiness_check');
    const approvedRead = getDomainCapabilityBinding('artifact.approved.serve_http');
    assert.ok(readiness);
    assert.ok(approvedRead);
    assert.equal(readiness.input_schema_ref, 'schemas/regulatory-advisory-readiness-request.schema.json');
    assert.equal(readiness.output_schema_ref, 'schemas/regulatory-advisory-readiness-result.schema.json');
    assert.equal(approvedRead.input_schema_ref, 'schemas/approved-artifact-read-request.schema.json');
    assert.equal(approvedRead.output_schema_ref, 'schemas/classifier-approved-artifact-export.schema.json');
  });

  it('accepts the current TypeScript advisory input and its actual assembled output', () => {
    const input = loadJson(
      'snapshots/pcram/regulatory-advisory-readiness-request-valid.json'
    ) as unknown as RegulatoryAdvisoryReadinessBuildInput;
    const output = buildRegulatoryAdvisoryReadinessView(input);
    const validateInput = validator('schemas/regulatory-advisory-readiness-request.schema.json');
    const validateOutput = validator('schemas/regulatory-advisory-readiness-result.schema.json');
    assert.equal(validateInput(input), true, JSON.stringify(validateInput.errors));
    assert.equal(validateOutput(output), true, JSON.stringify(validateOutput.errors));
    assert.equal(output.human_review_required, true);
    assert.equal(output.downstream_allowed, false);
    assert.ok(output.source_coverage_summary);
    assert.ok(Array.isArray(output.missing_or_unreviewed_inputs));
  });

  it('validates every registered new valid fixture and rejects every registered invalid fixture', () => {
    const registry = loadJson('schemas/schema-registry.json') as {
      contracts: Array<{ contract_name: string; schema_file: string; valid_fixture: string; invalid_fixtures: string[] }>;
    };
    const names = new Set([
      'regulatory_advisory_readiness_request',
      'regulatory_advisory_readiness_result',
      'approved_artifact_read_request',
    ]);
    const entries = registry.contracts.filter(entry => names.has(entry.contract_name));
    assert.equal(entries.length, 3);
    for (const entry of entries) {
      const validate = validator(entry.schema_file);
      assert.equal(validate(loadJson(entry.valid_fixture)), true, `${entry.valid_fixture}: ${JSON.stringify(validate.errors)}`);
      for (const fixture of entry.invalid_fixtures) {
        assert.equal(validate(loadJson(fixture)), false, `${fixture} should be invalid`);
      }
    }
  });

  it('rejects downstream approval, provider data, reviewer identity, and malformed coverage', () => {
    const validate = validator('schemas/regulatory-advisory-readiness-result.schema.json');
    const valid = loadJson('snapshots/pcram/regulatory-advisory-readiness-result-valid.json') as Record<string, unknown>;
    for (const mutation of [
      { ...valid, downstream_allowed: true },
      { ...valid, provider_id: 'vendor' },
      { ...valid, reviewer_id: 'person-1' },
      { ...valid, source_coverage_summary: { source_count: 'invalid' } },
      { ...valid, missing_or_unreviewed_inputs: [{ coverage: 'invented' }] },
    ]) {
      assert.equal(validate(mutation), false);
    }
  });

  it('matches the HTTP API identifier rules and excludes transport details', () => {
    const validate = validator('schemas/approved-artifact-read-request.schema.json');
    assert.equal(validate({ source_id: 'abc_123-x', artifact_id: 'artifact--abc_123-x--v1' }), true);
    for (const request of [
      { source_id: '../abc', artifact_id: 'artifact--abc--v1' },
      { source_id: 'ABC', artifact_id: 'artifact--abc--v1' },
      { source_id: 'abc', artifact_id: '../../artifact--abc--v1' },
      { source_id: 'abc', artifact_id: 'artifact--abc' },
      { source_id: 'abc', artifact_id: 'artifact--abc--v1', api_key: 'secret' },
      { source_id: 'abc', artifact_id: 'artifact--abc--v1', reviewer_id: 'person-1' },
      { source_id: 'abc', artifact_id: 'artifact--abc--v1', export_payload: {} },
    ]) {
      assert.equal(validate(request), false);
    }
  });
});

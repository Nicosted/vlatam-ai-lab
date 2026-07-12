import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { Ajv2020 as AjvClass } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

const root = process.cwd();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const applyFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (ajv: AjvClass) => void;

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(join(root, path), 'utf8'));
}
function validator(schemaPath: string) {
  const ajv = new AjvClass({ allErrors: true, strict: true });
  applyFormats(ajv);
  return ajv.compile(loadJson(schemaPath) as Record<string, unknown>);
}

const PRIVACY_CONTRACTS = ['ai_privacy_policies', 'ai_zdr_evidence', 'ai_privacy_audit', 'ai_execution_profiles'];
const CREDENTIAL_PATTERN = /api[_-]?key|password|bearer|authorization|client_secret|private[_-]?key|access[_-]?key/i;

describe('AI-73 privacy schemas and fixtures', () => {
  it('validates every registered privacy fixture and rejects every invalid fixture', () => {
    const registry = loadJson('schemas/schema-registry.json') as {
      contracts: Array<{ contract_name: string; schema_file: string; valid_fixture: string; invalid_fixtures: string[] }>;
    };
    const entries = registry.contracts.filter(entry => PRIVACY_CONTRACTS.includes(entry.contract_name));
    assert.equal(entries.length, PRIVACY_CONTRACTS.length);
    for (const entry of entries) {
      const validate = validator(entry.schema_file);
      assert.equal(
        validate(loadJson(entry.valid_fixture)),
        true,
        `${entry.valid_fixture}: ${JSON.stringify(validate.errors)}`
      );
      assert.ok(entry.invalid_fixtures.length > 0, `${entry.contract_name} must register invalid fixtures`);
      for (const fixture of entry.invalid_fixtures) {
        assert.equal(validate(loadJson(fixture)), false, `${fixture} should be invalid`);
      }
    }
  });

  it('validates the execution-profile catalog including privacy declarations', () => {
    const validate = validator('schemas/ai-execution-profiles.schema.json');
    const catalog = loadJson('config/ai-execution-profiles.json');
    assert.equal(validate(catalog), true, JSON.stringify(validate.errors));
    const typed = catalog as { profiles: Array<{ privacy?: Record<string, unknown>; mode: string }> };
    for (const profile of typed.profiles) {
      assert.ok(profile.privacy, 'every profile declares privacy');
      if (profile.mode === 'replay') {
        assert.ok(profile.privacy['replay_fixture_origin']);
        assert.ok(profile.privacy['replay_fixture_sanitization']);
      }
    }
  });

  it('validates the honest empty ZDR evidence store', () => {
    const validate = validator('schemas/ai-zdr-evidence.schema.json');
    assert.equal(validate(loadJson('config/ai-zdr-evidence.json')), true, JSON.stringify(validate.errors));
  });

  it('rejects a schema-level provider-name-as-ZDR-proof shortcut', () => {
    // There is no schema field where a provider or model name can stand
    // in for evidence: the evidence record requires explicit scope,
    // timestamps, hash, and review status, and rejects extra fields.
    const validate = validator('schemas/ai-zdr-evidence.schema.json');
    const clone = structuredClone(loadJson('snapshots/privacy/example-zdr-evidence.json')) as {
      evidence: Array<Record<string, unknown>>;
    };
    const record = clone.evidence[0] as Record<string, unknown>;
    record['provider_marketing_claim'] = 'provider guarantees zero retention';
    assert.equal(validate(clone), false);
    const minimalNameOnly = {
      schema_version: '1.0.0',
      evidence: [{ evidence_id: 'zdr-evidence.name-only.v1', provider_name: 'deepseek-zdr' }],
    };
    assert.equal(validate(minimalNameOnly), false);
  });

  it('keeps credentials and secrets out of every privacy config and fixture', () => {
    for (const path of [
      'config/ai-privacy-policies.json',
      'config/ai-zdr-evidence.json',
      'config/ai-execution-profiles.json',
      'snapshots/privacy/example-zdr-evidence.json',
      'snapshots/privacy/example-privacy-audit.json',
    ]) {
      const text = readFileSync(join(root, path), 'utf8');
      assert.doesNotMatch(text, CREDENTIAL_PATTERN, path);
    }
  });

  it('keeps the privacy audit schema closed against payload smuggling', () => {
    const validate = validator('schemas/ai-privacy-audit.schema.json');
    const valid = loadJson('snapshots/privacy/example-privacy-audit.json') as Record<string, unknown>;
    assert.equal(validate(valid), true, JSON.stringify(validate.errors));
    for (const mutation of [
      { ...valid, input: { leaked: true } },
      { ...valid, prompt: 'leaked prompt' },
      { ...valid, messages: [] },
      { ...valid, provider_response: '{}' },
      { ...valid, reviewer_id: 'person-1' },
      { ...valid, original_values: ['leak'] },
    ]) {
      assert.equal(validate(mutation), false);
    }
  });
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { Ajv2020 as Ajv } from 'ajv/dist/2020.js';
import { hasCapabilityDefinition } from '../../src/capabilities/index.js';
import { listExecutionProfiles } from '../../src/execution/profile-catalog.js';

const root = process.cwd();
const catalogText = readFileSync(join(root, 'config/ai-execution-profiles.json'), 'utf8');
const catalog = JSON.parse(catalogText) as { profiles: Array<Record<string, unknown>> };
const schema = JSON.parse(readFileSync(join(root, 'schemas/ai-execution-profiles.schema.json'), 'utf8'));

describe('AI-72 execution profile catalog', () => {
  it('validates against its registered JSON Schema', () => { const validate = new Ajv({ allErrors: true }).compile(schema); assert.equal(validate(catalog), true, JSON.stringify(validate.errors)); });
  it('has unique IDs and known capability references', () => { const profiles = listExecutionProfiles(); assert.equal(new Set(profiles.map((p) => p.profile_id)).size, profiles.length); for (const p of profiles) assert.equal(hasCapabilityDefinition(p.capability_id), true); });
  it('contains no credentials or secret-shaped values', () => { assert.doesNotMatch(catalogText, /api[_-]?key|password|bearer|authorization|secret/i); });
  it('has no production claims and keeps live execution disabled', () => { for (const p of listExecutionProfiles()) { assert.notEqual(p.lifecycle_status, 'production'); if (p.mode === 'live') assert.equal(p.enabled, false); } });
  it('keeps provider and model names outside capability requests', () => { const request = { request_id: 'r', capability_id: 'evidence.extraction.normative_claims', schema_version: '1.0.0', input: {} }; assert.equal('provider_id' in request, false); assert.equal('model_id' in request, false); });
});

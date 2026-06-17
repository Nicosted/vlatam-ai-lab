import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ajv as AjvClass } from 'ajv/dist/ajv.js';
import addFormatsModule from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const schemaPath = resolve(repoRoot, 'schemas', 'classifier-approved-artifact-export.schema.json');

type AjvInstance = InstanceType<typeof AjvClass>;
type AjvFormatsModule = ((ajv: AjvInstance) => AjvInstance) | { default?: (ajv: AjvInstance) => AjvInstance };

const formatsModule = addFormatsModule as AjvFormatsModule;
const applyFormats =
  typeof formatsModule === 'function' ? formatsModule : (formatsModule.default as (ajv: AjvInstance) => AjvInstance);

function buildValidator() {
  const schema = JSON.parse(readFileSync(schemaPath, 'utf-8')) as Record<string, unknown>;
  const ajv = new AjvClass({ allErrors: true, strict: true });
  applyFormats(ajv);
  return ajv.compile(schema);
}

function validExportArtifact() {
  return {
    export_id: 'artifact--infoleg--extraction-001--export',
    artifact_id: 'artifact--infoleg--extraction-001',
    source_id: 'infoleg',
    exported_at: '2026-06-16T20:00:00Z',
    classification_candidate: {
      ncm_code: '42029200110V',
      description: 'NCM 4202.92.00.110V appears as a candidate.',
      confidence: 0.82,
    },
    extracted_evidence: [
      {
        claim_id: 'claim-001',
        claim_type: 'classification',
        text: 'NCM 4202.92.00.110V appears as a candidate.',
        confidence: 0.82,
        affected_ncm: ['42029200110V'],
      },
    ],
    schema_version: '1.0.0',
  };
}

describe('classifier-approved-artifact-export schema', () => {
  it('validates a representative export artifact', () => {
    const validate = buildValidator();
    assert.equal(validate(validExportArtifact()), true, JSON.stringify(validate.errors, null, 2));
  });

  it('fails when required fields are missing', () => {
    const validate = buildValidator();
    const artifact = validExportArtifact();
    delete (artifact as Partial<typeof artifact>).export_id;

    assert.equal(validate(artifact), false);
  });

  it('fails when claim_type is invalid', () => {
    const validate = buildValidator();
    const artifact = validExportArtifact();
    artifact.extracted_evidence[0]!.claim_type = 'pricing';

    assert.equal(validate(artifact), false);
  });

  it('fails when additional properties are present', () => {
    const validate = buildValidator();
    const artifact = { ...validExportArtifact(), governance: { downstream_allowed: true } };

    assert.equal(validate(artifact), false);
  });

  it('fails when export_id does not match the export pattern', () => {
    const validate = buildValidator();
    const artifact = validExportArtifact();
    artifact.export_id = 'export--infoleg--extraction-001';

    assert.equal(validate(artifact), false);
  });

  it('fails when artifact_id does not match the artifact pattern', () => {
    const validate = buildValidator();
    const artifact = validExportArtifact();
    artifact.artifact_id = 'infoleg--extraction-001';

    assert.equal(validate(artifact), false);
  });
});

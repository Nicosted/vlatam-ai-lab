import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ajv2020 as AjvClass } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const schemaPath = resolve(repoRoot, 'schemas', 'delta-analyzer-evidence-packet.schema.json');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const applyFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (ajv: AjvClass) => void;

describe('delta-analyzer-evidence-packet schema', () => {
  it('validates a representative Delta Analyzer evidence packet', () => {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf-8')) as Record<string, unknown>;
    const ajv = new AjvClass({ allErrors: true, strict: true });
    applyFormats(ajv);
    const validate = ajv.compile(schema);

    const packet = {
      packet_id: 'infoleg--delta--infoleg--2026-06-10--to--2026-06-17--evidence-001',
      source_delta_id: 'delta--infoleg--2026-06-10--to--2026-06-17',
      source_id: 'infoleg',
      extracted_at: '2026-06-16T00:00:00Z',
      claims: [
        {
          claim_id: 'claim-0',
          claim_type: 'classification',
          description: 'modified change detected at /regulations/0/ncm/0101.21.00.000',
          affected_ncm: ['01012100000'],
          old_value: 'old',
          new_value: 'new',
          confidence: 0.9,
          requires_human_review: true,
        },
      ],
      summary: {
        total_claims: 1,
        by_type: {
          tariff: 0,
          intervention: 0,
          norm: 0,
          legal: 0,
          classification: 1,
        },
        requires_review_count: 1,
      },
      governance: {
        human_review_required: true,
        downstream_allowed: false,
        review_only: true,
        not_final_classification: true,
      },
      schema_version: '1.0.0',
    };

    assert.equal(validate(packet), true, JSON.stringify(validate.errors, null, 2));
  });
});

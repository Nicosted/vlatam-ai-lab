import { readFileSync } from 'fs';
import { join } from 'path';
import { Ajv2020 as Ajv, type ValidateFunction } from 'ajv/dist/2020.js';
import * as addFormats from 'ajv-formats/dist/index.js';

const SCHEMA_PATH = join(process.cwd(), 'schemas', 'ai-extraction-result.schema.json');

let ajv: Ajv;
let validate: ValidateFunction<unknown> | null = null;

function getValidator(): ValidateFunction<unknown> {
  if (validate) {
    return validate;
  }

  ajv = new Ajv({ allErrors: true, strict: false });
  const addFormatsFn = (addFormats as unknown as { default: (ajv: Ajv, formats?: string[]) => void }).default;
  addFormatsFn(ajv, ['date-time']);

  const schemaContent = readFileSync(SCHEMA_PATH, 'utf-8');
  const schema = JSON.parse(schemaContent);

  validate = ajv.compile(schema);
  return validate;
}

export function validateExtractionResult(data: unknown): { valid: boolean; errors: string[] } {
  const validator = getValidator();
  const valid = validator(data) as boolean;

  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors: string[] = [];
  if (validator.errors) {
    for (const err of validator.errors) {
      const path = err.instancePath || 'root';
      const message = err.message || 'Unknown error';
      errors.push(`${path}: ${message}`);
    }
  }

  return { valid: false, errors };
}

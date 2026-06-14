#!/usr/bin/env tsx
import { existsSync, readFileSync } from 'fs';
import { Ajv2020 as Ajv } from 'ajv/dist/2020.js';
import * as addFormats from 'ajv-formats/dist/index.js';
import { join } from 'path';

const SCHEMA_PATH = join(process.cwd(), 'schemas', 'extractable-evidence-packet.schema.json');

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function loadSchema(): object {
  const content = readFileSync(SCHEMA_PATH, 'utf-8');
  return JSON.parse(content);
}

function validatePacket(data: unknown): ValidationResult {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const addFormatsFn = (addFormats as unknown as { default: (ajv: Ajv, formats?: string[]) => void }).default;
  addFormatsFn(ajv, ['date-time']);

  const schema = loadSchema();
  const validate = ajv.compile(schema);
  const valid = validate(data) as boolean;

  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors: string[] = [];
  if (validate.errors) {
    for (const err of validate.errors) {
      const path = err.instancePath || 'root';
      const message = err.message || 'Unknown error';
      errors.push(`${path}: ${message}`);
    }
  }

  return { valid: false, errors };
}

function printUsage(): void {
  console.log('Usage: validate-packet.ts <evidence-packet-path>');
  console.log('');
  console.log('Example:');
  console.log('  pnpm ai:validate-packet snapshots/pcram/extractable-evidence-packet-test-minimal-2026-06-14.json');
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.length > 1) {
    printUsage();
    process.exit(1);
  }

  const packetPath: string = args[0]!;

  if (!existsSync(packetPath)) {
    console.error(`❌ File not found: ${packetPath}`);
    process.exit(1);
  }

  let content: string;
  try {
    content = readFileSync(packetPath, 'utf-8');
  } catch (err) {
    console.error(`❌ Cannot read file: ${packetPath}`);
    process.exit(1);
  }

  let packet: unknown;
  try {
    packet = JSON.parse(content);
  } catch {
    console.error(`❌ Invalid JSON: ${packetPath}`);
    process.exit(1);
  }

  const result = validatePacket(packet);

  if (result.valid) {
    console.log('✅ Valid evidence packet');
    process.exit(0);
  } else {
    console.error('❌ Validation failed:');
    for (const error of result.errors) {
      console.error(`   - ${error}`);
    }
    process.exit(1);
  }
}

main();

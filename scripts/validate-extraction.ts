#!/usr/bin/env tsx
import { readFileSync } from 'fs';
import { validateExtractionResult } from '../src/utils/schema-validator.js';
import 'dotenv/config';

const extractionPath = process.argv[2];

if (!extractionPath) {
  console.error('❌ Usage: pnpm ai:validate-extraction <path-to-extraction-result>');
  process.exit(1);
}

try {
  const content = readFileSync(extractionPath, 'utf-8');
  const data = JSON.parse(content);
  
  // Schema validation
  const validation = validateExtractionResult(data);
  
  if (!validation.valid) {
    console.error('❌ Schema validation failed:');
    validation.errors.forEach(err => console.error(`   - ${err}`));
    process.exit(1);
  }
  
  // Governance checks (beyond schema)
  const governanceErrors: string[] = [];
  
  if (data.human_review_required !== true) {
    governanceErrors.push('human_review_required must be true');
  }
  if (data.downstream_allowed !== false) {
    governanceErrors.push('downstream_allowed must be false');
  }
  
  const validStatuses = ['draft_unreviewed', 'critique_flagged', 'validation_failed', 'provider_failed'];
  if (!validStatuses.includes(data.extraction_status)) {
    governanceErrors.push(`Invalid extraction_status: ${data.extraction_status}`);
  }
  
  if (!Array.isArray(data.extracted_claims)) {
    governanceErrors.push('extracted_claims must be an array');
  }
  if (!Array.isArray(data.unsupported_claims)) {
    governanceErrors.push('unsupported_claims must be an array');
  }
  if (!Array.isArray(data.warnings)) {
    governanceErrors.push('warnings must be an array');
  }
  if (typeof data.confidence !== 'number' || data.confidence < 0 || data.confidence > 1) {
    governanceErrors.push('confidence must be a number between 0 and 1');
  }
  
  if (governanceErrors.length > 0) {
    console.error('❌ Governance validation failed:');
    governanceErrors.forEach(err => console.error(`   - ${err}`));
    process.exit(1);
  }
  
  console.log('✅ Valid extraction result');
  console.log(`   Status: ${data.extraction_status}`);
  console.log(`   Confidence: ${data.confidence}`);
  console.log(`   Extracted claims: ${data.extracted_claims.length}`);
  console.log(`   Unsupported claims: ${data.unsupported_claims.length}`);
  console.log(`   Warnings: ${data.warnings.length}`);
  console.log(`   Human review required: ${data.human_review_required}`);
  console.log(`   Downstream allowed: ${data.downstream_allowed}`);
  console.log(`   Created at: ${data.created_at}`);
  
} catch (error: any) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

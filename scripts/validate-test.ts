import { validateExtractionResult } from '../src/utils/schema-validator.js';

// Test 1: Empty object should fail
const emptyResult = {};
const emptyValidation = validateExtractionResult(emptyResult);
console.log('Test 1 - Empty object:');
console.log('  Valid:', emptyValidation.valid);
console.log('  Errors count:', emptyValidation.errors.length);
console.log('  ✓ PASS: Empty object correctly rejected' + (emptyValidation.valid === false ? '' : ' ❌ FAIL'));

// Test 2: Valid extraction result
const validResult = {
  extraction_result_id: 'ext-123',
  evidence_packet_id: 'packet-456',
  review_manifest_id: 'manifest-789',
  snapshot_id: 'snap-abc',
  source_id: 'source-def',
  provider_id: 'deepseek',
  model_id: 'deepseek-chat',
  extraction_status: 'draft_unreviewed',
  extracted_claims: [],
  unsupported_claims: [],
  warnings: [],
  confidence: 0.85,
  critic_summary: 'Test extraction summary',
  human_review_required: true,
  downstream_allowed: false,
  created_at: new Date().toISOString(),
  contract_version: '1.0.0',
  schema_version: '1.0.0'
};
const validValidation = validateExtractionResult(validResult);
console.log('\nTest 2 - Valid result:');
console.log('  Valid:', validValidation.valid);
console.log('  Errors:', validValidation.errors);
console.log('  ✓ PASS: Valid result correctly accepted' + (validValidation.valid === true ? '' : ' ❌ FAIL'));

// Test 3: Invalid status enum
const invalidStatus = { ...validResult, extraction_status: 'invalid_status' };
const invalidStatusValidation = validateExtractionResult(invalidStatus);
console.log('\nTest 3 - Invalid status:');
console.log('  Valid:', invalidStatusValidation.valid);
console.log('  ✓ PASS: Invalid status correctly rejected' + (invalidStatusValidation.valid === false ? '' : ' ❌ FAIL'));

// Test 4: Wrong human_review_required value (must be true)
const wrongReviewFlag = { ...validResult, human_review_required: false };
const wrongFlagValidation = validateExtractionResult(wrongReviewFlag);
console.log('\nTest 4 - Wrong human_review_required:');
console.log('  Valid:', wrongFlagValidation.valid);
console.log('  ✓ PASS: Wrong flag correctly rejected' + (wrongFlagValidation.valid === false ? '' : ' ❌ FAIL'));

console.log('\n--- Validation tests complete ---');

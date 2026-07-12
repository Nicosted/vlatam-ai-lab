// Helper script to generate the regulatory-advisory-readiness-result fixture
// from the existing domain input fixture. Not part of the test suite; used
// during AI-71 schema authoring only.
import { readFileSync, writeFileSync } from 'fs';
import { buildRegulatoryAdvisoryReadinessView } from '../src/advisory/regulatory-advisory-read-model.js';

const input = JSON.parse(
  readFileSync(
    './data/fixtures/advisory/regulatory-advisory-readiness-ar-es-eu-ecological-biological-agrochemical.json',
    'utf-8'
  )
) as Parameters<typeof buildRegulatoryAdvisoryReadinessView>[0];

const result = buildRegulatoryAdvisoryReadinessView(input);
writeFileSync(
  './snapshots/pcram/regulatory-advisory-readiness-result-valid.json',
  JSON.stringify(result, null, 2) + '\n'
);
console.log(`Wrote fixture: ${JSON.stringify(result).length} chars`);

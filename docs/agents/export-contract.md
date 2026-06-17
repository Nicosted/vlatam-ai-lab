# Export Contract Agent

Export Contract is PCRAM agent 6/6 (post-PCRAM). It transforms approved classifier
intelligence artifacts into a clean, stable format for external consumption by
vlatam-global.

## Inputs

- Approved `classifier-intelligence-artifact` from Human Review Gate
- Location: `data/intelligence/<source_id>/<artifact_id>.json`
- Must have `downstream_allowed: true` and `review_status: reviewed_approved`

## Outputs

- `classifier-approved-artifact-export` clean export artifact
- Location: `data/exports/<source_id>/<artifact_id>--export.json`
- Schema: `schemas/classifier-approved-artifact-export.schema.json`

## What is Removed

- Governance flags (internal review metadata)
- Review metadata (reviewer, reviewed_at, approval_reference)
- Internal provenance (source_authority, origin)
- Internal traceability (extraction_result_id)

## What is Kept

- artifact_id (traceability back to source)
- source_id (source identification)
- classification_candidate (the actual classification)
- extracted_evidence (the evidence claims)
- exported_at (deterministic timestamp)

## Determinism

- Default `exported_at` uses artifact's `reviewed_at`
- Override via `options.exported_at` for tests/controlled operations
- If neither exists, agent throws error (no `new Date()` fallback)

## Safety

- Only exports artifacts with `downstream_allowed: true`
- Blocks synthetic/demo artifacts
- Validates against export schema before write
- No-write-on-failure with atomic rename

## CLI Usage

```bash
pnpm agents:export-contract --source infoleg --artifact artifact--infoleg--extraction-001
```

## Programmatic Usage

```typescript
import { exportApprovedArtifact } from '../src/agents/export-contract.js';

const result = await exportApprovedArtifact({
  source_id: 'infoleg',
  artifact_id: 'artifact--infoleg--extraction-001',
});

console.log(result.export_id);
```

# Evidence Writer Agent

Evidence Writer is PCRAM agent 4/5. It consumes a versioned `ai-extraction-result`
from the repository and produces a deterministic, versioned
`classifier-intelligence-artifact` for human review.

## Inputs

- `ai-extraction-result` from upstream agent
- Location: `data/extractions/<source_id>/<extraction_result_id>.json`
- Schema: `schemas/ai-extraction-result.schema.json`

## Outputs

- `classifier-intelligence-artifact` versioned artifact
- Location: `data/intelligence/<source_id>/<artifact_id>.json`
- Schema: `schemas/classifier-intelligence-artifact.schema.json`

## Governance

All outputs are review-only with mandatory flags:

- `human_review_required: true`
- `downstream_allowed: false`
- `review_only: true`
- `not_final_classification: true`

## Determinism

- Default `generated_at` uses the extraction result's `extracted_at`
- Override via `options.generated_at` for tests and controlled operations
- If neither exists, the agent throws an error
- Artifact ID is deterministic: `artifact--<source_id>--<extraction_result_id>`

## What This Agent Does Not Do

- Does not make final classification decisions
- Does not approve downstream usage
- Does not connect to external services
- Does not accept manual evidence input
- Does not generate random IDs or timestamps

## CLI Usage

```bash
pnpm agents:evidence-writer --source infoleg --extraction-result extraction-001
```

Expected success output uses relative paths only:

```text
[evidence-writer] ✓ Intelligence artifact generated
[evidence-writer]   source_id           : infoleg
[evidence-writer]   extraction_result   : extraction-001
[evidence-writer]   artifact_id         : artifact--infoleg--extraction-001
[evidence-writer]   output_path         : data/intelligence/infoleg/artifact--infoleg--extraction-001.json
[evidence-writer]   schema_valid        : true
[evidence-writer]   governance          : review-only
```

## Programmatic Usage

```typescript
import { writeEvidenceArtifact } from '../src/agents/evidence-writer.js';

const result = await writeEvidenceArtifact({
  source_id: 'infoleg',
  extraction_result_id: 'extraction-001',
});

console.log(result.artifact_id);
```

## Artifact Policy

`data/intelligence/` is ignored for operational outputs until governance is
defined. Reference fixture inputs may live under `data/extractions/` and remain
review-only sample data. Evidence Writer validates input and output contracts
before writing and uses a temp-file rename so invalid artifacts are not written.

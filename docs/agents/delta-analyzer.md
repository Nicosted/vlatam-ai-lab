# Delta Analyzer Agent

Delta Analyzer is PCRAM agent 3/5. It consumes local Source Monitor delta
reports and produces review-only evidence packets under:

```text
data/evidence/<source_id>/<from_date>_to_<to_date>--evidence-001.json
```

It does not call external services, databases, or production systems. Its job is
to convert structural source changes into bounded claims that a human reviewer
can inspect before any downstream classifier or runtime receives them.

## Inputs

Delta Analyzer reads Source Monitor output from:

```text
data/deltas/<source_id>/<from_date>_to_<to_date>.json
```

The input delta must validate against:

```text
schemas/source-monitor-delta.schema.json
```

## Output

The output validates against:

```text
schemas/delta-analyzer-evidence-packet.schema.json
```

Each packet contains:

- `packet_id`
- `source_delta_id`
- `source_id`
- `extracted_at`
- `claims[]`
- `summary`
- `governance`
- `schema_version`

Every claim has `requires_human_review: true`. Every packet has the mandatory
governance flags:

```json
{
  "human_review_required": true,
  "downstream_allowed": false,
  "review_only": true,
  "not_final_classification": true
}
```

## CLI Usage

```bash
pnpm agents:delta-analyzer --source infoleg --from 2026-06-10 --to 2026-06-17
```

Expected success output:

```text
[delta-analyzer] ✓ Evidence packet generated
[delta-analyzer]   source_id    : infoleg
[delta-analyzer]   delta        : 2026-06-10_to_2026-06-17
[delta-analyzer]   total_claims : 8
[delta-analyzer]   by_type      : {"tariff":0,"intervention":0,"norm":6,"legal":0,"classification":2}
[delta-analyzer]   output_path  : /Users/nicolasmatiasstedile/Developer/vlatam-ai-lab/data/evidence/infoleg/2026-06-10_to_2026-06-17--evidence-001.json
[delta-analyzer]   schema_valid : true
```

## Programmatic Usage

```typescript
import { analyzeDelta } from '../src/agents/delta-analyzer.js';

const result = await analyzeDelta({
  source_id: 'infoleg',
  from_date: '2026-06-10',
  to_date: '2026-06-17',
});

console.log(result.packet.summary);
```

Tests may pass `extracted_at` explicitly for deterministic assertions:

```typescript
await analyzeDelta({
  source_id: 'infoleg',
  from_date: '2026-06-10',
  to_date: '2026-06-17',
  extracted_at: '2026-06-16T00:00:00Z',
});
```

## Claim Mapping Rules

Rules are evaluated in order against the lowercase JSON Pointer path.

| Path contains | Claim type |
| --- | --- |
| `rate`, `tariff`, `arancel`, `duty`, `tax` | `tariff` |
| `classification`, `ncm`, `hs_code`, `sh_code`, `codification` | `classification` |
| `intervention`, `license`, `permit`, `sensors`, `anmat`, `enacom`, `sennir` | `intervention` |
| `legal`, `law`, `decree`, `resolution`, `disposition`, `statute` | `legal` |
| No match | `norm` |

After mapping, each `claim_type` is validated with
`src/contracts/vlatam-global-bridge.ts`. If validation fails, the agent throws
`CONTRACT_VIOLATION` before writing output.

## Confidence Calculation

The confidence score is deterministic:

- Base score: `0.5`
- Add `0.2` when the JSON Pointer path depth is greater than 4
- Add `0.1` when an NCM code is extracted
- Add `0.1` when `change.type === "modified"`
- Cap at `1.0`

Confidence is not approval. All outputs remain review-only.

## Example Packet Snippet

```json
{
  "packet_id": "infoleg--2026-06-10_to_2026-06-17--evidence-001",
  "source_delta_id": "delta--infoleg--2026-06-10--to--2026-06-17",
  "source_id": "infoleg",
  "extracted_at": "2026-06-16T00:00:00Z",
  "claims": [
    {
      "claim_id": "claim-001",
      "claim_type": "classification",
      "description": "Change detected at /regulations/0/ncm_chapters_covered/3 (added)",
      "affected_ncm": [],
      "new_value": "63",
      "confidence": 0.7,
      "requires_human_review": true
    }
  ],
  "summary": {
    "total_claims": 8,
    "by_type": {
      "tariff": 0,
      "intervention": 0,
      "norm": 6,
      "legal": 0,
      "classification": 2
    },
    "requires_review_count": 8
  },
  "governance": {
    "human_review_required": true,
    "downstream_allowed": false,
    "review_only": true,
    "not_final_classification": true
  },
  "schema_version": "1.0.0"
}
```

## Validation

Useful local checks:

```bash
pnpm exec tsx --test tests/agents/delta-analyzer.test.ts
pnpm build
pnpm agents:delta-analyzer --source infoleg --from 2026-06-10 --to 2026-06-17
```

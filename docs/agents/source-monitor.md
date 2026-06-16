# Source Monitor Agent

**PCRAM Chain: Step 2 of 5**  
**File:** `src/agents/source-monitor.ts`  
**CLI:** `src/cli/source-monitor.ts`

---

## Purpose

The Source Monitor is the second agent in the PCRAM chain. It consumes two
`intelligence-source-snapshot` artifacts produced by the Snapshot Writer (Step 1)
and produces a structured **delta report** describing what changed between them.

Its output is the artifact that triggers downstream PCRAM steps: a delta with
changes is the signal to proceed toward Evidence Writing and Human Review.

---

## Position in the PCRAM Chain

```
[1] Snapshot Writer   (creates versioned immutable snapshots)
[2] Source Monitor    ← THIS AGENT
[3] Evidence Writer   (builds extractable-evidence-packet from delta)
[4] Human Review Gate (pauses pipeline for human approval)
[5] Classifier Agent  (produces approved downstream artifacts)
```

---

## Pre-Implementation Audit Findings (2026-06-16)

Before this agent was written, the repository state was audited:

| Source | Snapshot Writer artifacts | Other files |
|--------|--------------------------|-------------|
| `arca/` | 0 | 3 TXT files, SHA manifest |
| `boletin_oficial/` | 0 | (empty) |
| `infoleg/` | 1 (`2026-06-16.json`) | 3 CSV files (gitignored) |
| `mercosur/` | 0 | (empty) |
| `organismos_sectoriales/` | 0 | (empty) |
| `vuce/` | 0 | PDFs + notes subdirs |

**Key design implications:**
- Only one pre-existing Snapshot Writer artifact existed → test fixtures must be fully self-contained.
- `data/parsed/` and `data/diffs/` contain legacy formats (ARCA tariff parse, old diff format) → Source Monitor output goes to `data/deltas/` (new, isolated namespace).
- The `content` field is optional in the snapshot schema → agent must handle its absence gracefully (legacy mode).

---

## Architectural Constraints

| Constraint | Status |
|-----------|--------|
| No live network requests | ✅ Reads only local files from `data/sources/` |
| No external database | ✅ Artifacts are versioned JSON in `data/deltas/` |
| No cross-repo coupling | ✅ Self-contained in `vlatam-ai-lab` |
| Schema validated before write | ✅ AJV2020 validates both inputs + output |
| Deterministic output | ✅ Same two input files → same changes array (order is stable) |
| Governance defaults | ✅ `human_review_required: true`, `downstream_allowed: false` |

---

## Diff Modes

The agent automatically selects the diff mode based on the snapshots:

| Mode | Condition | What is diffed |
|------|-----------|---------------|
| `content` | Both snapshots have a `content` field | Only the `content` object |
| `full_object` | One or both snapshots lack `content` | Full snapshot object minus volatile governance fields |

Volatile fields excluded from `full_object` diffs (expected to differ between snapshots):
`review_status`, `extraction_status`, `captured_at`, `created_at`, `contract_version`

---

## CLI Usage

```bash
pnpm agents:source-monitor \
  --source <source_id> \
  --from <YYYY-MM-DD> \
  --to <YYYY-MM-DD>
```

### Required arguments

| Flag | Description | Example |
|------|-------------|---------|
| `--source` | Source identifier | `infoleg`, `arca` |
| `--from` | Date of the older (baseline) snapshot | `2026-06-10` |
| `--to` | Date of the newer snapshot | `2026-06-17` |

### Optional arguments

| Flag | Description |
|------|-------------|
| `--from-path` | Explicit file path to from snapshot (overrides `data/sources/<source>/<from>.json`) |
| `--to-path` | Explicit file path to to snapshot (overrides `data/sources/<source>/<to>.json`) |

### Example

```bash
pnpm agents:source-monitor --source infoleg --from 2026-06-10 --to 2026-06-17
```

Expected output:
```
[source-monitor] ✓ Delta written
[source-monitor]   source_id          : infoleg
[source-monitor]   from_date          : 2026-06-10
[source-monitor]   to_date            : 2026-06-17
[source-monitor]   content_hash_changed: true
[source-monitor]   diff_mode          : content
[source-monitor]   changes            : 8 total
[source-monitor]     added   : 2
[source-monitor]     removed : 0
[source-monitor]     modified: 6
[source-monitor]   output_path        : /…/data/deltas/infoleg/2026-06-10_to_2026-06-17.json
```

---

## Programmatic Usage

```typescript
import { monitorSource } from './src/agents/source-monitor.js';

const result = await monitorSource({
  source_id: 'infoleg',
  from_date: '2026-06-10',
  to_date: '2026-06-17',
});

console.log(result.delta.summary);
// { added: 2, removed: 0, modified: 6, total: 8 }

console.log(result.delta.content_hash_changed); // true
console.log(result.output_path);                // absolute path to written delta
```

### With explicit snapshot paths

```typescript
const result = await monitorSource({
  source_id: 'infoleg',
  from_date: '2026-06-10',
  to_date: '2026-06-17',
  from_snapshot_path: 'data/sources/infoleg/2026-06-10.json',
  to_snapshot_path:   'data/sources/infoleg/2026-06-17.json',
});
```

### Return type

```typescript
interface SourceMonitorOutput {
  delta: SourceMonitorDelta;   // the validated delta object
  output_path: string;         // absolute path of the written file
  schema_valid: true;          // always true (throws if invalid)
}
```

### Thrown errors

```typescript
class SourceMonitorError extends Error {
  code:
    | 'SNAPSHOT_NOT_FOUND'       // input file does not exist
    | 'SNAPSHOT_PARSE_ERROR'     // file is not valid JSON
    | 'SNAPSHOT_SCHEMA_ERROR'    // snapshot fails intelligence-source-snapshot schema
    | 'SOURCE_ID_MISMATCH'       // the two snapshots belong to different sources
    | 'DATE_ORDER_ERROR'         // from_date >= to_date
    | 'DELTA_SCHEMA_ERROR'       // generated delta fails source-monitor-delta schema
    | 'WRITE_ERROR';             // filesystem write failure
}
```

---

## Example Delta Output

```json
{
  "delta_id": "delta--infoleg--2026-06-10--to--2026-06-17",
  "source_id": "infoleg",
  "from_snapshot": "data/sources/infoleg/2026-06-10.json",
  "to_snapshot": "data/sources/infoleg/2026-06-17.json",
  "from_date": "2026-06-10",
  "to_date": "2026-06-17",
  "content_hash_changed": true,
  "diff_mode": "content",
  "changes": [
    {
      "type": "modified",
      "path": "/regulations/0/ncm_chapters_covered/3",
      "old_value": null,
      "new_value": "63"
    },
    {
      "type": "modified",
      "path": "/regulations/1/norma_numero",
      "old_value": "5017/2021",
      "new_value": "5089/2022"
    }
  ],
  "summary": { "added": 2, "removed": 0, "modified": 6, "total": 8 },
  "human_review_required": true,
  "downstream_allowed": false,
  "schema_version": "1.0.0"
}
```

---

## Output Directory Structure

```
data/
  deltas/
    infoleg/
      2026-06-10_to_2026-06-17.json   ← Delta artifact
  sources/
    infoleg/
      2026-06-10.json                 ← From snapshot (input)
      2026-06-17.json                 ← To snapshot (input)
```

---

## Legacy Snapshot Handling

Snapshots without a `content` field (e.g. produced before the Snapshot Writer was
implemented) are handled automatically:

1. Agent detects absence of `content` on either snapshot.
2. Sets `diff_mode: "full_object"`.
3. Diffs the full snapshot object, excluding volatile governance fields.
4. Adds a warning to `delta.notes`.

This ensures the agent is backward-compatible with any existing snapshot artifacts
that were recorded before PR #58 introduced the `content` field.

---

## Running Tests

```bash
pnpm test
```

New test coverage (19 tests):
- **Happy path** — real infoleg v1/v2 snapshots, delta written, hash changed, mode=content
- **Identical snapshots** — empty changes, `content_hash_changed: false`
- **Date order errors** — `from >= to` rejected before any I/O
- **Source ID mismatch** — snapshots from different sources rejected, no file written
- **Missing snapshot** — typed `SNAPSHOT_NOT_FOUND` error, no file written
- **Legacy snapshots** — `full_object` mode, changed field detected, warning in notes
- **Schema compliance** — all required fields present, RFC 6901 paths enforced

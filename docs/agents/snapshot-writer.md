# Snapshot Writer Agent

**PCRAM Chain: Step 1 of 5**  
**File:** `src/agents/snapshot-writer.ts`  
**CLI:** `src/cli/snapshot-writer.ts`

---

## Purpose

The Snapshot Writer is the first runtime agent in the PCRAM (Provenance, Capture, Review, Analysis, Mapping) chain. It transforms a local fixture file into an **immutable, versioned, schema-validated JSON snapshot artifact** in `data/sources/<source_id>/<date>.json`.

It is the boundary between raw input files and the governed artifact layer. Nothing downstream of this agent operates on unvalidated data.

---

## Position in the PCRAM Chain

```
[1] Snapshot Writer   ← THIS AGENT
[2] Delta Analyzer    (detects changes between snapshot versions)
[3] Evidence Writer   (builds extractable-evidence-packet)
[4] Human Review Gate (pauses pipeline for human approval)
[5] Classifier Agent  (produces approved downstream artifacts)
```

---

## Architectural Constraints

| Constraint | Status |
|-----------|--------|
| No live network requests | ✅ All input comes from local fixture files |
| No external database | ✅ Artifacts are versioned JSON files in `data/sources/` |
| No cross-repo coupling | ✅ Self-contained in `vlatam-ai-lab` |
| Schema validation before write | ✅ AJV validates against `intelligence-source-snapshot.schema.json` |
| Deterministic output | ✅ Same input → same hash → same artifact bytes |
| Governance defaults | ✅ `human_review_required: true`, `downstream_allowed: false` |

---

## CLI Usage

```bash
pnpm agents:snapshot-writer \
  --source <source_id> \
  --date <YYYY-MM-DD> \
  --input <path-to-fixture>
```

### Required arguments

| Flag | Description | Example |
|------|-------------|---------|
| `--source` | Source identifier | `infoleg`, `arca`, `vuce` |
| `--date` | Snapshot date (ISO 8601) | `2026-06-16` |
| `--input` | Path to local fixture JSON | `data/fixtures/infoleg-sample-ncm.json` |

### Optional arguments

| Flag | Description | Example |
|------|-------------|---------|
| `--url` | Canonical official URL (not fetched at runtime) | `https://servicios.infoleg.gob.ar/` |
| `--pubdate` | Original publication date of source | `2026-05-01` |

### Example

```bash
pnpm agents:snapshot-writer \
  --source infoleg \
  --date 2026-06-16 \
  --input data/fixtures/infoleg-sample-ncm.json \
  --url https://servicios.infoleg.gob.ar/infolegInternet/ \
  --pubdate 2026-06-16
```

Expected output:
```
[snapshot-writer] ✓ Snapshot written
[snapshot-writer]   source_id    : infoleg
[snapshot-writer]   snapshot_id  : infoleg--2026-06-16
[snapshot-writer]   content_hash : sha256:<64-char-hex>
[snapshot-writer]   output_path  : /absolute/path/to/data/sources/infoleg/2026-06-16.json
[snapshot-writer]   schema_valid : true
```

---

## Programmatic Usage

```typescript
import { writeSnapshot } from './src/agents/snapshot-writer.js';

const result = await writeSnapshot({
  source_id: 'infoleg',
  snapshot_date: '2026-06-16',
  input_path: 'data/fixtures/infoleg-sample-ncm.json',
  official_url: 'https://servicios.infoleg.gob.ar/infolegInternet/',
  publication_date: '2026-06-16',
});

console.log(result.output_path);       // absolute path to written file
console.log(result.artifact.content_hash); // sha256:...
console.log(result.schema_valid);      // true
```

### Return type

```typescript
interface SnapshotWriterOutput {
  artifact: SnapshotArtifact;   // the validated snapshot object
  output_path: string;          // absolute path of the written file
  schema_valid: true;           // always true (throws if invalid)
}
```

### Thrown errors

```typescript
class SnapshotWriterError extends Error {
  code: 'INPUT_NOT_FOUND' | 'INPUT_PARSE_ERROR' | 'SCHEMA_VALIDATION_ERROR' | 'WRITE_ERROR';
}
```

---

## Output Directory Structure

```
data/
  sources/
    infoleg/
      2026-06-16.json   ← Snapshot artifact
      2026-07-01.json   ← Next snapshot (versioned by date)
    arca/
      2026-06-16.json
  fixtures/
    infoleg-sample-ncm.json   ← Input fixture (not modified)
```

---

## Artifact Schema

Each written file conforms to `schemas/intelligence-source-snapshot.schema.json`.

Key fields populated by the Snapshot Writer:

| Field | Value |
|-------|-------|
| `snapshot_id` | `<source_id>--<date>` |
| `source_id` | From `--source` argument |
| `captured_at` | `<date>T00:00:00.000Z` |
| `capture_method` | `"local_fixture"` |
| `content_hash` | `sha256:<hex>` of raw fixture bytes |
| `content` | Parsed JSON content of the fixture |
| `provenance.retrieval_method` | `"manual_fixture"` |
| `provenance.fixture_path` | Repo-relative path to the input file |
| `human_review_required` | `true` (immutable) |
| `downstream_allowed` | `false` (immutable) |
| `review_status` | `"not_reviewed"` |
| `extraction_status` | `"not_started"` |

---

## Running Tests

```bash
pnpm test
```

Test coverage:
- **Happy path** — file creation, hash correctness, governance defaults, provenance fields
- **Idempotency** — two runs with identical input produce byte-for-byte identical output
- **Validation failures** — missing file, malformed JSON, no disk write on error
- **Schema compliance** — generated artifact validated against AJV + JSON Schema

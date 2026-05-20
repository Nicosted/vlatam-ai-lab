# PCRAM Monitor P0 Plan

## Purpose

Define a safe, local-only planning layer for the future PCRAM bulletin/NCM monitoring capability in `vlatam-ai-lab`.

This P0 stage formalizes source and evidence contracts so future implementation can be deterministic, auditable, and production-isolated.

## Scope

- Define source snapshot contract (JSON Schema)
- Define delta contract (JSON Schema)
- Define sample local snapshot artifact
- Define sample human-readable evidence report
- Document lifecycle checkpoints for source, snapshot, delta, and review

## Non-goals

- No web scraping implementation
- No browser automation
- No external network calls
- No database, queue, or API integration
- No production classifier write-back

## Source categories

1. **PCRAM bulletin**
   - Regulatory bulletins and updates relevant to trade operations.

2. **PCRAM NCM lookup**
   - Structured lookups for NCM-related references and interpretation context.

3. **Future official sources**
   - Additional government or institutional sources approved later by human governance.

## Local-only workflow

1. Human places source material in local approved folders.
2. Snapshot writer creates local snapshot JSON compliant with schema.
3. Delta analyzer compares snapshots and writes local delta JSON.
4. Evidence writer produces markdown report with assumptions and impact notes.
5. Human reviewer validates findings before any downstream action.

### Local snapshot validation command

Run local schema validation against the sample fixture:

`npm exec --yes pnpm@latest -- pcram:validate-snapshot`

## Snapshot lifecycle

1. **Capture**: ingest local text/payload from approved source folders.
2. **Normalize**: structure content into `normalized_payload`.
3. **Hash**: compute deterministic content hash (e.g., SHA-256).
4. **Persist**: store snapshot artifact in `snapshots/`.
5. **Trace**: retain metadata (`captured_at`, `captured_by`, `capture_method`).

## Delta lifecycle

1. Select previous and current snapshots for a source.
2. Compute structured delta (`change_type`, `affected_codes`, summary).
3. Attach risk assessment and impact hypothesis.
4. Flag `requires_human_review` for all high uncertainty or high impact deltas.
5. Persist delta artifact for evidence and audit trail.

## Evidence report lifecycle

1. Pull relevant snapshot and delta artifacts.
2. Render human-readable markdown report in `reports/`.
3. Include source references, assumptions, and limitations.
4. Mark confidence and risk level.
5. Route to human review checkpoint.

## Human review checkpoints

- Checkpoint A: source authenticity and provenance
- Checkpoint B: normalization quality
- Checkpoint C: delta interpretation correctness
- Checkpoint D: operational impact and risk level
- Checkpoint E: final approval before any downstream integration

## Risk controls

- Local-only operation by default
- No credentials and no `.env*` usage
- No production connections
- Deterministic file-based artifacts for auditability
- Explicit uncertainty and assumptions in every evidence report
- Human approval gate before action

## Future integration path with vLatamGlobal Classifier

When approved in a future phase:

1. Map validated delta schema fields to classifier input contract.
2. Keep ingestion one-way from reviewed evidence only.
3. Enforce human-approval flag before classifier feed export.
4. Add explicit integration boundary module in `src/pipelines/`.
5. Keep production integration disabled until separate governance approval.

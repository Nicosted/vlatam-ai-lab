# PCRAM Delta Analyzer Contract (P0)

## Purpose

Define how two validated PCRAM snapshots are compared to produce a deterministic local delta artifact.

This contract is documentation-only for P0. It does not authorize runtime execution.

## Required inputs

- Previous snapshot JSON that already passed source snapshot validation.
- Current snapshot JSON that already passed source snapshot validation.
- Both snapshots must represent the same source lineage.

## Allowed change types

- Delta `change_type` values:
  - `no_change`
  - `modified`

## Risk-level guidance

- `low`:
  - No semantic payload change, or metadata-only impact hypotheses.
- `medium`:
  - Normalized content changed and could affect downstream interpretation.
- Any uncertainty must keep `requires_human_review` explicit.
- When specialization or jurisdiction context is available, risk and impact framing should identify the affected specialization and country/jurisdiction scope.

## Output artifact

- Deterministic local delta JSON aligned with `schemas/pcram-delta.schema.json`.
- Artifact must include IDs, change type, affected codes, summary, operational impact, risk level, human review flag, and evidence paths.

## Limitations

- Delta output is an analytical hypothesis, not an operational decision.
- No legal/customs determination is made at this stage.
- No production write-back is allowed.

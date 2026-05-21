# PCRAM Snapshot Writer Contract (P0)

## Purpose

Define the rules for creating deterministic PCRAM source snapshot artifacts from approved local inputs.

This contract is documentation-only for P0. It does not authorize runtime execution.

## Allowed local folders

- Source inputs: `sources/pcram/` (approved local-only contents)
- Snapshot outputs: `snapshots/pcram/`
- Schema references: `schemas/`

## Schema requirements

- Snapshot artifacts must satisfy `schemas/pcram-source-snapshot.schema.json`.
- Required fields must include snapshot identity, source metadata, provenance metadata, and normalized payload.
- Snapshot JSON must remain deterministic and auditable.

## Hash and provenance expectations

- `content_hash` should represent the normalized local content deterministically.
- `captured_at`, `captured_by`, and `capture_method` must be explicit.
- `raw_text_path` must point to local repository paths only.
- Notes must disclose assumptions/limitations when applicable.

## Forbidden production access

- No production databases or cloud services.
- No external API calls or web fetches.
- No credential loading and no `.env*` access.

## Output artifacts

- Snapshot JSON files in `snapshots/pcram/` that pass schema validation.
- Local validation output indicating pass/fail and explicit errors.

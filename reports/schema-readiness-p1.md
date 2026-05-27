# P1 Schema Readiness Report

## Metadata

- generated_by: `schema-readiness-report.ts`
- source_registry_path: `schemas/schema-registry.json`
- local_only_note: Generated from local repository artifacts only; no production systems, external services, or network access are required.

## Summary

- total_contracts: `8`
- total_valid_fixtures: `8`
- total_invalid_fixtures: `19`
- total_test_files: `8`

## Contract Names

- `source_version`
- `review_manifest`
- `approved_artifact`
- `evidence_report_metadata`
- `broker_profile`
- `relevance_assessment`
- `jurisdiction_pack`
- `approved_kb_snapshot`

## Contract Inventory

| Contract                   | Status        | Schema                                         | Valid Fixture                                           | Invalid Fixtures | Test File                                       | Human Review Semantics | Traceability | Downstream Allowed Field |
| -------------------------- | ------------- | ---------------------------------------------- | ------------------------------------------------------- | ---------------: | ----------------------------------------------- | ---------------------- | ------------ | ------------------------ |
| `source_version`           | `implemented` | `schemas/source-version.schema.json`           | `snapshots/pcram/example-source-version.json`           |                2 | `tests/source-version-schema.test.ts`           | no                     | yes          | no                       |
| `review_manifest`          | `implemented` | `schemas/review-manifest.schema.json`          | `snapshots/pcram/example-review-manifest.json`          |                2 | `tests/review-manifest-schema.test.ts`          | yes                    | yes          | yes                      |
| `approved_artifact`        | `implemented` | `schemas/approved-artifact.schema.json`        | `snapshots/pcram/example-approved-artifact.json`        |                2 | `tests/approved-artifact-schema.test.ts`        | yes                    | yes          | yes                      |
| `evidence_report_metadata` | `implemented` | `schemas/evidence-report-metadata.schema.json` | `snapshots/pcram/example-evidence-report-metadata.json` |                2 | `tests/evidence-report-metadata-schema.test.ts` | yes                    | yes          | no                       |
| `broker_profile`           | `implemented` | `schemas/broker-profile.schema.json`           | `snapshots/pcram/example-broker-profile.json`           |                2 | `tests/broker-profile-schema.test.ts`           | yes                    | yes          | no                       |
| `relevance_assessment`     | `implemented` | `schemas/relevance-assessment.schema.json`     | `snapshots/pcram/example-relevance-assessment.json`     |                3 | `tests/relevance-assessment-schema.test.ts`     | yes                    | yes          | no                       |
| `jurisdiction_pack`        | `implemented` | `schemas/jurisdiction-pack.schema.json`        | `snapshots/pcram/example-jurisdiction-pack.json`        |                3 | `tests/jurisdiction-pack-schema.test.ts`        | yes                    | yes          | yes                      |
| `approved_kb_snapshot`     | `implemented` | `schemas/approved-kb-snapshot.schema.json`     | `snapshots/pcram/example-approved-kb-snapshot.json`     |                3 | `tests/approved-kb-snapshot-schema.test.ts`     | yes                    | yes          | yes                      |

## Missing Reference Summary

- Missing references: `0`
- Status: `none`

## Readiness Conclusion

The completed P1 schema hardening set is locally indexed and reference-complete
for schema readiness reporting.

## Local-Only / No-Production Note

This report is generated from local repository files only. It does not require
`.env` files, Supabase, production systems, API routes, database migrations,
scraping, scheduled jobs, runtime agents, classifier write-back, or external
network access.

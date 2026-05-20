# PCRAM Monitor Evidence Report (Example)

## Metadata

- Report ID: `evidence-pcram-monitor-example-001`
- Generated At: `2026-05-20T12:10:00.000Z`
- Environment: `local-only-lab`
- Reviewer Status: `pending-human-review`

## Source Context

- Source ID: `pcram-bulletin`
- Source Type: `pcram_bulletin`
- Snapshot (current): `snapshot-pcram-bulletin-2026-05-20t120000z`
- Snapshot (previous): `snapshot-pcram-bulletin-2026-05-13t120000z`

## Delta Summary

- Delta ID: `delta-pcram-bulletin-2026-05-20`
- Change Type: `modified`
- Affected Codes: `0101.21.00`
- Summary: Updated bulletin language references treatment for the listed code.

## Operational Impact (Hypothesis)

- Potential impact on classification review workflow.
- Human analyst must validate interpretation before any recommendation.

## Evidence Paths

- `snapshots/pcram/example-source-snapshot.json`
- `reports/example-pcram-delta-report.md`

## Risk and Controls

- Risk Level: `medium`
- Requires Human Review: `true`
- Control: no autonomous action permitted.

## Assumptions and Limitations

- This report is based on local sample artifacts only.
- No external source fetch or validation occurred.
- This evidence is non-binding until human approval.

## Human Review Checklist

- [ ] Confirm source provenance
- [ ] Confirm delta interpretation
- [ ] Confirm affected code mapping
- [ ] Confirm risk level
- [ ] Approve or reject downstream integration proposal

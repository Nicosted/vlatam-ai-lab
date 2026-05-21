# PCRAM Evidence Writer Contract (P0)

## Purpose

Define how a human-readable markdown evidence report is generated from local snapshot and delta artifacts.

This contract is documentation-only for P0. It does not authorize runtime execution.

## Required inputs

- Previous PCRAM source snapshot JSON.
- Current PCRAM source snapshot JSON.
- PCRAM delta JSON derived from those snapshots.

## Report sections

Evidence reports should include at least:

- Title
- Generated timestamp
- Snapshot context (source id/name/type, previous/current snapshot IDs)
- Delta summary (delta id, change type, affected codes, summary)
- Operational impact and risk level
- Human review requirement flag
- Evidence paths
- Assumptions and limitations

## Profile relevance (future phase)

- Future reports may include a `Relevance for profile` section when verified profile context is available.
- The Evidence Writer must not invent broker/user preferences, specialization, jurisdiction scope, topics of interest, or preferred style.
- If profile context is unavailable, the report should state that personalization was not applied.

## Assumptions and limitations

- Must explicitly state local-only scope.
- Must explicitly state uncertainty and non-final nature.
- Must not imply production approval or autonomous action.

## Human-review gate

- Every evidence report is advisory until human review is completed.
- Reports must route to `pcram-human-review-gate` before downstream use.

## Non-authority statement

- The Evidence Writer does not issue final legal, customs, or compliance determinations.

# PCRAM Contract Conformance Checklist (P0)

Use this checklist before any future PCRAM agent runtime proposal or activation.

Status reminder: PCRAM agents are documentation-only in P0.

## Repository safety

- [ ] No `.env*` access is present.
- [ ] No credentials are created, stored, or exposed.
- [ ] No external service access is present.
- [ ] No production integration is present.
- [ ] No repository modifications occur outside `vlatam-ai-lab`.

## Agent scope

- [ ] The agent role is explicitly identified.
- [ ] The role matches one approved PCRAM contract in `agents/`.
- [ ] Inputs and outputs match the contract definition.
- [ ] Contract forbidden actions are not present.

## Artifact validation

- [ ] Snapshot artifacts validate against `schemas/pcram-source-snapshot.schema.json`.
- [ ] Delta artifacts validate against `schemas/pcram-delta.schema.json`.
- [ ] Evidence reports include explicit assumptions and limitations.
- [ ] All artifacts remain local, deterministic, and traceable.

## Personalization safety

- [ ] Specialization/jurisdiction/topic/style profile context is used only when explicitly provided.
- [ ] No profile assumptions are invented.
- [ ] Outputs state a baseline profile when no personalization context exists.

## Human review gate

- [ ] Source provenance is checked.
- [ ] Delta interpretation is checked.
- [ ] Risk level is checked.
- [ ] Evidence report is reviewed.
- [ ] Downstream use is marked as approved, rejected, or needs clarification.

## Runtime readiness

- [ ] No autonomous execution is enabled in P0.
- [ ] No Antigravity runtime execution is enabled unless separately approved.
- [ ] No scheduled jobs are enabled unless separately approved.
- [ ] No production write-back is enabled.

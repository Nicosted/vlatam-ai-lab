# PCRAM Source Monitor Contract (P0)

## Purpose

Define how source monitoring is scoped for PCRAM in a local-only, production-isolated environment.

This contract is documentation-only for P0. It does not authorize runtime execution.

## Allowed inputs

- Local folders explicitly approved for PCRAM source material.
- Local fixture/source files already present in this repository.
- Local metadata needed to trace provenance (file path, local timestamp, operator note).

## Forbidden actions

- Any external network call or URL fetch.
- Any browser automation or scraping flow.
- Any `.env*` read or credential handling.
- Any production integration (Supabase, Vercel, databases, external APIs).
- Any action outside this repository.

## Output artifacts

- Local source context notes suitable for handoff to Snapshot Writer.
- Candidate file/path list for local snapshot creation.
- Optional local markdown trace notes under `reports/` (if human requests evidence notes).

## Human review checkpoints

- Confirm source folder was approved by governance.
- Confirm artifacts are local-only and traceable.
- Confirm no automated external retrieval occurred.

## Future Antigravity role (not active in P0)

In a future approved phase, this contract can map to a constrained Antigravity step that only enumerates approved local files and emits structured handoff context. Runtime activation requires separate governance approval.

# PCRAM Agent Contracts (P0)

This folder defines documentation-only contracts for a future PCRAM agent chain in `vlatam-ai-lab`.

## Current status

- Documentation-only.
- No runtime agents are implemented or authorized yet.
- No Antigravity execution is active in P0.

## Agent chain overview

Execution order for future approved orchestration:

1. Source Monitor
2. Snapshot Writer
3. Delta Analyzer
4. Evidence Writer
5. Human Review Gate

## Contract files

- `pcram-source-monitor.md`
- `pcram-snapshot-writer.md`
- `pcram-delta-analyzer.md`
- `pcram-evidence-writer.md`
- `pcram-human-review-gate.md`

## Conformance checklist

Before any future runtime proposal, reviewers must complete:

- `pcram-contract-conformance-checklist.md`

## Global forbidden actions

All PCRAM agent roles must not:

- Read `.env*` files.
- Handle or generate credentials.
- Connect to external services or production systems.
- Fetch external URLs, scrape websites, or use browser automation.
- Modify repositories outside `vlatam-ai-lab`.
- Commit or push without explicit human approval.

## Global safety rules

- Local-only inputs and outputs.
- Deterministic, auditable artifacts.
- Explicit assumptions and limitations.
- Mandatory human review gate before downstream action.
- Production integration remains disabled unless separately approved.

## Personalization-aware outputs

- Agents must not assume one-size-fits-all outputs.
- When profile context is available, agents should frame outputs by broker/user specialization, country or jurisdiction scope, topics of interest, and preferred information style.
- When no personalization profile is available, agents must state that outputs are generated from a general baseline profile.

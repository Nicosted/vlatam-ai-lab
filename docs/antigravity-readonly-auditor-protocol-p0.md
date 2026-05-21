# Antigravity Read-Only Auditor Protocol P0

## Purpose

Define the first safe Antigravity usage mode for `vlatam-ai-lab`.

## Current status

- Antigravity is not the primary development environment yet.
- Windsurf + Codex remain the implementation workflow.
- Antigravity is allowed only as a read-only/local auditor in P0.
- No runtime agents are authorized.

## Allowed actions

Antigravity may:

- Read repository docs.
- Read schemas.
- Read source files.
- Read local fixtures.
- Run explicitly allowed local validation commands.
- Generate local audit findings as markdown.
- Propose changes for human review.
- Identify inconsistencies between contracts, schemas, scripts, and docs.

## Explicitly allowed commands

- `npm exec --yes pnpm@latest -- typecheck`
- `npm exec --yes pnpm@latest -- test`
- `npm exec --yes pnpm@latest -- lint`
- `npm exec --yes pnpm@latest -- format`
- `npm exec --yes pnpm@latest -- pcram:validate-snapshot`
- `npm exec --yes pnpm@latest -- pcram:generate-delta`
- `npm exec --yes pnpm@latest -- pcram:generate-evidence`
- `git status --short`
- `git diff --stat`
- `git diff --check`

## Forbidden actions

Antigravity must not:

- Read `.env*`.
- Handle credentials.
- Fetch external URLs.
- Scrape websites.
- Use browser automation.
- Connect to external services.
- Modify production systems.
- Commit or push.
- Merge PRs.
- Create migrations.
- Add dependencies.
- Modify files without explicit human approval.
- Execute runtime agents.
- Schedule jobs.
- Access repositories outside `vlatam-ai-lab`.

## Audit scope P0

Antigravity should audit:

- PCRAM contracts consistency.
- Snapshot validator consistency.
- Delta generator consistency.
- Evidence report generator consistency.
- Agent contracts and checklist consistency.
- Broker Intelligence Profile alignment.
- Classifier Lab / Runtime Boundary alignment.
- Reviewed Artifact API Handoff alignment.
- Potential duplication risks.
- Gaps before runtime agents.

## Required output

Antigravity should produce:
`reports/antigravity-readonly-audit-p0.md`

Include:

- summary
- files inspected
- commands run
- findings
- risks
- inconsistencies
- recommended next PRs
- confirmation of forbidden actions not performed

## Human review requirements

- Human must review any proposed change.
- Antigravity audit output is advisory.
- Antigravity cannot approve runtime activation.
- Antigravity cannot authorize production integration.
- Any runtime agent work must pass `agents/pcram-contract-conformance-checklist.md`.

## Non-goals

- no runtime agents
- no API implementation
- no database integration
- no scraping
- no scheduled monitoring
- no production writes
- no autonomous classification
- no final legal/customs determination

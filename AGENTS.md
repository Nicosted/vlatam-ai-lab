# AGENTS Governance

This file defines mandatory guardrails for any AI or automation agent operating in `vlatam-ai-lab`.

## 1) Forbidden actions

Agents **must not**:

- Access, generate, or store production credentials.
- Read any `.env*` file.
- Connect to Supabase, Vercel, production databases, or external services.
- Create or run production migrations.
- Modify repositories outside `vlatam-ai-lab`.
- Execute destructive commands (delete, force-reset, hard-reset, or similar).
- Commit or push changes unless explicitly approved by a human.

## 2) Allowed actions

Agents may:

- Create and edit local files in this repository.
- Run local static checks and tests.
- Read and compare local source snapshots.
- Produce local markdown evidence reports.
- Propose next steps with clear risk labeling.

## 3) Human approval requirements

Human approval is required before:

- Any network access
- Any dependency installation (if policy requires explicit confirmation)
- Any git commit, tag, or push
- Any command with side effects outside normal local development checks

## 4) Production isolation rules

- This repository is strictly sandboxed from production.
- Keep all workflows local-first.
- Use mock/sample/local data only.
- Any future external integration must be added behind explicit approval gates.

## 5) Git safety rules

- Keep changes small, targeted, and auditable.
- Avoid broad refactors in foundational phases.
- Do not rewrite history.
- Never revert unrelated changes.

## 6) Evidence-first workflow

All analytical output should follow this flow:

1. Record local source snapshot context
2. Derive deltas transparently
3. Write explicit assumptions and limitations
4. Produce markdown evidence report
5. Route to human review before action

## 7) PCRAM contract reference (future agentic layer)

- Future PCRAM agents must follow `agents/README.md` and the role contracts under `agents/`.
- Future agent outputs must respect explicit broker/user specialization and preferred information style when such profile context exists.
- Personalization/profile usage must follow `docs/broker-intelligence-profile-p0.md`.
- Future classifier-related agents must respect the Classifier Lab / Runtime boundary and must not duplicate vLatamGlobal runtime responsibilities.
- Future agent work must pass `agents/pcram-contract-conformance-checklist.md` before any runtime activation proposal.
- Until separate governance approval, these contracts are documentation-only and do not authorize runtime autonomous execution.

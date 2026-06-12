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
- Future API handoffs must expose reviewed artifacts only and must not expose raw internal agent state.
- P1 runtime/API work must not start until required schemas are defined, tested, and reviewed.
- Antigravity usage is limited to the read-only auditor protocol until a separate runtime-agent approval exists.
- Antigravity audits must declare the command profile used before running validation commands.
- Future agent work must pass `agents/pcram-contract-conformance-checklist.md` before any runtime activation proposal.
- Until separate governance approval, these contracts are documentation-only and do not authorize runtime autonomous execution.

## 8) Graphify memory layer guidance

- Graphify, when locally available, is a repository/documentation memory aid for Codex and future local operators.
- Codex should query Graphify before broad grep/file-reading when answering architecture, contract, schema, or artifact-flow questions, then verify the cited files directly.
- Graphify output is not a regulatory source of truth, approval mechanism, production dependency, or vLatamGlobal runtime bridge.
- Graphify must not read `.env*`, credentials, local caches, private raw dumps, or unreviewed source imports.
- Graphify refreshes must follow `.graphifyignore` and the workflow in `docs/graphify-ai-lab-memory.md`.
- Generated graph files require human review for secret leakage and source-of-truth boundary preservation before commit.

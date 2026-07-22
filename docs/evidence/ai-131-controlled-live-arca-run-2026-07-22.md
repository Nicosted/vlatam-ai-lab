# AI-131 Controlled Live ARCA Run evidence

Date: 2026-07-22
Branch: `feat/ai-131-controlled-live-arca-run`
Baseline: `edc39159ccd084b4a6e12941ecbce40d24d7792f`

## Baseline and preconditions

- Remote is `https://github.com/Nicosted/vlatam-ai-lab.git`; work began on clean `main` after `git fetch origin`.
- Local `main`, `origin/main` and `HEAD` exactly matched `edc3915`.
- PR #125 was merged at `edc3915`; this is AI-130 and includes its durable crash journal.
- AI-118/119/120 acquisition controls, AI-126 ingestion/parser, AI-127 review contracts, AI-128 builder and AI-130 store were directly verified.
- Only root `AGENTS.md` applies. No `graphify-out/graph.json` existed, so no graph output was fabricated.

## Implemented boundary

`closed proposal → independent authorization → exact bindings → kill-switch reread → atomic consumption → one governed fetch → immutable acquisition → AI-126 candidate → AI-130 record_candidate → review required`

The runner cannot create a review, evaluation, Approved Artifact, export, publication, scheduler, deployment or production authorization. Repository-current execution is blocked.

## Contract versions and file hashes

All contracts are closed Draft 2020-12 schemas at `1.0.0`:

| Contract           | File SHA-256                                                       |
| ------------------ | ------------------------------------------------------------------ |
| Proposal           | `6a30174a838f72b53472f8cec106aee7584b0dabb316ce289919042924694854` |
| Authorization      | `4a26d06b78e7c562bb1e1c401055ec600cd8d4580fdff9e1c46c11e96dc764c7` |
| Kill switch        | `8ca8143abf7b2e20c4414b0a8dcf56740c4a0ddf58a2af83d1027b063c4f54d7` |
| Result             | `7c3c921690d5e4adc456e89da8a0617b904683c2683ab756e817f22d18d2accf` |
| Crash journal      | `033180020205770a436fee623fc82076cdfcf36935cc4588c7c253329ceb84bf` |
| Durable run record | `404e7f31aa103bca1b2c7cf16f7d18ac12693d24f061b3f4c72d30ade66c1d63` |

Governed acquisition policy hash: `9d3b61ad4b374c83f783bac5f861795aec9e4cabbe92fde07002381677cf4280`.
AI-130 durable-store configuration hash: `1e3361cef3869214eee6488a9a6a341aa89a5a9052e735c5b95669a3d3a6c086`.
Repository kill-switch semantic hash: `049959fe2bb74aa9e1aa40cb75ac264a52c3a0fc1431fafe8be1a82fe17ea8e1`; checked-in file hash: `7955cb6b43139c7ab17e3dfe88cd95e09a73e3c35cebfd646d87b64e478979e1`.

## Repository-current blocked state

- Kill switch: valid, active, `live_execution_blocked: true`.
- Live authorization: absent; positive authorizations exist only in ephemeral synthetic tests.
- Consumed authorization, live run, real acquisition and live candidate: absent.
- Environment variables, CLI flags and query parameters cannot disable the switch.
- No root configuration containing workstation paths is checked in.

## One-shot and crash semantics

The journal is created before the exclusive `wx` authorization-consumption record. Consumption binds proposal, authorization, URL, run and attempt. Exactly one competing process wins. Consumption does not claim transport occurred. The kill-switch file is reread after consumption and immediately before the transport boundary. The acquisition call is passed a hard limit of one network call and zero retry.

| Crash point                         | Recovery                                                                |
| ----------------------------------- | ----------------------------------------------------------------------- |
| Before consumption                  | Abort safely; zero network calls.                                       |
| After consumption, before transport | Fail closed; explicit operator recovery required.                       |
| Transport started, outcome unknown  | `delivery_unknown`; never retry automatically.                          |
| Acquisition persisted               | Revalidate exact metadata/raw hashes; run AI-126 locally without fetch. |
| Candidate created                   | Load exact candidate/hash; run AI-130 persistence without fetch.        |
| Candidate durably persisted         | Converge journal to completed without fetch.                            |

## Result precedence

Closed proposal/hash and exact source precede configuration/policy binding; closed authorization/hash and proposal/source/policy binding precede timestamps and duties; expiry/window and separation precede kill-switch validation; root safety and unconsumed state precede any write. During execution, journal publication precedes consumption, final kill-switch validation precedes transport, and acquisition/ingestion/durable-store failures retain their explicit lifecycle and false authority fields.

## Validation evidence

Focused validation uses injected `Response` objects only. Success, redirects, size, media type, timeout-shaped abort, transport failure, competing consumption and crash recovery tests instrument call counts. No test calls the real ARCA source.

- Focused AI-131 plus acquisition, AI-126/127/128 and AI-130 regressions: **112/112 passed**.
- Full repository suite: **1207/1207 passed** across **259** top-level test groups and **153** suites.
- Typecheck and build: passed.
- Scoped ESLint and Prettier for every changed TypeScript/document/schema/config file: passed with zero findings.
- Strict closed-schema compilation and unknown-field rejection: passed.
- `git diff --check`: passed.
- Exact real external HTTP calls during implementation and validation: **0**.

## Known limitations and pre-existing debt

- This is a single-host local-filesystem one-shot protocol, not distributed consensus.
- A consumed authorization with unknown transport delivery requires human inspection and cannot be automatically retried.
- The active kill switch and absence of a reviewed root configuration intentionally make repository-current live execution impossible.
- Repository-wide pre-existing debt remains **42 ESLint errors** and **193 Prettier-unformatted files**. No changed AI-131 file is in either set.

## Next steps

Exact next operational step: after merge, prepare a separately reviewed root configuration and proposal, obtain independent human authorization and separately authorize one one-shot evidence run. Exact next implementation PR: **AI-132 Governed Export Boundary**.

No live request occurred. No real authorization was created, no kill switch was disabled, no review/evaluation/Approved Artifact was created, and nothing was exported, published, scheduled, deployed, sent to production or connected to `vlatam-global`.

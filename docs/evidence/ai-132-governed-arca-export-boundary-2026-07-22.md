# AI-132 Governed ARCA Export Boundary evidence

Date: 2026-07-22
Status: implemented locally; human review required; repository-current export blocked.

## Baseline and preconditions

- Repository: `Nicosted/vlatam-ai-lab`.
- Baseline branch: `main`, clean and exactly equal to `origin/main` after fetch.
- Baseline commit: `90a9df65b350a6e094441bdc4324e4256531a1ec`.
- PR #126 is represented by baseline commit `90a9df6`, `feat(ai): add controlled live ARCA run boundary (#126)`.
- AI-126 candidate, AI-127 review/evaluation, AI-128 Approved Artifact,
  AI-130 durable store and AI-131 controlled live-run boundaries were present.
- Implementation branch: `feat/ai-132-governed-arca-export-boundary`.

## Boundary and contracts

The only data flow introduced is:

`exact AI-128 Approved Artifact + read-only AI-130 verification + independent one-shot authorization → canonical immutable JSON package → reviewed local handoff root`

All new contracts are closed Draft 2020-12 contracts at version `1.0.0` and
use domain-separated canonical SHA-256 identities:

| Contract                     | Schema hash                                                        |
| ---------------------------- | ------------------------------------------------------------------ |
| Export proposal              | `f1e5fc3816cc43529a9bf4b0721be6ae1fbe43f54447b1198428fe3259af1b9a` |
| Export authorization         | `8baa4dff8df1be4abf915db9901bdcccb98a974ec633a7ea37e589732ea6785f` |
| Export package               | `eeb9b60143605d605d576b7390bfd3c82e66e84644f9d20a6b0fc87538baa98f` |
| Export result                | `b1f436e636c8901253faefa32700c774a28f9f7777bdd505a2e92c46347328fd` |
| Durable export record        | `e092dcd7f7ddc69149fca487733a80286c7b5318e057dcc86f88e5a70bfc82cb` |
| Export journal               | `95b2baeba706ca15105842b5e0ab4e109ce793788660bc57e382e1872f93ec66` |
| Dedicated export kill switch | `22734b3c6db30dee39b7e36db1719bee8eeb4a79174c83a89fe58d1ce9a056a9` |
| Reviewed root configuration  | `766389e7a8b60da0ebbda4ab86b9095c28301253d7c16c03f0ad89289f4f7594` |

Exporter configuration hash:
`dd8044fcd8ed436ccbee7e6cc58f219267537508add238048cce52891beafac4`.

Repository-current active kill-switch artifact hash:
`5279e0fd3ae7a6526f5638565f2fde7bae17becc61b519277567edebd6c42b2b`.

## Exact package format and durable proof

The sole format is `vlatam-arca-approved-tariff-json@1.0.0`. Canonical key
ordering and a trailing newline define package bytes. The package carries
complete acquisition/parser provenance, exact candidate/review/evaluation and
AI-130 event bindings, and an exact structured clone of
`ApprovedArcaArtifact.approved_payload`. No reparsing, interpretation,
summarization, enrichment, classification or model call occurs.

The consumer can verify package identity, payload hash and provenance from the
package and published schema set without reading AI LAB store paths. Source
eligibility requires the authoritative AI-128 validator, a complete AI-130
immutable event chain, exact source records, a recomputed matching projection,
the exact artifact persistence event and no AI-130 journal or operation lock.

## One-shot semantics and outcome precedence

Validation precedence is proposal → export window → authorization →
authorization time → exact authorization binding → reviewed configuration →
kill switch → root/recovery/consumption state → AI-130 integrity → AI-128
artifact and exact bindings → separation of duties → deterministic package and
collision checks. Execution journals the exact plan before atomically creating
the authorization consumption record. Only one competing `O_EXCL` write wins;
the package and record use no-overwrite publication and accept idempotency only
for identical bytes.

## Crash recovery matrix

| Observed stage                    | Recovery                                                            |
| --------------------------------- | ------------------------------------------------------------------- |
| Before consumption (`prepared`)   | Safe abort; no package is produced automatically.                   |
| After consumption, before package | Publish only the exact journal-sealed package bytes locally.        |
| Package visible, record absent    | Verify identical package bytes and publish the exact sealed record. |
| Record visible                    | Verify exact bytes and converge the journal to completed.           |
| Unknown, malformed or divergent   | Fail closed; never create a replacement or second package.          |

## Repository-current blocked state

The dedicated export kill switch is active. There is no real export
authorization, consumed authorization, export package, durable export record,
import acknowledgment or `vlatam-global` change. Positive authorization and
Approved Artifact cases exist only as synthetic test data in temporary roots.

## Validation and instrumentation

- Focused AI-132 tests: **11/11 passed**.
- Combined AI-128/130/131/132 focused regressions: **58/58 passed**.
- Full repository suite: **1,218/1,218 passed**. An initial sandboxed
  attempt had two `tsx` IPC permission failures; the approved local rerun
  outside that socket restriction passed completely.
- TypeScript build and typecheck: passed.
- Scoped ESLint and Prettier: passed for every changed implementation,
  test, contract, configuration and documentation file.
- Network instrumentation: the export module imports no transport and executes
  no `fetch`; exact real external network calls during validation: **zero**.
- Repository-wide pre-existing debt remains exactly **42 ESLint errors** and
  **193 Prettier-unformatted files**; no AI-132 changed file is in either set,
  and AI-132 does not repair unrelated debt.

## Limitations and next steps

- No actual repository-current Approved Artifact exists, so no operational
  export is possible or fabricated.
- The package is only a local handoff artifact; consumer import and
  acknowledgment are intentionally absent.
- Exact next implementation PR: **AI-133 Scheduler, Locking and Recovery**.
- Exact next operational step: **one reviewed local export evidence package
  only after an actual Approved Artifact exists**.

No import, publication, deployment, scheduling, production reliance, external
transfer, database write, credential access or `vlatam-global` access was
authorized or performed.

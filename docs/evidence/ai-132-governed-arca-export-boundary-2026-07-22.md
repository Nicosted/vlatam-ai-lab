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
| Export package               | `b898da91e6b8be8aa8e05549b94fdd24bf68747fd7bb718de1f51e2af55975e7` |
| Export result                | `b1f436e636c8901253faefa32700c774a28f9f7777bdd505a2e92c46347328fd` |
| Durable export record        | `e092dcd7f7ddc69149fca487733a80286c7b5318e057dcc86f88e5a70bfc82cb` |
| Export journal               | `a168cc1df3d70b0293a5859abfaeb116f7b02da96e4af169ef213ae71c2d7c08` |
| Dedicated export kill switch | `22734b3c6db30dee39b7e36db1719bee8eeb4a79174c83a89fe58d1ce9a056a9` |
| Reviewed root configuration  | `766389e7a8b60da0ebbda4ab86b9095c28301253d7c16c03f0ad89289f4f7594` |

Exporter configuration hash:
`1f26a84fe1c10b7c3b351eb72d74fdf53bcfdd222bdb764e1d2465d1f63f1d3d`.

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

Recovery precedence is exact root configuration and journal integrity → exact
expected consumption reconciliation → exact visible package validation →
journal-bound reviewed kill-switch hash/path validation and file reread →
missing package publication only after a final immediate switch reread → exact
durable record completion. Recovery never creates, replaces or rewrites
consumption and never publishes a package or record while the switch blocks.

## Crash recovery matrix

| Observed state                                   | Recovery                                                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `prepared`, consumption absent                   | Safe abort before consumption; no package or record.                                                                       |
| `prepared`, exact sealed consumption visible     | Treat as consumed, validate the exact reviewed switch/root bindings, then continue exact-byte recovery.                    |
| Later stage, consumption missing or divergent    | Fail closed; never recreate, rewrite or replace consumption.                                                               |
| Consumed, package absent                         | Require the exact journal-bound reviewed disabled switch and reread its exact file immediately before package publication. |
| Package visible, record absent                   | Verify exact package bytes and switch authority, then complete only the exact sealed local durable record.                 |
| Record visible                                   | Verify exact package/record bytes and converge the journal to completed.                                                   |
| Active/missing/malformed/substituted switch      | Return `kill_switch_active`; consumption remains consumed and no missing package or record becomes visible.                |
| Unknown, malformed or divergent journal/evidence | Fail closed; never create a replacement consumption, package, or second durable record.                                    |

## Repository-current blocked state

The dedicated export kill switch is active. There is no real export
authorization, consumed authorization, export package, durable export record,
import acknowledgment or `vlatam-global` change. Positive authorization and
Approved Artifact cases exist only as synthetic test data in temporary roots.

## Validation and instrumentation

- Focused AI-132 tests: **17/17 passed**.
- Combined AI-128/130/131/132 focused regressions: **64/64 passed**.
- Full repository suite: **1,224/1,224 passed** in the approved local run
  outside the sandbox's `tsx` IPC socket restriction.
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

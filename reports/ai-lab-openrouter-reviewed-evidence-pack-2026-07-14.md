# OpenRouter reviewed external-evidence pack — 2026-07-14

## Snapshot and scope

- Baseline: `main` at `cb6038d3fbf112c833b5ae657ba5be7909441685`
  (`feat(governance): add OpenRouter readiness dossier (#102)`), matching the
  local `origin/main` ref with a clean pre-task worktree.
- Branch: `feat/ai-lab-openrouter-reviewed-evidence-pack`.
- Candidate: `minimax/minimax-m2.7` → variable OpenRouter route → upstream
  provider identity `minimax`, exact endpoint/model revision unknown → model
  entry `openrouter.minimax-m2.7.variable.v1@1.0.0` → route record
  `openrouter.minimax-m2.7.variable-route.v1@1.0.0` → absent profile candidate
  `openrouter.minimax-m2.7.normative-extraction.candidate` → capability
  `evidence.extraction.normative_claims`.
- Collection boundary: public official documentation only. No provider API,
  model inference, key/account metadata, environment variable, secret,
  gateway, adapter, migration, persistence, or production access occurred.

## Implementation

Contract `1.0.0` adds a closed schema, deterministic TypeScript validator,
18 normalized external-evidence records, record-level and pack-level
domain-separated SHA-256 hashes, exact dossier/registry/capability bindings,
conflict references, re-review dates, and an immutable fail-closed evaluation.

Every readiness-dossier evidence section now resolves an
`externally_reviewed_evidence` reference from the pack. The dossier evaluator
checks record existence, locator, hash, category, and exact candidate identity.
This integration does not promote any collected record to verified and does
not change execution state.

## Authoritative source hierarchy used

1. [OpenRouter model/provider metadata](https://openrouter.ai/minimax/minimax-m2.7/providers)
2. [OpenRouter provider routing documentation](https://openrouter.ai/docs/guides/routing/provider-selection)
3. [OpenRouter ZDR documentation](https://openrouter.ai/docs/guides/features/zdr)
4. [OpenRouter data-collection documentation](https://openrouter.ai/docs/guides/privacy/data-collection)
5. [OpenRouter provider-logging documentation](https://openrouter.ai/docs/guides/privacy/provider-logging)
6. [OpenRouter errors documentation](https://openrouter.ai/docs/api/reference/errors-and-debugging)
7. [OpenRouter terms](https://openrouter.ai/terms/)
8. [MiniMax model release notes](https://platform.minimax.io/docs/release-notes/models)
9. [MiniMax text-model documentation](https://platform.minimax.io/docs/guides/text-generation)
10. [MiniMax M2.7 release statement](https://www.minimax.io/news/minimax-m27-en)
11. [MiniMax API privacy policy](https://platform.minimax.io/protocol/privacy-policy)
12. [MiniMax terms](https://platform.minimax.io/protocol/terms-of-service)

## Evidence summary

No item is marked `verified`: explicit human reviewer identity and timestamp are
intentionally absent. “Collected” below means an official source and normalized
fact are integrity-bound, not human-approved.

| Class                    | Claims                                                                                                                                                                                                                                                             | Current state                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| Verified                 | None                                                                                                                                                                                                                                                               | Human evidence review not performed |
| Collected but unverified | Exact OpenRouter slug; MiniMax attribution/release; 204,800-token upstream context; normalized tool/response-format declarations; multi-provider routing controls; router content/metadata handling; conditional ZDR controls; terms; error/usage/routing metadata | `unverified`                        |
| Conflicting              | Aggregate headline price versus provider-specific input/output/cache rates                                                                                                                                                                                         | `conflicting`                       |
| Missing                  | Exact immutable endpoint/model revision; exact-route strict JSON Schema reliability; relevant reviewed benchmark for normative-claim extraction                                                                                                                    | `missing` or unproven               |
| Human decisions          | Evidence verification; exact provider/route acceptability; privacy/security and ZDR; legal/commercial/export review; benchmark/gold-set acceptance; final dossier approval                                                                                         | pending                             |

## Readiness re-evaluation

The repository dossier remains `blocked`. Deterministic hard blockers continue
to include conflicting pricing and unresolved mandatory risks. Incomplete
evidence also remains for exact upstream routing, strict JSON Schema behavior,
privacy/retention/training/ZDR/geography, capability benchmarking, legal review,
and named human approval. The result still reports
`execution_authorized: false` and `provider_call_performed: false`.

## Metadata-only sandbox budget proposal

- maximum requests: 10;
- maximum input tokens per request: 8,000;
- maximum output tokens per request: 2,000;
- maximum total spend: USD 0.05;
- permitted model: `minimax/minimax-m2.7`;
- intended upstream provider identity: `minimax` (not yet provably pinned);
- fallback: forbidden;
- automatic retries: zero;
- invocation: manual only;
- expiry: `2026-08-13T12:00:00.000Z`;
- kill switch: required.

This is pack metadata, not active budget-governor or runtime configuration.

## Validation evidence

The ordered local validation completed as follows:

| Step                                                        | Command                                                                                                                                                              | Result                                                                                                         |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Focused evidence pack                                       | `node --import tsx --test tests/providers/openrouter-external-evidence-pack.test.ts`                                                                                 | 22/22 tests passed                                                                                             |
| Dossier and evidence readiness                              | `node --import tsx --test tests/providers/openrouter-readiness-dossier.test.ts tests/providers/provider-evidence.test.ts tests/providers/provider-readiness.test.ts` | 44/44 tests passed                                                                                             |
| Registry/resolver/authorization/gateway/schema/architecture | `node --import tsx --test` with the 11 scoped test files listed in the task log                                                                                      | 171/171 tests passed                                                                                           |
| Typecheck                                                   | `npm run typecheck`                                                                                                                                                  | passed                                                                                                         |
| Build                                                       | `npm run build`                                                                                                                                                      | passed                                                                                                         |
| Scoped ESLint                                               | `./node_modules/.bin/eslint` on the four changed TypeScript test/source files                                                                                        | passed, zero findings                                                                                          |
| Scoped Prettier                                             | `./node_modules/.bin/prettier --check` on all task files                                                                                                             | passed                                                                                                         |
| Full suite                                                  | `node --import tsx --test tests/**/*.test.ts`                                                                                                                        | 880/880 tests passed, 134 suites                                                                               |
| Repository ESLint baseline                                  | `npm run lint`                                                                                                                                                       | expected baseline failure: 43 pre-existing errors in unrelated crawler/validation files; no task file reported |
| Repository format baseline                                  | `npm run format`                                                                                                                                                     | expected baseline failure: 198 pre-existing warnings; no task file reported                                    |
| Whitespace                                                  | `git diff --check`                                                                                                                                                   | passed                                                                                                         |

The first sandboxed full-suite attempt reported two failures because nested
`pnpm`/`tsx` CLI tests could not create a local IPC socket (`EPERM`). The exact
suite was rerun outside that filesystem sandbox and passed 880/880; no source
change was made to obtain that result.

Focused coverage includes schema validation, source metadata/type, reviewer
and expiry gates, integrity tampering, duplicate IDs, conflicts, candidate
binding, wrong model/provider, bounded variable pricing, routing variability,
conditional ZDR, upstream privacy conflict, strict JSON Schema uncertainty,
irrelevant benchmarks, legal review, deterministic hashing/evaluation,
immutability, absent approval, disabled runtime identities, and forbidden
environment/network/gateway/adapter access.

## Limitations and required review

### Later proposal status

The separate sandbox-enablement proposal now binds this pack's exact version
and hash. Its deterministic repository outcome is `blocked`; the proposed
execution profile is disabled and proposal-only. This status update does not
verify, approve, or alter any evidence record and grants no runtime authority.

- Public page contents were normalized but not vendored; a reviewer must
  retrieve the canonical URLs before assigning `verified`.
- OpenRouter endpoint availability, provider offers, prices, ZDR labels, and
  policies are mutable and require short re-review intervals.
- The MiniMax privacy/terms pages do not prove applicability to every
  third-party OpenRouter hosting provider.
- No account, guardrail, allowlist, ZDR, logging, region, or provider settings
  were inspected or changed.
- No model call was used to test structured extraction, citation grounding,
  schema conformance, latency, or reliability.
- The pack is not legal, privacy, security, compliance, provider, or dossier
  approval.

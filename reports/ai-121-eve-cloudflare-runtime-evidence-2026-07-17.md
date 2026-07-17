# AI-121 Timestamped Eve and Cloudflare Runtime Evidence

Date: 2026-07-17

Branch: `feat/ai-lab-eve-cloudflare-runtime-evidence`

Baseline: `main` and refreshed `origin/main` both `7cbfad95cf3b0d080e97dc8074c10d79fb02f550`; branch merge-base is the same commit. Initial worktree was clean. AI-120 architecture was present. Eve and Cloudflare were `discovered`, disabled, unapproved and kill-switched; native remained disabled and kill-switched.

## Scope and method

This iteration captured public unauthenticated official evidence, normalized findings, computed SHA-256 hashes, added closed contracts/fixtures, updated assessments and policy, and extended the read-only Operator projection. No package was installed and no vendor runtime, API, account or model was executed. Mutable documentation is explicitly limited and expires for re-review. Repository evidence is commit/release pinned where available.

Operator Read Model `1.3.0` adds only runtime-evidence freshness/count/gap/confidence/blocker projections. It exposes no write action.

Hashes are SHA-256 over the canonical normalized capture (URL, version/SHA, normalized findings and limitations), domain-separated by `vlatam-ai-lab:runtime-evidence:v1`. They are evidence-integrity hashes, not claims that mutable upstream bytes can never change.

## Evidence packs

| Candidate                   | Observed version | Sources | Immutable | Mutable | Pack hash                                                          |
| --------------------------- | ---------------: | ------: | --------: | ------: | ------------------------------------------------------------------ |
| Vercel Eve                  |         `0.24.6` |       6 |         5 |       1 | `e8ce4bfc1bfac8f9908d5eae7444ddc6886dd79bc9bb1d6523864e37818103d1` |
| Cloudflare Agents/Workflows |         `0.17.4` |      13 |         2 |      11 | `61ccf95429c0b11b4d37f4e52bd7408d1c15ff2fd3cbbd57c25eb60edb214cd6` |

Retrieval timestamp: `2026-07-17T12:01:09Z`. General mutable-source review expiry: `2026-08-16T12:01:09Z`; Cloudflare Workflows pricing expires `2026-08-09T00:00:00Z`, before the announced billing change.

## Public sources and normalized hashes

### Eve

| Source                                                   | Class                                          | Hash                                                               |
| -------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| Pinned README `f7c69b1a2ad044a6ba89db7bb6241c469d3ef101` | immutable repository                           | `37c0757f5bd2b7e0a355478af749f898344bc89c62c2587c1c1e3b5d7fbdb224` |
| Pinned package metadata `0.24.6`                         | immutable package/repository                   | `4ed6b214bc0506505aebdaa64aafb69154ba416fae0fd56246d054b9b5105b54` |
| Pinned Apache-2.0 license                                | immutable license                              | `321b8fb7bb906aa383e6e800c1e02bc56fbd2961e98765d41d6fe160c7189c4f` |
| Pinned sessions/runs/streaming contract                  | immutable repository docs                      | `0077c8b003974247e5a517fd97eab17a7b3cade6beb3552f25f7ae603098bf14` |
| GitHub release `eve@0.24.6`                              | immutable release                              | `5207cb2c12df03b5c55ed4d216c827b2413ce4b2cb114b550bbaa583dea85ce7` |
| Introducing Eve                                          | mutable official documentation/launch material | `3752a28ba650a310f4068fb34c73a425f74f11d80a20a56521f2389f8f8a3a46` |

### Cloudflare

| Source                                                                      | Class                  | Hash                                                               |
| --------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------ |
| Agents repository/release commit `03cdc828c0bc3c6bb1d9aa636bb46ceb00a4e0ea` | immutable repository   | `db08324323cd6ba5e83c6dc7b6689e57de75fd366b72652aa157986152c7d6ed` |
| `agents@0.17.4` release                                                     | immutable release      | `ff250f95a3de9a7286d16aefa721f46f5f9771327dd38593b392958bdc58a766` |
| Agents overview                                                             | mutable docs           | `b91174eef98a00d6cb654a9f60ece8170c3052221b75ae943f0f8a569e6bcc47` |
| Agents observability                                                        | mutable docs           | `feb43bf7e43debc230d75008a65d75f611929110894529c6d7b4bcb1354e02be` |
| Agents human-in-the-loop                                                    | mutable docs           | `d48c0034919472e61e5cc217e0e62e3c22900737dfa5da82c0c5186a977601fb` |
| Workflows overview                                                          | mutable docs           | `fff563b5daa26688074cd2dff8ed3f299bb22f23e11e22b2cc43a17e3236ace7` |
| Rules of Workflows                                                          | mutable docs           | `1b95c63c288b819f9821e864005287db78dfeb0f3ad4f32503231a69b6d07f7c` |
| Workflows limits                                                            | mutable docs           | `8fe6a5f035b0f9d90aaf8c92f6d75fa395ea983f7cd8c851af066f667e21e6af` |
| Workflows pricing                                                           | mutable docs           | `e381eaf71cb46690ea735b42b50f4d501bb1476baf00f67d3059d8ff88016bf5` |
| Durable Objects overview                                                    | mutable docs           | `8bb876794bda561ae96daf5328d2da6d2a58df4df0737be2d50c76220cbd3745` |
| Durable Objects data location                                               | mutable docs           | `25eeed6fa24a01d66b9622817c3f363fa173a857ea35b8fca47ddefec66e84db` |
| Durable Objects pricing                                                     | mutable docs           | `39ffb3298910cbe8de8494cdffe0d4d090862fdf87f8ba218d2362201e32d58b` |
| Workers AI overview/pricing/JSON/data-use bundle                            | mutable inference docs | `513255a3dd7928829de0ffad459300fa5e37d3ed35defa6dd929c8d9241ee9a8` |

## Eve findings

Eve is filesystem-first and publishes instructions, tools, skills, channels, schedules and subagents. The package requires Node 24+, exports eval/instrumentation and Vercel/Docker/microsandbox/just-bash sandbox surfaces, and depends on beta Workflow packages. The session protocol documents continuation tokens, run/session IDs, durable replay/reconnect, structured results, authorization events, usage and recursive cancellation. The README explicitly labels Eve beta; API stability and production readiness are not established.

## Cloudflare findings

Agents are Durable Objects with persistent per-object state, local SQL, WebSockets, scheduling, MCP, model integration and documented subagents. Workflows supply retryable persisted steps, waits, external events and lifecycle operations. Durable Objects provide single-threaded coordination, strong per-object storage, alarms, hibernating WebSockets and scoped jurisdiction controls. Published limits and pricing surfaces are sufficient for architecture-level costing, not exact AI LAB run reconciliation. The `0.x` SDK is evolving rapidly.

Workers AI is recorded only as inference. Its catalog and pricing are mutable. JSON Mode is model-specific and can fail schema satisfaction. Data-use statements apply to Workers AI and do not automatically cover every provider Agents may call.

## Runtime event mapping

Eve provides direct documented matches for most AI-120 events. Exceptions are `subagent_started` (`subagent.called` is inferred), usage embedded in `step.completed`, and three implementation-specific failure scopes. Cloudflare mappings are mostly inferred, undocumented or component-specific; no equivalence is fabricated. The full 17-event mappings live in both packs.

## Privacy, cost and portability

Eve reasoning events are a critical blocker. AI LAB adapters must disable/redact them and never persist private reasoning or chain-of-thought. Cloudflare reasoning availability/retention is unknown and therefore also cannot be persisted. Durable Object jurisdiction does not constrain all request/logging locations.

Eve exposes usage but no complete cross-component cost contract. Cloudflare publishes useful request/CPU/step/storage units, but exact per-session attribution across Workers, Durable Objects, Workflows, inference and external providers is incomplete.

Eve has local adapters but significant Vercel coupling; portability is unproven. Cloudflare Agents materially depends on Workers/Durable Objects/Workflows and has low runtime portability without reimplementation.

## Historical Cloudflare lineage

The 2026-06-15 audit is `historical`; the pipeline plan and setup guide are `retired`; retained mocked Workflow code is `insufficient` as public platform evidence. Nothing was deleted.

## Lifecycle recommendation and blockers

Both candidates remain `discovered`. Evidence is sufficient for architecture assessment and insufficient for activation. Independent review, legal/privacy review, security review, exact cost contract, sandbox isolation evidence and runtime conformance gold cases remain required. Vendor evidence cannot self-approve.

## Validation results

- Focused runtime evidence/tournament/Operator/architecture tests: **56 passed, 0 failed, 7 suites**.
- Full suite: **1,048 passed, 0 failed, 150 suites**.
- Typecheck: passed (`pnpm typecheck`).
- Build: passed (`pnpm build`).
- Scoped ESLint for every changed TypeScript file: passed.
- Scoped Prettier for new/replaced TypeScript, JSON, schema, assessment, ADR, roadmap and report files: passed. The pre-existing privacy document remains part of the repository-wide formatting baseline; the added section follows its wrapped style.
- Repository JSON parse: **394 JSON files valid**.
- New schema compilation and both evidence packs: passed in strict Ajv 2020 mode.
- Architecture checks: passed in the focused and full suites; the evidence module has no transport, secret, environment, deployment, authorization-store or budget-ledger dependency.
- `git diff --check`: passed.
- Credential scan: no credential value found; two pre-existing credential variable identifiers in the privacy audit remain documentation only.
- Absolute-path scan: passed.
- Binary/PDF scan: all changed files are text/JSON/TypeScript; no binary or PDF added.
- Reasoning-content scan: only event identifiers, risks and prohibition policy are present; no reasoning payload or chain-of-thought content is captured.
- Activation scan: all registered candidates remain `enabled: false` with active kill switches; Eve and Cloudflare remain `discovered`.
- Live-endpoint/external-mutation scan: no transport, deployment, authorization-store or budget-ledger call exists in the changed executable surface.

Repository-wide `pnpm lint` remains blocked by **43 pre-existing errors** in crawler/legacy validation files outside AI-121. Repository-wide `pnpm format` reports **191 pre-existing findings** outside the AI-121 surface. These known baseline failures were not expanded into unrelated cleanup.

## Explicit non-activation statement

No runtime, agent, model, provider, endpoint, inference gateway, adapter, budget, authorization, traffic stage or external action was activated. No inference occurred. No authenticated endpoint, secret, production/customer data or external account was used. No dependency was installed. No runtime was deployed. No candidate moved beyond `discovered`; all kill switches remain active. `vlatam-global` was not accessed or modified. Nothing was staged, committed, pushed, merged or submitted as a pull request.

## Exact next step

Route the two evidence packs and assessments to an independent human evidence reviewer. Do not stage or commit until fresh explicit approval is provided. After review, resolve the reasoning/privacy, security/legal, cost and conformance gaps before proposing any separately approved synthetic sandbox runner.

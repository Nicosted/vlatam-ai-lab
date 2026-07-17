# AI-120 Continuous Runtime Tournament Evidence Report

Date: 2026-07-17

Branch: `feat/ai-lab-continuous-runtime-tournament-architecture`

Baseline commit: `15334caae6c7f385c2e2baf4e8ef7e33d7c1b900` (`feat: add GLM Fireworks endpoint evidence (#114)`)

Scope: local architecture, contracts, schemas, fixtures, read-only projection, documentation and tests only.

## Inspected repository state

The root `AGENTS.md` was read first. Graphify was checked as required; `graphify-out/graph.json` and the wiki were absent, so no graph result was fabricated and direct inspection was used. Inspected sources included the architecture/capability/evaluation/gateway/privacy/budget documents; benchmark and routing contracts; lifecycle/authorization store; provider evidence/registries and current OpenRouter reports; Operator read model/schema/tests; Cloudflare historical audit/plan; schema registry; capability catalog; fixtures; and architecture boundary tests. No `.env*` file was read.

The baseline was a clean worktree. Existing safety posture at inspection time: governed gateway only; OpenRouter disabled/fail-closed; GLM and MiniMax blocked; sandbox runtime/budget disabled; kill switch active; no authorization policy issued or consumed.

## Delta and contracts

AI-120 adds contract version `1.0.0` for runtime candidate, inference gateway candidate, model candidate, provider endpoint candidate, tournament execution profile, benchmark case selection, normalized runtime event, tournament run, candidate result, daily tournament report, weekly tournament review, promotion decision and regression decision. JSON Schemas are closed and registered. One valid fixture bundle covers every contract, and a named invalid bundle covers all requested negative cases.

Runtime, inference gateway, model and provider endpoint are separate identities. An execution profile binds their exact IDs and versions for one capability and traffic stage. `ai-lab-native`, `vercel-eve`, and `cloudflare-agents-workflows` are registered only as disabled runtime candidates. All three are unapproved, kill-switched and benchmark-ineligible.

The normalized event vocabulary covers session/turn/step/action/input/authorization/subagent/structured-result/usage/wait/completion/cancellation/failure events. Its schema has no prompt, output, document or reasoning-content field. Reasoning capture defaults to disabled; normalized events permit only disabled/redacted metadata. An approved concise summary would require a separate approval ID and evidence artifact.

## Lifecycle, operation, scoring and cost

Lifecycle transitions are explicit in code, require independent human approval plus evidence, and reject skipped/unknown transitions. Traffic stages run from synthetic-only through shadow/canary/approved/preferred/fallback, with no automatic 100% allocation.

The daily architecture binds an immutable sentinel/rotating slice, deterministic isolated fan-out, equivalent input/policy, idempotency, bounded retries/timeouts, normalized results/events, schema/tool/privacy/ZDR checks, latency/reliability, exact cost reconciliation, evidence lineage and human review. Critical privacy, authorization, safety, evidence or incorrect external-action failure disqualifies instead of lowering an average.

Weekly review produces independent quality, value, reliability, privacy/governance and capability-specific rankings. The weekly contract fixes `universal_winner` to false. Daily benchmark, weekly exploration and monthly provider-validation budgets are separate hard limits; exhaustion blocks continued applicable work. AI-120 does not activate a budget ledger.

## Threat model and assessments

The threat model covers governance/provider bypass, stale authorization, duplicate spend, untrusted events, reasoning/prompt/secret leakage, sandbox escape, contamination, evaluator bias, vendor self-evaluation, cache distortion, drift, regional/retention ambiguity and automated promotion.

The Eve assessment is an evidence-gap record. Network access was prohibited and the repository has no timestamped Eve public-documentation snapshot, so filesystem-first authoring, durable sessions, continuation tokens, replay, human input, subagents, structured results, sandbox adapters, evals, instrumentation, reasoning behavior, API stability and portability remain unverified.

The Cloudflare assessment uses only repository evidence from 2026-06-15. That evidence is historical and its direct Worker/Queues/AI Gateway plan was retired on 2026-07-13. Current Agents SDK/session/cancellation/replay/subagent/structured-result/sandbox/reasoning/eval/privacy/region/retention/portability evidence is missing, so the candidate remains discovered and disabled.

## Operator integration

Operator Read Model `1.2.0` adds a required read-only `tournament` section: registered candidates, lifecycle, benchmark eligibility, latest daily/weekly references, blockers, budget, kill switch, promotion recommendation and human-decision requirement. `write_actions_available` is contractually false. Current results/reviews are null, budgets disabled, recommendations none and all candidates ineligible.

## Validation evidence

- Focused tournament/architecture/Operator tests: passed.
- Full test suite: **1,036 passed, 0 failed, 149 suites**.
- Typecheck: passed (`pnpm typecheck`).
- Build: passed (`pnpm build`).
- Scoped ESLint for every changed TypeScript file: passed.
- Scoped Prettier for every changed file: passed.
- Repository JSON parse: **393 JSON files valid**.
- New schema compilation and valid/invalid fixture validation: passed in strict Ajv mode.
- Architecture checks: passed in the full suite; tournament modules contain no transport, environment, secret resolver, gateway or authorization-store dependency.
- Credential/path scan of the AI-120 surface: no credential-shaped values or absolute developer paths found.
- Reasoning-content scan: no chain-of-thought/raw-reasoning fixture content found.
- Activation scan: no enabled tournament candidate, approved tournament candidate or inactive tournament kill switch found.
- `git diff --check`: passed.

Repository-wide `pnpm lint` remains blocked by **43 pre-existing errors** in legacy crawler/validation files outside the AI-120 change set. Repository-wide `pnpm format` reports **192 pre-existing formatting findings**, also outside the changed surface. These baseline failures were not broadened into unrelated cleanup; scoped checks are clean. This is a known repository-quality blocker, not an AI-120 contract failure.

## Assumptions and limitations

- The architecture defines a future controller; no scheduler, runtime executor, event receiver, traffic splitter or lifecycle mutator is implemented.
- Current vendor documentation and commercial/legal/privacy facts require a separately approved network evidence-capture iteration.
- Candidate event claims remain untrusted until AI LAB validates sequence, bindings and evidence.
- Local SQLite governance is not distributed/multi-region consensus.
- The initial agent definitions are evaluation specifications only.

## Explicit non-activation statement

No runtime, provider, endpoint, model, inference gateway, adapter, budget governor, authorization, traffic stage or agent was activated. No model inference, authenticated external call, deployment, production/customer-data use, secret access, external-service mutation, production migration, `vlatam-global` change, push or pull request occurred.

## Exact next step

After human review of AI-120, authorize a separate local evidence-capture task for timestamped public Eve and current Cloudflare documentation snapshots. Hash and independently review those snapshots, fill the missing version/privacy/session/cancellation/event/sandbox/eval/portability evidence, and keep both candidates at `discovered` until an explicit human lifecycle decision permits `sandbox_only`. Do not implement or execute a synthetic tournament until that evidence gate passes.

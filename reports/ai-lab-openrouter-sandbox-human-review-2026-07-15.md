# AI LAB — OpenRouter sandbox activation human review (2026-07-15)

Evidence report for the governed human-review workflow PR
(`feat/ai-lab-openrouter-sandbox-human-review`). Repository outcome after this
change: `blocked`, execution disabled, no provider call performed.

## 1. Resumed baseline and interruption recovery

The implementing session was interrupted twice. On each resume the repository
state was re-verified before continuing:

- working directory `vlatam-ai-lab`, remote
  `https://github.com/Nicosted/vlatam-ai-lab.git`;
- clean worktree; local `main` equal to refreshed `origin/main` at
  `279280ba824f0a0629b952c4744060c389c60a61` (the PR #108 merge commit,
  verified merged);
- no pre-existing task branch, task commits, or task PR from the interrupted
  sessions; the only recovered partial work was one uncommitted new module
  (`src/providers/openrouter-sandbox-gold-case.ts`) authored by the same task,
  which was inspected and continued;
- the Operator Read Model snapshot still reported OpenRouter `blocked`,
  `execution_allowed: false`, adapter disabled, kill switch active, secret
  `not_configured`, budget disabled, 23 active blockers, no authorization,
  no consumption, no provider call.

## 2. Pre-change repository state

- Providers: 1 (OpenRouter), blocked with 23 blockers and 6 required actions.
- Candidate: `minimax/minimax-m2.7` for
  `evidence.extraction.normative_claims`; model, route, and profile disabled.
- Sandbox proposal `blocked`; evidence review and proposal approval pending.
- Pricing evidence conflicting; ZDR evidence store empty; exact upstream route
  unresolved; benchmark/gold-case acceptance missing.
- Test baseline: 955 tests / 141 suites, all passing.

## 3. Reused contracts and evaluators (no duplication)

- `evaluateOpenRouterReadinessDossier`, `evaluateOpenRouterExternalEvidencePack`,
  and `evaluateOpenRouterSandboxEnablementProposal` are reused as-is; the new
  layer consumes their outcomes and never recalculates readiness, privacy/ZDR,
  pricing, route eligibility, authorization, budget, kill-switch, preflight,
  or provider identity.
- Canonical serialization reuses `canonicalizeOpenRouterRegistryJson`
  (`registry-json-v1`) with new domain-separated SHA-256 domains.
- The synthetic input reuses the already-permitted repository fixture
  `openrouter.normative-claim.synthetic.v1`, bound by identity and hash.
- The Operator Read Model remains the sole presentation source of truth; the
  console reads no domain artifact directly.

## 4. Human-review contract

`config/ai-openrouter-sandbox-activation-review.json`
(`openrouter.minimax-m2.7.sandbox-activation-review.v1`, contract `1.0.0`,
schema `schemas/ai-openrouter-sandbox-activation-review.schema.json`, module
`src/providers/openrouter-sandbox-activation-review.ts`).

Binds provider identity, exact candidate model, intended upstream provider,
model-registry entry, route record, execution profile, capability, readiness
dossier, external evidence pack, sandbox proposal, runtime configuration,
pricing policy (resolvable; currently `unresolved`), privacy/ZDR evidence
(resolvable; currently `unresolved`), gold case, and first-run fixture — each
with identity, version, and hash where the artifact exists. It fixes the
ceilings (exactly 1 request, ≤ 8000/2000 tokens, ≤ 10000 ms, 0 retries, no
fallback, ≤ `0.05` USD), the review timestamps and expiry
(`2026-08-13T12:00:00.000Z`), both human decisions with reviewer identity,
role, decision, reason, timestamp, and reviewed hashes, the kill-switch and
incident ownership, the non-repository secret-management plan (environment
variable at the final boundary; name only, never a value), the synthetic
first-run data classification, and the downstream restrictions. Content hash:
`review_hash` (SHA-256, domain
`vlatam-ai-lab:openrouter-sandbox-activation-review:v1`).

## 5. Lifecycle

`pending → approved | rejected | expired | superseded`. Evaluator outcomes:
`invalid_review`, `rejected`, `expired`, `blocked`, `pending_human_review`,
`eligible_for_activation_configuration` — in exactly that precedence. The only
representable scope is `one_synthetic_gold_case_sandbox_activation`; every
broader scope is rejected. Supersession requires a successor id; a successor
without the `superseded` lifecycle is invalid.

## 6. Separation-of-duties rules

1. Evidence reviewer ≠ activation approver (two independent human judgments).
2. Neither may equal `created_by`; automation-shaped identities (`agent`,
   `bot`, `system`, `pipeline`, `ci`, model names, …) are rejected for every
   human role — the system can never self-review or self-approve.
3. Kill-switch owner ≠ activation approver and incident owner ≠ activation
   approver: whoever can stop or triage the run is independent from whoever
   authorized it.
4. Kill-switch owner and incident owner MAY be the same person (documented
   decision): both are operational-response roles with aligned incentives,
   and a mandatory fourth human adds no control value for one bounded
   synthetic request while rules 1–3 preserve two-person control.
5. The gold-case acceptance reviewer may be the evidence reviewer but never
   the activation approver or the artifact author.

Approved decisions additionally require a substantive reason, a non-future
timestamp, and exact reviewed hashes; approval cannot precede an approved
evidence review.

## 7. Synthetic gold-case design

`config/ai-openrouter-sandbox-gold-case.json`
(`openrouter.minimax-m2.7.normative-claims.gold-case.v1`, contract `1.0.0`,
hash `03af337eed0adda99b84a8dbf220210c5b8b897d9f994d4b33d543ad51688b27`).
Entirely synthetic (fictional labeling rule), no customer/personal/
production/privileged/regulated data (constants plus restricted-content scan).
Defines the closed expected output schema (`claims` + `uncertainty`), two
required normative claims with verbatim evidence substrings, a required
uncertainty disclosure ("does not specify"), prohibited conclusions (legal
advice, compliance verdicts, unsupported extensions), and usage restrictions
(no legal advice, no automatic downstream publication, human review required,
single live request only). Campaign status: `prepared_not_executed`;
`execution_results: []`; human acceptance `pending`. Any recorded execution
result is rejected as fabricated.

## 8. Acceptance criteria (deterministic)

`scoreOpenRouterGoldCaseObservation` scores: output schema validity,
required-claim recall (all), unsupported-claim count (0), evidence-reference
validity, uncertainty disclosure, prohibited-conclusion absence, observable
provider (`openrouter`) and model (`minimax/minimax-m2.7`) identity, usage
metadata availability, cost-metadata compatibility (micro-USD integer ≤
`50000`), latency ceiling (≤ 10000 ms), timeout behavior, zero retries, zero
fallback. Deterministic replay verified (identical inputs → deeply equal
frozen results). Best outcome: `candidate_result_for_human_review` — human
acceptance is never granted by code.

## 9. Deterministic activation evaluator

`evaluateOpenRouterSandboxActivationReview` is pure (no filesystem, network,
environment, clock, or randomness; caller supplies the instant), deeply
freezes results, uses sorted deterministic reason codes, and fails closed on
every unknown state. Every outcome reports `execution_authorized: false`,
`provider_call_performed: false`, `secret_access_allowed: false`,
`runtime_enabled: false`; `activation_configuration_authorized` is true only
for `eligible_for_activation_configuration`, which itself only permits a
later, separately reviewed configuration PR.

## 10. Repository-backed outcome

- Gold case: `prepared_pending_acceptance`.
- Activation review: `blocked`; blockers `pricing_policy_unresolved`,
  `privacy_zdr_evidence_unresolved`, `sandbox_proposal_blocked`; pending
  human decisions: `evidence_review_pending`, `activation_approval_pending`,
  `gold_case_acceptance_pending`, `exact_routing_limitation_unacknowledged`,
  `kill_switch_owner_unassigned`, `incident_owner_unassigned`.
- System: `blocked`, 33 active blockers, 8 pending reviews/decisions, 6
  required actions, `execution_allowed: false`.

## 11. Operator Read Model changes

Contract `1.0.0 → 1.1.0`: new `activation_review` and `gold_case_state`
sections (normalized, audit-safe: statuses, ceilings, bound-artifact
metadata, deterministic `next_governed_action`; no reviewer identities are
invented), two new blocker sources, participation in `invalid_state` and
`pending_approvals`, audit metadata for both new artifacts, loader coverage
of the new governed files (activation review, gold case, fixture, pricing,
ZDR store), and `REPOSITORY_OPERATOR_EVALUATED_AT` moved to
`2026-07-15T12:00:00.000Z` (verified before the earliest evidence expiry of
2026-08-12). Schema `schemas/ai-operator-read-model.schema.json` updated.

## 12. Operator Console changes

New Spanish read-only route `/operator/review` (Revisión humana) rendering
review status, exact scope, candidate identity, pending decisions, decision
and ownership statuses, allowed first-run data, all ceilings, gold-case
readiness and acceptance, bound artifacts with abbreviated hashes and full
disclosure, review-scoped blockers, expiry, and the translated next governed
action. The audit page gains the two new governed artifacts; the next
governed milestone text now points at controlled sandbox activation. The
console remains GET-only, `Cache-Control: no-store`, form-free, and free of
secrets, prompts, raw documents, provider responses, tokens, and environment
values; unknown machine values stay canonical and marked untranslated.

## 13. Validation commands and results

| Command                                                                                                                            | Result                                            |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `npx tsx --test tests/providers/openrouter-sandbox-gold-case.test.ts tests/providers/openrouter-sandbox-activation-review.test.ts` | 31 tests, 31 pass                                 |
| `npx tsx --test tests/operator/*.test.ts`                                                                                          | 33 tests, 33 pass                                 |
| `npx tsx --test tests/architecture/*.test.ts`                                                                                      | 50 tests, 50 pass                                 |
| `npm test` (full suite)                                                                                                            | 992 tests / 145 suites, 0 fail (baseline 955/141) |
| `npm run typecheck`                                                                                                                | clean                                             |
| `npm run build`                                                                                                                    | clean                                             |
| `npx eslint <changed TypeScript files>`                                                                                            | clean                                             |
| `npx prettier --write <changed supported files>`                                                                                   | clean; no unintended content changes              |
| `npx prettier --check <changed supported files>`                                                                                   | clean                                             |
| `git diff --check`                                                                                                                 | clean                                             |
| `npm run operator:snapshot`                                                                                                        | blocked; 33 blockers; execution disabled          |

## 14. Repository-wide lint and formatting baseline (pre-existing, unchanged)

Recorded on `main` before this change and not fixed here (unrelated files):

- `npm run lint`: 43 errors, 0 warnings — all in legacy crawler/scripts
  files (`src/crawlers/*`, `scripts/validate-*.ts`, and similar).
- `npm run format`: 194 files not formatted — predominantly `.codex/**`
  markdown and other legacy non-source files.

The post-change totals were re-measured and match the baseline apart from the
files added or touched by this PR, which are lint- and format-clean.

## 15. Remaining blockers before any activation

1. Resolve conflicting pricing into one exact reviewed pricing policy and
   bind it (`pricing_policy_unresolved`).
2. Produce reviewed privacy/ZDR evidence for OpenRouter and bind it
   (`privacy_zdr_evidence_unresolved`).
3. Resolve every sandbox-proposal blocker (readiness dossier risks, exact
   upstream routing, structured output, benchmark, legal and security
   reviews, proposal approval).
4. Record the real human decisions: evidence review, activation approval,
   gold-case acceptance, routing-limitation acknowledgment, kill-switch and
   incident ownership.
5. Only then may a separately reviewed activation-configuration PR be
   proposed; execution authorization remains outside that PR's scope too.

## 16. Known limitations

- The `eligible_for_activation_configuration` outcome is not reachable from
  repository state (honest: the upstream evidence graph is blocked) and is
  not constructed in tests either, since that would require fabricating an
  entire resolved evidence graph; its invariants are enforced structurally
  (literal `false` constants on every evaluator path) and verified across
  the reachable outcomes.
- Human decisions can only be recorded by editing the governed artifact in a
  reviewed PR; there is intentionally no UI or API to record them.
- The console remains unauthenticated and local-only, as before.
- `defaultOpenRouterSandboxProposalDependencies()` (pre-existing module)
  returns shared JSON-module references for registries/adapter; tests in
  this PR clone before mutating and do not change that module.

## 17. Explicit non-actions

- No OpenRouter, MiniMax, or any other provider call; no model inference.
- No real secret requested, read, created, printed, hashed, stored, or
  tested; only the pre-existing environment-variable name is referenced.
- No execution component enabled: adapter, model, route, profile, budget,
  and live harness all remain disabled; the kill switch remains active.
- No authorization issued or consumed; no budget mutated.
- No provider-account or production change; `vlatam-global` untouched.
- No reviewer identity, approval, or benchmark result fabricated: all
  decisions ship `pending`, ownerships `unassigned`, campaign
  `prepared_not_executed` with zero results.
- The PR is opened as a draft and not merged.

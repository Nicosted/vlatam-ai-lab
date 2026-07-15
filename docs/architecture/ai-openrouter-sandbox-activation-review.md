# OpenRouter sandbox activation human review

Status: implemented 2026-07-15; repository outcome `blocked`, execution
disabled. This document describes the governed human-review workflow that sits
between the existing sandbox-enablement proposal and any future controlled
sandbox activation.

## Position in the governed architecture

The execution chain is unchanged:

`registry → resolution → authorization → exact policy → atomic consumption → gateway → adapter`

The review workflow is added strictly **before** activation:

`readiness dossier + external evidence + sandbox proposal + benchmark/gold case + human decisions + operational ownership → activation eligibility`

The workflow reuses the existing governed evaluators — readiness dossier,
external evidence pack, sandbox-enablement proposal — and never recalculates
or weakens readiness, privacy/ZDR, pricing, route eligibility, authorization,
budget, kill-switch, preflight, or provider identity. The Operator Read Model
remains the sole presentation source of truth.

## Artifacts and contracts

| Artifact            | Path                                                  | Contract                                                                                                                                        |
| ------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Activation review   | `config/ai-openrouter-sandbox-activation-review.json` | `schemas/ai-openrouter-sandbox-activation-review.schema.json`, module `src/providers/openrouter-sandbox-activation-review.ts`, contract `1.0.0` |
| Synthetic gold case | `config/ai-openrouter-sandbox-gold-case.json`         | `schemas/ai-openrouter-sandbox-gold-case.schema.json`, module `src/providers/openrouter-sandbox-gold-case.ts`, contract `1.0.0`                 |

Both artifacts use the canonical `registry-json-v1` serialization and carry a
domain-separated SHA-256 content hash (`review_hash`, `gold_case_hash`). Any
byte-level drift between an artifact and its recorded hash, or between a
binding and the governed artifact it names, fails closed as invalid.

### Review bindings

The review binds, by identity, version, and hash: the readiness dossier, the
external evidence pack, the sandbox proposal, the runtime configuration, the
execution profile, the model-registry entry, the route record, the synthetic
gold case, and the first-run fixture. Pricing policy and privacy/ZDR evidence
are **resolvable bindings**: today they are honestly `unresolved` (there is no
exact reviewed pricing policy for the candidate and the ZDR evidence store is
empty), and each unresolved binding is a dedicated blocker
(`pricing_policy_unresolved`, `privacy_zdr_evidence_unresolved`).

### Ceilings

The review fixes the first-run ceilings: exactly **1** request, ≤ 8000 input
tokens, ≤ 2000 output tokens, ≤ 10000 ms timeout, **0** automatic retries,
fallback disabled, and ≤ `0.05` USD total spend. Ceilings may never exceed the
reviewed proposal ceilings, and `maximum_requests` must be exactly one.

## Lifecycle and decisions

Lifecycles: `pending → approved | rejected | expired | superseded`.

The evaluator (`evaluateOpenRouterSandboxActivationReview`) is pure and
deterministic and returns exactly one of:

- `invalid_review` — structural, binding, identity, or duty violations;
- `rejected` — an explicit human rejection or rejected lifecycle;
- `expired` — the expiry instant passed or the lifecycle is `expired`;
- `blocked` — governance blockers remain (including `review_superseded`);
- `pending_human_review` — only human decisions remain outstanding;
- `eligible_for_activation_configuration` — everything above is resolved.

Precedence is exactly that order. Every outcome — including eligibility —
reports `execution_authorized: false`, `provider_call_performed: false`,
`secret_access_allowed: false`, and `runtime_enabled: false`. Eligibility only
permits a later, separately reviewed PR to configure the one-call sandbox
activation; it never issues or consumes authorization, accesses secrets,
mutates budgets, disables the kill switch, or invokes the gateway, adapter,
harness, or provider.

The only representable approval scope is
`one_synthetic_gold_case_sandbox_activation`. Any broader scope — generic
sandbox, provider-wide, production, recurring, autonomous, customer-data, or
unrestricted — is rejected as `approval_scope_forbidden`.

## Separation of duties

Explicit human identities are required for four roles: evidence reviewer,
sandbox activation approver, kill-switch owner, and incident owner. The
enforced independence rules are:

1. The evidence reviewer and the activation approver must be different human
   identities (two independent judgments).
2. Neither may equal the artifact author (`created_by`): the system never
   self-reviews or self-approves. Identities containing automation segments
   (`agent`, `bot`, `system`, `pipeline`, `ci`, …) are rejected for every
   human role.
3. The kill-switch owner and the incident owner must each be different from
   the activation approver: the person able to stop or triage the run is
   independent from the person who authorized it.
4. The kill-switch owner and the incident owner **may** be the same person.
   Rationale: both are operational-response roles with aligned incentives
   (stop, then investigate); requiring a fourth independent human adds no
   control value for one bounded synthetic request, while rules 1–3 preserve
   two-person control over authorization.
5. The gold-case acceptance reviewer may be the evidence reviewer, but never
   the activation approver or the artifact author.

Approved decisions must carry the reviewer identity and role, an explicit
`approve`/`reject` decision, a substantive reason, a non-future timestamp, and
the exact reviewed hashes of the dossier, evidence pack, proposal, gold case,
and runtime configuration. A stale reviewed hash invalidates the decision.
The activation approval cannot precede an approved evidence review.

No reviewer name or approval is invented: the repository artifact ships with
every decision `pending`, every ownership `unassigned`, and lifecycle
`pending`.

## Synthetic gold case

Exactly one versioned gold case exists for
`evidence.extraction.normative_claims`:
`openrouter.minimax-m2.7.normative-claims.gold-case.v1`. It derives from the
already-permitted synthetic repository fixture
`openrouter.normative-claim.synthetic.v1` (a fictional labeling rule), binds
it by identity and hash, and contains no customer, personal, confidential,
privileged, production, or regulated data (enforced by constants and a
restricted-content scan).

The case defines the expected structured output (`claims` + `uncertainty`,
closed schema), two required normative claims with verbatim evidence
references, a required uncertainty disclosure ("does not specify"), and
prohibited conclusions (legal advice, compliance verdicts, claims beyond the
source). Usage restrictions prohibit legal advice and automatic downstream
publication and limit the case to a single live request.

### Deterministic acceptance contract

`scoreOpenRouterGoldCaseObservation` scores one observation deterministically
against: output schema validity, required-claim recall (all), unsupported
claim count (0), evidence-reference validity (verbatim source substring),
uncertainty disclosure, prohibited-conclusion absence, observable provider and
model identity, usage-metadata availability, cost-metadata compatibility
(micro-USD integer within the `50000` µUSD ceiling), latency ceiling
(≤ 10000 ms), timeout behavior, zero retries, and zero fallback. Its best
outcome is `candidate_result_for_human_review` — it never grants acceptance.

The repository state represents the campaign as **prepared, not executed**:
`campaign_status: prepared_not_executed`, `execution_results: []`, human
acceptance `pending`. Any recorded execution result is rejected as fabricated.
Activation eligibility remains blocked until a human reviewer explicitly
accepts the gold case and its scoring method (and, after the later single
call, its result) under the exact bounded scope.

## Operator Read Model and Console

The Operator Read Model contract is now `1.1.0`. It adds two normalized,
audit-safe sections — `activation_review` (outcome, lifecycle, scope, expiry,
pending human decisions, decision and ownership statuses, allowed first-run
data, ceilings, bound artifacts with abbreviated hashes, deterministic
`next_governed_action`) and `gold_case_state` (outcome, campaign status,
acceptance status, capability, hash) — plus two blocker sources
(`sandbox_activation_review`, `sandbox_gold_case`) and audit metadata. The
repository loader evaluates the new artifacts through the same fail-closed
path as every other governed artifact.

The Spanish console renders the workflow at `/operator/review`, read-only and
GET-only, with progressive hash disclosure and no approval, upload, secret,
kill-switch, execution, or mutation control of any kind.

## Repository-backed outcome (2026-07-15)

- Gold case: `prepared_pending_acceptance`.
- Activation review: `blocked` with reasons `pricing_policy_unresolved`,
  `privacy_zdr_evidence_unresolved`, `sandbox_proposal_blocked`, and six
  pending human decisions (evidence review, activation approval, gold-case
  acceptance, routing-limitation acknowledgment, kill-switch ownership,
  incident ownership).
- Overall repository state: `blocked`; execution, secret access, budget,
  authorization, and adapter all remain disabled; the kill switch remains
  active.

## What this workflow can never do

It cannot perform or authorize a provider call, read or require a real secret
(only the environment-variable _name_ is referenced), enable any runtime
component, issue or consume authorization, mutate budgets, deactivate the kill
switch, approve production, recurring, autonomous, or customer-data use, or
approve anything broader than one synthetic gold-case sandbox activation.

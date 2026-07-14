# OpenRouter manual sandbox adapter runbook

Status: **blocked and non-executable**. Do not run the live command until every
blocker is resolved and a human independently approves the exact hashes.

## Architecture and preflight sequence

The only allowed path is:

`registry → resolution → authorization → exact policy → atomic consumption → gateway → sandbox transport adapter`

The adapter is transport-only. The operator harness accepts only fixture
`openrouter.normative-claim.synthetic.v1`; it has no arbitrary-prompt option and
is not imported by startup, APIs, schedulers, workers, or background jobs.

Preflight validates the closed metadata contract, exact candidate and hashes,
expiry and ceilings, dossier/proposal eligibility, routing, privacy/retention/
training/geography/ZDR, structured-output and benchmark acceptance, legal and
security review, manual invocation and test-data classification, enabled state
inside the exact approved scope, independent scoped approval, kill switch, and
budget. Only then may the final secret boundary be invoked. Preflight failures
do not consume authorization.

## Approval prerequisites

An execution approval must be human-issued, non-self-issued, unexpired, scoped
to `manual_sandbox_execution_exact_hashes`, and bind the proposal, dossier,
evidence pack, profile, route, model, adapter, and exact-policy hashes. The
repository approval is only pending proposal-review metadata and grants no
execution or secret access.

## Secret management

The contract stores only `OPENROUTER_API_KEY`, never its value. A future operator
may configure the value in the approved local secret manager/environment with:

```sh
# TEMPLATE ONLY — do not run until separately approved; never paste the value in shell history.
approved-secret-tool set OPENROUTER_API_KEY
```

The injected provider reads the named value only after every non-secret gate
passes. Missing and whitespace-only values fail closed. Never print, hash,
persist, snapshot, or attach the value to an error or audit record.

## Kill switch and immediate shutdown

The repository switch `local.openrouter-sandbox.pending-owner` is active and
its owner is pending. Before any future call, assign a human owner, approve the
local control, test that active blocks before secret resolution, and record only
the reference and safe state. Immediate shutdown: activate the switch, revoke
the scoped approval, disable adapter/profile/route/model configuration, revoke
the secret externally, preserve metadata-safe audit evidence, and begin the
incident review. Do not retry the consumed authorization.

## Commands

Preflight-only (safe; never reads the secret or network):

```sh
npm run ai:openrouter:sandbox -- --fixture openrouter.normative-claim.synthetic.v1 --preflight-only
```

Future live template (must not be run now):

```sh
npm run ai:openrouter:sandbox -- \
  --fixture openrouter.normative-claim.synthetic.v1 \
  --confirm-manual-sandbox-call \
  --operator-id approved.operator \
  --proposal-hash <approved-sha256> \
  --dossier-hash <approved-sha256> \
  --evidence-pack-hash <approved-sha256> \
  --profile-hash <approved-sha256> \
  --route-hash <approved-sha256> \
  --model-hash <approved-sha256> \
  --exact-policy-hash <approved-sha256>
```

Repository wiring intentionally has no live executor, an active kill switch,
and unavailable budget. A later reviewed configuration must wire the existing
governed coordinator; the harness must never call transport or consumption
directly.

## Audit, timeout, failures, and budget reconciliation

Audit may contain execution/correlation IDs, exact-policy and governed artifact
hashes, model/route/profile identities, preflight and consumption outcomes,
adapter outcome, HTTP status category, and provider-reported usage/cost. It must
contain no prompt, raw document, output, secret, authorization token, or raw
provider error. The adapter makes one request, with no retry or fallback, and
cancellation propagates through the gateway timeout. Authentication, rate
limit, unavailable provider, timeout, malformed response, identity mismatch,
missing usage, incompatible cost metadata, and structured-output failure are
terminal outcomes.

Budget reservation remains in the existing gateway before atomic consumption.
Actual provider-reported usage and cost are preserved when valid; final billed
cost is never invented. A post-consumption timeout, network/provider rejection,
or invalid response does not restore authorization, and no retry may reuse it.
The total sandbox ceiling remains USD 0.05 and is disabled in repository state.

## Remaining manual steps before the first real request

1. Resolve and re-review every dossier and proposal blocker.
2. Prove the exact MiniMax route and strict structured-output support.
3. Approve privacy, retention, training use, geography, ZDR, legal, and security.
4. Produce and accept capability benchmark and reviewed gold-case evidence.
5. Approve bounded pricing and enable an exact USD 0.05 sandbox budget.
6. Recompute and independently review every required hash.
7. Issue a non-self-issued, scoped, expiring exact-hash execution approval.
8. Assign and test kill-switch and incident owners; leave the switch active until the approved window.
9. Configure the secret outside the repository without exposing its value.
10. Review a later configuration change that enables only the exact scoped model, route, profile, and adapter.
11. Run preflight-only, review its audit-safe output, then obtain explicit human go-ahead for the one fixture call.

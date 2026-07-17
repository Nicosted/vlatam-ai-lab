# AI-122 Follow-up — Sanitized Fireworks Pre-response Failure Classification

- Date: 2026-07-17
- Repository: `vlatam-ai-lab`
- Branch: `feat/ai-lab-glm-fireworks-controlled-conformance`
- Remediation baseline: `2f69dc640d7e6e7696f39d77ca4ec70297f1e097`
- Original controlled-conformance commit: `c859cbf1ad95368dc9e2aeb3ff759f20aa39d43d`

## Scope and source snapshot

This follow-up remediates independent review findings in the deterministic,
provider-layer classifier for failures occurring before a usable GLM Fireworks
response exists. The resumed branch, clean worktree, HEAD, draft PR, consumed
single-use authorization, active global kill switch, and disabled capability
state were verified before editing.

Implementation and validation are local and mock-only. They do not call
OpenRouter, Fireworks, or another inference service; inspect a credential value;
create, consume, reset, or replace an authorization; change production
configuration; or alter the prior failed-closed execution evidence. The only
external traffic permitted by this task is the requested GitHub push and draft
PR update after local validation.

## Classification contract

Contract version: `1.0.0`.

| Classification                 | Trusted detection requirement                                                                  | Retryable | Terminal |
| ------------------------------ | ---------------------------------------------------------------------------------------------- | --------- | -------- |
| `credential_unavailable`       | The thrown value is the exact local object registered in the module-private credential WeakSet | false     | true     |
| `timeout`                      | The harness timeout signal fired; an `AbortError` name or message alone is insufficient        | true      | false    |
| `network_transport`            | The adapter converted an approved native error code into a module-private network marker       | true      | false    |
| `http_response`                | A response exists, including HTTP 200 without a usable provider payload                        | varies    | varies   |
| `unknown_pre_response_failure` | No preceding trusted condition matches                                                         | false     | true     |

HTTP `401` and `403` are terminal. HTTP `408`, `425`, `429`, and `5xx` are
retryable metadata. Invalid, absent, non-integer, or out-of-range HTTP status
values are not persisted and fail closed with
`pre_response_http_status_unavailable`.

`retryable` is evidence metadata, not authority. Classification-only execution
cannot create an attempt, reserve idempotency, consume authorization, or call a
transport. The executable harness may retry only within its separately
validated and authorization-bound retry limit. Unknown failures never acquire
retry authority.

## Trusted marker and safe inspection boundaries

The public `credential_available` assertion was removed. Credential absence is
selected only for an object created by the local credential boundary and
registered in a module-private `WeakSet`. A string code, plain object, generic
error, or legacy boolean cannot impersonate the marker. The classifier does not
read environment variables or credential values.

Raw network errors are considered only at the approved transport adapter
boundary. That sanitizer:

- accepts a native `Error` only and rejects Proxies before descriptor access;
- reads only own `code` and `cause` data-property descriptors;
- rejects accessors, inherited properties, arbitrary objects, and unallowlisted
  codes;
- permits at most one native-error cause level and terminates cycles;
- never invokes getters, Proxy traps, `toJSON`, `toString`, `valueOf`, coercion,
  or another arbitrary method; and
- replaces an accepted code with a generic module-private network marker, so
  raw details do not enter classification evidence.

This is a narrow shape acceptance rule, not a claim that arbitrary JavaScript
objects or Proxies can be safely introspected. Unsafe or malformed thrown values
remain opaque and become `unknown_pre_response_failure`.

## Governance metadata validation

The exported classifier accepts `unknown` and validates the complete input
before emitting evidence. It accepts only a plain, non-Proxy record with an
exact property allowlist and own data descriptors. It requires:

- a positive safe-integer attempt from `1` through the authorized maximum of
  `3`;
- a canonical normalized ISO timestamp;
- non-empty correlation and execution-evidence IDs using the repository's
  lowercase alphanumeric/dot/underscore/hyphen identifier grammar and bounded
  to 192 characters; and
- actual booleans for optional decision fields.

Missing identifiers, control/newline characters, URLs, query strings,
oversized values, accessors, extra fields, invalid timestamps, and invalid
attempts throw a fixed local `invalid_governance_metadata` error before evidence
is constructed. Adapter, model, route, and profile identities are not caller
fields: the evidence constructor always supplies its four fixed compile-time
constants.

## Emitted evidence and limitations

The classifier emits only contract/classification data, fixed reason and
identity values, validated attempt/timestamp/IDs, validated HTTP status
metadata, and retryable/terminal decisions. It does not persist exception
messages or stacks, credential values, headers, bodies, hostnames, IP addresses,
socket details, nested response contents, or original error codes.

This classification improves local diagnosis only. It does not establish or
claim served provider, model, endpoint, runtime ZDR enforcement, schema
conformance, token usage, provider cost, gold-case quality, provider
availability, or production readiness.

The prior AI-122 result remains failed closed and unchanged. No result is
approved or promoted. A future authenticated retry still requires fresh
explicit human approval and a new, narrowly bound, single-use authorization
under the original route, ZDR, budget, timeout, token, data-classification,
kill-switch, and no-fallback constraints.

## Validation

All validation was local and mock-only:

- sanitized failure-classifier tests: **25/25 passed**;
- directly affected conformance and harness tests: **39/39 passed** across 2
  suites;
- full repository suite: **1,087/1,087 passed** across 152 suites;
- TypeScript typecheck: passed;
- build: passed;
- scoped ESLint: passed;
- scoped Prettier: passed;
- repository and diff safety scans: passed after reviewing expected references
  in the unchanged live-transport block, adversarial fixtures, and this report;
- prior execution-result checksum:
  `a167636fd6b96235d96f60a7c3493d2f1952d8d0fe4d6360b55018efcde30939`
  (must remain unchanged).

The instrumented classifier-only test constructs the real harness with spies on
global fetch, transport, idempotency reservation, and authorization consumption.
It asserts zero calls to every boundary and therefore also proves zero retry
execution. The test mock is owned and automatically restored by the Node test
context.

## Safety state and blockers

The global GLM kill switch remains active. The OpenRouter adapter, GLM model,
route, execution profile, runtime, budget, and production capabilities remain
disabled. No provider credential was accessed, no approved or repository
authorization state changed, and implementation/testing made zero provider or
inference-network calls.

The original conformance blockers remain: no usable live provider response; no
served-route, runtime-ZDR, schema, usage, cost-reconciliation, or gold-score
evidence; and pending independent evidence, security, privacy, legal, and
activation review.

Exact next step after publication: independent re-review of draft PR #117. This
report does not authorize a retry, activation, promotion, deployment, or merge.

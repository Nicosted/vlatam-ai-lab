# AI-122 Follow-up — Sanitized Fireworks Pre-response Failure Classification

- Date: 2026-07-17
- Repository: `vlatam-ai-lab`
- Branch: `feat/ai-lab-glm-fireworks-controlled-conformance`
- Baseline: `c859cbf1ad95368dc9e2aeb3ff759f20aa39d43d`

## Scope and source snapshot

This follow-up adds a deterministic, provider-layer classification contract for failures occurring before a usable GLM Fireworks provider response exists. Implementation and validation use mocks only. They do not call OpenRouter, Fireworks, or another inference service; inspect a provider credential value; create or consume an authorization; change production configuration; or alter the prior failed-closed execution evidence. GitHub traffic is limited to the separately requested repository push and draft-PR publication.

At the start, the required branch, clean worktree, and baseline commit matched exactly. The GLM adapter, model, route, execution profile, runtime, and budget were disabled, and the global GLM kill switch was active.

## Classification contract

Contract version: `1.0.0`.

| Classification                 | Detection requirement                                                         | Retryability metadata | Terminal metadata |
| ------------------------------ | ----------------------------------------------------------------------------- | --------------------- | ----------------- |
| `credential_unavailable`       | Explicit local credential-availability check reports absence                  | false                 | true              |
| `timeout`                      | The harness timeout signal fired; evaluated before network-shaped errors      | true                  | false             |
| `network_transport`            | No HTTP response and a fixed allowlisted DNS/socket/transport code is present | true                  | false             |
| `http_response`                | An HTTP response exists, including a response with no usable provider payload | status-dependent      | status-dependent  |
| `unknown_pre_response_failure` | No preceding deterministic condition matches                                  | false                 | true              |

HTTP `401` and `403` are terminal. HTTP `408`, `425`, `429`, and `5xx` are retryable metadata. A status-`200` response explicitly marked as lacking a usable provider payload is distinguishable from a no-response transport failure. Unsafe or malformed status values are not persisted and fail closed.

`retryable` is evidence metadata, not authority. It cannot create attempts or authorization. The harness may proceed only when its independently authorization-bound retry limit permits another attempt; terminal classifications stop earlier. Unknown failures never acquire retry authority.

## Sanitization rules

The classifier emits only:

- contract version, classification, and fixed sanitized reason code;
- attempt number and fixed adapter/model/route/profile identities;
- caller-supplied timestamp;
- HTTP-status presence and a safe integer status from `100` through `599`, if available;
- retryable and terminal decisions;
- correlation ID and execution-evidence ID.

The classifier never reads or returns exception messages, stack traces, credential values, authorization headers, request bodies, response bodies, hostnames, IP addresses, socket details, or arbitrary exception properties. Network recognition uses a fixed code allowlist but emits only the generic reason `pre_response_network_transport`. Secret-bearing mock exceptions prove that messages and stacks do not survive serialization.

Credential absence is not inferred from generic transport failure. The live transport can create the governed credential-unavailable marker only after its local presence check determines that the configured value is absent. The value is never printed, hashed, persisted, or compared.

## Governance effects and limitations

This classification improves diagnosis only. It does not establish or claim:

- served provider, model, or endpoint;
- runtime ZDR enforcement;
- schema conformance;
- token usage or provider cost;
- gold-case quality;
- provider availability or production readiness.

The prior AI-122 result remains failed closed and unchanged. No result is approved or promoted. A future authenticated retry still requires a new single-use authorization, fresh explicit human approval, and the original route, ZDR, budget, timeout, token, data-classification, kill-switch, and no-fallback constraints.

## Validation

All validation was local and mock-only:

- sanitized failure-classifier tests: **16/16 passed**;
- directly affected conformance, provider-boundary, and Operator tests: **52/52 passed**;
- full repository suite: **1,078/1,078 passed** across 152 suites;
- TypeScript typecheck: passed;
- build: passed;
- scoped ESLint: passed;
- scoped Prettier: passed;
- credential, authorization-header, raw-response, sensitive-exception, absolute-path, and reasoning-content safety scans: passed;
- prior execution-result checksum remained `a167636fd6b96235d96f60a7c3493d2f1952d8d0fe4d6360b55018efcde30939` with no file diff.

The failure-classifier suite asserts zero external transport attempts and no authorization fields.

## Safety state

The global GLM kill switch remains active. The OpenRouter adapter, GLM model, route, execution profile, runtime, budget, and production capabilities remain disabled. No provider credential was accessed, no authorization was created or consumed, and the implementation and test suite made zero provider or inference-network calls. The only external traffic in the publication workflow is the explicitly requested GitHub push and draft-PR operation.

## Remaining blockers

The original conformance blockers remain: no usable live provider response; no served-route, runtime-ZDR, schema, usage, cost-reconciliation, or gold-score evidence; and pending independent evidence, security, privacy, legal, and activation review.

Exact next diagnostic step after this local follow-up: independently review the new sanitized classification evidence and decide whether to issue a fresh, narrowly bound single-use authorization for a future controlled retry. No retry is authorized by this report.

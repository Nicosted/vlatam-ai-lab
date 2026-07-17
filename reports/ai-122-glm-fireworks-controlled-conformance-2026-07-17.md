# AI-122 — GLM 5.2 Fireworks Controlled Conformance

Date: 2026-07-17  
Repository: `vlatam-ai-lab`  
Branch: `feat/ai-lab-glm-fireworks-controlled-conformance`  
Baseline / local `main` / local `origin/main` at start: `eac46eff9964a944758ea4f7c4e17fde484e5ca4`  
Scope: local controlled-conformance contracts, synthetic fixtures, deterministic mock execution, one explicitly authorized live execution, read-only Operator projection, and evidence.

## Source snapshot and preconditions

The starting worktree was clean and the active branch was the required branch. `HEAD`, local `main`, and the refreshed local `origin/main` reference matched. PR #114 evidence was present through `reports/ai-lab-glm-fireworks-endpoint-evidence-2026-07-17.md`; AI-120 and AI-121 evidence was present.

The inspected repository state remained fail-closed:

- GLM model, route, profile, runtime, adapter, and production budget disabled;
- OpenRouter adapter config `enabled: false`;
- GLM global kill switch active;
- authorization issued count `0` and consumed count `0` in the repository projection;
- no fallback model or endpoint order;
- no production or customer data;
- no access to `vlatam-global`;
- before approval, no credential read or network request; throughout the task, no deployment, stage, commit, push, PR, merge, or production activation.

Graphify had no `graphify-out/graph.json` baseline, so repository inspection used targeted local file reads as required by `AGENTS.md`.

## Candidate identity

| Field                             | Bound value                                                   |
| --------------------------------- | ------------------------------------------------------------- |
| Requested model                   | `z-ai/glm-5.2`                                                |
| OpenRouter upstream provider slug | `fireworks`                                                   |
| Required endpoint tag             | `fireworks`                                                   |
| Rejected endpoint                 | `fireworks/fast`                                              |
| Route                             | `openrouter.glm-5.2.fireworks-standard-candidate`             |
| Execution profile                 | `openrouter.glm-5.2.commercial-document-extraction.candidate` |
| Structured output                 | strict `json_schema` plus independent AJV 2020-12 validation  |
| ZDR                               | required on every request                                     |
| Data class                        | synthetic/public non-sensitive only                           |
| Lifecycle ceiling                 | `sandbox_only candidate pending independent review`           |

No automatic routing, Z.AI route, Fireworks fast route, other OpenRouter endpoint, alternate model, or fallback is permitted.

## Gold cases

The immutable local fixture `ai-122.glm-fireworks.initial-gold.v1` contains five synthetic cases:

1. structured commercial-invoice extraction with parties, Incoterm, currency, two line items, totals, weights, packages, and dimensions;
2. invoice/packing-list contradictions for quantity, gross weight, missing origin, and Incoterm;
3. ambiguous cup/lid descriptions requiring clarification and prohibiting definitive HS/NCM assignment;
4. embedded prompt injection treated as untrusted document content;
5. invalid structured-output recovery covering invalid JSON, missing fields, additional properties, wrong enum, bounded retries, exhaustion, and no approval.

Live cases attempted: **1** (`ai-122.structured-extraction`). Live cases passed: **0**. The single authorization permitted three bounded attempts; all three ended in sanitized pre-response `transport_failure`. No provider response or candidate artifact was produced, so no gold-case quality score is claimed. Deterministic fixtures and mock responses exercise all five case categories.

## Output contract

`ImportOperationPreAssessmentCandidateV1` is a closed JSON Schema. It requires source references, extracted parties, trade terms, currency, line items, totals, logistics, missing information, inconsistencies, clarification questions, classification readiness, risk flags, confidence, model execution evidence, human review, and approval status.

The schema makes definitive HS/NCM assignment impossible (`false` only), requires `human_review_required: true`, and restricts `approval_status` to `candidate` or `pending_review`. Provider output is independently parsed and validated. Raw response content is not persisted in evidence; only SHA-256 hashes are retained.

## One-time authorization envelope

The authorization is purpose-bound and single-use. Its binding hash covers:

- execution profile, model, provider, and endpoint;
- gold case, immutable fixture hash, and schema version;
- per-request and task budgets;
- maximum input/output tokens, timeout, and retry limit;
- privacy class and ZDR requirement;
- expiry, idempotency key, correlation ID, and narrow test gate.

Consumption uses the existing durable SQLite authorization store contract. Deterministic tests prove valid consumption, restart persistence, duplicate rejection, binding mismatch, expiry, provider/endpoint/model/case/schema mismatch, budget mismatch, and replay failure. Retries occur after exactly one consumption and cannot create an approved artifact.

The live authorization was consumed exactly once in an isolated durable SQLite store. A stale replay with a fresh idempotency store returned `already_consumed` and made zero transport attempts. The repository standing authorization projection remains zero because no reusable or production authorization was created. No reusable authorization remains.

## Budget

Dedicated artifact: `config/ai-122-glm-fireworks-conformance-budget.json`.

| Limit                                       |       Value |
| ------------------------------------------- | ----------: |
| Total task ceiling                          |    USD 0.05 |
| Per live request ceiling                    |   USD 0.015 |
| Maximum attempts                            |           3 |
| Maximum input tokens/request                |       4,000 |
| Maximum output tokens/request               |       1,200 |
| Maximum theoretical uncached request        | USD 0.01088 |
| Maximum theoretical three-attempt execution | USD 0.03264 |

The budget artifact is local, non-production, `prepared_not_activated`, non-authorizing, and hard-blocking. The harness rejects an estimate above either ceiling, rejects actual per-request or run cost above the ceiling, and reconciles provider-reported cost, OpenRouter generation cost when supplied, and locally calculated cost. A material discrepancy remains a blocker.

## Routing, ZDR, retries, and evidence

Deterministic transport tests prove:

- the request contains exact model `z-ai/glm-5.2`;
- `provider.only` and `provider.order` each contain only `fireworks`;
- fallback is false, parameter support is required, data collection is denied, and ZDR is true;
- provider, endpoint, or model mismatch fails closed;
- missing request ID, generation ID, or token usage fails closed;
- invalid JSON and schema violations retry only within the authorization-bound limit;
- retry exhaustion returns no artifact and cannot approve;
- duplicate idempotency keys do not invoke transport twice;
- timeouts and cancellation retain correlation and partial attempt evidence;
- raw response and normalized result hashes are deterministic;
- the global kill switch must remain active while only the authorization-scoped test gate is accepted.

The approved live execution started at `2026-07-17T20:40:53.361Z` and exhausted three attempts with two retries. Each attempt failed before a provider response was captured. Therefore actual served provider, model, endpoint tag, request ID, generation ID, provider token usage, provider/OpenRouter cost, runtime ZDR metadata, raw-response hash, normalized-result hash, and schema validation are unavailable. The failure is closed: no result artifact, score, approval, or lifecycle advancement exists.

The request-level controls did enforce `provider.only: ["fireworks"]`, `provider.order: ["fireworks"]`, no fallback, ZDR `true`, and data collection `deny`. Because there was no provider response, those request controls are not claimed as runtime route or ZDR conformance. The sanitized transport boundary intentionally does not distinguish credential unavailability from another pre-response transport failure.

Routing metadata and ZDR-list membership are not treated as legal, privacy, security, or activation approval. Upstream retention, training use, geography, and contractual adequacy remain unresolved unless actual response/account evidence is independently reviewed.

## Structured-output and scoring status

Live structured-output conformance: **failed closed / not observed**.  
Live schema pass rate: **0/3 attempts; no response to validate**.  
Live provider-routing match: **unavailable**.  
Live ZDR evidence: **request enforced; runtime evidence incomplete**.  
Live budget reconciliation: **incomplete because provider usage/cost is unavailable**.  
Recorded attempt latency: **0 ms, 0 ms, 0 ms at harness precision**.  
Locally calculated cost: **USD 0.00000000 from zero reported usage**; this is not proof of zero provider charge.  
Gold-case score: **unavailable**.

The harness records deterministic dimensions for schema conformance, field accuracy, missing-information detection, inconsistency detection, uncertainty preservation, hallucination, injection resistance, latency, cost, reliability, and human correction. No execution is its own sole judge: closed-schema and case assertions run first, existing deterministic evaluation patterns are followed, and human review remains mandatory. No judge model was used.

## Operator read-only projection

Operator Read Model `1.4.0` adds a GLM conformance projection with status, attempted/passed counts, schema pass rate, routing match, ZDR evidence, budget reconciliation, retries, duplicate-consumption result, blockers, independent-review requirement, activation prohibition, and kill-switch state. Current state is `failed`: one case attempted, zero passed, two retries, route evidence unavailable, runtime ZDR and budget reconciliation incomplete, replay consumption safe, and no write action.

## Live execution record

The operator explicitly approved the following scope, and no broader call was made:

- method and URL: `POST https://openrouter.ai/api/v1/chat/completions`;
- credential required by name only: `OPENROUTER_API_KEY`;
- provider: OpenRouter, exact upstream `fireworks`;
- model: `z-ai/glm-5.2`;
- endpoint tag: `fireworks` (standard, not `fireworks/fast`);
- data: one selected immutable synthetic/public non-sensitive gold case;
- request ZDR: required `true`; data collection `deny`;
- strict response format: `ImportOperationPreAssessmentCandidateV1` JSON Schema;
- timeout: at most 15,000 ms per attempt;
- tokens: at most 4,000 input and 1,200 output per attempt;
- attempts: at most 3 (retry limit 2), one authorization consumption;
- maximum theoretical uncached cost: USD 0.01088 per attempt, USD 0.03264 for three attempts, within the absolute USD 0.05 task ceiling.

The credential was resolved only inside the approved transport boundary and was never printed, hashed, persisted, or returned. The authorization binding hash is `81f13e0a7bb46ded30dc6f00eb4617768e2ec414b6eeddbaae2d6947cc90b858`; fixture hash is `0dbedcb30b4a9bd1504d6f29cfe23597bbc434a15a3d443bf254b58ad6dbcff9`; schema-sent hash is `883f5d72293aa11f57c122251f9f6e5d6b7589678be6e1c2d5276c368a9ce1dd`; final evidence hash is `1290a030cb7dae6370f6f475710021e40c4f2a9db89fcc65d98b2a9c1da46a2b`.

## Lifecycle recommendation and blockers

Recommendation: **remain blocked**. The authorized execution did not establish live conformance. A future successful controlled run could recommend only **sandbox_only candidate pending independent review**.

Remaining blockers:

- bounded live transport failure with no provider response;
- fresh explicit human approval before any future retry;
- live schema, routing, ZDR, cost, and gold-quality evidence;
- independent evidence and activation review;
- legal, privacy, security, retention, training-use, and geography review;
- reconciliation of provider/OpenRouter/local costs;
- existing GLM readiness and activation blockers;
- existing MiniMax exact-route, privacy, evidence, and activation blockers remain unchanged.

## Validation

Final local validation:

- focused conformance, Operator, and provider-boundary tests: **36/36 passed**;
- focused AI-122 conformance tests alone: **14/14 passed**;
- full repository suite: **1,062/1,062 passed** across 151 suites;
- TypeScript typecheck: passed;
- build: passed;
- scoped ESLint: passed;
- scoped Prettier: passed;
- changed JSON parse validation: passed (5 files);
- independent request/output JSON Schema validation: passed;
- provider architecture boundary: passed;
- deterministic hash and Operator read-model hash checks: passed;
- credential-value scan: passed;
- absolute-path scan: passed;
- reasoning-content scan: passed;
- post-validation repository projection: adapter disabled, production budget disabled, kill switch active, issued authorizations `0`, consumed authorizations `0`.

The repository-wide ESLint command still reports 43 pre-existing errors in unrelated crawler and legacy validation files. Repository-wide Prettier still reports 192 pre-existing unrelated files. No unrelated file was reformatted or refactored; all AI-122 scoped lint and formatting checks pass. No local validation result is represented as live provider conformance.

## Explicit isolation statement

Only synthetic/public non-sensitive fixture data was used. OpenRouter was contacted solely within the explicitly approved execution scope. No production/customer data, production credential, production adapter, production budget, production runtime, autonomous agent, deployment, or production activation was used or enabled. `vlatam-global` was not accessed or modified.

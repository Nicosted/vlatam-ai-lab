# Governed provider candidate controls — 2026-07-13

## Baseline and scope

- Repository: `Nicosted/vlatam-ai-lab` only.
- Baseline: clean, synchronized `main` at `669718a` (`feat: persist budget reservations and usage reconciliation (#94)`).
- Working branch: `feat/ai-lab-controlled-provider-candidate`.
- Graphify baseline: `graphify-out/graph.json` and the Graphify wiki were absent, so repository governance required direct local verification.
- Exactly one route was evaluated. No external repository, production system, provider service, credential source, or `.env*` file was accessed.

## Selected route and deterministic result

- Provider: MiniMax Direct (`minimax-direct`; publisher/operator evidence identifies Nanonoble Pte. Ltd. and affiliates).
- Model: exact ID `MiniMax-M2.7`.
- Endpoint: fixed international OpenAI-compatible base endpoint `https://api.minimax.io/v1`.
- Upstream provider: direct provider endpoint; no aggregator upstream substitution.
- Route pinning: fixed to the MiniMax API domain. No model selection, fallback, retry, or alternate endpoint exists in runtime because no adapter/profile was added.
- Readiness: `BLOCKED_EVIDENCE_INCOMPLETE`.

MiniMax Direct was selected because the repository's reviewed primary-source pack has exact model identity, a direct fixed provider endpoint, and accepted exact USD pricing. OpenRouter `minimax/minimax-m2.7` was not evaluated in this work and remains disabled, unpinned, variable-route, pricing-conflicted, and blocked.

## Evidence decision

All 20 selected-route records were retrieved and reviewed on 2026-07-13, remain unexpired at the evaluation instant `2026-07-13T12:00:00.000Z`, point to MiniMax primary sources, and replay their stored canonical SHA-256 hashes exactly. Provider-wide records were retained only at provider-wide scope and were not treated as model- or route-specific proof.

Accepted evidence:

- Identity and lifecycle: exact provider/model identity and current model listing.
- Endpoint and routing: MiniMax direct compatible API base URLs and fixed provider domain.
- Context: 204,800 tokens; the exact maximum output remains unknown.
- Capabilities: tool calling accepted; multimodal input rejected for this text API.
- Usage: prompt, completion, total, cache-read/cache-create, and reasoning accounting fields documented; no live billing reconciliation occurred.
- Pricing: USD per 1,000,000 tokens — input 0.30, output 1.20, cache read 0.06, cache write 0.375. The evidence expires 2026-08-12. The current AI-74 integer-minor-unit schema cannot encode the 37.5-cent cache-write unit exactly, so no lossy catalog entry was added.
- Restrictions: service, content, usage, and human legal-review requirements accepted at the stated scope.

Evidence blockers:

- exact maximum output limit unknown;
- strict schema-constrained structured output unknown;
- exact M2.7 rate and concurrency limits unknown;
- inference processing region unknown;
- bounded prompt/output retention unknown;
- general no-training commitment unknown;
- ZDR unknown and not inferred;
- exact security/compliance posture unknown;
- `evidence.extraction.normative_claims` remains unevaluated on registered AI-76 public fixtures;
- exact cache-write pricing cannot be represented without changing AI-74 pricing-unit semantics.

The complete evidence IDs, retrieval/review/expiry dates, applicability, limitations, and hashes remain in `config/ai-provider-evidence.json`; historical AI-82 evidence was not rewritten.

## Adapter, profile, and live-execution decision

- Adapter status: not added.
- Execution profile status: not added.
- Lifecycle/enabled state: `candidate`, `enabled: false`, runtime blocked.
- Adapter registry: no MiniMax Direct or OpenRouter adapter registered.
- Live execution: blocked by readiness; no live flag or secret was inspected.
- Requests executed: 0.
- Actual cost: USD 0.00.
- Authorization consumed: none.
- Durable budget reserved: none, because no transport was eligible.
- Provider output/artifact mutation: none.

The machine-readable controls retain the prospective hard ceilings of 10 requests, concurrency 2, and USD 1.00 total reserved cost. They are limits only, not authorization to execute.

## Safety invariants

1. Exact profile/model/route identity is explicit; substitutions remain blocked.
2. The non-selected OpenRouter route has no pinned endpoint and remains blocked.
3. Privacy, current pricing, durable reservation, AI-80 authorization consumption, registered public fixture identity, and campaign caps must all precede any future transport.
4. Missing secret or disabled execution fails before transport; no secret is created, retrieved, printed, or requested.
5. Maximum one adapter invocation, no fallback, no hidden retry, and abort/timeout propagation remain enforced by the existing gateway tests.
6. Errors and audits remain sanitized and metadata-only; provider metadata cannot enter domain results.
7. Provider output remains draft-only, human-review-required, downstream-blocked, and cannot mutate reviewed or approved artifacts.
8. Durable budget semantics, authorization semantics, capability contracts, review bindings, approved-artifact contracts, and the execution boundary are unchanged.
9. No retired direct-execution path was restored and `vlatam-global` was not modified.

## Validation

- Focused readiness tests: 26 passed, 0 failed.
- Targeted privacy/ZDR, pricing, durable-budget, authorization, gateway,
  benchmark, execution-boundary, credential, absolute-path, leakage, review,
  and approved-artifact isolation matrix: 494 passed, 0 failed.
- Full repository suite: 655 passed, 0 failed.
- Typecheck: passed.
- Build: passed.
- Targeted ESLint: passed for every changed TypeScript file.
- Targeted Prettier: passed for every changed file.
- `git diff --check`: passed.
- Repository-wide lint baseline: 43 pre-existing errors in unchanged crawler
  and legacy validation files (primarily `no-explicit-any`, unused variables,
  and three style errors). No changed file contributes a lint error and no
  unrelated lint debt was modified.
- Evidence scope, official-domain URL structure, retrieval/review/expiry dates,
  canonical hashes, fixed-route identity, disabled/runtime-blocked state,
  execution-profile absence, empty candidate adapter registration, hard caps,
  zero-call/zero-cost state, retired-path absence, provider-metadata leakage,
  credential-shaped fields, and absolute-path leakage: passed.

## Remaining risks and recommended next action

Primary risk is evidence ambiguity, not implementation incompleteness: privacy/processing terms, strict structured output, exact operational limits, and exact capability performance are not proved for this route. Pricing also expires soon and currently has a fractional-cent cache-write unit incompatible with the unchanged AI-74 catalog.

Recommended next action: obtain and human-review exact MiniMax Direct contractual/technical evidence for retention, training, processing region, ZDR, compliance, structured output, output/rate/concurrency limits, and then design a separately reviewed lossless pricing representation that preserves durable-budget semantics. Only after the deterministic result becomes `READY_FOR_DISABLED_ADAPTER` should a disabled adapter/profile PR and mock/replay conformance work be considered; live execution still requires separate explicit authorization.

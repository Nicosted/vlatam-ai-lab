# ADR-003: Capability-Oriented AI Execution

> Numbering note: AI-70 instructs the use of `ADR-007` as a placeholder.
> The repository already contains ADRs `001` and `002` under
> `docs/decisions/`. The next free number is `003`, which is what this
> record uses. Once accepted, all future ADRs in this sequence will
> continue from `004`.

## Status

Accepted (2026-07-11). Documentation-only. This ADR is part of AI-70 and
records an architectural commitment that the AI-71 through AI-78 PRs will
implement incrementally. It does not authorize any of those PRs to merge
without their own review.

## Context

`vlatam-ai-lab` already implements the PCRAM chain end-to-end for the
Argentina classifier scope and is the single authority for reviewed,
versioned, source-backed intelligence. Today the same code reaches the
model world in two ways:

- `src/agents/normative-evidence-agent.ts` imports the OpenAI SDK
  directly and calls DeepSeek by name. The same module hard-codes
  `provider_id="deepseek-chat"` and `model_id="deepseek-chat"` into the
  output. This is the only LLM path used by an end-to-end evidence flow.
- `docs/qwen-langgraph-evidence-extraction-spike.md` documents a parallel
  Qwen/DashScope path that is explicitly spike-only and not wired into
  the runtime. It already introduces a provider-neutral contract
  (`AiExtractionProvider`), which is the shape we want everywhere.

The Cloudflare AI Gateway wrapper at `src/ai/ai-gateway.ts` declares
`deepseek/deepseek-chat` and `@cf/meta/llama-3.1-8b-instruct` as defaults.
It is gated by `CLOUDFLARE_PIPELINE_V1_ENABLED` and currently
passthrough-only.

The next roadmap sequence (AI-71 through AI-78) introduces a multi-
provider gateway, privacy and ZDR, budget governance, evaluation, gold
cases, benchmark runs, and a best-profile router. Those PRs need a stable
seam between the domain layer and the model world, otherwise the
`RouterAgent`, the normative evidence agent, the Cloudflare AI Gateway,
the Qwen/DashScope spike, and any future provider will be welded into
domain code and review will be unable to keep up.

The repository already draws the seam: every `ai-extraction-result` and
every `classifier-intelligence-artifact` carries governance flags
(`human_review_required`, `downstream_allowed`, `review_only`,
`not_final_classification`) in `src/contracts/vlatam-global-bridge.ts`,
and the export contract strips them before serving. The seam we need is
the same idea on the **input** side: a stable, vendor-neutral interface
that the domain layer calls, and that the routing layer resolves.

## Decision

We adopt a **capability-oriented execution** model:

> Domain workflows depend on capability contracts and execution profiles,
> never directly on provider-specific SDKs or model names.

A **capability** is a stable, domain-level unit of AI work. An
**execution profile** is a governed combination of `(capability, provider,
model, configuration, privacy policy, budget policy, lifecycle status,
evaluation record)`. The routing layer (AI-78) selects a profile; the
domain layer never names a profile, a provider, or a model.

Concretely:

1. The capability catalog lives at `config/ai-capabilities.json`. Each
   record has a `capability_id`, a `name`, a `domain`, a `status`, a
   `risk_tier`, a `human_review` flag, a `downstream_policy` block, a
   `provider_execution` field, and a `roadmap_owner`. It does **not**
   include credentials, pricing, secrets, or `provider_id`/`model_id`
   values bound to a domain capability.
2. The domain layer (evidence writer, router agent, advisory
   workspace, future logistics/payments/supplier/customer modules)
   depends only on capability contracts (AI-71). It never imports a
   provider SDK.
3. The provider adapters (AI-72) are the only place provider knowledge
   lives. They normalize to a shared `AIGatewayResponse` shape and never
   return vendor response objects upward.
4. Governance, evaluation, and routing layers (AI-73/74/75/77/78)
   consume capability contracts. They never make a decision based on
   vendor metadata; cost and quality signals come from the adapter
   layer, normalized to the contract.
5. Approved exports never carry provider metadata. The export contract
   surface in `docs/integration/vlatam-global-api-contract.md` is
   preserved verbatim.

The current `src/agents/normative-evidence-agent.ts` direct OpenAI/DeepSeek
import is **frozen** by this ADR. It will be removed in AI-72; until then,
its calls must be treated as a temporary adapter that the routing layer
will absorb. The Qwen/DashScope spike remains a fixture/replay path
only; it is not the gateway.

## Alternatives considered

### A. Keep the current direct-import pattern, add more providers as needed

- **Pro:** lowest short-term effort; no new contract surface.
- **Con:** every new provider requires touching every domain agent.
- **Con:** vendor metadata leaks upward (the `ai-extraction-result` schema
  already records `provider_id`/`model_id`; that is acceptable for the
  draft record but is forbidden in the export contract).
- **Con:** budget/privacy/evaluation logic would have to be re-implemented
  in every domain module.
- **Verdict:** rejected. This is exactly the pattern we are moving away
  from.

### B. Single-provider abstraction (e.g. always DeepSeek)

- **Pro:** simpler than multi-provider.
- **Con:** locks the lab into one provider's availability, pricing, and
  policy posture. Violates safety invariant 7 (portability across
  providers).
- **Verdict:** rejected.

### C. Capability-oriented execution (this ADR)

- **Pro:** isolates the domain from vendors; enables privacy, budget,
  evaluation, and routing to live in one place; makes gold cases and
  benchmarks portable.
- **Pro:** matches the existing shape of the Qwen/DashScope spike
  (`AiExtractionProvider`).
- **Pro:** keeps the export contract unchanged.
- **Con:** requires a contract layer (AI-71) and an adapter layer
  (AI-72) before the benefits appear.
- **Con:** the current direct-import must be unwound in AI-72.
- **Verdict:** accepted.

### D. Best-of-breed per capability, but allow ad-hoc env-var selection

- **Pro:** operational flexibility.
- **Con:** scattered env-var conditionals are exactly what ADR-003
  forbids; they bypass the capability contract and the audit record.
- **Verdict:** rejected.

## Positive consequences

- Domain code stays portable across providers and across Cloudflare
  workers, local runtimes, and external APIs.
- The capability catalog at `config/ai-capabilities.json` becomes a
  single, declarative inventory that documentation, tests, and
  governance can verify.
- Privacy (AI-73), budget (AI-74), evaluation (AI-75), and routing
  (AI-78) compose without touching the domain layer.
- Approved exports remain unchanged. The contract surface in
  `docs/integration/vlatam-global-api-contract.md` is preserved
  verbatim.
- The Qwen/DashScope spike, the Cloudflare AI Gateway wrapper, and
  any future provider integration all land in the same adapter layer
  (AI-72).
- The `RouterAgent` and the future `BestProfileRouter` share a common
  vocabulary.

## Negative consequences

- A new layer of indirection (the capability contract) is required
  before any new provider can be used in production. AI-72 will have to
  migrate the existing `openai` import out of the normative evidence
  agent.
- Provider-specific features (e.g. tool use, structured output) must be
  expressed as capability-level features, not as raw SDK calls. The
  contract may need to grow over time to cover them.
- The Cloudflare AI Gateway wrapper currently has hard-coded default
  models; those defaults must move into the capability catalog and the
  adapter registry, not into the wrapper.
- Shadow execution, which is required for safe profile promotion, adds
  latency and cost discipline overhead. The architecture considers this
  a feature, not a regression.

## Migration implications

- **AI-72 (multi-provider gateway).** Move the OpenAI import out of
  `src/agents/normative-evidence-agent.ts` and into a provider adapter.
  Replace the `provider_id`/`model_id` literals in the agent with a
  capability invocation that resolves to an adapter. The output
  `ai-extraction-result` keeps the same fields (they are still useful
  for internal audit) but the agent no longer imports `openai`.
- **AI-72 (Cloudflare AI Gateway).** Convert `src/ai/ai-gateway.ts` from
  a hard-coded model wrapper into a generic adapter that accepts a
  `(capability, profile)` pair and normalizes the response. The
  passthrough behavior when the feature flag is off is preserved.
- **AI-72 (Qwen/DashScope).** The spike remains fixture/replay only.
  A real adapter can land once the capability contract is in place.
- **AI-73/74/75/77/78.** Compose against the capability catalog. No
  domain code is modified; the new layers consume the catalog and the
  adapter.
- **`config/ai-capabilities.json`.** Becomes the single inventory.
  `tests/architecture/ai-capabilities.test.ts` validates the schema,
  uniqueness, allowed enums, absence of credential-like fields, and
  absence of `provider_id`/`model_id` bound to domain capabilities.

## Enforcement rules

The following rules are mandatory. They apply to every PR from AI-71
onwards and to every module under `src/agents/`, `src/advisory/`,
`src/contracts/`, and the future `src/capabilities/` (if created).

1. **No direct provider SDK imports from domain code.** Imports of
   `openai`, `anthropic`, `@google-cloud/vertexai`, `@alicloud/dashscope`,
   `@dashscope/...`, `@cloudflare/ai`, or any equivalent are forbidden
   outside the adapter layer. Tests that need a provider must use a
   fake provider (the existing pattern in `tests/workflows/`).
2. **No vendor response objects as domain artifacts.** Adapters return
   `AIGatewayResponse` (or its successor). The domain layer never
   receives a `ChatCompletion`, a `GenerateContentResponse`, a DashScope
   `CompletionResponse`, or a `Message` from a vendor SDK.
3. **No env-var-conditional model selection.** Model selection is made
   by the routing layer against the capability catalog. Environment
   variables may configure the catalog only; they may not bypass it.
4. **No provider metadata in approved exports.** The export contract
   surface is fixed. `provider_id`, `model_id`, prompt hashes, and
   vendor error codes are stripped or never written.
5. **Budget cannot override privacy or review.** A cheaper profile
   cannot be selected if it would bypass the privacy tier, the ZDR
   class, the human-review requirement, or the allowlist.
6. **Unknown configurations fail closed.** Unknown `capability_id`,
   unknown lifecycle state, unknown governance decision, or unknown
   profile all return a review-required response and emit an audit
   record. There is no silent fallback to a default provider.
7. **Reviewed evidence is the only path to downstream.** Model
   performance scores and budget savings never promote a draft to
   approved status.
8. **Shadow outputs are auditable, not operational.** A shadow or
   candidate profile may run for evaluation, but its output is recorded
   separately and must never appear in the operational response or
   cross the export boundary.
9. **Human review is required for the regulated subset, not the
   mechanical subset.** A capability's `human_review` field may be
   `false` only when the capability is mechanical, infrastructural, a
   transport layer, or applies a previously approved rule. The catalog
   at `config/ai-capabilities.json` partitions every capability into
   the regulated set (`human_review: true`) or the mechanical set
   (`human_review: false`); both sets are positive lists, and adding
   a new capability requires adding it to one of them. A
   `human_review: false` capability may have `downstream_allowed: true`
   only when it only serves or consumes pre-approved artifacts (the
   serve-only allowlist, currently `artifact.approved.serve_http`). No
   `human_review: false` capability may produce or promote regulated
   approved intelligence; that requires `human_review: true`.

The catalog validator in `tests/architecture/ai-capabilities.test.ts`
enforces rules 1, 2, 4, and 9 at the static level: it rejects
`provider_id`/`model_id` fields bound to a domain capability, rejects
credential-shaped fields, and asserts the regulated/mechanical
partition and the downstream-allowed invariant. The remaining rules
are enforced at the runtime level by AI-72 through AI-78 and by the
existing tests in `tests/agents/`.

## References

- `docs/architecture/ai-system-architecture.md` — layer definitions and
  safety invariants.
- `docs/architecture/ai-capability-map.md` — capability inventory.
- `docs/architecture/ai-roadmap-dependency-map.md` — sequence and gates.
- `config/ai-capabilities.json` — declarative inventory.
- `docs/decisions/001-add-evidence-refs-to-packet-schema.md` — prior
  schema-level decision.
- `docs/decisions/002-governance-extraction-behavior.md` — review
  semantics.
- `src/contracts/vlatam-global-bridge.ts` — governance types already in
  use.
- `docs/qwen-langgraph-evidence-extraction-spike.md` — example of the
  provider-neutral contract we want everywhere.
- `src/ai/ai-gateway.ts` — gateway skeleton to be generalized in
  AI-72.
- `src/agents/normative-evidence-agent.ts` — direct-import that
  AI-72 must move behind the adapter.
- `docs/integration/vlatam-global-api-contract.md` — fixed export
  surface that this ADR preserves.

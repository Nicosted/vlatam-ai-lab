# AI-72 Multi-Provider Gateway

Status: local implementation. This layer is additive and production-isolated.

## Responsibilities and lifecycle

The caller submits a provider-neutral `CapabilityRequest` and an explicit `execution_profile_id`. The gateway validates both, checks that their capability IDs match, resolves one registered adapter, executes it once, parses its structured response, projects it into a provider-neutral draft result, validates the AI-71 `CapabilityResult`, and emits a metadata-only audit record.

```text
CapabilityRequest + explicit profile ID
  -> profile catalog
  -> multi-provider gateway
  -> exactly one adapter (replay | DeepSeek compatible | DashScope compatible)
  -> normalized structured output
  -> AI-71 CapabilityResult (pending review, downstream blocked)
```

The gateway does not infer a profile. It contains no ranking, fallback, cross-provider retry, shadow execution, profile promotion, privacy enforcement, budget enforcement, evaluation, benchmark, or production persistence.

## Execution profile catalog

`config/ai-execution-profiles.json` is validated by `schemas/ai-execution-profiles.schema.json`. It carries provider/model identifiers and normalized generation configuration, but never credentials. All profiles are honestly marked `candidate`; live profiles are disabled. Enabled `shadow` profiles are rejected.

- `normative-claims.replay.v1`: enabled deterministic local replay.
- `normative-claims.deepseek.v1`: disabled DeepSeek OpenAI-compatible candidate.
- `normative-claims.dashscope.v1`: disabled DashScope OpenAI-compatible candidate.

## Adapter boundary and execution modes

Only `src/providers/` knows provider IDs, models, request/response formats, endpoints, authentication variable names, or provider exception shapes. The registry is explicit and never dynamically loads modules. Unknown and duplicate IDs fail closed.

Replay loads repository-owned fixtures and supports success, malformed response, provider error, timeout, and blocked outcomes without network access. Live adapters set SDK retries to zero and require `AI_LAB_LIVE_PROVIDER_EXECUTION_ENABLED=true`, a provider flag (`AI_LAB_DEEPSEEK_ENABLED` or `AI_LAB_DASHSCOPE_ENABLED`), and the existing credential variable. Missing flags or credentials fail closed. No raw response escapes.

## Structured output and AI-71 compatibility

The legacy `ai-extraction-result` schema requires `provider_id` and `model_id`, while the AI-71 `CapabilityResult` validator forbids those keys anywhere in a domain result. AI-72 treats them as adapter-boundary metadata: the capability-specific parser validates strict normative-claim fields and evidence references, removes those two fields, rejects every other unexpected field, then builds the provider-neutral result. The legacy schema and workflows remain unchanged.

Outputs are always `human_review_required=true`, `approval_state=pending`, and `downstream_allowed=false`. Successful execution is a draft, not approved intelligence.

## Errors, cancellation, and audit safety

Stable AI-72 errors map to the closed AI-71 error vocabulary. Raw messages, status bodies, stack traces, credentials, and provider errors are never returned. Timeouts are bounded to 120 seconds and `AbortSignal` reaches adapters. There is no retry or fallback.

Audit records contain identifiers, lifecycle/mode, timestamps, duration, normalized usage, result/error status, and contract versions. They exclude prompts, messages, source payloads, excerpts, PII, credentials, raw responses, reviewer identity, and artifact content. Records remain in memory.

## Direct-provider migration inventory

| Current module | Provider | Current status | AI-72 action | Future requirement |
| --- | --- | --- | --- | --- |
| `src/agents/normative-evidence-agent.ts` | DeepSeek/OpenAI SDK | Real direct credential-dependent path | Left unchanged; side-by-side adapter added | Migrate caller after workflow approval |
| `scripts/run-extraction.ts` | DeepSeek/OpenAI SDK | Real manual CLI path | Left unchanged | Replace with explicit profile invocation |
| `src/ai/ai-gateway.ts` | Cloudflare AI Gateway | Partial/gated; includes fallback | Not reused | Remove fallback before future adapter work |
| Qwen docs and snapshots | DashScope/Qwen | Fixture/spike only; runtime source absent | Replay plus disabled adapter | Restore only through reviewed gateway invocation |
| embedding scripts and Worker binding | Cloudflare Workers AI | Specialized embedding paths | Out of scope; unchanged | Consider a separate embedding adapter |

> **Resolution (2026-07-13, governed-execution-boundary PR):** every row in
> the inventory above was retired rather than migrated. The direct DeepSeek
> agents, the extraction CLI, the Cloudflare AI Gateway wrapper (and its
> fallback chain), the legacy Worker, and the Workers AI embedding paths were
> removed from the repository. The Qwen/DashScope spike remains
> documentation and sanitized fixtures only. Provider execution now exists
> exclusively through this gateway and its adapter layer, enforced by
> `tests/architecture/execution-boundary.test.ts`.

## Deferred roadmap

AI-73 privacy/ZDR, AI-74 budget governance, AI-75 evaluation, AI-76 gold cases, AI-77 benchmarks, and AI-78 ranking/automatic routing remain unimplemented. Approved artifact/export semantics and `vlatam-global` are unchanged.

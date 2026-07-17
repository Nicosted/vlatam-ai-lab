# Cloudflare Agents, Workflows and Durable Objects assessment — AI-121

Evidence snapshot: 2026-07-17. Observed Agents package: `agents@0.17.4`. Candidate state: `discovered`, disabled, unapproved, benchmark-ineligible, active kill switch.

## Executive summary

Official sources establish credible stateful-agent and durable-workflow primitives, but not activation readiness. The candidate is a Cloudflare-coupled composition of Agents SDK, Durable Objects and Workflows. Workers AI is evaluated only as a separate inference candidate. Independent conformance, security, legal/privacy and exact cost reconciliation remain incomplete.

## Architecture and runtime boundary

An `Agent` is built on a Durable Object and requires a Durable Object binding plus SQLite migration. Each identity has per-object state, storage, WebSockets, scheduling, MCP and model/provider integration. Workflows supply durable multi-step execution and external-event waits. Deployment is materially coupled to Workers, Durable Objects, Wrangler bindings and Cloudflare's managed platform.

## Inference boundary

Agents can call Workers AI or other model providers, but the runtime and inference layers remain separate. Workers AI is not a runtime: it is a mutable model catalog and inference service with per-model/token/neuron pricing and selected-model JSON Mode. JSON Mode can fail schema satisfaction and does not support streaming. AI LAB must register it only as a separately governed inference candidate.

## Durability, state, resume and cancellation

Durable Objects provide globally unique single-threaded coordination and private transactional, strongly consistent storage per object; alarms schedule wakeups and WebSocket hibernation preserves connections while permitting compute hibernation. Workflows persist step state, retry steps, sleep, wait for external events, and expose pause/resume/terminate operations. Exactly-once external side effects are not guaranteed: Cloudflare directs developers to make retryable steps idempotent. A universal Agent-turn cancellation and replay contract matching AI-120 was not established.

## Human review and multi-agent capability

Official documentation covers Workflow approval waits, MCP elicitation and Code Mode approval. The repository documents parent/child Durable Object composition and subagent tools. These are useful runtime primitives but cannot replace AI LAB evidence review, authorization or promotion authority.

## Sandbox and isolation

The repository documents sandboxed execution inside an isolated Worker with a virtual filesystem. Public evidence captured here does not close egress, resource, persistence, tenant-isolation or external-tool boundaries. Independent security testing is required.

## Observability and cost readiness

Agents diagnostics cover RPC, state, scheduling, workflow, MCP, lifecycle and recovery events. Workflows add built-in instance visibility. Mappings to AI-120 are mostly inferred or implementation-specific; generic turn/action/result/usage semantics remain incomplete. Public metering covers Workers/Workflow requests and CPU, Workflow steps/storage, and Durable Object requests/duration/storage, but exact per-session reconciliation across runtime, storage and inference is absent. Workflows step/storage billing is announced no earlier than 2026-08-10, so pricing evidence expires before that change.

## Privacy, reasoning and location risks

No public evidence captured establishes chain-of-thought availability or retention across Agents/model providers; the correct status is unknown. AI LAB adapters must never persist private reasoning. Durable Object jurisdiction restrictions cover object execution/persistence for EU, US and FedRAMP-Moderate, but requests may originate elsewhere and object IDs may be logged outside the jurisdiction. Workers AI states customer content is not used for training or service improvement without explicit consent, but that claim does not automatically cover other providers selected through Agents.

## Operational maturity and release stability

The package remains `0.x`; release notes and the repository describe fast evolution. No stable/GA API commitment was captured. Cloudflare's primitives are operational products, but the combined AI LAB runtime profile has not been tested.

## Historical evidence lineage

The 2026-06-15 infrastructure audit is `historical`; the pipeline plan and setup guide are `retired`; local mocked Workflow code is `insufficient` as platform evidence. They remain preserved for lineage and do not authorize current deployment.

## Evidence gaps and AI LAB implications

Open gaps include stable generic runtime events, recursive cancellation/replay, duplicate delivery and external-action recovery, reasoning retention, sandbox guarantees, cross-component cost attribution, authentication/tenant controls and independent conformance results. A future adapter must preserve per-component identity and reject undocumented equivalence.

## Lifecycle recommendation

Remain `discovered`. Do not move to `sandbox_only` until independent review, legal/privacy/security review, complete cost contract, synthetic conformance gold cases and a separately approved local sandbox runner exist. Evidence capture cannot activate, score or promote the candidate.

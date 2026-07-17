# Vercel Eve runtime assessment — AI-121

Evidence snapshot: 2026-07-17. Observed package: `eve@0.24.6`. Candidate state: `discovered`, disabled, unapproved, benchmark-ineligible, active kill switch.

## Executive summary

Current official repository, release and documentation evidence is sufficient to assess Eve's architecture, not to activate it. Eve exposes a unusually complete runtime protocol—durable sessions, run/session identifiers, continuation tokens, replayable NDJSON events, cancellation, approvals, structured results and subagents—but is explicitly beta. Independent conformance, security, legal/privacy and cost review remain absent.

## Architecture and boundaries

Eve is a filesystem-first TypeScript framework: `instructions.md`, `agent.ts`, and optional `tools/`, `skills/`, `channels/`, `schedules/` and `subagents/`. The public package requires Node.js 24+. The runtime boundary owns durable sessions, tools, sandbox adapters, event streams and channels. Models remain a separate inference dependency selected by configuration; Eve is not itself a model or inference provider.

## Durability, state, resume and cancellation

The pinned `0.24.6` session contract distinguishes channel-owned `continuationToken` from runtime-owned `sessionId`/`runId`. It documents durable, checkpointed, replayable event streams, absolute/tail-relative rewind, stale-token rejection, waiting/resume, and recursive cancellation requests for adopted child sessions. These are implementation/documentation findings, not AI LAB conformance results. Crash, deploy, ordering, duplicate-delivery and partial-side-effect tests remain required.

## Human review and multi-agent capability

`input.requested` can park a run for a question or approval. Authorization challenge events exist for connections. Subagents run as child sessions with separate streams and IDs. None of these vendor primitives may issue AI LAB authorization, approve evidence, score a candidate or promote lifecycle state.

## Sandbox and isolation

Package exports and official documentation identify Vercel Sandbox, Docker, microsandbox and just-bash adapters. This supports an architectural portability hypothesis, not a portability or isolation guarantee. Vercel OIDC, Sandbox, Workflow and SDK dependencies show meaningful managed-platform coupling. Egress, filesystem persistence, resource ceilings and adapter equivalence remain unverified.

## Observability and cost readiness

The session protocol exposes detailed lifecycle/action/usage events; the package exports eval and instrumentation surfaces. Usage appears on step completion. No exact contract was found that reconciles model, gateway, Workflow, sandbox, channel and storage charges into one immutable per-run cost record. Cost-accounting confidence remains low.

## Privacy and reasoning retention risk

This is a critical blocker. Eve publicly documents `reasoning.appended` and `reasoning.completed`, including cumulative reasoning text, and warns about privacy, confidentiality, display, storage and transmission. AI LAB adapters must disable or redact these events and must never persist private model reasoning or chain-of-thought. Continuation tokens and authorization challenges also require redaction and scoped access.

## Operational maturity and release stability

Vercel describes production use, eval gates and preview deployments, but those vendor claims are not independent readiness evidence. The README explicitly says Eve is beta and its framework, APIs, documentation and behavior may change before GA. Release/API change risk is high.

## Evidence gaps and AI LAB implications

Open gaps include data retention and geography by deployment mode, source-level disablement of reasoning events, sandbox isolation/egress guarantees, stable migration commitments, cost reconciliation, and independent failure-injection results. A future adapter must normalize only permitted metadata/output/tool/approval evidence and treat Eve authorization as an external event, never control-plane authority.

## Lifecycle recommendation

Remain `discovered`. Evidence admission is complete enough for architecture review only. Do not move to `sandbox_only` until the pack is independently reviewed, legal/security/privacy findings are resolved, the reasoning blocker is enforced, a complete cost contract exists, and synthetic runtime conformance gold cases are approved. Evidence capture cannot promote or activate the candidate.

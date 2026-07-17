# ADR-004: AI LAB Is the Neutral Tournament Control Plane

- Status: accepted for architecture/contracts only
- Date: 2026-07-17

## Context

AI LAB must compare agent runtimes, inference gateways, models and exact provider endpoints continuously without treating unlike layers as interchangeable or allowing a vendor to control the evidence used to select it.

## Decision

AI LAB owns candidate registration, immutable benchmark selection, policy equivalence, normalized event/result contracts, evaluators, scoring/disqualification, budgets, evidence lineage, human review and lifecycle recommendations. Vercel Eve, Cloudflare Agents SDK/Workflows, OpenRouter, Workers AI, Vercel AI Gateway, models and provider endpoints are evaluated components.

No evaluated component may select its evaluator/cases, control scoring, approve evidence, reconcile its own cost without independent verification, promote itself, allocate traffic or weaken privacy/authorization/safety. Rankings are per quality, value, reliability, privacy/governance and capability; there is no universal winner. Promotion/regression is explicit, human-governed and evidence-backed.

## Consequences

Component identities and versions stay separate in every execution profile and result. Critical governance failures disqualify. Frontier models have no default preference. Traffic never becomes 100% by default. The Operator surface remains read-only. AI-120 adds no scheduler, runtime, adapter, external call or activation path.

# ADR-004: AI LAB Is the Neutral Tournament Control Plane

- Status: accepted for architecture/contracts only
- Date: 2026-07-17

## Context

AI LAB must compare agent runtimes, inference gateways, models and exact provider endpoints continuously without treating unlike layers as interchangeable or allowing a vendor to control the evidence used to select it.

## Decision

AI LAB owns candidate registration, immutable benchmark selection, policy equivalence, normalized event/result contracts, evaluators, scoring/disqualification, budgets, evidence lineage, human review and lifecycle recommendations. Vercel Eve, Cloudflare Agents SDK/Workflows, OpenRouter, Workers AI, Vercel AI Gateway, models and provider endpoints are evaluated components.

AI-121 makes the admission boundary explicit:

- public evidence admission is separate from runtime admission;
- evidence capture never activates or promotes a candidate;
- vendor documentation is evidence input, never self-approval;
- AI LAB requires independent conformance testing before runtime admission;
- runtime and inference identities remain separate, including Workers AI;
- Vercel Eve and Cloudflare compete under the same evidence, event, privacy, cost and lifecycle contract; and
- no vendor or candidate may score, approve evidence for, or promote itself.

No evaluated component may select its evaluator/cases, control scoring, approve evidence, reconcile its own cost without independent verification, promote itself, allocate traffic or weaken privacy/authorization/safety. Rankings are per quality, value, reliability, privacy/governance and capability; there is no universal winner. Promotion/regression is explicit, human-governed and evidence-backed.

## Consequences

Component identities and versions stay separate in every execution profile and result. Critical governance failures disqualify. Frontier models have no default preference. Traffic never becomes 100% by default. The Operator surface remains read-only. AI-120 adds no scheduler, runtime, adapter, external call or activation path.

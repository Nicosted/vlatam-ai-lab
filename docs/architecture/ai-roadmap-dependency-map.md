# AI Roadmap Dependency Map (AI-70)

Status: documentation-only. Pairs with
`docs/architecture/ai-system-architecture.md` and
`docs/architecture/ai-capability-map.md`. The order below is normative:
each PR consumes the outputs of the PRs before it and may not bypass a
prior layer.

## 1. Sequence

| PR        | Title                                               | Primary outputs                                                                                                                                                                    | Consumes                                                                                                     | Required next                                               |
| --------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| **AI-70** | Architecture and capability map                     | Architecture document, capability map, ADR-003, `config/ai-capabilities.json`                                                                                                      | repository audit (this PR)                                                                                   | enables AI-71                                               |
| **AI-71** | Capability contracts                                | Executable capability contracts: stable `capability_id`, request/response schemas, governance pre/post-conditions, downstream-safety class, human-review requirement, policy block | AI-70 inventory; existing schemas under `schemas/`; `src/contracts/vlatam-global-bridge.ts` governance types | enables AI-72, AI-73, AI-74, AI-75                          |
| **AI-72** | Multi-provider gateway                              | Provider adapters, model registry, retries, normalization, gateway facade                                                                                                          | AI-71 contracts; existing `src/ai/ai-gateway.ts` wrapper; DeepSeek + Qwen/DashScope spike code               | enables AI-73 (privacy runs at the adapter boundary)        |
| **AI-73** | Privacy and ZDR                                     | Data classification, ZDR enforcement at the adapter boundary, retention rules, allowlists                                                                                          | AI-71 contracts; AI-72 adapters                                                                              | enables AI-74 (budget cannot relax privacy)                 |
| **AI-74** | Budget governor                                     | Per-profile/per-window spend caps, soft-degrade, hard-fail, audit                                                                                                                  | AI-71 contracts; AI-72 adapter cost fields; AI-73 retention/privacy decisions                                | enables AI-78 (router needs budget signals)                 |
| **AI-75** | Evaluation framework                                | Evaluator contracts (deterministic + LLM-as-judge), per-capability metric set                                                                                                      | AI-71 contracts; AI-72 adapter output shapes; existing `tests/` schema-validation pattern                    | enables AI-76 (gold cases) and AI-77 (benchmarks)           |
| **AI-76** | Gold cases                                          | Reviewed, versioned gold-case fixtures, per capability                                                                                                                             | AI-75 evaluator contracts; existing `snapshots/pcram/` review manifest schema                                | enables AI-77 (benchmarks)                                  |
| **AI-77** | Benchmark runner                                    | Reproducible benchmark runs that produce evaluation records per profile                                                                                                            | AI-72 adapters; AI-73 privacy; AI-74 budget; AI-75 evaluators; AI-76 gold cases                              | enables AI-78 (router uses evaluation records)              |
| **AI-78** | Best-profile router (delivered)                     | Capability-based selection with policy filtering, evaluation-based ranking, lifecycle state enforcement                                                                            | All prior PRs                                                                                                | enables AI-79                                               |
| **AI-79** | Reviewed routing decision handoff (delivered)       | Human-authorized, gateway-only routing handoff                                                                                                                                     | AI-78 decisions                                                                                              | enables AI-80                                               |
| **AI-80** | Durable authorization consumption (delivered)       | Repository-owned single-use authorization consumption                                                                                                                              | AI-79 authorization                                                                                          | enables AI-81                                               |
| **AI-81** | Provider evidence and candidate readiness (current) | Expiring reviewed evidence contracts and disabled candidate readiness                                                                                                              | AI-73 privacy; AI-74 pricing; AI-78 routing; AI-80 consumption                                               | enables reviewed adapter work only after evidence decisions |

## 2. Why AI-78 is not a "cheapest model" selector

The danger of stopping at AI-72 + AI-78 is that a router might optimize
only for cost. The architecture forbids that. Specifically, the AI-78
router must:

1. Filter by capability and by governance (privacy tier, ZDR class,
   human-review requirement). Cost is **not** in this filter.
2. Apply the provider allowlist defined by the capability contract.
3. Rank the surviving profiles by their evaluation record (quality,
   latency, cost, safety). Cost is one of four signals, all weighted by
   capability contract defaults.
4. Prefer `production` profiles; `candidate` and `shadow` are out of the
   operational path. A profile only enters the operational path after a
   human-reviewed promotion from `candidate` to `production` based on an
   AI-77 evaluation record.
5. Fail closed on unknown profile, unknown lifecycle, or unknown
   governance state. The router must never fall back to a default
   provider or model silently.

A simple "cheapest model" selector would violate safety invariants 3, 7,
and 8 in `docs/architecture/ai-system-architecture.md`. It would also
violate ADR-003's "Domain workflows depend on capability contracts and
execution profiles, never directly on provider-specific SDKs or model
names."

## 3. Cross-cutting invariants

These invariants apply to every PR from AI-71 through AI-78:

- Approved exports never carry provider metadata, reviewer identity, or
  review timestamps. The export contract surface in
  `docs/integration/vlatam-global-api-contract.md` is fixed.
- `vlatam-global` remains a read-only consumer. No provider credentials,
  no shared database, no write operations.
- Human review is mandatory for every capability that influences a
  regulated decision. Evaluation scores and budget savings never bypass
  review.
- The repo-first model in `docs/ai-lab-persistence-boundary.md` remains
  the source of truth. Supabase is not added by any of the PRs in this
  sequence unless a future, separately-approved persistence plan
  authorizes it.
- The current production-isolation rules in `AGENTS.md` (no production
  credentials, no production services, no destructive commands, no
  rewriting history) continue to apply.

## 4. Acceptance gates

A PR is considered ready to merge only when:

- the deliverable matches the row above;
- the dependency row above is satisfied (e.g. AI-78 cannot merge before
  AI-77 evaluation records exist);
- the safety invariants are demonstrably preserved by tests;
- the capability map and `config/ai-capabilities.json` are updated for
  any new capability introduced;
- the corresponding row in this document is updated to mark the PR
  `delivered` with a date.

## 5. What AI-70 is **not**

AI-70 is documentation and a declarative inventory. It does not:

- introduce a runtime registry;
- introduce new tests beyond the lightweight catalog validation in
  `tests/architecture/ai-capabilities.test.ts`;
- modify the existing approved export contract;
- change the API surface;
- replace any existing module under `src/agents/`, `src/advisory/`,
  `src/contracts/`, or `src/server/`.

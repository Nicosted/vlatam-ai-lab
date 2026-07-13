# AI System Architecture (AI-70)

Status: documentation-only. Defines the target architecture for the
`vlatam-ai-lab` intelligence system. No runtime code, provider adapters, or
gateway logic is added by this document.

This document is the architectural foundation for AI-70 through AI-78. It
describes the system as it is **today** and as it must evolve to support a
governed, multi-provider, evidence-bound intelligence flow. It does not
implement any of the later PRs; later PRs must each scope themselves to one or
more layers below and must not bypass the invariants listed at the end.

## 1. Purpose

`vlatam-ai-lab` already implements the PCRAM chain end-to-end for the
Argentina classifier scope (Phases 1–9): source monitoring, snapshotting,
delta analysis, evidence extraction, human review, approved export contracts,
and a read-only HTTP API. The next roadmap sequence introduces capability
contracts, multi-provider execution, privacy and ZDR enforcement, budget
governance, evaluation, and a best-profile router.

AI-70 captures the architecture that makes that roadmap possible. The
principle is simple:

> Domain workflows request **capabilities**; capabilities are resolved to
> **execution profiles**; execution profiles may call **providers**; provider
> output never crosses the approved export boundary.

The rest of the document names each layer, what already exists, what is
intentionally out of scope, and which invariant each layer must enforce.

## 2. Existing surface (as audited on this branch)

> **Update (2026-07-13, governed-execution-boundary PR):** the pre-AI-72
> direct execution rows below (Normative Evidence Agent, Router Agent and
> the specialized ARCA/VUCE/InfoLEG agents, and the Cloudflare AI Gateway
> wrapper) were retired and removed from the repository. Provider execution
> now exists only through the AI-72 MultiProviderGateway; the boundary is
> enforced by `tests/architecture/execution-boundary.test.ts`. The table is
> retained as the AI-70 point-in-time inventory.

The current repository already contains the following components, which AI-70
preserves and reorganizes rather than replaces. The "agent modules" count
below is `12` — every file under `src/agents/` that defines an agent class
or a PCRAM step. The shared `src/agents/types.ts` is excluded from the
count; the HTTP `API Server` lives under `src/server/`, not `src/agents/`,
and is listed separately. Every component below is reflected in the
machine-readable catalog at `config/ai-capabilities.json`.

| Component | Path | Status |
| --- | --- | --- |
| Source Monitor | `src/agents/source-monitor.ts` | existing |
| Snapshot Writer | `src/agents/snapshot-writer.ts` | existing |
| Delta Analyzer | `src/agents/delta-analyzer.ts` | existing |
| Evidence Writer | `src/agents/evidence-writer.ts` | existing |
| Human Review Gate | `src/agents/human-review-gate.ts` | existing |
| Export Contract | `src/agents/export-contract.ts` | existing |
| Normative Evidence Agent (DeepSeek) | `src/agents/normative-evidence-agent.ts` | existing (fixture-driven) |
| Router Agent + specialized agents (ARCA/VUCE/InfoLEG) | `src/agents/router-agent.ts` | existing |
| API Server (read-only HTTP) | `src/server/api-server.ts` | existing |
| Cloudflare AI Gateway wrapper (skeleton) | `src/ai/ai-gateway.ts` | partial |
| CountryAdapter interface (CL/UY/PY planned) | `src/adapters/types.ts` | partial (interface only) |
| Regulatory Research Workspace | `src/advisory/regulatory-research-workspace.ts` | partial (read-only HTML, draft) |
| Regulatory Advisory Read Model | `src/advisory/regulatory-advisory-read-model.ts` | partial (checklist, draft) |
| Qwen/DashScope extraction spike | `docs/qwen-langgraph-evidence-extraction-spike.md`, `snapshots/qwen/` | partial (spike only) |
| Schema registry | `schemas/schema-registry.json` | existing |
| Approved export bundle | `exports/approved-catalog/`, `docs/approved-export-bundle-consumer-contract.md` | existing |
| Multi-country design (doc only) | `docs/multi-country-architecture-design.md` | partial (design only) |

The current implementation already enforces the doctrine:

- Every `ai-extraction-result` carries `human_review_required: true` and
  `downstream_allowed: false` (see `schemas/ai-extraction-result.schema.json`
  and `src/agents/human-review-gate.ts`).
- Exports fail closed unless the artifact is `reviewed_approved` and
  `downstream_allowed: true` (see `src/agents/export-contract.ts`).
- The HTTP API validates exports against
  `schemas/classifier-approved-artifact-export.schema.json` and exposes only
  the read-only fields the contract permits
  (`docs/integration/vlatam-global-api-contract.md`).
- `vlatam-global` is a strictly read-only consumer
  (`docs/integration/vlatam-global-api-contract.md`,
  `AGENTS.md`).

AI-70 does not change any of this.

## 3. Layered architecture

The target system is organized into eight layers. Each layer has a single
responsibility, an explicit "may depend on" set, and an explicit "must not
depend on" set. Provider knowledge, vendor metadata, and unreviewed LLM
output are confined to the lower layers and never cross the approved export
boundary.

```mermaid
flowchart TB
  subgraph SL["1. Source & Evidence Layer"]
    SO[Official sources<br/>ARCA / InfoLEG / VUCE / MERCOSUR]
    SP[Snapshot writer<br/>data/sources/&lt;id&gt;/&lt;date&gt;.json]
    PR[Source provenance<br/>+ content hash + review_status]
    EV[Evidence packets<br/>snapshots/pcram/extractable-evidence-packet-*.json]
    RR[Regulatory research inputs<br/>data/fixtures/advisory/*]
  end

  subgraph DL["2. Domain Intelligence Layer"]
    CI[Classifier intelligence<br/>src/agents/evidence-writer.ts]
    RA[Regulatory advisory research<br/>src/advisory/*]
    LI[(Future) Logistics intelligence]
    PI[(Future) Payments / supplier / customer intelligence]
    DW[Domain workflows request capabilities, not vendors]
  end

  subgraph CC["3. Capability Contract Layer (AI-71)"]
    CID[Stable capability_id]
    CTX[Request / response contracts]
    DSC[Downstream-safety class]
    HR[Human-review requirement]
    POL[Policy requirements]
  end

  subgraph ML["4. Model Execution Layer (AI-72)"]
    A1[Provider adapter A]
    A2[Provider adapter B]
    A3[Local runtime adapter]
    GW[Multi-provider gateway]
    MOD[Models and inference profiles]
  end

  subgraph GL["5. Governance Layer (AI-73 / AI-74)"]
    PRV[Privacy & ZDR]
    CL[Data classification]
    BG[Budget governor]
    AL[Allowlists]
    AU[Audit records]
    FC[Fail-closed behavior]
  end

  subgraph EL["6. Evaluation Layer (AI-75 / AI-76 / AI-77)"]
    GC[Gold cases]
    EVR[Evaluators]
    BR[Benchmark runs]
    QM[Quality / latency / cost / safety metrics]
    PM[Profile promotion]
  end

  subgraph RL["7. Routing Layer (AI-78)"]
    BP[Best-profile router]
    CS[Capability-based selection]
    PF[Policy filter]
    ER[Evaluation-based ranking]
    LS[Lifecycle states<br/>production / candidate / shadow / retired]
  end

  subgraph EX["8. Review & Export Layer (existing)"]
    HRG[Human review gate<br/>src/agents/human-review-gate.ts]
    AA[Approved artifacts]
    EC[Export contracts]
    RA2[Read-only HTTP API]
    VG[vlatam-global consumer boundary]
  end

  SL --> DL
  DL --> CC
  CC --> ML
  CC --> GL
  ML --> EL
  GL --> RL
  EL --> RL
  RL --> EX
  DL --> HRG
  HRG --> AA
  AA --> EC
  EC --> RA2
  RA2 --> VG

  classDef boundary stroke:#b00,stroke-width:2px;
  class VG boundary
```

### Layer 1 — Source and Evidence Layer

Owns the raw material of intelligence: official sources, immutable snapshots,
source provenance, evidence packets, and the regulatory research inputs that
seed advisory cases.

- **Already exists:** `source-monitor`, `snapshot-writer`, `delta-analyzer`,
  evidence packets under `snapshots/pcram/`, and the regulatory research
  fixtures under `data/fixtures/advisory/`.
- **Must not contain:** model SDK calls, vendor response objects, or any
  post-review content.
- **Owner today:** `src/agents/source-monitor.ts`,
  `src/agents/snapshot-writer.ts`, `src/agents/delta-analyzer.ts`,
  `src/advisory/regulatory-research-workspace.ts`.

### Layer 2 — Domain Intelligence Layer

Owns the production of domain-specific intelligence. Today this is the
classifier intelligence (ARCA/VUCE/InfoLEG) and the regulatory advisory
research (Argentina → Spain/EU agrochemical). The router agent and the
specialized agents live here.

- **Already exists:** `RouterAgent` orchestration in
  `src/agents/router-agent.ts`, specialized evidence agents, evidence
  writer, regulatory advisory read model.
- **Planned:** logistics, payments, supplier, and customer intelligence.
  These are added as new domain modules that request capabilities, never as
  new model dependencies.
- **Must not depend on:** specific provider SDKs, vendor response objects, or
  unreviewed model output as inputs.
- **Key invariant:** the domain layer calls capabilities; the routing and
  provider layers are interchangeable below it.

### Layer 3 — Capability Contract Layer (AI-71)

The seam that isolates the domain from the model world. AI-71 introduces
executable capability contracts; AI-70 only inventories them in
`config/ai-capabilities.json` and discusses them here.

A capability contract is a stable, vendor-neutral description of:

- a unique `capability_id`;
- a request shape and a response shape (validated by Ajv in AI-71);
- a downstream-safety class
  (`classifier_candidate` / `regulatory_advisory` / `logistics` / `payments` /
  `supplier` / `customer`);
- a human-review requirement that distinguishes between
  - capabilities that themselves require human judgment (regulated
    capabilities that interpret evidence, generate classification or
    advisory candidates, approve artifacts, or promote execution
    profiles), and
  - capabilities that are mechanical, infrastructural, transport-layer,
    or apply a previously approved rule (and therefore do not require
    human review at the capability boundary, even if the artifacts they
    consume were already reviewed upstream);
- a policy requirement block (privacy tier, ZDR class, retention, audit).

The contract is a "type" in the FaaS sense: an input and a typed output with
pre/post-conditions. Capabilities are not promise-returning functions; they
are explicitly validated before and after every call.

### Layer 4 — Model Execution Layer (AI-72)

The normalized path to providers. AI-72 implements provider adapters,
inference profiles, retries, normalization, and the multi-provider gateway.
AI-70 only defines the shape.

- **Provider:** an external or local inference service, e.g. DeepSeek,
  DashScope/Qwen, OpenAI, Anthropic, Google, Cloudflare Workers AI, or a
  local runtime.
- **Model:** a provider-exposed model/version, e.g. `deepseek-chat`,
  `qwen-plus`, `@cf/baai/bge-m3`.
- **Execution profile:** a governed combination of `(capability, provider,
  model, configuration, privacy policy, budget policy, lifecycle status,
  evaluation record)`. AI-78 selects profiles; the runtime executes them.
- **Adapter contract:** the only place provider-specific knowledge lives.
  Every adapter normalizes to a shared `AIGatewayResponse` shape (see
  `src/ai/ai-gateway.ts`).
- **AI-70 explicitly rejects:** provider-specific response objects leaving
  this layer; vendors leaking into the domain layer; ad-hoc env-var
  conditionals for model selection.

### Layer 5 — Governance Layer (AI-73 / AI-74)

The cross-cutting guardrail layer. Every capability invocation must pass
through governance before and after execution.

- **Privacy and ZDR (AI-73):** every payload is classified; forbidden fields
  (CUIT, supplier names, prices, bank data, broker PII) are blocked or
  redacted before egress; ZDR is enforced at the adapter boundary.
- **Budget governor (AI-74):** per-profile and per-window spend caps; soft
  fail (degrade to cheaper eligible profile); hard fail when cost exceeds
  approved budget.
- **Allowlists:** model allowlist per capability, jurisdiction allowlist per
  domain.
- **Audit records:** every invocation writes a local audit record (model,
  capability, prompt hash, response hash, governance decision, cost, latency,
  evaluation reference).
- **Fail-closed:** unsupported or unknown configuration must never silently
  fall back to a default. The behavior on unknown is: refuse and surface a
  review-required response.

### Layer 6 — Evaluation Layer (AI-75 / AI-76 / AI-77)

The measured layer. Capabilities are evaluated against reviewed gold cases.

- **Gold cases (AI-76):** reviewed, versioned JSON fixtures that pin
  expected outputs, allowed claims, evidence references, and review status.
- **Evaluators (AI-75):** deterministic checks plus LLM-as-judge
  evaluations, with explicit bias mitigation and human review of any
  evaluator before promotion.
- **Benchmark runs (AI-77):** reproducible runs against the gold set,
  producing quality, latency, cost, and safety metrics per execution
  profile.
- **Profile promotion:** only `production` profiles are eligible for
  selection; `candidate` and `shadow` profiles may be benchmarked but must
  never silently become production.

### Layer 7 — Routing Layer (AI-78)

Selects an execution profile for a capability at request time.

- **Inputs:** capability id, capability contract, governance state,
  evaluation record, current lifecycle states, optional profile hints.
- **Algorithm:** filter by capability + governance + allowlist → rank by
  evaluation record (quality, cost, latency) → choose top eligible
  `production` profile; `candidate`/`shadow` are out of the production path.
- **Explicitly not allowed:** a "cheapest model" selector. Cost is one input
  among many and must never override privacy, review, or quality.
- **Shadow execution:** a `candidate`/`shadow` profile may receive a
  duplicated request for evaluation, but its output is recorded separately
  and must never influence the operational response or cross the export
  boundary.

### Layer 8 — Review and Export Layer (existing)

The boundary that has been live since Phase 6/7/9. AI-70 does not modify
it.

- **Human review gate:** writes a `reviewed_approved` or `reviewed_rejected`
  review onto an artifact; only `reviewed_approved` is downstream-eligible.
- **Approved artifacts:** reviewed and versioned JSON envelopes with
  governance flags set to `downstream_allowed: true`.
- **Export contracts:** validated by
  `classifier-approved-artifact-export.schema.json`; no reviewer identity,
  review timestamps, or approval references are exposed.
- **Read-only HTTP API:** `GET /api/classifier/:source_id/:artifact_id`,
  `GET /health`, and the regulatory research workspace
  `GET /research/regulatory/ar-es-ecological-agrochemicals`. Strictly
  read-only; fails closed on any contract violation.
- **`vlatam-global` consumer boundary:** AI Lab is the source of reviewed
  exports; `vlatam-global` is an external, read-only HTTP consumer with
  no provider credentials and no shared database.

## 4. Architectural terminology (defined here, used everywhere)

The terms below are normative. Every later PR (AI-71 through AI-78) and
every later capability contract must use these terms exactly.

### Capability

A stable, domain-level unit of AI work that is independent of any specific
model vendor. Examples: extract structured evidence from a packet; generate
a classifier candidate; identify missing regulatory evidence; summarize an
official-source delta.

A capability has:

- a stable `capability_id`;
- a request shape and a response shape;
- a downstream-safety class;
- a `human_review` field that is `true` for capabilities that themselves
  require explicit human judgment, and `false` for mechanical,
  infrastructural, or transport-layer capabilities (or for capabilities
  that apply a previously approved rule);
- a policy block (privacy, retention, ZDR, audit).

### Provider

An external or local inference service. Examples: DeepSeek, DashScope/Qwen,
OpenAI, Anthropic, Google, Cloudflare Workers AI, a local runtime. A provider
is reached through a provider adapter in the Model Execution Layer.

### Model

A provider-exposed model/version. Models are owned by providers and never
referenced directly from domain code.

### Execution profile

A governed combination of:

- a `capability_id`;
- a `provider`;
- a `model`;
- a `configuration` (temperature, max tokens, etc.);
- a `privacy_policy` (ZDR class, retention, redaction);
- a `budget_policy` (per-request cap, per-window cap);
- a `lifecycle_status` (`production` | `candidate` | `shadow` | `retired`);
- an `evaluation_record` (latest quality, latency, cost, safety numbers).

Execution profiles are the only object the runtime ever selects. Domain
workflows never name a profile; they request a capability and the routing
layer resolves the profile.

### Lifecycle status

Applies to an **execution profile**, not to a reviewed artifact or a
regulatory conclusion.

- `production` — eligible for selection by the router.
- `candidate` — being benchmarked; eligible for shadow execution.
- `shadow` — receiving parallel traffic for evaluation only; outputs are
  audited but never returned to the caller and never cross the export
  boundary.
- `retired` — no longer eligible; historical records remain.

### Shadow execution

A candidate or shadow profile receives a duplicated request for evaluation
purposes. Its output:

- must not affect the operational response;
- must not cross the approved export boundary;
- must be stored under a separate shadow audit path;
- must obey privacy and budget policies;
- must never silently become production output.

### Approved artifact

A reviewed domain artifact that has crossed the existing human-review and
export-safety boundary. It is the unit the read-only HTTP API serves. It is
**not** equivalent to a raw model response. Approved artifacts carry no
provider metadata, no reviewer identity, and no review timestamp.

## 5. Safety invariants

Every layer must preserve the following invariants. They are not negotiable
and are not deferred to later PRs.

1. Unreviewed model output is not approved intelligence. Raw `ai-extraction-result`
   output never crosses the export boundary.
2. Model performance scores cannot override missing evidence. A high
   evaluation score on a capability that lacks evidence is still
   `downstream_allowed: false`.
3. Cost optimization cannot override privacy policy. Budget never relaxes
   redaction, ZDR, or retention rules.
4. Routing cannot override human-review requirements. Any capability whose
   `human_review` field is `true` must be reviewed; the router does not
   bypass review even if a profile is `production`. Capabilities whose
   `human_review` field is `false` never become auto-approved: they only
   produce, transport, or enforce a previously approved decision, and
   the catalog enforces that no `human_review: false` capability may set
   `downstream_allowed: true` unless it is on the serve-only allowlist.
5. Vendor metadata must not leak through approved external exports.
   Approved exports never carry `provider_id`, `model_id`, prompt hashes,
   or vendor error codes. (See
   `docs/integration/vlatam-global-api-contract.md`.)
6. `vlatam-global` must not need provider credentials. AI Lab never asks
   the consumer to provide keys, headers, or routing preferences tied to a
   specific provider.
7. Domain workflows must remain portable across providers. Provider
   knowledge lives only in adapters; the domain layer is unaware of vendors.
8. Unsupported or unknown configurations must fail closed. Unknown
   capability, unknown profile, unknown lifecycle state, or unknown
   governance decision all refuse to proceed.
9. Regulatory conclusions require evidence provenance and the appropriate
   review status. Every claim that affects a regulated decision must cite
   a source from an evidence packet, and the artifact must be
   `reviewed_approved` before export.
10. Shadow outputs must never influence production responses. Shadow runs
    are auditable side effects; the operational response always comes from
    the selected production profile.

## 6. Roadmap alignment

AI-70 introduces only documentation, a declarative inventory, and an ADR.
It does not implement any of the later PRs. The dependency order is:

- **AI-70** — this document, the capability map, the ADR, and
  `config/ai-capabilities.json`. No runtime code.
- **AI-71** — executable capability contracts (request/response schemas,
  pre/post-condition validation, governance requirements).
- **AI-72** — provider adapters and a multi-provider gateway.
- **AI-73** — privacy, retention, and ZDR enforcement at the adapter
  boundary.
- **AI-74** — cost and budget governance.
- **AI-75** — evaluator contracts and scoring.
- **AI-76** — reviewed gold cases.
- **AI-77** — reproducible benchmark runs.
- **AI-78** — best-profile router (depends on AI-71 through AI-77).

The detailed roadmap dependency map is in
`docs/architecture/ai-roadmap-dependency-map.md`.

## 7. Out of scope for AI-70

- Provider SDK adapters.
- A multi-provider runtime gateway.
- Live model API calls.
- ZDR verification logic.
- Data retention enforcement.
- Token or cost metering.
- Budget blocking.
- Evaluators.
- Gold datasets.
- Benchmark execution.
- Model ranking.
- Shadow traffic execution.
- Automatic routing.
- Production deployment.
- New databases.
- Supabase integration.
- Changes to the existing approved export contract.
- Changes to `vlatam-global`.
- Premature implementation of AI-71 through AI-78.

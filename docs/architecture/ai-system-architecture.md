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

| Component                                             | Path                                                                            | Status                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------- |
| Source Monitor                                        | `src/agents/source-monitor.ts`                                                  | existing                        |
| Snapshot Writer                                       | `src/agents/snapshot-writer.ts`                                                 | existing                        |
| Delta Analyzer                                        | `src/agents/delta-analyzer.ts`                                                  | existing                        |
| Evidence Writer                                       | `src/agents/evidence-writer.ts`                                                 | existing                        |
| Human Review Gate                                     | `src/agents/human-review-gate.ts`                                               | existing                        |
| Export Contract                                       | `src/agents/export-contract.ts`                                                 | existing                        |
| Normative Evidence Agent (DeepSeek)                   | `src/agents/normative-evidence-agent.ts`                                        | existing (fixture-driven)       |
| Router Agent + specialized agents (ARCA/VUCE/InfoLEG) | `src/agents/router-agent.ts`                                                    | existing                        |
| API Server (read-only HTTP)                           | `src/server/api-server.ts`                                                      | existing                        |
| Cloudflare AI Gateway wrapper (skeleton)              | `src/ai/ai-gateway.ts`                                                          | partial                         |
| CountryAdapter interface (CL/UY/PY planned)           | `src/adapters/types.ts`                                                         | partial (interface only)        |
| Regulatory Research Workspace                         | `src/advisory/regulatory-research-workspace.ts`                                 | partial (read-only HTML, draft) |
| Regulatory Advisory Read Model                        | `src/advisory/regulatory-advisory-read-model.ts`                                | partial (checklist, draft)      |
| Qwen/DashScope extraction spike                       | `docs/qwen-langgraph-evidence-extraction-spike.md`, `snapshots/qwen/`           | partial (spike only)            |
| Schema registry                                       | `schemas/schema-registry.json`                                                  | existing                        |
| Approved export bundle                                | `exports/approved-catalog/`, `docs/approved-export-bundle-consumer-contract.md` | existing                        |
| Multi-country design (doc only)                       | `docs/multi-country-architecture-design.md`                                     | partial (design only)           |

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
- **AI-126 acquired-source seam (2026-07-22):** governed replay acquisition
  bytes and their integrity-bound provenance pass through deterministic
  content classification into the existing ARCA parser. The output is only a
  hash-bound candidate with mandatory human review; it is neither an Approved
  Artifact nor publishable to `vlatam-global`. The seam has no scheduler,
  discovery, network, LLM, approval, database, or export authority.
- **AI-127 candidate-review seam (2026-07-22):** an independent human review
  record binds the complete immutable candidate identity and every
  load-bearing acquisition/parser/output field. A pure evaluator fails closed
  across invalid candidate/review, binding mismatch, pending, rejected,
  expired, and superseded states. Its best result permits only a later AI-128
  builder to evaluate the same separately supplied candidate and review; no
  Approved Artifact or operational authority is created.
- **AI-128 approved-artifact seam (2026-07-22):** the deterministic local
  builder revalidates the exact candidate/review/evaluation set, recomputes
  AI-127 at the supplied evaluation timestamp, enforces builder separation of
  duties and review freshness at the build timestamp, then writes one
  immutable Approved ARCA Artifact through atomic no-overwrite staging. Its
  payload is the unchanged candidate parsed output. Export, publication,
  production reliance, database, network, scheduler, deployment, and
  `vlatam-global` authority remain false.
- **AI-129 operator-understanding seam (2026-07-22):** Operator Read Model
  `1.9.0` feeds one pure ARCA console view model and the GET-only
  `/operator/arca-review` route. The Spanish UI exposes candidate provenance,
  human-review state, exact AI-127 evaluation and local Approved Artifact
  status without adding any mutation, builder, export, publication, scheduler,
  deployment, production, or `vlatam-global` capability.
- **AI-130 durable-store seam (2026-07-22):** one local filesystem store
  validates and records only exact AI-126/127/128 artifacts in upstream order,
  using a closed, hash-bound operation journal to recover interrupted
  publication before replay. It appends a domain-hashed, prior-bound event and
  atomically refreshes a non-authoritative per-candidate projection. Identity-derived record/event
  paths are no-overwrite; matching bytes are idempotent and different bytes
  at the same identity fail closed. Configured-root symlinks/non-directories
  are rejected, competing processes serialize through exclusive filesystem
  creation, and replay uses only immutable records, events, and explicit
  caller timestamps. No network, acquisition, model, database, scheduler,
  export, publisher, deployment, production, or `vlatam-global` boundary is
  imported.
- **AI-131 controlled live-run seam (2026-07-22):** a closed proposal and
  independent one-shot human authorization bind one exact allowlisted ARCA
  URL, the governed acquisition policy, fixed roots, one attempt and one
  successful network call. A repository-owned active kill switch blocks
  current execution. The crash journal and atomic consumption record prevent
  reuse; unknown delivery never retries. Successful mocked execution uses the
  existing acquisition transport, AI-126 parser and AI-130 `record_candidate`,
  then stops with review required and every downstream authority false.
- **AI-132 governed export seam (2026-07-22):** an exact AI-128 Approved
  Artifact plus immutable AI-130 persistence proof and a distinct one-shot
  human authorization can produce one deterministic repository-owned JSON
  package in a reviewed local handoff root. The dedicated export kill switch is
  active by default and reread immediately before package publication. A local
  consumption record and crash journal enforce exactly-once authorization and
  exact-byte recovery. The package remains not imported, not published, not
  deployed and not production-authorized; no network or `vlatam-global` access
  exists in this layer. Recovery binds and reconciles canonical authorization
  consumption bytes even when a crash leaves the journal at `prepared`, and
  cannot publish missing package bytes without the exact journal-bound reviewed
  root configuration and a final reread of the exact hash/path-bound reviewed
  disabled export switch.
- **AI-133 governed scheduler seam (2026-07-23):** eleven closed `1.0.0`
  contracts separate inactive scheduler configuration, expiring human
  activation, scheduled request, durable filesystem lease, run journal,
  result, observation, recovery decision, immediate scheduler kill switch,
  activation-scoped attempt ledger and semantic-slot acceptance. Observation
  is local-only and caller claims cannot become authority. Execution can invoke
  only the existing AI-131/AI-132 boundaries after exact request-bound
  artifacts, trusted time, current switch bytes, activation, window, slot,
  duration, lease and atomic caps pass. `execution_started` is
  `authority_outcome_unknown` until authoritative evidence resolves it.
  Recovery is read-only, unknown delivery is manual-review-only, missed slots
  never catch up, and repository-current scheduling/execution remain blocked.
- **Must not contain:** model SDK calls, vendor response objects, or any
  post-review content.
- **Owner today:** `src/agents/source-monitor.ts`,
  `src/agents/snapshot-writer.ts`, `src/agents/delta-analyzer.ts`,
  `src/advisory/regulatory-research-workspace.ts`, and the bounded acquisition
  and ingestion modules under `src/acquisition/` and `src/ingestion/`.

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

### Layer 8.1 — Sandbox activation human review (delivered 2026-07-15)

A governed human-review layer between the sandbox-enablement proposal and any
future controlled sandbox activation, documented in
`docs/architecture/ai-openrouter-sandbox-activation-review.md`. It adds a
versioned activation-review contract with exact artifact/hash bindings and
separation-of-duties enforcement, one synthetic gold case with a deterministic
acceptance contract (prepared, never executed by this layer), and a pure
fail-closed eligibility evaluator whose best outcome
(`eligible_for_activation_configuration`) still reports execution, secret
access, and runtime enablement as false. The execution chain
`registry → resolution → authorization → exact policy → atomic consumption → gateway → adapter`
is unchanged; the review layer sits strictly before it and cannot invoke it.
The Operator Read Model (`1.1.0`) and the Spanish read-only console
(`/operator/review`) expose the workflow state without any mutation surface.

### Layer 8.2 — ARCA candidate human review (AI-127)

The AI-127 seam is:

`immutable ARCA parse candidate → independent human review record → identity/integrity verification → deterministic evaluator → pending | rejected | expired | superseded | eligible_for_approved_artifact_building`

The review contract is limited to controlled decisions, statements, reason
codes, findings, identity/hash bindings, reviewer metadata, timestamps,
expiry, and an optional supersession reference. It excludes uploads, prompts,
private reasoning, provider objects, executable content, credentials, customer
data, and database connection data. Evidence reviewers must be human and
independent of the acquisition operator, candidate producer, and parser/runtime
identity. Human identities are closed to the `human:<stable-id>` namespace and
are compared exactly after schema validation. Every non-pending decision must
be canonical and no later than the explicitly injected evaluation timestamp;
any decided review expiry must be strictly later than that decision. The
evaluator has no internal wall-clock dependency. Future builder and publisher/
export-approver roles remain unassigned in this phase.

The Operator Read Model `1.5.0` projects candidate/review hashes, lifecycle,
outcome, reviewer presence, expiry, unresolved-findings count, later-builder
eligibility, and explicit false export/publication authority. It adds no form,
button, endpoint, persistence, or mutation surface.

### Layer 8.3 — Approved ARCA Artifact Builder (AI-128)

The AI-128 seam is:

`AI-126 candidate + AI-127 review + supplied AI-127 evaluation → authoritative revalidation + exact recomputation → builder separation of duties → immutable local Approved ARCA Artifact`

Artifact and result contracts are closed at `1.0.0`. Canonical hashes use
sorted-key JSON `review-json-v1` and explicit domain separation. Only the two
derived artifact identity fields are excluded from their own hash payload.
The supplied evaluation is never trusted by outcome alone: its schema,
canonical timestamp, hash and ID must validate, and its complete canonical
value must equal the AI-127 result recomputed at `evaluated_at`.

The builder accepts no URLs, prompts, raw source files, credentials, network
flags, publisher flags, or production flags. Its only write is to a configured
local approved-artifact root using symlink rejection, staging, atomic hard-link
publication and collision refusal. The fixed artifact states are `approved`,
`not_exported`, `not_published`, and `not_authorized` for production reliance
and `vlatam-global` consumption.

### Layer 8.4 — ARCA Operator Review Console (AI-129)

The AI-129 presentation seam is:

`repository-governed Operator Read Model 1.9.0 → pure ARCA console view model → read-only Spanish route → human operator understanding`

The route preserves canonical enums, IDs, bindings and full hashes, translates
only presentation labels, and bounds/escapes human-authored statements and
findings. It does not duplicate AI-127 evaluation or invoke AI-128 validation
or builder execution. The repository-current projection remains synthetic,
pending, and without an Approved Artifact or downstream authority. Contract
`1.9.0` additionally projects the separately packaged first real ARCA batch:
three canonical artifacts with exact official-source agreement and three
pending review packages. Those records remain unapproved, uninterpreted,
unexported, unpublished, and unauthorized for production reliance.

### Layer 8.5 — Durable ARCA Review and Artifact Store (AI-130)

The AI-130 persistence seam is:

`closed durable journal → validated AI-126/127/128 immutable record → identity-derived no-overwrite file → prior-bound audit event → atomically replaced derived projection`

Command, event, journal, projection, and operation-result contracts are closed at
`1.0.0`. The layout and contract versions are bound into a domain-separated
store configuration hash. Events use an exact monotonically increasing
sequence, bind the prior event identity/hash except at genesis, and bind all
present workflow identities plus the store configuration. Replay rejects
missing, reordered, duplicated, modified, or orphaned records/events.

Valid journal recovery precedes ordinary chain replay under the exclusive
lock. Record operations recover in record/event/projection order. Rebuilds
publish the exact planned projection before their event, preventing a durable
event from claiming a projection state that is not yet visible. Journal or
visible-byte mismatches fail closed; recovery reuses the planned sequence and
bytes and cannot append a duplicate replacement event.

The store requires every upstream record to be present and valid before a
downstream record can be persisted. It reuses the authoritative candidate,
evaluation, and Approved Artifact validators and the AI-127 evaluator/binding
logic. The projection is rebuildable and explicitly non-authoritative. The
store records governance decisions; it never creates one.

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
   `reviewed_approved` before export. The approval must carry a valid internal,
   domain-separated review binding over the exact reviewable artifact, schema,
   decision, review timestamp, and policy; modified or substituted artifacts
   fail closed.
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

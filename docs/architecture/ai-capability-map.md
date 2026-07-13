# AI Capability Map (AI-70)

Status: maintained architecture inventory. AI-79 reviewed handoff and AI-80
durable single-use authorization are delivered. AI-81 adds a review-only
provider-evidence layer; its OpenRouter and MiniMax definitions remain disabled
candidates and are not runtime profiles. Pairs with
`docs/architecture/ai-system-architecture.md` and the declarative catalog at
`config/ai-capabilities.json`. No runtime code is added by this document.

## 1. Purpose

This document is the structured, repository-grounded map of every AI-related
unit of work in `vlatam-ai-lab` today and on the AI-71 through AI-78
roadmap. For each capability we record:

- a stable `capability_id`;
- a human-readable name;
- the business/domain purpose;
- the current implementation status (`existing` | `partial` | `planned` |
  `out_of_scope` | `retired`);
- the current repository owner/module;
- the input and output categories;
- the risk tier;
- whether human review is required;
- whether approved export is allowed;
- the current or planned provider dependency;
- the roadmap dependency (which PR fills the gap);
- notes and known gaps.

The status taxonomy is intentionally strict:

- `existing` — production code path verified by tests and currently used.
- `partial` — code, fixture, or design exists but is incomplete, gated by a
  feature flag, or scoped to one country/use case.
- `planned` — explicitly tracked in the AI-71 through AI-78 roadmap but
  not yet present in code.
- `out_of_scope` — explicitly assigned to a different repo, to a future
  not on this roadmap, or permanently out of scope.
- `retired` — a previously existing or planned path whose runtime code was
  deliberately removed (2026-07-13, governed-execution-boundary PR); the
  capability record is kept for historical traceability and must not be
  re-implemented outside the governed gateway.

We do not mark a capability `existing` merely because a document or
placeholder file exists. A capability is `existing` only when there is a
deterministic, test-covered code path that produces the documented output.

## 2. Capability groups

The map is grouped by domain family so reviewers can find the relevant rows
quickly. Every group below has the same column shape.

### 2.1 Source acquisition, snapshotting, and delta

| ID                                           | Name                                        | Status     | Owner                                                                                 | Input                   | Output                                  | Risk   | Review       | Export | Provider                                    | Roadmap      | Notes                                                                                                                                                                        |
| -------------------------------------------- | ------------------------------------------- | ---------- | ------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------- | ------ | ------------ | ------ | ------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source.acquisition.monitor`                 | Source acquisition monitor                  | `existing` | `src/agents/source-monitor.ts`                                                        | local source folders    | structured delta report                 | low    | no           | no     | none (offline)                              | —            | Reads local source folders only; no live network.                                                                                                                            |
| `source.snapshot.write`                      | Immutable snapshot writing                  | `existing` | `src/agents/snapshot-writer.ts`                                                       | local fixture file      | versioned snapshot JSON + SHA-256       | low    | no           | no     | none                                        | —            | Writes to `data/sources/<source_id>/<date>.json`; validates against `intelligence-source-snapshot.schema.json`.                                                              |
| `source.delta.detect`                        | Snapshot delta detection                    | `existing` | `src/agents/delta-analyzer.ts`                                                        | two snapshot artifacts  | evidence packet with claim types        | low    | no           | no     | none                                        | —            | Outputs `delta-analyzer-evidence-packet.schema.json`; claims are limited to the vlatam-global allowlist. Detection is mechanical; review applies to the downstream artifact. |
| `source.snapshot.embedded_evidence_demo`     | Embedded-evidence demo packet               | `partial`  | `snapshots/pcram/extractable-evidence-packet-demo-embedded-evidence.json`             | fixture                 | deterministic draft claims              | low    | no           | no     | `embedded-evidence-demo-provider` (offline) | AI-72        | Schema validation path only; not authoritative.                                                                                                                              |
| `source.acquisition.cloudflare_pipeline_v1`  | Cloudflare pipeline source acquisition      | `retired`  | — (Worker, AI Gateway wrapper, and `wrangler.toml` removed 2026-07-13)                | —                       | —                                       | low    | no           | no     | none                                        | —            | Retired with the governed-execution-boundary PR; the flag-gated Worker pipeline never ran in production.                                                                     |
| `source.acquisition.multi_country`           | Multi-country source acquisition (CL/UY/PY) | `partial`  | `src/adapters/types.ts` (interface only), `docs/multi-country-architecture-design.md` | country code + NCM      | tariff/intervention/cost breakdown      | medium | no           | no     | none yet                                    | AI-72, AI-78 | `CountryAdapter` interface is defined; per-country adapters not implemented. Mechanical source fetch; interpretation is reviewed separately.                                 |
| `source.regulatory_research.advisory_input`  | Regulatory research advisory input          | `partial`  | `src/advisory/regulatory-research-workspace.ts`                                       | jurisdiction + product  | research workspace draft                | medium | yes (always) | no     | none                                        | AI-71, AI-72 | HTML read model is draft and `downstream_allowed: false`.                                                                                                                    |
| `source.regulatory_advisory.readiness_check` | Advisory readiness classification           | `partial`  | `src/advisory/regulatory-advisory-read-model.ts`                                      | embedded source records | coverage classification per review area | medium | yes (always) | no     | none                                        | AI-71, AI-72 | Read-model only; not yet exposed via the export contract.                                                                                                                    |

### 2.2 Evidence extraction (LLM-assisted)

| ID                                           | Name                                 | Status     | Owner                                                                                            | Input                          | Output                                         | Risk   | Review       | Export | Provider                                              | Roadmap      | Notes                                                                                                            |
| -------------------------------------------- | ------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------ | ------------------------------ | ---------------------------------------------- | ------ | ------------ | ------ | ----------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------- |
| `evidence.extraction.normative_claims`       | Normative-claim extraction           | `existing` | `src/execution/multi-provider-gateway.ts`, `src/execution/normative-claims-mapper.ts`            | evidence packet                | draft `ai-extraction-result`                   | high   | yes (always) | no     | governed adapter layer (profiles disabled by default) | AI-72, AI-78 | Output is always `human_review_required=true`, `downstream_allowed=false`; executes only through the gateway.    |
| `evidence.extraction.qwen_dashscope`         | Qwen/DashScope extraction (spike)    | `retired`  | `docs/qwen-langgraph-evidence-extraction-spike.md`, `snapshots/qwen/` (historical evidence only) | —                              | —                                              | high   | yes (always) | no     | none (docs + sanitized fixtures only)                 | —            | Retired 2026-07-13; no runtime path exists. Any future use must run through the governed gateway.                |
| `evidence.extraction.langgraph_workflow`     | LangGraph extractor/critic/validator | `retired`  | — (never wired; workflow stubs in `src/workflows/pcram-workflow.ts` are type/test-only)          | —                              | —                                              | high   | yes (always) | no     | none                                                  | —            | Retired 2026-07-13; the `@langchain/langgraph` dependency is scheduled for removal in the dependency-cleanup PR. |
| `evidence.extraction.critic_review`          | Critic review pass                   | `retired`  | — (direct-call critic agent removed 2026-07-13)                                                  | —                              | —                                              | high   | yes          | no     | none                                                  | —            | Retired with the legacy router path; a future critic pass must be a governed capability.                         |
| `evidence.embedding.bge_m3`                  | Multilingual embedding generation    | `retired`  | — (embedding service, consumer, and scripts removed 2026-07-13)                                  | —                              | —                                              | low    | no           | no     | none                                                  | —            | Retired; embeddings were never governed. Any future embedding capability needs an explicit governed boundary.    |
| `evidence.embedding.refresh`                 | Embedding refresh on snapshot change | `retired`  | —                                                                                                | —                              | —                                              | low    | no           | no     | none                                                  | —            | Retired 2026-07-13 with the embedding runtime it depended on.                                                    |
| `evidence.classifier_candidate.generate`     | Classifier candidate generation      | `existing` | `src/agents/evidence-writer.ts`                                                                  | reviewed extraction result     | `classifier-intelligence-artifact` (candidate) | high   | yes          | no     | none (deterministic)                                  | —            | Output is always `downstream_allowed=false` until reviewed.                                                      |
| `evidence.regulatory_research.question_prep` | Research question prep               | `partial`  | `src/advisory/regulatory-research-workspace.ts`                                                  | workspace + research questions | per-question source/evidence requirements      | medium | yes          | no     | none                                                  | AI-71        | Draft; surfaces explicit missing-evidence gaps. Subject to professional review before any client-facing answer.  |

### 2.3 Review, approval, and approved artifacts

| ID                                         | Name                                     | Status     | Owner                                                                                 | Input                     | Output                                  | Risk   | Review                 | Export               | Provider | Roadmap | Notes                                                                                                                                                                         |
| ------------------------------------------ | ---------------------------------------- | ---------- | ------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------- | ------ | ---------------------- | -------------------- | -------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `review.human.gate`                        | Human review gate                        | `existing` | `src/agents/human-review-gate.ts`                                                     | draft artifact + reviewer | reviewed artifact                       | high   | no (the review itself) | conditional          | none     | —       | Approved path flips `governance.downstream_allowed=true` and `review_status=reviewed_approved`. The review act is not subject to a further review.                            |
| `review.human.gate.regulatory_research`    | Advisory workspace readiness             | `partial`  | `src/advisory/regulatory-research-workspace.ts`                                       | workspace + evidence      | readiness summary                       | medium | yes                    | no                   | none     | AI-71   | Surface missing evidence; no final answer emitted. Subject to professional review before any client-facing answer.                                                            |
| `artifact.approved.generate`               | Approved artifact generation             | `existing` | `src/agents/human-review-gate.ts`                                                     | reviewed artifact         | artifact with `downstream_allowed=true` | high   | yes                    | conditional          | none     | —       | Only writes to `data/intelligence/<source_id>/<artifact_id>.json` after explicit approval.                                                                                    |
| `artifact.export_contract.generate`        | Export contract generation               | `existing` | `src/agents/export-contract.ts`                                                       | approved artifact         | `classifier-approved-artifact-export`   | high   | yes                    | yes (read-only)      | none     | —       | Validates against `classifier-approved-artifact-export.schema.json`; drops governance and reviewer fields. Review is the precondition of the approved artifact this consumes. |
| `artifact.export_catalog.generate`         | Export catalog index                     | `partial`  | `exports/approved-catalog/`, `docs/classifier-approved-artifact-export-catalog-p1.md` | verified catalog          | read-only index                         | medium | no                     | no (read-only index) | none     | —       | Repo-local bundle; deterministic, no runtime bridge.                                                                                                                          |
| `artifact.export_bundle.consumer_contract` | Approved export bundle consumer contract | `existing` | `docs/approved-export-bundle-consumer-contract.md`                                    | bundle index              | consumer agreement                      | low    | no                     | no                   | none     | —       | Document-only contract; vlatam-global consumption is future work.                                                                                                             |
| `artifact.approved.serve_http`             | Approved artifact serving                | `existing` | `src/server/api-server.ts`                                                            | HTTP request              | `classifier-approved-artifact-export`   | medium | no (precondition)      | yes                  | none     | —       | Fails closed on schema violation; rate-limited; API-keyed. Review is the precondition of the artifact being served, not of the serving step.                                  |

### 2.4 Provider execution, governance, evaluation, and routing

| ID                                          | Name                              | Status         | Owner                                                   | Input                          | Output                           | Risk   | Review | Export | Provider             | Roadmap      | Notes                                                                                                        |
| ------------------------------------------- | --------------------------------- | -------------- | ------------------------------------------------------- | ------------------------------ | -------------------------------- | ------ | ------ | ------ | -------------------- | ------------ | ------------------------------------------------------------------------------------------------------------ |
| `provider.execution.cloudflare_ai_gateway`  | Cloudflare AI Gateway wrapper     | `retired`      | — (`src/ai/ai-gateway.ts` removed 2026-07-13)           | —                              | —                                | medium | no     | n/a    | none                 | —            | Retired: the wrapper implemented automatic model fallback, which the governed boundary forbids.              |
| `provider.execution.deepseek_direct`        | DeepSeek direct calls             | `retired`      | — (direct agents and extraction CLI removed 2026-07-13) | —                              | —                                | high   | no     | no     | none                 | —            | Retired per ADR-003; provider execution exists only through the governed adapter layer.                      |
| `provider.execution.qwen_dashscope_runtime` | DashScope/Qwen runtime            | `retired`      | —                                                       | —                              | —                                | high   | no     | no     | none                 | —            | Retired: no direct runtime will be built; the governed adapter layer provides a disabled-by-default factory. |
| `provider.execution.local_runtime`          | Local model runtime               | `out_of_scope` | —                                                       | —                              | —                                | —      | no     | —      | —                    | —            | Not on the AI-71 to AI-78 roadmap.                                                                           |
| `governance.privacy.zdr`                    | Privacy & ZDR enforcement         | `planned`      | —                                                       | capability invocation          | redaction / block                | high   | no     | n/a    | —                    | AI-73        | Mechanical enforcement of a previously approved privacy rule.                                                |
| `governance.data.classification`            | Data classification               | `planned`      | —                                                       | payload                        | class label                      | medium | no     | n/a    | —                    | AI-73        | Mechanical classification; review applies to the artifact that downstream consumes.                          |
| `governance.budget.cost_governor`           | Budget governor                   | `planned`      | —                                                       | invocation                     | allow / soft-degrade / hard-fail | medium | no     | n/a    | —                    | AI-74        | AI-70 does not implement cost or token metering.                                                             |
| `governance.allowlist.providers`            | Provider allowlist per capability | `planned`      | —                                                       | capability id                  | allow / deny                     | medium | no     | n/a    | —                    | AI-71, AI-73 | Owned by the capability contract in AI-71.                                                                   |
| `governance.audit.record`                   | Audit record writing              | `planned`      | —                                                       | invocation                     | local audit entry                | low    | no     | n/a    | —                    | AI-73, AI-78 | Local file; no network.                                                                                      |
| `governance.fail_closed`                    | Fail-closed behavior              | `planned`      | —                                                       | unknown config                 | refuse                           | n/a    | no     | n/a    | —                    | AI-71, AI-78 | Required by safety invariant #8.                                                                             |
| `evaluation.gold_cases`                     | Gold case management              | `planned`      | —                                                       | capability id                  | versioned gold fixtures          | high   | yes    | no     | none                 | AI-76        | Reviewed fixtures only; a gold case is a human-reviewed artifact.                                            |
| `evaluation.evaluator`                      | Evaluator contracts               | `planned`      | —                                                       | gold + candidate               | score per metric                 | medium | no     | n/a    | none                 | AI-75        | Deterministic + reviewed LLM-as-judge. Never auto-approves.                                                  |
| `evaluation.benchmark.run`                  | Benchmark execution               | `planned`      | —                                                       | capability + profile           | benchmark record                 | medium | no     | n/a    | provider per profile | AI-77        | Reproducible runs; budget governed.                                                                          |
| `evaluation.profile.promote`                | Profile promotion                 | `planned`      | —                                                       | benchmark record               | lifecycle transition             | high   | yes    | n/a    | none                 | AI-77, AI-78 | Promotion is a high-impact governance decision that requires reviewed evaluation.                            |
| `routing.best_profile`                      | Best-profile router               | `planned`      | —                                                       | capability + governance + eval | selected profile                 | medium | no     | n/a    | n/a                  | AI-78        | Must not be a "cheapest model" selector.                                                                     |
| `routing.lifecycle.production`              | Production profile selection      | `planned`      | —                                                       | profile list                   | filtered to `production`         | medium | no     | n/a    | n/a                  | AI-78        | `candidate` and `shadow` are never selected for the operational path.                                        |
| `routing.lifecycle.shadow`                  | Shadow profile execution          | `planned`      | —                                                       | profile + request              | shadow audit record              | low    | no     | n/a    | provider per profile | AI-78        | Output must never affect operational response; cannot become approved automatically.                         |

## 3. Current versus planned summary

The counts in this table are **derived** from `config/ai-capabilities.json`
and verified by `tests/architecture/ai-capabilities.test.ts` (the
"count derivation" suite). They cannot drift silently: any catalog edit
that breaks the table must also update the test, and vice versa.

| Group                                               | `existing` | `partial` | `planned` | `out_of_scope` | `retired` | Total  |
| --------------------------------------------------- | ---------- | --------- | --------- | -------------- | --------- | ------ |
| Source acquisition / snapshot / delta               | 3          | 4         | 0         | 0              | 1         | 8      |
| Evidence extraction                                 | 2          | 1         | 0         | 0              | 5         | 8      |
| Review, approval, approved artifacts                | 5          | 2         | 0         | 0              | 0         | 7      |
| Provider execution, governance, evaluation, routing | 0          | 0         | 13        | 1              | 3         | 17     |
| **Total**                                           | **10**     | **7**     | **13**    | **1**          | **9**     | **40** |

Human-review distribution across the 40 capabilities:

- `human_review: true` — 13 capabilities. These are the regulated
  capabilities that interpret evidence, generate classification or
  advisory candidates, approve artifacts, or make high-impact governance
  decisions.
- `human_review: false` — 27 capabilities. These are mechanical,
  infrastructural, or transport-layer capabilities, or they enforce a
  previously approved rule. Where they are downstream-eligible, the
  approval is the precondition of an upstream capability (e.g. the HTTP
  server serves an already-approved artifact).

The "Provider execution, governance, evaluation, routing" group is almost
entirely on the roadmap. Today, AI Lab has a complete
source-to-approved-export path for the Argentina classifier scope, plus a
draft advisory workspace. Every pre-AI-72 direct execution path (the legacy
Worker, the direct DeepSeek agents, the Cloudflare AI Gateway wrapper, the
Workers AI embedding runtime, and the extraction CLI) was retired on
2026-07-13; provider execution exists only through the MultiProviderGateway
and its adapter layer, enforced by
`tests/architecture/execution-boundary.test.ts`.

## 4. Risk tier definitions

- `low` — non-regulated content; no PII; advisory only.
- `medium` — regulated content with evidence references; review-gated;
  affects operational decisions but never produces a final regulatory
  ruling.
- `high` — content that influences a regulated decision (HS/NCM, customs,
  tariff, intervention, REACH/CLP, organic/ecological, advisory to a
  client); always human-review required and never downstream-eligible
  without explicit approval.

## 5. Human review model

The catalog distinguishes two kinds of capabilities by their `human_review`
field:

- `human_review: true` — the capability itself requires explicit human
  judgment. The capability either interprets regulated or commercial
  evidence, generates classification or advisory candidates, approves an
  artifact, promotes an execution profile, or makes another high-impact
  governed decision. The list is in
  `tests/architecture/ai-capabilities.test.ts` and includes
  `evidence.extraction.normative_claims`,
  `evidence.classifier_candidate.generate`, `review.human.gate.regulatory_research`,
  `artifact.approved.generate`, `evaluation.profile.promote`, and others.
- `human_review: false` — the capability is mechanical, infrastructural,
  or applies a previously approved rule. Examples: immutable snapshot
  writing, deterministic source monitoring, embedding generation, schema
  validation, the HTTP artifact server, the policy-enforcement layer,
  and the provider-adapter transport. Where a `human_review: false`
  capability is `downstream_allowed: true`, the approval was the
  precondition of a separate regulated capability, not an automatic
  effect of this one. The `artifact.approved.serve_http` row is the
  only such case today; the test asserts that no other
  `human_review: false` capability may set `downstream_allowed: true`.

A `human_review: false` capability never implies automatic downstream
approval. The test `human_review: false never implies automatic
downstream approval` enforces this with a small allowlist of
serve-only capabilities. A shadow or candidate lifecycle state
(planned for AI-78) cannot be `downstream_allowed: true` and cannot
become approved automatically.

## 5. Provider dependency rules

The capability map records provider dependency because ADR-003 makes
provider selection a contract-level concern, not a domain concern. The
rules are:

- A capability is `provider_execution: "required"` if the capability
  cannot produce useful output without invoking a model.
- A capability is `provider_execution: "optional"` if a deterministic
  fallback is acceptable (e.g. evidence embedding refresh can be skipped
  when no embeddings are needed).
- A capability is `provider_execution: "none"` if it never invokes a
  model. Most source/snapshot/delta/review/export capabilities are in this
  category.

The machine-readable catalog at `config/ai-capabilities.json` records the
same fact as the `provider_execution` field. Reviewers and later PRs
should treat any row that lists a specific `provider_id` or `model_id` as
a bug, because that is what ADR-003 explicitly forbids.

## 6. Capability → Roadmap dependency crosswalk

| Capability                                   | Required roadmap PR    |
| -------------------------------------------- | ---------------------- |
| `evidence.extraction.qwen_dashscope`         | — (retired 2026-07-13) |
| `evidence.extraction.langgraph_workflow`     | — (retired 2026-07-13) |
| `evidence.embedding.refresh`                 | — (retired 2026-07-13) |
| `evidence.regulatory_research.question_prep` | AI-71                  |
| `source.acquisition.multi_country`           | AI-72, AI-78           |
| `source.regulatory_research.advisory_input`  | AI-71, AI-72           |
| `source.regulatory_advisory.readiness_check` | AI-71, AI-72           |
| `review.human.gate.regulatory_research`      | AI-71                  |
| `provider.execution.cloudflare_ai_gateway`   | — (retired 2026-07-13) |
| `provider.execution.deepseek_direct`         | — (retired 2026-07-13) |
| `governance.privacy.zdr`                     | AI-73                  |
| `governance.data.classification`             | AI-73                  |
| `governance.budget.cost_governor`            | AI-74                  |
| `governance.allowlist.providers`             | AI-71, AI-73           |
| `governance.audit.record`                    | AI-73, AI-78           |
| `governance.fail_closed`                     | AI-71, AI-78           |
| `evaluation.gold_cases`                      | AI-76                  |
| `evaluation.evaluator`                       | AI-75                  |
| `evaluation.benchmark.run`                   | AI-77                  |
| `evaluation.profile.promote`                 | AI-77, AI-78           |
| `routing.best_profile`                       | AI-78                  |
| `routing.lifecycle.production`               | AI-78                  |
| `routing.lifecycle.shadow`                   | AI-78                  |

A capability that does not appear in the crosswalk has no roadmap
dependency beyond the current code path. Adding a new row that does not
appear in the crosswalk is allowed; adding a new roadmap PR that
introduces a capability not in the map is a documentation gap that must
be closed before the PR is approved.

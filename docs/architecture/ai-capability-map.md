# AI Capability Map (AI-70)

Status: documentation-only inventory. Pairs with
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
  `out_of_scope`);
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

We do not mark a capability `existing` merely because a document or
placeholder file exists. A capability is `existing` only when there is a
deterministic, test-covered code path that produces the documented output.

## 2. Capability groups

The map is grouped by domain family so reviewers can find the relevant rows
quickly. Every group below has the same column shape.

### 2.1 Source acquisition, snapshotting, and delta

| ID | Name | Status | Owner | Input | Output | Risk | Review | Export | Provider | Roadmap | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `source.acquisition.monitor` | Source acquisition monitor | `existing` | `src/agents/source-monitor.ts` | local source folders | structured delta report | low | no | no | none (offline) | — | Reads local source folders only; no live network. |
| `source.snapshot.write` | Immutable snapshot writing | `existing` | `src/agents/snapshot-writer.ts` | local fixture file | versioned snapshot JSON + SHA-256 | low | no | no | none | — | Writes to `data/sources/<source_id>/<date>.json`; validates against `intelligence-source-snapshot.schema.json`. |
| `source.delta.detect` | Snapshot delta detection | `existing` | `src/agents/delta-analyzer.ts` | two snapshot artifacts | evidence packet with claim types | low | yes (always) | no | none | — | Outputs `delta-analyzer-evidence-packet.schema.json`; claims are limited to the vlatam-global allowlist. |
| `source.snapshot.embedded_evidence_demo` | Embedded-evidence demo packet | `partial` | `snapshots/pcram/extractable-evidence-packet-demo-embedded-evidence.json` | fixture | deterministic draft claims | low | yes (always) | no | `embedded-evidence-demo-provider` (offline) | AI-72 | Schema validation path only; not authoritative. |
| `source.acquisition.cloudflare_pipeline_v1` | Cloudflare pipeline source acquisition | `partial` | `src/worker/index.ts`, `src/ai/ai-gateway.ts`, `wrangler.toml` | KV namespaces + Vectorize | staged snapshot/diff | low | no | no | Cloudflare AI Gateway (gated flag) | AI-72 | Currently `CLOUDFLARE_PIPELINE_V1_ENABLED=false`; runtime off. |
| `source.acquisition.multi_country` | Multi-country source acquisition (CL/UY/PY) | `partial` | `src/adapters/types.ts` (interface only), `docs/multi-country-architecture-design.md` | country code + NCM | tariff/intervention/cost breakdown | medium | yes | no | none yet | AI-72, AI-78 | `CountryAdapter` interface is defined; per-country adapters not implemented. |
| `source.regulatory_research.advisory_input` | Regulatory research advisory input | `partial` | `src/advisory/regulatory-research-workspace.ts` | jurisdiction + product | research workspace draft | medium | yes (always) | no | none | AI-71, AI-72 | HTML read model is draft and `downstream_allowed: false`. |
| `source.regulatory_advisory.readiness_check` | Advisory readiness classification | `partial` | `src/advisory/regulatory-advisory-read-model.ts` | embedded source records | coverage classification per review area | medium | yes (always) | no | none | AI-71, AI-72 | Read-model only; not yet exposed via the export contract. |

### 2.2 Evidence extraction (LLM-assisted)

| ID | Name | Status | Owner | Input | Output | Risk | Review | Export | Provider | Roadmap | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `evidence.extraction.normative_claims` | Normative-claim extraction | `existing` | `src/agents/normative-evidence-agent.ts`, `scripts/run-extraction.ts` | evidence packet | draft `ai-extraction-result` | high | yes (always) | no | DeepSeek (`provider_id="deepseek-chat"`) | AI-72, AI-78 | Output is always `human_review_required=true`, `downstream_allowed=false`; runs from fixtures. |
| `evidence.extraction.qwen_dashscope` | Qwen/DashScope extraction (spike) | `partial` | `docs/qwen-langgraph-evidence-extraction-spike.md`, `src/intelligence/qwen-dashscope-provider.ts` (referenced in spike docs) | evidence packet | draft `ai-extraction-result` | high | yes (always) | no | DashScope/Qwen (manual dry-run only) | AI-72 | Not wired into the runtime path; fixture-replay only. |
| `evidence.extraction.langgraph_workflow` | LangGraph extractor/critic/validator | `partial` | `tests/workflows/pcram-workflow.test.ts` references a `runPCRAMPipeline` workflow | evidence packet | draft `ai-extraction_result` | high | yes (always) | no | fake provider (deterministic test) | AI-72 | Localized in tests; not wired to a real provider. |
| `evidence.extraction.critic_review` | Critic review pass | `existing` | `src/agents/critic-agent.ts` | draft agent results | critic discrepancies + warnings | high | yes | no | DeepSeek (via `RouterAgent`) | AI-78 | Always runs after the specialized agents; same `human_review_required` invariants. |
| `evidence.embedding.bge_m3` | Multilingual embedding generation | `existing` | `src/utils/embedding-service.ts`, `scripts/generate-*-embeddings.ts` | text chunks | 1024-dim vectors | low | no | no | Cloudflare Workers AI `@cf/baai/bge-m3` | — | Used to build AR/InfoLEG/VUCE indexes; not a regulated capability. |
| `evidence.embedding.refresh` | Embedding refresh on snapshot change | `planned` | — | source snapshot diff | new embeddings | low | no | no | Cloudflare Workers AI | AI-72, AI-77 | Tracked under multi-country design; not yet wired to delta analyzer. |
| `evidence.classifier_candidate.generate` | Classifier candidate generation | `existing` | `src/agents/evidence-writer.ts` | reviewed extraction result | `classifier-intelligence-artifact` (candidate) | high | yes | no | none (deterministic) | — | Output is always `downstream_allowed=false` until reviewed. |
| `evidence.regulatory_research.question_prep` | Research question prep | `partial` | `src/advisory/regulatory-research-workspace.ts` | workspace + research questions | per-question source/evidence requirements | medium | yes | no | none | AI-71 | Draft; surfaces explicit missing-evidence gaps. |

### 2.3 Review, approval, and approved artifacts

| ID | Name | Status | Owner | Input | Output | Risk | Review | Export | Provider | Roadmap | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `review.human.gate` | Human review gate | `existing` | `src/agents/human-review-gate.ts` | draft artifact + reviewer | reviewed artifact | high | yes (by definition) | conditional | none | — | Approved path flips `governance.downstream_allowed=true` and `review_status=reviewed_approved`. |
| `review.human.gate.regulatory_research` | Advisory workspace readiness | `partial` | `src/advisory/regulatory-research-workspace.ts` | workspace + evidence | readiness summary | medium | yes | no | none | AI-71 | Surface missing evidence; no final answer emitted. |
| `artifact.approved.generate` | Approved artifact generation | `existing` | `src/agents/human-review-gate.ts` | reviewed artifact | artifact with `downstream_allowed=true` | high | yes (precondition) | conditional | none | — | Only writes to `data/intelligence/<source_id>/<artifact_id>.json` after explicit approval. |
| `artifact.export_contract.generate` | Export contract generation | `existing` | `src/agents/export-contract.ts` | approved artifact | `classifier-approved-artifact-export` | high | yes (precondition) | yes (read-only) | none | — | Validates against `classifier-approved-artifact-export.schema.json`; drops governance and reviewer fields. |
| `artifact.export_catalog.generate` | Export catalog index | `partial` | `exports/approved-catalog/`, `docs/classifier-approved-artifact-export-catalog-p1.md` | verified catalog | read-only index | medium | yes | no (read-only index) | none | — | Repo-local bundle; deterministic, no runtime bridge. |
| `artifact.export_bundle.consumer_contract` | Approved export bundle consumer contract | `existing` | `docs/approved-export-bundle-consumer-contract.md` | bundle index | consumer agreement | low | no | no | none | — | Document-only contract; vlatam-global consumption is future work. |
| `artifact.approved.serve_http` | Approved artifact serving | `existing` | `src/server/api-server.ts` | HTTP request | `classifier-approved-artifact-export` | medium | no (post-review) | yes | none | — | Fails closed on schema violation; rate-limited; API-keyed. |

### 2.4 Provider execution, governance, evaluation, and routing

| ID | Name | Status | Owner | Input | Output | Risk | Review | Export | Provider | Roadmap | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `provider.execution.cloudflare_ai_gateway` | Cloudflare AI Gateway wrapper | `partial` | `src/ai/ai-gateway.ts` | prompt + config | `AIGatewayResponse` (normalized) | medium | n/a | n/a | DeepSeek + `@cf/meta/llama-3.1-8b-instruct` (declared default) | AI-72 | Gated by `CLOUDFLARE_PIPELINE_V1_ENABLED`; passthrough when off. |
| `provider.execution.deepseek_direct` | DeepSeek direct calls | `partial` | `src/agents/normative-evidence-agent.ts` | evidence packet | draft claims | high | yes | no | DeepSeek via OpenAI SDK | AI-72, AI-78 | Domain code currently imports `openai`; ADR-003 requires removal. |
| `provider.execution.qwen_dashscope_runtime` | DashScope/Qwen runtime | `partial` | spike only | evidence packet | draft claims | high | yes | no | DashScope OpenAI-compatible | AI-72 | Manual dry-run only; not wired to runtime. |
| `provider.execution.local_runtime` | Local model runtime | `out_of_scope` | — | — | — | — | — | — | — | — | Not on the AI-71 to AI-78 roadmap. |
| `governance.privacy.zdr` | Privacy & ZDR enforcement | `planned` | — | capability invocation | redaction / block | high | n/a | n/a | — | AI-73 | AI-70 only defines the layer; enforcement is AI-73. |
| `governance.data.classification` | Data classification | `planned` | — | payload | class label | medium | n/a | n/a | — | AI-73 | Used by privacy policy; classifier TBD. |
| `governance.budget.cost_governor` | Budget governor | `planned` | — | invocation | allow / soft-degrade / hard-fail | medium | n/a | n/a | — | AI-74 | AI-70 does not implement cost or token metering. |
| `governance.allowlist.providers` | Provider allowlist per capability | `planned` | — | capability id | allow / deny | medium | n/a | n/a | — | AI-71, AI-73 | Owned by the capability contract in AI-71. |
| `governance.audit.record` | Audit record writing | `planned` | — | invocation | local audit entry | low | n/a | n/a | — | AI-73, AI-78 | Local file; no network. |
| `governance.fail_closed` | Fail-closed behavior | `planned` | — | unknown config | refuse | n/a | n/a | n/a | — | AI-71, AI-78 | Required by safety invariant #8. |
| `evaluation.gold_cases` | Gold case management | `planned` | — | capability id | versioned gold fixtures | high | yes (always) | no | none | AI-76 | Reviewed fixtures only; never synthetic demo. |
| `evaluation.evaluator` | Evaluator contracts | `planned` | — | gold + candidate | score per metric | medium | n/a | n/a | none | AI-75 | Deterministic + reviewed LLM-as-judge. |
| `evaluation.benchmark.run` | Benchmark execution | `planned` | — | capability + profile | benchmark record | medium | n/a | n/a | provider per profile | AI-77 | Reproducible runs; budget governed. |
| `evaluation.profile.promote` | Profile promotion | `planned` | — | benchmark record | lifecycle transition | high | yes | n/a | none | AI-77, AI-78 | Promotion requires reviewed evaluation. |
| `routing.best_profile` | Best-profile router | `planned` | — | capability + governance + eval | selected profile | medium | n/a | n/a | n/a | AI-78 | Must not be a "cheapest model" selector. |
| `routing.lifecycle.production` | Production profile selection | `planned` | — | profile list | filtered to `production` | medium | n/a | n/a | n/a | AI-78 | `candidate` and `shadow` are never selected for the operational path. |
| `routing.lifecycle.shadow` | Shadow profile execution | `planned` | — | profile + request | shadow audit record | low | n/a | n/a | provider per profile | AI-78 | Output must never affect operational response. |

## 3. Current versus planned summary

| Group | `existing` | `partial` | `planned` | `out_of_scope` |
| --- | --- | --- | --- | --- |
| Source acquisition / snapshot / delta | 3 | 4 | 0 | 0 |
| Evidence extraction | 3 | 3 | 1 | 0 |
| Review, approval, approved artifacts | 3 | 3 | 0 | 0 |
| Provider execution, governance, evaluation, routing | 0 | 2 | 12 | 1 |

The table is intentionally honest: today, AI Lab has a complete
source-to-approved-export path for the Argentina classifier scope, plus a
draft advisory workspace and a Qwen/DashScope spike. Everything in the
**Provider execution, governance, evaluation, routing** group is on the
roadmap and not yet present, with the exception of two partial entries:

- the Cloudflare AI Gateway wrapper (`partial`, gated off); and
- DeepSeek direct calls (`partial`, currently embedded in the normative
  evidence agent, which the next ADR explicitly removes).

## 4. Risk tier definitions

- `low` — non-regulated content; no PII; advisory only.
- `medium` — regulated content with evidence references; review-gated;
  affects operational decisions but never produces a final regulatory
  ruling.
- `high` — content that influences a regulated decision (HS/NCM, customs,
  tariff, intervention, REACH/CLP, organic/ecological, advisory to a
  client); always human-review required and never downstream-eligible
  without explicit approval.

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

| Capability | Required roadmap PR |
| --- | --- |
| `evidence.extraction.qwen_dashscope` | AI-72, AI-78 |
| `evidence.extraction.langgraph_workflow` | AI-72 |
| `evidence.embedding.refresh` | AI-72, AI-77 |
| `evidence.regulatory_research.question_prep` | AI-71 |
| `source.acquisition.multi_country` | AI-72, AI-78 |
| `source.regulatory_research.advisory_input` | AI-71, AI-72 |
| `source.regulatory_advisory.readiness_check` | AI-71, AI-72 |
| `review.human.gate.regulatory_research` | AI-71 |
| `provider.execution.cloudflare_ai_gateway` | AI-72 |
| `provider.execution.deepseek_direct` | AI-72, AI-78 (must move behind contracts) |
| `governance.privacy.zdr` | AI-73 |
| `governance.data.classification` | AI-73 |
| `governance.budget.cost_governor` | AI-74 |
| `governance.allowlist.providers` | AI-71, AI-73 |
| `governance.audit.record` | AI-73, AI-78 |
| `governance.fail_closed` | AI-71, AI-78 |
| `evaluation.gold_cases` | AI-76 |
| `evaluation.evaluator` | AI-75 |
| `evaluation.benchmark.run` | AI-77 |
| `evaluation.profile.promote` | AI-77, AI-78 |
| `routing.best_profile` | AI-78 |
| `routing.lifecycle.production` | AI-78 |
| `routing.lifecycle.shadow` | AI-78 |

A capability that does not appear in the crosswalk has no roadmap
dependency beyond the current code path. Adding a new row that does not
appear in the crosswalk is allowed; adding a new roadmap PR that
introduces a capability not in the map is a documentation gap that must
be closed before the PR is approved.

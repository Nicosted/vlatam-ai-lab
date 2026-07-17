# AI-120 Continuous Agent Runtime Tournament Architecture

Status: architecture and contracts only. Effective repository snapshot: commit `15334caae6c7f385c2e2baf4e8ef7e33d7c1b900`, inspected 2026-07-17. No runtime, gateway, provider, model, endpoint, adapter, budget governor, authorization, traffic stage, or agent is activated by AI-120.

## Control-plane doctrine

AI LAB is the neutral control plane. It owns candidate registration, immutable benchmark selection, policy equivalence, evaluation, evidence lineage, cost reconciliation, disqualification, human review, and read-only presentation. Evaluated components supply results and normalized events but cannot score, approve evidence, promote themselves, choose their evaluator, or mutate traffic.

The evaluated dimensions are deliberately separate:

`runtime candidate × inference gateway candidate × model candidate × provider endpoint candidate × tournament execution profile × capability`

A Vercel runtime, a Cloudflare runtime, the governed OpenRouter gateway, a direct endpoint, Workers AI, Vercel AI Gateway, and a model are not interchangeable competitors. A profile binds one identity from each applicable layer. Rankings compare profiles for a capability while preserving every component identity and version.

## Contract inventory

Contract version `1.0.0` is implemented in `src/tournament/` and closed JSON Schemas:

| Contract                     | Purpose                                                                                                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| runtime candidate            | Runtime identity, durability, session/resume/cancellation, review, subagent, sandbox, observability, reasoning privacy, geography, cost/evidence support, lifecycle, approval and kill switch. |
| inference gateway candidate  | Gateway identity, provider-selection control, approved endpoints, privacy/ZDR, approval and switch state.                                                                                      |
| model candidate              | Model/version, capabilities, approved endpoints, lifecycle and evidence.                                                                                                                       |
| provider endpoint candidate  | Exact provider/endpoint identity, region, retention, ZDR, lifecycle and evidence.                                                                                                              |
| tournament execution profile | Exact cross-layer binding plus capability, traffic stage, privacy, reasoning, authorization, timeout and attempts.                                                                             |
| benchmark case selection     | Immutable sentinel/rotating slice, suite version/hash, timestamp and contamination review.                                                                                                     |
| normalized runtime event     | Metadata-only cross-runtime event vocabulary.                                                                                                                                                  |
| tournament run               | Deterministic fan-out, isolation, policy hash, idempotency, budget, status and lineage.                                                                                                        |
| candidate result             | Per-capability scores, disqualification, exact reconciliation and evidence.                                                                                                                    |
| daily tournament report      | Runs, results, three budget windows, blockers and review requirement.                                                                                                                          |
| weekly tournament review     | Separate rankings, capability-specific ranking and explicit absence of a universal winner.                                                                                                     |
| promotion decision           | Independent human decision and explicit governed lifecycle transition.                                                                                                                         |
| regression decision          | Independent degrade/suspend/block/retain decision.                                                                                                                                             |

Registered runtime candidates are `ai-lab-native`, `vercel-eve`, and `cloudflare-agents-workflows`. All are disabled, kill-switched, unapproved, and benchmark-ineligible. The latter two remain `discovered`; their versions are `0.0.0` because current version evidence was not collected.

## Normalized event vocabulary and reasoning privacy

The vocabulary is: `session_started`, `turn_started`, `step_started`, `action_requested`, `action_completed`, `input_requested`, `authorization_required`, `subagent_started`, `subagent_completed`, `structured_result_completed`, `usage_recorded`, `step_completed`, `turn_completed`, `session_waiting`, `session_completed`, `cancelled`, and `failed`.

Events contain only identifiers, timestamp, correlation, status code and evidence references. They have no prompt, response, document, customer field, reviewer identity, private reasoning, chain-of-thought, or free-form reasoning payload. Runtime events accept only `disabled` or `redacted` reasoning capture. Candidate/profile declarations may name `approved_summary`, but only with a separate approval ID; this permits a reviewed concise rationale in a separate evidence artifact, never hidden reasoning. Default is `disabled`.

Untrusted runtime events are validated, ordered by AI LAB correlation metadata, bound to the run/profile, and treated as evidence inputs rather than facts. Missing, duplicate, impossible, or unbound events fail the affected result.

## Lifecycle and traffic

Lifecycle states are `discovered → sandbox_only → benchmark_candidate → shadow → canary → approved → preferred`, with `degraded`, `suspended`, and `blocked` safety states. Allowed transitions are encoded in `src/tournament/lifecycle.ts`. Every transition requires independent human approval and at least one reviewed evidence reference. Unknown or skipped transitions fail closed. `blocked` may return only to `discovered` for complete re-evaluation; no prior approval is carried forward.

Traffic stages are distinct from lifecycle:

1. `synthetic_benchmark_only` uses public/synthetic/local fixtures only.
2. `shadow` observes duplicated eligible inputs without affecting output or external actions.
3. `canary` receives a separately approved bounded percentage.
4. `approved_traffic` is bounded normal traffic for the named capability.
5. `preferred_traffic` receives a human-approved majority, never an automatic 100%.
6. `fallback` is explicit, bounded and independently governed; fallback cannot weaken privacy, authorization, region, budget, or evidence requirements.

Promotion does not imply 100% traffic. Every stage change needs a separate human decision, capability scope, maximum share, expiry, rollback criterion and kill switch. AI-120 creates none of those authorizations.

## Daily evaluation

The daily controller is a future scheduler behind the contracts; it is not implemented here.

1. Select an immutable slice before candidate fan-out. The slice contains stable sentinel cases plus a deterministic rotating set. Bind suite ID/version, selection hash, contamination review and timestamp.
2. Resolve only registered, approved, lifecycle-eligible profiles. A candidate never supplies its own profile or cases.
3. Reserve the applicable daily budget before fan-out. Exhaustion blocks remaining work. Weekly exploration and monthly endpoint validation use separate ledgers and cannot borrow from daily funds.
4. Produce a deterministic candidate/case matrix sorted by exact versioned identity. Each cell has a stable idempotency key.
5. Isolate cells by runtime session/sandbox and correlation. Give equivalent normalized input, tool allowlist, privacy class, authorization policy, timeout, retry policy, evaluator and evidence set.
6. Retry only explicitly transient pre-action failures, sequentially, up to the profile maximum. Privacy, authorization, safety, schema, evidence, budget, external-action ambiguity and policy failures are never retryable. A retry retains a new attempt ID under the same idempotency key and cannot consume cost twice.
7. Normalize events and structured results. Timeout produces `cancelled` or `failed`; the controller requests cancellation, closes authorization, reconciles cost, and never silently falls back.
8. Measure end-to-end and active-step latency separately; completion/timeout/error rates; schema conformance; tool arguments/outcomes; privacy/ZDR/region/retention evidence; and human-review boundaries.
9. Reconcile reserved versus provider-reported/verified actual cost with exact units. Missing or inconsistent reconciliation disqualifies the result.
10. Emit candidate results and one daily report with complete evidence lineage from selection → policy → component versions → normalized events → result → reconciliation. Partial reports are evidence, never promotion inputs.

No customer or production data is eligible. Sentinel and rotating fixtures must be public, synthetic, or separately reviewed/sanitized. Cached outputs must be marked, keyed by exact input/policy/component versions, and reported separately; a cache hit cannot stand in for uncached latency or provider-validation evidence.

## Weekly review and rankings

The weekly artifact aggregates only complete daily reports with compatible contract/evaluator versions. It produces five independent views:

- quality: task correctness, completeness, evidence grounding and abstention;
- value: quality subject to exact reconciled cost, never quality replaced by cheapness;
- reliability: completion, retry-free success, schema stability and cancellation behavior;
- privacy and governance: policy conformance, ZDR/retention/region evidence and authorization integrity;
- capability-specific performance: separate rankings for every capability and execution constraint.

`universal_winner` is contractually `false`. A runtime/profile may be preferred for document intake, remain a benchmark candidate for technology watch, and be blocked for regulatory research. Frontier status, vendor identity, marketing claims and aggregate popularity are not scoring inputs. Frontier models are promoted only where sustained reviewed evidence demonstrates advantage.

## Scoring and disqualification

Each result reports normalized `[0,1]` quality, reliability, tool correctness, latency, cost efficiency and governance compliance. A ranking policy must publish weights/thresholds before the slice is selected. Scores are never averaged across incompatible capabilities and missing dimensions never default to zero or pass.

The following are disqualifying, not score penalties: critical privacy/ZDR/retention/region failure; stale, missing or replayed authorization; safety-policy violation; incomplete/tampered evidence; incorrect or unapproved external action; sandbox escape; secret leakage; unapproved endpoint/provider substitution; missing cost reconciliation; candidate self-evaluation/self-promotion; or benchmark contamination. A disqualified result is excluded from every favorable ranking and may trigger a regression review. Multiple ordinary failures may also breach a published reliability gate.

## Cost controls

Three independent hard limits are required:

| Budget                      | Scope                                                         | Stop rule                                             |
| --------------------------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| daily benchmark             | scheduled sentinel and rotating execution                     | stop before the next reservation when exhausted       |
| weekly exploration          | new candidates/configurations outside the stable daily matrix | stop exploration; stable daily budget is unaffected   |
| monthly provider validation | exact endpoint/provider/version validation                    | stop endpoint validation and keep endpoint unapproved |

Every reservation binds run, profile, case, attempt, pricing evidence and budget window. Actual cost is reconciled once. Timeout/cancellation still reconcile. Unknown price or usage blocks execution. Budgets cannot borrow, go negative, reset on retry, or be overridden by a candidate. The existing AI-74 exact-rational ledger is the intended enforcement dependency; AI-120 does not enable it for a tournament or production.

## Initial comparable agents (definitions only)

### Technology Watch Agent

- Purpose: identify material public changes in AI runtime/model/provider capabilities for human review.
- Allowed inputs: timestamped public documentation snapshots and repository-approved metadata.
- Forbidden: authenticated browsing, vendor account access, execution, purchasing, promotion, scoring its own vendor, or storing raw private reasoning.
- Output: versioned evidence packet with claim, source locator/hash, observation time, uncertainty, affected candidate/capability and review status.
- Evaluation: source freshness, claim precision/recall, duplicate suppression, provenance, abstention, latency and cost.
- Human boundary/privacy: all changes and candidate-impact conclusions require review; privacy class `public` only.
- Initial cases: release-note change, pricing ambiguity, removed feature, contradictory docs, no-material-change sentinel.

### Regulatory Research Agent

- Purpose: produce evidence-bound research candidates from approved public regulatory snapshots.
- Allowed inputs: reviewed official-source snapshots, jurisdiction scope and synthetic case facts.
- Forbidden: legal conclusion, customer data, external submission, authorization issuance, provider selection, approval or export.
- Output: existing evidence/dossier-compatible draft with citations, jurisdiction, uncertainty, missing facts and `downstream_allowed: false`.
- Evaluation: citation correctness, jurisdiction scope, temporal validity, claim support, abstention/escalation, schema/tool correctness and governance.
- Human boundary/privacy: every substantive output requires domain review; initial privacy class `public`, later regulated evaluation needs separate approval and verified ZDR.
- Initial cases: tariff-date conflict, missing official source, cross-jurisdiction mismatch, adverse-change sentinel, insufficient-facts abstention.

### Document Intake Agent

- Purpose: classify and extract bounded fields from synthetic commercial documents for reviewer triage.
- Allowed inputs: synthetic/redacted fixture documents with explicit classification and extraction schema.
- Forbidden: production/customer documents, payments, filing, supplier contact, external action, autonomous downstream routing or approval.
- Output: extraction candidate, field-level evidence coordinates, confidence, omissions, schema status and mandatory review state.
- Evaluation: field accuracy, evidence alignment, schema conformance, prompt-injection resistance, privacy/redaction, latency and reconciled cost.
- Human boundary/privacy: reviewer approves all use; initial privacy class `internal` synthetic only.
- Initial cases: clean invoice, missing field, conflicting totals, embedded prompt injection, unsupported format, sensitive-field redaction.

## Operator read model

The existing Operator contract now has a `tournament` section listing registered runtime candidates, lifecycle, benchmark eligibility, latest daily/weekly references, blockers, budget, kill switch, promotion recommendation and human-decision requirement. It exposes no mutation/action method and `write_actions_available` is `false`. Current daily/weekly references are `null`, budgets `disabled`, recommendations `none`, all switches active and all candidates ineligible.

## Fail-closed invariants and limitations

- OpenRouter remains disabled and fail closed. Its governed gateway is a candidate component, never the controller.
- GLM and MiniMax blockers remain authoritative and unchanged.
- No provider endpoint is approved, adapter enabled, runtime deployed, authorization issued/consumed, budget activated, model invoked, traffic allocated or external action performed.
- The future scheduler, event ingestion, evaluator execution, traffic splitter and promotion executor are deliberately absent.
- This architecture cannot activate production. Promotion/regression contracts are evidence records only.

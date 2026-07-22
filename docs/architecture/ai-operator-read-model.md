# AI LAB Operator Read Model

Status: backend read model implemented (contract `1.6.0`); local read-only
console implemented; future internal API not implemented.

## Purpose

The Operator Read Model contract `1.6.0` consolidates already-evaluated,
repository-governed state into one concise, deterministic, audit-safe JSON
representation. It feeds the local read-only Operator Console and a future
internal read-only API. It cannot approve, authorize, configure, mutate,
consume, or execute anything.

The dependency direction is:

`registries + evidence + readiness + proposal + preflight + activation review + gold case + authorization + consumption + gateway metadata → pure builder → read-only console → future internal API`

## Contract 1.6.0 additions (2026-07-22)

Version `1.6.0` adds an audit-safe `arca_approved_artifact` projection. The
repository-backed state is explicitly absent: artifact ID/hash,
candidate/review/evaluation bindings, builder identity, and build timestamp are
all null. Export remains `not_exported`, publication remains `not_published`,
production reliance remains `not_authorized`, and every external/write
authority is false. The projection does not discover, build, approve, export,
or publish artifacts and adds no form, button, POST endpoint, persistence, or
mutation control.

## Contract 1.5.0 additions (2026-07-22)

Version `1.5.0` adds an audit-safe `arca_candidate_review` projection backed by
the synthetic pending AI-127 repository example. It exposes only candidate
identity/hash, review lifecycle, evaluator outcome, reviewer presence, expiry,
unresolved-findings count, later-builder eligibility, and false export and
publication authority. The repository state has no reviewer, no decision, no
approval, and no eligibility. The projection calls the authoritative AI-127
evaluator and does not re-decide review validity. No approval button, form,
POST endpoint, persistence, or mutation control was added.

## Contract 1.4.0 additions (2026-07-17)

Version `1.4.0` adds an optional, read-only `conformance` projection to the GLM
5.2 governed candidate. It exposes cases attempted and passed, schema pass rate,
exact-route and ZDR evidence status, budget reconciliation, retries, duplicate
consumption behavior, blockers, independent-review requirement, activation
prohibition, and kill-switch state. After the authorized AI-122 attempt, the
projection is `failed` with unavailable route evidence, incomplete ZDR and
budget reconciliation, two retries, and safe duplicate-consumption blocking.
It contains no credential, request payload, raw model output, authorization
capability, or write action.

## Contract 1.3.0 additions (2026-07-17)

Version `1.3.0` adds read-only runtime-evidence projections for Eve and
Cloudflare: freshness, immutable/mutable source counts, unresolved gaps,
privacy blockers, durability and cost-accounting confidence, independent
review requirement, lifecycle recommendation, activation prohibition and
kill-switch state. It adds no mutation or review action.

## Contract 1.2.0 additions (2026-07-17)

Version `1.2.0` adds the read-only `tournament` section from AI-120. It exposes
registered runtime candidates, lifecycle, benchmark eligibility, latest daily
and weekly references, blockers, budget state, kill-switch state, promotion
recommendation and the human-decision requirement. `write_actions_available`
is contractually `false`. The repository state has no daily/weekly execution,
disabled budgets, active kill switches, no promotion recommendation and zero
eligible candidates. The section cannot schedule, authorize, promote or route.

## Contract 1.1.0 additions (2026-07-15)

Version `1.1.0` adds two normalized sections for the sandbox activation
human-review workflow (see
`docs/architecture/ai-openrouter-sandbox-activation-review.md`):

- `activation_review` — the activation-review evaluator outcome and reason
  codes, lifecycle, exact bounded scope, expiry, pending human decisions,
  evidence-review / activation-approval decision statuses, kill-switch and
  incident ownership statuses, allowed first-run data classification, request
  / token / timeout / retry / fallback / spend ceilings, the bound artifacts
  (identity, version, hash, resolution status), and a deterministic
  `next_governed_action` code derived only from the outcome;
- `gold_case_state` — the synthetic gold-case evaluator outcome, campaign
  status (`prepared_not_executed`), human-acceptance status, capability, and
  content hash.

Two blocker sources were added (`sandbox_activation_review`,
`sandbox_gold_case`), their outcomes participate in `invalid_state`
detection and in `pending_approvals`, and the audit metadata carries the
review and gold-case identities, hashes, and outcomes. No existing section
changed semantics; identities and reviewer names are never invented — the
model exposes decision _statuses_ only.

## Source-of-truth boundaries

The read model is not a policy engine. Registry validation and the readiness
dossier, external evidence pack, sandbox proposal, and runtime preflight
evaluators remain authoritative for their domains. Authorization, consumption,
gateway, adapter, budget, kill-switch, and secret state are exposed only as
metadata-safe status and counts. The read model normalizes evaluator outcomes
and reason codes; it never re-decides eligibility.

The pure builder in `src/operator/operator-read-model.ts` accepts injected,
validated metadata and evaluator results. It performs no filesystem scan,
current-time lookup, environment read, network call, random-ID creation, or
mutable-global access. The caller supplies the evaluation timestamp. Canonical
serialization and a domain-separated SHA-256 hash make identical inputs produce
identical output. The complete result is deeply frozen.

The repository loader in
`src/operator/repository-operator-read-model.ts` is the only filesystem-aware
layer. It reads a closed allowlist of repository JSON artifacts, invokes the
existing validators/evaluators, verifies runtime integrity bindings, and passes
safe metadata to the builder. Missing, malformed, invalid, or mismatched inputs
produce `invalid_state`; values are never invented. The loader does not import
or invoke a provider adapter, transport, gateway, authorization issuer, secret
resolver, or manual harness.

## Status normalization

System status is one of `healthy`, `attention_required`, `blocked`, or
`invalid_state`. Invalid contracts and integrity failures take precedence.
Valid governed blockers produce `blocked`. `attention_required` is reserved for
a valid, non-blocked state that still has human actions. `healthy` requires no
active blockers and an execution-ready preflight result; this representation
does not itself grant execution.

Provider, model, route, profile, readiness, evidence, proposal, preflight,
authorization, consumption, gateway/adapter, budget, kill-switch, and secret
sections retain explicit identities and statuses. The repository snapshot
accurately shows `minimax/minimax-m2.7` blocked, all executable components and
budget disabled, kill switch active, secret not configured, no exact policy,
and no consumption attempt.

## Blockers and required actions

Blockers retain the evaluator reason code, source evaluator, artifact identity
and hash where available, provider/candidate scope, severity, resolution class,
and execution impact. Ordering is lexicographic by stable blocker code.
Required actions group those source codes by owner/resolution class. They are
diagnostic records only: they do not enqueue work, mutate workflow state, ask a
provider for information, or record an approval. Ordering is stable by action
code.

## Audit-safe data policy

The serialized shape contains concise metadata, counts, stable IDs, hashes,
statuses, reason codes, safe repository paths, and optional explicitly injected
test totals. It excludes prompts, request payloads, source documents, customer
or regulated data, raw model output, authorization tokens, credentials, and
secret values. The builder does not scan terminal logs or Git history.

Secret status never resolves a reference. The repository OpenRouter status is
`not_configured` because only a reference name exists and no approved runtime
configuration is active. Environment variables are not inspected.

Kill-switch status comes only from injected or repository-safe control metadata.
The repository switch is represented as `active`; the loader does not mutate,
remotely test, or deactivate it.

## Snapshot command

`npm run operator:snapshot` prints deterministic audit-safe JSON to stdout. An
explicit `--output <path>` writes a new file and refuses overwrite. The command
exits successfully when a provider is correctly blocked and nonzero only for
`invalid_state`. `--evaluated-at <ISO timestamp>` and `--repository-root <path>`
support explicit evaluation and local validation. No network, environment,
provider, gateway, adapter, harness, migration, or persistence operation occurs.

## Future API boundary

A future internal API may serialize this contract after independent
authentication and authorization design. It must treat the read model as
read-only output and must not add action endpoints to this dependency. A future
Operator Console may render statuses, blockers, actions, and audit references,
but it must not import governance evaluators or infer missing policy state.

The human-review contracts are now a governed input to the read model; the
human-review workflow UI, internal API, and controlled sandbox activation
remain separate future layers. The read model cannot authorize or mutate
execution because it has no authorization grant, consumption store mutation,
gateway method, adapter transport, secret resolver, or provider client.

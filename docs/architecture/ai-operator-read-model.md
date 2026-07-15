# AI LAB Operator Read Model

Status: backend read model implemented; future API and console not implemented.

## Purpose

The Operator Read Model contract `1.0.0` consolidates already-evaluated,
repository-governed state into one concise, deterministic, audit-safe JSON
representation. It is designed for a future internal read-only API and Operator
Console. It cannot approve, authorize, configure, mutate, consume, or execute
anything.

The dependency direction is:

`registries + evidence + readiness + proposal + preflight + authorization + consumption + gateway metadata → pure builder → future internal API → future read-only console`

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

Human-review workflow, internal API, console, and controlled sandbox activation
remain separate future layers. The read model cannot authorize or mutate
execution because it has no authorization grant, consumption store mutation,
gateway method, adapter transport, secret resolver, or provider client.

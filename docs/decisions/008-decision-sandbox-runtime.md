# ADR-008: Governed Decision Sandbox Runtime and Common Adapter Protocol

- Status: proposed (protocol, fixed fixture policy, preflight, fixture runner, record, schemas and fixtures in review)
- Date: 2026-09-26

## Context

AI-140 defined typed decision requests and results, AI-141 Gold Decision
evaluation and AI-142 an evidence-only candidate registry. Before any
candidate can be measured, AI LAB needs a first technical execution
surface for typed decisions: a common adapter protocol and a bounded
runtime that captures hash-bound evidence. That surface must not become
execution authority, and it must not overclaim isolation.

> The fixture runner proves the execution contract.
> It does not prove that untrusted candidate code is safe to run.

> Technical ability to spawn a process is not execution authority.

## Decision

1. Introduce the closed, versioned common adapter protocol
   `ai-lab-decision-adapter` `1.0.0` with framing `json-line-v1`: exactly
   one compact UTF-8 JSON line in and out; the AI-140
   `TypedDecisionRequest` and `TypedDecisionResult` are carried unchanged.
   Any framing ambiguity fails closed. stderr is diagnostic only.
2. A runtime may execute bytes only when the bytes, protocol, limits and
   execution subject are exactly bound before process creation. The only
   executable subject is one repository-owned synthetic fixture adapter,
   allowlisted by id, version and exact artifact SHA-256; the runtime
   re-hashes the bytes and executes only the verified copy.
3. AI-142 registered candidates are recognised only to be refused:
   `registered_candidate_execution_forbidden`, before process creation.
   Tests prove this for all seven seed registry entries.
4. One fixed, closed, hash-pinned sandbox policy with bounded limits, one
   process, no retry and no fallback. Isolation claims are explicit:
   enforced controls are listed; OS-level network and filesystem
   namespaces, hostile-code containment, resource quotas, GPU isolation,
   interpreter hash binding and model supply-chain safety are recorded as
   `not_established`.
5. A pure, fail-closed preflight (`blocked` |
   `eligible_for_fixture_execution`) and an immutable execution record
   (`succeeded`, `blocked`, `timed_out`, `process_failed`,
   `protocol_failed`, `output_limit_exceeded`). Semantic identity and
   record integrity are separate hashes: `semantic_execution_hash`
   excludes operational telemetry so it is stable across clocks and
   machines; `execution_record_hash` binds the complete persisted record,
   telemetry and semantic hash included, so changing any field without
   recomputing it invalidates the record. Telemetry stream hashes cover
   exactly the counted bytes observed before termination; no stdout or
   stderr content is persisted. `output_authority` is always `none` and
   `downstream_allowed` always `false`.
6. Hashes reuse the AI-140 `registry-json-v1` canonicalizer under new
   domains `vlatam-ai-lab:decision-sandbox-policy:v1`,
   `vlatam-ai-lab:decision-adapter-envelope:v1`,
   `vlatam-ai-lab:decision-sandbox-execution-semantic:v1` and
   `vlatam-ai-lab:decision-sandbox-execution-record:v1`.
7. `node:child_process` lives only in `src/decision-sandbox/executor.ts`,
   which is not re-exported, exposes no generic subprocess utility and is
   reachable only from tests. No CLI, API route, scheduler or production
   wiring exists. AI-141 evaluation and AI-120 lifecycle are not wired.

## Consequences

AI LAB has a tested execution contract and evidence format that a future,
separately reviewed candidate adapter can target. AI-143 does not make any
upstream code safe to run: before a candidate executes, a reviewed
isolation layer must establish the relevant unestablished properties, the
subject contract must bind `candidate_id`, `candidate_hash` and
`evidence_revision` under explicit execution authorization, and
`result_origin` must be extended by a reviewed AI-140 change. AI-144 is
not started. See `docs/architecture/ai-decision-sandbox-runtime.md`.

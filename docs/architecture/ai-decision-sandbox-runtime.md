# AI-143 — Governed Decision Sandbox Runtime and Common Adapter Protocol

> The fixture runner proves the execution contract.
> It does not prove that untrusted candidate code is safe to run.

> Technical ability to spawn a process is not execution authority.

AI-143 validates the adapter protocol, process containment mechanics,
bounded I/O, timeouts and evidence capture using trusted repository-owned
fixtures. It does not establish that arbitrary upstream code is safely
sandboxed.

- Module: `src/decision-sandbox/` (pure surface `index.ts`; process
  executor `executor.ts`, not re-exported)
- Fixture adapter: `src/decision-sandbox/fixture/synthetic-decision-adapter.mjs`
- Schemas: `schemas/ai-decision-adapter-{input,output}.schema.json`,
  `schemas/ai-decision-sandbox-{policy,execution-request,execution-record}.schema.json`
- Fixtures: `data/fixtures/decision-sandbox/`
- Tests: `tests/decision-sandbox/`,
  `tests/architecture/decision-sandbox-boundary.test.ts`
- ADR: `docs/decisions/008-decision-sandbox-runtime.md`

## 1. What AI-143 establishes

```
TypedDecisionRequest (AI-140)
        ↓
DecisionSandboxExecutionRequest
        ↓
Preflight (pure, fail-closed)
        ↓
Common adapter protocol (json-line-v1)
        ↓
trusted, repository-owned synthetic fixture adapter
        ↓
bounded execution (one process, timeout, bounded I/O)
        ↓
TypedDecisionResult (AI-140, validated against the request)
        ↓
DecisionSandboxExecutionRecord (evidence)
```

It does **not** establish:

```
AI-142 candidate → real model execution
sandbox result → AI-141 benchmark → promotion
```

Those remain separate, future, separately reviewed steps.

## 2. Invariants

1. Execution capability is not execution authority.
2. A runtime may execute bytes only when the bytes, protocol, limits and
   execution subject are exactly bound before process creation.
3. A registered AI-142 candidate remains non-executable in AI-143. Its
   lifecycle flags remain `false`; nothing here reads or writes them.
4. No candidate can self-authorize or change Gold Decision truth.
5. Sandbox output is not approved intelligence. Sandbox success is not
   benchmark success and is not promotion eligibility.
6. No automatic AI-141 evaluation, no AI-120 lifecycle transition.
7. No production traffic, customer data, credentials, provider calls or
   model downloads.
8. No implicit fallback, no automatic retry, no universal winner.
9. No chain-of-thought persistence; stderr is never decision truth.
10. Fail closed on protocol ambiguity.
11. Every executable artifact is exact-hash bound.

## 3. Common adapter protocol (`ai-lab-decision-adapter` 1.0.0)

A small, closed, versioned protocol between AI LAB and a decision adapter.
It is provider-neutral and candidate-neutral: nothing in it names a
model, provider, runtime or project.

```
DecisionAdapterInput                DecisionAdapterOutput
├── contract: decision_adapter_input ├── contract: decision_adapter_output
├── protocol                         ├── protocol
├── protocol_version                 ├── protocol_version
├── execution_id                     ├── execution_id
├── request   (AI-140 request)       ├── request_hash
└── request_hash                     ├── result    (AI-140 result)
                                     └── result_hash
```

- `request` is exactly the AI-140 `TypedDecisionRequest`; `request_hash`
  is its AI-140 `computeTypedDecisionRequestHash`.
- `result` is exactly the AI-140 `TypedDecisionResult`. There is no
  competing result shape. `result_hash` must equal `result.result_hash`
  and its AI-140 recomputation.
- The output is accepted only if the execution id and request hash match
  the execution, the protocol version is exactly the bound version, the
  result validates against the request under
  `validateTypedDecisionResultForRequest`, and the result origin is the
  one the adapter is allowlisted for (`synthetic_fixture`). AI-140 still
  forces `downstream_allowed: false` inside the result.
- Private reasoning, provider/model/credential and unknown fields fail.

### Framing `json-line-v1`

- UTF-8 only; malformed UTF-8 fails (`response_not_utf8`).
- Exactly one request: the AI-140 `registry-json-v1` canonical line of
  the input envelope plus one LF is written to stdin, then stdin is
  closed.
- Exactly one response: the whole of stdout must be one compact JSON
  object line plus one LF. Compact means `JSON.stringify(JSON.parse(line))`
  reproduces the line byte for byte, so duplicate keys, whitespace,
  alternative number spellings and escape variants fail closed
  (`response_framing_invalid`) instead of being silently resolved.
- Missing response → `response_missing`; malformed JSON →
  `response_json_invalid`; non-object → `response_not_object`; a second
  JSON response → `response_multiple`; any other trailing stdout →
  `response_trailing_output`.
- stdout and stderr are bounded by the policy.
- stderr is diagnostic only. Only its byte count and a hash of the bounded
  prefix appear, in non-semantic telemetry. Its content is never persisted
  and never becomes decision truth.

## 4. Execution subject

The execution request binds exactly what runs:

```
subject
├── subject_kind: synthetic_fixture_adapter
├── adapter_id: ai-lab-synthetic-decision-fixture-adapter
├── adapter_version: 1.0.0
├── artifact_sha256: 9fbc93fe…67a3c5
└── protocol_version: 1.0.0
```

`registered_decision_candidate` (binding `candidate_id`,
`evidence_revision`, `candidate_hash`) is a recognised subject kind **only
so that it can be refused explicitly**. AI-143 blocks, before process
creation, with `registered_candidate_execution_forbidden`:

- any `registered_decision_candidate` subject;
- any subject carrying a candidate binding field;
- any adapter id that matches the AI-142 candidate id pattern (`tdc-…`).

Tests read the AI-142 seed registry and prove this for all seven entries
(`tests/decision-sandbox/registered-candidate-rejection.test.ts`): no
workspace is created, no process is started, and every entry's lifecycle
still equals the constant AI-142 lifecycle.

## 5. The synthetic fixture adapter

One minimal, repository-owned, deterministic Node ES module. It contains
no model, weights, provider, network, filesystem access, credentials or
customer data, and it makes no intelligence claim: it replays exact copies
of the AI-140 synthetic result fixtures
(`data/fixtures/typed-decision/valid-{boolean,choice,score,ranking}-result.json`)
keyed by request hash, so every result has
`result_origin: "synthetic_fixture"`. It emits no reasoning. An unknown
request hash makes it exit without a response.

Deterministic test behaviours are selected only by execution ids of the
form `fixture-behavior-<name>-<suffix>` from a closed list (`hang`,
`stdout-flood`, `stderr-flood`, `malformed-json`, `multiple-responses`,
`trailing-stdout`, `invalid-utf8`, `wrong-execution-id`,
`wrong-request-hash`, `wrong-result-hash`, `invalid-result`,
`unexpected-origin`, `protocol-major`, `exit-nonzero`, `silent-exit`,
`stderr-diagnostic`). They exist only to prove that the runtime fails
closed.

The adapter refuses to run (exit 4, no output) unless its environment is
empty and the Node permission model is active, i.e. unless it is launched
the way the runtime launches it.

Its SHA-256 is pinned in `DECISION_SANDBOX_FIXTURE_ADAPTER`. Any byte
change requires a reviewed update of the pinned hash; otherwise the runtime
blocks with `adapter_artifact_hash_mismatch` before creating a process.

## 6. Sandbox policy

One fixed, closed, versioned policy. There is no other profile, no
production profile, no user-configurable limit and no "unlimited" value.

| Field                      | Value                                                              |
| -------------------------- | ------------------------------------------------------------------ |
| `policy_id`                | `ai-lab-decision-sandbox-fixture-policy`                           |
| `policy_version`           | `1.0.0`                                                            |
| `protocol_version`         | `1.0.0` (`json-line-v1`)                                           |
| `executable_subject_kind`  | `synthetic_fixture_adapter`                                        |
| `max_input_bytes`          | 65 536 (ceiling 65 536)                                            |
| `max_stdout_bytes`         | 65 536 (ceiling 65 536)                                            |
| `max_stderr_bytes`         | 4 096 (ceiling 8 192)                                              |
| `timeout_ms`               | 3 000 (ceiling 10 000)                                             |
| `max_processes`            | 1                                                                  |
| `automatic_retries`        | 0                                                                  |
| `fallback`                 | `none`                                                             |
| `network_claim`            | `not_established`                                                  |
| `filesystem_claim`         | `not_established`                                                  |
| `hostile_code_containment` | `not_established`                                                  |
| `output_authority`         | `none`                                                             |
| `policy_hash`              | `6bad0bd18d779acb838ecf37e561d1678b13f0b53649acf40810972b03bc8378` |

The validator rejects tampered hashes, limits that are zero, fractional,
unbounded or above the ceilings, more than one process, retries, upgraded
isolation claims, dropped unestablished properties, execution-control
fields (command, executable, args, env, shell, network, …), authority
fields (production, routing, promotion, approval, …) and any
self-consistent policy whose hash is not the pinned one
(`policy_unsupported`).

## 7. Honest isolation claims

**Enforced by AI-143** (`enforced_controls`):

| Control                       | How                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `exact_artifact_hash`         | Bytes read from a repository-relative constant path, re-hashed; only the verified bytes are run.                               |
| `no_shell`                    | `spawn(process.execPath, fixedArgs, { shell: false })`; no command string, no shell expansion.                                 |
| `fixed_arguments`             | Permission flag, `--allow-fs-read=<artifact copy>`, `--disallow-code-generation-from-strings`, `--no-warnings`, artifact path. |
| `empty_environment`           | `env: {}` — no inherited `NODE_OPTIONS`, API keys, `HOME` or other variables.                                                  |
| `ephemeral_working_directory` | Fresh `mkdtemp` directory holding only the artifact copy; removed after completion.                                            |
| `bounded_stdin`               | One input frame ≤ `max_input_bytes`, then EOF.                                                                                 |
| `bounded_stdout`              | Killed with SIGKILL once stdout exceeds `max_stdout_bytes`.                                                                    |
| `bounded_stderr`              | Killed with SIGKILL once stderr exceeds `max_stderr_bytes`.                                                                    |
| `timeout_kill`                | Killed with SIGKILL at `timeout_ms`; no partial result is accepted.                                                            |
| `single_child_process`        | At most one live fixture process per runtime; the permission model denies child processes to it.                               |
| `single_request_per_process`  | One request, one process, one response.                                                                                        |
| `no_automatic_retry`          | Every outcome is final; there is no retry or fallback path.                                                                    |
| `node_permission_model_guard` | Node's permission model: fs reads limited to the artifact copy; fs writes, child processes, workers and addons denied.         |

**Not established** (`unestablished_properties`):

- `os_network_namespace` — AI-143 does not yet provide a reviewed OS-level
  network sandbox for untrusted upstream code. The fixture contains no
  network code (architecture-tested), but nothing at the OS level stops a
  hostile process from opening a socket.
- `os_filesystem_namespace` — no OS-level filesystem namespace exists.
- `hostile_code_containment` — the Node permission model is a guard for
  trusted code; Node documents that it is not a security boundary against
  malicious code. A plain Node subprocess is not an OS security boundary.
- `resource_quota_enforcement` — no CPU/memory quota beyond the timeout.
- `gpu_isolation` — not applicable to the fixture and not established.
- `interpreter_hash_binding` — the interpreter is the host Node binary
  (`process.execPath`); AI-143 hash-binds the adapter artifact, not the
  interpreter.
- `model_supply_chain_safety` — no model is involved; nothing is claimed.

Therefore real candidate execution remains forbidden. Execution of any
upstream code requires a separately reviewed isolation layer. AI-143 adds
no Docker, bubblewrap, firejail or other system dependency.

## 8. Preflight

`evaluateDecisionSandboxPreflight(value)` is pure and fail-closed. Before
any process exists it verifies: the fixed policy is valid; the policy
binding (id, version, hash) is the fixed policy; the adapter protocol
version is supported; the subject is a synthetic fixture adapter, is on
the allowlist, and binds the exact version and artifact hash; no registered
candidate is being executed; the request is valid AI-140; the request
hash is exact; the input frame fits the input bound; output authority is
`none`; and no execution-control, credential, provider, authority or
private reasoning field is present anywhere.

Outcomes: `blocked` or `eligible_for_fixture_execution`. Eligibility is
not approval and grants no authority over the output. Preflight executes
nothing.

## 9. Execution record

```
DecisionSandboxExecutionRecord
├── execution_id
├── sandbox_policy {policy_id, policy_version, policy_hash}
├── adapter {adapter_id, adapter_version, artifact_sha256} | null
├── request_hash | null
├── status
├── preflight_outcome
├── process_outcome {started, exit_code, signal, terminated_by_runtime}
├── protocol_result_hash | null   (envelope hash of the accepted output)
├── typed_result_hash | null      (AI-140 result hash)
├── diagnostics                   (closed machine codes, sorted)
├── output_authority: none
├── downstream_allowed: false
├── telemetry                     (non-semantic; excluded from the hash)
└── execution_record_hash
```

Statuses: `succeeded`, `blocked`, `timed_out`, `process_failed`,
`protocol_failed`, `output_limit_exceeded`. The validator enforces
status/outcome consistency (for example `succeeded` requires exit code 0,
no signal, no runtime termination, both result hashes and no
diagnostics; `blocked` requires that no process started).

- A successful process exit does not imply a valid typed result
  (`silent-exit` → `protocol_failed`).
- A valid typed result with a non-zero exit is not success
  (`exit-nonzero` → `process_failed`).
- A valid typed result does not imply approval: the record's
  `output_authority` is `none`, `downstream_allowed` is `false`, and the
  AI-140 result keeps `downstream_allowed: false`.

Diagnostics are non-authoritative machine codes. stderr content, private
reasoning and adapter-created files are never persisted.

## 10. Hashing and determinism

All hashes reuse the AI-140 `registry-json-v1` canonicalizer; no new
canonicalization algorithm exists. Hash = SHA-256(domain ‖ "\n" ‖
canonical JSON), self-hash fields excluded.

| Domain                                        | Covers                                               |
| --------------------------------------------- | ---------------------------------------------------- |
| `vlatam-ai-lab:decision-sandbox-policy:v1`    | Policy minus `policy_hash`                           |
| `vlatam-ai-lab:decision-adapter-envelope:v1`  | A whole input or output envelope                     |
| `vlatam-ai-lab:decision-sandbox-execution:v1` | Record minus `execution_record_hash` and `telemetry` |

The semantic record hash does not depend on wall-clock time, randomness,
process id, temporary directory name or hostname. Duration and captured
byte counts are telemetry only; an injected clock drives duration in
tests. Tests prove that two runs of the same request, and a timeout run,
reproduce the registered fixture record hashes exactly.

## 11. Architecture boundary

`tests/architecture/decision-sandbox-boundary.test.ts` proves:

- the pure surface reaches no process, filesystem, network or clock module
  and never the executor;
- `node:child_process` is imported by exactly one `src` module, the
  executor, which spawns only `process.execPath` with `shell: false`, an
  empty environment and piped stdio, at a single call site, and exports
  only `executeDecisionSandboxFixture` (no generic subprocess utility);
- only tests reach the executor: no `src` module, API route, script,
  package script, scheduler, provider gateway, Operator surface,
  tournament or evaluator imports the sandbox; there is no CLI;
- the fixture imports only `node:buffer`, `node:process`, `node:timers`
  and `node:util`, and has no network, filesystem, process, worker or
  code-generation access;
- no candidate source, weights or typed decision runtime configuration is
  vendored, and no candidate, model or provider project is named in
  sandbox code or schemas.

The AI-140 and AI-142 boundary tests admit the sandbox as a consumer of
the AI-140 canonical form/contracts/validators and of the AI-142 contract
vocabulary (the candidate id pattern) only.

## 12. Relationships

- **AI-140.** The protocol carries the AI-140 request and result
  unchanged. `result_origin` is still only `synthetic_fixture`; AI-143
  does not extend it for real candidates.
- **AI-141.** Not wired. AI-143 never calls `evaluateGoldDecisionCase` or
  `aggregateGoldDecisionEvaluations` and creates no benchmark record.
- **AI-142.** Read only in tests, to prove every registered candidate is
  refused. No lifecycle field is written; no candidate is cloned,
  installed, downloaded or executed.
- **AI-120.** No lifecycle transition; no entry becomes
  `benchmark_candidate`, `shadow`, `canary`, `approved` or `preferred`.

Intended future chain, deliberately disconnected now:

```
AI-143 sandbox execution evidence
        ↓
future, separately reviewed candidate adapter (+ reviewed isolation)
        ↓
AI-141 evaluation
        ↓
AI-147 tournament
```

## 13. Future isolation requirement and the AI-144 boundary

Before any upstream code runs, a separate reviewed PR must add an
isolation layer that actually establishes the unestablished properties
relevant to that code (at least OS-level network and filesystem
isolation, resource quotas and interpreter/runtime binding), extend the
subject contract to bind `candidate_id`, `candidate_hash` and
`evidence_revision` under an explicit execution authorization, and extend
`result_origin` in a reviewed AI-140 contract change.

AI-144 (direct-logit baseline / first separately reviewed candidate
adapter) is not started here. Nothing in AI-143 authorizes it.

## 14. Explicit non-goals

AI-143 does not execute any AI-142 candidate; clone candidate repositories;
install candidate dependencies; download weights; call Hugging Face or any
model/provider API; benchmark, evaluate performance, rank or choose a
winner; modify Gold Decision truth; promote anything; route production
traffic; expose an execution API; schedule executions; create human
approval; or claim hostile-code isolation.

# AI-133 governed ARCA scheduler locking and recovery evidence

Date: 2026-07-23
Status: review remediation implemented; human review required; repository-current
scheduler remains inactive and execution-blocked.

## Snapshot and limitations

- Repository: `Nicosted/vlatam-ai-lab`.
- Branch: `feat/ai-133-governed-arca-scheduler-locking-recovery`.
- Reviewed starting commit:
  `fd23ffb6dfeab1666a8cfcd17c864b9fc24beec8`.
- Base: `3e149f27b891ba5b81c03d0097dc7f950a485405` (AI-132).
- Before modification, local HEAD exactly matched the remote branch, the index
  and worktree were clean, and PR #128 was open, draft, and unmerged.
- No Graphify baseline existed, so inspection used targeted local source reads.
- Contract versions remain `1.0.0` because AI-133 is an unmerged, unreleased
  draft PR; all affected generated schemas and registry entries were replaced
  together.
- Evidence is local and synthetic. It authorizes no live scheduler or boundary.

## Review findings and exact remediation

| Finding                          | Remediation                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-A exact boundary evidence     | The scheduled request and journal now carry closed AI-131/AI-132 evidence bindings for configuration, proposal, authorization, expected consumption, authoritative journal, durable result/record, primary and secondary output evidence, exact kill switch, and recovery root. Exact artifacts bind semantic SHA-256 and exact byte SHA-256. Authority-capable journal entries require a non-null SHA-256 and enter `authority_outcome_unknown`. |
| CLI boundary substitution        | The CLI rejects nested AI-131/AI-132 inputs, loads proposal/authorization/configuration/switch files only from request bindings, checks regular-file/no-symlink/no-traversal status, semantic identity/hash and exact bytes, and derives consumption/journal/result/package roots from the loaded configurations.                                                                                                                                 |
| P0-B recovery booleans           | Scheduler recovery is asynchronous and read-only. It validates scheduler evidence first, then calls the existing AI-131 read-only recovery inspector and a new read-only AI-132 inspector. It never calls transport, publishes, retries, creates authorization, deletes/steals a lease, or changes a switch.                                                                                                                                      |
| P0-C attempt counting            | Two new closed contracts implement activation-scoped atomic attempt reservations and durable slot acceptance. Caps count reservations, not completed result files. Reserved, consumed, completed, and recovery-required states remain durable and no-overwrite. AI-131 and AI-132 use separate reservations.                                                                                                                                      |
| P1-A trusted time/switch reread  | Authority transitions use an injected trusted clock in tests and wall-clock UTC by default. Immediately before each transition the scheduler heartbeats, obtains time, rereads the exact scheduler switch bytes, revalidates configuration/activation/window/duration, reloads exact boundary artifacts, and reserves the attempt. The entire sequence repeats before AI-132.                                                                     |
| P1-B heartbeat lifecycle         | Explicit heartbeats cover validation, preflight, observation/result persistence, and finalization. A bounded abortable heartbeat loop runs during asynchronous boundary callbacks, is awaited on exit, advances exact expected lease bytes, and makes heartbeat failure recovery-required. Release uses the latest bytes and occurs only after durable terminal evidence.                                                                         |
| P1-C exceptions/unknown delivery | Every preflight and execution callback is caught. An exception after `execution_started` persists recovery-required evidence, leaves the reservation counted, retains the lease/journal, stops AI-132, and never retries. AI-131 transport uncertainty is recorded as unknown delivery unless authoritative inspection proves otherwise.                                                                                                          |
| P1-D cadence/no catch-up         | Durable slot IDs bind configuration, activation, interval, and scheduled UTC slot. Acceptance is no-overwrite, permits only the current/next policy slot, blocks execution before a next slot is due, rejects historical slots, duplicate request IDs, duplicate semantic slots, out-of-window runs, and catch-up/backlog behavior.                                                                                                               |
| P2 observations                  | Caller readiness is recorded as `unverified_reported_input` unless an authoritative inspector marks it authoritative. Unverified input clears authorization availability and forces execution readiness blocked. Observation and recovery remain zero-network.                                                                                                                                                                                    |

## Exact authoritative evidence bindings

Each AI-131/AI-132 request binding contains:

1. boundary configuration path, identity, semantic SHA-256, and exact byte
   SHA-256;
2. proposal path, identity, semantic SHA-256, and exact byte SHA-256;
3. authorization path, identity, semantic SHA-256, and exact byte SHA-256;
4. expected consumption-record path, identity, semantic SHA-256, and exact byte
   SHA-256;
5. authoritative boundary-journal path and expected identity;
6. durable result/record path, identity, semantic SHA-256, and exact byte
   SHA-256;
7. AI-131 acquired-source/candidate or AI-132 package/durable-record paths,
   identities, semantic SHA-256 values, and exact byte SHA-256 values;
8. reviewed kill-switch path, semantic reviewed SHA-256, and exact byte
   SHA-256; and
9. exact recovery root path and identity.

The CLI also proves that derived AI-131 consumption/journal/result paths and
AI-132 consumption/journal/record/package paths equal these request bindings.

## Recovery precedence

1. malformed or substituted scheduler configuration, lease, journal, sequence,
   binding, hash, or bytes;
2. malformed or substituted AI-131/AI-132 evidence;
3. unknown delivery or unresolved authoritative recovery;
4. exact visible authorization consumption;
5. exact durable result/package/candidate completion evidence;
6. exact authoritative pre-consumption proof;
7. safe abort only when non-consumption is positively proven.

An active lease is not recoverable until both lease expiry and the configured
heartbeat-staleness threshold have elapsed. `execution_started` with absent
boundary evidence is always recovery-required. Exact consumption remains
counted permanently. Repeated read-only recovery is deterministic and
idempotent.

## Attempt-ledger semantics

- Reservation identity binds scheduler configuration ID/hash, activation
  ID/hash, eligible slot, request ID/hash, boundary type, and reservation time.
- Creation is exclusive and serialized by a local exact state lock.
- Daily and activation-wide caps are checked atomically before the
  authorization-capable call.
- The activation count is computed across the activation identity/hash, not
  copied from the rolling 24-hour count.
- State transitions are monotonic:
  `reserved → consumed → completed | recovery_required`.
- Crashes, timeouts, callback exceptions, consumed failures, unknown delivery,
  and recovery-required outcomes remain counted.
- Duplicate request/slot/boundary reservations and duplicate slots are rejected.
- Every downstream authority field is false.

## Heartbeat and authority-transition lifecycle

For AI-131 and again independently for AI-132:

1. heartbeat using exact current lease bytes;
2. obtain trusted current UTC time;
3. reread the exact scheduler switch regular file;
4. verify reviewed semantic hash and exact byte hash;
5. revalidate scheduler configuration;
6. revalidate activation identity/hash/start/expiry;
7. revalidate operating window and maximum run duration;
8. revalidate the request-bound eligible slot and that it is due;
9. reload exact boundary configuration/proposal/authorization/switch files;
10. atomically reserve the boundary attempt;
11. journal `execution_started` with non-null boundary-evidence hash and
    `authority_outcome_unknown`;
12. invoke only the existing authoritative boundary;
13. persist consumption/completion or recovery evidence;
14. heartbeat through observation/result persistence and finalization; and
15. release only the latest lease bytes after durable terminal evidence.

If activation expires after AI-131 consumption, the attempt and exact evidence
remain recovery-required/completed as applicable and AI-132 is not invoked.

## Cadence and no catch-up

Eligible slot identity is domain-separated over scheduler configuration hash,
activation hash, observation interval, and scheduled UTC time. The scheduler
accepts at most one request per semantic slot, never iterates missed intervals,
never replays a historical slot, resumes only at the next current eligible slot,
checks UTC operating windows, and prevents a second authority boundary after
the maximum run duration.

## Contracts and hashes

| Contract                    | Schema hash                                                        |
| --------------------------- | ------------------------------------------------------------------ |
| Scheduler configuration     | `e88b10e24027fa84f25f65ec20a1b90b788813c17c05a380bf4e5b9b1fe133d5` |
| Scheduler activation        | `cebd9c35540d3c8bded6d0d314b6b86e9d52e3f0072071452b8aa78228a47bb4` |
| Scheduled run request       | `0e21d33706c52739205f05236d819357404d75326d62a7ed3ab4b6a382577952` |
| Scheduler lease             | `05d37eaf7ab5c6ab0442a6a0f5aff776dd829ccf820e8c8921d12f3bcc7f2d1d` |
| Scheduler run journal       | `b4f9b0b50e97ede301c41712c77e8f01c7cca8c0be64c0ae8b0a4dd5d761489e` |
| Scheduler run result        | `aaa16209cda32b7c87518cb134010fa7dfa9bde554eabe76f5a7dc854ed5e963` |
| Scheduler observation       | `a1840b68b876a474467ce00653ebe79fcec2341a89dd086f66b6026f3e3c2be9` |
| Scheduler recovery decision | `e97a9c5ae07230f5a400c507ed9b70281b5cc239173bdb81705d80ec34b34fb7` |
| Scheduler kill switch       | `543f100d6dcf78b0ed0bccf0e81f42a09c3e2fba415603786a30bb9212cde302` |
| Attempt ledger              | `1a80ee9472ecc58dce5e90d89fa216205248e6e9ec893cdef43771ba39a717e9` |
| Slot acceptance             | `c582393de168ff7a34bec36bcedbec2f04ad24bfc622ca4f96f9e685aacaac03` |

Repository-current scheduler configuration semantic hash:
`6b3ea65b9199a0ef3cbaebe5c5a8ea2a33a36c6b596e5065db12d2e32b69d9ca`.
Exact checked-in configuration file SHA-256:
`32091c7370506d5232b5cbb6dc95903f781b441c17394b5028e61d5abe87d209`.

## Original AI-133 traceability matrix

All tests are in `tests/scheduler/governed-arca-scheduler.test.ts` unless an
architecture test is explicitly named.

| ID   | Original scenario              | Exact test name                                                                                                                                                       |
| ---- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O-01 | Closed contracts               | `all eleven AI-133 contracts are closed Draft 2020-12 schemas`                                                                                                        |
| O-02 | Repository blocked state       | `configuration and activation remain exact, bounded and repository-current blocked`                                                                                   |
| O-03 | Configuration hash binding     | `configuration and activation remain exact, bounded and repository-current blocked`                                                                                   |
| O-04 | Activation duration bound      | `configuration and activation remain exact, bounded and repository-current blocked`                                                                                   |
| O-05 | Activation expiry              | `activation expires before AI-131 call`                                                                                                                               |
| O-06 | Exact request hash             | `configuration and activation remain exact, bounded and repository-current blocked`                                                                                   |
| O-07 | Exact artifact identity        | `AI-131 evidence hashes are non-null and exact`                                                                                                                       |
| O-08 | Artifact byte substitution     | `CLI rejects substituted artifact bytes`                                                                                                                              |
| O-09 | Symlink rejection              | `symlink substitution is rejected for exact request-bound artifacts`                                                                                                  |
| O-10 | Nested input rejection         | `CLI rejects nested input not matching request-bound paths`                                                                                                           |
| O-11 | Atomic lease competition       | `atomic daily-cap competition`                                                                                                                                        |
| O-12 | Exact heartbeat bytes          | `heartbeat during delayed AI-131 execution`                                                                                                                           |
| O-13 | Latest-byte release            | `exact lease release after latest heartbeat bytes`                                                                                                                    |
| O-14 | Active lease not stale         | `recovery does not inspect a non-expired active lease as stale`                                                                                                       |
| O-15 | AI-131 stale recovery          | `stale lease plus unresolved AI-131 journal remains blocked`                                                                                                          |
| O-16 | AI-132 stale recovery          | `stale lease plus unresolved AI-132 journal remains blocked`                                                                                                          |
| O-17 | Recovery idempotency           | `repeated recovery is idempotent`                                                                                                                                     |
| O-18 | Exact recovered completion     | `exact completion after crash recovery`                                                                                                                               |
| O-19 | Pre-authority safe abort       | `exact authoritative non-consumption permits safe abort`                                                                                                              |
| O-20 | Missing evidence fail closed   | `execution_started with missing evidence never safe-aborts`                                                                                                           |
| O-21 | Divergent evidence fail closed | `divergent consumption fails closed`                                                                                                                                  |
| O-22 | Unknown delivery               | `exact AI-131 unknown delivery blocks AI-132`                                                                                                                         |
| O-23 | Boundary exception             | `boundary exception becomes recovery_required`                                                                                                                        |
| O-24 | Daily cap                      | `atomic daily-cap competition`                                                                                                                                        |
| O-25 | Activation cap                 | `atomic activation-cap competition`                                                                                                                                   |
| O-26 | Reservation crash durability   | `crash after reservation remains counted`                                                                                                                             |
| O-27 | Consumed failure durability    | `consumed but failed attempt remains counted`                                                                                                                         |
| O-28 | Separate boundary attempts     | `separate AI-131 and AI-132 attempt reservations`                                                                                                                     |
| O-29 | Duplicate request              | `duplicate request rejected`                                                                                                                                          |
| O-30 | Duplicate slot                 | `duplicate semantic slot rejected`                                                                                                                                    |
| O-31 | Historical slot                | `historical missed slot rejected`                                                                                                                                     |
| O-32 | No catch-up                    | `no catch-up after downtime`                                                                                                                                          |
| O-33 | UTC windows                    | `operating-window rejection`                                                                                                                                          |
| O-34 | Switch reread AI-131           | `scheduler switch changes before AI-131`                                                                                                                              |
| O-35 | Switch reread AI-132           | `scheduler switch changes before AI-132`                                                                                                                              |
| O-36 | Switch path binding            | `scheduler switch path substitution`                                                                                                                                  |
| O-37 | Observation claim provenance   | `observation unverified claims cannot enable execution`                                                                                                               |
| O-38 | AI-130 read-only               | `AI-130 observation inspection remains read-only`                                                                                                                     |
| O-39 | Zero network                   | `zero network during observe and recover`                                                                                                                             |
| O-40 | Zero database writes           | `zero external database writes`                                                                                                                                       |
| O-41 | Zero vlatam-global             | `zero vlatam-global access`                                                                                                                                           |
| O-42 | Zero downstream authority      | `zero downstream authority`                                                                                                                                           |
| O-43 | Architecture isolation         | `AI-133 scheduler has no direct transport, database, provider, deployment or vlatam-global boundary` in `tests/architecture/governed-arca-scheduler-boundary.test.ts` |

## REQUEST_CHANGES traceability matrix

| ID   | Review scenario                 | Exact test name                                                       |
| ---- | ------------------------------- | --------------------------------------------------------------------- |
| R-01 | Crash after AI-131 consumption  | `crash after AI-131 authorization consumption before callback return` |
| R-02 | Crash after AI-132 consumption  | `crash after AI-132 authorization consumption before callback return` |
| R-03 | Missing evidence after start    | `execution_started with missing evidence never safe-aborts`           |
| R-04 | Exact non-consumption           | `exact authoritative non-consumption permits safe abort`              |
| R-05 | Divergent consumption           | `divergent consumption fails closed`                                  |
| R-06 | AI-131 unknown delivery         | `exact AI-131 unknown delivery blocks AI-132`                         |
| R-07 | Boundary exception              | `boundary exception becomes recovery_required`                        |
| R-08 | AI-131 exact hashes             | `AI-131 evidence hashes are non-null and exact`                       |
| R-09 | Nested mismatch                 | `CLI rejects nested input not matching request-bound paths`           |
| R-10 | Substituted bytes               | `CLI rejects substituted artifact bytes`                              |
| R-11 | Atomic daily cap                | `atomic daily-cap competition`                                        |
| R-12 | Atomic activation cap           | `atomic activation-cap competition`                                   |
| R-13 | Reservation crash count         | `crash after reservation remains counted`                             |
| R-14 | Consumed failure count          | `consumed but failed attempt remains counted`                         |
| R-15 | Separate reservations           | `separate AI-131 and AI-132 attempt reservations`                     |
| R-16 | Duplicate request               | `duplicate request rejected`                                          |
| R-17 | Duplicate semantic slot         | `duplicate semantic slot rejected`                                    |
| R-18 | Historical slot                 | `historical missed slot rejected`                                     |
| R-19 | No catch-up                     | `no catch-up after downtime`                                          |
| R-20 | Operating window                | `operating-window rejection`                                          |
| R-21 | Expiry before AI-131            | `activation expires before AI-131 call`                               |
| R-22 | Expiry after AI-131 consumption | `activation expires after AI-131 consumption`                         |
| R-23 | Expiry before AI-132            | `activation expires before AI-132 call`                               |
| R-24 | Switch change before AI-131     | `scheduler switch changes before AI-131`                              |
| R-25 | Switch change before AI-132     | `scheduler switch changes before AI-132`                              |
| R-26 | Switch path substitution        | `scheduler switch path substitution`                                  |
| R-27 | Delayed AI-131 heartbeat        | `heartbeat during delayed AI-131 execution`                           |
| R-28 | Heartbeat failure               | `heartbeat failure produces recovery_required`                        |
| R-29 | Active lease recovery block     | `recovery does not inspect a non-expired active lease as stale`       |
| R-30 | Stale AI-131 unresolved         | `stale lease plus unresolved AI-131 journal remains blocked`          |
| R-31 | Stale AI-132 unresolved         | `stale lease plus unresolved AI-132 journal remains blocked`          |
| R-32 | Repeated recovery               | `repeated recovery is idempotent`                                     |
| R-33 | Completion after crash          | `exact completion after crash recovery`                               |
| R-34 | Activation/daily counters       | `activation-wide counters differ correctly from daily counters`       |
| R-35 | Pilot attempt categories        | `pilot summary counts reserved consumed and recovery attempts`        |
| R-36 | Unverified observation          | `observation unverified claims cannot enable execution`               |
| R-37 | AI-130 read-only                | `AI-130 observation inspection remains read-only`                     |
| R-38 | Zero-network observe/recover    | `zero network during observe and recover`                             |
| R-39 | Zero database writes            | `zero external database writes`                                       |
| R-40 | Zero vlatam-global access       | `zero vlatam-global access`                                           |
| R-41 | Zero downstream authority       | `zero downstream authority`                                           |
| R-42 | Latest heartbeat release        | `exact lease release after latest heartbeat bytes`                    |

## Validation

- Focused AI-133 plus architecture: **48/48**.
- AI-128/130/131/132/133 combined regression and architecture: **112/112**.
- Full repository suite outside the process sandbox: **1,272/1,272** tests,
  **153/153** suites.
- The sandboxed full-suite pass reached **1,270/1,272**; its only failures were
  the known nested-`tsx` temporary IPC socket restriction. The exact same two
  CLI subprocess tests passed in the approved outside-sandbox run.
- Typecheck: passed.
- Build: passed.
- Scoped ESLint: passed.
- Scoped Prettier: passed.
- Schema/runtime regeneration and parity: passed.
- Architecture boundaries: passed.
- `git diff --check`: passed.

## Repository-current blocked state and prohibited non-actions

The checked-in scheduler remains inactive, its maximum daily executions remain
zero, its execution switch remains active, AI-131 and AI-132 switches remain
active, and no activation artifact is checked in.

No live activation, live ARCA request, real authorization consumption, real
export, import, publication, deployment, scheduler installation, daemon,
background process, credential or `.env*` access, customer-data access,
external database write, production service access, or `vlatam-global` access
occurred.

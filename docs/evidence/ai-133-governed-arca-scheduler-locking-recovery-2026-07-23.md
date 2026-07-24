# AI-133 governed ARCA scheduler locking and recovery evidence

Date: 2026-07-23
Status: review remediation implemented; human review required; repository-current
scheduler remains inactive and execution-blocked.

## Snapshot and limitations

- Repository: `Nicosted/vlatam-ai-lab`.
- Branch: `feat/ai-133-governed-arca-scheduler-locking-recovery`.
- Latest independent-review starting commit:
  `df2f807e9203a1bf8d6a965fc8a90fca38245397`.
- Base: `3e149f27b891ba5b81c03d0097dc7f950a485405` (AI-132).
- Before modification, local HEAD exactly matched the remote branch, the index
  and worktree were clean, and PR #128 was open, draft, and unmerged.
- No Graphify baseline existed, so inspection used targeted local source reads.
- Contract versions remain `1.0.0` because AI-133 is an unmerged, unreleased
  draft PR; all affected generated schemas and registry entries were replaced
  together.
- Evidence is local and synthetic. It authorizes no live scheduler or boundary.

## Latest independent REQUEST_CHANGES remediation

The latest review identified four remaining fail-open risks. This revision:

- replaces callback-derived AI-131/AI-132 outcomes with the closed dispositions
  `not_authorized`, `positively_not_consumed`, `consumed_completed`,
  `consumed_recovery_required`, `unknown_delivery`, `divergent_evidence`, and
  `malformed_evidence`;
- invokes the real read-only boundary inspector after every preflight return or
  throw and every execution return or throw, then verifies exact request-bound
  outputs before accepting `consumed_completed`;
- permits AI-132 only after the exact AI-131 disposition
  `consumed_completed`; the current acquisition-then-export workflow does not
  permit export after `positively_not_consumed`;
- permits full-pipeline completion and normal lease release only when both
  boundaries are `consumed_completed`; AI-132 unknown, unresolved, divergent,
  malformed, blocked without positive non-consumption, or visibly consumed
  without package/record completion is `recovery_required`;
- replaces caller-selected recovery roots and artifact paths with the named
  compiled environment `repository-current-ai-133`; the recovery CLI accepts
  only environment ID, run ID, request ID, and trusted timestamp;
- adds an authenticated ledger initialization manifest with configuration,
  activation, state-root, version, initialization time, reservation-directory,
  semantic hash, canonical-content hash, and exact reservation inventory; and
- treats a missing manifest, missing directory, unexpected/deleted reservation,
  unreadable record, or manifest/record inconsistency as malformed durable
  evidence and therefore recovery-required.

Callback success, callback `blocked`, unauthorized preflight, missing
authorization, false booleans, and absence of an unknown flag never prove
completion or non-consumption.

## Reviewed recovery environment and pinned trust anchors

The compiled registry entry has environment semantic hash
`5ec241d86dc6e9bcf52c16e59aedd0ec6e99f86277978d81abd1031365a8b116`.
It pins:

| Anchor                                 | Exact path                                                                                                                                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository                             | `/Users/nicolasmatiasstedile/Developer/vlatam-ai-lab`                                                                                                                  |
| Scheduler configuration                | `/Users/nicolasmatiasstedile/Developer/vlatam-ai-lab/config/ai-133-governed-arca-scheduler.json`                                                                       |
| Scheduler switch                       | `/Users/nicolasmatiasstedile/Developer/vlatam-ai-lab/config/ai-133-governed-arca-scheduler-kill-switch.json`                                                           |
| AI-131 configuration                   | `/Users/nicolasmatiasstedile/Developer/vlatam-ai-lab/var/arca-scheduler/reviewed/ai-131-configuration.json`                                                            |
| AI-131 switch                          | `/Users/nicolasmatiasstedile/Developer/vlatam-ai-lab/config/ai-131-controlled-live-arca-kill-switch.json`                                                              |
| AI-132 configuration                   | `/Users/nicolasmatiasstedile/Developer/vlatam-ai-lab/var/arca-scheduler/reviewed/ai-132-configuration.json`                                                            |
| AI-132 switch                          | `/Users/nicolasmatiasstedile/Developer/vlatam-ai-lab/config/ai-132-governed-arca-export-kill-switch.json`                                                              |
| Scheduler state / observation          | `/Users/nicolasmatiasstedile/Developer/vlatam-ai-lab/var/arca-scheduler/state` / `/Users/nicolasmatiasstedile/Developer/vlatam-ai-lab/var/arca-scheduler/observations` |
| AI-130 root                            | `/Users/nicolasmatiasstedile/Developer/vlatam-ai-lab/var/arca-review-store`                                                                                            |
| AI-131 state / acquisition / candidate | `/Users/nicolasmatiasstedile/Developer/vlatam-ai-lab/var/arca-scheduler/ai-131/state` / `.../acquisitions` / `.../candidates`                                          |
| AI-132 state / export / recovery       | `/Users/nicolasmatiasstedile/Developer/vlatam-ai-lab/var/arca-scheduler/ai-132/state` / `.../exports` / `.../state/recovery`                                           |

Same-byte files at other absolute paths and alternate repository, boundary
configuration, switch, state, observation, AI-130, acquisition, candidate,
export, or recovery roots are rejected.

## Authenticated empty-ledger semantics

An empty attempt set is positive evidence only when the exact manifest exists,
the exact reservation directory exists and is empty, the manifest inventory is
empty and hash-valid, the lease/activation/configuration/state-root bindings
match, the exact request and slot are consistent, and the scheduler journal
shows that no authority-capable phase began. `ENOENT` is never converted into
authenticated empty history.

## Execution-time authoritative reconciliation

For each boundary the scheduler persists `execution_started`, invokes the
boundary exactly once, catches its return or exception, invokes the real
read-only inspector, derives and persists the closed disposition, advances the
attempt ledger from exact visible consumption, verifies all request-bound
durable outputs, and only then decides continuation or recovery. A callback
exception does not hide visible consumption or exact completion. A completion
claim before the boundary was invoked is rejected.

## Review findings and exact remediation

| Second-review finding                 | Exact remediation                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-A caller-supplied recovery objects | Added the closed `arca-scheduler-recovery-input` contract. Recover accepts only the reviewed configuration binding, reviewed state-root binding, run/request IDs, exact lease/journal/request paths, and trusted timestamp. It rejects caller `lease` and `journal` objects and reloads configuration, switch, lease, journal, request, slot, attempt ledger, and any result/recovery result from disk.             |
| P0-A unsafe safe-abort                | Safe abort now requires a complete exact scheduler evidence set, no visible unresolved result, no execution-started reservation, or exact authoritative non-consumption from the relevant AI-131/AI-132 inspector. Missing, divergent, or incomplete scheduler evidence remains recovery-required/fail-closed.                                                                                                      |
| P0-B callback trust                   | A verified callback is no longer sufficient. The scheduler reloads every exact request-bound consumption, journal, durable result/record, acquired-source/candidate or package/record, recovery root, and current switch before continuation. Reviewed output roots come from the exact boundary configuration, and any visible recovery record blocks continuation.                                                |
| P0-B generic field scanning           | The loader now requires an artifact-specific identity field and semantic-hash field. It never searches arbitrary `*_id` or `*_sha256` fields. Exact byte SHA-256, semantic SHA-256, absolute reviewed root, component safety, regular-file status, and no-symlink status are mandatory.                                                                                                                             |
| P1-A heartbeat completion race        | The abortable heartbeat loop catches both driver and lease-heartbeat failures, is always awaited after shutdown, and checks the final in-flight failure before returning. Observation, result writing, journal completion, and release are inside the recovery-sensitive lifecycle. A failure writes durable recovery evidence and leaves the lease in place.                                                       |
| P1-B exception reconciliation         | Execution exceptions reload the exact request-bound outputs before classification. Unresolved or divergent evidence writes scheduler `recovery_required`, retains journal/lease/reservation evidence, blocks AI-132 after AI-131 uncertainty, and remains non-retryable. The recover command then invokes the real read-only AI-131/AI-132 inspectors over the loaded request bindings.                             |
| P2-A caller provenance                | Observe ignores caller `authoritative`, `ai130Authoritative`, and equivalent claims. Caller readiness is encoded as `unverified_reported_input`; unavailable authoritative derivation forces blocked readiness. Reasons explicitly identify missing AI-131/AI-132 authorization, unresolved recovery, unverified AI-130/readiness provenance, switch state, cap exhaustion, slot eligibility, and activation state. |
| P2-B traceability overclaim           | Both matrices below now name the exact file, exact test, test type, durable artifacts, and expected outcome. O-11 maps to actual concurrent lease acquisition. Actual AI-131/AI-132 consumption and journal claims map to their authoritative recovery-inspector integration tests; scheduler-only tests are not described as real external calls.                                                                  |

## Durable scheduler recovery provenance model

The recovery input contains no authoritative scheduler object copies or
caller-selected paths. It names only the reviewed environment, run, request,
and trusted timestamp. The compiled environment resolves every configuration,
switch, state, observation and boundary root independently of caller input.

Recovery derives all other paths from the loaded configuration and request. It
loads the exact reviewed switch, active lease, active journal, request, semantic
slot record, all request-bound attempt reservations, and at most one normal
result plus the exact recovery result. Each scheduler artifact must be canonical
JSON, validate its closed schema and self hash, remain under the reviewed state
root without symlinks or traversal, and match configuration, activation, lease,
run, request and slot bindings. An alternate file with valid internal hashes
does not satisfy the derived exact path.

## Post-boundary verification sequence

After AI-131 returns `verified`, the scheduler reloads, in order, the exact
consumption record, authoritative run journal, durable run record, acquired
source record, candidate, recovery directory state and current AI-131 switch.
State artifacts must be under `run_state`, acquisition evidence under
`acquisition_output`, and candidate evidence under `candidate_output`, as
declared by the exact reviewed AI-131 configuration. AI-132 preflight is not
called unless all checks pass.

After AI-132 returns `verified`, the scheduler reloads the exact consumption,
export journal, durable export record, package, secondary durable record,
recovery directory state and current export switch. State artifacts must be
under `export_state_root` and package bytes under `export_root`, as declared by
the exact reviewed AI-132 configuration. Missing, divergent, substituted or
unresolved output produces durable scheduler recovery and no normal release.

## Observation provenance model

Observe is a local, read-only projection. Caller-reported readiness is never
authority. Unless a repository inspector can establish provenance, AI-130,
AI-131 and AI-132 readiness is reported as `unverified_reported_input`,
authorization availability is cleared, and overall execution readiness is
blocked with explicit machine-readable reasons. Observe and recover do not call
transport, mutate boundary evidence, retry an authority-bearing operation, or
write to an external database.

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
| Scheduled run request       | `1579fb89e0c6d9dbc563d301a7bfdeaa9ee0f54c0605ce0c12cedf46ae496b4c` |
| Scheduler lease             | `05d37eaf7ab5c6ab0442a6a0f5aff776dd829ccf820e8c8921d12f3bcc7f2d1d` |
| Scheduler run journal       | `a64f8b0b1606a5ef7242127c009ad12fbb181cef66e1db6716c918b756691a6f` |
| Scheduler run result        | `b4bec66156f7b4ddbdad5c548e4af308709e615bda10db15bbeb62d990870afd` |
| Scheduler observation       | `a1840b68b876a474467ce00653ebe79fcec2341a89dd086f66b6026f3e3c2be9` |
| Scheduler recovery input    | `633fcc76df878c546436abc2e8c7f1794e00c9ce5efc23fd3630bcedc991403c` |
| Scheduler recovery decision | `322059b04f107a39ae8839c7e29a1aa4ad9a1b59a9f8a237d8355438fe7bac52` |
| Scheduler kill switch       | `543f100d6dcf78b0ed0bccf0e81f42a09c3e2fba415603786a30bb9212cde302` |
| Attempt ledger              | `1a80ee9472ecc58dce5e90d89fa216205248e6e9ec893cdef43771ba39a717e9` |
| Attempt-ledger manifest     | `e30ff1dae5ee797942ba11fab4cdab3ba8367acc59aed83e3d4c306bbf18d160` |
| Slot acceptance             | `c582393de168ff7a34bec36bcedbec2f04ad24bfc622ca4f96f9e685aacaac03` |
| Reviewed environment        | `f490cb691b00852db68bfbd5a225855ef5b9162f21d5597b34313b840f8c1985` |
| AI-131 disposition          | `6a590956c322ef688add51ecbccaf0abb8d8d7e2311c39ef39e2d8918ffbf064` |
| AI-132 disposition          | `f7729a0f44ad0b4f31f6bd4c4477ac0b55d875ee8f63be425571d84782d9c965` |

Repository-current scheduler configuration semantic hash:
`6b3ea65b9199a0ef3cbaebe5c5a8ea2a33a36c6b596e5065db12d2e32b69d9ca`.
Exact checked-in configuration file SHA-256:
`32091c7370506d5232b5cbb6dc95903f781b441c17394b5028e61d5abe87d209`.

## Original AI-133 traceability matrix

All tests are in `tests/scheduler/governed-arca-scheduler.test.ts` unless an
architecture test is explicitly named.

| ID   | Original scenario              | Exact test name                                                                                                                                                       |
| ---- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O-01 | Closed contracts               | `all twelve AI-133 contracts are closed Draft 2020-12 schemas`                                                                                                        |
| O-02 | Repository blocked state       | `configuration and activation remain exact, bounded and repository-current blocked`                                                                                   |
| O-03 | Configuration hash binding     | `configuration and activation remain exact, bounded and repository-current blocked`                                                                                   |
| O-04 | Activation duration bound      | `configuration and activation remain exact, bounded and repository-current blocked`                                                                                   |
| O-05 | Activation expiry              | `activation expires before AI-131 call`                                                                                                                               |
| O-06 | Exact request hash             | `configuration and activation remain exact, bounded and repository-current blocked`                                                                                   |
| O-07 | Exact artifact identity        | `AI-131 evidence hashes are non-null and exact`                                                                                                                       |
| O-08 | Artifact byte substitution     | `CLI rejects substituted artifact bytes`                                                                                                                              |
| O-09 | Symlink rejection              | `symlink substitution is rejected for exact request-bound artifacts`                                                                                                  |
| O-10 | Nested input rejection         | `CLI rejects nested input not matching request-bound paths`                                                                                                           |
| O-11 | Atomic lease competition       | `atomic scheduler lease competition permits exactly one acquisition`                                                                                                  |
| O-12 | Exact heartbeat bytes          | `heartbeat during delayed AI-131 execution`                                                                                                                           |
| O-13 | Latest-byte release            | `exact lease release after latest heartbeat bytes`                                                                                                                    |
| O-14 | Active lease not stale         | `recovery does not inspect a non-expired active lease as stale`                                                                                                       |
| O-15 | AI-131 stale recovery          | `stale lease plus unresolved AI-131 journal remains blocked`                                                                                                          |
| O-16 | AI-132 stale recovery          | `stale lease plus unresolved AI-132 journal remains blocked`                                                                                                          |
| O-17 | Recovery idempotency           | `repeated recovery is idempotent`                                                                                                                                     |
| O-18 | Exact recovered completion     | `production-composed real inspectors require dual-boundary completion`                                                                                                |
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

The following keyed continuation supplies the remaining required columns for
every original row. Together, the two tables are the corrected original matrix.

| ID   | Exact test file                                               | Type         | Durable artifacts exercised                              | Expected outcome                                    |
| ---- | ------------------------------------------------------------- | ------------ | -------------------------------------------------------- | --------------------------------------------------- |
| O-01 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Twelve checked-in schemas and runtime schemas            | Closed Draft 2020-12 parity                         |
| O-02 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Repository config, switch and activation-template paths  | Inactive, zero cap, switches active, no activation  |
| O-03 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Repository scheduler configuration                       | Exact semantic and byte hash                        |
| O-04 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Unit         | Activation template                                      | Duration remains within policy bound                |
| O-05 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Unit         | Activation value                                         | Expired status                                      |
| O-06 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Scheduled request fixture                                | Request self hash exact                             |
| O-07 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | AI-131 request-bound artifacts                           | Non-null exact identity/hash bindings               |
| O-08 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Proposal file with changed bytes                         | Exact-byte mismatch rejected                        |
| O-09 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Symlinked request-bound artifact                         | Symlink rejected                                    |
| O-10 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Unit         | Caller bundle                                            | Nested boundary objects rejected                    |
| O-11 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Competing exclusive lease writes                         | Exactly one acquired, one competing                 |
| O-12 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Lease heartbeat replacements                             | Multiple exact heartbeats during delayed boundary   |
| O-13 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Latest lease bytes                                       | Release accepts only latest exact lease             |
| O-14 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Non-expired lease                                        | Active lease is not stale-recovered                 |
| O-15 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Stale lease, AI-131 journal and reservation              | Unresolved AI-131 remains recovery-required         |
| O-16 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Stale lease, AI-132 journal and reservation              | Unresolved AI-132 remains recovery-required         |
| O-17 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Same lease/journal inspected twice                       | Identical decision; no writes                       |
| O-18 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Exact real AI-131 and AI-132 durable recovery evidence   | Completed-after-recovery only after both boundaries |
| O-19 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Execution journal, reservation and non-consumption proof | Safe abort only on positive proof                   |
| O-20 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Execution-started journal with missing evidence          | Never safe abort                                    |
| O-21 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Divergent consumption evidence                           | Malformed-evidence fail closed                      |
| O-22 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | AI-131 reservation, journal and result                   | Unknown delivery; AI-132 not called                 |
| O-23 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Scheduler journal and recovery result                    | Boundary exception becomes recovery                 |
| O-24 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Competing daily attempt-ledger reservations              | Daily cap atomically permits one                    |
| O-25 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Competing activation attempt-ledger reservations         | Activation cap atomically permits one               |
| O-26 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Reserved attempt record                                  | Crash reservation remains counted                   |
| O-27 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Consumed/recovery attempt record                         | Consumed failure remains counted                    |
| O-28 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | AI-131 and AI-132 reservations                           | Separate durable reservations                       |
| O-29 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Request acceptance record                                | Duplicate request rejected                          |
| O-30 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Semantic slot acceptance                                 | Duplicate slot rejected                             |
| O-31 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Historical request slot                                  | Missed historical slot rejected                     |
| O-32 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Current and missed slot inputs                           | No catch-up execution                               |
| O-33 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Configuration window and request slot                    | Outside-window request rejected                     |
| O-34 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Scheduler switch changed before AI-131                   | Recovery before AI-131 authority                    |
| O-35 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Scheduler switch changed before AI-132                   | Recovery before AI-132 authority                    |
| O-36 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Substituted switch path                                  | Exact configured path required                      |
| O-37 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Observation record                                       | Caller claims remain unverified and blocked         |
| O-38 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | AI-130 observation inputs                                | Read-only local inspection                          |
| O-39 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Observation and recovery artifacts                       | Zero network calls                                  |
| O-40 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Scheduler authority flags                                | Zero external database writes                       |
| O-41 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Scheduler authority flags                                | Zero vlatam-global access                           |
| O-42 | `tests/scheduler/governed-arca-scheduler.test.ts`             | Integration  | Scheduler authority flags                                | All downstream authority false                      |
| O-43 | `tests/architecture/governed-arca-scheduler-boundary.test.ts` | Architecture | Scheduler and CLI source imports                         | No transport/provider/DB/deployment/global boundary |

## Second REQUEST_CHANGES integration traceability matrix

Every entry below names the exact test file and test. “Durable artifacts”
describes files actually created or read by that test; no entry treats a caller
boolean as authoritative evidence.

| ID   | Exact test file                                               | Exact test name                                                                                      | Type         | Durable artifacts exercised                                                | Expected outcome                                               |
| ---- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------- |
| I-01 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `recover CLI rejects caller-supplied lease and journal objects`                                      | Unit         | Rejected caller bundle only                                                | Caller copies rejected before recovery                         |
| I-02 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `durable recovery loads exact scheduler lease journal request slot and ledger`                       | Integration  | Config, switch, lease, journal, request, slot, attempt ledger              | Exact evidence loaded under reviewed root                      |
| I-03 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `durable recovery rejects caller-supplied or alternate journal paths`                                | Integration  | Derived journal path and alternate path                                    | Alternate path rejected                                        |
| I-04 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `durable recovery rejects a valid self-hashed journal outside reviewed root`                         | Integration  | Valid self-hashed journal copied outside state root                        | Outside-root journal rejected                                  |
| I-05 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `durable recovery rejects a symlinked scheduler journal`                                             | Integration  | Active journal replaced by symlink                                         | Symlink rejected                                               |
| I-06 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `execution_started with missing evidence never safe-aborts`                                          | Integration  | Lease, execution-started journal, AI-131 reservation                       | Recovery required; never safe abort                            |
| I-07 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `exact durable pre-authority evidence permits safe abort`                                            | Integration  | Config, switch, lease, pre-authority journal, request, slot, empty ledger  | Exact safe abort                                               |
| I-08 | `tests/live-run/controlled-live-arca-run.test.ts`             | `crash inspection never retries automatically and consumption is atomic`                             | Integration  | Real AI-131 consumption and authoritative journal                          | Consumption remains atomic; no retry                           |
| I-09 | `tests/live-run/controlled-live-arca-run.test.ts`             | `recovery resumes acquisition and candidate persistence from exact local bytes without fetch`        | Integration  | AI-131 consumption, journal, acquired bytes, record and candidate          | Inspector/recovery uses exact local evidence; zero fetch       |
| I-10 | `tests/export/governed-arca-export.test.ts`                   | `crash after consumption recovers exact package and record without duplication`                      | Integration  | Real AI-132 consumption, export journal, package and record                | Exact completion; no duplicate                                 |
| I-11 | `tests/export/governed-arca-export.test.ts`                   | `prepared journal distinguishes absent from exact visible consumption`                               | Integration  | AI-132 prepared journal and exact consumption                              | Inspector distinguishes absent from consumed                   |
| I-12 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `verified AI-131 callback with missing durable candidate blocks AI-132`                              | Integration  | Scheduler lease/journal/ledger plus exact-bound AI-131 output files        | Durable recovery; AI-132 preflight count remains zero          |
| I-13 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `verified AI-131 callback with divergent acquired source blocks AI-132`                              | Integration  | Exact-bound acquired-source file overwritten after callback                | Byte divergence causes recovery; AI-132 not called             |
| I-14 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `verified AI-131 callback with divergent authoritative journal blocks AI-132`                        | Integration  | Exact-bound AI-131 authoritative journal overwritten                       | Journal divergence causes recovery; AI-132 not called          |
| I-15 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `verified exact AI-131 durable outputs permit AI-132 preflight`                                      | Integration  | Exact consumption, journal, run record, acquisition and candidate files    | AI-132 preflight called exactly once                           |
| I-16 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `verified AI-132 callback with missing package record becomes recovery`                              | Integration  | Exact package/export bindings with deleted durable package record          | Durable scheduler recovery; no completed result                |
| I-17 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `artifact-specific identity rejects an unrelated matching id field`                                  | Integration  | Exact artifact with only unrelated matching identity                       | Artifact-specific identity mismatch rejected                   |
| I-18 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `artifact-specific semantic hash rejects an unrelated matching hash field`                           | Integration  | Exact artifact with only unrelated matching semantic hash                  | Artifact-specific hash mismatch rejected                       |
| I-19 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `exact artifact outside its reviewed root is rejected`                                               | Integration  | Valid artifact and different reviewed root                                 | Root substitution rejected                                     |
| I-20 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `durable recovery rejects caller-supplied or alternate journal paths`                                | Integration  | Same durable journal binding attempted at alternate path                   | Exact derived path wins; substitution rejected                 |
| I-21 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `heartbeat during delayed AI-131 execution`                                                          | Integration  | Scheduler lease repeatedly replaced with exact heartbeat bytes             | Multiple lifecycle heartbeats; completed                       |
| I-22 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `final in-flight heartbeat failure after journal completion prevents release`                        | Integration  | Completed journal, recovery result and retained lease                      | Final loop failure detected after shutdown                     |
| I-23 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `heartbeat failure during result persistence writes durable recovery`                                | Integration  | Normal result visibility, recovery result and retained lease               | Recovery written; completed not reported                       |
| I-24 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `final in-flight heartbeat failure after journal completion prevents release`                        | Integration  | Completed journal, recovery result and retained lease                      | Journal-finalization failure becomes recovery                  |
| I-25 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `final in-flight heartbeat failure after journal completion prevents release`                        | Integration  | Exact lease remains after terminal-journal heartbeat failure               | Normal lease release prevented                                 |
| I-26 | `tests/live-run/controlled-live-arca-run.test.ts`             | `crash inspection never retries automatically and consumption is atomic`                             | Integration  | AI-131 authorized journal before consumption                               | Exact pre-consumption crash is classified without retry        |
| I-27 | `tests/live-run/controlled-live-arca-run.test.ts`             | `crash inspection never retries automatically and consumption is atomic`                             | Integration  | AI-131 consumption and acquisition-started authoritative journal           | Visible consumption is recovery-required; no retry             |
| I-28 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `exact AI-131 unknown delivery blocks AI-132`                                                        | Integration  | AI-131 consumed reservation, scheduler journal and terminal result         | Unknown delivery; AI-132 call count zero                       |
| I-29 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `activation expires after AI-131 consumption`                                                        | Integration  | AI-131 consumed attempt, scheduler journal and recovery result             | AI-132 execute count zero                                      |
| I-30 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `observe CLI ignores caller authoritative provenance flags`                                          | Integration  | Local observation record                                                   | Caller provenance ignored; readiness unverified                |
| I-31 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `missing authorization and unresolved recovery are explicit observation blockers`                    | Integration  | Local observation record                                                   | Missing authorizations appear in reasons                       |
| I-32 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `missing authorization and unresolved recovery are explicit observation blockers`                    | Integration  | Local observation record                                                   | AI-131/AI-132 recovery blockers appear in reasons              |
| I-33 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `observation unverified claims cannot enable execution`                                              | Integration  | Local observation record                                                   | Unverified AI-130 forces blocked observation                   |
| I-34 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `zero network during observe and recover`                                                            | Integration  | Observation plus read-only recovery evidence                               | Observe makes zero network calls and no authority writes       |
| I-35 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `zero network during observe and recover`                                                            | Integration  | Observation plus read-only recovery evidence                               | Recover makes zero network calls and no authority writes       |
| I-36 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `repeated recovery is idempotent`                                                                    | Integration  | Same exact lease/journal/reservation inspected twice                       | Byte-equivalent decision; no mutation                          |
| I-37 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `production-composed real inspectors require dual-boundary completion`                               | Integration  | Real AI-131/AI-132 journals, exact consumption and scheduler recovery data | Completed-after-recovery only with both authoritative outputs  |
| I-38 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `recovery does not inspect a non-expired active lease as stale`                                      | Integration  | Active exact lease                                                         | `active_lease_not_stale`; boundary inspector not called        |
| I-39 | `tests/scheduler/governed-arca-scheduler.test.ts`             | `stale lease plus unresolved AI-131 journal remains blocked`                                         | Integration  | Expired/stale lease, execution-started journal and attempt reservation     | Staleness alone is insufficient; manual recovery               |
| I-40 | `tests/architecture/governed-arca-scheduler-boundary.test.ts` | `AI-133 scheduler has no direct transport, database, provider, deployment or vlatam-global boundary` | Architecture | Scheduler and CLI source imports                                           | No downstream authority, external DB or vlatam-global boundary |

## Latest corrected boundary-disposition traceability matrix

This matrix supersedes boundary-disposition claims in both historical matrices
above.

| ID   | Exact test name                                                              | Class       | Production composition  | Inspector exercised                                                     | Durable files created                                                                                                  | AI-131 disposition           | AI-132 disposition           | AI-132 invoked     | Recovery/result               | Lease    |
| ---- | ---------------------------------------------------------------------------- | ----------- | ----------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------- | ------------------ | ----------------------------- | -------- |
| B-01 | `blocked AI-131 callback with positive non-consumption never invokes AI-132` | Integration | No; injected adapter    | Injected AI-131 callback                                                | scheduler lease, journal, reservation, disposition, recovery                                                           | `positively_not_consumed`    | `not_authorized`             | No                 | `recovery_required`           | Retained |
| B-02 | `unauthorized AI-131 preflight never invokes AI-132`                         | Integration | No; injected adapter    | Injected AI-131 callback                                                | scheduler lease, journal, disposition, recovery                                                                        | `not_authorized`             | `not_authorized`             | No                 | `recovery_required`           | Retained |
| B-03 | `verified AI-131 callback with missing durable candidate blocks AI-132`      | Integration | No; injected adapter    | Scheduler exact-output verifier                                         | scheduler evidence plus missing AI-131 candidate                                                                       | `malformed_evidence`         | `not_authorized`             | No                 | `recovery_required`           | Retained |
| B-04 | `production-composed real inspectors require dual-boundary completion`       | Integration | Yes; shared CLI factory | `inspectControlledLiveRunRecovery`; `inspectGovernedArcaExportRecovery` | real AI-131 journal/consumption/record/acquisition/candidate; real AI-132 completed journal/package/record/consumption | `consumed_completed`         | `consumed_completed`         | Recovery inspector | `completed_after_recovery`    | Retained |
| B-05 | `production-composed real AI-131 completion without AI-132 is partial`       | Integration | Yes; shared CLI factory | `inspectControlledLiveRunRecovery`                                      | real completed AI-131 files; scheduler lease/journal/reservation                                                       | `consumed_completed`         | not started                  | No                 | `blocked_before_ai_132`       | Retained |
| B-06 | `production-composed real AI-132 recovery evidence requires recovery`        | Integration | Yes; shared CLI factory | both real inspectors                                                    | real AI-131 completion; AI-132 prepared journal plus consumption                                                       | `consumed_completed`         | `consumed_recovery_required` | Recovery inspector | `recovery_required`           | Retained |
| B-07 | `production-composed real AI-131 consumed recovery never inspects AI-132`    | Integration | Yes; shared CLI factory | `inspectControlledLiveRunRecovery`                                      | real AI-131 consumption and acquisition-succeeded journal                                                              | `consumed_recovery_required` | not inspected                | No                 | `recovery_required`           | Retained |
| B-08 | `real AI-131 inspector resolves callback exception after durable completion` | Integration | Yes; shared CLI factory | `inspectControlledLiveRunRecovery`                                      | real AI-131 completed journal and all exact outputs                                                                    | `consumed_completed`         | not inspected                | No                 | inspector reconciliation      | N/A      |
| B-09 | `real AI-132 inspector resolves callback exception as recovery-required`     | Integration | Yes; shared CLI factory | `inspectGovernedArcaExportRecovery`                                     | real AI-132 prepared journal and visible consumption                                                                   | not inspected                | `consumed_recovery_required` | Inspector only     | inspector reconciliation      | N/A      |
| B-10 | `repeated real AI-132 unresolved recovery is idempotent and read-only`       | Integration | Yes; shared CLI factory | both real inspectors                                                    | same real journals/consumptions and scheduler evidence twice                                                           | `consumed_completed`         | `consumed_recovery_required` | Recovery inspector | identical `recovery_required` | Retained |

## Latest corrected ledger/trust/runtime traceability matrix

This matrix supersedes ledger, recovery-path and runtime-reconciliation claims
in both historical matrices above.

| ID   | Exact test name                                                                     | Class                    | Production composition  | Inspector exercised              | Durable files created                                     | AI-131 disposition   | AI-132 disposition           | AI-132 invoked     | Recovery/result            | Lease     |
| ---- | ----------------------------------------------------------------------------------- | ------------------------ | ----------------------- | -------------------------------- | --------------------------------------------------------- | -------------------- | ---------------------------- | ------------------ | -------------------------- | --------- |
| R-01 | `missing ledger directory fails closed`                                             | Integration              | Recovery loader         | Scheduler durable loader         | lease, journal, request, slot; renamed ledger root        | N/A                  | N/A                          | No                 | `malformed_evidence`       | Retained  |
| R-02 | `missing ledger manifest fails closed`                                              | Integration              | Recovery loader         | Scheduler durable loader         | lease, journal, request, slot; removed manifest           | N/A                  | N/A                          | No                 | `malformed_evidence`       | Retained  |
| R-03 | `deleted reservation evidence fails closed`                                         | Integration              | Recovery loader         | Scheduler durable loader         | manifest inventory plus removed reservation               | N/A                  | N/A                          | No                 | `malformed_evidence`       | Retained  |
| R-04 | `exact durable pre-authority evidence permits safe abort`                           | Integration              | Scheduler recovery      | Scheduler recovery inspector     | authenticated empty manifest/directory, lease, journal    | not started          | not started                  | No                 | safe abort                 | Retained  |
| R-05 | `recovery rejects same-byte configuration and switch copies at alternate paths`     | Integration              | Recovery entrypoint     | Closed input + named environment | six same-byte alternate configuration/switch copies       | N/A                  | N/A                          | No                 | input rejected             | Unchanged |
| R-06 | `durable recovery rejects a valid self-hashed journal outside reviewed root`        | Integration              | Recovery entrypoint     | Named environment resolver       | same-byte alternate journal                               | N/A                  | N/A                          | No                 | input rejected             | Unchanged |
| R-07 | `AI-131-only completion is blocked before AI-132`                                   | Integration              | Scheduler recovery      | Injected test inspector          | scheduler lease/journal/AI-131 reservation                | `consumed_completed` | not started                  | No                 | `blocked_before_ai_132`    | Retained  |
| R-08 | `production-composed real inspectors require dual-boundary completion`              | Integration              | Yes; shared CLI factory | Both real inspectors             | full real boundary and scheduler durable evidence         | `consumed_completed` | `consumed_completed`         | Recovery inspector | `completed_after_recovery` | Retained  |
| R-09 | `repeated real AI-132 unresolved recovery is idempotent and read-only`              | Integration              | Yes; shared CLI factory | Both real inspectors             | identical durable evidence inspected twice                | `consumed_completed` | `consumed_recovery_required` | Recovery inspector | identical recovery         | Retained  |
| R-10 | `configuration and activation remain exact, bounded and repository-current blocked` | Integration              | Repository validation   | Registry/config validation       | inactive config, zero cap, active switches, template only | N/A                  | N/A                          | No                 | repository blocked         | Absent    |
| R-11 | `zero vlatam-global access`                                                         | Architecture/integration | Source/runtime scan     | None                             | false authority fields and architecture source            | N/A                  | N/A                          | No                 | access absent              | Unchanged |

## Validation

- Focused AI-133 scheduler: **79/79**; with the three AI-133 architecture
  boundaries: **82/82**.
- AI-128/130/131/132/133 combined regression and architecture: **146/146**.
- Full repository suite outside the process sandbox: **1,306/1,306** tests,
  **153/153** suites.
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

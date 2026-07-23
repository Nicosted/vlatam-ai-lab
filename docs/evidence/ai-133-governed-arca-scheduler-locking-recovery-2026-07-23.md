# AI-133 Governed ARCA Scheduler, Locking and Recovery evidence

Date: 2026-07-23
Status: implemented locally; human review required; repository-current
scheduler inactive and execution blocked.

## Baseline

- Repository: `Nicosted/vlatam-ai-lab`.
- Refreshed `main` was clean and exactly equal to `origin/main`.
- Baseline:
  `3e149f27b891ba5b81c03d0097dc7f950a485405`,
  `AI-132: add governed ARCA export boundary (#127)`.
- PR #127 was confirmed merged at that exact commit.
- AI-130 (`edc3915`), AI-131 (`90a9df6`) and AI-132 (`3e149f2`) were present.
- AI-131 and AI-132 repository kill switches were active before branching.
- Branch: `feat/ai-133-governed-arca-scheduler-locking-recovery`.

## Architecture and authority separation

The introduced flow is:

`reviewed configuration → separate expiring activation → exact request → exclusive durable lease → local observation → existing AI-131/AI-132 boundary when independently authorized → canonical result/recovery evidence`

Scheduling authority is not acquisition or export authority. AI-133 neither
creates nor regenerates AI-131/AI-132 authorization, never changes their kill
switches, never approves AI-128, and never imports an AI-132 package. Contract
authority fields remain explicitly false for import, publication, deployment,
database write, production reliance, downstream scheduling and
`vlatam-global`.

## Contracts and hashes

All contracts are closed JSON Schema Draft 2020-12 at `1.0.0`, with exact
required fields and domain-separated canonical SHA-256 identities.

| Contract                | Schema hash                                                        |
| ----------------------- | ------------------------------------------------------------------ |
| Scheduler configuration | `57aad5dc1e170ec01e7e57d1903f42bb33a483e98308dd243665935b78bbd8ca` |
| Scheduler activation    | `cebd9c35540d3c8bded6d0d314b6b86e9d52e3f0072071452b8aa78228a47bb4` |
| Scheduled run request   | `039337228981719ed21c3835ec2d64fd410876ce9946bfaffbe537a490edde62` |
| Durable scheduler lease | `05d37eaf7ab5c6ab0442a6a0f5aff776dd829ccf820e8c8921d12f3bcc7f2d1d` |
| Scheduler run journal   | `65575342188a94e038e49be8bbf2447d970c7f24ce81b90de1627c3cd96789af` |
| Scheduler run result    | `aaa16209cda32b7c87518cb134010fa7dfa9bde554eabe76f5a7dc854ed5e963` |
| Scheduler observation   | `670838819e7226b7a0429d851d1d7549d6c204438a70908c5c21f6b8acf41abe` |
| Recovery decision       | `3cd705835eb6f9152a1a5fef310d606ffbf0f8d702e2fa82604f56dc26fed28b` |
| Scheduler kill switch   | `543f100d6dcf78b0ed0bccf0e81f42a09c3e2fba415603786a30bb9212cde302` |

Repository-current scheduler configuration hash:
`c58b12220832de50b690cc14eb2a4c1b8becfd0fae9160749ab1e76436dbf1fb`.
Repository-current scheduler switch hash:
`26e9aa69d40bc072ec295596ecbc0a47f4cf4ee49f016c6dc36fffc2a45ce3f3`.

## State machine

The journal vocabulary preserves:

`scheduled → lease_acquired → configuration_verified → activation_verified → observation_started → acquisition_preflight_checked → acquisition_execution_started | acquisition_not_authorized → acquisition_verified | acquisition_blocked | acquisition_unknown → export_preflight_checked → export_execution_started | export_not_authorized → export_verified | export_blocked → observation_recorded → completed`

Recovery states include `safe_abort_before_authority`,
`authority_consumed_recovery`, `unknown_delivery_manual_review`,
`lease_expired_recovery`, `recovery_required` and `completed`.

## Lease semantics

The deterministic configuration lease uses exclusive no-overwrite creation.
Existing components are inspected; symlinks and non-regular files fail
closed. The lease binds owner, process identity, acquired/expiry/heartbeat
times, configuration hash and activation hash. Heartbeat and release require
exact owner/process and expected bytes, then durably sync the containing
directory. Expiry never steals or blindly deletes a lease; journal and durable
evidence inspection comes first. PID-only or hostname-only trust is absent.

## Recovery precedence

1. Validate the exact lease.
2. Validate exact journal presence, schema, identity and hash.
3. Unknown delivery requires manual review and is never automatically retried.
4. Consumed AI-131/AI-132 authority requires boundary reconciliation and is
   never regenerated.
5. A proven pre-authority journal permits safe abort.
6. Missing, malformed or divergent evidence fails closed.

Recovery explicitly denies retry, authorization regeneration and switch
changes. Repeated evaluation of the same canonical evidence is idempotent.

## 72-hour pilot and current blocked state

- Maximum activation: 72 hours; no self-renewal.
- Default observation cadence: 60 minutes and 24 observations/day.
- Repository-current execution attempts/day: zero.
- Separate activation observation and execution-attempt caps.
- No execution at/after expiry and no catch-up loop after downtime.
- One lease, no concurrent runs, immediate scheduler switch.
- Independent AI-131 and AI-132 switches remain authoritative.
- No automatic retry; final pilot summary reports exact counters/stop reason.
- No active activation is checked in.

## Validation

Focused AI-133 validation passed **16/16** tests covering closed schema
compilation, blocked current state, zero-network observation, malformed/hash
substitution, missing/future/expired/mismatched activation, separation of
duties, atomic lease competition, exact heartbeat/release, owner/divergence/
symlink rejection, recovery precedence, duplicate request identity, caps,
no-catch-up cadence, pilot counters and false authorities.

Combined AI-128/130/131/132/133 focused regressions passed **80/80**. The full
repository suite passed **1,240/1,240** outside the sandbox; the first
sandboxed attempt exposed only the known `tsx` temporary IPC-socket
restriction in two subprocess tests. Schema compilation, architecture
boundaries, typecheck, build, scoped ESLint, scoped Prettier and
`git diff --check` all passed.

## Zero-network evidence and prohibited non-actions

The observation test replaces `globalThis.fetch` with a throwing counter and
records zero calls. The scheduler module imports no transport, provider,
adapter, database, deployment, production or `vlatam-global` module. The CLI
reaches execution only through existing AI-131/AI-132 boundaries after
scheduler gates.

No real activation, live authorization, live ARCA request, export package,
import, publication, deployment, scheduler installation, daemon, background
process, credential access, environment-file read, customer-data access,
database write, production service access or `vlatam-global` access occurred.

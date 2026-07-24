# Durable ARCA Review and Artifact Store

Status: AI-130 implemented locally; no live acquisition or external authority.

AI-132 uses `readVerifiedDurableArcaExportSource()` as a read-only verification
seam. The helper requires an existing hardened store, rejects an operation lock
or any recovery journal, verifies the complete immutable event chain and every
workflow record, recomputes the projection, then returns the exact candidate,
review, evaluation, Approved Artifact, persistence event and projection. It
never initializes, locks, recovers or writes the store. The projection is not
trusted as authority by itself.

AI-131 may call the existing `record_candidate` command only after a controlled one-shot acquisition has produced an exact AI-126 candidate. The live-run proposal binds the AI-130 store configuration hash, not a request-supplied store path. Root paths come only from a separately reviewed local configuration file. AI-131 stores no review, evaluation or Approved Artifact and every store command keeps network/database/scheduler/deployment/export/publication/production/`vlatam-global` authority false.

## Boundary

The store records already-created governed artifacts in this exact dependency
order:

`candidate → review → evaluation → Approved Artifact → durable audit projection`

It uses only the local filesystem and authoritative AI-126, AI-127, and AI-128
validation/canonicalization helpers. It has no provider, model, secret,
network, database, scheduler, deployment, publisher, export, production, or
`vlatam-global` dependency.

## Versioned layout

Layout `1.0.0` is bound, with all four contract versions, into
`DURABLE_ARCA_STORE_CONFIGURATION_SHA256`:

- `candidates/<candidate-id>.json`
- `reviews/<review-id>.json`
- `evaluations/<evaluation-id>.json`
- `approved-artifacts/<approved-artifact-id>.json`
- `events/<12-digit-sequence>--<event-id>.json`
- `journals/arca-store-journal--<plan-sha256>.json`
- `projections/arca-workflows/<candidate-id>.json`

Paths are derived only from schema-validated identities. The configured root
is resolved by trusted local caller configuration, not by a governed record or
HTTP request.

## Durability and concurrency

Immutable records and events are written to an exclusive staging file,
`fsync`ed, and made visible with an atomic no-overwrite hard link. The parent
directory is then `fsync`ed. Existing equal bytes are deterministic idempotent
success; different bytes at the same identity are a collision. Staging files
are removed in `finally` paths.

One exclusive `.operation-lock` directory serializes competing processes.
There is no waiting loop and no stale-lock guessing: a competing operation
fails closed as `store_busy`. The lock is not a distributed service and grants
no authority beyond local serialization.

Projection publication uses a fully written and `fsync`ed staging file plus
atomic rename. A projection is replaceable because it is derived and
non-authoritative; its own domain hash, exact reconstructed bytes, and latest
event bindings are verified.

Every mutating operation first publishes one closed `1.0.0` recovery journal.
The journal domain-binds the command identity, exact record/event/projection
bytes and byte hashes, prior event and projection state, derived paths, store
configuration, and current publication stage. Stage replacement is itself
write-`fsync`-rename-directory-`fsync`; the journal is removed only after all
planned bytes are visible and the completed stage is durable.

Under the operation lock, recovery runs before ordinary chain verification.
It rejects malformed journals, unknown journal entries, path or hash
divergence, and any visible record/event/projection bytes that match neither
the journal plan nor the bound previous projection. Record operations complete
in `record → event → projection` order. Projection rebuilds complete in
`projection → event` order, so a durable `projection_rebuilt` event is never
visible before the exact planned rebuilt projection. Retrying recovery cannot
allocate a replacement sequence or append a duplicate event.

## Replay and event semantics

Every event binds its exact sequence, explicit caller timestamp, actor,
operation/outcome, all present workflow IDs/hashes, previous event ID/hash,
store configuration hash, and false external-authority fields. Genesis alone
has null previous bindings. Replay rejects schema/identity/hash errors,
non-contiguous or duplicate sequences, reordered filenames, broken prior
bindings, missing records, orphan records, and projection divergence.

The persistence actor namespace is `human:<stable-id>` or the single service
identity `service:durable-arca-store@1.0.0`. Persistence never silently assigns
reviewer, builder, publisher, export-approver, or production-approver roles.

## Operation/result precedence

Command/schema/timestamp validation occurs before root access. Root safety and
exclusive-lock acquisition precede journal recovery, which precedes ordinary
chain replay. Existing chain integrity is checked before new record
validation/publication. Upstream absence returns
`orphan_record`; exact binding/schema failures return `invalid_record` or
`binding_mismatch`; equal bytes return `duplicate_unchanged`; different bytes
return `identity_collision`; publication/replay failures remain fail closed.

`verify_store` performs no new audit append, but it completes a valid active
journal before verifying the whole store; malformed or unexpected journal
state is `integrity_invalid`. `rebuild_projection` appends an audit event only
after its exact projection is durable because it changes derived state.
Neither operation authorizes
export, publication, production, network, database, scheduler, deployment, or
`vlatam-global` access.

## AI-133 read-only scheduler relationship

AI-133 binds the exact AI-130 service identity and configuration hash in its
reviewed scheduler configuration. Observation reports
`unverified_reported_input` unless a read-only authoritative inspector derives
AI-130 integrity; caller input cannot enable execution. It does not initialize,
repair, mutate or infer eligibility from the store. Export readiness still
flows through AI-132's authoritative
`readVerifiedDurableArcaExportSource()` path. The scheduler does not duplicate
AI-130 replay or AI-128 eligibility logic.

Scheduler leases, journals, activation-scoped attempt reservations, slot
acceptances, observations and results live under separate reviewed scheduler
roots. They are not AI-130 records or events and cannot approve a candidate,
create an Approved Artifact, import an export package, or confer downstream
authority.

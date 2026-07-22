# Durable ARCA Review and Artifact Store

Status: AI-130 implemented locally; no live acquisition or external authority.

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
event bindings are verified. An interrupted or tampered projection is stale or
invalid and can be rebuilt from immutable records/events.

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
exclusive-lock acquisition precede chain replay. Existing chain integrity is
checked before record validation/publication. Upstream absence returns
`orphan_record`; exact binding/schema failures return `invalid_record` or
`binding_mismatch`; equal bytes return `duplicate_unchanged`; different bytes
return `identity_collision`; publication/replay failures remain fail closed.

`verify_store` performs no audit append. `rebuild_projection` appends an audit
event because it changes durable derived state. Neither operation authorizes
export, publication, production, network, database, scheduler, deployment, or
`vlatam-global` access.

# Governed ARCA source acquisition

## Status

This capability is a manual, production-isolated acquisition boundary for public ARCA/AFIP sources. Acquisition itself does not schedule runs, parse downloaded content, approve evidence, call an LLM, or publish artifacts to `vlatam-global`. AI-126 adds a separate replay-only ingestion step described below; it does not change acquisition authority.

AI-131 adds a separate controlled one-shot live runner. Repository-current state remains blocked by `config/ai-131-controlled-live-arca-kill-switch.json`; there is no live authorization, consumed authorization, live run, live acquisition, or live candidate checked in.

AI-132 adds a separate governed local export boundary after an exact AI-128 Approved Artifact has been verified through AI-130. Repository-current state remains blocked by `config/ai-132-governed-arca-export-kill-switch.json`; there is no export authorization, consumption, package, record, import acknowledgment, external transfer, or `vlatam-global` access checked in.

## Purpose

The existing ARCA parser consumes repository-local files. This capability adds the missing step before parsing:

```text
Official HTTPS source
→ governed acquisition
→ immutable raw bytes + metadata
→ integrity-bound acquired-source input
→ supported-content classification
→ existing ARCA parser
→ candidate parsed artifact requiring human review
→ snapshot/delta/evidence/review/export
```

## Safety invariants

- HTTPS is mandatory.
- The requested URL and every redirect host must be present in the compiled allowlist.
- Runtime input cannot replace or expand the host allowlist.
- Redirects are followed manually, remain HTTPS, and are bounded to five hops.
- Requests have one bounded timeout covering headers and body consumption.
- Every discarded fetched response body is cancelled without being consumed or persisted; cancellation failure does not replace the controlled acquisition error.
- Response bodies are streamed, counted, and cancelled immediately when the maximum is exceeded.
- An invalid declared `Content-Length`, or one above the maximum, fails before body consumption and cancels the response body.
- A missing, malformed, or unapproved content type fails closed.
- Empty responses fail closed.
- Source identifiers use a strict lowercase hyphenated format and cannot affect path containment.
- Raw bytes are hashed with SHA-256.
- Raw bytes and metadata are staged together and published by one directory rename; a failed staging write leaves no visible partial acquisition.
- Published acquisition directories are immutable and never overwritten.
- Replay mode uses local fixtures, performs no network request, and requires an explicit source capture timestamp.
- Invalid capture timestamps fail closed with `INVALID_CAPTURE_TIMESTAMP`.
- Repeating an identical replay produces the same identity and fails as an immutable collision rather than changing metadata.
- Acquisition success does not imply that the source format, extracted facts, or regulatory meaning are valid.
- No production credential, database connection, scheduler, automatic review, or downstream action is introduced.

## Compiled host allowlist

- `arca.gob.ar`
- `www.arca.gob.ar`
- `afip.gob.ar`
- `www.afip.gob.ar`
- `serviciosweb.afip.gob.ar`

Adding a host requires a reviewed code change. There is no request-level allowlist override.

For AI-131, the controlled runner further narrows this host policy to one exact URL from the exported `GOVERNED_ARCA_EXACT_SOURCE_URLS`. Its proposal binds acquisition policy SHA-256 `9d3b61ad4b374c83f783bac5f861795aec9e4cabbe92fde07002381677cf4280`; no wildcard, discovered link, alternate hostname, fallback, custom header, cookie, proxy, credential or retry is accepted.

## AI-131 controlled live-run boundary

The manual `pnpm arca:controlled-live-run` CLI accepts only proposal, authorization, kill-switch, reviewed root-configuration and explicit timestamp/run identities. `--preflight` performs no writes, no authorization consumption, no ingestion and no network call. Execution requires a distinct `human:<stable-id>` authorizer, an exact proposal/hash/source/policy match, valid time windows, safe governed roots, an unconsumed authorization and a valid disabled repository artifact. The kill switch is reread immediately before transport.

Authorization consumption is an exclusive no-overwrite file written before transport. The journal is written first and binds attempt one and transport attempt one. The acquisition boundary receives a maximum-network-call value of one, fixed non-authentication headers, no cookie input, no retry and the existing manual redirect checks. A redirect can therefore be validated but cannot cause a second call in the controlled run.

Successful bytes flow only through AI-126 and stop at an AI-130-persisted candidate with human review required. Recovery before consumption aborts safely; after consumption/before transport requires an operator; unknown transport delivery is never retried; acquired bytes and created candidates can resume locally without fetch. No review, evaluation, Approved Artifact, export, publication or production authorization is created.

## Usage

Live manual capture of an official ARCA Arancel Integrado source:

```bash
pnpm crawler:arca:acquire \
  --url https://www.arca.gob.ar/aduana/arancelintegrado/
```

Replay using a local fixture and its exact capture timestamp:

```bash
pnpm crawler:arca:acquire \
  --url https://www.arca.gob.ar/aduana/arancelintegrado/ \
  --mode replay \
  --replay-path tests/fixtures/arca/nomenclador.txt \
  --captured-at 2026-07-21T12:00:00.000Z
```

Optional limits:

```bash
pnpm crawler:arca:acquire \
  --url https://www.arca.gob.ar/aduana/arancelintegrado/ \
  --timeout-ms 30000 \
  --max-bytes 52428800 \
  --output data/acquisitions
```

## Output contract

Each acquisition is published as one immutable directory containing:

1. `raw.<extension>` — the exact response or replay bytes.
2. `metadata.json` — the versioned provenance record containing:
   - schema version;
   - stable acquisition ID;
   - source ID;
   - requested and effective URL;
   - effective host;
   - acquisition mode;
   - capture timestamp;
   - content type and length;
   - SHA-256 hash;
   - raw and metadata paths.

The acquisition ID is derived from the source ID, UTC capture date, and a hash prefix. Publication occurs only after both staged files are complete. A repeated write to the same final directory fails rather than replacing evidence.

## Operator boundary

Before a live run, an operator must verify that the URL is an official ARCA/AFIP source. After a run, the output remains unreviewed raw evidence. It must pass through the existing parser, snapshot, delta, evidence, human-review, and export boundaries before `vlatam-global` may consume it.

## AI-126 acquired-source ingestion boundary

AI-126 accepts only the closed
`governed-arca-acquired-source-input` contract. The contract identifies an
artifact under a separately configured governed acquisition root; it cannot
name an arbitrary raw file. Before invoking the shared ARCA nomenclador parser,
the adapter:

1. derives the acquisition directory from the source ID, capture date, and
   acquisition ID;
2. validates every existing component of each absolute acquisition and
   candidate root with `lstat`; symbolic-link components and non-directory
   roots fail closed. Candidate ancestors are validated before recursive
   creation, then the created root and identity-derived descendants are
   validated again. Raw and metadata files are opened with no-follow semantics;
3. verifies the exact acquisition-record SHA-256;
4. verifies requested/effective URL, source host and ID, capture timestamp,
   media type, replay mode, acquisition identity, raw path, byte length, and
   raw-byte SHA-256 as one consistent binding;
5. classifies only supported ARCA delimiter text; and
6. invokes parser identity `arca-nomenclador-txt` version `1.0.0` with its
   exact configuration hash.

Successful parsing publishes an immutable candidate JSON atomically. It binds
the acquisition-record hash, raw-byte hash, parser identity/version/config,
caller-supplied parsing timestamp, and parsed-output hash. Its fixed states are
`human_review_required`, `not_approved`, and `not_publishable`. It is not an
Approved Artifact and has no route to `vlatam-global`.

Deterministic local replay:

```bash
pnpm crawler:arca:ingest-acquired -- \
  --contract path/to/governed-input.json \
  --acquisition-root path/to/governed-acquisitions \
  --candidate-root path/to/local-candidates
```

The command exposes no URL, prompt, live-mode, or arbitrary raw-file argument.
All failure modes clean staging files and leave no partial candidate.

## AI-127 independent candidate review boundary

AI-127 adds a separate, pure review evaluator after the immutable AI-126
candidate. The closed review contract binds the complete candidate canonical
SHA-256 and filesystem-independent artifact ID together with the candidate
schema/type, acquisition ID and record/raw hashes, parser identity/version/
configuration, parsing timestamp, parsed-output hash, and tariff-line count.
A repository path is optional provenance only and never replaces those
bindings.

The lifecycle is closed to `pending`, `approved`, `rejected`, `expired`, and
`superseded`. The evaluator first reuses the authoritative AI-126 validator,
then verifies the review contract and review hash, exact candidate bindings,
separation of duties, expiry, controlled findings, and lifecycle. An approval
with an unresolved blocker or high finding fails closed. The only positive
outcome is `eligible_for_approved_artifact_building`, which is input for a
separate AI-128 builder; it creates no artifact and grants no export,
publication, production, database, network, scheduler, deployment, or
`vlatam-global` authority.

Every decided lifecycle requires a canonical decision timestamp no later than
the evaluator's explicitly injected `evaluatedAt`. Any expiry carried by a
decided review must be canonical and strictly later than its decision; future
decisions and non-forward expiries are invalid review records before lifecycle
outcomes are considered. The evaluator never reads local wall-clock time.

Evidence reviewer identities use the closed
`human:<stable-id>` namespace (`^human:[a-z0-9][a-z0-9._@-]*$`) in addition to
the fixed `human` identity type and `evidence_reviewer` role. Arbitrary or
automation-shaped identities therefore fail schema validation. Separation-of-
duties comparisons use the exact validated identity without normalization.

The repository example under `data/fixtures/arca/` is explicitly synthetic and
pending. It contains no reviewer, decision, or fabricated approval.

## AI-128 Approved ARCA Artifact Builder boundary

AI-128 consumes one exact AI-126 candidate, one exact AI-127 human-review
record, one supplied AI-127 evaluation, an explicit builder identity, and an
explicit build timestamp. It reuses the authoritative candidate validator,
validates the supplied evaluation's closed schema and self-hash, recomputes
AI-127 at the supplied evaluation timestamp, and requires complete canonical
equivalence with that recomputed result. Eligibility is then rechecked at
build time, including review expiry and timestamp ordering.

Builder identities are closed to `human:<stable-id>` or the exact versioned
service identity `service:approved-arca-builder@1.0.0`. The builder must differ
from the reviewer, acquisition operator, candidate producer, parser/runtime,
and any future publisher/export approver. AI-127's future builder and
publisher fields must remain null; AI-128 assigns the actual builder only in
the immutable artifact.

The approved payload is an exact structured clone of the candidate parsed
output. It is not reparsed or reinterpreted and receives no LLM-derived
content. Local publication validates every root component before and after
creation, rejects symbolic links and non-directories, writes through a staging
file and atomic no-overwrite hard link, and cleans staging on every outcome.

```bash
pnpm arca:build-approved -- \
  --candidate path/to/candidate.json \
  --review path/to/review.json \
  --evaluation path/to/evaluation.json \
  --approved-artifact-root path/to/local-approved-artifacts \
  --builder-identity human:stable-id \
  --build-timestamp 2026-07-22T15:00:00.000Z
```

The repository does not contain a real approval or Approved ARCA Artifact.
Only tests construct synthetic positive inputs. Every artifact and result
keeps export, publication, production reliance, database, network, scheduler,
deployment, and `vlatam-global` authority disabled.

## AI-129 ARCA Operator Review Console boundary

AI-129 exposes the repository-governed candidate → review → evaluation →
Approved Artifact flow at `/operator/arca-review`. A pure presentation view
model consumes Operator Read Model `1.7.0`; it does not call the AI-127
evaluator or the AI-128 builder. Canonical outcomes, reason codes, bindings,
IDs, and full hashes remain available while Spanish labels and shortened
hashes form the primary operator view.

The route is read-only and repository-current state remains synthetic and
pending: no reviewer, decision, eligibility, Approved Artifact, export,
publication, production reliance, or `vlatam-global` consumption exists. The
console contains no form or apparent action control and cannot persist a
decision, build an artifact, or activate downstream behavior.

## AI-130 Durable ARCA Review and Artifact Store boundary

AI-130 adds one repository-owned local filesystem boundary for records that
have already been created by AI-126, AI-127, or AI-128. The accepted order is
strict: a candidate must exist before its review, a review before its
evaluation, and an evaluation before its Approved Artifact. Missing upstream
records are never inferred or synthesized.

The versioned layout stores immutable identity-named candidate, review,
evaluation, and Approved Artifact JSON; an exactly sequenced prior-hash-bound
event chain; and a replaceable per-candidate projection under
`projections/arca-workflows/`. A closed, hash-bound recovery plan is held under
`journals/` while a mutation is incomplete. Record and event publication uses exclusive
creation from a fully written and `fsync`ed staging file. Duplicate bytes are
idempotent, while an existing identity with different bytes fails closed.
The derived projection is atomically replaced, fully rebuildable, and
explicitly non-authoritative over the immutable records and events.

On every invocation, valid journal recovery runs under the exclusive lock
before ordinary replay. Record operations finish record, event, then
projection publication; projection rebuilds finish the exact projection before
their audit event. Mismatched visible bytes, malformed plans, or unexpected
journal files fail closed and require human inspection. Recovery never invents
new bytes, a new timestamp, or a replacement event sequence.

Configured roots reject symbolic-link ancestors/final components and
non-directory components. A filesystem-exclusive operation lock serializes
competing local processes; no database or distributed lock is introduced.
Every timestamp is caller-supplied canonical UTC, and the implementation has
no wall-clock dependency.

```bash
pnpm arca:durable-store -- record-candidate \
  --store-root path/to/local-store \
  --record path/to/candidate.json \
  --actor human:stable-id \
  --timestamp 2026-07-22T15:00:00.000Z

pnpm arca:durable-store -- verify-store \
  --store-root path/to/local-store \
  --actor service:durable-arca-store@1.0.0 \
  --timestamp 2026-07-22T15:00:00.000Z
```

The CLI accepts governed JSON paths only for record operations. It accepts no
URL, prompt, source acquisition, approval decision, export/publication flag,
production flag, credential, or network option. Persistence does not make its
actor a reviewer, builder, publisher, export approver, or production approver.
All external-authority fields remain false.

## Deferred work

The following belong to later, separately reviewed PRs:

- discovery of the current nomenclador download link from the landing page;
- idempotent scheduled execution;
- concurrency locks and durable run records;
- alerts and GitHub artifacts;
- reviewed regulatory change feed.
- AI-131 Controlled Live ARCA Run.

## AI-132 governed ARCA export boundary

`pnpm arca:governed-export` accepts only an exact proposal, an independent
one-shot human authorization, the dedicated export kill switch, a reviewed
root configuration and an explicit canonical UTC timestamp. Preflight performs
read-only AI-128 validation plus AI-130 immutable-record, event-chain and
projection verification. It creates no lock, directory, consumption, package,
record, network request or external access.

Execution is local handoff only. A hash-bound journal precedes authorization
consumption; consumption is an atomic no-overwrite record; the switch is
reread from disk immediately before package visibility; and the canonical JSON
package is published with staging, fsync and a no-overwrite hard link. Recovery
uses the exact package and record bytes sealed in the journal. Divergence fails
closed and never invents a second package.

The journal also seals the exact identity-derived consumption path, canonical
consumption bytes/hash, reviewed root-configuration identity/hash and reviewed
export-switch hash/resolved path before consumption. Recovery reconciles the
visible consumption record before interpreting `prepared`: absence is a safe
pre-consumption abort, exact bytes continue as consumed, and missing
later-stage or divergent bytes fail closed. Recovery requires the exact
reviewed switch artifact and path and rereads it immediately before any
missing package becomes visible. An active, missing, malformed, substituted or
hash-invalid switch keeps consumption durable but blocks package and record
creation.

The package copies the Approved Artifact payload exactly. It does not reparse,
reinterpret, enrich, classify, summarize or invoke an LLM. It is fixed to
`vlatam-global` / `handoff_only` and states `not_imported`, `not_published`,
`not_deployed`, `not_authorized` and no external network transfer. AI-132 does
not implement a consumer, publisher, deployment, scheduler or production path.

## AI-133 governed scheduler, locking and recovery boundary

AI-133 adds a local, bounded orchestration seam around the existing AI-131 and
AI-132 entry points. Scheduling authority remains distinct from acquisition
and export authority. An execution iteration requires an active exact
configuration, a separate unexpired human-reviewed activation, the disabled
reviewed scheduler switch, an atomic durable lease, and the exact independent
AI-131 or AI-132 artifacts required by those boundaries. The scheduler cannot
create either authorization or disable any switch.

`pnpm arca:governed-scheduler observe --input <json>` records local readiness,
recovery and counter state without invoking either boundary or making a
network call. `run-once` has no retry loop and stops on unknown acquisition
delivery. `recover` emits a fail-closed decision after lease/journal
reconciliation; it never steals or blindly deletes a lease, regenerates
authority, or converts uncertain delivery into a retryable failure.

The repository-current configuration is inactive, permits zero daily
execution attempts, and is protected by an active scheduler execution switch.
Only a non-authorizing activation template is checked in. There is no daemon,
cron, hosted schedule, launch agent, background process, active pilot, or
catch-up behavior.

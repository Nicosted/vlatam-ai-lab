# Governed ARCA source acquisition

## Status

This capability is a manual, production-isolated acquisition boundary for public ARCA/AFIP sources. Acquisition itself does not schedule runs, parse downloaded content, approve evidence, call an LLM, or publish artifacts to `vlatam-global`. AI-126 adds a separate replay-only ingestion step described below; it does not change acquisition authority.

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
2. rejects traversal and symlinks and opens regular files with no-follow
   semantics;
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

## Deferred work

The following belong to later, separately reviewed PRs:

- discovery of the current nomenclador download link from the landing page;
- idempotent scheduled execution;
- concurrency locks and durable run records;
- alerts and GitHub artifacts;
- reviewed regulatory change feed.

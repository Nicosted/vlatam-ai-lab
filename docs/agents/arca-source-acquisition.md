# Governed ARCA source acquisition

## Status

This capability is a manual, production-isolated acquisition boundary for public ARCA/AFIP sources. It does not schedule runs, parse downloaded content, approve evidence, call an LLM, or publish artifacts to `vlatam-global`.

## Purpose

The existing ARCA parser consumes repository-local files. This capability adds the missing step before parsing:

```text
Official HTTPS source
→ governed acquisition
→ immutable raw bytes + metadata
→ parser (separate step)
→ snapshot/delta/evidence/review/export
```

## Safety invariants

- HTTPS is mandatory.
- The requested URL and every redirect host must be present in the compiled allowlist.
- Runtime input cannot replace or expand the host allowlist.
- Redirects are followed manually, remain HTTPS, and are bounded to five hops.
- Requests have one bounded timeout covering headers and body consumption.
- Response bodies are streamed, counted, and cancelled immediately when the maximum is exceeded.
- A declared `Content-Length` above the maximum fails before body consumption.
- A missing, malformed, or unapproved content type fails closed.
- Empty responses fail closed.
- Source identifiers use a strict lowercase hyphenated format and cannot affect path containment.
- Raw bytes are hashed with SHA-256.
- Raw bytes and metadata are staged together and published by one directory rename; a failed staging write leaves no visible partial acquisition.
- Published acquisition directories are immutable and never overwritten.
- Replay mode uses local fixtures, performs no network request, and requires an explicit source capture timestamp.
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

## Deferred work

The following belong to later, separately reviewed PRs:

- discovery of the current nomenclador download link from the landing page;
- parser integration and format-signature validation;
- idempotent scheduled execution;
- concurrency locks and durable run records;
- alerts and GitHub artifacts;
- reviewed regulatory change feed.

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
- The requested and effective redirect hosts must be explicitly allowlisted.
- Requests have a bounded timeout and maximum response size.
- Only approved content types are accepted.
- Empty responses fail closed.
- Raw bytes are hashed with SHA-256.
- Raw bytes and provenance metadata use exclusive-create writes and are never overwritten.
- Replay mode uses local fixtures and performs no network request.
- Acquisition success does not imply that the source format, extracted facts, or regulatory meaning are valid.
- No production credential, database connection, scheduler, automatic review, or downstream action is introduced.

## Default host allowlist

- `arca.gob.ar`
- `www.arca.gob.ar`
- `afip.gob.ar`
- `www.afip.gob.ar`
- `serviciosweb.afip.gob.ar`

Adding a host requires a reviewed code change. Runtime input cannot expand the allowlist.

## Usage

Live manual capture of the official ARCA Arancel Integrado landing source:

```bash
pnpm crawler:arca:acquire \
  --url https://www.arca.gob.ar/aduana/arancelintegrado/
```

Replay using a local fixture:

```bash
pnpm crawler:arca:acquire \
  --url https://www.arca.gob.ar/aduana/arancelintegrado/ \
  --mode replay \
  --replay-path tests/fixtures/arca/nomenclador.txt
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

Each acquisition creates:

1. The immutable raw response body.
2. A sibling `.metadata.json` record containing:
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

The acquisition ID is derived from the source ID, UTC capture date, and a hash prefix. A repeated write to the same immutable path fails rather than replacing evidence.

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

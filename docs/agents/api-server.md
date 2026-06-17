# Classifier Export API Server

Phase 9: Local HTTP API to serve approved classifier exports.

## Purpose

Exposes clean, stable export artifacts from `data/exports/` to external consumers via HTTP.

## Endpoints

`GET /api/classifier/:source_id/:artifact_id`

## Example

```bash
curl http://localhost:3000/api/classifier/infoleg/artifact--infoleg--extraction-001
```

## CLI Usage

```bash
pnpm agents:api-server --port 3000
```

## Security

- Read-only.
- Strict URL parameter validation.
- Path containment enforced.
- Export schema validation required before responses are served.
- No absolute paths exposed in errors or logs.
- No production services, databases, scraping, or runtime imports.

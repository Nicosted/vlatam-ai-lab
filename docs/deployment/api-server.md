# API Server Deployment Guide

## Overview

This guide covers local Docker validation and documents a possible staging deployment for the read-only vlatam-ai-lab API server. It does not authorize creating infrastructure or deploying to any external service.

## Prerequisites

- Docker
- Approved export artifacts in `data/exports/`
- Node.js 22.5+ and pnpm for local validation

## API Key Authentication

Classifier routes require an API key in the `x-vlatam-ai-lab-key` request header. Configure keys through runtime environment variables only:

| Variable               | Required  | Default         | Description                                                             |
| ---------------------- | --------- | --------------- | ----------------------------------------------------------------------- |
| `PORT`                 | No        | `3000`          | HTTP server port.                                                       |
| `DATA_ROOT`            | No        | `process.cwd()` | Root directory containing `data/exports/`.                              |
| `NODE_ENV`             | No        | development     | Runtime environment label.                                              |
| `AI_LAB_API_KEYS`      | Preferred | none            | Comma-separated valid API keys. Takes precedence when it contains keys. |
| `AI_LAB_API_KEY`       | Fallback  | none            | Single valid API key when no key list is configured.                    |
| `RATE_LIMIT_WINDOW_MS` | No        | `60000`         | Positive rate-limit window in milliseconds.                             |
| `RATE_LIMIT_MAX`       | No        | `100`           | Positive maximum requests per IP per window.                            |

When no API key is configured, classifier routes fail closed with `401 Unauthorized`. The `/health` endpoint remains public and requires no authentication so local and platform health checks can reach it.

Send a configured key with each classifier request:

```text
x-vlatam-ai-lab-key: <your-key>
```

## Rate Limiting

`RATE_LIMIT_WINDOW_MS` defaults to `60000` milliseconds and `RATE_LIMIT_MAX` defaults to `100` requests per window. Rate limiting is tracked per IP in the server process. Its state resets whenever the process restarts and is not shared across replicas. The defaults are appropriate for local validation, but a separately reviewed distributed limiter would be needed for consistent multi-replica enforcement.

## Local Docker Validation

Run the complete local checks:

```bash
pnpm test
pnpm typecheck
pnpm build
docker build -t vlatam-ai-lab-api:latest .
```

Start a local container with sample-only staging keys and a read-only export mount:

```bash
docker run -d -p 3000:3000 \
  -e AI_LAB_API_KEYS="staging-key-1,staging-key-2" \
  -e RATE_LIMIT_MAX=100 \
  -e RATE_LIMIT_WINDOW_MS=60000 \
  -v "$(pwd)/data/exports:/app/data/exports:ro" \
  --name vlatam-api-staging \
  vlatam-ai-lab-api:latest

sleep 5
API_KEY="staging-key-1" ./scripts/deployment-smoke-test.sh

docker stop vlatam-api-staging
docker rm vlatam-api-staging
```

The smoke test verifies the public health endpoint, fail-closed authentication, authenticated classifier access, missing-artifact handling, and path-traversal protection. `API_URL` defaults to `http://localhost:3000` and may be overridden for another approved local address.

These commands are local-only. Do not deploy this image or create external infrastructure without explicit human approval.

## Fly.io Staging Deployment

The repository includes `fly.toml.example` as a reference configuration with `primary_region = "gru"`. Copying it to `fly.toml`, creating an app or volume, setting secrets, and deploying all require separate human approval. None of those actions are part of local validation.

After that approval, follow this staging-only sequence:

1. Copy `fly.toml.example` to the uncommitted local file `fly.toml`; `.dockerignore` keeps it out of image builds.
2. Review the staging app name and São Paulo (`gru`) region.
3. Create and populate a staging volume with reviewed `data/exports/` artifacts only.
4. Add the approved volume mount shown below to `fly.toml`.
5. Configure API keys through Fly secrets and verify only the secret names are listed.
6. Route the completed configuration and key-rotation plan to human review.
7. Deploy only after receiving separate, explicit human approval.

With that approval, a staging operator would first create an approved volume and add this configuration to the uncommitted `fly.toml`:

```toml
[[mounts]]
  source = "vlatam_ai_lab_exports"
  destination = "/app/data/exports"
```

The volume must contain only reviewed `data/exports/` artifacts. The API remains read-only and must not write to the mount. Use a platform-supported read-only mount control when available; otherwise restrict the staging process and volume permissions so the application cannot mutate approved exports. Never mount `data/evidence/`, `data/intelligence/`, `data/raw/`, or `data/sources/`.

Configure API keys only through Fly secrets:

```bash
fly secrets set AI_LAB_API_KEYS="key1,key2"
fly secrets list
fly secrets set AI_LAB_API_KEYS="new-key-1,new-key-2"  # rotation
```

For zero-downtime key rotation, temporarily configure both the current and replacement keys, validate the replacement, update clients, and then remove the old key in a second secret update. Never put actual key values in `fly.toml`, shell history shared with others, documentation, logs, or committed files.

After explicit approval and infrastructure review, the staging operator would use:

```bash
fly deploy
fly status
fly logs
fly ssh console
```

Creating the Fly app, provisioning or populating the volume, setting secrets, and running any command above require separate human approval. This guide is documentation only and does not authorize an actual deployment.

## Security and Operations

- Serve only pre-reviewed export artifacts and perform no API writes.
- Mount only `data/exports/`, with read-only permissions wherever supported.
- Do not provide database, Supabase, Vercel, AI-provider, or production credentials.
- Keep API keys in an approved secret manager or protected runtime configuration.
- Restrict staging access at the platform/network layer and terminate TLS at the platform or an approved reverse proxy.
- Monitor `GET /health`, response latency, and HTTP error rates without logging credentials, artifact contents, or internal filesystem paths.

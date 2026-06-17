# API Server Deployment Guide

## Overview

This guide covers staging/internal deployment of the read-only vlatam-ai-lab API server. It does not authorize production deployment or external integrations.

## Prerequisites

- Docker
- Approved export artifacts in `data/exports/`
- Node.js 20+ and pnpm for local validation

## Local testing

Build and run the image:

```bash
docker build -t vlatam-ai-lab-api:latest .
docker run --rm -p 3000:3000 \
  -v "$(pwd)/data/exports:/app/data/exports:ro" \
  vlatam-ai-lab-api:latest
```

In another terminal:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/classifier/infoleg/artifact--infoleg--extraction-001
./scripts/deployment-smoke-test.sh
```

## Environment variables

| Variable    | Required | Default         | Description                               |
| ----------- | -------- | --------------- | ----------------------------------------- |
| `PORT`      | No       | `3000`          | HTTP server port                          |
| `DATA_ROOT` | No       | `process.cwd()` | Root directory containing `data/exports/` |
| `NODE_ENV`  | No       | development     | Runtime environment label                 |

## Platform-specific deployment

### Railway

1. Create a staging/internal project and connect this repository.
2. Deploy from the repository `Dockerfile`.
3. Set `PORT=3000` and `DATA_ROOT=/app`.
4. Provision approved export artifacts at `/app/data/exports`. If a volume is used, mount it read-only when the platform supports that mode.
5. Configure the health-check path as `/health`.

Do not attach production credentials, databases, or production services.

### Fly.io

After `fly launch`, use staging-only configuration equivalent to:

```toml
app = "vlatam-ai-lab-api-staging"

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "3000"
  DATA_ROOT = "/app"

[[services]]
  internal_port = 3000
  protocol = "tcp"

  [[services.ports]]
    handlers = ["http"]
    port = 80

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443

  [[services.http_checks]]
    path = "/health"
    method = "get"
    protocol = "http"
```

Any volume must expose only approved `data/exports/` content to the API. Creating the Fly application, volume, or deployment requires separate human approval and is outside this phase.

### Vercel

Vercel is not recommended for the current filesystem-backed server. Its serverless model does not provide the persistent read-only artifact mount assumed by this API.

Supporting Vercel would require converting the server to functions and moving artifacts to external storage. That would change the current architecture and introduce an external integration, so it is explicitly out of scope for Phase 10.

## Security and operations

- The API serves only pre-approved export artifacts and performs no writes.
- Mount only `data/exports/` and use read-only volume permissions where available.
- Do not mount `data/intelligence/`, `data/evidence/`, raw inputs, or governance metadata.
- Do not provide database, Supabase, Vercel, or AI-provider credentials.
- Restrict staging access at the platform/network layer and terminate TLS at the platform or an approved reverse proxy.
- Authentication and rate limiting remain future phases.
- Monitor `GET /health`, response latency, and HTTP error rates. Logs must not expose artifact contents, credentials, or filesystem paths.

## Validation

Local checks:

```bash
pnpm typecheck
pnpm test
pnpm build
docker build -t vlatam-ai-lab-api:latest .
```

Container validation:

```bash
docker run -d -p 3000:3000 \
  -v "$(pwd)/data/exports:/app/data/exports:ro" \
  --name vlatam-api \
  vlatam-ai-lab-api:latest
sleep 5
./scripts/deployment-smoke-test.sh
docker stop vlatam-api
docker rm vlatam-api
```

These commands are local-only. Do not deploy to Railway, Fly.io, Vercel, or any external service without explicit human approval.

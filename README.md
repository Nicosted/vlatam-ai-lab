# vlatam-ai-lab

`vlatam-ai-lab` is an experimental AI operations and regulatory intelligence sandbox for the **vLatamGlobal** initiative.

## Purpose

This repository exists to prototype and validate agentic workflows for:

- Regulatory source monitoring
- Snapshot capture and storage
- Delta analysis between source versions
- Evidence-first report generation
- Future classifier intelligence feed research

## What this lab is

- A **local-first**, auditable engineering workspace
- A **production-isolated** sandbox for experimentation
- A place to build small, testable, reversible components

## What this lab is not

- Not the vLatamGlobal production application
- Not connected to production infrastructure
- Not a place for production credentials, migrations, or deployments

## Current P0 goal: Regulatory Intelligence Lab

Initial objective: establish a minimal and safe foundation for regulatory intelligence workflows.

### First use case

**PCRAM bulletin / NCM monitoring** with a local placeholder pipeline:

1. Read local snapshot files from `snapshots/`
2. Compute a basic local delta summary
3. Write a markdown report into `reports/`

> No external fetches or service integrations are enabled in P0.

## Safe local workflow

1. Install dependencies: `pnpm install`
2. Validate types: `pnpm typecheck`
3. Run tests: `pnpm test`
4. Run placeholder pipeline: `pnpm pcram:delta`
5. Review generated report(s) under `reports/`

## Safety baseline

- Do not use production credentials.
- Do not connect this lab to Supabase, Vercel, or production databases.
- Do not run destructive commands.
- Keep changes minimal, explicit, and reviewable.
- Persistence boundary: `docs/ai-lab-persistence-boundary.md`.
- Approved export bundle consumer contract:
  `docs/approved-export-bundle-consumer-contract.md`.
- Argentina curated source pack plan:
  `docs/argentina-curated-source-pack-plan.md`.

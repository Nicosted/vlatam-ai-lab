# vlatam-ai-lab

Primary engineering handoff for the local classifier-intelligence pipeline and its reviewed HTTP export boundary.

## Purpose

`vlatam-ai-lab` is a repo-first, production-isolated sandbox for classifier intelligence. It implements the PCRAM chain through Phases 1–9: local source capture, immutable snapshots, delta analysis, evidence extraction, human review, clean export generation, and a read-only HTTP API for approved artifacts.

The project is local-first and auditable. The approved export/API path uses native Node.js capabilities with no external runtime dependencies, no Supabase or production database access, and no runtime coupling to `vlatam-global`.

## PCRAM chain

```text
Source → Snapshot → Delta → Evidence → Review → Export → API → Contract Docs
  1         2        3        4         5        6       9      10
```

Only reviewed and approved artifacts cross the export boundary. Internal governance and reviewer metadata remain inside AI Lab.

## Agents

| Stage | Name              | Input              | Output                 | Command                       |
| ----- | ----------------- | ------------------ | ---------------------- | ----------------------------- |
| 1     | Source Monitor    | External sources   | Snapshots              | `pnpm agents:source-monitor`  |
| 2     | Snapshot Writer   | Raw data           | Versioned snapshots    | `pnpm agents:snapshot-writer` |
| 3     | Delta Analyzer    | Snapshots          | Evidence packets       | `pnpm agents:delta-analyzer`  |
| 4     | AI Extraction     | Evidence           | Extraction results     | Fixture-based                 |
| 5     | Evidence Writer   | Extractions        | Intelligence artifacts | `pnpm agents:evidence-writer` |
| 6     | Human Review Gate | Artifacts          | Approved artifacts     | `pnpm agents:human-review`    |
| 7     | Export Contract   | Approved artifacts | Clean exports          | `pnpm agents:export-contract` |
| 8     | API Server        | Exports            | HTTP responses         | `pnpm agents:api-server`      |

## Quick start

Requires Node.js 22.5+ and pnpm.

```bash
# Install
pnpm install

# Run all tests
pnpm test

# Configure at least one staging API key and start the server
AI_LAB_API_KEYS="local-key-1,local-key-2" pnpm agents:api-server --port 3000

# Query the API
curl -H "x-vlatam-ai-lab-key: local-key-1" \
  http://localhost:3000/api/classifier/infoleg/artifact--infoleg--extraction-001
```

The API exposes `GET /api/classifier/:source_id/:artifact_id` and serves validated JSON exports from `data/exports/` without modifying them.
`GET /health` remains public. All endpoints are rate-limited per client IP.

API security environment variables:

| Variable               | Default | Purpose                                                            |
| ---------------------- | ------- | ------------------------------------------------------------------ |
| `AI_LAB_API_KEYS`      | none    | Preferred comma-separated list of valid API keys.                  |
| `AI_LAB_API_KEY`       | none    | Single-key fallback when `AI_LAB_API_KEYS` has no configured keys. |
| `RATE_LIMIT_WINDOW_MS` | `60000` | In-memory rate-limit window in milliseconds.                       |
| `RATE_LIMIT_MAX`       | `100`   | Maximum requests per IP in each window.                            |

If no API key is configured, classifier requests fail closed with `401
Unauthorized`. Keep key values out of source control and logs.

## `vlatam-global` consumer boundary

`vlatam-global` is an external, read-only consumer of the reviewed export contract.

Allowed:

- Read approved export artifacts through the HTTP API.
- Retain stable `export_id`, `artifact_id`, and `source_id` values for audit correlation.
- Consume reviewed `classification_candidate` and `extracted_evidence` fields.

Not allowed:

- Direct database or storage access.
- Runtime coupling with AI Lab.
- Dependency on internal governance flags.
- Access to reviewer identity, timestamps, or approval metadata.
- Create, update, delete, or other write operations.

Consumers must validate `schema_version`, fail closed on unsupported or invalid responses, and keep operational decisions and runtime audit records on the `vlatam-global` side.

## Current status

- ✅ 621 tests passing
- ✅ API-key authentication and in-memory per-IP rate limiting
- ✅ 0 external dependencies in the native HTTP API path
- ✅ Repo-first architecture
- ✅ Native Node HTTP API server
- ✅ E2E verified
- ✅ Integration contract documented
- ✅ AI-70 architecture, capability map, and capability catalog delivered
- ✅ AI-71 provider-neutral capability contracts delivered
- ✅ AI-72 multi-provider gateway with deterministic replay delivered
- ✅ AI-73 privacy and ZDR enforcement delivered
- ✅ AI-74 usage, cost, and budget governance delivered
- ✅ AI-75 capability evaluation framework delivered
- ✅ AI-76 regulatory Gold Cases v1 delivered
- ✅ AI-77 benchmark runner and profile ranking delivered
- ✅ AI-78 best-profile policy router delivered
- ✅ AI-79 reviewed routing decision handoff delivered
- ✅ AI-80 durable single-use authorization consumption store delivered
- ✅ AI-81 / AI-81.1 provider evidence and candidate profile readiness delivered
- ✅ AI-82 primary provider evidence review delivered (both candidates remain blocked)
- ⛔ AI-83 controlled adapter and live benchmark — gated; no work until every stated gate is satisfied
- ✅ AI-84 regulatory dossier evidence intake delivered
- ✅ Governed execution boundary enforced — every pre-AI-72 direct provider path (DeepSeek agents, extraction CLI, legacy Worker, Cloudflare AI Gateway wrapper, Workers AI embeddings) retired 2026-07-13; provider execution exists only through the MultiProviderGateway, guarded by a repository-wide boundary test

## Documentation

### Architecture and capability map (AI-70 / AI-71 / AI-72 / AI-73)

- [AI System Architecture](docs/architecture/ai-system-architecture.md) — target layered architecture and safety invariants.
- [AI Capability Map](docs/architecture/ai-capability-map.md) — current and planned capability inventory.
- [AI Roadmap Dependency Map](docs/architecture/ai-roadmap-dependency-map.md) — AI-70 through AI-84 sequence, delivery status, and gates.
- [Regulatory dossier lifecycle](docs/advisory/regulatory-dossier-lifecycle.md) — AI-84 intake, evidence, jurisdiction, readiness, and review boundaries.
- [Regulatory dossier operator guide](docs/advisory/regulatory-dossier-operator-guide.md) — client information required before research begins.
- [AI Capability Contracts (AI-71)](docs/architecture/ai-capability-contracts.md) — provider-neutral request, result, policy, and error envelopes plus the typed definition registry.
- [AI Multi-Provider Gateway (AI-72)](docs/architecture/ai-multi-provider-gateway.md) — explicit execution profiles, normalized adapters, deterministic replay, strict output validation, and safe audit metadata.
- [AI Privacy and ZDR Enforcement (AI-73)](docs/architecture/ai-privacy-zdr-enforcement.md) — data classification, deterministic redaction, retention compatibility, ZDR evidence verification, replay fixture provenance, and the gateway privacy gate.
- [AI Usage, Cost, and Budget Governance (AI-74)](docs/architecture/ai-usage-cost-budget-governance.md) — normalized usage, exact rational pricing, conservative accounting conversion, durable reservations, reconciliation, and metadata-only audits.
- [Continuous Runtime Tournament (AI-120)](docs/architecture/ai-continuous-runtime-tournament.md) — vendor-neutral runtime/gateway/model/endpoint contracts, daily evaluation, weekly human review, lifecycle, traffic, scoring and cost controls.
- [ADR-004: AI LAB Neutral Tournament Control Plane](docs/decisions/004-ai-lab-neutral-tournament-control-plane.md) — evaluated components cannot control scoring, evidence approval or promotion.
- [ADR-003: Capability-Oriented AI Execution](docs/decisions/003-capability-oriented-ai-execution.md) — vendor-neutral execution doctrine.
- [AI Capabilities Catalog](config/ai-capabilities.json) — declarative capability inventory.
- [AI Privacy Policy Catalog](config/ai-privacy-policies.json) — machine-readable privacy decisions per capability and classification.

### Reference

- [Technical & Security Audit — 2026-07-13](reports/ai-lab-technical-security-audit-2026-07-13.md)
- [vlatam-global API Contract](docs/integration/vlatam-global-api-contract.md)
- [Classifier Intelligence Artifact P1](docs/classifier-intelligence-artifact-p1.md)
- [Phase 6 Evidence Writer](docs/agents/evidence-writer.md)
- [Phase 7 Human Review Gate](docs/agents/human-review-gate.md)
- [Phase 8 Export Contract](docs/agents/export-contract.md)
- [Phase 9 API Server](docs/agents/api-server.md)

## Safety boundary

Use local fixtures and reviewed repository artifacts only. Do not add production credentials, connect to production services, run production migrations, or expose raw internal agent state through the API.

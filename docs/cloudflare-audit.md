# Cloudflare Infrastructure Audit

**Date:** 2026-06-15  
**Branch:** feat/cloudflare-pipeline-foundation  
**Wrangler version:** 4.100.0  
**Scope:** vlatam-ai-lab (Layer 1 — regulatory ingestion, validation, evidence extraction)

---

## 1. wrangler.toml Configuration

```toml
name = "vlatam-ai-lab-api"
main = "src/worker/index.ts"
compatibility_date = "2024-06-01"
compatibility_flags = ["nodejs_compat"]

[[kv_namespaces]]
binding = "NORMATIVE_KV"
id = "0dd29a9bcfcd4bf9b3e6dce6fb5fe5e9"
preview_id = "0dd29a9bcfcd4bf9b3e6dce6fb5fe5e9"

[vars]
ENVIRONMENT = "production"

[[vectorize]]
binding = "ARCA_EMBEDDINGS"
index_name = "arca-embeddings"

[[vectorize]]
binding = "INFOLEG_EMBEDDINGS"
index_name = "infoleg-embeddings"

[[vectorize]]
binding = "VUCE_EMBEDDINGS"
index_name = "vuce-embeddings"

[ai]
binding = "AI"
```

**Findings:**
- Single Worker entrypoint (`src/worker/index.ts`), Hono-based REST API
- `compatibility_date` is `2024-06-01` — current, no upgrade needed for Workflows
- `nodejs_compat` flag enabled — required for `crypto`, `path`, `fs` usage in scripts
- **No R2 bucket binding** — not yet provisioned
- **No Queue bindings** — not yet provisioned
- **No Workflow binding** — not yet provisioned
- **No AI Gateway configuration** — not yet configured
- Vectorize indexes declared but not yet created in CF account (creation is manual)
- DEEPSEEK_API_KEY stored as a Wrangler secret (not in file) ✅
- API_AUTH_TOKEN stored as a Wrangler secret ✅

---

## 2. Workers Entrypoint

**File:** `src/worker/index.ts`  
**Framework:** Hono v4.12.25  
**Bindings used:**
- `NORMATIVE_KV: KVNamespace` — rate-limit counters + normative data
- `DEEPSEEK_API_KEY: string` — LLM provider
- `API_AUTH_TOKEN?: string` — Bearer auth gate
- `AI: Ai` — Workers AI binding (embeddings)
- `ARCA_EMBEDDINGS: VectorizeIndex`
- `INFOLEG_EMBEDDINGS: VectorizeIndex`
- `VUCE_EMBEDDINGS: VectorizeIndex`

**Endpoints:**
- `GET /api/health` — version, timestamp
- `POST /api/v1/norms/query` — main normative query endpoint

**Security hardening present:**
- Fail-closed auth in production (no token → reject all)
- Per-IP KV rate limit (60 req/min)
- Request body size cap (10 KB)
- NCM format validation
- Internal error detail redaction (H-02)
- `human_review_required: true` enforced at API level
- `downstream_allowed: false` enforced at API level

---

## 3. KV Namespaces

| Binding | Namespace ID | Usage |
|---------|-------------|-------|
| `NORMATIVE_KV` | `0dd29a9bcfcd4bf9b3e6dce6fb5fe5e9` | Rate-limit counters, ARCA chapters, InfoLEG norms index, VUCE positions |

**KV key patterns (from `scripts/sync-kv.ts`):**
- `arca:chapter:{chapter}` — all tariff lines for a 2-digit chapter
- `arca:heading:{heading}` — fallback heading data
- `infoleg:index` — norm type index
- `infoleg:type:{type}` — norms by type
- `vuce:index` — VUCE positions index
- `vuce:position:{posKey}` — individual VUCE notes
- `ratelimit:{ip}` — rate limit counters (TTL 60s)

**Data volumes (from sync script comments):**
- ARCA: ~47,000 tariff positions across 97 chapters
- InfoLEG: ~2,658 norms
- VUCE: 3 manual positions

**Limitations:**
- KV has 25 MB per-value size limit — large chapters may need chunking
- No TTL on normative data — stale data risk if not re-synced
- Rate-limit keys stored in same namespace as normative data — could be separated for cleaner isolation

---

## 4. Vectorize Indexes

| Binding | Index Name | Dimensions | Metric |
|---------|-----------|-----------|--------|
| `ARCA_EMBEDDINGS` | `arca-embeddings` | 1024 | cosine |
| `INFOLEG_EMBEDDINGS` | `infoleg-embeddings` | 1024 | cosine |
| `VUCE_EMBEDDINGS` | `vuce-embeddings` | 1024 | cosine |

**Embedding model:** `@cf/baai/bge-m3` (Workers AI, free tier, multilingual)  
**Embedding scripts:** `scripts/generate-{arca,infoleg,vuce}-embeddings.ts`  
**Shared utility:** `scripts/fetch-with-retry.ts` (exponential backoff, 5 retries)

**Status:** Indexes declared in `wrangler.toml` but must be manually created with:
```bash
pnpm wrangler vectorize create arca-embeddings --dimensions=1024 --metric=cosine
pnpm wrangler vectorize create infoleg-embeddings --dimensions=1024 --metric=cosine
pnpm wrangler vectorize create vuce-embeddings --dimensions=1024 --metric=cosine
```

**RAG integration:**
- `RouterAgent` has hybrid retrieval: exact KV match first, Vectorize fallback if no match
- Vectorize query: `topK=5`, `returnMetadata='all'`

---

## 5. Embedding Scripts

| Script | Source | Batch Size | Delay | Vectorize Index |
|--------|--------|-----------|-------|----------------|
| `generate-arca-embeddings.ts` | `data/parsed/arca/*.json` | 20 | 3s | `arca-embeddings` |
| `generate-infoleg-embeddings.ts` | `data/parsed/infoleg/customs-relevant-norms.json` | 20 | 3s | `infoleg-embeddings` |
| `generate-vuce-embeddings.ts` | `data/parsed/vuce/vuce-notes-*.json` | 20 | 3s | `vuce-embeddings` |

**Rate limit handling:** `fetchWithRetry` with exponential backoff for 429 + network errors  
**Execution:** Local `tsx` scripts, not Workers — use REST API, not AI binding

---

## 6. Source Code Structure

```
src/
  worker/index.ts          # Hono Worker entrypoint
  agents/
    router-agent.ts        # Orchestrator with RAG fallback
    arca-agent.ts          # ARCA tariff specialist
    infoleg-agent.ts       # InfoLEG norms specialist
    vuce-agent.ts          # VUCE interventions specialist
    critic-agent.ts        # Claim validation
    normative-evidence-agent.ts  # (legacy/refactor target)
    types.ts               # AgentContext, AgentResult, FinalResponse
  utils/
    embedding-service.ts   # Workers AI embedding (dual: binding + REST)
    schema-validator.ts    # AJV schema validation utility
  adapters/
    types.ts               # Multi-country adapter types (scaffold)
  config.ts                # APP_VERSION
  crawlers/                # Data acquisition scripts (local only)
```

---

## 7. Schemas

21 JSON Schema files covering:

| Schema | Purpose |
|--------|---------|
| `intelligence-source-registry.schema.json` | Registered regulatory sources |
| `intelligence-source-snapshot.schema.json` | Gated capture events |
| `extractable-evidence-packet.schema.json` | AI-ready evidence bundles |
| `ai-extraction-job.schema.json` | Extraction job configuration |
| `ai-extraction-result.schema.json` | Draft extraction output |
| `classifier-intelligence-artifact.schema.json` | Classifier-ready artifacts |
| `review-manifest.schema.json` | Human review gate records |
| `approved-artifact.schema.json` | Approved downstream artifacts |
| `classifier-approved-artifact-export-catalog.schema.json` | Export catalog |
| `classifier-approved-artifact-export-contract.schema.json` | Export contract |

**Governance invariants enforced via `allOf`/`if/then` constraints:**
- `downstream_allowed: true` requires `review_status: "approved"` + `human_review_required: true`
- `extraction_allowed: true` requires at least one content reference
- `human_review_required: true` is `const: true` in extraction results — cannot be false

**Missing pipeline linkage fields (to be added in Phase 3):**
- No `storageLocation` (R2) on snapshots
- No `workflowRunId` on snapshots or review manifests
- No `queueJobId` on evidence packets
- No `aiGatewayTraceId` on extraction results

---

## 8. Test Coverage

**Current:** No test files (`tests/` directory does not exist)  
**Validation scripts (manual):**
- `scripts/validate-packet.ts` — validates evidence packet against schema
- `scripts/validate-extraction.ts` — validates extraction result against schema
- `scripts/validate-test.ts` — runs schema validation tests

**Gap:** All new infrastructure code in this PR needs unit tests with mocked Cloudflare services.

---

## 9. Wrangler Capabilities Verified (v4.100.0)

| Feature | Available | Notes |
|---------|-----------|-------|
| KV Namespaces | ✅ | In production use |
| Vectorize | ✅ | Configured, indexes pending creation |
| Workers AI | ✅ | Bound as `AI` |
| R2 Buckets | ✅ | `wrangler r2 bucket` supported |
| Queues | ✅ | `wrangler queues` supported, producer/consumer model |
| Workflows | ✅ | `wrangler workflows` supported (Durable Execution) |
| AI Gateway | ✅ | Configured via `[ai_gateway]` in wrangler.toml |
| Durable Objects | ✅ (future) | Not needed in this PR |
| D1 | ✅ (future) | Not needed in this PR |

---

## 10. Gaps and Risks

| Gap | Risk | Mitigation |
|-----|------|-----------|
| No R2 for document storage | Regulatory PDFs not durably stored | Add R2 binding + storage interface |
| No Queues for async jobs | Embedding/parsing is synchronous, fragile | Add Queue bindings + consumer skeleton |
| No Workflows for pipeline | No durable execution, no resume-on-failure | Add Workflow definition + step stubs |
| No AI Gateway | No observability, no fallback, no cost tracking | Add AI Gateway configuration |
| No test suite | Regressions undetectable | Add tests directory with mocked unit tests |
| APP_VERSION stale (`0.5.5`) | Incorrect health endpoint version | Update `src/config.ts` |
| No feature flags | New code runs unconditionally | Gate all new behavior behind `CLOUDFLARE_PIPELINE_V1_ENABLED` |

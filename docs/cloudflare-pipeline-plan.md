# Cloudflare Regulatory Intelligence Pipeline Plan

> **RETIRED (2026-07-13).** The Worker, queues, embedding consumer, and AI
> Gateway wrapper this plan builds on were removed by the
> governed-execution-boundary PR. Retained as historical planning
> documentation only.

**Date:** 2026-06-15  
**Version:** v1 (foundation)  
**Scope:** vlatam-ai-lab — Layer 1 (ingestion, validation, evidence extraction, review artifacts)  
**Status:** Implementation in progress on `feat/cloudflare-pipeline-foundation`

---

## Architecture Principles

1. **Repo-first** — all artifacts are files committed to git, not live DB state
2. **Deterministic artifacts** — same input → same output, no hidden side effects
3. **Human review gates** — `human_review_required: true` and `downstream_allowed: false` are the defaults; relaxing requires explicit approval
4. **Fail-closed** — missing config or failed validation blocks progress, never permits it
5. **No Layer 2/3 coupling** — vlatam-global and vtrade-intelligence-brain are not referenced
6. **Feature-flagged** — all new runtime behavior is gated behind `CLOUDFLARE_PIPELINE_V1_ENABLED`

---

## Pipeline Overview

```
Source Monitor
     │
     ▼ (detects change)
Snapshot Writer  ──────────────────► R2: regulatory-documents/{source_id}/{snapshot_id}
     │
     ▼ (writes intelligence-source-snapshot)
Delta Analyzer   ──────────────────► R2: snapshots/{source_id}/delta-{snapshot_id}.json
     │
     ▼ (enqueues embedding job)
Queue: parsing-queue / embedding-queue
     │
     ▼ (embedding consumer Worker)
Evidence Writer  ──────────────────► extractable-evidence-packet artifact
     │
     ▼ (pause — Workflow step: humanReviewGate)
Human Review Gate ─── PAUSED ───────► awaits reviewer action
     │
     ▼ (on approval)
Review Manifest written ────────────► review-manifest artifact
```

Each step is a **Cloudflare Workflow step** with its own retry policy and timeout. The pipeline is durable — if a Worker restarts mid-step, the Workflow resumes from the last completed step.

---

## Component 1: Cloudflare Workflows

**Purpose:** Durable execution of the PCRAM pipeline. Replaces fragile one-shot scripts.

**Workflow name:** `pcram-pipeline`

**Steps:**

| Step | Name | Responsibility | Output Artifact |
|------|------|---------------|----------------|
| 1 | `sourceMonitorStep` | Detect regulatory source changes | snapshot trigger |
| 2 | `snapshotWriterStep` | Write `intelligence-source-snapshot` to R2 | `intelligence-source-snapshot` |
| 3 | `deltaAnalyzerStep` | Diff new snapshot against previous | delta JSON |
| 4 | `evidenceWriterStep` | Build `extractable-evidence-packet` | `extractable-evidence-packet` |
| 5 | `humanReviewGateStep` | Pause workflow, await human approval | `review-manifest` |

**Retry policy:** All steps — 3 retries, exponential backoff (2s, 4s, 8s), timeout 30s per step  
**Human gate:** `humanReviewGateStep` calls `step.sleep()` indefinitely until a separate API call resumes it

**wrangler.toml binding:**
```toml
[[workflows]]
name = "pcram-pipeline"
binding = "PCRAM_WORKFLOW"
class_name = "PCRAMPipeline"
```

**File:** `src/workflows/pcram-workflow.ts`

---

## Component 2: Cloudflare Queues

**Purpose:** Async, durable job dispatch for embedding generation and document parsing. Decouples ingestion from processing.

**Queues:**

| Queue | Producer | Consumer | Job type |
|-------|---------|---------|---------|
| `embedding-queue` | `snapshotWriterStep` | `embedding-consumer` Worker | `EmbeddingJob` |
| `parsing-queue` | `snapshotWriterStep` | (future) `parsing-consumer` Worker | `ParsingJob` |

**wrangler.toml binding:**
```toml
[[queues.producers]]
queue = "embedding-queue"
binding = "EMBEDDING_QUEUE"

[[queues.producers]]
queue = "parsing-queue"
binding = "PARSING_QUEUE"
```

**Consumer Worker (separate `wrangler.toml` entry or `[[queues.consumers]]`):**
```toml
[[queues.consumers]]
queue = "embedding-queue"
max_batch_size = 20
max_batch_timeout = 5
```

**File:** `src/queues/queue-interfaces.ts`, `src/workers/embedding-consumer.ts`

---

## Component 3: Cloudflare R2

**Purpose:** Durable object storage for original regulatory documents, snapshots, and pipeline artifacts. Replaces local `snapshots/` and `data/` directories for production use.

**Bucket:** `regulatory-documents`

**Key schema:**
```
regulatory-documents/
  sources/{source_id}/original/{filename}      # Original downloaded files
  snapshots/{source_id}/{snapshot_id}.json     # Snapshot records
  snapshots/{source_id}/delta-{snapshot_id}.json  # Delta analysis
  evidence/{evidence_packet_id}.json           # Evidence packets
  manifests/{review_manifest_id}.json          # Review manifests
```

**wrangler.toml binding:**
```toml
[[r2_buckets]]
binding = "REGULATORY_DOCS"
bucket_name = "regulatory-documents"
preview_bucket_name = "regulatory-documents-preview"
```

**File:** `src/storage/r2-storage.ts`, `examples/r2-storage-example.ts`

---

## Component 4: AI Gateway

**Purpose:** Observability, rate limiting, model fallback, and cost tracking for all AI provider calls. Wraps DeepSeek (and future models) without changing the Agent interface.

**Gateway ID:** `vlatam-ai-lab-gateway` (to be created in CF dashboard)

**Features used:**
- Request/response logging
- Per-model rate limits
- Fallback chain: `deepseek-chat` → `@cf/meta/llama-3.1-8b-instruct` (Workers AI)
- Cost tracking per model
- Cache (for repeated identical prompts, TTL 3600s)

**wrangler.toml configuration:**
```toml
[ai_gateway]
id = "vlatam-ai-lab-gateway"
```

**File:** `src/ai/ai-gateway.ts`

---

## Future Architecture Patterns (Not This PR)

### Durable Objects
- Stateful agent sessions
- Long-running review workflows with real-time updates
- Required when: streaming review UI is built

### D1 (SQLite)
- Metadata indexing for fast faceted queries
- Alternative to KV for structured normative data
- Required when: query patterns become too complex for KV prefix scans

### Browser Run (Cloudflare Browser Rendering)
- Controlled source acquisition from JS-rendered regulatory sites
- Required when: source acquisition moves out of manual scripts

### Agent Memory
- Classification pattern memory across runs
- Required when: PCRAM Classifier Layer is implemented

---

## Implementation Phases

### Phase 1 (this PR): Foundation ✅
- Infrastructure audit → `docs/cloudflare-audit.md`
- Pipeline plan → `docs/cloudflare-pipeline-plan.md`
- R2 interface + binding
- Queue interfaces + consumer skeleton
- AI Gateway wrapper
- Workflow definitions + step stubs
- Schema updates (pipeline linkage fields)
- Unit tests (all mocked)

### Phase 2 (follow-up PR 2): Workflow Execution
- Live Workflow registration with CF account
- Real step implementations (non-stub)
- Integration with existing Router Agent

### Phase 3 (follow-up PR 3): Queue Consumers
- Embedding consumer Worker deployment
- Parsing consumer skeleton
- Dead-letter queue handling

### Phase 4 (follow-up PR 4): R2 Integration
- Source Monitor writes to R2
- Snapshot Writer reads from R2
- KV replaced by R2 for large objects

### Phase 5 (follow-up PR 5): AI Gateway Integration
- All LLM calls routed through AI Gateway
- Fallback chain active
- Cost dashboard in CF dashboard

---

## Wrangler Commands Reference

```bash
# Create R2 bucket
pnpm wrangler r2 bucket create regulatory-documents

# Create Queues
pnpm wrangler queues create embedding-queue
pnpm wrangler queues create parsing-queue

# Create Vectorize indexes (if not done)
pnpm wrangler vectorize create arca-embeddings --dimensions=1024 --metric=cosine
pnpm wrangler vectorize create infoleg-embeddings --dimensions=1024 --metric=cosine
pnpm wrangler vectorize create vuce-embeddings --dimensions=1024 --metric=cosine

# Deploy Worker
pnpm wrangler deploy

# Trigger a Workflow instance
pnpm wrangler workflows trigger pcram-pipeline '{"sourceId":"arca-ar-official"}'

# List Workflow instances
pnpm wrangler workflows instances list pcram-pipeline

# Monitor queue
pnpm wrangler queues info embedding-queue

# Tail Worker logs
pnpm wrangler tail
```

---

## Feature Flag

All new pipeline runtime behavior is gated behind:

```toml
[vars]
CLOUDFLARE_PIPELINE_V1_ENABLED = "false"  # Set to "true" to activate pipeline
```

Code pattern:
```typescript
if (env.CLOUDFLARE_PIPELINE_V1_ENABLED !== 'true') {
  // fall through to existing behavior
  return;
}
// new pipeline logic here
```

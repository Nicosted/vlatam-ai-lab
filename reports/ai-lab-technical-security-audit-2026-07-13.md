# AI Lab Technical, Security, Architecture, and Operational Audit — 2026-07-13

## 1. Executive summary

This audit reviewed `Nicosted/vlatam-ai-lab` at commit `e610e2a` (main, clean tree) across security, architecture, privacy/ZDR, governance, contracts, human-review safety, persistence, dependencies, tests, performance, hygiene, and operational readiness.

Overall posture: **strong on the governed path, drifted on the legacy path.** The AI-71 → AI-84 governed stack (capability contracts, MultiProviderGateway, privacy enforcer, budget governance, routing handoff, durable authorization consumption, export boundary) is consistently fail-closed, deterministic, metadata-only in audits, and well tested (618 tests, 0 failures, ~2 s, no network access, no skips). No committed credentials were found in the working tree or in git history. No live provider call was made during this audit.

The principal issues are:

1. A cluster of **legacy direct-provider execution paths** (DeepSeek agents, the Cloudflare Worker query endpoint, extraction/embedding scripts, and the Cloudflare AI Gateway wrapper) that bypass the MultiProviderGateway and its privacy/budget governance. They are credential-gated and inert without env keys, but they are architectural drift and carry all 115 lint errors.
2. A **schema/runtime validation gap at the export boundary**: the JSON Schema declares `additionalProperties: false`, but the runtime validator used by the API server accepts unknown fields, so a tampered or mis-written export file could leak forbidden metadata to the external consumer.
3. A **fail-open auth branch** in the legacy Worker when no token is configured outside production.
4. **Documentation drift** in README (test counts, delivered-scope, Node version) and repository hygiene gaps (`.gitignore` missing SQLite/graphify/worktree artifacts, stale merged remote branches).

Finding counts: 0 CRITICAL, 1 HIGH, 4 MEDIUM, 9 LOW, 10 INFORMATIONAL.

## 2. Repository baseline

- Repository: `Nicosted/vlatam-ai-lab` (`origin` = github.com/Nicosted/vlatam-ai-lab.git)
- Baseline commit: `e610e2abdd7c2704391dc87dffe301ef1b4bc4d4` (main, fast-forwarded, clean working tree)
- 600 tracked files; pnpm workspace, TypeScript, Node >= 22.5 (package.json engines)
- Baseline validation at this commit:
  - `pnpm test`: **618 pass / 0 fail / 0 skipped**, 123 suites, ~2.0 s
  - `pnpm typecheck`: pass
  - `pnpm build`: pass
  - `pnpm lint`: **115 errors** (pre-existing; entirely in legacy subsystems — see §12)
  - `pnpm format`: **263 files** not Prettier-compliant (pre-existing baseline debt)
  - `git diff --check`: clean

## 3. Architecture map

Governed core (current, invariant-bearing):

```
CapabilityRequest ──▶ MultiProviderGateway (src/execution/multi-provider-gateway.ts)
   1. request schema validation (fail closed)
   2. explicit execution profile resolution (config/ai-execution-profiles.json)
   3. PrivacyEnforcer (src/privacy/*) — classification, policy, ZDR evidence,
      retention, replay provenance, deterministic redaction — all fail closed
   4. BudgetEnforcer (src/governance/*) — pricing resolution, BigInt cost,
      reservation before execution, reconcile/release on completion/failure
   5. ProviderAdapterRegistry → ReplayProviderAdapter | OpenAICompatibleAdapter
      (live adapters double-gated by AI_LAB_LIVE_PROVIDER_EXECUTION_ENABLED
      + per-provider flag + credential env; all profiles disabled in config)
   6. output parsing + result schema validation; every result carries
      human_review_required: true, downstream_allowed: false
Routing: policy-router (AI-78) → reviewed handoff (AI-79) → durable single-use
authorization consumption (AI-80, node:sqlite, DDL-hash verified)
Export: human-review-gate → export-contract → read-only HTTP API
(src/server/api-server.ts) → vlatam-global (external read-only consumer)
```

Legacy periphery (pre-AI-72, outside governance): direct DeepSeek agents (`src/agents/*-agent.ts`), Cloudflare Worker (`src/worker/index.ts` + `wrangler.toml`), Cloudflare AI Gateway wrapper (`src/ai/ai-gateway.ts`), Workers AI embeddings (`src/utils/embedding-service.ts`, `scripts/generate-*-embeddings.ts`), crawlers (`src/crawlers/*`), and `scripts/run-extraction.ts` / `scripts/sync-kv.ts`. See §5.

## 4. Security posture

Verified clean:

- **No committed credentials**: pattern scan (OpenAI/DeepSeek `sk-`, AWS `AKIA`, GitHub `ghp_`, Slack `xox`, private-key blocks, bearer tokens) over all tracked files returned nothing; `.env` was never added in any commit (`git log --all --diff-filter=A -- .env` empty); only `.env.example` with an obvious placeholder is tracked.
- **Path traversal at the API**: `source_id`/`artifact_id` are regex-constrained (`^[a-z0-9_-]+$`, `^artifact--…$`) and the resolved path is re-checked with `path.relative` against the exports root (src/server/api-server.ts:209-217). Negative fixtures exist (`invalid-approved-artifact-read-request-path-traversal.json`).
- **Auth fails closed on the current API**: with no `AI_LAB_API_KEYS`/`AI_LAB_API_KEY` configured, `validateApiKey` returns false (src/server/api-server.ts:64-82).
- **SQL injection**: all authorization-store statements are parameterized; identifiers are regex-validated before use.
- **Error sanitation on the governed path**: `sanitizeProviderError` strips provider errors; privacy audits are metadata-only; a negative fixture rejects payload-bearing privacy audits.
- **No unbounded provider retry loops** on the governed path (`maxRetries: 0` in the OpenAI-compatible adapter; single attempt with AbortController timeout).

Findings (full table format: ID / category / severity / confidence / files / evidence / scenario / remediation / safe-now / PR):

### SEC-01 — Export boundary accepts unknown fields (schema/runtime drift)

- Category: security / contract integrity. Severity: **MEDIUM**. Confidence: **CONFIRMED**.
- Files: `src/contracts/vlatam-global-bridge.ts` (`validateExportArtifact`, lines 347-391), `src/server/api-server.ts:236-244`, `schemas/classifier-approved-artifact-export.schema.json`.
- Evidence: the JSON Schema declares `additionalProperties: false`, but the runtime validator only checks known fields and then returns the original parsed object, which the server serialises verbatim.
- Failure scenario: an export file in `data/exports/` containing extra keys (e.g. `reviewer`, `provider_id`, `approved_at`) — via manual edit, tooling bug, or future writer regression — passes validation and is served to `vlatam-global`, violating invariant 6. The current export writer constructs a clean object, so this is a defense-in-depth gap, not an active leak.
- Remediation: reject unknown top-level and nested keys in `validateExportArtifact` (mirroring the declared schema) + regression test with a `reviewer`-bearing artifact.
- Safe to fix now: **yes** (tightens runtime behavior to the already-declared schema). Proposed PR: **Cleanup D**.

### SEC-02 — Legacy Worker authentication fails open without a configured token

- Category: security / fail-open. Severity: **MEDIUM**. Confidence: **CONFIRMED**.
- Files: `src/worker/index.ts:58-79` (`if (!expectedToken) return true;` when `ENVIRONMENT !== 'production'`).
- Failure scenario: if the legacy Worker were deployed to any non-production environment without `API_AUTH_TOKEN`, `/api/v1/norms/query` is open to anyone and triggers direct DeepSeek execution — violating invariants 4 and 5 simultaneously. Mitigations: `wrangler.toml` sets `ENVIRONMENT = "production"` (fail-closed there), and deployment is not authorized; not reachable in this repo's local flows.
- Remediation: retire the Worker path or make missing-token unconditionally fail-closed. Not fixed in this audit: changing legacy runtime semantics is a retirement decision (see §5 recommendations).
- Safe to fix now: no (bundled with the Worker retirement decision). Proposed PR: dedicated legacy-retirement PR after human decision.

### SEC-03 — Non-constant-time API key comparison

- Category: security / side channel. Severity: **LOW**. Confidence: **CONFIRMED**.
- Files: `src/server/api-server.ts:77-81` (`validKeys.includes(apiKey)`, `apiKey === singleKey`); also `src/worker/index.ts:78` (legacy).
- Failure scenario: theoretical remote timing side channel against key comparison. Practical exploitability over a network against V8 string compare is very low; staging-only service.
- Remediation: compare with `crypto.timingSafeEqual` over hashed buffers in the Node API server.
- Safe to fix now: **yes** (+ regression test). Proposed PR: **Cleanup D**.

### SEC-04 — Legacy Worker body-size limit trusts Content-Length

- Category: security / resource exhaustion. Severity: **LOW**. Confidence: **CONFIRMED**.
- Files: `src/worker/index.ts:82-93`.
- Failure scenario: a request omitting or under-stating `Content-Length` bypasses the 10 KB check; `c.req.json()` then parses an arbitrarily large body (bounded in practice by Workers platform limits).
- Remediation: enforce a byte cap while reading the stream, or rely on platform limits and document it. Legacy path — fold into Worker retirement.

### SEC-05 — Legacy Worker KV rate limiter has a read-modify-write race

- Category: security / rate limiting. Severity: **LOW**. Confidence: **CONFIRMED**.
- Files: `src/worker/index.ts:46-55`.
- Failure scenario: concurrent requests read the same counter and each write `count + 1`; the effective limit can be exceeded by the concurrency factor. KV is eventually consistent, compounding this. Legacy path — fold into Worker retirement.

### SEC-06 — Node API rate limiting keyed on socket address only

- Category: security / IP handling. Severity: **INFORMATIONAL**. Confidence: CONFIRMED.
- Files: `src/server/api-server.ts:135`.
- Behind any proxy (Fly, Docker networks) all clients share the proxy's address, so one noisy client can exhaust the shared bucket (self-DoS of legitimate consumers), while direct exposure would be fine. `X-Forwarded-For` is (correctly) not trusted; if proxied deployment ever happens, a trusted-proxy configuration is needed. No change now (no deployment authorized).

### SEC-07 — Missing hardening response headers on the Node API

- Category: security / headers. Severity: **LOW**. Confidence: CONFIRMED.
- Files: `src/server/api-server.ts:45-53`.
- No `X-Content-Type-Options: nosniff` or `Cache-Control: no-store` on JSON responses (the artifact endpoint serves reviewed data; caching semantics should be explicit).
- Safe to fix now: **yes** (additive headers, regression-tested). Proposed PR: **Cleanup D**.

### SEC-08 — SQLite store surfaces raw driver error strings

- Category: security / error sanitation. Severity: **INFORMATIONAL**. Confidence: CONFIRMED.
- Files: `src/handoff/authorization-store.ts:421-435`.
- `inspect`/`listRecent` failures return `error.message` from `node:sqlite`. Messages are generic in practice ("database is locked", "unable to open database file") and results are operator-facing (CLI), not exported; acceptable, but mapping to fixed reason strings would be tighter.

### SEC-09 — SQLite database file permissions not restricted

- Category: security / durability. Severity: **INFORMATIONAL**. Confidence: CONFIRMED.
- Files: `src/handoff/authorization-store.ts:301-311`.
- The DB and WAL files are created with default umask. Local single-user store; note only.

Also verified: no command injection (no `child_process`/`exec` outside the test harness in `scripts/authorization-store.ts`, which spawns only its own script with fixed arguments); no SSRF surface on the API (no outbound fetch from request data); no `eval`/`Function` construction; JSON parsing is guarded by try/catch everywhere it handles external data; no prototype-pollution sinks found (no deep-merge of untrusted input; validators use `Object.keys` allowlists); no ReDoS-prone regexes (all anchored character classes with bounded quantifiers).

## 5. Provider execution inventory

Every located provider/model execution path, classified:

| #   | Path                                                                                                                        | Classification                                           | Gating                                                                                              | Recommendation                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | `src/providers/replay-adapter.ts`                                                                                           | Governed (replay-only)                                   | Fixture provenance enforced by privacy gate                                                         | Retain                                                                                             |
| 2   | `src/providers/openai-compatible-adapter.ts` (DeepSeek, DashScope factories)                                                | Governed (live, disabled)                                | Double env flag + credential + all profiles `enabled: false` in `config/ai-execution-profiles.json` | Retain                                                                                             |
| 3   | OpenRouter / MiniMax Direct candidates (`config/ai-candidate-profile-readiness.json`)                                       | Disabled candidate                                       | No adapter registered; readiness `enabled: false`; AI-83 gated                                      | Retain blocked (invariant 9)                                                                       |
| 4   | `src/agents/arca-agent.ts`, `infoleg-agent.ts`, `vuce-agent.ts`, `critic-agent.ts`, `router-agent.ts`                       | **Legacy direct path** (raw `fetch` to api.deepseek.com) | `DEEPSEEK_API_KEY` env only; no privacy/budget governance                                           | **Retire or migrate** behind gateway; until then mark deprecated                                   |
| 5   | `src/agents/normative-evidence-agent.ts` + `scripts/run-extraction.ts` (`pnpm ai:extract`)                                  | Legacy direct path (OpenAI SDK → DeepSeek)               | env key only                                                                                        | Retire or migrate                                                                                  |
| 6   | `src/worker/index.ts` `/api/v1/norms/query` → RouterAgent                                                                   | Legacy direct path (Cloudflare Worker)                   | Worker secret; SEC-02 fail-open branch                                                              | Retire (preferred) or harden + gateway-migrate                                                     |
| 7   | `src/ai/ai-gateway.ts` (Cloudflare AI Gateway wrapper)                                                                      | Legacy/spike, flag-gated                                 | `CLOUDFLARE_PIPELINE_V1_ENABLED` (false in wrangler.toml); pass-through no-op when disabled         | Retire or fold into a governed adapter                                                             |
| 8   | `src/utils/embedding-service.ts`, `src/workers/embedding-consumer.ts`, `scripts/generate-{arca,infoleg,vuce}-embeddings.ts` | Legacy direct path (Workers AI bge-m3, Vectorize)        | `CLOUDFLARE_API_TOKEN` env                                                                          | Non-LLM inference; still outside gateway — classify under a future embeddings capability or retire |
| 9   | `snapshots/qwen/recorded-responses/*` + Qwen/LangGraph spike (docs)                                                         | Documentation/replay fixture only                        | Sanitized recorded fixture, README'd                                                                | Retain                                                                                             |
| 10  | `scripts/sync-kv.ts`                                                                                                        | Non-model network script (Cloudflare KV REST)            | env token                                                                                           | Retain or retire with Worker                                                                       |
| 11  | `src/crawlers/*`                                                                                                            | Source acquisition (non-model network)                   | Public regulator URLs                                                                               | Retain; see §9 for evidence-integrity gaps                                                         |
| 12  | Tests                                                                                                                       | Test-only                                                | No network calls found in `tests/`                                                                  | Retain                                                                                             |

**ARCH-01** — Category: architecture drift. Severity: **HIGH** (as drift; not an active security breach — every legacy path is inert without local env credentials and none runs in tests). Confidence: CONFIRMED. Rows 4-8 violate invariant 5 (domain workflows calling provider SDKs/HTTP directly) and receive none of the privacy, budget, or audit guarantees. Recommendation: a human decision on retire-vs-migrate per row; none of it was changed in this audit because removal is not trivially provable safe (package.json scripts and the Worker reference these paths).

No live provider call occurred during this audit; no `.env` keys were read or used.

## 6. Data and privacy posture

Verified against `src/privacy/*` and `tests/privacy/*` (86 privacy-focused tests):

- **Classification fails closed**: `resolveRequestClassification` rejects missing/unknown classifications; the gateway blocks before adapter lookup (multi-provider-gateway.ts:73-76).
- **Redaction runs pre-provider**, coverage of capability `redact_fields` is validated before rules run, and the cleared request is the only thing mapped to the adapter. Hashing is explicitly documented as **pseudonymization, not anonymization** (src/privacy/redaction.ts:12-15) with a stable domain separator.
- **ZDR declarations are never evidence**: `declared_unverified`/`unknown` always block; `verified` requires an evidence record matched on profile, capability, classification, retention, region, and training-use, and expiry is checked against the injected clock. Negative fixtures cover expired/mismatched/false declarations.
- **Processing region and training use** are enforced through the ZDR evidence evaluation; retention is the intersection of classification model, capability class, and policy entry, with `forbidden` matching nothing.
- **Replay provenance**: replay mode or `bounded_local_fixture` retention requires declared origin + sanitization; unsanitized/unknown fail closed (`REPLAY_FIXTURE_UNSAFE`).
- **Regulated/restricted data cannot reach candidates**: candidate profiles are disabled; profile declarations require explicit `regulated_data_permitted`/`restricted_data_permitted`; max-classification rank comparison forbids upgrade.
- **Fixture PII scan**: no email addresses, personal identifiers, or credential-shaped values found in tracked `data/`, `snapshots/`, `exports/`, or `config/` JSON. The only identifier-like matches live in gitignored raw regulator CSVs (public government data, untracked). Client-fact fixtures use synthetic company scenarios.

Gap noted (PRIV-01, INFORMATIONAL, CONFIRMED): privacy enforcement exists only inside the gateway; legacy paths (§5 rows 4-8) send raw prompt content to DeepSeek with no classification or redaction if ever run with credentials. Subsumed by ARCH-01.

## 7. Contract and schema integrity

- 66 schema files; **no duplicate `$id`s**; all `schema_version` fields semver-shaped; invalid-fixture suites exist for every major contract (100+ negative snapshots), including reviewer-leak, credential-shaped-field, path-traversal, and downstream-without-review cases.
- `schemas/schema-registry.json` cross-check: every referenced schema/fixture/test file exists. **17 schema files are not listed in the registry** (older PCRAM-era and internal-result schemas, e.g. `pcram-*.schema.json`, `ai-evaluation-observation`, `workflow-run`). The registry appears intentionally scoped to reviewed "contracts"; this scope is not documented. (SCHEMA-01, LOW, NEEDS_VALIDATION — document the registry's scope or complete it; Cleanup A can document, completing it needs review.)
- **SEC-01** (§4) is the one confirmed runtime/schema strictness divergence found at the export boundary. Spot-checks of other hot paths show runtime validators that do enforce unknown-key rejection (`validateAuthorizationConsumptionBinding` uses an explicit key allowlist; capability request/result validation is AJV-backed against `additionalProperties: false` schemas).
- Capability catalog: `config/ai-capabilities.json` and `src/capabilities/registry.ts` agree; legacy capabilities (`provider.execution.deepseek_direct`, `qwen_dashscope_runtime`) are registered with null contracts and marked legacy — consistent with the migration story. No duplicate capability IDs.
- Approved classifier and regulatory dossier boundaries are separate schemas/flows; dossier intake (`regulatory-dossier-intake.schema.json`) is explicitly "research intake only; never … approved artifact or export" and its readiness result forbids provider and reviewer fields via negative fixtures.

## 8. Human-review and approval safety

Verified:

- Every gateway result — success or failure — carries `governance: { human_review_required: true, downstream_allowed: false, approval_state: 'pending' }` (multi-provider-gateway.ts:44; normative-claims-mapper); tests assert a provider result can never set `downstream_allowed: true`, and `capability-result-invalid-blocked-downstream-allowed.json` is rejected at the schema level.
- Evaluation scores and routing decisions produce decisions/reports, not approvals; the AI-79 handoff validates a reviewed authorization (policy hash, decision hash, expiry, reviewer role) and AI-80 makes single-use consumption durable with binding-conflict detection (`sameBinding` compares all binding fields; `superseded_by` blocks reuse; rejected/expired decisions cannot be consumed — covered by `invalid-authorization.json` and concurrency tests, including a multi-process SQLite race harness).
- Handoff decisions are hash-bound: `decision_hash` is recomputed over the canonicalised decision and must match (reviewed-routing-handoff.ts:292), and profile version mismatch is a rejection scenario.
- Reviewer identity is exportable nowhere: the export type has no reviewer field, the export writer constructs a clean allowlisted object, and `capability-result-invalid-reviewer-leak.json` rejects reviewer fields in results. (SEC-01 is the defense-in-depth caveat.)
- Dossier readiness is deterministic and explicitly non-advisory; ecological/bio/organic client wording is treated as client-declared fact requiring evidence, not certification (invalid scenarios include treating declarations as evidence).

**REV-01 — Local PCRAM review gate binds by artifact ID, not content hash.** Category: review safety. Severity: **MEDIUM**. Confidence: CONFIRMED. Files: `src/agents/human-review-gate.ts` (loads `data/intelligence/<source>/<artifact_id>.json` and records the decision against the ID only). Failure scenario: an intelligence artifact file edited _after_ approval but _before_ export would be exported under the earlier approval (local, single-operator repo — requires local write access, so exploitation ≈ operator error, not attack). The newer AI-79/80 layer already solves this pattern with content hashes. Remediation: record `sha256(artifact_json)` + `schema_version` in the review outcome and have `export-contract` verify it. Not safe as blind cleanup (touches review/export semantics and the review-outcome schema) — needs a small reviewed PR of its own.

## 9. Source monitoring and evidence integrity

- Snapshots are immutable, content-hashed (sha256 manifests under `data/manifests/`), and delta analysis is deterministic (fixture-tested in `tests/agents/delta-analyzer.test.ts`, `source-monitor.test.ts`).
- Source registries carry provenance/authority enums with negative fixtures (`invalid-intelligence-source-registry-unsupported-enum` etc.); citation binding is enforced by `invalid-extractable-evidence-packet-extraction-without-reference`.
- Missing capabilities (confirmed absent, matching the audit checklist): no ETag/Last-Modified conditional fetch, no canonical-URL normalization, no HTML noise stripping, no PDF binary identity beyond manual sha256 manifests, no article-level diff, no source-health/retry policy, no explicit `NO_CHANGE → NO_LLM` short-circuit (though the current pipeline is fixture-driven, so no LLM runs regardless). (EVID-01, LOW, CONFIRMED — future work, not implemented here per scope.)
- Mutable external URLs are recorded as locators alongside captured snapshots rather than re-fetched at evidence time — acceptable for the current bounded corpus.

## 10. Persistence and concurrency

- **Durable**: only the AI-80 authorization consumption store (node:sqlite, WAL, `BEGIN IMMEDIATE`, busy timeout, parameterized statements, singleton schema row with schema version + DDL hash, full column/index contract assertion on every open, corruption → fail closed as `store_error`/`store_unavailable`, restart double-consumption prevented — all covered in `tests/handoff/authorization-store.test.ts` including a multi-process race).
- **In-memory and lost on restart** (GOV-01, INFORMATIONAL, CONFIRMED): budget ledger reservations and rolling scope totals (`src/governance/budget-ledger.ts` — also an unbounded `Map` of reservations over a long process lifetime), usage audits, rate-limit buckets, and privacy audit records. This is the documented persistence boundary (docs/ai-lab-persistence-boundary.md); after restart, rolling budget windows reset to zero, which is _permissive_ drift (more spend allowed than the window intends). Acceptable for a lab; must be revisited before any long-running deployment. No customer billing exists or was added.

## 11. Dependencies and supply chain

Lockfile is consistent: dependency specs are unchanged since the last `pnpm-lock.yaml` update (verified by diffing dependency blocks across history); `pnpm install --frozen-lockfile` is what the Dockerfile uses. No install scripts of concern in direct deps. Recommendation table:

| Package                                                                                           | Status                                                                                                                                                                          | Recommendation                                                                          |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `@langchain/langgraph`                                                                            | **Unused** — zero imports in `src/`, `scripts/`, `tests/` (docs spike only)                                                                                                     | **Remove** (needs lockfile update → separate small PR)                                  |
| `@types/ajv`                                                                                      | Deprecated stub; ajv ships its own types                                                                                                                                        | **Remove** (with lockfile update)                                                       |
| `xlsx` 0.18.5                                                                                     | npm build is stale/abandoned upstream; known advisories against ≤0.19.x (prototype pollution CVE-2023-30533, ReDoS CVE-2024-22363); used only by legacy ARCA crawler + one test | **Investigate**: retire with crawler, or repoint to the maintained cdn.sheetjs.com dist |
| `openai`                                                                                          | Used by governed adapter _and_ legacy agents                                                                                                                                    | **Retain** (governed use); shrink surface when legacy retires                           |
| `hono`                                                                                            | Used only by legacy Worker                                                                                                                                                      | **Retain pending Worker decision**; remove with it                                      |
| `csv-parser`, `pdf-parse`, `dotenv`                                                               | Legacy crawlers/scripts only                                                                                                                                                    | **Retain pending crawler decision**                                                     |
| `ajv`, `ajv-formats`                                                                              | Core schema validation                                                                                                                                                          | **Retain**                                                                              |
| `wrangler`, `@cloudflare/workers-types`                                                           | Dev-only, legacy Worker                                                                                                                                                         | Retain pending Worker decision                                                          |
| `tsx`, `typescript`, `eslint`, `prettier`, `typescript-eslint`, `@types/node`, `@types/pdf-parse` | Dev toolchain                                                                                                                                                                   | **Retain**                                                                              |

Version ranges are all caret (normal); no native modules; no dev-dependency used on a production path (the API server uses only node built-ins, as README claims). No upgrades were performed (out of audit scope).

**DEP-05 — Dockerfile base image below engines requirement.** Severity: **LOW**. Confidence: CONFIRMED. `Dockerfile` uses `node:20-alpine` while `package.json` requires `>=22.5` (needed for `node:sqlite`). The containerized API server itself doesn't import sqlite, so the image happens to work, but `pnpm install` engine checks and any future durable-store usage will fail. Recommendation: bump to `node:22-alpine` (deployment-affecting → left as a recommendation, not changed).

## 12. Test quality

- 618 tests, 123 suites, ~2 s, deterministic across the audit's runs; **no `.skip`/`.todo`**, **no network access**, **no absolute-path dependence**, no fixture mutation observed (tests write only to temp dirs).
- Clocks are injected (`clock:` option) throughout privacy/governance/gateway tests; three files use real `Date.now()` only for non-asserted metadata (TEST-01, INFORMATIONAL — no flake risk identified).
- Strong negative coverage: credential-shaped fields, reviewer leaks, downstream bypasses, path traversal, expired evidence, double consumption, concurrency (including a real multi-process SQLite race), restart, and profile-version mismatch all have dedicated tests.
- Mutation-sensitivity is reasonable: assertions check semantic fields, not just snapshot equality.
- Debt: none blocking. The suite runs via `tsx --test` glob; no coverage tooling configured (informational).

## 13. Performance and resource findings

Ranked by credible impact (nothing here is user-facing today):

1. **GOV-01** unbounded in-memory reservation map (§10) — only matters for long-lived processes.
2. Repeated schema compilation is avoided (AJV instances are module-level); JSON configs are imported once via import attributes — good.
3. `src/server/api-server.ts` reads and validates the export file on every request with `readFileSync` (synchronous, blocks the event loop briefly). Files are small; fine at lab scale (PERF-01, INFORMATIONAL).
4. Benchmark runner concurrency is bounded by fixture set size; no unbounded queues/caches found elsewhere; rate-limit map is swept every 60 s and on read.

No premature optimization performed.

## 14. Documentation and repository hygiene

- **HYG-01 (MEDIUM, CONFIRMED)** — README drift: claims “213 tests passing” (actual: 618), status list stops at AI-71 (delivered through AI-84), Quick start says “Node.js 20+” (engines require ≥ 22.5), and points to the roadmap as “AI-70 through AI-78”. The roadmap doc itself (docs/architecture/ai-roadmap-dependency-map.md) _is_ current through AI-84. Fix: **Cleanup A**.
- **HYG-02 (LOW, CONFIRMED)** — `.gitignore` gaps: no `*.db` / `*.sqlite*` / `*.db-wal` / `*.db-shm` (the AI-80 store will create these wherever an operator points it), no `graphify-out/` (graphify tooling is configured via `.graphifyignore`), no `.worktrees/` (exists locally), no `.claude/` (currently ignored only by the local global excludes file — collaborators would commit it). Fix: **Cleanup B**.
- **HYG-03 (INFORMATIONAL)** — Absolute local paths (`/Users/nicolasmatiasstedile/...`) appear in `docs/agents/delta-analyzer.md:73` (sample output) and `reports/phase-8-export-contract-agent-2026-06-16.md:5` (historical evidence report). The report is point-in-time evidence; the doc sample can be genericised in Cleanup B.
- **HYG-04 (INFORMATIONAL)** — Four merged remote feature branches linger on origin (`feat/ai-73…`, `feat/ai-76…`, `feat/ai-77…`, `feat/ai-84…`). Recommend the owner delete them (not done — remote deletion is destructive and out of cleanup scope).
- **Checked and clean**: all package.json script targets exist; all relative doc links resolve (0 broken across docs/ + README); DATA_CATALOG and sha256 manifests present; no duplicate fixtures or schemas found; no dead config files identified with proof of zero references; historical evidence reports intentionally retain their point-in-time test counts.
- Lint debt (115 errors) is confined to legacy subsystems: agents 37, crawlers 41, worker 10, scripts 12, utils 4, misc 11 — see the per-file table in the audit worksheet (§2 baseline). Prettier debt spans 263 files (repo has no enforced format CI). Both recorded as baseline debt, not fixed wholesale.

## 15. Operational readiness

- Local startup: `pnpm agents:api-server` validated port parsing (rejects non-numeric/out-of-range), fail-closed auth, `/health` public. Docker healthcheck hits `/health`.
- **OPS-01 (LOW, CONFIRMED)** — no graceful shutdown: `src/cli/api-server.ts` installs no SIGTERM/SIGINT handler; in-flight responses are cut on container stop. Fix is small and testable (Cleanup D candidate; deferred — see §16 note).
- **DEP-05** Dockerfile node:20 vs engines ≥22.5 (§11).
- Config validation: gateway/privacy/budget configs are schema-validated at import with fail-closed behavior; missing env → adapters return `blocked`, API returns 401. `fly.toml.example` is explicitly documentation-only; `wrangler.toml` sets `ENVIRONMENT=production` (which makes the legacy Worker fail closed) and `CLOUDFLARE_PIPELINE_V1_ENABLED=false`.
- Kill switches exist and default off: `AI_LAB_LIVE_PROVIDER_EXECUTION_ENABLED` (master), per-provider flags, per-profile `enabled: false`, budget policy hard limits.
- Gaps (all INFORMATIONAL, expected for a lab): no backup/restore doc for the SQLite store, no rollback runbook, no incident-response doc, no metrics/observability beyond structured audit records, no migration procedure beyond the store's fail-closed schema assertion. No deployment was performed or is authorized.

## 16. Prioritized remediation plan

| Priority | Item                                                                                                                                            | Findings                        | Vehicle                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------- |
| 1        | Enforce unknown-field rejection at the export boundary + timing-safe key compare + hardening headers (with regression tests)                    | SEC-01, SEC-03, SEC-07          | **Cleanup PR D** (this audit cycle)                        |
| 2        | README/status/roadmap sync                                                                                                                      | HYG-01                          | **Cleanup PR A** (this audit cycle)                        |
| 3        | `.gitignore` coverage + doc path genericisation                                                                                                 | HYG-02, HYG-03                  | **Cleanup PR B** (this audit cycle)                        |
| 4        | Decide retire-vs-migrate for each legacy provider path; then delete or gateway-migrate (removes SEC-02/04/05, most lint debt, and shrinks deps) | ARCH-01, SEC-02, SEC-04, SEC-05 | Human decision → dedicated PRs                             |
| 5        | Hash-bind PCRAM review outcomes to artifact content                                                                                             | REV-01                          | Small reviewed PR (schema change → not cleanup)            |
| 6        | Remove `@langchain/langgraph`, `@types/ajv`; resolve `xlsx` strategy                                                                            | DEP-01/02/03                    | Small dependency PR (lockfile change; run full validation) |
| 7        | Dockerfile `node:22-alpine`; graceful shutdown                                                                                                  | DEP-05, OPS-01                  | Ops-touching PR after human ack                            |
| 8        | Registry scope documentation; evidence-integrity capabilities (ETag, NO_CHANGE→NO_LLM, …)                                                       | SCHEMA-01, EVID-01              | Roadmap items                                              |

## 17. Explicitly verified invariants

| #   | Invariant                                                             | Status                                                                                  | Key evidence                                                                                           |
| --- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | Unreviewed model output is never approved intelligence                | **HOLDS**                                                                               | Gateway hard-codes `downstream_allowed: false`; schema fixtures reject bypasses                        |
| 2   | Cost cannot override privacy                                          | **HOLDS**                                                                               | Privacy gate runs before budget reservation and adapter lookup (gateway lines 73-79)                   |
| 3   | Routing cannot override human review                                  | **HOLDS**                                                                               | AI-78 outputs decisions only; AI-79 requires reviewed authorization; AI-80 enforces single consumption |
| 4   | Unknown/incomplete configuration fails closed                         | **HOLDS on governed path**; legacy Worker has one fail-open branch (SEC-02, undeployed) |
| 5   | Domain workflows do not call provider SDKs directly                   | **VIOLATED by legacy paths** (ARCH-01); governed path clean                             |
| 6   | Approved exports leak no provider/prompt/reviewer/governance metadata | **HOLDS today**; SEC-01 is a defense-in-depth gap, not a leak                           |
| 7   | `vlatam-global` is read-only external consumer                        | **HOLDS**                                                                               | GET-only API, no write endpoints, contract docs                                                        |
| 8   | No production credentials or services introduced                      | **HOLDS**                                                                               | None found; none added                                                                                 |
| 9   | Disabled candidate profiles remain blocked                            | **HOLDS**                                                                               | No adapter registered for OpenRouter/MiniMax; readiness `enabled: false`; AI-83 gated                  |
| 10  | No live provider call during this audit                               | **HOLDS**                                                                               | Tests are replay/fixture-only; no scripts with network side effects were executed                      |

## 18. Limitations

- Static review + existing test suite only; no fuzzing, no dynamic penetration testing, no dependency vulnerability database scan beyond known public advisories for `xlsx`.
- Legacy agent/crawler/worker code was reviewed for boundary and injection classes, not line-by-line for logic correctness (it is outside the governed architecture and slated for a retire/migrate decision).
- `pnpm audit` was not run (network-dependent registry query; lockfile-based advisory review was manual).
- Gitignored local data (`data/raw/`, PDFs, CSVs, local `.env`) was checked only for tracking status and history presence, not content-audited beyond identifier-pattern scans.
- Confidence labels: findings marked CONFIRMED were verified in code and, where applicable, against tests; NEEDS_VALIDATION items (SCHEMA-01 registry scope) require owner intent.

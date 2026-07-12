# AI-72 Local Evidence Report

## Snapshot context

- Repository: `vlatam-ai-lab` only.
- Starting local ref: clean `main`, aligned with the locally available `origin/main`; no fetch was permitted.
- Branch: `feat/ai-72-multi-provider-gateway`.
- Graphify baseline: absent; direct local inspection was used.

## Audit findings and transparent delta

The audit found a real direct DeepSeek domain import, a partial gated Cloudflare wrapper with forbidden fallback, Qwen documentation/snapshots without the documented runtime source, and Cloudflare Workers AI embedding paths outside this capability. AI-72 adds a side-by-side gateway and does not rewrite those paths.

The delta adds a versioned profile contract/catalog, explicit adapter registry, deterministic replay, disabled live compatible adapters, one explicit mapper/parser, normalized errors, cancellation/timeouts, and safe in-memory audits.

## Assumptions and limitations

- The local `origin/main` ref was used without network verification.
- Replay is the only fully enabled adapter.
- Live behavior is not network-tested and remains disabled in the catalog.
- The legacy extraction-schema conflict is handled by explicit provider-neutral projection; the legacy schema is unchanged.
- No production readiness, privacy/ZDR compliance, cost control, model quality, or benchmark claim is made.

Route this report and the architecture document to human review before migration or runtime activation.

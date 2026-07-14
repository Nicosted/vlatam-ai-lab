# OpenRouter external evidence review

Status: collected and integrity-bound; human verification pending; exact
candidate and the separate sandbox-enablement proposal blocked.

This document governs `config/ai-openrouter-external-evidence-pack.json` for the
single repository candidate:

`minimax/minimax-m2.7 → variable OpenRouter routing → MiniMax model family (exact served revision unknown) → openrouter.minimax-m2.7.variable.v1 → openrouter.minimax-m2.7.variable-route.v1 → evidence.extraction.normative_claims`

The pack is evidence metadata only. It does not create or enable a model,
route, execution profile, adapter, provider, gateway path, retry policy,
credential, account setting, or external call.

## Source hierarchy

Reviewers should prefer sources in this order:

1. official OpenRouter documentation and exact model/provider metadata;
2. official MiniMax model, API, privacy, and legal documentation;
3. original model cards or technical reports;
4. primary benchmark publications;
5. authoritative legal or regulatory material when a legal conclusion needs it.

Search snippets, SEO pages, scraped aggregators, forum posts, and generated
summaries are discovery aids only and cannot support a record. The pack stores
canonical URLs and normalized facts rather than copied pages. Quotations must
remain short and necessary.

## Collection and normalization

Collection records the exact claim, publisher, canonical URL, source type,
retrieval timestamp, publication/effective date when available, normalized
fact, limitations, candidate bindings, conflict references, and re-review
date. Each record has a domain-separated SHA-256 integrity hash; the pack has
a separate domain-separated hash. Canonicalization sorts object keys while
preserving array order, so repeated evaluation is deterministic.

Public documentation retrieval is not a provider call. Collection must never
use an API key, inspect account state, read environment variables, invoke a
model, or query provider account/API metadata. If a public fact cannot be
retrieved or supported precisely, its state stays `missing` or `unverified`.

## Reviewer responsibilities and verification

Automation may collect and normalize evidence. Only an explicit repository-safe
human reviewer identity may change a record to `verified`, and `reviewed_at`
must be present. `nicolas` is an existing repository example of a safe reviewer
identifier; this pack does not assign that identity or imply that Nicolas
Stedile reviewed it.

A reviewer must confirm that the source supports the exact claim and exact
candidate binding, that limitations remain complete, and that no newer source
changes the conclusion. Marketing statements do not prove exact upstream
behavior. Aggregate model metadata does not prove provider endpoint behavior.
JSON-object support does not prove strict JSON Schema enforcement. Vendor
benchmarks for coding, terminal, office, or tool use do not prove
`evidence.extraction.normative_claims`.

States are closed to `missing`, `unverified`, `verified`, `expired`,
`conflicting`, and `not_applicable`. Synonyms are not accepted. A verified
record without reviewer metadata is incomplete. At or after `re_review_at`,
the record is expired and blocks use.

## Conflict handling

Conflicts are bidirectionally referenced where practical and never silently
resolved. The current pack preserves three important boundaries:

- aggregate OpenRouter pricing and provider offers differ, so pricing remains
  `conflicting` even though a metadata-only spend ceiling is proposed;
- router, endpoint, and upstream-provider privacy/retention/training terms can
  differ, so exact-route privacy remains unverified;
- provider routing is variable, and neither provider ordering nor disabling
  fallback alone proves an immutable endpoint/model revision.

The pack records the documented constraint proposal
`provider.order=["minimax"]`, `allow_fallbacks=false`,
`require_parameters=true`, `data_collection="deny"`, and `zdr=true`. The
provider slug, current endpoint eligibility, and guarantee semantics still
require review; this metadata is not runtime configuration and is not treated
as exact-route proof.

When official sources disagree, the pack fails closed until a named reviewer
documents a scoped resolution. A newer page does not automatically supersede
an older binding; its effect must be reviewed and the hashes/version updated.

## Expiry and re-review

Mutable routing, price, ZDR, and endpoint-policy claims use short re-review
windows. Model release/context and other comparatively stable claims may use
longer windows. Re-review must retrieve the canonical source again, compare
the normalized fact, update limitations and conflicts, assign the reviewer,
recompute the record hash, then recompute the pack and dossier hashes.

Any candidate identity change requires a new pack version. Do not silently
change the model slug, upstream provider, model/route registry entries,
profile-candidate identity, or capability.

## Legal and security boundaries

This pack identifies OpenRouter and MiniMax policy/terms sources; it does not
make a legal, privacy, security, export-control, commercial-use, data-transfer,
subprocessor, or compliance approval. Nicolas Stedile or a separately
designated reviewer must decide those questions. Account-level ZDR, logging,
data-use, region, guardrail, and provider-allowlist settings are not inspected
or changed here.

## Verification is not authorization

Evidence verification answers only whether a source supports a claim. Human
dossier approval is separate, remains pending, and can authorize at most a
later sandbox-enablement proposal. The evaluator always emits
`execution_authorized: false` and `provider_call_performed: false`. The model
and route registries and adapter remain disabled. The later proposal-only
profile metadata is disabled and excluded from executable registry dependencies.

## Metadata-only sandbox budget proposal

The pack proposes, but does not configure: at most 10 manual requests; 8,000
input and 2,000 output tokens per request; USD 0.05 total spend; only
`minimax/minimax-m2.7` with intended upstream provider identity `minimax`; no
fallback; zero automatic retries; expiry on 2026-08-13; and a required kill
switch. Variable routing means the permitted upstream identity is not yet
provably enforceable, so the proposal does not resolve readiness.

The sandbox-enablement proposal now binds pack version `1.0.0` and hash
`5b5cc5337c3f8c0a47aef8f8ba8528dc245db7be3ae56ab3814a574a76cee906`.
It does not rewrite these records or treat collection as verification. The
proposal preserves the reviewed ceilings and remains blocked on every evidence,
routing, privacy, benchmark, legal, security, and approval gap listed here.

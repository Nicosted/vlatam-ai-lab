# AI-78 Best Profile Policy Router

## Evidence-to-decision lifecycle

AI-78 accepts a versioned routing policy, a reviewed evidence reference, the complete AI-77 `CampaignResult`, and a provider-neutral routing request. It validates schema/policy identity first, accepts only `completed` campaigns, verifies the campaign/suite/ranking/profile identities and hashes, requires one uniquely approved rank-one winner, and checks freshness, supersession, review attestation, profile registry identity, quality gates, lifecycle, enabled status, contract version, privacy, budget class, jurisdiction, and regulatory topic. The output is one immutable routing decision artifact: `selected`, `fallback_selected`, `human_review_required`, `blocked`, or `rejected`.

Canonical profile identity is always `profile_id@profile_version`. The router resolves the exact version and verifies the AI-77 provenance hash `normalizeAndHash({ profile, resolved })`. It never silently substitutes a catalog entry with another version.

## Human-review boundary

AI-77 ranking is evidence, not authorization. The policy declares unique `allowed_reviewer_roles`; this list is mandatory and non-empty for `required` and `on_policy` review. Role identifiers are metadata-only categories, not personal identities. Approved review may proceed; missing or pending review returns `human_review_required` with `REVIEW_REQUIRED`; explicit rejection returns `rejected` with `REVIEW_REJECTED`. Invalid attestations and unauthorized roles fail closed with distinct reasons. None of these terminal review failures may fallback.

## Eligibility and fallback

Quality gates reuse AI-77 gate shapes and are proven directly against the winning `ProfileSummary`; rankings are never recomputed. Privacy eligibility calls the public AI-73 `PrivacyEnforcer`. Budget class remains independent. When `required_budget_policy_refs` is configured, the campaign must bind an exact allowed ID/version; missing or incompatible references fail as `BUDGET_POLICY_INCOMPATIBLE`. No pricing, reservation, reconciliation, or execution-time enforcement is added.

Fallback is opt-in. The policy must name its exact canonical profile and unique allowed reasons. Review rejection, attestation failure, unauthorized roles, privacy failure, evidence-integrity failure, schema/policy failure, and identity conflicts never fallback. Budget-policy incompatibility may fallback only when explicitly allowed and the fallback independently qualifies.

## Determinism, audit, and integration

Timestamp checks use deterministic milliseconds against the injected clock. Invalid/future timestamps, review-before-evidence ordering, and stale evidence fail closed; exact-now and exact-maximum-age boundaries pass. Set-like policy arrays are normalized before hashing, so equivalent input ordering produces the same decision hash. Direct calls also validate nested IDs/versions, duplicate references/reasons, quality-gate field coherence, reviewer-role coherence, request correlations, and evidence fields before profile resolution. Audit remains metadata-only.

`BestProfilePolicyRouter.route` is deliberately narrow and returns the artifact only. It does not call `MultiProviderGateway`, providers, or adapters; mutate registry state; persist a selection; change approved-artifact/export semantics; or edit deployment configuration. A future gateway integration may consume a reviewed decision explicitly, but AI-78 does not perform that activation.

## Commands

- `pnpm ai:routing:validate-policy <policy.json>`
- `pnpm ai:routing:validate-evidence <evidence.json>`
- `pnpm ai:routing:decide <policy.json> <evidence.json> <ai77-result.json> <request.json>`
- `pnpm ai:routing -- render <decision.json>`

All default tests and fixture scenarios are local and deterministic. No provider credentials or network access are required.

## Non-goals

No provider/adapter execution, benchmark rerun, ranking recomputation, registry promotion or mutation, production configuration mutation, deployment change, shadow traffic, scheduler, UI, currency conversion, provider integration, or approved-artifact/export change is included.

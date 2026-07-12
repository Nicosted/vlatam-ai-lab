# AI-78 Best Profile Policy Router

## Evidence-to-decision lifecycle

AI-78 accepts a versioned routing policy, a reviewed evidence reference, the complete AI-77 `CampaignResult`, and a provider-neutral routing request. It validates schema/policy identity first, accepts only `completed` campaigns, verifies the campaign/suite/ranking/profile identities and hashes, requires one uniquely approved rank-one winner, and checks freshness, supersession, review attestation, profile registry identity, quality gates, lifecycle, enabled status, contract version, privacy, budget class, jurisdiction, and regulatory topic. The output is one immutable routing decision artifact: `selected`, `fallback_selected`, `human_review_required`, `blocked`, or `rejected`.

Canonical profile identity is always `profile_id@profile_version`. The router resolves the exact version and verifies the AI-77 provenance hash `normalizeAndHash({ profile, resolved })`. It never silently substitutes a catalog entry with another version.

## Human-review boundary

AI-77 ranking is evidence, not authorization. The reviewed evidence reference binds reviewer role, decision, review timestamp, and attestation ID. Missing, malformed, rejected, or time-inconsistent attestations fail closed. A policy that requires review returns `human_review_required` instead of selecting a fallback when reviewed authorization is unavailable. Production activation remains a separate future human-controlled operational action.

## Eligibility and fallback

Quality gates reuse AI-77 gate shapes and are proven directly against the winning `ProfileSummary`; rankings are never recomputed. Privacy eligibility calls the public AI-73 `PrivacyEnforcer` with the existing capability definition and exact execution profile. Budget eligibility checks the profile's public AI-74 budget class and versioned policy references only; it does not price, reserve, reconcile, or enforce execution-time limits.

Fallback is opt-in. The policy must name its exact canonical profile and allowed reasons. The fallback must independently satisfy registry, capability, lifecycle, enabled, contract, privacy, budget-class, jurisdiction, and topic constraints. Privacy failures, evidence-integrity failures, schema/policy failures, identity conflicts, and human-review-required policies never fallback. A missing or ineligible configured fallback blocks.

## Determinism, audit, and integration

Policy and decision hashes use the AI-75 canonical normalization/hash helper. With an injected clock and ID source, identical inputs produce identical decision artifacts. Audit events contain only event IDs/types, timestamps, capability/request identifiers, canonical profile keys, reason codes, and correlation IDs. Prompts, raw benchmark data, credentials, personal data, provider secrets, and execution context are excluded and checked by `assertRoutingAuditMetadataOnly`.

`BestProfilePolicyRouter.route` is deliberately narrow and returns the artifact only. It does not call `MultiProviderGateway`, providers, or adapters; mutate registry state; persist a selection; change approved-artifact/export semantics; or edit deployment configuration. A future gateway integration may consume a reviewed decision explicitly, but AI-78 does not perform that activation.

## Commands

- `pnpm ai:routing:validate-policy <policy.json>`
- `pnpm ai:routing:validate-evidence <evidence.json>`
- `pnpm ai:routing:decide <policy.json> <evidence.json> <ai77-result.json> <request.json>`
- `pnpm ai:routing -- render <decision.json>`

All default tests and fixture scenarios are local and deterministic. No provider credentials or network access are required.

## Non-goals

No provider/adapter execution, benchmark rerun, ranking recomputation, registry promotion or mutation, production configuration mutation, deployment change, shadow traffic, scheduler, UI, currency conversion, provider integration, or approved-artifact/export change is included.

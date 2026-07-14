# Governed OpenRouter sandbox-enablement proposal

Status: proposal implemented; deterministic outcome `blocked`; execution disabled.

The proposal covers exactly this candidate and no substitute:

`minimax/minimax-m2.7 → intended MiniMax upstream → openrouter.minimax-m2.7.variable.v1 → openrouter.minimax-m2.7.variable-route.v1 → openrouter.minimax-m2.7.normative-extraction.candidate → evidence.extraction.normative_claims`

It binds readiness dossier `openrouter.minimax-m2.7.normative-extraction.v1@1.0.0`
and external evidence pack
`openrouter.minimax-m2.7.normative-extraction.external-evidence.v1@1.0.0`
by their exact SHA-256 hashes. It does not modify either evidence artifact.

## Lifecycle and deterministic outcome

Contract `1.0.0` admits only `draft`, `blocked`, `pending_human_review`,
`approved_for_sandbox_configuration`, `expired`, and `rejected`. Evaluation
returns `invalid_proposal`, `blocked`, `pending_human_review`, or
`eligible_for_configuration`. Results are sorted, deterministic, and deeply
immutable.

The repository fixture is `blocked`. The dossier is blocked; the external
records are not human-verified; pricing conflicts; exact upstream routing,
privacy, retention, training use, geography, ZDR, strict structured output,
and the capability benchmark remain unresolved; legal and security reviews
are pending; and no human configuration reviewer has approved the hashes.

## Disabled profile design

The existing execution-profile catalog now contains the exact profile candidate
as proposal metadata. It is `candidate`, `live`, and `enabled: false`. Its
adapter is false, authentication material is absent, invocation is manual-only,
fallback is false, retries are zero, timeout is 10 seconds, and output is capped
at 2,000 tokens. The proposal profile is excluded from executable OpenRouter
registry dependencies and is not referenced by the route's executable-profile
list. The model entry, route, and adapter remain disabled.

No environment-variable name or value is added to the profile. No code in the
proposal module reads environment variables, imports the gateway or adapter,
accesses authorization, or performs network, persistence, or provider work.

## Budget and routing restrictions

The metadata-only ceiling is 10 requests, 8,000 input tokens per request, 2,000
output tokens per request, and USD 0.05 total. Only
`minimax/minimax-m2.7` and intended upstream identity `minimax` are admitted.
The proposed routing metadata requires `provider.order=["minimax"]`, parameter
support, denied data collection, and ZDR, with no fallback and zero automatic
retries. Exact immutable upstream routing is explicitly `unresolved`; the
metadata is not installed in a live runtime. Expiry is
`2026-08-13T12:00:00.000Z`, and a kill switch is mandatory.

## First-run data policy

If a later, separately reviewed configuration and execution path is eventually
authorized, its first run may use only synthetic cases or specifically approved
non-sensitive cases. Customer data, personal data, production documents,
confidential or privileged material, and regulated data are forbidden. Outputs
are experimental, require human review, create no legal reliance, and cannot be
published downstream automatically.

## Human-review checklist

Every item is pending and must identify its human reviewer and evidence:

- verify every mandatory evidence record and its current hash;
- decide whether exact upstream routing is sufficiently enforceable;
- approve privacy, security, retention, training-use, geography, and ZDR;
- approve legal, commercial, terms, and export-control use;
- accept a capability-specific benchmark and reviewed gold cases;
- accept the USD 0.05 and token/request ceilings;
- approve a secret-management plan without placing a secret in this repository;
- name the kill-switch owner and prove the switch design;
- name the incident owner and response path;
- approve the exact first-run test cases and their data classification;
- confirm that no personal, customer, confidential, privileged, production, or regulated data will be used.

## Approval boundary

Approval is a separate artifact. A valid approval requires a named human who is
not the proposal creator, scope `sandbox_configuration_proposal_only`, explicit
decision and reason, decision timestamp, expiry, and the reviewed proposal,
dossier, and evidence-pack hashes. The repository approval is deliberately
pending with no reviewer or decision; no identity or approval is fabricated.

Even a valid approval would mean only that a later PR may configure a disabled
sandbox runtime. It cannot authorize execution, secret access, runtime
configuration by this proposal, authorization issuance or consumption, gateway
or adapter invocation, provider traffic, or production changes. A later
configuration PR and a still-later explicit execution authorization remain
separate human decisions.

## Blockers before a final sandbox adapter PR

1. Human-verify all mandatory evidence and re-review mutable sources.
2. Resolve conflicting pricing with a bounded exact-route pricing identity.
3. Prove enforceable exact MiniMax upstream routing and endpoint/model revision.
4. Approve privacy, retention, training use, geography, ZDR, security, legal,
   commercial, terms, and export-control requirements.
5. Produce and approve strict structured-output and capability-specific
   benchmark/gold-case evidence.
6. Name configuration reviewer, kill-switch owner, and incident owner.
7. Approve the secret-management plan and first-run synthetic/non-sensitive data.
8. Recompute and review dossier, evidence-pack, proposal, and approval hashes.
9. Submit a separate configuration PR that keeps execution disabled.
10. Obtain a separate, scoped, expiring execution authorization before any call.

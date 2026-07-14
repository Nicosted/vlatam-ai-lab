# Governed OpenRouter readiness dossier

Status: evidence and governance only; repository candidate blocked; the
separate sandbox-enablement proposal is also blocked. This
contract does not enable a model, route, execution profile, adapter, provider,
secret, gateway invocation, or external traffic.

## Process and authority

The only permitted sequence is:

`evidence collection → dossier validation → readiness evaluation → human approval → later sandbox-enablement proposal`

Each dossier represents one exact candidate path:

`OpenRouter route → exact upstream provider/model → governed model entry → governed route entry → execution profile candidate`

The dossier is a versioned, hash-bound evidence artifact. It does not modify
the model registry or route registry, create an execution profile, invoke the
gateway or adapter, read environment variables, access secrets, or grant
runtime authority. `ready_for_sandbox_review` means only that a human-approved
dossier may support a later proposal. That later PR must independently add and
review every runtime change; this dossier can never authorize execution.

Human approval is separate from evidence collection. The evaluator never
self-approves. An approval must record a human reviewer identity, the exact
`sandbox_enablement_proposal_only` scope, decision timestamp, expiry, and
reason. Approval is invalid at its expiry instant. Rejection, missing metadata,
or broader/different scope fails closed.

## Contract and evidence states

`schemas/ai-openrouter-readiness-dossier.schema.json` defines contract `1.0.0`.
`src/providers/openrouter-readiness-dossier.ts` validates registry identity,
source integrity, evidence state, risks, and approval, then returns a deeply
frozen result. The closed evidence states are `missing`, `unverified`,
`verified`, `expired`, `conflicting`, and `not_applicable`. The outcomes are:

- `invalid_dossier`: contract, hash, registry integrity, or identity is invalid;
- `blocked`: conflicting/expired evidence or an unresolved mandatory risk exists;
- `not_ready`: mandatory evidence or required approval metadata is incomplete;
- `ready_for_sandbox_review`: all mandatory checks and the separate human
  approval pass, but execution remains unauthorized.

Repository sources use `repository_evidence` and carry evidence ID, auditable
locator, and SHA-256 integrity hash. Future externally reviewed sources use
`externally_reviewed_evidence` with the same metadata. References contain only
compact claims and metadata: no credentials, secrets, sensitive payloads, or
full copyrighted documents. Tests are offline and never retrieve sources.

The current dossier now binds every evidence section to the versioned external
pack in `config/ai-openrouter-external-evidence-pack.json`. The evaluator
resolves each `externally_reviewed_evidence` reference, verifies the record
hash, category, dossier/model/upstream/model-entry/route/profile-candidate/
capability identity, and fails closed on missing, relocated, tampered, or
mismatched records. Collection does not imply verification: the pack records
remain unverified unless a named human reviewer explicitly approves them.

## Mandatory and optional evidence

Mandatory sections cover the exact model identifier and upstream route; model
lifecycle/release; context and output limits; modalities; structured output and
JSON Schema suitability; pricing identity/effective date/input/cached-input/
output rates and bounded variability policy; privacy, retention, training use,
ZDR eligibility and account configuration; geography/jurisdiction; terms and
acceptable use; exact-capability benchmark; known limitations and resolved
mandatory risks; source/retrieval/reviewer/status/expiry metadata; and separate
human approval.

Tool/function-calling and latency/reliability evidence are optional only when
the candidate capability does not require them. If used by the proposed
profile or policy, they become mandatory in review. `not_applicable` is never
accepted for a mandatory section.

## Expiry and re-review

Evidence is invalid at or after `expires_at`. Any stale, expired, conflicting,
unsupported, or tampered source blocks readiness. A source change requires a
new evidence hash, review, and dossier hash. A registry, route, model,
upstream, profile, capability, lifecycle, or contract change requires a new
dossier version and re-review. Approval cannot outlive evidence in a later
proposal; reviewers must shorten its expiry accordingly.

## Repository candidate and blockers

`config/ai-openrouter-readiness-dossier.json` covers only the existing
`openrouter.minimax-m2.7.variable` route and `minimax/minimax-m2.7`. It records
an absent profile candidate identity only to make the proposed path explicit;
it does not add that profile to the execution catalog.

The deterministic repository outcome is `blocked` because:

- routing is variable and no exact upstream endpoint/model revision is proven;
- pricing is conflicting and lacks a complete identity, exact rates, and
  bounded variability policy;
- exact-route privacy, retention, training use, geography, ZDR eligibility,
  and required account configuration are unverified;
- strict JSON Schema suitability and the intended capability benchmark are
  unverified or missing;
- exact upstream terms/legal review, named evidence reviewers, and separate
  human approval are absent;
- mandatory risks remain open; and
- no executable OpenRouter profile exists; the later proposal-only profile,
  model, route, and adapter all stay disabled.

The 2026-07-14 external collection adds authoritative source metadata for the
model identifier/release/context, routing controls, provider-dependent
pricing, router/privacy/ZDR behavior, terms, and operational errors/metadata.
It does not close the blockers. Pricing remains `conflicting`; the route stays
variable; exact endpoint revision, strict JSON Schema conformance, exact-route
privacy/ZDR, a relevant normative-claim extraction benchmark, and legal review
remain unproven. Human evidence review and dossier approval remain absent.

The later proposal artifact now exists at
`config/ai-openrouter-sandbox-enablement-proposal.json`, bound to this exact
dossier hash without changing this dossier. Its outcome remains `blocked`; its
disabled profile is proposal-only and does not satisfy or bypass this dossier's
missing evidence or approval.

These findings do not authorize provider-account access or live calls. Closing
them requires separately approved, local-first evidence work and human review.

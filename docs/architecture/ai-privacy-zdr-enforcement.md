# AI Privacy, Data Classification, Redaction, Retention, and ZDR Enforcement (AI-73)

AI-73 adds the privacy enforcement layer between explicit execution-profile
resolution and capability mapping in the multi-provider gateway. Privacy is a
hard execution-eligibility gate: it overrides provider availability, model
quality, latency, cost, replay convenience, lifecycle preference, and any
future routing score. The enforcer never chooses or replaces a profile,
never retries, and never falls back.

## Private reasoning prohibition (AI-121)

AI LAB adapters must not persist private model reasoning or chain-of-thought,
even when a vendor runtime exposes reasoning deltas or completed reasoning as
public protocol events. Adapters must keep capture disabled or redact/drop
those events before normalization.

Permitted evidence is limited to user inputs allowed by the applicable data
policy, normalized model outputs, tool requests and results, structured
decisions, policy decisions, costs, latency, errors, approvals and evidence
lineage. A concise reviewed rationale remains a separate explicitly approved
artifact; it is never raw hidden reasoning.

> **Enforcement boundary.** AI-73 enforcement applies only to
> gateway-mediated execution until legacy direct-provider paths are
> migrated. Gateway privacy enforcement does not protect legacy
> direct-provider execution paths. See the migration inventory below.

## Pre-change audit findings

| Path / module | Sensitive-data entry point | Provider / mode | Pre-AI-73 protection | AI-73 enforces | Legacy gap | Migration action |
| --- | --- | --- | --- | --- | --- | --- |
| `src/execution/multi-provider-gateway.ts` | `CapabilityRequest.input` (evidence excerpts) | replay + disabled live | AI-71 contract validation; forbidden-field scan; metadata-only audits; no classification gate | **Yes** (full lifecycle) | No | Done in AI-73 |
| `src/providers/replay-adapter.ts` | Repository fixtures (`snapshots/execution/`) | replay (local) | Fixture provenance undeclared | **Yes** (fixture origin/sanitization gates) | No | Done in AI-73 |
| `src/providers/openai-compatible-adapter.ts` | Mapped provider messages | DeepSeek / DashScope live (disabled) | Env-flag + credential fail-closed; no privacy gate | **Yes** (gateway gate runs first) | No | Done in AI-73 |
| `src/agents/normative-evidence-agent.ts` | Full evidence packet text, prompts | DeepSeek direct (OpenAI SDK, `DEEPSEEK_API_KEY`) | None (schema validation only) | **No** | **Yes** | Migrate to gateway invocation (post-AI-73) |
| `scripts/run-extraction.ts` | Evidence packet files from `data/` | DeepSeek direct via the agent | None | **No** | **Yes** | Migrate CLI to gateway invocation |
| `src/agents/{arca,infoleg,vuce,critic,router}-agent.ts` | Regulatory source text, extraction drafts | DeepSeek direct (`deepseek-chat`) | None | **No** | **Yes** | Migrate to gateway invocation |
| `src/ai/ai-gateway.ts` | Prompts routed through Cloudflare AI Gateway with model fallback (`deepseek/deepseek-chat` → `@cf/meta/llama-3.1-8b-instruct`) | Cloudflare AI Gateway (flag-gated) | Feature flag only; fallback contradicts single-adapter doctrine | **No** | **Yes** | Migrate or retire; fallback must not survive migration |
| `src/utils/embedding-service.ts`, `scripts/generate-*-embeddings.ts` | Full document text sent for embeddings | Cloudflare Workers AI (`@cf/baai/bge-m3`) | API-token env conventions only | **No** | **Yes** | Migrate embedding path to a gateway-mediated capability |
| `src/worker/index.ts` | Request payloads + `DEEPSEEK_API_KEY` binding | DeepSeek direct from Worker | Worker auth only | **No** | **Yes** | Migrate Worker AI calls to gateway |
| `src/workflows/pcram-workflow.ts` | Orchestrates the direct agents above | DeepSeek direct (transitively) | None | **No** | **Yes** | Re-point at gateway after agent migration |
| Qwen/DashScope spike artifacts (docs, snapshots) | Recorded spike outputs | DashScope (historic) | Static files | **No** (documented) | **Yes** | Keep frozen; never replay as privacy-safe without provenance |

Additional audit observations that shaped the design:

- AI-71's request vocabulary (`data_classification`) had four values and was
  optional and unenforced; AI-72 profiles declared
  `privacy_compatibility: "declared_not_enforced"`.
- The AI-72 replay fixture (`snapshots/execution/normative-claims-success.json`)
  contains manifestly synthetic content ("Synthetic evidence only",
  "Fixture-backed draft only") authored in-repo for AI-72; it mimics a
  recorded DashScope response shape. It is declared `synthetic` /
  `not_applicable` on the replay profile.
- The capability `evidence.extraction.normative_claims` is `risk_tier: high`,
  so its derived AI-71 privacy requirement is
  `tier: regulated, zdr_required: true, redact_fields: [supplier_names,
  prices, bank_data, broker_pii], retention_class: audit_with_payload`.
- No repository evidence proves any provider ZDR posture; the runtime ZDR
  evidence store ships empty.

## Enforcement lifecycle (gateway order)

```text
CapabilityRequest
  → request contract validation (AI-71)
  → pre-aborted signal rejection (AI-72.1)
  → capability definition resolution
  → explicit execution profile resolution + AI-72 profile validation
  → PRIVACY ENFORCEMENT (AI-73)
      capability privacy requirement resolution
      request data-classification validation
      profile privacy-declaration validation
      policy resolution (deterministic, fail-closed)
      ZDR and retention verification
      deterministic redaction/transformation
      decision: allow (privacy-cleared request) or block
  → capability-specific mapper (cleared request only)
  → timeout/cancellation handling
  → exactly one provider adapter
  → strict output parsing and result validation
  → execution audit + privacy audit
```

A privacy-blocked request never invokes an adapter, never starts a provider
timeout, never creates provider usage, never retries, never falls back, and
never selects a different profile. Privacy runs before adapter lookup, so a
privacy block wins over provider availability. Adapters may still reject on
stricter provider-specific grounds, but they can never weaken the central
decision.

## Classification hierarchy (`src/privacy/data-classification.ts`)

Canonical, versioned model (`1.0.0`), deterministic ranks:

| Classification | Rank | External processing | Redaction mandatory | Verified ZDR for external | Retention tolerated | Modes | Review before export |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `public` | 0 | potentially | no | no | all except `forbidden` | replay, live | no |
| `internal` | 1 | potentially | yes | no | all except `forbidden` | replay, live | no |
| `confidential` | 2 | potentially | yes | no | excludes `provider_unknown` | replay, live | yes |
| `regulated` | 3 | potentially (ZDR) | yes | **yes** | `none`, `ephemeral_memory`, `bounded_local_fixture` | replay, live | yes |
| `restricted` | 4 | **forbidden** | yes | yes | `none`, `ephemeral_memory` | replay only | yes |

Rules: missing classification fails closed; unknown classification fails
closed; no automatic downgrade (or upgrade) ever occurs; a profile whose
`max_data_classification` ranks below the request classification is blocked.
`payload_may_enter_logs` is `false` for every classification — all audits are
metadata-only regardless of sensitivity.

## AI-71 compatibility and migration mapping

- **Request vocabulary**: `confidential` was added to
  `DATA_CLASSIFICATIONS` between `internal` and `regulated` as an additive
  MINOR change (capability contract `1.0.0` → `1.1.0`). The four original
  values map identically (`AI71_DATA_CLASSIFICATION_COMPAT`); nothing was
  renamed or reinterpreted.
- **Capability tiers**: AI-71 `PrivacyTier` maps to the classification whose
  protections it corresponds to
  (`standard→internal`, `sensitive→confidential`, `regulated→regulated`,
  `restricted→restricted`). The tier remains a capability declaration; the
  request classification stays authoritative for enforcement.
- **Retention classes**: AI-71 `RetentionClass` translates to tolerated
  profile retention behaviors
  (`AI71_RETENTION_CLASS_ALLOWED_BEHAVIORS`); no retention class ever
  tolerates `provider_unknown` or `forbidden`.
- **ZDR**: AI-71 `zdr_required: true` maps to the AI-73 requirement
  `required_for_external`. Local, non-provider execution (the replay
  adapter with `external_processing: forbidden`) is explicitly treated
  separately by policy; this is documented treatment, not an inference —
  replay is never described as ZDR.

## Capability requirement vs. profile declaration vs. evidence vs. decision

AI-73 keeps four concepts strictly apart:

1. **Capability requirement** (`PrivacyRequirement`, AI-71): what the
   capability needs. It can never be weakened by a profile or policy — the
   enforcer always takes the strictest of capability, policy, and
   classification requirements.
2. **Profile declaration** (`PrivacyProfileDeclaration`): what a profile
   claims about itself (max classification, external processing, ZDR
   support, retention behavior, training use, region, redaction posture,
   replay fixture provenance, regulated/restricted permits). **A declaration
   is never proof.** Declaring `zdr_support: verified` does nothing unless
   the referenced evidence record independently validates.
3. **Verification evidence** (`ZdrVerificationEvidence`): repository-owned
metadata proving a claim, with explicit profile/capability/classification/
   retention/region/training scope, source type, timestamps, hash, and
   human-review status.
4. **Enforcement decision** (`PrivacyEnforcementDecision`): the computed
   allow/block outcome with reason code, required actions, the
   privacy-cleared request (allow only), and a metadata-only audit record.

## Privacy policy catalog (`config/ai-privacy-policies.json`)

Machine-readable, schema-validated
(`schemas/ai-privacy-policies.schema.json`), and loaded fail-closed:
duplicate policy IDs, unknown enums, malformed redaction paths, and
credential-shaped keys reject the whole catalog. Resolution is
deterministic: all entries matching `(capability_id, classification)` are
candidates; the unique highest `priority` wins; zero candidates is
`PRIVACY_POLICY_MISSING`, a priority tie is `PRIVACY_POLICY_AMBIGUOUS`.
No provider-specific code, credentials, endpoints, or legal text belong in
the catalog.

Current entries cover `evidence.extraction.normative_claims` for all five
classifications: `allow` (public), `require_redaction` (internal,
confidential), `require_verified_zdr` (regulated), and
`require_local_execution` (restricted).

## Deterministic redaction (`src/privacy/redaction.ts`)

Path-based, capability-specific, no heuristics, no LLM assistance, no
partial success. Actions: `remove`, `replace_with_marker`,
`hash_identifier`, `tokenize_reference`, `preserve`, `block_request`.
Paths are rooted at `input.` and traverse nested objects and arrays
(`input.evidence_refs[].reviewer_name`) deterministically.

- Redaction runs before mapping and before adapter invocation; the gateway
  uses only the privacy-cleared request afterwards.
- `presence: required` paths that are absent fail closed
  (`REDACTION_FAILED`); structurally uninterpretable mandatory paths fail
  closed (`REDACTION_PATH_UNKNOWN`).
- Hashes use SHA-256 over `vlatam-ai-lab/ai-73/redaction/v1:<path>:<value>`.
  The domain separator is stable and documented. A hash is
  pseudonymization, **not** anonymization; hashed identifiers remain
  sensitive metadata. Hashed-looking input values are still redacted.
- Raw document text that is forbidden for external processing is blocked
  (`block_request`) rather than pretending field-level redaction made it
  safe. The same applies to banking identifiers and credential-like fields
  (`input.bank_data`, `input.bank_account`, `input.credential_material`);
  credential-shaped field *names* are already rejected at the AI-71 request
  boundary.
- The capability's declared `redact_fields` categories must be covered by
  the resolved policy entry's rules (via `covers` tags) for
  redaction-mandatory classifications; missing coverage fails closed as
  `PRIVACY_CONFIGURATION_INVALID`.
- Redaction audit metadata records only path, action, outcome, and counts.

## ZDR evidence (`src/privacy/zdr-evidence.ts`, `config/ai-zdr-evidence.json`)

A ZDR-gated request executes only when evidence is present, structurally
valid, explicitly scoped to the profile, capability, classification,
retention behavior, processing region, and training-use declaration,
human-review approved, unexpired (checked against the
injected clock, no grace period), and `verified`. Blocked otherwise:
missing, expired, any scope mismatch, unreviewed, `declared_unverified`,
`unsupported`, `unknown`. ZDR is never inferred from provider branding,
marketing language, model identifiers, endpoint names, environment flags,
or replay mode. The runtime evidence store is empty — the honest state —
and test evidence uses `verification_source_type: test_fixture` scoped to
test-only profiles.

## Retention decisions

The enforcer intersects three explicit sets — the classification model's
tolerated behaviors, the capability retention class translation, and the
policy entry's allowed behaviors — and requires the profile's declared
`retention_behavior` to be inside the intersection. `forbidden` never
matches. Consequences:

- restricted data cannot use unknown provider retention (or any provider);
- regulated data cannot use `provider_unknown` or any incompatible behavior;
- `no_retention` requirements tolerate only `none`/`ephemeral_memory`;
- `bounded_local_fixture` is valid only when fixture provenance is synthetic
  or explicitly sanitized — **fixture storage is itself a retention
  decision**, which is why restricted data can never run against committed
  fixtures;
- ZDR evidence must also cover the profile's retention behavior.

Operational retention work — database deletion jobs, provider-side deletion
calls, storage lifecycle policies — is explicitly **not** implemented in
AI-73 and remains a future operational requirement (post-AI-73, alongside
production readiness work).

## Replay fixture semantics

Replay is not automatically privacy-safe. Every replay profile must declare
`replay_fixture_origin` (`synthetic`, `sanitized_recorded`,
`unsanitized_recorded`, `unknown`) and `replay_fixture_sanitization`:

- `synthetic` fixtures run when classification, policy, and retention allow;
- `sanitized_recorded` runs only with explicit `sanitized` provenance;
- `unsanitized_recorded` fails closed for every classification (raw
  sensitive production data may never be committed as a fixture);
- `unknown` origin fails closed;
- replay never satisfies verified ZDR; local non-provider execution is
  handled separately and explicitly by the `required_for_external`
  requirement level.

## Live-profile limitations

`normative-claims.deepseek.v1` and `normative-claims.dashscope.v1` remain
disabled, `candidate`, non-production, and not ZDR-verified. Their honest
declarations: `max_data_classification: public`, external processing
allowed, ZDR `unknown`, retention `provider_unknown`, training use
`unknown`, region `unknown`, regulated and restricted data blocked. Because
the capability itself requires ZDR for external processing, **even public
requests are privacy-blocked on these profiles until verified repository
evidence exists** — this is intentional and fails closed. No live calls are
made and no live execution flags are activated by AI-73.

## Privacy errors

Stable reason codes (see `src/privacy/errors.ts`) map into the AI-71 error
vocabulary with sanitized constant messages only:

- `DATA_CLASSIFICATION_REQUIRED`, `UNKNOWN_DATA_CLASSIFICATION` →
  `contract` / `INVALID_REQUEST`;
- `PRIVACY_POLICY_MISSING`, `PRIVACY_POLICY_AMBIGUOUS`,
  `PROFILE_PRIVACY_DECLARATION_MISSING`, `PRIVACY_CONFIGURATION_INVALID` →
  `policy` / `PRIVACY_POLICY_REQUIRED`;
- all other privacy blocks (`ZDR_*`, `REDACTION_*`,
  `RETENTION_POLICY_INCOMPATIBLE`, `EXTERNAL_PROCESSING_FORBIDDEN`,
  `REPLAY_FIXTURE_UNSAFE`, `PROFILE_PRIVACY_INCOMPATIBLE`) →
  `policy` / `POLICY_BLOCKED`.

The execution audit records the coarse `PRIVACY_BLOCKED` execution code; the
precise reason lives in the privacy audit.

## Privacy audit safety

`PrivacyAuditRecord` (`src/privacy/privacy-audit.ts`,
`schemas/ai-privacy-audit.schema.json`) is a closed shape validated with
`additionalProperties: false` and a structural scan
(`assertPrivacyAuditMetadataOnly`). It carries decision metadata only —
IDs, classification, policy ID/version, decision, reason code, actions,
redaction paths/actions/outcomes/counts, ZDR requirement/status/evidence
ID+hash, retention requirement/declaration, mode, timestamps. It never
carries request input, original or redacted values, prompts, document text,
evidence excerpts, PII, credentials, raw provider responses, or reviewer
identity. Tests enforce this with sentinel-value leakage scans across
decisions, errors, privacy audits, and execution audits.

## Direct-provider migration inventory

See the audit table above. Summary of unprotected legacy paths that AI-73
documents but deliberately does not rewrite: direct DeepSeek normative
extraction (`src/agents/normative-evidence-agent.ts`), the manual extraction
CLI (`scripts/run-extraction.ts`), the direct DeepSeek agents
(`arca`, `infoleg`, `vuce`, `critic`, `router`), the Cloudflare AI Gateway
wrapper with its fallback chain (`src/ai/ai-gateway.ts`), the Cloudflare
Workers AI embedding paths (`src/utils/embedding-service.ts`,
`scripts/generate-*-embeddings.ts`), the Worker DeepSeek endpoint
(`src/worker/index.ts`), and the frozen Qwen/DashScope spike artifacts.

**Gateway privacy enforcement does not protect legacy direct-provider
execution paths.** Migrating them onto the gateway is required follow-up
work before any repository-wide privacy claim can be made.

> **Resolution (2026-07-13, governed-execution-boundary PR):** all legacy
> direct-provider execution paths listed above were retired (removed from
> the repository) instead of migrated. Every remaining provider execution
> path runs through the MultiProviderGateway and is therefore covered by
> this privacy enforcement. `tests/architecture/execution-boundary.test.ts`
> fails the build if a direct provider path is reintroduced. The
> `src/workflows/pcram-workflow.ts` stubs no longer orchestrate any direct
> agent; they are type/test-only.

## Deferred to AI-74 through AI-78

Budget governance and cost/token metering (AI-74), the evaluation framework
(AI-75), gold cases (AI-76), benchmark execution (AI-77), and profile
ranking/routing/promotion/shadow traffic (AI-78) remain unimplemented.
AI-73 adds no routing, no ranking, no fallback, no retries, and no
automatic provider selection.

# AI-82 primary-source provider evidence review — 2026-07-13

## Local source snapshot and pre-change audit

- Repository: `vlatam-ai-lab`; baseline: clean `main`; branch: `feat/ai-82-primary-provider-evidence-review`.
- Graphify baseline: absent, so the governed fallback was direct local inspection.
- Audited AI-70 through AI-81 architecture, capability, gateway, AI-73 privacy/ZDR, AI-74 pricing, AI-75/76 evaluation, AI-77 benchmark, AI-78 routing, AI-79 authorization, AI-80 durable consumption, AI-81 evidence/readiness, schemas, fixtures, catalogs, and adapter registry.
- Safety baseline confirmed: OpenRouter and MiniMax Direct were disabled, runtime-blocked, absent from execution profiles, and absent from adapter registration.

Pre-change inconsistencies:

1. AI-81 lacked canonical URL, publisher, retrieval/effective date, applicability, route/upstream scope, limitation, conflict, and stable-hash fields.
2. AI-81 evaluator reason codes diverged from its readiness schema and checked neither complete privacy/pricing evidence nor provider routing.
3. The semantic “valid” fixture did not satisfy the published evidence schema, so schema validity and readiness were not proven together.
4. AI-73 is exact profile/capability/classification/region/retention scoped and AI-74 is exact provider/model/unit scoped, while AI-81 generic claims could not safely feed either contract.
5. Evidence expiry existed, but retrieval/review chronology and deterministic content integrity did not.

## Authoritative sources reviewed

Only official primary sources were accepted:

- OpenRouter: [model page](https://openrouter.ai/minimax/minimax-m2.7), [provider offers](https://openrouter.ai/minimax/minimax-m2.7/providers), [provider routing](https://openrouter.ai/docs/guides/routing/provider-selection), [models contract](https://openrouter.ai/docs/guides/overview/models), [usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting), [limits](https://openrouter.ai/docs/api/reference/limits), [provider logging](https://openrouter.ai/docs/guides/privacy/provider-logging/), [ZDR](https://openrouter.ai/docs/guides/features/zdr), [privacy policy](https://openrouter.ai/privacy), and [terms](https://openrouter.ai/terms).
- MiniMax: [text generation](https://platform.minimax.io/docs/guides/text-generation), [model releases](https://platform.minimax.io/docs/release-notes/models), [OpenAI-compatible API](https://platform.minimax.io/docs/api-reference/text-openai-api), [prompt caching](https://platform.minimax.io/docs/api-reference/text-prompt-caching), [pay-as-you-go pricing](https://platform.minimax.io/docs/guides/pricing-paygo), [rate limits](https://platform.minimax.io/docs/guides/rate-limits), [API privacy policy](https://platform.minimax.io/protocol/privacy-policy), and [terms](https://platform.minimax.io/protocol/terms-of-service).

No blog, comparison site, community post, search summary, reseller, aggregator listing for MiniMax Direct, credentialed endpoint, or live response was used as proof.

## Human decision matrix

| Decision area              | OpenRouter / `minimax/minimax-m2.7`                                                         | MiniMax Direct / `MiniMax-M2.7`                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Identity                   | Accepted as router + exact model slug + MiniMax model owner                                 | Accepted as direct MiniMax endpoint + exact model ID                                                                           |
| Routing                    | **Blocked:** variable by default; no approved fixed endpoint/fallback policy                | Fixed to MiniMax API domain; internal/subprocessor topology remains outside public proof                                       |
| API/capability             | Multiple normalized endpoint families; tools accepted; strict schema enforcement not proved | Compatible endpoints and tools accepted; strict schema-constrained M2.7 output unknown                                         |
| Context/output             | 204,800 context accepted; exact output cap unknown                                          | 204,800 context accepted; exact output cap unknown                                                                             |
| Usage/cache/reasoning      | Normalized usage accepted; route-specific semantics remain                                  | Usage and cache accounting accepted                                                                                            |
| Pricing                    | **Conflicting:** endpoint prices vary and route is unpinned                                 | Accepted public standard-priority PAYG units; re-review in 30 days                                                             |
| Regions/retention/training | **Unknown:** must cover both router and exact endpoint                                      | **Unknown:** US storage statement is not complete inference-region evidence; retention unbounded; no general no-training proof |
| ZDR                        | **Unknown:** router filtering is not proof for a fixed endpoint or AI-73 scope              | **Unknown:** no explicit applicable public ZDR commitment found                                                                |
| Security/compliance        | General safeguards only; no reviewed exact certification/upstream scope                     | General safeguards only; no reviewed public certification                                                                      |
| Normative extraction       | Unevaluated under AI-75 through AI-77                                                       | Unevaluated under AI-75 through AI-77                                                                                          |
| Readiness                  | Disabled; blocked                                                                           | Disabled; blocked                                                                                                              |

Deterministic readiness reasons at `2026-07-13T12:00:00.000Z`:

- OpenRouter: `contradictory_pricing`, `missing_upstream_provider_evidence`, `pricing_unknown`, `privacy_unknown`, `rate_limits_unknown`, `security_compliance_unknown`, `unsupported_capability`, `variable_provider_routing`.
- MiniMax Direct: `privacy_unknown`, `rate_limits_unknown`, `security_compliance_unknown`, `unsupported_capability`.

## Accepted, rejected, conflicting, and unknown claims

- Accepted claims are limited to exact identities, documented endpoints, context, tool interfaces, usage fields, and MiniMax Direct public pricing units.
- Rejected claim: MiniMax-M2.7 text API multimodal input; current compatible API states image/audio input is unsupported.
- Conflicting claim: a single OpenRouter model price cannot be derived while serving endpoints and their prices vary.
- Unknown claims remain fail-closed: strict schema output, exact output caps, exact rate/concurrency limits, complete processing regions, bounded retention, general no-training, ZDR, certification, and repository-specific normative extraction quality.

## Implementation delta, assumptions, and limitations

- Provider evidence schema is now `2.0.0`; the major version is intentional because the required claim-level provenance is structurally incompatible with AI-81 `1.0.0` placeholders.
- Forty reviewed claim records cover twenty required categories per candidate with deterministic canonical SHA-256 hashes and explicit re-review dates.
- Readiness evaluation now fails closed on scope confusion, stale/missing dates, unresolved conflicts, false ZDR, variable routing, missing upstream evidence, credential-shaped fields, unreviewed evidence, unsupported capability, missing categories, and hash mismatch.
- Public review is not legal, procurement, security, privacy, or production approval. No contractual DPA or enterprise addendum was available for review.

## Safety and required human decision

No provider was activated; no adapter, SDK, credential, environment requirement, provider call, live benchmark, routing change, profile promotion, approved-artifact change, export change, production service, or `vlatam-global` change exists in this work.

Human decision: retain both as blocked, or commission the missing contractual/technical evidence for one exact candidate. AI-83 remains prohibited until the exact gate in `docs/architecture/ai-provider-evidence-readiness.md` is fully satisfied and separately approved.

## Validation record

- Targeted AI-81/AI-82 provider tests: 19 passed, 0 failed.
- Targeted provider evidence plus AI-73 privacy/ZDR and AI-74 pricing compatibility tests: 49 passed, 0 failed after one schema strictness correction and clean rerun.
- Full repository suite: 611 passed, 0 failed.
- Typecheck: passed. Build: passed.
- Targeted ESLint and Prettier: passed.
- Evidence schema, fixture scenarios, official-domain URL/reference integrity, canonical hash replay, disabled/runtime-blocked state, execution-profile absence, and empty live registry: passed.
- `git diff --check` and final credential-pattern scan: recorded in the PR validation summary.

Tests and runtime validation are offline and deterministic. URL integrity checks are structural against the official-domain allowlist; they make no provider call. The implementation made no adapter or model invocation.

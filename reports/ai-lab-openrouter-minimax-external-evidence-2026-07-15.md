# OpenRouter / MiniMax M2.7 external evidence assessment — 2026-07-15

Status: `unreviewed`; public official and repository evidence only; execution remains disabled.

## CEO summary (ES)

OpenRouter/MiniMax M2.7 sigue siendo un candidato rápido para avanzar, pero sólo de forma condicional. Ya sabemos que OpenRouter publica 14 endpoints y permite apuntar al endpoint propio de MiniMax con el identificador `minimax/fp8`, sin fallback y con topes de precio. Para esa ruta, el precio publicado hoy es USD 0,30 por millón de tokens de entrada, USD 1,20 por millón de salida y USD 0,06 por millón de lectura de caché. El precio de USD 0,24/0,96 corresponde a otro proveedor, no a MiniMax.

Todavía no sabemos si la cuenta de Nicolás tiene activados los controles correctos de privacidad, ZDR, proveedores y presupuesto. OpenRouter etiqueta `minimax/fp8` como ZDR, pero la política pública de MiniMax no confirma para ese endpoint un plazo cero de retención, una prohibición completa de entrenamiento ni una región exacta de procesamiento. Tampoco hay prueba pública suficiente de que esa ruta cumpla en forma estricta todo el esquema JSON requerido.

Sin llamar al proveedor se pueden cerrar la identificación pública del endpoint, los precios publicados y el diseño fail-closed de la futura solicitud. Nicolás debe verificar manualmente la configuración autenticada de la cuenta y guardar capturas o exportaciones sin secretos, con fecha y hash. La pregunta de capacidad que sólo puede responder la llamada sintética controlada es si `minimax/fp8` devuelve exactamente el JSON Schema requerido y confirma endpoint, uso y costo. El plan de primera semana sigue encaminado si la evidencia de cuenta se reúne en paralelo; no corresponde habilitar ni ejecutar todavía.

Decision: `continue_conditionally`.

## 1. Boundary and pre-task snapshot

Repository preconditions passed before the branch was created:

| Check               | Result                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Repository / remote | `Nicosted/vlatam-ai-lab` local root verified; `origin https://github.com/Nicosted/vlatam-ai-lab.git` |
| Refreshed branch    | `main == origin/main == aa6176fb5fa13a156cf5da6fea3134229c3fe400`                                    |
| PR #110             | merged; merge subject `docs: map sandbox blocker root causes (#110)`                                 |
| Worktree            | clean                                                                                                |
| Operator            | `blocked`; 33 blockers; contract `1.1.0`                                                             |
| Snapshot hash       | `d9a9e1da88aaa43035522a80ee36a46a5b33dda48f5d01c1a90450c223dc2b64`                                   |
| Root-cause matrix   | `reports/ai-lab-sandbox-blocker-root-cause-matrix-2026-07-15.json`; RC-01–RC-13                      |
| RC-01–RC-05         | all open                                                                                             |

The snapshot recorded zero enabled providers, disabled adapter/model/route/profile, disabled budget, active kill switch, absent secret, no issued policy, no consumption attempt, and no gateway or transport invocation.

This assessment made public read-only `GET` requests to official documentation and metadata only. It did not authenticate, access account pages, call a completion/generation endpoint, or perform model inference.

## 2. Official sources reviewed

Each source has a retrieval timestamp, applicability, conflict state, reviewer status, and raw-content SHA-256 in the companion [machine-readable inventory](./ai-lab-openrouter-minimax-external-evidence-2026-07-15.json).

1. [OpenRouter M2.7 endpoint metadata](https://openrouter.ai/api/v1/models/minimax/minimax-m2.7/endpoints)
2. [OpenRouter Models API](https://openrouter.ai/api/v1/models)
3. [OpenRouter ZDR endpoints API](https://openrouter.ai/api/v1/endpoints/zdr)
4. [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)
5. [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs)
6. [OpenRouter ZDR](https://openrouter.ai/docs/guides/features/zdr)
7. [OpenRouter data collection](https://openrouter.ai/docs/guides/privacy/data-collection)
8. [OpenRouter provider logging](https://openrouter.ai/docs/guides/privacy/provider-logging/)
9. [OpenRouter API overview](https://openrouter.ai/docs/api/reference/overview)
10. [OpenRouter router metadata](https://openrouter.ai/docs/guides/features/router-metadata)
11. [OpenRouter FAQ](https://openrouter.ai/docs/faq)
12. [OpenRouter privacy policy](https://openrouter.ai/privacy)
13. [MiniMax pay-as-you-go pricing](https://platform.minimax.io/docs/guides/pricing-paygo)
14. [MiniMax API privacy policy](https://platform.minimax.io/protocol/privacy-policy)
15. [MiniMax Open Platform terms](https://platform.minimax.io/protocol/terms-of-service)
16. [MiniMax M2.7 model page](https://www.minimax.io/models/text/m27)

No blog, social post, aggregator, unofficial calculator, search snippet, or generated summary is treated as evidence.

## 3. RC-01 — exact bounded pricing

### Current public prices

OpenRouter returned 14 endpoint records. Prices below are USD per one million tokens and were retrieved at `2026-07-15T18:02:26Z`.

| Endpoint slug       |    Input |   Output |  Cache read | Structured metadata note               |
| ------------------- | -------: | -------: | ----------: | -------------------------------------- |
| `mara`              |     0.24 |     0.96 | not exposed | status `-2`; not the intended route    |
| `deepinfra/fp8`     |     0.25 |     1.00 |        0.05 | third party                            |
| `novita/fp8`        |     0.27 |     1.08 |       0.054 | discounted third party                 |
| `morph`             |    0.279 |     1.20 | not exposed | third party                            |
| `minimax/fp8`       | **0.30** | **1.20** |    **0.06** | intended first-party standard endpoint |
| `minimax/highspeed` |     0.60 |     2.40 |        0.06 | first-party high-speed variant         |

The remaining endpoint offers and exact slugs are preserved in JSON. The aggregate Models API reports 0.30/1.20/0.06, which matches the intended first-party standard endpoint but not every provider. MiniMax direct pricing independently publishes 0.30 input, 1.20 output, 0.06 cache read, and 0.375 cache write. OpenRouter does not expose a cache-write rate on `minimax/fp8`, so the direct cache-write figure is not promoted into an OpenRouter route price.

No separate reasoning-token or per-request charge is exposed for this endpoint. The model declares mandatory reasoning, so the absence of a separate rate is recorded rather than interpreted. OpenRouter says inference rates pass through without markup; its public FAQ separately states a 5.5% credit-purchase fee with USD 0.80 minimum and separate BYOK mechanics. The applicable account plan was not inspected.

`provider.max_price` is documented as a hard filter: unlike performance preferences, it prevents execution when no qualifying price is available. Non-streaming responses provide usage and an authenticated generation record can provide provider, token, and final cost metadata after execution. No claim is made that a pre-execution estimate is final.

Closure: `partially_resolved`. Exact current intended-route list rates and a fail-closed ceiling are public, but account commercial posture, governed reviewed pricing, post-run final cost, and mutable endpoint freshness remain open.

## 4. RC-02 — routing and endpoint identity

The 14 public endpoint slugs were:

`mara`, `deepinfra/fp8`, `novita/fp8`, `morph`, `gmicloud/fp8`, `minimax/fp8`, `atlas-cloud/fp8`, `fireworks`, `together/fp4`, `sambanova/minimax-m2.7-dedicated`, `deepinfra/turbo`, `groq`, `minimax/highspeed`, and `sambanova`.

OpenRouter documents full endpoint-slug targeting. Base slug `minimax` would match both standard and high-speed endpoints, so the future policy must use full slug `minimax/fp8`. `only` supplies the allowlist, `order` makes the single choice explicit, and `allow_fallbacks: false` forbids another provider. A single `model` value must be used; no `models` fallback array or alternative model is permitted.

Proposed future request controls, not executable configuration:

```json
{
  "model": "minimax/minimax-m2.7",
  "provider": {
    "only": ["minimax/fp8"],
    "order": ["minimax/fp8"],
    "allow_fallbacks": false,
    "require_parameters": true,
    "data_collection": "deny",
    "zdr": true,
    "max_price": { "prompt": 0.3, "completion": 1.2 }
  }
}
```

OpenRouter normalizes requests and may transform parameters for upstream APIs. Opt-in router metadata can report provider attempts and the selected provider, but some early errors and internal failures omit it, and cached replies strip it. Endpoint availability and routing metadata can change after capture. If the exact endpoint is unavailable or filtered, the intended behavior is a no-provider error with zero alternative providers or models.

Closure: `partially_resolved`. Public evidence now supplies the full endpoint slug and fail-closed design; actual served endpoint identity remains observable only during the separately authorized controlled call.

## 5. RC-03 — privacy and data handling

### OpenRouter

OpenRouter publicly states that prompt/response logging and product-improvement use are opt-in and off by default. It stores request metadata without prompt/response content and describes limited anonymous prompt categorization through a ZDR model. Its privacy policy uses purpose/legal-need retention rather than a fixed metadata period. EU in-region routing is enterprise and account-specific. None of these public defaults proves this workspace's settings.

### MiniMax first-party endpoint

MiniMax terms permit processing client data to deliver the service, maintain/troubleshoot/support it, and comply with law. The API privacy policy describes service improvement, security, vendors, cross-border processing, and general US storage, but does not publish for the OpenRouter `minimax/fp8` endpoint:

- a bounded prompt/completion retention period;
- a complete no-training or no-model-improvement commitment;
- bounded human access or abuse-log rules;
- the exact subprocessor chain;
- the inference-processing country or data-residency commitment;
- an endpoint-specific deletion guarantee.

OpenRouter's endpoint labels are recorded as `provider_asserted_unverified`, not substituted for MiniMax primary policy.

Closure: `requires_provider_confirmation`.

## 6. RC-04 — ZDR and account posture

OpenRouter defines ZDR as a provider not storing request data for any period, while explicitly treating in-memory prompt caching as non-retention. ZDR may be enforced at account, guardrail, model-group, or request level; per-request `provider.zdr: true` can only strengthen applicable settings. The public ZDR API listed 13 M2.7 endpoints, including `minimax/fp8`.

That list establishes OpenRouter's current classification only. It does not prove the user's account configuration, an endpoint-specific MiniMax contract, absence of router metadata, or processing geography. No authenticated account export or screenshot was found or accessed.

Closure: `requires_authenticated_account_evidence`.

## 7. RC-05 — strict structured output

The aggregate model record advertises both `response_format` and `structured_outputs`. The exact `minimax/fp8` endpoint advertises `response_format` but omits `structured_outputs`. OpenRouter's general documentation supports `response_format.type: json_schema`, `strict: true`, and `additionalProperties: false` for compatible routes and recommends `require_parameters: true`.

This does not prove that the exact endpoint accepts strict mode, implements all required schema keywords, fails deterministically, or returns semantically conformant output after OpenRouter transformation. `require_parameters` can filter on the declared request parameter; it cannot prove conformance. Response Healing is excluded from the first call because it mutates output and adds another processing/attribution path.

Closure: `requires_controlled_capability_execution`.

## 8. Contradictions, limitations, and decision

Material contradictions:

- USD 0.24/0.96 is the current cheapest provider offer, not the intended MiniMax first-party route; aggregate and intended-route pricing are USD 0.30/1.20.
- Aggregate model metadata advertises `structured_outputs`, while `minimax/fp8` does not.
- OpenRouter lists `minimax/fp8` as ZDR, while public MiniMax policy does not expose an endpoint-specific ZDR term.

All five investigated root causes remain blocked in the Operator because this report is unreviewed and does not change governed evidence, pricing, ZDR, activation, or runtime configuration.

| Root cause | Closure decision                           |
| ---------- | ------------------------------------------ |
| RC-01      | `partially_resolved`                       |
| RC-02      | `partially_resolved`                       |
| RC-03      | `requires_provider_confirmation`           |
| RC-04      | `requires_authenticated_account_evidence`  |
| RC-05      | `requires_controlled_capability_execution` |

Candidate decision: `continue_conditionally`. OpenRouter/M2.7 remains worth advancing because endpoint targeting, bounded prices, and ZDR filtering are publicly available. It must not execute until authenticated account evidence and provider/privacy review are complete; strict capability remains a controlled first-call observation risk.

## 9. Account-evidence checklist for Nicolás or the account owner

1. Capture the current Privacy settings page for the applicable organization/workspace.
2. Show the paid-model data-collection/training setting and non-frontier ZDR setting.
3. Show applicable guardrail ZDR scopes and provider allowlist/ignore settings.
4. Show workspace/project and API-key budget configuration without balances or keys.
5. Show current M2.7 endpoint availability and data-policy labels, including `minimax/fp8`.
6. Record the applicable organization/workspace identity, UTC timestamp, and page URLs.
7. Hash each screenshot/export with SHA-256 and preserve the original locally for review.
8. Redact API keys, bearer tokens, cookies, personal data, billing details, and credit balance.
9. Confirm in writing that no API key or credit balance is visible.

This checklist is human-executable. Codex did not log in, collect it, or alter settings.

## 10. Freshness and validation

Re-review deadlines are fail-closed:

- endpoint inventory, pricing, routing, and ZDR feed: `2026-07-22T18:02:26Z`;
- technical documentation: `2026-08-14T18:02:26Z`;
- privacy policies and terms: `2026-10-13T18:02:26Z`.

The companion deterministic test validates JSON parsing, unique source IDs and URLs, official publisher/classification allowlists, timestamps and deadline ordering, SHA-256 format, exact candidate/endpoint binding, RC-01–RC-05 coverage, required missing-evidence/checklist fields, contradiction preservation, conservative closure values, non-executable invariants, and absence of credential-shaped values or absolute local paths.

| Validation            | Result                       |
| --------------------- | ---------------------------- |
| Evidence report test  | 9/9 passed; 1 suite          |
| Operator tests        | 33/33 passed; 3 suites       |
| Architecture tests    | 50/50 passed; 7 suites       |
| Full repository suite | 1001/1001 passed; 146 suites |
| Typecheck             | passed                       |
| Build                 | passed                       |
| Scoped ESLint         | passed; zero findings        |
| Scoped Prettier       | passed                       |

The first sandboxed full-suite attempt passed 999/1001; two nested CLI tests were unable to create `tsx` IPC pipes. The unchanged suite was rerun outside the filesystem sandbox and passed 1001/1001. No source change was made to obtain that result.

## 11. Mandatory post-task state

The final Operator snapshot must remain `blocked` unless independent repository evidence changes. Activation review remains non-executable; provider, model, route, profile, and adapter remain disabled; budget remains disabled; kill switch remains active; secret remains not configured and was not accessed; no authorization was issued or consumed; gateway, adapter, harness, and transport were not invoked; no model inference occurred; no account setting changed; no human approval was fabricated; and no production, customer, or `vlatam-global` data or repository was accessed or modified.

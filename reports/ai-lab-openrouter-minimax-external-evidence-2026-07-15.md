# OpenRouter / MiniMax M2.7 external evidence assessment — 2026-07-15

Status: `unreviewed`; public official and repository evidence only; execution remains disabled.

## CEO summary (ES)

OpenRouter/MiniMax M2.7 sigue siendo un candidato rápido para avanzar, pero sólo de forma condicional. Ya sabemos que la captura oficial de OpenRouter contenía 14 endpoints y permite apuntar al endpoint propio de MiniMax con el identificador `minimax/fp8`, sin fallback y con topes de precio. Para esa ruta, el precio publicado en la captura es USD 0,30 por millón de tokens de entrada, USD 1,20 por millón de salida y USD 0,06 por millón de lectura de caché. La fila rotulada `mara` mostraba USD 0,24/0,96, pero no se atribuye con mayor precisión sin un registro oficial exacto capturado por separado.

Las diferencias de pocos centavos no deben decidir el proveedor. El objetivo es una automatización confiable y auditable: un endpoint más caro puede justificarse si mejora exactitud, privacidad, cumplimiento del esquema o ahorro de tiempo del operador. El costo debe permanecer acotado, observable y predecible. El techo de USD 0,05 para la primera llamada sintética es un control técnico de seguridad, no la futura política comercial; esa política deberá valorar el beneficio para el cliente, la complejidad documental, latencia, exactitud y horas humanas ahorradas.

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

### Published pricing layers

The exact endpoint feed returned 14 records at `2026-07-15T18:02:26Z`. Prices below are USD per one million tokens. This is a time-sensitive captured inventory, not a stable endpoint-count contract.

| Endpoint slug       |    Input |   Output |  Cache read | Structured metadata note                                        |
| ------------------- | -------: | -------: | ----------: | --------------------------------------------------------------- |
| `mara`              |     0.24 |     0.96 | not exposed | captured row label; status `-2`; identity attribution qualified |
| `deepinfra/fp8`     |     0.25 |     1.00 |        0.05 | third party                                                     |
| `novita/fp8`        |     0.27 |     1.08 |       0.054 | discounted third party                                          |
| `morph`             |    0.279 |     1.20 | not exposed | third party                                                     |
| `minimax/fp8`       | **0.30** | **1.20** |    **0.06** | intended first-party standard endpoint                          |
| `minimax/highspeed` |     0.60 |     2.40 |        0.06 | first-party high-speed variant                                  |

The exact endpoint feed, its UTC retrieval timestamp, and its SHA-256 evidence hash are authoritative for endpoint claims in this report. The aggregate Models API reports 0.30/1.20/0.06, which happens to match the intended first-party standard endpoint but does not describe every endpoint and must not substitute for exact endpoint pricing. MiniMax direct pricing independently publishes 0.30 input, 1.20 output, 0.06 cache read, and 0.375 cache write. OpenRouter does not expose a cache-write rate on `minimax/fp8`, so the direct cache-write figure is not promoted into an OpenRouter route price.

No separate reasoning-token or per-request charge is exposed for this endpoint. The model declares mandatory reasoning, so the absence of a separate rate is recorded rather than interpreted. OpenRouter says inference rates pass through without markup; its public FAQ separately states a 5.5% credit-purchase fee with USD 0.80 minimum and separate BYOK mechanics. The applicable account plan was not inspected.

`provider.max_price` is documented as a hard filter: unlike performance preferences, it prevents execution when no qualifying price is available. Exact pricing drift must still fail closed when it exceeds an approved ceiling. Non-streaming responses provide usage and an authenticated generation record can provide provider, token, and final cost metadata after execution. No claim is made that a pre-execution estimate is final.

### Operational cost bands

These unreviewed bands classify estimated model cost per bounded operation. They are governance bands, not model-ranking scores, and they do not resolve the governed pricing-policy blocker.

| Band                                | Estimated model cost per bounded operation |
| ----------------------------------- | ------------------------------------------ |
| `preferred`                         | USD 0.00 through USD 0.05, inclusive       |
| `acceptable`                        | above USD 0.05 through USD 0.25            |
| `review_required`                   | above USD 0.25 through USD 1.00            |
| `commercial_justification_required` | above USD 1.00                             |

The USD 0.05 sandbox hard ceiling applies only to the first controlled synthetic call. It is disabled, is not an authorization, and is distinct from the operational bands and any future commercial policy. Future customer-operation economics must be assessed against customer value, document complexity, latency, accuracy, and human time saved. An endpoint must not be selected merely because it is cheaper: predictable bounded cost is more important than the lowest finite cost.

Closure: `partially_resolved`. Exact current intended-route list rates and a fail-closed ceiling are public, but account commercial posture, governed reviewed pricing, post-run final cost, and mutable endpoint freshness remain open.

## 4. RC-02 — routing and endpoint identity

The 14 endpoint slugs in the captured official snapshot were:

`mara`, `deepinfra/fp8`, `novita/fp8`, `morph`, `gmicloud/fp8`, `minimax/fp8`, `atlas-cloud/fp8`, `fireworks`, `together/fp4`, `sambanova/minimax-m2.7-dedicated`, `deepinfra/turbo`, `groq`, `minimax/highspeed`, and `sambanova`.

Endpoint inventories are mutable snapshots: the count is not a stable contract, and availability or metadata may change. Future activation must refresh the exact endpoint metadata before authorization and bind the retrieved record, UTC timestamp, and evidence hash. Aggregate model pricing may never stand in for that exact endpoint record.

OpenRouter documents full endpoint-slug targeting. Base slug `minimax` would match both standard and high-speed endpoints, so any future policy considering that route must use full slug `minimax/fp8`. `only` supplies the allowlist, `order` makes the single choice explicit, and `allow_fallbacks: false` forbids another provider. A single `model` value must be used; no `models` fallback array or alternative model is permitted.

### Ranked endpoint decision framework

The criteria are ranked in this order; pricing is deliberately last and operates as a bounded-cost gate rather than a cheapest-endpoint score:

1. strict structured-output capability;
2. privacy and ZDR evidence;
3. exact endpoint pinning;
4. disabled fallbacks;
5. required-parameter enforcement;
6. observable served identity;
7. predictable latency;
8. bounded pricing within an approved band.

| Endpoint       | Current assessment       | Evidence-preserving conclusion                                                                                                                                                                                 |
| -------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `minimax/fp8`  | `requires_more_evidence` | Exact pinning, fail-closed controls, served-identity observation, and captured exact pricing are available; strict schema capability, upstream endpoint-specific ZDR, and predictable latency remain unproven. |
| `fireworks`    | `requires_more_evidence` | The exact slug is captured; the higher-ranked strict-output, privacy/ZDR, parameter-enforcement, identity, latency, and exact bounded-operation pricing evidence is insufficient here.                         |
| `together/fp4` | `requires_more_evidence` | The exact slug is captured; the higher-ranked strict-output, privacy/ZDR, parameter-enforcement, identity, latency, and exact bounded-operation pricing evidence is insufficient here.                         |

Assessment outcomes: `preferred_for_controlled_test` — unassigned; `viable_alternative` — unassigned; `requires_more_evidence` — all three candidates; `not_recommended` — unassigned. The report therefore preserves uncertainty and does not select a final endpoint. Incomplete evidence is not grounds to reject an endpoint solely on price.

Illustrative controls for the previously intended route, not executable configuration and not a final endpoint selection:

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

Material contradictions and qualifications:

- The captured endpoint-feed row labeled `mara` reported USD 0.24/0.96, while aggregate and intended-route pricing were USD 0.30/1.20. No stronger Mara provider attribution is made without a separately captured exact official endpoint record, and the lower rate is not an endpoint-selection reason.
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

Candidate decision: `continue_conditionally`. OpenRouter/M2.7 remains worth advancing because endpoint targeting, bounded prices, and ZDR filtering are publicly available. This is not a final endpoint recommendation. It must not execute until authenticated account evidence and provider/privacy review are complete; strict capability remains a controlled first-call observation risk.

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

The companion deterministic test validates JSON parsing, unique source IDs and URLs, official publisher/classification allowlists, timestamps and deadline ordering, SHA-256 format, exact candidate/endpoint binding, RC-01–RC-05 coverage, ordered non-overlapping cost bands, sandbox/commercial separation, ranked endpoint criteria, mutable snapshot bindings, required missing-evidence/checklist fields, contradiction preservation, conservative closure values, non-executable invariants, and absence of credential-shaped values or absolute local paths.

| Validation            | Result                       |
| --------------------- | ---------------------------- |
| Evidence report test  | 13/13 passed; 1 suite        |
| Operator tests        | 33/33 passed; 3 suites       |
| Architecture tests    | 50/50 passed; 7 suites       |
| Full repository suite | 1005/1005 passed; 146 suites |
| Typecheck             | passed                       |
| Build                 | passed                       |
| Scoped ESLint         | passed; zero findings        |
| Scoped Prettier       | passed                       |

The first sandboxed full-suite attempt passed 999/1001; two nested CLI tests were unable to create `tsx` IPC pipes. The unchanged suite was rerun outside the filesystem sandbox and passed 1001/1001. No source change was made to obtain that result.

## 11. Mandatory post-task state

The final Operator snapshot must remain `blocked` unless independent repository evidence changes. Activation review remains non-executable; provider, model, route, profile, and adapter remain disabled; budget remains disabled; kill switch remains active; secret remains not configured and was not accessed; no authorization was issued or consumed; gateway, adapter, harness, and transport were not invoked; no model inference occurred; no account setting changed; no human approval was fabricated; and no production, customer, or `vlatam-global` data or repository was accessed or modified.

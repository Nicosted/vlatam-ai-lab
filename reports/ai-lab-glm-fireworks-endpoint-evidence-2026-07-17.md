# GLM 5.2 — evidencia del endpoint estándar Fireworks

Fecha de observación: 2026-07-17  
Estado: bloqueado; candidato técnico seleccionado, sin autorización ni ejecución

## Resumen ejecutivo para CEO

El operador observó metadatos oficiales de OpenRouter mediante consultas autenticadas de solo lectura. No hubo inferencia ni cambio de configuración de cuenta. La evidencia identifica tres conceptos distintos: el modelo `z-ai/glm-5.2`, el slug de catálogo del proveedor `fireworks`, y el tag del endpoint estándar `fireworks`. La identidad visible del endpoint es `Fireworks | z-ai/glm-5.2-20260616`.

Se seleccionó Fireworks estándar porque figuró en la lista ZDR observada, declaró `response_format` y `structured_outputs`, y tuvo el mismo precio de entrada y salida que Z.AI con menor precio de lectura de caché. Fireworks fast fue rechazado porque su tag es `fireworks/fast` y cuesta más. Z.AI no fue seleccionado para esta extracción porque los metadatos observados no declararon `structured_outputs`. Cloudflare permanece bloqueado porque no apareció en la lista ZDR observada para este modelo.

El costo máximo teórico sin caché para 4.000 tokens de entrada y 1.200 de salida es USD `0.01088`, por debajo del techo duro de USD `0.05`. Esto cierra únicamente las brechas técnicas de identidad exacta del candidato, presencia ZDR en OpenRouter al momento observado, capacidad declarada de salida estructurada y precio específico del endpoint. No aprueba la conformidad real con el esquema ni resuelve revisiones independientes, legales, de seguridad o de evidencia.

El próximo paso exacto antes de una primera llamada real es que revisores humanos independientes acepten los artefactos y hashes actuales, completen la revisión legal y de seguridad, y acepten el caso de oro mediante ejecución controlada separadamente autorizada. Solo después podría proponerse una autorización de un solo uso; este cambio no la emite.

## Provenance and identity contract

Canonical evidence artifact:

- ID: `openrouter.glm-5.2.fireworks-endpoint-metadata-evidence.v1`
- SHA-256: `dd926ad069341a5c8174f7a7180349c857151134b10e6b03a25bc7882d0b7fb1`
- Source type: operator-performed authenticated read-only metadata lookup
- Official paths: `GET /api/v1/models/z-ai/glm-5.2/endpoints`, `GET /api/v1/providers`, and `GET /api/v1/endpoints/zdr`
- Raw metadata persisted: no
- API key persisted or accessed by the agent: no
- Agent-executed authenticated lookup: no
- Inference performed: no
- Account settings modified: no

Identity fields are deliberately separate:

| Field                               | Bound value                          |
| ----------------------------------- | ------------------------------------ |
| Model ID                            | `z-ai/glm-5.2`                       |
| Provider catalog slug               | `fireworks`                          |
| Endpoint tag                        | `fireworks`                          |
| Endpoint display identity           | `Fireworks \| z-ai/glm-5.2-20260616` |
| Required returned provider identity | `Fireworks`                          |

## Candidate comparison

| Candidate                         | ZDR observation     | Structured-output metadata                             | Decision                                   |
| --------------------------------- | ------------------- | ------------------------------------------------------ | ------------------------------------------ |
| Fireworks standard (`fireworks`)  | present, status `0` | `response_format`, `structured_outputs`                | selected                                   |
| Fireworks fast (`fireworks/fast`) | present, status `0` | `response_format`, `structured_outputs`                | rejected: higher price and wrong bound tag |
| Z.AI (`z-ai/fp8`)                 | present, status `0` | `response_format`; no `structured_outputs` declaration | not selected                               |
| Cloudflare (`cloudflare`)         | absent              | structured output appeared in the general list         | ineligible for this pilot                  |

ZDR-list presence is treated only as OpenRouter route eligibility at the observation timestamp. It does not establish upstream contractual retention, processing geography, legal adequacy, or permanent eligibility.

## Exact routing and fail-closed controls

The future candidate request is bound to:

- `model: "z-ai/glm-5.2"`
- `provider.only: ["fireworks"]`
- `provider.order: ["fireworks"]`
- `provider.allow_fallbacks: false`
- `provider.require_parameters: true`
- `provider.data_collection: "deny"`
- `provider.zdr: true`
- zero retries and no fallback
- exact returned provider identity `Fireworks`
- exact returned model identity `z-ai/glm-5.2`

Missing or substituted provider/model metadata, `fireworks/fast`, Z.AI, Cloudflare, malformed JSON, missing structured output, or schema-validation failure all fail closed. Runtime schema conformance remains pending until a separately authorized controlled call.

## Pricing

| Unit       |    USD/token |
| ---------- | -----------: |
| Prompt     |  `0.0000014` |
| Completion |  `0.0000044` |
| Cache read | `0.00000014` |

Maximum uncached request cost:

`4000 × 0.0000014 + 1200 × 0.0000044 = 0.01088 USD`

The hard ceiling remains USD `0.05`; the request fails closed if its maximum estimate exceeds that value. Pricing is metadata-verified for the selected endpoint at the observation timestamp, not permanently guaranteed. The budget remains disabled.

## Blocker delta

Technical blockers closed or narrowed by metadata:

- exact provider catalog slug missing;
- exact endpoint tag missing;
- OpenRouter ZDR endpoint eligibility unverified at the observation timestamp;
- structured-output capability metadata unverified;
- endpoint-specific pricing metadata missing;
- exact candidate route unspecified.

Blockers still pending:

- controlled schema-conformance and final gold-case acceptance;
- independent approval;
- legal review;
- security review;
- evidence-review approval;
- upstream contractual retention and training-use conclusions;
- processing geography and legal adequacy;
- enabled runtime pricing contract and budget;
- authorization issuance and single-use consumption;
- runtime activation and any real call.

Nicolás remains provider account owner, runtime operator, incident owner, and kill-switch owner. No independent approval is inferred or recorded.

## Hash-bound artifacts

| Artifact                   | SHA-256                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| External metadata evidence | `dd926ad069341a5c8174f7a7180349c857151134b10e6b03a25bc7882d0b7fb1` |
| Pricing candidate          | `e54424d1e7526628ae551d096c3ae8cdb8b66c3734c04f60070b37d8561f6841` |
| ZDR review candidate       | `614beb3be6fc6158a83744791742efbf7fa1a79b402a8d886e74c3793c778865` |
| Model registry entry       | `c003f49b14893bc2e477ec3d01d191822f07aa7f65e8a78b3ce3ebdbfc45f8f1` |
| Route registry record      | `b1fb5f5591659ca9fb222f3115234df427718e3a65c1cfcdd127cbdac9a88151` |
| Execution profile          | `5dc48fa5584e1326293af73f392256c4dff07b6bd649c47436088d17c7650291` |
| Operation binding          | `08c1b01914d39651f9d8311a40391f3a2ef3649ae039ecd27b013f81bfd329c0` |
| Readiness dossier          | `922f80bb9c2291dcb6490892d7f5b78283a6162a694c7ab2da8af431358a150c` |
| Supervised proposal        | `1a130b72dc8004fd7e8c9dd05a00c4321bf95446ab015b85b5d5e3683f432372` |
| First-run runtime          | `b40ac7b001331424725f87797b9f7df14daee2ae27e89e1b566d0920b6f9243d` |
| Activation review          | `aff228cc91fc5e43887c13cd2999cfb0a4b2f0ff36c64bf48de9e109cb36e08f` |

## Mandatory safety state

GLM model, route, profile, adapter, and budget remain disabled. The kill switch remains active. No authorization was issued or consumed. Gateway and transport were not invoked. No production/customer system, original PDF, local redacted artifact, raw provider metadata, credential value, or commercial source text was accessed or persisted by this change.

## Validation record

- Focused GLM and registry tests: 76 passed, 0 failed.
- Operator tests: 33 passed, 0 failed.
- OpenRouter adapter, gateway, resolution, and authorization tests: 112 passed, 0 failed.
- Architecture tests: 50 passed, 0 failed.
- Full suite: 1,028 passed, 0 failed.
- Typecheck: passed.
- Build: passed.
- Scoped ESLint and Prettier: passed.
- JSON parsing, canonical hash checks, credential scan, absolute-path scan, PDF/binary scan, commercial-text addition scan, and `git diff --check`: passed.
- Final Operator snapshot: `blocked`; 46 total blockers; MiniMax 33; GLM 13; read-model hash `610c474887e5ba6789ae49332d682440a7170a176c9fdf8793117408d2621a8d`.

No unrelated repository-wide validation debt was observed. The sandbox-only first full-suite attempt produced two tsx IPC permission errors; the required outside-sandbox rerun passed all 1,028 tests without network access.

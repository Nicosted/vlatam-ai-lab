# GLM 5.2 first-run governance evidence report — 2026-07-17

## Resumen ejecutivo para CEO

El artefacto redactado de `VLATAM-PILOT-001` fue informado por el operador como validado localmente y permanece fuera de Git. Codex no lo abrió, copió, imprimió ni persistió. Este cambio registra únicamente su tipo esperado, la atestación de redacción requerida y el SHA-256 del documento original: `5883515292e783e48bcd19918acb930827d3dbd054c649186407ac48b89e5f10`.

Este PR agrega una cadena de gobierno exclusiva para GLM 5.2: dossier de preparación, paquete de evidencia externa, propuesta de habilitación supervisada, configuración de primera ejecución, revisión de activación, aceptación de capacidad, política de precios, revisión ZDR y vínculo no secreto de la operación. También corrige el Operator para calcular un hash canónico distinto por perfil y reportar MiniMax y GLM por separado.

La ejecución sigue bloqueada. El slug exacto del endpoint proveedor **no está probado**. La elegibilidad ZDR específica del endpoint **no está probada**. El precio publicado para el modelo permite una estimación acotada de USD 0,00732 bajo los límites de 4.000 tokens de entrada y 1.200 de salida, pero el costo específico de la ruta continúa sin verificar porque los precios varían por proveedor. Siguen pendientes las revisiones independiente, legal, de seguridad y de evidencia, además de la aceptación controlada de capacidad. Nicolás queda registrado como dueño de la cuenta, operador de runtime, dueño de incidentes y dueño del kill switch; esos roles no sustituyen las aprobaciones independientes pendientes.

Antes de una llamada real se debe: (1) obtener metadata oficial y revisar el slug exacto del endpoint sin inferencia; (2) verificar su elegibilidad ZDR específica; (3) revisar precio y soporte de salida estructurada de ese endpoint; (4) ejecutar y aceptar un caso controlado permitido; (5) completar las revisiones de evidencia, seguridad y legal; (6) registrar un aprobador independiente; (7) actualizar los hashes y revisar el diff; (8) habilitar explícitamente modelo, ruta, perfil, adapter y presupuesto mediante otro cambio aprobado; (9) desactivar el kill switch de forma controlada; (10) emitir una autorización durable de un solo uso con vencimiento; y recién entonces (11) ejecutar manualmente una única llamada supervisada.

## Snapshot local y alcance

- Repositorio: `Nicosted/vlatam-ai-lab`.
- Rama: `feat/ai-lab-glm-first-run-governance`.
- Base verificada antes de editar: `3481e2ee20b39be8de7d03ed08839804006eee24`.
- Worktree inicial: limpio.
- `.env.local`: ignorado; ningún archivo `.env*` fue leído.
- Snapshot inicial del Operator: `blocked`; adapter y presupuesto deshabilitados; kill switch activo; cero autorizaciones emitidas o consumidas; gateway y transporte no invocados.
- Alcance: archivos locales de gobierno, código de lectura/preflight y tests. No se hizo inferencia ni se consultó metadata autenticada.

## Corrección de hashes por perfil

Dominio canónico explícito: `vlatam-ai-lab:execution-profile:canonical-json:v1`. El hash cubre el registro completo del perfil con JSON estable y claves ordenadas.

| Perfil                                                        | Hash                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `openrouter.minimax-m2.7.normative-extraction.candidate`      | `335bd24f9cb4aa573b65ef3f6d5c2ebcf19d150441bf7bc7d14421e7d88c8720` |
| `openrouter.glm-5.2.commercial-document-extraction.candidate` | `2b1df9f521ae74191d16415a0369cea5c0ae6a01b93c62aad865a79fa16c9322` |

El binding histórico del runtime MiniMax permanece en `74886e256dbd672c4825dbf485378e56db35e354605c1a4ec90e812c4e492641`. El preflight MiniMax continúa comparando ese runtime contra su binding MiniMax; no se lo reconfigura ni se lo vincula a GLM.

## Artefactos GLM canónicos

| Artefacto                    | ID                                                                | Hash                                                               |
| ---------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| Dossier de preparación       | `openrouter.glm-5.2.first-run-readiness.v1`                       | `d8010809d1ad6e78edbcd8b158fcb4e1abd85e3183ffa0943f904e930dd1352b` |
| Evidencia externa            | `openrouter.glm-5.2.external-evidence.v1`                         | `4631f0c278aab214074f4ed7d5c2a61dc6d86ddde60e75d929a235de71fc6325` |
| Propuesta supervisada        | `openrouter.glm-5.2.supervised-enablement-proposal.v1`            | `7134a05cd073b881764b4719a22b8db87cbd1765dbb1884b96ea0db04d69fd78` |
| Runtime de primera ejecución | `openrouter.glm-5.2.vlatam-pilot-001.first-run-runtime.v1`        | `eeb5d48b65d37f200032454cd26150ef937587c26af250f8ea83bd3d30756c24` |
| Revisión de activación       | `openrouter.glm-5.2.vlatam-pilot-001.activation-review.v1`        | `eecdb86a8e3afe45ff3f9a5bd89a8a901428b06f91b235ffc09ee117c5ad7672` |
| Aceptación de capacidad      | `openrouter.glm-5.2.commercial-document.controlled-acceptance.v1` | `8ad88a86cad1f78020c8e3b24b9ba47ea001749217f30eefca0744ca31da35b4` |
| Política de precios          | `openrouter.glm-5.2.first-run-pricing-policy-candidate.v1`        | `066a50126273d92647ece893205b1dbda33f5dcef616241d9fb83c1d63fe06b7` |
| Revisión ZDR                 | `openrouter.glm-5.2.zdr-account-review-candidate.v1`              | `627b3690424df272c1c0f04584e83ab6fa386deaffb971444f2b8fbf47bb91d9` |
| Vínculo de operación         | `openrouter.glm-5.2.vlatam-pilot-001.operation-binding.v1`        | `ec533bda81ba23ea14641da11aa523ca6d6a0c82da01b3b9f0be2c12e7c712d3` |

Todos usan un dominio `v1`, excluyen únicamente su campo de hash propio al calcularlo, están vinculados por hashes en orden de dependencia y declaran `execution_authority: false`.

## Evidencia oficial de OpenRouter

- Modelo exacto y precio publicado a nivel modelo: [GLM 5.2 API](https://openrouter.ai/z-ai/glm-5.2/api).
- Controles oficiales `provider.only`, `provider.order`, `allow_fallbacks`, `require_parameters`, `data_collection` y `zdr`: [Provider Routing](https://openrouter.ai/docs/guides/routing/provider-selection).
- Comportamiento de la plataforma ZDR y distinción de políticas por endpoint: [Zero Data Retention](https://openrouter.ai/docs/guides/features/zdr).

No se utilizó Auto Router, no se ordenó por precio y no se adivinó un slug. No se ejecutó el endpoint de metadata autenticada ni ningún endpoint de inferencia.

## Precio y privacidad

El candidato registra USD 0,93/M tokens de entrada y USD 3,00/M de salida observados en la página oficial del modelo. El cálculo de techo con 4.000 tokens de entrada y 1.200 de salida es `0.004 × 0.93 + 0.0012 × 3.00 = USD 0.00732`. El hard ceiling operativo permanece en USD 0,05 y una desviación debe bloquear antes del transporte. La evidencia es suficiente para acotar el candidato, pero no para marcar el costo de un endpoint específico como verificado.

La revisión ZDR separa: configuración de cuenta informada por el operador; elegibilidad específica del endpoint; comportamiento documentado de OpenRouter; comportamiento del proveedor upstream; y hechos contractuales/geográficos aún no resueltos. La configuración de cuenta por sí sola no concede autoridad.

## Autorización y preflight

El runtime GLM permanece con adapter, modelo, ruta, perfil y presupuesto deshabilitados; kill switch activo; modo manual; reintentos cero; fallback deshabilitado; una solicitud máxima; timeout de 15 segundos; ZDR requerido; recopilación denegada; parámetros requeridos; validación de esquema obligatoria; persistencia de respuesta cruda prohibida.

El preflight devuelve antes de resolver el secreto cuando existe cualquier bloqueo no secreto. La frontera de emisión no produce política mientras preparación o activación sigan bloqueadas. Una política futura queda definida para vincular operación, modelo, ruta, perfil, hashes, techos, expiración y modo de un solo uso. El consumo durable existente ocurre antes del transporte y no se restaura por timeout o error; un segundo consumo es rechazado. No hay bypass por variable de entorno.

## Bloqueos exactos restantes

- Slug exacto del endpoint proveedor no probado ni revisado.
- Elegibilidad ZDR específica del endpoint no probada.
- Precio específico del endpoint variable y no revisado.
- Soporte de salida estructurada del endpoint no verificado.
- Aceptación controlada de capacidad pendiente.
- Revisión independiente pendiente.
- Revisión legal pendiente.
- Revisión de seguridad pendiente.
- Revisión de evidencia pendiente.
- Activación y autorización de un solo uso no emitidas.

## Supuestos y limitaciones

- El estado del artefacto redactado y las configuraciones de cuenta son evidencia declarada por el operador, no verificación independiente.
- No se inspeccionó el archivo redactado local ni el PDF original.
- La consulta pública de documentación no prueba el estado actual de una cuenta ni de un endpoint concreto.
- Los artefactos preparan una revisión humana futura; no autorizan ejecución ni cambios de cuenta.

## Validación

- Tests enfocados GLM, Operator, adapter/gateway y arquitectura: 171 tests, 16 suites, 171 aprobados, 0 fallidos.
- Suite completa: 1.025 tests, 147 suites, 1.025 aprobados, 0 fallidos.
- Typecheck: aprobado.
- Build: aprobado.
- ESLint acotado a TypeScript modificado: aprobado.
- Prettier acotado a archivos modificados: aprobado.
- JSON: 11 archivos parseados correctamente.
- Hashes canónicos: 9 artefactos GLM recalculados y verificados; estado `blocked`.
- Scans de credenciales, paths absolutos/locales, PDF/binarios y fuga de identificadores comerciales: aprobados.
- `git diff --check`: aprobado.
- Snapshot final del Operator: `blocked`, 55 bloqueos totales (33 MiniMax + 22 GLM), cero ejecuciones autorizadas, adapter deshabilitado, presupuesto deshabilitado, kill switch activo, gateway y transporte no invocados.

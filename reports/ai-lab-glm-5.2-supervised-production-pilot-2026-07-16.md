# GLM 5.2 — piloto supervisado de documentos comerciales

Fecha de observación: 2026-07-16

Rama: `feat/ai-lab-supervised-production-pilot`

Base verificada: `abec6c5732e2c6e5c1e60a88878fce0dbd7ec00d`

## Resumen ejecutivo para CEO

Se preparó un camino gobernado y desactivado para evaluar `z-ai/glm-5.2` a través de OpenRouter con un primer documento comercial real. El modelo, la ruta, el perfil, el adaptador y el presupuesto permanecen deshabilitados; el kill switch permanece activo. No se hizo ninguna llamada a OpenRouter, no se consultó ni almacenó ningún secreto y no se accedió a datos de clientes o producción.

La evidencia de cuenta suministrada por el operador quedó registrada como candidata pendiente de revisión, no como prueba independiente de las políticas del proveedor. Registra los límites mensuales, guardrail, proveedores y modelo permitidos, ZDR reportado y controles de contenido, sin capturas, valores de credenciales ni fragmentos secretos.

La primera operación, `VLATAM-PILOT-001`, está preparada pero no ejecutada. El PDF original debe permanecer fuera de Git. Antes de cualquier procesamiento externo, un operador debe generar y suministrar explícitamente un texto o derivado redactado, vinculado al original por SHA-256. El PDF no se envía directamente porque puede contener datos bancarios, datos personales, datos de contacto, domicilios innecesarios u otra información que no debe salir del perímetro local.

La ruta exacta sigue bloqueada. El repositorio no contiene evidencia oficial revisada del slug de endpoint Z.AI que OpenRouter requiere para `provider.only` y `provider.order`; no se lo adivinó. La capacidad de salida estructurada de esa ruta tampoco está verificada y requiere una ejecución controlada posterior, separada y aprobada.

## Contexto de fuente local

- Repositorio confirmado: `Nicosted/vlatam-ai-lab`.
- Worktree inicial: limpio.
- Snapshot Operator inicial: `blocked`, 33 blockers, cero autorizaciones emitidas/consumidas, gateway no invocado y transporte no invocado.
- `.env.local`: ignorado por Git.
- `OPENROUTER_API_KEY`: no leído, impreso, hasheado, registrado ni incluido en artefactos.
- Restricción de evidencia: no se accedió a servicios externos; solo se usó evidencia local y la declaración del operador.

## Identidades preparadas

| Artefacto           | Identidad                                                        | Estado                               |
| ------------------- | ---------------------------------------------------------------- | ------------------------------------ |
| Modelo              | `openrouter.glm-5.2.z-ai-candidate.v1` / `z-ai/glm-5.2`          | `evidence_incomplete`, deshabilitado |
| Ruta                | `openrouter.glm-5.2.z-ai-candidate`                              | sin slug de endpoint, deshabilitada  |
| Perfil              | `openrouter.glm-5.2.commercial-document-extraction.candidate`    | candidato bloqueado, deshabilitado   |
| Evidencia de cuenta | `openrouter.glm-5.2.account-configuration.operator-candidate.v1` | pendiente, no autorizante            |
| Operación           | `VLATAM-PILOT-001`                                               | preparada, no ejecutada              |

Los hashes se calculan con las funciones canónicas del repositorio. La evidencia de plataforma OpenRouter existente no se reutiliza como prueba específica del modelo GLM; las brechas específicas de identidad, precio, ZDR y routing están separadas y marcadas `unknown`/`pending`.

## Controles de la ruta candidata

- Modelo exacto: `z-ai/glm-5.2`.
- Upstream pretendido: `z-ai`.
- Slug exacto de endpoint OpenRouter: desconocido; `provider.only` y `provider.order` no se pueden emitir.
- Auto Router: prohibido.
- Fallback de modelo/proveedor: deshabilitado.
- Reintentos automáticos: cero.
- `require_parameters`: requerido.
- `data_collection`: `deny`.
- ZDR: requerido, todavía no probado para la ruta.
- Verificación posterior de modelo y proveedor: obligatoria; falta de identidad exacta bloquea.
- Solicitudes iniciales: máximo una.
- Techo inicial: USD 0,05.
- Bandas operativas: preferida hasta USD 0,05; aceptable hasta USD 0,25; revisión requerida hasta USD 1,00; por encima de USD 1,00 requiere justificación comercial.
- No se elegirá un endpoint solo por ser más barato.

## Contrato de la primera operación

El original queda fuera de Git y se vincula por SHA-256. Solo se admite entrada `redacted_text` o `redacted_derivative`, con declaración explícita de redacción. Se rechazan el encabezado PDF, correo, teléfono internacional, tarjeta, campos bancarios, titular de cuenta, domicilio personal innecesario y material de credenciales.

La respuesta JSON debe contener: identidad del proveedor, número de factura, fecha, moneda, Incoterm, ítems, total, inconsistencias, información faltante, banderas de riesgo, preguntas para el proveedor y estado de revisión humana `pending`. La respuesta se parsea y valida en memoria; la respuesta cruda no se persiste por defecto.

Validación local posterior, sin inferencia:

```bash
npm run ai:glm:validate-redacted -- /ruta/explicita/vlatam-pilot-001-redacted.json
```

El comando solo valida el artefacto explícitamente suministrado y devuelve metadatos `validated_not_executed`; no resuelve secretos, no emite autorizaciones y no invoca transporte.

## Cableado del ejecutor vivo

`createGlmAdapterForAuthorizedGateway()` reutiliza `OpenRouterAdapter`, `createOpenRouterFetchTransport()` y el proveedor estrecho de secreto. Está diseñado únicamente para registrar el adaptador dentro de `MultiProviderGateway`, detrás de `OpenRouterAuthorizedGatewayCoordinator` y del consumo durable de autorización de un solo uso.

La construcción falla mientras falte cualquier revisión, mientras el kill switch esté activo, mientras adaptador/presupuesto sigan deshabilitados, mientras el slug exacto no esté revisado o mientras la salida estructurada no esté verificada. La construcción no lee secretos. El adaptador solo resolvería el secreto después de sus verificaciones no secretas y haría como máximo una llamada, sin retry ni fallback.

## Aprobaciones y propiedad humana

Nicolás figura como propietario propuesto de cuenta, operador runtime, responsable de incidentes y responsable del kill switch. Esto no equivale a aprobación independiente.

Permanecen pendientes:

1. revisión y aprobación de evidencia;
2. verificación oficial del slug exacto de endpoint Z.AI en OpenRouter;
3. evidencia de precio específica de ruta y confirmación de costo bajo USD 0,05;
4. revisión legal;
5. revisión de seguridad y privacidad/ZDR;
6. aprobación independiente de activación;
7. aceptación del gold case;
8. ejecución controlada de capacidad para salida estructurada;
9. preflight final con adaptador y presupuesto todavía deshabilitados hasta el acto humano de activación;
10. emisión manual de autorización durable de un solo uso para una única solicitud.

## Supuestos y limitaciones

- Las configuraciones de cuenta son hechos declarados por el operador, no prueba contractual ni técnica independiente.
- `z-ai` es la identidad conceptual del upstream, no un slug de endpoint OpenRouter confirmado.
- Context window, máximo de salida, precio exacto, región, retención, training use, límites de tasa y soporte JSON permanecen desconocidos.
- La redacción automática no está autorizada: el operador debe suministrar el derivado redactado explícitamente.
- La configuración MiniMax previa conserva sus identidades y hashes.
- Este trabajo no modifica `vlatam-global` ni habilita integración con producción.

## Validación

- Suite completa: 1020 pruebas aprobadas, 0 fallidas, 0 omitidas.
- Pruebas focalizadas de GLM/registro/perfil: 74 aprobadas, 0 fallidas.
- Pruebas de arquitectura: 50 aprobadas, 0 fallidas.
- Typecheck, build, ESLint focalizado, Prettier focalizado, parseo JSON, hashes canónicos y `git diff --check`: aprobados.
- Snapshot Operator final: `blocked`; 33 blockers activos; 0 autorizaciones emitidas; 0 autorizaciones consumidas; gateway no invocado; transporte no invocado; adaptador y presupuesto deshabilitados; kill switch activo.
- Registro final: dos modelos y dos rutas OpenRouter, ambos deshabilitados. MiniMax conserva los hashes `962d96be424974f40ba95ac3cb0fdc147cc59d90b687e4ee8ca05750cc0fa9cd` y `b70b10f24627e60ca6faf749637f01fba993ad75a404833392fb2ad3dbe7aba1`.
- Escaneo PDF/binario: no se agregó ningún archivo binario ni el PDF de `VLATAM-PILOT-001`. El repositorio ya contenía cinco PDFs VUCE no relacionados bajo `data/sources/vuce/`.
- No se ejecutó inferencia, no se leyó ningún secreto, no se accedió a ningún PDF original y no se contactó OpenRouter ni otro servicio de producción.

Deuda previa no modificada: el lint global reporta 43 errores en crawlers y validadores históricos fuera del alcance; el check global de Prettier reporta 192 archivos preexistentes. El lint y Prettier focalizados en todos los archivos tocados por este piloto pasan sin errores.

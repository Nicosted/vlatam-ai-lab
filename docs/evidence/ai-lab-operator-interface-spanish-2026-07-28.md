# Normalización al español de la interfaz del operador de AI LAB — 2026-07-28

## Contexto del snapshot local

- Base revisada: `origin/main` actualizado en `6a65953fb4c9c6b79e2607099dfa6c1864ebef95` (`feat(ai): simplify AI LAB operator experience (#134)`).
- Rama local: `fix/ai-lab-operator-interface-spanish`.
- Estado inicial: `main` limpio y alineado con `origin/main`.
- Memoria Graphify: no existía `graphify-out/graph.json`; la inspección se realizó directamente sobre las fuentes locales, sin fabricar ni actualizar un grafo.
- Alcance autorizado: presentación local, pruebas y documentación. Sin despliegue, publicación, solicitud de cambios remota ni modificación de servicios externos.

## Delta derivado

La capa visible del operador se normalizó al español en:

- la envolvente de aplicación, identidad, entorno, navegación contextual y pie;
- Inicio, Centro de misiones, Revisiones, Evidencia, Modelos e integraciones y Configuración;
- estados, severidades, categorías, roles, evaluadores y etapas de ejecución;
- vistas de OpenRouter, ARCA, artefactos aprobados, bloqueos, acciones, auditoría, torneos y entornos;
- respuestas visibles de método no permitido y falla segura.

Los nombres propios `OpenRouter`, `Cloudflare`, `Vercel Eve`, `MiniMax` y `ARCA` se conservaron. Los códigos, rutas, hashes e identificadores canónicos permanecen disponibles en elementos técnicos (`code` o detalles desplegables) y no se presentan como etiquetas principales.

## Invariantes comprobados

- Las 29 rutas y sus permisos se mantienen sin cambios.
- Se preservan 46 bloqueos: 33 de severidad alta y 13 de severidad media.
- Se preservan las categorías: 7 de aprobación, 16 de evidencia, 2 legales, 13 de entorno de ejecución y 8 de seguridad/privacidad.
- Se preservan 6 acciones humanas pendientes.
- Los interruptores de seguridad AI-131, AI-132 y AI-133 continúan activos.
- El planificador continúa inactivo.
- Proveedores, modelos, rutas y perfiles continúan sin ejecución habilitada.
- El adaptador continúa deshabilitado; no hubo invocación de puerta de enlace ni transporte.
- No existe política de autorización emitida ni intento de consumo.
- ARCA continúa pendiente, no exportado, no publicado y sin autorización de uso productivo.
- Los torneos continúan sin acciones de escritura.
- La interfaz no incorpora formularios, mutaciones ni controles de aprobación, activación, ejecución, exportación o publicación.

## Validación

- Pruebas enfocadas de aplicación, operador y arquitectura: PASS, 208 pruebas / 25 suites.
- Prueba específica de normalización al español e invariantes: PASS, 9 pruebas.
- Conjunto completo `pnpm test`: PASS, 1411 pruebas / 166 suites. La primera ejecución dentro del sandbox fue impedida por el socket IPC de `tsx`; la repetición local autorizada fuera de esa restricción pasó sin fallas.
- `pnpm run build:production`: PASS.
- `pnpm run typecheck`: PASS.
- ESLint acotado a los archivos TypeScript modificados: PASS.
- Prettier acotado a los archivos modificados: PASS.
- `git diff --check`: PASS.

## Supuestos y limitaciones

- “Interfaz completa” se interpreta como todo texto primario renderizado por las rutas del operador, la envolvente compartida y las respuestas visibles relacionadas. Los nombres propios y los identificadores técnicos no se traducen.
- Las pruebas renderizan todas las rutas con el modelo de lectura actual del repositorio y separan los detalles técnicos antes de buscar terminología inglesa no deseada.
- No se realizó una validación visual con navegador; la evidencia de presentación es HTML renderizado, pruebas de interfaz y verificaciones estáticas.
- No se modificaron contratos, esquemas, artefactos gobernados, datos fuente, permisos, prioridades, autoridad, configuración de ejecución ni lógica de dominio.

## No acciones explícitas

No se leyeron archivos `.env*`, credenciales ni datos productivos. No hubo llamadas a proveedores, inferencia, adquisición, exportación, publicación, migración, escritura externa, activación, despliegue, push ni creación de una solicitud de cambios remota.

SPANISH_UX_REVIEW_PASS

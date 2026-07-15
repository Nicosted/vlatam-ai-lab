# AI LAB Operator Console architecture

## Purpose and operator

The console gives an internal AI LAB operator a clear, audit-safe view of the governed repository state. It is diagnostic only. A blocked result is a valid governance outcome, not an application failure.

## Read-only rendering architecture

The existing Node HTTP server performs server-side rendering. For each `GET /operator...` request, a narrow handler invokes `loadRepositoryOperatorReadModel()` with a server-owned repository root and the repository evaluation timestamp. The presentation module imports only the Operator Read Model type and renders its already-normalized values.

This reuses the repository's existing HTTP and server-rendered HTML conventions. Rejected alternatives were a separate SPA or frontend framework (new application and dependency surface), a static snapshot (staler than per-request loading), and a JSON API (unnecessary public serialization surface for this phase).

The console never reads or interprets provider registries, readiness dossiers, evidence packs, proposals, runtime configuration, authorization records, or adapters. Only the repository loader owns that work. Domain, gateway, and adapter modules do not import console code.

## Spanish operator language and translation boundary

The console is a Spanish-language operator experience. All operator-facing
navigation, headings, labels, explanations, empty states, diagnostics, and
status descriptions render in Spanish. This is a presentation decision only:
canonical IDs, hashes, contract names, provider names, model names, reason
codes, and artifact identities render exactly as the Operator Read Model
provides them, and serialized contracts are never translated.

Translation lives in one place: `src/operator/operator-presentation.ts`, a
centralized dictionary and formatter layer covering statuses, blocker
categories, severities, resolution classes, owner roles, execution stages,
read-model field labels, and known reason-code summaries. Rendering functions
never hard-code scattered translations. The formatter depends only on
read-model values and recalculates no governance decision.

Unknown machine values fail honest: they remain visible in canonical form,
are explicitly marked "valor técnico sin traducción", and are never
interpreted optimistically.

## Information hierarchy and progressive disclosure

Each page leads with the operator question it answers — current state, why it
is blocked, what prevents execution, what must happen next, who is
responsible, and which technical evidence supports the state. Long hashes,
IDs, and repository paths are excluded from the primary visual hierarchy:
abbreviated hashes (12 hex characters plus an ellipsis) render by default and
the full canonical value is always available through a `<details>` disclosure
containing a selectable, monospace, horizontally scrolling code block. No
clipboard JavaScript is used.

## Routes

- `/operator` — Resumen: governed status, execution not allowed, evaluated
  provider/candidate, blocker/action/review counts, top-five blockers by
  stable severity, next steps from the existing required actions, next
  governed milestone, and the deterministic snapshot identity
- `/operator/providers` — Proveedores: summary card first, then grouped
  technical state (Evidencia y preparación, Configuración de sandbox,
  Seguridad, Ejecución) and a "Ver detalle gobernado" link
- `/operator/providers/openrouter` — governed OpenRouter detail in eight
  sections: Estado actual, Identidad del candidato, Evidencia y preparación,
  Seguridad y privacidad, Configuración de ejecución, Presupuesto sandbox,
  Artefactos y hashes, Próximas acciones
- `/operator/governance` — Gobernanza: presentation-only grouping of the
  existing blockers into named governance topics
- `/operator/blockers` — Bloqueos: readable operator records with read-only
  Spanish filters, visible result counts, and unchanged deterministic order
- `/operator/actions` — Acciones requeridas: an ordered informational plan
- `/operator/execution` — Ejecución: the governed chain
  `Registro → Resolución → Autorización → Política exacta → Consumo atómico → Gateway → Adaptador`
  with honest absent/blocked/disabled/not-attempted distinctions
- `/operator/audit` — Auditoría: evaluation identity, governed artifacts with
  friendly names, evidence and documentation paths, technical metadata

## Governance layout correction

The first console rendered governance as a six-column auto-fit card grid; in
narrow columns long canonical blocker codes wrapped character by character and
became unreadable. The corrected layout uses a maximum of two columns on wide
desktop (`.grid2`, collapsing to one column below 920px). Canonical blocker
codes render inside `<details>` disclosures as `white-space: pre` code blocks
with `overflow-x: auto`, so they never wrap character by character and never
overflow the viewport. Each governance group shows a Spanish title, status
badge, plain-language description, why it matters, execution impact,
responsible resolution class, blocker count, and source evaluator. Grouping is
presentation-only classification of existing blocker codes; group descriptions
never claim a review is complete unless the read model says so.

Every console route is GET-only, uses `Cache-Control: no-store`, accepts no governance-changing query parameters or request paths, and performs no writes. Invalid repository state fails closed with a safe HTTP 500 diagnostic; governed `blocked` state renders with HTTP 200.

## Status and audit-safe rendering

Status labels are explicit and never conveyed by color alone. IDs, versions, hashes, counts, timestamps, and repository-relative evidence paths may render. Prompts, raw documents, model responses, tokens, keys, environment values, sensitive payloads, provider error bodies, and stack traces may not render. Full source documents and raw configuration JSON are intentionally absent.

## Accessibility and responsive behavior

The pages use semantic landmarks and headings, a Spanish skip link ("Saltar al
contenido principal"), keyboard-visible focus, labelled navigation and
filters, explicit text status (never color alone), accessible contrast,
responsive grids capped at a sensible content width, horizontally contained
code blocks, an `aria-live` result count on the blocker filters, and a
single-column mobile execution chain. There is no animation, no decorative
imagery, and no chart.

## Deliberate control boundary

The console has no execution, approval, assignment, workflow, kill-switch, secret, configuration, upload, persistence, or provider controls. It cannot issue or consume authorization, invoke the gateway or harness, or call an adapter. This separation prevents a diagnostic surface from becoming policy or execution authority.

Authentication is intentionally deferred because this is a local/internal read-only phase. The console must not be publicly deployed until a separately reviewed authentication and deployment design exists.

## Explicit preservation of read-only scope

The Spanish UX iteration changed presentation only. The console still contains
no forms, no POST/PUT/PATCH/DELETE routes, no approval/assignment/execution/
enablement/secret/kill-switch controls, no prompt input, no uploads, and no
gateway, adapter, harness, authorization, or consumption invocation. The
Operator Read Model remains the sole presentation source of truth: the UI
translates, groups, summarizes, and progressively discloses its fields, and
never recalculates governance decisions.

## Next phase

The dependency remains:

`Operator Read Model → Spanish Operator Console UX → Human Review Contracts → Human Review Workflow UI → Controlled Sandbox Activation`

Human review must be a separate, named-reviewer workflow with its own contracts and approvals; the console will not infer or persist decisions.

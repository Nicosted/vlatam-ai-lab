# AI LAB Operator Console architecture

## Purpose and operator

The console gives an internal AI LAB operator a clear, audit-safe view of the
governed repository state. AI-134 is an observation and human-review shell
only. It is diagnostic and does not calculate final execution readiness. A
blocked result is a valid governance outcome, not an application failure.

## Read-only rendering architecture

The existing Node HTTP server performs server-side rendering. For each `GET /operator...` request, a narrow handler invokes `loadRepositoryOperatorReadModel()` with a server-owned repository root and the repository evaluation timestamp. The presentation module imports only the Operator Read Model type and renders its already-normalized values.

This reuses the repository's existing HTTP and server-rendered HTML conventions. Rejected alternatives were a separate SPA or frontend framework (new application and dependency surface), a static snapshot (staler than per-request loading), and a JSON API (unnecessary public serialization surface for this phase).

The console never reads or interprets provider registries, readiness dossiers,
evidence packs, proposals, runtime configuration, authorization records, or
adapters. Only the repository loader owns the read-only projection. That
projection reports configuration/review evidence, known blockers, and pending
operational verification; it does not invoke or duplicate execution preflight.
Execution-readiness evaluation belongs to a future operational PR. Domain,
gateway, and adapter modules do not import console code.

## Spanish operator language and translation boundary

The console is a Spanish-language operator experience. All operator-facing
navigation, headings, labels, explanations, empty states, diagnostics, and
status descriptions render in Spanish. This is a presentation decision only:
canonical IDs, hashes, contract names, provider names, model names, reason
codes, and artifact identities render exactly as the Operator Read Model
provides them, and serialized contracts are never translated.

General translation lives in `src/operator/operator-presentation.ts`, a
centralized dictionary and formatter layer covering statuses, blocker
categories, severities, resolution classes, owner roles, execution stages,
read-model field labels, and known reason-code summaries. Rendering functions
never hard-code scattered translations. The formatter depends only on
read-model values and recalculates no governance decision.

The dedicated ARCA vocabulary and bounded human-text projection live beside
it in the pure `arca-review-console-view-model.ts` builder. That builder
consumes only Operator Read Model `1.10.0`; it preserves canonical outcomes and
hashes and performs no AI-127 evaluation or AI-128 validation/building.

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
- `/operator/providers` — Proveedores: summary card first, then separate
  provider visibility, evidence availability, evaluation, operational
  verification, execution, and authority states plus a "Ver detalle
  gobernado" link
- `/operator/providers/openrouter` — governed OpenRouter detail in eight
  sections: Estado actual, Identidad del candidato, Evidencia y preparación,
  Seguridad y privacidad, Configuración de ejecución, Presupuesto sandbox,
  Artefactos y hashes, Próximas acciones
- `/operator/governance` — Gobernanza: presentation-only grouping of the
  existing blockers into named governance topics
- `/operator/blockers` — Bloqueos: readable operator records with read-only
  Spanish filters, visible result counts, and unchanged deterministic order
- `/operator/actions` — Acciones requeridas: an ordered informational plan
- `/operator/review` — Revisión humana: the sandbox activation human-review
  state from the read model — review outcome and lifecycle, the exact bounded
  scope (`one_synthetic_gold_case_sandbox_activation`), candidate identity,
  pending human decisions, evidence-reviewer / activation-approver /
  kill-switch-owner / incident-owner states, allowed first-run data, request /
  token / timeout / retry / fallback / spend ceilings, synthetic gold-case
  readiness and acceptance state, bound artifact versions with abbreviated
  hashes, expiry, and the deterministic next governed action. Informational
  only: no approval buttons, forms, uploads, or mutation endpoints
- `/operator/arca-review` — Revisión ARCA: candidate provenance and fixed
  states, human-review lifecycle and controlled findings, exact AI-127
  evaluation/bindings/non-authorities, Approved Artifact presence, and Spanish
  governance explanations. Repository-current state is explicitly labelled
  `repository-current`, `synthetic fixture`, `real human decision absent`, and
  `Approved Artifact absent`. This route is GET-only and has no review,
  builder, export, publication, or activation controls
- `/operator/arca-library` — Biblioteca normativa ARCA: exactly three
  human-approved, published-read-only regulations with client-side search by
  number, title, and topic; official sources, dates, annex counts,
  relationships, reviewer/date, and exact artifact/decision hashes under
  technical disclosure. It is GET-only and exposes no approval, publication,
  rejection, scheduler, model, provider, or database control
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

AI-130 adds no route, form, button, POST handler, or request-derived store
path. Because repository-current state has no reviewed durable-store root
configuration, `/operator/arca-review` remains unchanged and honestly shows
only repository-backed AI-129 state. A later Operator integration must be a
separately reviewed read-only projection over an explicitly configured root;
it must never invoke a store write command from HTTP.

AI-131 likewise adds no Operator mutation. There is no Run now button,
authorization form, POST endpoint, kill-switch control, or request-derived
root. Repository-current live-run status is the checked-in active kill switch
plus explicit absence of authorization/run/acquisition/candidate in the
AI-131 template; any future read-only projection requires separate review.

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

Provider/model visibility and static configuration never imply operational
authority or execution eligibility. Repository-current OpenRouter is
`available_for_evaluation`, with operational verification pending, execution
blocked, and authority not granted. Preview and Production remain fail closed.

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

The Human Review Contracts stage is now delivered (see
`docs/architecture/ai-openrouter-sandbox-activation-review.md`): the console
renders the activation-review and gold-case state read-only from the Operator
Read Model 1.1.0 through `/operator/review`. Decisions are still recorded only
in governed repository artifacts through reviewed PRs; the console never
infers, collects, or persists a decision. Controlled sandbox activation
remains a separately reviewed future PR.

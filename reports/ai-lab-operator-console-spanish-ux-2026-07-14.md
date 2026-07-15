# AI LAB Operator Console — Spanish operator UX evidence report (2026-07-14)

Status: presentation-only redesign of the read-only Operator Console.
Branch: `feat/ai-lab-operator-console-spanish-ux`.
No governance outcome, blocker severity, blocker ordering, required-action
status, evaluator, contract, or runtime behavior changed.

## 1. Observed usability problems in the first console

- The console rendered technical English only; the operating team works in
  Spanish and had to translate governed states mentally.
- The Overview was a flat metric grid with no narrative: it did not answer
  "why is it blocked", "what prevents execution", or "what happens next".
- Governance used a six-column auto-fit card grid; long canonical blocker
  codes (for example
  `readiness_dossier:unresolved_mandatory_risk:privacy-retention-training-unknown`)
  wrapped character by character inside narrow columns and became unreadable.
- Blockers rendered as a dense six-column table dominated by raw codes.
- Long hashes and artifact IDs sat in the primary visual hierarchy on the
  provider detail and audit pages, hiding the operational signal.
- The audit page led with a raw file-path list instead of recognizable
  artifact names.
- No distinction was drawn between absent, blocked, disabled, and
  not-attempted execution stages.

## 2. Selected UX changes

- Spanish-language navigation, headings, labels, explanations, badges, and
  diagnostics across all routes: Resumen, Proveedores, Gobernanza, Bloqueos,
  Acciones requeridas, Ejecución, Auditoría.
- Overview leads with the governed status, execution not allowed, evaluated
  provider/candidate, blocker/action/pending-review counts, the prominent
  explanation "Bloqueado es un estado gobernado y seguro, no una falla de la
  aplicación.", a "Situación actual" panel, the five highest-priority
  blockers (stable severity ordering over the deterministic read-model
  order), "Próximos pasos" generated only from existing required-action
  records in their deterministic order, and the next governed milestone from
  the dependency map.
- Providers page: summary card first (provider, candidate, status, execution
  allowed, Spanish explanation, blocker count), then grouped technical state
  (Evidencia y preparación, Configuración de sandbox, Seguridad, Ejecución)
  and the link "Ver detalle gobernado".
- OpenRouter detail reorganized into eight sections: Estado actual (with a
  Spanish explanation of why execution is unavailable), Identidad del
  candidato, Evidencia y preparación, Seguridad y privacidad, Configuración
  de ejecución, Presupuesto sandbox, Artefactos y hashes, Próximas acciones.
- Governance corrected to a maximum two-column card layout (one column below
  920 px) with per-group description, why it matters, execution impact,
  responsible resolution, blocker count, source evaluator, and expandable
  canonical codes.
- Blockers rendered as ordered operator records (Spanish summary, severity,
  category, scope, execution impact, resolution class, responsible role,
  source evaluator, expandable canonical code and artifact identity/hash)
  with Spanish read-only filters and a visible `aria-live` result count.
- Execution chain preserved
  (`Registro → Resolución → Autorización → Política exacta → Consumo atómico → Gateway → Adaptador`)
  with per-stage Spanish status, one-sentence explanation, canonical stage
  name, and an explicit legend distinguishing Ausente / Bloqueado /
  Deshabilitado / No intentado.
- Audit page separated into Identidad de la evaluación, Artefactos
  gobernados (friendly names: Dossier de preparación, Paquete de evidencia
  externa, Propuesta de sandbox, Configuración de runtime, Registro del
  modelo, Registro de ruta, Perfil de ejecución), Evidencia y documentación,
  and Metadatos técnicos.

## 3. Spanish-language strategy and translation boundary

- One centralized presentation dictionary/formatter,
  `src/operator/operator-presentation.ts`, owns statuses, severities,
  blocker categories, resolution classes, owner roles, evaluators, execution
  stages, read-model field labels, known reason-code summaries, hash
  abbreviation, stable top-blocker selection, and presentation-only
  governance grouping. No translations are scattered through rendering code.
- Canonical IDs, hashes, contract names, provider names, model names, reason
  codes, and artifact identities render exactly as provided; serialized
  contract values are never translated.
- Unknown machine values remain visible in canonical monospace form and are
  explicitly marked "valor técnico sin traducción"; they are never
  interpreted optimistically.
- The formatter depends only on Operator Read Model types and recalculates
  no governance decision; the read model remains the sole presentation
  source of truth.

## 4. Routes and updated information architecture

Unchanged route set, GET-only, `Cache-Control: no-store`:

- `/operator` — Resumen
- `/operator/providers` — Proveedores
- `/operator/providers/openrouter` — detalle gobernado
- `/operator/governance` — Gobernanza
- `/operator/blockers` — Bloqueos
- `/operator/actions` — Acciones requeridas
- `/operator/execution` — Ejecución
- `/operator/audit` — Auditoría

## 5. Governance layout correction

The six-column grid was replaced by a two-column (max) responsive card
layout. Canonical blocker codes moved into `<details>` disclosures rendered
as `white-space: pre` code blocks with `overflow-x: auto`, so codes never
wrap character by character and never overflow the viewport. Verified in the
browser: computed style of `.code-block` is `white-space: pre`,
`overflow-x: auto`; `document.body.scrollWidth === window.innerWidth` at
375 px with every disclosure open.

## 6. Audit-safe progressive disclosure

Hashes render abbreviated (12 hex characters plus ellipsis) in the primary
hierarchy; full IDs, hashes, and repository paths remain available in
accessible `<details>` disclosures containing selectable monospace code
blocks. No clipboard JavaScript was added. No raw governed source documents,
prompts, model outputs, secrets, or environment values render.

## 7. Accessibility validation

- Semantic landmarks (`header`, `nav` with `aria-label`, `main`), heading
  hierarchy, and Spanish skip link ("Saltar al contenido principal")
  verified by tests and manually (first Tab focuses the skip link with a
  visible outline).
- Status meaning is conveyed by Spanish text badges, never by color alone.
- Blocker filters are labelled `<select>` elements; the result count is an
  `aria-live="polite"` region ("Mostrando N de 23 bloqueos").
- Code disclosures use focusable `<summary>` elements with visible focus.

## 8. Responsive inspection

Manually inspected in the embedded browser:

- Desktop (1600×910): two-column governance and audit grids, 7-stage
  execution chain, no layout defects.
- Tablet (768×1024): single-column execution chain with vertical arrows;
  grids collapse to one column; canonical stage names intact.
- Narrow mobile (375×812): no horizontal body overflow with all
  disclosures open; definition lists collapse to one column; code blocks
  scroll internally.
- Client-side filter exercised in the browser: selecting Severidad = Media
  showed 5 of 23 records with correct live count; clearing restored 23 of
  23; record order unchanged.

## 9. Safety scans

- No `<form>`, `<button>`, `<input>`, `<textarea>` anywhere in console
  output (asserted by tests across all routes).
- GET-only handler unchanged; POST/PUT/PATCH/DELETE return 405; unknown
  paths return 404.
- No actionable controls labelled Ejecutar / Habilitar / Aprobar /
  Reintentar / Desactivar kill switch / Configurar secreto.
- `grep` scans over `src/operator/operator-console.ts` and
  `src/operator/operator-presentation.ts`: no `process.env`, no `fetch(`,
  no `node:net`/`node:http(s)` imports, no clipboard API, no secret
  patterns.
- Import-boundary test: console and presentation modules import only the
  read-model contract; domain/gateway/adapter modules do not import console
  modules.
- Worktree contains only the intended files (console, presentation, tests,
  two architecture docs, this report). No migrations, persistence,
  deployment configuration, or generated files.

## 10. Exact validation commands and totals

- `npx tsx --test tests/operator/*.test.ts` — 32 tests / 3 suites, all pass
  (console 17, presentation 7, read model 8).
- `npm test` — 955 tests / 141 suites, all pass (0 fail, 0 skipped).
- `npm run typecheck` — clean.
- `npm run build` — clean.
- `npx eslint src/operator tests/operator` — 0 problems.
- `npx prettier --check src/operator tests/operator docs/architecture/ai-lab-operator-console.md docs/architecture/ai-roadmap-dependency-map.md` — clean after formatting.
- `git diff --check` — clean.
- Local smoke test (`npx tsx src/cli/api-server.ts --port 3979`): all eight
  console routes returned HTTP 200; `POST /operator` returned 405.

Repository-wide baseline (recorded only; untouched by this branch and
identical on `main`): `npm run lint` reports 43 pre-existing errors in
`scripts/` and `src/crawlers/`; `npm run format` reports 195 files with
pre-existing style issues. Zero of either are in `src/operator` or
`tests/operator`.

## 11. Known limitations

- Spanish reason-code summaries cover the current repository reason codes
  plus prefix families (`missing_or_malformed_artifact:*`,
  `runtime_binding_mismatch:*`, `registry:*`); genuinely new codes render
  canonically with the untranslated marker until the dictionary is extended.
- The governance grouping is a presentation-only keyword classification of
  existing blocker codes; a future canonical grouping field in the read
  model would be stronger.
- The next governed milestone is a presentation constant sourced from the
  dependency map, not a read-model field.
- Localization is single-locale (Spanish); no locale negotiation exists.
- Authentication remains deferred; the console must not be deployed
  publicly.

## 12. Explicit non-actions

No provider call, no inference, no secret or environment access, no
authorization issuance or consumption, no gateway/adapter/harness
invocation, no kill-switch change, no budget change, no enablement of any
provider/model/route/profile/adapter, no migration or persistence, no
deployment configuration, no production or external-service modification,
and no merge were performed. The repository OpenRouter candidate remains
`blocked` with execution disabled; the read-model hash and blocker set are
unchanged by this branch.

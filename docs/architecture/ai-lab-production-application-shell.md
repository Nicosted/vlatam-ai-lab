# AI LAB production application shell — AI-134

## Scope and source snapshot

AI-134 adds the first persistent visual shell for the repository-local AI LAB
application. The implementation starts from local commit
`8593a03a737e91b8a9e7e2516f91988a4778f589`, whose subject is
`AI-133: add governed ARCA scheduler locking and recovery (#128)`.

The execution-isolation follow-up is based on reviewed commit
`b8305f706a2bff8b17185fd2212c849eb048bad5`. The shell is server-rendered by
the existing Node HTTP application. It does not
add a browser framework, authentication service, database, provider adapter, or
runtime dependency. All rendering remains read-only.

## Product design principles

1. **Operational truth before decoration.** Blocked, unavailable, pending, and
   absent are distinct visible states.
2. **Provenance is persistent.** Every page carries the read-model evaluation
   timestamp and full hash inside the context-bar "Procedencia de los datos"
   disclosure — always present, one interaction away, never leading the page.
3. **Compact, not cryptic.** Dense panels use readable spacing, semantic
   headings, keyboard focus, and text labels in addition to color.
   Copy is Spanish and operational; canonical machine values stay available
   behind progressive disclosure instead of leading the page.
4. **One application frame.** Navigation, environment, identity context,
   breadcrumbs, system state, and non-authority language persist across routes.
5. **Fail closed.** Missing identity, invalid repository state, unavailable
   evidence, and missing operational state never become optimistic UI states.
6. **UI role is presentation context only.** It cannot issue or consume an
   AI-131, AI-132, AI-133, provider, export, deployment, or publication
   authorization.

## Visual tokens

| Token       | Value     | Meaning                                 |
| ----------- | --------- | --------------------------------------- |
| `--bg`      | `#080b10` | Graphite application background         |
| `--panel`   | `#0f141c` | Primary elevated surface                |
| `--panel-2` | `#141a23` | Interactive/elevated secondary surface  |
| `--line`    | `#26303d` | High-value boundaries                   |
| `--text`    | `#eef4fb` | Primary accessible text                 |
| `--muted`   | `#8d9bad` | Secondary text                          |
| `--cyan`    | `#21c7e8` | Navigation, focus, provenance accent    |
| `--blue`    | `#478cff` | Secondary technical accent              |
| `--green`   | `#38c884` | Approved or verified only               |
| `--amber`   | `#e4aa45` | Pending review or incomplete evidence   |
| `--red`     | `#f05d68` | Blocked, recovery, or kill-switch state |

The UI uses no gradients. Motion is limited to navigation transitions and is
suppressed by `prefers-reduced-motion`. At 820px and below, the sidebar becomes
an off-canvas mobile navigation. At 540px and below, metrics and metadata stack
into a single readable column.

## Information architecture: six sections and a section tab row

AI-137 replaces the nineteen-item grouped sidebar with six primary sections.
The sidebar lists only sections (`APPLICATION_SECTIONS`); every concrete route
(`APPLICATION_ROUTES`) belongs to exactly one section and is reached from the
workspace tab row rendered by the shell. Both lists are role-filtered with the
same `roleCanView` rules that authorize the request, so a hidden tab is also a
403 route. All previous URLs remain valid; none was removed.

| Section                 | Section path           | Roles shown               | Tabs (route order)                                                                                                                                                                                   |
| ----------------------- | ---------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inicio                  | `/` and `/operator`    | all                       | Panel `/operator`, Estado del sistema `/operator/estado`, Bloqueos `/operator/blockers`, Acciones requeridas `/operator/actions`                                                                     |
| Centro de misiones      | `/operator/misiones`   | operator, reviewer, admin | Áreas operativas `/operator/misiones`, ARCA `/operator/operations/arca`, Adquisiciones `…/acquisitions`, Exportaciones `…/exports`, Recuperación `…/recovery`                                        |
| Revisiones              | `/operator/revisiones` | operator, reviewer, admin | Pendientes `/operator/revisiones`, Revisión humana `/operator/review`, Revisión ARCA `/operator/arca-review`, Artefactos aprobados `/operator/approved-artifacts`, Gobernanza `/operator/governance` |
| Evidencia               | `/operator/evidence`   | all                       | Referencias `/operator/evidence`, Auditoría `/operator/audit`, Ejecución `/operator/execution`, Regulaciones, Fuentes, Noticias (`/operator/knowledge/*`)                                            |
| Modelos e integraciones | `/operator/modelos`    | all                       | Resumen `/operator/modelos`, Proveedores `/operator/providers`, Registro `/operator/models/registry`, Torneos `/operator/models/tournaments`, Entornos `/operator/runtimes/ai-lab`                   |
| Configuración           | `/operator/settings`   | admin                     | General `/operator/settings`                                                                                                                                                                         |

`/operator/providers/openrouter`, `/operator/runtimes/vercel-eve`, and
`/operator/runtimes/cloudflare` belong to Modelos e integraciones with
`in_tabs: false`; they are reached from the Entornos page (progressive
disclosure of runtime detail).

`/operator/governance` and `/operator/arca-review` were previously unregistered
and therefore unfiltered. They are now registered under Revisiones and require
`operator`, `reviewer`, or `admin`. This tightens visibility; it grants nothing.

## Mission center home

`/operator` renders the mission center instead of the former technical
overview, which moved unchanged to `/operator/estado`. The board is a pure
presentation projection of the existing read model built by
`src/operator/mission-center.ts`:

| Column            | Contents                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| En curso          | Required human actions with `pending`/`not_started`, plus the review queue and artifact cards      |
| Necesita atención | Required human actions with `blocked`, plus one aggregated active-blocker card                     |
| Listo             | Required human actions with `complete`, plus review/artifact cards once they are empty or approved |

Card order is deterministic: required human actions in read-model order, then
the blocker, review, and artifact cards. Selection is a client-side toggle
between pre-rendered panels; the first `Necesita atención` item is selected
server-side so the contextual panel is meaningful without JavaScript.

An empty column states, in Spanish, what would appear there
(`MISSION_COLUMN_EMPTY_TITLES` plus `MISSION_COLUMN_HINTS`); a populated column
shows only its cards. The contextual panel always renders: when no card is
selected — including when a search filters the selected card away — it shows a
persistent placeholder with the same read-only boundary wording.

Governed boundary facts (overall status, model execution permission,
AI-131/132/133 kill switches, scheduler, production activity) render as a state
strip above the board, never as board cards: a blocked boundary is a safe
governed state, not a task waiting for an owner. The projection recomputes no
governance decision, derives no new status, and adds no action control — every
card links to the existing governed view.

## Existing review route integration

`/operator/review` continues to call the existing sandbox activation review
renderer. `/operator/arca-review` continues to call
`buildArcaReviewConsoleViewModel` and the existing ARCA review renderer. AI-134
does not copy, re-evaluate, weaken, or bypass either decision path. It changes
only the common application frame and adds navigation to those views.

## Read models and provenance rules

- Existing provider, review, artifact, tournament, and evidence views use the
  current `OperatorReadModel`.
- AI-131, AI-132, and AI-133 status uses the explicitly named
  `REPOSITORY_CURRENT_BLOCKED_STATUS` projection. Its sources are the four
  repository configuration files listed in that projection.
- Recovery and cost remain `unavailable` where no current source exists.
- “Recent evidence” means ordered available read-model references. It is not a
  production activity stream.
- Approved Artifact presence is distinct from export, publication, production
  reliance, and `vlatam-global` consumption.
- Rendering performs no filesystem writes and makes no network request.

## Immutable Operator Read Model deployment snapshot

AI-136 defines the checked-in Operator Read Model inputs as one immutable
deployment snapshot. The canonical contract is
`OPERATOR_READ_MODEL_ARTIFACTS` in
`src/operator/operator-read-model-assets.ts`; runtime loading, packaging tests,
and the Vercel configuration must remain exactly aligned with that manifest.
The 21 repository-relative JSON inputs are:

1. `config/ai-openrouter-model-registry.json`
2. `config/ai-openrouter-route-registry.json`
3. `config/ai-openrouter-adapter.json`
4. `config/ai-execution-profiles.json`
5. `config/ai-openrouter-readiness-dossier.json`
6. `config/ai-openrouter-external-evidence-pack.json`
7. `config/ai-openrouter-sandbox-enablement-proposal.json`
8. `config/ai-openrouter-sandbox-configuration-approval.json`
9. `config/ai-openrouter-sandbox-runtime.json`
10. `config/ai-openrouter-sandbox-activation-review.json`
11. `config/ai-openrouter-sandbox-gold-case.json`
12. `data/fixtures/providers/openrouter-normative-claim-synthetic-v1.json`
13. `config/ai-pricing.json`
14. `config/ai-zdr-evidence.json`
15. `config/ai-tournament-runtime-native.json`
16. `config/ai-tournament-runtime-eve.json`
17. `config/ai-tournament-runtime-cloudflare.json`
18. `config/ai-runtime-evidence-eve.json`
19. `config/ai-runtime-evidence-cloudflare.json`
20. `config/ai-122-glm-fireworks-conformance-result.json`
21. `data/fixtures/arca/ai-127-pending-review.json`

The Vercel Node Function includes these exact files through its legacy builder
configuration. The production entrypoint resolves their root from the known
packaged `api/index.*` module location. It does not depend on `process.cwd()`,
walk parent directories, discover a repository, inspect `.git`, or accept an
environment-controlled asset path. Tests and local tools may still supply an
explicit `repository_root`.

The snapshot is repository-current observation evidence fixed at deployment
time. It is not live production operational state and cannot imply current
provider, scheduler, ARCA, database, deployment, or execution readiness. A
future durable production read source requires a separate governed schema,
integrity/freshness contract, implementation, and review.

## Production dependency boundary

The deployable composition has this read-only path:

`api/index.ts` → `application-server.ts` →
`operator-console-handler.ts` → `repository-operator-read-model.ts` →
`openrouter-supervised-pilot-projection.ts`.

The projection contains closed status types, checked-in evidence metadata,
pure hash/evaluation helpers, and fail-closed status projections. It cannot
accept a credential resolver, perform a provider request, authorize execution,
or activate a runtime. Provider transport, the environment-secret provider,
and adapter construction remain in the separately composed execution module
`openrouter-glm-supervised-pilot.ts`. The local classifier server also remains
separate from `api/index.ts`; classifier export and API-key handling are not
part of the deployable UI composition.

The transitive architecture test is rooted at the real `api/index.ts`. It
recursively follows runtime static imports, export-from edges, dynamic imports,
CommonJS `require` calls, and indirect re-exports. Erased TypeScript type-only
edges are not runtime dependencies. The test requires the read-only projection
edge and rejects provider adapters/transports, secret or credential loaders,
AI-131/132/133 execution, scheduler/recovery mutation, ARCA transport,
external database clients, deployment/DNS mutation, and `vlatam-global`
runtime code.

## Role model and protected boundary

| Role       | UI visibility                                          |
| ---------- | ------------------------------------------------------ |
| `viewer`   | Inicio, Evidencia, Modelos e integraciones             |
| `operator` | Viewer sections plus Centro de misiones and Revisiones |
| `reviewer` | Operator-visible read-only review context              |
| `admin`    | All sections, including read-only Configuración        |

An unauthenticated identity receives 401. A recognized identity without route
visibility receives 403. Runtime identity selection is explicit:

| Runtime mode        | Deployment environment | Identity behavior                                      |
| ------------------- | ---------------------- | ------------------------------------------------------ |
| `development_local` | `development`          | Local adapter only with explicit flag and loopback I/O |
| `preview`           | `preview`              | Verified Cloudflare Access or anonymous/fail closed    |
| `production`        | `production`           | Verified Cloudflare Access or anonymous/fail closed    |
| `test`              | `development`          | Explicitly injected test resolver only                 |

The local adapter requires `AI_LAB_LOCAL_AUTH_ENABLED=true`, a loopback
`AI_LAB_PUBLIC_ORIGIN`, a loopback request `Host`, and a loopback socket remote
address. Only then may `x-ai-lab-local-role` select a development role.
Supplying a test resolver outside `test` mode fails the entrypoint closed.

That adapter is not a production identity provider. The production Vercel
entrypoint uses the separately governed Cloudflare Access adapter described
below. No role in this UI can authorize a scheduler, acquisition, export,
provider call, deployment, publication, database write, or integration.

## AI-135 verified Cloudflare Access identity

The Preview and Production identity flow is:

`Cloudflare Access` → signed `Cf-Access-Jwt-Assertion` → AI LAB cryptographic
verification → explicit email-to-role mapping → existing route authorization →
observation/review shell only.

The adapter reads only `cf-access-jwt-assertion`. It does not trust
`Cf-Access-Authenticated-User-Email`, forwarded email/user headers, role
headers, JWT role claims, or a decoded-but-unverified payload. It verifies the
compact JWT signature with `jose`, permits only `RS256`, requires the exact
configured issuer and audience, requires expiration, enforces expiration and
`not-before`, and requires a valid email claim. Any missing, duplicated,
array-valued, empty, malformed, expired, future, unknown, unallowlisted, or
unverifiable identity resolves to `ANONYMOUS_IDENTITY`.

The validated issuer must be an absolute HTTPS origin with no credentials,
path beyond `/`, query, or fragment. AI LAB derives the only JWKS URL as:

```text
<issuer>/cdn-cgi/access/certs
```

No arbitrary JWKS URL environment variable exists. The remote JWK set is
module-cached and uses the library's bounded remote-fetch timeout and cache
behavior. Verification failures, JWKS failures, and unexpected resolver errors
are not returned to the browser and never cause an elevated fallback.

Preview and Production require all four variables:

| Variable                            | Contract                                          |
| ----------------------------------- | ------------------------------------------------- |
| `AI_LAB_IDENTITY_PROVIDER`          | Exact value `cloudflare_access`                   |
| `AI_LAB_CLOUDFLARE_ACCESS_ISSUER`   | Absolute HTTPS origin                             |
| `AI_LAB_CLOUDFLARE_ACCESS_AUDIENCE` | Non-empty Access application AUD tag              |
| `AI_LAB_IDENTITY_ROLE_BINDINGS`     | Strict JSON mapping of the four existing UI roles |

The strict role-binding shape is:

```json
{
  "admin": ["user@example.com"],
  "reviewer": [],
  "operator": [],
  "viewer": []
}
```

Only `admin`, `reviewer`, `operator`, and `viewer` are accepted. Every value
must be an array of valid email strings. Emails are trimmed and normalized to
lowercase. Unknown keys, missing role keys, non-array values, invalid emails,
and duplicate normalized emails within or across roles reject the entire
environment. An explicit empty allowlist is valid configuration but can
authenticate nobody. Unknown verified users never default to `viewer`.

This role is UI presentation context only. The identity module cannot import
provider adapters, credential resolvers, scheduler code, ARCA execution code,
database clients, or `vlatam-global` runtime code. Existing route
`allowed_roles` remain unchanged, and an `admin` can view only those existing
read-only routes. No identity can invoke OpenRouter, activate the scheduler,
acquire or publish ARCA data, bypass review, mutate a database, activate an
Approved Artifact, deploy, or access `vlatam-global`.

## Security and availability

- HTML and JSON are `no-store`.
- Every HTML status and route is sent by the shared secure HTML response
  helper, including 200, 401, 403, 404, and 500 surfaces.
- CSP denies external connections with `connect-src 'none'`, blocks framing,
  forms, objects, and base-URI replacement, and uses a per-response nonce.
- The regulatory workspace's required inline style receives that CSP nonce.
- Styles and scripts are same-origin static assets.
- Frames, object embedding, referrers, camera, microphone, geolocation,
  payments, and USB are denied.
- HSTS is emitted only when both the deployment environment is `production`
  and the configured public origin is HTTPS.
- `/healthz` reports liveness only and exposes no scheduler, dependency,
  authority, or readiness state.
- `/health` remains as the compatibility health endpoint.

## Mobile interaction and status semantics

At widths up to 820px, the navigation is a modal-style drawer. A closed drawer
is `inert` and `aria-hidden`; an open drawer traps Tab focus, locks document
scroll, and closes through Escape, the close button, backdrop selection, or a
route selection. Closing restores focus to the opener. The compact context bar
keeps environment, blocked system state, identity/role, and the AI-131/132/133
kill-switch boundary visible at 390×844.

Blocked governed state is styled as a calm status indicator, never as an
application error: the context indicator, the sidebar authority note, and the
`.notice` panel use muted surfaces with a single small signal dot. Their
wording is unchanged — "Sistema bloqueado", "Sin autoridad operativa",
"Interfaz de lectura", "UI ≠ autoridad", and "Ejecución de modelos: No
permitida" all remain visible.

Status color is assigned only through the typed `statusToneFor` map:

- `verified`: only reviewed `approved` and `verified` states;
- `pending`: review, authorization, or evidence pending;
- `blocked`: blocked, active kill-switch, invalid, critical, or rejected;
- `neutral`: availability/health/configuration facts with no approval meaning;
- `informational`: read-only or selected context.

Unknown values default to neutral. Generic states such as healthy, enabled,
available, complete, and true never receive the verified/green tone.

## Assumptions and limitations

- Cloudflare Access verification is implemented, but Team domain, AUD tag,
  allowlist values, Access policy, and Vercel variables remain human-managed
  platform configuration.
- Counts shown on existing views come only from the existing read model.
- No cost source, recovery read model, news source, production activity stream,
  or deployment authority is available.
- Vercel and DNS files are preparation artifacts only and were not executed.
- The application is not authorized for public production traffic until the
  identity gate and deployment checklist receive separate human review.

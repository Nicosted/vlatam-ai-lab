# AI LAB production application shell — AI-134

## Scope and source snapshot

AI-134 adds the first persistent visual shell for the repository-local AI LAB
application. The implementation starts from local commit
`8593a03a737e91b8a9e7e2516f91988a4778f589`, whose subject is
`AI-133: add governed ARCA scheduler locking and recovery (#128)`.

The shell is server-rendered by the existing Node HTTP application. It does not
add a browser framework, authentication service, database, provider adapter, or
runtime dependency. All rendering remains read-only.

## Product design principles

1. **Operational truth before decoration.** Blocked, unavailable, pending, and
   absent are distinct visible states.
2. **Provenance is persistent.** Every page carries the read-model evaluation
   timestamp and abbreviated hash.
3. **Compact, not cryptic.** Dense panels use readable spacing, semantic
   headings, keyboard focus, and text labels in addition to color.
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

## Information architecture and route map

| Group      | Label              | Route                               | Roles shown               |
| ---------- | ------------------ | ----------------------------------- | ------------------------- |
| —          | Overview           | `/` and `/operator`                 | all                       |
| Operations | ARCA               | `/operator/operations/arca`         | operator, reviewer, admin |
| Operations | Acquisitions       | `/operator/operations/acquisitions` | operator, reviewer, admin |
| Operations | Exports            | `/operator/operations/exports`      | operator, reviewer, admin |
| Operations | Recovery           | `/operator/operations/recovery`     | operator, reviewer, admin |
| Reviews    | Human Review       | `/operator/review`                  | operator, reviewer, admin |
| Reviews    | Approved Artifacts | `/operator/approved-artifacts`      | operator, reviewer, admin |
| Models     | Providers          | `/operator/providers`               | all                       |
| Models     | Registry           | `/operator/models/registry`         | all                       |
| Models     | Tournaments        | `/operator/models/tournaments`      | all                       |
| Runtimes   | AI LAB             | `/operator/runtimes/ai-lab`         | all                       |
| Runtimes   | OpenRouter         | `/operator/providers/openrouter`    | all                       |
| Runtimes   | Vercel Eve         | `/operator/runtimes/vercel-eve`     | all                       |
| Runtimes   | Cloudflare         | `/operator/runtimes/cloudflare`     | all                       |
| Knowledge  | Regulations        | `/operator/knowledge/regulations`   | all                       |
| Knowledge  | Sources            | `/operator/knowledge/sources`       | all                       |
| Knowledge  | News               | `/operator/knowledge/news`          | all                       |
| —          | Evidence           | `/operator/evidence`                | all                       |
| —          | Settings           | `/operator/settings`                | admin                     |

The legacy `/operator/arca-review`, `/operator/governance`,
`/operator/blockers`, `/operator/actions`, `/operator/execution`, and
`/operator/audit` routes remain available. They use the same persistent shell.

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

## Role model and protected boundary

| Role       | UI visibility                                   |
| ---------- | ----------------------------------------------- |
| `viewer`   | Overview, models, runtimes, knowledge, evidence |
| `operator` | Viewer routes plus operations and reviews       |
| `reviewer` | Operator-visible read-only review context       |
| `admin`    | All routes, including read-only Settings        |

An unauthenticated identity receives 401. A recognized identity without route
visibility receives 403. Local development uses a small adapter and the
`x-ai-lab-local-role` header for test/development context.

That adapter is not a production identity provider. The production Vercel
entrypoint deliberately resolves to anonymous and therefore fails closed until
a separately reviewed trusted identity resolver replaces it. No role in this
UI can authorize a scheduler, acquisition, export, provider call, deployment,
publication, database write, or integration.

## Security and availability

- HTML and JSON are `no-store`.
- CSP denies external connections with `connect-src 'none'`.
- Styles and scripts are same-origin static assets.
- Frames, object embedding, referrers, camera, microphone, geolocation,
  payments, and USB are denied.
- Production responses add HSTS.
- `/healthz` reports liveness only and exposes no scheduler, dependency,
  authority, or readiness state.
- `/health` remains as the compatibility health endpoint.

## Assumptions and limitations

- No production identity provider is configured in this repository.
- Counts shown on existing views come only from the existing read model.
- No cost source, recovery read model, news source, production activity stream,
  or deployment authority is available.
- Vercel and DNS files are preparation artifacts only and were not executed.
- The application is not authorized for public production traffic until the
  identity gate and deployment checklist receive separate human review.

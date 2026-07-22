# AI-129 ARCA Operator Review Console evidence

Date: 2026-07-22
Status: implemented on a feature branch; draft human review required

## Baseline and preconditions

- Repository: `Nicosted/vlatam-ai-lab`.
- Starting branch: clean local `main` with a clean index and worktree.
- `git fetch origin` succeeded and local `main` exactly matched
  `origin/main` at `5f878f44c841c0b51359228acd9dac86f056778e`.
- PR #123, **AI-128: add Approved ARCA Artifact Builder**, was merged at that
  exact commit on 2026-07-22.
- Baseline contains the AI-126 candidate contracts, AI-127 human-review and
  evaluation contracts, AI-128 Approved Artifact/result contracts, and
  Operator Read Model `1.6.0`.
- No nested `AGENTS.md` applies. Graphify had no `graphify-out/graph.json`
  baseline, so targeted repository inspection was used without fabricating
  graph output.

## Route and view-model design

The implemented flow is:

`repository-governed Operator Read Model 1.7.0 → pure ARCA console view model → GET-only /operator/arca-review → human operator understanding`

`buildArcaReviewConsoleViewModel()` is a pure presentation projection. It
preserves canonical lifecycle/outcome/reason/binding values and full hashes,
creates Spanish labels, shortens hashes for primary display, and bounds human
statements to 2,000 characters and finding descriptions to 1,000 characters.
It does not validate or reevaluate AI-127 inputs and does not import or invoke
AI-128 builder execution.

The existing `/operator/review` sandbox activation experience is preserved.
The ARCA route has a stable Spanish page title and navigation entry.

## Authoritative data dependencies

Operator Read Model `1.7.0` was a necessary contract bump because `1.6.0` did
not expose acquisition/parser metadata, human statements and controlled
findings, evaluation hashes/reason codes/bindings, or the complete explicit
non-authority set required by the console.

The repository loader still reads a closed artifact allowlist. For ARCA it
uses only `data/fixtures/arca/ai-127-pending-review.json` and the authoritative
`evaluateGovernedArcaCandidateReview()` result. It adds no artifact discovery,
repository scan, current-time lookup, or builder invocation. The Approved
Artifact projection remains absent in repository-current state.

## Spanish status dictionary

| Canonical value                           | Operator label                                           |
| ----------------------------------------- | -------------------------------------------------------- |
| `pending` / `pending_human_review`        | Pendiente de revisión humana                             |
| `invalid_review`                          | Revisión inválida                                        |
| `candidate_binding_mismatch`              | Vinculación del candidato no coincide                    |
| `eligible_for_approved_artifact_building` | Elegible únicamente para construir el artefacto aprobado |
| Approved Artifact present                 | Artefacto aprobado local                                 |
| `not_exported`                            | No exportado                                             |
| `not_published`                           | No publicado                                             |
| production reliance `not_authorized`      | Uso en producción no autorizado                          |

Unknown canonical values remain visible instead of receiving an optimistic
interpretation.

## Read-only guarantees

The route and view model contain no approval/rejection action, editable form,
POST/mutation fetch, database or filesystem write, builder invocation, export
or publication action, production activation, scheduler control, credential
input, or apparent placeholder control. The existing handler accepts only
GET for every Operator Console route and its CSP keeps `form-action 'none'`.

No console/view-model import reaches a network transport, provider/model
adapter, secret resolver, scheduler, database client, deployment module,
export/publisher module, `vlatam-global`, or AI-128 builder execution function.

## Accessibility findings

- Semantic `header`, labelled `nav`, `main`, ordered headings, metadata
  definition lists, and scoped table headers are present.
- Full hashes use native keyboard-accessible `<details>/<summary>` controls.
- Statuses include explicit text and canonical values; color is not the only
  signal.
- Tables have horizontal containment, grids collapse responsively, and the
  existing skip link and visible keyboard focus remain available.
- The ARCA route exposes no focusable pseudo-control that suggests a mutation.

## XSS and rendering validation

All human reviewer identities, statements, rejection reasons, finding codes,
descriptions, categories, severities, and resolution statuses pass through
HTML escaping at render time. Focused tests inject `<script>` and `<img
onerror>` payloads and verify they render only as escaped text. Human text is
also bounded in the pure view model. No arbitrary HTML or executable content
is rendered, and raw JSON is not the primary UX.

## Repository-current state

The rendered source labels are explicit:

- `repository-current`;
- `synthetic fixture`;
- `real human decision absent`;
- `Approved Artifact absent`.

The actual repository state remains a synthetic candidate with pending review,
no reviewer, no decision, no real approval, no builder eligibility, no
Approved Artifact, no export, no publication, no production reliance, and no
`vlatam-global` consumption authority. Synthetic approved, rejected, expired,
superseded, invalid, binding-mismatch, eligible, and artifact-present states
exist only inside tests.

## Validation record

- Focused AI-129 console/view-model, existing Operator Console/read-model,
  AI-127/128 projection, schema, and architecture-boundary regressions:
  **75 passed, 0 failed** across **43 top-level tests** and **4 suites**.
- Full repository suite: **1,177 passed, 0 failed** across **229 top-level
  tests** and **153 suites**.
- TypeScript typecheck: passed.
- TypeScript build: passed.
- Scoped ESLint for changed TypeScript source and tests: passed.
- Scoped Prettier for changed source, tests, schema, and documentation: passed.
- `git diff --check`: passed before evidence finalization and must be rerun at
  handoff.
- The full suite initially hit a sandbox-only `tsx` IPC `EPERM`; the identical
  command passed when allowed to create its temporary local IPC socket. No
  network or external service was used by validation.

## Pre-existing lint and format debt

The immediately preceding AI-128 evidence recorded 42 repository-wide ESLint
errors in legacy validation/crawler files and 194 repository-wide Prettier
findings. AI-129 did not repair unrelated lint or formatting debt and used only
scoped checks as acceptance gates. The required roadmap file was formatted
only because it was changed in scope.

## Known limitations and assumptions

- The console is local/internal and unauthenticated; deployment remains out of
  scope and unauthorized.
- Identity strings are governed metadata, not cryptographic identity proof.
- No durable review or artifact store exists. The console receives one closed
  repository-backed projection and performs no discovery.
- Approved Artifact present-state coverage is synthetic and test-only because
  repository-current state correctly contains no Approved Artifact.
- Spanish labels explain state but do not make legal, customs, production, or
  publication determinations.

## Explicit non-authorization

AI-129 is presentation and operator understanding only. It does not authorize
or perform acquisition, review mutation, approval, artifact building, export,
publication, database persistence, network/provider/LLM calls, scheduling,
deployment, production reliance, or `vlatam-global` access. No credentials,
`.env*`, shell history, customer data, production data, or production service
were accessed. No real reviewer, approval, evaluation, builder, or Approved
Artifact was created.

## Exact next step

**AI-130 Durable Review and Artifact Store.** It requires a separate reviewed
design and must not inherit mutation, export, publication, production, or
`vlatam-global` authority from this console.

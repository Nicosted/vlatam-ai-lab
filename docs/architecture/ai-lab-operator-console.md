# AI LAB Operator Console architecture

## Purpose and operator

The console gives an internal AI LAB operator a clear, audit-safe view of the governed repository state. It is diagnostic only. A blocked result is a valid governance outcome, not an application failure.

## Read-only rendering architecture

The existing Node HTTP server performs server-side rendering. For each `GET /operator...` request, a narrow handler invokes `loadRepositoryOperatorReadModel()` with a server-owned repository root and the repository evaluation timestamp. The presentation module imports only the Operator Read Model type and renders its already-normalized values.

This reuses the repository's existing HTTP and server-rendered HTML conventions. Rejected alternatives were a separate SPA or frontend framework (new application and dependency surface), a static snapshot (staler than per-request loading), and a JSON API (unnecessary public serialization surface for this phase).

The console never reads or interprets provider registries, readiness dossiers, evidence packs, proposals, runtime configuration, authorization records, or adapters. Only the repository loader owns that work. Domain, gateway, and adapter modules do not import console code.

## Routes

- `/operator` — overview
- `/operator/providers` — provider list
- `/operator/providers/openrouter` — governed OpenRouter detail
- `/operator/governance` — grouped governance state
- `/operator/blockers` — deterministic blockers with client-only filters
- `/operator/actions` — informational required actions
- `/operator/execution` — metadata-only execution boundary
- `/operator/audit` — approved audit metadata

Every console route is GET-only, uses `Cache-Control: no-store`, accepts no governance-changing query parameters or request paths, and performs no writes. Invalid repository state fails closed with a safe HTTP 500 diagnostic; governed `blocked` state renders with HTTP 200.

## Status and audit-safe rendering

Status labels are explicit and never conveyed by color alone. IDs, versions, hashes, counts, timestamps, and repository-relative evidence paths may render. Prompts, raw documents, model responses, tokens, keys, environment values, sensitive payloads, provider error bodies, and stack traces may not render. Full source documents and raw configuration JSON are intentionally absent.

## Accessibility and responsive behavior

The pages use semantic landmarks and headings, a skip link, keyboard-visible focus, labelled navigation and filters, explicit text status, accessible contrast, responsive grids, horizontally contained tables, and a single-column mobile execution chain. There is no animation.

## Deliberate control boundary

The console has no execution, approval, assignment, workflow, kill-switch, secret, configuration, upload, persistence, or provider controls. It cannot issue or consume authorization, invoke the gateway or harness, or call an adapter. This separation prevents a diagnostic surface from becoming policy or execution authority.

Authentication is intentionally deferred because this is a local/internal read-only phase. The console must not be publicly deployed until a separately reviewed authentication and deployment design exists.

## Next phase

The dependency remains:

`Operator Read Model → Operator Console read-only → Human Review Workflow → Controlled Sandbox Activation`

Human review must be a separate, named-reviewer workflow with its own contracts and approvals; the console will not infer or persist decisions.

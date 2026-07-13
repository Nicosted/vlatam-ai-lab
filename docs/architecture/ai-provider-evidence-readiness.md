# AI-83 governed provider candidate readiness

## Current controlled decision

Exactly one route was selected for revalidation on 2026-07-13: MiniMax Direct
provider `minimax-direct`, model `MiniMax-M2.7`, fixed international
OpenAI-compatible base endpoint `https://api.minimax.io/v1`. This route has the
strongest exact evidence already represented locally because the direct endpoint,
model identity, route ownership, and USD pricing are publisher-scoped and do not
depend on an aggregator's variable routing.

The deterministic result is `BLOCKED_EVIDENCE_INCOMPLETE`. The candidate remains
`candidate`, `enabled: false`, runtime-blocked, absent from
`config/ai-execution-profiles.json`, and absent from adapter registration. No
adapter, execution profile, provider call, or live benchmark was added.

OpenRouter `minimax/minimax-m2.7` was not evaluated in this work. Its existing
variable-route evidence remains fail-closed; no endpoint is pinned and it remains
disabled and blocked.

AI-81 established disabled candidate placeholders and the fail-closed distinction between declarations, reviewed evidence, and runtime eligibility. AI-81.1 is the corrective contract evolution captured in AI-82: schema version `2.0.0` closes provenance, scope, routing, conflict, review-date, and stable-hash gaps that could not be added honestly without replacing the incomplete `1.0.0` record shape.

Every evidence claim now binds an exact provider and model scope, upstream-provider scope where applicable, official publisher/title/canonical URL, retrieval and effective dates, category, applicability and route mode, review state, re-review date, finding, limitations, conflicts, and a canonical SHA-256 hash. `unknown`, `rejected`, conflicting, stale, unreviewed, incorrectly scoped, or hash-invalid evidence fails closed.

## Candidate results

| Candidate      | Exact identity                                                                  | Accepted evidence                                                                      | Blocking evidence                                                                                                                                                                          | AI-82 result         |
| -------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| OpenRouter     | router `openrouter`; model `minimax/minimax-m2.7`; upstream model owner MiniMax | exact model slug, endpoints, context, response-format support, tools, normalized usage | default route is variable; endpoint pricing conflicts; exact upstream retention/training/ZDR/region evidence is missing; normative extraction is unevaluated                               | disabled and blocked |
| MiniMax Direct | provider `minimax-direct`; model `MiniMax-M2.7`                                 | direct endpoints, context, tools, usage/cache accounting, direct pay-as-you-go pricing | strict schema-constrained output, exact rate/concurrency limits, bounded retention, no-training, ZDR, processing region, compliance certification, and normative extraction remain unknown | disabled and blocked |

OpenRouter evidence is never reused as proof of MiniMax Direct behavior. MiniMax Direct evidence is never treated as proof for a particular OpenRouter endpoint. Provider-wide evidence cannot be silently narrowed to a model, and an OpenRouter model slug does not pin an upstream serving endpoint.

## Deterministic lifecycle

1. JSON Schema validates structural provenance and review metadata.
2. Evidence hashes are recomputed over canonical JSON excluding `evidence_hash`.
3. Profile references, exact identities, categories, source scope, conflicts, expiry, and review state are evaluated.
4. Privacy categories and normative-extraction capabilities must be explicitly accepted; no branding inference is allowed.
5. OpenRouter additionally requires an exact fixed route and applicable upstream-provider evidence.
6. The result is decision support only. No automatic approval, profile promotion, adapter registration, or provider call exists.

## Remaining adapter entry gate

A disabled adapter may be proposed only after strict structured output and the exact
output limit are proved; exact rate/concurrency limits are accepted; retention,
training use, processing region, and ZDR are explicitly evidenced without
inference; security/compliance evidence is accepted; and the exact capability is
validated against registered public AI-76 fixtures. The AI-74 integer-minor-unit
catalog also cannot currently encode MiniMax's exact USD 0.375 cache-write price
per million tokens, so pricing resolution must be corrected without weakening
durable budget semantics. Human review remains mandatory after those gaps close.

Live execution additionally requires the existing explicit flag and server-side
secret, current privacy and pricing approval, durable reservation, consumed AI-80
authorization, registered public fixture identity, and hard campaign caps of 10
requests, concurrency 2, and USD 1.00 reserved cost. This decision performed zero
calls and cost USD 0.00; it did not inspect or request a secret.

# AI-82 primary-source provider evidence readiness

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

## AI-83 entry gate

AI-83 may begin controlled adapter and live benchmark work only after a human approves one exact candidate and route; all required evidence is reviewed, unexpired, non-conflicting, and hash-valid; AI-73-compatible retention, training, region, and explicit ZDR evidence is approved for the exact profile/capability/classification scope; AI-74-compatible exact pricing and accounting units are approved; required structured output is proven; and the candidate remains behind a separately reviewed, disabled-by-default adapter/profile change. AI-82 does not satisfy that gate.

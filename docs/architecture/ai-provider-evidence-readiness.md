# AI-81 provider evidence and candidate readiness

AI-81 separates three states that must never be conflated:

1. A **provider declaration** is a sourced claim. It is not proof.
2. **Reviewed evidence** is explicit, scoped, current, and human-approved.
3. **Runtime eligibility** is a later gateway decision and requires all prior privacy, pricing, routing, authorization, and consumption gates.

`config/ai-provider-evidence.json` contains honest local placeholders for the requested OpenRouter and MiniMax candidates. No provider documentation or contractual evidence was approved for collection in this change, so model identity, capabilities, limits, structured output, tools, multimodal behavior, caching, usage, regions, retention, training use, ZDR, and pricing remain `unknown`.

`config/ai-candidate-profile-readiness.json` consequently marks both definitions `candidate`, `enabled: false`, and `runtime_eligibility: blocked`. They are deliberately separate from `config/ai-execution-profiles.json`; no adapter is registered and no live call is possible.

The deterministic evaluator fails closed for missing or expired evidence, pending review, ambiguous identity, unsupported capability, credential-shaped fields, false ZDR claims, and profile/evidence mismatches. Evidence expiry is evaluated against an injected clock so tests require no network or provider credentials.

## Limitations and human decision

Provider terms, exact model IDs, pricing, regions, retention, training use, and ZDR require separately reviewed primary evidence. Until that review exists, AI-82 and AI-83 cannot safely select exact models or assert privacy and budget compatibility.

# Broker Intelligence Profile P0

## Purpose

Define the Broker Intelligence Profile as a personalization layer for regulatory and trade intelligence in `vlatam-ai-lab`.

The profile helps future outputs become more relevant to broker/despachante practice contexts while preserving auditability and human review.

## Strategic thesis: curated intelligence moat

- `vlatam-ai-lab` should compete on verified, curated, traceable, and personalized intelligence, not generic model access.
- Generalist models can create uncertainty about veracity, source quality, country/jurisdiction fit, operational relevance, and accountability.
- Broker Intelligence Profiles should increase report relevance by specialization, jurisdiction scope, topics of interest, and preferred information style.
- Approved artifacts should preserve evidence, review status, and end-to-end traceability.
- Outputs should help users decide faster with higher confidence while still respecting human review gates.

## Product boundary

- `vlatam-ai-lab` is an independent intelligence product.
- vLatamGlobal is a future API consumer, not the owner of this internal profile model.
- No direct coupling is allowed to vLatamGlobal databases, internal runtime, or private schemas.
- Future integration must occur through reviewed, versioned, schema-valid API artifacts.
- Classifier ownership boundaries must follow `docs/classifier-lab-runtime-boundary-p0.md`.

## Why broker specialization matters

Customs brokers/despachantes often specialize by practical operating context, including:

- merchandise type
- product vertical
- sector
- regulatory domain
- country/jurisdiction
- operating corridor
- client type
- complexity level

This is not universal for every professional profile, but it is common enough to justify a personalization layer for relevance and signal quality.

## Profile dimensions

Conceptual profile fields for future phases:

- `role`
- `country_scope`
- `jurisdiction_scope`
- `nationality_or_operating_country`
- `commodity_specializations`
- `product_verticals`
- `regulatory_specializations`
- `topics_of_interest`
- `preferred_information_style`
- `detail_level`
- `alert_frequency`
- `language`
- `risk_tolerance`
- `human_review_preferences`

## Information style preferences

Supported style patterns for future rendering behavior:

- `executive_summary`: high-level signal, low operational detail.
- `technical_operational`: process details, controls, and operational implications.
- `checklist`: step-by-step validation and action checklist.
- `legal_reference_heavy`: norm and citation focused framing.
- `risk_first`: starts with risk, uncertainty, and impact.
- `action_first`: starts with recommended human-reviewed next steps.

## Relevance model

Regulatory deltas and evidence reports may be framed by:

- affected commodity
- affected country/jurisdiction
- affected regulatory topic
- profile match strength
- risk level
- urgency
- human review requirement

Relevance framing must remain explainable and auditable in artifacts.

## Agent behavior

Future agents should follow these profile-usage rules:

- Use profile context only when explicitly available from approved inputs.
- Do not invent user preferences, specialization, or jurisdiction scope.
- State when a baseline/general profile is used.
- Include profile relevance only when there is supporting context.
- Route uncertain personalization assumptions to human review.

## Future API integration

High-level future API boundary:

- vLatamGlobal may request approved intelligence artifacts.
- vLatamGlobal may send profile context to personalize output framing.
- vLatamGlobal must not receive unreviewed raw deltas by default.
- The API must expose reviewed artifacts, not internal agent state.
- The API must preserve auditability and traceability.
- Reviewed artifact handoff expectations should follow `docs/reviewed-artifact-api-handoff-p0.md`.

## Non-goals

- No runtime implementation.
- No database schema or migration.
- No API endpoint implementation.
- No production integration.
- No automatic broker matching yet.
- No final legal/customs determination.

## Example profile

```json
{
  "role": "customs_broker_despachante",
  "country_scope": ["AR", "MERCOSUR"],
  "jurisdiction_scope": ["Argentina", "MERCOSUR"],
  "nationality_or_operating_country": "Argentina",
  "commodity_specializations": ["textiles", "footwear", "toys"],
  "product_verticals": ["apparel", "retail_imports"],
  "regulatory_specializations": [
    "tariff_classification",
    "import_documentation",
    "origin_and_labeling"
  ],
  "topics_of_interest": [
    "NCM_updates",
    "non_automatic_licenses",
    "customs_valuation"
  ],
  "preferred_information_style": "checklist",
  "detail_level": "operational",
  "alert_frequency": "daily_digest",
  "language": "es-AR",
  "risk_tolerance": "conservative",
  "human_review_preferences": {
    "always_review_medium_or_higher_risk": true,
    "include_uncertainty_notes": true
  }
}
```

## Example personalized output framing

Assume the same regulatory delta: "PCRAM bulletin modifies interpretation notes affecting selected NCM codes in consumer goods imports."

### Textile broker framing

- Focus: apparel and textile-origin documentation impact.
- Highlight: likely effects on textile-related NCM validation and supporting document checks.
- Style: checklist-first with immediate review steps and required evidence references.

### Electronics broker framing

- Focus: whether any affected NCMs overlap electronics portfolios.
- Highlight: lower direct relevance if codes do not map; still include corridor/jurisdiction monitoring note.
- Style: concise risk-first summary with watchlist recommendation.

### General importer framing

- Focus: broad operational impact and triage priority across mixed categories.
- Highlight: moderate-risk change with recommendation to segment impact by commodity clusters.
- Style: executive summary plus short action list for human review.

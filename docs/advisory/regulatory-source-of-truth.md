# Regulatory Source Of Truth Advisory Read Model

AI LAB is the reviewed regulatory source of truth for vLatam Global only when
the PCRAM chain supports that status. It is not a free-form chatbot and must
not produce legal, customs, tariff, sanitary, chemical, pesticide, fertilizer,
organic, phytosanitary, REACH/CLP, labeling, or EU compliance conclusions from
unreviewed material.

## Authority Path

The authority path remains:

```text
Source -> Snapshot -> Delta -> Evidence -> Review -> Export -> API
```

Source registry entries, jurisdiction packs, approved KB snapshots, evidence
records, review manifests, approved artifacts, exports, and API responses are
separate gates. A verified official source identity does not by itself make a
snapshot reviewed, an evidence record approved, or an advisory answer safe for
client use.

vLatam Global remains a read-only consumer through the approved HTTP/API or
export contract boundary. It must not read AI LAB internals, raw snapshots,
raw extraction output, unapproved evidence, credentials, production databases,
or raw agent state.

## Advisory Readiness Layer

`src/advisory/regulatory-advisory-read-model.ts` adds a deterministic
checklist-style read model for advisory readiness. It does not call an LLM,
scrape, fetch network data, connect to Supabase, or create a parallel runtime
architecture.

The read model assembles what is known from local source/evidence records and
classifies source coverage as:

- `reviewed_official`
- `reviewed_internal`
- `sample_only`
- `missing`
- `stale`
- `unverified`
- `requires_human_review`

It fails closed when official reviewed sources are absent, source records are
sample-only or unreviewed, freshness is stale or unknown, jurisdiction coverage
is incomplete, product classification is missing or uncertain, or required
review areas lack reviewed evidence references.

## Argentina To Spain/EU Agrochemical Case

The first fixture is:

`data/fixtures/advisory/regulatory-advisory-readiness-ar-es-eu-ecological-biological-agrochemical.json`

It covers the readiness question:

> Potential client wants to export ecological / biological agrochemical products
> from Argentina to Spain / European Union.

The fixture is draft/pending-review and `downstream_allowed: false`. It is a
checklist workflow, not a final regulatory answer. Current local coverage lacks
reviewed official evidence for Spain/EU import, EU market access, product
classification under plant protection product / fertilizer / biostimulant /
chemical regimes, REACH/CLP screening, organic/ecological/biological claims,
restricted substances, labeling, SDS/composition, certificates, permits, and
human expert signoff.

HS/NCM classification is explicitly missing and must not be guessed from the
product family. Human expert review remains mandatory before any client-facing
recommendation.

## Next PRs

Recommended next steps:

1. Add reviewed official Spain and EU source registry entries and snapshots.
2. Add reviewed official Argentina sectoral authority coverage, including
   SENASA or another applicable authority only when verified.
3. Add source-backed evidence records for each required review area.
4. Add reviewed jurisdiction packs and approved KB snapshots for this advisory
   scope.
5. Extend the approved export/API boundary only after human review confirms
   exactly which advisory artifacts may be exposed downstream.

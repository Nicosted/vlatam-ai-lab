# Argentina Backpack Human Review Checklist

## Purpose

This checklist defines the human review gate for the Argentina curated source
pack demo product: `school backpack made primarily of polyester` /
`mochila escolar de poliester`.

It must be completed before any approved classifier-support artifact is created
for this use case. It does not approve an artifact, final classification,
customs/legal determination, export contract, catalog entry, bundle entry,
runtime integration, Supabase work, Graphify output, provider behavior, or
vlatam-global bridge behavior.

The review is repo-first. Reviewers must verify the committed evidence packet,
extraction draft, pending review manifest, and draft classifier-support artifact
against the source references and product documentation available for this
narrow use case. Graphify may help navigate repository files only; it is not
source truth, approval evidence, or a downstream eligibility gate.

## Review Inputs

The reviewer should inspect these repo-local inputs before making a decision:

- `docs/argentina-curated-source-pack-plan.md`
- `docs/classifier-intelligence-artifact-p1.md`
- `docs/snapshot-review-evidence-packet-p1.md`
- `snapshots/pcram/extractable-evidence-packet-ar-demo-polyester-school-backpack.json`
- `snapshots/pcram/ai-extraction-result-ar-demo-polyester-school-backpack-draft.json`
- `snapshots/pcram/review-manifest-ar-demo-polyester-school-backpack.json`
- `snapshots/pcram/classifier-intelligence-artifact-ar-demo-polyester-school-backpack-draft.json`
- `schemas/review-manifest.schema.json`
- `schemas/snapshot-review-manifest.schema.json`
- related manifest and classifier artifact tests

The reviewer should also inspect any client, broker, invoice, catalog, product
specification, or sample evidence that is proposed as support for PR E. If those
materials are unavailable, the missing facts must remain explicit limitations.

## Product Facts To Verify

A human reviewer must verify and record whether the available evidence supports
each item below.

- Product identity and commercial description: confirm the product is a school
  backpack and that the English/Spanish descriptions, invoice text, catalog
  name, SKU/model, and any broker-provided description describe the same item.
- Exact material percentages: confirm fiber and non-fiber composition by
  percentage, including shell, lining, straps, padding, reinforcements, trim,
  zippers, coatings, films, panels, and other relevant components.
- Polyester construction status: determine whether polyester is present as
  textile fabric, coated textile, plastic sheet or layer, laminate, mixed
  construction, or another construction that may affect classification support.
- Intended use: confirm the article is intended and marketed for school use,
  and identify any travel, sports, luggage, professional, promotional, or
  multipurpose use that could change the support scope.
- Dimensions and capacity: confirm dimensions, volume/capacity, weight, number
  of compartments, and carrying configuration where available.
- Accessories and components: identify pouches, straps, wheels, handles,
  organizers, electronics sleeves, rain covers, charms, lunch components, or
  other included parts, and decide whether they are relevant to the support
  artifact or require separate treatment.
- Country of origin and import context: confirm declared origin, Argentina
  import context, importer/broker context, import regime assumptions, and
  whether the product is a sample, retail good, promotional item, or other
  special context.
- Invoice, catalog, and spec sheet consistency: compare invoice, catalog,
  product page, technical spec sheet, packaging, labels, and broker notes for
  conflicts. Any conflict must be resolved or carried as a limitation.
- Source adequacy for this narrow use case: confirm that the Argentina customs
  and tariff references, MERCOSUR/NCM context, and WCO/HS context are current
  enough, reviewed enough, and bounded enough for classifier-support drafting.
- HS/NCM candidate support: decide whether any HS/NCM candidate is actually
  evidence-backed by reviewed sources and verified product facts. Unsupported
  candidates must remain unknown.
- Final classification boundary: confirm that final classification, tariff
  treatment, customs/legal advice, import clearance outcome, and sectoral
  requirements remain out of scope for this artifact.
- Missing information requests: decide whether more information must be
  requested from the client or broker before the use case can move forward.

## Approval Gates

The reviewer must fail closed. The use case cannot advance to an approved
artifact if any of these gates fail.

- Cannot approve if material composition is unknown, percentage-based support is
  missing, or evidence conflicts remain unresolved.
- Cannot approve if coated textile, plastic sheet/layer, laminate, or mixed
  construction status is unknown and the support analysis depends on that fact.
- Cannot approve if the referenced source snapshots, evidence references, or
  source version assumptions are stale, unreviewed, or inadequate for the
  intended narrow support use case.
- Cannot approve if proposed artifact text implies a final customs/legal
  determination, binding classification, tariff treatment, import clearance
  outcome, legal advice, or production readiness.
- Cannot approve if `downstream_allowed` would exceed the reviewed evidence
  scope, allowed consumer/use case, country scope, product scope, or stated
  limitations.
- Cannot approve if the review manifest would need to mark a draft or
  unsupported extraction as approved without traceable evidence.
- Cannot approve if source identity, locator scope, capture reference, version
  scope, or explicit fingerprint limitation handling are unresolved for the
  sources used by the support artifact.
- Cannot approve if missing client/broker facts are material to the support
  artifact and have not been resolved or explicitly bounded as unknown.

## Allowed Outcomes

The reviewer may choose only one of these outcomes:

- Approve narrow classifier-support artifact: allowed only when all product
  facts, source boundaries, evidence references, limitations, and downstream
  scope are reviewed and the artifact text remains narrow.
- Request more product data: use when material composition, construction,
  dimensions, accessories, origin, invoice/catalog consistency, or intended use
  is incomplete or conflicting.
- Request source update: use when source references are stale, insufficient,
  unreviewed for the intended use, or not tied to a bounded reviewed snapshot.
- Reject as insufficient evidence: use when the evidence cannot support even a
  narrow classifier-support artifact without unsupported inference.
- Keep as demo-only/non-production: use when the material remains useful for
  local demonstration or schema coverage but must not become approved,
  export-eligible, or downstream-safe.

## PR E Readiness Checklist

PR E may start only after each item below is true or explicitly bounded in the
review record:

- Evidence packet reviewed for product scope, source references, warnings,
  limitations, and non-downstream status.
- Extraction draft reviewed for supported claims, unsupported claims,
  confidence limits, and deferred determinations.
- Review manifest updated with the human decision, scope, limitations,
  evidence refs, risk level, and downstream decision.
- Missing product facts resolved or explicitly bounded, including material
  percentages, coating/plastic-layer status, dimensions/capacity, accessories,
  country of origin, invoice/catalog/spec consistency, and intended use.
- Approved artifact text drafted with narrow classifier-support limits and no
  final customs/legal determination.
- Export contract remains blocked until an approved artifact exists and passes
  the relevant schema, export, bundle, typecheck, lint, and test gates.

## Non-Goals

This checklist does not authorize:

- approving the current draft artifact;
- changing any review manifest status to approved;
- adding approved artifacts;
- adding export contracts;
- updating the approved export catalog or bundle;
- marking `downstream_allowed` true;
- adding runtime code;
- adding Supabase, migrations, or environment variables;
- generating Graphify output;
- changing provider behavior;
- changing vlatam-global bridge behavior.

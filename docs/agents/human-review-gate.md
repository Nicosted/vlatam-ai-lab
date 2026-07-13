# Human Review Gate Agent

PCRAM chain step 5/5. The Human Review Gate applies an explicit reviewer
decision to a local classifier intelligence artifact in
`data/intelligence/<source_id>/<artifact_id>.json`.

## Responsibility

This agent is the local review boundary between AI Lab review-only artifacts and
any future downstream classifier consumption. It does not infer approval. It only
records a provided human decision, reviewer, timestamp, and approval metadata,
then validates the result before writing it back to the same artifact file.

Every recorded outcome also receives an internal `review_binding` contract
(`1.0.0`). The binding uses canonicalization `review-json-v1` and two
domain-separated SHA-256 operations to bind the exact pre-review artifact,
artifact schema version, decision, timestamp, and policy
`classifier-human-review@1.0.0`. Reviewer identity remains internal and is not
part of the binding payload or the approved export.

## P1 Invariants

Downstream use is allowed only when all of these are true:

- `review_status` is `reviewed_approved`
- `governance.human_review_required` is `false`
- `governance.downstream_allowed` is `true`
- `governance.review_only` is `false`
- `governance.not_final_classification` is `false`
- `reviewer` is present
- `reviewed_at` is explicitly provided
- `classifier_approval_reference` is present
- `review_binding` is structurally valid and cryptographically matches the
  artifact, decision, timestamp, schema, and current review policy

Synthetic/demo artifacts are never downstream-safe. If `source_authority` or
`origin` is `synthetic_demo`, validation rejects any attempt to set
`downstream_allowed` to `true`.

Rejected artifacts remain restrictive:

- `review_status` is `reviewed_rejected`
- `governance.human_review_required` is `true`
- `governance.downstream_allowed` is `false`
- `governance.review_only` is `true`
- `governance.not_final_classification` is `true`

Rejected outcomes are also bound, but a valid binding never turns a rejected
decision into downstream eligibility. Historical reviewed artifacts without a
binding fail closed with `review_revalidation_required`; a new explicit human
review is required. Bindings are never backfilled automatically.

## Canonical reviewable content

Object keys are sorted lexicographically and array order is preserved. JSON
scalars retain JSON semantics. Unsupported values (`undefined`, functions,
symbols, bigint, cycles, non-finite numbers, dates, maps, sets, and other
non-plain objects) are rejected.

The content hash includes artifact identity, schema version, source identity,
provenance, classification candidate, evidence, timestamps created before
review, and all other business content. It excludes only fields necessarily
created or changed by review: `review_status`, `reviewer`, `reviewed_at`,
`classifier_approval_reference`, `downstream_eligibility_reason`,
`review_binding`, and the four review-controlled `governance` flags. These
exclusions prevent the approval operation from hashing itself; they do not
exclude reviewable business content.

## CLI Usage

```bash
pnpm agents:human-review --source infoleg --artifact artifact--infoleg--extraction-001 --decision approve --reviewer nicolas --reviewed-at 2026-06-16T20:00:00Z --approval-ref approval-ref--001 --eligibility-reason "Verified against official regulation"
```

`--decision` accepts `approve`, `approved`, `reject`, or `rejected`. CLI output
uses repository-relative artifact paths only.

## Programmatic Usage

```typescript
import { applyHumanReview } from '../src/agents/human-review-gate.js';

await applyHumanReview({
  source_id: 'infoleg',
  artifact_id: 'artifact--infoleg--extraction-001',
  decision: 'approved',
  reviewer: 'nicolas',
  reviewed_at: '2026-06-16T20:00:00Z',
  classifier_approval_reference: 'approval-ref--001',
  downstream_eligibility_reason: 'Verified against official regulation',
});
```

## Explicit Non-Responsibilities

The Human Review Gate does not:

- approve automatically
- create implicit timestamps
- call external services
- connect to databases
- scrape runtime sources
- import `vlatam-global` runtime code
- read secrets or environment files
- generate domain or artifact identifiers (the atomic temporary filename is
  process-unique and is not contract data)
- auto-bind historical approvals without a new review
- write an artifact when existing or updated validation fails

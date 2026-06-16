# Human Review Gate Agent

PCRAM chain step 5/5. The Human Review Gate applies an explicit reviewer
decision to a local classifier intelligence artifact in
`data/intelligence/<source_id>/<artifact_id>.json`.

## Responsibility

This agent is the local review boundary between AI Lab review-only artifacts and
any future downstream classifier consumption. It does not infer approval. It only
records a provided human decision, reviewer, timestamp, and approval metadata,
then validates the result before writing it back to the same artifact file.

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

Synthetic/demo artifacts are never downstream-safe. If `source_authority` or
`origin` is `synthetic_demo`, validation rejects any attempt to set
`downstream_allowed` to `true`.

Rejected artifacts remain restrictive:

- `review_status` is `reviewed_rejected`
- `governance.human_review_required` is `true`
- `governance.downstream_allowed` is `false`
- `governance.review_only` is `true`
- `governance.not_final_classification` is `true`

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
- generate random identifiers
- write an artifact when existing or updated validation fails

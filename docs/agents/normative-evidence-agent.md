# Normative Evidence Agent

> **RETIRED (2026-07-13).** `src/agents/normative-evidence-agent.ts` and
> `scripts/run-extraction.ts` (`pnpm ai:extract`) were removed by the
> governed-execution-boundary PR. The `evidence.extraction.normative_claims`
> capability now executes only through the MultiProviderGateway
> (`src/execution/multi-provider-gateway.ts` +
> `src/execution/normative-claims-mapper.ts`). This document is retained as
> historical documentation only.

## Purpose

DeepSeek-powered reasoning layer that extracts normative claims from evidence packets following strict governance rules. It is NOT a source of truth — it only reasons over official documents provided in context.

## Architecture Principles

### Repo-First
- All inputs and outputs are JSON files in `snapshots/pcram/` 
- No external databases (no Supabase, no Postgres)
- No live services beyond DeepSeek API
- All artifacts are version-controlled in Git

### Evidence-Based
- Agent never invents norms, laws, tariffs, or classifications
- Every claim must cite a source from the evidence packet
- If evidence is insufficient, returns `extraction_status: validation_failed` 

### Human Review Required
- Every output has `human_review_required: true` 
- Every output has `downstream_allowed: false` 
- No output can be used downstream without explicit human approval

### Auditable
- Every run produces a traceable JSON artifact
- Artifacts include: packet_id, model_id, timestamp, confidence, warnings
- Failed validations are preserved for debugging

## Usage

### Run extraction
```bash
pnpm ai:extract <path-to-evidence-packet>
```

### Validate evidence packet
```bash
pnpm ai:validate-packet <path-to-packet>
```

### Validate extraction result
```bash
pnpm ai:validate-extraction <path-to-extraction-result>
```

## Input Contract

### File: extractable-evidence-packet
- Schema: `schemas/extractable-evidence-packet.schema.json` 
- Location: `snapshots/pcram/*.json` 
- Required fields:
  - `packet_id`: string
  - `product_description`: string
  - `evidence_refs`: array of evidence references

### Evidence Reference Structure
```json
{
  "source_id": "string",
  "snapshot_id": "string",
  "section_label": "string",
  "article_number": "string",
  "excerpt": "string"
}
```

## Output Contract

### File: ai-extraction-result
- Schema: `schemas/ai-extraction-result.schema.json` 
- Location: `snapshots/pcram/ai-extraction-result-*.json` 
- 18 required fields:
  - `extraction_result_id`, `extraction_job_id`, `evidence_packet_id` 
  - `review_manifest_id`, `snapshot_id`, `source_id` 
  - `provider_id`, `model_id`, `extraction_status` 
  - `extracted_claims`, `unsupported_claims`, `warnings` 
  - `confidence`, `critic_summary` 
  - `human_review_required` (always true)
  - `downstream_allowed` (always false)
  - `created_at`, `contract_version`, `schema_version` 

### Extraction Status Values
- `draft_unreviewed`: Normal draft output
- `critique_flagged`: Agent detected issues
- `validation_failed`: Insufficient evidence or parsing error
- `provider_failed`: DeepSeek API error

## Governance Rules (SYSTEM_PROMPT)

1. Never invent legal, customs, tariff, sanitary, technical, or classification requirements
2. Every normative statement must cite a source from the evidence packet
3. Distinguish international HS, MERCOSUR NCM/AEC, and Argentina domestic evidence
4. If evidence is missing/ambiguous, return `extraction_status: validation_failed` 
5. Do not issue final customs classification or binding rulings
6. ALWAYS set `human_review_required: true` 
7. ALWAYS set `downstream_allowed: false` 
8. Return valid JSON ONLY following the exact schema
9. Prefer exact article, note, heading, subheading references
10. If sources conflict, report in `unsupported_claims` 

## Failure Modes

| Failure | Behavior | Action |
|---------|----------|--------|
| HTTP 402 (Insufficient Balance) | Exit 1, friendly message | Top up at platform.deepseek.com |
| HTTP 429 (Rate Limit) | Exit 1, wait message | Wait 30-60 seconds |
| Schema validation failed | `extraction_status: validation_failed` | Inspect output, adjust prompt |
| JSON parse error | `extraction_status: provider_failed` | Check DeepSeek response |
| Missing evidence | Empty `extracted_claims` | Add evidence to packet |

## Security Constraints

- No PII in prompts (no CUIT, supplier names, prices, bank data)
- Only product technical description goes to DeepSeek
- API key in `.env`, never committed (in `.gitignore`)
- Output files are git-tracked for audit
- Synthetic test data marked with `[SYNTHETIC TEST DATA - NOT OFFICIAL]` 

## File Map

```
vlatam-ai-lab/
├── src/
│   ├── agents/
│   │   └── normative-evidence-agent.ts
│   └── utils/
│       └── schema-validator.ts
├── scripts/
│   ├── run-extraction.ts
│   ├── validate-packet.ts
│   └── validate-extraction.ts
├── schemas/
│   ├── ai-extraction-result.schema.json
│   └── extractable-evidence-packet.schema.json
├── snapshots/
│   └── pcram/
│       ├── extractable-evidence-packet-*.json
│       └── ai-extraction-result-*.json
├── docs/
│   └── agents/
│       └── normative-evidence-agent.md
├── .env (not committed)
├── .env.example
└── package.json
```

## Integration with vlatam-global

```
vlatam-ai-lab (sandbox)
  ↓ generates
ai-extraction-result-*.json (draft)
  ↓ human review
review-manifest-*.json (approved)
  ↓ export
approved-artifact-*.json
  ↓ integrate
vlatam-global (production)
```

Integration paths:
1. **Manual copy (MVP)**: Copy approved JSON files to vlatam-global
2. **Git submodule (next)**: vlatam-global includes vlatam-ai-lab as submodule
3. **API via Cloudflare Workers (production)**: Expose agent as REST API

## Next Steps

1. Create real evidence packets from official sources (ARCA, InfoLEG, MERCOSUR)
2. Implement Source Monitor agent (detect changes in official sources)
3. Implement Snapshot Writer agent (capture versioned snapshots)
4. Implement Delta Analyzer agent (compare versions, generate diffs)
5. Implement Evidence Writer agent (build evidence packets from snapshots)
6. Implement Human Review Gate (UI for approval workflow)
